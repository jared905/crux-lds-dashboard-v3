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
  // Title patterns: per-pattern matched videos
  pattern: { hide: 5, direction: 5, statistical: 20 },
  // Cadence cells: per-slot uploads
  cadenceCell: { hide: 3, direction: 3, statistical: 8 },
  // Length buckets: per-bucket videos
  formatBucket: { hide: 3, direction: 3, statistical: 8 },
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
