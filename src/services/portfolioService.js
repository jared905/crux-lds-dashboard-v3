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
  { id: 'prospect',      label: 'Prospect',           color: '#a78bfa', sort: 0 },
  { id: 'non_oauth',     label: 'Non-OAuth client',   color: '#60a5fa', sort: 1 },
  { id: 'oauth_active',  label: 'OAuth — active',     color: '#10b981', sort: 2 },
  { id: 'oauth_renewal', label: 'OAuth — renewal',    color: '#f59e0b', sort: 3 },
];

const STAGE_LABEL = Object.fromEntries(LIFECYCLE_STAGES.map(s => [s.id, s.label]));

// ──────────────────────────────────────────────────
// List all client channels with derived flags
// ──────────────────────────────────────────────────
export async function listPortfolio({ includeHidden = false } = {}) {
  if (!supabase) return { clients: [], hiddenCount: 0 };

  // 1. Pull every client channel
  let query = supabase
    .from('channels')
    .select(`
      id, name, youtube_channel_id, custom_url, thumbnail_url,
      subscriber_count, video_count,
      is_client, sync_enabled,
      lifecycle_stage, primary_strategist_id, is_portfolio_root,
      last_synced_at, last_sync_attempt_at, last_sync_error,
      classification_locked, last_classified_at,
      tracked_since
    `)
    .eq('is_client', true)
    .order('name', { ascending: true });

  const { data: allClientRows, error: cErr } = await query;
  // Apply portfolio-root filter in JS so we can also count hidden rows
  // for the "Show hidden" affordance.
  const hiddenCount = (allClientRows || []).filter(r => r.is_portfolio_root === false).length;
  const clients = includeHidden
    ? (allClientRows || [])
    : (allClientRows || []).filter(r => r.is_portfolio_root !== false);

  if (cErr) {
    console.warn('[portfolio] list failed:', cErr);
    return { clients: [], hiddenCount: 0 };
  }
  if (!clients.length) return { clients: [], hiddenCount };

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
      isPortfolioRoot: c.is_portfolio_root,
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

  return { clients: rows, hiddenCount };
}

// Stage-appropriate next-action heuristic. Keep it short and
// imperative — the operator should be able to skim 13 rows fast.
function deriveNextAction({ stage, isStub, pinnedCount, coverage, erroringCount }) {
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

export async function setPortfolioRoot(clientId, isRoot) {
  if (!clientId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('channels')
    .update({ is_portfolio_root: isRoot })
    .eq('id', clientId);
  return { ok: !error, error: error?.message };
}

// Bulk hide many clients in one shot. Used by the "hide all likely
// sub-channels" header action so the operator doesn't have to click
// through 14 rows after backfill leaves them NULL.
export async function bulkSetPortfolioRoot(clientIds, isRoot) {
  if (!clientIds?.length) return { ok: true, count: 0 };
  const { error } = await supabase
    .from('channels')
    .update({ is_portfolio_root: isRoot })
    .in('id', clientIds);
  return { ok: !error, count: clientIds.length, error: error?.message };
}

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

export default { listPortfolio, updateClientStage, assignStrategist, listStrategists, setPortfolioRoot, bulkSetPortfolioRoot };
