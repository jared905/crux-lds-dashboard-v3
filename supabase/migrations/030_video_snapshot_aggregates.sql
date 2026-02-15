-- 030: Video Snapshot Aggregates RPC
-- Returns per-video performance aggregated from daily snapshots for a date range.
-- Used by the dashboard to show actual period performance instead of lifetime stats.
--
-- Views are computed two ways (best available):
--   1. SUM(view_count) — daily views from Analytics API (preferred, but may be NULL)
--   2. MAX(total_view_count) - MIN(total_view_count) — delta from Data API cumulative counts
-- This ensures views are available even when the Analytics API data is missing.

CREATE OR REPLACE FUNCTION get_video_snapshot_aggregates(
  channel_ids UUID[],
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  video_id UUID,
  youtube_video_id TEXT,
  title TEXT,
  published_at TIMESTAMPTZ,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  video_type TEXT,
  content_source TEXT,
  views BIGINT,
  watch_hours NUMERIC,
  subscribers_gained BIGINT,
  impressions BIGINT,
  ctr NUMERIC,
  avg_view_percentage NUMERIC,
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  snapshot_days BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    v.id AS video_id,
    v.youtube_video_id,
    v.title,
    v.published_at,
    v.thumbnail_url,
    v.duration_seconds,
    v.video_type,
    v.content_source,
    -- Views: prefer daily Analytics API sum, fall back to cumulative Data API delta
    COALESCE(
      NULLIF(SUM(vs.view_count), 0),
      GREATEST(MAX(vs.total_view_count) - MIN(vs.total_view_count), 0)
    ) AS views,
    COALESCE(SUM(vs.watch_hours), 0) AS watch_hours,
    COALESCE(SUM(vs.subscribers_gained), 0) AS subscribers_gained,
    COALESCE(SUM(vs.impressions), 0) AS impressions,
    CASE
      WHEN SUM(vs.impressions) > 0
      THEN SUM(vs.ctr * vs.impressions) / SUM(vs.impressions)
      ELSE NULL
    END AS ctr,
    CASE
      WHEN COALESCE(SUM(vs.view_count), 0) > 0
      THEN SUM(vs.avg_view_percentage * vs.view_count) / SUM(vs.view_count)
      ELSE v.avg_view_percentage
    END AS avg_view_percentage,
    COALESCE(SUM(vs.likes), 0) AS likes,
    COALESCE(SUM(vs.comments), 0) AS comments,
    COALESCE(SUM(vs.shares), 0) AS shares,
    COUNT(vs.id) AS snapshot_days
  FROM videos v
  JOIN video_snapshots vs ON vs.video_id = v.id
  WHERE v.channel_id = ANY(channel_ids)
    AND vs.snapshot_date >= start_date
    AND vs.snapshot_date <= end_date
  GROUP BY v.id, v.youtube_video_id, v.title, v.published_at,
           v.thumbnail_url, v.duration_seconds, v.video_type, v.content_source,
           v.avg_view_percentage
  HAVING SUM(vs.view_count) > 0 OR SUM(vs.impressions) > 0
    OR (MAX(vs.total_view_count) - MIN(vs.total_view_count)) > 0
  ORDER BY COALESCE(
    NULLIF(SUM(vs.view_count), 0),
    GREATEST(MAX(vs.total_view_count) - MIN(vs.total_view_count), 0)
  ) DESC;
$$;
