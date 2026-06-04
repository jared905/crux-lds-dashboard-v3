/**
 * Alternative titles service — Phase 2.7c
 *
 * Generates 3–5 editorial title reframes that solve the diagnosed
 * weaknesses in the strategist's original title while staying inside
 * the channel's brand register (voice + editorial POV).
 *
 * Turns the scorer from a *diagnostic* tool into a *generative* one.
 * The deterministic scorer says "this title's curiosity gap is 3/10
 * and it carries no statistical title-pattern lift"; this service
 * follows that by proposing concrete reframes the strategist can pick
 * up — instead of telling them what's broken, it shows them better
 * titles that fix it.
 *
 * Runs in parallel with the strategic-read LLM pass, after the
 * deterministic score. Cached by (title, format, composite_tier,
 * voice-hash, prompt_version). Iterating on title variants pays for
 * a fresh call per variant; re-scoring the same variant is free.
 */

import { supabase } from './supabaseClient';

export const ALT_TITLES_PROMPT_VERSION = 'v1-alt-titles';

const CACHE_TTL_HOURS = 24 * 7;     // 1 week — short-ish; brand voice evolves
const CACHE_TABLE = 'competitor_intelligence_cache';

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * Generate alternative titles for a scored concept.
 *
 * @param {Object} args
 * @param {Object} args.input            concept input (title, format, target_surface, etc.)
 * @param {Object} args.scoringOutput    deterministic scoreConcept() output (we read scores + composite + tweaks)
 * @param {Object} [args.spine]          { editorial_pov, voice_tone }
 * @param {Object} [args.cohortSummary]  { clientName, channelCount, videoCount }
 * @returns {Promise<{ alternatives: Array<{title, addresses, rationale}>, promptVersion, cached }>}
 *   alternatives is [] when generation fails or the title is missing.
 */
export async function generateAlternativeTitles({
  input, scoringOutput, spine = null, cohortSummary = {},
}) {
  if (!input?.title || !scoringOutput) {
    return { alternatives: [], promptVersion: ALT_TITLES_PROMPT_VERSION, cached: false };
  }

  const cacheKey = buildCacheKey(input, scoringOutput, spine);
  const cached = await loadCache(cacheKey);
  if (cached) return { ...cached, cached: true };

  try {
    const claudeAPI = (await import('./claudeAPI')).default;
    const { parseClaudeJSON } = await import('../lib/parseClaudeJSON');
    const result = await claudeAPI.call(
      buildUserPrompt({ input, scoringOutput, spine, cohortSummary }),
      SYSTEM_PROMPT,
      'alternative_titles',
      900,
    );
    const parsed = parseClaudeJSON(result.text, { alternatives: [] });
    const alternatives = Array.isArray(parsed.alternatives)
      ? parsed.alternatives
          .filter(a => a && typeof a.title === 'string' && a.title.trim())
          .slice(0, 5)
          .map(a => ({
            title: a.title.trim(),
            addresses: (a.addresses || '').toString().trim(),
            rationale: (a.rationale || '').toString().trim(),
          }))
      : [];

    const payload = { alternatives, promptVersion: ALT_TITLES_PROMPT_VERSION };
    if (alternatives.length) await saveCache(cacheKey, payload);
    return { ...payload, cached: false };
  } catch (err) {
    console.warn('[altTitles] generation failed:', err);
    return { alternatives: [], promptVersion: ALT_TITLES_PROMPT_VERSION, cached: false };
  }
}

// ──────────────────────────────────────────────────
// Prompt
// ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a YouTube title editor proposing alternatives to a strategist's draft.

