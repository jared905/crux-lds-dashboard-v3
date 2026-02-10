-- Add YouTube Reporting API job tracking columns
-- This allows us to track reporting jobs for automated impressions/CTR sync

-- Add reporting job columns to youtube_oauth_connections
ALTER TABLE youtube_oauth_connections
ADD COLUMN IF NOT EXISTS reporting_job_id TEXT,
ADD COLUMN IF NOT EXISTS reporting_job_type TEXT,
ADD COLUMN IF NOT EXISTS last_report_downloaded_at TIMESTAMPTZ;

-- Add comment
COMMENT ON COLUMN youtube_oauth_connections.reporting_job_id IS 'YouTube Reporting API job ID for automated reach reports';
COMMENT ON COLUMN youtube_oauth_connections.reporting_job_type IS 'Report type ID (e.g., channel_combined_a2)';
COMMENT ON COLUMN youtube_oauth_connections.last_report_downloaded_at IS 'Last time we downloaded a report from this job';
