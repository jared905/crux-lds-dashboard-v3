-- 087: client_surface_intelligence — Phase 2.5 surface-aware scoring
--
-- Two snapshot-based tables that capture YouTube Analytics data the
-- pre-flight scorer reads to score concepts per traffic surface
-- (Search / Browse / Suggested / Shorts Feed / etc.) rather than
-- against an averaged-everywhere total-views baseline.
--
-- Why snapshots, not current-only:
--   - Snapshots let us trend per-surface performance over time. A
--     channel pivoting from Suggested-heavy to Search-heavy is a real
--     positioning shift — collapsing to "current only" loses that.
--   - The Phase 1 scorer's reproducibility argument applies here too:
--     a scorecard scored against one snapshot stays interpretable
--     after fresh data arrives.
--   - Cheap (one row per surface per video per snapshot; queries
--     filter by latest captured_at when scoring current concepts).
--
-- Phase 2.5 spike (commits c567edf … 2270e7b) confirmed:
--   ✓ Traffic-source breakdown query works (200 OK, 9 surface buckets).
--   ✓ YT_SEARCH detail query works (200 OK).
--   ✗ RELATED_VIDEO detail (audience adjacency) returns 500 with
--     FIELD_UNKNOWN_VALUE on Brand Account channels — both at the
--     per-video grain AND channel-level. Adjacency cohort deferred
--     to a later phase via an alternative data path.
--
-- ─── Why two tables, not one ───
-- client_video_traffic_sources: per-video, per-surface views.
--   Source for surface-aware lift computation. Each row = "video X
--   got Y views from surface Z in window W."
--
-- client_search_queries: channel-level aggregated search queries.
--   Source for keyword/title intelligence. Each row = "the search
--   query Q drove V views to this channel in window W." Branded
--   queries flagged at ingest so the scorer can ignore them when
--   evaluating whether a proposed title's keywords actually pull
--   the audience.
-- ────────────────────────────────


