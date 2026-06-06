-- 092: client_calibration_runs — feedback-loop scaffolding for the
-- prediction machine.
--
-- Why this exists: every score Crux generates is a claim against
-- reality that has never been validated. The repositioning audit
-- captures predicted tiers per dimension for every video in a client's
-- catalog; reality captures the actual view_count. This table closes
-- the loop — compares predicted-tier vs actual-relative-performance,
-- per dimension, per channel, per audit run.
--
-- The strategist value: "title_patterns predicts 67% correctly for
-- Kendall; topic_authority predicts 89%. Trust topic_authority more on
-- this channel; treat title_patterns as a strong hypothesis, not a
-- verdict." That defensibility is the difference between a tool that
-- makes claims and a system that learns.
--
-- Phase A vs Phase B:
--   Phase A (this migration): view-side calibration only. baseline_strategy
--     defaults to 'percentile_rank' — actual_tier comes from where a
--     video ranks by view_count inside the channel's catalog.
--     Top quartile = very_likely_outperform; bottom quartile =
--     predicted_under; etc.
--   Phase B (future): pluggable baseline_strategy values like
--     'pipeline_conversions', 'consultation_bookings', 'donor_signups'
--     for clients who can provide outcome data. Schema is already
--     accommodating — only the calibrationService strategy implementation
--     needs to grow; the table stays as-is.
--
-- Architecture:
--   - One row per calibration RUN. Pinned to a specific
--     source_audit_id so the calibration is reproducible — re-running
--     the same audit against the same baseline yields the same numbers.
--   - per_dimension_metrics, composite_metrics, mismatched_videos
--     JSONB so the UI doesn't re-derive from the source audit.
--
-- Shape of per_dimension_metrics:
--   {
--     title_patterns: {
--       n: 175,
--       accuracy: 0.42,             // exact-tier match share
--       adjacent_accuracy: 0.78,    // within ±1 tier
--       confusion: {                 // predicted_tier -> actual_tier -> count
--         very_likely_outperform: { very_likely_outperform: 8, likely_solid: 12, ... },
--         likely_solid:           { ... },
--         risky:                  { ... },
--         predicted_under:        { ... }
--       }
--     },
--     slot:            { ... },
--     length:          { ... },
--     topic_authority: { ... }
--   }
--
-- Shape of composite_metrics:
--   Same shape as a single dimension entry above, but for the
--   scorecard's composite_tier.
--
-- Shape of mismatched_videos (truncated to top N by view_count desc):
--   [
--     {
--       youtube_video_id, title, view_count,
--       predicted_composite_tier, actual_tier,
--       per_dimension_disagreement: [{ dim, predicted_tier, actual_tier }, ...]
--     }
--   ]

CREATE TABLE IF NOT EXISTS client_calibration_runs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  source_audit_id          UUID NOT NULL REFERENCES client_repositioning_audits(id) ON DELETE CASCADE,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by               TEXT,        -- strategist email

  -- Strategy used to derive actual_tier from observed outcomes.
  -- Phase A: 'percentile_rank' (view rank inside channel).
  -- Phase B (future): 'pipeline_conversions', 'consultation_bookings',
  --   'donor_signups', 'demo_requests', etc.
  baseline_strategy        TEXT NOT NULL DEFAULT 'percentile_rank',
  baseline_window_days     INTEGER,     -- NULL for percentile_rank (uses audit's video pool); set for windowed pipeline strategies

  -- Quick-glance summary fields (light columns for the list view)
  videos_calibrated        INTEGER NOT NULL DEFAULT 0,
  composite_accuracy       NUMERIC,     -- 0..1 — exact-tier match share for the composite
  composite_adjacent_accuracy NUMERIC,  -- 0..1 — within ±1 tier share

  -- Full per-dim + composite + mismatch detail
  per_dimension_metrics    JSONB,
  composite_metrics        JSONB,
  mismatched_videos        JSONB,       -- top-N disagreements by view_count

  -- Soft archive
  archived_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_client_calibration_runs_client
  ON client_calibration_runs(client_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_calibration_runs_source_audit
  ON client_calibration_runs(source_audit_id);

COMMENT ON TABLE client_calibration_runs IS
  'Per-channel calibration of the Pre-flight scorer''s predicted tiers vs observed outcomes from a source repositioning audit. Phase A uses view-rank percentile as the actual-tier baseline; Phase B adds pluggable pipeline-metric strategies (consultation bookings, demo requests, donor signups) for clients who can provide outcome data.';

COMMENT ON COLUMN client_calibration_runs.baseline_strategy IS
  'Strategy used to derive actual_tier from observed outcomes. v1 = "percentile_rank" (view-rank quartile inside the channel). Future strategies (pipeline_conversions, consultation_bookings, etc.) are config additions; the schema stays.';

COMMENT ON COLUMN client_calibration_runs.composite_accuracy IS
  'Share of videos where the composite predicted_tier exactly matched the actual_tier. Use composite_adjacent_accuracy for the more forgiving within-±1-tier definition that is often the more honest read.';

ALTER TABLE client_calibration_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calibration runs"
  ON client_calibration_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert calibration runs"
  ON client_calibration_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update calibration runs"
  ON client_calibration_runs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete calibration runs"
  ON client_calibration_runs FOR DELETE TO authenticated USING (true);
