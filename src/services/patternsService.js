/**
 * Patterns service — extracts title / format / outlier patterns from a set of videos.
 *
 * Public-data-only inputs (no CTR/retention for competitors):
 *   - title, duration_seconds, view_count, like_count, comment_count, published_at
 *
 * Cross-scope comparison: callers pass two video sets (scope, baseline) and
 * receive the lift of each pattern in scope vs the baseline.
 */

import { supabase } from './supabaseClient';

const SHORTS_DURATION_THRESHOLD = 180;

// ──────────────────────────────────────────────────
// Pattern definitions — pure regex, no NLP required.
// Each returns true/false for a given title string.
// ──────────────────────────────────────────────────
const TITLE_PATTERNS = [
  { id: 'question', label: 'Contains question mark',     test: (t) => /\?/.test(t) },
  { id: 'number',   label: 'Contains numbers',           test: (t) => /\d/.test(t) },
  { id: 'list',     label: 'Numbered list (top N…)',     test: (t) => /\b(top|best)\s+\d+\b/i.test(t) || /\b\d+\s+(ways|reasons|things|tips|secrets|rules)\b/i.test(t) },
  { id: 'how',      label: 'Starts with "How…"',         test: (t) => /^how\b/i.test(t.trim()) },
  { id: 'why',      label: 'Starts with "Why…"',         test: (t) => /^why\b/i.test(t.trim()) },
  { id: 'what',     label: 'Starts with "What…"',        test: (t) => /^what\b/i.test(t.trim()) },
  { id: 'allcaps',  label: 'All-caps word',              test: (t) => /\b[A-Z]{3,}\b/.test(t) },
  { id: 'emoji',    label: 'Contains emoji',             test: (t) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t) },
  { id: 'colon',    label: 'Contains colon',             test: (t) => /:/.test(t) },
  { id: 'pipe',     label: 'Contains pipe character',    test: (t) => /\|/.test(t) },
  { id: 'paren',    label: 'Has parenthetical',          test: (t) => /\([^)]+\)/.test(t) },
  { id: 'vs',       label: 'Contains "vs" / "versus"',   test: (t) => /\bvs\.?\b|\bversus\b/i.test(t) },
  { id: 'short',    label: 'Title under 35 chars',       test: (t) => t.trim().length < 35 },
  { id: 'long',     label: 'Title over 70 chars',        test: (t) => t.trim().length > 70 },
];

// Length buckets for non-Shorts long-form videos
const LENGTH_BUCKETS = [
  { id: 'lf_3_8',   label: '3–8 min',         min: 181,   max: 480 },
  { id: 'lf_8_15',  label: '8–15 min',        min: 481,   max: 900 },
  { id: 'lf_15_25', label: '15–25 min',       min: 901,   max: 1500 },
  { id: 'lf_25p',   label: '25 min+',         min: 1501,  max: Infinity },
];

// ──────────────────────────────────────────────────
// Data fetch
// ──────────────────────────────────────────────────

/**
 * Fetch videos for a set of channels in a window.
 * Drops 0-view rows (private/unlisted).
 */
async function fetchVideosForChannels(channelIds, { windowDays = 90 } = {}) {
  if (!supabase || !channelIds?.length) return [];
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();

  const { data, error } = await supabase
    .from('videos')
    .select('id, channel_id, title, duration_seconds, view_count, like_count, comment_count, published_at, youtube_video_id, thumbnail_url')
    .in('channel_id', channelIds)
    .gte('published_at', cutoff)
    .gt('view_count', 0)
    .order('view_count', { ascending: false });

  if (error) {
    console.error('[patternsService] video fetch failed:', error);
    return [];
  }
  return data || [];
}

/**
 * Fetch the channel IDs that match a scope (categoryIds + tags + tiers).
 * Used to resolve "all channels" vs "Faith" vs current saved view to a list of IDs.
 */
/**
 * BFS-expand a list of category ids to include every descendant.
 * Returns the original ids + every category whose ancestor chain reaches one.
 */
export async function expandCategoriesWithDescendants(rootIds) {
  if (!rootIds?.length) return [];
  const expanded = new Set(rootIds);
  let frontier = [...rootIds];
  // Safety cap to avoid runaway loops if the tree contains cycles
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const { data: children } = await supabase
      .from('categories')
      .select('id, parent_id')
      .in('parent_id', frontier);
    if (!children?.length) break;
    const next = [];
    for (const c of children) {
      if (!expanded.has(c.id)) {
        expanded.add(c.id);
        next.push(c.id);
      }
    }
    frontier = next;
  }
  return [...expanded];
}

