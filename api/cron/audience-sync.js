/**
 * Vercel cron — nightly audience-breakdown sync.
 *
 * For every channel with an active YouTube OAuth connection, pulls the
 * channel-level breakdowns the public Analytics API actually offers —
 * country, deviceType, subscribedStatus, insightTrafficSourceType —
 * over a rolling 28-day window, each split by content format
 * (creatorContentType: shorts vs long-form) where the API allows the
 * combination, and upserts into audience_breakdowns.
 *
 * Degradation policy: every query is independent. A dimension that
 * errors (quota, unsupported combo on Brand Accounts, revoked grant)
 * is recorded in the summary and skipped — one bad channel or one bad
 * report never sinks the run. The format split is attempted per
 * dimension and falls back to 'all'-only when the API rejects
 * creatorContentType as a paired dimension.
 *
 * NOT pulled, on purpose: "new vs returning viewers" and shorts→long
 * viewer journeys. Studio-only; the public API has no report for them.
 *
 * Schedule: 0 9 * * * (after sync-fanout at 7, alerts at 7:30).
 * Auth: requireCronOrAdmin (CRON_SECRET or admin session).
 */

import { createClient } from '@supabase/supabase-js';
import { requireCronOrAdmin } from '../_lib/auth.js';
import { getValidAccessToken, runAnalyticsQuery } from '../_lib/youtubeAuth.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const WINDOW_DAYS = 28;

const DIMENSIONS = [
  { dimension: 'country', metrics: 'views,estimatedMinutesWatched', maxResults: 25, sort: '-views' },
  { dimension: 'deviceType', metrics: 'views,estimatedMinutesWatched' },
  { dimension: 'subscribedStatus', metrics: 'views,estimatedMinutesWatched,averageViewDuration' },
  { dimension: 'insightTrafficSourceType', metrics: 'views,estimatedMinutesWatched', maxResults: 25, sort: '-views' },
];

/** API creatorContentType values → our stored format slice names. */
const FORMAT_MAP = {
  SHORTS: 'shorts',
  VIDEO_ON_DEMAND: 'longform',
  LIVE_STREAM: 'live',
};

function isoDate(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Parse an analytics response into upsert rows. Column order follows
 * columnHeaders, so we index by header name instead of position guesses.
 */
function parseRows({ result, channelDbId, dimension, withFormat, periodStart, periodEnd }) {
  const headers = result.columnHeaders.map(h => h.name);
  const idx = (name) => headers.indexOf(name);
  const dimIdx = idx(dimension);
  const fmtIdx = withFormat ? idx('creatorContentType') : -1;
  const viewsIdx = idx('views');
  const minutesIdx = idx('estimatedMinutesWatched');
  const avdIdx = idx('averageViewDuration');

  const out = [];
  for (const row of result.rows) {
    const rawFormat = fmtIdx >= 0 ? row[fmtIdx] : null;
    out.push({
      channel_id: channelDbId,
      dimension,
      dimension_value: String(row[dimIdx]),
      format: rawFormat ? (FORMAT_MAP[rawFormat] || String(rawFormat).toLowerCase()) : 'all',
      period_start: periodStart,
      period_end: periodEnd,
      views: Number(row[viewsIdx]) || 0,
      watch_minutes: minutesIdx >= 0 ? Number(row[minutesIdx]) || 0 : 0,
      avg_view_duration_seconds: avdIdx >= 0 ? Number(row[avdIdx]) || null : null,
      synced_at: new Date().toISOString(),
    });
  }
  return out;
}

export default async function handler(req, res) {
  const authorized = await requireCronOrAdmin(req, res);
  if (!authorized) return; // requireCronOrAdmin already wrote the response

  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_DAYS * 86400000);
  const periodStart = isoDate(start);
  const periodEnd = isoDate(end);

  // Active OAuth connections joined to their channel rows. The
  // channels table is what the dashboard keys on (channel_id UUID);
  // the connection carries the raw YouTube channel id for the API.
  const { data: connections, error: connError } = await supabase
    .from('youtube_oauth_connections')
    .select('id, youtube_channel_id, encrypted_access_token, encrypted_refresh_token, token_expires_at')
    .eq('is_active', true);
  if (connError) {
    return res.status(500).json({ ok: false, error: `connections query failed: ${connError.message}` });
  }

  const { data: channels, error: chanError } = await supabase
    .from('channels')
    .select('id, youtube_channel_id')
    .not('youtube_channel_id', 'is', null);
  if (chanError) {
    return res.status(500).json({ ok: false, error: `channels query failed: ${chanError.message}` });
  }
  const channelByYtId = new Map((channels || []).map(c => [c.youtube_channel_id, c.id]));

  const summary = { window: { periodStart, periodEnd }, channels: [], upserted: 0, skipped: [] };

  for (const connection of connections || []) {
    const ytId = connection.youtube_channel_id;
    const channelDbId = channelByYtId.get(ytId);
    if (!channelDbId) {
      summary.skipped.push({ ytId, reason: 'no matching channels row' });
      continue;
    }

    let accessToken;
    try {
      accessToken = await getValidAccessToken(supabase, connection);
    } catch (e) {
      summary.skipped.push({ ytId, reason: `token: ${e.message}` });
      continue;
    }

    const channelReport = { ytId, dimensions: {} };

    for (const spec of DIMENSIONS) {
      const rowsToUpsert = [];

      // Attempt 1: dimension × creatorContentType in one query — gives
      // the shorts-vs-longform split the boss asked for.
      const split = await runAnalyticsQuery({
        channelId: ytId,
        accessToken,
        dimensions: `creatorContentType,${spec.dimension}`,
        metrics: spec.metrics,
        startDate: periodStart,
        endDate: periodEnd,
        sort: spec.sort,
        maxResults: spec.maxResults ? spec.maxResults * 3 : undefined,
      });
      if (split.ok && split.rows.length > 0) {
        rowsToUpsert.push(...parseRows({
          result: split, channelDbId, dimension: spec.dimension,
          withFormat: true, periodStart, periodEnd,
        }));
      }

      // Always also pull the unsplit totals — they're the primary
      // display numbers, and they work even where the combo doesn't.
      const plain = await runAnalyticsQuery({
        channelId: ytId,
        accessToken,
        dimensions: spec.dimension,
        metrics: spec.metrics,
        startDate: periodStart,
        endDate: periodEnd,
        sort: spec.sort,
        maxResults: spec.maxResults,
      });
      if (plain.ok) {
        rowsToUpsert.push(...parseRows({
          result: plain, channelDbId, dimension: spec.dimension,
          withFormat: false, periodStart, periodEnd,
        }));
      }

      channelReport.dimensions[spec.dimension] = {
        splitOk: split.ok, splitRows: split.ok ? split.rows.length : split.errorReason || split.error,
        plainOk: plain.ok, plainRows: plain.ok ? plain.rows.length : plain.errorReason || plain.error,
      };

      if (rowsToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('audience_breakdowns')
          .upsert(rowsToUpsert, { onConflict: 'channel_id,dimension,dimension_value,format,period_start,period_end' });
        if (upsertError) {
          channelReport.dimensions[spec.dimension].upsertError = upsertError.message;
        } else {
          summary.upserted += rowsToUpsert.length;
        }
      }
    }

    summary.channels.push(channelReport);
  }

  return res.status(200).json({ ok: true, ...summary });
}
