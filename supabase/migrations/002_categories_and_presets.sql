-- Categories and Analysis Presets Schema
-- Full View Analytics - Crux Media
-- Migration 002: Hierarchical categories and saved analysis presets

-- ============================================
-- CATEGORIES: Hierarchical channel groupings
-- ============================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Hierarchy
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,           -- URL-safe identifier
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,

  -- Display
  description TEXT,
  color TEXT DEFAULT '#2962FF',        -- Hex color for UI
  icon TEXT DEFAULT 'folder',          -- Lucide icon name
  sort_order INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for hierarchy queries
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);

-- Trigger for updated_at
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- CHANNEL_CATEGORIES: Many-to-many relationship
-- ============================================
-- A channel can belong to multiple categories
CREATE TABLE channel_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,

  -- When was this assignment made
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(channel_id, category_id)
);

CREATE INDEX idx_channel_categories_channel ON channel_categories(channel_id);
CREATE INDEX idx_channel_categories_category ON channel_categories(category_id);

-- ============================================
-- ANALYSIS_PRESETS: Saved filter configurations
-- ============================================
CREATE TABLE analysis_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT NOT NULL,
  description TEXT,

  -- Selection criteria (stored as arrays of IDs)
  selected_category_ids UUID[],        -- Categories to include
  selected_channel_ids UUID[],         -- Specific channels (overrides categories)
  excluded_channel_ids UUID[],         -- Channels to exclude even if in category

  -- Filter options
  include_subcategories BOOLEAN DEFAULT true,  -- Include child categories
  video_type_filter TEXT,              -- 'short', 'long', or null for all
  date_range_days INTEGER DEFAULT 30,  -- How far back to look

  -- Sharing
  is_shared BOOLEAN DEFAULT false,     -- Visible to team
  created_by TEXT,                     -- User identifier

  -- Metadata
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analysis_presets_shared ON analysis_presets(is_shared);
CREATE INDEX idx_analysis_presets_created_by ON analysis_presets(created_by);

-- Trigger for updated_at
CREATE TRIGGER analysis_presets_updated_at
  BEFORE UPDATE ON analysis_presets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- VIEWS FOR CATEGORY QUERIES
-- ============================================

-- Category tree with channel counts
CREATE VIEW category_tree AS
WITH RECURSIVE category_hierarchy AS (
  -- Base case: root categories (no parent)
  SELECT
    id,
    name,
    slug,
    parent_id,
    color,
    icon,
    sort_order,
    0 as depth,
    ARRAY[id] as path,
    ARRAY[sort_order] as sort_path
  FROM categories
  WHERE parent_id IS NULL

  UNION ALL

  -- Recursive case: child categories
  SELECT
    c.id,
    c.name,
    c.slug,
    c.parent_id,
    c.color,
    c.icon,
    c.sort_order,
    ch.depth + 1,
    ch.path || c.id,
    ch.sort_path || c.sort_order
  FROM categories c
  JOIN category_hierarchy ch ON c.parent_id = ch.id
)
SELECT
  ch.id,
  ch.name,
  ch.slug,
  ch.parent_id,
  ch.color,
  ch.icon,
  ch.sort_order,
  ch.depth,
  ch.path,
  COUNT(DISTINCT cc.channel_id) as channel_count
FROM category_hierarchy ch
LEFT JOIN channel_categories cc ON cc.category_id = ch.id
GROUP BY ch.id, ch.name, ch.slug, ch.parent_id, ch.color, ch.icon, ch.sort_order, ch.depth, ch.path, ch.sort_path
ORDER BY ch.sort_path;

-- Channels with their categories
CREATE VIEW channels_with_categories AS
SELECT
  c.*,
  COALESCE(
    array_agg(
      json_build_object(
        'id', cat.id,
        'name', cat.name,
        'color', cat.color
      )
    ) FILTER (WHERE cat.id IS NOT NULL),
    '{}'
  ) as categories
FROM channels c
LEFT JOIN channel_categories cc ON c.id = cc.channel_id
LEFT JOIN categories cat ON cc.category_id = cat.id
GROUP BY c.id;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_presets ENABLE ROW LEVEL SECURITY;

