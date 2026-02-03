/**
 * Vercel Serverless Function - YouTube Channel Stats Proxy
 * Proxies YouTube Data API calls server-side to bypass HTTP referrer restrictions.
 * Falls back to Supabase-cached stats when YouTube API quota is exhausted (403).
 *
 * Accepts:
 *   - videoIds: array of YouTube video IDs → resolves to channelIds via videos.list
 *   - channelIds: array of UC... channel IDs → fetches stats directly
 *   - handles: array of { name, url } → resolves @handles/URLs to channelIds via
 *     channels.list (forHandle) or search.list, then fetches stats
 *
 * Returns: { videoResults, channels, handleResults }
 */

import { createClient } from '@supabase/supabase-js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Supabase client for caching (same pattern as sync-competitors.js)
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

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

/**
 * Cache successful YouTube API channel stats to Supabase.
 * Updates the channels table and creates a channel_snapshots row.
 */
async function cacheChannelStats(channelData) {
  try {
    // Find the channel in Supabase by youtube_channel_id
    const { data: existing } = await supabase
      .from('channels')
      .select('id, subscriber_count')
      .eq('youtube_channel_id', channelData.channelId)
      .single();

    if (existing) {
      // Update the channels table with fresh API data
      await supabase
        .from('channels')
        .update({
          subscriber_count: channelData.subscriberCount,
          total_view_count: channelData.viewCount,
          video_count: channelData.videoCount,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      // Also create/update a channel_snapshots row for today
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('channel_snapshots')
        .upsert({
          channel_id: existing.id,
          snapshot_date: today,
          subscriber_count: channelData.subscriberCount,
          total_view_count: channelData.viewCount,
          video_count: channelData.videoCount,
          subscriber_change: channelData.subscriberCount - (existing.subscriber_count || 0),
        }, { onConflict: 'channel_id,snapshot_date' });
    }
  } catch (err) {
    // Caching is best-effort, don't fail the request
    console.warn('[Cache] Failed to cache channel stats:', err.message);
  }
}

/**
 * Look up cached channel stats from Supabase when YouTube API is unavailable.
 * Resolves video IDs → channel via the videos table, handles via custom_url,
 * and direct channel IDs. Then reads cached stats from channels + channel_snapshots.
 */
async function getCachedStats(videoIds, channelIds, handles) {
  const channels = {};
  const videoResults = {};
  const handleResults = {};

  try {
    const resolvedChannelDbIds = new Set();

    // Strategy 1: Resolve video IDs via the videos table (thumbnail_url contains real YT video IDs)
    if (videoIds && videoIds.length > 0) {
      for (const vid of videoIds) {
        const { data: videoRows } = await supabase
          .from('videos')
          .select('channel_id')
          .like('thumbnail_url', `%${vid}%`)
          .limit(1);

        if (videoRows && videoRows.length > 0) {
          resolvedChannelDbIds.add(videoRows[0].channel_id);
        }
      }
    }

    // Strategy 2: Resolve handles/URLs via multiple matching approaches
    if (handles && handles.length > 0) {
      for (const { name, url: handleUrl } of handles) {
        if (!handleUrl) continue;
        console.log('[Cache] Resolving handle:', { name, url: handleUrl });

        // 2a: Exact match on custom_url
        const { data: byUrl } = await supabase
          .from('channels')
          .select('id, youtube_channel_id')
          .eq('custom_url', handleUrl)
          .limit(1);

        if (byUrl && byUrl.length > 0) {
          console.log('[Cache] Matched via custom_url exact:', byUrl[0].youtube_channel_id);
          resolvedChannelDbIds.add(byUrl[0].id);
          handleResults[name] = { channelId: byUrl[0].youtube_channel_id, input: handleUrl };
          continue;
        }

        // 2b: Extract handle from URL and try matching custom_url with ilike
        let handle = null;
        if (handleUrl.includes('youtube.com/@')) {
          handle = handleUrl.split('@')[1].split(/[?/]/)[0];
        } else if (handleUrl.startsWith('@')) {
          handle = handleUrl.slice(1);
        }

        if (handle) {
          // Try matching custom_url containing the handle
          const { data: byHandle } = await supabase
            .from('channels')
            .select('id, youtube_channel_id')
            .ilike('custom_url', `%${handle}%`)
            .limit(1);

          if (byHandle && byHandle.length > 0) {
            console.log('[Cache] Matched via custom_url ilike:', byHandle[0].youtube_channel_id);
            resolvedChannelDbIds.add(byHandle[0].id);
            handleResults[name] = { channelId: byHandle[0].youtube_channel_id, input: handleUrl };
            continue;
          }

          // Try matching youtube_channel_id = handle_XXX
          const { data: byHandleId } = await supabase
            .from('channels')
            .select('id, youtube_channel_id')
            .eq('youtube_channel_id', `handle_${handle}`)
            .limit(1);

          if (byHandleId && byHandleId.length > 0) {
            console.log('[Cache] Matched via handle_ ID:', byHandleId[0].youtube_channel_id);
            resolvedChannelDbIds.add(byHandleId[0].id);
            handleResults[name] = { channelId: byHandleId[0].youtube_channel_id, input: handleUrl };
            continue;
          }
        }

        // 2c: Search channel_urls_map JSONB for this URL
        // channel_urls_map stores { "ChannelName": "https://youtube.com/@handle" }
        const { data: byMap } = await supabase
          .from('channels')
          .select('id, youtube_channel_id')
          .neq('channel_urls_map', '{}')
          .not('channel_urls_map', 'is', null);

        if (byMap && byMap.length > 0) {
          // Need to check each channel's map since Supabase can't search JSONB values easily
          // Fetch the actual maps for these channels
          const { data: withMaps } = await supabase
            .from('channels')
            .select('id, youtube_channel_id, channel_urls_map')
            .eq('is_competitor', false);

          for (const ch of withMaps || []) {
            const map = ch.channel_urls_map || {};
            const urls = Object.values(map);
            if (urls.some(u => u === handleUrl || (handle && u.toLowerCase().includes(handle.toLowerCase())))) {
              console.log('[Cache] Matched via channel_urls_map:', ch.youtube_channel_id);
              resolvedChannelDbIds.add(ch.id);
              handleResults[name] = { channelId: ch.youtube_channel_id, input: handleUrl };
              break;
            }
          }
        }

        // 2d: Last resort — find non-competitor channels (client channels) and return the first match
        if (resolvedChannelDbIds.size === 0) {
          const { data: clientChannels } = await supabase
            .from('channels')
            .select('id, youtube_channel_id, name, custom_url')
            .eq('is_competitor', false)
            .limit(5);

          console.log('[Cache] Client channels found:', clientChannels?.map(c => ({
            id: c.youtube_channel_id, name: c.name, custom_url: c.custom_url
          })));

          // Try name-based matching or just use the first client channel if only one exists
          if (clientChannels && clientChannels.length === 1) {
            console.log('[Cache] Single client channel, using it:', clientChannels[0].youtube_channel_id);
            resolvedChannelDbIds.add(clientChannels[0].id);
            handleResults[name] = { channelId: clientChannels[0].youtube_channel_id, input: handleUrl };
          }
        }
      }
    }

    // Strategy 3: Direct channel IDs
    if (channelIds && channelIds.length > 0) {
      const { data: channelRows } = await supabase
        .from('channels')
        .select('id, youtube_channel_id')
        .in('youtube_channel_id', channelIds);

      for (const ch of channelRows || []) {
        resolvedChannelDbIds.add(ch.id);
      }
    }

    if (resolvedChannelDbIds.size === 0) return { channels, videoResults, handleResults };

    const dbIds = [...resolvedChannelDbIds];

    // Fetch channel records
    const { data: channelRows } = await supabase
      .from('channels')
      .select('id, youtube_channel_id, name, custom_url, thumbnail_url, subscriber_count, total_view_count, video_count')
      .in('id', dbIds);

    // Get the latest snapshot for each channel (may have more recent data)
    const { data: snapshots } = await supabase
      .from('channel_snapshots')
      .select('channel_id, subscriber_count, total_view_count, video_count, snapshot_date')
      .in('channel_id', dbIds)
      .order('snapshot_date', { ascending: false })
      .limit(dbIds.length);

    const latestSnapshot = {};
    for (const snap of snapshots || []) {
      if (!latestSnapshot[snap.channel_id]) {
        latestSnapshot[snap.channel_id] = snap;
      }
    }

    for (const ch of channelRows || []) {
      const snap = latestSnapshot[ch.id];
      const subCount = snap?.subscriber_count || ch.subscriber_count || 0;
      const viewCount = snap?.total_view_count || ch.total_view_count || 0;
      const vidCount = snap?.video_count || ch.video_count || 0;

      channels[ch.youtube_channel_id] = {
        channelId: ch.youtube_channel_id,
        title: ch.name,
        customUrl: ch.custom_url,
        thumbnailUrl: ch.thumbnail_url,
        subscriberCount: subCount,
        viewCount: viewCount,
        videoCount: vidCount,
        hiddenSubscriberCount: false,
        cached: true,
        cachedDate: snap?.snapshot_date || null,
      };
    }
  } catch (err) {
    console.warn('[Cache] Failed to read cached stats:', err.message);
  }

  return { channels, videoResults, handleResults };
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
    let quotaExhausted = false;

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
          if (response.status === 403) quotaExhausted = true;
          const errBody = await response.text();
          _debug.videosError = errBody.slice(0, 300);
        }
      }
    }

    // Step 1b: If handles provided, resolve each to a channelId
    if (!quotaExhausted && Array.isArray(handles) && handles.length > 0) {
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

    // If quota is exhausted, fall back to Supabase cached stats
    if (quotaExhausted) {
      _debug.fallback = 'supabase_cache';
      _debug.handlesReceived = Array.isArray(handles) ? handles.map(h => h.url) : [];
      _debug.videoIdsReceived = Array.isArray(videoIds) ? videoIds.length : 0;
      const cached = await getCachedStats(
        Array.isArray(videoIds) ? videoIds : [],
        [...resolvedChannelIds],
        Array.isArray(handles) ? handles : []
      );
      _debug.cachedChannelsFound = Object.keys(cached.channels).length;
      _debug.cachedHandleResults = Object.keys(cached.handleResults);
      return res.status(200).json({
        videoResults: cached.videoResults,
        handleResults: { ...handleResults, ...cached.handleResults },
        channels: cached.channels,
        _debug,
      });
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
        if (!response.ok) {
          if (response.status === 403) {
            // Quota exhausted mid-request — fall back to cache
            _debug.fallback = 'supabase_cache_channels';
            const cached = await getCachedStats(null, batch);
            Object.assign(channels, cached.channels);
            _debug.cachedChannelsFound = Object.keys(cached.channels).length;
            continue;
          }
          continue;
        }

        const data = await response.json();
        for (const item of (data.items || [])) {
          const channelData = {
            channelId: item.id,
            title: item.snippet.title,
            customUrl: item.snippet.customUrl,
            thumbnailUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
            subscriberCount: parseInt(item.statistics.subscriberCount) || 0,
            viewCount: parseInt(item.statistics.viewCount) || 0,
            videoCount: parseInt(item.statistics.videoCount) || 0,
            hiddenSubscriberCount: item.statistics.hiddenSubscriberCount || false,
          };
          channels[item.id] = channelData;

          // Cache successful result to Supabase for future 403 fallbacks
          cacheChannelStats(channelData);
        }
      }
    }

    return res.status(200).json({ videoResults, handleResults, channels, _debug });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
