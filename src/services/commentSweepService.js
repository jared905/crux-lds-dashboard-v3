/**
 * commentSweepService — on-demand competitor-comment sweep for a single
 * client × competitor channel pair.
 *
 * Built 2026-06-11 per the deep-research synthesis on YouTube
 * comments-mining for institutional brand strategy. Path A from the
 * synthesis: lightweight on-demand sweep, NOT a systematic background
 * pipeline (deferred to v1.1+) and NOT an auto-merge persona enrichment
 * (explicitly rejected due to participation-inequality bias).
 *
 * Flow:
 *   1. Strategist picks one competitor channel (default: peer-tagged
 *      cohort channels for the active client).
 *   2. runSweep() creates a sweep row, calls /api/youtube-comment-sweep
 *      to fetch comments across the channel's recent uploads, runs
 *      heuristic classification (regex-based — fast, deterministic,
 *      no LLM cost), and persists signals.
 *   3. Each extracted signal is surfaced as a Strategy Spine input
 *      candidate the strategist reviews. Status workflow:
 *      pending_review → starred | merged_to_spine | dismissed.
 *
 * v1 classification is regex-only. LLM theme clustering is v1.1 if
 * yield warrants — the research synthesis was explicit that we should
 * measure yield in real conditions before adding LLM cost.
 */

import { supabase } from './supabaseClient';
import { resolveCohortChannels } from './cohortRolesService';

export const COMMENT_SWEEP_PROMPT_VERSION = 'v1-regex-only';

// Hard caps mirroring the endpoint defaults — keeps quota deterministic.
export const DEFAULT_MAX_VIDEOS             = 10;
export const DEFAULT_MAX_COMMENTS_PER_VIDEO = 50;

// ──────────────────────────────────────────────────
// Public entry — run a sweep
// ──────────────────────────────────────────────────

/**
 * @param {Object} args
 * @param {string} args.clientId               — Crux client (channels.id, the brand we serve)
 * @param {string} args.competitorChannelId    — channels.id of the competitor (must exist in the channels table; we use its youtube_channel_id for the API call)
 * @param {number} [args.maxVideos]
 * @param {number} [args.maxCommentsPerVideo]
 * @returns {Promise<{ ok, sweepId, summary, error? }>}
 *   summary shape:
 *     { videosSampled, commentsFetched, questions, contentRequests, general }
 */