export async function resolveScopeToChannelIds(scope = {}) {
  if (!supabase) return [];
  const { categoryIds = null, tags = null, tiers = ['priority', 'tracked'] } = scope;

  let q = supabase.from('channels').select('id').eq('is_competitor', true);
  if (tiers?.length) q = q.in('tier', tiers);
  const { data: channels } = await q;
  if (!channels?.length) return [];

  let ids = channels.map(c => c.id);

  if (categoryIds?.length) {
    // Expand each selected category to include all descendants so picking a
    // parent ("Faith") implicitly covers its sub-categories ("LDS", "Catholic"…).
    const expandedIds = await expandCategoriesWithDescendants(categoryIds);
    const { data: ccRows } = await supabase
      .from('channel_categories').select('channel_id')
      .in('category_id', expandedIds).in('channel_id', ids);
    const matched = new Set((ccRows || []).map(r => r.channel_id));
    ids = ids.filter(id => matched.has(id));
  }
  if (tags?.length) {
    const { data: tagRows } = await supabase
      .from('channel_tags').select('channel_id, tag')
      .in('tag', tags).in('channel_id', ids);
    const tagsBy = {};
    for (const r of tagRows || []) {
      if (!tagsBy[r.channel_id]) tagsBy[r.channel_id] = new Set();
      tagsBy[r.channel_id].add(r.tag);
    }
    ids = ids.filter(id => tags.every(t => tagsBy[id]?.has(t)));
  }
  return ids;
}

// ──────────────────────────────────────────────────
// Pattern computation
// ──────────────────────────────────────────────────

function computeTitlePatterns(videos) {
  if (!videos.length) return [];

  return TITLE_PATTERNS.map(p => {
    const matched = videos.filter(v => p.test(v.title || ''));
    const count = matched.length;
    const freq = count / videos.length;

    const matchedViews = matched.map(v => v.view_count);
    const matchedEng = matched
      .filter(v => v.view_count > 0)
      .map(v => ((v.like_count || 0) + (v.comment_count || 0)) / v.view_count);

    return {
      id: p.id,
      label: p.label,
      count,
      freq,
      medianViews: count > 0 ? median(matchedViews) : null,
      avgEngagement: matchedEng.length > 0
        ? matchedEng.reduce((s, e) => s + e, 0) / matchedEng.length
        : null,
    };
  });
}

function computeFormatBreakdown(videos) {
  const total = videos.length || 1;
  const shorts = videos.filter(v => (v.duration_seconds || 0) <= SHORTS_DURATION_THRESHOLD);
  const longs = videos.filter(v => (v.duration_seconds || 0) > SHORTS_DURATION_THRESHOLD);

  const buckets = LENGTH_BUCKETS.map(b => {
    const matched = longs.filter(v => v.duration_seconds >= b.min && v.duration_seconds <= b.max);
    return {
      id: b.id,
      label: b.label,
      count: matched.length,
      freq: matched.length / total,
      medianViews: matched.length > 0 ? median(matched.map(v => v.view_count)) : null,
    };
  });

  return {
    total,
    shortsCount: shorts.length,
    longsCount: longs.length,
    shortsFreq: shorts.length / total,
    longsFreq: longs.length / total,
    shortsMedianViews: shorts.length > 0 ? median(shorts.map(v => v.view_count)) : null,
    longsMedianViews: longs.length > 0 ? median(longs.map(v => v.view_count)) : null,
    buckets,
  };
}

/**
 * Outliers: videos that significantly outperformed their own channel's median.
 * Drops videos where channel has <5 in-window videos (no reliable baseline).
 */
// An outlier with engagement well below the channel's own engagement floor
// is much more likely to be inflated views (bought, sub4sub, embed farms)
// than a genuine resonant breakout. We flag and demote — but never hide —
// so it's still visible for inspection.
const SUSPECT_ENGAGEMENT_RATIO = 0.4; // <40% of channel-normal engagement

