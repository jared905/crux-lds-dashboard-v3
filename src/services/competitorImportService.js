/**
 * Competitor Import Service
 * Bulk import channels with category assignments
 *
 * Usage: Call importCompetitorChannels() from browser console or admin panel
 */

import { youtubeAPI } from './youtubeAPI';
import { supabase } from './supabaseClient';
import { createCategory, getCategoryBySlug, assignChannelToCategory } from './categoryService';
import { upsertChannel } from './competitorDatabase';

// ============================================
// CATEGORY HIERARCHY DEFINITION
// ============================================

const CATEGORY_HIERARCHY = [
  {
    name: 'Consumer Audio',
    slug: 'consumer-audio',
    color: '#3b82f6',
    children: [
      { name: 'Lifestyle Audio Brands', slug: 'lifestyle-audio-brands', color: '#60a5fa' },
      { name: 'Budget & Value Audio', slug: 'budget-value-audio', color: '#93c5fd' },
    ]
  },
  {
    name: 'Action Sports & Culture',
    slug: 'action-sports-culture',
    color: '#ef4444',
    children: [
      { name: 'Extreme Sports Networks', slug: 'extreme-sports-networks', color: '#f87171' },
      { name: 'Skateboarding & Board Sports', slug: 'skateboarding-board-sports', color: '#fca5a5' },
      { name: 'Lifestyle & Streetwear', slug: 'lifestyle-streetwear', color: '#fecaca' },
    ]
  },
  {
    name: 'Gaming & Esports',
    slug: 'gaming-esports',
    color: '#8b5cf6',
    children: [
      { name: 'Gaming Peripherals', slug: 'gaming-peripherals', color: '#a78bfa' },
      { name: 'PC & Hardware Ecosystem', slug: 'pc-hardware-ecosystem', color: '#c4b5fd' },
    ]
  },
  {
    name: 'Tech Media & Reviews',
    slug: 'tech-media-reviews',
    color: '#10b981',
    children: [
      { name: 'Hardware Reviewers', slug: 'hardware-reviewers', color: '#34d399' },
      { name: 'Gaming Media', slug: 'gaming-media', color: '#6ee7b7' },
      { name: 'Niche Audio Reviewers', slug: 'niche-audio-reviewers', color: '#a7f3d0' },
    ]
  },
];

// ============================================
// CHANNEL DATA (from CSV)
// ============================================

