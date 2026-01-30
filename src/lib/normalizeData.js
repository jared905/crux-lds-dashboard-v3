import { extractYouTubeVideoId, getYouTubeThumbnailUrl, getYouTubeVideoUrl } from "./schema.js";

/**
 * Normalize raw CSV data into a consistent format.
 * Returns { rows, channelTotalSubscribers }.
 *
 * - rows includes ALL processed rows (including Total rows marked with isTotal: true).
 *   Callers should filter out Total/zero-view rows as needed for display.
 * - channelTotalSubscribers is extracted from the "Total" row if present.
 */
export function normalizeData(rawData) {
  if (!Array.isArray(rawData)) return { rows: [], channelTotalSubscribers: 0 };

  // Find the "Total" row to extract channel-level subscriber count
  const totalRow = rawData.find(r => {
    const title = r['Video title'] || r.title || "";
    return title.toLowerCase().trim() === 'total';
  });

  const channelTotalSubscribers = totalRow
    ? (Number(String(totalRow['Subscribers'] || totalRow['Subscribers gained'] || totalRow.subscribers || 0).replace(/[^0-9.-]/g, "")) || 0)
    : 0;

  // Filter out rows with no title
  const filteredData = rawData.filter(r => {
    const title = r['Video title'] || r.title || "";
    if (!title || title.trim() === "") return false;
    return true;
  });

  const num = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    return Number(String(val).replace(/[^0-9.-]/g, "")) || 0;
  };

  const processedRows = filteredData.map(r => {
    const title = r['Video title'] || r.title || "Untitled";
    const publishDate = r['Video publish time'] || r.publishDate;
    const views = num(r['Views'] || r.views);
    const impressions = num(r['Impressions'] || r.impressions);
    const subscribers = num(r['Subscribers gained'] || r['Subscribers'] || r.subscribers);
    const duration = num(r['Duration'] || r.duration);

    // Handle retention (comes as percentage in YouTube exports)
    let retention = num(r['Average percentage viewed (%)'] || r.retention);
    if (retention > 1.0) retention = retention / 100;

    // Handle CTR (comes as percentage in YouTube exports)
    let ctr = num(r['Impressions click-through rate (%)'] || r.ctr);
    if (ctr > 1.0) ctr = ctr / 100;

    // Calculate watch hours from Average view duration if not provided
    let watchHours = num(r.watchHours);
    if (!watchHours && r['Average view duration']) {
      const avgDuration = r['Average view duration'];
      const parts = String(avgDuration).split(':');
      if (parts.length === 3) {
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const seconds = parseInt(parts[2]) || 0;
        const totalHours = hours + (minutes / 60) + (seconds / 3600);
        watchHours = totalHours * views;
      }
    }

    // Determine video type: prefer explicit type, then URL pattern, then duration fallback
    let type = r.type || r.Type || r.TYPE || r['Content Type'] || r['content type'] || "";
    if (!type) {
      const rawVideoId = r['Content'] || r.videoId || r['Video ID'] || r['YouTube URL'] || r['URL'] || "";
      const urlStr = String(rawVideoId).toLowerCase();
      if (urlStr.includes("/shorts/")) {
        type = "short";
      } else if (urlStr.includes("/watch?v=")) {
        type = "long";
      } else if (duration > 0 && duration <= 60) {
        type = "short";
      } else {
        type = "long";
      }
    }

    const channel = r['Channel'] || r['Channel name'] || r.channel || "Main Channel";

    const titleLower = title.toLowerCase().trim();
    const isTotal = titleLower === "total";

    // Extract YouTube video ID
    const rawVideoId = r['Content'] || r.videoId || r['Video ID'] || r['YouTube URL'] || r['URL'];
    const youtubeVideoId = extractYouTubeVideoId(rawVideoId);
    const thumbnailUrl = getYouTubeThumbnailUrl(youtubeVideoId);
    const youtubeUrl = getYouTubeVideoUrl(youtubeVideoId);

    return {
      channel: String(channel).trim(),
      title,
      duration,
      views,
      watchHours,
      subscribers,
      impressions,
      ctr,
      retention,
      avgViewPct: retention,
      type: type.toLowerCase(),
      publishDate: publishDate ? new Date(publishDate).toISOString() : null,
      video_id: rawVideoId || `vid-${Date.now()}-${Math.random()}`,
      youtubeVideoId,
      thumbnailUrl,
      youtubeUrl,
      isTotal,
    };
  });

  return { rows: processedRows, channelTotalSubscribers };
}
