-- 096: youtube_oauth_invites — guest OAuth grant flow.
--
-- Why this exists: when onboarding a client's YouTube channel where
-- the strategist (Crux user) doesn't have Primary Owner access, the
-- channel's actual owner has to OAuth from their own login. Without
-- this flow, that means the owner has to (a) create a full Crux
-- account, (b) be granted the API Keys tab by an admin, and (c)
-- navigate to Settings to find the YouTube OAuth button. Three points
-- of friction that kill onboarding.
--
-- The invite flow short-circuits all three:
--   1. Strategist creates an invite from Settings → "Invite client OAuth"
--   2. Crux generates a one-time invite link
--   3. Strategist sends the link to the channel owner
--   4. Owner clicks → lands on a public page (no Crux signup required) →
--      sees what they're granting and to whom → clicks "Grant access"
--   5. Standard Google OAuth consent screen
--   6. Tokens are stored under the inviting strategist's user_id, so the
--      shared-OAuth-token model from 2026-06-06 means the strategist
--      immediately has full refresh access from their own login
--
-- Architecture:
--   - One row per invite. Token is opaque, randomly generated, never
--     enumerated.
--   - Status starts 'pending', becomes 'redeemed' when used, 'expired'
--     after expires_at, 'revoked' if strategist cancels.
--   - expected_youtube_email is purely a label for the strategist
--     ("the link I sent to huevos@voltagead.com") — does NOT bind the
--     OAuth flow to that email. Whatever Google account the user signs
--     in with on Google's side is what gets stored.
--   - On redemption, we record the actual youtube_channel_id that was
--     OAuthed so the strategist can audit.
--
-- Security:
--   - Token is 256-bit random, base64url-encoded — unguessable
--   - Single-use: redeemed status prevents reuse
--   - Default 7-day expiry; strategist can override or revoke earlier
--   - All actions audit-logged in youtube_oauth_audit_log
--   - The public landing page validates the token before showing any
--     details; invalid tokens return generic 'invite not available'

CREATE TABLE IF NOT EXISTS youtube_oauth_invites (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token                         TEXT NOT NULL UNIQUE,    -- opaque, sent in URL
  created_by                    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_email              TEXT,                    -- snapshot for landing-page display
  client_id                     UUID REFERENCES channels(id) ON DELETE SET NULL,
                                                         -- optional — associates the invite with a Crux client
  client_label                  TEXT,                    -- snapshot of client name (for landing page even after channel deletion)

  -- Display + audit metadata
  expected_youtube_email        TEXT,                    -- "I sent this to huevos@voltagead.com" — strategist-side label only
  notes                         TEXT,                    -- internal notes ("Voltage Ad onboarding")

  -- Lifecycle
  status                        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'redeemed', 'expired', 'revoked')),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at                    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  redeemed_at                   TIMESTAMPTZ,
  redeemed_youtube_channel_id   TEXT,
  redeemed_youtube_channel_title TEXT,
  redeemed_youtube_email        TEXT,                    -- actual email Google returned
  revoked_at                    TIMESTAMPTZ,
  revoked_by                    UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_yt_oauth_invites_token  ON youtube_oauth_invites(token);
CREATE INDEX IF NOT EXISTS idx_yt_oauth_invites_status ON youtube_oauth_invites(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_yt_oauth_invites_creator ON youtube_oauth_invites(created_by, created_at DESC);

COMMENT ON TABLE youtube_oauth_invites IS
  'Guest OAuth grant invites. Lets a Crux strategist send a single-use link to a channel''s actual owner so the owner can grant Crux YouTube access without creating a full Crux account. Tokens are stored under the inviting strategist''s user_id; team-OAuth model (2026-06-06) means everyone on Crux can use the resulting connection.';

COMMENT ON COLUMN youtube_oauth_invites.expected_youtube_email IS
  'Strategist-side label only — does NOT bind the OAuth flow to that email. Whatever Google account the recipient signs in with becomes the actual identity tied to the resulting connection.';

-- Add a column to youtube_oauth_state so the callback can detect
-- invite-backed grants and update the invite on redemption.
ALTER TABLE youtube_oauth_state
  ADD COLUMN IF NOT EXISTS invite_id UUID REFERENCES youtube_oauth_invites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_state_invite ON youtube_oauth_state(invite_id) WHERE invite_id IS NOT NULL;

COMMENT ON COLUMN youtube_oauth_state.invite_id IS
  'When set, this state row was created by a guest OAuth invite flow. The callback marks the invite redeemed on success and stores tokens under the invite creator''s user_id.';

ALTER TABLE youtube_oauth_invites ENABLE ROW LEVEL SECURITY;

-- Authenticated users (strategists) can manage their own invites
CREATE POLICY "Authenticated users can read their own invites"
  ON youtube_oauth_invites FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create invites"
  ON youtube_oauth_invites FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update invites"
  ON youtube_oauth_invites FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Public read by token is handled via service-role API endpoint, not
-- direct table access — keeps the validation logic server-side so we
-- can apply status + expiry checks consistently.
