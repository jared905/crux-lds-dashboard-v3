-- 079: positioning_oneliner — the single-sentence channel articulation.
--
-- The headline of the Positioning Recommendation section of the audit
-- deliverable (CRUX two-part artifact, section 02). It compresses the
-- multi-paragraph positioning_hypothesis into one sentence a client can
-- repeat, paste into a deck, or stick on the wall.
--
-- Why a separate field (not just "the first line of positioning_hypothesis"):
--   - The hypothesis is reasoning; the one-liner is product.
--   - Strategist can AI-suggest from hypothesis + spine context + audit
--     findings without losing the longer-form reasoning behind it.
--   - The deliverable renders this prominently; the hypothesis is the
--     working document underneath.
--
-- App-side guidance: ≤120 chars, but enforced in the UI rather than at
-- the DB level so longer drafts can be saved mid-edit.

ALTER TABLE client_strategy_spine
  ADD COLUMN IF NOT EXISTS positioning_oneliner            TEXT,
  ADD COLUMN IF NOT EXISTS positioning_oneliner_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN client_strategy_spine.positioning_oneliner IS
  'Single-sentence channel articulation. The headline of the Positioning Recommendation section of the audit deliverable. AI-suggested from positioning_hypothesis + editorial_pov + voice_tone, strategist-approved.';

-- Mirror into snapshots so renewal-narrative diffs can show how the
-- one-liner evolved between snapshots.
ALTER TABLE client_strategy_spine_snapshots
  ADD COLUMN IF NOT EXISTS positioning_oneliner TEXT;
