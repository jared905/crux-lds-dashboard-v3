/**
 * Audit Ingestion Service
 * Handles data collection for audits: checks existing DB data first,
 * fetches missing data from YouTube API, stores everything.
 */

import { youtubeAPI } from './youtubeAPI';
import { supabase } from './supabaseClient';
import { getChannelByYouTubeId, upsertChannel, upsertVideos } from './competitorDatabase';
import { updateAuditProgress, addAuditCost, updateAuditSection } from './auditDatabase';

/**
 * Classify channel into size tier based on subscriber count.
 */
export function classifySizeTier(subscriberCount) {
  if (subscriberCount >= 1000000) return 'elite';
  if (subscriberCount >= 500000) return 'major';
  if (subscriberCount >= 100000) return 'established';
  if (subscriberCount >= 10000) return 'growing';
  return 'emerging';
}

/**
 * Get tier-adaptive lookback configuration.
 */
export function getTierConfig(sizeTier) {
  const configs = {
    emerging:    { lookbackMonths: 24, maxVideos: 50  },
    growing:     { lookbackMonths: 18, maxVideos: 100 },
    established: { lookbackMonths: 12, maxVideos: 150 },
    major:       { lookbackMonths: 9,  maxVideos: 200 },
    elite:       { lookbackMonths: 6,  maxVideos: 200 },
  };
  return configs[sizeTier] || configs.established;
}

/**
 * Check if channel data is fresh enough to reuse (synced within 24 hours).
 */
function isChannelDataFresh(channel) {
  if (!channel.last_synced_at) return false;
  const syncAge = Date.now() - new Date(channel.last_synced_at).getTime();
  return syncAge < 24 * 60 * 60 * 1000;
}

/**
 * Ingest channel data for an audit.
 * Reuses existing DB data if fresh, fetches from YouTube otherwise.
 *
 * @param {string} auditId - The audit UUID
 * @param {string} channelInput - YouTube URL, handle, or channel ID
 * @param {Object} opts - { forceRefresh?: boolean, maxVideos?: number }
 * @returns {{ channel, videos, sizeTier, tierConfig }}
 */
export async function ingestChannelData(auditId, channelInput, opts = {}) {
  await updateAuditSection(auditId, 'ingestion', { status: 'running' });
  await updateAuditProgress(auditId, { step: 'ingestion', pct: 2, message: 'Resolving channel...' });

  let apiCallsUsed = 0;

  try {
    // 1. Resolve channel ID
    const ytChannelId = await youtubeAPI.resolveChannelId(channelInput);
    apiCallsUsed += ytChannelId !== channelInput.trim() ? 1 : 0; // search may have been used

    await updateAuditProgress(auditId, { step: 'ingestion', pct: 5, message: 'Checking existing data...' });

    // 2. Check if channel already exists in database
    const existingChannel = await getChannelByYouTubeId(ytChannelId);
    let channel;
    let videos = [];
    let fetchedFromYouTube = false;

    if (existingChannel && isChannelDataFresh(existingChannel) && !opts.forceRefresh) {
      // Reuse existing data
      channel = existingChannel;
      await updateAuditProgress(auditId, { step: 'ingestion', pct: 8, message: 'Using cached channel data...' });

      // Get existing videos from DB
      const { data: existingVideos } = await supabase
        .from('videos')
        .select('*')
        .eq('channel_id', channel.id)
        .order('published_at', { ascending: false });

      videos = existingVideos || [];
    } else {
      // Fetch from YouTube
      fetchedFromYouTube = true;
      await updateAuditProgress(auditId, { step: 'ingestion', pct: 8, message: 'Fetching channel details...' });

      const channelDetails = await youtubeAPI.fetchChannelDetails(ytChannelId);
      apiCallsUsed += 1;

      // Determine size tier and max videos
      const sizeTier = classifySizeTier(channelDetails.subscriber_count);
      const tierConfig = opts.maxVideos
        ? { maxVideos: opts.maxVideos }
        : getTierConfig(sizeTier);

      await updateAuditProgress(auditId, { step: 'ingestion', pct: 10, message: `Fetching videos (up to ${tierConfig.maxVideos})...` });

      // Fetch videos
      const ytVideos = await youtubeAPI.fetchChannelVideos(
        channelDetails.uploads_playlist_id,
        tierConfig.maxVideos
      );
      // Estimate API calls: 1 per 50 playlist items + 1 per 50 video details
      apiCallsUsed += Math.ceil(ytVideos.length / 50) * 2;

      // Upsert channel to database
      // For new audit channels, set is_competitor to null (audit-only, not a client)
      // Preserve existing status for channels that were already in the system
      channel = await upsertChannel({
        ...channelDetails,
        size_tier: sizeTier,
        created_via: existingChannel ? existingChannel.created_via : 'audit',
        is_competitor: existingChannel ? existingChannel.is_competitor : null,
      });

      // Upsert videos
      if (ytVideos.length > 0) {
        await upsertVideos(ytVideos, channel.id);
      }

      // Re-fetch stored videos to get database IDs
      const { data: storedVideos } = await supabase
        .from('videos')
        .select('*')
        .eq('channel_id', channel.id)
        .order('published_at', { ascending: false });

      videos = storedVideos || [];
    }

    // 3. Classify size tier
    const sizeTier = classifySizeTier(channel.subscriber_count);
    const tierConfig = getTierConfig(sizeTier);

    // Update channel size_tier if not set
    if (channel.size_tier !== sizeTier) {
      await supabase
        .from('channels')
        .update({ size_tier: sizeTier })
        .eq('id', channel.id);
      channel.size_tier = sizeTier;
    }

    // 4. Build channel snapshot for audit
    const recentVideos = videos.filter(v => {
      if (!v.published_at) return false;
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 3);
      return new Date(v.published_at) > cutoff;
    });

    const channelSnapshot = {
      channel_id: channel.id,
      name: channel.name,
      youtube_channel_id: channel.youtube_channel_id,
      thumbnail_url: channel.thumbnail_url,
      subscriber_count: channel.subscriber_count,
      total_view_count: channel.total_view_count,
      video_count: channel.video_count,
      size_tier: sizeTier,
      snapshot_date: new Date().toISOString().split('T')[0],
      total_videos_analyzed: videos.length,
      recent_videos_90d: recentVideos.length,
      avg_views_recent: recentVideos.length > 0
        ? Math.round(recentVideos.reduce((s, v) => s + (v.view_count || 0), 0) / recentVideos.length)
        : 0,
      avg_engagement_recent: recentVideos.length > 0
        ? recentVideos.reduce((s, v) => {
            const views = Math.max(v.view_count || 1, 1);
            return s + ((v.like_count || 0) + (v.comment_count || 0)) / views;
          }, 0) / recentVideos.length
        : 0,
      fetched_from_youtube: fetchedFromYouTube,
    };

    // Track costs
    await addAuditCost(auditId, { apiCalls: apiCallsUsed });

    await updateAuditProgress(auditId, { step: 'ingestion', pct: 15, message: 'Ingestion complete' });
    await updateAuditSection(auditId, 'ingestion', {
      status: 'completed',
      result_data: { video_count: videos.length, fetched_from_youtube: fetchedFromYouTube },
    });

    return { channel, videos, sizeTier, tierConfig, channelSnapshot };

  } catch (err) {
    await updateAuditSection(auditId, 'ingestion', {
      status: 'failed',
      error_message: err.message,
    });
    throw err;
  }
}
