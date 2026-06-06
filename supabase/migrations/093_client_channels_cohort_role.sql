-- 093: cohort_role on client_channels — separate peer-tier (predictive
-- ground truth) from aspirational (directional, not predictive) and
-- reference (case-study / cross-vertical observation).
--
-- Why this exists: Kendall Stahl's Calibration Phase A (shipped 2026-06-05)
-- revealed the scorer is systematically pessimistic for him — composite
-- accuracy 30%, with 24 false-negatives on Risky predictions vs only 1
-- false-positive. The hypothesis: his cohort mixes premium channels
-- (Andrei Jikh 1.6M, Erin Talks Money 100K+, Azul 33K) with peer-scale
-- advisor channels. Cohort-derived predictions reflect what works for
-- premium audiences and don't transfer to his mid-tier channel.
--
-- This migration is the MINIMUM infrastructure to test that hypothesis:
-- a tag on each cohort channel saying "use this for prediction" or
-- "this is aspirational direction, not a ground-truth peer." All
-- prediction-side services filter to role='peer'; monitoring surfaces
-- (Research, Portfolio) show every role.
--
-- After tagging Kendall's cohort + re-running his audit + calibration,
-- we'll know whether cohort-mismatch is the cause. If yes, the full
-- discovery/recommender (and Spine extension for aspirational_channels
-- declared by name) becomes the obvious next investment. If no, the
-- theory was wrong and we save ourselves building infrastructure for it.
--
-- Architecture:
--   - 'peer'         = predictive ground truth (default for all existing
--                      rows; backwards-compatible)
--   - 'aspirational' = where the client wants to grow into; directional
--                      intelligence only, NOT scored against
--   - 'reference'    = case-study / cross-vertical observation; not
--                      scored, surfaces in Research for context
--   - notes column for strategist provenance ("Andrei Jikh tagged
--     aspirational 2026-06-05 — 30x peer-tier sub count, audience tone
--     different from advisor-scale channels.")

ALTER TABLE client_channels
  ADD COLUMN IF NOT EXISTS cohort_role        TEXT NOT NULL DEFAULT 'peer'
    CHECK (cohort_role IN ('peer', 'aspirational', 'reference')),
  ADD COLUMN IF NOT EXISTS cohort_role_notes  TEXT,
  ADD COLUMN IF NOT EXISTS cohort_role_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_client_channels_role
  ON client_channels(client_id, cohort_role);

COMMENT ON COLUMN client_channels.cohort_role IS
  'Predictive role of this channel in the client''s cohort. "peer" = scored against for prediction (Pre-flight, Repositioning, Competitor Scan, Calibration). "aspirational" = where the client is growing toward; directional only, NOT predictive. "reference" = case-study channels not scored. Defaults to "peer" so existing cohorts behave identically until re-tagged.';

COMMENT ON COLUMN client_channels.cohort_role_notes IS
  'Strategist provenance for the role tag. Used when reviewing cohort composition: "Andrei Jikh tagged aspirational 2026-06-05 — 30x peer-tier sub count, audience tone different."';
