-- 116: video_organic_overrides — human corrections to the media-buy heuristic
-- (2026-08-21, user request).
--
-- The organic filter flags likely-promoted videos heuristically (huge views
-- with near-zero engagement). Heuristics get individual videos wrong in both
-- directions, so a strategist who KNOWS a video was organic (or promoted)
-- can pin that fact. An override always beats the heuristic:
--   is_promoted = true   → video is filtered out in Organic-only mode
--   is_promoted = false  → video always counts as organic
-- Deleting the row returns the video to heuristic judgement.

CREATE TABLE IF NOT EXISTS video_organic_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL,
  video_key TEXT NOT NULL,
  is_promoted BOOLEAN NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, video_key)
);

CREATE INDEX IF NOT EXISTS idx_organic_overrides_channel
  ON video_organic_overrides (channel_id);

ALTER TABLE video_organic_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organic_overrides_select ON video_organic_overrides;
CREATE POLICY organic_overrides_select
  ON video_organic_overrides FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS organic_overrides_write ON video_organic_overrides;
CREATE POLICY organic_overrides_write
  ON video_organic_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Self-verification ────────────────────────────────────────────────
DO $$
DECLARE policy_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_organic_overrides') THEN
    RAISE EXCEPTION 'video_organic_overrides missing after migration';
  END IF;
  SELECT count(*) INTO policy_count FROM pg_policies WHERE tablename = 'video_organic_overrides';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'video_organic_overrides expected 2 policies, found %', policy_count;
  END IF;
  RAISE NOTICE 'migration 116 verified: table + RLS + % policies', policy_count;
END $$;
