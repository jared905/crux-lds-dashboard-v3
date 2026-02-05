-- Unified Category Hierarchy
-- Full View Analytics - Crux Media
-- Migration 012: Add LDS-specific categories and consumer brand hierarchies
--
-- This migration extends the existing category structure to support:
-- 1. LDS-specific religious subcategories (under Faith & Religion)
-- 2. CPG / Consumer Brands parent with audio and action sports
-- 3. Gaming & Esports parent
-- 4. Tech & Reviews parent

-- ============================================
-- EXTEND FAITH & RELIGION WITH LDS CATEGORIES
-- ============================================

-- First, ensure Faith & Religion parent exists and get its ID
DO $$
DECLARE
  faith_religion_id UUID;
BEGIN
  -- Get or create Faith & Religion parent
  SELECT id INTO faith_religion_id FROM categories WHERE slug = 'faith-religion';

  IF faith_religion_id IS NULL THEN
    INSERT INTO categories (name, slug, parent_id, color, icon, sort_order)
    VALUES ('Religious & Faith', 'faith-religion', NULL, '#8B5CF6', 'church', 1)
    RETURNING id INTO faith_religion_id;
  END IF;

  -- Add LDS Official (if not exists)
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('LDS Official', 'lds-official', faith_religion_id, '#3b82f6', 'building', 10, 'Institutional church channels')
  ON CONFLICT (slug) DO NOTHING;

  -- Add LDS Faithful Creators
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('LDS Faithful Creators', 'lds-faithful', faith_religion_id, '#10b981', 'heart', 11, 'Apologetics, scholarship, lifestyle')
  ON CONFLICT (slug) DO NOTHING;

  -- Add Ex-Mormon
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Ex-Mormon', 'ex-mormon', faith_religion_id, '#ef4444', 'log-out', 12, 'Personal stories, research, expose')
  ON CONFLICT (slug) DO NOTHING;

  -- Add Counter-Cult Evangelical
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Counter-Cult Evangelical', 'counter-cult', faith_religion_id, '#f97316', 'alert-circle', 13, 'Evangelical critique channels')
  ON CONFLICT (slug) DO NOTHING;

  -- Add Megachurch
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Megachurch', 'megachurch', faith_religion_id, '#8b5cf6', 'mic', 14, 'High-production contemporary churches')
  ON CONFLICT (slug) DO NOTHING;

  -- Add Deconstruction
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Deconstruction', 'deconstruction', faith_religion_id, '#ec4899', 'unlock', 15, 'Multi-faith and LDS-specific deconstruction')
  ON CONFLICT (slug) DO NOTHING;

END $$;

-- ============================================
-- CPG / CONSUMER BRANDS HIERARCHY
-- ============================================

DO $$
DECLARE
  cpg_id UUID;
  consumer_audio_id UUID;
  action_sports_id UUID;
BEGIN
  -- Create CPG / Consumer Brands parent
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('CPG / Consumer Brands', 'cpg-consumer-brands', NULL, '#06b6d4', 'shopping-bag', 10, 'Consumer packaged goods and lifestyle brands')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO cpg_id;

  IF cpg_id IS NULL THEN
    SELECT id INTO cpg_id FROM categories WHERE slug = 'cpg-consumer-brands';
  END IF;

  -- Consumer Audio subcategory
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Consumer Audio', 'consumer-audio', cpg_id, '#3b82f6', 'headphones', 1, 'Audio brands and headphone manufacturers')
  ON CONFLICT (slug) DO UPDATE SET parent_id = cpg_id
  RETURNING id INTO consumer_audio_id;

  IF consumer_audio_id IS NULL THEN
    SELECT id INTO consumer_audio_id FROM categories WHERE slug = 'consumer-audio';
  END IF;

  -- Consumer Audio children
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Lifestyle Audio Brands', 'lifestyle-audio-brands', consumer_audio_id, '#60a5fa', 'music', 1, 'Premium lifestyle headphone brands')
  ON CONFLICT (slug) DO UPDATE SET parent_id = consumer_audio_id;

  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Budget & Value Audio', 'budget-value-audio', consumer_audio_id, '#93c5fd', 'dollar-sign', 2, 'Budget and mid-tier audio brands')
  ON CONFLICT (slug) DO UPDATE SET parent_id = consumer_audio_id;

  -- Action Sports & Culture subcategory
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Action Sports & Culture', 'action-sports-culture', cpg_id, '#ef4444', 'zap', 2, 'Extreme sports and lifestyle brands')
  ON CONFLICT (slug) DO UPDATE SET parent_id = cpg_id
  RETURNING id INTO action_sports_id;

  IF action_sports_id IS NULL THEN
    SELECT id INTO action_sports_id FROM categories WHERE slug = 'action-sports-culture';
  END IF;

  -- Action Sports children
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Extreme Sports Networks', 'extreme-sports-networks', action_sports_id, '#f87171', 'flame', 1, 'Energy drink and extreme sports channels')
  ON CONFLICT (slug) DO UPDATE SET parent_id = action_sports_id;

  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Skateboarding & Board Sports', 'skateboarding-board-sports', action_sports_id, '#fca5a5', 'activity', 2, 'Skate, snow, and surf brands')
  ON CONFLICT (slug) DO UPDATE SET parent_id = action_sports_id;

  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Lifestyle & Streetwear', 'lifestyle-streetwear', action_sports_id, '#fecaca', 'shirt', 3, 'Streetwear and lifestyle apparel')
  ON CONFLICT (slug) DO UPDATE SET parent_id = action_sports_id;

