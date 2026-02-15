-- 031: Add cumulative view count to video_snapshots
-- The Data API provides reliable cumulative view counts daily.
-- Period views can be computed as: MAX(total_view_count) - MIN(total_view_count)
-- This works even when the Analytics API (which provides daily views) is unavailable.

ALTER TABLE video_snapshots
  ADD COLUMN IF NOT EXISTS total_view_count BIGINT,
  ADD COLUMN IF NOT EXISTS total_like_count BIGINT,
  ADD COLUMN IF NOT EXISTS total_comment_count BIGINT;

COMMENT ON COLUMN video_snapshots.total_view_count IS 'Cumulative lifetime view count from YouTube Data API (for delta calculation)';
COMMENT ON COLUMN video_snapshots.total_like_count IS 'Cumulative lifetime like count from YouTube Data API';
COMMENT ON COLUMN video_snapshots.total_comment_count IS 'Cumulative lifetime comment count from YouTube Data API';
