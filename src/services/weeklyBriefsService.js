/**
 * Persistence for weekly strategist briefs — save / list / load / archive.
 *
 * Briefs are immutable; regenerating creates a new row so strategists
 * can compare briefs over time (last week's brief vs this week's vs
 * last quarter's) and see whether the recommendations are evolving.
 */

import { supabase } from './supabaseClient';

const TABLE = 'client_weekly_briefs';

export async function saveBrief({
  clientId,
  createdBy = null,
  sourceAuditId = null,
  sourceCalibrationRunId = null,
  briefMarkdown,
  promptVersion,
  model = null,
  title = null,
  // 2026-06-12: persisted alongside the final brief for diagnostic
  // comparison. Optional — callers that don't have them just store NULL.
  draftMarkdown = null,
  critiqueMarkdown = null,
  revisionApplied = null,
}) {
  if (!supabase) return { ok: false, error: 'supabase not configured' };
  if (!clientId || !briefMarkdown?.trim()) return { ok: false, error: 'clientId + briefMarkdown required' };

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      client_id:                  clientId,
      created_by:                 createdBy,
      source_audit_id:            sourceAuditId,
      source_calibration_run_id:  sourceCalibrationRunId,
      brief_markdown:             briefMarkdown,
      prompt_version:             promptVersion,
      model,
      title,
      draft_markdown:             draftMarkdown,
      critique_markdown:          critiqueMarkdown,
      revision_applied:           revisionApplied,
    })
    .select('id, created_at')
    .single();

  if (error) {
    console.warn('[weeklyBriefs] save failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id, createdAt: data.created_at };
}

export async function listBriefsForClient(clientId, { limit = 12 } = {}) {
  if (!supabase || !clientId) return { ok: false, error: 'invalid args', briefs: [] };
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, created_at, created_by, source_audit_id, source_calibration_run_id, prompt_version, model, title')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[weeklyBriefs] list failed:', error);
    return { ok: false, error: error.message, briefs: [] };
  }
  return { ok: true, briefs: data || [] };
}

export async function loadBrief(briefId) {
  if (!supabase || !briefId) return { ok: false, error: 'invalid args' };
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', briefId)
    .maybeSingle();
  if (error) {
    console.warn('[weeklyBriefs] load failed:', error);
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: 'not found' };
  return { ok: true, brief: data };
}

export async function archiveBrief(briefId) {
  if (!supabase || !briefId) return { ok: false, error: 'invalid args' };
  const { error } = await supabase
    .from(TABLE)
    .update({ archived_at: new Date().toISOString() })
    .eq('id', briefId);
  if (error) {
    console.warn('[weeklyBriefs] archive failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function updateBriefTitle(briefId, title) {
  if (!supabase || !briefId) return { ok: false, error: 'invalid args' };
  const { error } = await supabase
    .from(TABLE)
    .update({ title: title?.trim() || null })
    .eq('id', briefId);
  if (error) {
    console.warn('[weeklyBriefs] title update failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export default { saveBrief, listBriefsForClient, loadBrief, archiveBrief, updateBriefTitle };
