-- Add average view duration column to video_snapshots
-- This stores the average view duration in seconds from YouTube Reporting API

ALTER TABLE video_snapshots
ADD COLUMN IF NOT EXISTS avg_view_duration_seconds NUMERIC;

COMMENT ON COLUMN video_snapshots.avg_view_duration_seconds IS 'Average view duration in seconds from YouTube Reporting API';
