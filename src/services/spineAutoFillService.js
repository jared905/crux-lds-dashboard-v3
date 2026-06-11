/**
 * Spine auto-fill service — extracts Strategy Spine fields from a
 * client's website via the same audit-website + Claude extraction
 * pattern that `clientBusinessContextService.auditWebsite` already
 * uses. This is the highest-leverage automation we identified in the
 * Spine audit (2026-06-04): existing website-scrub infrastructure
 * gets us 70% of the way to a populated Spine in minutes instead of
 * hours.
 *
 * Why it matters now: Kendall's first weekly brief generation
 * (2026-06-05) revealed that without Spine context (audience_read,
 * editorial_pov, voice_tone), the brief generator falls back on
 * generic YouTube best-practice knowledge and hallucinates specifics.
 * A populated Spine is the input that makes the brief actually useful.
 *
 * Architecture:
 *   - Server-side fetch via existing /api/audit-website endpoint
 *     (reuses the same allowlisting, user-agent, content-type handling
 *      and HTML-to-text stripping that business context audit uses).
 *   - Claude extraction with a Spine-specific prompt — extracts
 *     positioning, audience_read, editorial_pov, voice_tone,
 *     competitive_posture, guardrails, host_archetype hint.
 *   - Apply step writes via the existing strategySpineService
 *     updateSpineField. Two modes:
 *       'fill_empty': only writes to fields currently blank — safe
 *                     default, never overwrites strategist's manual work
 *       'overwrite':  writes all extracted fields, ignoring current values
 *
 * Tone discipline: same brand-register awareness as strategicReadService
 * + executiveMemoService. No hype-flavored extractions; if the source
 * is trust-sensitive (finance/legal/medical professional services),
 * editorial_pov + voice_tone capture that explicitly.
 */

import claudeAPI from './claudeAPI';
import { getSpine, updateSpineField } from './strategySpineService';

export const SPINE_AUTOFILL_PROMPT_VERSION = 'v2-spine-autofill-multipage';
const DEFAULT_MODEL = 'claude-sonnet-4-5';

// ──────────────────────────────────────────────────
// Public entry — extraction
// ──────────────────────────────────────────────────

/**
 * Fetch a URL via the existing audit-website endpoint, then run Claude
 * extraction. Returns a draft of the extracted Spine fields PLUS the
 * raw fetched text (so the strategist can inspect what the LLM was
 * working from).
 *
 * @param {Object} args
 * @param {string} args.clientId
 * @param {string} args.url        — homepage / about page / a deck-style URL
 * @param {string} [args.clientName]
 * @returns {Promise<{ ok, draft, fetched, model, promptVersion, error? }>}
 *   draft shape:
 *     { positioning_oneliner, positioning_hypothesis, audience_read,
 *       editorial_pov, voice_tone, competitive_posture, guardrails,
 *       host_archetype_hint, notes }
 */
export async function extractSpineFromWebsite({ clientId, url, clientName = null, multiPage = true }) {
  if (!clientId)    return { ok: false, error: 'clientId required' };
  if (!url?.trim()) return { ok: false, error: 'url required' };

  // 1) Server-side fetch. Multi-page is the default: the audit-website
  // endpoint discovers sitemap.xml or probes common paths (/about,
  // /mission, /team, …) and concatenates same-origin pages with
  // `## PAGE: <url>` headers. Falls back gracefully to single-page when
  // discovery yields nothing.
  const fetched = await fetchWebsite(url.trim(), { multiPage });
  if (!fetched.ok) return { ok: false, error: fetched.error || 'fetch failed' };
  if (!fetched.text?.trim()) return { ok: false, error: 'fetched page returned no text content' };

  // 2) Claude extraction
  const extraction = await extractSpineFromText({
    text:       fetched.text,
    url:        fetched.url,
    title:      fetched.title,
    clientName,
    isMultiPage: Array.isArray(fetched.pages) && fetched.pages.length > 1,
    pageCount:  fetched.pagesFetched || (fetched.pages?.length ?? 1),
  });
  return { ...extraction, fetched };
}

