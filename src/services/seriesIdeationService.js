/**
 * Series Ideation service.
 *
 * Generates series concepts (AI or user-seeded), tracks their lifecycle
 * (concept → shelved → greenlit → concluded), and on greenlight mirrors
 * the series into the client's Strategy Spine as an active play.
 *
 * Design notes:
 *   - Concepts have richer structure than spine.active_plays — episodes,
 *     format, cadence, cohort evidence — so they live in their own table.
 *   - Spine context (positioning, stance, guardrails) is injected on
 *     every generation so concepts respect the strategist's narrative.
 *   - User-submitted seeds get the same Claude pass to be structured up
 *     into the same shape as AI-generated concepts. Mixed sources are
 *     coequal in the browser; the strategist evaluates by strategic fit,
 *     not by origin.
 */

import { supabase } from './supabaseClient';
import { buildSpineContext } from './spineContextService';
import { addActivePlay, updateActivePlay } from './strategySpineService';
import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';

export const STATUS_LABELS = {
  concept: 'Concept',
  shelved: 'Shelved',
  greenlit: 'Greenlit',
  concluded: 'Concluded',
};

// ──────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────

export async function listConcepts(clientId) {
  if (!supabase || !clientId) return { active: [], shelved: [], greenlit: [], concluded: [] };
  const { data, error } = await supabase
    .from('client_series_concepts')
    .select('*')
    .eq('client_id', clientId)
    .order('status_changed_at', { ascending: false });
  if (error) {
    console.warn('[seriesIdeation] list failed:', error);
    return { active: [], shelved: [], greenlit: [], concluded: [] };
  }
  return {
    active: (data || []).filter(c => c.status === 'concept'),
    shelved: (data || []).filter(c => c.status === 'shelved'),
    greenlit: (data || []).filter(c => c.status === 'greenlit'),
    concluded: (data || []).filter(c => c.status === 'concluded'),
  };
}

export async function getConcept(conceptId) {
  if (!supabase || !conceptId) return null;
  const { data } = await supabase
    .from('client_series_concepts')
    .select('*')
    .eq('id', conceptId)
    .maybeSingle();
  return data;
}

// ──────────────────────────────────────────────────
// Generate (AI-led)
// ──────────────────────────────────────────────────

/**
 * Generate N fresh series concepts for a client. Uses spine context so
 * the output respects stance, audience read, and guardrails. Persists
 * each concept individually so partial success is still useful.
 */
