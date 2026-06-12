/**
 * installIntakeService — Crux Installation Instrument Part 1 storage.
 *
 * Powers the strategist install workspace + (downstream) the public
 * tokenized pre-work page. Source of truth: migration 105
 * (client_install_intake + install_intake_tokens).
 *
 * Per the instrument doc (v1.4):
 *   - Client answers factual questions async via tokenized page
 *   - Strategist runs discovery call, captures the high-judgment
 *     answers, AND confirms each client-submitted answer
 *   - No answer enters the strategic Spine until a strategist has
 *     confirmed it — confirmation is the discipline this layer enforces
 *
 * Pre-population: for clients with existing Spine / business_context
 * data (Pearl 27 is the test case — already has a synthesized persona),
 * the strategist form can suggest draft answers from existing fields.
 * Per the install protocol: pre-populated answers MUST be confirmed by
 * the strategist with the client; they never enter the Spine as-is.
 */

import { supabase } from './supabaseClient';
import { INSTALL_INTAKE_VERSION, INTAKE_QUESTIONS } from '../lib/installIntakeQuestions.js';

// ──────────────────────────────────────────────────
// Read — load all intake answers for a client
// ──────────────────────────────────────────────────

/**
 * Returns a map keyed by question_key:
 *   { q1_outcome_12mo: { answer_text, source, submitted_at, confirmed_by_strategist_at, ... }, ... }
 * Keys for questions with no row yet are absent (UI treats absence as 'unanswered').
 */
export async function loadIntakeAnswers(clientId) {
  if (!supabase || !clientId) return {};
  const { data, error } = await supabase
    .from('client_install_intake')
    .select('*')
    .eq('client_id', clientId);
  if (error) {
    console.warn('[installIntake] load failed:', error.message);
    return {};
  }
  const byKey = {};
  for (const row of data || []) byKey[row.question_key] = row;
  return byKey;
}

/**
 * Convenience: completion stats for the install health-check (Part 3 #1).
 * Returns { total, answered, confirmed, unanswered, by_section: {A: {...}, ...} }.
 */
export async function getIntakeCompletion(clientId) {
  const answers = await loadIntakeAnswers(clientId);
  const by_section = {};
  let answered = 0, confirmed = 0;
  for (const q of INTAKE_QUESTIONS) {
    const row = answers[q.key];
    const isAnswered  = !!(row?.answer_text?.trim());
    const isConfirmed = !!row?.confirmed_by_strategist_at;
    if (isAnswered)  answered++;
    if (isConfirmed) confirmed++;
    if (!by_section[q.section]) by_section[q.section] = { total: 0, answered: 0, confirmed: 0 };
    by_section[q.section].total++;
    if (isAnswered)  by_section[q.section].answered++;
    if (isConfirmed) by_section[q.section].confirmed++;
  }
  return {
    total:       INTAKE_QUESTIONS.length,
    answered,
    confirmed,
    unanswered:  INTAKE_QUESTIONS.length - answered,
    by_section,
    completion_pct: Math.round((confirmed / INTAKE_QUESTIONS.length) * 100),
  };
}

// ──────────────────────────────────────────────────
// Write — upsert an answer (strategist surface)
// ──────────────────────────────────────────────────

/**
 * Upsert an answer from the strategist workspace. Strategist edits
 * always set source='strategist' and clear the confirmation timestamp
 * IF the answer text changed materially (so re-edits require
 * re-confirmation, preserving the discipline).
 *
 * If the strategist is just confirming an existing client-submitted
 * answer without changing text, use confirmStrategistAnswer instead.
 *
 * @param {Object} args
 * @param {string} args.clientId
 * @param {string} args.questionKey
 * @param {string} args.answerText
 * @param {string} [args.notes]            — strategist coaching notes (e.g., Q1 first-sentence verbatim)
 * @param {string} [args.submittedBy]
 */
