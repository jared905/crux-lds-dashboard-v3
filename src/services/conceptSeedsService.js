/**
 * conceptSeedsService — generate individual concept ideas from the
 * audience persona.
 *
 * Converts the persona's questions_asked + pain_points into concrete
 * video concepts the strategist can score in Pre-flight. Each seed is
 * one specific video that may slot into a recurring format (see
 * recurringFormatsService) or stand alone.
 *
 * The 2026-06-09 reframe (migration 102) removed the
 * serialized-series logic. The right model is:
 *   Pillars × Recurring formats → individual concept seeds
 *
 * Recurring formats (creative-execution patterns) are generated
 * separately by recurringFormatsService. Seeds can be tagged with
 * recurring_format_id when they fit a format pattern, or remain
 * standalone.
 */

import { supabase } from './supabaseClient';
import claudeAPI from './claudeAPI';
import { getCohortComposition } from './cohortRolesService';

export const SEEDS_PROMPT_VERSION = 'v2-concept-seeds-no-series';
const DEFAULT_MODEL = 'claude-sonnet-4-5';

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * Generate a batch of concept seeds from the client's audience persona.
 *
 * @param {Object} args
 * @param {string} args.clientId
 * @param {string} [args.clientName]
 * @param {number} [args.targetCount=8]  — how many concepts to generate (4-12 reasonable range)
 * @returns {Promise<{ ok, seeds, batchId, error? }>}
 */
export async function generateConceptSeeds({ clientId, clientName = null, targetCount = 8 }) {
  if (!clientId) return { ok: false, error: 'clientId required' };

  // 1) Load required signals.
  const [spine, clientChannel, cohortComp] = await Promise.all([
    loadSpine(clientId),
    loadClientChannel(clientId),
    getCohortComposition(clientId).catch(() => null),
  ]);

  if (!spine?.audience_persona) {
    return {
      ok: false,
      error: 'No audience persona on the Spine. Synthesize the persona first at Strategy → Audience.',
    };
  }

  // 2) Build user prompt + call Claude.
  const userPrompt = buildUserPrompt({
    clientName:  clientName || clientChannel?.name || 'this client',
    spine,
    cohortComp,
    targetCount,
    isPrelaunch: !!clientChannel?.is_prelaunch,
  });

  try {
    const result = await claudeAPI.call(
      userPrompt,
      SYSTEM_PROMPT,
      'concept_seeds_generation',
      3500,
    );
    const raw = (result?.text || '').trim();
    if (!raw) return { ok: false, error: 'LLM returned empty response' };

    const parsed = parseConceptSeedsResponse(raw);
    if (!parsed || !Array.isArray(parsed.seeds)) {
      return { ok: false, error: 'Could not parse seeds response', rawResponse: raw };
    }

    // 3) Save batch.
    const batchId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : null;
    const insertRows = parsed.seeds.map(seed => ({
      client_id:               clientId,
      source:                  'audience_persona',
      generation_batch_id:     batchId,
      title:                   seed.title || '(untitled)',
      hook:                    seed.hook || null,
      outline:                 seed.outline || null,
      format_hint:             ['shorts','long_form','either'].includes(seed.format_hint) ? seed.format_hint : 'either',
      estimated_length_minutes: seed.estimated_length_minutes || null,
      addresses_persona_claim: seed.addresses_persona_claim || null,
      addresses_evidence:      seed.addresses_evidence || null,
      status:                  'draft',
    }));

    const { data: saved, error: insertErr } = await supabase
      .from('client_concept_seeds')
      .insert(insertRows)
      .select('*');

    if (insertErr) {
      console.warn('[conceptSeeds] insert failed:', insertErr);
      return { ok: false, error: insertErr.message };
    }

    return { ok: true, seeds: saved || [], batchId, promptVersion: SEEDS_PROMPT_VERSION };
  } catch (err) {
    console.warn('[conceptSeeds] generation failed:', err);
    return { ok: false, error: err?.message || 'unknown error' };
  }
}

