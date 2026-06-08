/**
 * thisWeekService — "what should I do right now?" alerts feed across
 * all clients.
 *
 * Surfaces in ThisWeekWorkspace (Operate → This Week). One round-trip
 * pulls every freshness/staleness/error signal worth attention this
 * week. Each row says: client, signal, severity, click → take me to
 * the surface that resolves it.
 *
 * Signal types (all derived from existing tables — no schema additions):
 *   - stale_repositioning_audit  — last audit > 4 weeks ago (or never)
 *   - stale_calibration          — calibration > 4 weeks behind latest audit
 *   - stale_brief                — brief > 7 days old (or never generated)
 *   - oauth_connection_error     — youtube_oauth_connections.connection_error set
 *   - oauth_invite_pending       — pending invites about to expire (within 48h)
 *   - sync_error                 — channels.last_sync_error set for client channel
 *   - empty_peer_cohort          — client has no peer-tagged channels yet
 *   - prelaunch_past_launch_date — pre-launch client whose intended launch is past
 *
 * Severity tiers:
 *   high   — blocks core workflow (sync errors, OAuth errors, no peer cohort)
 *   medium — quality risk (stale audit/calibration/brief, invite expiring)
 *   low    — informational (pre-launch past date, etc.)
 *
 * Sort: severity desc, then created_at desc.
 */

import { supabase } from './supabaseClient';

const WEEK_MS  = 7 * 86_400_000;
const MONTH_MS = 28 * 86_400_000;

export const SEVERITY_ORDER = { high: 3, medium: 2, low: 1 };

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * Load alerts across all clients the current user can access.
 *
 * @param {Object} args
 * @param {Array<string>} args.clientIds — channels.id list (UUIDs)
 * @returns {Promise<{ alerts: Array, byClient: Object, summary: Object }>}
 *   alerts: flat array sorted by severity desc then recency desc
 *   byClient: { [clientId]: [alerts...] } for client-grouped views
 *   summary: { total, high, medium, low, clientsWithAlerts }
 */