-- ──────────────────────────────────────────────────
-- client_video_traffic_sources
-- ──────────────────────────────────────────────────
-- One row per (client, video, surface, snapshot). The combination
-- (client_id, youtube_video_id, surface, window_start, window_end) is
-- unique within a single capture — multiple captures over time
-- accumulate as separate rows differentiated by captured_at.
--
-- Surface values come straight from YouTube Analytics
-- insightTrafficSourceType. Observed enums (spike output, May 2026):
--   RELATED_VIDEO, YT_SEARCH, YT_CHANNEL, SUBSCRIBER, YT_OTHER_PAGE,
--   NO_LINK_OTHER, EXT_URL, NOTIFICATION, END_SCREEN.
-- Not yet observed but possible per docs:
--   BROWSE_FEATURES, SHORTS, PLAYLIST, ADVERTISING, NOTIFICATION,
--   EXT_APP, CAMPAIGN_CARD, HASHTAGS, SOUND_PAGE, LIVE_REDIRECT.
-- We store the raw string; the scorer normalizes to its target-surface
-- buckets (Search / Browse / Suggested / Shorts Feed / External).
CREATE TABLE IF NOT EXISTS client_video_traffic_sources (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  -- The YouTube video id (11-char), not our internal videos.id. Kept
  -- as text so a video that exists in the API but hasn't been
  -- ingested into our videos table yet still gets a row.
  youtube_video_id    TEXT NOT NULL,

  -- Raw surface enum from YouTube Analytics. Free text on insert; the
  -- scorer normalizes downstream. No CHECK constraint because YouTube
  -- may introduce new enums.
  surface             TEXT NOT NULL,
  views               INTEGER NOT NULL DEFAULT 0,

  -- The window the views were aggregated over.
  window_start        DATE NOT NULL,
  window_end          DATE NOT NULL,

  captured_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Most common access path: "latest snapshot for this client's videos"
CREATE INDEX IF NOT EXISTS idx_client_video_traffic_sources_client_recent
  ON client_video_traffic_sources(client_id, captured_at DESC);

-- Per-video lookup for the scorer's "this video's surface profile"
CREATE INDEX IF NOT EXISTS idx_client_video_traffic_sources_video
  ON client_video_traffic_sources(client_id, youtube_video_id, captured_at DESC);

-- Aggregation by surface ("which surface drives the most views across
-- this client's videos?" — used to infer the client's dominant surface
-- profile for default target-surface suggestion).
CREATE INDEX IF NOT EXISTS idx_client_video_traffic_sources_surface
  ON client_video_traffic_sources(client_id, surface, captured_at DESC);

COMMENT ON TABLE client_video_traffic_sources IS
  'Per-video, per-surface view counts pulled from YouTube Analytics insightTrafficSourceType. Snapshot-based — each capture adds rows rather than overwriting. Source for Phase 2.5 surface-aware lift computation.';
COMMENT ON COLUMN client_video_traffic_sources.surface IS
  'Raw insightTrafficSourceType enum from YouTube Analytics — stored as-is so new surfaces (introduced by YouTube) don''t require a migration. The scorer normalizes to its target-surface buckets.';


-- ──────────────────────────────────────────────────
-- client_search_queries
-- ──────────────────────────────────────────────────
-- Channel-level aggregated search queries that drove YT_SEARCH traffic.
-- Pulled via dimensions=insightTrafficSourceDetail filtered to
-- YT_SEARCH. The detail dimension returns the actual query text.
--
-- is_branded is set at ingest time by matching the query against the
-- channel's name + handle (case-insensitive substring). Branded
-- queries (e.g. "safestreets reviews") are signal that the audience
-- ALREADY knows the brand — useless for scoring whether a NEW title's
-- keywords would pull cold viewers. The scorer ignores is_branded=true
-- when computing keyword lift.
CREATE TABLE IF NOT EXISTS client_search_queries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  query               TEXT NOT NULL,
  views               INTEGER NOT NULL DEFAULT 0,

  -- Set at ingest by matching against the channel's name + handle.
  -- Scorer excludes is_branded=true when computing keyword lift.
  is_branded          BOOLEAN NOT NULL DEFAULT FALSE,

  window_start        DATE NOT NULL,
  window_end          DATE NOT NULL,

  captured_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_search_queries_client_recent
  ON client_search_queries(client_id, captured_at DESC);

-- Fast lookup of non-branded queries by view count — the scorer's
-- primary access path when checking whether a proposed title's
-- keywords match queries that actually pulled cold viewers.
CREATE INDEX IF NOT EXISTS idx_client_search_queries_unbranded
  ON client_search_queries(client_id, views DESC, captured_at DESC)
  WHERE is_branded = FALSE;

COMMENT ON TABLE client_search_queries IS
  'Channel-level aggregated search queries that drove YT_SEARCH traffic, pulled via insightTrafficSourceDetail filtered to YT_SEARCH. The is_branded flag separates queries that contain the channel name (audience already knew the brand) from cold-discovery queries (what keywords actually pull new viewers in).';
COMMENT ON COLUMN client_search_queries.is_branded IS
  'Set at ingest by matching the query against the channel''s name + handle. Branded queries reflect audience that already knows the brand and aren''t useful for scoring whether a new title would pull cold viewers — the scorer filters them out by default.';


-- ──────────────────────────────────────────────────
-- RLS — match the convention used in the Phase 1 scorecards table
-- (086) and the deliverable-overrides table (085).
-- ──────────────────────────────────────────────────
ALTER TABLE client_video_traffic_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_search_queries        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read video traffic sources"
  ON client_video_traffic_sources FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert video traffic sources"
  ON client_video_traffic_sources FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update video traffic sources"
  ON client_video_traffic_sources FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete video traffic sources"
  ON client_video_traffic_sources FOR DELETE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read search queries"
  ON client_search_queries FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert search queries"
  ON client_search_queries FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update search queries"
  ON client_search_queries FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete search queries"
  ON client_search_queries FOR DELETE
  TO authenticated USING (true);
