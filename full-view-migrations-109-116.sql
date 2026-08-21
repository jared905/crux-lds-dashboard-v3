-- ═══════════════════════════════════════════════════════════════════
-- Full View Analytics — migration batch 109–116 (combined 2026-08-21)
-- Run once in the Supabase SQL editor (SQL Editor → New query → paste
-- everything → Run). Each block self-verifies and RAISEs a NOTICE on
-- success; if any block fails it stops there with a clear error.
-- Safe to re-run: every statement is IF NOT EXISTS / DROP-then-CREATE.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 109_fix_public_rls_policies.sql
-- ───────────────────────────────────────────────────────────────────
-- 109_fix_public_rls_policies.sql
--
-- Closes anon read/write access on five tables.
--
-- WHAT WAS WRONG
-- Migrations 001/002/033 created policies with no TO clause:
--
--     CREATE POLICY "Allow all for authenticated users"
--       ON categories FOR ALL USING (true);
--
-- Despite the name, a policy with no TO clause applies to PUBLIC, and PUBLIC
-- includes `anon`. With WITH CHECK omitted, USING is reused for writes. So
-- this granted SELECT/INSERT/UPDATE/DELETE to anyone holding the anon key —
-- which ships in the browser bundle.
--
-- Two earlier migrations tried to clean this up and both missed, because
-- DROP POLICY IF EXISTS silently no-ops on a name that doesn't exist:
--   004: dropped "Allow all access to categories"   (actual: "Allow all for authenticated users")
--   024: dropped "Allow anon full access"           (actual: "Allow all for authenticated users")
-- Migration 024 then added a correct `TO authenticated` policy *alongside*
-- the permissive one. Postgres OR's permissive policies together, so the
-- open policy still won. 033 reintroduced the same pattern afterwards.
--
-- Affected: categories, channel_categories, analysis_presets,
--           competitor_groups, competitor_group_members
-- (channels/videos/video_snapshots/etc. were genuinely fixed by 004.)
--
-- This migration drops by exact name, recreates with an explicit
-- TO authenticated, and then VERIFIES — raising an exception rather than
-- reporting success if anything permissive is still addressable by anon.

BEGIN;

-- ── 1. Drop the permissive policies, by their real names ────────────────────
DROP POLICY IF EXISTS "Allow all for authenticated users" ON categories;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON channel_categories;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON analysis_presets;
DROP POLICY IF EXISTS "Allow all for competitor_groups" ON competitor_groups;
DROP POLICY IF EXISTS "Allow all for competitor_group_members" ON competitor_group_members;

-- ── 2. Ensure each table has exactly one authenticated-only policy ──────────
-- 024 already created "Allow authenticated full access" on categories and
-- analysis_presets; drop first so this migration is re-runnable.
DROP POLICY IF EXISTS "Allow authenticated full access" ON categories;
DROP POLICY IF EXISTS "Allow authenticated full access" ON channel_categories;
DROP POLICY IF EXISTS "Allow authenticated full access" ON analysis_presets;
DROP POLICY IF EXISTS "Allow authenticated full access" ON competitor_groups;
DROP POLICY IF EXISTS "Allow authenticated full access" ON competitor_group_members;

CREATE POLICY "Allow authenticated full access" ON categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON channel_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON analysis_presets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON competitor_groups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON competitor_group_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RLS must actually be on for a policy to matter.
ALTER TABLE categories               ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_presets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_group_members ENABLE ROW LEVEL SECURITY;

-- ── 3. Verify, don't assume ────────────────────────────────────────────────
-- The original bug was a cleanup that reported success while doing nothing.
-- Fail loudly instead.
--
-- Note on roles: the pg_policies view renders a TO-less (PUBLIC) policy as
-- roles = '{public}', not '{0}' — '{0}' is the raw pg_policy.polroles oid
-- form. Match on the rendered names.
DO $$
DECLARE
  fixed_tables CONSTANT TEXT[] := ARRAY[
    'categories', 'channel_categories', 'analysis_presets',
    'competitor_groups', 'competitor_group_members'
  ];
  offending TEXT;
  elsewhere TEXT;
