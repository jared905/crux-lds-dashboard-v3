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
 *
 * ─── Forward compat: Phase 2.5+ dimensions ───
 * Phase 2.5 adds:
 *   - target_surface (Search | Browse | Suggested | ShortsFeed) — concept-form input
 *   - surface_fit — per-surface lift lookup with cross-surface
 *     divergence flagging
 *   - search_keyword_match — does the title's keywords overlap with
 *     non-branded queries that actually pulled cold viewers
 *     (client_search_queries.is_branded = false)
 *
 * Phase 2.6 (queued, per Gemini's framework + our roadmap):
 *   - topic_authority — vector-embedding similarity of the concept
 *     against the channel's top historical performers + the cohort's
 *     recent hits. Flags off-axis concepts the pattern scorer misses
 *     (e.g. a SafeStreets channel proposing "heartwarming dog moments"
 *     scores fine on title patterns alone but is off the channel's
 *     topical neighborhood entirely).
 *   - curiosity_gap — LLM-rated 1–10 on whether the title leaves an
 *     open loop vs. fully resolves. Pattern regexes can't see this.
 *   - hook_promise_delivery — optional strategist hook-beat input
 *     (1–2 sentences describing first 15s); scorer checks whether the
 *     title's promise / keyword appears. Catches title-promises-X-
 *     but-hook-opens-with-Y, the most common production failure.
 *
 * Phase 3 (thumbnail CV):
 *   - thumbnail_visual — face count / emotion / OCR text overlay
 *   - title_thumbnail_divergence — semantic match between thumbnail
 *     and title. Identical → redundant. Wildly unrelated → misleading.
 *     Sweet spot is productive tension on the same promise.
 *
 * Each new dimension follows the existing contract: returns either a
 * typed score object with a `tier` field or null (excluded from
 * composite). composeRating() doesn't need to change — it already
 * handles arbitrary-length dimension lists.
 */

import { TITLE_PATTERNS } from './patternsService';
import { TARGET_SURFACES } from './surfaceIntelligenceService';
import { findTopMatches } from './topicAuthorityService';

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
// 5. Surface fit (Phase 2.5)
// ──────────────────────────────────────────────────

/**
 * Score the concept against the channel's actual per-surface
 * performance. The strategist picks a target surface (Search,
 * Browse, Suggested, ShortsFeed) and we look at what share of the
 * client's existing views actually came from that surface.
 *
 * Why share-of-views (not lift): YouTube Analytics is OAuth-locked
 * to owned channels, so we don't have surface data on the competitive
 * cohort to compute a lift against. What we DO have is the client's
 * own surface profile — and if a channel currently gets 91% of its
 * views from Suggested, targeting Search is swimming upstream
 * regardless of how good the keywords are.
 *
 * Tier from share:
 *   ≥40% → very_likely_outperform (target is the channel's home surface)
 *   20–40% → likely_solid
 *   5–20% → risky (small but non-trivial track record)
 *   <5% → predicted_under (no evidence this surface works for this channel)
 *
 * Divergence warning fires when target ≠ dominant AND the dominant
 * has ≥40% share — surfaces the same friction the cross-surface
 * divergence callout in the UI will render.
 *
 * Returns null when no target surface picked or no surface data
 * available — the dimension is excluded from the composite rather
 * than degrading it.
 */
export function scoreSurfaceFit(targetSurface, surfaceContext) {
  if (!targetSurface || !surfaceContext?.surface_mix?.length) return null;
  if (!TARGET_SURFACES.includes(targetSurface)) return null;

  const targetEntry = surfaceContext.surface_mix.find(s => s.bucket === targetSurface);
  const sharePct = targetEntry?.sharePct ?? 0;
  const targetViews = targetEntry?.views ?? 0;

  let tier;
  if (sharePct >= 40)      tier = 'very_likely_outperform';
  else if (sharePct >= 20) tier = 'likely_solid';
  else if (sharePct >= 5)  tier = 'risky';
  else                     tier = 'predicted_under';

  const isDominant = surfaceContext.dominant_surface === targetSurface;
  const dominantShare = surfaceContext.dominant_share_pct || 0;
  const divergenceWarning = (!isDominant && dominantShare >= 40)
    ? `Channel's home surface is ${surfaceContext.dominant_surface} (${dominantShare}%). Targeting ${targetSurface} (${sharePct}%) means swimming against the channel's existing algorithmic profile.`
    : null;

  return {
    target_surface: targetSurface,
    surface_share_pct: sharePct,
    target_views: targetViews,
    dominant_surface: surfaceContext.dominant_surface,
    dominant_share_pct: dominantShare,
    is_dominant: isDominant,
    n_videos: surfaceContext.n_videos,
    surface_mix: surfaceContext.surface_mix,
    divergence_warning: divergenceWarning,
    tier,
  };
}

// ──────────────────────────────────────────────────
// 6. Search keyword match (Phase 2.5)
// ──────────────────────────────────────────────────

// Conservative English stop-word list. Tokens shorter than 3 chars
// are also dropped (handled in the tokenizer below).
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by',
  'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me', 'my', 'of',
  'on', 'or', 'so', 'than', 'that', 'the', 'their', 'them', 'these',
  'they', 'this', 'those', 'to', 'us', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'why', 'will', 'with', 'would', 'you',
  'your',
]);

function tokenizeForKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')   // drop punctuation
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * Score how well the proposed title's keywords match the search
 * queries that have ACTUALLY pulled cold viewers to this channel.
 *
 * Uses the unbranded subset of client_search_queries (branded queries
 * are excluded at ingest time — they reflect audience that already
 * knew the brand, not keywords that pull discovery).
 *
 * Returns null when the channel has no unbranded search queries —
 * common for Suggested-dominant channels like 210 Financial. The
 * dimension is then excluded from the composite rather than scored
 * as "predicted under" (the channel doesn't get search traffic; we
 * don't have evidence for the title's keywords either way).
 *
 * Tier from match % of top-20 unbranded queries that share ≥1 token
 * with the title:
 *   ≥50% → very_likely_outperform
 *   25–50% → likely_solid
 *   10–25% → risky
 *   <10% → predicted_under
 */
export function scoreSearchKeywordMatch(title, searchQueries) {
  if (!title) return null;
  const unbranded = (searchQueries?.unbranded || []).slice(0, 20);
  if (!unbranded.length) return null;

  const titleTokens = new Set(tokenizeForKeywords(title));
  if (!titleTokens.size) return null;

  const matched = [];
  for (const q of unbranded) {
    const qTokens = tokenizeForKeywords(q.query);
    const overlap = qTokens.filter(t => titleTokens.has(t));
    if (overlap.length > 0) {
      matched.push({
        query: q.query,
        views: q.views,
        matched_tokens: [...new Set(overlap)],
      });
    }
  }

  const matchPct = Math.round((matched.length / unbranded.length) * 100);

  let tier;
  if (matchPct >= 50)      tier = 'very_likely_outperform';
  else if (matchPct >= 25) tier = 'likely_solid';
  else if (matchPct >= 10) tier = 'risky';
  else                     tier = 'predicted_under';

  return {
    title_tokens: [...titleTokens],
    total_unbranded_queries: unbranded.length,
    matched_count: matched.length,
    match_pct: matchPct,
    top_matches: matched.slice(0, 5),
    tier,
  };
}

// ──────────────────────────────────────────────────
// 7. Curiosity gap (Phase 2.6 — step 1)
// ──────────────────────────────────────────────────

/**
 * Tier a title's curiosity-gap score (1–10) into the standard tier
 * vocabulary. Doesn't call the LLM itself — the orchestrator awaits
 * curiosityGapService.rateCuriosityGap() before this runs, then
 * passes the result here.
 *
 * Mapping:
 *   9–10 → very_likely_outperform (sharp open loop, implied payoff)
 *   7–8  → likely_solid (clear curiosity hook)
 *   4–6  → risky (mild hook, mostly descriptive)
 *   1–3  → predicted_under (fully self-resolving / generic)
 *
 * Returns null when no curiosity result available — the dimension
 * excludes itself from the composite per the established contract.
 */
export function scoreCuriosityGap(curiosityResult) {
  if (!curiosityResult || curiosityResult.score == null) return null;
  const score = Math.round(Number(curiosityResult.score));
  if (!Number.isFinite(score)) return null;

  let tier;
  if (score >= 9)      tier = 'very_likely_outperform';
  else if (score >= 7) tier = 'likely_solid';
  else if (score >= 4) tier = 'risky';
  else                 tier = 'predicted_under';

  return {
    curiosity_score: score,                // 1–10
    rationale: curiosityResult.rationale || null,
    prompt_version: curiosityResult.promptVersion || null,
    cached: !!curiosityResult.cached,
    tier,
  };
}

// ──────────────────────────────────────────────────
// 8. Hook promise delivery (Phase 2.6 — step 2)
// ──────────────────────────────────────────────────

