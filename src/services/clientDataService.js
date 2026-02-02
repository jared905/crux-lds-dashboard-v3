/**
 * Client Data Service
 * Full View Analytics - Crux Media
 *
 * Handles saving/loading client CSV data to Supabase
 * Enables team-wide access to uploaded client channel data
 */

import { supabase } from './supabaseClient';

/**
 * Generate a deterministic video ID from CSV data
 * Since YouTube Studio exports don't include video IDs, we create stable IDs
 * from title + publish date + channel to enable upserts without duplicates
 */
function generateVideoId(title, publishDate, channel) {
  const input = `${title}-${publishDate}-${channel}`;
  // Simple hash using btoa, prefixed to identify CSV-sourced videos
  const hash = btoa(unescape(encodeURIComponent(input)))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 11);
  return `csv_${hash}`;
}

/**
 * Extract YouTube channel ID from a URL or return a generated ID
 */
function extractOrGenerateChannelId(youtubeChannelUrl, clientName) {
  if (youtubeChannelUrl) {
    // Try to extract channel ID from various URL formats
    const patterns = [
      /youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/,
      /youtube\.com\/@([^/?]+)/,
      /youtube\.com\/c\/([^/?]+)/,
      /youtube\.com\/user\/([^/?]+)/,
    ];

    for (const pattern of patterns) {
      const match = youtubeChannelUrl.match(pattern);
      if (match) {
        // For @handles and custom URLs, prefix to make them unique identifiers
        if (pattern.toString().includes('@') || pattern.toString().includes('/c/') || pattern.toString().includes('/user/')) {
          return `handle_${match[1]}`;
        }
        return match[1];
      }
    }
  }

  // Generate ID from client name if no URL provided
  const hash = btoa(unescape(encodeURIComponent(clientName)))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 22);
  return `client_${hash}`;
}

/**
 * Save client CSV data to Supabase
 * Creates/updates the channel and all associated videos
 *
 * @param {string} clientName - Display name for the client
 * @param {Array} normalizedRows - Parsed and normalized video rows from CSV
 * @param {string} youtubeChannelUrl - Optional YouTube channel URL
 * @param {number} subscriberCount - Total subscriber count from CSV
 * @param {Array} rawRows - Original raw CSV data for storage
 * @returns {Object} - The saved client object in ClientManager format
 */
export async function saveClientToSupabase(clientName, normalizedRows, youtubeChannelUrl, subscriberCount, rawRows) {
  if (!supabase) throw new Error('Supabase not configured');

  const youtubeChannelId = extractOrGenerateChannelId(youtubeChannelUrl, clientName);

  // 1. Upsert the channel record
  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .upsert(
      {
        youtube_channel_id: youtubeChannelId,
        name: clientName,
        custom_url: youtubeChannelUrl || null,
        is_competitor: false,
        client_id: youtubeChannelId, // Use channel ID as client_id for grouping
        subscriber_count: subscriberCount || 0,
        video_count: normalizedRows.length,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'youtube_channel_id' }
    )
    .select()
    .single();

  if (channelError) {
    console.error('Error upserting channel:', channelError);
    throw channelError;
  }

  // 2. Prepare video records and deduplicate by video ID
  // (CSV may have duplicate rows which cause "cannot affect row a second time" error)
  const videoMap = new Map();

  for (const row of normalizedRows) {
    const videoId = generateVideoId(row.title, row.publishDate, row.channel);

    // Keep the first occurrence (or you could merge/prefer higher view counts)
    if (!videoMap.has(videoId)) {
      videoMap.set(videoId, {
        youtube_video_id: videoId,
        channel_id: channel.id,
        title: row.title,
        published_at: row.publishDate,
        duration_seconds: row.duration || 0,
        // CSV videos use duration heuristic (no real YouTube ID for HEAD request check)
        video_type: (row.duration > 0 && row.duration <= 180) ? 'short' : 'long',
        is_short: (row.duration > 0 && row.duration <= 180),
        view_count: row.views || 0,
        like_count: 0, // Not available in YouTube Studio CSV
        comment_count: 0, // Not available in YouTube Studio CSV
        // Store thumbnail URL from CSV parsing (uses real YouTube video ID)
        thumbnail_url: row.thumbnailUrl || null,
        // CSV-specific analytics fields
        impressions: row.impressions || 0,
        ctr: row.ctr || null,
        avg_view_percentage: row.retention || row.avgViewPct || null,
        subscribers_gained: row.subscribers || 0,
        watch_hours: row.watchHours || null,
        // Content source - preserves original channel name for multi-channel clients
        content_source: row.channel || null,
        // Auto-computed fields
        engagement_rate: 0, // Will be calculated when we have likes/comments
        last_synced_at: new Date().toISOString(),
      });
    }
  }

  const videosToUpsert = Array.from(videoMap.values());
  console.log(`[Supabase] Prepared ${videosToUpsert.length} unique videos (from ${normalizedRows.length} rows)`);

  // 3. Upsert videos in batches (Supabase has limits)
  const BATCH_SIZE = 500;
  const upsertedVideos = [];

  for (let i = 0; i < videosToUpsert.length; i += BATCH_SIZE) {
    const batch = videosToUpsert.slice(i, i + BATCH_SIZE);

    const { data: videos, error: videosError } = await supabase
      .from('videos')
      .upsert(batch, { onConflict: 'youtube_video_id' })
      .select();

    if (videosError) {
      console.error('Error upserting videos batch:', videosError);
      throw videosError;
    }

    upsertedVideos.push(...(videos || []));
  }

  // 4. Return in ClientManager format for local state
  return {
    id: channel.id,
    supabaseId: channel.id,
    name: clientName,
    uploadDate: new Date().toISOString(),
    rows: rawRows, // Keep raw data for existing functionality
    subscriberCount: subscriberCount,
    channels: [...new Set(normalizedRows.map(r => r.channel).filter(Boolean))],
    youtubeChannelUrl: youtubeChannelUrl || '',
    syncedToSupabase: true,
  };
}

