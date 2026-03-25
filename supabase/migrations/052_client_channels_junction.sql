-- 052: Many-to-many relationship between clients and competitor channels
-- Replaces the single client_id column on channels for competitor assignment.
-- A channel can be tracked in master AND assigned to multiple clients simultaneously.
-- Master view = all channels. Client view = only channels in this junction table.

CREATE TABLE IF NOT EXISTS client_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES auth.users(id),
  notes TEXT,

  UNIQUE(client_id, channel_id)
);

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_client_channels_client
  ON client_channels (client_id);
CREATE INDEX IF NOT EXISTS idx_client_channels_channel
  ON client_channels (channel_id);

-- RLS
ALTER TABLE client_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage client_channels"
  ON client_channels FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Migrate existing client_id assignments to junction table
-- This preserves all current client-channel relationships
INSERT INTO client_channels (client_id, channel_id)
SELECT client_id, id
FROM channels
WHERE client_id IS NOT NULL
  AND is_competitor = true
ON CONFLICT (client_id, channel_id) DO NOTHING;

COMMENT ON TABLE client_channels IS 'Many-to-many assignment of competitor channels to clients. Master view sees all channels; client view sees only assigned channels.';
