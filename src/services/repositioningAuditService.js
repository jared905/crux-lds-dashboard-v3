/**
 * Repositioning audit service — bulk-scores a client's existing
 * catalog through the Pre-flight scorer and aggregates findings.
 *
 * Answers a different question than per-concept scoring:
 *   Pre-flight scorer: "Should we make this concept?" (one concept in)
 *   Repositioning audit: "What's systemically wrong with our existing
 *                         strategy?" (whole catalog → patterns out)
 *
 * For established channels the second question is often more valuable
 * than the first. Catches things like "78% of our videos rate
 * predicted_under on curiosity_gap" or "every slot we publish in is
 * statistical-negative — we're posting at the wrong times."
 *
 * Architecture:
 *   - Frontend orchestrator. ~500 videos × ~5 deterministic dimensions
 *     runs comfortably in the browser (no LLM calls in deterministic
 *     mode; topic_authority's similarity is JS math on pre-backfilled
 *     embeddings).
 *   - v1 mode = 'deterministic' — title patterns, slot, length, topic,
 *     topic_authority. Skips LLM dimensions (curiosity_gap, hook_delivery)
 *     and surface_fit (needs a target_surface input that doesn't exist
 *     per-video).
 *   - Each video uses its own published_at to infer planned_day +
 *     planned_hour_block (Mountain Time), and its own duration_seconds
 *     for format + length.
 *   - Topic authority excludes the video being scored from its own
 *     historical-hits corpus — otherwise it would always find itself
 *     as its closest neighbor (similarity = 1.0).
 *
 * Returns aggregated findings + the per-video score list so the
 * persistence layer can write a single row with everything in JSONB.
 */

import { supabase } from './supabaseClient';
import { scoreConcept, TIERS } from './conceptScorerService';
import { parseEmbedding } from './topicAuthorityService';   // re-exported for the v1 helper

// ──────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────

const SHORTS_DURATION_THRESHOLD = 180;
const SYSTEMIC_GAP_THRESHOLD     = 0.60;  // > 60% in risky+predicted_under = systemic gap
const SYSTEMIC_STRENGTH_THRESHOLD = 0.50; // > 50% in likely_solid+very_likely = systemic strength
const DEFAULT_VIDEO_LIMIT        = 500;

const DAY_LABELS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BLOCK_LABELS = ['12am–6am', '6am–12pm', '12pm–6pm', '6pm–12am'];

// Dimensions the audit reports on. Excludes the strategist-input
// dimensions (target_surface → surface_fit, hook_beat → hook_delivery,
// optional topic_label → topic) since past videos don't carry those
// inputs. Includes topic_authority because we have embeddings backfilled.
export const REPORTED_DIMENSIONS = [
  'title_patterns',
  'slot',
  'length',
  'topic_authority',
];

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * Run a repositioning audit on a client's catalog.
 *
 * @param {Object} args
 * @param {string} args.clientId
 * @param {Object} args.cohortContext     from loadDeliverableData (patternsResult + whiteSpaceResult)
 * @param {Object} [args.topicAuthorityContext]  pre-loaded historical + cohort embeddings
 * @param {string} [args.formatFilter]    'shorts' | 'long_form' — restrict to one format
 * @param {number} [args.videoLimit=500]
 * @param {Function} [args.onProgress]    optional ({ scored, total }) => void
 * @returns {Promise<{ ok, videosScored, videoScores, dimensionBreakdowns, compositeDistribution, systemicGaps, systemicStrengths, error? }>}
 */
