/**
 * Vercel Serverless Function — Install Intake Token API
 *
 * Powers the client-facing pre-work page. Three actions multiplexed
 * through ?action=:
 *
 *   GET  /api/intake-token?action=lookup&token=<token>
 *     Public. Validates token, returns { ok, client: { name, id },
 *     questions: [...], existingAnswers: {...} } so the page can render.
 *     Stamps first_accessed_at on first call.
 *
 *   POST /api/intake-token  (body: { action: 'submit', token, answers })
 *     Public. Validates token, writes answers to client_install_intake
 *     with source='client'. Stamps last_submitted_at on the token row.
 *     Only writes answers for questions marked client_facing=true —
 *     server enforces the split so a malicious client can't backdoor
 *     answers to strategist-only questions.
 *
 *   POST /api/intake-token  (body: { action: 'issue', client_id, ... })
 *     Authenticated (Bearer Supabase session). Strategist surface
 *     calls this from the workspace to mint a fresh token. Returns
 *     { ok, token, url, expires_at }.
 *
 * Public actions (lookup, submit) authenticate via token. Issue requires
 * a strategist's Supabase session.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Mirror of src/lib/installIntakeQuestions.js client-facing set.
// Source of truth is the frontend file; this is enforced at the API
// boundary so the server never trusts a client-submitted answer for
// a non-client-facing question.
const CLIENT_FACING_KEYS = new Set([
  'q3_hard_date',
  'q4_monthly_budget',
  'q10_legal_compliance',
  'q11_on_camera',
  'q12_existing_ip',
  'q13_in_house_capability',
  'q14_past_attempts',
  'q15_audience_assets',
]);

const INSTALL_VERSION = 'v1.4';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.method === 'GET'
    ? req.query?.action
    : (req.body?.action || req.query?.action);

  if (action === 'lookup')  return handleLookup(req, res);
  if (action === 'submit')  return handleSubmit(req, res);
  if (action === 'issue')   return handleIssue(req, res);
  return res.status(400).json({ ok: false, error: 'unknown action — use lookup, submit, or issue' });
}

// ──────────────────────────────────────────────────
// Lookup — validate token, return what the page needs
// ──────────────────────────────────────────────────

async function handleLookup(req, res) {
  const token = req.query?.token || req.body?.token;
  if (!token) return res.status(400).json({ ok: false, error: 'token required' });

  const t = await loadToken(token);
  if (!t.ok) return res.status(t.status || 400).json({ ok: false, error: t.error });

  // Stamp first_accessed_at on first hit so the strategist can see
  // "client opened the link 2h ago" in the workspace.
  if (!t.row.first_accessed_at) {
    await supabase.from('install_intake_tokens')
      .update({ first_accessed_at: new Date().toISOString() })
      .eq('id', t.row.id);
  }

  // Load client name
  const { data: client } = await supabase
    .from('channels')
    .select('id, name')
    .eq('id', t.row.client_id)
    .maybeSingle();

  // Load any answers the client already submitted on this or a prior
  // session — page can show them as draft state.
  const { data: existingRows } = await supabase
    .from('client_install_intake')
    .select('question_key, answer_text, source, submitted_at')
    .eq('client_id', t.row.client_id)
    .in('question_key', [...CLIENT_FACING_KEYS]);
  const existingAnswers = {};
  for (const r of existingRows || []) existingAnswers[r.question_key] = r;

  return res.status(200).json({
    ok: true,
    client:               { id: client?.id, name: client?.name || 'Client' },
    intendedRecipient:    t.row.intended_recipient_name || null,
    expiresAt:            t.row.expires_at,
    clientFacingKeys:     [...CLIENT_FACING_KEYS],
    existingAnswers,
    installVersion:       INSTALL_VERSION,
  });
}

// ──────────────────────────────────────────────────
// Submit — write client answers
// ──────────────────────────────────────────────────

async function handleSubmit(req, res) {
  const { token, answers } = req.body || {};
  if (!token) return res.status(400).json({ ok: false, error: 'token required' });
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ ok: false, error: 'answers required (object keyed by question_key)' });
  }

  const t = await loadToken(token);
  if (!t.ok) return res.status(t.status || 400).json({ ok: false, error: t.error });

  const submittedBy = (t.row.intended_recipient_name || t.row.intended_recipient_email || 'client').slice(0, 200);
  const nowIso = new Date().toISOString();

  // Validate + filter answers to client-facing keys only. Silently drop
  // attempts to backdoor non-client-facing questions; server is source
  // of truth on the split.
  const rows = [];
  const droppedKeys = [];
  for (const [key, text] of Object.entries(answers)) {
    if (!CLIENT_FACING_KEYS.has(key)) { droppedKeys.push(key); continue; }
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) continue;  // empty answers don't overwrite
    rows.push({
      client_id:                  t.row.client_id,
      question_key:               key,
      answer_text:                trimmed,
      install_instrument_version: INSTALL_VERSION,
      source:                     'client',
      submitted_by:               submittedBy,
      submitted_at:               nowIso,
      // Intentionally NOT setting confirmed_by_strategist_at — that's
      // the strategist's job in the workspace.
      updated_at:                 nowIso,
    });
  }

  if (rows.length === 0) {
    return res.status(400).json({ ok: false, error: 'no valid answers in submission', droppedKeys });
  }

  const { error: upsertErr } = await supabase
    .from('client_install_intake')
    .upsert(rows, { onConflict: 'client_id,question_key' });
  if (upsertErr) {
    return res.status(500).json({ ok: false, error: upsertErr.message });
  }

  await supabase.from('install_intake_tokens')
    .update({ last_submitted_at: nowIso })
    .eq('id', t.row.id);

  return res.status(200).json({
    ok: true,
    saved: rows.length,
    droppedKeys: droppedKeys.length ? droppedKeys : undefined,
  });
}

// ──────────────────────────────────────────────────
// Issue — strategist mints a fresh token
// ──────────────────────────────────────────────────

async function handleIssue(req, res) {
  // Strategist auth — Supabase session token in Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Authorization header required' });
  }
  const sessionToken = authHeader.slice(7);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(sessionToken);
  if (authErr || !user) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
  }

  const {
    client_id,
    expires_in_days = 14,
    intended_recipient_name = null,
    intended_recipient_email = null,
  } = req.body || {};
  if (!client_id) return res.status(400).json({ ok: false, error: 'client_id required' });

  // Generate opaque token — 30 bytes → 40-char base64url
  const token = crypto.randomBytes(30).toString('base64url');
  const expiresAt = new Date(Date.now() + expires_in_days * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from('install_intake_tokens')
    .insert({
      client_id,
      token,
      expires_at:               expiresAt,
      created_by:               user.email || user.id,
      intended_recipient_name,
      intended_recipient_email,
    })
    .select('id, token, expires_at')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });

  // Build URL using the host header so dev/prod resolve correctly
  const origin = req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : '');
  return res.status(200).json({
    ok: true,
    id:         data.id,
    token:      data.token,
    expires_at: data.expires_at,
    url:        `${origin}/intake/${data.token}`,
  });
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

async function loadToken(token) {
  const { data, error } = await supabase
    .from('install_intake_tokens')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error)  return { ok: false, status: 500, error: error.message };
  if (!data)  return { ok: false, status: 404, error: 'Token not found' };
  if (data.revoked_at) return { ok: false, status: 403, error: 'Token has been revoked' };
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 410, error: 'Token has expired' };
  }
  return { ok: true, row: data };
}