BEGIN
  -- 3a. Hard check, scoped to the tables this migration is responsible for.
  SELECT string_agg(format('  %s."%s" (roles: %s)', tablename, policyname, roles::text), E'\n')
    INTO offending
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = ANY(fixed_tables)
    AND permissive = 'PERMISSIVE'
    AND roles::text[] && ARRAY['anon', 'public'];

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION E'RLS fix failed - still anon-reachable:\n%', offending;
  END IF;

  -- 3b. Soft check: report anon-reachable policies on OTHER tables without
  -- failing, since some (e.g. invite lookups) may be deliberate. Review them.
  SELECT string_agg(format('  %s."%s" (roles: %s)', tablename, policyname, roles::text), E'\n')
    INTO elsewhere
  FROM pg_policies
  WHERE schemaname = 'public'
    AND NOT (tablename = ANY(fixed_tables))
    AND permissive = 'PERMISSIVE'
    AND roles::text[] && ARRAY['anon', 'public'];

  RAISE NOTICE 'RLS fix verified on % tables.', array_length(fixed_tables, 1);
  IF elsewhere IS NOT NULL THEN
    RAISE NOTICE E'Other anon-reachable policies (review, not fixed here):\n%', elsewhere;
  END IF;
END $$;

COMMIT;

-- ── Follow-up, deliberately NOT in this migration ──────────────────────────
-- `TO authenticated USING (true)` still means every signed-in user can read
-- every client's data. A `user_client_access` table exists but no policy
-- consults it. Scoping these to it is a real behavioural change that needs
-- testing against the admin flows, so it belongs in its own migration.

-- ───────────────────────────────────────────────────────────────────
-- 110_fix_user_profiles_rls_recursion.sql
-- ───────────────────────────────────────────────────────────────────
-- 110_fix_user_profiles_rls_recursion.sql
--
-- Fixes infinite RLS recursion on user_profiles.
--
-- SYMPTOM
-- `fetchUserProfile` times out ("Profile fetch timed out after 8000ms"),
-- `isAdmin` falls back to false, and the app silently degrades every admin to
-- DEFAULT_VIEWER_TABS — the nav collapses to Performance + Strategy, the client
-- list comes back empty, and the "Connect your YouTube channel" onboarding
-- shows even though the account has clients. It is intermittent, because it
-- depends on whether the statement times out before the page gives up.
--
-- CAUSE
-- Migration 005 created this SELECT policy ON user_profiles:
--
--   CREATE POLICY "Admins can read all profiles"
--     ON user_profiles FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM user_profiles
--                    WHERE user_id = auth.uid() AND role = 'admin'));
--
-- The USING clause queries the very table the policy guards, so evaluating it
-- re-triggers itself. Postgres detects this as infinite recursion; through
-- PostgREST it surfaces as a hung request rather than a clean error.
--
-- FIX
-- Read the role through a SECURITY DEFINER function, which runs as the
-- function owner and therefore bypasses RLS on the inner read. That breaks the
-- cycle. The function is the canonical way to express "is the caller an admin"
-- and can be reused by any other policy that needs it.

BEGIN;

-- ── 1. Non-recursive admin check ───────────────────────────────────────────
-- SECURITY DEFINER: runs as owner, so the SELECT below is not itself
-- subject to user_profiles RLS. search_path is pinned so the function cannot
-- be hijacked by a caller-controlled schema.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ── 2. Replace the recursive policies ──────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all profiles"   ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles"     ON user_profiles;

CREATE POLICY "Admins can read all profiles"
  ON user_profiles FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete profiles"
  ON user_profiles FOR DELETE TO authenticated
  USING (public.is_admin());

-- The self-read policy from 005 stays as-is and is what makes the fix work:
--   "Users can read own profile" USING (auth.uid() = user_id)
-- It is non-recursive, so a user can always resolve their own role even if
-- every other policy is evaluated.

