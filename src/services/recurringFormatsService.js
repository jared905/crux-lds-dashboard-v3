/**
 * recurringFormatsService — generate recurring creative-execution
 * format opportunities from audience persona + pillars + cohort.
 *
 * The 2026-06-09 reframe from migration 101: "series" (serialized
 * episodes) is the wrong concept. The right concept is recurring
 * creative-execution patterns — podcast format, talking-head
 * explainer, expert interview, react/response, tutorial, etc. — that
 * the audience comes to recognize and expect, where each entry stands
 * alone for discoverability.
 *
 * Model:
 *   Pillars (topics) × Recurring formats (creative executions)
 *     → Individual concept seeds (specific videos)
 *
 * This service produces format opportunities: 2-4 production-pattern
 * recommendations grounded in persona evidence, each with an honest
 * counter_argument so strategists see when a format is the wrong
 * choice instead of defaulting to a format that sounds good.
 */

import { supabase } from './supabaseClient';
import claudeAPI from './claudeAPI';
import { getCohortComposition } from './cohortRolesService';

export const FORMATS_PROMPT_VERSION = 'v1-recurring-formats';
const DEFAULT_MODEL = 'claude-sonnet-4-5';

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * Generate a batch of recurring format opportunities for the client.
 *
 * @param {Object} args
 * @param {string} args.clientId
 * @param {string} [args.clientName]
 * @param {number} [args.targetCount=3]  — typical 2-4 recommendations
 * @returns {Promise<{ ok, formats, batchId, error? }>}
 */
export async function generateRecurringFormats({ clientId, clientName = null, targetCount = 3 }) {
  if (!clientId) return { ok: false, error: 'clientId required' };

  const [spine, clientChannel, pillars, cohortComp] = await Promise.all([
    loadSpine(clientId),
    loadClientChannel(clientId),
    loadPillars(clientId),
    getCohortComposition(clientId).catch(() => null),
  ]);

  if (!spine?.audience_persona) {
    return { ok: false, error: 'No audience persona on the Spine. Synthesize it first at Strategy → Audience.' };
  }

  const userPrompt = buildUserPrompt({
    clientName:  clientName || clientChannel?.name || 'this client',
    spine,
    pillars,
    cohortComp,
    targetCount,
    isPrelaunch: !!clientChannel?.is_prelaunch,
  });

  try {
    const result = await claudeAPI.call(
      userPrompt,
      SYSTEM_PROMPT,
      'recurring_formats_generation',
      3000,
    );
    const raw = (result?.text || '').trim();
    if (!raw) return { ok: false, error: 'LLM returned empty response' };

    const parsed = parseFormatsResponse(raw);
    if (!parsed || !Array.isArray(parsed.formats)) {
      return { ok: false, error: 'Could not parse formats response', rawResponse: raw };
    }

    const batchId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : null;

    const rows = parsed.formats.map((f, i) => ({
      client_id:                 clientId,
      source:                    'audience_persona',
      generation_batch_id:       batchId,
      name:                      f.name || 'Untitled format',
      creative_execution:        f.creative_execution || 'other',
      creative_execution_label:  f.creative_execution_label || null,
      cadence:                   f.cadence || 'monthly',
      persona_rationale:         f.persona_rationale || 'No rationale provided.',
      pillar_id:                 resolvePillarId(f.pillar_name, pillars),
      pillar_label:              f.pillar_name || null,
      estimated_episode_length:  f.estimated_episode_length || null,
      production_complexity:     f.production_complexity || 'medium',
      production_notes:          f.production_notes || null,
      counter_argument:          f.counter_argument || null,
      format_position:           f.format_position || i + 1,
      status:                    'draft',
    }));

    const { data: saved, error: insertErr } = await supabase
      .from('client_recurring_formats')
      .insert(rows)
      .select('*');

    if (insertErr) {
      console.warn('[recurringFormats] insert failed:', insertErr);
      return { ok: false, error: insertErr.message };
    }

    return { ok: true, formats: saved || [], batchId, promptVersion: FORMATS_PROMPT_VERSION };
  } catch (err) {
    console.warn('[recurringFormats] generation failed:', err);
    return { ok: false, error: err?.message || 'unknown error' };
  }
}

