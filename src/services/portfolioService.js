/**
 * Portfolio service — the operator-facing layer that turns
 * "scattered analytics tool" into "team operating room."
 *
 * Returns one row per client, grouped by lifecycle stage, with the
 * status flags a strategist needs to decide where their attention
 * goes this week:
 *   - data freshness (last sync, sync errors)
 *   - cohort readiness (pinned competitor count, classifier coverage)
 *   - ownership (primary strategist)
 *   - next-action hint per stage
 */

import { supabase } from './supabaseClient';

export const LIFECYCLE_STAGES = [
  { id: 'prospect',      label: 'Prospect',           color: 'var(--outline)', sort: 0 },
  { id: 'non_oauth',     label: 'Non-OAuth client',   color: 'var(--blue)', sort: 1 },
  { id: 'oauth_active',  label: 'OAuth — active',     color: 'var(--pos)', sort: 2 },
  { id: 'oauth_renewal', label: 'OAuth — renewal',    color: 'var(--warn)', sort: 3 },
];

const STAGE_LABEL = Object.fromEntries(LIFECYCLE_STAGES.map(s => [s.id, s.label]));

// ──────────────────────────────────────────────────
// List all client channels with derived flags
// ──────────────────────────────────────────────────
// 2026-08-21: the sub-channel hide feature is retired — networks are
// the grouping mechanism now, and every client always shows. The old
// is_portfolio_root flags remain in the DB unread (harmless).
export async function listPortfolio() {
  if (!supabase) return { clients: [] };

  // 1. Pull every client channel. network_tag arrives with migration
  // 113 — until it runs, retry the select without it so the whole
  // portfolio doesn't break on a missing column.
  const baseColumns = `
      id, name, youtube_channel_id, custom_url, thumbnail_url,
      subscriber_count, video_count,
      is_client, sync_enabled, is_prelaunch,
      lifecycle_stage, primary_strategist_id,
      last_synced_at, last_sync_attempt_at, last_sync_error,
      classification_locked, last_classified_at,
      tracked_since`;
  let { data: allClientRows, error: cErr } = await supabase
    .from('channels')
    .select(baseColumns + ', network_tag')
    .eq('is_client', true)
    .order('name', { ascending: true });
  if (cErr && /network_tag/.test(cErr.message || '')) {
    ({ data: allClientRows, error: cErr } = await supabase
      .from('channels')
      .select(baseColumns)
      .eq('is_client', true)
      .order('name', { ascending: true }));
  }
  const clients = allClientRows || [];

  if (cErr) {
    console.warn('[portfolio] list failed:', cErr);
    return { clients: [] };
  }
  if (!clients.length) return { clients: [] };

  // 2. Pinned competitor counts via client_channels junction
  const clientIds = clients.map(c => c.id);
  const { data: junctions } = await supabase
    .from('client_channels')
    .select('client_id, channel_id')
    .in('client_id', clientIds);

  const pinnedByClient = {};
  for (const row of (junctions || [])) {
    (pinnedByClient[row.client_id] ||= []).push(row.channel_id);
  }

  // 3. Classification coverage of pinned competitors
  // (How many of the client's competitors have a category assigned?)
  const allPinnedChannelIds = [...new Set((junctions || []).map(r => r.channel_id))];
  let categorizedSet = new Set();
  if (allPinnedChannelIds.length) {
    const { data: assigned } = await supabase
      .from('channel_categories')
      .select('channel_id')
      .in('channel_id', allPinnedChannelIds);
    categorizedSet = new Set((assigned || []).map(r => r.channel_id));
  }

  // 4. Sync error count among the client's pinned competitors
  let erroringSet = new Set();
  if (allPinnedChannelIds.length) {
    const { data: err } = await supabase
      .from('channels')
      .select('id')
      .in('id', allPinnedChannelIds)
      .not('last_sync_error', 'is', null);
    erroringSet = new Set((err || []).map(r => r.id));
  }

  // 5. Most recent audit pack? We don't persist these today, so leave
  //    that signal for a follow-up. For now we surface:
  //    - last_synced_at on client's own channel
  //    - pinned count
  //    - categorized count
  //    - erroring count
  //    - lifecycle stage

  const rows = clients.map(c => {
    const isStub = !c.youtube_channel_id || c.youtube_channel_id.startsWith('stub_');
    const pinnedIds = pinnedByClient[c.id] || [];
    const categorized = pinnedIds.filter(id => categorizedSet.has(id)).length;
    const erroring = pinnedIds.filter(id => erroringSet.has(id)).length;
    const coverage = pinnedIds.length > 0 ? categorized / pinnedIds.length : 0;

    return {
      id: c.id,
      name: c.name,
      thumbnail: c.thumbnail_url,
      customUrl: c.custom_url,
      youtubeChannelId: c.youtube_channel_id,
      isStub,
      isPrelaunch: !!c.is_prelaunch,
      subscriberCount: c.subscriber_count || 0,
      networkTag: c.network_tag || null,
      stage: c.lifecycle_stage,
      stageLabel: STAGE_LABEL[c.lifecycle_stage] || 'Unset',
      primaryStrategistId: c.primary_strategist_id,
      lastSyncedAt: c.last_synced_at,
      lastSyncError: c.last_sync_error,
      pinnedCount: pinnedIds.length,
      categorizedCount: categorized,
      coverage,
      erroringCount: erroring,
      trackedSince: c.tracked_since,
      nextAction: deriveNextAction({
        stage: c.lifecycle_stage,
        isStub,
        pinnedCount: pinnedIds.length,
        coverage,
        erroringCount: erroring,
      }),
    };
  });

  return { clients: rows };
}

