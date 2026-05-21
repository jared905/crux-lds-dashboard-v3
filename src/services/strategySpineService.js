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
import { computeClientDiagnostic } from './clientDiagnosticService';
import { analyzePatterns } from './patternsService';
import { analyzeWhiteSpace } from './whiteSpaceService';

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
  guardrails: 'guardrails_updated_at',
  competitive_posture: 'competitive_posture_updated_at',
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
 * Refresh the cached computed_snapshot for a client. Runs the same
 * analysis pipeline as the audit pack (diagnostic + patterns + white
 * space) and stores compact summaries so the spine view can render
 * meaningful signal without re-running the heavy compute on every load.
 *
 * Cost note: this triggers a Claude call inside analyzeWhiteSpace (for
 * the opportunity brief). Cents per click. Strategist-controlled.
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

  // Run the heavy compute pipeline in parallel. Each piece feeds one
  // of the snapshot slots. Failures degrade gracefully — the slot stays
  // null rather than blowing up the whole refresh.
  const [diagnostic, patterns, whiteSpace] = await Promise.all([
    competitorIds.length
      ? computeClientDiagnostic({ clientId, scopeChannelIds: competitorIds, windowDays: 90 }).catch(() => null)
      : null,
    competitorIds.length
      ? analyzePatterns({ scopeChannelIds: competitorIds, windowDays: 90 }).catch(() => null)
      : null,
    competitorIds.length
      ? analyzeWhiteSpace({ scopeChannelIds: competitorIds, windowDays: 90, scopeLabel: client?.name || 'cohort' }).catch(() => null)
      : null,
  ]);

  // ─── Build compact summaries for each slot ───

  // archetype_mix — segments with channel counts + engagement medians.
  // Trimmed to the fields a strategist actually skims.
  const archetypeMix = diagnostic?.archetypeBreakdown?.segments?.length
    ? {
        client_archetype: diagnostic.client?.archetypeLabel || null,
        segments: diagnostic.archetypeBreakdown.segments.slice(0, 6).map(a => ({
          archetype: a.archetype,
          label: a.label,
          channel_count: a.channelCount,
          video_count: a.videoCount,
          median_engagement: a.medianEngagement,
          top_patterns: (a.patterns || []).slice(0, 3).map(p => ({
            label: p.label,
            lift: p.lift,
            confidence: p.confidence,
          })),
        })),
        coverage: diagnostic.archetypeBreakdown.coverage || null,
      }
    : null;

  // format_mix — length bands that work + shorts/long balance derived
  // from working buckets when available.
  const formatMix = diagnostic?.workingBuckets?.length
    ? {
        working_buckets: diagnostic.workingBuckets.slice(0, 6).map(b => ({
          label: b.label,
          freq: b.freq,
          lift: b.lift,
          count: b.count,
          confidence: b.confidence,
        })),
      }
    : null;

  // cadence — top working slots; statistical-confidence first.
  const cadence = diagnostic?.workingSlots?.length
    ? {
        slots: diagnostic.workingSlots.slice(0, 5).map(s => ({
          slot: s.slot,
          day: s.day,
          block: s.block,
          lift: s.lift,
          count: s.count,
          confidence: s.confidence,
        })),
      }
    : null;

  // outliers — top breakout videos in the cohort (anti-echo: helps
  // strategist see what's actually working without inferring).
  const outliers = patterns?.scope?.outliers?.length
    ? patterns.scope.outliers.slice(0, 8).map(o => ({
        title: o.title,
        channel: o.channel,
        view_count: o.view_count,
        outlier_score: o.outlier_score,
        published_at: o.published_at,
        suspect: o.suspect || false,
      }))
    : null;

  // opportunity_briefs — the Claude-synthesized brief from white-space.
  // We snapshot the structured fields, not the rendered prose, so the
  // UI can re-render without re-calling Claude.
  const opportunityBriefs = whiteSpace?.brief
    ? {
        headline: whiteSpace.brief.headline,
        body: whiteSpace.brief.body,
        evidence: whiteSpace.brief.evidence || null,
        generated_at: whiteSpace.brief.generatedAt || null,
      }
    : null;

  const snapshot = {
    version: 2,
    client: {
      id: client?.id,
      name: client?.name,
      subscriber_count: client?.subscriber_count,
      video_count: client?.video_count,
      lifecycle_stage: client?.lifecycle_stage,
      archetype: diagnostic?.client?.archetypeLabel || null,
    },
    cohort: {
      pinned_count: competitorIds.length,
      categorized_count: competitorsCategorized,
      coverage: competitorIds.length
        ? competitorsCategorized / competitorIds.length
        : 0,
      errored_count: competitorsErrored,
      videos_analyzed: diagnostic?.cohort?.videoCount || null,
    },
    archetype_mix: archetypeMix,
    format_mix: formatMix,
    cadence,
    outliers,
    opportunity_briefs: opportunityBriefs,
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

// ──────────────────────────────────────────────────
// Snapshots — point-in-time captures of the spine
// ──────────────────────────────────────────────────

/**
 * Capture the current spine fields as a snapshot. The label is the
 * strategist's anchor ("Q2 2026 close", "post-rebrand"); notes optional.
 */
export async function captureSpineSnapshot(clientId, { label, notes } = {}) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };
  const spine = await getSpine(clientId);
  if (!spine) return { ok: false, error: 'no spine to snapshot' };
  const { data: created, error } = await supabase
    .from('client_strategy_spine_snapshots')
    .insert({
      client_id: clientId,
      label: label?.trim() || null,
      notes: notes?.trim() || null,
      positioning_hypothesis: spine.positioning_hypothesis,
      audience_read: spine.audience_read,
      quarterly_stance: spine.quarterly_stance,
      quarterly_stance_label: spine.quarterly_stance_label,
      competitive_posture: spine.competitive_posture,
      guardrails: spine.guardrails,
      active_plays: spine.active_plays || [],
    })
    .select()
    .single();
  return { ok: !error, snapshot: created, error: error?.message };
}

export async function listSpineSnapshots(clientId) {
  if (!supabase || !clientId) return [];
  const { data } = await supabase
    .from('client_strategy_spine_snapshots')
    .select('id, captured_at, label, notes, quarterly_stance_label')
    .eq('client_id', clientId)
    .order('captured_at', { ascending: false });
  return data || [];
}

export async function getSpineSnapshot(snapshotId) {
  if (!supabase || !snapshotId) return null;
  const { data } = await supabase
    .from('client_strategy_spine_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .maybeSingle();
  return data;
}

export async function deleteSpineSnapshot(snapshotId) {
  if (!supabase || !snapshotId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('client_strategy_spine_snapshots')
    .delete()
    .eq('id', snapshotId);
  return { ok: !error, error: error?.message };
}

export default {
  getSpine,
  updateSpineField,
  updateQuarterlyStance,
  addActivePlay,
  updateActivePlay,
  removeActivePlay,
  refreshSnapshot,
  captureSpineSnapshot,
  listSpineSnapshots,
  getSpineSnapshot,
  deleteSpineSnapshot,
  PLAY_STATUS_LABELS,
};