export async function runRepositioningAudit({
  clientId,
  cohortContext,
  topicAuthorityContext = null,
  formatFilter = null,
  videoLimit = DEFAULT_VIDEO_LIMIT,
  onProgress = null,
}) {
  if (!clientId) return { ok: false, error: 'clientId required' };
  if (!cohortContext?.patternsResult || !cohortContext?.whiteSpaceResult) {
    return { ok: false, error: 'cohortContext missing patternsResult or whiteSpaceResult — run the audit first' };
  }

  // 1) Pull the channel's videos. Include duration_seconds + title_embedding
  // so we can run topic_authority without re-fetching.
  const videos = await loadClientVideos({ clientId, formatFilter, videoLimit });
  if (!videos.length) {
    return { ok: false, error: 'No videos found for this client' };
  }

  // 2) Score each video.
  const videoScores = [];
  let videosWithEmbeddings = 0;
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const scored = await scoreOneVideo({ video: v, cohortContext, topicAuthorityContext });
    if (scored) {
      videoScores.push(scored);
      if (v.title_embedding != null) videosWithEmbeddings++;
    }
    if (onProgress) onProgress({ scored: i + 1, total: videos.length });
  }

  // 3) Aggregate.
  const compositeDistribution = aggregateComposite(videoScores);
  const dimensionBreakdowns   = aggregateDimensions(videoScores);
  const systemicGaps      = findSystemicGaps(dimensionBreakdowns);
  const systemicStrengths = findSystemicStrengths(dimensionBreakdowns);

  return {
    ok: true,
    videosScored: videoScores.length,
    videosWithEmbeddings,
    videoScores,
    compositeDistribution,
    dimensionBreakdowns,
    systemicGaps,
    systemicStrengths,
  };
}

// ──────────────────────────────────────────────────
// Video loading
// ──────────────────────────────────────────────────

async function loadClientVideos({ clientId, formatFilter, videoLimit }) {
  if (!supabase) return [];

  // Resolve the channel UUID for this client. clientId IS channels.id
  // here (per the loadDeliverableData convention).
  let q = supabase
    .from('videos')
    .select('id, youtube_video_id, title, view_count, published_at, duration_seconds, title_embedding')
    .eq('channel_id', clientId)
    .not('title', 'is', null)
    .gt('view_count', 0)
    .order('published_at', { ascending: false })
    .limit(videoLimit);

  if (formatFilter === 'shorts') {
    q = q.lte('duration_seconds', SHORTS_DURATION_THRESHOLD).gt('duration_seconds', 0);
  } else if (formatFilter === 'long_form') {
    q = q.gt('duration_seconds', SHORTS_DURATION_THRESHOLD);
  }

  const { data, error } = await q;
  if (error) {
    console.warn('[repositioningAudit] video fetch failed:', error);
    return [];
  }
  return data || [];
}

// ──────────────────────────────────────────────────
// Per-video scoring
// ──────────────────────────────────────────────────

async function scoreOneVideo({ video, cohortContext, topicAuthorityContext }) {
  if (!video?.title) return null;

  const format = (video.duration_seconds != null && video.duration_seconds > 0 && video.duration_seconds <= SHORTS_DURATION_THRESHOLD)
    ? 'shorts'
    : 'long_form';

  // Derive slot from published_at (Mountain Time).
  const slotInputs = inferSlotFromPublishedAt(video.published_at);

  const input = {
    title: video.title,
    format,
    planned_day: slotInputs.day,
    planned_hour_block: slotInputs.block,
    length_seconds: format === 'long_form' ? video.duration_seconds : null,
    // No topic_label — past videos don't carry strategist topic tags.
    // No target_surface — surface_fit is null-safe.
    // No hook_beat — hook_delivery is null-safe.
  };

  // Topic authority excludes this video from its own historical corpus
  // (otherwise it finds itself as the closest match, similarity ~1.0).
  let adjustedTopicCtx = null;
  if (topicAuthorityContext && video.title_embedding) {
    adjustedTopicCtx = {
      ...topicAuthorityContext,
      historicalHits: (topicAuthorityContext.historicalHits || [])
        .filter(h => h.youtube_video_id !== video.youtube_video_id),
    };
  }

  // Concept embedding for this video is its pre-backfilled title_embedding.
  const conceptEmbedding = video.title_embedding ? parseEmbedding(video.title_embedding) : null;

  const scoringOutput = scoreConcept({
    input,
    cohortContext: {
      patternsResult:    cohortContext.patternsResult,
      whiteSpaceResult:  cohortContext.whiteSpaceResult,
      // Deterministic mode — no LLM dimensions, no surface_fit input.
      curiosityResult:   null,
      hookResult:        null,
      conceptEmbedding,
      topicAuthorityContext: adjustedTopicCtx,
      spine:             cohortContext.spine,
    },
  });

  return {
    youtube_video_id:    video.youtube_video_id,
    video_id:            video.id,
    title:               video.title,
    view_count:          video.view_count,
    published_at:        video.published_at,
    duration_seconds:    video.duration_seconds,
    format,
    composite_tier:      scoringOutput.composite_tier,
    composite_rationale: scoringOutput.composite_rationale,
    scores:              scoringOutput.scores,
  };
}

