/**
 * Metric Translation Constants
 * Full View Analytics - Crux Media
 *
 * Maps technical metric keys to plain-language labels for external reports.
 * Used during diagnostic-to-report pre-population.
 * Team member can edit labels in the report builder, but they should never
 * arrive blank or in technical language.
 *
 * Architected for future promotion to a Supabase table — the structure
 * maps directly to a two-column table (key, label) with no code changes
 * needed beyond swapping the import for a DB query.
 */

const METRIC_TRANSLATIONS = {
  // Channel-level metrics
  subscriber_count: 'Total Subscribers',
  total_view_count: 'Lifetime Views',
  video_count: 'Total Videos Published',
  size_tier: 'Channel Size Tier',

  // Performance metrics
  median_views: 'How a typical video performs',
  avg_views_recent: 'Average views per video (recent)',
  avg_engagement_recent: 'How often viewers take action',
  high_reach_threshold: 'What it takes to break through to a larger audience',
  low_engagement_threshold: 'The point where viewer interest falls below healthy levels',

  // Upload metrics
  recent_videos_90d: 'How often the channel has published recently',
  upload_consistency: 'How predictable the channel is to its audience and to YouTube',
  upload_frequency: 'Videos published per week',

  // Content mix
  content_mix: 'The balance between short-form and long-form content',
  shorts_count: 'Number of short-form videos',
  longform_count: 'Number of long-form videos',
  shorts_ratio: 'Percentage of content that is Shorts',

  // Paid/organic
  paid_video_count: 'Videos distributed through paid media',
  organic_video_count: 'Videos growing through organic reach',
  paid_ratio: 'Percentage of library that is paid content',

  // Engagement
  engagement_rate: 'Engagement rate (likes + comments / views)',
  like_count: 'Total likes',
  comment_count: 'Total comments',

  // Benchmarks
  peer_median_views: 'Peer median views per video',
  peer_median_engagement: 'Peer median engagement rate',
  benchmark_score: 'Overall benchmark score vs peers',
};

/**
 * Get the plain-language label for a metric key.
 * Falls back to a title-cased version of the key if no translation exists.
 */
export function getMetricLabel(key) {
  if (METRIC_TRANSLATIONS[key]) return METRIC_TRANSLATIONS[key];
  // Fallback: convert snake_case to Title Case
  return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Get all translations as an object (for bulk operations).
 */
export function getAllTranslations() {
  return { ...METRIC_TRANSLATIONS };
}

export default METRIC_TRANSLATIONS;
