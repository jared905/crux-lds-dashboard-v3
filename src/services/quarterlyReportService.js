/**
 * Quarterly Report Service
 * Full View Analytics - Crux Media
 *
 * Generates quarterly comparison data for client channels.
 * Compares current quarter vs previous quarter metrics.
 */

import { supabase } from './supabaseClient';

/**
 * Get quarter date boundaries
 */
export function getQuarterDates(year, quarter) {
  const starts = { 1: '01-01', 2: '04-01', 3: '07-01', 4: '10-01' };
  const ends = { 1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31' };
  return {
    start: `${year}-${starts[quarter]}`,
    end: `${year}-${ends[quarter]}`,
    label: `Q${quarter} ${year}`,
  };
}

/**
 * Get the previous quarter
 */
export function getPreviousQuarter(year, quarter) {
  if (quarter === 1) return { year: year - 1, quarter: 4 };
  return { year, quarter: quarter - 1 };
}

/**
 * Get current quarter info
 */
export function getCurrentQuarter() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const quarter = Math.floor(month / 3) + 1;
  return { year: now.getFullYear(), quarter };
}

/**
 * Fetch video performance data for a date range
 */
async function fetchVideoDataForPeriod(channelId, startDate, endDate) {
  if (!supabase) throw new Error('Supabase not configured');

  // Get videos published in this period
  const { data: videos, error } = await supabase
    .from('videos')
    .select('*')
    .eq('channel_id', channelId)
    .gte('published_at', `${startDate}T00:00:00`)
    .lte('published_at', `${endDate}T23:59:59`)
    .order('published_at', { ascending: false });

  if (error) throw error;
  return videos || [];
}

/**
 * Fetch aggregate snapshots for a period (daily analytics)
 */
async function fetchSnapshotsForPeriod(channelId, startDate, endDate) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: snapshots, error } = await supabase
    .from('video_snapshots')
    .select('video_id, snapshot_date, view_count, watch_hours, avg_view_percentage, subscribers_gained, impressions, ctr')
    .eq('channel_id', channelId)
    .gte('snapshot_date', startDate)
    .lte('snapshot_date', endDate);

  // Snapshots may not have channel_id — get via video join
  if (error || !snapshots?.length) {
    // Try joining through videos table
    const { data: videoIds } = await supabase
      .from('videos')
      .select('id')
      .eq('channel_id', channelId);

    if (videoIds?.length) {
      const ids = videoIds.map(v => v.id);
      const { data: snaps2 } = await supabase
        .from('video_snapshots')
        .select('video_id, snapshot_date, view_count, watch_hours, avg_view_percentage, subscribers_gained, impressions, ctr')
        .in('video_id', ids)
        .gte('snapshot_date', startDate)
        .lte('snapshot_date', endDate);
      return snaps2 || [];
    }
  }

  return snapshots || [];
}

/**
 * Compute quarter metrics from video data
 */
