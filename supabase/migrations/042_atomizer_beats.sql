-- Atomizer V3: Beat analysis + subscores + recut
-- Adds structural beat analysis to transcripts and subscoring/recut to atomized_content

ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS beat_analysis JSONB;

ALTER TABLE atomized_content ADD COLUMN IF NOT EXISTS subscores JSONB;
ALTER TABLE atomized_content ADD COLUMN IF NOT EXISTS recut_data JSONB;
ALTER TABLE atomized_content ADD COLUMN IF NOT EXISTS recut_generated_at TIMESTAMPTZ;
