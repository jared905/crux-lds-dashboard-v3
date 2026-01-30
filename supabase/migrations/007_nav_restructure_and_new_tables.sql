-- Migration 007: Navigation restructure + new tables for Strategy Engine
-- Part A: Remap tab permission IDs to new kebab-case format
-- Part B: Update handle_new_user() trigger with new default tabs
-- Part C: New tables (competitor_insights, transcripts, atomized_content, briefs)
-- Part D: Composite indexes for competitor scaling

-- ============================================================================
-- PART A: Remap existing tab permission IDs
-- ============================================================================

UPDATE user_tab_permissions SET tab_id = 'dashboard' WHERE tab_id = 'Dashboard';
UPDATE user_tab_permissions SET tab_id = 'channel-summary' WHERE tab_id = 'Channel Summary';
UPDATE user_tab_permissions SET tab_id = 'actions' WHERE tab_id = 'Strategy';
UPDATE user_tab_permissions SET tab_id = 'competitors' WHERE tab_id = 'Competitors';
UPDATE user_tab_permissions SET tab_id = 'intelligence' WHERE tab_id = 'Intelligence';
UPDATE user_tab_permissions SET tab_id = 'briefs' WHERE tab_id = 'Creative Brief';
UPDATE user_tab_permissions SET tab_id = 'comments' WHERE tab_id = 'Comments';

-- Remove tabs that no longer exist as standalone tabs
DELETE FROM user_tab_permissions WHERE tab_id IN ('Data', 'Standardizer');

-- ============================================================================
-- PART B: Update handle_new_user() trigger with new default tab IDs
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    invite_record RECORD;
    user_role TEXT;
    user_count INTEGER;
BEGIN
    -- Check if there's an invite for this email
    SELECT * INTO invite_record FROM user_invites WHERE email = NEW.email AND accepted_at IS NULL;

    -- Count existing users to determine if this is the first user
    SELECT COUNT(*) INTO user_count FROM user_profiles;

    -- Determine role priority:
    -- 1. First user is admin
    -- 2. @crux.media emails are always admin
    -- 3. Invited users get their assigned role
    -- 4. Everyone else is viewer
    IF user_count = 0 THEN
        user_role := 'admin';
    ELSIF NEW.email ILIKE '%@crux.media' THEN
        user_role := 'admin';
    ELSIF invite_record IS NOT NULL THEN
        user_role := invite_record.role;
        -- Mark invite as accepted
        UPDATE user_invites SET accepted_at = NOW() WHERE id = invite_record.id;
    ELSE
        user_role := 'viewer';
    END IF;

    -- Create profile
    INSERT INTO user_profiles (user_id, email, role)
    VALUES (NEW.id, NEW.email, user_role);

    -- If viewer, add default tab permissions (Dashboard and Actions)
    IF user_role = 'viewer' THEN
        INSERT INTO user_tab_permissions (user_id, tab_id, has_access)
        VALUES
            (NEW.id, 'dashboard', true),
            (NEW.id, 'actions', true);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- PART C: New tables for Strategy Engine
-- ============================================================================

-- Competitor insights: cached AI analysis of competitor videos
CREATE TABLE IF NOT EXISTS competitor_insights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    insight_type TEXT NOT NULL DEFAULT 'full_analysis',
    insight_data JSONB NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    model_used TEXT,
    tokens_used INTEGER,
    cost DECIMAL(10,6),
    UNIQUE(video_id, insight_type)
);

-- Transcripts: video transcripts for atomizer
CREATE TABLE IF NOT EXISTS transcripts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id TEXT,
    title TEXT,
    source_type TEXT NOT NULL DEFAULT 'paste' CHECK (source_type IN ('paste', 'youtube_captions', 'upload')),
    source_url TEXT,
    transcript_text TEXT NOT NULL,
    word_count INTEGER,
    analyzed_at TIMESTAMP WITH TIME ZONE,
    analysis_model TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Atomized content: AI-extracted clips, shorts, quotes from transcripts
CREATE TABLE IF NOT EXISTS atomized_content (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transcript_id UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
    client_id TEXT,
    content_type TEXT NOT NULL CHECK (content_type IN ('clip', 'short', 'quote')),
    title TEXT,
    timecode_start TEXT,
    timecode_end TEXT,
    transcript_excerpt TEXT,
    hook TEXT,
    virality_score INTEGER CHECK (virality_score >= 1 AND virality_score <= 10),
    rationale TEXT,
    suggested_format TEXT,
    suggested_cta TEXT,
    suggested_visual TEXT,
    status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'approved', 'rejected', 'brief_created')),
    brief_id UUID,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Briefs: planned content items
CREATE TABLE IF NOT EXISTS briefs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'in_production', 'published', 'archived')),
    source_type TEXT CHECK (source_type IN ('creative_brief', 'atomizer', 'manual', 'competitor_inspired')),
    source_id UUID,
    brief_data JSONB,
    scheduled_for DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Add foreign key from atomized_content to briefs (after briefs table exists)
ALTER TABLE atomized_content
    ADD CONSTRAINT fk_atomized_brief
    FOREIGN KEY (brief_id) REFERENCES briefs(id) ON DELETE SET NULL;

-- ============================================================================
-- PART D: Indexes
-- ============================================================================

-- New table indexes
CREATE INDEX IF NOT EXISTS idx_competitor_insights_video ON competitor_insights(video_id);
CREATE INDEX IF NOT EXISTS idx_competitor_insights_channel ON competitor_insights(channel_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_client ON transcripts(client_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_created ON transcripts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atomized_content_transcript ON atomized_content(transcript_id);
CREATE INDEX IF NOT EXISTS idx_atomized_content_client ON atomized_content(client_id);
CREATE INDEX IF NOT EXISTS idx_atomized_content_status ON atomized_content(status);
CREATE INDEX IF NOT EXISTS idx_briefs_client ON briefs(client_id);
CREATE INDEX IF NOT EXISTS idx_briefs_status ON briefs(status);
CREATE INDEX IF NOT EXISTS idx_briefs_created ON briefs(created_at DESC);

-- Composite indexes for competitor scaling (Phase 1A)
CREATE INDEX IF NOT EXISTS idx_videos_channel_published ON videos(channel_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_view_count_desc ON videos(view_count DESC);

-- ============================================================================
-- PART E: Row Level Security for new tables
-- ============================================================================

ALTER TABLE competitor_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE atomized_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all new tables
CREATE POLICY "Authenticated users can read competitor_insights"
    ON competitor_insights FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read transcripts"
    ON transcripts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read atomized_content"
    ON atomized_content FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read briefs"
    ON briefs FOR SELECT TO authenticated USING (true);

-- Authenticated users can insert into new tables
CREATE POLICY "Authenticated users can insert competitor_insights"
    ON competitor_insights FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can insert transcripts"
    ON transcripts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can insert atomized_content"
    ON atomized_content FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can insert briefs"
    ON briefs FOR INSERT TO authenticated WITH CHECK (true);

-- Authenticated users can update new tables
CREATE POLICY "Authenticated users can update competitor_insights"
    ON competitor_insights FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can update atomized_content"
    ON atomized_content FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can update briefs"
    ON briefs FOR UPDATE TO authenticated USING (true);

-- Admins can delete from new tables
CREATE POLICY "Admins can delete competitor_insights"
    ON competitor_insights FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete transcripts"
    ON transcripts FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete atomized_content"
    ON atomized_content FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete briefs"
    ON briefs FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));
