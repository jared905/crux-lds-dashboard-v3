/**
 * Concept scorer — Phase 1 of the prediction machine.
 *
 * Pure, deterministic scorer for video concepts. Given a strategist's
 * concept (title + format + slot + length + optional topic) and the
 * client's cohort audit data (patternsService output + whiteSpaceService
 * output), produce a per-dimension scorecard plus a composite 4-tier
 * rating and a list of suggested tweaks.
 *
 * No LLM, no async work, no side effects — orchestrator layer fetches
 * the cohort context and passes it in; this module just scores.
 *
 * Contract documented in /supabase/migrations/086_client_concept_scorecards.sql
 * (input / scores / tweaks shapes).
 *
 * Convention notes inherited from the existing pipeline:
 *   - `viewsLift` is a RATIO (1.72 = +72%). Display in UI via (lift-1)*100.
 *   - `confidence` is 'statistical' | 'directional' | 'insufficient'.
 *   - `shortsShare` is 0..1; >= 0.85 means a pattern is dominated by
 *     Shorts in the cohort (so its lift may not transfer to long-form).
 *
 * Dimension scorers each return either a typed score object or null
 * (when input or cohort data is missing). Null dimensions are excluded
 * from the composite — they don't degrade the rating, they're just
 * absent.
 */

import { TITLE_PATTERNS } from './patternsService';

// ──────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────

// Tier ordering — used for comparisons + composite logic.
export const TIERS = ['predicted_under', 'risky', 'likely_solid', 'very_likely_outperform'];
const TIER_INDEX = Object.fromEntries(TIERS.map((t, i) => [t, i]));

// Format-skew thresholds. When a pattern's shortsShare crosses these,
// the warning fires that its lift may not transfer to the opposite
// format. Matches the convention used elsewhere in the audit pipeline.
const SHORTS_SKEW_THRESHOLD = 0.85;
const LONGFORM_SKEW_THRESHOLD = 0.15;

// Lift thresholds for tier assignment per dimension. Statistical
// confidence holds the line; directional gets one tier downgrade.
//
// Rationale:
//   - +50% over the cohort baseline at statistical confidence is a
//     genuinely strong signal (the audit only labels n>=30 + drop-top
//     pass as statistical, so this isn't lucky).
//   - +15% statistical = solidly above baseline.
//   - Below 85% of baseline = predicted to drag.
//   - "risky" = the directional zone where the number is suggestive
//     but the sample isn't big enough to commit production resources.
const LIFT_TIER_THRESHOLDS = {
  very_likely_outperform: 1.50,   // +50% or more (statistical only)
  likely_solid:           1.15,   // +15% or more
  predicted_under:        0.85,   // below -15%
};

// Block-label normalization. The UI uses en-dash; downstream cohort
// data uses en-dash too. Normalize at input.
const BLOCK_ALIASES = {
  '12am-6am': '12am–6am',
  '6am-12pm': '6am–12pm',
  '12pm-6pm': '12pm–6pm',
  '6pm-12am': '6pm–12am',
};

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const BLOCK_INDEX = { '12am–6am': 0, '6am–12pm': 1, '12pm–6pm': 2, '6pm–12am': 3 };

// Length buckets — must match whiteSpaceService.formatGaps bucket IDs
// so we can map a planned length_seconds to a cohort-level lift cell.
const LENGTH_BUCKET_FOR_SECONDS = (seconds) => {
  if (seconds == null || seconds <= 0) return null;
  if (seconds <= 180)  return 'shorts';
  if (seconds <= 480)  return 'lf_3_8';
  if (seconds <= 900)  return 'lf_8_15';
  if (seconds <= 1500) return 'lf_15_25';
  return 'doc_25p';
};

// ──────────────────────────────────────────────────
// Tier helpers
// ──────────────────────────────────────────────────

/**
 * Tier from a (lift, confidence, sampleSize) triple.
 *   - statistical lift >= 1.50 → very_likely_outperform
 *   - statistical lift >= 1.15 → likely_solid
 *   - statistical lift <  0.85 → predicted_under
 *   - directional shifts everything one tier toward risky
 *   - missing data → 'risky' (we can't commit to better than that)
 */
