-- 111: audience_breakdowns — the "who/where/how" layer of the audience
-- deep-dive (2026-08-20 request).
--
-- Stores channel-level YouTube Analytics API breakdowns that the public
-- API actually offers: geography (country), device type, subscribed
-- status, and traffic source — each optionally split by content format
-- (creatorContentType: shorts vs long-form). Synced nightly by
-- /api/cron/audience-sync for every channel with an active OAuth
-- connection; each sync covers a rolling window and upserts on the
-- natural key, so re-runs are idempotent.
--
-- Deliberately NOT stored: "new vs returning viewers" and the
-- shorts→long-form viewer journey. Those are YouTube Studio-only —
-- the public Analytics API does not expose them, and we don't fake
-- Studio-only numbers. The dashboard says so instead.

CREATE TABLE IF NOT EXISTS audience_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  -- Which report this row came from:
  --   'country' | 'deviceType' | 'subscribedStatus' | 'insightTrafficSourceType'
  dimension TEXT NOT NULL,
  -- The dimension's value as returned by the API ('US', 'MOBILE',
  -- 'SUBSCRIBED', 'RELATED_VIDEO', ...)
  dimension_value TEXT NOT NULL,

  -- Content-format slice: 'all', or 'shorts' / 'longform' / 'live'
  -- when the creatorContentType split succeeded for this dimension.
  format TEXT NOT NULL DEFAULT 'all',

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  views BIGINT NOT NULL DEFAULT 0,
  watch_minutes NUMERIC NOT NULL DEFAULT 0,
  avg_view_duration_seconds NUMERIC,

  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (channel_id, dimension, dimension_value, format, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_audience_breakdowns_channel_dim
  ON audience_breakdowns (channel_id, dimension, period_end DESC);

ALTER TABLE audience_breakdowns ENABLE ROW LEVEL SECURITY;

-- Reads: any authenticated user (same posture as the other analytics
-- tables — client scoping happens at the app layer via channel access).
-- Writes: service role only (the sync endpoint).
DROP POLICY IF EXISTS audience_breakdowns_select ON audience_breakdowns;
CREATE POLICY audience_breakdowns_select
  ON audience_breakdowns FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS audience_breakdowns_service_write ON audience_breakdowns;
CREATE POLICY audience_breakdowns_service_write
  ON audience_breakdowns FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Self-verification ────────────────────────────────────────────────
DO $$
DECLARE
  policy_count INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'audience_breakdowns'
  ) THEN
    RAISE EXCEPTION 'audience_breakdowns table missing after migration';
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies WHERE tablename = 'audience_breakdowns';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'audience_breakdowns expected 2 policies, found %', policy_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audience_breakdowns' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'audience_breakdowns RLS not enabled';
  END IF;

  RAISE NOTICE 'migration 111 verified: table + RLS + % policies', policy_count;
END $$;
