-- 054: Use accurate view counts that match YouTube Studio
--
-- Priority for views:
--   1. For videos published within the date range: use lifetime view_count
--      (all views happened in-period, so lifetime = period views)
--   2. total_view_count delta across snapshots (for older videos)
--   3. SUM(view_count) from reach reports (partial fallback)

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
    -- Views: best available source
    COALESCE(
      -- 1. Videos published in-period: lifetime = period views (matches YouTube Studio)
      CASE WHEN v.published_at >= start_date::timestamptz THEN NULLIF(v.view_count, 0) END,
      -- 2. Older videos: delta of cumulative counts across date range
      NULLIF(GREATEST(MAX(vs.total_view_count) - MIN(vs.total_view_count), 0), 0),
      -- 3. Reach-report views (only impression-sourced, ~40% of total)
      NULLIF(SUM(vs.view_count), 0),
      0
    ) AS views,
    COALESCE(NULLIF(SUM(vs.watch_hours), 0), v.watch_hours) AS watch_hours,
    COALESCE(NULLIF(SUM(vs.subscribers_gained), 0), v.subscribers_gained) AS subscribers_gained,
    COALESCE(NULLIF(SUM(vs.impressions), 0), v.impressions) AS impressions,
    CASE
      WHEN SUM(vs.impressions) > 0
      THEN SUM(vs.ctr * vs.impressions) / SUM(vs.impressions)
      ELSE v.ctr
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
           v.avg_view_percentage, v.watch_hours, v.subscribers_gained,
           v.impressions, v.ctr, v.view_count
  HAVING SUM(vs.view_count) > 0 OR SUM(vs.impressions) > 0
    OR (MAX(vs.total_view_count) - MIN(vs.total_view_count)) > 0
    OR (v.published_at >= start_date::timestamptz AND v.view_count > 0)
  ORDER BY COALESCE(
    CASE WHEN v.published_at >= start_date::timestamptz THEN NULLIF(v.view_count, 0) END,
    NULLIF(GREATEST(MAX(vs.total_view_count) - MIN(vs.total_view_count), 0), 0),
    NULLIF(SUM(vs.view_count), 0),
    0
  ) DESC;
$$;
