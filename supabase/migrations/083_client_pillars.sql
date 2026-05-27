-- 083: client_pillars — content pillars as the primary unit of channel
-- strategy.
--
-- A pillar is a repeatable creative series with a defined title,
-- description, audience, host, and per-video budget. Channels run 3
-- pillars in parallel (A/B/C rotation, A,B,C,A,B,C,...), use the
-- internal performance data as an A/B/C test, and after sufficient
-- data drop the lowest performer and add a new pillar (A/B/C → A/C/D).
--
-- Why pillars are first-class (not nested under hosts or stuffed into
-- spine):
--   - Pillars are the unit the strategist pitches in the
--     vision-alignment meeting. Each pillar gets a one-page pitch:
--     title, creative description, intended audience, budget range,
--     example. The deliverable can pre-bake these as candidates.
--   - Pillars have a lifecycle (draft → active → retired) that hosts
--     and positioning fields don't share. Tracking which pillar got
--     dropped vs which replaced it is the basis of the A/B/C test
--     feedback loop.
--   - A pillar can exist before its host is cast (the strategist might
--     define the pillar's concept before the audition happens). host_id
--     is nullable so the pillar entity isn't blocked on casting.
--
-- The relationship: channel has many pillars; each pillar may have
-- one host (or none, when the pillar is still in concept); hosts can
-- be reused across pillars if the strategist explicitly decides to.
--
-- Examples come in two shapes that often appear together on a pitch
-- slide:
--   - example_video_id: a reference video from the cohort audit that
--     exemplifies the format (Ring's doorbell-clip outlier, eufy's
--     caught-on-camera series, etc.)
--   - example_concept: a strategist-written sample title or concept
--     that illustrates what an in-channel episode would look like.

CREATE TABLE IF NOT EXISTS client_pillars (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  -- Lifecycle
  status                  TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'retired')),

  -- Pillar identity — these populate the one-page pitch slide
  title                   TEXT NOT NULL,
  creative_description    TEXT,    -- what the series IS, how it's defined, topics it covers, POV
  intended_audience       TEXT,    -- who it speaks to; pillars overlap audience but vary on interest axis (entertainment ↔ thought-leadership)

  -- Production parameters
  budget_per_video_low    INT,     -- USD; nullable when undecided
  budget_per_video_high   INT,
  rotation_position       INT,     -- A=0, B=1, C=2... drives A/B/C/A/B/C publishing schedule

  -- Optional host link. Pillars can exist before casting; setting null
  -- on host delete is the right behavior (the pillar concept survives
  -- even if the host is reassigned or removed).
  host_id                 UUID REFERENCES client_hosts(id) ON DELETE SET NULL,

  -- Reference / example — either or both
  example_video_id        UUID REFERENCES videos(id) ON DELETE SET NULL,
  example_concept         TEXT,

  -- Provenance — useful for the strategist to remember whether this
  -- pillar came from their own synthesis, a client conversation, or
  -- an existing channel pattern.
  source                  TEXT
    CHECK (source IS NULL OR source IN ('strategist', 'client_idea', 'existing_channel_pillar')),
  notes                   TEXT,

  -- UI ordering
  sort_order              INT NOT NULL DEFAULT 0,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_pillars_client
  ON client_pillars(client_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_client_pillars_client_status
  ON client_pillars(client_id, status);

COMMENT ON TABLE client_pillars IS
  'Content pillars — repeatable creative series that anchor a channel''s production strategy. Each pillar is one slide in the strategist''s pitch deck. Channels typically run 3 pillars on an A/B/C rotation; lowest performer gets dropped after data and a new pillar replaces it.';
COMMENT ON COLUMN client_pillars.intended_audience IS
  'Free-text description of who the pillar speaks to. Pillars on the same channel SHOULD have overlapping audience but VARY on interest axis (e.g., entertainment ↔ thought-leadership). The strategist names the axis position in this field.';
COMMENT ON COLUMN client_pillars.rotation_position IS
  'Position in the A/B/C publishing rotation. 0 = A (first published in a cycle), 1 = B, 2 = C. NULL when the pillar is still draft / not yet in active rotation.';

ALTER TABLE client_pillars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pillars"
  ON client_pillars FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert pillars"
  ON client_pillars FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update pillars"
  ON client_pillars FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete pillars"
  ON client_pillars FOR DELETE
  TO authenticated USING (true);
