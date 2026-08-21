-- 112: get_daily_channel_views — real daily views series for the
-- Momentum chart (2026-08-20 Stitch-mockup round).
--
-- video_snapshots already stores per-video per-day view_count from the
-- Reporting API / Data-API deltas; the dashboard just had no way to sum
-- it by day (PostgREST can't GROUP BY). This RPC returns one row per
-- snapshot date across the given channels. The frontend falls back to
-- publish-day bucketing (the old chart behaviour, honestly labelled)
-- when this function is missing or returns nothing.

CREATE OR REPLACE FUNCTION get_daily_channel_views(
  channel_ids UUID[],
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  snapshot_date DATE,
  views BIGINT,
  watch_hours NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.snapshot_date,
    COALESCE(SUM(s.view_count), 0)::BIGINT AS views,
    COALESCE(SUM(s.watch_hours), 0)::NUMERIC AS watch_hours
  FROM video_snapshots s
  JOIN videos v ON v.id = s.video_id
  WHERE v.channel_id = ANY(channel_ids)
    AND s.snapshot_date >= start_date
    AND s.snapshot_date <= end_date
  GROUP BY s.snapshot_date
  ORDER BY s.snapshot_date;
$$;

GRANT EXECUTE ON FUNCTION get_daily_channel_views(UUID[], DATE, DATE) TO authenticated;

-- ── Self-verification ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_daily_channel_views'
  ) THEN
    RAISE EXCEPTION 'get_daily_channel_views missing after migration';
  END IF;
  -- Smoke-call with an empty set: must not error.
  PERFORM * FROM get_daily_channel_views(ARRAY[]::UUID[], CURRENT_DATE - 7, CURRENT_DATE);
  RAISE NOTICE 'migration 112 verified: get_daily_channel_views callable';
END $$;
