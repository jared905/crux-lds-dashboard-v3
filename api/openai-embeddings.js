/**
 * Vercel Serverless Function — OpenAI embeddings proxy
 *
 * Thin proxy around OpenAI's /v1/embeddings endpoint for
 * text-embedding-3-small. Lives server-side so the OPENAI_API_KEY
 * stays in env vars + we can rate-limit / batch / cache without
 * touching the frontend.
 *
 * Used by:
 *   - api/embed-channel-videos.js (backfill — bulk embed channel videos)
 *   - src/services/topicAuthorityService.js (per-scoring concept embedding)
 *
 * Request: POST { texts: string[] }
 *   - Max 100 inputs per call (we keep under OpenAI's 2048 limit
 *     because larger batches are harder to retry on partial failure)
 *   - Each input max ~8000 tokens; in practice video titles are <30
 * Response: { ok, embeddings: number[][], model, usage: { totalTokens } }
 *   - Order preserved; embeddings[i] is the vector for texts[i]
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const OPENAI_MODEL = 'text-embedding-3-small';
const OPENAI_URL = 'https://api.openai.com/v1/embeddings';
const MAX_INPUTS_PER_CALL = 100;

export default async function handler(req, res) {
  const allowedOrigin = process.env.FRONTEND_URL || process.env.VERCEL_URL || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Auth — match every other endpoint
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Validate inputs
    const { texts } = req.body || {};
    if (!Array.isArray(texts) || !texts.length) {
      return res.status(400).json({ error: 'texts (non-empty array of strings) required' });
    }
    if (texts.length > MAX_INPUTS_PER_CALL) {
      return res.status(400).json({ error: `Max ${MAX_INPUTS_PER_CALL} texts per call; caller should batch.` });
    }
    for (const t of texts) {
      if (typeof t !== 'string' || !t.trim()) {
        return res.status(400).json({ error: 'all texts must be non-empty strings' });
      }
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured on this deployment' });
    }

    // Call OpenAI
    const openaiResp = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: texts,
      }),
    });

    if (!openaiResp.ok) {
      let body = null;
      try { body = await openaiResp.json(); } catch {}
      return res.status(openaiResp.status).json({
        error: body?.error?.message || `OpenAI HTTP ${openaiResp.status}`,
        type: body?.error?.type || null,
      });
    }

    const body = await openaiResp.json();
    // OpenAI returns data: [{ embedding: number[], index: int }, ...]
    // Order isn't guaranteed by index in the array; sort by index to be safe.
    const sorted = (body.data || []).slice().sort((a, b) => a.index - b.index);
    const embeddings = sorted.map(r => r.embedding);

    return res.status(200).json({
      ok: true,
      model: body.model || OPENAI_MODEL,
      embeddings,
      usage: { totalTokens: body.usage?.total_tokens ?? null },
    });
  } catch (err) {
    console.error('[openai-embeddings] unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
