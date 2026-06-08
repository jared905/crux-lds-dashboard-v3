-- 098: pre-launch client flag.
--
-- Why this exists: strategists onboard clients BEFORE the client has a
-- YouTube channel (consultants, agencies doing pre-launch positioning
-- work, brand-side teams planning a content investment). Today every
-- "add client" path requires a YouTube channel ID — CSV upload, OAuth
-- "Add as Client" button, WelcomeOnboarding flow. There's no way to
-- track competitor data, build a Strategy Spine, or run cohort
-- intelligence against a client who doesn't yet have a channel to
-- attach OAuth to.
--
-- This migration adds an is_prelaunch flag plus an optional target
-- launch date. The prelaunchClientService creates a channels row with
-- youtube_channel_id = 'placeholder_<uuid>' (satisfies the UNIQUE NOT
-- NULL constraint without colliding with a real channel) and
-- is_prelaunch = true. Strategy surfaces that need client video data
-- (Pre-flight, Repositioning, Calibration) read is_prelaunch and show
-- a "no client-side data yet — Brief + Cohort + Competitor Scan still
-- work" empty state.
--
-- Upgrade path (future): when the client launches a real channel, an
-- "Upgrade to real channel" action promotes the placeholder by
-- swapping youtube_channel_id to the real value, clearing is_prelaunch,
-- and preserving everything else (the Spine, business context,
-- competitor cohort, all the strategic work done pre-launch).

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS is_prelaunch                BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prelaunch_intended_launch_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_channels_prelaunch
  ON channels(is_prelaunch)
  WHERE is_prelaunch = TRUE;

COMMENT ON COLUMN channels.is_prelaunch IS
  'TRUE when this client row was created via the pre-launch flow — no real YouTube channel yet. The youtube_channel_id is a placeholder (placeholder_<uuid>); Strategy surfaces requiring client video data render a clear "pre-launch" empty state instead of breaking.';

COMMENT ON COLUMN channels.prelaunch_intended_launch_at IS
  'Optional strategist-supplied target launch date. Lets the brief generator and Strategy workspaces frame recommendations against the launch timeline ("you have 6 weeks before launch").';
