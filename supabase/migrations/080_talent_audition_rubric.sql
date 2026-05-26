-- 080: client_talent_audition_rubric — the operational artifact of
-- Part 02 of the audit deliverable.
--
-- A rubric is a per-client scorecard the client uses to audition
-- on-camera talent against the channel's host_archetype + voice_tone +
-- editorial_pov. The AI proposes criteria specific to THIS client (not
-- a generic template) from the spine; the strategist edits and
-- approves; the client prints it and scores candidates against it
-- during auditions.
--
-- Why persistent (one row per client, active vs superseded):
--   - Rubric is a living document — refines as the channel's POV
--     sharpens or the host role changes.
--   - History matters: when a client says "we hired Sarah against the
--     v1 rubric, why did v3 introduce the X criterion?", the answer is
--     in the superseded rows.
--   - One row active at a time so audit pack + print scorecard always
--     have a single source of truth.
--
-- criteria JSONB shape:
--   [
--     {
--       "name": "Editorial Voice Fit",
--       "what_excellence_looks_like": "string — what 5/5 looks like for THIS channel",
--       "disqualifier": "string — what knocks a candidate out regardless of other strengths",
--       "scoring_anchors": { "1": "...", "3": "...", "5": "..." },
--       "weight": "high" | "medium" | "low"
--     },
--     ...
--   ]

CREATE TABLE IF NOT EXISTS client_talent_audition_rubric (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded')),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Strategist-facing intro at the top of the printable scorecard. One
  -- short paragraph that frames why these criteria, in the channel's
  -- own voice. Optional — rubric works without it.
  intro_note      TEXT,

  -- Array of criterion objects (shape above). Opaque JSONB so the shape
  -- can evolve without migration.
  criteria        JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Source spine fields at generation time — for diff against the
  -- current spine later ("rubric was generated against an older host
  -- archetype, regenerate?"). Snapshot the inputs, not derived values.
  source_spine_fingerprint JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active row per client at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_talent_rubric_active
  ON client_talent_audition_rubric(client_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_talent_rubric_client_generated
  ON client_talent_audition_rubric(client_id, generated_at DESC);

COMMENT ON TABLE client_talent_audition_rubric IS
  'Talent audition rubric — per-client scorecard for auditioning on-camera talent. Closes Part 02 of the audit deliverable. AI-generated from the spine, strategist-approved, printed for use during auditions.';
COMMENT ON COLUMN client_talent_audition_rubric.criteria IS
  'Array of criterion objects: { name, what_excellence_looks_like, disqualifier, scoring_anchors{1,3,5}, weight }. Opaque so shape can evolve.';
COMMENT ON COLUMN client_talent_audition_rubric.source_spine_fingerprint IS
  'Snapshot of the spine fields used to generate this rubric (host_archetype, voice_tone, editorial_pov, positioning_oneliner). Enables drift detection between rubric and current spine.';

ALTER TABLE client_talent_audition_rubric ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read talent rubrics"
  ON client_talent_audition_rubric FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert talent rubrics"
  ON client_talent_audition_rubric FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update talent rubrics"
  ON client_talent_audition_rubric FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete talent rubrics"
  ON client_talent_audition_rubric FOR DELETE
  TO authenticated USING (true);
