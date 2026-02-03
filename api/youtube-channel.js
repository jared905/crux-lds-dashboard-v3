/**
 * Vercel Serverless Function - YouTube Channel Stats Proxy
 * Proxies YouTube Data API calls server-side to bypass HTTP referrer restrictions.
 * Accepts a video ID or channel ID and returns channel subscriber stats.
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

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

  const { apiKey, videoIds, channelIds } = req.body || {};

  if (!apiKey) {
    return res.status(400).json({ error: 'apiKey required' });
  }

  if (!Array.isArray(videoIds) && !Array.isArray(channelIds)) {
    return res.status(400).json({ error: 'videoIds or channelIds array required' });
  }

  try {
    const results = {};

    // Step 1: If videoIds provided, resolve them to channelIds
    const resolvedChannelIds = new Set(channelIds || []);

    if (Array.isArray(videoIds) && videoIds.length > 0) {
      // Batch video lookups (max 50 per call)
      const ids = videoIds.slice(0, 50).filter(Boolean);
      if (ids.length > 0) {
        const url = new URL(`${YOUTUBE_API_BASE}/videos`);
        url.searchParams.append('part', 'snippet');
        url.searchParams.append('id', ids.join(','));
        url.searchParams.append('key', apiKey);

        const response = await fetch(url);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          return res.status(response.status).json({
            error: errData.error?.message || `YouTube API error: ${response.status}`
          });
        }

        const data = await response.json();
        for (const item of (data.items || [])) {
          resolvedChannelIds.add(item.snippet.channelId);
          // Map video to its channel for the caller
          results[item.id] = {
            videoId: item.id,
            channelId: item.snippet.channelId,
            channelTitle: item.snippet.channelTitle,
          };
        }
      }
    }

    // Step 2: Fetch channel stats for all resolved channel IDs
    const uniqueChannelIds = [...resolvedChannelIds].filter(Boolean);
    const channels = {};

    if (uniqueChannelIds.length > 0) {
      // Batch channel lookups (max 50 per call)
      for (let i = 0; i < uniqueChannelIds.length; i += 50) {
        const batch = uniqueChannelIds.slice(i, i + 50);
        const url = new URL(`${YOUTUBE_API_BASE}/channels`);
        url.searchParams.append('part', 'statistics,snippet');
        url.searchParams.append('id', batch.join(','));
        url.searchParams.append('key', apiKey);

        const response = await fetch(url);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          return res.status(response.status).json({
            error: errData.error?.message || `YouTube API error: ${response.status}`
          });
        }

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

    return res.status(200).json({ videoResults: results, channels });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