function computeQuarterMetrics(videos, snapshots, channelCount = 1) {
  const totalVideos = videos.length;
  const shorts = videos.filter(v => v.video_type === 'short' || (v.duration_seconds && v.duration_seconds <= 60));
  const longs = videos.filter(v => v.video_type === 'long' || (!v.video_type && (!v.duration_seconds || v.duration_seconds > 60)));

  // Cumulative views from video records
  const totalViews = videos.reduce((s, v) => s + (v.view_count || 0), 0);
  const totalLikes = videos.reduce((s, v) => s + (v.like_count || 0), 0);
  const totalComments = videos.reduce((s, v) => s + (v.comment_count || 0), 0);
  const avgViews = totalVideos > 0 ? totalViews / totalVideos : 0;
  const engagementRate = totalViews > 0 ? (totalLikes + totalComments) / totalViews : 0;

  // Format-split avg views
  const shortsViews = shorts.reduce((s, v) => s + (v.view_count || 0), 0);
  const longsViews = longs.reduce((s, v) => s + (v.view_count || 0), 0);
  const shortsAvgViews = shorts.length > 0 ? shortsViews / shorts.length : 0;
  const longsAvgViews = longs.length > 0 ? longsViews / longs.length : 0;

  // From snapshots (daily analytics)
  const totalWatchHours = snapshots.reduce((s, snap) => s + (snap.watch_hours || 0), 0);
  const totalImpressions = snapshots.reduce((s, snap) => s + (snap.impressions || 0), 0);
  const totalSubsGained = snapshots.reduce((s, snap) => s + (snap.subscribers_gained || 0), 0);

  // Build video ID sets for format-split retention
  const shortVideoIds = new Set(shorts.map(v => v.id));
  const longVideoIds = new Set(longs.map(v => v.id));

  // Average retention from snapshots (blended)
  const retentionVals = snapshots.filter(s => s.avg_view_percentage > 0).map(s => s.avg_view_percentage);
  const avgRetention = retentionVals.length > 0 ? retentionVals.reduce((s, v) => s + v, 0) / retentionVals.length : 0;

  // Format-split retention
  const shortsRetentionVals = snapshots.filter(s => s.avg_view_percentage > 0 && shortVideoIds.has(s.video_id)).map(s => s.avg_view_percentage);
  const longsRetentionVals = snapshots.filter(s => s.avg_view_percentage > 0 && longVideoIds.has(s.video_id)).map(s => s.avg_view_percentage);
  const shortsAvgRetention = shortsRetentionVals.length > 0 ? shortsRetentionVals.reduce((s, v) => s + v, 0) / shortsRetentionVals.length : 0;
  const longsAvgRetention = longsRetentionVals.length > 0 ? longsRetentionVals.reduce((s, v) => s + v, 0) / longsRetentionVals.length : 0;

  // Average CTR from snapshots
  const ctrVals = snapshots.filter(s => s.ctr > 0).map(s => s.ctr);
  const avgCTR = ctrVals.length > 0 ? ctrVals.reduce((s, v) => s + v, 0) / ctrVals.length : 0;

  // Upload frequency (videos per week)
  const uploadFrequency = totalVideos / 13; // 13 weeks in a quarter
  const uploadsPerChannel = channelCount > 0 ? totalVideos / channelCount / 13 : uploadFrequency;

  // Subscriber conversion rate
  const subConversionRate = totalViews > 0 ? totalSubsGained / totalViews : 0;

  // Top videos
  const topByViews = [...videos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 5);
  const topByEngagement = [...videos]
    .map(v => ({
      ...v,
      engRate: v.view_count > 0 ? ((v.like_count || 0) + (v.comment_count || 0)) / v.view_count : 0,
    }))
    .sort((a, b) => b.engRate - a.engRate)
    .slice(0, 5);

  return {
    totalVideos,
    shortsCount: shorts.length,
    longsCount: longs.length,
    totalViews,
    avgViews,
    shortsAvgViews,
    longsAvgViews,
    totalLikes,
    totalComments,
    engagementRate,
    totalWatchHours,
    totalImpressions,
    totalSubsGained,
    avgRetention,
    shortsAvgRetention,
    longsAvgRetention,
    avgCTR,
    uploadFrequency,
    uploadsPerChannel,
    subConversionRate,
    topByViews,
    topByEngagement,
  };
}

/**
 * Compute delta between two quarters
 */
function computeDeltas(current, previous) {
  const delta = (curr, prev) => {
    if (!prev || prev === 0) return { value: curr, change: null, pct: null };
    const change = curr - prev;
    const pct = (change / prev) * 100;
    return { value: curr, change, pct };
  };

  return {
    totalVideos: delta(current.totalVideos, previous.totalVideos),
    totalViews: delta(current.totalViews, previous.totalViews),
    avgViews: delta(current.avgViews, previous.avgViews),
    shortsAvgViews: delta(current.shortsAvgViews, previous.shortsAvgViews),
    longsAvgViews: delta(current.longsAvgViews, previous.longsAvgViews),
    engagementRate: delta(current.engagementRate, previous.engagementRate),
    totalWatchHours: delta(current.totalWatchHours, previous.totalWatchHours),
    totalImpressions: delta(current.totalImpressions, previous.totalImpressions),
    totalSubsGained: delta(current.totalSubsGained, previous.totalSubsGained),
    avgRetention: delta(current.avgRetention, previous.avgRetention),
    shortsAvgRetention: delta(current.shortsAvgRetention, previous.shortsAvgRetention),
    longsAvgRetention: delta(current.longsAvgRetention, previous.longsAvgRetention),
    avgCTR: delta(current.avgCTR, previous.avgCTR),
    uploadFrequency: delta(current.uploadFrequency, previous.uploadFrequency),
    uploadsPerChannel: delta(current.uploadsPerChannel, previous.uploadsPerChannel),
    subConversionRate: delta(current.subConversionRate, previous.subConversionRate),
  };
}

/**
 * Get all channel IDs for a client (including network members)
 */
async function getAllChannelIds(channelId) {
  if (!supabase) return [channelId];

  // Check if this channel has network members
  const { data: members } = await supabase
    .from('channels')
    .select('id')
    .eq('network_id', channelId);

  const ids = [channelId];
  if (members?.length > 0) {
    ids.push(...members.map(m => m.id));
  }
  return ids;
}

/**
 * Generate full quarterly report data
 * @param {string} channelId - Primary channel ID
 * @param {number} year
 * @param {number} quarter
 * @param {string[]} [explicitChannelIds] - If provided, use these IDs instead of auto-detecting network members
 */
