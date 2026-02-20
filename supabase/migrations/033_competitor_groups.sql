-- Migration 033: Named competitor groups for Intelligence Panel
-- Allows users to create named subsets of competitors (e.g. "Direct Competitors",
-- "Aspirational Channels") and select which group feeds each analysis tab.

-- ============================================
-- COMPETITOR_GROUPS: Named groupings per client
-- ============================================
CREATE TABLE competitor_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(client_id, name)
);

CREATE INDEX idx_competitor_groups_client ON competitor_groups(client_id);

CREATE TRIGGER competitor_groups_updated_at
  BEFORE UPDATE ON competitor_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- COMPETITOR_GROUP_MEMBERS: Junction table
-- ============================================
CREATE TABLE competitor_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES competitor_groups(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(group_id, channel_id)
);

CREATE INDEX idx_cgm_group ON competitor_group_members(group_id);
CREATE INDEX idx_cgm_channel ON competitor_group_members(channel_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE competitor_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for competitor_groups" ON competitor_groups FOR ALL USING (true);
CREATE POLICY "Allow all for competitor_group_members" ON competitor_group_members FOR ALL USING (true);
