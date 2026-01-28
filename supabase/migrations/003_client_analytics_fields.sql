-- Client Analytics Fields Migration
-- Full View Analytics - Crux Media
-- Migration 003: Add CSV-specific analytics columns to videos table

-- These fields store YouTube Studio CSV analytics data that isn't available via the API
-- CTR, retention, impressions, etc. are only available in YouTube Studio exports

ALTER TABLE videos ADD COLUMN IF NOT EXISTS impressions BIGINT DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS ctr NUMERIC;  -- Click-through rate as decimal (0-1)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS avg_view_percentage NUMERIC;  -- Average % viewed as decimal (0-1)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS subscribers_gained INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS watch_hours NUMERIC;  -- Total watch time in hours

-- Add index for analytics queries
CREATE INDEX IF NOT EXISTS idx_videos_impressions ON videos(impressions);
CREATE INDEX IF NOT EXISTS idx_videos_ctr ON videos(ctr);

-- Comment on columns for documentation
COMMENT ON COLUMN videos.impressions IS 'Number of times video thumbnail was shown (from YouTube Studio CSV)';
COMMENT ON COLUMN videos.ctr IS 'Impressions click-through rate as decimal 0-1 (from YouTube Studio CSV)';
COMMENT ON COLUMN videos.avg_view_percentage IS 'Average percentage of video watched as decimal 0-1 (from YouTube Studio CSV)';
COMMENT ON COLUMN videos.subscribers_gained IS 'Subscribers gained from this video (from YouTube Studio CSV)';
COMMENT ON COLUMN videos.watch_hours IS 'Total watch time in hours (from YouTube Studio CSV)';
