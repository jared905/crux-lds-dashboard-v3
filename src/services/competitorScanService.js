/**
 * Competitor concept scan — strategy-layer orchestrator.
 *
 * Pulls recent competitor uploads from the client's cohort, filters
 * to "notable" (early-performance signal vs channel baseline), then
 * scores each video AS IF THE CLIENT MADE IT using the same Pre-flight
 * scorer. Returns ranked findings by composite adaptability_score.
 *
 * The intent isn't "copy the competitor's exact concept." It's a
 * strategic-question prompt: "Peer Y just published this; if we made
 * our version, what would our scorer say?" That's the gap between
 * monitoring and acting.
 *
 * Architecture:
 *   - Pulls competitor channels via client_channels junction
 *     (junction-first; matches the convention in topicAuthorityService
 *      and EmbeddingsBackfillPanel after the cohort-resolution fix).
 *   - For each competitor channel, fetches recent videos + computes
 *     channel_avg_views from the channel's recent corpus.
 *   - Notable filter: views >= signal_multiplier * channel_avg.
 *   - Per notable video: builds an input { title, format, length_seconds }
 *     and calls scoreConcept(). Does NOT pass planned_day/hour_block —
 *     the competitor's slot isn't the client's; slot dimension
 *     self-excludes.
 *   - Topic authority self-excludes only the client's own historical
 *     hits — competitor videos are valid inputs and should match
 *     against the client's authority corpus.
 *
 * Composite adaptability_score (0-100):
 *   - 40 pts: signal multiplier (capped at 5x = full 40)
 *   - 30 pts: as-if-client composite tier (vlo=30 / solid=20 / risky=10 / under=0)
 *   - 30 pts: topic-authority similarity to client's history (sim * 30)
 * Higher score = stronger "should we adapt this?" signal.
 */

import { supabase } from './supabaseClient';
import { scoreConcept } from './conceptScorerService';
import { getConceptEmbedding, parseEmbedding } from './topicAuthorityService';
import { resolvePredictiveCohortIds } from './cohortRolesService';

const SHORTS_DURATION_THRESHOLD = 180;
const DEFAULT_WINDOW_DAYS       = 14;
const DEFAULT_SIGNAL_MULTIPLIER = 2.0;
const DEFAULT_CHANNEL_VIDEO_LIMIT = 50;   // per competitor channel — sample for baseline + notable filter
const SIGNAL_CAP_MULTIPLIER     = 5.0;    // multipliers >= this get full 40 points

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * Run a competitor concept scan.
 *
 * @param {Object} args
 * @param {string} args.clientId
 * @param {Object} args.cohortContext           from loadDeliverableData (patternsResult + whiteSpaceResult + spine)
 * @param {Object} [args.topicAuthorityContext] pre-loaded historical + cohort embeddings
 * @param {number} [args.windowDays=14]
 * @param {string} [args.formatFilter]          'shorts' | 'long_form' | null
 * @param {number} [args.signalMultiplier=2.0]
 * @param {Function} [args.onProgress]          ({ phase, scanned, total }) => void
 * @returns {Promise<{ ok, findings, channelsScanned, videosEvaluated, error? }>}
 */
