export const ALIASES = {
  videoId: ["content", "video id", "video"],
  title: ["video title", "title"],
  publishDate: ["video publish time", "publish date", "video publish date"],
  avgViewDuration: ["average view duration", "avg view duration"],
  avgViewPct: ["average percentage viewed (%)", "average percentage viewed"],
  durationSeconds: ["duration", "video duration"],
  views: ["views"],
  watchHours: ["watch time (hours)", "watch time hours"],
  subscribers: ["subscribers"],
  impressions: ["impressions"],
  ctr: ["impressions click-through rate (%)", "impressions ctr", "ctr"],
  youtubeUrl: ["youtube url", "video url", "url", "link", "youtube link"],
  youtubeVideoId: ["youtube video id", "youtube id", "yt video id", "yt id"],
};

/**
 * Extract YouTube video ID from various URL formats
 * @param {string} url - YouTube URL or video ID
 * @returns {string|null} - Video ID or null if not found
 */
export function extractYouTubeVideoId(url) {
  if (!url) return null;

  const str = String(url).trim();

  // Already a video ID (11 characters, alphanumeric with - and _)
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  // Various YouTube URL patterns
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Generate YouTube thumbnail URL from video ID
 * @param {string} videoId - YouTube video ID
 * @param {string} quality - Thumbnail quality: 'default', 'medium', 'high', 'maxres'
 * @returns {string|null} - Thumbnail URL or null
 */
export function getYouTubeThumbnailUrl(videoId, quality = 'mqdefault') {
  if (!videoId) return null;

  // YouTube thumbnail URL patterns:
  // default (120x90), mqdefault (320x180), hqdefault (480x360), maxresdefault (1280x720)
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Generate YouTube video URL from video ID
 * @param {string} videoId - YouTube video ID
 * @returns {string|null} - YouTube URL or null
 */
export function getYouTubeVideoUrl(videoId) {
  if (!videoId) return null;
  return `https://www.youtube.com/watch?v=${videoId}`;
}