/**
 * List concept seeds for a client.
 */
export async function listConceptSeeds(clientId, { status = null, limit = 50 } = {}) {
  if (!supabase || !clientId) return [];
  let q = supabase
    .from('client_concept_seeds')
    .select('*')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return data || [];
}

/**
 * Update a single seed (e.g., status, edit title/outline).
 */
export async function updateConceptSeed(seedId, patch) {
  if (!supabase || !seedId) return { ok: false, error: 'invalid args' };
  const { error } = await supabase
    .from('client_concept_seeds')
    .update(patch)
    .eq('id', seedId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Archive (soft delete) a seed.
 */
export async function archiveConceptSeed(seedId, reason = null) {
  return updateConceptSeed(seedId, {
    status: 'archived',
    archived_at: new Date().toISOString(),
    archived_reason: reason,
  });
}

// ──────────────────────────────────────────────────
// Loaders
// ──────────────────────────────────────────────────

async function loadSpine(clientId) {
  const { data } = await supabase
    .from('client_strategy_spine')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  return data || null;
}

async function loadClientChannel(clientId) {
  const { data } = await supabase
    .from('channels')
    .select('id, name, subscriber_count, total_view_count, is_prelaunch')
    .eq('id', clientId)
    .maybeSingle();
  return data || null;
}

// ──────────────────────────────────────────────────
// Prompt
// ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior YouTube strategist generating concrete video concepts from a client's audience persona. Each concept is a single video the producer could film — title, hook, outline. Strategist scores promising concepts in Pre-flight; this batch is the seed list.

OUTPUT FORMAT: Return ONLY valid JSON — no prose, no markdown fences, no preamble. Schema:

{
  "seeds": [
    {
      "title":                     "the actual video title — uses the audience's vocabulary, not industry jargon",
      "hook":                      "the 0-15s opening line that makes the viewer stay — concrete, specific, not generic",
      "outline":                   "3-5 sentence outline of what the video covers and what action it leaves the viewer with",
      "format_hint":               "shorts | long_form | either",
      "estimated_length_minutes":  null or a number (only for long_form when warranted),
      "addresses_persona_claim":   "field + specific claim from the persona this concept answers (e.g., 'questions_asked: How do I get my brand mentioned when customers ask ChatGPT')",
      "addresses_evidence":        { "field": "questions_asked" | "pain_points" | "motivations" | "trust_signals", "value": "the specific persona entry" }
    }
  ]
}

GENERATION RULES:

1. EVERY seed MUST address a specific persona claim. Pull from questions_asked first (those are literal audience queries), then pain_points, then motivations. Cite the specific persona entry in addresses_evidence.

2. Titles use the audience's actual vocabulary, NOT industry jargon. If the persona says the audience phrases things in business-strategy register, the title is in business-strategy register. If the persona has search-query data, USE THOSE QUERIES AS TITLES verbatim when possible — that's the highest-leverage discoverability move.

3. Hooks are concrete and specific, not generic ("In this video..." is a fail). Lead with the audience's actual pain or question, named directly.

4. Format hint: default to long_form for educational / consultative / strategic content. Default to shorts for emotional resonance, single-stat reveals, or platform-discoverability-only plays. "either" when the topic could work both ways and the strategist should choose.

5. Each seed is a STANDALONE video. Recurring creative-execution patterns (podcast format, talking-head explainer, expert interview series) are handled separately by the recurring formats generator. Do NOT propose narrative continuity or "Ep. 1, Ep. 2" sequencing.

6. AVOID hype words: leverage, unlock, robust, innovative, compelling, drives, taps into, resonates with, powerful, game-changer, cutting-edge, transformative, elevate.

7. BRAND REGISTER: every seed must respect the Spine's voice_tone and editorial_pov. Trust-sensitive registers (finance/legal/medical/professional services) reject hype language. Casual creator registers reject excessive precision/jargon. Match the register the persona reveals.

8. PRE-LAUNCH CONTEXT: if told the client is pre-launch, seeds are LAUNCH CONCEPTS — what the first 5-10 videos should establish. Anchor each to a persona claim AND a strategic positioning purpose (category-defining, trust-establishing, organizational-buy-in-enabling).

9. Generate the requested target_count, no more, no less.`;

function buildUserPrompt({ clientName, spine, cohortComp, targetCount, isPrelaunch }) {
  const lines = [];
  lines.push(`CLIENT: ${clientName}`);
  if (isPrelaunch) lines.push('STATUS: pre-launch (no existing videos)');
  lines.push(`TARGET COUNT: generate ${targetCount} concepts`);
  lines.push('');

  // Persona is the core input
  const persona = spine.audience_persona;
  if (persona) {
    lines.push('AUDIENCE PERSONA (the source signal — pull verbatim from these):');
    if (persona.questions_asked?.length) {
      lines.push('Questions asked (literal audience queries):');
      persona.questions_asked.forEach(q => lines.push(`  - "${q}"`));
    }
    if (persona.pain_points?.length) {
      lines.push('Pain points (specific anxieties):');
      persona.pain_points.forEach(p => lines.push(`  - ${p}`));
    }
    if (persona.motivations?.length) {
      lines.push('Motivations (what they seek):');
      persona.motivations.forEach(m => lines.push(`  - ${m}`));
    }
    if (persona.voice_patterns?.length) {
      lines.push('Voice patterns (how the audience talks; titles MUST match this register):');
      persona.voice_patterns.forEach(v => lines.push(`  - ${v}`));
    }
    if (persona.trust_signals?.length) {
      lines.push('Trust signals (what builds credibility for this audience):');
      persona.trust_signals.forEach(t => lines.push(`  - ${t}`));
    }
    lines.push('');
  }

  // Spine — for brand register + competitive posture
  if (spine.positioning_oneliner)  lines.push(`SPINE positioning: ${spine.positioning_oneliner}`);
  if (spine.voice_tone)            lines.push(`SPINE voice + tone: ${spine.voice_tone}`);
  if (spine.editorial_pov)         lines.push(`SPINE editorial POV: ${spine.editorial_pov}`);
  if (spine.competitive_posture)   lines.push(`SPINE competitive posture: ${spine.competitive_posture}`);
  if (spine.guardrails)            lines.push(`SPINE guardrails (do NOT recommend): ${spine.guardrails}`);
  lines.push('');

  // Cohort composition — for series-candidate evidence
  if (cohortComp) {
    lines.push('COHORT COMPOSITION (use as evidence for/against series-format candidates):');
    lines.push(`- Peer-tagged channels: ${cohortComp.peer}${cohortComp.peer_avg_subscribers ? ` (avg ${cohortComp.peer_avg_subscribers.toLocaleString()} subs)` : ''}`);
    lines.push(`- Aspirational: ${cohortComp.aspirational}${cohortComp.aspirational_avg_subscribers ? ` (avg ${cohortComp.aspirational_avg_subscribers.toLocaleString()} subs)` : ''}`);
    lines.push(`- Reference: ${cohortComp.reference}`);
    lines.push('');
  }

  lines.push(`Generate the JSON now. ${targetCount} standalone concept seeds. No series logic — recurring formats are produced by a separate generator.`);
  return lines.join('\n');
}

// ──────────────────────────────────────────────────
// Parsing
// ──────────────────────────────────────────────────

function parseConceptSeedsResponse(raw) {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/i, '').replace(/```\s*$/, '').trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace > 0 || lastBrace < cleaned.length - 1) {
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }
  try { return JSON.parse(cleaned); } catch { return null; }
}

export default {
  generateConceptSeeds,
  listConceptSeeds,
  updateConceptSeed,
  archiveConceptSeed,
  SEEDS_PROMPT_VERSION,
};
