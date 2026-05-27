/**
 * Client Pillars service — content pillars are the primary unit of
 * channel strategy. Each pillar is a repeatable creative series with
 * its own title, description, audience, host, and per-video budget.
 *
 * Lifecycle:
 *   draft   → strategist's working concept, not yet committed
 *   active  → in current A/B/C rotation, being produced
 *   retired → was active, dropped after data review (replaced by a
 *             new pillar in the rotation)
 *
 * Engagement arc: the audit deliverable surfaces candidate pillars
 * (status='draft') the strategist pre-bakes from cohort findings.
 * In the combined vision-alignment + pitch meeting, the client
 * reacts; pillars get promoted to 'active' with budget + host
 * assignments. After enough production data, the weakest 'active'
 * pillar gets 'retired' and a new 'draft' becomes 'active'.
 */

import { supabase } from './supabaseClient';

const VALID_STATUSES = ['draft', 'active', 'retired'];
const VALID_SOURCES = ['strategist', 'client_idea', 'existing_channel_pillar'];

// ──────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────

/**
 * List all pillars for a client, ordered by sort_order then created_at.
 * Optionally filter by status — useful when the deliverable wants to
 * render only candidates, or production tools want only the active set.
 */
export async function listPillars(clientId, { status = null } = {}) {
  if (!supabase || !clientId) return [];
  let q = supabase
    .from('client_pillars')
    .select('*')
    .eq('client_id', clientId);
  if (status) {
    if (Array.isArray(status)) q = q.in('status', status);
    else q = q.eq('status', status);
  }
  q = q.order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  const { data, error } = await q;
  if (error) {
    console.warn('[clientPillars] list failed:', error);
    return [];
  }
  return data || [];
}

/**
 * Batch read — returns active pillars ordered by rotation_position so
 * downstream production tools can read the A/B/C/... sequence directly.
 */
export async function listActivePillarsInRotation(clientId) {
  if (!supabase || !clientId) return [];
  const { data, error } = await supabase
    .from('client_pillars')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('rotation_position', { ascending: true, nullsFirst: false });
  if (error) return [];
  return data || [];
}

// ──────────────────────────────────────────────────
// Write
// ──────────────────────────────────────────────────

export async function createPillar(clientId, patch = {}) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };
  if (!patch.title || !patch.title.trim()) {
    return { ok: false, error: 'title is required' };
  }

  // Default sort_order to end of existing list
  const { data: existing } = await supabase
    .from('client_pillars')
    .select('sort_order')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const status = VALID_STATUSES.includes(patch.status) ? patch.status : 'draft';
  const source = patch.source && VALID_SOURCES.includes(patch.source) ? patch.source : null;

  const { data: row, error } = await supabase
    .from('client_pillars')
    .insert({
      client_id: clientId,
      status,
      title: patch.title.trim(),
      creative_description: patch.creative_description ?? null,
      intended_audience: patch.intended_audience ?? null,
      budget_per_video_low: patch.budget_per_video_low ?? null,
      budget_per_video_high: patch.budget_per_video_high ?? null,
      rotation_position: patch.rotation_position ?? null,
      host_id: patch.host_id ?? null,
      example_video_id: patch.example_video_id ?? null,
      example_concept: patch.example_concept ?? null,
      source,
      notes: patch.notes ?? null,
      sort_order: patch.sort_order ?? nextOrder,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, pillar: row };
}

export async function updatePillar(pillarId, patch = {}) {
  if (!supabase || !pillarId) return { ok: false, error: 'missing' };
  const updates = { updated_at: new Date().toISOString() };

  // Allowed fields. Validate where there are constraints.
  const allowedFields = [
    'title', 'creative_description', 'intended_audience',
    'budget_per_video_low', 'budget_per_video_high',
    'rotation_position', 'host_id', 'example_video_id', 'example_concept',
    'notes', 'sort_order',
  ];
  for (const f of allowedFields) {
    if (f in patch) updates[f] = patch[f];
  }
  if ('status' in patch) {
    if (!VALID_STATUSES.includes(patch.status)) {
      return { ok: false, error: `invalid status: ${patch.status}` };
    }
    updates.status = patch.status;
  }
  if ('source' in patch) {
    if (patch.source != null && !VALID_SOURCES.includes(patch.source)) {
      return { ok: false, error: `invalid source: ${patch.source}` };
    }
    updates.source = patch.source;
  }

  const { data: row, error } = await supabase
    .from('client_pillars')
    .update(updates)
    .eq('id', pillarId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, pillar: row };
}

export async function deletePillar(pillarId) {
  if (!supabase || !pillarId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('client_pillars')
    .delete()
    .eq('id', pillarId);
  return { ok: !error, error: error?.message };
}

/**
 * Convenience: promote a draft pillar to active. Assigns the next
 * available rotation_position (0/1/2/... appended after the highest
 * existing active pillar) unless caller specifies one.
 */
export async function activatePillar(pillarId, { rotation_position = null } = {}) {
  if (!supabase || !pillarId) return { ok: false, error: 'missing' };
  // Look up the pillar to get its client_id
  const { data: pillar } = await supabase
    .from('client_pillars')
    .select('client_id, status')
    .eq('id', pillarId)
    .maybeSingle();
  if (!pillar) return { ok: false, error: 'pillar not found' };

  let nextPosition = rotation_position;
  if (nextPosition == null) {
    const { data: existing } = await supabase
      .from('client_pillars')
      .select('rotation_position')
      .eq('client_id', pillar.client_id)
      .eq('status', 'active')
      .order('rotation_position', { ascending: false, nullsFirst: false })
      .limit(1);
    nextPosition = (existing?.[0]?.rotation_position ?? -1) + 1;
  }

  return updatePillar(pillarId, { status: 'active', rotation_position: nextPosition });
}

/**
 * Convenience: retire an active pillar. Strategist would call this
 * after the A/B/C test shows it's the weakest performer. Leaves the
 * rotation_position on the row so historical reads see where it sat.
 */
export async function retirePillar(pillarId) {
  return updatePillar(pillarId, { status: 'retired' });
}

export default {
  listPillars,
  listActivePillarsInRotation,
  createPillar,
  updatePillar,
  deletePillar,
  activatePillar,
  retirePillar,
};
