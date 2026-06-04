/**
 * Persistence for repositioning audits — save / list / load / archive.
 *
 * Matches the pattern in conceptScorecardsService: thin CRUD wrapper
 * over the Supabase table, with shape that's safe to feed straight
 * back into the UI.
 *
 * Audit runs are immutable once written. Re-running on the same
 * channel creates a NEW row. This lets strategists track repositioning
 * effects over time (Audit-1 in March vs Audit-2 in June — did the
 * systemic gaps shrink?).
 */

import { supabase } from './supabaseClient';

const TABLE = 'client_repositioning_audits';

/**
 * Persist a completed audit run.
 *
 * @param {Object} args
 * @param {string} args.clientId
 * @param {string} [args.createdBy]
 * @param {string} args.mode  'deterministic' | 'deep'
 * @param {number} args.videosScored
 * @param {number} args.videosWithEmbeddings
 * @param {string|null} args.formatFilter
 * @param {string|null} args.cohortDataAt  ISO timestamp
 * @param {number} [args.cohortWindowDays=90]
 * @param {Object} args.compositeDistribution
 * @param {Object} args.dimensionBreakdowns
 * @param {Array}  args.systemicGaps
 * @param {Array}  args.systemicStrengths
 * @param {Array}  args.videoScores
 */
export async function saveAudit({
  clientId,
  createdBy = null,
  mode = 'deterministic',
  videosScored,
  videosWithEmbeddings = 0,
  formatFilter = null,
  cohortDataAt = null,
  cohortWindowDays = 90,
  compositeDistribution = null,
  dimensionBreakdowns = null,
  systemicGaps = null,
  systemicStrengths = null,
  videoScores = null,
}) {
  if (!supabase) return { ok: false, error: 'supabase not configured' };
  if (!clientId) return { ok: false, error: 'clientId required' };

  const row = {
    client_id:              clientId,
    created_by:             createdBy,
    mode,
    videos_scored:          videosScored,
    videos_with_embeddings: videosWithEmbeddings,
    format_filter:          formatFilter,
    cohort_data_at:         cohortDataAt || new Date().toISOString(),
    cohort_window_days:     cohortWindowDays,
    composite_distribution: compositeDistribution,
    dimension_breakdowns:   dimensionBreakdowns,
    systemic_gaps:          systemicGaps,
    systemic_strengths:     systemicStrengths,
    video_scores:           videoScores,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select('id, created_at')
    .single();

  if (error) {
    console.warn('[repositioningAudits] save failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id, createdAt: data.created_at };
}

/**
 * List recent audits for a client (light columns only — no per-video
 * detail). Use loadAudit() to hydrate full per-video scores.
 */
export async function listAuditsForClient(clientId, { limit = 10 } = {}) {
  if (!supabase || !clientId) return { ok: false, error: 'invalid args', audits: [] };

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, created_at, created_by, mode, videos_scored, videos_with_embeddings, format_filter, cohort_data_at, composite_distribution, systemic_gaps, systemic_strengths')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[repositioningAudits] list failed:', error);
    return { ok: false, error: error.message, audits: [] };
  }
  return { ok: true, audits: data || [] };
}

/**
 * Load a single audit by id, with full per-video score detail.
 */
export async function loadAudit(auditId) {
  if (!supabase || !auditId) return { ok: false, error: 'invalid args' };

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', auditId)
    .single();

  if (error) {
    console.warn('[repositioningAudits] load failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, audit: data };
}

/**
 * Soft-archive an audit. (RLS allows authenticated delete but we soft-
 * archive instead so strategists can still see what was previously
 * surfaced.)
 */
export async function archiveAudit(auditId) {
  if (!supabase || !auditId) return { ok: false, error: 'invalid args' };

  const { error } = await supabase
    .from(TABLE)
    .update({ archived_at: new Date().toISOString() })
    .eq('id', auditId);

  if (error) {
    console.warn('[repositioningAudits] archive failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export default { saveAudit, listAuditsForClient, loadAudit, archiveAudit };
