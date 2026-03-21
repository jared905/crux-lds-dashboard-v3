/**
 * Audit Competitor Fetch Service
 * Fetches lightweight competitor data for audit benchmarking.
 * Resolves channels, fetches recent videos, and computes per-competitor metrics.
 */

import { supabase } from './supabaseClient';
import { youtubeAPI } from './youtubeAPI';

// Title pattern detection (mirrors competitorDatabase.js)
const TITLE_PATTERNS = [
  { name: 'question', regex: /\?/ },
  { name: 'number', regex: /\d+/ },
  { name: 'caps_emphasis', regex: /\b[A-Z]{3,}\b/ },
  { name: 'brackets', regex: /[\(\[\{]/ },
  { name: 'first_person', regex: /\b(I|My|We|Our)\b/i },
  { name: 'negative', regex: /\b(never|stop|avoid|worst|fail|bad|terrible|don't)\b/i },
  { name: 'power_word', regex: /\b(secret|ultimate|best|perfect|complete|easy|simple|amazing)\b/i },
];

const CONTENT_FORMATS = [
  { name: 'tutorial', regex: /\b(tutorial|how to|guide|learn|teach|step by step|tips|tricks)\b/i },
  { name: 'review', regex: /\b(review|reaction|reacts?|responds?|first time|listening to|watching)\b/i },
  { name: 'vlog', regex: /\b(vlog|behind|day in|life|personal|story|journey|update)\b/i },
  { name: 'comparison', regex: /\b(vs\.?|versus|compare|comparison|battle)\b/i },
  { name: 'listicle', regex: /\b(top \d+|best|worst|\d+ (things|ways|tips|reasons))\b/i },
  { name: 'challenge', regex: /\b(challenge|try|attempt|test|experiment)\b/i },
];

/**
 * Analyze title patterns across a set of videos.
 */
function analyzeTitlePatterns(videos) {
  const counts = {};
  TITLE_PATTERNS.forEach(p => { counts[p.name] = 0; });

  for (const v of videos) {
    if (!v.title) continue;
    TITLE_PATTERNS.forEach(p => {
      if (p.regex.test(v.title)) counts[p.name]++;
    });
  }

  const total = videos.length || 1;
  const result = {};
  for (const [name, count] of Object.entries(counts)) {
    result[name] = { count, pct: Math.round((count / total) * 100) };
  }
  return result;
}

/**
 * Analyze content formats across a set of videos.
 */
function analyzeContentFormats(videos) {
  const counts = {};
  CONTENT_FORMATS.forEach(f => { counts[f.name] = 0; });
  let unclassified = 0;

  for (const v of videos) {
    if (!v.title) { unclassified++; continue; }
    const match = CONTENT_FORMATS.find(f => f.regex.test(v.title));
    if (match) {
      counts[match.name]++;
    } else {
      unclassified++;
    }
  }

  const total = videos.length || 1;
  const result = {};
  for (const [name, count] of Object.entries(counts)) {
    result[name] = { count, pct: Math.round((count / total) * 100) };
  }
  result.unclassified = { count: unclassified, pct: Math.round((unclassified / total) * 100) };
  return result;
}

/**
 * Fetch and analyze competitor channels for an audit.
 *
 * @param {string[]} competitorChannelIds - YouTube channel IDs
 * @returns {{ competitors: Array, aggregateMetrics: Object }}
 */
export async function fetchAuditCompetitors(competitorChannelIds) {
  if (!competitorChannelIds?.length) return null;

  const competitors = [];
  const cutoff90d = new Date();
  cutoff90d.setDate(cutoff90d.getDate() - 90);

  for (const ytChannelId of competitorChannelIds) {
    try {
      // Check if channel exists in DB
      const { data: existingChannel } = await supabase
        .from('channels')
        .select('*')
        .eq('youtube_channel_id', ytChannelId)
        .maybeSingle();

      let channel = existingChannel;

      // If not in DB, fetch from YouTube and upsert
      if (!channel) {
        const details = await youtubeAPI.fetchChannelDetails(ytChannelId);
        const { data: upserted } = await supabase
          .from('channels')
          .upsert({
            youtube_channel_id: ytChannelId,
            name: details.name,
            thumbnail_url: details.thumbnail_url,
            custom_url: details.custom_url,
            subscriber_count: details.subscriber_count,
            total_view_count: details.total_view_count,
            video_count: details.video_count,
            description: details.description,
            created_via: 'audit',
          }, { onConflict: 'youtube_channel_id' })
          .select()
          .single();
        channel = upserted || details;
      }

      // Fetch recent videos from DB
      const { data: dbVideos } = await supabase
        .from('videos')
        .select('title, view_count, like_count, comment_count, duration_seconds, video_type, published_at')
        .eq('channel_id', channel.id)
        .gte('published_at', cutoff90d.toISOString())
        .order('published_at', { ascending: false })
        .limit(50);

      const videos = dbVideos || [];

      // Compute metrics
      const avgViews = videos.length > 0
        ? Math.round(videos.reduce((s, v) => s + (v.view_count || 0), 0) / videos.length)
        : 0;

      const avgEngagement = videos.length > 0
        ? videos.reduce((s, v) => {
            const views = Math.max(v.view_count || 1, 1);
            return s + ((v.like_count || 0) + (v.comment_count || 0)) / views;
          }, 0) / videos.length
        : 0;

      const uploadFrequency = videos.length / (90 / 7);

      const longForm = videos.filter(v => v.video_type === 'long' || (v.duration_seconds && v.duration_seconds > 180));
      const shortForm = videos.filter(v => v.video_type === 'short' || (v.duration_seconds && v.duration_seconds <= 180));

      competitors.push({
        channel: {
          id: channel.id,
          youtube_channel_id: channel.youtube_channel_id,
          name: channel.name,
          thumbnail_url: channel.thumbnail_url,
          subscriber_count: channel.subscriber_count,
          total_view_count: channel.total_view_count,
          video_count: channel.video_count,
        },
        videoCount: videos.length,
        metrics: {
          avgViews,
          avgEngagement: Math.round(avgEngagement * 10000) / 10000,
          uploadFrequency: Math.round(uploadFrequency * 10) / 10,
          contentMix: {
            longForm: longForm.length,
            shortForm: shortForm.length,
            shortsRatio: videos.length > 0 ? Math.round((shortForm.length / videos.length) * 100) : 0,
          },
          titlePatterns: analyzeTitlePatterns(videos),
          contentFormats: analyzeContentFormats(videos),
        },
      });

    } catch (err) {
      console.warn(`[auditCompetitorFetch] Failed to fetch competitor ${ytChannelId}:`, err.message);
      // Continue with remaining competitors
    }
  }

  // Aggregate metrics across all competitors
  const allAvgViews = competitors.map(c => c.metrics.avgViews).filter(Boolean);
  const allEngagement = competitors.map(c => c.metrics.avgEngagement).filter(Boolean);
  const allFrequency = competitors.map(c => c.metrics.uploadFrequency).filter(Boolean);

  const aggregateMetrics = {
    medianAvgViews: median(allAvgViews),
    medianEngagement: median(allEngagement),
    medianUploadFrequency: median(allFrequency),
    totalCompetitors: competitors.length,
  };

  return { competitors, aggregateMetrics };
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
