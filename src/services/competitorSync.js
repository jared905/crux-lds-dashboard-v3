/**
 * Competitor Sync Service
 * Full View Analytics - Crux Media
 *
 * Handles fetching data from YouTube API and syncing to database
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

// YouTube API configuration
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

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

/**
 * Get YouTube API key from localStorage
 */
function getYouTubeApiKey() {
  return localStorage.getItem('yt_api_key') || '';
}

/**
 * Resolve a YouTube channel URL/handle to channel ID
 */
async function resolveChannelId(input, apiKey) {
  let channelId = input.trim();

  // Direct channel ID
  if (channelId.match(/^UC[\w-]{22}$/)) {
    return channelId;
  }

  // URL formats
  if (channelId.includes('youtube.com/channel/')) {
    return channelId.split('youtube.com/channel/')[1].split(/[?/]/)[0];
  }

  // Handle format (@username)
  if (channelId.includes('youtube.com/@') || channelId.startsWith('@')) {
    const handle = channelId.includes('@')
      ? channelId.split('@')[1].split(/[?/]/)[0]
      : channelId;

    const response = await fetch(
      `${YOUTUBE_API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent('@' + handle)}&key=${apiKey}`
    );
    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    if (!data.items?.length) throw new Error('Channel not found');

    return data.items[0].snippet.channelId;
  }

  // Custom URL or username format
  if (channelId.includes('youtube.com/c/') || channelId.includes('youtube.com/user/')) {
    const customName = channelId.split(/youtube\.com\/[cu]\//)[1].split(/[?/]/)[0];

    const response = await fetch(
      `${YOUTUBE_API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(customName)}&key=${apiKey}`
    );
    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    if (!data.items?.length) throw new Error('Channel not found');

    return data.items[0].snippet.channelId;
  }

  // Assume it's a channel ID or search term
  return channelId;
}

/**
 * Fetch channel details from YouTube API
 */
async function fetchChannelDetails(channelId, apiKey) {
  const response = await fetch(
    `${YOUTUBE_API_BASE}/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${apiKey}`
  );
  const data = await response.json();

  if (data.error) throw new Error(data.error.message);
  if (!data.items?.length) throw new Error('Channel not found');

  const channel = data.items[0];

  return {
    youtube_channel_id: channel.id,
    name: channel.snippet.title,
    description: channel.snippet.description,
    thumbnail_url: channel.snippet.thumbnails?.default?.url,
    custom_url: channel.snippet.customUrl,
    subscriber_count: parseInt(channel.statistics.subscriberCount) || 0,
    total_view_count: parseInt(channel.statistics.viewCount) || 0,
    video_count: parseInt(channel.statistics.videoCount) || 0,
    uploads_playlist_id: channel.contentDetails?.relatedPlaylists?.uploads,
  };
}

/**
 * Fetch recent videos from a channel with pagination support
 * Fetches up to maxResults videos across multiple API pages (50 per page)
 */
async function fetchChannelVideos(uploadsPlaylistId, apiKey, maxResults = 200) {
  const perPage = 50;
  let allItems = [];
  let pageToken = null;

  // Page through playlist items until we have enough or run out
  while (allItems.length < maxResults) {
    const url = `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${perPage}&key=${apiKey}` +
      (pageToken ? `&pageToken=${pageToken}` : '');

    const playlistResponse = await fetch(url);
    const playlistData = await playlistResponse.json();

    if (playlistData.error) throw new Error(playlistData.error.message);
    if (!playlistData.items?.length) break;

    allItems = allItems.concat(playlistData.items);
    pageToken = playlistData.nextPageToken;
    if (!pageToken) break;
  }

  // Trim to maxResults
  allItems = allItems.slice(0, maxResults);
  if (!allItems.length) return [];

  // Fetch video details in batches of 50 (API limit per call)
  const allVideos = [];
  for (let i = 0; i < allItems.length; i += 50) {
    const batch = allItems.slice(i, i + 50);
    const videoIds = batch.map(item => item.contentDetails.videoId).join(',');

    const videosResponse = await fetch(
      `${YOUTUBE_API_BASE}/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${apiKey}`
    );
    const videosData = await videosResponse.json();

    if (videosData.error) throw new Error(videosData.error.message);

    const mapped = videosData.items.map(video => ({
      youtube_video_id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail_url: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
      published_at: video.snippet.publishedAt,
      duration_seconds: parseDuration(video.contentDetails.duration),
      view_count: parseInt(video.statistics.viewCount) || 0,
      like_count: parseInt(video.statistics.likeCount) || 0,
      comment_count: parseInt(video.statistics.commentCount) || 0,
    }));

    allVideos.push(...mapped);
  }

  return allVideos;
}

/**
 * Add a new competitor channel
 */
export async function addCompetitor(input, { category, tags } = {}) {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) throw new Error('YouTube API key not configured');

  // Resolve channel ID
  const channelId = await resolveChannelId(input, apiKey);

  // Check if already exists
  const existing = await getChannelByYouTubeId(channelId);
  if (existing) {
    throw new Error('This channel is already being tracked');
  }

  // Fetch channel details
  const channelDetails = await fetchChannelDetails(channelId, apiKey);

  // Save to database
  const channel = await upsertChannel({
    ...channelDetails,
    category,
    tags,
    is_competitor: true,
  });

  // Fetch and save recent videos
  if (channelDetails.uploads_playlist_id) {
    const videos = await fetchChannelVideos(channelDetails.uploads_playlist_id, apiKey);
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
  const apiKey = getYouTubeApiKey();
  if (!apiKey) throw new Error('YouTube API key not configured');

  // Get existing channel record
  const { data: channelRecord, error } = await import('./supabaseClient')
    .then(m => m.supabase.from('channels').select('*').eq('id', channelId).single());

  if (error || !channelRecord) throw new Error('Channel not found');

  // Fetch fresh data from YouTube
  const channelDetails = await fetchChannelDetails(channelRecord.youtube_channel_id, apiKey);

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
    videos = await fetchChannelVideos(channelDetails.uploads_playlist_id, apiKey);
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
export async function syncAllChannels({ onProgress, batchSize = 5 } = {}) {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) throw new Error('YouTube API key not configured');

  // Start sync log
  const syncLog = await startSyncLog('manual');

  const results = {
    channels_synced: 0,
    videos_synced: 0,
    youtube_api_calls: 0,
    errors: [],
  };

  try {
    // Get all channels with sync enabled
    const channels = await getChannels();
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
  const apiKey = getYouTubeApiKey();
  if (!apiKey) {
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