/**
 * Extract Strategy Spine fields from an uploaded PDF (pitch deck,
 * brand book, positioning doc). Same extraction pipeline as the
 * website auto-fill, just with PDF text in place of website HTML.
 *
 * @param {Object} args
 * @param {string} args.clientId
 * @param {File|Blob} args.file       — the PDF File from a <input type=file>
 * @param {string} [args.clientName]
 * @returns {Promise<{ ok, draft, fetched, model, promptVersion, error? }>}
 *   fetched shape: { pageCount, filename, sizeChars, truncated, fetchedAt }
 */
export async function extractSpineFromPdf({ clientId, file, clientName = null }) {
  if (!clientId) return { ok: false, error: 'clientId required' };
  if (!file)     return { ok: false, error: 'file required' };
  if (!/\.pdf$/i.test(file.name || '') && file.type !== 'application/pdf') {
    return { ok: false, error: 'file must be a PDF' };
  }

  // 1) Read file as ArrayBuffer, base64-encode for JSON transport.
  let pdfBase64;
  try {
    const ab = await file.arrayBuffer();
    pdfBase64 = arrayBufferToBase64(ab);
  } catch (err) {
    return { ok: false, error: `could not read file: ${err?.message || 'unknown'}` };
  }

  // 2) POST to extraction endpoint.
  const parsed = await postPdfExtract({ pdfBase64, filename: file.name });
  if (!parsed.ok) return { ok: false, error: parsed.error || 'PDF parse failed' };
  if (!parsed.text?.trim()) return { ok: false, error: 'PDF returned no text content' };

  // 3) Claude extraction — treat as multi-page so the prompt instructs
  // the extractor to synthesize across pages.
  const extraction = await extractSpineFromText({
    text:       parsed.text,
    url:        null,
    title:      file.name,
    clientName,
    isMultiPage: parsed.pageCount > 1,
    pageCount:  parsed.pageCount,
    sourceKind: 'pdf',
  });
  return { ...extraction, fetched: parsed };
}

/**
 * Same extraction but takes raw text. Use when the strategist pastes
 * deck contents or an About page they copied manually.
 */
export async function extractSpineFromText({ text, url = null, title = null, clientName = null, isMultiPage = false, pageCount = 1, sourceKind = 'website' }) {
  if (!text?.trim()) return { ok: false, error: 'text required' };

  try {
    const userPrompt = buildUserPrompt({ text, url, title, clientName, isMultiPage, pageCount, sourceKind });
    const result = await claudeAPI.call(
      userPrompt,
      SYSTEM_PROMPT,
      'spine_autofill_extraction',
      2400,
    );
    const raw = (result?.text || '').trim();
    if (!raw) {
      return { ok: false, error: 'empty extraction response', promptVersion: SPINE_AUTOFILL_PROMPT_VERSION };
    }
    const draft = parseExtraction(raw);
    if (!draft) {
      return { ok: false, error: 'could not parse extraction JSON — Claude returned non-JSON', promptVersion: SPINE_AUTOFILL_PROMPT_VERSION, rawResponse: raw };
    }
    return {
      ok:            true,
      draft,
      model:         DEFAULT_MODEL,
      promptVersion: SPINE_AUTOFILL_PROMPT_VERSION,
    };
  } catch (err) {
    console.warn('[spineAutoFill] extraction failed:', err);
    return { ok: false, error: err?.message || 'unknown error', promptVersion: SPINE_AUTOFILL_PROMPT_VERSION };
  }
}

// ──────────────────────────────────────────────────
// Public entry — apply draft to Spine
// ──────────────────────────────────────────────────