// Derive day-of-week + hour block (Mountain Time) for a published_at
// timestamp. Matches the binning used by whiteSpaceService.computeCadenceGaps.
function inferSlotFromPublishedAt(publishedAt) {
  if (!publishedAt) return { day: null, block: null };
  try {
    const d = new Date(publishedAt);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Denver',
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const wd = parts.find(p => p.type === 'weekday')?.value;
    const hr = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const dayIdx = DAY_LABELS.indexOf(wd);
    if (dayIdx < 0) return { day: null, block: null };
    const blockIdx = hr < 6 ? 0 : hr < 12 ? 1 : hr < 18 ? 2 : 3;
    return { day: DAY_LABELS[dayIdx], block: BLOCK_LABELS[blockIdx] };
  } catch {
    return { day: null, block: null };
  }
}

// ──────────────────────────────────────────────────
// Aggregations
// ──────────────────────────────────────────────────

function aggregateComposite(videoScores) {
  const dist = { very_likely_outperform: 0, likely_solid: 0, risky: 0, predicted_under: 0 };
  for (const v of videoScores) {
    if (dist[v.composite_tier] != null) dist[v.composite_tier]++;
  }
  return dist;
}

function aggregateDimensions(videoScores) {
  const breakdowns = {};
  for (const dimKey of REPORTED_DIMENSIONS) {
    breakdowns[dimKey] = {
      very_likely_outperform: 0,
      likely_solid: 0,
      risky: 0,
      predicted_under: 0,
      null_count: 0,
    };
  }
  for (const v of videoScores) {
    for (const dimKey of REPORTED_DIMENSIONS) {
      const dim = v.scores?.[dimKey];
      if (!dim || !dim.tier) {
        breakdowns[dimKey].null_count++;
        continue;
      }
      if (breakdowns[dimKey][dim.tier] != null) breakdowns[dimKey][dim.tier]++;
    }
  }
  return breakdowns;
}

function findSystemicGaps(dimensionBreakdowns) {
  const gaps = [];
  for (const [dimKey, dist] of Object.entries(dimensionBreakdowns)) {
    const total = sumNonNull(dist);
    if (total === 0) continue;
    const under = ((dist.risky || 0) + (dist.predicted_under || 0)) / total;
    if (under > SYSTEMIC_GAP_THRESHOLD) {
      gaps.push({
        dimension: dimKey,
        share_under: Math.round(under * 100) / 100,
        share_over:  Math.round(((dist.very_likely_outperform || 0) + (dist.likely_solid || 0)) / total * 100) / 100,
        note: `${Math.round(under * 100)}% of scored videos rate risky or predicted_under on this dimension.`,
      });
    }
  }
  return gaps.sort((a, b) => b.share_under - a.share_under);
}

function findSystemicStrengths(dimensionBreakdowns) {
  const strengths = [];
  for (const [dimKey, dist] of Object.entries(dimensionBreakdowns)) {
    const total = sumNonNull(dist);
    if (total === 0) continue;
    const over = ((dist.very_likely_outperform || 0) + (dist.likely_solid || 0)) / total;
    if (over > SYSTEMIC_STRENGTH_THRESHOLD) {
      strengths.push({
        dimension: dimKey,
        share_over: Math.round(over * 100) / 100,
        share_under: Math.round(((dist.risky || 0) + (dist.predicted_under || 0)) / total * 100) / 100,
        note: `${Math.round(over * 100)}% of scored videos rate likely_solid or very_likely_outperform.`,
      });
    }
  }
  return strengths.sort((a, b) => b.share_over - a.share_over);
}

function sumNonNull(dist) {
  return (dist.very_likely_outperform || 0)
       + (dist.likely_solid || 0)
       + (dist.risky || 0)
       + (dist.predicted_under || 0);
}

export default { runRepositioningAudit, REPORTED_DIMENSIONS, TIERS };
