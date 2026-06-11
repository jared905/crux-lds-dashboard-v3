-- 103: competitor comment sweeps + extracted signals
--
-- Built 2026-06-11 after a deep-research pass (104 agents, 90 claims,
-- 25 verified) on YouTube competitor-comments mining for institutional
-- brand strategy. The synthesis: build a NARROW on-demand sweep tool
-- framed as Strategy Spine *input candidates* (strategist reviews and
-- selectively merges) — NOT as automated persona enrichment, because
-- participation inequality (Nielsen Norman Group; <1% commenter rate
-- on institutional channels) makes comments a self-selected vocal
-- minority that misrepresents the silent decision-maker audience.
--
-- The signal is content-gap detection, not audience research:
-- a single comment of "can you make a video about X" IS the signal
-- (doesn't need to be representative) and a recurring question across
-- multiple commenters is a content gap a competitor hasn't filled.
--
-- Data model:
--   client_comment_sweeps   — one row per sweep run (1 client x 1 competitor channel)
--   client_comment_signals  — one row per extracted comment signal
--                             (question / content_request / general)

-- ──────────────────────────────────────────────────
-- client_comment_sweeps
-- ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_comment_sweeps (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  competitor_channel_id       UUID REFERENCES channels(id) ON DELETE SET NULL,
                              -- Nullable so a sweep persists even if the cohort
                              -- channel gets removed later. The youtube_channel_id
                              -- snapshot below preserves the audit trail.
  competitor_youtube_id       TEXT NOT NULL,                -- snapshot of the YT channel ID at sweep time
  competitor_name             TEXT,                         -- snapshot of the channel name at sweep time

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  TEXT,

  status                      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'fetching', 'analyzing', 'complete', 'error')),
  status_message              TEXT,                         -- progress text or error message

  -- Sweep parameters
  max_videos                  INTEGER NOT NULL DEFAULT 10,
  max_comments_per_video      INTEGER NOT NULL DEFAULT 50,

  -- Result counters (denormalized; signals table is source of truth)
  videos_sampled              INTEGER DEFAULT 0,
  comments_fetched            INTEGER DEFAULT 0,
  signals_extracted           INTEGER DEFAULT 0,
  questions_count             INTEGER DEFAULT 0,
  content_requests_count      INTEGER DEFAULT 0,

  completed_at                TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_comment_sweeps_client_recent
  ON client_comment_sweeps(client_id, created_at DESC);

COMMENT ON TABLE client_comment_sweeps IS
  'On-demand competitor-comment sweep runs. Each sweep targets one competitor channel for one client and persists the raw extraction + heuristic-classified signals for strategist review. Framed as Strategy Spine input CANDIDATES — never auto-merged into persona or concept seeds. Participation-inequality bias makes auto-merge actively misleading for institutional brand audiences (per 2026-06-10 deep-research synthesis).';

-- ──────────────────────────────────────────────────
-- client_comment_signals
-- ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_comment_signals (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sweep_id                    UUID NOT NULL REFERENCES client_comment_sweeps(id) ON DELETE CASCADE,
  client_id                   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  signal_type                 TEXT NOT NULL
    CHECK (signal_type IN ('question', 'content_request', 'general')),

  -- The comment itself
  comment_text                TEXT NOT NULL,                -- verbatim text from YouTube
  comment_youtube_id          TEXT,                         -- top-level comment ID (for dedupe / re-fetch)
  author                      TEXT,
  like_count                  INTEGER DEFAULT 0,
  comment_published_at        TIMESTAMPTZ,

  -- Source attribution
  source_video_youtube_id     TEXT NOT NULL,
  source_video_title          TEXT,
  source_video_published_at   TIMESTAMPTZ,

  -- Strategist review state
  status                      TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'merged_to_spine', 'dismissed', 'starred')),
  reviewed_at                 TIMESTAMPTZ,
  reviewed_by                 TEXT,
  dismiss_reason              TEXT,

  -- Optional clustering (LLM theme labeling — deferred to v1.1)
  theme_label                 TEXT,
  theme_cluster_id            UUID,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comment_signals_sweep
  ON client_comment_signals(sweep_id, signal_type, like_count DESC);

CREATE INDEX IF NOT EXISTS idx_comment_signals_client_pending
  ON client_comment_signals(client_id, status, created_at DESC)
  WHERE status = 'pending_review';

COMMENT ON COLUMN client_comment_signals.signal_type IS
  'Heuristic classification at sweep time. question = ends with ? or starts with how/what/why/when/can you/etc. content_request = explicit "please make/cover X" or "would love to see Y" patterns. general = everything else (still persisted for audit but not surfaced as a recommendation candidate).';

COMMENT ON COLUMN client_comment_signals.status IS
  'Strategist review workflow. pending_review (default after sweep) → starred (worth keeping in mind) | merged_to_spine (used as input for persona / pillars / concept seeds) | dismissed (not actionable). Dismissals are kept, not deleted, so re-sweeps can avoid re-surfacing the same junk.';

-- ──────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────

ALTER TABLE client_comment_sweeps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_comment_signals  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sweeps"
  ON client_comment_sweeps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sweeps"
  ON client_comment_sweeps FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sweeps"
  ON client_comment_sweeps FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete sweeps"
  ON client_comment_sweeps FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read signals"
  ON client_comment_signals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert signals"
  ON client_comment_signals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update signals"
  ON client_comment_signals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete signals"
  ON client_comment_signals FOR DELETE TO authenticated USING (true);
