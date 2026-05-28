/**
 * Deliverable Overrides service — persists inline edits the strategist
 * makes inside the rendered ClientDeliverable.
 *
 * The deliverable is computed from the spine + audit data. The spine
 * remains the canonical positioning source — when the strategist clicks
 * Edit and rewrites a "Why" rationale, sharpens an "In practice" line,
 * fixes a host's archetype gloss, or relabels a kicker, those edits
 * live HERE (keyed by field_path), not in the spine.
 *
 * Render-time pattern:
 *   1. Load overrides for the client (one query, returns a Map)
 *   2. Pass overrides via React context (OverrideCtx)
 *   3. Each path-tagged <E> checks for an override at its path; if
 *      present, renders the override's innerHTML via
 *      dangerouslySetInnerHTML instead of the default children.
 *
 * Save-time pattern:
 *   1. Strategist clicks "Save edits" in the toolbar
 *   2. Component captures innerHTML of every path-tagged <E> currently
 *      mounted, diffs against the loaded overrides, upserts changes
 *   3. Save returns the new overrides map; UI shows "Saved" feedback
 *
 * Reset wipes all overrides for the client (one DELETE).
 */

import { supabase } from './supabaseClient';

/**
 * Load all overrides for a client as a path → content map.
 * Returns { values: { [path]: 'html string' }, lastEditedAt: ISO|null }.
 */
export async function loadOverrides(clientId) {
  if (!supabase || !clientId) return { values: {}, lastEditedAt: null };
  const { data, error } = await supabase
    .from('client_deliverable_overrides')
    .select('field_path, content, content_type, updated_at')
    .eq('client_id', clientId);
  if (error) {
    console.warn('[overrides] load failed:', error);
    return { values: {}, lastEditedAt: null };
  }
  const values = {};
  let lastEditedAt = null;
  for (const row of data || []) {
    values[row.field_path] = row.content;
    if (!lastEditedAt || row.updated_at > lastEditedAt) lastEditedAt = row.updated_at;
  }
  return { values, lastEditedAt };
}

/**
 * Upsert a batch of overrides. Each entry is `{ path, content,
 * content_type }`. Returns the new lastEditedAt for the UI.
 */
export async function saveOverrides(clientId, entries) {
  if (!supabase || !clientId || !entries?.length) return { ok: true, savedCount: 0, lastEditedAt: null };

  const now = new Date().toISOString();
  const rows = entries.map(e => ({
    client_id: clientId,
    field_path: e.path,
    content: e.content,
    content_type: e.content_type || 'html',
    updated_at: now,
  }));

  // Upsert on (client_id, field_path) — the unique index makes this atomic.
  const { error } = await supabase
    .from('client_deliverable_overrides')
    .upsert(rows, { onConflict: 'client_id,field_path' });

  if (error) {
    console.warn('[overrides] save failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, savedCount: rows.length, lastEditedAt: now };
}

/**
 * Delete a single override by path (used when the strategist clears
 * their edit on a specific field).
 */
export async function clearOverride(clientId, path) {
  if (!supabase || !clientId || !path) return { ok: true };
  const { error } = await supabase
    .from('client_deliverable_overrides')
    .delete()
    .eq('client_id', clientId)
    .eq('field_path', path);
  if (error) {
    console.warn('[overrides] clear failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Reset — wipe all overrides for this client. Returns the count
 * deleted for the UI's confirmation toast.
 */
export async function clearAllOverrides(clientId) {
  if (!supabase || !clientId) return { ok: true, deletedCount: 0 };
  const { error, count } = await supabase
    .from('client_deliverable_overrides')
    .delete({ count: 'exact' })
    .eq('client_id', clientId);
  if (error) {
    console.warn('[overrides] reset failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, deletedCount: count || 0 };
}

export default {
  loadOverrides,
  saveOverrides,
  clearOverride,
  clearAllOverrides,
};
