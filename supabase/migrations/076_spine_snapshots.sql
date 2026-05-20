-- 076: client_strategy_spine_snapshots — point-in-time captures of a
-- client's Strategy Spine.
--
-- Why this matters: when the strategist updates quarterly_stance for
-- Q3, the Q2 stance is lost unless we archive it. The diff between
-- Q1 and Q2 IS the strategic narrative for a client renewal conversation
-- ("six months ago we believed X; we shifted to Y when the data showed
-- Z; here's what we're testing now"). Without snapshots, the spine
-- becomes a single moving point — strong for current state, but the
-- evolved-across-quarters story doesn't survive.
--
-- v1: snapshots are MANUAL — strategist clicks "Snapshot now" and
-- optionally labels it (e.g. "Q2 2026 close"). Auto-snapshotting on
-- stance change is a possible v2 if manual rhythm breaks down in
-- practice; manual gives explicit control and avoids over-firing on
-- iterative edits.
--
-- Each row is a frozen copy of the spine fields at capture time.
-- active_plays is included as JSONB so the play state at that moment
-- is preserved.

CREATE TABLE IF NOT EXISTS client_strategy_spine_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  -- When + who + label
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_by     UUID,    -- auth.users.id
  label           TEXT,    -- e.g. "Q2 2026 close", "post-rebrand pivot"
  notes           TEXT,    -- optional commentary on why this snapshot was taken

  -- Frozen spine fields
  positioning_hypothesis            TEXT,
  audience_read                     TEXT,
  quarterly_stance                  TEXT,
  quarterly_stance_label            TEXT,
  competitive_posture               TEXT,
  guardrails                        TEXT,
  active_plays                      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spine_snapshots_client_captured
  ON client_strategy_spine_snapshots(client_id, captured_at DESC);

COMMENT ON TABLE client_strategy_spine_snapshots IS
  'Point-in-time captures of client_strategy_spine. Powers the "evolved across quarters" narrative for retention conversations and onboarding new strategists. v1 captures are manual.';

-- RLS — match the team-tool pattern from the spine table itself
ALTER TABLE client_strategy_spine_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read spine snapshots"
  ON client_strategy_spine_snapshots FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert spine snapshots"
  ON client_strategy_spine_snapshots FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update spine snapshots"
  ON client_strategy_spine_snapshots FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete spine snapshots"
  ON client_strategy_spine_snapshots FOR DELETE
  TO authenticated USING (true);
