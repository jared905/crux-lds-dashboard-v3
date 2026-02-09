-- Migration: YouTube OAuth Integration
-- Creates tables for OAuth connections, PKCE state management, and audit logging
-- Security: PKCE flow, encrypted token storage, comprehensive audit trail

-- ============================================================================
-- TABLE 1: youtube_oauth_connections
-- Stores OAuth tokens (encrypted) and connection metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS youtube_oauth_connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- YouTube Account Info (not sensitive - stored plaintext)
    youtube_channel_id TEXT NOT NULL,
    youtube_channel_title TEXT,
    youtube_channel_thumbnail TEXT,
    youtube_email TEXT,

    -- Encrypted Tokens (AES-256-GCM encrypted before storage)
    -- Format: base64(iv):base64(ciphertext):base64(authTag)
    encrypted_access_token TEXT NOT NULL,
    encrypted_refresh_token TEXT NOT NULL,

    -- Token Metadata (plaintext for refresh logic)
    token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT ARRAY['https://www.googleapis.com/auth/youtube.readonly'],

    -- Connection Status
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    last_refreshed_at TIMESTAMP WITH TIME ZONE,
    connection_error TEXT,

    -- Audit Fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Each user can only have one connection per YouTube channel
    UNIQUE(user_id, youtube_channel_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_oauth_connections_user_id ON youtube_oauth_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_connections_expires ON youtube_oauth_connections(token_expires_at)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_oauth_connections_channel ON youtube_oauth_connections(youtube_channel_id);

-- ============================================================================
-- TABLE 2: youtube_oauth_state
-- Temporary storage for PKCE flow security (10-minute expiry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS youtube_oauth_state (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- PKCE Parameters (code_verifier NEVER exposed to client)
    state TEXT NOT NULL UNIQUE,
    code_verifier TEXT NOT NULL,
    code_challenge TEXT NOT NULL,

    -- Security
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '10 minutes'),
    used BOOLEAN DEFAULT false,

    -- Request context for audit
    ip_address INET,
    user_agent TEXT
);

-- Index for state lookup and cleanup
CREATE INDEX IF NOT EXISTS idx_oauth_state_state ON youtube_oauth_state(state);
CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON youtube_oauth_state(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_state_user ON youtube_oauth_state(user_id);

-- ============================================================================
-- TABLE 3: youtube_oauth_audit_log
-- Comprehensive audit trail for enterprise compliance
-- ============================================================================

CREATE TABLE IF NOT EXISTS youtube_oauth_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Event Details
    event_type TEXT NOT NULL CHECK (event_type IN (
        'oauth_initiated',       -- User started OAuth flow
        'oauth_callback',        -- Callback received
        'oauth_success',         -- Tokens stored successfully
        'oauth_failed',          -- OAuth flow failed
        'token_refresh',         -- Token was refreshed
        'token_refresh_failed',  -- Refresh failed
        'token_accessed',        -- Token was used for API call
        'token_revoked',         -- User disconnected
        'connection_deleted'     -- Connection removed
    )),

    -- Context
    youtube_channel_id TEXT,
    ip_address INET,
    user_agent TEXT,

    -- Details (JSON for flexibility)
    metadata JSONB DEFAULT '{}',
    error_message TEXT,

    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_oauth_audit_user ON youtube_oauth_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_audit_event ON youtube_oauth_audit_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_audit_channel ON youtube_oauth_audit_log(youtube_channel_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE youtube_oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_oauth_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_oauth_audit_log ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Policies for youtube_oauth_connections
-- Users can SELECT their own; only service role can INSERT/UPDATE/DELETE
-- ----------------------------------------------------------------------------

-- Users can view their own connections (tokens remain encrypted)
CREATE POLICY "Users can view own OAuth connections"
    ON youtube_oauth_connections FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role handles all mutations (token exchange, refresh, disconnect)
-- This is enforced by using service_role key in API endpoints
-- No INSERT/UPDATE/DELETE policies for authenticated users

-- ----------------------------------------------------------------------------
-- Policies for youtube_oauth_state
-- Only service role manages state (created and consumed server-side)
-- ----------------------------------------------------------------------------

-- No policies for authenticated users - all handled server-side with service role

-- ----------------------------------------------------------------------------
-- Policies for youtube_oauth_audit_log
-- Only admins can read audit logs (for compliance review)
-- ----------------------------------------------------------------------------

CREATE POLICY "Admins can view OAuth audit logs"
    ON youtube_oauth_audit_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- Service role handles all inserts (done from API endpoints)
-- No INSERT policy for authenticated users

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to clean up expired OAuth states (call periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM youtube_oauth_state
    WHERE expires_at < NOW() OR used = true;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_oauth_connection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS oauth_connection_updated ON youtube_oauth_connections;
CREATE TRIGGER oauth_connection_updated
    BEFORE UPDATE ON youtube_oauth_connections
    FOR EACH ROW EXECUTE FUNCTION update_oauth_connection_timestamp();

-- ============================================================================
-- COMMENTS (for documentation)
-- ============================================================================

COMMENT ON TABLE youtube_oauth_connections IS 'Stores YouTube OAuth connections with AES-256-GCM encrypted tokens';
COMMENT ON COLUMN youtube_oauth_connections.encrypted_access_token IS 'AES-256-GCM encrypted. Format: base64(iv):base64(ciphertext):base64(authTag)';
COMMENT ON COLUMN youtube_oauth_connections.encrypted_refresh_token IS 'AES-256-GCM encrypted. Format: base64(iv):base64(ciphertext):base64(authTag)';

COMMENT ON TABLE youtube_oauth_state IS 'Temporary PKCE state storage. code_verifier never exposed to client.';
COMMENT ON COLUMN youtube_oauth_state.code_verifier IS 'PKCE code verifier - NEVER sent to client';

COMMENT ON TABLE youtube_oauth_audit_log IS 'Audit trail for OAuth events. Required for enterprise compliance.';
