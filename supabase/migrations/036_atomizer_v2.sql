-- 036: Atomizer V2 — Edit Directions + Remix Support
-- All changes are additive. Existing data is untouched.

-- ============================================================================
-- PART A: Expand atomized_content content_type CHECK
-- ============================================================================

ALTER TABLE atomized_content
  DROP CONSTRAINT IF EXISTS atomized_content_content_type_check;

ALTER TABLE atomized_content
  ADD CONSTRAINT atomized_content_content_type_check
  CHECK (content_type IN (
    'clip', 'short', 'quote',
    'long_form_direction', 'short_form_direction'
  ));

-- ============================================================================
-- PART B: New nullable columns on atomized_content for V2 directions
-- ============================================================================

ALTER TABLE atomized_content ADD COLUMN IF NOT EXISTS title_variations JSONB;
ALTER TABLE atomized_content ADD COLUMN IF NOT EXISTS thumbnail_suggestion JSONB;
ALTER TABLE atomized_content ADD COLUMN IF NOT EXISTS description_text TEXT;
ALTER TABLE atomized_content ADD COLUMN IF NOT EXISTS arc_summary TEXT;
ALTER TABLE atomized_content ADD COLUMN IF NOT EXISTS direction_metadata JSONB;

-- ============================================================================
-- PART C: Expand briefs source_type CHECK to include 'remix'
-- ============================================================================

ALTER TABLE briefs
  DROP CONSTRAINT IF EXISTS briefs_source_type_check;

ALTER TABLE briefs
  ADD CONSTRAINT briefs_source_type_check
  CHECK (source_type IN (
    'creative_brief', 'atomizer', 'manual', 'competitor_inspired',
    'opportunity_synthesis', 'gap_detection',
    'remix'
  ));

ALTER TABLE briefs ADD COLUMN IF NOT EXISTS remix_sources JSONB;
