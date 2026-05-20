/**
 * Demand Signal service — mines a client's own video comments for
 * unserved audience demand.
 *
 * Why this exists: cohort patterns and structural gaps tell us what
 * works in the competitive set. Demand signals tell us what THIS
 * AUDIENCE has been asking THIS CHANNEL for and not getting. That's
 * pure anti-echo — pointing at unserved demand, not amplifying existing
 * supply.
 *
 * Lifecycle:
 *   - Strategist clicks "Refresh demand signals" in SeriesIdeator
 *   - extractAndStore() fetches comments from the client's last N videos
 *   - Claude analyzes for: unserved_requests, recurring_themes, engagement_peaks
 *   - Result stored in client_audience_demand_signals; previous row → 'superseded'
 *   - generateConcepts reads the active row via getActiveDemandSignals
 *
 * Reading is fast (single row by client_id). Refresh is explicit and
 * a few seconds — strategist controls when to pay that cost.
 */

import { supabase } from './supabaseClient';
import youtubeAPI from './youtubeAPI';
import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';

const DEFAULT_VIDEO_COUNT = 6;
const DEFAULT_COMMENTS_PER_VIDEO = 100;

// ──────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────

export async function getActiveDemandSignals(clientId) {
  if (!supabase || !clientId) return null;
  const { data } = await supabase
    .from('client_audience_demand_signals')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();
  return data;
}

// ──────────────────────────────────────────────────
// Extract + store
// ──────────────────────────────────────────────────

/**
 * Fetch the most recent N videos for the client's own channel + pull
 * their comments. Returns an array of { videoId, title, comments }.
 */
async function fetchRecentVideoComments(clientId, { videoCount = DEFAULT_VIDEO_COUNT, commentsPerVideo = DEFAULT_COMMENTS_PER_VIDEO, onProgress } = {}) {
  // Client's own videos — order by published date, descending.
  // We need youtube_video_id (the public YouTube ID) for the API call.
  const { data: videos } = await supabase
    .from('videos')
    .select('youtube_video_id, title, published_at')
    .eq('channel_id', clientId)
    .order('published_at', { ascending: false })
    .limit(videoCount);

  if (!videos?.length) return [];

  const results = [];
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    if (!v.youtube_video_id) continue;
    onProgress?.({ step: 'fetching', videoIndex: i + 1, videoCount: videos.length, title: v.title });
    try {
      const comments = await youtubeAPI.getAllVideoComments(v.youtube_video_id, commentsPerVideo);
      results.push({
        videoId: v.youtube_video_id,
        title: v.title,
        comments: (comments || []).map(c => ({
          text: c.text || c.textDisplay || c.snippet?.topLevelComment?.snippet?.textDisplay || '',
          likes: c.likes || c.likeCount || 0,
          replies: c.replyCount || 0,
        })).filter(c => c.text),
      });
    } catch (e) {
      console.warn('[demandSignal] comment fetch failed for', v.youtube_video_id, e.message);
    }
  }
  return results;
}

/**
 * Run Claude over the collected comments and extract structured demand
 * themes. Returns the parsed signals object or null on failure.
 */
