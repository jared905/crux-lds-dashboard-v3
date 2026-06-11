/**
 * Vercel Serverless Function — YouTube comment sweep for a single
 * competitor channel.
 *
 * Resolves a channel's uploads playlist, takes the top N recent videos,
 * fetches commentThreads.list for each, and returns a flat array of
 * top-level comments with full source-video attribution. Caller (the
 * commentSweepService) is responsible for heuristic classification and
 * persistence.
 *
 * Accepts: POST {
 *   channelId:           string  — YouTube channel ID (UC...) OR @handle
 *                                  (handles get resolved first)
 *   maxVideos:           number  — default 10, max 25 (quota guard)
 *   maxCommentsPerVideo: number  — default 50, max 100 (one API page)
 * }
 *
 * Returns: {
 *   ok: true,
 *   channel:       { id, title },
 *   videosSampled: N,
 *   commentsFetched: M,
 *   comments: [
 *     {
 *       commentId, text, author, likeCount, publishedAt,
 *       videoId, videoTitle, videoPublishedAt
 *     }
 *   ],
 *   quotaUsed:     approx_units_spent,
 *   errors:        [ ...non-fatal per-video errors ]
 * }
 *
 * Quota math (per 2026-06-10 deep-research synthesis):
 *   - channels.list:        1 unit
 *   - playlistItems.list:   1 unit (one page = 50 videos)
 *   - commentThreads.list:  1 unit per page (max 100 threads/page)
 * For a default-sized sweep (10 videos, 50 comments each):
 *   1 (channel) + 1 (uploads playlist) + 10 (comments) = ~12 units
 *   against a 10,000-unit/day quota. Negligible.
 */

const YT = 'https://www.googleapis.com/youtube/v3';
const REQUEST_TIMEOUT_MS = 12_000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'POST only' });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'YOUTUBE_API_KEY not configured' });

  const {
    channelId,
    maxVideos = 10,
    maxCommentsPerVideo = 50,
  } = req.body || {};

  if (!channelId || typeof channelId !== 'string') {
    return res.status(400).json({ ok: false, error: 'channelId required' });
  }
  const videoCap   = Math.min(Math.max(1, Number(maxVideos) || 10), 25);
  const commentCap = Math.min(Math.max(1, Number(maxCommentsPerVideo) || 50), 100);

  let quotaUsed = 0;
  const errors  = [];

  try {
    // 1. Resolve handle → channel ID if needed, then fetch channel
    //    metadata + uploads playlist ID. One unit either way.
    const channel = await resolveChannel(channelId.trim(), apiKey);
    quotaUsed += 1;
    if (!channel) {
      return res.status(404).json({ ok: false, error: `Channel not found: ${channelId}` });
    }

    // 2. Fetch recent uploads from the uploads playlist.
    const videos = await fetchRecentUploads(channel.uploadsPlaylistId, videoCap, apiKey);
    quotaUsed += 1;

    if (videos.length === 0) {
      return res.status(200).json({
        ok: true,
        channel: { id: channel.id, title: channel.title },
        videosSampled: 0,
        commentsFetched: 0,
        comments: [],
        quotaUsed,
        errors: ['Channel has no public uploads'],
      });
    }

    // 3. Fetch comments per video. Serial-ish to keep quota-spend
    //    deterministic and avoid burst rate-limiting. With small N
    //    (≤25 videos) the latency is acceptable.
    const allComments = [];
    for (const v of videos) {
      try {
        const comments = await fetchVideoComments(v.videoId, commentCap, apiKey);
        quotaUsed += 1;
        for (const c of comments) {
          allComments.push({
            ...c,
            videoId:           v.videoId,
            videoTitle:        v.title,
            videoPublishedAt:  v.publishedAt,
          });
        }
      } catch (err) {
        errors.push(`video ${v.videoId}: ${err?.message || 'fetch failed'}`);
      }
    }

    return res.status(200).json({
      ok: true,
      channel:         { id: channel.id, title: channel.title },
      videosSampled:   videos.length,
      commentsFetched: allComments.length,
      comments:        allComments,
      quotaUsed,
      errors,
    });
  } catch (err) {
    console.warn('[youtube-comment-sweep] failed:', err?.message);
    return res.status(500).json({
      ok: false,
      error: err?.message || 'sweep failed',
      quotaUsed,
      errors,
    });
  }
}