export async function loadThisWeekAlerts({ clientIds }) {
  if (!supabase || !clientIds?.length) return emptyResult();

  const now = Date.now();

  // Run each signal pull in parallel.
  const [
    audits, calibrations, briefs, oauthConns, invites, channelMeta,
  ] = await Promise.all([
    loadLatestAudits(clientIds),
    loadLatestCalibrations(clientIds),
    loadLatestBriefs(clientIds),
    loadOauthConnectionsForClients(clientIds),
    loadPendingInvites(),
    loadChannelMeta(clientIds),
  ]);

  const alerts = [];

  // ── Per-client signals ──
  for (const clientId of clientIds) {
    const client = channelMeta[clientId];
    if (!client) continue;

    // Stale repositioning audit
    const audit = audits[clientId];
    const ageAudit = audit ? now - new Date(audit.created_at).getTime() : Infinity;
    if (!audit) {
      alerts.push(make({
        clientId, clientName: client.name, severity: 'medium',
        type: 'stale_repositioning_audit',
        label: 'No repositioning audit yet',
        description: 'Bulk-score the channel\'s catalog so the scorer has predictions to validate.',
        targetTab: 'repositioning',
        createdAt: client.created_at,
      }));
    } else if (ageAudit > MONTH_MS && !client.is_prelaunch) {
      alerts.push(make({
        clientId, clientName: client.name, severity: 'medium',
        type: 'stale_repositioning_audit',
        label: `Audit is ${Math.round(ageAudit / 86_400_000)} days old`,
        description: 'New videos since the last audit aren\'t in the systemic gap/strength picture. Re-run.',
        targetTab: 'repositioning',
        createdAt: audit.created_at,
      }));
    }

    // Stale calibration relative to latest audit
    const calib = calibrations[clientId];
    if (audit && !calib) {
      alerts.push(make({
        clientId, clientName: client.name, severity: 'medium',
        type: 'stale_calibration',
        label: 'Audit has no calibration',
        description: 'Run calibration against the latest audit. Every audit finding is a claim until validated.',
        targetTab: 'calibration',
        createdAt: audit.created_at,
      }));
    } else if (audit && calib && new Date(calib.created_at) < new Date(audit.created_at)) {
      alerts.push(make({
        clientId, clientName: client.name, severity: 'low',
        type: 'stale_calibration',
        label: 'Calibration predates the latest audit',
        description: 'Audit was re-run after calibration. Re-calibrate to keep the trust ranking honest.',
        targetTab: 'calibration',
        createdAt: calib.created_at,
      }));
    }

    // Stale brief
    const brief = briefs[clientId];
    const ageBrief = brief ? now - new Date(brief.created_at).getTime() : Infinity;
    if (!brief && !client.is_prelaunch) {
      alerts.push(make({
        clientId, clientName: client.name, severity: 'medium',
        type: 'stale_brief',
        label: 'No weekly brief generated yet',
        description: 'Generate the strategist-facing brief — the artifact that translates analytics into client recommendations.',
        targetTab: 'weekly-brief',
        createdAt: client.created_at,
      }));
    } else if (brief && ageBrief > WEEK_MS) {
      alerts.push(make({
        clientId, clientName: client.name, severity: 'medium',
        type: 'stale_brief',
        label: `Brief is ${Math.round(ageBrief / 86_400_000)} days old`,
        description: 'Regenerate against the current analytical state.',
        targetTab: 'weekly-brief',
        createdAt: brief.created_at,
      }));
    }

    // Channel sync error
    if (client.last_sync_error) {
      alerts.push(make({
        clientId, clientName: client.name, severity: 'high',
        type: 'sync_error',
        label: 'Channel sync failing',
        description: client.last_sync_error.length > 140
          ? client.last_sync_error.slice(0, 140) + '…'
          : client.last_sync_error,
        targetTab: 'api-keys',
        createdAt: client.last_sync_attempt_at,
      }));
    }

    // Empty peer cohort (after migration 093 every channel defaults
    // to peer, so this only fires when client_channels has zero rows
    // OR all rows are tagged aspirational/reference)
    const peerCount = (oauthConns[clientId]?.peerChannelCount) ?? null;
    if (peerCount === 0 && !client.is_prelaunch) {
      alerts.push(make({
        clientId, clientName: client.name, severity: 'high',
        type: 'empty_peer_cohort',
        label: 'No peer-tagged competitors',
        description: 'Prediction surfaces (Pre-flight, Repositioning, Calibration) read from peer-tagged channels. Tag at least one peer in Cohort to enable scoring.',
        targetTab: 'cohort-roles',
        createdAt: client.created_at,
      }));
    }

    // Pre-launch past intended launch date
    if (client.is_prelaunch && client.prelaunch_intended_launch_at) {
      const launchAt = new Date(client.prelaunch_intended_launch_at).getTime();
      if (launchAt < now) {
        const daysPast = Math.round((now - launchAt) / 86_400_000);
        alerts.push(make({
          clientId, clientName: client.name, severity: 'low',
          type: 'prelaunch_past_launch_date',
          label: `Pre-launch client is ${daysPast} days past intended launch`,
          description: 'Either upgrade to the real channel or revise the intended launch date.',
          targetTab: 'portfolio',
          createdAt: client.prelaunch_intended_launch_at,
        }));
      }
    }

    // OAuth connection error for this client's channel
    const conn = oauthConns[clientId]?.connection;
    if (conn?.connection_error) {
      alerts.push(make({
        clientId, clientName: client.name, severity: 'high',
        type: 'oauth_connection_error',
        label: 'OAuth connection error',
        description: conn.connection_error.length > 140 ? conn.connection_error.slice(0, 140) + '…' : conn.connection_error,
        targetTab: 'api-keys',
        createdAt: conn.updated_at || conn.last_refreshed_at,
      }));
    }
  }

  // ── Global signals (not per-client) ──
  for (const invite of invites) {
    const expiresAt = new Date(invite.expires_at).getTime();
    const hoursOut = (expiresAt - now) / 3_600_000;
    if (hoursOut > 0 && hoursOut < 48) {
      alerts.push(make({
        clientId: null,
        clientName: invite.client_label || invite.expected_youtube_email || 'Untitled invite',
        severity: 'medium',
        type: 'oauth_invite_expiring',
        label: `OAuth invite expires in ${Math.round(hoursOut)}h`,
        description: 'The owner hasn\'t accepted yet. Follow up before it expires or revoke and re-send.',
        targetTab: 'api-keys',
        createdAt: invite.created_at,
      }));
    }
  }

  // Sort: severity desc, recency desc
  alerts.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  // Group by client + summary counts
  const byClient = {};
  for (const a of alerts) {
    if (!a.clientId) continue;
    if (!byClient[a.clientId]) byClient[a.clientId] = [];
    byClient[a.clientId].push(a);
  }

  const summary = {
    total:               alerts.length,
    high:                alerts.filter(a => a.severity === 'high').length,
    medium:              alerts.filter(a => a.severity === 'medium').length,
    low:                 alerts.filter(a => a.severity === 'low').length,
    clientsWithAlerts:   Object.keys(byClient).length,
  };
  return { alerts, byClient, summary };
}

