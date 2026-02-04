/**
 * Vercel Serverless Function - YouTube Comments Proxy
 * Fetches top comments for given video IDs using the server-side API key.
 * Returns comments sorted by like count for use in PDF reports.
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

  const { videoIds, maxPerVideo = 20 } = req.body || {};

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'YouTube API key not configured on server' });
  }

  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return res.status(400).json({ error: 'videoIds array required' });
  }

  try {
    const results = {};

    for (const videoId of videoIds.slice(0, 5)) {
      try {
        const url = new URL(`${YOUTUBE_API_BASE}/commentThreads`);
        url.searchParams.append('part', 'snippet');
        url.searchParams.append('videoId', videoId);
        url.searchParams.append('maxResults', String(Math.min(maxPerVideo, 100)));
        url.searchParams.append('order', 'relevance');
        url.searchParams.append('textFormat', 'plainText');
        url.searchParams.append('key', apiKey);

        const response = await fetch(url);

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          results[videoId] = { comments: [], error: errData.error?.message || `HTTP ${response.status}` };
          continue;
        }

        const data = await response.json();
        const comments = (data.items || []).map(item => {
          const snippet = item.snippet.topLevelComment.snippet;
          return {
            text: snippet.textDisplay,
            author: snippet.authorDisplayName,
            likeCount: snippet.likeCount || 0,
            publishedAt: snippet.publishedAt,
          };
        });

        results[videoId] = { comments };
      } catch (err) {
        results[videoId] = { comments: [], error: err.message };
      }
    }

    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
