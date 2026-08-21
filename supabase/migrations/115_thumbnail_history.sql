-- 115: video_thumbnail_history — packaging change detection
-- (expert-review data-roadmap item #1, built 2026-08-21).
--
-- YouTube serves a video's CURRENT thumbnail from a stable URL, so the
-- URL never reveals a swap. The nightly sync therefore fetches the
-- image bytes and stores a content hash; a new hash for a known video
-- means the creator changed the packaging on that date. That signal —
-- "thumbnail changed here" — is what CTR analysis and the timeline
-- annotations need. (Archiving the image bytes themselves is a later
-- storage-bucket decision; hashes alone date every change.)

CREATE TABLE IF NOT EXISTS video_thumbnail_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_video_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  thumbnail_url TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (youtube_video_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_thumbnail_history_video
  ON video_thumbnail_history (youtube_video_id, captured_at DESC);

ALTER TABLE video_thumbnail_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS thumbnail_history_select ON video_thumbnail_history;
CREATE POLICY thumbnail_history_select
  ON video_thumbnail_history FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS thumbnail_history_service_write ON video_thumbnail_history;
CREATE POLICY thumbnail_history_service_write
  ON video_thumbnail_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Self-verification ────────────────────────────────────────────────
DO $$
DECLARE policy_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_thumbnail_history') THEN
    RAISE EXCEPTION 'video_thumbnail_history missing after migration';
  END IF;
  SELECT count(*) INTO policy_count FROM pg_policies WHERE tablename = 'video_thumbnail_history';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'video_thumbnail_history expected 2 policies, found %', policy_count;
  END IF;
  RAISE NOTICE 'migration 115 verified: table + RLS + % policies', policy_count;
END $$;
