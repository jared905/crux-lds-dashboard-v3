/**
 * Research v2 — data service for the redesigned Competitor/Research hub.
 *
 * Public-data-only metric set (no CTR/retention for competitors):
 *   - View velocity (views per day, derived from snapshots)
 *   - Median views per video (last 30/90 day window)
 *   - Engagement rate = (likes + comments) / views
 *   - Δ Subs over time (from channel_snapshots)
 *   - Upload cadence
 *   - Format mix (% Shorts via duration)
 *
 * Inline category norms compute on read with n<5 suppression.
 */

import { supabase } from './supabaseClient';

const SHORTS_DURATION_THRESHOLD = 180; // seconds

/**
 * Fetch all channels in scope, with derived metrics for the Landscape table.
 *
 * @param {Object} opts
 * @param {string[]} [opts.categoryIds]    filter to channels in these categories
 * @param {string[]} [opts.tags]           filter to channels with all these tags
 * @param {string[]} [opts.tiers]          filter to channels in these tiers (defaults to non-archive)
 * @param {string}   [opts.search]         substring match on channel name
 * @param {number}   [opts.windowDays=30]  window for view velocity & median views
 */
export async function fetchLandscapeChannels(opts = {}) {
  if (!supabase) return [];

  const {
    categoryIds = null,
    tags = null,
    tiers = ['priority', 'tracked'],
    search = '',
    windowDays = 30,
  } = opts;

  // 1. Base channel query
  let query = supabase
    .from('channels')
    .select(`
      id,
      youtube_channel_id,
      name,
      thumbnail_url,
      custom_url,
      subscriber_count,
      total_view_count,
      video_count,
      tier,
      is_competitor,
      last_synced_at
    `)
    .eq('is_competitor', true);

  if (tiers?.length) query = query.in('tier', tiers);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data: channels, error } = await query;
  if (error) {
    console.error('[researchV2] channel fetch failed:', error);
    return [];
  }
  if (!channels?.length) return [];

  // 2. Filter by category junction (if requested)
  let filteredChannels = channels;
  if (categoryIds?.length) {
    const { data: ccRows } = await supabase
      .from('channel_categories')
      .select('channel_id')
      .in('category_id', categoryIds)
      .in('channel_id', channels.map(c => c.id));
    const matchedIds = new Set((ccRows || []).map(r => r.channel_id));
    filteredChannels = channels.filter(c => matchedIds.has(c.id));
  }

  // 3. Filter by tags (AND semantics — channel has every requested tag)
  if (tags?.length) {
    const { data: tagRows } = await supabase
      .from('channel_tags')
      .select('channel_id, tag')
      .in('tag', tags)
      .in('channel_id', filteredChannels.map(c => c.id));
    const tagsByChannel = {};
    for (const row of tagRows || []) {
      if (!tagsByChannel[row.channel_id]) tagsByChannel[row.channel_id] = new Set();
      tagsByChannel[row.channel_id].add(row.tag);
    }
    filteredChannels = filteredChannels.filter(c => {
      const got = tagsByChannel[c.id];
      if (!got) return false;
      return tags.every(t => got.has(t));
    });
  }

  if (!filteredChannels.length) return [];

  const channelIds = filteredChannels.map(c => c.id);

  // 4. Pull videos in the window (one query for all channels)
  const windowStart = new Date(Date.now() - windowDays * 86400000).toISOString();
  const { data: videos } = await supabase
    .from('videos')
    .select('id, channel_id, view_count, like_count, comment_count, duration_seconds, published_at')
    .in('channel_id', channelIds)
    .gte('published_at', windowStart);

  // 5. Pull channel_snapshots delta for subs over window
  const dateStart = windowStart.split('T')[0];
  const { data: snapshots } = await supabase
    .from('channel_snapshots')
    .select('channel_id, snapshot_date, subscriber_count')
    .in('channel_id', channelIds)
    .gte('snapshot_date', dateStart)
    .order('snapshot_date', { ascending: true });

  // 6. Pull video_snapshots in window for view velocity
  const videoIdsInWindow = (videos || []).map(v => v.id);
  let videoSnaps = [];
  if (videoIdsInWindow.length > 0) {
    const { data: vs } = await supabase
      .from('video_snapshots')
      .select('video_id, view_velocity, snapshot_date')
      .in('video_id', videoIdsInWindow)
      .gte('snapshot_date', dateStart);
    videoSnaps = vs || [];
  }

  // 7. Pull category + tag joins
  const { data: catJoins } = await supabase
    .from('channel_categories')
    .select('channel_id, categories(id, name, slug, parent_id)')
    .in('channel_id', channelIds);
  const { data: tagJoins } = await supabase
    .from('channel_tags')
    .select('channel_id, tag')
    .in('channel_id', channelIds);

  // 8. Compute derived metrics per channel
  const videosByChannel = groupBy(videos || [], 'channel_id');
  const snapsByChannel = groupBy(snapshots || [], 'channel_id');
  const velocityByVideo = {};
  for (const vs of videoSnaps) {
    if (vs.view_velocity != null) {
      velocityByVideo[vs.video_id] = (velocityByVideo[vs.video_id] || 0) + Number(vs.view_velocity);
    }
  }
  const tagsByChannel = {};
  for (const t of tagJoins || []) {
    if (!tagsByChannel[t.channel_id]) tagsByChannel[t.channel_id] = [];
    tagsByChannel[t.channel_id].push(t.tag);
  }
  const catsByChannel = {};
  for (const j of catJoins || []) {
    if (!j.categories) continue;
    if (!catsByChannel[j.channel_id]) catsByChannel[j.channel_id] = [];
    catsByChannel[j.channel_id].push(j.categories);
  }

  const enriched = filteredChannels.map(ch => {
    const vids = videosByChannel[ch.id] || [];
    const snaps = snapsByChannel[ch.id] || [];
    const views = vids.map(v => v.view_count || 0).filter(n => n > 0);
    const medianViews = views.length > 0 ? median(views) : null;
    const totalEng = vids.reduce((s, v) => {
      if (!v.view_count) return s;
      return s + ((v.like_count || 0) + (v.comment_count || 0));
    }, 0);
    const totalVw = vids.reduce((s, v) => s + (v.view_count || 0), 0);
    const engagementRate = totalVw > 0 ? totalEng / totalVw : null;

    const totalVelocity = vids.reduce((s, v) => s + (velocityByVideo[v.id] || 0), 0);
    const viewVelocity = vids.length > 0 ? totalVelocity / windowDays : null; // views/day across window

    let deltaSubs = null;
    if (snaps.length >= 2) {
      const first = snaps[0].subscriber_count;
      const last = snaps[snaps.length - 1].subscriber_count;
      if (first != null && last != null) deltaSubs = last - first;
    }

    const shortCount = vids.filter(v => (v.duration_seconds || 0) <= SHORTS_DURATION_THRESHOLD).length;
    const longCount = vids.length - shortCount;
    const formatMix = vids.length > 0
      ? { short: shortCount / vids.length, long: longCount / vids.length }
      : null;

    const uploadsPerWeek = vids.length > 0 ? (vids.length / (windowDays / 7)) : 0;
    const lastUpload = vids.length > 0
      ? vids.reduce((latest, v) => (!latest || new Date(v.published_at) > new Date(latest)) ? v.published_at : latest, null)
      : null;

    return {
      id: ch.id,
      youtubeChannelId: ch.youtube_channel_id,
      name: ch.name,
      handle: ch.custom_url || null,
      thumbnail: ch.thumbnail_url,
      tier: ch.tier || 'tracked',
      subscriberCount: ch.subscriber_count,
      categories: catsByChannel[ch.id] || [],
      tags: tagsByChannel[ch.id] || [],
      videosInWindow: vids.length,
      medianViews,
      engagementRate,
      viewVelocity,
      deltaSubs,
      formatMix,
      uploadsPerWeek,
      lastUpload,
    };
  });

  return enriched;
}

