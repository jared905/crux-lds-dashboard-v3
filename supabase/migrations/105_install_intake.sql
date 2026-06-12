-- 105: client install intake (Crux Installation Instrument Part 1)
--
-- Built 2026-06-11 to embed the Crux Installation Instrument as
-- workspace infrastructure instead of leaving it as a discipline
-- document. The instrument has been refined through v1.4; this
-- migration is the structural commitment to making it the install
-- flow rather than parallel paperwork.
--
-- Per-question rows (not one JSONB blob per client) so:
--   1. Each answer carries its own provenance (client vs strategist
--      submission, with confirmation timestamp when strategist verifies
--      a client-submitted answer)
--   2. Schema changes — e.g. adding question key from a v1.5 refinement
--      — don't rewrite existing data
--   3. The future Adjudication workspace can read individual answers
--      as inputs to specific layers without un-blobbing JSONB
--
-- Token table (install_intake_tokens) drives the public client
-- pre-work surface. Strategist issues a token from the workspace,
-- client receives a URL like /intake/<token>, submits the 7
-- client-facing questions, the strategist sees the submissions
-- pre-populated in their workspace ready for confirmation.

-- ──────────────────────────────────────────────────
-- client_install_intake — per-question answer rows
-- ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_install_intake (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  -- Question key from src/lib/installIntakeQuestions.js
  -- (q1_outcome_12mo, q9_veto_map, ...). Stable across version
  -- refinements; question wording can change without breaking this FK.
  question_key                TEXT NOT NULL,

  answer_text                 TEXT,
  answer_meta                 JSONB,                         -- structured supplement (lists, dates, etc.) for future
  install_instrument_version  TEXT NOT NULL DEFAULT 'v1.4',

  -- Provenance: who submitted, when, from which surface
  source                      TEXT NOT NULL DEFAULT 'strategist'
    CHECK (source IN ('client', 'strategist', 'pre_populated')),
  submitted_by                TEXT,                          -- user identifier or 'client' for tokenized
  submitted_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Strategist confirmation of a client-submitted answer.
  -- Per the doc: client answers factual questions async; strategist
  -- confirms them during the discovery call. Confirmation is the act
  -- of saying "I asked the client and this is still right" — it
  -- doesn't overwrite the answer, just stamps the verification.
  confirmed_by_strategist_at  TIMESTAMPTZ,
  confirmed_by                TEXT,
  strategist_notes            TEXT,                          -- coaching notes the strategist captures (Q1's first-sentence verbatim, etc.)

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per (client, question). Re-submission updates the row;
  -- history is captured via updated_at + future install_intake_history
  -- table if/when audit-trail proves necessary.
  CONSTRAINT uq_client_question UNIQUE (client_id, question_key)
);

CREATE INDEX IF NOT EXISTS idx_install_intake_client_recent
  ON client_install_intake(client_id, updated_at DESC);

COMMENT ON TABLE client_install_intake IS
  'Crux Installation Instrument Part 1 — 16 intake question answers per client. Per-question rows so each carries its own source provenance (client vs strategist) and strategist confirmation timestamp. Read by the strategist install workspace and by the public tokenized pre-work page. Source doc: Installation Instrument v1.4.';

COMMENT ON COLUMN client_install_intake.source IS
  'client = submitted via tokenized pre-work page. strategist = captured by strategist in the install workspace during/after discovery call. pre_populated = auto-suggested from existing Spine/persona/business_context (strategist must confirm to commit).';

COMMENT ON COLUMN client_install_intake.confirmed_by_strategist_at IS
  'Strategist verification that a client-submitted (or pre-populated) answer is correct. Per the instrument doc: "I confirmed this with the client" is the rule — client async answers do not enter the Spine until a strategist has confirmed them in conversation.';

-- ──────────────────────────────────────────────────
-- install_intake_tokens — tokenized public access
-- ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS install_intake_tokens (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  -- Opaque token used in URLs (/intake/<token>). High-entropy
  -- (32+ chars) so guessing is computationally infeasible. Generated
  -- by the issuance API endpoint, never reused.
  token                       TEXT NOT NULL UNIQUE,

  -- Lifecycle
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  TEXT,
  expires_at                  TIMESTAMPTZ NOT NULL,          -- default issuance window is 14 days
  first_accessed_at           TIMESTAMPTZ,                   -- when the client first opened the page
  last_submitted_at           TIMESTAMPTZ,                   -- most recent successful submission
  revoked_at                  TIMESTAMPTZ,                   -- strategist can kill a leaked token
  revoke_reason               TEXT,

  -- Provenance for the client side: who the strategist intended to
  -- send this to. Useful in audit logs ("Sara at Pearl 27 submitted").
  intended_recipient_name     TEXT,
  intended_recipient_email    TEXT
);

CREATE INDEX IF NOT EXISTS idx_install_tokens_client
  ON install_intake_tokens(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_install_tokens_active
  ON install_intake_tokens(token)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE install_intake_tokens IS
  'Tokenized URLs for client pre-work submission. Strategist issues; client receives /intake/<token>; token grants WRITE access to client_install_intake rows for the named client_id, scoped to questions where client_facing=true. Tokens expire (default 14d) and can be revoked. Never reused.';

-- ──────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────

ALTER TABLE client_install_intake   ENABLE ROW LEVEL SECURITY;
ALTER TABLE install_intake_tokens   ENABLE ROW LEVEL SECURITY;

-- Strategist (authenticated) policies — same pattern as the rest of
-- the strategist-facing tables (RLS just enforces "must be logged in").
CREATE POLICY "Authenticated can read intake"
  ON client_install_intake FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write intake"
  ON client_install_intake FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update intake"
  ON client_install_intake FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete intake"
  ON client_install_intake FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can read tokens"
  ON install_intake_tokens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write tokens"
  ON install_intake_tokens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tokens"
  ON install_intake_tokens FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Public (anon) write access goes through the API endpoint with the
-- CRON_SECRET fast-path pattern we've used elsewhere — anon role does
-- NOT get write access to either table. The /api/intake/* endpoints
-- run with the service role key and validate the token before writing.
