-- Migration 032: Extend competitor_insights for channel/client-level intelligence
-- Supports new insight types: audience_topics, thumbnail_pattern, title_suggestions, series_concepts

-- Allow channel-level insights (no specific video)
ALTER TABLE competitor_insights ALTER COLUMN video_id DROP NOT NULL;

-- Add client_id for client-scoped insights
ALTER TABLE competitor_insights ADD COLUMN IF NOT EXISTS client_id TEXT;

-- Drop old unique constraint and create flexible one
ALTER TABLE competitor_insights DROP CONSTRAINT IF EXISTS competitor_insights_video_id_insight_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_insights_flexible_unique
  ON competitor_insights (
    COALESCE(video_id::text, ''),
    COALESCE(channel_id::text, ''),
    COALESCE(client_id, ''),
    insight_type
  );

-- Index for client-scoped lookups
CREATE INDEX IF NOT EXISTS idx_competitor_insights_client ON competitor_insights(client_id);
CREATE INDEX IF NOT EXISTS idx_competitor_insights_type ON competitor_insights(insight_type);

-- Widen briefs source_type to include new intelligence types
ALTER TABLE briefs DROP CONSTRAINT IF EXISTS briefs_source_type_check;
ALTER TABLE briefs ADD CONSTRAINT briefs_source_type_check
  CHECK (source_type IN (
    'creative_brief', 'atomizer', 'manual', 'competitor_inspired',
    'opportunity_synthesis', 'gap_detection',
    'title_lab', 'series_idea', 'thumbnail_insight'
  ));