export async function runCompetitorScan({
  clientId,
  cohortContext,
  topicAuthorityContext = null,
  windowDays = DEFAULT_WINDOW_DAYS,
  formatFilter = null,
  signalMultiplier = DEFAULT_SIGNAL_MULTIPLIER,
  onProgress = null,
}) {
  if (!clientId) return { ok: false, error: 'clientId required' };
  if (!cohortContext?.patternsResult || !cohortContext?.whiteSpaceResult) {
    return { ok: false, error: 'cohortContext missing patternsResult or whiteSpaceResult' };
  }

  // 1) Resolve competitor channels via the junction table.
  if (onProgress) onProgress({ phase: 'resolving_competitors' });
  const competitorChannels = await resolveCompetitorChannels(clientId);
  if (!competitorChannels.length) {
    return { ok: false, error: 'No competitor channels linked to this client' };
  }

  // 2) For each competitor channel, fetch recent videos + compute baseline avg.
  //    Notable = views >= signal_multiplier * channel_avg.
  if (onProgress) onProgress({ phase: 'pulling_videos', scanned: 0, total: competitorChannels.length });
  const notable = [];
  let totalEvaluated = 0;
  for (let i = 0; i < competitorChannels.length; i++) {
    const ch = competitorChannels[i];
    const { videos, channelAvg } = await loadChannelRecentVideos({
      channelId: ch.id,
      windowDays,
      formatFilter,
    });
    totalEvaluated += videos.length;
    for (const v of videos) {
      if ((v.view_count || 0) >= signalMultiplier * channelAvg && channelAvg > 0) {
        const daysSince = daysBetween(new Date(v.published_at), new Date());
        notable.push({
          ...v,
          channel: { id: ch.id, name: ch.name, youtube_channel_id: ch.youtube_channel_id },
          channel_avg: channelAvg,
          multiplier: v.view_count / channelAvg,
          days_since_publish: daysSince,
        });
      }
    }
    if (onProgress) onProgress({ phase: 'pulling_videos', scanned: i + 1, total: competitorChannels.length });
  }

  if (!notable.length) {
    return {
      ok: true,
      findings: [],
      channelsScanned: competitorChannels.length,
      videosEvaluated: totalEvaluated,
    };
  }

  // 3) Score each notable as-if-client.
  if (onProgress) onProgress({ phase: 'scoring', scanned: 0, total: notable.length });
  const findings = [];
  for (let i = 0; i < notable.length; i++) {
    const v = notable[i];
    const finding = await scoreOneNotable({ video: v, cohortContext, topicAuthorityContext });
    if (finding) findings.push(finding);
    if (onProgress) onProgress({ phase: 'scoring', scanned: i + 1, total: notable.length });
  }

  // 4) Rank by adaptability_score desc.
  findings.sort((a, b) => (b.adaptability_score || 0) - (a.adaptability_score || 0));

  return {
    ok: true,
    findings,
    channelsScanned: competitorChannels.length,
    videosEvaluated: totalEvaluated,
  };
}

// ──────────────────────────────────────────────────
// Competitor resolution
// ──────────────────────────────────────────────────

async function resolveCompetitorChannels(clientId) {
  if (!supabase) return [];
  // Migration 093 — predictive cohort only (cohort_role='peer'). Mixed
  // cohorts (Kendall test case 2026-06-05) introduce premium-tier
  // channels that don't transfer to mid-tier clients. Aspirational +
  // reference channels still surface in Research/CompetitorPulse for
  // monitoring; only excluded from scoring.
  const peerIds = await resolvePredictiveCohortIds(clientId);
  if (!peerIds.length) return [];

  const { data } = await supabase
    .from('channels')
    .select('id, name, youtube_channel_id')
    .in('id', peerIds);
  return data || [];
}

// ──────────────────────────────────────────────────
// Per-channel video fetch + baseline
// ──────────────────────────────────────────────────

async function loadChannelRecentVideos({ channelId, windowDays, formatFilter }) {
  if (!supabase) return { videos: [], channelAvg: 0 };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  let q = supabase
    .from('videos')
    .select('id, youtube_video_id, title, thumbnail_url, view_count, published_at, duration_seconds, title_embedding')
    .eq('channel_id', channelId)
    .not('title', 'is', null)
    .gt('view_count', 0)
    .gte('published_at', cutoff.toISOString())
    .order('published_at', { ascending: false })
    .limit(DEFAULT_CHANNEL_VIDEO_LIMIT);

  if (formatFilter === 'shorts') {
    q = q.lte('duration_seconds', SHORTS_DURATION_THRESHOLD).gt('duration_seconds', 0);
  } else if (formatFilter === 'long_form') {
    q = q.gt('duration_seconds', SHORTS_DURATION_THRESHOLD);
  }

  const { data: recentVids, error } = await q;
  if (error || !recentVids) return { videos: [], channelAvg: 0 };

  // Channel baseline: avg views across a broader sample to avoid the
  // notable filter cannibalizing its own baseline. Pull the last 90
  // days of videos for this channel.
  const baselineCutoff = new Date();
  baselineCutoff.setDate(baselineCutoff.getDate() - 90);
  const { data: baselineVids } = await supabase
    .from('videos')
    .select('view_count, duration_seconds')
    .eq('channel_id', channelId)
    .gte('published_at', baselineCutoff.toISOString())
    .gt('view_count', 0)
    .limit(200);

  let baselineSample = baselineVids || [];
  if (formatFilter === 'shorts') {
    baselineSample = baselineSample.filter(v => v.duration_seconds > 0 && v.duration_seconds <= SHORTS_DURATION_THRESHOLD);
  } else if (formatFilter === 'long_form') {
    baselineSample = baselineSample.filter(v => v.duration_seconds > SHORTS_DURATION_THRESHOLD);
  }

  const channelAvg = baselineSample.length
    ? baselineSample.reduce((s, v) => s + (v.view_count || 0), 0) / baselineSample.length
    : 0;

  return { videos: recentVids, channelAvg };
}