export async function runSweep({
  clientId,
  competitorChannelId,
  maxVideos = DEFAULT_MAX_VIDEOS,
  maxCommentsPerVideo = DEFAULT_MAX_COMMENTS_PER_VIDEO,
}) {
  if (!clientId)            return { ok: false, error: 'clientId required' };
  if (!competitorChannelId) return { ok: false, error: 'competitorChannelId required' };

  // 1) Resolve competitor channel → youtube_channel_id snapshot
  const competitor = await loadCompetitorChannel(competitorChannelId);
  if (!competitor?.youtube_channel_id) {
    return { ok: false, error: 'Competitor channel has no youtube_channel_id' };
  }

  // 2) Create sweep row in 'fetching' state
  const { data: sweep, error: createErr } = await supabase
    .from('client_comment_sweeps')
    .insert({
      client_id:                clientId,
      competitor_channel_id:    competitorChannelId,
      competitor_youtube_id:    competitor.youtube_channel_id,
      competitor_name:          competitor.name || null,
      status:                   'fetching',
      max_videos:               maxVideos,
      max_comments_per_video:   maxCommentsPerVideo,
    })
    .select('*')
    .single();

  if (createErr || !sweep) {
    return { ok: false, error: createErr?.message || 'could not create sweep row' };
  }

  try {
    // 3) Fetch comments from the YouTube API via our endpoint
    const fetchResult = await callSweepEndpoint({
      channelId: competitor.youtube_channel_id,
      maxVideos,
      maxCommentsPerVideo,
    });
    if (!fetchResult.ok) {
      await markSweepError(sweep.id, fetchResult.error || 'fetch failed');
      return { ok: false, error: fetchResult.error || 'fetch failed', sweepId: sweep.id };
    }

    await supabase
      .from('client_comment_sweeps')
      .update({
        status:            'analyzing',
        status_message:    `Fetched ${fetchResult.commentsFetched} comments from ${fetchResult.videosSampled} videos`,
        videos_sampled:    fetchResult.videosSampled,
        comments_fetched:  fetchResult.commentsFetched,
      })
      .eq('id', sweep.id);

    // 4) Heuristic classification + signal persistence
    const signals = classifyComments(fetchResult.comments || []);
    const signalRows = signals.map(s => ({
      sweep_id:                  sweep.id,
      client_id:                 clientId,
      signal_type:               s.signalType,
      comment_text:              s.text,
      comment_youtube_id:        s.commentId || null,
      author:                    s.author || null,
      like_count:                s.likeCount || 0,
      comment_published_at:      s.publishedAt || null,
      source_video_youtube_id:   s.videoId,
      source_video_title:        s.videoTitle || null,
      source_video_published_at: s.videoPublishedAt || null,
    }));

    // Only persist actionable signals (question + content_request). 'general'
    // comments are 95%+ noise per the research — we count them in the summary
    // but don't burn DB rows on them in v1.
    const actionable = signalRows.filter(r => r.signal_type !== 'general');

    if (actionable.length > 0) {
      const { error: insErr } = await supabase
        .from('client_comment_signals')
        .insert(actionable);
      if (insErr) {
        await markSweepError(sweep.id, `signal insert failed: ${insErr.message}`);
        return { ok: false, error: insErr.message, sweepId: sweep.id };
      }
    }

    const summary = summarize(signals);

    // 5) Mark complete
    await supabase
      .from('client_comment_sweeps')
      .update({
        status:                  'complete',
        status_message:          null,
        signals_extracted:       actionable.length,
        questions_count:         summary.questions,
        content_requests_count:  summary.contentRequests,
        completed_at:            new Date().toISOString(),
      })
      .eq('id', sweep.id);

    return { ok: true, sweepId: sweep.id, summary };
  } catch (err) {
    console.warn('[commentSweep] sweep failed:', err);
    await markSweepError(sweep.id, err?.message || 'unknown error');
    return { ok: false, error: err?.message || 'unknown error', sweepId: sweep.id };
  }
}

// ──────────────────────────────────────────────────
// Public — listing + review actions
// ──────────────────────────────────────────────────