function tierFromLift(lift, confidence) {
  if (lift == null || confidence === 'insufficient') return 'risky';

  // Statistical thresholds first (clean buckets)
  if (confidence === 'statistical') {
    if (lift >= LIFT_TIER_THRESHOLDS.very_likely_outperform) return 'very_likely_outperform';
    if (lift >= LIFT_TIER_THRESHOLDS.likely_solid)           return 'likely_solid';
    if (lift <  LIFT_TIER_THRESHOLDS.predicted_under)        return 'predicted_under';
    return 'risky';
  }

  // Directional — downgrade one tier from where statistical would land.
  // Specifically: a directional +50% is "likely_solid" not very_likely;
  // a directional +15% is "risky" not likely_solid.
  if (lift >= LIFT_TIER_THRESHOLDS.very_likely_outperform) return 'likely_solid';
  if (lift >= LIFT_TIER_THRESHOLDS.likely_solid)           return 'risky';
  if (lift <  LIFT_TIER_THRESHOLDS.predicted_under)        return 'risky';
  return 'risky';
}

// ──────────────────────────────────────────────────
// 1. Title patterns
// ──────────────────────────────────────────────────

/**
 * Score a title against the cohort's detected pattern lifts.
 *
 * For each pattern the title matches, look up the cohort's empirical
 * data (lift + confidence + shortsShare). Fire a format-skew warning
 * when the pattern's cohort representation is heavily one-sided in
 * the opposite format from the planned video.
 *
 * Composite tier for the dimension: take the best statistical positive
 * lift among matched patterns. Negative patterns (lift < 0.85 statistical)
 * count as drag signals — they get surfaced as suggested tweaks.
 */
export function scoreTitlePatterns(title, format, patternsResult) {
  if (!title || typeof title !== 'string') return null;
  const cohortPatterns = patternsResult?.scope?.titlePatterns || [];
  if (!cohortPatterns.length) return null;

  const byId = Object.fromEntries(cohortPatterns.map(p => [p.id, p]));

  const matched = [];
  const drags = [];   // patterns the title matches that have negative lift
  for (const def of TITLE_PATTERNS) {
    if (!def.test(title)) continue;
    const cohort = byId[def.id];
    if (!cohort || cohort.viewsLift == null) continue;

    const liftPct = Math.round((cohort.viewsLift - 1) * 100);
    const n = cohort.count;
    const confidence = cohort.confidence;
    const shortsShare = cohort.shortsShare;

    // Format-skew warning — fires when the cohort's representation
    // of this pattern is heavily one-sided AGAINST the planned format.
    let formatSkewWarning = null;
    if (format === 'long_form' && shortsShare != null && shortsShare >= SHORTS_SKEW_THRESHOLD) {
      formatSkewWarning = `${Math.round(shortsShare * 100)}% Shorts in cohort — lift may not transfer to long-form`;
    } else if (format === 'shorts' && shortsShare != null && shortsShare <= LONGFORM_SKEW_THRESHOLD) {
      formatSkewWarning = `${Math.round((1 - shortsShare) * 100)}% long-form in cohort — lift may not transfer to Shorts`;
    }

    const entry = {
      pattern: def.id,
      label: def.label,
      lift_pct: liftPct,
      confidence,
      n,
      ...(formatSkewWarning ? { format_skew_warning: formatSkewWarning } : {}),
    };

    if (cohort.viewsLift < LIFT_TIER_THRESHOLDS.predicted_under && confidence === 'statistical') {
      drags.push(entry);
    } else {
      matched.push(entry);
    }
  }

  // Dimension tier: the best matched pattern wins. Format-skew warnings
  // demote a pattern to directional for tiering — we trust the lift
  // number less when it might be a format artifact. Ties on tier break
  // toward the higher absolute lift.
  let best = null;   // { lift_pct, confidence, tier }
  for (const m of matched) {
    const effectiveConfidence = m.format_skew_warning ? 'directional' : m.confidence;
    const candidateTier = tierFromLift(1 + m.lift_pct / 100, effectiveConfidence);
    const isBetter = !best
      || TIER_INDEX[candidateTier] > TIER_INDEX[best.tier]
      || (candidateTier === best.tier && m.lift_pct > best.lift_pct);
    if (isBetter) {
      best = { lift_pct: m.lift_pct, confidence: effectiveConfidence, tier: candidateTier };
    }
  }

  // Drag-only titles (e.g. matches colon + pipe and nothing else) tier
  // worse the more drags pile up. Two or more statistical drags →
  // predicted_under; one → risky.
  let tier;
  if (best) {
    tier = best.tier;
  } else if (drags.length >= 2) {
    tier = 'predicted_under';
  } else if (drags.length === 1) {
    tier = 'risky';
  } else {
    tier = 'risky';
  }

  return {
    matched,
    drags,
    composite_lift_pct: best ? best.lift_pct : null,
    tier,
  };
}

