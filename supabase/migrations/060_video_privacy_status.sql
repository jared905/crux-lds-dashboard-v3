-- 060: Add privacy_status to videos for filtering private/unlisted/scheduled uploads
--
-- Without this, videos with 0 views/0 impressions (because they aren't public)
-- get flagged as "underperforming" in AI-generated reports.
-- Populated by daily-sync from YouTube Data API's status.privacyStatus field.
-- Values: 'public' | 'unlisted' | 'private' | NULL (unknown/not yet synced)

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS privacy_status TEXT;

CREATE INDEX IF NOT EXISTS idx_videos_privacy_status ON videos(privacy_status);

COMMENT ON COLUMN videos.privacy_status IS
  'YouTube privacy_status: public, unlisted, private, or NULL if not yet synced. Filter to public only for performance analysis.';
