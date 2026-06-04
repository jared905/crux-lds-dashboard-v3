-- 089: client_repositioning_audits — bulk-scoring runs of a client's
-- existing catalog through the same scorer the Pre-flight panel uses
-- for proposed concepts. Surfaces systemic gaps the concept-by-concept
-- scoring can't see.
--
-- Why this exists: the Pre-flight scorer answers "should we make this
-- concept?" — diagnosis-on-one. The repositioning audit answers
-- "what's systemically wrong with our existing strategy?" — diagnosis-
-- across-many. For established channels (Rockefeller, SafeStreets,
-- Chick-fil-A — anyone with a back catalog) the second question is
-- often more valuable than the first.
--
-- Architecture:
--   - One row per audit RUN — not per video. Per-video scores live
--     in video_scores JSONB so we can compare runs without joining
--     across thousands of rows.
--   - Aggregations precomputed at write time (composite_distribution,
--     dimension_breakdowns, systemic_gaps, systemic_strengths) so the
--     UI doesn't redo bucket math on every load.
--   - cohort_data_at pins the audit's reference cohort, matching the
--     pattern from client_concept_scorecards. An audit stays
--     interpretable even after the cohort refreshes.
--   - mode field reserves room for future "deep" runs that include
--     LLM dimensions (curiosity_gap per video). v1 is 'deterministic'
--     only — title patterns, slot, length, topic, topic_authority.
--
-- Shape of video_scores entries:
--   {
--     youtube_video_id: 'dQw4w9WgXcQ',
--     title: '...',
--     view_count: 12340,
--     published_at: '2025-...',
--     duration_seconds: 720,
--     composite_tier: 'risky',
--     composite_rationale: '...',
--     scores: { ... per-dimension shape identical to client_concept_scorecards.scores }
--   }
--
-- Shape of dimension_breakdowns:
--   {
--     title_patterns: { very_likely_outperform: N, likely_solid: N, risky: N, predicted_under: N, null: N },
--     slot:           { ... },
--     length:         { ... },
--     topic:          { ... },
--     topic_authority:{ ... }
--   }
--   null counts capture videos where the dimension self-excluded
--   (e.g., shorts skip length; videos with no day×block data skip slot).
--
-- Shape of systemic_gaps / systemic_strengths:
--   [ { dimension: 'curiosity_gap', share_under: 0.78, share_over: 0.02, note: '...' } ]
--   "Systemic gap" = >60% of videos in risky+predicted_under.
--   "Systemic strength" = >50% of videos in very_likely_outperform+likely_solid.

CREATE TABLE IF NOT EXISTS client_repositioning_audits (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by               TEXT,        -- strategist email

  -- Audit mode + scope
  mode                     TEXT NOT NULL DEFAULT 'deterministic'
    CHECK (mode IN ('deterministic', 'deep')),  -- 'deep' adds LLM dimensions (later)
  videos_scored            INTEGER NOT NULL DEFAULT 0,
  videos_with_embeddings   INTEGER NOT NULL DEFAULT 0,
  format_filter            TEXT,        -- NULL = both; 'shorts'/'long_form' = format-only run

  -- Reproducibility — pin the cohort + surface snapshot the audit scored against.
  cohort_data_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cohort_window_days       INTEGER NOT NULL DEFAULT 90,

  -- Precomputed aggregations (read-path optimization)
  composite_distribution   JSONB,       -- { very_likely_outperform: N, ... }
  dimension_breakdowns     JSONB,       -- per-dimension tier distribution
  systemic_gaps            JSONB,       -- dimensions where channel is systemically weak
  systemic_strengths       JSONB,       -- where channel is systemically strong

  -- Per-video scores — full detail, JSONB array of entries (see header for shape)
  video_scores             JSONB,

  -- Soft archive
  archived_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_client_repositioning_audits_client
  ON client_repositioning_audits(client_id, created_at DESC)
  WHERE archived_at IS NULL;

COMMENT ON TABLE client_repositioning_audits IS
  'Bulk-scoring runs of a client''s existing catalog through the Pre-flight scorer. Surfaces systemic gaps (dimensions where >60% of videos score risky+ predicted_under) and systemic strengths (dimensions where >50% land likely_solid+). Persisted per-run so strategists can compare audits over time and watch repositioning effects land.';

COMMENT ON COLUMN client_repositioning_audits.mode IS
  '"deterministic" runs only the cohort/embedding dimensions (title patterns, slot, length, topic, topic_authority). "deep" adds LLM dimensions (curiosity_gap per video). v1 is deterministic-only; deep mode reserved.';

COMMENT ON COLUMN client_repositioning_audits.cohort_data_at IS
  'Timestamp of the cohort audit data this run scored against. Audits stay interpretable after the cohort refreshes.';

COMMENT ON COLUMN client_repositioning_audits.systemic_gaps IS
  'Array of { dimension, share_under, share_over, note } where share_under > 0.6. The repositioning roadmap output reads this directly.';

ALTER TABLE client_repositioning_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read repositioning audits"
  ON client_repositioning_audits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert repositioning audits"
  ON client_repositioning_audits FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update repositioning audits"
  ON client_repositioning_audits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete repositioning audits"
  ON client_repositioning_audits FOR DELETE TO authenticated USING (true);
