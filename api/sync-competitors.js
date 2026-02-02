/**
 * Vercel Cron Job: Daily Competitor Sync
 * Full View Analytics - Crux Media
 *
 * Runs daily at 6:00 AM UTC to sync all tracked competitors
 * Configure in vercel.json with:
 * {
 *   "crons": [{
 *     "path": "/api/sync-competitors",
 *     "schedule": "0 6 * * *"
 *   }]
 * }
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service role key for server-side operations
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Resolve a handle_ placeholder ID to a real YouTube UC channel ID.
 * Uses the custom_url field (@handle) and the YouTube Search API.
 * Returns the resolved UC ID, or null if resolution fails.
 */
async function resolveHandleToChannelId(channel, apiKey) {
  // Extract handle from custom_url (e.g., "@SaintsUnscripted") or from the placeholder ID
  const handle = channel.custom_url
    || '@' + channel.youtube_channel_id.replace('handle_', '');

  const cleanHandle = handle.startsWith('@') ? handle : '@' + handle;

  const response = await fetch(
    `${YOUTUBE_API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(cleanHandle)}&maxResults=1&key=${apiKey}`
  );
  const data = await response.json();

  if (data.error) throw new Error(data.error.message);
  if (!data.items?.length) throw new Error(`No channel found for handle ${cleanHandle}`);

  return data.items[0].snippet.channelId;
}

/**
 * Parse ISO 8601 duration to seconds
 */
function parseDuration(duration) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1]) || 0) * 3600 +
         (parseInt(match[2]) || 0) * 60 +
         (parseInt(match[3]) || 0);
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
  const playlistResponse = await fetch(
    `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`
  );
  const playlistData = await playlistResponse.json();

  if (playlistData.error) throw new Error(playlistData.error.message);
  if (!playlistData.items?.length) return [];

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
    thumbnail_url: video.snippet.thumbnails?.medium?.url,
    published_at: video.snippet.publishedAt,
    duration_seconds: parseDuration(video.contentDetails.duration),
    view_count: parseInt(video.statistics.viewCount) || 0,
    like_count: parseInt(video.statistics.likeCount) || 0,
    comment_count: parseInt(video.statistics.commentCount) || 0,
  }));
}

/**
 * Check if a YouTube video is a Short via HEAD request.
 * youtube.com/shorts/{videoId} returns 200 for Shorts, 303 redirect for non-Shorts.
 */
async function checkIfShort(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: 'HEAD',
      redirect: 'manual',
    });
    return response.status === 200;
  } catch {
    return null;
  }
}

/**
 * Batch Shorts detection with concurrency control.
 * Only checks videos with duration <= 180s (Shorts max is 3 min).
 */
async function checkShortsBatch(videos, { concurrency = 5, delayMs = 80 } = {}) {
  const results = new Map();

  const candidates = videos.filter(v => {
    if (v.duration_seconds > 180) {
      results.set(v.youtube_video_id, false);
      return false;
    }
    return !!v.youtube_video_id;
  });

  if (candidates.length === 0) return results;

  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, candidates.length) },
    async () => {
      while (index < candidates.length) {
        const current = index++;
        const video = candidates[current];
        const isShort = await checkIfShort(video.youtube_video_id);
        results.set(video.youtube_video_id, isShort ?? (video.duration_seconds <= 180));
        if (current < candidates.length - 1) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
  );

  await Promise.all(workers);
  return results;
}

/**
 * Detect title patterns
 */