/**
 * Apply an extracted draft to the client's Strategy Spine.
 *
 * @param {Object} args
 * @param {string} args.clientId
 * @param {Object} args.draft      The shape returned by extractSpineFromText
 * @param {'fill_empty'|'overwrite'} [args.mode='fill_empty']
 *   - 'fill_empty': only writes to fields currently blank in the Spine.
 *                   Safe default; never overwrites strategist's manual work.
 *   - 'overwrite':  writes every non-empty extracted field, ignoring
 *                   current Spine values.
 * @returns {Promise<{ ok, written: string[], skipped: string[], error? }>}
 */
export async function applySpineExtraction({ clientId, draft, mode = 'fill_empty' }) {
  if (!clientId || !draft) return { ok: false, error: 'clientId + draft required' };

  // host_archetype_hint and notes are advisory — not Spine columns. We
  // map host_archetype_hint to the actual host_archetype field; notes
  // are surfaced to the UI but not written to the Spine.
  const fieldMap = {
    positioning_oneliner:  draft.positioning_oneliner,
    positioning_hypothesis:draft.positioning_hypothesis,
    audience_read:         draft.audience_read,
    editorial_pov:         draft.editorial_pov,
    voice_tone:            draft.voice_tone,
    competitive_posture:   draft.competitive_posture,
    guardrails:            draft.guardrails,
    host_archetype:        draft.host_archetype_hint,
  };

  let existingSpine = null;
  if (mode === 'fill_empty') {
    existingSpine = await getSpine(clientId);
  }

  const written = [];
  const skipped = [];
  for (const [field, value] of Object.entries(fieldMap)) {
    const trimmed = value?.trim?.();
    if (!trimmed) { skipped.push(`${field} (empty extraction)`); continue; }
    if (mode === 'fill_empty' && existingSpine?.[field]?.trim?.()) {
      skipped.push(`${field} (already filled)`);
      continue;
    }
    const r = await updateSpineField(clientId, field, trimmed);
    if (r?.ok === false) {
      skipped.push(`${field} (write failed: ${r.error})`);
    } else {
      written.push(field);
    }
  }
  return { ok: true, written, skipped };
}

// ──────────────────────────────────────────────────
// Internal — Claude prompt
// ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior brand strategist extracting Strategy Spine fields from a company's website content. The output drives content recommendations and brand-voice-aware AI prompts downstream.

OUTPUT FORMAT: Return ONLY valid JSON — no prose, no markdown, no preamble. Schema:
{
  "positioning_oneliner":   "1 sentence under 120 chars: who they are for, what they do, what makes them distinctive",
  "positioning_hypothesis": "3-5 sentences: their strategic positioning narrative — what category they sit in, who they serve, what makes them the right choice",
  "audience_read":          "3-5 sentences describing the audience — demographic, life-stage, financial/professional context, what they're anxious about, what triggered them to search",
  "editorial_pov":          "2-4 sentences on the perspective and authority lens — what angle do they take on their subject matter, what makes them credible to write about it",
  "voice_tone":             "2-3 sentences on voice and tone register — formal/informal, warm/clinical, professional/casual. Explicitly note if trust-sensitive register (finance/legal/medical/professional services).",
  "competitive_posture":    "2-3 sentences on how they position vs alternatives — what do they explicitly do differently, what category positioning do they take",
  "guardrails":             "1-3 sentences on what NOT to do — explicit category exclusions, regulatory constraints, brand-safety considerations from the site content",
  "host_archetype_hint":    "If a host or founder is named/featured: 'expert' | 'professional' | 'founder' | 'practitioner' | 'creator' — else null",
  "notes":                  "1-2 sentences: anything important that doesn't fit the above (caveats, things the website didn't show, signals you couldn't extract confidently)"
}