// ──────────────────────────────────────────────────
// 2. Slot (day × hour-block)
// ──────────────────────────────────────────────────

/**
 * Score a planned upload slot against the cadence heatmap.
 *
 * The heatmap is computed on the combined cohort (Shorts + long-form
 * mixed) per the existing pipeline. Phase 2 should split this per
 * format; for Phase 1 we use it as-is and note the limitation.
 */
export function scoreSlot(plannedDay, plannedHourBlock, cadenceGaps) {
  if (!plannedDay || !plannedHourBlock || !cadenceGaps?.liftGrid) return null;

  const block = BLOCK_ALIASES[plannedHourBlock] || plannedHourBlock;
  const dayIdx = DAY_INDEX[plannedDay];
  const blockIdx = BLOCK_INDEX[block];
  if (dayIdx == null || blockIdx == null) return null;

  const lift = cadenceGaps.liftGrid[dayIdx]?.[blockIdx];
  const confidence = cadenceGaps.confidenceGrid[dayIdx]?.[blockIdx] || 'insufficient';
  const n = cadenceGaps.grid[dayIdx]?.[blockIdx] || 0;

  return {
    day: plannedDay,
    block,
    lift_pct: lift != null ? Math.round((lift - 1) * 100) : null,
    n,
    confidence,
    tier: tierFromLift(lift, confidence),
  };
}

// ──────────────────────────────────────────────────
// 3. Length (long-form only)
// ──────────────────────────────────────────────────

/**
 * Score a planned video length against the cohort's length-bucket lifts.
 *
 * Uses whiteSpaceService.formatGaps which already baselines per length
 * class (long-form bucket vs long-form median, Shorts vs Shorts median)
 * — so an 8–15min lift of 6.36× isn't comparing against a Shorts-diluted
 * scope median.
 *
 * Returns null for `shorts` format (length doesn't carry the same signal
 * for Shorts; completion + hook do).
 */
export function scoreLength(lengthSeconds, format, formatGaps) {
  if (format !== 'long_form') return null;
  if (!formatGaps?.length || !lengthSeconds || lengthSeconds <= 180) return null;

  const bucketId = LENGTH_BUCKET_FOR_SECONDS(lengthSeconds);
  if (!bucketId || bucketId === 'shorts') return null;

  const bucket = formatGaps.find(b => b.id === bucketId);
  if (!bucket) return null;

  // formatGaps doesn't expose a confidence field per-bucket; derive
  // a coarse one from count. The audit pipeline uses n>=30 as the
  // statistical threshold for cells; we apply the same rule here.
  const confidence = bucket.count >= 30 ? 'statistical'
    : bucket.count >= 10 ? 'directional'
    : 'insufficient';

  return {
    bucket: bucket.label,
    bucket_id: bucketId,
    lift_pct: bucket.viewsLift != null ? Math.round((bucket.viewsLift - 1) * 100) : null,
    n: bucket.count,
    confidence,
    tier: tierFromLift(bucket.viewsLift, confidence),
  };
}

// ──────────────────────────────────────────────────
// 4. Topic
// ──────────────────────────────────────────────────

/**
 * Score a topic label against the cohort's topic-coverage classification.
 *
 * Matching is intentionally permissive: case-insensitive whole-string,
 * then substring. If no match found, the topic is treated as "novel —
 * not in cohort topics", which is itself a gap-shaped signal (with the
 * caveat that we don't have empirical performance data to back it).
 */