/**
 * Load all client channels from Supabase
 * Returns data in the format expected by ClientManager
 *
 * @returns {Array} - Array of client objects
 */
export async function getClientsFromSupabase() {
  if (!supabase) throw new Error('Supabase not configured');

  // Fetch all non-competitor channels (these are clients)
  const { data: channels, error: channelsError } = await supabase
    .from('channels')
    .select('*')
    .eq('is_competitor', false)
    .order('name');

  if (channelsError) {
    console.error('Error fetching channels:', channelsError);
    throw channelsError;
  }

  if (!channels || channels.length === 0) {
    return [];
  }

  // Fetch videos for each channel
  const clients = await Promise.all(
    channels.map(async (channel) => {
      const { data: videos, error: videosError } = await supabase
        .from('videos')
        .select('*')
        .eq('channel_id', channel.id)
        .order('published_at', { ascending: false });

      if (videosError) {
        console.error(`Error fetching videos for channel ${channel.id}:`, videosError);
        return null;
      }

      // Convert Supabase videos back to ClientManager row format
      // Use content_source if available (for multi-channel clients), otherwise fall back to channel name
      const rows = (videos || []).map(video => {
        const contentSource = video.content_source || channel.name;
        // Extract real YouTube video ID from stored thumbnail URL if available
        const thumbMatch = video.thumbnail_url?.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
        const realVideoId = thumbMatch ? thumbMatch[1] : null;
        return {
          'Video title': video.title,
          'Video publish time': video.published_at,
          'Views': video.view_count,
          'Duration': video.duration_seconds,
          'Impressions': video.impressions,
          'Impressions click-through rate (%)': video.ctr ? video.ctr * 100 : null,
          'Average percentage viewed (%)': video.avg_view_percentage ? video.avg_view_percentage * 100 : null,
          'Subscribers gained': video.subscribers_gained,
          'Content': contentSource,
          // Pass real YouTube video ID so normalizeData can extract it
          videoId: realVideoId,
          // Normalized fields for direct use
          title: video.title,
          publishDate: video.published_at,
          views: video.view_count,
          duration: video.duration_seconds,
          type: video.video_type,
          impressions: video.impressions,
          ctr: video.ctr,
          retention: video.avg_view_percentage,
          avgViewPct: video.avg_view_percentage,
          subscribers: video.subscribers_gained,
          watchHours: video.watch_hours,
          channel: contentSource,
        };
      });

      // Extract unique channel names from content_source for multi-channel support
      const uniqueChannels = [...new Set(rows.map(r => r.channel).filter(Boolean))];

      return {
        id: channel.id,
        supabaseId: channel.id,
        name: channel.name,
        uploadDate: channel.last_synced_at || channel.created_at,
        rows: rows,
        subscriberCount: channel.subscriber_count || 0,
        channels: uniqueChannels.length > 0 ? uniqueChannels : [channel.name],
        youtubeChannelUrl: channel.custom_url || '',
        syncedToSupabase: true,
      };
    })
  );

  // Filter out any null results from errors
  return clients.filter(Boolean);
}

/**
 * Delete a client and all associated videos from Supabase
 *
 * @param {string} channelId - The Supabase channel UUID
 */
export async function deleteClientFromSupabase(channelId) {
  if (!supabase) throw new Error('Supabase not configured');

  // Videos are cascade-deleted automatically due to FK constraint
  const { error } = await supabase
    .from('channels')
    .delete()
    .eq('id', channelId);

  if (error) {
    console.error('Error deleting client:', error);
    throw error;
  }
}

/**
 * Check if Supabase is configured and accessible
 */
export async function checkSupabaseConnection() {
  if (!supabase) return { connected: false, error: 'Supabase not configured' };

  try {
    const { error } = await supabase
      .from('channels')
      .select('id')
      .limit(1);

    if (error) {
      return { connected: false, error: error.message };
    }

    return { connected: true };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

export default {
  saveClientToSupabase,
  getClientsFromSupabase,
  deleteClientFromSupabase,
  checkSupabaseConnection,
};
