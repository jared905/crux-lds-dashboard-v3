/**
 * Strategy Spine service — the per-client evolving doc that
 * audit packs / briefings / quarterlies all render from.
 *
 * Hybrid model:
 *   - Strategist authors: positioning_hypothesis, audience_read,
 *     quarterly_stance, active_plays. The judgment layer.
 *   - Service computes: computed_snapshot (archetype mix, format mix,
 *     cadence, opportunities). Cached and regenerable.
 *
 * v1 surface: read/write strategist fields + active plays CRUD.
 * Snapshot computation is stubbed for now and will fill in as the
 * audit pack is refactored onto the spine.
 */
import { supabase } from './supabaseClient';

const PLAY_STATUSES = ['in_flight', 'concluded_won', 'concluded_lost', 'paused'];
export const PLAY_STATUS_LABELS = {
  in_flight: 'In flight',
  concluded_won: 'Concluded — won',
  concluded_lost: 'Concluded — lost',
  paused: 'Paused',
};

// ──────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────

/**
 * Load a client's spine. Creates an empty row on first read so the UI
 * can bind fields without a separate "exists?" check.
 */
export async function getSpine(clientId) {
  if (!supabase || !clientId) return null;
  const { data, error } = await supabase
    .from('client_strategy_spine')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) {
    console.warn('[spine] read failed:', error);
    return null;
  }
  if (data) return data;
  // First touch — create an empty spine row.
  const { data: created, error: createErr } = await supabase
    .from('client_strategy_spine')
    .insert({ client_id: clientId, active_plays: [] })
    .select()
    .single();
  if (createErr) {
    console.warn('[spine] create-on-read failed:', createErr);
    return null;
  }
  return created;
}

// ──────────────────────────────────────────────────
// Update strategist fields
// ──────────────────────────────────────────────────

const FIELD_TIMESTAMP_MAP = {
  positioning_hypothesis: 'positioning_updated_at',
  audience_read: 'audience_updated_at',
  quarterly_stance: 'quarterly_stance_updated_at',
  // quarterly_stance_label rides on the same timestamp; updated together.
};

/**
 * Update a single strategist field. Touches the corresponding
 * *_updated_at so the UI can show "X days ago" + drift comparisons.
 */
export async function updateSpineField(clientId, field, value) {
  if (!supabase || !clientId || !field) return { ok: false, error: 'missing' };
  const stampField = FIELD_TIMESTAMP_MAP[field];
  const patch = { [field]: value ?? null };
  if (stampField) patch[stampField] = new Date().toISOString();
  const { error } = await supabase
    .from('client_strategy_spine')
    .update(patch)
    .eq('client_id', clientId);
  return { ok: !error, error: error?.message };
}

/**
 * Update quarterly stance text + label in one shot — they always change
 * together and share quarterly_stance_updated_at.
 */
export async function updateQuarterlyStance(clientId, { text, label }) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('client_strategy_spine')
    .update({
      quarterly_stance: text ?? null,
      quarterly_stance_label: label ?? null,
      quarterly_stance_updated_at: new Date().toISOString(),
    })
    .eq('client_id', clientId);
  return { ok: !error, error: error?.message };
}

// ──────────────────────────────────────────────────
// Active plays — JSONB array CRUD
// ──────────────────────────────────────────────────

function newPlayId() {
  return 'play_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Rewrite the entire active_plays array. Caller is responsible for
 * sending a valid array; we validate status values defensively.
 */
async function writePlays(clientId, plays) {
  const normalized = (plays || []).map(p => ({
    ...p,
    status: PLAY_STATUSES.includes(p.status) ? p.status : 'in_flight',
  }));
  const { error } = await supabase
    .from('client_strategy_spine')
    .update({ active_plays: normalized })
    .eq('client_id', clientId);
  return { ok: !error, error: error?.message, plays: normalized };
}

export async function addActivePlay(clientId, play) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };
  const spine = await getSpine(clientId);
  if (!spine) return { ok: false, error: 'no spine' };
  const next = [
    ...(spine.active_plays || []),
    {
      id: newPlayId(),
      name: play?.name || 'Untitled play',
      hypothesis: play?.hypothesis || '',
      started_at: play?.started_at || new Date().toISOString().slice(0, 10),
      status: play?.status || 'in_flight',
      evidence: play?.evidence || '',
      notes: play?.notes || '',
    },
  ];
  return writePlays(clientId, next);
}

