-- 114: channel_annotations — timeline markers (expert-review item,
-- built 2026-08-21).
--
-- "We changed the thumbnail style here", "new editor started", "went
-- weekly" — without markers, causality on the Momentum chart is
-- invisible. One row per event; rendered as markers on any time chart.

CREATE TABLE IF NOT EXISTS channel_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  annotation_date DATE NOT NULL,
  label TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_annotations_channel_date
  ON channel_annotations (channel_id, annotation_date);

ALTER TABLE channel_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_annotations_select ON channel_annotations;
CREATE POLICY channel_annotations_select
  ON channel_annotations FOR SELECT TO authenticated USING (true);

-- Strategists write these from the app (authenticated session).
DROP POLICY IF EXISTS channel_annotations_write ON channel_annotations;
CREATE POLICY channel_annotations_write
  ON channel_annotations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Self-verification ────────────────────────────────────────────────
DO $$
DECLARE policy_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel_annotations') THEN
    RAISE EXCEPTION 'channel_annotations missing after migration';
  END IF;
  SELECT count(*) INTO policy_count FROM pg_policies WHERE tablename = 'channel_annotations';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'channel_annotations expected 2 policies, found %', policy_count;
  END IF;
  RAISE NOTICE 'migration 114 verified: table + RLS + % policies', policy_count;
END $$;
