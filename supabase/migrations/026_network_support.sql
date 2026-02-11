-- 026_network_support.sql
-- Allows grouping multiple OAuth client channels into a single "network" view.
-- A network parent is a channel with is_client = true, network_id IS NULL,
-- and at least one other channel has network_id pointing to it.
-- Member channels have network_id = parent.id.

ALTER TABLE channels
ADD COLUMN IF NOT EXISTS network_id UUID REFERENCES channels(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS network_name TEXT;

CREATE INDEX IF NOT EXISTS idx_channels_network_id ON channels(network_id);
