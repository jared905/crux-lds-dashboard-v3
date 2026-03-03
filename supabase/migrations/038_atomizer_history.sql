-- 038: Atomizer History — Channel assignment + context snapshots
--
-- Adds channel_id to transcripts and atomized_content so transcripts can be
-- organized by channel for multichannel clients. Adds context_snapshot and
-- analysis_summary to transcripts for reloading past analyses.

-- PART A: Add columns to transcripts
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS context_snapshot JSONB;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS analysis_summary TEXT;

-- PART B: Add channel_id to atomized_content
ALTER TABLE atomized_content ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;

-- PART C: Indexes for history queries
CREATE INDEX IF NOT EXISTS idx_transcripts_channel ON transcripts(channel_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_client_created ON transcripts(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atomized_content_channel ON atomized_content(channel_id);
