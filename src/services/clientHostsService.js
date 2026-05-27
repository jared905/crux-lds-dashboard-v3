/**
 * Client Hosts service — CRUD for per-client host profiles (multi-host
 * channels). Replaces the implicit "one host per client" model of
 * client_strategy_spine.host_archetype.
 *
 * Each host profile carries the catalog archetype + an optional voice
 * refinement + a series label + freeform notes. The audition rubric
 * service references host profiles by id when generating per-host
 * scorecards.
 *
 * Lazy migration from the legacy spine.host_archetype field: on first
 * load of hosts for a client whose client_hosts is empty AND whose
 * spine.host_archetype is set, we seed a "Primary host" row. One-time,
 * idempotent (INSERT only when no hosts exist).
 */

import { supabase } from './supabaseClient';
import { getSpine } from './strategySpineService';

// ──────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────

/**
 * List a client's host profiles. Runs the auto-migration from the
 * legacy spine.host_archetype field if applicable. Returns rows
 * ordered by sort_order, created_at.
 */
export async function listHosts(clientId) {
  if (!supabase || !clientId) return [];

  const { data: rows } = await supabase
    .from('client_hosts')
    .select('*')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (rows && rows.length) return rows;

  // No hosts on file — check the legacy spine field and migrate if set.
  const migrated = await maybeMigrateLegacyHost(clientId);
  if (migrated) return [migrated];

  return [];
}

async function maybeMigrateLegacyHost(clientId) {
  const spine = await getSpine(clientId);
  const legacy = spine?.host_archetype?.trim();
  if (!legacy) return null;

  // Race-safe: re-check there's still nothing, then insert. If another
  // tab beat us, the unique conflict won't fire (no unique constraint),
  // but the second insert would create a duplicate. Use a single
  // upsert-equivalent by checking again under transaction-by-statement.
  const { data: existing } = await supabase
    .from('client_hosts')
    .select('id')
    .eq('client_id', clientId)
    .limit(1);
  if (existing && existing.length) return null;

  const { data: inserted, error } = await supabase
    .from('client_hosts')
    .insert({
      client_id: clientId,
      name: 'Primary host',
      archetype: legacy,
      voice_tone_refinement: null,
      series_label: null,
      notes: 'Auto-migrated from the legacy single-host archetype on the spine. Rename, edit, or delete as needed.',
      sort_order: 0,
    })
    .select()
    .single();
  if (error) {
    console.warn('[clientHosts] legacy migration failed:', error);
    return null;
  }

  // Reassign any pre-multi-host rubric (host_id NULL) to the new host
  // row so it's discoverable from the new per-host UI rather than
  // orphaned in the database.
  try {
    await supabase
      .from('client_talent_audition_rubric')
      .update({ host_id: inserted.id })
      .eq('client_id', clientId)
      .is('host_id', null)
      .eq('status', 'active');
  } catch (e) {
    console.warn('[clientHosts] legacy rubric reassignment failed:', e);
  }

  return inserted;
}

// ──────────────────────────────────────────────────
// Write
// ──────────────────────────────────────────────────

export async function createHost(clientId, patch = {}) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };

  // Compute next sort_order so new hosts append to the bottom.
  const { data: existing } = await supabase
    .from('client_hosts')
    .select('sort_order')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data: row, error } = await supabase
    .from('client_hosts')
    .insert({
      client_id: clientId,
      name: patch.name ?? null,
      archetype: patch.archetype ?? null,
      voice_tone_refinement: patch.voice_tone_refinement ?? null,
      series_label: patch.series_label ?? null,
      notes: patch.notes ?? null,
      sort_order: nextOrder,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, host: row };
}

export async function updateHost(hostId, patch = {}) {
  if (!supabase || !hostId) return { ok: false, error: 'missing' };
  const updates = { updated_at: new Date().toISOString() };
  for (const key of ['name', 'archetype', 'voice_tone_refinement', 'series_label', 'notes', 'sort_order']) {
    if (key in patch) updates[key] = patch[key];
  }
  const { data: row, error } = await supabase
    .from('client_hosts')
    .update(updates)
    .eq('id', hostId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, host: row };
}

export async function deleteHost(hostId) {
  if (!supabase || !hostId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('client_hosts')
    .delete()
    .eq('id', hostId);
  return { ok: !error, error: error?.message };
}

export default { listHosts, createHost, updateHost, deleteHost };
