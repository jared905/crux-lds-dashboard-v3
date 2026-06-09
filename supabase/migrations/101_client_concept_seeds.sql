-- 101: client_concept_seeds — concept ideas generated from audience persona.
--
-- Why this exists (2026-06-09): the audience persona shipped in
-- migration 100 surfaces the audience's actual questions. The natural
-- next step is converting those questions into concrete video concepts
-- the strategist can score in Pre-flight and produce. This table holds
-- those generated concepts as a lightweight queue.
--
-- Each seed entry is one video concept generated from the audience
-- persona. The strategist can:
--   - Mark seeds 'archived' (rejected) without losing the audit trail
--   - Mark seeds 'scored' once they've been run through Pre-flight
--   - Mark seeds 'filmed' once they've been produced
--
-- Series-format candidate flag: each seed includes
-- is_series_candidate (boolean) + series_rationale (text). System
-- defaults to standalone discoverability-optimized concepts; series
-- candidates require affirmative evidence in the persona/cohort AND
-- include the rationale for WHY standalone might still be the better
-- call. The strategist makes the final call.
--
-- Future expansion (not in v1):
--   - source = 'cohort_signal' (concepts derived from competitor gaps)
--   - source = 'calibration_mismatch' (concepts derived from
--     high-traffic videos that scored as risky/under)
--   - concept_id linking to a saved Pre-flight scorecard

CREATE TABLE IF NOT EXISTS client_concept_seeds (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  TEXT,            -- strategist email
  source                      TEXT NOT NULL DEFAULT 'audience_persona'
    CHECK (source IN ('audience_persona', 'cohort_signal', 'calibration_mismatch', 'manual')),
  generation_batch_id         UUID,            -- groups seeds generated in one "Generate seeds" click

  -- Core concept content
  title                       TEXT NOT NULL,
  hook                        TEXT,            -- the 0-15s opening that makes the viewer stay
  outline                     TEXT,            -- 3-5 sentence outline of what the video covers
  format_hint                 TEXT NOT NULL DEFAULT 'either'
    CHECK (format_hint IN ('shorts', 'long_form', 'either')),
  estimated_length_minutes    NUMERIC,         -- nullable; only for long_form when known

  -- Persona linkage — which persona claim(s) this concept answers
  addresses_persona_claim     TEXT,            -- specific persona field + claim (e.g., "questions_asked: How do I...")
  addresses_evidence          JSONB,           -- raw evidence: { "field": "questions_asked", "value": "..." }

  -- Series-format candidate flag — defaults FALSE. Only set TRUE with
  -- affirmative evidence in the prompt rationale.
  is_series_candidate         BOOLEAN NOT NULL DEFAULT FALSE,
  series_rationale            TEXT,            -- when is_series_candidate=TRUE: why this could series AND why standalone might still be better
  series_position             INTEGER,         -- when grouped with other series-candidate seeds: 1, 2, 3...

  -- Lifecycle
  status                      TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scored', 'filmed', 'archived')),
  scorecard_id                UUID REFERENCES client_concept_scorecards(id) ON DELETE SET NULL,
  archived_at                 TIMESTAMPTZ,
  archived_reason             TEXT
);

CREATE INDEX IF NOT EXISTS idx_concept_seeds_client_recent
  ON client_concept_seeds(client_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_concept_seeds_status
  ON client_concept_seeds(client_id, status, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_concept_seeds_batch
  ON client_concept_seeds(generation_batch_id)
  WHERE generation_batch_id IS NOT NULL;

COMMENT ON TABLE client_concept_seeds IS
  'Concept ideas generated from audience persona / cohort signal / calibration mismatches. v1 ships persona-driven seeds only. Strategist scores promising seeds in Pre-flight (scorecard_id linkage) and marks filmed seeds as such.';

COMMENT ON COLUMN client_concept_seeds.is_series_candidate IS
  'TRUE only when there is affirmative evidence in persona or cohort that a series format would serve the audience better than standalone discoverability-optimized concepts. Default FALSE: standalone discoverability is the safe baseline for new channels and B2B/consultative audiences. series_rationale must explain BOTH why this could series AND why standalone might still be better.';

ALTER TABLE client_concept_seeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read concept seeds"
  ON client_concept_seeds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert concept seeds"
  ON client_concept_seeds FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update concept seeds"
  ON client_concept_seeds FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete concept seeds"
  ON client_concept_seeds FOR DELETE TO authenticated USING (true);
