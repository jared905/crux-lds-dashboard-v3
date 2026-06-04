-- 091: client_competitor_scans — strategy-layer scans of recent
-- competitor uploads, scored as-if-the-client-made-them by the
-- Pre-flight scorer.
--
-- Why this exists: CompetitorPulse already surfaces "what just popped"
-- in Research. This table turns that discovery surface into a
-- strategic action: for each notable competitor upload, run it through
-- the client's Pre-flight scorer and rank by "adaptability" — how
-- strong the as-if-client score is + how close the topic is to the
-- client's historical authority + how strong the competitor's early
-- performance signal is.
--
-- Pre-flight: "should we make THIS concept?"
-- Repositioning: "what's broken in our existing catalog?"
-- Competitor scan: "what did a peer just publish that we should adapt?"
--
-- Architecture:
--   - One row per scan RUN — not per finding. Per-finding detail lives
--     in findings JSONB so a strategist can compare multiple scans
--     over time without joining across thousands of rows.
--   - cohort_data_at pins the cohort + topic-authority context the
--     scan was scored against. Same reproducibility pattern as the
--     scorecards + repositioning audits.
--   - mode reserves room for future "deep" scans (LLM-generated
--     adapt-this concept suggestions per finding). v1 is
--     deterministic-only.
--
-- Finding shape (each entry in findings JSONB):
--   {
--     competitor_video: { youtube_video_id, title, thumbnail_url,
--                         view_count, published_at, duration_seconds,
--                         format, channel: { id, name } },
--     signal: { multiplier, channel_avg, days_since_publish },
--     as_if_client_score: { composite_tier, composite_rationale, scores },
--     topic_authority_similarity: 0.78,   // null if embeddings absent
--     adaptability_score: 0-100,
--   }

CREATE TABLE IF NOT EXISTS client_competitor_scans (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by               TEXT,        -- strategist email

  -- Scan parameters
  mode                     TEXT NOT NULL DEFAULT 'deterministic'
    CHECK (mode IN ('deterministic', 'deep')),
  window_days              INTEGER NOT NULL DEFAULT 14,
  format_filter            TEXT,        -- NULL = both; 'shorts'/'long_form'
  signal_multiplier        NUMERIC NOT NULL DEFAULT 2.0,    -- views >= signal_multiplier * channel_avg
  competitor_channels_scanned INTEGER NOT NULL DEFAULT 0,
  videos_evaluated         INTEGER NOT NULL DEFAULT 0,
  findings_count           INTEGER NOT NULL DEFAULT 0,

  -- Reproducibility — pin the cohort + topic-authority snapshot
  cohort_data_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cohort_window_days       INTEGER NOT NULL DEFAULT 90,

  -- Findings — ranked by adaptability_score desc
  findings                 JSONB,

  -- Soft archive
  archived_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_client_competitor_scans_client
  ON client_competitor_scans(client_id, created_at DESC)
  WHERE archived_at IS NULL;

COMMENT ON TABLE client_competitor_scans IS
  'Strategy-layer scans of recent competitor uploads, scored as-if-the-client-made-them by the Pre-flight scorer. Surfaces "what should we adapt next" findings ranked by composite adaptability_score (early-performance signal + as-if-client composite tier + topic-authority similarity to the client''s historical hits).';

COMMENT ON COLUMN client_competitor_scans.signal_multiplier IS
  'Minimum views/channel_avg multiplier for a video to count as "notable" enough to score. 2.0 = at least 2x the channel''s average. Tunable per scan.';

COMMENT ON COLUMN client_competitor_scans.findings IS
  'Ranked findings array. Each entry: { competitor_video, signal, as_if_client_score, topic_authority_similarity, adaptability_score }. See migration 091 header for shape.';

ALTER TABLE client_competitor_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read competitor scans"
  ON client_competitor_scans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert competitor scans"
  ON client_competitor_scans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update competitor scans"
  ON client_competitor_scans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete competitor scans"
  ON client_competitor_scans FOR DELETE TO authenticated USING (true);