-- ── 3. Verify ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  recursive_policies TEXT;
BEGIN
  -- Any remaining policy ON user_profiles whose expression selects FROM
  -- user_profiles is still recursive.
  SELECT string_agg(format('  "%s" (%s)', policyname, cmd), E'\n')
    INTO recursive_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'user_profiles'
    AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) ILIKE '%user_profiles%';

  IF recursive_policies IS NOT NULL THEN
    RAISE EXCEPTION E'user_profiles still has self-referencing policies:\n%', recursive_policies;
  END IF;

  RAISE NOTICE 'user_profiles RLS is non-recursive; profile reads will resolve.';
END $$;

COMMIT;

-- ── Follow-up ──────────────────────────────────────────────────────────────
-- Other tables carry the same inline pattern:
--   EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role='admin')
-- in migrations 007, 009 and 027. Those are NOT recursive (different table),
-- so they work — but they re-query user_profiles on every row check. Swapping
-- them to public.is_admin() would be both faster and consistent.

-- ───────────────────────────────────────────────────────────────────
-- 111_audience_breakdowns.sql
-- ───────────────────────────────────────────────────────────────────
-- 111: audience_breakdowns — the "who/where/how" layer of the audience
-- deep-dive (2026-08-20 request).
--
-- Stores channel-level YouTube Analytics API breakdowns that the public
-- API actually offers: geography (country), device type, subscribed
-- status, and traffic source — each optionally split by content format
-- (creatorContentType: shorts vs long-form). Synced nightly by
-- /api/cron/audience-sync for every channel with an active OAuth
-- connection; each sync covers a rolling window and upserts on the
-- natural key, so re-runs are idempotent.
--
-- Deliberately NOT stored: "new vs returning viewers" and the
-- shorts→long-form viewer journey. Those are YouTube Studio-only —
-- the public Analytics API does not expose them, and we don't fake
-- Studio-only numbers. The dashboard says so instead.

CREATE TABLE IF NOT EXISTS audience_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  -- Which report this row came from:
  --   'country' | 'deviceType' | 'subscribedStatus' | 'insightTrafficSourceType'
  dimension TEXT NOT NULL,
  -- The dimension's value as returned by the API ('US', 'MOBILE',
  -- 'SUBSCRIBED', 'RELATED_VIDEO', ...)
  dimension_value TEXT NOT NULL,

  -- Content-format slice: 'all', or 'shorts' / 'longform' / 'live'
  -- when the creatorContentType split succeeded for this dimension.
  format TEXT NOT NULL DEFAULT 'all',

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  views BIGINT NOT NULL DEFAULT 0,
  watch_minutes NUMERIC NOT NULL DEFAULT 0,
  avg_view_duration_seconds NUMERIC,

  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (channel_id, dimension, dimension_value, format, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_audience_breakdowns_channel_dim
  ON audience_breakdowns (channel_id, dimension, period_end DESC);

ALTER TABLE audience_breakdowns ENABLE ROW LEVEL SECURITY;

-- Reads: any authenticated user (same posture as the other analytics
-- tables — client scoping happens at the app layer via channel access).
-- Writes: service role only (the sync endpoint).
DROP POLICY IF EXISTS audience_breakdowns_select ON audience_breakdowns;
CREATE POLICY audience_breakdowns_select
  ON audience_breakdowns FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS audience_breakdowns_service_write ON audience_breakdowns;
CREATE POLICY audience_breakdowns_service_write
  ON audience_breakdowns FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Self-verification ────────────────────────────────────────────────
DO $$
DECLARE
  policy_count INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'audience_breakdowns'
  ) THEN
    RAISE EXCEPTION 'audience_breakdowns table missing after migration';
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies WHERE tablename = 'audience_breakdowns';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'audience_breakdowns expected 2 policies, found %', policy_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audience_breakdowns' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'audience_breakdowns RLS not enabled';
  END IF;

  RAISE NOTICE 'migration 111 verified: table + RLS + % policies', policy_count;
END $$;

