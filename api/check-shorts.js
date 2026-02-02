/**
 * Vercel Serverless Function - YouTube Shorts Detection Proxy
 * Makes HEAD requests to youtube.com/shorts/{videoId} server-side to avoid CORS.
 * Returns 200 for Shorts, 303 redirect for non-Shorts.
 */

export default async function handler(req, res) {
  // CORS headers
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

  const { videoIds } = req.body || {};

  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return res.status(400).json({ error: 'videoIds array required' });
  }

  // Cap at 50 per request to stay within serverless time limits
  const ids = videoIds.slice(0, 50);
  const results = {};

  const CONCURRENCY = 5;
  const DELAY_MS = 80;

  let index = 0;

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, ids.length) },
    async () => {
      while (index < ids.length) {
        const current = index++;
        const videoId = ids[current];

        try {
          const response = await fetch(
            `https://www.youtube.com/shorts/${videoId}`,
            { method: 'HEAD', redirect: 'manual' }
          );
          results[videoId] = response.status === 200;
        } catch {
          results[videoId] = null;
        }

        if (current < ids.length - 1) {
          await new Promise((r) => setTimeout(r, DELAY_MS));
        }
      }
    }
  );

  await Promise.all(workers);

  return res.status(200).json({ results });
}
