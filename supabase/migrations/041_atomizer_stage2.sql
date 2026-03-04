-- 041: Atomizer Stage 2 — Edited transcript + deploy tracking
-- Adds columns for the two-stage atomizer architecture.
-- Stage 1 saves direction discovery; Stage 2 adds production package.

ALTER TABLE atomized_content ADD COLUMN IF NOT EXISTS edited_transcript TEXT;
ALTER TABLE atomized_content ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ;
