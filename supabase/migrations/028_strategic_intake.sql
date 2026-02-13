-- 028_strategic_intake.sql
-- Adds strategic intake fields to brand_context: goals, resource constraints, content boundaries.
-- These are manually entered (not Claude-extracted) and enrich AI outputs with client strategy.

ALTER TABLE brand_context
  ADD COLUMN IF NOT EXISTS strategic_goals JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resource_constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_boundaries JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN brand_context.strategic_goals IS 'Client YouTube strategy: growth targets, business objectives, KPIs, current phase. Manually entered from client conversations.';
COMMENT ON COLUMN brand_context.resource_constraints IS 'Production capacity: publishing cadence, team size, budget tier, talent availability, turnaround time. Manually entered.';
COMMENT ON COLUMN brand_context.content_boundaries IS 'Content guardrails: topics to avoid, format constraints, compliance/legal, sponsorship guidelines, tone boundaries. Manually entered.';
