-- 100: audience_persona on client_strategy_spine.
--
-- Why this exists (2026-06-09): Crux scored content against cohort
-- patterns without ever knowing the audience. We had audience signals
-- scattered across declared (Spine.audience_read free text, business
-- context.target_market) and captured (surface intelligence search
-- queries) but no single synthesized object that downstream LLM calls
-- could read.
--
-- This migration adds a structured persona to the Spine. Same load
-- pattern as the existing positioning_hypothesis / voice_tone fields —
-- everything that already reads the Spine inherits the persona
-- automatically (brief generator, alternative titles, strategic-read,
-- executive memo).
--
-- Shape of audience_persona JSONB:
--   {
--     "pain_points":         [...],   -- specific anxieties / decisions
--     "motivations":         [...],   -- what they're seeking from your content
--     "questions_asked":     [...],   -- recurring search queries / comment Qs in their own words
--     "voice_patterns":      [...],   -- how they talk about your space
--     "trust_signals":       [...],   -- what builds vs erodes credibility for them
--     "adjacent_interests":  [...],   -- what else they engage with
--     "synthesis_sources":   [...],   -- which inputs fed this synthesis (provenance)
--     "evidence":            {        -- per-field evidence pointers for source-evidence display
--       "pain_points": [
--         { "claim": "...", "evidence_type": "search_query", "evidence_value": "..." }
--       ]
--     }
--   }
--
-- evidence is for the source-evidence UI section — each persona claim
-- can cite specific search queries / pillar mentions that backed it.

ALTER TABLE client_strategy_spine
  ADD COLUMN IF NOT EXISTS audience_persona              JSONB,
  ADD COLUMN IF NOT EXISTS audience_persona_synthesized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audience_persona_prompt_version TEXT;

COMMENT ON COLUMN client_strategy_spine.audience_persona IS
  'Structured persona synthesized from search queries (surface intelligence), Spine fields, pillars, and business context. Consumed silently by brief generator, alternative titles, strategic-read, and executive memo. Editable in the Audience workspace at Strategy → Audience.';

COMMENT ON COLUMN client_strategy_spine.audience_persona_synthesized_at IS
  'Last time the persona was auto-synthesized. Manual edits in the UI do NOT update this — only fresh syntheses do. Drives the "Persona is N days old, want to re-synthesize?" prompt.';

COMMENT ON COLUMN client_strategy_spine.audience_persona_prompt_version IS
  'Version of the synthesis prompt used to generate the persona. Bumping the constant invalidates the persona; UI re-prompts for synthesis on next view.';