export async function generateConcepts(clientId, { clientName, count = 5, cohortSummary = '' } = {}) {
  if (!clientId) return { ok: false, error: 'missing clientId', concepts: [] };

  const spineContext = await buildSpineContext(clientId, { clientName });

  const prompt = `Generate ${count} distinct YouTube series concepts for ${clientName || 'this client'}. Each concept should be a series the strategist could plausibly run for the next 6–12 weeks.

${cohortSummary ? `COHORT CONTEXT (what's working in this client's competitive set):\n${cohortSummary}\n\n` : ''}REQUIRED SHAPE — return a JSON array. Each element must have:
{
  "title": "string — 2-5 word series title that signals the through-line",
  "premise": "string — 1-2 sentences naming the recurring promise of the series",
  "format": "string — e.g. '6-9 min long-form' or '60-90s Shorts' or 'mix: 90s short + 8min long-form'",
  "cadence": "string — e.g. 'weekly', 'biweekly', 'drop all 6 over 3 days'",
  "episode_count": number,
  "episodes": [
    { "title": "episode 1 title", "hook": "1-sentence hook" },
    ...
  ],
  "rationale": "string — 2-3 sentences explaining why this series fits the strategic context above. Cite spine fields by name when relevant (e.g. 'aligns with stated stance on series-anchored shorts' or 'respects guardrail against doctrine commentary')."
}

CRITICAL:
- Episodes are one-liners — title + a short hook. Don't deep-develop yet.
- Each series must be distinct in promise, not just in topic. Don't return five tutorials with different topics.
- If GUARDRAILS are provided in the strategic context above, do not produce a series that violates them.
- If the CURRENT STRATEGIC STANCE points at a specific format or rhythm, lean into it for at least 3 of the ${count} concepts.

Return ONLY the JSON array. No prose.`;

  const baseSystem = `You generate distinct YouTube series concepts for a strategist. Each concept is a strategic bet — a series the strategist could greenlight and run for 6-12 weeks. Respect any STRATEGIC CONTEXT and GUARDRAILS provided above as hard constraints. Return ONLY valid JSON.`;
  const systemPrompt = spineContext + baseSystem;

  let parsed;
  try {
    const result = await claudeAPI.call(prompt, systemPrompt, 'series_ideation', 4096);
    parsed = parseClaudeJSON(result.text, []);
    if (!Array.isArray(parsed)) parsed = [];
  } catch (e) {
    console.error('[seriesIdeation] generation failed:', e);
    return { ok: false, error: e.message, concepts: [] };
  }

  // Persist each concept individually so a failed insert doesn't lose
  // the others. Snapshot the spine context so the historical "why" is
  // recoverable later.
  const inserts = parsed
    .filter(c => c && c.title && c.premise)
    .map(c => ({
      client_id: clientId,
      source: 'ai',
      status: 'concept',
      title: c.title,
      premise: c.premise,
      format: c.format || null,
      cadence: c.cadence || null,
      episode_count: c.episode_count || (Array.isArray(c.episodes) ? c.episodes.length : null),
      episodes: Array.isArray(c.episodes) ? c.episodes : [],
      rationale: c.rationale || null,
      spine_snapshot: spineContext || null,
    }));

  if (!inserts.length) return { ok: false, error: 'no valid concepts in response', concepts: [] };

  const { data: created, error } = await supabase
    .from('client_series_concepts')
    .insert(inserts)
    .select();
  if (error) {
    console.warn('[seriesIdeation] insert failed:', error);
    return { ok: false, error: error.message, concepts: [] };
  }
  return { ok: true, concepts: created || [] };
}

// ──────────────────────────────────────────────────
// User-seeded concept (strategist types a seed, AI fleshes it out)
// ──────────────────────────────────────────────────

/**
 * Strategist types a sentence or two; Claude structures it into the
 * same shape as AI-generated concepts. Then it enters the same flow.
 */
export async function addUserConcept(clientId, userSeed, { clientName } = {}) {
  if (!clientId || !userSeed?.trim()) return { ok: false, error: 'missing input', concept: null };

  const spineContext = await buildSpineContext(clientId, { clientName });
  const prompt = `A strategist provided this series seed for ${clientName || 'a client'}:

"${userSeed.trim()}"

Flesh it into a complete series concept. Stay faithful to the strategists framing — do not rewrite their core idea. Add the structural fields they did not specify (format, cadence, episode list, rationale). If the seed already specifies any of these, preserve them verbatim.

Return JSON with this shape:
{
  "title": "string",
  "premise": "string",
  "format": "string",
  "cadence": "string",
  "episode_count": number,
  "episodes": [{ "title": "...", "hook": "..." }, ...],
  "rationale": "string — why this fits the strategic context, citing spine fields when relevant"
}

If the seed implies fewer than 4 episodes, default to 6 episodes unless the seed explicitly says otherwise.
Respect any GUARDRAILS in the strategic context above as hard constraints.

Return ONLY valid JSON.`;

  const baseSystem = `You flesh out a strategists series seed into a complete concept. Stay faithful to their framing; add structure they didn't specify. Respect STRATEGIC CONTEXT and GUARDRAILS above. Return ONLY valid JSON.`;
  const systemPrompt = spineContext + baseSystem;

  let parsed;
  try {
    const result = await claudeAPI.call(prompt, systemPrompt, 'series_user_seed', 2048);
    parsed = parseClaudeJSON(result.text, null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'failed to parse fleshed concept', concept: null };
    }
  } catch (e) {
    return { ok: false, error: e.message, concept: null };
  }

  const insert = {
    client_id: clientId,
    source: 'user',
    status: 'concept',
    title: parsed.title || userSeed.slice(0, 60),
    premise: parsed.premise || userSeed,
    format: parsed.format || null,
    cadence: parsed.cadence || null,
    episode_count: parsed.episode_count || (Array.isArray(parsed.episodes) ? parsed.episodes.length : null),
    episodes: Array.isArray(parsed.episodes) ? parsed.episodes : [],
    rationale: parsed.rationale || null,
    spine_snapshot: spineContext || null,
  };
  const { data: created, error } = await supabase
    .from('client_series_concepts')
    .insert(insert)
    .select()
    .single();
  if (error) {
    console.warn('[seriesIdeation] user insert failed:', error);
    return { ok: false, error: error.message, concept: null };
  }
  return { ok: true, concept: created };
}

