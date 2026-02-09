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
export async function getClientsFromSupabase() {
  if (!supabase) throw new Error('Supabase not configured');

  // Fetch all client channels (explicitly marked as is_client = true)
  // This excludes audit-only channels which have is_client = false/null
  const { data: channels, error: channelsError } = await supabase
    .from('channels')
    .select('*')
    .eq('is_client', true)
    .order('name');

  if (channelsError) {
    console.error('Error fetching channels:', channelsError);
    throw channelsError;
  }

  if (!channels || channels.length === 0) {
    return [];
  }

  // Fetch videos and report periods for each channel
  const clients = await Promise.all(
    channels.map(async (channel) => {
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

      // Determine which data to load:
      // - If there's an active_period_id, load that period's data
      // - Otherwise, fall back to videos table (legacy behavior)
      let rows = [];
      let activePeriod = null;

      if (hasReportPeriods && channel.active_period_id) {
        // Load active period's video data
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

          // Convert period video_data to rows format
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

      // Fall back to legacy videos table if no period data
      if (rows.length === 0) {
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
        rows = (videos || []).map(video => {
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
        });
      }

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
        channelUrlsMap: channel.channel_urls_map || {},
        backgroundImageUrl: channel.background_image_url || null,
        syncedToSupabase: true,
        // New period-related fields
        reportPeriods: reportPeriods,
        activePeriod: activePeriod,
        activePeriodId: channel.active_period_id,
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

export default {
  saveClientToSupabase,
  getClientsFromSupabase,
  deleteClientFromSupabase,
  checkSupabaseConnection,
  // Report periods
  PERIOD_TYPES,
  calculatePeriodDates,
  saveReportPeriod,
  getReportPeriods,
  getReportPeriod,
  deleteReportPeriod,
  setActivePeriod,
  periodVideoDataToRows,
};