export function scoreTopic(topicLabel, topicCoverage) {
  if (!topicLabel || typeof topicLabel !== 'string') return null;
  if (!Array.isArray(topicCoverage) || !topicCoverage.length) return null;

  const needle = topicLabel.trim().toLowerCase();

  let match = topicCoverage.find(t => (t.name || '').toLowerCase() === needle);
  if (!match) {
    match = topicCoverage.find(t => {
      const name = (t.name || '').toLowerCase();
      return name.includes(needle) || needle.includes(name);
    });
  }

  if (!match) {
    // Novel topic — neither in the cohort's named clusters nor adjacent
    // to one. Treat as a gap signal but mark unknown so consumers know
    // the lift isn't empirically backed.
    return {
      label: topicLabel,
      saturation: 'gap',
      cohort_share_pct: 0,
      matched_topic_name: null,
      tier: 'likely_solid',   // upside-leaning but not committed
      note: 'Not found in cohort topic clusters — treating as novel gap',
    };
  }

  // Saturation drives the tier directly. The audit pipeline uses:
  //   gap = <5% of titles, moderate = 5-15%, saturated = >15%.
  const tierBySaturation = {
    gap:       'very_likely_outperform',
    moderate:  'likely_solid',
    saturated: 'risky',
  };

  // Coverage count is over up-to-80-title sample (top by view_count),
  // not over the full cohort. Convert to a rough share for the UI.
  const cohortSharePct = match.count != null && topicCoverage.length
    ? Math.round((match.count / 80) * 1000) / 10
    : null;

  return {
    label: topicLabel,
    matched_topic_name: match.name,
    saturation: match.coverage,
    cohort_share_pct: cohortSharePct,
    example_titles: (match.exampleTitles || []).slice(0, 2),
    tier: tierBySaturation[match.coverage] || 'risky',
  };
}

// ──────────────────────────────────────────────────
// Composite tier
// ──────────────────────────────────────────────────

/**
 * Combine per-dimension tiers into a single composite + plain-English
 * rationale.
 *
 * Logic:
 *   - 2+ dimensions at predicted_under → predicted_under (real drag)
 *   - any dimension at predicted_under → cap composite at risky
 *   - 2+ dimensions at very_likely_outperform AND no underperformers
 *     → very_likely_outperform
 *   - majority risky → risky
 *   - default → likely_solid
 *
 * Null dimensions are excluded — they don't degrade the score, they're
 * just absent (e.g., shorts skips length, no topic provided skips topic).
 */
export function composeRating(dimensions) {
  const live = dimensions.filter(d => d != null);
  if (!live.length) {
    return { tier: 'risky', rationale: 'No scoring dimensions available — re-check cohort data.' };
  }

  const counts = { predicted_under: 0, risky: 0, likely_solid: 0, very_likely_outperform: 0 };
  for (const d of live) counts[d.tier] = (counts[d.tier] || 0) + 1;

  let tier;
  if (counts.predicted_under >= 2) {
    tier = 'predicted_under';
  } else if (counts.predicted_under >= 1) {
    tier = 'risky';
  } else if (counts.very_likely_outperform >= 2) {
    tier = 'very_likely_outperform';
  } else if (counts.risky > live.length / 2) {
    tier = 'risky';
  } else {
    tier = 'likely_solid';
  }

  // Plain-English rationale — names the strongest + weakest dimension.
  const rationale = buildRationale(live, tier);
  return { tier, rationale };
}

// Identify which dimension a score object represents from its shape.
// Each scorer's output carries a distinct discriminator field, so we
// pattern-match instead of threading a name through every return.
function dimensionName(d) {
  if (!d) return 'dimension';
  if (d.saturation !== undefined || d.matched_topic_name !== undefined) return 'topic';
  if (d.bucket !== undefined) return 'length';
  if (d.day !== undefined) return 'upload slot';
  return 'title pattern stack';
}

