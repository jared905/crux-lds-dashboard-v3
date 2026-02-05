-- Add Industry Column to Channels
-- Full View Analytics - Crux Media
-- Migration 013: Add industry field for quick filtering between datasets
--
-- Industry values:
-- - 'religious' - LDS and faith-related channels
-- - 'cpg' - Consumer packaged goods (Skullcandy, etc.)
-- - 'gaming' - Gaming & esports
-- - 'tech' - Tech reviewers and media
-- - NULL - Not yet classified

-- ============================================
-- ADD INDUSTRY COLUMN
-- ============================================

ALTER TABLE channels
ADD COLUMN IF NOT EXISTS industry TEXT;

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_channels_industry ON channels(industry);

-- ============================================
-- BACKFILL EXISTING LDS CHANNELS
-- ============================================
-- Match channels based on their flat category field

UPDATE channels
SET industry = 'religious'
WHERE category IN (
  'lds-official',
  'lds-faithful',
  'ex-mormon',
  'counter-cult',
  'megachurch',
  'catholic',
  'muslim',
  'jewish',
  'deconstruction'
)
AND industry IS NULL;

-- ============================================
-- BACKFILL BASED ON CHANNEL_CATEGORIES
-- ============================================
-- For channels already assigned via junction table,
-- derive industry from their category hierarchy

-- Religious industry (Faith & Religion tree)
UPDATE channels
SET industry = 'religious'
WHERE id IN (
  SELECT DISTINCT cc.channel_id
  FROM channel_categories cc
  JOIN categories c ON cc.category_id = c.id
  JOIN categories p ON c.parent_id = p.id OR c.id = p.id
  WHERE p.slug = 'faith-religion'
)
AND industry IS NULL;

-- CPG industry
UPDATE channels
SET industry = 'cpg'
WHERE id IN (
  SELECT DISTINCT cc.channel_id
  FROM channel_categories cc
  JOIN categories c ON cc.category_id = c.id
  WHERE c.slug IN (
    'cpg-consumer-brands',
    'consumer-audio',
    'lifestyle-audio-brands',
    'budget-value-audio',
    'action-sports-culture',
    'extreme-sports-networks',
    'skateboarding-board-sports',
    'lifestyle-streetwear'
  )
)
AND industry IS NULL;

-- Gaming industry
UPDATE channels
SET industry = 'gaming'
WHERE id IN (
  SELECT DISTINCT cc.channel_id
  FROM channel_categories cc
  JOIN categories c ON cc.category_id = c.id
  WHERE c.slug IN (
    'gaming-esports',
    'gaming-peripherals',
    'pc-hardware-ecosystem',
    'gaming-media'
  )
)
AND industry IS NULL;

-- Tech industry
UPDATE channels
SET industry = 'tech'
WHERE id IN (
  SELECT DISTINCT cc.channel_id
  FROM channel_categories cc
  JOIN categories c ON cc.category_id = c.id
  WHERE c.slug IN (
    'tech-reviews',
    'hardware-reviewers',
    'niche-audio-reviewers'
  )
)
AND industry IS NULL;

-- ============================================
-- ADD CONSTRAINT (optional - uncomment if you want strict values)
-- ============================================
-- ALTER TABLE channels
-- ADD CONSTRAINT channels_industry_check
-- CHECK (industry IS NULL OR industry IN ('religious', 'cpg', 'gaming', 'tech'));
