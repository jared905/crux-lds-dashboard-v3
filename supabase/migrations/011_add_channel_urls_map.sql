-- Migration 011: Add channel_urls_map JSONB column
-- Full View Analytics - Crux Media
--
-- Stores per-channel YouTube URL mappings for multi-channel clients.
-- Previously this data was only in localStorage and lost on cache clear.
-- Example: { "Elder Kearon": "https://youtube.com/@ElderKearon", "President Eyring": "https://youtube.com/@PresidentEyring" }

ALTER TABLE channels
ADD COLUMN IF NOT EXISTS channel_urls_map JSONB DEFAULT '{}'::jsonb;
