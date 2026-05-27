-- 082: client_business_context — what the client's business actually
-- offers, so AI recommendations stay reproducible for the client.
--
-- Why this exists: opportunity-brief generation reads cohort gaps and
-- proposes content the channel could own. Without business context,
-- the AI happily suggests categories the client doesn't sell — e.g.
-- "robot vacuum comparison series" for SafeStreets (home security).
-- This table is the filter that grounds those recommendations in what
-- the client actually does and doesn't do.
--
-- Lifecycle:
--   - Strategist runs a website audit (server-side fetch of homepage +
--     a few key pages) — Claude extracts a draft.
--   - Strategist reviews and confirms (or edits, or rejects and starts
--     over).
--   - Confirmed context is loaded into spineContextService.buildSpineContext
--     so every spine-aware AI call sees it, AND specifically passed
--     into whiteSpaceService's opportunity-brief prompt as a hard
--     filter against the not_offered list.
--
-- One active row per client; previous audits move to status='superseded'
-- so we keep history for diff (e.g., client adds a product line, we
-- want to know when the context shifted).

CREATE TABLE IF NOT EXISTS client_business_context (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  status                  TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'superseded')),

  -- The extracted/authored structured fields. Plain TEXT so the
  -- strategist can edit freely; the AI sees this as prose context
  -- not as a schema to enforce.
  products_offered        TEXT,                          -- "what we sell" — the affirmative list
  products_not_offered    TEXT,                          -- "what we don't sell" — the filter (most important field)
  target_market           TEXT,                          -- audience segments, geographic scope, demographic, pricing tier
  one_line_summary        TEXT,                          -- compressed 1-sentence "this company is X for Y"

  -- Provenance — where the audit came from
  source_url              TEXT,                          -- the homepage URL the audit pulled from
  source_fetched_at       TIMESTAMPTZ,                   -- when we last fetched the source
  audit_raw_text          TEXT,                          -- raw text Claude ran on (kept for re-audit + debugging)

  -- Strategist confirmation
  confirmed_at            TIMESTAMPTZ,                   -- when the strategist approved the current version
  notes                   TEXT,                          -- strategist notes (caveats, things the website didn't show)

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active row per client. Drafts can coexist (strategist iterates
-- on the AI extraction before confirming) but only one active.
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_business_context_active
  ON client_business_context(client_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_client_business_context_client
  ON client_business_context(client_id, created_at DESC);

COMMENT ON TABLE client_business_context IS
  'Per-client business context — what the client offers and doesn''t. Filters AI-generated recommendations (opportunity briefs, positioning suggestions) against the client''s actual offer so the deliverable stops proposing categories the client cannot reproduce.';
COMMENT ON COLUMN client_business_context.products_not_offered IS
  'The filter field. AI opportunity briefs explicitly exclude recommendations in these categories. Without this, the brief recommends category gaps with no awareness of whether the client sells in that category.';

ALTER TABLE client_business_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read business context"
  ON client_business_context FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert business context"
  ON client_business_context FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update business context"
  ON client_business_context FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete business context"
  ON client_business_context FOR DELETE
  TO authenticated USING (true);
