/**
 * Surface intelligence service — typed reads from the Phase 2.5
 * traffic-source + search-query snapshots, plus the raw-enum →
 * target-bucket normalization the scorer consumes.
 *
 * Reads:
 *   - client_video_traffic_sources (per-video, per-surface views)
 *   - client_search_queries (channel-level aggregated queries, with
 *     is_branded flag)
 *
 * Snapshot model: a single pull writes many rows with the same
 * captured_at (Postgres NOW() resolves to statement_timestamp, so all
 * rows in one INSERT share a timestamp to microsecond precision). We
 * select rows from the MAX(captured_at) per table — that's "the
 * latest snapshot." If two pulls happen in the same microsecond, well,
 * those rows merge, which is fine.
 *
 * Normalization:
 *   The pull persists raw YouTube enums (RELATED_VIDEO, BROWSE_FEATURES,
 *   YT_SEARCH, etc.) — the scorer needs canonical target-surface
 *   buckets (Search / Browse / Suggested / ShortsFeed). Mapping lives
 *   here so the schema can absorb any new YouTube enum without a
 *   migration; we just add a row to SURFACE_BUCKET_MAP.
 */

import { supabase } from './supabaseClient';

// ──────────────────────────────────────────────────
// Target surfaces — what the strategist picks in the concept form.
// These are the four surfaces with distinct ranking algorithms
// (Search keyword-match, Browse session-time, Suggested topic-
// continuity, ShortsFeed completion/loops). Other surfaces
// (Subscribers, External, Paid) factor into the surface mix but
// aren't pickable as scoring targets because they're not in the
// strategist's control at the concept stage.
// ──────────────────────────────────────────────────
export const TARGET_SURFACES = ['Search', 'Browse', 'Suggested', 'ShortsFeed'];

// Raw YouTube insightTrafficSourceType → normalized bucket.
// Extend without a migration when YouTube adds new enums.
const SURFACE_BUCKET_MAP = {
  YT_SEARCH:        'Search',
  BROWSE_FEATURES:  'Browse',
  RELATED_VIDEO:    'Suggested',
  SHORTS:           'ShortsFeed',
  SHORTS_CONTENT:   'ShortsFeed',   // possible future enum

  SUBSCRIBER:       'Subscribers',
  NOTIFICATION:     'Subscribers',

  EXT_URL:          'External',
  EXT_APP:          'External',

  YT_CHANNEL:       'Other',
  YT_OTHER_PAGE:    'Other',
  END_SCREEN:       'Other',
  PLAYLIST:         'Other',
  YT_PLAYLIST_PAGE: 'Other',
  HASHTAGS:         'Other',
  NO_LINK_OTHER:    'Other',
  NO_LINK_EMBEDDED: 'Other',
  SOUND_PAGE:       'Other',

  ADVERTISING:      'Paid',
  PROMOTED:         'Paid',
  CAMPAIGN_CARD:    'Paid',
};

export function normalizeSurface(rawEnum) {
  return SURFACE_BUCKET_MAP[rawEnum] || 'Other';
}

// ──────────────────────────────────────────────────
// loadSurfaceContext
// ──────────────────────────────────────────────────

/**
 * Load the latest surface-intelligence snapshot for a client.
 *
 * Returns null when no snapshot exists yet. Otherwise returns a
 * fully-formed surface context the scorer consumes:
 *
 *   {
 *     captured_at: ISO timestamp of the snapshot,
 *     window: { start, end },
 *     total_views: number across all videos in this snapshot,
 *     n_videos: distinct video count,
 *     surface_mix: [
 *       { bucket: 'Suggested', views: 6014, sharePct: 91.2 },
 *       { bucket: 'Subscribers', views: 130, sharePct: 8.6 },
 *       ...
 *     ],
 *     dominant_surface: 'Suggested',     // bucket with highest share
 *     dominant_share_pct: 91.2,
 *     search_queries: {
 *       all: [{ query, views, is_branded }, ...],
 *       unbranded: [...]   // subset of all, sorted by views desc
 *     }
 *   }
 */
export async function loadSurfaceContext(clientId) {
  if (!supabase || !clientId) return null;

  // 1) Latest traffic-source snapshot timestamp.
  const { data: tsLatest } = await supabase
    .from('client_video_traffic_sources')
    .select('captured_at')
    .eq('client_id', clientId)
    .order('captured_at', { ascending: false })
    .limit(1);

  if (!tsLatest?.length) return null;
  const latestTsAt = tsLatest[0].captured_at;

  // 2) All rows at that exact snapshot timestamp.
  const { data: tsRows, error: tsErr } = await supabase
    .from('client_video_traffic_sources')
    .select('youtube_video_id, surface, views, window_start, window_end')
    .eq('client_id', clientId)
    .eq('captured_at', latestTsAt);

  if (tsErr || !tsRows?.length) return null;

  // 3) Aggregate by normalized bucket.
  const bucketViews = new Map();
  const videoSet = new Set();
  let totalViews = 0;
  for (const row of tsRows) {
    const bucket = normalizeSurface(row.surface);
    const v = row.views || 0;
    totalViews += v;
    bucketViews.set(bucket, (bucketViews.get(bucket) || 0) + v);
    videoSet.add(row.youtube_video_id);
  }

  const surfaceMix = [...bucketViews.entries()]
    .map(([bucket, views]) => ({
      bucket,
      views,
      sharePct: totalViews > 0 ? Math.round((views / totalViews) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.views - a.views);

  const dominant = surfaceMix[0] || null;

  // 4) Latest search-queries snapshot (independent timestamp — pulls
  // run together but persist with their own per-table timestamps).
  const { data: sqLatest } = await supabase
    .from('client_search_queries')
    .select('captured_at')
    .eq('client_id', clientId)
    .order('captured_at', { ascending: false })
    .limit(1);

  let searchQueries = { all: [], unbranded: [] };
  if (sqLatest?.length) {
    const { data: sqRows } = await supabase
      .from('client_search_queries')
      .select('query, views, is_branded')
      .eq('client_id', clientId)
      .eq('captured_at', sqLatest[0].captured_at)
      .order('views', { ascending: false });
    if (sqRows?.length) {
      searchQueries = {
        all: sqRows,
        unbranded: sqRows.filter(r => !r.is_branded),
      };
    }
  }

  return {
    captured_at: latestTsAt,
    window: { start: tsRows[0].window_start, end: tsRows[0].window_end },
    total_views: totalViews,
    n_videos: videoSet.size,
    surface_mix: surfaceMix,
    dominant_surface: dominant?.bucket || null,
    dominant_share_pct: dominant?.sharePct || 0,
    search_queries: searchQueries,
  };
}

export default { loadSurfaceContext, normalizeSurface, TARGET_SURFACES };
