-- 064: Null out the legacy channels.client_id on competitor rows.
--
-- With Research v2, competitors are scoped by tier + categories + tags + the
-- client_channels junction table (migration 052). The single client_id column
-- on channels is no longer the source of truth for competitor↔client mapping.
--
-- This migration:
--   1. Nulls client_id on every channel where is_competitor = true.
--   2. Leaves channels.client_id intact for is_client = true rows so the OAuth
--      / Analytics flow that reads it (api/youtube-channel.js, etc.) still works.
--   3. Does NOT drop the column — that's a future migration once we're certain
--      no read path falls back to it.
--
-- Idempotent: re-running is a no-op once competitors are nulled.

UPDATE channels
SET client_id = NULL
WHERE is_competitor = true
  AND client_id IS NOT NULL;

COMMENT ON COLUMN channels.client_id IS
  'Legacy: client owner for is_client=true rows only. Competitor↔client mapping moved to client_channels (junction) in migration 052. Slated for removal after legacy CompetitorAnalysis is fully retired.';