/**
 * List recurring formats for a client.
 */
export async function listRecurringFormats(clientId, { status = null } = {}) {
  if (!supabase || !clientId) return [];
  let q = supabase
    .from('client_recurring_formats')
    .select('*')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('format_position', { ascending: true });
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return data || [];
}

/**
 * Update a recurring format (e.g., promote to 'active' or 'piloting').
 */
export async function updateRecurringFormat(formatId, patch) {
  if (!supabase || !formatId) return { ok: false, error: 'invalid args' };
  const { error } = await supabase
    .from('client_recurring_formats')
    .update(patch)
    .eq('id', formatId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Archive (soft delete) a recurring format.
 */
export async function archiveRecurringFormat(formatId, reason = null) {
  return updateRecurringFormat(formatId, {
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
    .select('id, name, subscriber_count, is_prelaunch')
    .eq('id', clientId)
    .maybeSingle();
  return data || null;
}

async function loadPillars(clientId) {
  const { data } = await supabase
    .from('client_pillars')
    .select('id, title, creative_description, intended_audience, format')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('sort_order');
  return data || [];
}

function resolvePillarId(pillarName, pillars) {
  if (!pillarName || !pillars?.length) return null;
  const match = pillars.find(p => p.title?.toLowerCase() === pillarName.toLowerCase());
  return match?.id || null;
}

// ──────────────────────────────────────────────────
// Prompt
// ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior YouTube strategist proposing RECURRING CREATIVE-EXECUTION FORMATS that could anchor a client's content production. These are production patterns — podcast format, talking-head expert breakdown, weekly interview, react/response, tutorial, etc. — that the audience comes to recognize and expect, where each entry stands alone for discoverability.

CRITICAL DISTINCTION:
  - You are NOT proposing serialized episodes (Ep. 1, Ep. 2, Ep. 3 with narrative continuity).
  - You ARE proposing reusable production templates: a creative pattern the client can run weekly/monthly/quarterly, where every entry is standalone but shares creative DNA.

OUTPUT FORMAT: Return ONLY valid JSON — no prose, no markdown fences, no preamble. Schema:

{
  "formats": [
    {
      "name":                       "the format's name as a strategist would label it (e.g., 'Weekly CMO Conversation', 'The Pearl 27 Briefing')",
      "creative_execution":         "podcast | talking_head | interview | expert_breakdown | react_response | tutorial | case_study | live_briefing | roundtable | document_review | other",
      "creative_execution_label":   "free text label IF creative_execution is 'other'; null otherwise",
      "cadence":                    "weekly | biweekly | monthly | quarterly | ad_hoc",
      "estimated_episode_length":   "human-readable duration: '8-12 min', '30-45 min', '60-90 sec'",
      "production_complexity":      "low | medium | high",
      "production_notes":           "what the producer needs to operationalize this (guest acquisition, scripting, etc.)",
      "pillar_name":                "name of the client pillar this format primarily anchors (must match a provided pillar title exactly, or null)",
      "persona_rationale":          "WHY this format fits THIS audience — cite specific persona evidence (questions_asked, voice_patterns, trust_signals). Concrete, not generic.",
      "counter_argument":           "WHEN this format would be the WRONG choice. What organizational / production / audience constraint could make it fail or be wasteful? Be candid — surface the real trade-off.",
      "format_position":            1
    }
  ]
}

GENERATION RULES:

1. Match the audience persona's CONSUMPTION PATTERNS:
   - Point-of-need / single-question audiences (executives, decision-makers) → favor self-contained explainer / talking-head / expert breakdown formats. Each entry must answer a specific question fully.
   - Curriculum-seeking / learning audiences (early-career professionals, hobbyists building skill) → favor tutorial / case study / interview formats where viewers WANT to watch many entries.
   - Trust-sensitive / consultative audiences → favor formats that demonstrate expertise (document review, expert breakdown, case study) over personality-driven formats.
   - Story-seeking / emotional resonance audiences → favor interview, react/response, roundtable formats.

2. Respect the BRAND REGISTER from the Spine voice_tone and editorial_pov. A trust-sensitive register rejects react-format hot takes and personality-led content. A casual register may reject document_review as too dry. The format must match the voice.

3. PRODUCTION COMPLEXITY matters. A solo strategist client cannot run a weekly podcast with rotating guests sustainably. Flag complexity honestly (low / medium / high) and note in production_notes what's needed (guest acquisition, equipment, post-production).

4. PILLAR ALIGNMENT: when client_pillars are provided, anchor each format to ONE pillar by name. Don't fragment formats across pillars — the format should be the production pattern that serves a pillar.

5. COUNTER_ARGUMENT IS MANDATORY. Every format must include the honest case AGAINST itself. What would make this format fail or be wasteful? Specific constraints: production overhead, audience-fit risk, brand-register conflict, sustainability. If you cannot articulate the counter, the format probably isn't right.

6. NO HYPE LANGUAGE: leverage, unlock, robust, innovative, compelling, drives, taps into, resonates with, powerful, game-changer, cutting-edge.

7. PRE-LAUNCH CLIENTS: favor LOW-COMPLEXITY formats they can sustain solo while building audience. A weekly multi-guest podcast is wrong for a pre-launch solo founder; a monthly solo expert breakdown is more realistic.

8. Generate the requested target_count, no more, no less. Each format must be MEANINGFULLY DIFFERENT — three variations of "talking head" isn't three formats, it's one.`;

function buildUserPrompt({ clientName, spine, pillars, cohortComp, targetCount, isPrelaunch }) {
  const lines = [];
  lines.push(`CLIENT: ${clientName}`);
  if (isPrelaunch) lines.push('STATUS: pre-launch (no existing videos, no returning audience)');
  lines.push(`TARGET COUNT: generate ${targetCount} recurring format opportunities`);
  lines.push('');

  // Persona is the core input
  const persona = spine.audience_persona;
  if (persona) {
    lines.push('AUDIENCE PERSONA (the source signal — pull verbatim from these):');
    if (persona.questions_asked?.length) {
      lines.push('Questions asked (literal audience queries — indicates point-of-need vs. curriculum-seeking):');
      persona.questions_asked.forEach(q => lines.push(`  - "${q}"`));
    }
    if (persona.motivations?.length) {
      lines.push('Motivations (what they seek):');
      persona.motivations.forEach(m => lines.push(`  - ${m}`));
    }
    if (persona.voice_patterns?.length) {
      lines.push('Voice patterns (how they talk; format must match this register):');
      persona.voice_patterns.forEach(v => lines.push(`  - ${v}`));
    }
    if (persona.trust_signals?.length) {
      lines.push('Trust signals (what builds credibility):');
      persona.trust_signals.forEach(t => lines.push(`  - ${t}`));
    }
    lines.push('');
  }

  // Spine — for brand register
  if (spine.voice_tone)            lines.push(`SPINE voice + tone: ${spine.voice_tone}`);
  if (spine.editorial_pov)         lines.push(`SPINE editorial POV: ${spine.editorial_pov}`);
  if (spine.competitive_posture)   lines.push(`SPINE competitive posture: ${spine.competitive_posture}`);
  if (spine.guardrails)            lines.push(`SPINE guardrails (do NOT recommend): ${spine.guardrails}`);
  lines.push('');

  // Pillars — to anchor formats
  if (pillars?.length) {
    lines.push('CLIENT PILLARS (anchor each format to ONE pillar by name):');
    pillars.forEach((p, i) => {
      lines.push(`  ${i + 1}. "${p.title}"${p.format ? ` [${p.format}]` : ''}`);
      if (p.creative_description) lines.push(`     ${p.creative_description}`);
    });
    lines.push('');
  }

  // Cohort composition for sanity-check
  if (cohortComp) {
    lines.push(`COHORT: ${cohortComp.peer} peer / ${cohortComp.aspirational} aspirational / ${cohortComp.reference} reference channels.`);
    lines.push('');
  }

  lines.push(`Generate the JSON now. ${targetCount} recurring formats. Each MUST include a candid counter_argument. Match production complexity to client's realistic capacity (especially if pre-launch / solo).`);
  return lines.join('\n');
}

function parseFormatsResponse(raw) {
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
  generateRecurringFormats,
  listRecurringFormats,
  updateRecurringFormat,
  archiveRecurringFormat,
  FORMATS_PROMPT_VERSION,
};
