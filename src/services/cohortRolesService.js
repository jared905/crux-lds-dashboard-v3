/**
 * cohortRolesService — single source of truth for cohort role resolution.
 *
 * After Kendall's Calibration Phase A revealed systematic scorer
 * pessimism, the working hypothesis is cohort-mismatch — premium-tier
 * channels in his cohort (Andrei Jikh 1.6M, Erin Talks Money 100K+,
 * Azul 33K) generating predictions that don't transfer to his mid-tier
 * channel. Migration 093 adds a `cohort_role` tag on `client_channels`
 * so strategists can separate peer (predictive ground truth) from
 * aspirational (directional only) from reference (case-study).
 *
 * Every predictive surface (Pre-flight, Repositioning, Competitor Scan,
 * Calibration) should resolve the cohort through this service to keep
 * the filter consistent. Monitoring surfaces (Research, Portfolio)
 * leave aspirational + reference visible because seeing what the
 * tier-up is doing is half the value of having them in the cohort at
 * all.
 *
 * Default role set: ['peer']. Callers can override with explicit role
 * lists when they need broader scope.
 */

import { supabase } from './supabaseClient';

export const COHORT_ROLES = ['peer', 'aspirational', 'reference'];
export const DEFAULT_PREDICTIVE_ROLES = ['peer'];

/**
 * Resolve the cohort channel IDs for a client, filtered by role.
 *
 * @param {string} clientId
 * @param {Object} [opts]
 * @param {Array<string>} [opts.roles=['peer']]  Roles to include. Pass null/undefined
 *                                                to opt out of role filtering entirely
 *                                                (returns all cohort channels regardless).
 * @param {boolean} [opts.competitorsOnly=true]   When true, also require channels.is_competitor=true
 *                                                (matches existing convention).
 * @returns {Promise<Array<{ id: string, cohort_role: string }>>}  channel IDs + roles
 */
export async function resolveCohortChannels(clientId, {
  roles = DEFAULT_PREDICTIVE_ROLES,
  competitorsOnly = true,
} = {}) {
  if (!supabase || !clientId) return [];

  let q = supabase
    .from('client_channels')
    .select('channel_id, cohort_role')
    .eq('client_id', clientId);

  if (roles && roles.length) {
    q = q.in('cohort_role', roles);
  }

  const { data: junctionRows, error } = await q;
  if (error) {
    console.warn('[cohortRoles] junction query failed:', error);
    return [];
  }
  const linked = (junctionRows || []);
  if (!linked.length) return [];

  const linkedIds = linked.map(r => r.channel_id);

  if (!competitorsOnly) {
    return linked.map(r => ({ id: r.channel_id, cohort_role: r.cohort_role }));
  }

  // Narrow to channels.is_competitor=true — existing convention across
  // every cohort reader. Preserves the role tag for downstream display.
  const { data: cohort } = await supabase
    .from('channels')
    .select('id')
    .in('id', linkedIds)
    .eq('is_competitor', true);
  const allowed = new Set((cohort || []).map(c => c.id));
  return linked
    .filter(r => allowed.has(r.channel_id))
    .map(r => ({ id: r.channel_id, cohort_role: r.cohort_role }));
}

/**
 * Convenience — return just the channel IDs for the predictive cohort
 * (role='peer' only). Use this in services that only need the ID list.
 */
export async function resolvePredictiveCohortIds(clientId) {
  const rows = await resolveCohortChannels(clientId, { roles: DEFAULT_PREDICTIVE_ROLES });
  return rows.map(r => r.id);
}

/**
 * Update the role tag on a specific (client_id, channel_id) junction row.
 *
 * @param {Object} args
 * @param {string} args.clientId
 * @param {string} args.channelId
 * @param {string} args.role  'peer' | 'aspirational' | 'reference'
 * @param {string} [args.notes]  Strategist provenance note
 */
