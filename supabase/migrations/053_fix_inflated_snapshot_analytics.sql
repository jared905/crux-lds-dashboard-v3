-- 053: Fix inflated snapshot analytics data
--
-- The daily-sync cron was fetching the YouTube Analytics API with dimensions=video
-- (no day dimension), which returned 7-day aggregated totals per video.
-- That aggregate was stored as a single day's snapshot, inflating view_count,
-- watch_hours, subscribers_gained, and avg_view_percentage.
--
-- This migration nulls out the Analytics API columns on all existing snapshots
-- so the next sync can repopulate them with correct per-day values.
--
-- Columns NOT affected (already per-day from Reporting API):
--   impressions, ctr, likes, comments, shares, subscribers_lost
--
-- Cumulative columns (total_view_count, total_like_count, total_comment_count)
-- are left intact — they come from the Data API and were never aggregated.

-- Only reset snapshots for OAuth-synced channels (the ones using the Analytics API).
-- These are identified by having a youtube_oauth_connections row.
-- Competitor channels write cumulative view_count directly from the Data API
-- and are NOT affected by this bug.
UPDATE video_snapshots vs
SET
  view_count = NULL,
  watch_hours = NULL,
  subscribers_gained = NULL,
  avg_view_percentage = NULL
FROM videos v
JOIN channels c ON c.id = v.channel_id
JOIN youtube_oauth_connections yoc ON yoc.youtube_channel_id = c.youtube_channel_id
WHERE vs.video_id = v.id;