// ──────────────────────────────────────────────────
// Explore — deeper second pass on one concept
// ──────────────────────────────────────────────────

/**
 * Run a deeper Claude pass against a concept: expand episode hooks,
 * surface cohort evidence, write a richer rationale. Updates the row
 * in place; safe to call multiple times.
 */
export async function exploreConcept(conceptId, { clientName } = {}) {
  if (!supabase || !conceptId) return { ok: false, error: 'missing' };
  const concept = await getConcept(conceptId);
  if (!concept) return { ok: false, error: 'not found' };

  const spineContext = await buildSpineContext(concept.client_id, { clientName });

  const prompt = `Deepen this series concept. The strategist is considering it but hasn't greenlit it yet — your job is to give them enough texture to make the call.

EXISTING CONCEPT:
Title: ${concept.title}
Premise: ${concept.premise}
Format: ${concept.format || '(unspecified)'}
Cadence: ${concept.cadence || '(unspecified)'}
Episode count: ${concept.episode_count || '(unspecified)'}
Episodes so far:
${(concept.episodes || []).map((e, i) => `  ${i + 1}. ${e.title}${e.hook ? ` — ${e.hook}` : ''}`).join('\n') || '(none yet)'}

Return JSON with this shape:
{
  "premise": "string — refined premise, sharper than the original. Keep the spirit; clarify the promise.",
  "format": "string",
  "cadence": "string",
  "episode_count": number,
  "episodes": [
    { "title": "...", "hook": "1-2 sentence hook describing the cold-open beat or emotional setup" }
  ],
  "rationale": "string — 3-5 sentences. (1) why this series fits the strategic context, (2) what makes it distinct vs. typical genre output, (3) what the risk is, (4) what would tell us it's working in the first 2 episodes."
}

Episode list should be the FULL series, not partial. Add hooks to every episode (1-2 sentences each).
Respect any GUARDRAILS in the strategic context above as hard constraints.

Return ONLY valid JSON.`;

  const baseSystem = `You deepen a series concept for a strategist evaluating whether to greenlight it. Give them enough texture to decide. Respect STRATEGIC CONTEXT and GUARDRAILS. Return ONLY valid JSON.`;
  const systemPrompt = spineContext + baseSystem;

  let parsed;
  try {
    const result = await claudeAPI.call(prompt, systemPrompt, 'series_explore', 3072);
    parsed = parseClaudeJSON(result.text, null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'failed to parse exploration' };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const patch = {
    premise: parsed.premise || concept.premise,
    format: parsed.format || concept.format,
    cadence: parsed.cadence || concept.cadence,
    episode_count: parsed.episode_count || concept.episode_count,
    episodes: Array.isArray(parsed.episodes) && parsed.episodes.length ? parsed.episodes : concept.episodes,
    rationale: parsed.rationale || concept.rationale,
  };
  const { error } = await supabase
    .from('client_series_concepts')
    .update(patch)
    .eq('id', conceptId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, concept: { ...concept, ...patch } };
}

// ──────────────────────────────────────────────────
// Status transitions
// ──────────────────────────────────────────────────

export async function shelveConcept(conceptId) {
  return setStatus(conceptId, 'shelved');
}

export async function restoreConcept(conceptId) {
  return setStatus(conceptId, 'concept');
}

export async function concludeConcept(conceptId) {
  return setStatus(conceptId, 'concluded');
}

export async function deleteConcept(conceptId) {
  if (!supabase || !conceptId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('client_series_concepts')
    .delete()
    .eq('id', conceptId);
  return { ok: !error, error: error?.message };
}

async function setStatus(conceptId, status) {
  if (!supabase || !conceptId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('client_series_concepts')
    .update({ status })
    .eq('id', conceptId);
  return { ok: !error, error: error?.message };
}

// ──────────────────────────────────────────────────
// Greenlight — promote to spine.active_plays
// ──────────────────────────────────────────────────

/**
 * Promote a concept to greenlit and mirror it into the client's Strategy
 * Spine as an active play. The spine play is the canonical "we're running
 * this" record; the concept retains the richer structure. They're linked
 * via concept.active_play_id.
 */
export async function greenlightConcept(conceptId) {
  if (!supabase || !conceptId) return { ok: false, error: 'missing' };
  const concept = await getConcept(conceptId);
  if (!concept) return { ok: false, error: 'not found' };
  if (concept.status === 'greenlit') return { ok: true, concept };

  const playName = `Series: ${concept.title}`;
  const playHypothesis = [
    concept.premise,
    concept.format ? `Format: ${concept.format}.` : '',
    concept.cadence ? `Cadence: ${concept.cadence}.` : '',
    concept.episode_count ? `${concept.episode_count} episodes planned.` : '',
  ].filter(Boolean).join(' ');

  const addResult = await addActivePlay(concept.client_id, {
    name: playName,
    hypothesis: playHypothesis,
    started_at: new Date().toISOString().slice(0, 10),
    status: 'in_flight',
    notes: `Greenlit from series concept. Rationale: ${concept.rationale || '(no rationale captured)'}`,
    evidence: `concept:${concept.id}`,
  });

  if (!addResult.ok) return { ok: false, error: addResult.error || 'failed to create play' };
  // Find the newly-added play id (last entry of the rewritten array).
  const newPlay = (addResult.plays || []).slice(-1)[0];
  const playId = newPlay?.id || null;

  const { error } = await supabase
    .from('client_series_concepts')
    .update({
      status: 'greenlit',
      greenlit_at: new Date().toISOString(),
      active_play_id: playId,
    })
    .eq('id', conceptId);
  if (error) return { ok: false, error: error.message };

  return { ok: true, conceptId, playId };
}

/**
 * Unwind a greenlight: move the spine play to "paused" and revert the
 * concept to concept status. We don't delete the play — it remains in
 * the spine's active_plays as historical record.
 */
export async function ungreenlightConcept(conceptId) {
  if (!supabase || !conceptId) return { ok: false, error: 'missing' };
  const concept = await getConcept(conceptId);
  if (!concept) return { ok: false, error: 'not found' };
  if (concept.active_play_id) {
    await updateActivePlay(concept.client_id, concept.active_play_id, { status: 'paused' });
  }
  const { error } = await supabase
    .from('client_series_concepts')
    .update({ status: 'concept', greenlit_at: null })
    .eq('id', conceptId);
  return { ok: !error, error: error?.message };
}

export default {
  listConcepts,
  getConcept,
  generateConcepts,
  addUserConcept,
  exploreConcept,
  shelveConcept,
  restoreConcept,
  concludeConcept,
  deleteConcept,
  greenlightConcept,
  ungreenlightConcept,
  STATUS_LABELS,
};
