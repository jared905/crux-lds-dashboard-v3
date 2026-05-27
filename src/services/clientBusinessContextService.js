/**
 * Client Business Context service — what the client actually offers,
 * extracted from their website and confirmed by the strategist.
 *
 * Why this exists: without business-context grounding, the AI
 * opportunity-brief generator recommends content categories the client
 * doesn't sell (e.g. "robot vacuum series" for a home-security client).
 * The not_offered field is the filter that grounds recommendations in
 * the client's actual offer.
 *
 * Lifecycle:
 *   - Strategist clicks "Audit website" with a URL.
 *   - auditWebsite() server-fetches the page, runs Claude over the
 *     extracted text, returns a draft (status='draft').
 *   - Strategist reviews, edits if needed, clicks Confirm.
 *   - confirmContext() supersedes any prior 'active' row and flips
 *     this one to 'active'. History preserved.
 *   - Active row is read by spineContextService.buildSpineContext and
 *     whiteSpaceService brief generator.
 */

import { supabase } from './supabaseClient';
import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';

// ──────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────

export async function getActiveBusinessContext(clientId) {
  if (!supabase || !clientId) return null;
  const { data } = await supabase
    .from('client_business_context')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();
  return data;
}

/**
 * Read the most recent draft for a client (the one currently being
 * iterated on). Returns null if no draft exists.
 */
