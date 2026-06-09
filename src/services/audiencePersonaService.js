/**
 * audiencePersonaService — synthesize a structured audience persona
 * from existing client signals.
 *
 * The audience-understanding layer the 2026-06-09 product exploration
 * identified as the missing input. We've been scoring content against
 * cohort patterns without ever knowing the audience; this is the
 * synthesis pass that turns scattered audience signal into a single
 * structured object the rest of the system can consume.
 *
 * Inputs:
 *   - Strategy Spine (positioning, audience_read, voice_tone, editorial_pov)
 *   - Business context (target_market, products_offered, one_line_summary)
 *   - Client pillars (titles + intended_audience descriptions)
 *   - Surface intelligence search queries (the most direct audience-intent
 *     signal — what people actually typed into YouTube to find this channel)
 *
 * Output: a structured persona JSONB stored on
 * client_strategy_spine.audience_persona. Includes per-claim evidence
 * pointers so the strategist can see WHY each persona field reads the
 * way it does — defensible to the strategist and (with the eventual
 * deliverable export) the client.
 *
 * Downstream consumers (silently inherit once populated):
 *   - weeklyBriefService prompt — sharper audience-specific language
 *   - alternativeTitlesService — vocabulary matching
 *   - strategicReadService — pain-point alignment in gate verdicts
 *   - executiveMemoService — persona-grounded justification
 */

import { supabase } from './supabaseClient';
import claudeAPI from './claudeAPI';

export const PERSONA_PROMPT_VERSION = 'v1-persona-synthesis';

// ──────────────────────────────────────────────────
// Public entry: synthesize + save
// ──────────────────────────────────────────────────

/**
 * Pull all relevant signals for the client, synthesize a structured
 * persona via Claude, and save to client_strategy_spine.audience_persona.
 *
 * Returns the synthesized persona + the source-signal counts so the
 * UI can show what fed the synthesis ("derived from 47 search queries,
 * 3 pillars, business context").
 */
export async function synthesizeAudiencePersona({ clientId, clientName = null }) {
  if (!clientId) return { ok: false, error: 'clientId required' };

  // 1) Pull all source signals in parallel.
  const [spine, businessContext, pillars, searchQueries, clientChannel] = await Promise.all([
    loadSpine(clientId),
    loadActiveBusinessContext(clientId),
    loadPillars(clientId),
    loadSearchQueries(clientId),
    loadClientChannel(clientId),
  ]);

  const signalCounts = {
    has_spine:           !!spine,
    has_business_context: !!businessContext,
    pillar_count:        (pillars || []).length,
    search_query_count:  (searchQueries || []).length,
    branded_query_count: (searchQueries || []).filter(q => q.is_branded).length,
  };

  // 2) Bail early if we don't have ENOUGH signal to be useful. A
  // persona built from no inputs would just be LLM imagination.
  const hasMeaningfulInput = !!spine?.audience_read?.trim()
    || !!businessContext?.target_market?.trim()
    || (pillars || []).length > 0
    || (searchQueries || []).length >= 5;
  if (!hasMeaningfulInput) {
    return {
      ok: false,
      error: 'Not enough audience signal to synthesize. Fill out audience_read in Spine, business context target_market, or pull surface intelligence first.',
      signalCounts,
    };
  }

  // 3) Build user prompt + call Claude.
  try {
    const userPrompt = buildUserPrompt({
      clientName:    clientName || clientChannel?.name || 'this client',
      spine,
      businessContext,
      pillars,
      searchQueries,
    });
    const result = await claudeAPI.call(
      userPrompt,
      SYSTEM_PROMPT,
      'audience_persona_synthesis',
      3000,
    );
    const raw = (result?.text || '').trim();
    if (!raw) {
      return { ok: false, error: 'Claude returned empty response', signalCounts };
    }
    const persona = parsePersona(raw);
    if (!persona) {
      return { ok: false, error: 'Could not parse persona JSON', rawResponse: raw, signalCounts };
    }

    // 4) Save to Spine.
    const saved = await saveAudiencePersona(clientId, persona);
    if (!saved.ok) return { ok: false, error: saved.error, signalCounts };

    return { ok: true, persona, signalCounts, promptVersion: PERSONA_PROMPT_VERSION };
  } catch (err) {
    console.warn('[audiencePersona] synthesis failed:', err);
    return { ok: false, error: err?.message || 'unknown error', signalCounts };
  }
}

/**
 * Save a persona (synthesized OR strategist-edited) to the Spine.
 * Strategist edits don't bump audience_persona_synthesized_at — only
 * fresh syntheses do (separate updateAudiencePersonaInline below).
 */
