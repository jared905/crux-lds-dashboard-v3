-- 094: per-format metrics on client_calibration_runs.
--
-- Why this exists: Kendall's calibration after the cohort_role peer
-- swap (2026-06-05, audit 8:52 PM, calibration 8:53 PM) revealed the
-- cohort-mismatch theory was only partially correct. Composite exact
-- accuracy stayed flat at 29% (vs 30% before), and the scorer
-- correctly identified 0 of 44 actual top-quartile videos.
--
-- The structural pattern: every high-traffic mismatch was a SHORTS
-- video. Slot scored "Risky" but reality was "Very likely." Hypothesis:
-- slot dimension applies long-form Browse logic to a Shorts feed
-- environment that's algorithmically distributed rather than slot-
-- driven. The scorer's failure mode may be format-specific.
--
-- Format-split calibration: derive actual_tier WITHIN each format pool
-- (top 25% of shorts vs top 25% of long-form, not pooled) and compute
-- separate per-format metrics. If shorts calibration is materially
-- worse than long-form, the scorer needs format-specific composite
-- weighting — and the failure isn't a single broken dimension, it's
-- using long-form rules in a Shorts context.
--
-- Architecture:
--   - One calibration run produces BOTH pooled metrics (existing
--     columns) AND per-format metrics (new column). Strategist can
--     view either via UI toggle without re-running.
--   - per_format_metrics shape:
--       {
--         shorts:    { n, composite_metrics, per_dimension_metrics, mismatched_videos },
--         long_form: { n, composite_metrics, per_dimension_metrics, mismatched_videos }
--       }
--     Each format block has the same shape as the existing pooled
--     metrics — same downstream rendering, just a different pool.
--   - format_split_enabled flag so the UI knows whether to surface
--     the toggle. Existing rows have NULL per_format_metrics; UI
--     gracefully falls back to pooled-only.

ALTER TABLE client_calibration_runs
  ADD COLUMN IF NOT EXISTS per_format_metrics     JSONB,
  ADD COLUMN IF NOT EXISTS format_split_enabled   BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN client_calibration_runs.per_format_metrics IS
  'Format-split calibration metrics. Shape: { shorts: { n, composite_metrics, per_dimension_metrics, mismatched_videos }, long_form: { same } }. Each format block computes actual_tier within its own video pool — top 25% of shorts vs top 25% of long-form, not pooled. Surfaces whether the scorer fails format-specifically (e.g., slot logic appropriate for long-form Browse but wrong for Shorts feed). NULL on runs without format split computed.';

COMMENT ON COLUMN client_calibration_runs.format_split_enabled IS
  'Whether this calibration run computed per-format metrics. UI uses this to decide whether to surface the pooled/shorts/long-form view toggle. FALSE for legacy rows.';