-- Allow all for now (can restrict later)
CREATE POLICY "Allow all for authenticated users" ON categories FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON channel_categories FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON analysis_presets FOR ALL USING (true);

-- ============================================
-- SEED DATA: Initial category structure
-- ============================================

-- Faith & Religion (Parent)
INSERT INTO categories (name, slug, parent_id, color, icon, sort_order) VALUES
('Faith & Religion', 'faith-religion', NULL, '#8B5CF6', 'church', 1);

-- Faith & Religion children
INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Pro-LDS', 'pro-lds', id, '#10B981', 'heart', 1 FROM categories WHERE slug = 'faith-religion';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Anti-LDS', 'anti-lds', id, '#EF4444', 'alert-triangle', 2 FROM categories WHERE slug = 'faith-religion';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Evangelical', 'evangelical', id, '#F59E0B', 'book-open', 3 FROM categories WHERE slug = 'faith-religion';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Catholic', 'catholic', id, '#EC4899', 'cross', 4 FROM categories WHERE slug = 'faith-religion';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Christian (General)', 'christian-general', id, '#3B82F6', 'users', 5 FROM categories WHERE slug = 'faith-religion';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Muslim', 'muslim', id, '#14B8A6', 'moon', 6 FROM categories WHERE slug = 'faith-religion';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Jewish', 'jewish', id, '#6366F1', 'star', 7 FROM categories WHERE slug = 'faith-religion';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Other Faith', 'other-faith', id, '#9CA3AF', 'globe', 8 FROM categories WHERE slug = 'faith-religion';

-- Finance (Parent)
INSERT INTO categories (name, slug, parent_id, color, icon, sort_order) VALUES
('Finance', 'finance', NULL, '#10B981', 'dollar-sign', 2);

-- Finance children
INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Personal Finance', 'personal-finance', id, '#34D399', 'wallet', 1 FROM categories WHERE slug = 'finance';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Investing', 'investing', id, '#059669', 'trending-up', 2 FROM categories WHERE slug = 'finance';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Real Estate', 'real-estate', id, '#047857', 'home', 3 FROM categories WHERE slug = 'finance';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Crypto', 'crypto', id, '#F59E0B', 'bitcoin', 4 FROM categories WHERE slug = 'finance';

-- Entertainment (Parent)
INSERT INTO categories (name, slug, parent_id, color, icon, sort_order) VALUES
('Entertainment', 'entertainment', NULL, '#EC4899', 'film', 3);

-- Entertainment children
INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Commentary', 'commentary', id, '#F472B6', 'message-circle', 1 FROM categories WHERE slug = 'entertainment';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Reactions', 'reactions', id, '#DB2777', 'smile', 2 FROM categories WHERE slug = 'entertainment';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Gaming', 'gaming', id, '#BE185D', 'gamepad-2', 3 FROM categories WHERE slug = 'entertainment';

-- Education (Parent)
INSERT INTO categories (name, slug, parent_id, color, icon, sort_order) VALUES
('Education', 'education', NULL, '#3B82F6', 'graduation-cap', 4);

-- Education children
INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'How-To', 'how-to', id, '#60A5FA', 'help-circle', 1 FROM categories WHERE slug = 'education';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Explainers', 'explainers', id, '#2563EB', 'lightbulb', 2 FROM categories WHERE slug = 'education';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Documentary', 'documentary', id, '#1D4ED8', 'video', 3 FROM categories WHERE slug = 'education';

-- Lifestyle (Parent)
INSERT INTO categories (name, slug, parent_id, color, icon, sort_order) VALUES
('Lifestyle', 'lifestyle', NULL, '#F59E0B', 'heart', 5);

-- Lifestyle children
INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Family', 'family', id, '#FBBF24', 'users', 1 FROM categories WHERE slug = 'lifestyle';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Health & Fitness', 'health-fitness', id, '#F97316', 'activity', 2 FROM categories WHERE slug = 'lifestyle';

INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
SELECT 'Travel', 'travel', id, '#EA580C', 'map-pin', 3 FROM categories WHERE slug = 'lifestyle';