-- ───────────────────────────────────────────────────────────────────
-- 112_daily_channel_views.sql
-- ───────────────────────────────────────────────────────────────────
-- 112: get_daily_channel_views — real daily views series for the
-- Momentum chart (2026-08-20 Stitch-mockup round).
--
-- video_snapshots already stores per-video per-day view_count from the
-- Reporting API / Data-API deltas; the dashboard just had no way to sum
-- it by day (PostgREST can't GROUP BY). This RPC returns one row per
-- snapshot date across the given channels. The frontend falls back to
-- publish-day bucketing (the old chart behaviour, honestly labelled)
-- when this function is missing or returns nothing.

CREATE OR REPLACE FUNCTION get_daily_channel_views(
  channel_ids UUID[],
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  snapshot_date DATE,
  views BIGINT,
  watch_hours NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.snapshot_date,
    COALESCE(SUM(s.view_count), 0)::BIGINT AS views,
    COALESCE(SUM(s.watch_hours), 0)::NUMERIC AS watch_hours
  FROM video_snapshots s
  JOIN videos v ON v.id = s.video_id
  WHERE v.channel_id = ANY(channel_ids)
    AND s.snapshot_date >= start_date
    AND s.snapshot_date <= end_date
  GROUP BY s.snapshot_date
  ORDER BY s.snapshot_date;
$$;

GRANT EXECUTE ON FUNCTION get_daily_channel_views(UUID[], DATE, DATE) TO authenticated;

-- ── Self-verification ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_daily_channel_views'
  ) THEN
    RAISE EXCEPTION 'get_daily_channel_views missing after migration';
  END IF;
  -- Smoke-call with an empty set: must not error.
  PERFORM * FROM get_daily_channel_views(ARRAY[]::UUID[], CURRENT_DATE - 7, CURRENT_DATE);
  RAISE NOTICE 'migration 112 verified: get_daily_channel_views callable';
END $$;

-- ───────────────────────────────────────────────────────────────────
-- 113_client_networks.sql
-- ───────────────────────────────────────────────────────────────────
-- 113: network_tag — client networks (2026-08-20 request).
--
-- Strategists run families of related channels (e.g. the LDS apostles'
-- channels) and want them grouped: a "network" chip on every client
-- card, assignable per client, filterable on the portfolio views.
--
-- One nullable text column, not a join table: a network here is just a
-- shared label. Renaming a network = UPDATE all rows carrying the old
-- value; deleting = SET NULL. The tag list itself is derived from the
-- data (SELECT DISTINCT), so there is nothing extra to keep in sync.
-- The frontend degrades gracefully while this migration is unapplied.

ALTER TABLE channels ADD COLUMN IF NOT EXISTS network_tag TEXT;

CREATE INDEX IF NOT EXISTS idx_channels_network_tag
  ON channels (network_tag) WHERE network_tag IS NOT NULL;

COMMENT ON COLUMN channels.network_tag IS
  'Free-text network/group label (e.g. "LDS Apostles"). Null = no network.';

-- ── Self-verification ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'channels' AND column_name = 'network_tag'
  ) THEN
    RAISE EXCEPTION 'channels.network_tag missing after migration';
  END IF;
  RAISE NOTICE 'migration 113 verified: channels.network_tag present';
END $$;

-- ───────────────────────────────────────────────────────────────────
-- 114_channel_annotations.sql
-- ───────────────────────────────────────────────────────────────────
-- 114: channel_annotations — timeline markers (expert-review item,
-- built 2026-08-21).
--
-- "We changed the thumbnail style here", "new editor started", "went
-- weekly" — without markers, causality on the Momentum chart is
-- invisible. One row per event; rendered as markers on any time chart.

CREATE TABLE IF NOT EXISTS channel_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  annotation_date DATE NOT NULL,
  label TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_annotations_channel_date
  ON channel_annotations (channel_id, annotation_date);

ALTER TABLE channel_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_annotations_select ON channel_annotations;
CREATE POLICY channel_annotations_select
  ON channel_annotations FOR SELECT TO authenticated USING (true);

-- Strategists write these from the app (authenticated session).
DROP POLICY IF EXISTS channel_annotations_write ON channel_annotations;
CREATE POLICY channel_annotations_write
  ON channel_annotations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Self-verification ────────────────────────────────────────────────