const CHANNELS_TO_IMPORT = [
  // Direct Lifestyle Audio -> Lifestyle Audio Brands
  { url: 'https://www.youtube.com/@beatsbydre', name: 'Beats by Dre', categorySlug: 'lifestyle-audio-brands', tags: ['brand_aesthetic_heavy_bass', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@jbl', name: 'JBL', categorySlug: 'lifestyle-audio-brands', tags: ['rugged_portability', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@SoundcoreAudio', name: 'Soundcore', categorySlug: 'lifestyle-audio-brands', tags: ['mid_tier_value', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@Sony', name: 'Sony', categorySlug: 'lifestyle-audio-brands', tags: ['mass_market_audio', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@marshallheadphones', name: 'Marshall', categorySlug: 'lifestyle-audio-brands', tags: ['lifestyle_design', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@houseofmarley', name: 'House of Marley', categorySlug: 'lifestyle-audio-brands', tags: ['eco_conscious_aesthetic', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@nothing', name: 'Nothing', categorySlug: 'lifestyle-audio-brands', tags: ['gen_z_design', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@urbanears', name: 'Urbanears', categorySlug: 'lifestyle-audio-brands', tags: ['color_centric_lifestyle', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@boat.lifestyle', name: 'BoAt', categorySlug: 'lifestyle-audio-brands', tags: ['budget_lifestyle_global', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@jlab', name: 'JLab', categorySlug: 'lifestyle-audio-brands', tags: ['entry_level_retail', 'direct_competitor'] },

  // Action Sports Culture -> Various subcategories
  { url: 'https://www.youtube.com/@redbull', name: 'Red Bull', categorySlug: 'extreme-sports-networks', tags: ['audience_demographic', 'sponsorship_competitor'] },
  { url: 'https://www.youtube.com/@GoPro', name: 'GoPro', categorySlug: 'extreme-sports-networks', tags: ['shared_influencer_pool', 'sponsorship_competitor'] },
  { url: 'https://www.youtube.com/@MonsterEnergy', name: 'Monster Energy', categorySlug: 'extreme-sports-networks', tags: ['extreme_sports_sponsorship', 'sponsorship_competitor'] },
  { url: 'https://www.youtube.com/@Vans', name: 'Vans', categorySlug: 'skateboarding-board-sports', tags: ['skate_culture', 'sponsorship_competitor'] },
  { url: 'https://www.youtube.com/@ThrasherMagazine', name: 'Thrasher Magazine', categorySlug: 'skateboarding-board-sports', tags: ['primary_core_demographic', 'media_outlet'] },
  { url: 'https://www.youtube.com/@Oakley', name: 'Oakley', categorySlug: 'extreme-sports-networks', tags: ['performance_lifestyle', 'sponsorship_competitor'] },
  { url: 'https://www.youtube.com/@berrics', name: 'The Berrics', categorySlug: 'skateboarding-board-sports', tags: ['skate_influencer_hub', 'media_outlet'] },
  { url: 'https://www.youtube.com/@BurtonSnowboards', name: 'Burton Snowboards', categorySlug: 'skateboarding-board-sports', tags: ['winter_sports_vertical', 'sponsorship_competitor'] },
  { url: 'https://www.youtube.com/@Volcom', name: 'Volcom', categorySlug: 'lifestyle-streetwear', tags: ['creative_board_sports', 'sponsorship_competitor'] },
  { url: 'https://www.youtube.com/@Stance', name: 'Stance', categorySlug: 'lifestyle-streetwear', tags: ['streetwear_accessories', 'sponsorship_competitor'] },

  // Gaming Audio Gear -> Gaming Peripherals / PC Hardware
  { url: 'https://www.youtube.com/@razer', name: 'Razer', categorySlug: 'gaming-peripherals', tags: ['gaming_peripherals', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@SteelSeries', name: 'SteelSeries', categorySlug: 'gaming-peripherals', tags: ['competitive_gaming_audio', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@hyperx', name: 'HyperX', categorySlug: 'gaming-peripherals', tags: ['gaming_value_prop', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@LogitechG', name: 'Logitech G', categorySlug: 'gaming-peripherals', tags: ['global_gaming_standard', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@TurtleBeachVideos', name: 'Turtle Beach', categorySlug: 'gaming-peripherals', tags: ['console_gaming_focus', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@astrogaming', name: 'ASTRO Gaming', categorySlug: 'gaming-peripherals', tags: ['premium_gaming_lifestyle', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@Corsair', name: 'Corsair', categorySlug: 'pc-hardware-ecosystem', tags: ['pc_ecosystem', 'indirect_competitor'] },
  { url: 'https://www.youtube.com/@eposaudio', name: 'EPOS Gaming', categorySlug: 'gaming-peripherals', tags: ['professional_esports', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@Alienware', name: 'Alienware', categorySlug: 'pc-hardware-ecosystem', tags: ['hardware_ecosystem', 'indirect_competitor'] },
  { url: 'https://www.youtube.com/@ASUSROG', name: 'ASUS ROG', categorySlug: 'pc-hardware-ecosystem', tags: ['gamer_lifestyle_branding', 'indirect_competitor'] },

  // Tech Influence Reviewers -> Hardware Reviewers / Gaming Media / Niche
  { url: 'https://www.youtube.com/@mkbhd', name: 'Marques Brownlee', categorySlug: 'hardware-reviewers', tags: ['consumer_tech_authority', 'influencer'] },
  { url: 'https://www.youtube.com/@unboxtherapy', name: 'Unbox Therapy', categorySlug: 'hardware-reviewers', tags: ['high_volume_tech_hype', 'influencer'] },
  { url: 'https://www.youtube.com/@theverge', name: 'The Verge', categorySlug: 'hardware-reviewers', tags: ['lifestyle_tech_editorial', 'media_outlet'] },
  { url: 'https://www.youtube.com/@ShortCircuit', name: 'ShortCircuit', categorySlug: 'hardware-reviewers', tags: ['hands_on_unboxing', 'influencer'] },
  { url: 'https://www.youtube.com/@GamesRadar', name: 'GamesRadar', categorySlug: 'gaming-media', tags: ['gaming_hardware_guides', 'media_outlet'] },
  { url: 'https://www.youtube.com/@HardwareCanucks', name: 'Hardware Canucks', categorySlug: 'hardware-reviewers', tags: ['technical_comparison', 'influencer'] },
  { url: 'https://www.youtube.com/@badseedtech', name: 'BadSeed Tech', categorySlug: 'niche-audio-reviewers', tags: ['aesthetic_tech_curator', 'influencer'] },
  { url: 'https://www.youtube.com/@ElJefeReviews', name: 'El Jefe Reviews', categorySlug: 'niche-audio-reviewers', tags: ['earbud_specific_niche', 'influencer'] },
  { url: 'https://www.youtube.com/@pickyaudio', name: 'Pickey Audio', categorySlug: 'niche-audio-reviewers', tags: ['fit_and_workout_niche', 'influencer'] },
  { url: 'https://www.youtube.com/@gamespot', name: 'Gamespot', categorySlug: 'gaming-media', tags: ['mass_market_gaming', 'media_outlet'] },

  // Budget ECommerce Audio -> Budget & Value Audio / Lifestyle Audio
  { url: 'https://www.youtube.com/@TOZO_Official', name: 'Tozo', categorySlug: 'budget-value-audio', tags: ['amazon_direct_competitor', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@EarFun_Official', name: 'Earfun', categorySlug: 'budget-value-audio', tags: ['value_audio_performance', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@TribitAudio', name: 'Tribit', categorySlug: 'budget-value-audio', tags: ['outdoor_durability', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@sennheiser', name: 'Sennheiser', categorySlug: 'lifestyle-audio-brands', tags: ['sport_anc_competitor', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@Bose', name: 'Bose', categorySlug: 'lifestyle-audio-brands', tags: ['travel_anc_segment', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@shure', name: 'Shure', categorySlug: 'lifestyle-audio-brands', tags: ['professional_creator_gear', 'aspirational_benchmark'] },
  { url: 'https://www.youtube.com/@EdifierGlobal', name: 'Edifier', categorySlug: 'budget-value-audio', tags: ['design_and_audio_value', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@1moreaudio', name: '1MORE', categorySlug: 'budget-value-audio', tags: ['feature_rich_mid_market', 'direct_competitor'] },
  { url: 'https://www.youtube.com/@Wyze', name: 'Wyze', categorySlug: 'budget-value-audio', tags: ['disruptive_low_cost', 'indirect_competitor'] },
  { url: 'https://www.youtube.com/@Apple', name: 'Apple', categorySlug: 'lifestyle-audio-brands', tags: ['market_share_standard', 'aspirational_benchmark'] },
];

// ============================================
// IMPORT FUNCTIONS
// ============================================

/**
 * Create the category hierarchy if it doesn't exist
 */
async function ensureCategoryHierarchy() {
  console.log('📁 Creating category hierarchy...');
  const categoryMap = {};

  for (const parent of CATEGORY_HIERARCHY) {
    // Check if parent exists
    let parentCat = await getCategoryBySlug(parent.slug);

    if (!parentCat) {
      console.log(`  Creating parent: ${parent.name}`);
      parentCat = await createCategory({
        name: parent.name,
        color: parent.color,
      });
    } else {
      console.log(`  Parent exists: ${parent.name}`);
    }

    categoryMap[parent.slug] = parentCat.id;

    // Create children
    for (const child of parent.children || []) {
      let childCat = await getCategoryBySlug(child.slug);

      if (!childCat) {
        console.log(`    Creating child: ${child.name}`);
        childCat = await createCategory({
          name: child.name,
          parentId: parentCat.id,
          color: child.color,
        });
      } else {
        console.log(`    Child exists: ${child.name}`);
      }

      categoryMap[child.slug] = childCat.id;
    }
  }

  console.log('✅ Category hierarchy ready\n');
  return categoryMap;
}

/**
 * Import a single channel
 */
async function importChannel(channelData, categoryMap, index, total) {
  const { url, name, categorySlug, tags } = channelData;

  console.log(`[${index + 1}/${total}] Processing: ${name}`);

  try {
    // 1. Resolve channel ID from URL
    const channelId = await youtubeAPI.resolveChannelId(url);

    // 2. Check if channel already exists
    const { data: existing } = await supabase
      .from('channels')
      .select('id, name')
      .eq('youtube_channel_id', channelId)
      .single();

    let channel;

    if (existing) {
      console.log(`  ↳ Already exists, updating tags`);
      // Update tags if channel exists
      const { data: updated } = await supabase
        .from('channels')
        .update({
          tags: tags,
          is_competitor: true,
          sync_enabled: true,
        })
        .eq('id', existing.id)
        .select()
        .single();
      channel = updated;
    } else {
      // 3. Fetch full channel details from YouTube
      console.log(`  ↳ Fetching from YouTube...`);
      const details = await youtubeAPI.fetchChannelDetails(channelId);

      // 4. Create channel in database
      channel = await upsertChannel({
        ...details,
        tags: tags,
        is_competitor: true,
        sync_enabled: true,
        created_via: 'bulk_import',
      });
      console.log(`  ↳ Created: ${channel.name} (${channel.subscriber_count?.toLocaleString()} subs)`);
    }

    // 5. Assign to category
    const categoryId = categoryMap[categorySlug];
    if (categoryId && channel?.id) {
      await assignChannelToCategory(channel.id, categoryId);
      console.log(`  ↳ Assigned to category: ${categorySlug}`);
    }

    return { success: true, name, channelId: channel?.id };

  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    return { success: false, name, error: err.message };
  }
}

/**
 * Main import function - run this from console
 */
export async function importCompetitorChannels(options = {}) {
  const { dryRun = false, startIndex = 0, batchSize = 50 } = options;

  console.log('🚀 Starting Competitor Channel Import');
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`   Channels: ${CHANNELS_TO_IMPORT.length}`);
  console.log('');

  if (dryRun) {
    console.log('DRY RUN - Would create these categories:');
    CATEGORY_HIERARCHY.forEach(p => {
      console.log(`  📁 ${p.name}`);
      p.children?.forEach(c => console.log(`     └─ ${c.name}`));
    });
    console.log('\nDRY RUN - Would import these channels:');
    CHANNELS_TO_IMPORT.forEach((ch, i) => {
      console.log(`  ${i + 1}. ${ch.name} -> ${ch.categorySlug}`);
    });
    return { dryRun: true, channelCount: CHANNELS_TO_IMPORT.length };
  }

  // Create category hierarchy
  const categoryMap = await ensureCategoryHierarchy();

  // Import channels
  const results = { success: [], failed: [] };
  const channelsToProcess = CHANNELS_TO_IMPORT.slice(startIndex, startIndex + batchSize);

  for (let i = 0; i < channelsToProcess.length; i++) {
    const result = await importChannel(
      channelsToProcess[i],
      categoryMap,
      startIndex + i,
      CHANNELS_TO_IMPORT.length
    );

    if (result.success) {
      results.success.push(result);
    } else {
      results.failed.push(result);
    }

    // Small delay to avoid rate limiting
    if (i < channelsToProcess.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 IMPORT SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Successful: ${results.success.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\nFailed channels:');
    results.failed.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  }

  return results;
}

/**
 * Get import status/preview
 */
export function getImportPreview() {
  return {
    categories: CATEGORY_HIERARCHY,
    channels: CHANNELS_TO_IMPORT,
    totalChannels: CHANNELS_TO_IMPORT.length,
  };
}

export default {
  importCompetitorChannels,
  getImportPreview,
  CATEGORY_HIERARCHY,
  CHANNELS_TO_IMPORT,
};
