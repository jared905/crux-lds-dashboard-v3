/**
 * Report Draft Service
 * CRUD operations for saved PDF export drafts in Supabase.
 */

import { supabase } from './supabaseClient';

const TABLE = 'pdf_report_drafts';

/**
 * Save (insert or update) a draft.
 * If draft.id exists, updates that row. Otherwise inserts a new one.
 * Returns the saved row.
 */
export async function saveDraft(draft) {
  const row = {
    client_id: draft.clientId,
    name: draft.name,
    date_range: draft.dateRange || null,
    custom_date_range: draft.customDateRange || null,
    selected_channel: draft.selectedChannel || null,
    client_name: draft.clientName || null,
    opportunities: draft.opportunities || [],
    opening_text: draft.openingText || '',
    closing_text: draft.closingText || '',
    top_comments: draft.topComments || [],
    published_html: draft.publishedHtml || '',
    status: draft.status || 'draft',
    updated_at: new Date().toISOString(),
  };

  if (draft.id) {
    // Update existing
    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq('id', draft.id)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  // Insert new
  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return mapRow(data);
}

/**
 * List all drafts for a client, newest first.
 */
export async function listDrafts(clientId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapRow);
}

/**
 * Load a single draft by ID.
 */
export async function loadDraft(draftId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', draftId)
    .single();

  if (error) throw error;
  return mapRow(data);
}

/**
 * Delete a draft.
 */
export async function deleteDraft(draftId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', draftId);

  if (error) throw error;
}

/**
 * Mark a draft as exported.
 */
export async function updateDraftStatus(draftId, status, exportedAt) {
  const updates = { status, updated_at: new Date().toISOString() };
  if (exportedAt) updates.last_exported_at = exportedAt;

  const { error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', draftId);

  if (error) throw error;
}

/** Map DB row to app-friendly shape */
function mapRow(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    dateRange: row.date_range,
    customDateRange: row.custom_date_range,
    selectedChannel: row.selected_channel,
    clientName: row.client_name,
    opportunities: row.opportunities || [],
    openingText: row.opening_text || '',
    closingText: row.closing_text || '',
    topComments: row.top_comments || [],
    publishedHtml: row.published_html || '',
    status: row.status,
    lastExportedAt: row.last_exported_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
