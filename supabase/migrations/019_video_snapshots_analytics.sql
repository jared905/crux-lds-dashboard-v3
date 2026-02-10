-- Add analytics columns to video_snapshots for daily tracking
-- This enables historical trend data for impressions, CTR, watch hours, and retention

ALTER TABLE video_snapshots
ADD COLUMN IF NOT EXISTS impressions BIGINT,
ADD COLUMN IF NOT EXISTS ctr NUMERIC,
ADD COLUMN IF NOT EXISTS avg_view_percentage NUMERIC,
ADD COLUMN IF NOT EXISTS watch_hours NUMERIC,
ADD COLUMN IF NOT EXISTS subscribers_gained INTEGER;

-- Add indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_video_snapshots_impressions ON video_snapshots(impressions);
CREATE INDEX IF NOT EXISTS idx_video_snapshots_date_video ON video_snapshots(snapshot_date, video_id);

-- Comments
COMMENT ON COLUMN video_snapshots.impressions IS 'Daily impressions count from YouTube Reporting API';
COMMENT ON COLUMN video_snapshots.ctr IS 'Daily click-through rate as decimal 0-1';
COMMENT ON COLUMN video_snapshots.avg_view_percentage IS 'Daily average view percentage as decimal 0-1';
COMMENT ON COLUMN video_snapshots.watch_hours IS 'Daily watch hours';
COMMENT ON COLUMN video_snapshots.subscribers_gained IS 'Subscribers gained on this day';
