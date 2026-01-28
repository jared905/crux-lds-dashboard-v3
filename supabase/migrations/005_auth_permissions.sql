-- Migration: Authentication and Permissions System
-- Creates tables for user profiles, tab permissions, client access, and invites

-- User profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tab permissions per user
CREATE TABLE IF NOT EXISTS user_tab_permissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tab_id TEXT NOT NULL,
    has_access BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, tab_id)
);

-- Client access permissions per user
CREATE TABLE IF NOT EXISTS user_client_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    has_access BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, client_id)
);

-- User invites (for tracking pending invitations)
CREATE TABLE IF NOT EXISTS user_invites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    invited_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tab_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
-- Users can read their own profile
CREATE POLICY "Users can read own profile"
    ON user_profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles"
    ON user_profiles FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- Users can insert their own profile (on signup)
CREATE POLICY "Users can insert own profile"
    ON user_profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Admins can update any profile
CREATE POLICY "Admins can update profiles"
    ON user_profiles FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- Admins can delete profiles (except their own)
CREATE POLICY "Admins can delete profiles"
    ON user_profiles FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
        AND auth.uid() != user_id
    );

-- RLS Policies for user_tab_permissions
-- Users can read their own permissions
CREATE POLICY "Users can read own tab permissions"
    ON user_tab_permissions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Admins can read all permissions
CREATE POLICY "Admins can read all tab permissions"
    ON user_tab_permissions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- Users can insert their own permissions (for initial setup)
CREATE POLICY "Users can insert own tab permissions"
    ON user_tab_permissions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Admins can manage all tab permissions
CREATE POLICY "Admins can insert tab permissions"
    ON user_tab_permissions FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update tab permissions"
    ON user_tab_permissions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can delete tab permissions"
    ON user_tab_permissions FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- RLS Policies for user_client_access
-- Users can read their own client access
CREATE POLICY "Users can read own client access"
    ON user_client_access FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Admins can read all client access
CREATE POLICY "Admins can read all client access"
    ON user_client_access FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- Admins can manage all client access
CREATE POLICY "Admins can insert client access"
    ON user_client_access FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update client access"
    ON user_client_access FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can delete client access"
    ON user_client_access FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- RLS Policies for user_invites
-- Admins can manage invites
CREATE POLICY "Admins can read invites"
    ON user_invites FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can insert invites"
    ON user_invites FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can delete invites"
    ON user_invites FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- Allow checking invites during signup (anon can read to verify invite)
CREATE POLICY "Anyone can check invites by email"
    ON user_invites FOR SELECT
    TO anon, authenticated
    USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_tab_permissions_user_id ON user_tab_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_client_access_user_id ON user_client_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_invites_email ON user_invites(email);

-- Function to automatically create profile on user signup
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

    -- Determine role: first user is admin, invited users get their assigned role, others are viewers
    IF user_count = 0 THEN
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

    -- If viewer, add default tab permissions (Dashboard and Strategy)
    IF user_role = 'viewer' THEN
        INSERT INTO user_tab_permissions (user_id, tab_id, has_access)
        VALUES
            (NEW.id, 'Dashboard', true),
            (NEW.id, 'Strategy', true);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run on user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