function buildRationale(dimensions, tier) {
  // sort by tier desc, then by lift desc when present
  const sorted = [...dimensions].sort((a, b) => {
    const t = TIER_INDEX[b.tier] - TIER_INDEX[a.tier];
    if (t !== 0) return t;
    return (b.lift_pct || b.composite_lift_pct || 0) - (a.lift_pct || a.composite_lift_pct || 0);
  });
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  // Quick descriptors per tier
  const phrase = {
    very_likely_outperform: 'compounds multiple statistical winners',
    likely_solid:           'clears the bar on most dimensions',
    risky:                  'mixed signals — at least one dimension is directional or drag-shaped',
    predicted_under:        'multiple dimensions predict underperformance',
  }[tier];

  return `Composite ${tier.replace(/_/g, ' ')} — ${phrase}. Strongest dimension: ${dimensionName(strongest)} (${strongest.tier}); weakest: ${dimensionName(weakest)} (${weakest.tier}).`;
}

// ──────────────────────────────────────────────────
// Suggested tweaks
// ──────────────────────────────────────────────────

/**
 * Generate up to N suggested tweaks that would move the rating up a tier.
 *
 * Strategy:
 *   - For each dimension below `likely_solid`, find the swap that would
 *     bump it (cadence: nearest statistical-positive cell; title: drop
 *     drags / add a statistical-positive pattern; length: switch to a
 *     higher-lift bucket; topic: switch to a gap topic).
 *   - Sort by projected lift impact.
 *   - Cap to maxTweaks (default 3) — strategist doesn't want a wall.
 *
 * The tweaks are deliberately mechanical; the LLM strategic-read layer
 * adds editorial framing on top.
 */
export function generateTweaks({ scores, cohortContext, maxTweaks = 3 }) {
  const tweaks = [];

  // Title — surface drags first (highest signal "drop this and you gain N%")
  if (scores.title_patterns?.drags?.length) {
    for (const drag of scores.title_patterns.drags) {
      tweaks.push({
        dimension: 'title_patterns',
        suggestion: `Drop "${drag.label.toLowerCase()}" — cohort lift is ${drag.lift_pct}% at ${drag.confidence} confidence (n=${drag.n})`,
        projected_lift_pct: Math.abs(drag.lift_pct),
        priority: Math.abs(drag.lift_pct),
      });
    }
  }

  // Title — suggest adding a statistical-positive pattern the title doesn't have
  if (scores.title_patterns) {
    const matchedIds = new Set([
      ...(scores.title_patterns.matched || []).map(m => m.pattern),
      ...(scores.title_patterns.drags || []).map(d => d.pattern),
    ]);
    const cohortPatterns = cohortContext?.patternsResult?.scope?.titlePatterns || [];
    const candidates = cohortPatterns
      .filter(p => !matchedIds.has(p.id))
      .filter(p => p.viewsLift != null && p.viewsLift >= LIFT_TIER_THRESHOLDS.likely_solid)
      .filter(p => p.confidence === 'statistical')
      .sort((a, b) => b.viewsLift - a.viewsLift);

    // Pick at most ONE "add a pattern" suggestion — adding several in
    // one tweak list reads as spammy advice.
    const top = candidates[0];
    if (top) {
      const liftPct = Math.round((top.viewsLift - 1) * 100);
      tweaks.push({
        dimension: 'title_patterns',
        suggestion: `Add a "${top.label.toLowerCase()}" element — cohort lift +${liftPct}% statistical (n=${top.count})`,
        projected_lift_pct: liftPct,
        priority: liftPct,
      });
    }
  }

  // Slot — if the current slot isn't statistical-positive, suggest the
  // best statistical-positive cell in the heatmap.
  if (scores.slot && scores.slot.tier !== 'very_likely_outperform' && scores.slot.tier !== 'likely_solid') {
    const cadence = cohortContext?.whiteSpaceResult?.cadenceGaps;
    if (cadence?.liftGrid) {
      const candidates = [];
      for (let d = 0; d < 7; d++) {
        for (let b = 0; b < 4; b++) {
          const lift = cadence.liftGrid[d]?.[b];
          const conf = cadence.confidenceGrid[d]?.[b];
          const n = cadence.grid[d]?.[b] || 0;
          if (lift != null && conf === 'statistical' && lift >= LIFT_TIER_THRESHOLDS.likely_solid) {
            candidates.push({
              day: cadence.labels.days[d],
              block: cadence.labels.blocks[b],
              lift,
              n,
            });
          }
        }
      }
      candidates.sort((a, b) => b.lift - a.lift);
      const top = candidates[0];
      if (top) {
        const liftPct = Math.round((top.lift - 1) * 100);
        tweaks.push({
          dimension: 'slot',
          suggestion: `Shift to ${top.day} ${top.block} — cohort lift +${liftPct}% statistical (n=${top.n})`,
          projected_lift_pct: liftPct,
          priority: liftPct,
        });
      }
    }
  }

  // Length (long-form only) — if current bucket is risky/under, suggest
  // the highest-lift bucket in the cohort.
  if (scores.length && scores.length.tier !== 'very_likely_outperform' && scores.length.tier !== 'likely_solid') {
    const buckets = (cohortContext?.whiteSpaceResult?.formatGaps || [])
      .filter(b => !b.id.startsWith('shorts'))
      .filter(b => b.viewsLift != null && b.count >= 10)
      .sort((a, b) => b.viewsLift - a.viewsLift);
    const top = buckets[0];
    if (top && top.id !== scores.length.bucket_id) {
      const liftPct = Math.round((top.viewsLift - 1) * 100);
      tweaks.push({
        dimension: 'length',
        suggestion: `Try ${top.label} — cohort lift +${liftPct}% (n=${top.count})`,
        projected_lift_pct: liftPct,
        priority: liftPct * 0.7,   // length tweaks are heavier production changes; rank slightly lower per-% than title/slot
      });
    }
  }

  // Topic — if saturated, suggest the highest-lift gap.
  if (scores.topic?.saturation === 'saturated') {
    const gaps = (cohortContext?.whiteSpaceResult?.topicCoverage || [])
      .filter(t => t.coverage === 'gap');
    const top = gaps[0];
    if (top) {
      tweaks.push({
        dimension: 'topic',
        suggestion: `Pivot toward "${top.name}" — gap in cohort (only ${top.count} titles touch it)`,
        projected_lift_pct: null,
        priority: 50,   // qualitative pivot, mid-priority
      });
    }
  }

  // Rank + cap
  return tweaks
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, maxTweaks)
    .map(t => {
      const { priority, ...rest } = t;
      return rest;
    });
}

