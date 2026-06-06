/**
 * Calibration service — pure compute layer for the calibration loop.
 *
 * Takes a completed repositioning audit (predicted tiers per dimension
 * per video) plus a baseline strategy, derives the actual_tier for each
 * video from the observed signal, and produces per-dimension + composite
 * confusion matrices + accuracy numbers.
 *
 * Phase A: baselineStrategy = 'percentile_rank'. Actual tier comes from
 * a video's view-rank quartile inside the channel's catalog (or inside
 * the audit's format-filtered pool if the audit was format-scoped).
 *
 * Phase B (later): pluggable strategies for pipeline outcomes
 * (consultation_bookings, demo_requests, donor_signups, etc.) for
 * clients who can provide the outcome data. The strategy interface is
 * already in place — only deriveActualTiers needs to grow.
 *
 * Why percentile_rank for Phase A:
 *   - Works for every client archetype out of the box.
 *   - Defensible to a strategist ("did this video rank top-quartile in
 *     YOUR catalog or not?").
 *   - Robust to channel growth (every audit re-ranks against the same
 *     video pool the audit captured).
 *   - Schema accepts richer baseline strategies later without rewrite.
 *
 * What this service does NOT do: persist. CRUD is in
 * calibrationRunsService. This file is a pure, no-IO transform so it's
 * trivially testable.
 */

const TIERS = ['predicted_under', 'risky', 'likely_solid', 'very_likely_outperform'];
const TIER_INDEX = Object.fromEntries(TIERS.map((t, i) => [t, i]));

const DEFAULT_MISMATCH_TOP_N = 25;

const DIMENSION_KEYS = [
  'title_patterns',
  'slot',
  'length',
  'topic_authority',
];

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * @param {Object} args
 * @param {Object} args.audit                 row from client_repositioning_audits
 *                                            (must have video_scores JSONB)
 * @param {string} [args.baselineStrategy='percentile_rank']
 * @param {number} [args.mismatchTopN=25]
 * @returns {{
 *   baselineStrategy: string,
 *   videosCalibrated: number,
 *   compositeMetrics: object,
 *   perDimensionMetrics: object,
 *   mismatchedVideos: Array,
 *   compositeAccuracy: number,
 *   compositeAdjacentAccuracy: number,
 * } | { error: string }}
 */
export function computeCalibration({
  audit,
  baselineStrategy = 'percentile_rank',
  mismatchTopN = DEFAULT_MISMATCH_TOP_N,
}) {
  if (!audit?.video_scores?.length) {
    return { error: 'audit has no video_scores to calibrate against' };
  }

  // 1) Derive actual_tier for each video using the chosen strategy.
  const videos = deriveActualTiers({ videos: audit.video_scores, baselineStrategy });
  if (videos.error) return { error: videos.error };

  // 2) Composite-tier metrics.
  const compositeMetrics = scoreDimension(
    videos.map(v => ({
      predicted: v.composite_tier,
      actual:    v.actual_tier,
    }))
  );

  // 3) Per-dimension metrics.
  const perDimensionMetrics = {};
  for (const dim of DIMENSION_KEYS) {
    const pairs = videos
      .map(v => {
        const predicted = v.scores?.[dim]?.tier;
        if (!predicted) return null;   // dimension self-excluded for this video
        return { predicted, actual: v.actual_tier };
      })
      .filter(Boolean);
    perDimensionMetrics[dim] = scoreDimension(pairs);
  }

  // 4) Top-N mismatched videos (composite predicted != actual), high-traffic first.
  const mismatches = videos
    .filter(v => v.composite_tier !== v.actual_tier)
    .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
    .slice(0, mismatchTopN)
    .map(v => ({
      youtube_video_id:          v.youtube_video_id,
      title:                     v.title,
      view_count:                v.view_count,
      published_at:              v.published_at,
      format:                    v.format,
      predicted_composite_tier:  v.composite_tier,
      actual_tier:               v.actual_tier,
      per_dimension_disagreement: DIMENSION_KEYS
        .map(dim => {
          const predicted = v.scores?.[dim]?.tier;
          if (!predicted) return null;
          return predicted !== v.actual_tier
            ? { dim, predicted_tier: predicted, actual_tier: v.actual_tier }
            : null;
        })
        .filter(Boolean),
    }));

  return {
    baselineStrategy,
    videosCalibrated:          videos.length,
    compositeMetrics,
    perDimensionMetrics,
    mismatchedVideos:          mismatches,
    compositeAccuracy:         compositeMetrics.accuracy,
    compositeAdjacentAccuracy: compositeMetrics.adjacent_accuracy,
  };
}

