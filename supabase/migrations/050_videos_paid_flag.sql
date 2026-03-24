-- 050: Add paid content flag to videos table
-- Videos are classified as paid/organic based on client-configured signals.
-- Classification runs during audit ingestion and daily sync.

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE;

-- Classification source: how the paid flag was determined
-- 'keyword_match' = matched paid_content_signals pattern
-- 'manual_override' = in paid_content_override list
-- 'unclassified' = no client signals configured
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS paid_classification_source TEXT DEFAULT 'unclassified';

-- Index for fast filtering of organic-only content
CREATE INDEX IF NOT EXISTS idx_videos_is_paid
  ON videos (channel_id, is_paid);

COMMENT ON COLUMN videos.is_paid IS 'Whether this video was distributed through paid media. Paid videos are excluded from organic baseline calculations.';
COMMENT ON COLUMN videos.paid_classification_source IS 'How the paid flag was determined: keyword_match, manual_override, or unclassified.';