// ──────────────────────────────────────────────────
// Loaders
// ──────────────────────────────────────────────────

function emptyResult() {
  return { alerts: [], byClient: {}, summary: { total: 0, high: 0, medium: 0, low: 0, clientsWithAlerts: 0 } };
}

function make({ clientId, clientName, severity, type, label, description, targetTab, createdAt }) {
  return {
    id: `${clientId || 'global'}-${type}-${createdAt || ''}`,
    clientId, clientName, severity, type, label, description, targetTab, createdAt,
  };
}

async function loadLatestAudits(clientIds) {
  const { data } = await supabase
    .from('client_repositioning_audits')
    .select('client_id, id, created_at')
    .in('client_id', clientIds)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  return takeLatestByClient(data, 'client_id');
}

async function loadLatestCalibrations(clientIds) {
  const { data } = await supabase
    .from('client_calibration_runs')
    .select('client_id, id, created_at')
    .in('client_id', clientIds)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  return takeLatestByClient(data, 'client_id');
}

async function loadLatestBriefs(clientIds) {
  const { data } = await supabase
    .from('client_weekly_briefs')
    .select('client_id, id, created_at')
    .in('client_id', clientIds)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  return takeLatestByClient(data, 'client_id');
}

async function loadOauthConnectionsForClients(clientIds) {
  // For each client, find the OAuth connection (team-OAuth model — any
  // user) PLUS count peer-tagged channels in client_channels.
  const { data: clients } = await supabase
    .from('channels')
    .select('id, youtube_channel_id')
    .in('id', clientIds);

  const result = {};
  for (const c of (clients || [])) {
    result[c.id] = { connection: null, peerChannelCount: 0 };
    // Connection
    if (c.youtube_channel_id) {
      const { data: conns } = await supabase
        .from('youtube_oauth_connections')
        .select('connection_error, last_refreshed_at, updated_at')
        .eq('youtube_channel_id', c.youtube_channel_id)
        .order('last_refreshed_at', { ascending: false, nullsFirst: false })
        .limit(1);
      result[c.id].connection = conns?.[0] || null;
    }
    // Peer count via cohort_role filter
    const { count: peerCount } = await supabase
      .from('client_channels')
      .select('channel_id', { count: 'exact', head: true })
      .eq('client_id', c.id)
      .eq('cohort_role', 'peer');
    result[c.id].peerChannelCount = peerCount || 0;
  }
  return result;
}

async function loadPendingInvites() {
  const { data } = await supabase
    .from('youtube_oauth_invites')
    .select('id, client_label, expected_youtube_email, expires_at, created_at, status')
    .eq('status', 'pending');
  return data || [];
}

async function loadChannelMeta(clientIds) {
  const { data } = await supabase
    .from('channels')
    .select('id, name, last_synced_at, last_sync_attempt_at, last_sync_error, is_prelaunch, prelaunch_intended_launch_at, created_at')
    .in('id', clientIds);
  const map = {};
  for (const c of (data || [])) map[c.id] = c;
  return map;
}

function takeLatestByClient(rows, clientKey) {
  const map = {};
  for (const r of (rows || [])) {
    if (!map[r[clientKey]]) map[r[clientKey]] = r;
  }
  return map;
}

export default { loadThisWeekAlerts, SEVERITY_ORDER };
