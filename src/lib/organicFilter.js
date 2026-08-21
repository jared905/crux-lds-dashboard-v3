/**
 * organicFilter — heuristic detection of likely media-buy / promoted
 * videos (2026-08-20 request: "a ton of views and one comment, it was
 * likely media buy").
 *
 * The tell of bought views is engagement that doesn't scale with view
 * count. Organic YouTube videos almost never clear 10K views with one
 * or two comments; ad-served views produce almost no comments, likes,
 * or subscriptions.
 *
 * Signals, per video (channel-relative where it matters):
 *   1. ≥10K views with ≤2 comments                      → flagged
 *   2. ≥20K views with under 1 comment per 50K views    → flagged
 *   3. ≥20K views with a like rate under 0.1%           → flagged
 *   4. No engagement fields at all (older cached rows): only the
 *      strongest pattern flags — 10× the channel's median views AND
 *      zero subscribers gained AND weak (but present) retention.
 *
 * Honesty rules: this is a heuristic, every flag carries its reason,
 * and the UI labels results "likely promoted", never "paid". Videos
 * without the data to judge are never flagged.
 */

export function videoKey(r) {
  return r.videoId || r.youtubeVideoId || `${r.title}|${r.publishDate}`;
}

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const fmt = (n) => Math.round(n).toLocaleString();

/** @returns Map<videoKey, reason string> */
export function detectLikelyPromoted(rows) {
  const flags = new Map();
  if (!rows?.length) return flags;

  const byChannel = new Map();
  for (const r of rows) {
    const ch = r.channel || "_";
    if (!byChannel.has(ch)) byChannel.set(ch, []);
    byChannel.get(ch).push(r);
  }

  for (const list of byChannel.values()) {
    const medViews = median(list.map(r => r.views || 0));
    for (const r of list) {
      const v = r.views || 0;
      if (v < 10_000) continue; // small videos are never worth buying detection risk

      const hasComments = r.comments != null;
      const hasLikes = r.likes != null;
      let reason = null;

      if (hasComments && (r.comments || 0) <= 2) {
        reason = `${fmt(v)} views with ${r.comments || 0} comment${r.comments === 1 ? "" : "s"}`;
      } else if (hasComments && v >= 20_000 && (r.comments || 0) / v < 1 / 50_000) {
        reason = `comment rate far below organic norms (${r.comments} on ${fmt(v)} views)`;
      } else if (hasLikes && v >= 20_000 && (r.likes || 0) / v < 0.001) {
        reason = `like rate far below organic norms (${fmt(r.likes || 0)} on ${fmt(v)} views)`;
      } else if (!hasComments && !hasLikes) {
        const ret = r.retention || 0;
        if (v >= Math.max(medViews * 10, 50_000) && (r.subscribers || 0) === 0 && ret > 0 && ret < 0.25) {
          reason = `${fmt(v)} views (10× channel median) with zero subscribers gained and ${(ret * 100).toFixed(0)}% retention`;
        }
      }

      if (reason) flags.set(videoKey(r), reason);
    }
  }
  return flags;
}
