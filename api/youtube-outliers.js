/**
 * Vercel Serverless Function — Daily Outliers feed
 *
 * Pulls YouTube's mostPopular chart (up to 200 videos), joins each video
 * to its channel's subscriber count, and returns the combined rows so the
 * client can filter to "up-and-coming channel breaking out" — a video
 * whose views are a large multiple of its channel's subscribers.
 *
 * Music (category 10) is dropped server-side: the chart is dominated by
 * label uploads that are never useful inspiration for client channels.
 * Finer exclusions (trailers, VEVO/auto-generated channels, subscriber
 * band) happen client-side so one cached response serves every filter.
 *
 * Quota: ~8 units per call. The response is edge-cached for 6 hours, so
 * the whole team shares one fetch per region per window.
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'YouTube API key not configured on server' });
  }

  const region = /^[A-Z]{2}$/.test(req.query.region || '') ? req.query.region : 'US';

  try {
    // 1. mostPopular chart, up to 4 pages of 50
    const videos = [];
    let pageToken = null;
    for (let page = 0; page < 4; page++) {
      const url = new URL(`${YOUTUBE_API_BASE}/videos`);
      url.searchParams.append('part', 'snippet,statistics,contentDetails');
      url.searchParams.append('chart', 'mostPopular');
      url.searchParams.append('regionCode', region);
      url.searchParams.append('maxResults', '50');
      if (pageToken) url.searchParams.append('pageToken', pageToken);
      url.searchParams.append('key', apiKey);

      const resp = await fetch(url.toString());
      if (!resp.ok) break;
      const data = await resp.json();
      for (const item of data.items || []) {
        // Music chart entries are never useful client inspiration
        if (item.snippet?.categoryId === '10') continue;
        videos.push(item);
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    // 2. Join channel subscriber counts (batched 50 ids per call)
    const channelIds = [...new Set(videos.map(v => v.snippet?.channelId).filter(Boolean))];
    const channels = {};
    for (let i = 0; i < channelIds.length; i += 50) {
      const url = new URL(`${YOUTUBE_API_BASE}/channels`);
      url.searchParams.append('part', 'statistics,snippet');
      url.searchParams.append('id', channelIds.slice(i, i + 50).join(','));
      url.searchParams.append('maxResults', '50');
      url.searchParams.append('key', apiKey);
      const resp = await fetch(url.toString());
      if (!resp.ok) continue;
      const data = await resp.json();
      for (const ch of data.items || []) {
        channels[ch.id] = {
          subs: Number(ch.statistics?.subscriberCount) || 0,
          hidden: ch.statistics?.hiddenSubscriberCount === true,
          title: ch.snippet?.title || '',
        };
      }
    }

    const rows = videos.map(v => {
      const ch = channels[v.snippet?.channelId] || {};
      return {
        videoId: v.id,
        title: v.snippet?.title || '',
        channelId: v.snippet?.channelId || '',
        channelTitle: v.snippet?.channelTitle || ch.title || '',
        categoryId: v.snippet?.categoryId || '',
        publishedAt: v.snippet?.publishedAt || null,
        duration: v.contentDetails?.duration || '',
        views: Number(v.statistics?.viewCount) || 0,
        likes: Number(v.statistics?.likeCount) || 0,
        comments: Number(v.statistics?.commentCount) || 0,
        subs: ch.hidden ? null : (ch.subs || null),
      };
    });

    // One fetch per region per 6h window for the whole team
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
    return res.status(200).json({ region, fetchedAt: new Date().toISOString(), videos: rows });
  } catch (error) {
    console.error('[youtube-outliers] failed:', error);
    return res.status(500).json({ error: error.message || 'Outliers fetch failed' });
  }
}
