/**
 * Persistence for competitor concept scans — save / list / load / archive.
 *
 * Matches the pattern in repositioningAuditsService: thin CRUD wrapper
 * over the Supabase table. Scans are immutable; re-running creates a
 * new row so strategists can compare scans across time.
 */

import { supabase } from './supabaseClient';

const TABLE = 'client_competitor_scans';

/**
 * Persist a completed scan run.
 */
export async function saveScan({
  clientId,
  createdBy = null,
  mode = 'deterministic',
  windowDays,
  formatFilter = null,
  signalMultiplier,
  competitorChannelsScanned,
  videosEvaluated,
  findings,
  cohortDataAt = null,
  cohortWindowDays = 90,
}) {
  if (!supabase) return { ok: false, error: 'supabase not configured' };
  if (!clientId) return { ok: false, error: 'clientId required' };

  const row = {
    client_id:                   clientId,
    created_by:                  createdBy,
    mode,
    window_days:                 windowDays,
    format_filter:               formatFilter,
    signal_multiplier:           signalMultiplier,
    competitor_channels_scanned: competitorChannelsScanned || 0,
    videos_evaluated:            videosEvaluated || 0,
    findings_count:              (findings || []).length,
    cohort_data_at:              cohortDataAt || new Date().toISOString(),
    cohort_window_days:          cohortWindowDays,
    findings:                    findings || [],
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select('id, created_at')
    .single();

  if (error) {
    console.warn('[competitorScans] save failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id, createdAt: data.created_at };
}

/**
 * List recent scans for a client (light columns, no findings).
 */
export async function listScansForClient(clientId, { limit = 10 } = {}) {
  if (!supabase || !clientId) return { ok: false, error: 'invalid args', scans: [] };

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, created_at, created_by, mode, window_days, format_filter, signal_multiplier, competitor_channels_scanned, videos_evaluated, findings_count, cohort_data_at')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[competitorScans] list failed:', error);
    return { ok: false, error: error.message, scans: [] };
  }
  return { ok: true, scans: data || [] };
}

/**
 * Load a single scan with full findings array.
 */
export async function loadScan(scanId) {
  if (!supabase || !scanId) return { ok: false, error: 'invalid args' };

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', scanId)
    .single();

  if (error) {
    console.warn('[competitorScans] load failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, scan: data };
}

export async function archiveScan(scanId) {
  if (!supabase || !scanId) return { ok: false, error: 'invalid args' };
  const { error } = await supabase
    .from(TABLE)
    .update({ archived_at: new Date().toISOString() })
    .eq('id', scanId);
  if (error) {
    console.warn('[competitorScans] archive failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export default { saveScan, listScansForClient, loadScan, archiveScan };