export async function upsertStrategistAnswer({ clientId, questionKey, answerText, notes = null, submittedBy = null }) {
  if (!clientId || !questionKey) return { ok: false, error: 'clientId + questionKey required' };

  const { data: existing } = await supabase
    .from('client_install_intake')
    .select('answer_text, source')
    .eq('client_id', clientId).eq('question_key', questionKey).maybeSingle();

  const textChanged = !existing || (existing.answer_text || '') !== (answerText || '');

  const row = {
    client_id:                  clientId,
    question_key:               questionKey,
    answer_text:                answerText,
    install_instrument_version: INSTALL_INTAKE_VERSION,
    source:                     'strategist',
    submitted_by:               submittedBy,
    submitted_at:               new Date().toISOString(),
    strategist_notes:           notes,
    updated_at:                 new Date().toISOString(),
  };

  // When the strategist edits an existing answer's text, re-confirmation
  // is required. When notes-only edit, preserve confirmation.
  if (textChanged) {
    row.confirmed_by_strategist_at = new Date().toISOString();
    row.confirmed_by               = submittedBy;
  }

  const { error } = await supabase
    .from('client_install_intake')
    .upsert(row, { onConflict: 'client_id,question_key' });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Mark a client-submitted (or pre-populated) answer as confirmed by
 * the strategist — no text change, just the confirmation stamp.
 * This is the rule the instrument enforces: client-async answers
 * don't enter strategic use until the strategist has verified them
 * in conversation.
 */
export async function confirmStrategistAnswer({ clientId, questionKey, confirmedBy = null }) {
  if (!clientId || !questionKey) return { ok: false, error: 'clientId + questionKey required' };
  const { error } = await supabase
    .from('client_install_intake')
    .update({
      confirmed_by_strategist_at: new Date().toISOString(),
      confirmed_by:               confirmedBy,
      updated_at:                 new Date().toISOString(),
    })
    .eq('client_id', clientId).eq('question_key', questionKey);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ──────────────────────────────────────────────────
// Pre-population — suggest answers from existing Spine data
// ──────────────────────────────────────────────────

/**
 * Look at existing Spine / business_context / persona to draft answers
 * for questions where `prePopulatable: true`. These drafts are stored
 * with source='pre_populated' and require strategist confirmation
 * before they're considered real.
 *
 * Pearl 27 is the test case: already has audience persona, business
 * context, guardrails — pre-population should suggest drafts for
 * Q7 (off-limits), Q10 (legal/compliance), Q15 (audience assets).
 *
 * Returns a map of suggestions { questionKey: draftAnswerText, ... }
 * — does NOT persist. UI shows them as "Crux drafted this from your
 * existing Spine — confirm with client to commit" so the strategist
 * makes the conscious confirmation call.
 */
export async function suggestPrePopulatedAnswers(clientId) {
  if (!clientId) return {};
  const [{ data: spine }, { data: biz }] = await Promise.all([
    supabase.from('client_strategy_spine')
      .select('guardrails, audience_persona, audience_read').eq('client_id', clientId).maybeSingle(),
    supabase.from('client_business_context')
      .select('products_offered, products_not_offered, target_market, notes')
      .eq('client_id', clientId).eq('status', 'active').maybeSingle(),
  ]);

  const suggestions = {};

  // Q7: off-limits topics / tones / formats — from Spine.guardrails + business_context.products_not_offered
  const q7Parts = [];
  if (spine?.guardrails)            q7Parts.push(`From Spine guardrails: ${spine.guardrails}`);
  if (biz?.products_not_offered)    q7Parts.push(`From business context (not offered): ${biz.products_not_offered}`);
  if (q7Parts.length) suggestions.q7_off_limits = q7Parts.join('\n\n');

  // Q10: legal/compliance — same sources may carry these
  if (spine?.guardrails && /legal|compliance|regulat|claim/i.test(spine.guardrails)) {
    suggestions.q10_legal_compliance = `Possible match from Spine guardrails: ${spine.guardrails}`;
  }

  // Q15: audience assets outside YouTube — business context sometimes mentions email lists / communities
  if (biz?.notes && /email|list|community|partner|social|followers/i.test(biz.notes)) {
    suggestions.q15_audience_assets = `Possible match from business context notes: ${biz.notes}`;
  }

  return suggestions;
}

/**
 * Persist a pre-populated draft so it shows in the workspace as
 * "draft suggestion · confirm with client." Strategist still must
 * confirm before it counts as a real answer.
 */
export async function savePrePopulatedDraft({ clientId, questionKey, draftText }) {
  if (!clientId || !questionKey) return { ok: false, error: 'clientId + questionKey required' };
  const row = {
    client_id:                  clientId,
    question_key:               questionKey,
    answer_text:                draftText,
    install_instrument_version: INSTALL_INTAKE_VERSION,
    source:                     'pre_populated',
    submitted_by:               'auto',
    submitted_at:               new Date().toISOString(),
    confirmed_by_strategist_at: null,  // explicitly unconfirmed
    updated_at:                 new Date().toISOString(),
  };
  const { error } = await supabase
    .from('client_install_intake')
    .upsert(row, { onConflict: 'client_id,question_key' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ──────────────────────────────────────────────────
// Tokens — issue / list / revoke
// ──────────────────────────────────────────────────

/**
 * Issue a new tokenized URL for client pre-work. Returns
 * { ok, token, url, expires_at }.
 */
export async function issueIntakeToken({ clientId, expiresInDays = 14, intendedRecipientName = null, intendedRecipientEmail = null, createdBy = null }) {
  if (!clientId) return { ok: false, error: 'clientId required' };
  const token = generateOpaqueToken(40);
  const expiresAt = new Date(Date.now() + expiresInDays * 86400_000).toISOString();
  const { data, error } = await supabase
    .from('install_intake_tokens')
    .insert({
      client_id:                clientId,
      token,
      expires_at:               expiresAt,
      created_by:               createdBy,
      intended_recipient_name:  intendedRecipientName,
      intended_recipient_email: intendedRecipientEmail,
    })
    .select('token, expires_at').single();
  if (error) return { ok: false, error: error.message };
  return {
    ok:         true,
    token:      data.token,
    expires_at: data.expires_at,
    url:        `${typeof window !== 'undefined' ? window.location.origin : ''}/intake/${data.token}`,
  };
}

export async function listIntakeTokens(clientId) {
  if (!clientId) return [];
  const { data } = await supabase
    .from('install_intake_tokens')
    .select('*').eq('client_id', clientId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function revokeIntakeToken(tokenId, reason = null) {
  const { error } = await supabase
    .from('install_intake_tokens')
    .update({ revoked_at: new Date().toISOString(), revoke_reason: reason })
    .eq('id', tokenId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

function generateOpaqueToken(bytes = 40) {
  // High-entropy URL-safe base64 token. Browser context: use crypto.getRandomValues.
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode.apply(null, arr))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  // Node fallback (won't usually run in this service but defensive)
  let s = ''; for (let i = 0; i < bytes; i++) s += Math.floor(Math.random() * 256).toString(36);
  return s;
}

export default {
  loadIntakeAnswers,
  getIntakeCompletion,
  upsertStrategistAnswer,
  confirmStrategistAnswer,
  suggestPrePopulatedAnswers,
  savePrePopulatedDraft,
  issueIntakeToken,
  listIntakeTokens,
  revokeIntakeToken,
};
