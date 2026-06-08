-- 099: extend channels.created_via CHECK constraint to allow 'prelaunch'.
--
-- Migration 009 set the constraint to:
--   CHECK (created_via IN ('manual', 'competitor_import', 'audit', 'csv_upload'))
--
-- The pre-launch client flow (migration 098 + prelaunchClientService)
-- writes 'prelaunch' as the created_via for placeholder clients —
-- distinct provenance so we can audit "which clients came in pre-launch
-- and have since upgraded vs which are still placeholders." That value
-- needs to be in the allowed list.
--
-- Standard Postgres pattern: drop the existing constraint, re-add with
-- the extended list. IF EXISTS guards so the migration is idempotent.

ALTER TABLE channels
  DROP CONSTRAINT IF EXISTS channels_created_via_check;

ALTER TABLE channels
  ADD CONSTRAINT channels_created_via_check
  CHECK (created_via IN ('manual', 'competitor_import', 'audit', 'csv_upload', 'prelaunch'));

COMMENT ON COLUMN channels.created_via IS
  'Origin of channel row: manual (strategist-added), competitor_import (bulk import from research), audit (came in through an audit ingest, may have is_competitor=null), csv_upload (CSV-driven client creation), prelaunch (created via the pre-launch flow before the client had a real YouTube channel; youtube_channel_id is a placeholder_<uuid> until upgradeToRealChannel runs).';
