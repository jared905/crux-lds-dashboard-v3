/**
 * Competitor Database Service
 * Full View Analytics - Crux Media
 *
 * Handles all competitor data operations with Supabase
 */

import { supabase } from './supabaseClient';
import { youtubeAPI, determineVideoType } from './youtubeAPI';

// Title pattern detection (matches competitorAnalysis.js)
const TITLE_PATTERNS = [
  { name: 'question', regex: /\?/ },
  { name: 'number', regex: /\d+/ },
  { name: 'caps_emphasis', regex: /\b[A-Z]{3,}\b/ },
  { name: 'brackets', regex: /[\(\[\{]/ },
  { name: 'first_person', regex: /\b(I|My|We|Our)\b/i },
  { name: 'negative', regex: /\b(never|stop|avoid|worst|fail|bad|terrible|don't)\b/i },
  { name: 'power_word', regex: /\b(secret|ultimate|best|perfect|complete|easy|simple|amazing)\b/i },
];

// Content format detection
const CONTENT_FORMATS = [
  { name: 'tutorial', regex: /\b(tutorial|how to|guide|learn|teach|step by step|tips|tricks)\b/i },
  { name: 'review', regex: /\b(review|reaction|reacts?|responds?|first time|listening to|watching)\b/i },
  { name: 'vlog', regex: /\b(vlog|behind|day in|life|personal|story|journey|update)\b/i },
  { name: 'comparison', regex: /\b(vs\.?|versus|compare|comparison|battle)\b/i },
  { name: 'listicle', regex: /\b(top \d+|best|worst|\d+ (things|ways|tips|reasons))\b/i },
  { name: 'challenge', regex: /\b(challenge|try|attempt|test|experiment)\b/i },
];

/**
 * Detect title patterns in a video title
 */
function detectTitlePatterns(title) {
  return TITLE_PATTERNS
    .filter(p => p.regex.test(title))
    .map(p => p.name);
}

/**
 * Detect content format from title
 */
function detectContentFormat(title) {
  const match = CONTENT_FORMATS.find(f => f.regex.test(title));
  return match ? match.name : null;
}

/**
 * Parse ISO 8601 duration to seconds
 */
function parseDuration(duration) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

// ============================================
// CHANNEL OPERATIONS
// ============================================

/**
 * Get tracked channels with optional pagination
 */
export async function getChannels({ category, isCompetitor, clientId, page, pageSize = 50 } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  let query = supabase
    .from('channels')
    .select('*', { count: 'exact' })
    .order('name');

  if (category) query = query.eq('category', category);
  if (typeof isCompetitor === 'boolean') query = query.eq('is_competitor', isCompetitor);
  if (clientId) query = query.eq('client_id', clientId);

  // Apply pagination if page is specified
  if (typeof page === 'number') {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  // When paginated, return structured result
  if (typeof page === 'number') {
    return { data, count, hasMore: (page + 1) * pageSize < count };
  }

  // Backward-compatible: return flat array when no pagination
  return data;
}

/**
 * Get all channels by paging through results
 */
export async function getAllChannels(filters = {}) {
  const pageSize = 100;
  let page = 0;
  let allData = [];
  let hasMore = true;

  while (hasMore) {
    const result = await getChannels({ ...filters, page, pageSize });
    allData = allData.concat(result.data);
    hasMore = result.hasMore;
    page++;
  }

  return allData;
}

/**
 * Get a single channel by YouTube ID
 */
export async function getChannelByYouTubeId(youtubeChannelId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('youtube_channel_id', youtubeChannelId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return data;
}

/**
 * Add or update a channel
 */
export async function upsertChannel(channelData) {
  if (!supabase) throw new Error('Supabase not configured');

  const record = {
    youtube_channel_id: channelData.youtube_channel_id,
    name: channelData.name,
    description: channelData.description,
    thumbnail_url: channelData.thumbnail_url,
    custom_url: channelData.custom_url,
    category: channelData.category,
    tags: channelData.tags,
    is_competitor: channelData.is_competitor ?? true,
    client_id: channelData.client_id,
    subscriber_count: channelData.subscriber_count,
    total_view_count: channelData.total_view_count,
    video_count: channelData.video_count,
    last_synced_at: new Date().toISOString(),
  };

  // Optional metadata fields (tier, subcategory, notes)
  if (channelData.tier !== undefined) record.tier = channelData.tier;
  if (channelData.subcategory !== undefined) record.subcategory = channelData.subcategory;
  if (channelData.notes !== undefined) record.notes = channelData.notes;

  const { data, error } = await supabase
    .from('channels')
    .upsert(record, { onConflict: 'youtube_channel_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a channel and all associated data
 */
export async function deleteChannel(channelId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('channels')
    .delete()
    .eq('id', channelId);

  if (error) throw error;
}

// ============================================
// VIDEO OPERATIONS
// ============================================

/**
 * Get videos for a channel
 */
export async function getVideos({ channelId, videoType, limit = 50, offset = 0 } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  let query = supabase
    .from('videos')
    .select('*, channels(name, category)')
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (channelId) query = query.eq('channel_id', channelId);
  if (videoType) query = query.eq('video_type', videoType);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Get top performing videos across all competitors
 */
export async function getTopCompetitorVideos({ days = 30, limit = 50, videoType, category } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  let query = supabase
    .from('videos')
    .select('*, channels!inner(name, category, subscriber_count, is_competitor)')
    .eq('channels.is_competitor', true)
    .gte('published_at', cutoffDate.toISOString())
    .order('view_count', { ascending: false })
    .limit(limit);

  if (videoType) query = query.eq('video_type', videoType);
  if (category) query = query.eq('channels.category', category);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Upsert multiple videos
 */
export async function upsertVideos(videos, channelId) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!videos.length) return [];

  // Detect Shorts via HEAD request proxy (skips generated IDs and videos > 180s)
  const shortsMap = await youtubeAPI.checkIfShortBatch(
    videos.map(v => ({ youtube_video_id: v.youtube_video_id, duration_seconds: v.duration_seconds }))
  );

  const videosToUpsert = videos.map(v => {
    const isShort = shortsMap.get(v.youtube_video_id) ?? null;
    const videoType = determineVideoType(isShort, v.duration_seconds);
    return {
      youtube_video_id: v.youtube_video_id,
      channel_id: channelId,
      title: v.title,
      description: v.description,
      thumbnail_url: v.thumbnail_url,
      published_at: v.published_at,
      duration_seconds: v.duration_seconds,
      video_type: videoType,
      is_short: isShort ?? (videoType === 'short'),
      view_count: v.view_count,
      like_count: v.like_count,
      comment_count: v.comment_count,
      engagement_rate: v.view_count > 0
        ? (v.like_count + v.comment_count) / v.view_count
        : 0,
      detected_format: detectContentFormat(v.title),
      title_patterns: detectTitlePatterns(v.title),
      last_synced_at: new Date().toISOString(),
    };
  });

  const { data, error } = await supabase
    .from('videos')
    .upsert(videosToUpsert, { onConflict: 'youtube_video_id' })
    .select();

  if (error) throw error;
  return data;
}

// ============================================
// SNAPSHOT OPERATIONS
// ============================================

/**
 * Create a channel snapshot
 */
export async function createChannelSnapshot(channelId, stats) {
  if (!supabase) throw new Error('Supabase not configured');

  const today = new Date().toISOString().split('T')[0];

  // Get previous snapshot to calculate changes
  const { data: prevSnapshot } = await supabase
    .from('channel_snapshots')
    .select('*')
    .eq('channel_id', channelId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await supabase
    .from('channel_snapshots')
    .upsert({
      channel_id: channelId,
      snapshot_date: today,
      subscriber_count: stats.subscriber_count,
      total_view_count: stats.total_view_count,
      video_count: stats.video_count,
      subscriber_change: prevSnapshot
        ? stats.subscriber_count - prevSnapshot.subscriber_count
        : null,
      view_change: prevSnapshot
        ? stats.total_view_count - prevSnapshot.total_view_count
        : null,
      video_change: prevSnapshot
        ? stats.video_count - prevSnapshot.video_count
        : null,
      shorts_count: stats.shorts_count,
      longs_count: stats.longs_count,
      avg_views_per_video: stats.avg_views_per_video,
      avg_engagement_rate: stats.avg_engagement_rate,
    }, { onConflict: 'channel_id,snapshot_date' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get channel snapshot history
 */
export async function getChannelSnapshots(channelId, { days = 30 } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const { data, error } = await supabase
    .from('channel_snapshots')
    .select('*')
    .eq('channel_id', channelId)
    .gte('snapshot_date', cutoffDate.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Get snapshots for multiple channels in a single query.
 * Returns { [channel_id]: snapshot[] } grouped by channel.
 */
export async function getBulkChannelSnapshots(channelIds, { days = 30 } = {}) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!channelIds.length) return {};

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (days === 0 ? 365 : days));

  const { data, error } = await supabase
    .from('channel_snapshots')
    .select('*')
    .in('channel_id', channelIds)
    .gte('snapshot_date', cutoffDate.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });

  if (error) throw error;

  const grouped = {};
  (data || []).forEach(snap => {
    if (!grouped[snap.channel_id]) grouped[snap.channel_id] = [];
    grouped[snap.channel_id].push(snap);
  });
  return grouped;
}

/**
 * Aggregate snapshot data by category (pure JS transform, no DB call).
 * Takes bulk snapshot data and a { channelId: category } map.
 * Returns { [category]: { [date]: { totalSubs, totalViews, count } } }
 */
export function aggregateSnapshotsByCategory(bulkSnapshots, channelCategoryMap) {
  const byCatDate = {};

  Object.entries(bulkSnapshots).forEach(([channelId, snapshots]) => {
    const category = channelCategoryMap[channelId] || 'unknown';
    if (!byCatDate[category]) byCatDate[category] = {};

    snapshots.forEach(snap => {
      const date = snap.snapshot_date;
      if (!byCatDate[category][date]) {
        byCatDate[category][date] = { totalSubs: 0, totalViews: 0, count: 0 };
      }
      byCatDate[category][date].totalSubs += snap.subscriber_count || 0;
      byCatDate[category][date].totalViews += snap.total_view_count || 0;
      byCatDate[category][date].count++;
    });
  });

  return byCatDate;
}

/**
 * Get snapshot count per channel to determine data coverage.
 * Returns { [channel_id]: number }
 */
export async function getSnapshotCoverage(channelIds) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!channelIds.length) return {};

  const { data, error } = await supabase
    .from('channel_snapshots')
    .select('channel_id, snapshot_date')
    .in('channel_id', channelIds);

  if (error) throw error;

  const coverage = {};
  (data || []).forEach(snap => {
    coverage[snap.channel_id] = (coverage[snap.channel_id] || 0) + 1;
  });
  return coverage;
}

/**
 * Create video snapshots for performance tracking
 */
export async function createVideoSnapshots(videos) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!videos.length) return [];

  const today = new Date().toISOString().split('T')[0];

  // Get previous snapshots to calculate velocity
  const videoIds = videos.map(v => v.id);
  const { data: prevSnapshots } = await supabase
    .from('video_snapshots')
    .select('*')
    .in('video_id', videoIds)
    .order('snapshot_date', { ascending: false });

  const prevSnapshotMap = {};
  prevSnapshots?.forEach(s => {
    if (!prevSnapshotMap[s.video_id]) {
      prevSnapshotMap[s.video_id] = s;
    }
  });

  const snapshots = videos.map(v => {
    const prev = prevSnapshotMap[v.id];
    return {
      video_id: v.id,
      snapshot_date: today,
      view_count: v.view_count,
      like_count: v.like_count,
      comment_count: v.comment_count,
      view_velocity: prev ? v.view_count - prev.view_count : null,
    };
  });

  const { data, error } = await supabase
    .from('video_snapshots')
    .upsert(snapshots, { onConflict: 'video_id,snapshot_date' })
    .select();

  if (error) throw error;
  return data;
}

// ============================================
// SYNC OPERATIONS
// ============================================

/**
 * Start a sync operation log
 */
export async function startSyncLog(syncType) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('sync_log')
    .insert({ sync_type: syncType })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Complete a sync operation
 */
export async function completeSyncLog(syncLogId, results) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('sync_log')
    .update({
      completed_at: new Date().toISOString(),
      status: results.errors?.length ? 'failed' : 'completed',
      channels_synced: results.channels_synced,
      videos_synced: results.videos_synced,
      youtube_api_calls: results.youtube_api_calls,
      errors: results.errors,
    })
    .eq('id', syncLogId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get recent sync logs
 */
export async function getSyncLogs({ limit = 10 } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('sync_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

// ============================================
// INSIGHTS OPERATIONS
// ============================================

/**
 * Store computed insights
 */
export async function storeInsight(insight) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('content_insights')
    .upsert({
      channel_id: insight.channel_id || null,
      category: insight.category || null,
      insight_type: insight.insight_type,
      insight_date: insight.insight_date || new Date().toISOString().split('T')[0],
      data: insight.data,
      valid_from: insight.valid_from,
      valid_until: insight.valid_until,
    }, { onConflict: 'channel_id,category,insight_type,insight_date' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get insights
 */
export async function getInsights({ channelId, category, insightType } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  let query = supabase
    .from('content_insights')
    .select('*')
    .order('insight_date', { ascending: false });

  if (channelId) query = query.eq('channel_id', channelId);
  if (category) query = query.eq('category', category);
  if (insightType) query = query.eq('insight_type', insightType);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ============================================
// AGGREGATE QUERIES
// ============================================

/**
 * Get competitive landscape summary
 * Uses two targeted queries instead of loading all videos into memory
 */
export async function getCompetitiveLandscape({ category, days = 30 } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Query 1: Get competitor channels (without videos)
  let channelQuery = supabase
    .from('channels')
    .select('*')
    .eq('is_competitor', true);

  if (category) channelQuery = channelQuery.eq('category', category);

  const { data: channels, error: channelError } = await channelQuery;
  if (channelError) throw channelError;

  if (!channels.length) {
    return { channels: [], totalChannels: 0, metrics: { totalVideos: 0, totalShorts: 0, totalLongs: 0, avgViewsPerVideo: 0, avgEngagement: 0, topFormats: {}, topPatterns: {} }, topVideos: [] };
  }

  const channelIds = channels.map(c => c.id);

  // Query 2: Get top 100 recent videos sorted by views (uses composite index)
  let videoQuery = supabase
    .from('videos')
    .select('id, title, video_type, view_count, like_count, comment_count, engagement_rate, published_at, detected_format, title_patterns, channel_id')
    .in('channel_id', channelIds)
    .gte('published_at', cutoffDate.toISOString())
    .order('view_count', { ascending: false })
    .limit(100);

  const { data: topVideos, error: videoError } = await videoQuery;
  if (videoError) throw videoError;

  // Query 3: Get aggregate counts for all videos in period (lightweight)
  const { data: allRecentVideos, error: allError } = await supabase
    .from('videos')
    .select('video_type, view_count, engagement_rate, detected_format, title_patterns')
    .in('channel_id', channelIds)
    .gte('published_at', cutoffDate.toISOString());

  if (allError) throw allError;

  // Calculate aggregate metrics from the lightweight query
  const metrics = {
    totalVideos: allRecentVideos.length,
    totalShorts: 0,
    totalLongs: 0,
    avgViewsPerVideo: 0,
    avgEngagement: 0,
    topFormats: {},
    topPatterns: {},
  };

  let totalViews = 0;
  let totalEngagement = 0;

  allRecentVideos.forEach(video => {
    if (video.video_type === 'short') metrics.totalShorts++;
    if (video.video_type === 'long') metrics.totalLongs++;
    totalViews += video.view_count || 0;
    totalEngagement += video.engagement_rate || 0;

    if (video.detected_format) {
      metrics.topFormats[video.detected_format] = (metrics.topFormats[video.detected_format] || 0) + 1;
    }
    (video.title_patterns || []).forEach(pattern => {
      metrics.topPatterns[pattern] = (metrics.topPatterns[pattern] || 0) + 1;
    });
  });

  if (allRecentVideos.length > 0) {
    metrics.avgViewsPerVideo = totalViews / allRecentVideos.length;
    metrics.avgEngagement = totalEngagement / allRecentVideos.length;
  }

  return {
    channels,
    totalChannels: channels.length,
    metrics,
    topVideos: topVideos || [],
  };
}

/**
 * Get title pattern performance analysis
 */
export async function getTitlePatternPerformance({ category, days = 90 } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  let query = supabase
    .from('videos')
    .select('title_patterns, view_count, engagement_rate, channels!inner(category, is_competitor)')
    .eq('channels.is_competitor', true)
    .gte('published_at', cutoffDate.toISOString())
    .not('title_patterns', 'is', null);

  if (category) query = query.eq('channels.category', category);

  const { data, error } = await query;
  if (error) throw error;

  // Aggregate by pattern
  const patternStats = {};

  data.forEach(video => {
    (video.title_patterns || []).forEach(pattern => {
      if (!patternStats[pattern]) {
        patternStats[pattern] = {
          pattern,
          count: 0,
          totalViews: 0,
          totalEngagement: 0,
          videos: [],
        };
      }
      patternStats[pattern].count++;
      patternStats[pattern].totalViews += video.view_count || 0;
      patternStats[pattern].totalEngagement += video.engagement_rate || 0;
    });
  });

  // Calculate averages and sort
  return Object.values(patternStats)
    .map(p => ({
      ...p,
      avgViews: p.totalViews / p.count,
      avgEngagement: p.totalEngagement / p.count,
    }))
    .sort((a, b) => b.avgViews - a.avgViews);
}

// ============================================
// MIGRATION HELPERS
// ============================================

/**
 * Migrate existing localStorage competitors to Supabase
 */
export async function migrateFromLocalStorage(clientId) {
  if (!supabase) throw new Error('Supabase not configured');

  const existingCompetitors = JSON.parse(localStorage.getItem('competitors') || '[]');

  if (!existingCompetitors.length) {
    return { migrated: 0, errors: [] };
  }

  const results = { migrated: 0, errors: [] };

  for (const competitor of existingCompetitors) {
    try {
      // Upsert channel
      const channel = await upsertChannel({
        youtube_channel_id: competitor.id,
        name: competitor.name,
        description: competitor.description,
        thumbnail_url: competitor.thumbnail,
        subscriber_count: competitor.subscriberCount,
        total_view_count: competitor.viewCount,
        video_count: competitor.videoCount,
        category: competitor.category,
        is_competitor: true,
        client_id: clientId || null,
      });

      // Upsert videos
      if (competitor.videos?.length) {
        const videosToMigrate = competitor.videos.map(v => ({
          youtube_video_id: v.id,
          title: v.title,
          thumbnail_url: v.thumbnail,
          published_at: v.publishedAt,
          duration_seconds: v.duration,
          view_count: v.views,
          like_count: v.likes,
          comment_count: v.comments,
        }));

        await upsertVideos(videosToMigrate, channel.id);
      }

      results.migrated++;
    } catch (err) {
      results.errors.push({ competitor: competitor.name, error: err.message });
    }
  }

  return results;
}

export default {
  // Channels
  getChannels,
  getAllChannels,
  getChannelByYouTubeId,
  upsertChannel,
  deleteChannel,

  // Videos
  getVideos,
  getTopCompetitorVideos,
  upsertVideos,

  // Snapshots
  createChannelSnapshot,
  getChannelSnapshots,
  getBulkChannelSnapshots,
  aggregateSnapshotsByCategory,
  getSnapshotCoverage,
  createVideoSnapshots,

  // Sync
  startSyncLog,
  completeSyncLog,
  getSyncLogs,

  // Insights
  storeInsight,
  getInsights,

  // Aggregates
  getCompetitiveLandscape,
  getTitlePatternPerformance,

  // Migration
  migrateFromLocalStorage,
};