function computeOutliers(videos, channels, { minMultiplier = 2.0, limit = 12 } = {}) {
  const channelById = {};
  for (const c of channels) channelById[c.id] = c;

  // Group by channel
  const byChannel = {};
  for (const v of videos) {
    if (!byChannel[v.channel_id]) byChannel[v.channel_id] = [];
    byChannel[v.channel_id].push(v);
  }

  const out = [];
  for (const [channelId, vids] of Object.entries(byChannel)) {
    if (vids.length < 5) continue;
    const m = median(vids.map(v => v.view_count));
    if (!m) continue;

    // Channel's own engagement baseline — used to spot inflated-view candidates
    const engSamples = vids
      .map(v => (v.view_count > 0
        ? ((v.like_count || 0) + (v.comment_count || 0)) / v.view_count
        : null))
      .filter(e => e != null && e >= 0);
    const channelMedianEngagement = engSamples.length >= 5 ? median(engSamples) : null;

    for (const v of vids) {
      const multiplier = v.view_count / m;
      if (multiplier < minMultiplier) continue;

      const ch = channelById[channelId];
      const engagement = v.view_count > 0
        ? ((v.like_count || 0) + (v.comment_count || 0)) / v.view_count
        : null;
      const engagementRatio = (engagement != null && channelMedianEngagement)
        ? engagement / channelMedianEngagement
        : null;
      const isSuspect = engagementRatio != null && engagementRatio < SUSPECT_ENGAGEMENT_RATIO;

      out.push({
        id: v.id,
        title: v.title,
        views: v.view_count,
        multiplier,
        publishedAt: v.published_at,
        youtubeVideoId: v.youtube_video_id,
        thumbnailUrl: v.thumbnail_url || (v.youtube_video_id
          ? `https://i.ytimg.com/vi/${v.youtube_video_id}/mqdefault.jpg`
          : null),
        channel: {
          id: channelId,
          name: ch?.name,
          youtubeChannelId: ch?.youtube_channel_id,
          thumbnailUrl: ch?.thumbnail_url || null,
          medianEngagement: channelMedianEngagement,
        },
        engagement,
        engagementRatio,
        isSuspect,
      });
    }
  }

  // Healthy outliers ranked above suspect ones; within each tier, by multiplier.
  return out
    .sort((a, b) => {
      if (a.isSuspect !== b.isSuspect) return a.isSuspect ? 1 : -1;
      return b.multiplier - a.multiplier;
    })
    .slice(0, limit);
}

/**
 * Compute lift of scope vs baseline for a pattern.
 *   pos: scope outperforms baseline by ≥3%
 *   neg: scope underperforms by ≥3%
 *   flat: within ±3%
 */
function computeLift(scopeValue, baselineValue) {
  if (scopeValue == null || baselineValue == null || baselineValue === 0) return null;
  const pct = ((scopeValue - baselineValue) / baselineValue) * 100;
  return {
    pct,
    direction: Math.abs(pct) < 3 ? 'flat' : (pct > 0 ? 'pos' : 'neg'),
  };
}

// ──────────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────────

/**
 * Run the full Patterns analysis for a scope, optionally comparing against a baseline scope.
 *
 * @param {Object} opts
 * @param {string[]} opts.scopeChannelIds       channel IDs in current scope
 * @param {string[]} [opts.baselineChannelIds]  channel IDs to compare against (null = no comparison)
 * @param {number}   [opts.windowDays=90]
 *
 * @returns {Promise<{
 *   scope: { videoCount, titlePatterns, formatBreakdown, outliers, channels },
 *   baseline?: { videoCount, titlePatterns, formatBreakdown },
 *   compare?: { titlePatternLifts: { id, freqLift, engagementLift } [] }
 * }>}
 */
export async function analyzePatterns({ scopeChannelIds, baselineChannelIds = null, windowDays = 90 }) {
  // Pull videos for both sets in parallel
  const scopeIds = scopeChannelIds || [];
  const baseIds = baselineChannelIds || [];

  const [scopeVids, baseVids] = await Promise.all([
    fetchVideosForChannels(scopeIds, { windowDays }),
    baseIds.length ? fetchVideosForChannels(baseIds, { windowDays }) : Promise.resolve([]),
  ]);

  // Channel metadata for outliers
  const allChannelIds = Array.from(new Set([...scopeIds, ...baseIds]));
  let channels = [];
  if (allChannelIds.length) {
    const { data } = await supabase
      .from('channels')
      .select('id, name, youtube_channel_id, thumbnail_url')
      .in('id', allChannelIds);
    channels = data || [];
  }

  const scopeAnalysis = {
    videoCount: scopeVids.length,
    titlePatterns: computeTitlePatterns(scopeVids),
    formatBreakdown: computeFormatBreakdown(scopeVids),
    outliers: computeOutliers(scopeVids, channels),
  };

  if (!baseIds.length) {
    return { scope: scopeAnalysis };
  }

  const baselineAnalysis = {
    videoCount: baseVids.length,
    titlePatterns: computeTitlePatterns(baseVids),
    formatBreakdown: computeFormatBreakdown(baseVids),
  };

  // Compute lifts pattern-by-pattern
  const titlePatternLifts = scopeAnalysis.titlePatterns.map(sp => {
    const bp = baselineAnalysis.titlePatterns.find(p => p.id === sp.id);
    return {
      id: sp.id,
      freqLift: bp ? computeLift(sp.freq, bp.freq) : null,
      engagementLift: bp ? computeLift(sp.avgEngagement, bp.avgEngagement) : null,
    };
  });

  return {
    scope: scopeAnalysis,
    baseline: baselineAnalysis,
    compare: { titlePatternLifts },
  };
}

// ──────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────
function median(nums) {
  if (!nums?.length) return null;
  const sorted = [...nums].filter(n => n != null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default { analyzePatterns, resolveScopeToChannelIds };
