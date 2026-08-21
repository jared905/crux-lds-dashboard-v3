import { extractYouTubeVideoId, getYouTubeThumbnailUrl, getYouTubeVideoUrl } from "./schema.js";

/**
 * Safely convert a date-ish value to an ISO string, or null.
 *
 * `new Date(x).toISOString()` throws RangeError on anything unparseable —
 * "N/A", an empty cell, "15/01/2024" — and this runs over every row of an
 * uploaded CSV. One bad cell used to take the whole app down.
 */
function toISOOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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

    // Rate fields (retention, CTR) are stored internally as 0-1 fractions.
    //
    // These used to guess the incoming scale by magnitude — `if (x > 1.0) x /= 100`
    // — which silently failed for every rate below 1%. A stored CTR of 0.008
    // arrives here as 0.8 (clientDataService multiplies by 100 for the '(%)'
    // column), 0.8 is not > 1.0, so it was left alone and rendered as 80.0%
    // instead of 0.8%. The bug was invisible on healthy videos and only
    // corrupted underperforming ones.
    //
    // Key on which field was supplied instead of guessing:
    //   '... (%)' columns  -> percentage, divide by 100
    //   bare `ctr`/`retention` -> already a fraction, leave alone
    // That also makes this idempotent, which matters because ClientManager
    // re-runs normalizeData over already-normalized rows.
    const rate = (percentField, fractionField) => {
      if (percentField !== undefined && percentField !== null && percentField !== '') {
        return num(percentField) / 100;
      }
      return num(fractionField);
    };

    const retention = rate(r['Average percentage viewed (%)'], r.retention);
    const ctr = rate(r['Impressions click-through rate (%)'], r.ctr);

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
      } else if (duration > 0 && duration <= 180) {
        // YouTube Studio exports Shorts with /watch?v= URLs, so we can't rely on
        // URL pattern alone — use duration to classify (Shorts max is 180s)
        type = "short";
      } else {
        type = "long";
      }
    }

    const channel = r['Channel'] || r['Channel name'] || r.channel || "Main Channel";

    const titleLower = title.toLowerCase().trim();
    const isTotal = titleLower === "total";

    // Extract YouTube video ID
    // Check r.videoId first — when loaded from Supabase, r['Content'] contains the channel name
    // (content_source), not the video ID, while r.videoId has the real ID from thumbnail_url
    const rawVideoId = r.videoId || r['Content'] || r['Video ID'] || r['YouTube URL'] || r['URL'];
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
      // `new Date("N/A").toISOString()` throws RangeError, which used to
      // escape an effect with no try/catch and blank the entire app. An
      // unparseable date is a bad row, not a fatal condition.
      publishDate: toISOOrNull(publishDate),
      video_id: rawVideoId || `vid-${Date.now()}-${Math.random()}`,
      youtubeVideoId,
      thumbnailUrl,
      youtubeUrl,
      isTotal,
      isCollaboration: r.isCollaboration || false,
      collabRole: r.collabRole || null,
      collabChannel: r.collabChannel || null,
    };
  });

  return { rows: processedRows, channelTotalSubscribers };
}
