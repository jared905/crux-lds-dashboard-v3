/**
 * commandCenterService — cross-portfolio landing view.
 *
 * Single round-trip composing three existing services into one
 * "what's the state of everything?" payload:
 *
 *   - portfolioService.listPortfolio: per-client lifecycle, ownership,
 *     freshness, sync errors, classifier coverage
 *   - thisWeekService.loadThisWeekAlerts: cross-client alerts feed
 *     (already returns severity-ranked items including the install
 *     intake signals added in commit a115980)
 *   - installIntakeService.getIntakeCompletion: per-client install
 *     completion % so Command Center can surface "install N% complete"
 *     in the client cards and average it for the pulse strip
 *
 * No new schema. No new tables. This service is composition only.
 *
 * Returns:
 *   {
 *     pulse: {
 *       totalClients, prelaunchCount, oauthActiveCount,
 *       alertsBySeverity: { high, medium, low, total },
 *       intakePendingCount,            // total unconfirmed intake answers
 *       avgInstallCompletionPct,       // average across non-prospect clients
 *       oauthHealthPct,                // (active connections / clients that need one) * 100
 *     },
 *     topAlerts: [ ...top 3 by severity then recency ],
 *     clientCards: [
 *       {
 *         id, name, thumbnailUrl, lifecycleStage, isPrelaunch,
 *         subscriberCount, lastSyncedAt, hasSyncError,
 *         alertCount, alertSeverityMax,
 *         installCompletionPct, intakePendingCount,
 *         primaryStrategist,
 *       }
 *     ],
 *   }
 */

import { supabase } from './supabaseClient';
import { listPortfolio } from './portfolioService';
import { loadThisWeekAlerts, SEVERITY_ORDER } from './thisWeekService';
import { getIntakeCompletion } from './installIntakeService';