/**
 * Compute category norms for each metric, used by the inline annotations.
 * Returns `{ [categoryId]: { medianViews, engagementRate, viewVelocity, n } }`.
 * Categories with fewer than 5 channels are excluded (caller should suppress norms).
 */
export function computeCategoryNorms(enrichedChannels, minN = 5) {
  const byCategory = {};
  for (const ch of enrichedChannels) {
    for (const cat of ch.categories) {
      if (!byCategory[cat.id]) byCategory[cat.id] = { name: cat.name, channels: [] };
      byCategory[cat.id].channels.push(ch);
    }
  }

  const norms = {};
  for (const [catId, { name, channels }] of Object.entries(byCategory)) {
    if (channels.length < minN) continue;
    norms[catId] = {
      name,
      n: channels.length,
      medianViews: median(channels.map(c => c.medianViews).filter(v => v != null && v > 0)),
      engagementRate: median(channels.map(c => c.engagementRate).filter(v => v != null && v > 0)),
      viewVelocity: median(channels.map(c => c.viewVelocity).filter(v => v != null && v > 0)),
    };
  }
  return norms;
}

/**
 * Given a channel and the norms for one of its categories,
 * return the lift annotation for each metric.
 * Returns null when norm is missing or sample too small.
 */
export function computeNormDelta(value, normValue) {
  if (value == null || normValue == null || normValue === 0) return null;
  const pct = ((value - normValue) / normValue) * 100;
  return {
    pct,
    direction: Math.abs(pct) < 3 ? 'flat' : (pct > 0 ? 'pos' : 'neg'),
  };
}

// ----- helpers -----
function groupBy(arr, key) {
  const out = {};
  for (const item of arr) {
    const k = item[key];
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}
function median(nums) {
  if (!nums?.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default {
  fetchLandscapeChannels,
  computeCategoryNorms,
  computeNormDelta,
};