/**
 * Tier a hook-delivery score (1–10) into the standard tier vocabulary.
 *
 * Mapping (mirrors curiosity_gap):
 *   9–10 → very_likely_outperform (hook directly delivers the title's promise)
 *   7–8  → likely_solid (clear alignment, no detour)
 *   4–6  → risky (same topic, different angle)
 *   1–3  → predicted_under (off-promise hook; click is wasted)
 *
 * Returns null when no hook result available — the dimension self-
 * excludes (strategist hasn't entered a hook beat yet).
 */
export function scoreHookPromiseDelivery(hookResult) {
  if (!hookResult || hookResult.score == null) return null;
  const score = Math.round(Number(hookResult.score));
  if (!Number.isFinite(score)) return null;

  let tier;
  if (score >= 9)      tier = 'very_likely_outperform';
  else if (score >= 7) tier = 'likely_solid';
  else if (score >= 4) tier = 'risky';
  else                 tier = 'predicted_under';

  return {
    hook_score: score,
    rationale: hookResult.rationale || null,
    prompt_version: hookResult.promptVersion || null,
    cached: !!hookResult.cached,
    tier,
  };
}

// ──────────────────────────────────────────────────
// 9. Topic authority (Phase 2.6 — step 3)
// ──────────────────────────────────────────────────

/**
 * Score the concept's semantic fit against (a) the channel's own
 * historical hits and (b) the cohort's recent winners. Max similarity
 * across both corpora drives the tier.
 *
 * Threshold rationale (text-embedding-3-small on titles typically
 * produces similarities in 0.30–0.70 for "related" content):
 *   ≥0.55 → very_likely_outperform (close neighbor in either corpus)
 *   0.40–0.55 → likely_solid (decent neighbor)
 *   0.25–0.40 → risky (loose neighbor — concept exists in adjacent
 *               space but not strongly aligned)
 *   <0.25 → predicted_under (off-axis — no real neighbor either side)
 *
 * Returns null when no concept embedding OR both corpora are empty —
 * the dimension self-excludes per contract. The most common reason
 * for null is "backfill not run yet"; UI surfaces this via the
 * EmbeddingsBackfillPanel.
 */
