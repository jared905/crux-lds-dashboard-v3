-- Migration 010: Reclassify YouTube Shorts
-- Full View Analytics - Crux Media
--
-- Fixes historical misclassification where:
--   1. Videos 61-180s were labeled 'long' but may be Shorts (YouTube increased max to 3min in Oct 2024)
--   2. Videos <=60s were labeled 'short' by duration alone, even if they're regular uploads
--
-- For YouTube-sourced videos: sets is_short = NULL to flag for re-verification via HEAD request on next sync.
-- For CSV-sourced videos: updates threshold from 60s to 180s.
-- Videos >180s are definitively NOT Shorts.

-- ============================================
-- Step 1: Videos 61-180s currently classified as 'long' may actually be Shorts.
-- Flag for re-check by setting is_short = NULL.
-- ============================================
UPDATE videos
SET is_short = NULL
WHERE duration_seconds > 60
  AND duration_seconds <= 180
  AND video_type = 'long'
  AND youtube_video_id NOT LIKE 'csv_%'
  AND youtube_video_id NOT LIKE 'client_%';

-- ============================================
-- Step 2: Videos <=60s currently marked as 'short' might not be actual Shorts.
-- Flag for re-check by setting is_short = NULL.
-- ============================================
UPDATE videos
SET is_short = NULL
WHERE duration_seconds <= 60
  AND video_type = 'short'
  AND youtube_video_id NOT LIKE 'csv_%'
  AND youtube_video_id NOT LIKE 'client_%';

-- ============================================
-- Step 3: Videos >180s are definitively NOT Shorts. Ensure correct classification.
-- ============================================
UPDATE videos
SET video_type = 'long', is_short = false
WHERE duration_seconds > 180
  AND (video_type = 'short' OR is_short = true OR is_short IS NULL);

-- ============================================
-- Step 4: CSV-sourced videos: update threshold from 60s to 180s.
-- ============================================
UPDATE videos
SET video_type = CASE
      WHEN duration_seconds > 0 AND duration_seconds <= 180 THEN 'short'
      ELSE 'long'
    END,
    is_short = (duration_seconds > 0 AND duration_seconds <= 180)
WHERE youtube_video_id LIKE 'csv_%'
   OR youtube_video_id LIKE 'client_%';
