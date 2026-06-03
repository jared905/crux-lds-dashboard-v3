/**
 * Topic-authority service — Phase 2.6 step 3.
 *
 * Computes semantic similarity between a candidate concept and:
 *   (a) the client channel's top historical performers
 *   (b) the cohort's recent hits
 *
 * Both signals matter:
 *   - High similarity to (a) → concept extends what's already worked
 *     for THIS audience. Strong fit.
 *   - High similarity to (b) → concept hits an active conversation in
 *     the niche, even if the channel hasn't done it yet. Also strong
 *     fit but for a different reason.
 *   - Low similarity to both → concept is off-axis. Either bold-novel
 *     (could work) or actually-wrong-for-this-channel (probably not).
 *
 * The scorer treats max(channel_max, cohort_max) as the primary signal
 * and surfaces the closest neighbors for the strategic-read LLM.
 *
 * Architecture: similarity computed client-side. Each scoring loads
 * ~30 historical + ~30 cohort embeddings (≈180KB) and does cosine
 * similarity in JS. Cheap enough for now; if it becomes a bottleneck
 * we'd move to a Postgres RPC using pgvector's `<=>` operator + HNSW
 * (the index from migration 088 is already in place).
 *
 * Embeddings live in videos.title_embedding (vector(1536)). When a
 * client hasn't backfilled yet, the row counts will be zero — the
 * dimension self-excludes via null return.
 */

import { supabase } from './supabaseClient';
import { youtubeOAuthService } from './youtubeOAuthService';

// In-memory cache of concept embeddings for this session. Strategists
// iterate on title variants; a small cache prevents re-embedding the
// same string twice.
const conceptEmbeddingCache = new Map();

// ──────────────────────────────────────────────────
// Concept embedding
// ──────────────────────────────────────────────────

/**
 * Embed a concept (typically a candidate title) via the OpenAI proxy.
 * Cached per-session to keep title-variant iteration cheap.
 *
 * @returns {Promise<number[] | null>} 1536-dim vector, or null on failure.
 */
export async function getConceptEmbedding(text) {
  if (!text || typeof text !== 'string') return null;
  const key = text.trim().toLowerCase();
  if (!key) return null;
  if (conceptEmbeddingCache.has(key)) return conceptEmbeddingCache.get(key);

  try {
    const token = await youtubeOAuthService.getAuthToken();
    if (!token) return null;
    const resp = await fetch('/api/openai-embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ texts: [text] }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      console.warn('[topicAuthority] concept embed failed:', body?.error || resp.status);
      return null;
    }
    const json = await resp.json();
    const vec = json?.embeddings?.[0] || null;
    if (vec) conceptEmbeddingCache.set(key, vec);
    return vec;
  } catch (err) {
    console.warn('[topicAuthority] concept embed error:', err);
    return null;
  }
}

// ──────────────────────────────────────────────────
// Comparison corpora
// ──────────────────────────────────────────────────

const DEFAULT_LIMIT_PER_SIDE = 30;
const COHORT_RECENCY_DAYS = 90;

/**
 * Load the two comparison corpora for a client: top historical hits
 * from the client's own channel, and recent hits from the cohort.
 *
 * Only includes videos that already have title_embedding populated —
 * the dimension's primary failure mode (no embeddings) surfaces as
 * both arrays being empty, which the orchestrator interprets as
 * "backfill not run yet".
 */
export async function loadTopicAuthorityContext({ clientId, limit = DEFAULT_LIMIT_PER_SIDE }) {
  if (!supabase || !clientId) return null;

  // Resolve the client's own channel — historical hits come from this channel.
  const { data: clientChannel } = await supabase
    .from('channels')
    .select('id, youtube_channel_id, name')
    .eq('id', clientId)
    .maybeSingle();
  if (!clientChannel) return null;

  // (a) Client's top historical performers: top N videos by view_count
  // among videos that have an embedding.
  const { data: historicalHits } = await supabase
    .from('videos')
    .select('id, title, view_count, published_at, title_embedding, youtube_video_id, channel_id')
    .eq('channel_id', clientChannel.id)
    .not('title_embedding', 'is', null)
    .gt('view_count', 0)
    .order('view_count', { ascending: false })
    .limit(limit);

  // (b) Cohort recent hits: top N videos by view_count among the
  // client's competitor cohort, published within the recency window.
  //
  // Cohort membership lives in the client_channels junction table
  // (client_id, channel_id) — NOT in a channels.client_id column.
  // We look up the junction first, then optionally narrow to
  // is_competitor=true rows.
  const { data: junctionRows } = await supabase
    .from('client_channels')
    .select('channel_id')
    .eq('client_id', clientChannel.id);
  const linkedIds = (junctionRows || []).map(r => r.channel_id);
  let cohortIds = [];
  if (linkedIds.length) {
    const { data: cohortChannels } = await supabase
      .from('channels')
      .select('id')
      .in('id', linkedIds)
      .eq('is_competitor', true);
    cohortIds = (cohortChannels || []).map(c => c.id);
  }

  let cohortRecentHits = [];
  if (cohortIds.length) {
    const cutoff = new Date(Date.now() - COHORT_RECENCY_DAYS * 86400000).toISOString();
    const { data } = await supabase
      .from('videos')
      .select('id, title, view_count, published_at, title_embedding, youtube_video_id, channel_id')
      .in('channel_id', cohortIds)
      .gte('published_at', cutoff)
      .not('title_embedding', 'is', null)
      .gt('view_count', 0)
      .order('view_count', { ascending: false })
      .limit(limit);
    cohortRecentHits = data || [];
  }

  return {
    clientChannelId: clientChannel.id,
    clientChannelName: clientChannel.name,
    historicalHits: historicalHits || [],
    cohortRecentHits,
    cohortChannelCount: cohortIds.length,
  };
}

/**
 * Count of pending (not-yet-embedded) videos for a channel. Used by
 * the UI backfill panel to surface "X videos pending" without running
 * a full pull first.
 */
export async function countPendingEmbeddings(channelId) {
  if (!supabase || !channelId) return null;
  const { count } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', channelId)
    .is('title_embedding', null)
    .not('title', 'is', null);
  return count ?? 0;
}

// ──────────────────────────────────────────────────
// Similarity
// ──────────────────────────────────────────────────

/** Cosine similarity between two equal-length number arrays. */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Find the top-K most similar videos from a corpus to the concept
 * embedding. Each video must have a title_embedding field.
 *
 * Skips rows where the embedding is missing or malformed — defensive,
 * given Postgres `vector` columns serialize as either arrays or
 * strings depending on the client.
 */
export function findTopMatches(conceptEmbedding, videos, topK = 5) {
  if (!Array.isArray(conceptEmbedding) || !videos?.length) return [];
  const scored = [];
  for (const v of videos) {
    const emb = parseEmbedding(v.title_embedding);
    if (!emb) continue;
    const sim = cosineSimilarity(conceptEmbedding, emb);
    if (sim == null) continue;
    scored.push({ video: v, similarity: sim });
  }
  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

// Postgres pgvector columns come back as either an array (when the
// client uses the supabase-js JSON parser correctly) or as a string
// like "[0.012,-0.034,...]" (some configurations). Normalize.
function parseEmbedding(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export default {
  getConceptEmbedding,
  loadTopicAuthorityContext,
  countPendingEmbeddings,
  cosineSimilarity,
  findTopMatches,
};