export function scoreTopicAuthority(conceptEmbedding, topicAuthorityContext) {
  if (!conceptEmbedding || !topicAuthorityContext) return null;
  const historical = topicAuthorityContext.historicalHits || [];
  const cohort = topicAuthorityContext.cohortRecentHits || [];
  if (!historical.length && !cohort.length) return null;

  const channelMatches = findTopMatches(conceptEmbedding, historical, 5);
  const cohortMatches  = findTopMatches(conceptEmbedding, cohort, 5);

  const channelMax = channelMatches[0]?.similarity ?? null;
  const cohortMax  = cohortMatches[0]?.similarity ?? null;
  const maxSim = Math.max(channelMax ?? 0, cohortMax ?? 0);

  let tier;
  if (maxSim >= 0.55)      tier = 'very_likely_outperform';
  else if (maxSim >= 0.40) tier = 'likely_solid';
  else if (maxSim >= 0.25) tier = 'risky';
  else                     tier = 'predicted_under';

  // Identify the dominant signal source so the UI can render
  // "closest neighbor: <video> on YOUR channel" vs "in the cohort".
  const dominantSource =
    channelMax != null && (cohortMax == null || channelMax >= cohortMax)
      ? 'channel' : 'cohort';

  // Compact match summaries — strip the embedding column to keep the
  // payload small (the score row gets persisted via JSON and we don't
  // need 1536 floats in there).
  const compact = (m) => ({
    title: m.video.title,
    similarity: Math.round(m.similarity * 1000) / 1000,
    youtube_video_id: m.video.youtube_video_id || null,
    view_count: m.video.view_count || null,
  });

  return {
    topic_max_similarity: Math.round(maxSim * 1000) / 1000,
    channel_max_similarity: channelMax != null ? Math.round(channelMax * 1000) / 1000 : null,
    cohort_max_similarity:  cohortMax  != null ? Math.round(cohortMax * 1000) / 1000  : null,
    channel_corpus_size: historical.length,
    cohort_corpus_size:  cohort.length,
    dominant_source: dominantSource,
    top_channel_matches: channelMatches.map(compact),
    top_cohort_matches:  cohortMatches.map(compact),
    tier,
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
  if (d.target_surface !== undefined) return 'surface fit';
  if (d.match_pct !== undefined && d.total_unbranded_queries !== undefined) return 'search keyword match';
  if (d.curiosity_score !== undefined) return 'curiosity gap';
  if (d.hook_score !== undefined) return 'hook promise delivery';
  if (d.topic_max_similarity !== undefined) return 'topic authority';
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
export function generateTweaks({ input, scores, cohortContext, maxTweaks = 3 }) {
  const tweaks = [];
  const plannedFormat = input?.format;

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

  // Title — suggest adding a statistical-positive pattern the title doesn't have.
  //
  // CRITICAL: filter by format-skew the same way scoreTitlePatterns does
  // when it flags incoming patterns. The cohort's emoji lift is +150%
  // statistical, but 99% of the n=175 titles in that bucket are Shorts —
  // the lift is a format artifact, not a portable title lever. Suggesting
  // "add emoji" to a long-form concept would be actively misleading
  // (which is exactly what happened pre-fix).
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
      // Format-skew filter — exclude patterns whose cohort representation
      // is heavily one-sided AGAINST the planned format. A pattern that
      // exists 99% in Shorts has no evidence it works on long-form (and
      // vice versa), so suggesting it would lie about transferable lift.
      .filter(p => {
        if (p.shortsShare == null) return true;
        if (plannedFormat === 'long_form' && p.shortsShare >= SHORTS_SKEW_THRESHOLD) return false;
        if (plannedFormat === 'shorts'    && p.shortsShare <= LONGFORM_SKEW_THRESHOLD) return false;
        return true;
      })
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
 * @param {Object} args.input   strategist's concept (see migration 086 header).
 *   Phase 2.5 adds: input.target_surface — one of TARGET_SURFACES from
 *   surfaceIntelligenceService. Optional; when absent, surface_fit is
 *   excluded from the composite.
 * @param {Object} args.cohortContext
 * @param {Object} args.cohortContext.patternsResult   from patternsService.analyzePatterns
 * @param {Object} args.cohortContext.whiteSpaceResult from whiteSpaceService.analyzeWhiteSpace
 * @param {Object} [args.cohortContext.surfaceContext] from surfaceIntelligenceService.loadSurfaceContext.
 *   Phase 2.5 — drives surface_fit + search_keyword_match dimensions.
 *   Optional; when absent, those dimensions return null and are excluded.
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

  // Phase 2.5 dimensions — both return null when their data isn't
  // available (no target surface picked, no surface snapshot loaded,
  // no unbranded queries on this channel). Null dimensions are
  // excluded from the composite per the established contract.
  const surfaceFit = scoreSurfaceFit(
    input.target_surface,
    cohortContext.surfaceContext,
  );
  const searchKeywordMatch = scoreSearchKeywordMatch(
    input.title,
    cohortContext.surfaceContext?.search_queries,
  );

  // Phase 2.6 — curiosity gap + hook promise delivery + topic authority.
  // Orchestrator computes the async pieces via curiosityGapService /
  // hookPromiseDeliveryService / topicAuthorityService and passes the
  // results through cohortContext. Null results → dimensions self-exclude.
  const curiosityGap = scoreCuriosityGap(cohortContext.curiosityResult);
  const hookPromiseDelivery = scoreHookPromiseDelivery(cohortContext.hookResult);
  const topicAuthority = scoreTopicAuthority(
    cohortContext.conceptEmbedding,
    cohortContext.topicAuthorityContext,
  );

  const scores = {
    title_patterns: titlePatterns,
    slot,
    length,
    topic,
    surface_fit: surfaceFit,
    search_keyword_match: searchKeywordMatch,
    curiosity_gap: curiosityGap,
    hook_promise_delivery: hookPromiseDelivery,
    topic_authority: topicAuthority,
  };

  const { tier: compositeTier, rationale } = composeRating([
    titlePatterns, slot, length, topic, surfaceFit, searchKeywordMatch,
    curiosityGap, hookPromiseDelivery, topicAuthority,
  ]);
  // Pass input so tweak generator can apply format-aware filters
  // (e.g. don't suggest "add emoji" to a long-form concept when the
  // cohort's emoji pattern is 99% Shorts).
  const tweaks = generateTweaks({ input, scores, cohortContext });

  return {
    scores,
    composite_tier: compositeTier,
    composite_rationale: rationale,
    suggested_tweaks: tweaks,
  };
}

export default {
  scoreConcept,
  scoreTitlePatterns, scoreSlot, scoreLength, scoreTopic,
  scoreSurfaceFit, scoreSearchKeywordMatch,
  scoreCuriosityGap, scoreHookPromiseDelivery,
  scoreTopicAuthority,
  composeRating, generateTweaks, TIERS,
};