export async function loadCommandCenter() {
  // 1) Portfolio (per-client master list)
  const portfolio = await listPortfolio();
  const clients = portfolio?.clients || [];

  if (clients.length === 0) {
    return emptyPayload();
  }

  const clientIds = clients.map(c => c.id);

  // 2) This Week alerts (cross-client) + per-client install completion
  //    + the new per-card enrichments (sub delta, recent activity,
  //    peer cohort count, brief age) — all in parallel.
  const [alertsResult, intakeByClient, growthByClient, activityByClient, peersByClient, briefsByClient] = await Promise.all([
    loadThisWeekAlerts({ clientIds }),
    loadAllIntakeCompletions(clientIds),
    loadSubGrowthByClient(clientIds),
    loadRecentActivityByClient(clientIds),
    loadPeerCohortCounts(clientIds),
    loadLatestBriefAges(clientIds),
  ]);

  const alerts = alertsResult.alerts || [];

  // 3) Compose per-client cards. The portfolioService row carries most
  // of what we need; we augment with alert counts and intake metrics.
  const alertsByClient = {};
  for (const a of alerts) {
    if (!a.clientId) continue;
    if (!alertsByClient[a.clientId]) alertsByClient[a.clientId] = [];
    alertsByClient[a.clientId].push(a);
  }

  const clientCards = clients.map(c => {
    const myAlerts = alertsByClient[c.id] || [];
    const intake   = intakeByClient[c.id] || null;
    const growth   = growthByClient[c.id]   || null;
    const activity = activityByClient[c.id] || null;
    const peerCount = peersByClient[c.id]    || 0;
    const briefAge  = briefsByClient[c.id]   || null;
    // Prospect / pre-launch clients have no channel to sync, so a
    // last_sync_error from a prior staged run is not a current
    // failure — suppress on the card UI. Reported 2026-06-12.
    const noChannel = !!c.is_prelaunch || c.lifecycle_stage === 'prospect';
    // Intake completion: null = "never started" (legacy clients
    // onboarded before the install workspace existed). 0% would lie
    // about engagement state. UI renders "—" for null.
    const hasIntakeRows = intake && intake.answered > 0;
    const alertSeverityMax = myAlerts.length
      ? maxSeverity(myAlerts.map(a => a.severity))
      : null;
    // Top alert = highest severity, then most recent. This is what the
    // user is shown inline + what the card click routes to when alerts
    // exist (the "fix the issues" intent the strategist actually has
    // when they click a flagged card — reported 2026-06-12).
    const topAlert = myAlerts.length
      ? [...myAlerts].sort((a, b) =>
          (SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])
          || (new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        )[0]
      : null;
    return {
      id:                    c.id,
      name:                  c.name,
      thumbnailUrl:          c.thumbnail_url || null,
      lifecycleStage:        c.lifecycle_stage || null,
      isPrelaunch:           !!c.is_prelaunch,
      subscriberCount:       c.subscriber_count || 0,
      lastSyncedAt:          c.last_data_api_pull_at || c.last_synced_at || null,
      hasSyncError:          !!c.last_sync_error && !noChannel,
      noChannelStage:        noChannel,
      alertCount:            myAlerts.length,
      alertSeverityMax,
      // Pass slimmed alerts so the card can render an inline list
      // when count is small enough, and so the click handler can
      // route to a specific surface instead of the dashboard.
      alerts: myAlerts.map(a => ({
        severity:   a.severity,
        label:      a.label,
        targetTab:  a.targetTab,
        type:       a.type,
      })),
      topAlert: topAlert ? {
        severity:  topAlert.severity,
        label:     topAlert.label,
        targetTab: topAlert.targetTab,
      } : null,
      intakeCompletionPct:   hasIntakeRows ? intake.completion_pct : null,
      intakeAnswered:        intake ? intake.answered : 0,
      intakeConfirmed:       intake ? intake.confirmed : 0,
      intakeTotal:           intake ? intake.total : 16,
      // 30d subscriber delta (null = no snapshot history available)
      subDelta30d:           growth?.delta30d ?? null,
      // Recent video activity
      videosLast30d:         activity?.count30d ?? 0,
      lastUploadAt:          activity?.lastUploadAt || null,
      // Cohort
      peerCohortCount:       peerCount,
      // Most recent strategist artifact age (days)
      latestBriefAgeDays:    briefAge?.ageDays ?? null,
      primaryStrategist:     c.primary_strategist_name || c.primary_strategist_id || null,
    };
  });

  // 4) Pulse counters across the portfolio.
  const prelaunchCount   = clientCards.filter(c => c.isPrelaunch).length;
  const oauthActiveCount = clients.filter(c => c.lifecycle_stage === 'oauth_active').length;
  const oauthCandidate   = clients.filter(c => !c.is_prelaunch).length;
  const oauthHealthPct   = oauthCandidate > 0
    ? Math.round((oauthActiveCount / oauthCandidate) * 100)
    : 0;

  const alertsBySeverity = { high: 0, medium: 0, low: 0, total: alerts.length };
  for (const a of alerts) alertsBySeverity[a.severity] = (alertsBySeverity[a.severity] || 0) + 1;

  // Intake pending: sum across clients that have any pending intake alerts
  // (the alert label already counted them; here we re-derive from
  // intakeByClient for the pulse counter — separate concept from alert count).
  let intakePendingCount = 0;
  for (const cid of clientIds) {
    const ic = intakeByClient[cid];
    if (ic) intakePendingCount += Math.max(0, ic.answered - ic.confirmed);
  }

  // Intake completion average — only across clients that have started
  // intake. A client with no intake rows is excluded (rather than
  // counted as 0%), which matches the per-card behavior.
  const intakeStarted = clientCards.filter(c => c.intakeCompletionPct != null);
  const avgIntakeCompletionPct = intakeStarted.length
    ? Math.round(intakeStarted.reduce((s, c) => s + c.intakeCompletionPct, 0) / intakeStarted.length)
    : null;

  // 5) Top alerts — first 3 by severity desc, then by createdAt desc.
  const topAlerts = [...alerts]
    .sort((a, b) =>
      (SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])
      || (new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    )
    .slice(0, 3);

  return {
    pulse: {
      totalClients:           clients.length,
      prelaunchCount,
      oauthActiveCount,
      oauthHealthPct,
      alertsBySeverity,
      intakePendingCount,
      avgIntakeCompletionPct,
      intakeStartedClients:   intakeStarted.length,
    },
    topAlerts,
    clientCards,
  };
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

async function loadAllIntakeCompletions(clientIds) {
  // Per-client completion runs N small queries. For small portfolios
  // (<50 clients) this is fine; for larger ones we'd want a single
  // group-by query, but that's an optimization for later.
  const results = await Promise.all(
    clientIds.map(async id => {
      try { return [id, await getIntakeCompletion(id)]; }
      catch { return [id, null]; }
    })
  );
  return Object.fromEntries(results);
}

/**
 * 30-day subscriber growth from channel_snapshots. Returns
 *   { [clientId]: { delta30d, currentSubs } }
 * Snapshot diff: most-recent — closest-snapshot-≤30-days-ago.
 * Null when no snapshots exist in either window.
 */
async function loadSubGrowthByClient(clientIds) {
  if (!clientIds?.length) return {};
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];
  // Pull the last 35 days of snapshots — enough to find a "≥30 days ago" anchor
  const since = new Date(Date.now() - 35 * 86_400_000).toISOString().split('T')[0];
  const { data } = await supabase
    .from('channel_snapshots')
    .select('channel_id, snapshot_date, subscriber_count')
    .in('channel_id', clientIds)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true });
  const byClient = {};
  for (const row of data || []) {
    if (!byClient[row.channel_id]) byClient[row.channel_id] = [];
    byClient[row.channel_id].push(row);
  }
  const out = {};
  for (const [clientId, rows] of Object.entries(byClient)) {
    if (!rows.length) continue;
    const latest = rows[rows.length - 1];
    // anchor = first row at or before thirtyDaysAgo
    const anchor = [...rows].reverse().find(r => r.snapshot_date <= thirtyDaysAgo) || rows[0];
    out[clientId] = {
      delta30d:    (latest.subscriber_count || 0) - (anchor.subscriber_count || 0),
      currentSubs: latest.subscriber_count || 0,
    };
  }
  return out;
}

