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
import { computeClientDiagnostic } from './clientDiagnosticService';
import { getActiveDemandSignals, formatDemandSignalsForPrompt } from './demandSignalService';
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
// Cohort evidence — the analytical signal block we inject so series
// generation isn't groundless. Reuses computeClientDiagnostic so the
// cohort numbers match what shows up in the audit pack briefing.
// ──────────────────────────────────────────────────

/**
 * Build a structured cohort evidence block for a client.
 * Pulls pinned competitor ids → runs computeClientDiagnostic →
 * formats the output for prompt injection.
 *
 * Skews toward DIVERGENT signal (structural gaps) over pattern
 * amplification, so Claude has more incentive to propose novelty.
 *
 * Returns '' when the client has no pinned cohort or the diagnostic
 * fails — safe to concatenate unconditionally.
 */
export async function buildCohortContext(clientId, { windowDays = 90 } = {}) {
  if (!supabase || !clientId) return '';

  // Pinned competitor ids
  const { data: junctions } = await supabase
    .from('client_channels')
    .select('channel_id')
    .eq('client_id', clientId);
  const scopeChannelIds = (junctions || []).map(j => j.channel_id);
  if (!scopeChannelIds.length) return '';

  let diagnostic = null;
  try {
    diagnostic = await computeClientDiagnostic({ clientId, scopeChannelIds, windowDays });
  } catch (e) {
    console.warn('[seriesIdeation] diagnostic failed:', e);
    return '';
  }
  if (!diagnostic) return '';

  const { client, workingPatterns = [], workingBuckets = [], workingSlots = [], gaps = [], archetypeBreakdown, peerStats } = diagnostic;

  // Only cite [STATISTICAL] findings as cohort patterns; [DIRECTIONAL]
  // findings get a softer mention so Claude doesn't over-anchor on
  // small-sample wins.
  const stat = (items, kind) => items.filter(p => p.confidence === 'statistical').slice(0, 5);
  const dir = (items, kind) => items.filter(p => p.confidence === 'directional').slice(0, 3);

  const sections = [];

  // Working patterns
  const patternsStat = stat(workingPatterns);
  const patternsDir = dir(workingPatterns);
  if (patternsStat.length || patternsDir.length) {
    const lines = [
      ...patternsStat.map(p => `- ${p.label}: ${(p.freq * 100).toFixed(0)}% of cohort, ${((p.lift - 1) * 100).toFixed(0)}% more views than cohort median (n=${p.count}) [STATISTICAL]`),
      ...patternsDir.map(p => `- ${p.label}: ${(p.freq * 100).toFixed(0)}% of cohort, ${((p.lift - 1) * 100).toFixed(0)}% more views (n=${p.count}) [DIRECTIONAL — small sample]`),
    ];
    sections.push(`COHORT WORKING PATTERNS (use as evidence, not templates to clone):\n${lines.join('\n')}`);
  }

  // Length buckets
  const bucketsStat = stat(workingBuckets);
  if (bucketsStat.length) {
    const lines = bucketsStat.map(b => `- ${b.label}: ${(b.freq * 100).toFixed(0)}% of cohort, ${((b.lift - 1) * 100).toFixed(0)}% more views (n=${b.count}) [STATISTICAL]`);
    sections.push(`LENGTH BANDS THAT WORK IN COHORT:\n${lines.join('\n')}`);
  }

  // Time-of-day
  const slotsStat = stat(workingSlots);
  if (slotsStat.length) {
    const lines = slotsStat.slice(0, 3).map(s => `- ${s.slot} (MT): ${((s.lift - 1) * 100).toFixed(0)}% more views (n=${s.count}) [STATISTICAL]`);
    sections.push(`UPLOAD SLOTS THAT WORK IN COHORT:\n${lines.join('\n')}`);
  }

  // Structural gaps — the anti-echo lever. Highest-leverage divergent
  // signal in the dataset because gaps point AT what's absent, not what
  // already exists.
  if (gaps.length) {
    const lines = gaps.slice(0, 6).map(g =>
      `- ${g.label}: cohort uses ${(g.cohortFreq * 100).toFixed(0)}%, ${client.name} uses ${(g.clientFreq * 100).toFixed(0)}% (${g.freqRatio.toFixed(1)}× under)`
    );
    sections.push(`STRUCTURAL GAPS — ${client.name} is materially UNDER-using these patterns vs. cohort. Highest-leverage signal for divergent series ideas:\n${lines.join('\n')}`);
  }

  // Archetype context — peer baselines, not whole cohort
  const segments = archetypeBreakdown?.segments || [];
  if (segments.length > 1 && client.archetypeLabel) {
    const lines = segments
      .slice(0, 4)
      .map(a => `- ${a.label}: ${a.channelCount} channels, median engagement ${a.medianEngagement != null ? (a.medianEngagement * 100).toFixed(1) + '%' : 'n/a'}, top patterns: ${(a.patterns || []).slice(0, 2).map(p => `${p.label} (+${Math.round((p.lift - 1) * 100)}%)`).join(', ') || '—'}`);
    sections.push(`ARCHETYPE PEERS — ${client.name} is tagged as **${client.archetypeLabel}**. Ground recommendations in this archetype's peers, not whole-cohort averages:\n${lines.join('\n')}`);
  }

  // Peer stats summary if archetype data is present
  if (peerStats?.engagement?.median != null && client.archetypeLabel) {
    sections.push(`${client.archetypeLabel} peer median engagement: ${(peerStats.engagement.median * 100).toFixed(1)}%. Series concepts should benchmark against this, not the whole-cohort median.`);
  }

  if (!sections.length) return '';

  return `COHORT EVIDENCE (last ${windowDays} days, ${scopeChannelIds.length} pinned competitor channels):\n\n${sections.join('\n\n')}\n\n---\n\n`;
}