// ──────────────────────────────────────────────────
// Per-notable scoring (as-if-client)
// ──────────────────────────────────────────────────

async function scoreOneNotable({ video, cohortContext, topicAuthorityContext }) {
  const format = (video.duration_seconds != null && video.duration_seconds > 0 && video.duration_seconds <= SHORTS_DURATION_THRESHOLD)
    ? 'shorts'
    : 'long_form';

  const input = {
    title: video.title,
    format,
    // No planned_day/hour_block — the competitor's slot isn't ours,
    // slot dimension self-excludes.
    length_seconds: format === 'long_form' ? video.duration_seconds : null,
  };

  // For topic_authority similarity, we need a concept embedding. Prefer
  // the competitor's pre-backfilled title_embedding (zero-cost). Only
  // fall back to live OpenAI if absent and embeddings context exists.
  let conceptEmbedding = video.title_embedding ? parseEmbedding(video.title_embedding) : null;
  if (!conceptEmbedding && topicAuthorityContext?.historicalHits?.length) {
    try {
      conceptEmbedding = await getConceptEmbedding(video.title);
    } catch (err) {
      console.warn('[competitorScan] embed fallback failed:', err?.message);
    }
  }

  const scoringOutput = scoreConcept({
    input,
    cohortContext: {
      patternsResult:    cohortContext.patternsResult,
      whiteSpaceResult:  cohortContext.whiteSpaceResult,
      curiosityResult:   null,
      hookResult:        null,
      conceptEmbedding,
      topicAuthorityContext,
      spine:             cohortContext.spine,
    },
  });

  const similarity = scoringOutput?.scores?.topic_authority?.historical_similarity ?? null;
  const adaptability = computeAdaptabilityScore({
    multiplier: video.multiplier,
    compositeTier: scoringOutput.composite_tier,
    topicSimilarity: similarity,
  });

  return {
    competitor_video: {
      youtube_video_id:  video.youtube_video_id,
      title:             video.title,
      thumbnail_url:     video.thumbnail_url,
      view_count:        video.view_count,
      published_at:      video.published_at,
      duration_seconds:  video.duration_seconds,
      format,
      channel:           video.channel,
    },
    signal: {
      multiplier:         round(video.multiplier, 2),
      channel_avg:        Math.round(video.channel_avg),
      days_since_publish: video.days_since_publish,
    },
    as_if_client_score: {
      composite_tier:      scoringOutput.composite_tier,
      composite_rationale: scoringOutput.composite_rationale,
      scores:              scoringOutput.scores,
    },
    topic_authority_similarity: similarity == null ? null : round(similarity, 3),
    adaptability_score: Math.round(adaptability),
  };
}

function computeAdaptabilityScore({ multiplier, compositeTier, topicSimilarity }) {
  const signalPts = Math.min(multiplier / SIGNAL_CAP_MULTIPLIER, 1) * 40;
  const tierPts =
    compositeTier === 'very_likely_outperform' ? 30 :
    compositeTier === 'likely_solid'           ? 20 :
    compositeTier === 'risky'                  ? 10 : 0;
  const topicPts = topicSimilarity != null
    ? Math.max(0, Math.min(topicSimilarity, 1)) * 30
    : 0;
  return signalPts + tierPts + topicPts;
}

// ──────────────────────────────────────────────────
// Utils
// ──────────────────────────────────────────────────

function daysBetween(a, b) {
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

function round(n, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export default { runCompetitorScan };
