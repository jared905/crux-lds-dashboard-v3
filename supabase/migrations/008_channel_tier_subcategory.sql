-- Migration 008: Add tier, subcategory, and notes to channels
-- Supports competitor database import with classification metadata

-- Tier: primary, secondary, tertiary — controls default visibility
ALTER TABLE channels ADD COLUMN IF NOT EXISTS tier TEXT CHECK (tier IN ('primary', 'secondary', 'tertiary'));

-- Subcategory: finer grouping within a category
ALTER TABLE channels ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Notes: free-text context about the channel
ALTER TABLE channels ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index for tier filtering (commonly used in UI toggling)
CREATE INDEX IF NOT EXISTS idx_channels_tier ON channels(tier);
CREATE INDEX IF NOT EXISTS idx_channels_subcategory ON channels(subcategory);
