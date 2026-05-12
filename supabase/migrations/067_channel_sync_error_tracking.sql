-- 067: Track sync failures on the channels row.
--
-- Today the sync writes errors to its response payload but doesn't persist
-- them, so persistently failing channels look "stale" with no visible reason.
-- This makes failures queryable and gives the UI somewhere to read from.
--
-- Columns:
--   last_sync_attempt_at — updated on every sync attempt, success or failure
--   last_sync_error      — error message from the last failed attempt; nulled on success
--
-- Diagnostic query (after the next sync runs):
--   SELECT name, custom_url, last_sync_error, last_sync_attempt_at
--   FROM channels
--   WHERE last_sync_error IS NOT NULL
--   ORDER BY last_sync_attempt_at DESC;

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS last_sync_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

CREATE INDEX IF NOT EXISTS idx_channels_sync_error
  ON channels(last_sync_attempt_at DESC)
  WHERE last_sync_error IS NOT NULL;

COMMENT ON COLUMN channels.last_sync_attempt_at IS
  'Updated on every sync attempt regardless of outcome. Compare against last_synced_at to find channels failing to sync.';
COMMENT ON COLUMN channels.last_sync_error IS
  'Error message from the last failed sync attempt. NULL means last attempt succeeded.';