// ──────────────────────────────────────────────────
// YouTube API helpers
// ──────────────────────────────────────────────────

/**
 * Look up a channel by ID, custom URL/handle, or username. Returns
 * { id, title, uploadsPlaylistId } or null.
 */
async function resolveChannel(input, apiKey) {
  // Direct channel ID (UC...) — channels.list?id=
  if (/^UC[\w-]{22}$/.test(input)) {
    return channelsListById(input, apiKey);
  }
  // Handle (@foo) — channels.list?forHandle=@foo
  if (input.startsWith('@')) {
    return channelsListByHandle(input, apiKey);
  }
  // Anything else — try ID first (some channels have custom-shaped IDs),
  // then fall back to handle treatment.
  const byId = await channelsListById(input, apiKey);
  if (byId) return byId;
  return channelsListByHandle(input.startsWith('@') ? input : `@${input}`, apiKey);
}

async function channelsListById(id, apiKey) {
  const url = new URL(`${YT}/channels`);
  url.searchParams.append('part', 'snippet,contentDetails');
  url.searchParams.append('id', id);
  url.searchParams.append('key', apiKey);
  const data = await fetchJson(url);
  const item = data?.items?.[0];
  return item ? unpackChannel(item) : null;
}

async function channelsListByHandle(handle, apiKey) {
  const url = new URL(`${YT}/channels`);
  url.searchParams.append('part', 'snippet,contentDetails');
  url.searchParams.append('forHandle', handle);
  url.searchParams.append('key', apiKey);
  const data = await fetchJson(url);
  const item = data?.items?.[0];
  return item ? unpackChannel(item) : null;
}

function unpackChannel(item) {
  return {
    id:                  item.id,
    title:               item.snippet?.title || '(unknown)',
    uploadsPlaylistId:   item.contentDetails?.relatedPlaylists?.uploads || null,
  };
}

async function fetchRecentUploads(playlistId, cap, apiKey) {
  if (!playlistId) return [];
  const url = new URL(`${YT}/playlistItems`);
  url.searchParams.append('part', 'snippet,contentDetails');
  url.searchParams.append('playlistId', playlistId);
  url.searchParams.append('maxResults', String(Math.min(cap, 50)));
  url.searchParams.append('key', apiKey);
  const data = await fetchJson(url);
  return (data?.items || [])
    .map(it => ({
      videoId:     it.contentDetails?.videoId,
      title:       it.snippet?.title || '',
      publishedAt: it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt || null,
    }))
    .filter(v => v.videoId)
    .slice(0, cap);
}

async function fetchVideoComments(videoId, cap, apiKey) {
  const url = new URL(`${YT}/commentThreads`);
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('videoId', videoId);
  url.searchParams.append('maxResults', String(Math.min(cap, 100)));
  url.searchParams.append('order', 'relevance');
  url.searchParams.append('textFormat', 'plainText');
  url.searchParams.append('key', apiKey);
  let data;
  try {
    data = await fetchJson(url);
  } catch (err) {
    // Channels with disabled comments return 403; that's expected, not fatal.
    if (/commentsDisabled|forbidden|403/i.test(err?.message || '')) return [];
    throw err;
  }
  return (data?.items || []).map(item => {
    const s = item.snippet?.topLevelComment?.snippet;
    return {
      commentId:    item.snippet?.topLevelComment?.id || item.id,
      text:         s?.textDisplay || '',
      author:       s?.authorDisplayName || null,
      likeCount:    s?.likeCount || 0,
      publishedAt:  s?.publishedAt || null,
    };
  });
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) {
      const errData = await r.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `HTTP ${r.status}`);
    }
    return r.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('YouTube API request timed out');
    throw err;
  }
}
