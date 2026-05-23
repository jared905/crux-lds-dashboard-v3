-- 078: channel_production_signals — cached Vision analysis of a channel's
-- thumbnails. Powers the "Production Approach" section of the client-
-- facing audit deliverable (CRUX two-part artifact, section 01).
--
-- What's stored per row: a per-channel snapshot of how the channel
-- visually presents itself, extracted by running Claude Vision over the
-- last N video thumbnails. Aggregated into structured fields the audit
-- pack and series ideation can read.
--
-- Why persistent (vs. live every audit pack run):
--   - Vision passes are expensive (~$0.02-0.05 per channel per refresh)
--   - Production approach changes slowly (months, not days)
--   - Manual refresh per cohort gives strategist explicit control
--   - One row per channel, latest = active, history kept for diff later
--
-- Lifecycle: refresh is triggered per CLIENT (the strategist refreshes
-- "Leadership's cohort"), which iterates the client's pinned competitor
-- channels + the client's own channel. Each channel gets its own row.

CREATE TABLE IF NOT EXISTS channel_production_signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded')),
  extracted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Source — which thumbnails fed this extraction
  source_video_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  thumbnail_count  INT NOT NULL DEFAULT 0,

  -- Extracted structured signal. Shape:
  --   {
  --     visual_treatment: { face_pct, text_pct, scene_pct, brand_consistency_score, dominant_palette: [...] },
  --     host_framing:     { close_pct, mid_pct, wide_pct, host_visible_pct, notes },
  --     typography:       { large_text_pct, headline_pattern, all_caps_pct },
  --     production_tier:  'high' | 'medium' | 'low' | 'mixed',
  --     summary:          'string — 2-3 sentence prose summary',
  --   }
  signals         JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active row per channel at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_signals_active
  ON channel_production_signals(channel_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_production_signals_channel_extracted
  ON channel_production_signals(channel_id, extracted_at DESC);

COMMENT ON TABLE channel_production_signals IS
  'Cached Claude Vision analysis of a channel''s thumbnails. Powers the Production Approach section of the audit deliverable. Refresh is strategist-triggered per client cohort; one row per channel kept "active" at a time.';
COMMENT ON COLUMN channel_production_signals.signals IS
  'Structured extraction shape: { visual_treatment, host_framing, typography, production_tier, summary }. Opaque JSONB so the shape can evolve without migration.';

ALTER TABLE channel_production_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read production signals"
  ON channel_production_signals FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert production signals"
  ON channel_production_signals FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update production signals"
  ON channel_production_signals FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete production signals"
  ON channel_production_signals FOR DELETE
  TO authenticated USING (true);
