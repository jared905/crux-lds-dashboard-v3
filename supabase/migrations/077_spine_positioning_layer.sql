-- 077: Three new spine fields completing the Positioning Recommendation layer.
--
-- These complete what the client-facing "Positioning Recommendation" section
-- of the audit deliverable needs (per the CRUX two-part artifact structure):
--   - editorial_pov  = the channel's POV + mission statement
--   - voice_tone     = how it sounds (separate from guardrails which is what
--                      it must NOT do; voice_tone is the affirmative pattern)
--   - host_archetype = the on-camera persona archetype that feeds the talent
--                      audition rubric. Distinct from cohort archetype
--                      (creator-led / brand-owned / institutional) which is
--                      about HOW a channel is structured. Host archetype is
--                      about WHO is on screen and how they relate to viewers.
--
-- Each gets the same per-field updated_at pattern as positioning + audience +
-- stance for drift detection later.

ALTER TABLE client_strategy_spine
  ADD COLUMN IF NOT EXISTS editorial_pov              TEXT,
  ADD COLUMN IF NOT EXISTS editorial_pov_updated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voice_tone                 TEXT,
  ADD COLUMN IF NOT EXISTS voice_tone_updated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS host_archetype             TEXT,
  ADD COLUMN IF NOT EXISTS host_archetype_updated_at  TIMESTAMPTZ;

COMMENT ON COLUMN client_strategy_spine.editorial_pov IS
  'Channel-level POV and mission. Answers "what does this channel believe, and why does it exist?" Distinct from positioning_hypothesis (competitive thesis); this is the editorial soul.';
COMMENT ON COLUMN client_strategy_spine.voice_tone IS
  'Affirmative voice + tone description (what the channel sounds like). Distinct from guardrails which lists what it must NOT do; voice_tone is the positive pattern.';
COMMENT ON COLUMN client_strategy_spine.host_archetype IS
  'Talent/host archetype that feeds the audition rubric. Distinct from cohort archetype (creator-led / brand-owned / etc which is structural). Examples: The Authority, The Storyteller, The Companion, The Showman, The Practitioner, The Sage.';

-- Mirror the same fields into the snapshots table so quarterly snapshots
-- preserve the positioning layer too (otherwise renewal-narrative diffs
-- would be incomplete).
ALTER TABLE client_strategy_spine_snapshots
  ADD COLUMN IF NOT EXISTS editorial_pov   TEXT,
  ADD COLUMN IF NOT EXISTS voice_tone      TEXT,
  ADD COLUMN IF NOT EXISTS host_archetype  TEXT;
