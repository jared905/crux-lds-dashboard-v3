-- 029: Performance Feedback Loop
-- Adds outcome tracking to briefs and widens source_type CHECK

-- Add outcome tracking columns
ALTER TABLE briefs
  ADD COLUMN IF NOT EXISTS linked_video_id TEXT,
  ADD COLUMN IF NOT EXISTS outcome_data JSONB;

-- Widen source_type CHECK to include all current sources
ALTER TABLE briefs DROP CONSTRAINT IF EXISTS briefs_source_type_check;
ALTER TABLE briefs ADD CONSTRAINT briefs_source_type_check
  CHECK (source_type IN (
    'creative_brief', 'atomizer', 'manual', 'competitor_inspired',
    'opportunity_synthesis', 'gap_detection'
  ));