Your job: read the deterministic scorecard (which dimensions are weak, what drag patterns the title carries, the channel's brand register) and propose 3–5 alternative titles that solve the diagnosed weaknesses while staying inside the brand register.

Rules:
- The alternatives MUST fit the channel's voice + editorial POV. If the spine indicates a trust-sensitive register (finance, legal, medical, professional), do NOT propose ALL CAPS, emoji, clickbait phrasing, or hype words even when cohort lift would support them. Cohort lift on a register-mismatched title is short-term clicks at the cost of long-term audience trust.
- Each alternative should address at least one specific diagnosed weakness — usually the curiosity gap (open a loop the original closes), the drag patterns (drop colons, "Why" openers, sub-35-char fragments), or the format-aware slot/length signal.
- For a Search-targeting concept: keep keyword density; alternatives can be sharper but should preserve the query-intent match.
- For a Browse-targeting concept: lean into curiosity gap and emotional valence; alternatives can be more provocative.
- For a Suggested-targeting concept: optimize for pairing with adjacent topical content; alternatives should feel like a natural next-watch.
- No hype-tells: "leverage", "unlock", "robust", "innovative", "stands out", "compelling", "powerful", "game-changer", "cutting-edge".
- One alternative per cell — don't repeat the same structural template across all 5.
- Return ONLY valid JSON in the shape: { "alternatives": [ { "title": "<text>", "addresses": "<which weakness>", "rationale": "<1 sentence why this fixes it>" } ] }. No markdown, no commentary outside the JSON.`;

function buildUserPrompt({ input, scoringOutput, spine, cohortSummary }) {
  const lines = [];
  lines.push('ORIGINAL CONCEPT:');
  lines.push(`- Title: "${input.title}"`);
  lines.push(`- Format: ${input.format}`);
  if (input.target_surface) lines.push(`- Target surface: ${input.target_surface}`);
  if (input.topic_label) lines.push(`- Topic: ${input.topic_label}`);
  if (input.notes) lines.push(`- Strategist notes: ${input.notes}`);
  lines.push('');

  // Brand register — the editorial constraint.
  if (spine?.editorial_pov?.trim() || spine?.voice_tone?.trim()) {
    lines.push('BRAND REGISTER (must respect):');
    if (spine.editorial_pov?.trim()) lines.push(`- Editorial POV: ${spine.editorial_pov.trim()}`);
    if (spine.voice_tone?.trim()) lines.push(`- Voice + tone: ${spine.voice_tone.trim()}`);
    lines.push('');
  }

  // Diagnosed weaknesses — the gap to close.
  lines.push('DIAGNOSED WEAKNESSES:');
  lines.push(`- Composite tier: ${scoringOutput.composite_tier}`);
  if (scoringOutput.composite_rationale) lines.push(`- Composite rationale: ${scoringOutput.composite_rationale}`);

  const s = scoringOutput.scores || {};
  if (s.title_patterns?.drags?.length) {
    lines.push('- Drag patterns the original title carries:');
    for (const d of s.title_patterns.drags) {
      lines.push(`    · ${d.label} → ${d.lift_pct}% statistical (n=${d.n})`);
    }
  }
  if (s.curiosity_gap) {
    lines.push(`- Curiosity gap: ${s.curiosity_gap.curiosity_score}/10 — ${s.curiosity_gap.tier}`);
    if (s.curiosity_gap.rationale) lines.push(`  Rationale: ${s.curiosity_gap.rationale}`);
  }
  if (s.hook_promise_delivery) {
    lines.push(`- Hook delivery: ${s.hook_promise_delivery.hook_score}/10 — ${s.hook_promise_delivery.tier}`);
  }
  if (s.topic_authority) {
    lines.push(`- Topic authority: ${Math.round(s.topic_authority.topic_max_similarity * 100)}% — ${s.topic_authority.tier} (dominant: ${s.topic_authority.dominant_source})`);
  }
  lines.push('');

  // Optional: cohort signal so alternatives can reference adjacent shapes
  if (cohortSummary?.clientName) {
    lines.push('COHORT CONTEXT:');
    lines.push(`- Channel: ${cohortSummary.clientName}`);
    lines.push('');
  }

  lines.push('Propose 3–5 alternative titles that respect the brand register AND address the diagnosed weaknesses. Return JSON only.');
  return lines.join('\n');
}

// ──────────────────────────────────────────────────
// Cache helpers
// ──────────────────────────────────────────────────

function buildCacheKey(input, scoringOutput, spine) {
  // Cache key reflects everything that would change the alternatives:
  // the title, the diagnosed weaknesses (proxied by composite tier),
  // and the brand voice. Iterating on title text creates fresh cache
  // entries; re-scoring the same title returns the previous result.
  const voiceHash = djb2(`${spine?.editorial_pov || ''}::${spine?.voice_tone || ''}`);
  const titleHash = djb2(input.title.toLowerCase());
  return `alt_titles:${ALT_TITLES_PROMPT_VERSION}:${titleHash}:${input.format}:${scoringOutput.composite_tier}:${voiceHash}`;
}

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < (str || '').length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h = h | 0;
  }
  return (h >>> 0).toString(36);
}

async function loadCache(key) {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from(CACHE_TABLE)
      .select('payload, updated_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (!data) return null;
    const ageHours = (Date.now() - new Date(data.updated_at).getTime()) / 3600000;
    if (ageHours > CACHE_TTL_HOURS) return null;
    return data.payload;
  } catch {
    return null;
  }
}

async function saveCache(key, payload) {
  if (!supabase) return;
  try {
    await supabase
      .from(CACHE_TABLE)
      .upsert(
        { cache_key: key, payload, updated_at: new Date().toISOString() },
        { onConflict: 'cache_key' },
      );
  } catch (err) {
    console.warn('[altTitles] cache save failed:', err);
  }
}

export default { generateAlternativeTitles, ALT_TITLES_PROMPT_VERSION };
