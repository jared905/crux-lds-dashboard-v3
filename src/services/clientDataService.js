/**
 * Client Data Service
 * Full View Analytics - Crux Media
 *
 * Handles saving/loading client CSV data to Supabase
 * Enables team-wide access to uploaded client channel data
 */

import { supabase } from './supabaseClient';
import { youtubeAPI, determineVideoType } from './youtubeAPI';

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
 * @param {Object} channelUrlsMap - Optional per-channel YouTube URL mapping
 * @param {string} backgroundImageUrl - Optional background image URL for branding
 * @returns {Object} - The saved client object in ClientManager format
 */
export async function saveClientToSupabase(clientName, normalizedRows, youtubeChannelUrl, subscriberCount, rawRows, channelUrlsMap = {}, backgroundImageUrl = null) {
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
        is_client: true, // Explicitly mark as client (separates from audit-only channels)
        client_id: youtubeChannelId, // Use channel ID as client_id for grouping
        subscriber_count: subscriberCount || 0,
        video_count: normalizedRows.length,
        channel_urls_map: channelUrlsMap && Object.keys(channelUrlsMap).length > 0 ? channelUrlsMap : {},
        background_image_url: backgroundImageUrl || null,
        created_via: 'csv_upload',
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
    channelUrlsMap: channelUrlsMap || {},
    backgroundImageUrl: backgroundImageUrl || null,
    syncedToSupabase: true,
  };
}

/**
 * Load all client channels from Supabase
 * Returns data in the format expected by ClientManager
 * Now includes report periods information
 *
 * @returns {Array} - Array of client objects
 */
/**
 * Load videos and report periods for a single channel.
 * Returns { rows, reportPeriods, activePeriod } or null on error.
 */
async function loadChannelData(channel) {
  // Fetch report periods (without full video_data for performance)
  const { data: periods, error: periodsError } = await supabase
    .from('report_periods')
    .select(`
      id,
      name,
      period_type,
      start_date,
      end_date,
      video_count,
      total_views,
      total_watch_hours,
      total_impressions,
      subscribers_gained,
      is_baseline,
      is_active,
      uploaded_at
    `)
    .eq('channel_id', channel.id)
    .eq('is_active', true)
    .order('uploaded_at', { ascending: false });

  if (periodsError) {
    console.error(`Error fetching periods for channel ${channel.id}:`, periodsError);
  }

  const reportPeriods = periods || [];
  const hasReportPeriods = reportPeriods.length > 0;

  let rows = [];
  let activePeriod = null;

  // Helper to map a videos-table row to the normalized row format
  const mapVideoRow = (video) => {
    const contentSource = video.content_source || channel.name;
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
      videoId: realVideoId,
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
  };

  // Priority 1: Check if the videos table has live synced data (from daily-sync cron)
  const { data: liveVideos, error: videosError } = await supabase
    .from('videos')
    .select('*')
    .eq('channel_id', channel.id)
    .order('published_at', { ascending: false });

  if (videosError) {
    console.error(`Error fetching videos for channel ${channel.id}:`, videosError);
  }

  const hasLiveSyncData = liveVideos?.some(v => v.last_synced_at);

  if (hasLiveSyncData && liveVideos.length > 0) {
    // Use live data from videos table — kept fresh by the daily-sync cron
    rows = liveVideos.map(mapVideoRow);
  } else if (hasReportPeriods && channel.active_period_id) {
    // Priority 2: Use report period JSONB (from CSV uploads)
    const { data: periodData, error: periodError } = await supabase
      .from('report_periods')
      .select('*, video_data')
      .eq('id', channel.active_period_id)
      .single();

    if (!periodError && periodData?.video_data) {
      activePeriod = {
        id: periodData.id,
        name: periodData.name,
        periodType: periodData.period_type,
        startDate: periodData.start_date,
        endDate: periodData.end_date,
        isBaseline: periodData.is_baseline,
      };

      rows = (periodData.video_data || []).map(video => ({
        'Video title': video.title,
        'Video publish time': video.publishDate,
        'Views': video.views,
        'Duration': video.duration,
        'Impressions': video.impressions,
        'Impressions click-through rate (%)': video.ctr ? video.ctr * 100 : null,
        'Average percentage viewed (%)': video.retention ? video.retention * 100 : null,
        'Subscribers gained': video.subscribers,
        'Content': video.channel,
        videoId: video.youtubeVideoId || null,
        thumbnailUrl: video.thumbnailUrl || null,
        title: video.title,
        publishDate: video.publishDate,
        views: video.views || 0,
        duration: video.duration || 0,
        type: video.type,
        impressions: video.impressions || 0,
        ctr: video.ctr,
        retention: video.retention,
        avgViewPct: video.retention,
        subscribers: video.subscribers || 0,
        watchHours: video.watchHours || 0,
        channel: video.channel,
      }));
    }
  }

  // Priority 3: Fall back to all videos in table (no sync, no report period)
  if (rows.length === 0 && liveVideos && liveVideos.length > 0) {
    rows = liveVideos.map(mapVideoRow);
  }

  return { rows, reportPeriods, activePeriod };
}

