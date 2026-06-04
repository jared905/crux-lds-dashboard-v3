-- 090: add executive_memo columns to client_concept_scorecards.
--
-- Why this exists: institutional brand clients (foundations, regulated
-- B2C, D2C consumer, QSR) make production decisions through stakeholder
-- approval — a Director justifies the spend to a VP, sometimes through
-- legal/compliance review. The 3-4 sentence strategic_read is the
-- producer-facing concept gate; the executive memo is the
-- stakeholder-facing justification artifact built on the same evidence
-- but reformatted for that audience.
--
-- Stored on-scorecard (not in a separate table) because:
--   - One memo per scorecard. Many-to-one is overkill.
--   - Memos invalidate when the scorecard is re-scored; co-locating
--     state keeps that lifecycle obvious.
--   - rescoreScorecard() will clear executive_memo + version + generated_at
--     in the same way it clears strategic_read.
--
-- Memo is markdown text (sections: Verdict, Hypothesis, Why now,
-- Predicted performance, Risk register, Success criteria). LLM-generated
-- via the strategic-read pattern; cached on this row so a Director can
-- copy-paste the same artifact later without re-spending LLM tokens.

ALTER TABLE client_concept_scorecards
  ADD COLUMN IF NOT EXISTS executive_memo                TEXT,
  ADD COLUMN IF NOT EXISTS executive_memo_prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS executive_memo_generated_at   TIMESTAMPTZ;

COMMENT ON COLUMN client_concept_scorecards.executive_memo IS
  'Markdown justification memo aimed at the marketing decision-maker (Director/VP). Generated on demand, not on every score — only scorecards that need stakeholder approval get one. Cleared on rescore.';

COMMENT ON COLUMN client_concept_scorecards.executive_memo_prompt_version IS
  'Version of the executive-memo prompt used to generate the cached text. Bumping the constant invalidates cached memos; UI shows the deterministic scores while regenerating.';
