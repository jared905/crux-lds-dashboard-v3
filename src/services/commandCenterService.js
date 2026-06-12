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
  // — run in parallel.
  const [alertsResult, intakeByClient] = await Promise.all([
    loadThisWeekAlerts({ clientIds }),
    loadAllIntakeCompletions(clientIds),
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
      hasSyncError:          !!c.last_sync_error,
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
      installCompletionPct:  intake ? intake.completion_pct : 0,
      intakeAnswered:        intake ? intake.answered : 0,
      intakeConfirmed:       intake ? intake.confirmed : 0,
      intakeTotal:           intake ? intake.total : 16,
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

  const nonProspect = clientCards.filter(c => c.lifecycleStage && c.lifecycleStage !== 'prospect');
  const avgInstallCompletionPct = nonProspect.length
    ? Math.round(nonProspect.reduce((s, c) => s + c.installCompletionPct, 0) / nonProspect.length)
    : 0;

  // 5) Top alerts — first 3 by severity desc, then by createdAt desc.
  const topAlerts = [...alerts]
    .sort((a, b) =>
      (SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])
      || (new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    )
    .slice(0, 3);

  return {
    pulse: {
      totalClients:         clients.length,
      prelaunchCount,
      oauthActiveCount,
      oauthHealthPct,
      alertsBySeverity,
      intakePendingCount,
      avgInstallCompletionPct,
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