export async function listSweeps(clientId, { limit = 20 } = {}) {
  if (!clientId) return [];
  const { data } = await supabase
    .from('client_comment_sweeps')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function getSweepWithSignals(sweepId) {
  if (!sweepId) return null;
  const [{ data: sweep }, { data: signals }] = await Promise.all([
    supabase.from('client_comment_sweeps').select('*').eq('id', sweepId).maybeSingle(),
    supabase
      .from('client_comment_signals')
      .select('*')
      .eq('sweep_id', sweepId)
      .order('signal_type')
      .order('like_count', { ascending: false }),
  ]);
  return sweep ? { ...sweep, signals: signals || [] } : null;
}

export async function updateSignalStatus(signalId, status, { reason = null, reviewedBy = null } = {}) {
  if (!signalId || !status) return { ok: false, error: 'signalId + status required' };
  if (!['pending_review', 'merged_to_spine', 'dismissed', 'starred'].includes(status)) {
    return { ok: false, error: `invalid status: ${status}` };
  }
  const patch = {
    status,
    reviewed_at:    new Date().toISOString(),
    reviewed_by:    reviewedBy,
    dismiss_reason: status === 'dismissed' ? reason : null,
  };
  const { error } = await supabase
    .from('client_comment_signals')
    .update(patch)
    .eq('id', signalId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Return cohort competitor candidates for the active client, ranked
 * peer first (highest predictive signal), then aspirational, then
 * reference. Each entry: { id, name, youtube_channel_id, cohort_role }.
 */
export async function listCompetitorCandidates(clientId) {
  if (!clientId) return [];
  // Peer first — they're the predictive ground truth and the most likely
  // place audience overlap exists. Aspirational and reference still
  // included because seeing comments on bigger / category-defining
  // channels can surface audience aspiration and content-gap signals.
  const cohort = await resolveCohortChannels(clientId, {
    roles: ['peer', 'aspirational', 'reference'],
    competitorsOnly: true,
  });
  const ids = (cohort || []).map(c => c.id).filter(Boolean);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from('channels')
    .select('id, name, youtube_channel_id')
    .in('id', ids);
  const channelsById = new Map((data || []).map(c => [c.id, c]));

  const roleRank = { peer: 0, aspirational: 1, reference: 2 };
  return cohort
    .map(c => {
      const meta = channelsById.get(c.id);
      if (!meta?.youtube_channel_id) return null;
      return {
        id:                  c.id,
        name:                meta.name || '(unnamed)',
        youtube_channel_id:  meta.youtube_channel_id,
        cohort_role:         c.cohort_role,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (roleRank[a.cohort_role] ?? 9) - (roleRank[b.cohort_role] ?? 9));
}

// ──────────────────────────────────────────────────
// Loaders
// ──────────────────────────────────────────────────

async function loadCompetitorChannel(channelId) {
  const { data } = await supabase
    .from('channels')
    .select('id, name, youtube_channel_id')
    .eq('id', channelId)
    .maybeSingle();
  return data || null;
}

async function markSweepError(sweepId, message) {
  await supabase
    .from('client_comment_sweeps')
    .update({
      status:         'error',
      status_message: message?.slice(0, 500) || 'unknown error',
      completed_at:   new Date().toISOString(),
    })
    .eq('id', sweepId);
}

// ──────────────────────────────────────────────────
// Endpoint client
// ──────────────────────────────────────────────────

async function callSweepEndpoint({ channelId, maxVideos, maxCommentsPerVideo }) {
  try {
    const resp = await fetch('/api/youtube-comment-sweep', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ channelId, maxVideos, maxCommentsPerVideo }),
    });
    const json = await resp.json();
    if (!resp.ok) return { ok: false, error: json?.error || `HTTP ${resp.status}` };
    return json;
  } catch (err) {
    return { ok: false, error: err?.message || 'network error' };
  }
}

// ──────────────────────────────────────────────────
// Heuristic classification (regex-only in v1)
// ──────────────────────────────────────────────────

/**
 * Classify each comment by signal type:
 *   - 'content_request' — explicit "make a video about X" patterns
 *   - 'question'        — ends with ? OR starts with how/what/why/etc.
 *   - 'general'         — everything else (counted, not persisted)
 *
 * Order matters: content_request is checked first because requests
 * often end with a question mark and would otherwise be miscategorized.
 */
function classifyComments(comments) {
  return comments.map(c => ({
    ...c,
    signalType: classifySingle(c.text || ''),
  }));
}

function classifySingle(text) {
  const t = text.trim().toLowerCase();
  if (!t) return 'general';

  // Content request patterns — explicit asks.
  if (REQUEST_PATTERNS.some(rx => rx.test(t))) return 'content_request';

  // Question patterns — explicit askshape.
  if (QUESTION_PATTERNS.some(rx => rx.test(t))) return 'question';
  if (t.endsWith('?')) return 'question';

  return 'general';
}

const REQUEST_PATTERNS = [
  /\b(can|could|would) you (make|do|cover|talk about|explain|create|film|record)\b/,
  /\b(please|plz|pls) (make|do|cover|talk about|explain)\b/,
  /\bwould love (to see|a video|more)\b/,
  /\b(video|content) (idea|suggestion|request):/,
  /\b(more|deeper) (videos? )?(on|about)\b/,
  /\bnext (video|episode) (should|could|please)\b/,
  /\b(do|make) (a |an )?(video|episode|series) (on|about|covering)\b/,
];

const QUESTION_PATTERNS = [
  /^(how|what|why|when|where|which|who)\b/,
  /^(can|could|would|should|will|do|does|did|is|are|was|were|has|have|had)\b/,
  /^(anyone|any one) (know|tried|have|has)\b/,
];

function summarize(signals) {
  let q = 0, r = 0, g = 0;
  for (const s of signals) {
    if (s.signalType === 'question')         q++;
    else if (s.signalType === 'content_request') r++;
    else                                          g++;
  }
  return {
    questions:        q,
    contentRequests:  r,
    general:          g,
    total:            signals.length,
    yieldPct:         signals.length ? Math.round(((q + r) / signals.length) * 100) : 0,
  };
}

export default {
  runSweep,
  listSweeps,
  getSweepWithSignals,
  updateSignalStatus,
  listCompetitorCandidates,
  COMMENT_SWEEP_PROMPT_VERSION,
};