// Stage-appropriate next-action heuristic. Keep it short and
// imperative — the operator should be able to skim 13 rows fast.
function deriveNextAction({ stage, _isStub, pinnedCount, coverage, erroringCount }) {
  if (!stage) return { label: 'Set lifecycle stage', urgency: 'attention' };
  if (pinnedCount === 0 && stage !== 'oauth_renewal') {
    return { label: 'Pin competitors', urgency: 'attention' };
  }
  if (coverage < 0.5 && pinnedCount >= 3) {
    return { label: 'Classify cohort', urgency: 'attention' };
  }
  if (erroringCount > 2) {
    return { label: `Resolve ${erroringCount} sync errors`, urgency: 'attention' };
  }
  switch (stage) {
    case 'prospect':      return { label: 'Generate audit pack', urgency: 'normal' };
    case 'non_oauth':     return { label: 'Send weekly digest', urgency: 'normal' };
    case 'oauth_active':  return { label: 'Generate next quarterly', urgency: 'normal' };
    case 'oauth_renewal': return { label: 'Schedule renewal call', urgency: 'high' };
    default: return { label: '—', urgency: 'normal' };
  }
}

// ──────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────
export async function updateClientStage(clientId, stage) {
  if (!clientId || !stage) return { ok: false, error: 'missing' };
  const valid = LIFECYCLE_STAGES.some(s => s.id === stage);
  if (!valid) return { ok: false, error: 'invalid stage' };
  const { error } = await supabase
    .from('channels')
    .update({ lifecycle_stage: stage })
    .eq('id', clientId);
  return { ok: !error, error: error?.message };
}

// Bulk hide many clients in one shot. Used by the "hide all likely
// sub-channels" header action so the operator doesn't have to click
// through 14 rows after backfill leaves them NULL.
export async function assignStrategist(clientId, strategistId) {
  if (!clientId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('channels')
    .update({ primary_strategist_id: strategistId || null })
    .eq('id', clientId);
  return { ok: !error, error: error?.message };
}

// Available strategists (just authenticated users for now — single
// strategist firm, but the picker is here so multi-strategist works
// the day a teammate is added).
export async function listStrategists() {
  if (!supabase) return [];
  // user_profiles table holds the team. Fall back to auth.users if no
  // profile row exists. Single founder today so this is mostly hygiene.
  const { data } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .order('full_name');
  return data || [];
}

/** Assign (or clear, with null) a client's network tag. */
export async function setClientNetwork(clientId, tag) {
  const { error } = await supabase
    .from('channels')
    .update({ network_tag: tag || null })
    .eq('id', clientId);
  if (error) throw error;
}

/** Rename a network everywhere it's assigned. */
export async function renameNetwork(oldTag, newTag) {
  const { error } = await supabase
    .from('channels')
    .update({ network_tag: newTag })
    .eq('network_tag', oldTag);
  if (error) throw error;
}

/** Delete a network: every client carrying it goes back to "no network". */
export async function deleteNetwork(tag) {
  const { error } = await supabase
    .from('channels')
    .update({ network_tag: null })
    .eq('network_tag', tag);
  if (error) throw error;
}

export default { listPortfolio, updateClientStage, assignStrategist, listStrategists, setClientNetwork, renameNetwork, deleteNetwork };
