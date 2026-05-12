-- 066: Seed Research v2 taxonomy + tag vocabulary + classifier metadata + recipes.
--
-- Run AFTER migration 065 (which wiped the category tables).
-- Sets up everything the Claude classifier and the Recipes dropdown depend on.

-- ============================================
-- 1. Tag vocabulary table
-- ============================================
-- Faceted tags (Identity, Format, Cadence, Style) cut across categories.
-- Used by both the classifier (to pick from) and the ScopeBar tag picker
-- (so the dropdown has options even before any channel is tagged).
CREATE TABLE IF NOT EXISTS tag_vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facet TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(facet, value)
);

CREATE INDEX IF NOT EXISTS idx_tag_vocabulary_facet ON tag_vocabulary(facet);

ALTER TABLE tag_vocabulary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tag vocab"  ON tag_vocabulary FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write tag vocab" ON tag_vocabulary FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO tag_vocabulary (facet, value, description, sort_order) VALUES
  ('identity', 'creator-led',     'Built around an individual personality',     1),
  ('identity', 'brand-owned',     'Corporate brand-operated channel',           2),
  ('identity', 'network',         'Network or publisher-owned',                 3),
  ('identity', 'institutional',   'Org / non-profit / institution',             4),
  ('identity', 'legacy-media',    'Extension of legacy TV / print',             5),
  ('format',   'shorts-heavy',    'Over 50% Shorts (<3 min)',                   1),
  ('format',   'long-form',       'Over 70% long-form (3+ min)',                2),
  ('format',   'mixed',           'Balanced mix of Shorts and long-form',       3),
  ('format',   'documentary',     'Long-form 15+ min documentary style',        4),
  ('format',   'livestream',      'Live or live-then-archived content',         5),
  ('cadence',  'daily',           'Daily or near-daily uploads',                1),
  ('cadence',  'several-per-week','3-5 uploads per week',                       2),
  ('cadence',  'weekly',          'About one upload per week',                  3),
  ('cadence',  'monthly',         'Roughly monthly cadence',                    4),
  ('style',    'educational',     'Teaching, explaining, how-to',               1),
  ('style',    'entertainment',   'Entertainment-first content',                2),
  ('style',    'news-commentary', 'News, commentary, analysis',                 3),
  ('style',    'interview',       'Interview or talk format',                   4),
  ('style',    'vlog',            'Personal vlog or behind-the-scenes',         5)
ON CONFLICT (facet, value) DO NOTHING;

-- ============================================
-- 2. Parent categories (verticals)
-- ============================================
INSERT INTO categories (name, slug, color, icon, sort_order) VALUES
  ('Faith',            'faith',          '#a78bfa', 'folder', 1),
  ('Finance',          'finance',        '#10b981', 'folder', 2),
  ('Sports',           'sports',         '#ef4444', 'folder', 3),
  ('Entertainment',    'entertainment',  '#f59e0b', 'folder', 4),
  ('Consumer/CPG',     'consumer-cpg',   '#3b82f6', 'folder', 5),
  ('Home & Lifestyle', 'home-lifestyle', '#ec4899', 'folder', 6),
  ('Tech & Gaming',    'tech-gaming',    '#22d3ee', 'folder', 7)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 3. Sub-categories