function detectTitlePatterns(title) {
  const patterns = [
    { name: 'question', regex: /\?/ },
    { name: 'number', regex: /\d+/ },
    { name: 'caps_emphasis', regex: /\b[A-Z]{3,}\b/ },
    { name: 'brackets', regex: /[\(\[\{]/ },
    { name: 'first_person', regex: /\b(I|My|We|Our)\b/i },
    { name: 'negative', regex: /\b(never|stop|avoid|worst|fail|bad|terrible|don't)\b/i },
    { name: 'power_word', regex: /\b(secret|ultimate|best|perfect|complete|easy|simple|amazing)\b/i },
  ];
  return patterns.filter(p => p.regex.test(title)).map(p => p.name);
}

/**
 * Detect content format
 */
function detectContentFormat(title) {
  const formats = [
    { name: 'tutorial', regex: /\b(tutorial|how to|guide|learn|teach|step by step|tips|tricks)\b/i },
    { name: 'review', regex: /\b(review|reaction|reacts?|responds?|first time|listening to|watching)\b/i },
    { name: 'vlog', regex: /\b(vlog|behind|day in|life|personal|story|journey|update)\b/i },
    { name: 'comparison', regex: /\b(vs\.?|versus|compare|comparison|battle)\b/i },
    { name: 'listicle', regex: /\b(top \d+|best|worst|\d+ (things|ways|tips|reasons))\b/i },
    { name: 'challenge', regex: /\b(challenge|try|attempt|test|experiment)\b/i },
  ];
  const match = formats.find(f => f.regex.test(title));
  return match ? match.name : null;
}

/**
 * Sync a single channel
 */
async function syncChannel(channel, apiKey) {
  // Fetch fresh data from YouTube
  const channelDetails = await fetchChannelDetails(channel.youtube_channel_id, apiKey);

  // Update channel record
  await supabase
    .from('channels')
    .update({
      name: channelDetails.name,
      subscriber_count: channelDetails.subscriber_count,
      total_view_count: channelDetails.total_view_count,
      video_count: channelDetails.video_count,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', channel.id);

  // Fetch and update videos
  let videos = [];
  let videosToUpsert = [];
  if (channelDetails.uploads_playlist_id) {
    videos = await fetchChannelVideos(channelDetails.uploads_playlist_id, apiKey);

    // Detect Shorts via HEAD requests (server-side, no CORS issue)
    const shortsMap = await checkShortsBatch(videos);

    // Upsert videos
    videosToUpsert = videos.map(v => {
      const isShort = shortsMap.get(v.youtube_video_id) ?? null;
      const videoType = isShort === true ? 'short'
        : isShort === false ? 'long'
        : (v.duration_seconds > 0 && v.duration_seconds <= 180) ? 'short' : 'long';
      return {
        youtube_video_id: v.youtube_video_id,
        channel_id: channel.id,
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
        engagement_rate: v.view_count > 0 ? (v.like_count + v.comment_count) / v.view_count : 0,
        detected_format: detectContentFormat(v.title),
        title_patterns: detectTitlePatterns(v.title),
        last_synced_at: new Date().toISOString(),
      };
    });

    await supabase
      .from('videos')
      .upsert(videosToUpsert, { onConflict: 'youtube_video_id' });
  }

  // Create channel snapshot (use classified video_type from Shorts detection)
  const today = new Date().toISOString().split('T')[0];
  const shorts = videosToUpsert.filter(v => v.video_type === 'short');
  const longs = videosToUpsert.filter(v => v.video_type === 'long');

  // Get previous snapshot
  const { data: prevSnapshot } = await supabase
    .from('channel_snapshots')
    .select('*')
    .eq('channel_id', channel.id)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  await supabase
    .from('channel_snapshots')
    .upsert({
      channel_id: channel.id,
      snapshot_date: today,
      subscriber_count: channelDetails.subscriber_count,
      total_view_count: channelDetails.total_view_count,
      video_count: channelDetails.video_count,
      subscriber_change: prevSnapshot
        ? channelDetails.subscriber_count - prevSnapshot.subscriber_count
        : null,
      view_change: prevSnapshot
        ? channelDetails.total_view_count - prevSnapshot.total_view_count
        : null,
      video_change: prevSnapshot
        ? channelDetails.video_count - prevSnapshot.video_count
        : null,
      shorts_count: shorts.length,
      longs_count: longs.length,
      avg_views_per_video: videos.length > 0
        ? videos.reduce((sum, v) => sum + v.view_count, 0) / videos.length
        : 0,
      avg_engagement_rate: videos.length > 0
        ? videos.reduce((sum, v) => sum + (v.like_count + v.comment_count) / Math.max(v.view_count, 1), 0) / videos.length
        : 0,
    }, { onConflict: 'channel_id,snapshot_date' });

  // Create video snapshots for view velocity tracking
  if (videos.length > 0) {
    // Get previous video snapshots for velocity calculation
    const videoIds = videos.map(v => v.youtube_video_id);
    const { data: existingVideos } = await supabase
      .from('videos')
      .select('id, youtube_video_id')
      .in('youtube_video_id', videoIds);

    const videoIdMap = {};
    for (const v of existingVideos || []) {
      videoIdMap[v.youtube_video_id] = v.id;
    }

    const { data: prevSnapshots } = await supabase
      .from('video_snapshots')
      .select('video_id, view_count')
      .in('video_id', Object.values(videoIdMap))
      .eq('snapshot_date', new Date(Date.now() - 86400000).toISOString().split('T')[0]);

    const prevViewMap = {};
    for (const s of prevSnapshots || []) {
      prevViewMap[s.video_id] = s.view_count;
    }

    const videoSnapshots = videos
      .filter(v => videoIdMap[v.youtube_video_id])
      .map(v => {
        const dbId = videoIdMap[v.youtube_video_id];
        const prevViews = prevViewMap[dbId];
        return {
          video_id: dbId,
          snapshot_date: today,
          view_count: v.view_count,
          like_count: v.like_count,
          comment_count: v.comment_count,
          view_velocity: prevViews != null ? v.view_count - prevViews : null,
        };
      });

    if (videoSnapshots.length > 0) {
      await supabase
        .from('video_snapshots')
        .upsert(videoSnapshots, { onConflict: 'video_id,snapshot_date' });
    }
  }

  return videos.length;
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  // Verify cron secret (optional but recommended)
  const cronSecret = req.headers['x-vercel-cron-secret'];
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'YouTube API key not configured' });
  }

  // Create sync log
  const { data: syncLog, error: syncLogError } = await supabase
    .from('sync_log')
    .insert({ sync_type: 'scheduled' })
    .select()
    .single();

  if (syncLogError) {
    return res.status(500).json({ error: 'Failed to create sync log', details: syncLogError.message });
  }

  const results = {
    channels_synced: 0,
    videos_synced: 0,
    handles_resolved: 0,
    youtube_api_calls: 0,
    errors: [],
  };

  try {
    // Get all channels with sync enabled
    const { data: channels, error: channelsError } = await supabase
      .from('channels')
      .select('*')
      .eq('sync_enabled', true);

    if (channelsError) throw channelsError;

    for (const channel of channels || []) {
      let syncTarget = channel;

      // Phase 1: Resolve handle_ placeholder IDs to real YouTube UC IDs
      if (channel.youtube_channel_id.startsWith('handle_')) {
        try {
          const resolvedId = await resolveHandleToChannelId(channel, apiKey);
          results.youtube_api_calls += 1; // Search API call

          // Update the channel record with the real YouTube ID
          const { error: updateError } = await supabase
            .from('channels')
            .update({ youtube_channel_id: resolvedId })
            .eq('id', channel.id);

          if (updateError) throw updateError;

          // Use the resolved ID for sync
          syncTarget = { ...channel, youtube_channel_id: resolvedId };
          results.handles_resolved++;
          console.log(`[Resolve] ${channel.name}: ${channel.youtube_channel_id} → ${resolvedId}`);

          // Rate limit between handle resolutions (Search API is expensive)
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (resolveErr) {
          // Log the error but don't crash — skip this channel for now
          results.errors.push({
            channel: channel.name,
            error: `Handle resolution failed: ${resolveErr.message}`,
          });
          // Don't attempt sync with a handle_ ID — it will fail
          await new Promise(resolve => setTimeout(resolve, 200));
          continue;
        }
      }

      // Phase 2: Sync the channel (fetch stats, videos, create snapshots)
      try {
        const videosCount = await syncChannel(syncTarget, apiKey);
        results.channels_synced++;
        results.videos_synced += videosCount;
        results.youtube_api_calls += 3; // channels.list + playlistItems + videos.list
      } catch (err) {
        results.errors.push({ channel: channel.name, error: err.message });
      }

      // Rate limiting between channels
      await new Promise(resolve => setTimeout(resolve, 200));
    }

  } catch (err) {
    results.errors.push({ error: err.message });
  }

  // Complete sync log
  await supabase
    .from('sync_log')
    .update({
      completed_at: new Date().toISOString(),
      status: results.errors.length > 0 ? 'failed' : 'completed',
      channels_synced: results.channels_synced,
      videos_synced: results.videos_synced,
      youtube_api_calls: results.youtube_api_calls,
      errors: results.errors,
    })
    .eq('id', syncLog.id);

  return res.status(200).json({
    success: true,
    handles_resolved: results.handles_resolved,
    ...results,
  });
}
