-- 051: Add duration-based paid content rules to brand_context
-- Allows flagging videos as paid based on duration (e.g. 15s and 30s non-Short videos are often ads)
-- Each rule: { min: seconds, max: seconds, scope: "non_short" | "all" | "long_form" }

ALTER TABLE brand_context
  ADD COLUMN IF NOT EXISTS paid_duration_rules JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN brand_context.paid_duration_rules IS 'Array of duration rules for paid content detection. Each rule: { min, max, scope }. Videos matching duration range + scope are flagged as paid.';
