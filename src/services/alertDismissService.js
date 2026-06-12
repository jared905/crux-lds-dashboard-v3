/**
 * alertDismissService — strategist-side snooze for cross-client alerts.
 *
 * Migration 106 (2026-06-12). Composite key is (client_id, alert_type) —
 * one active dismissal per pair. Re-dismissing updates the row.
 *
 * Snooze semantics:
 *   - snoozeDays = null → permanent dismissal (until manually undone)
 *   - snoozeDays = N    → alert resurfaces after N days
 *
 * The service-layer filter in thisWeekService.applyDismissals treats
 * expired snoozes as inactive, so resurfaced alerts behave like any
 * other alert. No cron cleanup needed; expired rows are inert.
 */

import { supabase } from './supabaseClient';

/**
 * Dismiss an alert. Re-dismissal of an existing (client, type) pair
 * updates the row's snooze_until + dismissed_at.
 *
 * @param {Object} args
 * @param {string|null} args.clientId   — null for global alerts (oauth_invite_pending)
 * @param {string} args.alertType
 * @param {number|null} args.snoozeDays — null = permanent
 * @param {string} [args.reason]
 * @param {string} [args.dismissedBy]
 */
export async function dismissAlert({ clientId = null, alertType, snoozeDays = null, reason = null, dismissedBy = null }) {
  if (!alertType) return { ok: false, error: 'alertType required' };
  const snoozeUntil = snoozeDays != null
    ? new Date(Date.now() + snoozeDays * 86_400_000).toISOString()
    : null;
  const row = {
    client_id:    clientId,
    alert_type:   alertType,
    snooze_until: snoozeUntil,
    dismissed_at: new Date().toISOString(),
    dismissed_by: dismissedBy,
    reason,
    updated_at:   new Date().toISOString(),
  };
  // Upsert via delete-then-insert — the COALESCE unique index makes
  // a normal upsert awkward across NULL client_ids. Two ops; idempotent.
  await supabase.from('alert_dismissals')
    .delete()
    .match({ client_id: clientId, alert_type: alertType });
  const { error } = await supabase.from('alert_dismissals').insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Undismiss / un-snooze. Removes the dismissal row entirely.
 */
export async function undismissAlert({ clientId = null, alertType }) {
  if (!alertType) return { ok: false, error: 'alertType required' };
  const { error } = await supabase.from('alert_dismissals')
    .delete()
    .match({ client_id: clientId, alert_type: alertType });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Load every active dismissal (snooze_until null or in future).
 * Returns a Set of "clientId|alertType" keys for fast O(1) lookup
 * during alert filtering. null clientId is rendered as the literal
 * "null" string in the key so the lookup is uniform.
 */
export async function loadActiveDismissals(clientIds) {
  if (!supabase) return { keys: new Set(), rows: [] };
  const nowIso = new Date().toISOString();
  let query = supabase.from('alert_dismissals')
    .select('client_id, alert_type, snooze_until, dismissed_at, reason')
    .or(`snooze_until.is.null,snooze_until.gt.${nowIso}`);
  if (clientIds && clientIds.length) {
    // Include global (NULL client_id) alongside specific clients
    query = query.or(`client_id.is.null,client_id.in.(${clientIds.join(',')})`);
  }
  const { data, error } = await query;
  if (error) {
    console.warn('[alertDismiss] load failed:', error.message);
    return { keys: new Set(), rows: [] };
  }
  const keys = new Set();
  for (const r of data || []) {
    keys.add(makeKey(r.client_id, r.alert_type));
  }
  return { keys, rows: data || [] };
}

export function makeKey(clientId, alertType) {
  return `${clientId || 'null'}|${alertType}`;
}

export const SNOOZE_OPTIONS = [
  { value: 1,    label: '1 day' },
  { value: 7,    label: '7 days' },
  { value: 30,   label: '30 days' },
  { value: null, label: 'Permanently' },
];

export default {
  dismissAlert,
  undismissAlert,
  loadActiveDismissals,
  makeKey,
  SNOOZE_OPTIONS,
};
