-- 055: Add second reporting job for channel_basic_a2 reports
-- The existing reporting_job_id points to a channel_reach_basic_a1 job
-- (impressions/CTR only). The basic job provides views, watch time,
-- subscribers, likes, comments, shares per video per day.

ALTER TABLE youtube_oauth_connections
ADD COLUMN IF NOT EXISTS basic_reporting_job_id TEXT,
ADD COLUMN IF NOT EXISTS basic_reporting_job_type TEXT;

COMMENT ON COLUMN youtube_oauth_connections.basic_reporting_job_id IS 'YouTube Reporting API job ID for basic video reports (views, subs, watch time)';
COMMENT ON COLUMN youtube_oauth_connections.basic_reporting_job_type IS 'Report type ID (e.g., channel_basic_a2)';