END $$;

-- ============================================
-- GAMING & ESPORTS HIERARCHY
-- ============================================

DO $$
DECLARE
  gaming_id UUID;
BEGIN
  -- Create Gaming & Esports parent
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Gaming & Esports', 'gaming-esports', NULL, '#8b5cf6', 'gamepad-2', 11, 'Gaming peripherals and esports brands')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO gaming_id;

  IF gaming_id IS NULL THEN
    SELECT id INTO gaming_id FROM categories WHERE slug = 'gaming-esports';
  END IF;

  -- Gaming Peripherals
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Gaming Peripherals', 'gaming-peripherals', gaming_id, '#a78bfa', 'mouse', 1, 'Gaming headsets, mice, keyboards')
  ON CONFLICT (slug) DO UPDATE SET parent_id = gaming_id;

  -- PC & Hardware Ecosystem
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('PC & Hardware Ecosystem', 'pc-hardware-ecosystem', gaming_id, '#c4b5fd', 'cpu', 2, 'PC components and ecosystem brands')
  ON CONFLICT (slug) DO UPDATE SET parent_id = gaming_id;

  -- Gaming Media
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Gaming Media', 'gaming-media', gaming_id, '#ddd6fe', 'tv', 3, 'Gaming news and review outlets')
  ON CONFLICT (slug) DO UPDATE SET parent_id = gaming_id;

END $$;

-- ============================================
-- TECH & REVIEWS HIERARCHY
-- ============================================

DO $$
DECLARE
  tech_id UUID;
BEGIN
  -- Create Tech & Reviews parent
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Tech & Reviews', 'tech-reviews', NULL, '#10b981', 'monitor', 12, 'Tech reviewers and media outlets')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO tech_id;

  IF tech_id IS NULL THEN
    SELECT id INTO tech_id FROM categories WHERE slug = 'tech-reviews';
  END IF;

  -- Hardware Reviewers
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Hardware Reviewers', 'hardware-reviewers', tech_id, '#34d399', 'box', 1, 'Consumer tech and hardware reviewers')
  ON CONFLICT (slug) DO UPDATE SET parent_id = tech_id;

  -- Niche Audio Reviewers
  INSERT INTO categories (name, slug, parent_id, color, icon, sort_order, description)
  VALUES ('Niche Audio Reviewers', 'niche-audio-reviewers', tech_id, '#6ee7b7', 'headphones', 2, 'Audio-focused review channels')
  ON CONFLICT (slug) DO UPDATE SET parent_id = tech_id;

END $$;

-- ============================================
-- VERIFY HIERARCHY
-- ============================================

-- Create a helpful view for debugging
CREATE OR REPLACE VIEW category_hierarchy_debug AS
SELECT
  c.id,
  c.name,
  c.slug,
  p.name as parent_name,
  c.sort_order,
  c.color
FROM categories c
LEFT JOIN categories p ON c.parent_id = p.id
ORDER BY
  COALESCE(p.sort_order, c.sort_order),
  c.sort_order;
