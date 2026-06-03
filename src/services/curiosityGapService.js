/**
 * Curiosity-gap service — Phase 2.6 dimension (step 1 of 3).
 *
 * One Claude call rating a title 1–10 on whether it leaves an OPEN
 * LOOP — a specific question or implied payoff the viewer can't
 * predict from the title alone. The scorer maps the 1–10 to a tier.
 *
 * Why this dimension exists beyond Phase 1's title-pattern regexes:
 * the patterns measure mechanical signals (emoji, ALL CAPS, question
 * marks). They miss the deeper question of whether the title creates
 * a reason to click. "How to install your alarm panel" passes ALL CAPS
 * + question-mark checks at zero, but it also makes no curiosity
 * promise. "The $40K install mistake every homeowner makes" passes
 * fewer pattern regexes but ranks much higher on curiosity. Pattern
 * regexes + curiosity-gap together cover both surfaces.
 *
 * Cached by (title, prompt_version) — Claude is stable enough on a
 * fixed title to make a 30-day TTL reasonable. Bumping CURIOSITY_PROMPT_VERSION
 * invalidates the cache when we tune the prompt.
 */

import { supabase } from './supabaseClient';

export const CURIOSITY_PROMPT_VERSION = 'v1-curiosity-1-10';

const CACHE_TTL_HOURS = 24 * 30;       // 30 days
const CACHE_TABLE = 'competitor_intelligence_cache';

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * Rate a title's curiosity gap on a 1–10 scale via Claude.
 *
 * @param {string} title       the candidate video title
 * @param {Object} [opts]
 * @param {string} [opts.format='long_form']  'long_form' | 'shorts' — used for prompt context only
 * @returns {Promise<{ score: number, rationale: string, promptVersion: string, cached: boolean } | null>}
 *   null when title is empty or the API call fails (caller treats as "dimension absent").
 */
export async function rateCuriosityGap(title, { format = 'long_form' } = {}) {
  if (!title || typeof title !== 'string' || !title.trim()) return null;
  const trimmed = title.trim();

  const cacheKey = buildCacheKey(trimmed, format);
  const cached = await loadCache(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  try {
    const claudeAPI = (await import('./claudeAPI')).default;
    const { parseClaudeJSON } = await import('../lib/parseClaudeJSON');
    const result = await claudeAPI.call(
      buildUserPrompt(trimmed, format),
      SYSTEM_PROMPT,
      'curiosity_gap',
      300,
    );
    const parsed = parseClaudeJSON(result.text, { score: null, rationale: '' });
    const score = clamp(Math.round(Number(parsed.score)), 1, 10);
    if (!Number.isFinite(score)) return null;

    const payload = {
      score,
      rationale: (parsed.rationale || '').trim(),
      promptVersion: CURIOSITY_PROMPT_VERSION,
    };
    await saveCache(cacheKey, payload);
    return { ...payload, cached: false };
  } catch (err) {
    console.warn('[curiosityGap] rating failed:', err);
    return null;
  }
}

// ──────────────────────────────────────────────────
// Prompt
// ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a YouTube title editor evaluating click-through potential. Rate the title on whether it leaves an OPEN LOOP — a specific question, implied payoff, or concrete curiosity hook the viewer cannot resolve from the title alone.

Rate strictly. Most titles score 4–6 (some curiosity, mostly literal). 9–10 is reserved for titles with a sharp, specific, payoff-implying hook.

Return ONLY valid JSON in the shape: { "score": <int 1–10>, "rationale": "<1–2 sentences>" }. No markdown, no commentary outside the JSON.`;

function buildUserPrompt(title, format) {
  return `Format: ${format}
Title: "${title}"

Scale:
- 10: Sharp open loop with implied specific payoff. Example: "The $40K install mistake every homeowner makes".
- 7–8: Clear curiosity hook or pointed question. Example: "What happens after a break-in actually changes your insurance".
- 4–6: Mild hook but mostly descriptive/literal. Example: "How to install your alarm panel".
- 1–3: Fully self-resolving, generic, or list-stub. Example: "Top 10 home security tips".

Rate the title.`;
}

// ──────────────────────────────────────────────────
// Cache helpers
// ──────────────────────────────────────────────────

function buildCacheKey(title, format) {
  const hash = djb2(`${CURIOSITY_PROMPT_VERSION}::${format}::${title.toLowerCase()}`);
  return `curiosity_gap:${CURIOSITY_PROMPT_VERSION}:${hash}`;
}

// djb2 — small, deterministic, dependency-free. Cache keys don't need
// cryptographic strength, just collision resistance across plausible
// title sets. Returns an unsigned base-36 string (~7 chars).
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
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
    console.warn('[curiosityGap] cache save failed:', err);
  }
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, n));
}

export default { rateCuriosityGap, CURIOSITY_PROMPT_VERSION };
