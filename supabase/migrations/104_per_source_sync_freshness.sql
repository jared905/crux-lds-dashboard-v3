-- 104: per-source sync freshness on channels
--
-- Built 2026-06-11 after diagnosing the Huevos TV "Channel: 15m ago"
-- lie (commit eb8f784). Root cause was structural, not a single bug:
-- daily-sync.js writes five distinct data sources (data API, analytics,
-- reach reporting, basic reporting, channel snapshot) per connection
-- but the channels table only tracks ONE timestamp (last_synced_at).
-- If 4 sources succeed and 1 silently fails, the row still looks fresh.
-- The freshness chip can't tell which source is stale.
--
-- This migration adds per-source freshness columns so:
--   1. The badge can show honest per-source state (Channel / Analytics /
--      Reporting / Surface — not just "Channel: Xm ago")
--   2. Silent failures get a persisted error message instead of
--      vanishing into Vercel logs
--   3. Downstream diagnostics ("why is my Watch Hours 0%?") can read
--      the actual error and surface it to the strategist
--
-- last_synced_at stays as the canonical "any sync attempted" timestamp
-- (legacy readers in portfolioService, auditIngestion, etc. continue
-- to work). Each writer should now ALSO update its per-source column.

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS last_data_api_pull_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_data_api_pull_error     TEXT,
  ADD COLUMN IF NOT EXISTS last_analytics_pull_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_analytics_pull_error    TEXT,
  ADD COLUMN IF NOT EXISTS last_reporting_pull_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reporting_pull_error    TEXT,
  ADD COLUMN IF NOT EXISTS last_surface_pull_error      TEXT;
  -- last_surface_pull_at already exists (migration 097)

COMMENT ON COLUMN channels.last_data_api_pull_at IS
  'Last successful YouTube Data API pull (channel metadata + uploads playlist). Written by sync-competitors.js syncChannel and daily-sync.js syncConnection. NULL means never pulled — distinct from "stale."';
COMMENT ON COLUMN channels.last_data_api_pull_error IS
  'Last error message from a Data API pull attempt, or NULL on success. Truncated to 500 chars. Cleared whenever a pull succeeds.';

COMMENT ON COLUMN channels.last_analytics_pull_at IS
  'Last successful YouTube Analytics API pull (per-video views, watch hours, retention, subs gained — OR channel-level fallback). Written by daily-sync.js syncConnection. NULL means never pulled.';
COMMENT ON COLUMN channels.last_analytics_pull_error IS
  'Last error message from an Analytics API pull, or NULL on success. Surfaces Brand Account dimensions=video failures and quota/scope issues. Truncated to 500 chars.';

COMMENT ON COLUMN channels.last_reporting_pull_at IS
  'Last successful YouTube Reporting API pull (impressions/CTR from reach report + views/subs/watch from basic report). Written by daily-sync.js syncConnection. NULL means never pulled — note Reporting jobs take 24-48h to produce first report after creation.';
COMMENT ON COLUMN channels.last_reporting_pull_error IS
  'Last error message from a Reporting API pull, or NULL on success. Truncated to 500 chars.';

COMMENT ON COLUMN channels.last_surface_pull_error IS
  'Last error message from a Surface Intelligence pull (traffic sources, search queries), or NULL on success. Truncated to 500 chars.';

-- Index to support the freshness dashboard "stale across channels" query
CREATE INDEX IF NOT EXISTS idx_channels_freshness_at
  ON channels(last_data_api_pull_at DESC NULLS FIRST)
  WHERE is_client = true OR is_competitor = true;
