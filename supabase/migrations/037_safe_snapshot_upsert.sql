-- 037: Safe video snapshot upsert — COALESCE-based to never overwrite non-null with null
--
-- The Reporting API backfill writes impressions/CTR but lacks views (for reach reports).
-- A plain upsert was overwriting accurate Analytics API view_count with NULL estimates.
-- This RPC uses COALESCE so supplementary data only fills gaps, never clobbers.

CREATE OR REPLACE FUNCTION upsert_video_snapshots_safe(snapshots JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected INTEGER;
BEGIN
  INSERT INTO video_snapshots (
    video_id, snapshot_date, view_count, impressions, ctr,
    watch_hours, avg_view_percentage, subscribers_gained,
    subscribers_lost, likes, comments, shares,
    avg_view_duration_seconds,
    total_view_count, total_like_count, total_comment_count
  )
  SELECT
    (s->>'video_id')::uuid,
    (s->>'snapshot_date')::date,
    (s->>'view_count')::bigint,
    (s->>'impressions')::bigint,
    (s->>'ctr')::numeric,
    (s->>'watch_hours')::numeric,
    (s->>'avg_view_percentage')::numeric,
    (s->>'subscribers_gained')::integer,
    (s->>'subscribers_lost')::integer,
    (s->>'likes')::integer,
    (s->>'comments')::integer,
    (s->>'shares')::integer,
    (s->>'avg_view_duration_seconds')::numeric,
    (s->>'total_view_count')::bigint,
    (s->>'total_like_count')::bigint,
    (s->>'total_comment_count')::bigint
  FROM jsonb_array_elements(snapshots) AS s
  ON CONFLICT (video_id, snapshot_date)
  DO UPDATE SET
    view_count             = COALESCE(EXCLUDED.view_count,             video_snapshots.view_count),
    impressions            = COALESCE(EXCLUDED.impressions,            video_snapshots.impressions),
    ctr                    = COALESCE(EXCLUDED.ctr,                    video_snapshots.ctr),
    watch_hours            = COALESCE(EXCLUDED.watch_hours,            video_snapshots.watch_hours),
    avg_view_percentage    = COALESCE(EXCLUDED.avg_view_percentage,    video_snapshots.avg_view_percentage),
    subscribers_gained     = COALESCE(EXCLUDED.subscribers_gained,     video_snapshots.subscribers_gained),
    subscribers_lost       = COALESCE(EXCLUDED.subscribers_lost,       video_snapshots.subscribers_lost),
    likes                  = COALESCE(EXCLUDED.likes,                  video_snapshots.likes),
    comments               = COALESCE(EXCLUDED.comments,               video_snapshots.comments),
    shares                 = COALESCE(EXCLUDED.shares,                 video_snapshots.shares),
    avg_view_duration_seconds = COALESCE(EXCLUDED.avg_view_duration_seconds, video_snapshots.avg_view_duration_seconds),
    total_view_count       = COALESCE(EXCLUDED.total_view_count,       video_snapshots.total_view_count),
    total_like_count       = COALESCE(EXCLUDED.total_like_count,       video_snapshots.total_like_count),
    total_comment_count    = COALESCE(EXCLUDED.total_comment_count,    video_snapshots.total_comment_count);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