DO $$
DECLARE policy_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel_annotations') THEN
    RAISE EXCEPTION 'channel_annotations missing after migration';
  END IF;
  SELECT count(*) INTO policy_count FROM pg_policies WHERE tablename = 'channel_annotations';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'channel_annotations expected 2 policies, found %', policy_count;
  END IF;
  RAISE NOTICE 'migration 114 verified: table + RLS + % policies', policy_count;
END $$;

-- ───────────────────────────────────────────────────────────────────
-- 115_thumbnail_history.sql
-- ───────────────────────────────────────────────────────────────────
-- 115: video_thumbnail_history — packaging change detection
-- (expert-review data-roadmap item #1, built 2026-08-21).
--
-- YouTube serves a video's CURRENT thumbnail from a stable URL, so the
-- URL never reveals a swap. The nightly sync therefore fetches the
-- image bytes and stores a content hash; a new hash for a known video
-- means the creator changed the packaging on that date. That signal —
-- "thumbnail changed here" — is what CTR analysis and the timeline
-- annotations need. (Archiving the image bytes themselves is a later
-- storage-bucket decision; hashes alone date every change.)

CREATE TABLE IF NOT EXISTS video_thumbnail_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_video_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  thumbnail_url TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (youtube_video_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_thumbnail_history_video
  ON video_thumbnail_history (youtube_video_id, captured_at DESC);

ALTER TABLE video_thumbnail_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS thumbnail_history_select ON video_thumbnail_history;
CREATE POLICY thumbnail_history_select
  ON video_thumbnail_history FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS thumbnail_history_service_write ON video_thumbnail_history;
CREATE POLICY thumbnail_history_service_write
  ON video_thumbnail_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Self-verification ────────────────────────────────────────────────
DO $$
DECLARE policy_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_thumbnail_history') THEN
    RAISE EXCEPTION 'video_thumbnail_history missing after migration';
  END IF;
  SELECT count(*) INTO policy_count FROM pg_policies WHERE tablename = 'video_thumbnail_history';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'video_thumbnail_history expected 2 policies, found %', policy_count;
  END IF;
  RAISE NOTICE 'migration 115 verified: table + RLS + % policies', policy_count;
END $$;

-- ───────────────────────────────────────────────────────────────────
-- 116_organic_overrides.sql
-- ───────────────────────────────────────────────────────────────────
-- 116: video_organic_overrides — human corrections to the media-buy heuristic
-- (2026-08-21, user request).
--
-- The organic filter flags likely-promoted videos heuristically (huge views
-- with near-zero engagement). Heuristics get individual videos wrong in both
-- directions, so a strategist who KNOWS a video was organic (or promoted)
-- can pin that fact. An override always beats the heuristic:
--   is_promoted = true   → video is filtered out in Organic-only mode
--   is_promoted = false  → video always counts as organic
-- Deleting the row returns the video to heuristic judgement.

CREATE TABLE IF NOT EXISTS video_organic_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL,
  video_key TEXT NOT NULL,
  is_promoted BOOLEAN NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, video_key)
);

CREATE INDEX IF NOT EXISTS idx_organic_overrides_channel
  ON video_organic_overrides (channel_id);

ALTER TABLE video_organic_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organic_overrides_select ON video_organic_overrides;
CREATE POLICY organic_overrides_select
  ON video_organic_overrides FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS organic_overrides_write ON video_organic_overrides;
CREATE POLICY organic_overrides_write
  ON video_organic_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Self-verification ────────────────────────────────────────────────
DO $$
DECLARE policy_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_organic_overrides') THEN
    RAISE EXCEPTION 'video_organic_overrides missing after migration';
  END IF;
  SELECT count(*) INTO policy_count FROM pg_policies WHERE tablename = 'video_organic_overrides';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'video_organic_overrides expected 2 policies, found %', policy_count;
  END IF;
  RAISE NOTICE 'migration 116 verified: table + RLS + % policies', policy_count;
END $$;
