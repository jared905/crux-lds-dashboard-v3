-- 107: persist draft + critique alongside the final brief
--
-- Built 2026-06-12 with the Commit B brief-quality upgrade
-- (v6-weekly-brief-distributions-critic). Generation is now a
-- three-call loop: draft → critique → revise. The final brief is
-- still the load-bearing artifact, but the draft and critique are
-- diagnostically valuable:
--
--   - Comparing draft vs final shows what the critic actually moved
--   - Reading the critic surfaces failure patterns we can fold back
--     into prompt rules (the next prompt-rule batch starts here)
--   - "Show critique" UI lets the strategist see exactly which
--     hypothesis labels and persona-coverage notes the system caught
--
-- All three columns are nullable: pre-v6 briefs stay untouched, and
-- future revisions that skip the critique pass (when the draft is
-- clean) leave critique_markdown NULL with revision_applied=false.

ALTER TABLE client_weekly_briefs
  ADD COLUMN IF NOT EXISTS draft_markdown      TEXT,
  ADD COLUMN IF NOT EXISTS critique_markdown   TEXT,
  ADD COLUMN IF NOT EXISTS revision_applied    BOOLEAN;

COMMENT ON COLUMN client_weekly_briefs.draft_markdown IS
  'The v1 draft produced by the brief writer before the critique pass. Null for pre-v6 briefs and for briefs persisted by callers that don''t pass it through. The final brief is brief_markdown; this column is for diagnostic comparison only.';

COMMENT ON COLUMN client_weekly_briefs.critique_markdown IS
  'The critique produced by the adversarial reviewer pass — a numbered list of flagged issues (unlabeled hypotheses, persona coverage gaps, platform-heuristics misses, etc.) OR the literal string "NO MATERIAL ISSUES" when the draft was clean. Null for pre-v6 briefs.';

COMMENT ON COLUMN client_weekly_briefs.revision_applied IS
  'True when the critique was non-empty and the writer ran a revise pass to integrate it. False when the draft was already clean (no critique applied — brief_markdown == draft_markdown). Null for pre-v6 briefs.';
