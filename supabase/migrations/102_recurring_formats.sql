-- 102: recurring_formats — replace serialized-series concept with
-- recurring creative-execution patterns (podcast, talking-head expert
-- breakdown, react/response, interview, tutorial, etc.).
--
-- Why this exists (2026-06-09): migration 101 modeled "series" as
-- serialized episodes (Ep. 1, 2, 3 narrative continuity). That was the
-- wrong frame. The right frame for content strategy is:
--   Pillars (topics)  ×  Recurring formats (creative executions)  →  Individual concept seeds
--
-- A recurring format is a production pattern the audience comes to
-- recognize and expect — "the weekly CMO conversation," "the monthly
-- expert breakdown," "the talking-head explainer" — each entry standing
-- alone for discoverability but sharing creative DNA.
--
-- Difference from pillars:
--   - Pillars = recurring TOPICS (already in client_pillars)
--   - Recurring formats = recurring CREATIVE EXECUTIONS
--   - One pillar may host multiple formats; one format may serve
--     multiple pillars.
--
-- Difference from individual concept seeds:
--   - A recurring format is a TEMPLATE / pattern for many videos
--   - An individual seed is one specific video — it may slot into a
--     recurring format or stand alone

-- ──────────────────────────────────────────────────
-- Drop the serialized-series columns from migration 101.
-- ──────────────────────────────────────────────────

ALTER TABLE client_concept_seeds
  DROP COLUMN IF EXISTS is_series_candidate,
  DROP COLUMN IF EXISTS series_rationale,
  DROP COLUMN IF EXISTS series_position;

-- ──────────────────────────────────────────────────
-- New table: client_recurring_formats
-- ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_recurring_formats (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  TEXT,
  source                      TEXT NOT NULL DEFAULT 'audience_persona'
    CHECK (source IN ('audience_persona', 'cohort_signal', 'manual')),
  generation_batch_id         UUID,

  -- The format itself
  name                        TEXT NOT NULL,                  -- "Weekly CMO Conversation"
  creative_execution          TEXT NOT NULL                   -- the production pattern style
    CHECK (creative_execution IN (
      'podcast', 'talking_head', 'interview', 'expert_breakdown',
      'react_response', 'tutorial', 'case_study', 'live_briefing',
      'roundtable', 'document_review', 'other'
    )),
  creative_execution_label    TEXT,                           -- free-text label when 'other'
  cadence                     TEXT NOT NULL DEFAULT 'monthly' -- production cadence assumption
    CHECK (cadence IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'ad_hoc')),

  -- Why this format fits THIS audience
  persona_rationale           TEXT NOT NULL,                   -- evidence-cited reasoning
  pillar_id                   UUID REFERENCES client_pillars(id) ON DELETE SET NULL,
                                                              -- which pillar this format primarily anchors
  pillar_label                TEXT,                            -- snapshot for display when pillar deleted

  -- Production realism
  estimated_episode_length    TEXT,                            -- "8-12 min", "30-45 min", "60-90 sec"
  production_complexity       TEXT NOT NULL DEFAULT 'medium'
    CHECK (production_complexity IN ('low', 'medium', 'high')),
  production_notes            TEXT,                            -- guest acquisition, scripting, etc.

  -- Honest counter-argument — when is this format the WRONG choice?
  counter_argument            TEXT,                            -- what could make this format fail / be wasteful
  format_position             INTEGER,                         -- 1, 2, 3... ordering for display

  -- Lifecycle
  status                      TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'piloting', 'archived')),
  archived_at                 TIMESTAMPTZ,
  archived_reason             TEXT
);

CREATE INDEX IF NOT EXISTS idx_recurring_formats_client_recent
  ON client_recurring_formats(client_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_formats_pillar
  ON client_recurring_formats(pillar_id)
  WHERE pillar_id IS NOT NULL;

COMMENT ON TABLE client_recurring_formats IS
  'Recurring creative-execution patterns the audience comes to recognize and expect — podcast format, talking-head explainer, expert interview series, react/response, tutorial, etc. Each entry stands alone for discoverability but shares creative DNA (template + script structure + visual treatment). Distinct from client_pillars (topics) and client_concept_seeds (individual videos).';

COMMENT ON COLUMN client_recurring_formats.creative_execution IS
  'The production-side style. podcast = conversational long-form. talking_head = solo-to-camera. interview = single guest. expert_breakdown = solo analysis of a specific case/event. react_response = response to industry news/competitor content. tutorial = step-by-step instruction. case_study = deep dive on one real example. live_briefing = scheduled live streams. roundtable = multi-guest discussion. document_review = analysis of public docs/reports. other = anything else; use creative_execution_label.';

COMMENT ON COLUMN client_recurring_formats.counter_argument IS
  'The honest case AGAINST this format for this client. What organizational / production / audience constraint could make this fail? Surfacing the counter-argument prevents strategists from defaulting to a format that sounds good but does not fit.';

-- ──────────────────────────────────────────────────
-- Link concept seeds to a recurring format (optional)
-- ──────────────────────────────────────────────────

ALTER TABLE client_concept_seeds
  ADD COLUMN IF NOT EXISTS recurring_format_id UUID REFERENCES client_recurring_formats(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_concept_seeds_format
  ON client_concept_seeds(recurring_format_id)
  WHERE recurring_format_id IS NOT NULL;

COMMENT ON COLUMN client_concept_seeds.recurring_format_id IS
  'Optional FK linking this individual concept seed to a recurring format pattern. When set, the seed is one episode of the recurring format; when NULL, it is a standalone concept.';

-- ──────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────

ALTER TABLE client_recurring_formats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read recurring formats"
  ON client_recurring_formats FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert recurring formats"
  ON client_recurring_formats FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update recurring formats"
  ON client_recurring_formats FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete recurring formats"
  ON client_recurring_formats FOR DELETE TO authenticated USING (true);