EXTRACTION RULES:
- Be specific. "Pre-retirees aged 50-65 with $500K-$2M in investable assets" is useful; "people thinking about retirement" is not.
- For trust-sensitive verticals (finance / legal / medical / regulated professional services), the voice_tone field MUST explicitly flag this. Downstream prompts use it to suppress hype-flavored recommendations.
- If a field genuinely cannot be inferred from the content, return an empty string for that field — do NOT fabricate.
- Do NOT use hype words anywhere: leverage, unlock, robust, innovative, compelling, drives, taps into, resonates with, powerful, game-changer, cutting-edge, transformative, elevate, accelerate.
- Match the voice register of the source. If the source is precise and quantitative, your extraction should be too. If the source is warm and conversational, your extraction reflects that.
- positioning_oneliner has a HARD limit of 120 characters.

If the website content is content-thin (under 500 chars of meaningful text), return partial extraction with explicit empty fields rather than fabricating.`;

function buildUserPrompt({ text, url, title, clientName, isMultiPage, pageCount, sourceKind = 'website' }) {
  const lines = [];
  if (clientName) lines.push(`CLIENT: ${clientName}`);
  if (url)        lines.push(`SOURCE URL: ${url}`);
  if (title)      lines.push(`SOURCE TITLE: ${title}`);

  if (sourceKind === 'pdf') {
    lines.push(`SOURCE TYPE: uploaded PDF — pitch deck / brand book / positioning doc. ${pageCount} pages concatenated below, delimited by '## PAGE N' headers. Pitch-deck text often reads as fragments because PDF text extraction loses visual layout — synthesize meaning across fragments, prioritize early pages for positioning, and ignore page-number / chapter-marker noise.`);
  } else if (isMultiPage) {
    lines.push(`SOURCE PAGES: ${pageCount} same-origin pages concatenated below. Each page is delimited by '## PAGE: <url>' headers — synthesize ACROSS pages, prefer corroborated claims, and treat the homepage as the canonical positioning anchor.`);
  }
  lines.push('');
  lines.push(sourceKind === 'pdf' ? 'PDF CONTENT:' : 'WEBSITE CONTENT:');
  lines.push(text);
  lines.push('');
  lines.push('Extract the Strategy Spine JSON now. Return ONLY the JSON object.');
  return lines.join('\n');
}

function parseExtraction(raw) {
  if (!raw) return null;
  // Tolerate code fences and surrounding whitespace.
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/i, '').replace(/```\s*$/, '').trim();
  }
  // If the model wrapped JSON inside prose despite instructions, grab the
  // first {...} block.
  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace > 0 || lastBrace < cleaned.length - 1) {
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn('[spineAutoFill] JSON parse failed:', err?.message, 'raw:', raw.slice(0, 200));
    return null;
  }
}

// ──────────────────────────────────────────────────
// Internal — server-side fetch
// ──────────────────────────────────────────────────

async function fetchWebsite(url, { multiPage = false } = {}) {
  try {
    const resp = await fetch('/api/audit-website', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url, multiPage }),
    });
    const json = await resp.json();
    if (!resp.ok) return { ok: false, error: json?.error || `HTTP ${resp.status}` };
    return json;
  } catch (err) {
    return { ok: false, error: err?.message || 'network error' };
  }
}

async function postPdfExtract({ pdfBase64, filename }) {
  try {
    const resp = await fetch('/api/spine-pdf-extract', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pdfBase64, filename }),
    });
    const json = await resp.json();
    if (!resp.ok) return { ok: false, error: json?.error || `HTTP ${resp.status}` };
    return json;
  } catch (err) {
    return { ok: false, error: err?.message || 'network error' };
  }
}

/**
 * Browser ArrayBuffer → base64. Chunked to avoid call-stack overflow
 * with large files (String.fromCharCode(...largeArray) blows up).
 */
function arrayBufferToBase64(ab) {
  const bytes = new Uint8Array(ab);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

export default {
  extractSpineFromWebsite,
  extractSpineFromPdf,
  extractSpineFromText,
  applySpineExtraction,
  SPINE_AUTOFILL_PROMPT_VERSION,
};
