/**
 * Competitor Insights Service
 * Full View Analytics - Crux Media
 *
 * Outlier detection and Claude-powered video analysis for competitor videos.
 * Results are cached in the competitor_insights Supabase table.
 */

import { supabase } from './supabaseClient';
import { claudeAPI } from './claudeAPI';
import { getBrandContextWithSignals } from './brandContextService';

// ============================================
// OUTLIER DETECTION
// ============================================

/**
 * Get videos that significantly outperform their channel average.
 * An outlier is a video whose view_count >= minMultiplier * channel_avg_views.
 *
 * @param {Object} opts
 * @param {number} opts.days - Look-back window (default 90)
 * @param {number} opts.minMultiplier - Minimum multiple of channel avg (default 2.5)
 * @param {number} opts.limit - Max outliers to return (default 20)
 * @returns {Promise<Array>} Outlier videos with channel info and outlier score
 */
export async function getOutlierVideos({ days = 90, minMultiplier = 2.5, limit = 20, channelIds: scopedChannelIds } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Step 1: Get competitor channels (scoped to provided IDs if given)
  let query = supabase
    .from('channels')
    .select('id, name, thumbnail_url, subscriber_count')
    .eq('is_competitor', true);

  if (scopedChannelIds && scopedChannelIds.length > 0) {
    query = query.in('id', scopedChannelIds);
  }

  const { data: channels, error: chErr } = await query;

  if (chErr) throw chErr;
  if (!channels.length) return [];

  const channelIds = channels.map(c => c.id);
  const channelMap = Object.fromEntries(channels.map(c => [c.id, c]));

  // Step 2: Get all recent videos for these channels
  const { data: videos, error: vErr } = await supabase
    .from('videos')
    .select('id, title, channel_id, view_count, like_count, comment_count, published_at, thumbnail_url, video_type, duration_seconds')
    .in('channel_id', channelIds)
    .gte('published_at', cutoffDate.toISOString())
    .order('view_count', { ascending: false });

  if (vErr) throw vErr;
  if (!videos.length) return [];

  // Step 3: Calculate per-channel averages
  const channelStats = {};
  videos.forEach(v => {
    if (!channelStats[v.channel_id]) {
      channelStats[v.channel_id] = { totalViews: 0, count: 0 };
    }
    channelStats[v.channel_id].totalViews += v.view_count || 0;
    channelStats[v.channel_id].count++;
  });

  const channelAvg = {};
  Object.entries(channelStats).forEach(([chId, stats]) => {
    channelAvg[chId] = stats.count > 0 ? stats.totalViews / stats.count : 0;
  });

  // Step 4: Flag outliers
  const outliers = videos
    .map(v => {
      const avg = channelAvg[v.channel_id] || 1;
      const multiplier = avg > 0 ? (v.view_count || 0) / avg : 0;
      return {
        ...v,
        channel: channelMap[v.channel_id],
        channelAvgViews: Math.round(avg),
        outlierScore: parseFloat(multiplier.toFixed(1)),
      };
    })
    .filter(v => v.outlierScore >= minMultiplier)
    .slice(0, limit);

  return outliers;
}

// ============================================
// AI INSIGHTS (Claude-powered)
// ============================================

const INSIGHT_SYSTEM_PROMPT = `You are a YouTube content strategist analyzing competitor videos. Given a video's data, produce a structured analysis.

Respond with ONLY a JSON object (no markdown, no code fences) with these fields:
{
  "hookAnalysis": "One sentence about the title/thumbnail hook strategy",
  "whyItWorked": "2-3 sentences explaining why this video over-performed its channel average",
  "applicableTactics": ["tactic 1", "tactic 2", "tactic 3"],
  "contentAngle": "The core content angle or format (e.g., 'controversy', 'tutorial', 'reaction')",
  "replicability": "low" | "medium" | "high"
}`;

/**
 * Analyze a single competitor video using Claude.
 * Checks cache first; stores result in competitor_insights table.
 *
 * @param {Object} video - Video object with id, title, view_count, channel info, etc.
 * @returns {Promise<Object>} Parsed insight data
 */
export async function analyzeCompetitorVideo(video, clientChannelId = null) {
  if (!supabase) throw new Error('Supabase not configured');

  // Check cache first
  const { data: cached } = await supabase
    .from('competitor_insights')
    .select('insight_data')
    .eq('video_id', video.id)
    .eq('insight_type', 'full_analysis')
    .maybeSingle();

  if (cached) return cached.insight_data;

  // Fetch brand context for the client (if provided) to evaluate tactics relative to brand
  let systemPrompt = INSIGHT_SYSTEM_PROMPT;
  if (clientChannelId) {
    try {
      const brandBlock = await getBrandContextWithSignals(clientChannelId, 'competitor_insight');
      if (brandBlock) systemPrompt += '\n\n' + brandBlock;
    } catch (e) {
      console.warn('[competitorInsights] Brand context fetch failed, proceeding without:', e.message);
    }
  }

  // Build prompt
  const prompt = `Analyze this competitor YouTube video:

Title: ${video.title}
Channel: ${video.channel?.name || 'Unknown'}
Views: ${(video.view_count || 0).toLocaleString()}
Channel Average Views: ${(video.channelAvgViews || 0).toLocaleString()}
Outlier Score: ${video.outlierScore || 'N/A'}x the channel average
Type: ${video.video_type === 'short' ? 'YouTube Short' : 'Long-form video'}
Published: ${video.published_at || 'Unknown'}
Likes: ${(video.like_count || 0).toLocaleString()}
Comments: ${(video.comment_count || 0).toLocaleString()}`;

  const result = await claudeAPI.call(prompt, systemPrompt, 'competitor_insight', 1024);

  // Parse JSON response (handle markdown code block wrapping)
  let insightData;
  try {
    let text = result.text.trim();
    // Strip markdown code fences if present
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    insightData = JSON.parse(text);
  } catch {
    insightData = {
      hookAnalysis: result.text,
      whyItWorked: 'Could not parse structured response',
      applicableTactics: [],
      contentAngle: 'unknown',
      replicability: 'medium',
    };
  }

  // Cache in Supabase
  await supabase.from('competitor_insights').upsert({
    video_id: video.id,
    channel_id: video.channel_id,
    insight_type: 'full_analysis',
    insight_data: insightData,
    model_used: 'claude-sonnet-4-5',
    tokens_used: (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0),
    cost: result.cost || 0,
  }, { onConflict: 'video_id,insight_type' });

  return insightData;
}

/**
 * Get cached insight for a video (does not call Claude)
 */
export async function getCachedInsight(videoId) {
  if (!supabase) return null;

  const { data } = await supabase
    .from('competitor_insights')
    .select('insight_data, generated_at')
    .eq('video_id', videoId)
    .eq('insight_type', 'full_analysis')
    .maybeSingle();

  return data || null;
}

export default {
  getOutlierVideos,
  analyzeCompetitorVideo,
  getCachedInsight,
};