// ──────────────────────────────────────────────────
// Generate (AI-led)
// ──────────────────────────────────────────────────

/**
 * Generate N fresh series concepts for a client. Uses spine context so
 * the output respects stance, audience read, and guardrails. Persists
 * each concept individually so partial success is still useful.
 */
export async function generateConcepts(clientId, { clientName, count = 5, cohortSummary } = {}) {
  if (!clientId) return { ok: false, error: 'missing clientId', concepts: [] };

  // Strategist's authored narrative (positioning, audience, stance, plays, guardrails)
  const spineContext = await buildSpineContext(clientId, { clientName });

  // Analytical signal — gaps, patterns, archetype peers. Skip if caller
  // pre-supplied a custom summary (e.g. for testing) by passing a string.
  const cohortBlock = typeof cohortSummary === 'string'
    ? cohortSummary
    : await buildCohortContext(clientId);

  // Audience demand signals — pure anti-echo, mined from the client's
  // own comment threads. Read-only here; refresh is a separate action.
  let demandBlock = '';
  let hasDemandSignals = false;
  try {
    const demandRow = await getActiveDemandSignals(clientId);
    demandBlock = formatDemandSignalsForPrompt(demandRow, { clientName });
    hasDemandSignals = !!demandBlock;
  } catch (e) {
    console.warn('[seriesIdeation] demand signals fetch failed:', e);
  }

  // Calculate how many concepts should fill gaps vs. amplify patterns.
  // Anti-echo: ~40% of concepts must explore divergent ground.
  const gapMin = Math.max(2, Math.floor(count * 0.4));

  const prompt = `Generate ${count} distinct YouTube series concepts for ${clientName || 'this client'}. Each concept should be a series the strategist could plausibly run for the next 6–12 weeks.

${cohortBlock || ''}${demandBlock || ''}REQUIRED SHAPE — return a JSON array. Each element must have:
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
  "rationale": "string — 2-3 sentences. Cite specific cohort evidence when relevant (e.g. 'fills the why-title structural gap — cohort uses why-titles 24%, client only 8%'). Also cite spine fields when relevant ('aligns with Q2 stance', 'respects guardrail against X'). Be specific; vague rationale is unusable."
}

CRITICAL RULES:
- **ANTI-ECHO — read carefully.** At least **${gapMin} of ${count}** concepts MUST explore a STRUCTURAL GAP from the cohort evidence above — a pattern the cohort uses that this client does not. These are the divergent bets where the strategist gets leverage. Do NOT generate ${count} concepts that all amplify what's already working — that's pattern cloning, not strategy.
${hasDemandSignals ? `- **DEMAND ANCHORING — read carefully.** At least **1 of ${count}** concepts MUST address an UNSERVED REQUEST or RECURRING THEME from the audience demand signals above. This is the audience telling us what they want; ignoring that signal would be malpractice. Cite the specific demand item in the concept's rationale.` : ''}
- Use cohort working patterns as EVIDENCE FOR HOW (format, length band, slot, archetype) — not as topic templates to clone. If the cohort wins with why-titles, your series can use why-framing for episodes; don't copy specific competitor topics.
- **Concluded-lost plays in the spine (if any) MUST NOT be re-recommended** as variants. If the spine says a play concluded lost, that ground is dead unless the strategist explicitly revisits.
- If GUARDRAILS are provided in the strategic context, do not produce a series that violates them. Hard constraint.
- If the CURRENT STRATEGIC STANCE points at a specific format/rhythm, at least ${Math.max(2, Math.floor(count * 0.4))} concepts should lean into it (but not exclusively — the gap-filling concepts above may diverge from stated stance to challenge it).
- Each series must be distinct in PROMISE, not just topic. Don't return five tutorials with different subjects.
- Episodes are one-liners — title + 1-sentence hook. Don't deep-develop.

Return ONLY the JSON array. No prose.`;

  const baseSystem = `You generate distinct YouTube series concepts for a strategist. Each concept is a strategic bet — a series the strategist could greenlight and run for 6-12 weeks. Respect any STRATEGIC CONTEXT and GUARDRAILS above as hard constraints. Treat COHORT EVIDENCE as ground truth — cite specific numbers in rationales when applicable. Anti-echo discipline: gap-filling concepts beat pattern-amplifying concepts. Return ONLY valid JSON.`;
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

  // Same evidence stack as generateConcepts — user seeds get fleshed out
  // with the spine + cohort gaps + demand signals so the resulting concept
  // is grounded, not just structurally completed.
  const spineContext = await buildSpineContext(clientId, { clientName });
  const cohortBlock = await buildCohortContext(clientId);
  let demandBlock = '';
  try {
    const demandRow = await getActiveDemandSignals(clientId);
    demandBlock = formatDemandSignalsForPrompt(demandRow, { clientName });
  } catch (e) {
    console.warn('[seriesIdeation] demand fetch in addUserConcept failed:', e);
  }
  const prompt = `A strategist provided this series seed for ${clientName || 'a client'}:

"${userSeed.trim()}"

${cohortBlock || ''}${demandBlock || ''}Flesh it into a complete series concept. Stay faithful to the strategists framing — do not rewrite their core idea. Add the structural fields they did not specify (format, cadence, episode list, rationale). If the seed already specifies any of these, preserve them verbatim.

Use the cohort evidence and demand signals above to inform STRUCTURE — format/length band/cadence based on what works in the cohort, episodes that lean into unserved demand when relevant — but do not pivot the seed's core idea.

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

  // Full evidence stack on deepening so episode hooks and rationale are
  // grounded in real signal — same wires as generateConcepts.
  const spineContext = await buildSpineContext(concept.client_id, { clientName });
  const cohortBlock = await buildCohortContext(concept.client_id);
  let demandBlock = '';
  try {
    const demandRow = await getActiveDemandSignals(concept.client_id);
    demandBlock = formatDemandSignalsForPrompt(demandRow, { clientName });
  } catch (e) {
    console.warn('[seriesIdeation] demand fetch in exploreConcept failed:', e);
  }

  const prompt = `Deepen this series concept. The strategist is considering it but hasn't greenlit it yet — your job is to give them enough texture to make the call.

${cohortBlock || ''}${demandBlock || ''}EXISTING CONCEPT:
Title: ${concept.title}
Premise: ${concept.premise}
Format: ${concept.format || '(unspecified)'}
Cadence: ${concept.cadence || '(unspecified)'}
Episode count: ${concept.episode_count || '(unspecified)'}
Episodes so far:
${(concept.episodes || []).map((e, i) => `  ${i + 1}. ${e.title}${e.hook ? ` — ${e.hook}` : ''}`).join('\n') || '(none yet)'}

When deepening:
- Use cohort evidence to refine format/length/cadence into something the data supports.
- If demand signals point at unserved topics relevant to this premise, fold them into episode hooks.
- The rationale section should now cite concrete numbers (cohort gaps, demand mentions, peer baselines) — vague rationale is unusable.

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
