-- 108: client_diagnostic_synthesis — strategic-state synthesis per client
--
-- Built 2026-06-19 as the first ship of the Diagnostic Synthesis layer
-- (the new per-client landing). Synthesizes across persona + cohort
-- distributions + audit + calibration + recent uploads + platform
-- mechanics into a one-screen strategic-state read.
--
-- Why this exists: the strategist's job has been "mentally integrate
-- across 6 workspaces to answer 'what's the state of this engagement?'"
-- This layer does the integration once, persists the result, surfaces
-- the read as the per-client landing.
--
-- Distinct from weekly brief (which is output-shaped, "recommend the
-- next moves") and from Spine (which is configuration-shaped,
-- "declared positioning"). This is state-shaped — "here's what's
-- TRUE about this engagement right now."
--
-- One row per synthesis run. History persists for diff: "what changed
-- since the last synthesis." Re-running creates a new row, never
-- overwrites — synthesis quality is hard to recover if we destroy
-- prior versions.

CREATE TABLE IF NOT EXISTS client_diagnostic_synthesis (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  -- Lifecycle + provenance
  generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by                TEXT,
  prompt_version              TEXT NOT NULL,
  model                       TEXT,

  -- Inputs the synthesis read from. JSONB snapshot so future audits
  -- can answer "what did the synthesis actually have to work with at
  -- generation time?" — important because Spine, cohort, persona all
  -- evolve, and a synthesis from last week is only meaningful against
  -- that week's inputs.
  inputs_snapshot             JSONB,

  -- The synthesis output. Structured so the UI can render each section
  -- with provenance chips and drilldown links without re-parsing prose.
  strategic_state             TEXT,                          -- one sentence
  leverage_points             JSONB,                         -- array of {title, rationale, provenance, confidence, mechanics_cited, drilldown_tab}
  risks                       JSONB,                         -- array of {title, rationale, early_warning_signal, confidence, mechanics_cited, drilldown_tab}
  unblockers                  JSONB,                         -- array of {missing_input, where_to_provide, why_it_matters}
  changes_since_last          TEXT,                          -- diff narrative when prior synthesis exists
  notes                       TEXT,                          -- caveats, hedges, freshness notes

  -- Pre-launch awareness. Synthesis is still valuable for pre-launch
  -- clients (the Spine is rich even when channel data isn't), but the
  -- leverage/risk language differs. Persist the flag so we can read
  -- it back without joining channels every time.
  is_prelaunch_at_generation  BOOLEAN,

  -- Critique loop (Ship 3 — not in this migration's data yet but
  -- columns reserved to avoid a follow-up migration)
  draft_strategic_state       TEXT,
  critique_text               TEXT,
  revision_applied            BOOLEAN,

  -- Archive (don't delete history — synthesis revisions are
  -- diagnostically valuable even when superseded)
  archived_at                 TIMESTAMPTZ,
  archived_reason             TEXT
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_synthesis_client_recent
  ON client_diagnostic_synthesis(client_id, generated_at DESC)
  WHERE archived_at IS NULL;

COMMENT ON TABLE client_diagnostic_synthesis IS
  'Per-client strategic-state synthesis — the unifying landing layer that integrates Spine + persona + cohort distributions + audit + calibration + recent uploads + platform mechanics into one screen. State-shaped (not output-shaped like brief, not config-shaped like Spine). One row per synthesis run; history preserved for diff. Built 2026-06-19.';

COMMENT ON COLUMN client_diagnostic_synthesis.leverage_points IS
  'JSONB array, target cardinality 3. Each item: { title, rationale, provenance (which workspaces fed it), confidence (extracted|hypothesized|confirmed), mechanics_cited (array of mechanic numbers), drilldown_tab (which strategy workspace resolves it) }.';

COMMENT ON COLUMN client_diagnostic_synthesis.risks IS
  'JSONB array, target cardinality 3. Each item: { title, rationale, early_warning_signal (what would catch this risk early), confidence, mechanics_cited, drilldown_tab }.';

COMMENT ON COLUMN client_diagnostic_synthesis.unblockers IS
  'JSONB array, variable cardinality. Each item: { missing_input (what is needed), where_to_provide (which tab), why_it_matters (what unblocks if provided) }. These are the dependency-graph items that prevent the next strategist decision.';

-- ──────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────

ALTER TABLE client_diagnostic_synthesis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read synthesis"
  ON client_diagnostic_synthesis FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write synthesis"
  ON client_diagnostic_synthesis FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update synthesis"
  ON client_diagnostic_synthesis FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete synthesis"
  ON client_diagnostic_synthesis FOR DELETE TO authenticated USING (true);
