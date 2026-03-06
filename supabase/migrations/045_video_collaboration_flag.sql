-- Add collaboration fields to videos table
ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_collaboration BOOLEAN DEFAULT false;
-- 'host' = we uploaded and invited collaborators; 'guest' = another channel's video we collaborated on
ALTER TABLE videos ADD COLUMN IF NOT EXISTS collaboration_role TEXT CHECK (collaboration_role IN ('host', 'guest'));
-- The other channel involved in the collaboration (host channel for guests, detected collaborator for hosts)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS collaboration_host_channel_id TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS collaboration_host_channel_title TEXT;