export async function getLatestDraft(clientId) {
  if (!supabase || !clientId) return null;
  const { data } = await supabase
    .from('client_business_context')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// ──────────────────────────────────────────────────
// Website audit (server-fetch + Claude extraction)
// ──────────────────────────────────────────────────

/**
 * Run a website audit: server-fetch the URL, run Claude over the text,
 * and persist a draft row the strategist can review.
 *
 * Returns `{ ok, draft?, error? }`. Doesn't mark active — that's a
 * separate confirm() step so nothing leaks into AI prompts until the
 * strategist signs off.
 */
export async function auditWebsite(clientId, url, { clientName } = {}) {
  if (!clientId || !url) return { ok: false, error: 'missing clientId or url' };

  // Step 1: server-side fetch
  let fetched;
  try {
    const resp = await fetch('/api/audit-website', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    fetched = await resp.json();
    if (!resp.ok || !fetched.ok) {
      return { ok: false, error: fetched?.error || `Website fetch failed (HTTP ${resp.status})` };
    }
  } catch (e) {
    return { ok: false, error: e.message || 'Website fetch failed' };
  }

  if (!fetched.text || fetched.text.length < 200) {
    return { ok: false, error: 'Website returned too little content to audit — page may be JS-rendered or behind a paywall.' };
  }

  // Step 2: Claude extraction
  let extracted;
  try {
    extracted = await extractBusinessContextFromText(fetched.text, { url: fetched.url, title: fetched.title, clientName });
  } catch (e) {
    return { ok: false, error: e.message || 'Extraction failed' };
  }
  if (!extracted) return { ok: false, error: 'Claude returned no usable extraction.' };

  // Step 3: persist as draft
  const { data: row, error } = await supabase
    .from('client_business_context')
    .insert({
      client_id: clientId,
      status: 'draft',
      products_offered: extracted.products_offered || null,
      products_not_offered: extracted.products_not_offered || null,
      target_market: extracted.target_market || null,
      one_line_summary: extracted.one_line_summary || null,
      source_url: fetched.url,
      source_fetched_at: fetched.fetchedAt,
      audit_raw_text: fetched.text.slice(0, 6000),  // capped for size
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, draft: row };
}

async function extractBusinessContextFromText(text, { url, title, clientName }) {
  const systemPrompt = `You read a company's website and extract a structured business-context summary. The summary will filter downstream content recommendations — specifically, the "what we don't sell" field stops a recommendation engine from proposing categories the company doesn't operate in. Be precise about scope. Return ONLY valid JSON.`;

  const prompt = `Read the website content below and extract a business-context summary.

URL: ${url}
${title ? `Page title: ${title}` : ''}
${clientName ? `Internal client name: ${clientName}` : ''}

WEBSITE CONTENT:
${text}

EXTRACT (return ONLY this JSON):
{
  "one_line_summary": "string — single sentence: '[Company] is X for Y customer'",
  "products_offered": "string — bulleted list of products, services, and offerings the company actually sells or provides. One bullet per line, prefixed with '- '. Be specific about what's INCLUDED (e.g., 'professional installation of home security systems', not just 'security').",
  "products_not_offered": "string — bulleted list of adjacent product categories the company does NOT operate in. These are categories a downstream content recommendation engine might suggest but shouldn't. Look at what comparable companies sell that this one doesn't. One bullet per line, prefixed with '- '. Be explicit: instead of 'not smart home', write '- Robot vacuums, smart thermostats, smart lighting — adjacent smart-home categories this brand does not sell'.",
  "target_market": "string — who they sell to. Customer segment (consumer / B2B / SMB / enterprise), geographic scope, demographic if relevant, and pricing tier (premium / mid / budget). One paragraph."
}

REQUIREMENTS:
- The products_not_offered field is the most important. Be aggressive about naming adjacent categories the website does NOT mention. If you can't tell what they don't sell, say so explicitly: "- Unclear from website — strategist should confirm scope."
- Don't repeat what's in products_offered as a negative ("they don't sell things they don't sell" is useless). The not_offered list should be ADJACENT categories — things a competitor in the same broad space might sell but this company doesn't.
- If the website is content-thin or unclear, return partial extraction with explicit "Unclear" markers rather than guessing.

Return ONLY valid JSON.`;

  try {
    const result = await claudeAPI.call(prompt, systemPrompt, 'business_context_extract', 2048);
    const parsed = parseClaudeJSON(result.text, null);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      one_line_summary: typeof parsed.one_line_summary === 'string' ? parsed.one_line_summary.trim() : '',
      products_offered: typeof parsed.products_offered === 'string' ? parsed.products_offered.trim() : '',
      products_not_offered: typeof parsed.products_not_offered === 'string' ? parsed.products_not_offered.trim() : '',
      target_market: typeof parsed.target_market === 'string' ? parsed.target_market.trim() : '',
    };
  } catch (e) {
    console.error('[businessContext] extraction failed:', e);
    return null;
  }
}

// ──────────────────────────────────────────────────
// Write — update / confirm
// ──────────────────────────────────────────────────

/**
 * Patch a draft (or active) row's editable fields. Doesn't change
 * status. Used for in-place strategist edits during review.
 */
export async function updateBusinessContext(rowId, patch = {}) {
  if (!supabase || !rowId) return { ok: false, error: 'missing' };
  const allowed = ['products_offered', 'products_not_offered', 'target_market', 'one_line_summary', 'notes'];
  const updates = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in patch) updates[k] = patch[k];
  const { data: row, error } = await supabase
    .from('client_business_context')
    .update(updates)
    .eq('id', rowId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row };
}

/**
 * Confirm a draft: supersede any existing active row for this client,
 * flip the draft to active. After this the context starts flowing
 * into AI prompts.
 */
export async function confirmBusinessContext(rowId) {
  if (!supabase || !rowId) return { ok: false, error: 'missing' };

  const { data: row } = await supabase
    .from('client_business_context')
    .select('client_id')
    .eq('id', rowId)
    .maybeSingle();
  if (!row?.client_id) return { ok: false, error: 'row not found' };

  // Supersede any current active row first
  await supabase
    .from('client_business_context')
    .update({ status: 'superseded' })
    .eq('client_id', row.client_id)
    .eq('status', 'active');

  const { data: updated, error } = await supabase
    .from('client_business_context')
    .update({ status: 'active', confirmed_at: new Date().toISOString() })
    .eq('id', rowId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: updated };
}

/**
 * Discard a draft (e.g. strategist wants to re-audit with a different
 * URL). Deletes only — doesn't touch active rows.
 */
export async function discardDraft(rowId) {
  if (!supabase || !rowId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('client_business_context')
    .delete()
    .eq('id', rowId)
    .eq('status', 'draft');
  return { ok: !error, error: error?.message };
}

// ──────────────────────────────────────────────────
// Prompt-block formatter (used by spineContextService + brief gen)
// ──────────────────────────────────────────────────

/**
 * Format an active business-context row as a prompt block. Returns an
 * empty string when nothing material to inject so callers can prepend
 * unconditionally.
 */
export function formatBusinessContextForPrompt(row) {
  if (!row) return '';
  const parts = [];
  if (row.one_line_summary?.trim()) parts.push(`BUSINESS SUMMARY:\n${row.one_line_summary.trim()}`);
  if (row.products_offered?.trim()) parts.push(`PRODUCTS / SERVICES OFFERED:\n${row.products_offered.trim()}`);
  if (row.products_not_offered?.trim()) {
    parts.push(`PRODUCTS / SERVICES NOT OFFERED (do not recommend content in these categories):\n${row.products_not_offered.trim()}`);
  }
  if (row.target_market?.trim()) parts.push(`TARGET MARKET:\n${row.target_market.trim()}`);
  return parts.length ? `=== CLIENT BUSINESS CONTEXT ===\n${parts.join('\n\n')}\n=== END CLIENT BUSINESS CONTEXT ===` : '';
}

export default {
  getActiveBusinessContext,
  getLatestDraft,
  auditWebsite,
  updateBusinessContext,
  confirmBusinessContext,
  discardDraft,
  formatBusinessContextForPrompt,
};
