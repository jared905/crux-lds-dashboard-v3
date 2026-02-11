-- 022_brand_context.sql
-- Brand context storage for enriching Claude API outputs with non-YouTube brand intelligence.
-- Each row is a point-in-time snapshot; is_current = true marks the active one.

CREATE TABLE IF NOT EXISTS brand_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  snapshot_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  source_urls JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand_voice JSONB NOT NULL DEFAULT '{}'::jsonb,
  messaging_priorities JSONB NOT NULL DEFAULT '{}'::jsonb,
  audience_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_themes JSONB NOT NULL DEFAULT '{}'::jsonb,
  visual_identity JSONB NOT NULL DEFAULT '{}'::jsonb,
  platform_presence JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_extraction TEXT,
  extraction_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one current snapshot per channel
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_context_current
  ON brand_context (channel_id) WHERE is_current = TRUE;

-- Fast lookups by channel
CREATE INDEX IF NOT EXISTS idx_brand_context_channel_id
  ON brand_context (channel_id);

-- Historical snapshot queries
CREATE INDEX IF NOT EXISTS idx_brand_context_snapshot
  ON brand_context (channel_id, snapshot_date DESC);

-- Reuse existing update_updated_at trigger function from migration 001
CREATE TRIGGER brand_context_updated_at
  BEFORE UPDATE ON brand_context
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE brand_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon"
  ON brand_context FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated"
  ON brand_context FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE brand_context IS 'Stores structured brand intelligence extracted from website/social content. Injected into Claude prompts for brand-aware outputs.';
COMMENT ON COLUMN brand_context.is_current IS 'Only one row per channel_id should have is_current = true (enforced by partial unique index).';
COMMENT ON COLUMN brand_context.raw_extraction IS 'Full Claude extraction output preserved for reprocessing with newer models.';
