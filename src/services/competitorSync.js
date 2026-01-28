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
 * Fetch recent videos from a channel
 */
async function fetchChannelVideos(uploadsPlaylistId, apiKey, maxResults = 50) {
  // Get playlist items (video IDs)
  const playlistResponse = await fetch(
    `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`
  );
  const playlistData = await playlistResponse.json();

  if (playlistData.error) throw new Error(playlistData.error.message);
  if (!playlistData.items?.length) return [];

  // Get video details (stats, duration)
  const videoIds = playlistData.items.map(item => item.contentDetails.videoId).join(',');

  const videosResponse = await fetch(
    `${YOUTUBE_API_BASE}/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${apiKey}`
  );
  const videosData = await videosResponse.json();

  if (videosData.error) throw new Error(videosData.error.message);

  return videosData.items.map(video => ({
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
 * Sync all tracked channels
 */
export async function syncAllChannels({ onProgress } = {}) {
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

    for (let i = 0; i < syncableChannels.length; i++) {
      const channel = syncableChannels[i];

      try {
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: syncableChannels.length,
            channel: channel.name,
          });
        }

        const { videosCount } = await syncChannel(channel.id);

        results.channels_synced++;
        results.videos_synced += videosCount;
        results.youtube_api_calls += 3; // channels, playlist, videos

      } catch (err) {
        results.errors.push({ channel: channel.name, error: err.message });
      }

      // Rate limiting: wait 100ms between channels
      await new Promise(resolve => setTimeout(resolve, 100));
    }

  } finally {
    // Complete sync log
    await completeSyncLog(syncLog.id, results);
  }

  return results;
}

/**
 * Scheduled sync (for cron job)
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

  try {
    const channels = await getChannels();
    const syncableChannels = channels.filter(c => c.sync_enabled !== false);

    for (const channel of syncableChannels) {
      try {
        const { videosCount } = await syncChannel(channel.id);
        results.channels_synced++;
        results.videos_synced += videosCount;
        results.youtube_api_calls += 3;
      } catch (err) {
        results.errors.push({ channel: channel.name, error: err.message });
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
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
