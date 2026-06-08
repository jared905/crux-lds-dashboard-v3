-- 097: per-channel data-freshness timestamps.
--
-- Why this exists: strategist visibility into "when was this actually
-- pulled" was patchy. channels.last_synced_at covers basic channel
-- sync, youtube_oauth_connections.last_refreshed_at covers OAuth token
-- refresh, but per-channel SURFACE INTELLIGENCE pulls (traffic
-- sources, search queries — what powers Pre-flight surface_fit +
-- search_keyword_match dimensions) had no per-channel timestamp.
-- Required a MAX(created_at) WHERE channel_id query against the
-- client_surface_intelligence rows, which is slow at scale and surfaced
-- nowhere.
--
-- Adds a single column on channels updated by the surface-pull
-- endpoint on every successful pull. Combined with the existing
-- last_synced_at + OAuth connection timestamps, this gives the
-- DataFreshnessBadge component one cheap multi-source query for
-- "how stale is this channel's data?"
--
-- Read pattern (used by dataFreshnessService):
--   SELECT
--     last_synced_at,        -- competitor sync cron (06:00 UTC daily)
--     last_sync_attempt_at,  -- every attempt, even failures
--     last_sync_error,       -- error message if last attempt failed
--     last_surface_pull_at   -- this column, set by surface-pull endpoint
--   FROM channels WHERE id = ...
--
--   plus (via cohortRolesService team-OAuth model):
--   SELECT last_refreshed_at, last_used_at, is_active, connection_error
--   FROM youtube_oauth_connections
--   WHERE youtube_channel_id = ... ORDER BY last_refreshed_at DESC LIMIT 1;

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS last_surface_pull_at TIMESTAMPTZ;

COMMENT ON COLUMN channels.last_surface_pull_at IS
  'When the surface-intelligence endpoint last successfully pulled traffic-source / search-query data for this channel. Powers the DataFreshnessBadge surface-fit + search-keyword-match dimensions; set by /api/youtube-analytics-surface-pull on every successful pull.';

CREATE INDEX IF NOT EXISTS idx_channels_surface_pull
  ON channels(last_surface_pull_at DESC NULLS LAST)
  WHERE last_surface_pull_at IS NOT NULL;