// ──────────────────────────────────────────────────
// Strategy: derive actual_tier per video
// ──────────────────────────────────────────────────

/**
 * Phase A strategy: percentile_rank within the audit's video pool.
 * Top quartile → very_likely_outperform; bottom quartile →
 * predicted_under; middle quartiles split likely_solid / risky.
 *
 * Why quartile (vs deciles or thirds): we have 4 predicted tiers, so
 * quartile mapping gives equal-sized actual buckets that compare cleanly.
 *
 * Handles ties by stable sort + index-based rank (videos with the same
 * view_count land in adjacent ranks rather than collapsing — keeps the
 * quartile boundaries well-defined).
 */
function deriveActualTiers({ videos, baselineStrategy }) {
  if (baselineStrategy !== 'percentile_rank') {
    return { error: `Unknown baselineStrategy: ${baselineStrategy}. Phase A supports 'percentile_rank' only.` };
  }
  if (!videos.length) return { error: 'no videos' };

  const ranked = [...videos]
    .map((v, originalIdx) => ({ ...v, _originalIdx: originalIdx }))
    .sort((a, b) => (a.view_count || 0) - (b.view_count || 0));  // asc

  const n = ranked.length;
  for (let i = 0; i < n; i++) {
    // i in [0, n-1]. percentile = (i+1)/n. Quartile by Math.ceil.
    const pct = (i + 1) / n;
    let tier;
    if      (pct > 0.75) tier = 'very_likely_outperform';
    else if (pct > 0.50) tier = 'likely_solid';
    else if (pct > 0.25) tier = 'risky';
    else                 tier = 'predicted_under';
    ranked[i].actual_tier = tier;
  }

  // Restore original order so per-dim mapping by index is preserved.
  ranked.sort((a, b) => a._originalIdx - b._originalIdx);
  return ranked;
}

// ──────────────────────────────────────────────────
// Score a single dimension (or the composite)
// ──────────────────────────────────────────────────

function scoreDimension(pairs) {
  const empty = {
    n: 0,
    accuracy: null,
    adjacent_accuracy: null,
    confusion: emptyConfusion(),
  };
  if (!pairs?.length) return empty;

  const confusion = emptyConfusion();
  let exact = 0;
  let adjacent = 0;
  let total = 0;

  for (const { predicted, actual } of pairs) {
    // Skip pairs where either tier label is unrecognized — confusion
    // matrix only spans the canonical 4-tier vocabulary.
    if (TIER_INDEX[predicted] == null || TIER_INDEX[actual] == null) continue;
    confusion[predicted][actual] = (confusion[predicted][actual] || 0) + 1;
    total++;
    if (predicted === actual) exact++;
    if (Math.abs(TIER_INDEX[predicted] - TIER_INDEX[actual]) <= 1) adjacent++;
  }

  return {
    n: total,
    accuracy:          total > 0 ? round(exact / total, 4) : null,
    adjacent_accuracy: total > 0 ? round(adjacent / total, 4) : null,
    confusion,
  };
}

function emptyConfusion() {
  const m = {};
  for (const p of TIERS) {
    m[p] = {};
    for (const a of TIERS) m[p][a] = 0;
  }
  return m;
}

function round(n, decimals = 4) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export const CALIBRATION_TIERS = TIERS;
export const CALIBRATION_DIMENSION_KEYS = DIMENSION_KEYS;

export default { computeCalibration, CALIBRATION_TIERS, CALIBRATION_DIMENSION_KEYS };
