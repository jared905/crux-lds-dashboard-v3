-- 072: Add `guardrails` to client_strategy_spine.
--
-- Guardrails are the explicit "do not recommend / do not generate" rules
-- for a client. Sensitive topics, vetoed formats, off-limits framings,
-- things already tried and rejected.
--
-- Why this is a first-class field, not free-form notes:
-- Every AI generation in the app (audit briefing, intelligence brief,
-- video ideation, creative brief, competitor synthesis) prepends a
-- formatted spine context block to its prompt. The guardrails section
-- of that block is the only place where "do not" rules become
-- load-bearing. Without this column, a strategists vetoes only live
-- in their head and the AI keeps re-suggesting rejected work.

ALTER TABLE client_strategy_spine
  ADD COLUMN IF NOT EXISTS guardrails             TEXT,
  ADD COLUMN IF NOT EXISTS guardrails_updated_at  TIMESTAMPTZ;

COMMENT ON COLUMN client_strategy_spine.guardrails IS
  'Explicit do-not-recommend rules for this client. Prepended to every AI generation prompt. Examples: doctrinal sensitivities, vetoed formats, off-limits topics, recommendations already tried and rejected.';