export async function generateQuarterlyReport(channelId, year, quarter, explicitChannelIds) {
  const current = getQuarterDates(year, quarter);
  const prev = getPreviousQuarter(year, quarter);
  const previous = getQuarterDates(prev.year, prev.quarter);

  // Use explicit channel IDs if provided (from activeClient.networkMembers), otherwise auto-detect
  const allChannelIds = explicitChannelIds?.length > 0 ? explicitChannelIds : await getAllChannelIds(channelId);

  // Fetch data for both quarters across ALL channels
  const [currentVideos, previousVideos, currentSnapshots, previousSnapshots] = await Promise.all([
    Promise.all(allChannelIds.map(id => fetchVideoDataForPeriod(id, current.start, current.end))).then(a => a.flat()),
    Promise.all(allChannelIds.map(id => fetchVideoDataForPeriod(id, previous.start, previous.end))).then(a => a.flat()),
    Promise.all(allChannelIds.map(id => fetchSnapshotsForPeriod(id, current.start, current.end))).then(a => a.flat()),
    Promise.all(allChannelIds.map(id => fetchSnapshotsForPeriod(id, previous.start, previous.end))).then(a => a.flat()),
  ]);

  const currentMetrics = computeQuarterMetrics(currentVideos, currentSnapshots, allChannelIds.length);
  const previousMetrics = computeQuarterMetrics(previousVideos, previousSnapshots, allChannelIds.length);
  const deltas = computeDeltas(currentMetrics, previousMetrics);

  // Get channel info
  const { data: channelData } = await supabase
    .from('channels')
    .select('name, thumbnail_url, subscriber_count, youtube_channel_id')
    .eq('id', channelId)
    .single();

  return {
    channel: channelData,
    channelCount: allChannelIds.length,
    currentQuarter: { ...current, metrics: currentMetrics },
    previousQuarter: { ...previous, metrics: previousMetrics },
    deltas,
    hasSnapshotData: currentSnapshots.length > 0,
    hasPreviousData: previousVideos.length > 0,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate Claude narrative for quarterly report
 */
export async function generateQuarterlyNarrative(reportData) {
  try {
    const claudeAPI = (await import('./claudeAPI')).default;
    const { channel, currentQuarter, previousQuarter, deltas } = reportData;

    const fmt = (n) => {
      if (!n || isNaN(n)) return '0';
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
      return Math.round(n).toLocaleString();
    };

    const prompt = `Generate a quarterly YouTube performance report narrative for ${channel?.name || 'this channel'}.

## ${currentQuarter.label} Performance
- Videos published: ${currentQuarter.metrics.totalVideos} (${currentQuarter.metrics.shortsCount} shorts, ${currentQuarter.metrics.longsCount} long-form)
- Total views: ${fmt(currentQuarter.metrics.totalViews)}
- Average views per video: ${fmt(currentQuarter.metrics.avgViews)}
- Watch hours: ${fmt(currentQuarter.metrics.totalWatchHours)}
- Subscribers gained: ${fmt(currentQuarter.metrics.totalSubsGained)}
- Engagement rate: ${(currentQuarter.metrics.engagementRate * 100).toFixed(2)}%
- Upload frequency: ${currentQuarter.metrics.uploadFrequency.toFixed(1)} videos/week

## ${previousQuarter.label} Comparison
- Videos: ${previousQuarter.metrics.totalVideos} → ${currentQuarter.metrics.totalVideos} (${deltas.totalVideos.pct?.toFixed(0) || 'N/A'}%)
- Views: ${fmt(previousQuarter.metrics.totalViews)} → ${fmt(currentQuarter.metrics.totalViews)} (${deltas.totalViews.pct?.toFixed(0) || 'N/A'}%)
- Avg views: ${fmt(previousQuarter.metrics.avgViews)} → ${fmt(currentQuarter.metrics.avgViews)} (${deltas.avgViews.pct?.toFixed(0) || 'N/A'}%)
- Watch hours: ${fmt(previousQuarter.metrics.totalWatchHours)} → ${fmt(currentQuarter.metrics.totalWatchHours)}

## Top Videos This Quarter
${currentQuarter.metrics.topByViews.slice(0, 5).map((v, i) => `${i + 1}. "${v.title}" — ${fmt(v.view_count)} views`).join('\n')}

Generate the following sections. Return ONLY valid JSON:
{
  "executive_summary": "3-4 sentence overview of the quarter's performance. Lead with the most important finding.",
  "wins": ["2-3 specific wins from the data — what worked well"],
  "challenges": ["1-2 areas that underperformed or need attention"],
  "content_insights": "2-3 sentences about what content types/topics performed best",
  "q2_recommendations": ["3-4 specific, actionable recommendations for next quarter based on this data"],
  "trend_narrative": "2-3 sentences describing the overall trajectory — is the channel growing, stable, or declining, and why"
}`;

    const result = await claudeAPI.call(
      prompt,
      'You are a senior YouTube strategist writing a quarterly performance report for a brand client. Be direct, data-driven, and forward-looking. Return ONLY valid JSON.',
      'quarterly_report',
      2000
    );

    const { parseClaudeJSON } = await import('../lib/parseClaudeJSON');
    return parseClaudeJSON(result.text, {});
  } catch (err) {
    console.error('[QuarterlyReport] Narrative generation failed:', err);
    return null;
  }
}

export default {
  getQuarterDates,
  getPreviousQuarter,
  getCurrentQuarter,
  generateQuarterlyReport,
  generateQuarterlyNarrative,
};
