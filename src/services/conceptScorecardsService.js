/**
 * Concept scorecards service — persistence layer for pre-flight
 * scorecards (the Phase 1 prediction-machine output).
 *
 * CRUD only. The scoring logic lives in `conceptScorerService` (pure
 * functions); the LLM strategic-read pass lives in its own service.
 * This file is the thin Supabase wrapper that joins them at save time
 * and reads them back for the UI.
 *
 * Schema documented in /supabase/migrations/086_client_concept_scorecards.sql
 * (input / scores / suggested_tweaks shapes).
 *
 * Lifecycle:
 *   - Strategist enters a concept → orchestrator calls
 *     scoreConcept() to get the deterministic output → saveScorecard()
 *     persists the row → optional LLM strategic-read pass updates
 *     strategic_read + strategic_read_prompt_version in place.
 *   - List/load reads exclude archived rows by default (the table is
 *     append-only for audit purposes; archive is the soft-delete).
 *   - Archive is a one-way switch — strategists hide stale drafts
 *     rather than hard-deleting them so Phase-4 calibration retains the
 *     full history of pre-flight predictions vs. actual outcomes.
 */

import { supabase } from './supabaseClient';

// ──────────────────────────────────────────────────
// Save
// ──────────────────────────────────────────────────

/**
 * Save a fresh scorecard.
 *
 * @param {Object} args
 * @param {string} args.clientId            UUID — channels.id for the client
 * @param {string} [args.pillarId]          UUID — client_pillars.id, optional
 * @param {string} [args.createdBy]         strategist email, optional
 * @param {Object} args.input               concept input (see migration 086 header)
 * @param {Object} args.scoringOutput       output from scoreConcept(): { scores, composite_tier, composite_rationale, suggested_tweaks }
 * @param {number} [args.cohortWindowDays=90]
 * @param {string} [args.cohortDataAt]      ISO timestamp of the audit data the scorecard was computed against
 * @returns {Promise<{ id: string, created_at: string } | null>}
 */
export async function saveScorecard({
  clientId,
  pillarId = null,
  createdBy = null,
  input,
  scoringOutput,
  cohortWindowDays = 90,
  cohortDataAt = null,
}) {
  if (!supabase || !clientId || !input || !scoringOutput) return null;

  const row = {
    client_id: clientId,
    pillar_id: pillarId,
    created_by: createdBy,
    input,
    scores: scoringOutput.scores,
    composite_tier: scoringOutput.composite_tier,
    composite_rationale: scoringOutput.composite_rationale,
    suggested_tweaks: scoringOutput.suggested_tweaks || [],
    cohort_window_days: cohortWindowDays,
    cohort_data_at: cohortDataAt || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('client_concept_scorecards')
    .insert(row)
    .select('id, created_at')
    .single();

  if (error) {
    console.warn('[scorecards] save failed:', error);
    return null;
  }
  return data;
}

// ──────────────────────────────────────────────────
// Load (single + list)
// ──────────────────────────────────────────────────

/**
 * Load a single scorecard by id. Returns the full row, archived or not
 * — the caller decided to look this up specifically.
 */
export async function loadScorecard(id) {
  if (!supabase || !id) return null;
  const { data, error } = await supabase
    .from('client_concept_scorecards')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    console.warn('[scorecards] load failed:', error);
    return null;
  }
  return data;
}

/**
 * List scorecards for a client (or for a specific pillar within a client).
 * Excludes archived rows by default — pass `includeArchived: true` to
 * surface them (e.g., for a "show archived" toggle).
 *
 * Ordered newest first.
 */
export async function listScorecards({
  clientId,
  pillarId = null,
  includeArchived = false,
  limit = 50,
} = {}) {
  if (!supabase || !clientId) return [];

  let q = supabase
    .from('client_concept_scorecards')
    .select('id, pillar_id, created_at, created_by, input, composite_tier, composite_rationale, strategic_read, cohort_data_at, archived_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (pillarId) q = q.eq('pillar_id', pillarId);
  if (!includeArchived) q = q.is('archived_at', null);

  const { data, error } = await q;
  if (error) {
    console.warn('[scorecards] list failed:', error);
    return [];
  }
  return data || [];
}

// ──────────────────────────────────────────────────
// Update (in-place: LLM strategic-read pass)
// ──────────────────────────────────────────────────

/**
 * Attach (or overwrite) the LLM strategic-read narrative on a scorecard.
 * Called after the strategic-read service generates the prose. The
 * promptVersion lets us invalidate cached reads when the prompt changes.
 */
export async function updateStrategicRead({ id, text, promptVersion }) {
  if (!supabase || !id) return false;
  const { error } = await supabase
    .from('client_concept_scorecards')
    .update({
      strategic_read: text,
      strategic_read_prompt_version: promptVersion,
    })
    .eq('id', id);
  if (error) {
    console.warn('[scorecards] strategic-read update failed:', error);
    return false;
  }
  return true;
}

/**
 * Re-write the deterministic scoring fields on an existing scorecard.
 *
 * Use case: the strategist hits "re-score against current cohort"
 * after the underlying audit refreshes. We don't create a new row
 * (history would balloon with re-scores) — we update in place and
 * advance cohort_data_at. The strategic_read is wiped because it was
 * generated against the old scores; the orchestrator regenerates it.
 */
export async function rescoreScorecard({ id, scoringOutput, cohortDataAt }) {
  if (!supabase || !id || !scoringOutput) return false;
  const { error } = await supabase
    .from('client_concept_scorecards')
    .update({
      scores: scoringOutput.scores,
      composite_tier: scoringOutput.composite_tier,
      composite_rationale: scoringOutput.composite_rationale,
      suggested_tweaks: scoringOutput.suggested_tweaks || [],
      cohort_data_at: cohortDataAt || new Date().toISOString(),
      // Strategic read was generated against the old scores; clear it.
      // Orchestrator will regenerate via the strategic-read service.
      strategic_read: null,
      strategic_read_prompt_version: null,
    })
    .eq('id', id);
  if (error) {
    console.warn('[scorecards] rescore failed:', error);
    return false;
  }
  return true;
}

// ──────────────────────────────────────────────────
// Archive / unarchive
// ──────────────────────────────────────────────────

export async function archiveScorecard(id) {
  if (!supabase || !id) return false;
  const { error } = await supabase
    .from('client_concept_scorecards')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.warn('[scorecards] archive failed:', error);
    return false;
  }
  return true;
}

export async function unarchiveScorecard(id) {
  if (!supabase || !id) return false;
  const { error } = await supabase
    .from('client_concept_scorecards')
    .update({ archived_at: null })
    .eq('id', id);
  if (error) {
    console.warn('[scorecards] unarchive failed:', error);
    return false;
  }
  return true;
}

export default {
  saveScorecard,
  loadScorecard,
  listScorecards,
  updateStrategicRead,
  rescoreScorecard,
  archiveScorecard,
  unarchiveScorecard,
};
