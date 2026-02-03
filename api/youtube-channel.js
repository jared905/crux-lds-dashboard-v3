/**
 * Vercel Serverless Function - YouTube Channel Stats Proxy
 * Proxies YouTube Data API calls server-side to bypass HTTP referrer restrictions.
 *
 * Accepts:
 *   - videoIds: array of YouTube video IDs → resolves to channelIds via videos.list
 *   - channelIds: array of UC... channel IDs → fetches stats directly
 *   - handles: array of { name, url } → resolves @handles/URLs to channelIds via
 *     channels.list (forHandle) or search.list, then fetches stats
 *
 * Returns: { videoResults, channels, handleResults }
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Resolve a YouTube URL or @handle to a UC channel ID.
 * Tries forHandle first (1 unit), falls back to search.list (100 units).
 */
async function resolveHandle(input, apiKey) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  // Direct UC channel ID
  if (/^UC[\w-]{22}$/.test(trimmed)) return trimmed;

  // youtube.com/channel/UC...
  if (trimmed.includes('youtube.com/channel/')) {
    return trimmed.split('youtube.com/channel/')[1].split(/[?/]/)[0];
  }

  // Extract handle from various formats
  let handle = null;
  if (trimmed.includes('youtube.com/@')) {
    handle = trimmed.split('@')[1].split(/[?/]/)[0];
  } else if (trimmed.startsWith('@')) {
    handle = trimmed.slice(1).split(/[?/]/)[0];
  } else if (trimmed.includes('youtube.com/c/')) {
    handle = trimmed.split('youtube.com/c/')[1].split(/[?/]/)[0];
  } else if (trimmed.includes('youtube.com/user/')) {
    handle = trimmed.split('youtube.com/user/')[1].split(/[?/]/)[0];
  } else if (trimmed.length > 2 && !trimmed.includes('/')) {
    handle = trimmed;
  }

  if (!handle) return null;

  // Try forHandle (1 quota unit)
  try {
    const url = new URL(`${YOUTUBE_API_BASE}/channels`);
    url.searchParams.append('part', 'id');
    url.searchParams.append('forHandle', handle);
    url.searchParams.append('key', apiKey);
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.items && data.items.length > 0) {
        return data.items[0].id;
      }
    }
  } catch { /* try search fallback */ }

  // Fallback: search.list (100 quota units)
  try {
    const url = new URL(`${YOUTUBE_API_BASE}/search`);
    url.searchParams.append('part', 'snippet');
    url.searchParams.append('type', 'channel');
    url.searchParams.append('q', '@' + handle);
    url.searchParams.append('maxResults', '1');
    url.searchParams.append('key', apiKey);
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.items && data.items.length > 0) {
        return data.items[0].snippet.channelId;
      }
    }
  } catch { /* resolution failed */ }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey: clientKey, videoIds, channelIds, handles } = req.body || {};

  // Prefer the server-side env var (no referrer restrictions) over the client-provided key
  const serverKey = process.env.YOUTUBE_API_KEY;
  const apiKey = serverKey || clientKey;
  const keySource = serverKey ? 'env' : 'client';

  if (!apiKey) {
    return res.status(400).json({ error: 'apiKey required' });
  }

  try {
    const videoResults = {};
    const handleResults = {};
    const resolvedChannelIds = new Set(channelIds || []);
    const _debug = { keySource, keyPrefix: apiKey.slice(0, 8) + '...' };

    // Step 1a: If videoIds provided, resolve them to channelIds
    if (Array.isArray(videoIds) && videoIds.length > 0) {
      const ids = videoIds.slice(0, 50).filter(Boolean);
      if (ids.length > 0) {
        const url = new URL(`${YOUTUBE_API_BASE}/videos`);
        url.searchParams.append('part', 'snippet');
        url.searchParams.append('id', ids.join(','));
        url.searchParams.append('key', apiKey);

        const response = await fetch(url);
        _debug.videosStatus = response.status;
        if (response.ok) {
          const data = await response.json();
          _debug.videosItemCount = (data.items || []).length;
          for (const item of (data.items || [])) {
            resolvedChannelIds.add(item.snippet.channelId);
            videoResults[item.id] = {
              videoId: item.id,
              channelId: item.snippet.channelId,
              channelTitle: item.snippet.channelTitle,
            };
          }
        } else {
          const errBody = await response.text();
          _debug.videosError = errBody.slice(0, 300);
        }
      }
    }

    // Step 1b: If handles provided, resolve each to a channelId
    if (Array.isArray(handles) && handles.length > 0) {
      await Promise.all(handles.map(async ({ name, url: handleUrl }) => {
        try {
          const chId = await resolveHandle(handleUrl, apiKey);
          if (chId) {
            resolvedChannelIds.add(chId);
            handleResults[name] = { channelId: chId, input: handleUrl };
          }
        } catch {
          // skip this handle
        }
      }));
    }

    // Step 2: Fetch channel stats for all resolved channel IDs
    const uniqueChannelIds = [...resolvedChannelIds].filter(Boolean);
    const channels = {};

    if (uniqueChannelIds.length > 0) {
      for (let i = 0; i < uniqueChannelIds.length; i += 50) {
        const batch = uniqueChannelIds.slice(i, i + 50);
        const url = new URL(`${YOUTUBE_API_BASE}/channels`);
        url.searchParams.append('part', 'statistics,snippet');
        url.searchParams.append('id', batch.join(','));
        url.searchParams.append('key', apiKey);

        const response = await fetch(url);
        if (!response.ok) continue;

        const data = await response.json();
        for (const item of (data.items || [])) {
          channels[item.id] = {
            channelId: item.id,
            title: item.snippet.title,
            customUrl: item.snippet.customUrl,
            thumbnailUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
            subscriberCount: parseInt(item.statistics.subscriberCount) || 0,
            viewCount: parseInt(item.statistics.viewCount) || 0,
            videoCount: parseInt(item.statistics.videoCount) || 0,
            hiddenSubscriberCount: item.statistics.hiddenSubscriberCount || false,
          };
        }
      }
    }

    return res.status(200).json({ videoResults, handleResults, channels, _debug });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
