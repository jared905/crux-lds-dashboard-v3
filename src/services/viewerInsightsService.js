/**
 * viewerInsightsService — reads the audience_breakdowns table that
 * /api/cron/audience-sync fills nightly (migration 111).
 *
 * Returns the latest synced window for a channel, grouped by
 * dimension, with the format split ('all' / 'shorts' / 'longform')
 * kept separate so the UI can show totals and the shorts-vs-long
 * story side by side.
 */

import { supabase } from './supabaseClient.js';

/**
 * @returns {{
 *   period: {start: string, end: string} | null,
 *   syncedAt: string | null,
 *   byDimension: Record<string, Array<{value: string, format: string, views: number, watchMinutes: number, avgViewDurationSeconds: number|null}>>
 * }}
 */
export async function getViewerBreakdowns(channelId) {
  if (!supabase || !channelId) return { period: null, syncedAt: null, byDimension: {} };

  // Latest period_end for this channel first, then everything in that window.
  const { data: latest, error: latestError } = await supabase
    .from('audience_breakdowns')
    .select('period_start, period_end, synced_at')
    .eq('channel_id', channelId)
    .order('period_end', { ascending: false })
    .limit(1);
  if (latestError) {
    // Migration 111 not applied yet → PostgREST "table not in schema
    // cache". That is "no data yet", not a failure the strategist can
    // act on — the empty state explains what has to happen first.
    if (latestError.code === 'PGRST205' || /audience_breakdowns/.test(latestError.message || '')) {
      return { period: null, syncedAt: null, byDimension: {} };
    }
    throw latestError;
  }
  if (!latest || latest.length === 0) return { period: null, syncedAt: null, byDimension: {} };

  const { period_start, period_end, synced_at } = latest[0];

  const { data: rows, error } = await supabase
    .from('audience_breakdowns')
    .select('dimension, dimension_value, format, views, watch_minutes, avg_view_duration_seconds')
    .eq('channel_id', channelId)
    .eq('period_start', period_start)
    .eq('period_end', period_end)
    .order('views', { ascending: false });
  if (error) throw error;

  const byDimension = {};
  for (const r of rows || []) {
    if (!byDimension[r.dimension]) byDimension[r.dimension] = [];
    byDimension[r.dimension].push({
      value: r.dimension_value,
      format: r.format,
      views: Number(r.views) || 0,
      watchMinutes: Number(r.watch_minutes) || 0,
      avgViewDurationSeconds: r.avg_view_duration_seconds != null ? Number(r.avg_view_duration_seconds) : null,
    });
  }

  return {
    period: { start: period_start, end: period_end },
    syncedAt: synced_at,
    byDimension,
  };
}

/**
 * Shorts → long-form handoff, the honest version.
 *
 * YouTube does not expose viewer-level journeys ("how many shorts
 * before someone watches a long"), so no tool outside Studio can
 * measure conversion directly. What the upload history CAN show is
 * the publish-cadence correlation: do long-form videos published
 * after a burst of shorts do better than ones published cold?
 *
 * Method: for each long-form video, count shorts published in the 14
 * days before it, bucket (0 / 1–2 / 3–5 / 6+), and compare median
 * views-per-day-since-publish across buckets (per-day normalising
 * removes the old-videos-have-more-views bias). Directional evidence,
 * clearly labelled as such in the UI — never a conversion claim.
 */
export function computeShortsHandoff(rows) {
  if (!rows?.length) return null;

  const parsed = rows
    .filter(r => r.publishDate && r.views > 0)
    .map(r => ({
      date: new Date(r.publishDate),
      views: r.views,
      isShort: (r.type || '').toLowerCase().includes('short') || (r.duration && r.duration <= 180),
    }))
    .filter(r => !isNaN(r.date.getTime()));

  const shorts = parsed.filter(r => r.isShort);
  const longs = parsed.filter(r => !r.isShort);
  if (longs.length < 6 || shorts.length < 3) return null; // too thin to say anything

  const now = Date.now();
  const WINDOW = 14 * 86400000;

  const buckets = [
    { label: '0 shorts', min: 0, max: 0, samples: [] },
    { label: '1–2 shorts', min: 1, max: 2, samples: [] },
    { label: '3–5 shorts', min: 3, max: 5, samples: [] },
    { label: '6+ shorts', min: 6, max: Infinity, samples: [] },
  ];

  for (const L of longs) {
    const t = L.date.getTime();
    const priorShorts = shorts.filter(s => {
      const st = s.date.getTime();
      return st >= t - WINDOW && st < t;
    }).length;
    const daysSince = Math.max((now - t) / 86400000, 7);
    const viewsPerDay = L.views / daysSince;
    const bucket = buckets.find(b => priorShorts >= b.min && priorShorts <= b.max);
    if (bucket) bucket.samples.push(viewsPerDay);
  }

  const median = (arr) => {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const result = buckets
    .map(b => ({ label: b.label, count: b.samples.length, medianViewsPerDay: median(b.samples) }))
    .filter(b => b.count > 0);

  // Need at least two populated buckets for a comparison to exist.
  if (result.filter(b => b.count >= 2).length < 2) return null;
  return result;
}
