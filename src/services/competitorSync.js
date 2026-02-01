/**
 * Competitor Sync Service
 * Full View Analytics - Crux Media
 *
 * Handles syncing competitor channel data from YouTube API to database.
 * Uses the consolidated youtubeAPI service for all YouTube Data API calls.
 */

import {
  getChannels,
  upsertChannel,
  upsertVideos,
  createChannelSnapshot,
  createVideoSnapshots,
  startSyncLog,
  completeSyncLog,
  getChannelByYouTubeId,
} from './competitorDatabase';

import { youtubeAPI } from './youtubeAPI';

/**
 * Add a new competitor channel
 */
export async function addCompetitor(input, { category, tags, clientId } = {}) {
  if (!youtubeAPI.loadAPIKey()) throw new Error('YouTube API key not configured');

  // Resolve channel ID
  const channelId = await youtubeAPI.resolveChannelId(input);

  // Check if already exists
  const existing = await getChannelByYouTubeId(channelId);
  if (existing) {
    throw new Error('This channel is already being tracked');
  }

  // Fetch channel details
  const channelDetails = await youtubeAPI.fetchChannelDetails(channelId);

  // Save to database
  const channel = await upsertChannel({
    ...channelDetails,
    category,
    tags,
    is_competitor: true,
    client_id: clientId || null,
  });

  // Fetch and save recent videos
  if (channelDetails.uploads_playlist_id) {
    const videos = await youtubeAPI.fetchChannelVideos(channelDetails.uploads_playlist_id);
    await upsertVideos(videos, channel.id);

    // Create initial snapshot
    const shorts = videos.filter(v => v.duration_seconds <= 60);
    const longs = videos.filter(v => v.duration_seconds > 60);

    await createChannelSnapshot(channel.id, {
      subscriber_count: channelDetails.subscriber_count,
      total_view_count: channelDetails.total_view_count,
      video_count: channelDetails.video_count,
      shorts_count: shorts.length,
      longs_count: longs.length,
      avg_views_per_video: videos.length > 0
        ? videos.reduce((sum, v) => sum + v.view_count, 0) / videos.length
        : 0,
      avg_engagement_rate: videos.length > 0
        ? videos.reduce((sum, v) => sum + (v.like_count + v.comment_count) / Math.max(v.view_count, 1), 0) / videos.length
        : 0,
    });
  }

  return channel;
}

/**
 * Sync a single channel (refresh data)
 */
export async function syncChannel(channelId) {
  if (!youtubeAPI.loadAPIKey()) throw new Error('YouTube API key not configured');

  // Get existing channel record
  const { data: channelRecord, error } = await import('./supabaseClient')
    .then(m => m.supabase.from('channels').select('*').eq('id', channelId).single());

  if (error || !channelRecord) throw new Error('Channel not found');

  // Fetch fresh data from YouTube
  const channelDetails = await youtubeAPI.fetchChannelDetails(channelRecord.youtube_channel_id);

  // Update channel record
  const updatedChannel = await upsertChannel({
    ...channelDetails,
    category: channelRecord.category,
    tags: channelRecord.tags,
    is_competitor: channelRecord.is_competitor,
    client_id: channelRecord.client_id,
  });

  // Fetch and update videos
  let videos = [];
  if (channelDetails.uploads_playlist_id) {
    videos = await youtubeAPI.fetchChannelVideos(channelDetails.uploads_playlist_id);
    const savedVideos = await upsertVideos(videos, updatedChannel.id);

    // Create video snapshots for tracking
    await createVideoSnapshots(savedVideos);
  }

  // Create channel snapshot
  const shorts = videos.filter(v => v.duration_seconds <= 60);
  const longs = videos.filter(v => v.duration_seconds > 60);

  await createChannelSnapshot(updatedChannel.id, {
    subscriber_count: channelDetails.subscriber_count,
    total_view_count: channelDetails.total_view_count,
    video_count: channelDetails.video_count,
    shorts_count: shorts.length,
    longs_count: longs.length,
    avg_views_per_video: videos.length > 0
      ? videos.reduce((sum, v) => sum + v.view_count, 0) / videos.length
      : 0,
    avg_engagement_rate: videos.length > 0
      ? videos.reduce((sum, v) => sum + (v.like_count + v.comment_count) / Math.max(v.view_count, 1), 0) / videos.length
      : 0,
  });

  return { channel: updatedChannel, videosCount: videos.length };
}

/**
 * Sync all tracked channels in parallel batches
 */
export async function syncAllChannels({ onProgress, batchSize = 5, clientId } = {}) {
  if (!youtubeAPI.loadAPIKey()) throw new Error('YouTube API key not configured');

  // Start sync log
  const syncLog = await startSyncLog('manual');

  const results = {
    channels_synced: 0,
    videos_synced: 0,
    youtube_api_calls: 0,
    errors: [],
  };

  try {
    // Get channels, optionally filtered by client
    const channels = await getChannels(clientId ? { clientId } : {});
    const syncableChannels = channels.filter(c => c.sync_enabled !== false);

    // Process in parallel batches
    for (let i = 0; i < syncableChannels.length; i += batchSize) {
      const batch = syncableChannels.slice(i, i + batchSize);

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: syncableChannels.length,
          channel: batch.map(c => c.name).join(', '),
          batch: Math.floor(i / batchSize) + 1,
          totalBatches: Math.ceil(syncableChannels.length / batchSize),
        });
      }

      const batchResults = await Promise.allSettled(
        batch.map(channel => syncChannel(channel.id))
      );

      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          results.channels_synced++;
          results.videos_synced += result.value.videosCount;
          results.youtube_api_calls += 3;
        } else {
          results.errors.push({ channel: batch[idx].name, error: result.reason?.message || 'Unknown error' });
        }
      });

      // Rate limiting: 500ms delay between batches
      if (i + batchSize < syncableChannels.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

  } finally {
    // Complete sync log
    await completeSyncLog(syncLog.id, results);
  }

  return results;
}

/**
 * Scheduled sync (for cron job) — parallel batches of 5
 */
export async function scheduledSync() {
  if (!youtubeAPI.loadAPIKey()) {
    console.warn('Scheduled sync skipped: No YouTube API key');
    return null;
  }

  const syncLog = await startSyncLog('scheduled');

  const results = {
    channels_synced: 0,
    videos_synced: 0,
    youtube_api_calls: 0,
    errors: [],
  };

  const batchSize = 5;

  try {
    const channels = await getChannels();
    const syncableChannels = channels.filter(c => c.sync_enabled !== false);

    for (let i = 0; i < syncableChannels.length; i += batchSize) {
      const batch = syncableChannels.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(channel => syncChannel(channel.id))
      );

      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          results.channels_synced++;
          results.videos_synced += result.value.videosCount;
          results.youtube_api_calls += 3;
        } else {
          results.errors.push({ channel: batch[idx].name, error: result.reason?.message || 'Unknown error' });
        }
      });

      // Rate limiting between batches
      if (i + batchSize < syncableChannels.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

  } finally {
    await completeSyncLog(syncLog.id, results);
  }

  return results;
}

export default {
  addCompetitor,
  syncChannel,
  syncAllChannels,
  scheduledSync,
};
