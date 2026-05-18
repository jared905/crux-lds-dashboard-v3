/**
 * Statistical helpers shared across Research v2 services.
 *
 * The core problem these solve: a single inflated-view outlier (Blink
 * style: 8M views, 0.3% engagement) destroys the median of a small
 * bucket and produces "+1121% lift" headlines that wouldn't survive a
 * significance test. Trimmed median + confidence labels protect against
 * shipping confidently-wrong analysis.
 */

// Sample-size thresholds for "lift means something." Below `direction`
// we hide the number; between `direction` and `statistical` we display
// it with a "directional, not statistical" badge.
export const CONFIDENCE = {
  // Title patterns: per-pattern matched videos. Patterns are
  // structurally repeated so variance is lower than per-slot signals;
  // still raised from 20 to 40 after the audit feedback that "barely
  // past noise floor" was getting a 'statistical' label.
  pattern: { hide: 5, direction: 5, statistical: 40 },
  // Cadence cells: per-slot uploads. High variance — individual videos
  // dominate each cell. Raised 8→30 directly per reviewer guidance.
  cadenceCell: { hide: 3, direction: 3, statistical: 30 },
  // Length buckets: per-bucket videos. Similar variance to cadence.
  formatBucket: { hide: 3, direction: 3, statistical: 30 },
};

export function labelConfidence(n, kind = 'pattern') {
  const t = CONFIDENCE[kind] || CONFIDENCE.pattern;
  if (n < t.hide) return 'insufficient';
  if (n < t.statistical) return 'directional';
  return 'statistical';
}

// Sort utility: keep small-sample rows out of the headline ranking
export function shouldHide(n, kind = 'pattern') {
  return labelConfidence(n, kind) === 'insufficient';
}

export function median(nums) {
  if (!nums?.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Trimmed median — drops the top and bottom `trim` fraction before
 * computing the median. Trim defaults to 10% top/bottom. For very
 * small samples (n<5) trimming is a no-op (falls back to plain median)
 * to avoid eating the whole sample.
 */
export function trimmedMedian(nums, trim = 0.10) {
  if (!nums?.length) return null;
  if (nums.length < 5) return median(nums);
  const sorted = [...nums].sort((a, b) => a - b);
  const dropEachSide = Math.floor(sorted.length * trim);
  const trimmed = sorted.slice(dropEachSide, sorted.length - dropEachSide);
  if (!trimmed.length) return median(sorted);
  const mid = Math.floor(trimmed.length / 2);
  return trimmed.length % 2 === 0 ? (trimmed[mid - 1] + trimmed[mid]) / 2 : trimmed[mid];
}

/**
 * Suspect-engagement test for outliers / breakouts. Two-rail check:
 *   1. Channel-relative: engagement < channel_median * suspectRatio
 *   2. Absolute floor: engagement < 0.005 (0.5%) regardless of channel
 * Either trigger marks the video suspect.
 *
 * Tightened from 0.40 to 0.25 after audit critique — Blink-style channels
 * have category-wide low engagement that the 0.40 threshold let through.
 */
export const SUSPECT_ENGAGEMENT_RATIO = 0.25;
export const SUSPECT_ENGAGEMENT_FLOOR = 0.005;

export function isSuspectEngagement(engagement, channelMedianEngagement) {
  if (engagement == null) return false;
  if (engagement < SUSPECT_ENGAGEMENT_FLOOR) return true;
  if (channelMedianEngagement != null && channelMedianEngagement > 0 &&
      engagement / channelMedianEngagement < SUSPECT_ENGAGEMENT_RATIO) {
    return true;
  }
  return false;
}

/**
 * Brand-push pattern detection. The bought-views signature on
 * manufacturer-brand channels is high view-multiplier + low absolute
 * engagement (Blink "100% Peace of Mind! 🏡✨" — 52× channel median, 0.6%
 * engagement). This is independent of the channel-relative ratio check
 * because brand channels have category-wide low engagement.
 *
 * Returns true when both rails trip: view-multiplier > 20× AND raw
 * engagement < 1%.
 */
export const BRAND_PUSH_MULTIPLIER_THRESHOLD = 20;
export const BRAND_PUSH_ENGAGEMENT_CEILING = 0.01; // 1%

export function isBrandPushSuspect(multiplier, engagement) {
  if (multiplier == null || engagement == null) return false;
  return multiplier > BRAND_PUSH_MULTIPLIER_THRESHOLD && engagement < BRAND_PUSH_ENGAGEMENT_CEILING;
}

/**
 * Outlier-dominance sensitivity check.
 *
 * Given a sample of values and a precomputed median (the lift's
 * numerator), recompute the median with the SINGLE highest-value
 * observation removed. If the new median is dramatically smaller, the
 * original median was outlier-dominated and any lift built on it
 * shouldn't be trusted as statistical.
 *
 * Returns true when removing the top observation drops the median by
 * more than `collapseThreshold` (default 25%). Callers treat that as
 * a downgrade signal — "your sample of 15 has one Blink video doing
 * all the work."
 */
export function isOutlierDominated(values, currentMedian, collapseThreshold = 0.25) {
  if (!values?.length || values.length < 4 || currentMedian == null || currentMedian <= 0) return false;
  const sorted = [...values].sort((a, b) => a - b);
  const trimmed = sorted.slice(0, sorted.length - 1); // drop top
  if (!trimmed.length) return false;
  const mid = Math.floor(trimmed.length / 2);
  const newMedian = trimmed.length % 2 === 0
    ? (trimmed[mid - 1] + trimmed[mid]) / 2
    : trimmed[mid];
  if (newMedian <= 0) return true;
  return (currentMedian - newMedian) / currentMedian > collapseThreshold;
}

/**
 * Combined confidence for a lift: returns 'statistical' only when both
 *   - sample size meets the kind threshold
 *   - removing the top observation doesn't collapse the median
 * Falls back to 'directional' or 'insufficient' otherwise.
 */
export function liftConfidence({ sampleValues, currentMedian, kind = 'pattern' }) {
  const n = sampleValues?.length || 0;
  const base = labelConfidence(n, kind);
  if (base !== 'statistical') return base;
  if (isOutlierDominated(sampleValues, currentMedian)) return 'directional';
  return 'statistical';
}
