/**
 * Vercel Serverless Function — embed videos for a channel
 *
 * Backfills title embeddings for a channel's videos. Strategist hits
 * a button in the Pre-flight workspace; this finds videos in that
 * channel still missing title_embedding, batches them in groups of 50,
 * and calls OpenAI via the embeddings proxy.
 *
 * Per-call quota cap so a single button-click can't blow up costs:
 * default maxBatches=20 (1000 embeddings = ~$0.0002 in OpenAI cost,
 * negligible but a reasonable per-click ceiling). If a channel has more
 * unembedded videos, the strategist clicks the button again — the next
 * pass picks up where this one left off.
 *
 * Request:  POST { channelId, maxBatches?: number }
 *           channelId is the internal channels.id UUID.
 * Response: { ok, channelId, videosEmbedded, batchesRun, batchesRemaining,
 *             totalTokens, model, errors }
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const BATCH_SIZE = 50;          // videos per OpenAI call
const DEFAULT_MAX_BATCHES = 20; // = 1000 videos per click ceiling
const HARD_MAX_BATCHES = 200;   // absolute upper bound per call
const OPENAI_MODEL = 'text-embedding-3-small';

export default async function handler(req, res) {
  const allowedOrigin = process.env.FRONTEND_URL || process.env.VERCEL_URL || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const { channelId, maxBatches } = req.body || {};
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured on this deployment' });
    }

    const batchCap = Math.min(
      Math.max(parseInt(maxBatches, 10) || DEFAULT_MAX_BATCHES, 1),
      HARD_MAX_BATCHES,
    );

    // Verify the channel exists (cheap; also confirms the UUID format)
    const { data: channelRow, error: chErr } = await supabase
      .from('channels')
      .select('id, name')
      .eq('id', channelId)
      .maybeSingle();
    if (chErr || !channelRow) {
      return res.status(404).json({ error: 'Channel not found', channelId });
    }

    // Count remaining work BEFORE we start so the response can tell the
    // strategist whether they need to click again.
    const { count: pendingBefore } = await supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', channelId)
      .is('title_embedding', null)
      .not('title', 'is', null);

    if (!pendingBefore) {
      return res.status(200).json({
        ok: true,
        channelId,
        channelName: channelRow.name,
        videosEmbedded: 0,
        batchesRun: 0,
        batchesRemaining: 0,
        totalTokens: 0,
        model: OPENAI_MODEL,
        errors: [],
        note: 'No videos pending embedding for this channel.',
      });
    }

    let videosEmbedded = 0;
    let batchesRun = 0;
    let totalTokens = 0;
    const errors = [];

    for (let batchIdx = 0; batchIdx < batchCap; batchIdx++) {
      // Pull the next batch — videos in this channel still missing
      // embeddings, newest first so the most-likely-relevant content
      // gets embedded first if the cap kicks in.
      const { data: batch, error: batchErr } = await supabase
        .from('videos')
        .select('id, title')
        .eq('channel_id', channelId)
        .is('title_embedding', null)
        .not('title', 'is', null)
        .order('published_at', { ascending: false })
        .limit(BATCH_SIZE);

      if (batchErr) {
        errors.push({ stage: 'fetch', batchIdx, error: batchErr.message });
        break;
      }
      if (!batch?.length) break;   // nothing left to embed

      const texts = batch.map(v => v.title);

      // Call OpenAI directly (server-side) — same call shape the proxy
      // makes, just inline since we're already on the backend.
      const openaiResp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: OPENAI_MODEL, input: texts }),
      });

      if (!openaiResp.ok) {
        let body = null;
        try { body = await openaiResp.json(); } catch {}
        errors.push({
          stage: 'openai',
          batchIdx,
          status: openaiResp.status,
          error: body?.error?.message || `HTTP ${openaiResp.status}`,
        });
        // OpenAI errors are usually retryable but at this scale just
        // surface the failure and stop — strategist can click again.
        break;
      }

      const body = await openaiResp.json();
      const sorted = (body.data || []).slice().sort((a, b) => a.index - b.index);
      totalTokens += body.usage?.total_tokens || 0;

      // Update each video in place. Could be parallelized but the
      // serial loop is simple + the batch is only 50 rows.
      const nowIso = new Date().toISOString();
      for (let i = 0; i < batch.length; i++) {
        const embedding = sorted[i]?.embedding;
        if (!embedding) {
          errors.push({ stage: 'parse', batchIdx, videoId: batch[i].id, error: 'no embedding returned' });
          continue;
        }
        const { error: updErr } = await supabase
          .from('videos')
          .update({
            title_embedding: embedding,
            title_embedded_at: nowIso,
            title_embedded_model: OPENAI_MODEL,
          })
          .eq('id', batch[i].id);
        if (updErr) {
          errors.push({ stage: 'update', batchIdx, videoId: batch[i].id, error: updErr.message });
        } else {
          videosEmbedded++;
        }
      }
      batchesRun++;
    }

    // Re-count after so the UI knows whether to prompt for another click.
    const { count: pendingAfter } = await supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', channelId)
      .is('title_embedding', null)
      .not('title', 'is', null);

    return res.status(200).json({
      ok: true,
      channelId,
      channelName: channelRow.name,
      videosEmbedded,
      batchesRun,
      pendingBefore,
      pendingAfter: pendingAfter || 0,
      batchesRemaining: Math.ceil((pendingAfter || 0) / BATCH_SIZE),
      totalTokens,
      model: OPENAI_MODEL,
      errors,
    });
  } catch (err) {
    console.error('[embed-channel-videos] unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
