-- 065: Full wipe of the category taxonomy + every channel assignment + any
-- saved_views that reference categories. Use this to start fresh before
-- re-building the taxonomy and re-classifying channels.
--
-- ⚠️ DESTRUCTIVE. Run the optional snapshot query (commented at the top)
--    first if you want a JSON dump in case you need to refer back.
--
-- What this does:
--   1. Delete saved_views whose config.categoryIds array is non-empty
--      (their IDs would be orphaned once categories are gone).
--   2. Delete every row from `categories`. The channel_categories junction
--      has ON DELETE CASCADE, so all assignments evaporate automatically.
--
-- What this does NOT touch:
--   - channels.category (legacy free-text column from migration 001) —
--     unused by Research v2, leaving it alone for now.
--   - channel_tags — tags are independent of the category taxonomy.
--   - The categories table itself (schema) — only the rows are removed.

-- ────────────────────────────────────────────────────────────
-- OPTIONAL: snapshot current state to JSON before wiping.
-- Run this in the Supabase SQL editor BEFORE applying the migration if
-- you want a backup. The result is a single JSON blob you can save locally.
--
--   SELECT jsonb_build_object(
--     'snapshot_at', now(),
--     'categories', (SELECT coalesce(jsonb_agg(c), '[]'::jsonb) FROM categories c),
--     'channel_categories', (SELECT coalesce(jsonb_agg(cc), '[]'::jsonb) FROM channel_categories cc),
--     'saved_views_with_categories', (
--       SELECT coalesce(jsonb_agg(sv), '[]'::jsonb)
--       FROM saved_views sv
--       WHERE jsonb_array_length(COALESCE(sv.config->'categoryIds', '[]'::jsonb)) > 0
--     )
--   ) AS snapshot;
-- ────────────────────────────────────────────────────────────

-- 1. Remove saved_views that reference category IDs
DELETE FROM saved_views
WHERE jsonb_array_length(COALESCE(config->'categoryIds', '[]'::jsonb)) > 0;

-- 2. Drop every category — channel_categories cascades automatically
DELETE FROM categories;