async function extractSignalsFromComments(commentBundles, { clientName } = {}) {
  if (!commentBundles?.length) return null;

  // Format the comment input. Keep per-video grouping so Claude can
  // attribute themes to specific videos.
  const lines = [];
  let totalComments = 0;
  for (const bundle of commentBundles) {
    lines.push(`\n## Video: "${bundle.title}" (id ${bundle.videoId})`);
    for (const c of bundle.comments.slice(0, 60)) {
      // Truncate long comments — torrent of text isn't useful for theme extraction
      const txt = c.text.length > 400 ? c.text.slice(0, 400) + '…' : c.text;
      lines.push(`- ${txt}${c.likes > 5 ? ` [${c.likes} likes]` : ''}`);
      totalComments++;
    }
  }
  const commentBlock = lines.join('\n');

  const prompt = `You are mining audience demand from comments on ${clientName ? `${clientName}'s` : 'a creator'}’s YouTube videos. The strategist is using your output to ideate new series — specifically, to find UNSERVED demand (what the audience asks for and is not getting) rather than amplify what already exists.

Comments below are from the channel's last ${commentBundles.length} videos. Read them and extract:

1. **UNSERVED REQUESTS** — explicit asks for content the channel hasn't covered. "Can you make a video about X?" / "I wish you'd talk about Y." Cluster repeats. Note approximate mention count.

2. **RECURRING THEMES** — questions, struggles, or topics that surface repeatedly across multiple commenters even when not framed as a direct request. The audience is wrestling with something and saying so in comments.

3. **ENGAGEMENT PEAKS** — comments or topics drawing significantly more likes/replies than typical. Signal that the audience is *highly* engaged with that specific point. Surface the quote and what it suggests.

Return JSON with this exact shape:
{
  "unserved_requests": [
    { "topic": "string — 4-10 words naming the request", "mentions": number, "sample_quote": "string — one verbatim or near-verbatim quote from the comments" }
  ],
  "recurring_themes": [
    { "pattern": "string — what's recurring", "count": number, "examples": ["string", ...] }
  ],
  "engagement_peaks": [
    { "quote": "string", "signal_strength": "string — e.g. '47 likes vs typical 3'", "context": "string — what this tells us about the audience" }
  ]
}

CRITICAL:
- 3–6 items per category max. Quality over quantity.
- Only include items with REAL signal — multiple commenters, not single off-handed remarks.
- If a category has nothing strong, return an empty array. Do not pad.
- Quotes must be from the comments below — do not invent.
- This output drives a strategist's series ideation. Be specific. "More family content" is too vague. "Specific tactics for talking to teenagers who are doubting" is the right level.

COMMENTS TO ANALYZE:
${commentBlock}

Return ONLY valid JSON.`;

  const systemPrompt = `You extract audience demand signals from YouTube comments for a strategist. Cluster, count, surface unserved demand. Be specific, not generic. Return ONLY valid JSON.`;

  try {
    const result = await claudeAPI.call(prompt, systemPrompt, 'demand_signal_extraction', 3072);
    const parsed = parseClaudeJSON(result.text, null);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      ...parsed,
      _totalCommentsAnalyzed: totalComments,
    };
  } catch (e) {
    console.error('[demandSignal] extraction failed:', e);
    return null;
  }
}

/**
 * Full refresh: fetch comments, extract demand themes, supersede the
 * previous active row and insert the new one.
 */
export async function extractAndStoreDemandSignals(clientId, { clientName, videoCount = DEFAULT_VIDEO_COUNT, commentsPerVideo = DEFAULT_COMMENTS_PER_VIDEO, onProgress } = {}) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };

  onProgress?.({ step: 'starting' });
  const bundles = await fetchRecentVideoComments(clientId, { videoCount, commentsPerVideo, onProgress });
  if (!bundles.length) {
    return { ok: false, error: 'No client videos found. The client needs to have its own channel with recent videos in our DB.' };
  }

  onProgress?.({ step: 'analyzing' });
  const signals = await extractSignalsFromComments(bundles, { clientName });
  if (!signals) {
    return { ok: false, error: 'Failed to extract demand signals. The Claude call may have failed.' };
  }

  // Supersede previous active row
  await supabase
    .from('client_audience_demand_signals')
    .update({ status: 'superseded' })
    .eq('client_id', clientId)
    .eq('status', 'active');

  const totalComments = bundles.reduce((s, b) => s + b.comments.length, 0);
  const { data: row, error } = await supabase
    .from('client_audience_demand_signals')
    .insert({
      client_id: clientId,
      status: 'active',
      source_video_ids: bundles.map(b => b.videoId),
      video_count: bundles.length,
      comment_count: totalComments,
      signals,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };

  onProgress?.({ step: 'done' });
  return { ok: true, signals: row };
}

// ──────────────────────────────────────────────────
// Prompt formatting
// ──────────────────────────────────────────────────

/**
 * Format an active demand-signal row as a prompt block. Returns ''
 * when no signals exist so callers can concat unconditionally.
 */
export function formatDemandSignalsForPrompt(row, { clientName } = {}) {
  if (!row?.signals) return '';
  const s = row.signals;
  const sections = [];

  if (Array.isArray(s.unserved_requests) && s.unserved_requests.length) {
    const lines = s.unserved_requests.slice(0, 6).map(r =>
      `- ${r.topic}${r.mentions ? ` (${r.mentions} mentions)` : ''}${r.sample_quote ? ` — sample: "${r.sample_quote}"` : ''}`
    );
    sections.push(`UNSERVED REQUESTS — audience explicitly asking for content not made yet:\n${lines.join('\n')}`);
  }

  if (Array.isArray(s.recurring_themes) && s.recurring_themes.length) {
    const lines = s.recurring_themes.slice(0, 6).map(t =>
      `- ${t.pattern}${t.count ? ` (${t.count} commenters)` : ''}`
    );
    sections.push(`RECURRING THEMES — what audience is wrestling with across comments:\n${lines.join('\n')}`);
  }

  if (Array.isArray(s.engagement_peaks) && s.engagement_peaks.length) {
    const lines = s.engagement_peaks.slice(0, 4).map(p =>
      `- "${p.quote}" — ${p.signal_strength || 'high engagement'}${p.context ? `; ${p.context}` : ''}`
    );
    sections.push(`ENGAGEMENT PEAKS — comments drawing outsized response:\n${lines.join('\n')}`);
  }

  if (!sections.length) return '';

  const header = clientName
    ? `AUDIENCE DEMAND SIGNALS (mined from ${row.comment_count || '?'} comments across ${row.video_count || '?'} ${clientName} videos):`
    : `AUDIENCE DEMAND SIGNALS (mined from ${row.comment_count || '?'} comments across ${row.video_count || '?'} recent videos):`;

  return `${header}\n\n${sections.join('\n\n')}\n\n(Use this to ground at least one series concept in UNSERVED audience demand — pure anti-echo. The audience is telling us what they want; don't ignore that signal.)\n\n---\n\n`;
}

export default {
  getActiveDemandSignals,
  extractAndStoreDemandSignals,
  formatDemandSignalsForPrompt,
};