/**
 * Recent video activity per client: count of videos published in the
 * last 30 days + most recent published_at.
 */
async function loadRecentActivityByClient(clientIds) {
  if (!clientIds?.length) return {};
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: recent } = await supabase
    .from('videos')
    .select('channel_id, published_at')
    .in('channel_id', clientIds)
    .gte('published_at', since);
  const counts = {};
  for (const v of recent || []) {
    if (!counts[v.channel_id]) counts[v.channel_id] = { count30d: 0, lastUploadAt: null };
    counts[v.channel_id].count30d++;
    if (!counts[v.channel_id].lastUploadAt || v.published_at > counts[v.channel_id].lastUploadAt) {
      counts[v.channel_id].lastUploadAt = v.published_at;
    }
  }
  // Also get the absolute most-recent upload (could be older than 30d)
  // for clients with no recent activity — so we can show "Quiet 47d".
  const missing = clientIds.filter(id => !counts[id]);
  if (missing.length) {
    const { data: stale } = await supabase
      .from('videos')
      .select('channel_id, published_at')
      .in('channel_id', missing)
      .order('published_at', { ascending: false });
    const seen = new Set();
    for (const v of stale || []) {
      if (seen.has(v.channel_id)) continue;
      seen.add(v.channel_id);
      counts[v.channel_id] = { count30d: 0, lastUploadAt: v.published_at };
    }
  }
  return counts;
}

/**
 * Count of peer-tagged competitor channels per client from the
 * client_channels junction. Used by both the card pill and the
 * "empty peer cohort" alert.
 */
async function loadPeerCohortCounts(clientIds) {
  if (!clientIds?.length) return {};
  const { data } = await supabase
    .from('client_channels')
    .select('client_id, cohort_role')
    .in('client_id', clientIds)
    .eq('cohort_role', 'peer');
  const counts = {};
  for (const row of data || []) {
    counts[row.client_id] = (counts[row.client_id] || 0) + 1;
  }
  return counts;
}

/**
 * Age (days) of each client's most recent weekly brief. Null if no
 * brief exists. The card surfaces this as "Brief: 5d" / "Brief: never".
 */
async function loadLatestBriefAges(clientIds) {
  if (!clientIds?.length) return {};
  const { data } = await supabase
    .from('client_weekly_briefs')
    .select('client_id, created_at')
    .in('client_id', clientIds)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  const seen = new Set();
  const out = {};
  for (const row of data || []) {
    if (seen.has(row.client_id)) continue;
    seen.add(row.client_id);
    const ageDays = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86_400_000);
    out[row.client_id] = { ageDays };
  }
  return out;
}

function maxSeverity(severities) {
  let max = 0, label = 'low';
  for (const s of severities) {
    const w = SEVERITY_ORDER[s] || 0;
    if (w > max) { max = w; label = s; }
  }
  return label;
}

function emptyPayload() {
  return {
    pulse: {
      totalClients: 0, prelaunchCount: 0, oauthActiveCount: 0, oauthHealthPct: 0,
      alertsBySeverity: { high: 0, medium: 0, low: 0, total: 0 },
      intakePendingCount: 0, avgInstallCompletionPct: 0,
    },
    topAlerts:   [],
    clientCards: [],
  };
}

export default { loadCommandCenter };
