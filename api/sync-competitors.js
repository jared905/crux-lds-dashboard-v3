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
 * Fetch recent videos from a channel — last 90 days window.
 * Pages through the uploads playlist until videos are older than the cutoff,
 * with a hard ceiling so very high-cadence channels don't blow quota.
 */
async function fetchChannelVideos(uploadsPlaylistId, apiKey, options = {}) {
  const { windowDays = 90, hardCap = 500 } = options;
  const cutoff = new Date(Date.now() - windowDays * 86400000);

  const collected = [];
  let pageToken = null;

  while (collected.length < hardCap) {
    const url = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
    url.searchParams.append('part', 'snippet,contentDetails');
    url.searchParams.append('playlistId', uploadsPlaylistId);
    url.searchParams.append('maxResults', '50');
    if (pageToken) url.searchParams.append('pageToken', pageToken);
    url.searchParams.append('key', apiKey);

    const resp = await fetch(url.toString());
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.items?.length) break;

    let crossedCutoff = false;
    for (const item of data.items) {
      const publishedAt = item.contentDetails.videoPublishedAt || item.snippet.publishedAt;
      if (publishedAt && new Date(publishedAt) < cutoff) {
        crossedCutoff = true;
        break;
      }
      collected.push(item.contentDetails.videoId);
      if (collected.length >= hardCap) break;
    }

    if (crossedCutoff || !data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  if (collected.length === 0) return [];

  // Fetch full stats for collected videos in batches of 50
  const out = [];
  for (let i = 0; i < collected.length; i += 50) {
    const batch = collected.slice(i, i + 50);
    const videosResponse = await fetch(
      `${YOUTUBE_API_BASE}/videos?part=statistics,contentDetails,snippet,status&id=${batch.join(',')}&key=${apiKey}`
    );
    const videosData = await videosResponse.json();
    if (videosData.error) throw new Error(videosData.error.message);

    for (const video of videosData.items || []) {
      out.push({
        youtube_video_id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnail_url: video.snippet.thumbnails?.medium?.url,
        published_at: video.snippet.publishedAt,
        duration_seconds: parseDuration(video.contentDetails.duration),
        view_count: parseInt(video.statistics.viewCount) || 0,
        like_count: parseInt(video.statistics.likeCount) || 0,
        comment_count: parseInt(video.statistics.commentCount) || 0,
        privacy_status: video.status?.privacyStatus || null,
      });
    }
  }

  return out;
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
  const attemptAt = new Date().toISOString();

  // Fetch fresh data from YouTube. On failure, persist the error so the row
  // doesn't look "merely stale" — caller catches and re-throws.
  // Migration 104: also write per-source freshness so the badge can show
  // "data_api: error" instead of letting the row look fresh.
  let channelDetails;
  try {
    channelDetails = await fetchChannelDetails(channel.youtube_channel_id, apiKey);
  } catch (err) {
    const msg = (err.message || String(err)).slice(0, 500);
    await supabase
      .from('channels')
      .update({
        last_sync_attempt_at: attemptAt,
        last_sync_error: msg,
        last_data_api_pull_error: msg,
      })
      .eq('id', channel.id);
    throw err;
  }

  // Update channel record (success path clears any prior error)
  const nowIso = new Date().toISOString();
  await supabase
    .from('channels')
    .update({
      name: channelDetails.name,
      subscriber_count: channelDetails.subscriber_count,
      total_view_count: channelDetails.total_view_count,
      video_count: channelDetails.video_count,
      last_synced_at: nowIso,
      last_sync_attempt_at: attemptAt,
      last_sync_error: null,
      last_data_api_pull_at: nowIso,
      last_data_api_pull_error: null,
    })
    .eq('id', channel.id);

  // Fetch and update videos. Window is wider for client channels: a
  // competitor's 2019 archive is noise for the cohort analysis, but
  // the client's own history IS the baseline for production-approach +
  // audience-signal extraction. Without this, a client that's gone
  // dormant for 90+ days returns zero videos from sync and looks
  // pre-launch to the deliverable.
  let videos = [];
  let videosToUpsert = [];
  if (channelDetails.uploads_playlist_id) {
    const windowDays = channel.is_client ? 1825 : 90;  // 5 years for clients, 90 days for competitors
    videos = await fetchChannelVideos(channelDetails.uploads_playlist_id, apiKey, { windowDays });

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
        const engagement = v.view_count > 0
          ? ((v.like_count + v.comment_count) / v.view_count)
          : null;
        return {
          video_id: dbId,
          snapshot_date: today,
          view_count: v.view_count,
          like_count: v.like_count,
          comment_count: v.comment_count,
          view_velocity: prevViews != null ? v.view_count - prevViews : null,
          engagement_rate: engagement,
        };
      });

    if (videoSnapshots.length > 0) {
      // Strip any column rejected by the schema cache (e.g. before migration 062)
      const tryUpsert = async (payload) => await supabase
        .from('video_snapshots')
        .upsert(payload, { onConflict: 'video_id,snapshot_date' });

      let { error } = await tryUpsert(videoSnapshots);
      let attempts = 0;
      let scrubbedPayload = videoSnapshots;
      while (error && attempts < 3 && error.message?.includes("Could not find the '")) {
        const match = error.message.match(/'([^']+)' column/);
        const missing = match?.[1];
        if (!missing) break;
        scrubbedPayload = scrubbedPayload.map(s => { const c = { ...s }; delete c[missing]; return c; });
        const retry = await tryUpsert(scrubbedPayload);
        error = retry.error;
        attempts++;
      }
      if (error) console.warn('[sync-competitors] snapshot upsert failed:', error.message);
    }

    // === views_at_48h capture ===
    // For videos published between 36-60 hours ago that don't yet have views_at_48h set,
    // freeze the current view count as the canonical 48h figure.
    const now = Date.now();
    const eligible = videos
      .filter(v => videoIdMap[v.youtube_video_id])
      .filter(v => {
        if (!v.published_at) return false;
        const ageHours = (now - new Date(v.published_at).getTime()) / 3600000;
        return ageHours >= 36 && ageHours <= 60;
      });

    if (eligible.length > 0) {
      const ytIds = eligible.map(v => v.youtube_video_id);
      const { data: existing } = await supabase
        .from('videos')
        .select('id, youtube_video_id, views_at_48h')
        .in('youtube_video_id', ytIds);

      const updates = (existing || [])
        .filter(row => row.views_at_48h == null)
        .map(row => {
          const fresh = eligible.find(v => v.youtube_video_id === row.youtube_video_id);
          return fresh ? { id: row.id, views_at_48h: fresh.view_count } : null;
        })
        .filter(Boolean);

      for (const u of updates) {
        const { error } = await supabase.from('videos').update({ views_at_48h: u.views_at_48h }).eq('id', u.id);
        if (error && !error.message?.includes("Could not find the 'views_at_48h'")) {
          console.warn('[sync-competitors] views_at_48h update failed:', error.message);
        }
      }
    }
  }

  return videos.length;
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  // Verify auth: cron secret OR ?manual=true. Vercel cron sends
  // "Authorization: Bearer <CRON_SECRET>" — NOT a custom header. The
  // previous x-vercel-cron-secret check was rejecting every cron firing,
  // which is why the queue went 3 months stale.
  const authHeader = req.headers.authorization;
  const manualTrigger = req.query?.manual === 'true';
  if (!manualTrigger && process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
    channels_skipped_fresh: 0,
    channels_remaining: 0,
    videos_synced: 0,
    handles_skipped: 0,
    youtube_api_calls: 0,
    errors: [],
    timed_out: false,
  };

  // Time budget: Vercel functions cap at 300s, leave 30s buffer for cleanup
  const startTime = Date.now();
  const TIME_BUDGET_MS = 270_000;
  // Skip channels synced within this window (let the next invocation handle stale ones)
  const skipIfSyncedWithinHours = Number(req.query?.skipIfFreshHours || 12);
  const skipIfSyncedCutoff = Date.now() - skipIfSyncedWithinHours * 3600_000;
  const channelLimit = req.query?.limit ? Number(req.query.limit) : null;
  // Concurrency — careful with YouTube quota (default 10K/day per project)
  const concurrency = Number(req.query?.concurrency || 3);

  try {
    // Order least-recently-synced first so each invocation makes progress
    const { data: channels, error: channelsError } = await supabase
      .from('channels')
      .select('*')
      .eq('sync_enabled', true)
      .order('last_synced_at', { ascending: true, nullsFirst: true });

    if (channelsError) throw channelsError;

    // Filter out handles, recently-synced, and recently-failed channels.
    // Recent failures get a 2h backoff so they don't permanently squat at
    // the head of the queue (failures don't bump last_synced_at, so
    // without backoff they'd be retried every single pass forever).
    const FAIL_BACKOFF_MS = 2 * 3600_000;
    const failBackoffCutoff = Date.now() - FAIL_BACKOFF_MS;
    const eligible = [];
    for (const ch of channels || []) {
      if (ch.youtube_channel_id?.startsWith('handle_')) {
        results.handles_skipped++;
        continue;
      }
      if (ch.last_synced_at && new Date(ch.last_synced_at).getTime() > skipIfSyncedCutoff) {
        results.channels_skipped_fresh++;
        continue;
      }
      if (ch.last_sync_error && ch.last_sync_attempt_at &&
          new Date(ch.last_sync_attempt_at).getTime() > failBackoffCutoff) {
        results.channels_skipped_fresh++;
        continue;
      }
      eligible.push(ch);
    }
    // Slice to the per-invocation limit but track TRUE remaining (eligible
    // - this slice) so the caller chain knows when work is actually done.
    const queue = channelLimit ? eligible.slice(0, channelLimit) : eligible;
    const globalRemaining = Math.max(0, eligible.length - queue.length);

    // Process in parallel batches with a time guard
    let index = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (index < queue.length) {
        if (Date.now() - startTime > TIME_BUDGET_MS) {
          results.timed_out = true;
          break;
        }
        const channel = queue[index++];
        try {
          const videosCount = await syncChannel(channel, apiKey);
          results.channels_synced++;
          results.videos_synced += videosCount;
          results.youtube_api_calls += 3;
        } catch (err) {
          results.errors.push({ channel: channel.name, error: err.message });
        }
      }
    });
    await Promise.all(workers);

    // True global remaining: channels still in the eligible pool that
    // weren't part of this invocation's sliced queue. Plus anything we
    // didn't get to inside this invocation's queue (time budget).
    const thisSliceRemaining = Math.max(0, queue.length - index);
    results.channels_remaining = globalRemaining + thisSliceRemaining;

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

  // ── Cron self-chain ──
  // When called by the Vercel cron (not manual), if the queue still has
  // channels to process, fire-and-forget a follow-up invocation. This
  // makes the daily cron drain the whole queue overnight without the
  // user having to babysit the Refresh button. Bounded by chainDepth to
  // prevent runaway loops.
  const chainDepth = Number(req.query?.chainDepth || 0);
  const CHAIN_MAX = 20;
  if (!manualTrigger && results.channels_remaining > 0 && chainDepth < CHAIN_MAX) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    if (host && process.env.CRON_SECRET) {
      // Fire-and-forget. Use a short timeout so we don't block the response.
      const url = `${proto}://${host}/api/sync-competitors?chainDepth=${chainDepth + 1}`;
      fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      }).catch(err => console.warn('[sync chain] follow-up failed:', err.message));
    }
  }

  return res.status(200).json({
    success: true,
    handles_skipped: results.handles_skipped,
    chain_depth: chainDepth,
    chain_continued: !manualTrigger && results.channels_remaining > 0 && chainDepth < CHAIN_MAX,
    ...results,
  });
}