export async function updateActivePlay(clientId, playId, patch) {
  if (!supabase || !clientId || !playId) return { ok: false, error: 'missing' };
  const spine = await getSpine(clientId);
  if (!spine) return { ok: false, error: 'no spine' };
  const next = (spine.active_plays || []).map(p =>
    p.id === playId ? { ...p, ...patch } : p
  );
  return writePlays(clientId, next);
}

export async function removeActivePlay(clientId, playId) {
  if (!supabase || !clientId || !playId) return { ok: false, error: 'missing' };
  const spine = await getSpine(clientId);
  if (!spine) return { ok: false, error: 'no spine' };
  const next = (spine.active_plays || []).filter(p => p.id !== playId);
  return writePlays(clientId, next);
}

// ──────────────────────────────────────────────────
// Computed snapshot (v1 stub)
// ──────────────────────────────────────────────────

/**
 * Refresh the cached computed_snapshot for a client. v1 captures a thin
 * slice — pinned-cohort summary + lifecycle context — so the UI has
 * something to render. Audit pack refactor will expand this to include
 * archetype mix, format mix, cadence, opportunity briefs, outliers.
 */
export async function refreshSnapshot(clientId) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };

  // Pull the client row for headline context
  const { data: client } = await supabase
    .from('channels')
    .select('id, name, subscriber_count, video_count, lifecycle_stage, is_client')
    .eq('id', clientId)
    .single();

  // Pinned competitor cohort size + sync health
  const { data: junctions } = await supabase
    .from('client_channels')
    .select('channel_id')
    .eq('client_id', clientId);
  const competitorIds = (junctions || []).map(j => j.channel_id);

  let competitorsErrored = 0;
  let competitorsCategorized = 0;
  if (competitorIds.length) {
    const { data: errored } = await supabase
      .from('channels')
      .select('id')
      .in('id', competitorIds)
      .not('last_sync_error', 'is', null);
    competitorsErrored = errored?.length || 0;

    const { data: categorized } = await supabase
      .from('channel_categories')
      .select('channel_id')
      .in('channel_id', competitorIds);
    competitorsCategorized = new Set((categorized || []).map(r => r.channel_id)).size;
  }

  const snapshot = {
    version: 1,
    client: {
      id: client?.id,
      name: client?.name,
      subscriber_count: client?.subscriber_count,
      video_count: client?.video_count,
      lifecycle_stage: client?.lifecycle_stage,
    },
    cohort: {
      pinned_count: competitorIds.length,
      categorized_count: competitorsCategorized,
      coverage: competitorIds.length
        ? competitorsCategorized / competitorIds.length
        : 0,
      errored_count: competitorsErrored,
    },
    // Slots that the audit pack refactor will populate:
    archetype_mix: null,
    format_mix: null,
    cadence: null,
    outliers: null,
    opportunity_briefs: null,
  };

  const { error } = await supabase
    .from('client_strategy_spine')
    .update({
      computed_snapshot: snapshot,
      snapshot_computed_at: new Date().toISOString(),
    })
    .eq('client_id', clientId);

  return { ok: !error, error: error?.message, snapshot };
}

export default {
  getSpine,
  updateSpineField,
  updateQuarterlyStance,
  addActivePlay,
  updateActivePlay,
  removeActivePlay,
  refreshSnapshot,
  PLAY_STATUS_LABELS,
};
