-- 056: Channel content type for Atomizer
-- Persists content type per channel so the Atomizer skips auto-detection on repeat runs.
-- NULL = auto-detect on first analysis, then prompt user to confirm.

ALTER TABLE channels ADD COLUMN IF NOT EXISTS atomizer_content_type TEXT;

ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_atomizer_content_type_check;
ALTER TABLE channels ADD CONSTRAINT channels_atomizer_content_type_check
  CHECK (atomizer_content_type IS NULL OR atomizer_content_type IN (
    'faith', 'brand', 'thought_leadership', 'documentary',
    'entertainment', 'kids', 'tutorial', 'interview'
  ));
