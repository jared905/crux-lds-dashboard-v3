-- 075: Add `competitive_posture` to client_strategy_spine.
--
-- This is the one-line strategic interpretation that should display
-- as a banner ANYWHERE in the app the strategist is looking at this
-- client's competitive set — most notably Research v2 / Landscape Lens.
--
-- Distinction from positioning_hypothesis:
--   - positioning_hypothesis = "what this channel competes on" (long-arc)
--   - competitive_posture    = "how we're choosing to differentiate from
--                                this specific cohort right now" (tactical
--                                reading layered on the cohort data)
--
-- Without this, a strategist (or a future teammate) looking at Research v2
-- cohort data has only raw signal — they'll draw their own conclusions,
-- which may diverge from the team's actual stance. The banner makes the
-- interpretive layer pervasive across the dashboard.

ALTER TABLE client_strategy_spine
  ADD COLUMN IF NOT EXISTS competitive_posture            TEXT,
  ADD COLUMN IF NOT EXISTS competitive_posture_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN client_strategy_spine.competitive_posture IS
  'One-line strategic interpretation of the cohort: how this client is choosing to differentiate from the competitive set. Surfaced as a banner inside Research v2 / Landscape Lens so the cohort data is never read in interpretive isolation.';
