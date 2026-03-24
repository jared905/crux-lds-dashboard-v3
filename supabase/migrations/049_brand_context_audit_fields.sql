-- 049: Extend brand_context for audit redesign
-- Adds paid content classification signals, brand intent intake,
-- and strategic context fields.

-- Paid content classification (per-client, configurable)
-- paid_content_signals: array of keywords/patterns to match against video titles/descriptions
-- e.g. [":15", ":30", "OLV", "GM"] for QSR, ["sponsored", "paid partnership"] for others
ALTER TABLE brand_context
  ADD COLUMN IF NOT EXISTS paid_content_signals JSONB DEFAULT '[]'::jsonb;

-- Manual override: specific video IDs flagged as paid regardless of keyword match
ALTER TABLE brand_context
  ADD COLUMN IF NOT EXISTS paid_content_override JSONB DEFAULT '[]'::jsonb;

-- Brand intent: what the client says they want YouTube to do for them
-- Captured at audit intake, before data analysis begins
ALTER TABLE brand_context
  ADD COLUMN IF NOT EXISTS brand_intent TEXT;

-- Who internally is driving the direction
ALTER TABLE brand_context
  ADD COLUMN IF NOT EXISTS brand_intent_stakeholder TEXT;

-- Optional: timeline/campaign pressure context
ALTER TABLE brand_context
  ADD COLUMN IF NOT EXISTS brand_intent_timeline TEXT;

-- Optional: content already in production
ALTER TABLE brand_context
  ADD COLUMN IF NOT EXISTS brand_intent_in_production TEXT;

-- Strategic goals (may already be in the JSONB, but explicit column is clearer for queries)
ALTER TABLE brand_context
  ADD COLUMN IF NOT EXISTS strategic_goals JSONB DEFAULT '{}'::jsonb;

-- Resource constraints (same reasoning)
ALTER TABLE brand_context
  ADD COLUMN IF NOT EXISTS resource_constraints JSONB DEFAULT '{}'::jsonb;

-- Content boundaries (topics to avoid, compliance, tone)
ALTER TABLE brand_context
  ADD COLUMN IF NOT EXISTS content_boundaries JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN brand_context.paid_content_signals IS 'Array of keyword/pattern strings to identify paid/boosted content in video titles or descriptions. Configured per client.';
COMMENT ON COLUMN brand_context.paid_content_override IS 'Array of YouTube video IDs manually flagged as paid content regardless of keyword match.';
COMMENT ON COLUMN brand_context.brand_intent IS 'What the client says they want YouTube to do for them. Captured at audit intake before analysis.';
COMMENT ON COLUMN brand_context.brand_intent_stakeholder IS 'Who internally is driving the brand intent direction.';
