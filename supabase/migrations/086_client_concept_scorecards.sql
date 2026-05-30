-- 086: client_concept_scorecards — pre-flight scorecards for video
-- concepts. The strategist enters a concept (title + format + slot +
-- length + optional topic) and gets back a deterministic scorecard
-- computed against the client's cohort audit data: title-pattern
-- lifts, slot lifts from the cadence heatmap, length-bucket lifts,
-- topic saturation classification, and a composite 4-tier rating
-- with suggested tweaks. An LLM "strategic read" pass layers a 3–4
-- sentence narrative on top.
--
-- Why a table (not ephemeral):
--   - Strategists iterate on title variants — comparing scorecards
--     side-by-side IS the workflow.
--   - Producers see the scorecard that justified each greenlit pillar.
--   - Phase 4 will mine published-video outcomes against pre-flight
--     scorecards to calibrate the predictor; the history is training data.
--
-- Architecture:
--   - input is the strategist's concept as a JSONB blob.
--   - scores is the deterministic per-dimension breakdown (also JSONB).
--   - composite_tier is denormalized for fast list-and-sort by rating.
--   - cohort_data_at pins the timestamp of the audit data the scorecard
--     was computed against, so old scorecards stay reproducible after
--     the audit refreshes (UI can flag "scored against stale cohort
--     data — re-score against current?").
--   - pillar_id is optional — scoring is useful before a pillar exists
--     (exploring concepts) and after (validating a pillar's pitch
--     videos). NULL means "exploratory, not tied to a pillar yet".
--
-- Input shape (JSONB):
--   {
--     "title": "How to install your first SafeStreets system",
--     "format": "long_form" | "shorts",
--     "planned_day": "Mon" | ... | "Sun",
--     "planned_hour_block": "12am-6am" | "6am-12pm" | "12pm-6pm" | "6pm-12am",
--     "length_seconds": 720,           -- long-form only; null for shorts
--     "topic_label": "installation walkthroughs",   -- optional
--     "notes": "..."                   -- strategist freeform, optional
--   }
--
-- Scores shape (JSONB):
--   {
--     "title_patterns": {
--       "matched": [
--         { "pattern": "all_caps_word", "lift_pct": 72, "confidence": "statistical", "n": 41 },
--         { "pattern": "contains_question_mark", "lift_pct": 42, "confidence": "statistical", "n": 64,
--           "format_skew_warning": "80% Shorts — lift may not transfer to long-form" }
--       ],
--       "composite_lift_pct": 95,
--       "tier": "very_likely_outperform" | "likely_solid" | "risky" | "predicted_under"
--     },
--     "slot": {
--       "day": "Wed", "block": "6am-12pm",
--       "lift_pct": 90, "n": 30, "confidence": "statistical",
--       "tier": "very_likely_outperform"
--     },
--     "length": {                       -- long-form only; omitted for shorts
--       "bucket": "8-15min", "lift_pct": 636, "n": 25, "confidence": "directional",
--       "tier": "risky"                 -- directional = treat as hypothesis, not commitment
--     },
--     "topic": {                        -- present only when topic_label given
--       "label": "installation walkthroughs",
--       "saturation": "gap" | "moderate" | "saturated",
--       "cohort_share_pct": 1.2,
--       "tier": "very_likely_outperform"
--     }
--   }
--
-- Suggested tweaks shape (JSONB array):
--   [
--     { "dimension": "slot", "suggestion": "Shift to Wed 6am-12pm",
--       "projected_lift_pct": 90, "from_tier": "risky", "to_tier": "likely_solid" },
--     { "dimension": "title_patterns", "suggestion": "Drop the colon",
--       "projected_lift_pct": 58, "from_tier": "risky", "to_tier": "likely_solid" }
--   ]

CREATE TABLE IF NOT EXISTS client_concept_scorecards (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                       UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  pillar_id                       UUID REFERENCES client_pillars(id) ON DELETE SET NULL,

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                      TEXT,            -- email of the strategist; nullable

  -- Input concept (see header for shape)
  input                           JSONB NOT NULL,

  -- Deterministic scoring output (see header for shape)
  scores                          JSONB NOT NULL,
  composite_tier                  TEXT NOT NULL
    CHECK (composite_tier IN ('very_likely_outperform','likely_solid','risky','predicted_under')),
  composite_rationale             TEXT,
  suggested_tweaks                JSONB,           -- array; see header

  -- LLM strategic read (cached, regenerated when prompt_version bumps)
  strategic_read                  TEXT,
  strategic_read_prompt_version   TEXT,            -- e.g. 'v1-scorer-strategic-read'

  -- Reproducibility — pin the cohort context this scorecard was scored against
  cohort_window_days              INTEGER NOT NULL DEFAULT 90,
  cohort_data_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Soft archive (strategists rarely delete — they hide stale drafts)
  archived_at                     TIMESTAMPTZ
);

-- Fast listing per client, newest first, archived hidden by default.
CREATE INDEX IF NOT EXISTS idx_client_concept_scorecards_client
  ON client_concept_scorecards(client_id, created_at DESC)
  WHERE archived_at IS NULL;

-- Fast lookup of all scorecards exploring a specific pillar.
CREATE INDEX IF NOT EXISTS idx_client_concept_scorecards_pillar
  ON client_concept_scorecards(pillar_id, created_at DESC)
  WHERE pillar_id IS NOT NULL AND archived_at IS NULL;

-- Filter by composite tier ("show me the very-likely-outperform drafts").
CREATE INDEX IF NOT EXISTS idx_client_concept_scorecards_tier
  ON client_concept_scorecards(client_id, composite_tier, created_at DESC)
  WHERE archived_at IS NULL;

COMMENT ON TABLE client_concept_scorecards IS
  'Pre-flight scorecards for video concepts. Strategist enters a concept; the scorer service computes deterministic per-dimension scores against the client''s cohort audit data plus a 4-tier composite rating. An LLM strategic-read pass adds a 3-4 sentence narrative. Persisted with history so strategists can compare title variants and producers can audit greenlight decisions.';

COMMENT ON COLUMN client_concept_scorecards.input IS
  'Strategist''s concept input: { title, format (shorts|long_form), planned_day (Mon-Sun), planned_hour_block (12am-6am|6am-12pm|12pm-6pm|6pm-12am), length_seconds (long-form only), topic_label (optional, from cohort topics), notes (optional freeform) }.';

COMMENT ON COLUMN client_concept_scorecards.scores IS
  'Deterministic per-dimension scores: title_patterns (matched patterns + lift + confidence + format-skew warnings), slot (day/block lift from cadence heatmap), length (bucket lift, long-form only), topic (saturation classification). Each dimension carries its own tier; the top-level composite_tier composes them.';

COMMENT ON COLUMN client_concept_scorecards.cohort_data_at IS
  'Timestamp of the cohort audit data this scorecard was computed against. Scorecards stay reproducible after the audit refreshes — surfaced in UI so the strategist knows when scores would be stale and can re-score against current data.';

COMMENT ON COLUMN client_concept_scorecards.pillar_id IS
  'Optional FK to the pillar this concept is exploring. NULL = exploratory concept not tied to a specific pillar yet. Pillar deletion sets this to NULL rather than cascading — historical scorecards stay for audit and Phase-4 calibration.';

COMMENT ON COLUMN client_concept_scorecards.strategic_read_prompt_version IS
  'Version of the LLM strategic-read prompt this narrative was generated with. Bump the prompt version constant and the strategic_read becomes stale; UI shows the deterministic scores while regenerating in the background.';

ALTER TABLE client_concept_scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read concept scorecards"
  ON client_concept_scorecards FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert concept scorecards"
  ON client_concept_scorecards FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update concept scorecards"
  ON client_concept_scorecards FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete concept scorecards"
  ON client_concept_scorecards FOR DELETE
  TO authenticated USING (true);