export async function updateCohortRole({ clientId, channelId, role, notes = null }) {
  if (!supabase || !clientId || !channelId) return { ok: false, error: 'invalid args' };
  if (!COHORT_ROLES.includes(role)) {
    return { ok: false, error: `Invalid role: ${role}. Must be one of ${COHORT_ROLES.join(', ')}` };
  }

  const patch = {
    cohort_role: role,
    cohort_role_updated_at: new Date().toISOString(),
  };
  if (notes !== undefined) patch.cohort_role_notes = notes;

  const { error } = await supabase
    .from('client_channels')
    .update(patch)
    .eq('client_id', clientId)
    .eq('channel_id', channelId);

  if (error) {
    console.warn('[cohortRoles] update failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Bulk-update many channels at once. Useful for "tag all current cohort
 * as peer then promote these N to aspirational" workflows.
 */
export async function bulkUpdateCohortRoles({ clientId, updates }) {
  if (!supabase || !clientId || !updates?.length) return { ok: false, error: 'invalid args' };

  const results = await Promise.all(
    updates.map(u => updateCohortRole({
      clientId,
      channelId: u.channelId,
      role:      u.role,
      notes:     u.notes,
    }))
  );
  const failed = results.filter(r => !r.ok);
  return {
    ok: failed.length === 0,
    successCount: results.length - failed.length,
    failures: failed,
  };
}

/**
 * Load full cohort with role metadata + channel details (name, sub
 * count, is_competitor). Used by tagging UIs that need to display the
 * current cohort with role tags.
 */
export async function loadCohortWithRoles(clientId) {
  if (!supabase || !clientId) return [];

  const { data: rows, error } = await supabase
    .from('client_channels')
    .select(`
      channel_id,
      cohort_role,
      cohort_role_notes,
      cohort_role_updated_at,
      channels!inner(id, name, youtube_channel_id, subscriber_count, is_competitor, category, thumbnail_url)
    `)
    .eq('client_id', clientId);

  if (error) {
    console.warn('[cohortRoles] loadCohortWithRoles failed:', error);
    return [];
  }
  return (rows || []).map(r => ({
    channel_id:              r.channel_id,
    cohort_role:             r.cohort_role,
    cohort_role_notes:       r.cohort_role_notes,
    cohort_role_updated_at:  r.cohort_role_updated_at,
    channel:                 r.channels,
  }));
}

/**
 * Compute the role composition summary for a client's cohort. Used by
 * the cohort-fit diagnostic surface.
 */
export async function getCohortComposition(clientId) {
  if (!supabase || !clientId) return null;

  const rows = await loadCohortWithRoles(clientId);
  if (!rows.length) return { total: 0, peer: 0, aspirational: 0, reference: 0 };

  const summary = { total: rows.length, peer: 0, aspirational: 0, reference: 0 };
  let peerSubSum = 0, peerSubCount = 0;
  let aspSubSum = 0, aspSubCount = 0;

  for (const r of rows) {
    if (summary[r.cohort_role] != null) summary[r.cohort_role]++;
    const subs = r.channel?.subscriber_count || 0;
    if (subs > 0) {
      if (r.cohort_role === 'peer')         { peerSubSum += subs; peerSubCount++; }
      if (r.cohort_role === 'aspirational') { aspSubSum  += subs; aspSubCount++; }
    }
  }
  summary.peer_avg_subscribers         = peerSubCount > 0 ? Math.round(peerSubSum / peerSubCount) : null;
  summary.aspirational_avg_subscribers = aspSubCount  > 0 ? Math.round(aspSubSum  / aspSubCount)  : null;
  return summary;
}

export default {
  COHORT_ROLES,
  DEFAULT_PREDICTIVE_ROLES,
  resolveCohortChannels,
  resolvePredictiveCohortIds,
  updateCohortRole,
  bulkUpdateCohortRoles,
  loadCohortWithRoles,
  getCohortComposition,
};
