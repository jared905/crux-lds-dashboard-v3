/**
 * Video Categorization Service
 * Analyzes videos to flag High Reach and Low Engagement patterns.
 * Used in audits to surface videos worth investigating.
 */

/**
 * Calculate median of an array of numbers.
 */
function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate engagement rate for a video.
 */
function getEngagementRate(video) {
  const views = Math.max(video.view_count || 1, 1);
  return ((video.like_count || 0) + (video.comment_count || 0)) / views;
}

/**
 * Categorize videos based on channel baselines.
 *
 * @param {Array} videos - Array of video objects from database
 * @param {Object} opts - Configuration options
 * @param {number} opts.highReachThreshold - Multiplier for views to be "High Reach" (default: 1.5)
 * @param {number} opts.lowEngagementThreshold - Multiplier for engagement to be "Low Engagement" (default: 0.6)
 * @returns {Object} Categorization results
 */
export function categorizeVideos(videos, opts = {}) {
  const {
    highReachThreshold = 1.5,
    lowEngagementThreshold = 0.6,
  } = opts;

  if (!videos || videos.length === 0) {
    return {
      baselines: { medianViews: 0, medianEngagement: 0 },
      categorized: [],
      highReachVideos: [],
      lowEngagementVideos: [],
      investigateVideos: [],
      summary: {
        totalVideos: 0,
        highReachCount: 0,
        lowEngagementCount: 0,
        investigateCount: 0,
      },
    };
  }

  // Calculate baselines
  const viewCounts = videos.map(v => v.view_count || 0).filter(v => v > 0);
  const engagementRates = videos.map(v => getEngagementRate(v)).filter(e => e > 0);

  const medianViews = median(viewCounts);
  const medianEngagement = median(engagementRates);

  // Thresholds
  const highReachMinViews = medianViews * highReachThreshold;
  const lowEngagementMaxRate = medianEngagement * lowEngagementThreshold;

  // Categorize each video
  const categorized = videos.map(video => {
    const views = video.view_count || 0;
    const engagement = getEngagementRate(video);

    const isHighReach = views > highReachMinViews;
    const isLowEngagement = engagement < lowEngagementMaxRate && views > 0;

    // Calculate how far from baseline
    const viewsRatio = medianViews > 0 ? views / medianViews : 0;
    const engagementRatio = medianEngagement > 0 ? engagement / medianEngagement : 0;

    return {
      ...video,
      engagement_rate: engagement,
      views_ratio: Math.round(viewsRatio * 100) / 100,
      engagement_ratio: Math.round(engagementRatio * 100) / 100,
      is_high_reach: isHighReach,
      is_low_engagement: isLowEngagement,
      flags: [
        isHighReach ? 'high_reach' : null,
        isLowEngagement ? 'low_engagement' : null,
      ].filter(Boolean),
    };
  });

  // Filter into categories
  const highReachVideos = categorized
    .filter(v => v.is_high_reach)
    .sort((a, b) => b.view_count - a.view_count);

  const lowEngagementVideos = categorized
    .filter(v => v.is_low_engagement)
    .sort((a, b) => a.engagement_ratio - b.engagement_ratio);

  // Videos that are BOTH high reach AND low engagement - the investigation candidates
  const investigateVideos = categorized
    .filter(v => v.is_high_reach && v.is_low_engagement)
    .sort((a, b) => b.view_count - a.view_count);

  // Generate conversation prompts for investigate videos
  const investigateWithPrompts = investigateVideos.map(video => {
    const viewsMultiple = video.views_ratio.toFixed(1);
    const engagementPct = ((1 - video.engagement_ratio) * 100).toFixed(0);

    return {
      ...video,
      conversation_prompt: `"${video.title}" reached ${viewsMultiple}x your typical views but engagement was ${engagementPct}% below your baseline. What drove the distribution on this one?`,
    };
  });

  return {
    baselines: {
      medianViews: Math.round(medianViews),
      medianEngagement: medianEngagement,
      highReachThreshold: highReachMinViews,
      lowEngagementThreshold: lowEngagementMaxRate,
    },
    categorized,
    highReachVideos,
    lowEngagementVideos,
    investigateVideos: investigateWithPrompts,
    summary: {
      totalVideos: videos.length,
      highReachCount: highReachVideos.length,
      lowEngagementCount: lowEngagementVideos.length,
      investigateCount: investigateVideos.length,
    },
  };
}

/**
 * Generate scatter plot data for visualization.
 * Returns data points with x (views, log scale friendly) and y (engagement rate).
 */
export function getScatterPlotData(categorized) {
  return categorized.map(video => ({
    id: video.id || video.youtube_video_id,
    title: video.title,
    x: video.view_count || 0,
    y: video.engagement_rate * 100, // Convert to percentage for display
    isHighReach: video.is_high_reach,
    isLowEngagement: video.is_low_engagement,
    isInvestigate: video.is_high_reach && video.is_low_engagement,
    thumbnail: video.thumbnail_url,
  }));
}

/**
 * Get quadrant breakdown for summary stats.
 */
export function getQuadrantBreakdown(categorized) {
  const highReachHighEngagement = categorized.filter(
    v => v.is_high_reach && !v.is_low_engagement
  );
  const highReachLowEngagement = categorized.filter(
    v => v.is_high_reach && v.is_low_engagement
  );
  const normalReachHighEngagement = categorized.filter(
    v => !v.is_high_reach && !v.is_low_engagement
  );
  const normalReachLowEngagement = categorized.filter(
    v => !v.is_high_reach && v.is_low_engagement
  );

  return {
    topRight: {
      label: 'Breakout Hits',
      description: 'High reach + high engagement',
      count: highReachHighEngagement.length,
      color: '#22c55e',
      videos: highReachHighEngagement.slice(0, 5),
    },
    topLeft: {
      label: 'Hidden Gems',
      description: 'Normal reach + high engagement',
      count: normalReachHighEngagement.length,
      color: '#3b82f6',
      videos: normalReachHighEngagement.slice(0, 5),
    },
    bottomRight: {
      label: 'Investigate',
      description: 'High reach + low engagement',
      count: highReachLowEngagement.length,
      color: '#f59e0b',
      videos: highReachLowEngagement.slice(0, 5),
    },
    bottomLeft: {
      label: 'Underperformers',
      description: 'Normal reach + low engagement',
      count: normalReachLowEngagement.length,
      color: '#ef4444',
      videos: normalReachLowEngagement.slice(0, 5),
    },
  };
}