-- ============================================
INSERT INTO categories (name, slug, parent_id, color, sort_order)
SELECT name, slug, (SELECT id FROM categories WHERE slug = parent_slug), color, sort_order
FROM (VALUES
  ('LDS',                 'faith-lds',              'faith',          '#c4b5fd', 1),
  ('Catholic',            'faith-catholic',         'faith',          '#c4b5fd', 2),
  ('Protestant',          'faith-protestant',       'faith',          '#c4b5fd', 3),
  ('Non-denominational',  'faith-nondenom',         'faith',          '#c4b5fd', 4),
  ('Apologetics',         'faith-apologetics',      'faith',          '#c4b5fd', 5),
  ('Personal Finance',    'finance-personal',       'finance',        '#6ee7b7', 1),
  ('Investing',           'finance-investing',      'finance',        '#6ee7b7', 2),
  ('Retirement',          'finance-retirement',     'finance',        '#6ee7b7', 3),
  ('Real Estate',         'finance-realestate',     'finance',        '#6ee7b7', 4),
  ('Money News',          'finance-news',           'finance',        '#6ee7b7', 5),
  ('Pro Leagues',         'sports-pro',             'sports',         '#fca5a5', 1),
  ('Combat Sports',       'sports-combat',          'sports',         '#fca5a5', 2),
  ('Action/Extreme',      'sports-action',          'sports',         '#fca5a5', 3),
  ('Sports Media',        'sports-media',           'sports',         '#fca5a5', 4),
  ('Late Night',          'entertainment-latenight','entertainment',  '#fcd34d', 1),
  ('Documentary',         'entertainment-doc',      'entertainment',  '#fcd34d', 2),
  ('Interview / Talk',    'entertainment-interview','entertainment',  '#fcd34d', 3),
  ('Movie & TV Analysis', 'entertainment-movie',    'entertainment',  '#fcd34d', 4),
  ('Reality',             'entertainment-reality',  'entertainment',  '#fcd34d', 5),
  ('Food & Bev',          'cpg-food',               'consumer-cpg',   '#93c5fd', 1),
  ('Beauty',              'cpg-beauty',             'consumer-cpg',   '#93c5fd', 2),
  ('Apparel',             'cpg-apparel',            'consumer-cpg',   '#93c5fd', 3),
  ('Household',           'cpg-household',          'consumer-cpg',   '#93c5fd', 4),
  ('Pet',                 'cpg-pet',                'consumer-cpg',   '#93c5fd', 5),
  ('Home Improvement',    'home-improvement',       'home-lifestyle', '#f9a8d4', 1),
  ('Home Security',       'home-security',          'home-lifestyle', '#f9a8d4', 2),
  ('Smart Home',          'home-smart',             'home-lifestyle', '#f9a8d4', 3),
  ('Family Life',         'home-family',            'home-lifestyle', '#f9a8d4', 4),
  ('Hardware Reviews',    'tech-hardware',          'tech-gaming',    '#67e8f9', 1),
  ('Gaming',              'tech-gaming-games',      'tech-gaming',    '#67e8f9', 2),
  ('Software & AI',       'tech-software',          'tech-gaming',    '#67e8f9', 3),
  ('Consumer Tech',       'tech-consumer',          'tech-gaming',    '#67e8f9', 4)
) AS sub(name, slug, parent_slug, color, sort_order)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 4. Classifier metadata on channels
-- ============================================
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS last_classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS classification_locked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS classification_reasoning TEXT;

COMMENT ON COLUMN channels.classification_locked IS
  'When true, the auto-classifier skips this channel. Set when a human manually edits assignments.';

-- Track when a classifier vs human added an assignment so manual edits can lock
ALTER TABLE channel_categories
  ADD COLUMN IF NOT EXISTS assigned_by_classifier BOOLEAN DEFAULT false;
ALTER TABLE channel_tags
  ADD COLUMN IF NOT EXISTS assigned_by_classifier BOOLEAN DEFAULT false;

-- ============================================
-- 5. Comparison recipes — pre-built scopes that teach by example
-- ============================================
-- Org-wide (user_id NULL). Pinned so they always appear in the Recipes
-- dropdown. config._recipe = true so the UI can identify them.
INSERT INTO saved_views (user_id, name, surface, lens, config, pinned, sort_order)
VALUES
  (NULL,
   'Cross-vertical: educational creators',
   'research', 'patterns',
   '{"categoryIds":[],"tags":["educational","creator-led"],"tiers":["priority","tracked"],"windowDays":90,"_recipe":true,"_description":"Any vertical, but only educational creator-led channels — find format patterns that travel across categories."}'::jsonb,
   true, 1),
  (NULL,
   'Cross-vertical: brand-owned playbook',
   'research', 'patterns',
   '{"categoryIds":[],"tags":["brand-owned"],"tiers":["priority","tracked"],"windowDays":90,"_recipe":true,"_description":"What brand-owned channels in every category are doing — compare CPG, Finance, Faith brands side-by-side."}'::jsonb,
   true, 2),
  (NULL,
   'Shorts-heavy across categories',
   'research', 'landscape',
   '{"categoryIds":[],"tags":["shorts-heavy"],"tiers":["priority","tracked"],"windowDays":30,"_recipe":true,"_description":"Every channel betting on Shorts. Use to compare velocity, engagement, and cadence across verticals."}'::jsonb,
   true, 3),
  (NULL,
   'Weekly cadence pattern',
   'research', 'patterns',
   '{"categoryIds":[],"tags":["weekly","educational"],"tiers":["priority","tracked"],"windowDays":90,"_recipe":true,"_description":"Educational channels publishing about once a week. Surfaces the title and format playbook that sustains weekly schedules."}'::jsonb,
   true, 4),
  (NULL,
   'This week''s movement (all)',
   'research', 'movement',
   '{"categoryIds":[],"tags":[],"tiers":["priority","tracked"],"windowDays":7,"_recipe":true,"_description":"Everything that moved in the last 7 days across the tracked set — breakouts, format shifts, rank changes."}'::jsonb,
   true, 5)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE saved_views IS
  'Reusable scope+lens+filter presets. config._recipe=true marks org-wide demo recipes shown in the Recipes dropdown.';