export async function getClientsFromSupabase() {
  if (!supabase) throw new Error('Supabase not configured');

  // Fetch all client channels (explicitly marked as is_client = true)
  // This excludes audit-only channels which have is_client = false/null
  const { data: allChannels, error: channelsError } = await supabase
    .from('channels')
    .select('*')
    .eq('is_client', true)
    .order('name');

  if (channelsError) {
    console.error('Error fetching channels:', channelsError);
    throw channelsError;
  }

  if (!allChannels || allChannels.length === 0) {
    return [];
  }

  // Partition channels into network parents, members, and standalone
  const networkMemberIds = new Set(
    allChannels.filter(c => c.network_id).map(c => c.network_id)
  );
  const networkMembers = allChannels.filter(c => c.network_id);
  const networkParents = allChannels.filter(c => !c.network_id && networkMemberIds.has(c.id));
  const standalone = allChannels.filter(c => !c.network_id && !networkMemberIds.has(c.id));

  const clients = [];

  // Process network parents — aggregate all member channel data
  for (const parent of networkParents) {
    const members = networkMembers.filter(m => m.network_id === parent.id);
    const allNetworkChannels = [parent, ...members];

    // Load videos from all channels in the network in parallel
    const channelDataResults = await Promise.all(
      allNetworkChannels.map(ch => loadChannelData(ch))
    );

    const allRows = [];
    const mergedUrlsMap = {};
    let allReportPeriods = [];
    let networkActivePeriod = null;

    for (let i = 0; i < allNetworkChannels.length; i++) {
      const ch = allNetworkChannels[i];
      const data = channelDataResults[i];
      if (!data) continue;

      allRows.push(...data.rows);
      Object.assign(mergedUrlsMap, ch.channel_urls_map || {});

      // Use the parent's report periods and active period for the network
      if (ch.id === parent.id) {
        allReportPeriods = data.reportPeriods;
        networkActivePeriod = data.activePeriod;
      }
    }

    const totalSubs = allNetworkChannels.reduce((sum, ch) => sum + (ch.subscriber_count || 0), 0);
    const uniqueChannels = [...new Set(allRows.map(r => r.channel).filter(Boolean))];

    clients.push({
      id: parent.id,
      supabaseId: parent.id,
      name: parent.network_name || parent.name,
      uploadDate: parent.last_synced_at || parent.created_at,
      rows: allRows,
      subscriberCount: totalSubs,
      channels: uniqueChannels.length > 0 ? uniqueChannels : [parent.name],
      youtubeChannelUrl: parent.custom_url || '',
      channelUrlsMap: mergedUrlsMap,
      backgroundImageUrl: parent.background_image_url || null,
      syncedToSupabase: true,
      reportPeriods: allReportPeriods,
      activePeriod: networkActivePeriod,
      activePeriodId: parent.active_period_id,
      // Network metadata
      isNetwork: true,
      networkMembers: allNetworkChannels.map(ch => ({
        id: ch.id,
        name: ch.name,
        youtubeChannelId: ch.youtube_channel_id,
        subscriberCount: ch.subscriber_count || 0,
      })),
    });
  }

  // Process standalone channels — unchanged from original logic
  const standaloneResults = await Promise.all(
    standalone.map(async (channel) => {
      const data = await loadChannelData(channel);
      if (!data) return null;

      const uniqueChannels = [...new Set(data.rows.map(r => r.channel).filter(Boolean))];

      return {
        id: channel.id,
        supabaseId: channel.id,
        name: channel.name,
        uploadDate: channel.last_synced_at || channel.created_at,
        rows: data.rows,
        subscriberCount: channel.subscriber_count || 0,
        channels: uniqueChannels.length > 0 ? uniqueChannels : [channel.name],
        youtubeChannelUrl: channel.custom_url || '',
        channelUrlsMap: channel.channel_urls_map || {},
        backgroundImageUrl: channel.background_image_url || null,
        syncedToSupabase: true,
        reportPeriods: data.reportPeriods,
        activePeriod: data.activePeriod,
        activePeriodId: channel.active_period_id,
      };
    })
  );

  clients.push(...standaloneResults.filter(Boolean));

  return clients;
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
 * Fetch and store videos for an OAuth-connected channel
 * Uses the YouTube API to fetch recent videos and stores them in the database
 *
 * @param {string} youtubeChannelId - The YouTube channel ID (UC...)
 * @param {string} supabaseChannelId - The Supabase channel UUID
 * @param {number} maxVideos - Maximum number of videos to fetch (default 50)
 * @param {Function} onProgress - Optional progress callback
 * @returns {Object} - { videoCount, success, error }
 */
export async function syncOAuthChannelVideos(youtubeChannelId, supabaseChannelId, maxVideos = 100, onProgress = null) {
  if (!supabase) throw new Error('Supabase not configured');

  try {
    if (onProgress) onProgress({ stage: 'fetching', message: 'Fetching channel details...' });

    // Fetch channel details to get uploads playlist ID
    const channelDetails = await youtubeAPI.fetchChannelDetails(youtubeChannelId);
    if (!channelDetails?.uploads_playlist_id) {
      throw new Error('Could not find uploads playlist for this channel');
    }

    if (onProgress) onProgress({ stage: 'videos', message: 'Fetching videos...' });

    // Fetch videos from the uploads playlist
    const videos = await youtubeAPI.fetchChannelVideos(channelDetails.uploads_playlist_id, maxVideos);
    if (!videos || videos.length === 0) {
      return { videoCount: 0, success: true, message: 'No videos found on this channel' };
    }

    if (onProgress) onProgress({ stage: 'detecting', message: 'Detecting Shorts vs long-form...' });

    // Detect which videos are Shorts
    const shortsResults = await youtubeAPI.checkIfShortBatch(videos);

    if (onProgress) onProgress({ stage: 'storing', message: `Storing ${videos.length} videos...` });

    // Prepare video records for database
    const videosToUpsert = videos.map(video => {
      const isShort = shortsResults.get(video.youtube_video_id);
      const videoType = determineVideoType(isShort, video.duration_seconds);

      return {
        youtube_video_id: video.youtube_video_id,
        channel_id: supabaseChannelId,
        title: video.title,
        description: video.description?.substring(0, 500) || null,
        published_at: video.published_at,
        duration_seconds: video.duration_seconds || 0,
        video_type: videoType,
        is_short: videoType === 'short',
        view_count: video.view_count || 0,
        like_count: video.like_count || 0,
        comment_count: video.comment_count || 0,
        thumbnail_url: video.thumbnail_url || null,
        // Note: Don't overwrite KPI fields (impressions, ctr, avg_view_percentage,
        // subscribers_gained, watch_hours) - these are populated by analytics sync
        // and shouldn't be reset to null on video refresh
        content_source: channelDetails.name,
        last_synced_at: new Date().toISOString(),
      };
    });

    // Upsert videos in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < videosToUpsert.length; i += BATCH_SIZE) {
      const batch = videosToUpsert.slice(i, i + BATCH_SIZE);
      const { error: videosError } = await supabase
        .from('videos')
        .upsert(batch, { onConflict: 'youtube_video_id' });

      if (videosError) {
        console.error('Error upserting videos batch:', videosError);
        throw videosError;
      }
    }

    // Update channel metadata
    await supabase
      .from('channels')
      .update({
        subscriber_count: channelDetails.subscriber_count || 0,
        video_count: channelDetails.video_count || videos.length,
        thumbnail_url: channelDetails.thumbnail_url || null,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', supabaseChannelId);

    if (onProgress) onProgress({ stage: 'complete', message: `Synced ${videos.length} videos` });

    return {
      videoCount: videos.length,
      success: true,
      channelDetails: {
        name: channelDetails.name,
        subscriberCount: channelDetails.subscriber_count,
        videoCount: channelDetails.video_count,
      }
    };
  } catch (error) {
    console.error('Error syncing OAuth channel videos:', error);
    return {
      videoCount: 0,
      success: false,
      error: error.message || 'Failed to sync videos'
    };
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

// ============================================
// REPORT PERIODS
// ============================================

/**
 * Period type options for uploads
 */
export const PERIOD_TYPES = {
  LIFETIME: 'lifetime',
  MONTHLY: 'monthly',
  WEEKLY: 'weekly',
  QUARTERLY: 'quarterly',
  CUSTOM: 'custom',
};

/**
 * Calculate date range based on period type
 * @param {string} periodType - One of PERIOD_TYPES
 * @param {Date} referenceDate - Date to calculate from (defaults to now)
 * @returns {Object} - { startDate, endDate, name }
 */
export function calculatePeriodDates(periodType, referenceDate = new Date()) {
  const ref = new Date(referenceDate);
  let startDate, endDate, name;

  switch (periodType) {
    case PERIOD_TYPES.LIFETIME:
      startDate = null;
      endDate = null;
      name = 'Lifetime Baseline';
      break;

    case PERIOD_TYPES.WEEKLY: {
      // Last 7 days ending yesterday
      endDate = new Date(ref);
      endDate.setDate(endDate.getDate() - 1);
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 6);
      const weekStart = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const weekEnd = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      name = `Week of ${weekStart} - ${weekEnd}`;
      break;
    }

    case PERIOD_TYPES.MONTHLY: {
      // Previous full month
      const prevMonth = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
      startDate = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
      endDate = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0);
      name = startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      break;
    }

    case PERIOD_TYPES.QUARTERLY: {
      // Previous full quarter
      const currentQuarter = Math.floor(ref.getMonth() / 3);
      const prevQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
      const year = currentQuarter === 0 ? ref.getFullYear() - 1 : ref.getFullYear();
      startDate = new Date(year, prevQuarter * 3, 1);
      endDate = new Date(year, prevQuarter * 3 + 3, 0);
      name = `Q${prevQuarter + 1} ${year}`;
      break;
    }

    default:
      // Custom - caller must provide dates
      startDate = null;
      endDate = null;
      name = 'Custom Period';
  }

  return {
    startDate: startDate ? startDate.toISOString().split('T')[0] : null,
    endDate: endDate ? endDate.toISOString().split('T')[0] : null,
    name,
  };
}

/**
 * Save a report period with video data
 *
 * @param {string} channelId - The Supabase channel UUID
 * @param {Object} periodInfo - Period metadata
 * @param {string} periodInfo.name - Display name ("January 2025")
 * @param {string} periodInfo.periodType - One of PERIOD_TYPES
 * @param {string} periodInfo.startDate - ISO date string (YYYY-MM-DD)
 * @param {string} periodInfo.endDate - ISO date string (YYYY-MM-DD)
 * @param {boolean} periodInfo.isBaseline - Whether this is the lifetime baseline
 * @param {string} periodInfo.notes - Optional notes
 * @param {Array} normalizedRows - Normalized video rows from CSV
 * @returns {Object} - The saved period record
 */
export async function saveReportPeriod(channelId, periodInfo, normalizedRows) {
  if (!supabase) throw new Error('Supabase not configured');

  // Calculate summary stats
  const videoCount = normalizedRows.length;
  const totalViews = normalizedRows.reduce((sum, r) => sum + (r.views || 0), 0);
  const totalWatchHours = normalizedRows.reduce((sum, r) => sum + (r.watchHours || 0), 0);
  const totalImpressions = normalizedRows.reduce((sum, r) => sum + (r.impressions || 0), 0);
  const subscribersGained = normalizedRows.reduce((sum, r) => sum + (r.subscribers || 0), 0);

  // If this is a baseline, unset any existing baseline for this channel
  if (periodInfo.isBaseline) {
    await supabase
      .from('report_periods')
      .update({ is_baseline: false })
      .eq('channel_id', channelId)
      .eq('is_baseline', true);
  }

  const { data: period, error } = await supabase
    .from('report_periods')
    .insert({
      channel_id: channelId,
      name: periodInfo.name,
      period_type: periodInfo.periodType,
      start_date: periodInfo.startDate || null,
      end_date: periodInfo.endDate || null,
      is_baseline: periodInfo.isBaseline || false,
      notes: periodInfo.notes || null,
      video_data: normalizedRows,
      video_count: videoCount,
      total_views: totalViews,
      total_watch_hours: totalWatchHours,
      total_impressions: totalImpressions,
      subscribers_gained: subscribersGained,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving report period:', error);
    throw error;
  }

  // Set this as the active period for the channel
  await supabase
    .from('channels')
    .update({ active_period_id: period.id })
    .eq('id', channelId);

  return period;
}

/**
 * Get all report periods for a client channel
 *
 * @param {string} channelId - The Supabase channel UUID
 * @returns {Array} - Array of period records (without full video_data for performance)
 */
export async function getReportPeriods(channelId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: periods, error } = await supabase
    .from('report_periods')
    .select(`
      id,
      name,
      period_type,
      start_date,
      end_date,
      video_count,
      total_views,
      total_watch_hours,
      total_impressions,
      subscribers_gained,
      is_baseline,
      is_active,
      uploaded_at,
      notes
    `)
    .eq('channel_id', channelId)
    .eq('is_active', true)
    .order('uploaded_at', { ascending: false });

  if (error) {
    console.error('Error fetching report periods:', error);
    throw error;
  }

  return periods || [];
}

/**
 * Get a specific report period with full video data
 *
 * @param {string} periodId - The period UUID
 * @returns {Object} - Period record with video_data
 */
export async function getReportPeriod(periodId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: period, error } = await supabase
    .from('report_periods')
    .select('*')
    .eq('id', periodId)
    .single();

  if (error) {
    console.error('Error fetching report period:', error);
    throw error;
  }

  return period;
}

/**
 * Delete a report period (soft delete)
 *
 * @param {string} periodId - The period UUID
 */
export async function deleteReportPeriod(periodId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('report_periods')
    .update({ is_active: false })
    .eq('id', periodId);

  if (error) {
    console.error('Error deleting report period:', error);
    throw error;
  }
}

/**
 * Set the active period for a channel
 *
 * @param {string} channelId - The channel UUID
 * @param {string} periodId - The period UUID to set as active (or null for default)
 */
export async function setActivePeriod(channelId, periodId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('channels')
    .update({ active_period_id: periodId })
    .eq('id', channelId);

  if (error) {
    console.error('Error setting active period:', error);
    throw error;
  }
}

/**
 * Convert period video_data back to the row format expected by the dashboard
 *
 * @param {Array} videoData - The video_data JSONB from a period
 * @returns {Array} - Rows in ClientManager format
 */
export function periodVideoDataToRows(videoData) {
  if (!videoData || !Array.isArray(videoData)) return [];

  return videoData.map(video => ({
    // Raw CSV format fields
    'Video title': video.title,
    'Video publish time': video.publishDate,
    'Views': video.views,
    'Duration': video.duration,
    'Impressions': video.impressions,
    'Impressions click-through rate (%)': video.ctr ? video.ctr * 100 : null,
    'Average percentage viewed (%)': video.retention ? video.retention * 100 : null,
    'Subscribers gained': video.subscribers,
    'Content': video.channel,
    videoId: video.youtubeVideoId || null,
    thumbnailUrl: video.thumbnailUrl || null,
    // Normalized fields for direct use
    title: video.title,
    publishDate: video.publishDate,
    views: video.views || 0,
    duration: video.duration || 0,
    type: video.type,
    impressions: video.impressions || 0,
    ctr: video.ctr,
    retention: video.retention,
    avgViewPct: video.retention,
    subscribers: video.subscribers || 0,
    watchHours: video.watchHours || 0,
    channel: video.channel,
  }));
}

/**
 * Fetch video performance aggregated from daily snapshots for a date range.
 * Returns rows in the same normalized format the dashboard expects.
 * Falls back gracefully — returns null if no snapshot data exists.
 *
 * @param {string[]} channelIds - Array of channel UUIDs to query
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<{ rows: Array, snapshotDays: number } | null>}
 */
export async function getVideoSnapshotAggregates(channelIds, startDate, endDate) {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('get_video_snapshot_aggregates', {
    channel_ids: channelIds,
    start_date: startDate,
    end_date: endDate,
  });

  if (error) {
    console.error('[Snapshots] RPC error:', error);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const maxDays = Math.max(...data.map(r => Number(r.snapshot_days) || 0));

  const rows = data.map(row => {
    const thumbMatch = row.thumbnail_url?.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
    const realVideoId = thumbMatch ? thumbMatch[1] : null;
    const contentSource = row.content_source || '';

    return {
      'Video title': row.title,
      'Video publish time': row.published_at,
      'Views': Number(row.views) || 0,
      'Duration': row.duration_seconds,
      'Impressions': Number(row.impressions) || 0,
      'Impressions click-through rate (%)': row.ctr != null ? row.ctr * 100 : null,
      'Average percentage viewed (%)': row.avg_view_percentage != null ? row.avg_view_percentage * 100 : null,
      'Subscribers gained': Number(row.subscribers_gained) || 0,
      'Content': contentSource,
      videoId: realVideoId,
      thumbnailUrl: row.thumbnail_url,
      title: row.title,
      publishDate: row.published_at,
      views: Number(row.views) || 0,
      duration: row.duration_seconds || 0,
      type: row.video_type || (row.duration_seconds && row.duration_seconds <= 180 ? 'short' : 'long'),
      impressions: Number(row.impressions) || 0,
      ctr: row.ctr != null ? Number(row.ctr) : null,
      retention: row.avg_view_percentage != null ? Number(row.avg_view_percentage) : null,
      avgViewPct: row.avg_view_percentage != null ? Number(row.avg_view_percentage) : null,
      subscribers: Number(row.subscribers_gained) || 0,
      watchHours: Number(row.watch_hours) || 0,
      channel: contentSource,
      youtubeVideoId: row.youtube_video_id || realVideoId,
      youtubeUrl: row.youtube_video_id ? `https://www.youtube.com/watch?v=${row.youtube_video_id}` : null,
    };
  });

  // Only use snapshot data if it has meaningful view information.
  // Until total_view_count is populated by the daily-sync cron,
  // views will be 0 — in that case, fall back to lifetime stats.
  const totalViews = rows.reduce((sum, r) => sum + r.views, 0);
  if (totalViews === 0) {
    console.log('[Snapshots] No view data yet (total_view_count not populated), falling back to lifetime stats');
    return null;
  }

  return { rows, snapshotDays: maxDays };
}

export default {
  saveClientToSupabase,
  getClientsFromSupabase,
  deleteClientFromSupabase,
  checkSupabaseConnection,
  syncOAuthChannelVideos,
  // Report periods
  PERIOD_TYPES,
  calculatePeriodDates,
  saveReportPeriod,
  getReportPeriods,
  getReportPeriod,
  deleteReportPeriod,
  setActivePeriod,
  periodVideoDataToRows,
  getVideoSnapshotAggregates,
};
