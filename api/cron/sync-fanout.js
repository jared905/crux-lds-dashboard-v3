/**
 * sync-fanout — orchestrator cron that dispatches one parallel
 * serverless invocation per OAuth-connected channel.
 *
 * REPLACES the previous monolithic /api/cron/daily-sync as the
 * SCHEDULED cron (per vercel.json). The /api/cron/daily-sync
 * endpoint still exists and now serves single-connection mode
 * (?connectionId=X) — exactly what each fanned-out invocation hits.
 *
 * WHY THIS EXISTS (2026-06-29):
 *
 * Diagnostic on 2026-06-29 showed that with 19 active OAuth
 * connections, the monolithic daily-sync was completing only ~5
 * channels per run before Vercel's 270s function-budget timeout.
 * The remaining 14 channels were never reached. Stopgap commit on
 * the same day added day-of-year rotation to distribute the
 * starvation, but coverage was still only ~1.3 syncs per channel
 * per week. That doesn't scale.
 *
 * ARCHITECTURE:
 *
 *   sync-fanout  (this file, runs daily at 07:00 UTC)
 *      │
 *      ├── parallel fetch → /api/cron/daily-sync?connectionId=C1   (own 300s budget)
 *      ├── parallel fetch → /api/cron/daily-sync?connectionId=C2   (own 300s budget)
 *      ├── parallel fetch → /api/cron/daily-sync?connectionId=C3   (own 300s budget)
 *      ...
 *      └── parallel fetch → /api/cron/daily-sync?connectionId=CN   (own 300s budget)
 *
 * Total orchestrator runtime ≈ max(per-channel sync time) ≈ 50-90s,
 * NOT the sum. So 100 channels takes the same wall-clock as 5 —
 * bounded only by Vercel's concurrent-invocation limit (~1000 on Pro).
 *
 * BRAND ACCOUNT REFRESH-TOKEN RACE:
 *
 * Connections sharing a youtube_email (Brand Account managed channels
 * — e.g., the 12+ LDS apostle channels) MAY share an underlying refresh
 * token. Parallel refresh against a rotating refresh_token would race.
 *
 * Empirically the existing 2026-06-27 bulk refresh of the apostle
 * group showed 12 connections refreshed within a 4-second window with
 * NO connection_error populated on any row — strong evidence that
 * either (a) each Brand Account channel got its own refresh token at
 * initial OAuth, or (b) Google's refresh-token policy for the
 * youtube.readonly scope doesn't rotate on use. So we run all in
 * parallel without grouping. If errors emerge in production, the next
 * iteration groups by youtube_email and serializes within each group.
 *
 * AUTH:
 *
 * The fan-out orchestrator authenticates with CRON_SECRET (same as
 * any Vercel cron). Each downstream fetch carries the same secret in
 * the Authorization header so the receiving daily-sync endpoint
 * accepts it. We also tag the request with X-Sync-Fanout-Origin so
 * downstream telemetry can distinguish fanout-triggered runs from
 * direct cron runs (during the migration window where both code
 * paths might coexist).
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Per-fetch client-side timeout. If any downstream target hangs longer
// than this, the orchestrator gives up waiting for that one and moves
// on. Set well below Vercel's 300s function budget so the orchestrator
// itself can't get stuck. The downstream invocation keeps running
// independently — orchestrator just stops awaiting its response.
const PER_CHANNEL_TIMEOUT_MS = 240_000;

export default async function handler(req, res) {
  // Same auth pattern as every other cron endpoint
  const authHeader = req.headers.authorization;
  const manualTrigger = req.query?.manual === 'true';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !manualTrigger) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const startTime = Date.now();
  console.log('[Sync Fanout] Starting...');

  // 1) Load every active connection
  const { data: connections, error: loadErr } = await supabase
    .from('youtube_oauth_connections')
    .select('id, youtube_channel_title, youtube_email')
    .eq('is_active', true);

  if (loadErr) {
    console.error('[Sync Fanout] Failed to load connections:', loadErr);
    return res.status(500).json({ success: false, error: loadErr.message });
  }

  if (!connections || connections.length === 0) {
    console.log('[Sync Fanout] No active connections to dispatch');
    return res.status(200).json({
      success: true,
      message: 'No active connections',
      dispatched: 0,
      duration: Date.now() - startTime,
    });
  }

  console.log(`[Sync Fanout] Dispatching ${connections.length} parallel per-channel syncs`);

  // 2) Resolve our own base URL. Vercel sets x-forwarded-proto and
  //    host headers; BASE_URL env var overrides for non-Vercel or
  //    locally-tunneled runs.
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers.host;
  const baseUrl = process.env.BASE_URL || `${proto}://${host}`;

  // 3) Fire one fetch per connection in parallel. Each target hits the
  //    existing single-connection mode of daily-sync, which runs as
  //    its own serverless function with its own 300s budget.
  const dispatches = connections.map(async (conn) => {
    const url = `${baseUrl}/api/cron/daily-sync?connectionId=${conn.id}`;
    const fetchStart = Date.now();

    // Client-side timeout so a hung target doesn't pin the orchestrator
    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort(),
      PER_CHANNEL_TIMEOUT_MS,
    );

    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization':         `Bearer ${process.env.CRON_SECRET}`,
          'X-Sync-Fanout-Origin':  'true',
        },
        signal: controller.signal,
      });
      const result = await resp.json().catch(() => ({}));
      return {
        connectionId: conn.id,
        channelTitle: conn.youtube_channel_title,
        ok: resp.ok,
        status: resp.status,
        duration: Date.now() - fetchStart,
        videosUpdated:     result?.results?.[0]?.videosUpdated || 0,
        snapshotsCreated:  result?.results?.[0]?.snapshotsCreated || 0,
        error: !resp.ok ? (result?.error || `HTTP ${resp.status}`) : null,
      };
    } catch (err) {
      // AbortError (client timeout) vs network error — distinguish in logs
      const isTimeout = err?.name === 'AbortError';
      return {
        connectionId: conn.id,
        channelTitle: conn.youtube_channel_title,
        ok: false,
        duration: Date.now() - fetchStart,
        error: isTimeout
          ? `Orchestrator gave up waiting after ${PER_CHANNEL_TIMEOUT_MS}ms — downstream invocation may still be running`
          : err.message,
        timedOut: isTimeout,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  });

  // 4) Wait for all in parallel. Total time bounded by slowest single
  //    channel (not the sum). With 19 channels × ~50s each in parallel,
  //    orchestrator wall-clock is ~50s.
  const settled = await Promise.allSettled(dispatches);
  const results = settled.map(r => r.value || { ok: false, error: 'Promise rejected' });

  const succeeded  = results.filter(r => r.ok).length;
  const failed     = results.filter(r => !r.ok && !r.timedOut).length;
  const timedOut   = results.filter(r => r.timedOut).length;
  const duration   = Date.now() - startTime;

  console.log(
    `[Sync Fanout] Complete in ${duration}ms — ${succeeded}/${connections.length} ok, ${failed} failed, ${timedOut} timed out (orchestrator-side)`
  );

  return res.status(200).json({
    success: true,
    total:    connections.length,
    succeeded,
    failed,
    timedOut,
    duration,
    results,
  });
}