export async function saveAudiencePersona(clientId, persona) {
  if (!supabase || !clientId) return { ok: false, error: 'invalid args' };
  const { error } = await supabase
    .from('client_strategy_spine')
    .upsert({
      client_id:                       clientId,
      audience_persona:                persona,
      audience_persona_synthesized_at: new Date().toISOString(),
      audience_persona_prompt_version: PERSONA_PROMPT_VERSION,
    }, { onConflict: 'client_id' });
  if (error) {
    console.warn('[audiencePersona] save failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Strategist edited a single field of the persona inline. Does NOT
 * bump the synthesized_at timestamp — the persona is no longer purely
 * synthesized; it's strategist-refined.
 */
export async function updateAudiencePersonaInline(clientId, persona) {
  if (!supabase || !clientId) return { ok: false, error: 'invalid args' };
  const { error } = await supabase
    .from('client_strategy_spine')
    .update({ audience_persona: persona })
    .eq('client_id', clientId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Pure read helper used by downstream LLM services to inherit the
 * persona without re-implementing the spine fetch.
 */
export async function loadAudiencePersona(clientId) {
  if (!supabase || !clientId) return null;
  const { data } = await supabase
    .from('client_strategy_spine')
    .select('audience_persona, audience_persona_synthesized_at, audience_persona_prompt_version')
    .eq('client_id', clientId)
    .maybeSingle();
  return data?.audience_persona || null;
}

// ──────────────────────────────────────────────────
// Source-signal loaders
// ──────────────────────────────────────────────────

async function loadSpine(clientId) {
  const { data } = await supabase
    .from('client_strategy_spine')
    .select('positioning_hypothesis, positioning_oneliner, audience_read, voice_tone, editorial_pov, competitive_posture, guardrails')
    .eq('client_id', clientId)
    .maybeSingle();
  return data || null;
}

async function loadActiveBusinessContext(clientId) {
  const { data } = await supabase
    .from('client_business_context')
    .select('products_offered, products_not_offered, target_market, one_line_summary')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();
  return data || null;
}

async function loadPillars(clientId) {
  const { data } = await supabase
    .from('client_pillars')
    .select('title, creative_description, intended_audience, format')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('sort_order');
  return data || [];
}

async function loadSearchQueries(clientId) {
  // Pull the most recent batch of search queries. Order by views desc
  // so the LLM sees the queries that actually drive traffic first.
  const { data } = await supabase
    .from('client_search_queries')
    .select('query, views, is_branded, captured_at')
    .eq('client_id', clientId)
    .order('captured_at', { ascending: false })
    .order('views', { ascending: false })
    .limit(80);
  return data || [];
}

async function loadClientChannel(clientId) {
  const { data } = await supabase
    .from('channels')
    .select('name, subscriber_count')
    .eq('id', clientId)
    .maybeSingle();
  return data || null;
}

// ──────────────────────────────────────────────────
// Prompt
// ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior YouTube strategist synthesizing a structured audience persona from the signals provided. The persona will be consumed silently by downstream LLM calls (brief generator, alternative title generator, strategic-read, executive memo) — so it must be precise, evidenced, and actionable, not vague generalities.

OUTPUT FORMAT: Return ONLY valid JSON — no prose, no markdown fences, no preamble. Schema:

{
  "pain_points":         ["specific anxiety / decision / frustration the audience faces"],
  "motivations":         ["what they're actively seeking from this kind of content"],
  "questions_asked":     ["recurring questions in their own words — pulled from search queries when possible"],
  "voice_patterns":      ["how they talk about your space — formality, vocabulary, register cues"],
  "trust_signals":       ["what makes them trust a creator in this space — credentials, evidence, tone"],
  "adjacent_interests":  ["what else they're engaged with — related life topics, decision contexts"],
  "synthesis_sources":   ["list of which input signals fed this synthesis: 'spine.audience_read', 'business_context.target_market', 'pillars', 'search_queries'"],
  "evidence": {
    "pain_points":     [{ "claim": "...", "source": "search_query|spine|pillars|business_context", "value": "the specific input that backed this" }],
    "questions_asked": [{ "claim": "...", "source": "...", "value": "..." }],
    "voice_patterns":  [{ "claim": "...", "source": "...", "value": "..." }]
  }
}

EXTRACTION RULES:
- Be specific. "People worried about retirement" is generic and useless. "Pre-retirees specifically anxious about Roth conversion timing in a high-tax-bracket year" is the kind of specificity downstream prompts need.
- Search queries are the gold input. If you see "should I do roth conversions before retirement" repeated, that IS the pain point and IS a question_asked. Use the audience's actual words.
- For voice_patterns: note whether the audience uses precise/quantitative language or emotional/anecdotal language. Note formality level. Note whether they use industry jargon comfortably or want it explained.
- For trust_signals: infer from search query intent and Spine voice/POV. A trust-sensitive audience (finance/legal/medical) will look for credentials, math, citations. A creator-curious audience will look for relatability and "I tried this myself."
- The 'evidence' object MUST cite specific input values. Don't fabricate citations — if a claim doesn't have backing evidence in the input, mark its evidence entry with source: 'inferred' and value: explaining the inference.
- Pull 4-7 items per list field. More than 7 dilutes; fewer than 4 thins out the persona.
- NO HYPE WORDS: leverage, unlock, robust, innovative, compelling, drives, taps into, resonates with.

TONE: match what the inputs reveal about the brand register. If the source signals indicate trust-sensitive (finance/legal/medical/professional services), the persona output uses precise, quantitative language. If casual creator-style, the persona language stays warmer.

If a signal is missing (no business_context, no pillars, etc.), DO NOT invent placeholder content — return shorter lists. The strategist sees the synthesis_sources list and can tell what fed it.`;

function buildUserPrompt({ clientName, spine, businessContext, pillars, searchQueries }) {
  const lines = [];
  lines.push(`CLIENT: ${clientName}`);
  lines.push('');

  // Spine signals
  if (spine) {
    lines.push('STRATEGY SPINE (strategist declarations):');
    if (spine.positioning_oneliner)  lines.push(`- Positioning: ${spine.positioning_oneliner}`);
    if (spine.audience_read)         lines.push(`- Declared audience read: ${spine.audience_read}`);
    if (spine.editorial_pov)         lines.push(`- Editorial POV: ${spine.editorial_pov}`);
    if (spine.voice_tone)            lines.push(`- Voice + tone: ${spine.voice_tone}`);
    if (spine.competitive_posture)   lines.push(`- Competitive posture: ${spine.competitive_posture}`);
    lines.push('');
  }

  // Business context
  if (businessContext) {
    lines.push('BUSINESS CONTEXT:');
    if (businessContext.one_line_summary)  lines.push(`- ${businessContext.one_line_summary}`);
    if (businessContext.target_market)     lines.push(`- Target market: ${businessContext.target_market}`);
    if (businessContext.products_offered)  lines.push(`- Sells: ${businessContext.products_offered}`);
    if (businessContext.products_not_offered) lines.push(`- Does NOT sell: ${businessContext.products_not_offered}`);
    lines.push('');
  }

  // Pillars
  if (pillars?.length) {
    lines.push('CONTENT PILLARS:');
    pillars.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.title}${p.format ? ` (${p.format})` : ''}`);
      if (p.creative_description) lines.push(`     Description: ${p.creative_description}`);
      if (p.intended_audience)    lines.push(`     Intended audience: ${p.intended_audience}`);
    });
    lines.push('');
  }

  // Search queries — the most direct audience-intent signal
  if (searchQueries?.length) {
    lines.push(`SEARCH QUERIES (top ${searchQueries.length} queries that drove traffic to this channel — what the audience actually typed into YouTube; weighted by view count):`);
    // Sort by views desc and show top 50
    const sorted = [...searchQueries].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 50);
    sorted.forEach(q => {
      const brandedTag = q.is_branded ? ' [branded]' : '';
      lines.push(`- "${q.query}" — ${q.views || 0} views${brandedTag}`);
    });
    lines.push('');
    lines.push('NOTE: Branded queries are people searching for the client by name — these reveal repeat-viewer / returning-audience patterns. Non-branded queries reveal discovery-side audience intent. Use both, but pull pain_points and questions_asked primarily from non-branded queries.');
    lines.push('');
  }

  lines.push('Synthesize the structured audience persona JSON now. Return ONLY the JSON object.');
  return lines.join('\n');
}

// ──────────────────────────────────────────────────
// Parsing
// ──────────────────────────────────────────────────

function parsePersona(raw) {
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
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn('[audiencePersona] JSON parse failed:', err?.message);
    return null;
  }
}

export default {
  synthesizeAudiencePersona,
  saveAudiencePersona,
  updateAudiencePersonaInline,
  loadAudiencePersona,
  PERSONA_PROMPT_VERSION,
};
