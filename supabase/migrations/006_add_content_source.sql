-- Migration 006: Add content_source column to videos table
-- Full View Analytics - Crux Media
--
-- This column stores the original "Content" column value from YouTube Studio CSV exports.
-- For multi-channel clients, this differentiates which sub-channel each video belongs to.

ALTER TABLE videos ADD COLUMN IF NOT EXISTS content_source TEXT;

-- Add index for filtering by content source (channel dropdown feature)
CREATE INDEX IF NOT EXISTS idx_videos_content_source ON videos(content_source);

-- Comment for documentation
COMMENT ON COLUMN videos.content_source IS 'Original channel name from CSV Content column - used for multi-channel client filtering';
