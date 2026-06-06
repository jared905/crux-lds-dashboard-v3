-- 095: client_weekly_briefs — strategist-facing weekly brief generator.
--
-- Why this exists: through 2026-06-05 we've shipped a lot of analytical
-- infrastructure (Pre-flight scorer, Repositioning audit, Competitor
-- scan, Calibration with format split, Cohort roles). Each surface
-- produces diagnostic data. The strategist (Jared) still has to
-- TRANSLATE that data into client-facing recommendations himself —
-- "topic_authority is your most reliable dimension at 33% accuracy" is
-- analyst-speak, not a strategist's brief.
--
-- The brief generator closes that gap. It takes the calibration-aware
-- analytical state and produces a 4-5 bullet brief: action-led,
-- evidence-cited, calibration-honest, brand-register-appropriate. The
-- artifact you'd actually send a client.
--
-- Architecture:
--   - One row per generated brief. Pinned to source data (audit_id +
--     calibration_run_id) so the strategist can compare briefs over
--     time against the data they were drafted from.
--   - text is markdown; renders as bullets in UI, copy-to-clipboard
--     for sending to client.
--   - prompt_version + model fields so we can invalidate cached briefs
--     when the prompt evolves and audit what was generated against.
--   - Soft-archive via archived_at — strategist may want a clean "current"
--     view but keep history.
--
-- Inputs the orchestrator pulls:
--   1. Strategy Spine (positioning, editorial_pov, voice_tone, audience_read,
--      competitive_posture, guardrails)
--   2. Business context (products_offered/not_offered, target_market,
--      one_line_summary)
--   3. Latest non-archived repositioning audit (composite distribution,
--      systemic gaps + strengths, per-dim breakdown)
--   4. Latest non-archived calibration run (pooled + per-format metrics,
--      trust ranking, top mismatches)
--   5. Cohort composition (peer/aspirational/reference counts + avg subs)

CREATE TABLE IF NOT EXISTS client_weekly_briefs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  TEXT,        -- strategist email

  -- Source data pinning (reproducibility)
  source_audit_id             UUID REFERENCES client_repositioning_audits(id) ON DELETE SET NULL,
  source_calibration_run_id   UUID REFERENCES client_calibration_runs(id) ON DELETE SET NULL,

  -- The brief itself
  brief_markdown              TEXT NOT NULL,
  prompt_version              TEXT NOT NULL,
  model                       TEXT,        -- claude-sonnet-4-5, etc.

  -- Optional strategist title — "Q2 reset", "post-rebrand check-in", etc.
  -- NULL = use date-based default in UI ("Brief · Jun 5, 2026").
  title                       TEXT,

  -- Soft archive
  archived_at                 TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_client_weekly_briefs_client
  ON client_weekly_briefs(client_id, created_at DESC)
  WHERE archived_at IS NULL;

COMMENT ON TABLE client_weekly_briefs IS
  'Strategist-facing weekly brief — 4-5 numbered bullets, action-led, evidence-cited, calibration-aware, brand-register-appropriate. Generated on demand from the latest repositioning audit + calibration run + Spine + cohort composition. The artifact the strategist sends/reads to the client; not the underlying analytics it''s grounded in.';

COMMENT ON COLUMN client_weekly_briefs.prompt_version IS
  'Version of the brief-generation prompt used. Bump the constant in weeklyBriefService.js to invalidate cached briefs; UI lets strategist regenerate to apply the new prompt.';

ALTER TABLE client_weekly_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read weekly briefs"
  ON client_weekly_briefs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert weekly briefs"
  ON client_weekly_briefs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update weekly briefs"
  ON client_weekly_briefs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete weekly briefs"
  ON client_weekly_briefs FOR DELETE TO authenticated USING (true);
