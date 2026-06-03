/**
 * Hook promise delivery service — Phase 2.6 dimension (step 2 of 3).
 *
 * One Claude call per (title, hook-beat) pair rating whether the
 * opening 15 seconds actually delivers on the title's specific
 * promise. Misalignment is the single most common reason high-CTR
 * videos lose retention by 0:30 — viewers click on a promise, the
 * hook drifts off-promise, they leave.
 *
 * Distinct from Phase 2.6 step 1 (curiosity_gap):
 *   - curiosity_gap rates whether the TITLE earns a click.
 *   - hook_promise_delivery rates whether the HOOK keeps the viewer
 *     after the click. Different gate in the funnel.
 *
 * Requires an optional strategist input — the "hook beat", a 1–2
 * sentence description of the first 15 seconds (what's on screen
 * and what's said). When that input isn't provided, this dimension
 * is null and self-excludes from the composite.
 *
 * Cached by (title, hook_beat, format, prompt_version) — same
 * pattern as curiosityGapService. 30-day TTL.
 */

import { supabase } from './supabaseClient';

export const HOOK_PROMPT_VERSION = 'v1-hook-delivery-1-10';

const CACHE_TTL_HOURS = 24 * 30;
const CACHE_TABLE = 'competitor_intelligence_cache';

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * Rate hook-promise alignment on a 1–10 scale via Claude.
 *
 * @param {string} title       the candidate title
 * @param {string} hookBeat    1–2 sentence description of the first 15s
 * @param {Object} [opts]
 * @param {string} [opts.format='long_form']
 * @returns {Promise<{ score: number, rationale: string, promptVersion: string, cached: boolean } | null>}
 */
export async function rateHookDelivery(title, hookBeat, { format = 'long_form' } = {}) {
  if (!title || typeof title !== 'string' || !title.trim()) return null;
  if (!hookBeat || typeof hookBeat !== 'string' || !hookBeat.trim()) return null;
  const trimmedTitle = title.trim();
  const trimmedHook = hookBeat.trim();

  const cacheKey = buildCacheKey(trimmedTitle, trimmedHook, format);
  const cached = await loadCache(cacheKey);
  if (cached) return { ...cached, cached: true };

  try {
    const claudeAPI = (await import('./claudeAPI')).default;
    const { parseClaudeJSON } = await import('../lib/parseClaudeJSON');
    const result = await claudeAPI.call(
      buildUserPrompt(trimmedTitle, trimmedHook, format),
      SYSTEM_PROMPT,
      'hook_promise_delivery',
      350,
    );
    const parsed = parseClaudeJSON(result.text, { score: null, rationale: '' });
    const score = clamp(Math.round(Number(parsed.score)), 1, 10);
    if (!Number.isFinite(score)) return null;

    const payload = {
      score,
      rationale: (parsed.rationale || '').trim(),
      promptVersion: HOOK_PROMPT_VERSION,
    };
    await saveCache(cacheKey, payload);
    return { ...payload, cached: false };
  } catch (err) {
    console.warn('[hookDelivery] rating failed:', err);
    return null;
  }
}

// ──────────────────────────────────────────────────
// Prompt
// ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a YouTube editor evaluating whether a video's opening hook (first 15 seconds) delivers on the title's specific promise.

A title that earns the click but a hook that drifts off-promise is the most common reason high-CTR videos lose retention by 0:30. The viewer clicked for X; if the hook opens on Y, they leave. Rate the alignment strictly.

Return ONLY valid JSON in the shape: { "score": <int 1–10>, "rationale": "<1–2 sentences>" }. No markdown, no commentary outside the JSON.`;

function buildUserPrompt(title, hookBeat, format) {
  return `Format: ${format}
Title: "${title}"
Hook beat (first 15 seconds): "${hookBeat}"

Rate how well the hook delivers on the title's specific promise.

Scale:
- 10: Hook directly delivers the title's specific promise in the opening beat. Uses the same key word or referenced concept. Viewer sees the payoff immediately.
- 7–8: Hook clearly relates to the title's promise with no detour. Viewer knows they're in the right video by 0:10.
- 4–6: Hook is on the same topic but doesn't snap to the title's specific angle. Some risk of early drop-off.
- 1–3: Hook is off-promise or generic intro ("welcome back to my channel"). High drop-off risk; the click was wasted.

Rate the alignment.`;
}

// ──────────────────────────────────────────────────
// Cache helpers
// ──────────────────────────────────────────────────

function buildCacheKey(title, hookBeat, format) {
  const hash = djb2(`${HOOK_PROMPT_VERSION}::${format}::${title.toLowerCase()}::${hookBeat.toLowerCase()}`);
  return `hook_delivery:${HOOK_PROMPT_VERSION}:${hash}`;
}

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
    console.warn('[hookDelivery] cache save failed:', err);
  }
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, n));
}

export default { rateHookDelivery, HOOK_PROMPT_VERSION };
