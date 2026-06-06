/**
 * Persistence for calibration runs — save / list / load / archive.
 *
 * Matches the pattern in repositioningAuditsService + competitorScansService.
 * Calibration runs are immutable; running again creates a new row so the
 * strategist can compare calibration over time (does the scorer get better
 * as cohort data refreshes?).
 */

import { supabase } from './supabaseClient';

const TABLE = 'client_calibration_runs';

/**
 * Persist a completed calibration run.
 */
export async function saveCalibrationRun({
  clientId,
  sourceAuditId,
  createdBy = null,
  baselineStrategy = 'percentile_rank',
  baselineWindowDays = null,
  videosCalibrated,
  compositeAccuracy,
  compositeAdjacentAccuracy,
  compositeMetrics,
  perDimensionMetrics,
  mismatchedVideos,
}) {
  if (!supabase) return { ok: false, error: 'supabase not configured' };
  if (!clientId || !sourceAuditId) return { ok: false, error: 'clientId + sourceAuditId required' };

  const row = {
    client_id:                    clientId,
    source_audit_id:              sourceAuditId,
    created_by:                   createdBy,
    baseline_strategy:            baselineStrategy,
    baseline_window_days:         baselineWindowDays,
    videos_calibrated:            videosCalibrated || 0,
    composite_accuracy:           compositeAccuracy,
    composite_adjacent_accuracy:  compositeAdjacentAccuracy,
    composite_metrics:            compositeMetrics || null,
    per_dimension_metrics:        perDimensionMetrics || null,
    mismatched_videos:            mismatchedVideos || null,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select('id, created_at')
    .single();

  if (error) {
    console.warn('[calibrationRuns] save failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id, createdAt: data.created_at };
}

/**
 * List calibration runs for a client (light columns — no confusion
 * matrices, no mismatched-video lists). Hydrate with loadCalibrationRun().
 */
export async function listCalibrationRunsForClient(clientId, { limit = 10 } = {}) {
  if (!supabase || !clientId) return { ok: false, error: 'invalid args', runs: [] };

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, source_audit_id, created_at, created_by, baseline_strategy, videos_calibrated, composite_accuracy, composite_adjacent_accuracy')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[calibrationRuns] list failed:', error);
    return { ok: false, error: error.message, runs: [] };
  }
  return { ok: true, runs: data || [] };
}

/**
 * Load a single calibration run with full matrices + mismatch detail.
 */
export async function loadCalibrationRun(runId) {
  if (!supabase || !runId) return { ok: false, error: 'invalid args' };
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', runId)
    .single();
  if (error) {
    console.warn('[calibrationRuns] load failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, run: data };
}

export async function archiveCalibrationRun(runId) {
  if (!supabase || !runId) return { ok: false, error: 'invalid args' };
  const { error } = await supabase
    .from(TABLE)
    .update({ archived_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) {
    console.warn('[calibrationRuns] archive failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export default {
  saveCalibrationRun,
  listCalibrationRunsForClient,
  loadCalibrationRun,
  archiveCalibrationRun,
};