// ──────────────────────────────────────────────────
// Orchestrator
// ──────────────────────────────────────────────────

/**
 * Score a concept end-to-end.
 *
 * @param {Object} args
 * @param {Object} args.input   strategist's concept (see migration 086 header)
 * @param {Object} args.cohortContext
 * @param {Object} args.cohortContext.patternsResult   from patternsService.analyzePatterns
 * @param {Object} args.cohortContext.whiteSpaceResult from whiteSpaceService.analyzeWhiteSpace
 * @returns {Object}  { scores, composite_tier, composite_rationale, suggested_tweaks }
 */
export function scoreConcept({ input, cohortContext }) {
  if (!input) throw new Error('scoreConcept: input is required');
  if (!cohortContext) throw new Error('scoreConcept: cohortContext is required');

  const titlePatterns = scoreTitlePatterns(
    input.title,
    input.format,
    cohortContext.patternsResult,
  );
  const slot = scoreSlot(
    input.planned_day,
    input.planned_hour_block,
    cohortContext.whiteSpaceResult?.cadenceGaps,
  );
  const length = scoreLength(
    input.length_seconds,
    input.format,
    cohortContext.whiteSpaceResult?.formatGaps,
  );
  const topic = scoreTopic(
    input.topic_label,
    cohortContext.whiteSpaceResult?.topicCoverage,
  );

  const scores = {
    title_patterns: titlePatterns,
    slot,
    length,
    topic,
  };

  const { tier: compositeTier, rationale } = composeRating([titlePatterns, slot, length, topic]);
  const tweaks = generateTweaks({ scores, cohortContext });

  return {
    scores,
    composite_tier: compositeTier,
    composite_rationale: rationale,
    suggested_tweaks: tweaks,
  };
}

export default { scoreConcept, scoreTitlePatterns, scoreSlot, scoreLength, scoreTopic, composeRating, generateTweaks, TIERS };
