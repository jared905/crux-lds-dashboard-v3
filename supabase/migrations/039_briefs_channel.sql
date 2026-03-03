-- 039: Add channel_id to briefs for channel assignment from Atomizer

ALTER TABLE briefs ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_briefs_channel ON briefs(channel_id);
