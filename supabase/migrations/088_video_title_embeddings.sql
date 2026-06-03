-- 088: video_title_embeddings — Phase 2.6 step 3 foundation
--
-- Adds OpenAI text-embedding-3-small vectors to the `videos` table so
-- the topic_authority scorer can compute semantic similarity between
-- a candidate concept and (a) the channel's top historical performers
-- and (b) the cohort's recent hits. Cosine similarity via pgvector.
--
-- Why on the videos table (not a separate video_embeddings table):
--   - One embedding per video for the current model (text-embedding-3-small)
--     is all we need. Adding flexibility for multiple models / sources
--     is YAGNI for Phase 2.6.
--   - Simpler queries — the scorer joins from a channel's videos to
--     their embeddings without an additional table.
--   - When we eventually upgrade the embedding model (e.g. when OpenAI
--     ships -3-large or text-embedding-4-small), we re-embed in place
--     and update title_embedded_model. The migration to a multi-model
--     world can happen at that point if we actually need it.
--
-- Why title-only (not title + description):
--   - Strategists score by typing a TITLE — that's the primary input
--     the scorer compares. Adding the description would dilute the
--     semantic signal for "is this concept on-axis for the channel."
--   - Cheaper, faster, deterministic. ~10 tokens per title vs ~200+
--     with descriptions.
--   - We can revisit if precision turns out to be insufficient.

-- ──────────────────────────────────────────────────
-- pgvector extension
-- ──────────────────────────────────────────────────
-- Supabase ships with pgvector available but the extension must be
-- explicitly enabled per-project. This is idempotent.
CREATE EXTENSION IF NOT EXISTS vector;

-- ──────────────────────────────────────────────────
-- Columns on videos
-- ──────────────────────────────────────────────────
-- title_embedding: 1536-dim vector (the text-embedding-3-small default).
--   NULL means "not embedded yet" — backfill picks these up.
-- title_embedded_at: when this embedding was generated. Used to detect
--   stale embeddings when (rarely) we re-embed after a title edit.
-- title_embedded_model: which OpenAI model produced the vector. Defaults
--   to text-embedding-3-small. When we upgrade, this column tells the
--   re-embed job which rows need refreshing.
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS title_embedding         vector(1536),
  ADD COLUMN IF NOT EXISTS title_embedded_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS title_embedded_model    TEXT;

COMMENT ON COLUMN videos.title_embedding IS
  'OpenAI text-embedding-3-small vector (1536 dims) of the video title. NULL = not yet embedded; backfill picks these up. Used by Phase 2.6 topic_authority scorer for cosine similarity.';
COMMENT ON COLUMN videos.title_embedded_at IS
  'Timestamp of the embedding generation. Used to detect stale embeddings after title edits.';
COMMENT ON COLUMN videos.title_embedded_model IS
  'OpenAI model name that produced this embedding (e.g. text-embedding-3-small). Used by the re-embed job when we upgrade models.';

-- ──────────────────────────────────────────────────
-- HNSW index for cosine similarity
-- ──────────────────────────────────────────────────
-- HNSW is the modern best-practice ANN index for vector similarity
-- (pgvector 0.5.0+; Supabase has this). Partial index over rows that
-- actually have an embedding so the index size matches the embedded
-- video count, not the full videos count.
--
-- vector_cosine_ops because the scorer uses cosine similarity. With
-- this op class, queries use the `<=>` operator to get cosine
-- DISTANCE (1 - similarity); the scorer flips that to similarity.
--
-- HNSW parameters (m, ef_construction) left at defaults (16, 64) —
-- good general-purpose tuning. We can re-tune later from real query
-- patterns if needed.
CREATE INDEX IF NOT EXISTS idx_videos_title_embedding_hnsw
  ON videos
  USING hnsw (title_embedding vector_cosine_ops)
  WHERE title_embedding IS NOT NULL;

-- Plain B-tree on (channel_id, title_embedded_at) so the backfill job
-- can efficiently find videos still needing embeddings per channel.
CREATE INDEX IF NOT EXISTS idx_videos_embedding_pending
  ON videos(channel_id, published_at DESC)
  WHERE title_embedding IS NULL;
