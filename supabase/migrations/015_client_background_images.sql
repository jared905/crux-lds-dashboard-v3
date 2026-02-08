-- Client Background Images
-- Full View Analytics - Crux Media
-- Migration 015: Add background image URL for client branding

-- Add background image column to channels table
ALTER TABLE channels
ADD COLUMN IF NOT EXISTS background_image_url TEXT;

-- Comment
COMMENT ON COLUMN channels.background_image_url IS 'URL to a hero/background image for client branding on the dashboard';
