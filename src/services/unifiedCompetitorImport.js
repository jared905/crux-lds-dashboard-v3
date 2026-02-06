/**
 * Unified Competitor Import Service
 * Full View Analytics - Crux Media
 *
 * Single import service for all competitor datasets.
 * Uses hierarchical categories via channel_categories junction table.
 *
 * Usage:
 *   import { importDataset, getAvailableDatasets } from './unifiedCompetitorImport';
 *   await importDataset('lds', clientId);      // Import LDS channels
 *   await importDataset('skullcandy', clientId); // Import Skullcandy competitors
 */

import { supabase } from './supabaseClient';
import { youtubeAPI } from './youtubeAPI';
import { upsertChannel } from './competitorDatabase';
import { getCategoryBySlug, assignChannelToCategory } from './categoryService';

// ============================================
// DATASET CONFIGURATIONS
// ============================================

const DATASETS = {
  lds: {
    name: 'LDS Religious Content',
    industry: 'religious',
    description: '44 channels across faith-based categories',
    channels: () => import('./competitorImport').then(m => m.COMPETITOR_CHANNELS),
  },
  skullcandy: {
    name: 'Skullcandy Competitors',
    industry: 'cpg',
    description: '50 channels across audio, gaming, and tech categories',
    channels: () => import('./competitorImportService').then(m => m.default.CHANNELS_TO_IMPORT),
  },
};

// ============================================
// PUBLIC API
// ============================================

/**
 * Get list of available datasets
 */
export function getAvailableDatasets() {
  return Object.entries(DATASETS).map(([key, config]) => ({
    id: key,
    name: config.name,
    industry: config.industry,
    description: config.description,
  }));
}

/**
 * Get preview of a dataset (channels and categories)
 */
export async function getDatasetPreview(datasetId) {
  const config = DATASETS[datasetId];
  if (!config) {
    throw new Error(`Unknown dataset: ${datasetId}`);
  }

  const channels = await config.channels();

  // Group by category
  const categories = {};
  channels.forEach(ch => {
    const cat = ch.category || ch.categorySlug || 'uncategorized';
    if (!categories[cat]) {
      categories[cat] = { name: cat, count: 0, channels: [] };
    }
    categories[cat].count++;
    categories[cat].channels.push(ch.name);
  });

  return {
    datasetId,
    name: config.name,
    industry: config.industry,
    totalChannels: channels.length,
    categories: Object.values(categories),
  };
}

/**
 * Import a dataset into Supabase
 *
 * @param {string} datasetId - 'lds' or 'skullcandy'
 * @param {string} clientId - Client ID to assign channels to (optional)
 * @param {Object} options
 * @param {function} options.onProgress - Called with (current, total, channelName)
 * @param {boolean} options.dryRun - If true, logs but doesn't write
 * @returns {Object} { imported, skipped, errors }
 */
export async function importDataset(datasetId, clientId, options = {}) {
  const { onProgress, dryRun = false } = options;

  const config = DATASETS[datasetId];
  if (!config) {
    throw new Error(`Unknown dataset: ${datasetId}`);
  }

  console.log('========================================');
  console.log(`Importing: ${config.name}`);
  console.log(`Industry: ${config.industry}`);
  console.log(`Client ID: ${clientId || '(master only)'}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('========================================\n');

  const channels = await config.channels();
  const results = { imported: 0, skipped: 0, errors: [], channels: [] };
  const total = channels.length;

  for (let i = 0; i < total; i++) {
    const channelData = channels[i];
    const channelName = channelData.name;

    if (onProgress) {
      onProgress(i + 1, total, channelName);
    }

    console.log(`[${i + 1}/${total}] Processing: ${channelName}`);

    if (dryRun) {
      console.log(`  [DRY RUN] Would import with industry=${config.industry}`);
      results.imported++;
      continue;
    }

    try {
      const result = await importSingleChannel(channelData, {
        clientId,
        industry: config.industry,
        datasetId,
      });

      if (result.skipped) {
        console.log(`  Skipped: ${result.reason}`);
        results.skipped++;
      } else {
        console.log(`  Imported: ${result.channel?.name || channelName}`);
        results.imported++;
        results.channels.push(result.channel);
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      results.errors.push({ channel: channelName, error: err.message });
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('IMPORT SUMMARY');
  console.log('========================================');
  console.log(`Imported: ${results.imported}`);
  console.log(`Skipped:  ${results.skipped}`);
  console.log(`Errors:   ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(e => console.log(`  - ${e.channel}: ${e.error}`));
  }

  return results;
}

// ============================================
// INTERNAL FUNCTIONS
// ============================================

/**
 * Import a single channel
 */
async function importSingleChannel(channelData, { clientId, industry, datasetId }) {
  // Normalize channel data from different formats
  const normalized = normalizeChannelData(channelData, datasetId);

  // Check if channel already exists
  const { data: existing } = await supabase
    .from('channels')
    .select('id, name')
    .eq('youtube_channel_id', normalized.youtube_channel_id)
    .single();

  let channel;

  if (existing) {
    // Update existing channel with new metadata
    const { data: updated, error } = await supabase
      .from('channels')
      .update({
        industry,
        tags: normalized.tags,
        tier: normalized.tier,
        notes: normalized.notes,
        sync_enabled: true,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    channel = updated;
  } else {
    // Resolve channel ID if it's a handle
    let youtubeChannelId = normalized.youtube_channel_id;
    let channelDetails = null;

    if (youtubeChannelId.startsWith('handle_')) {
      // Need to resolve from URL or custom_url
      const url = normalized.url || `https://www.youtube.com/${normalized.custom_url}`;
      try {
        youtubeChannelId = await youtubeAPI.resolveChannelId(url);
        channelDetails = await youtubeAPI.fetchChannelDetails(youtubeChannelId);
      } catch (err) {
        console.warn(`  Could not resolve handle, using placeholder: ${err.message}`);
        // Keep the handle_ prefix as placeholder
      }
    }

    // Create new channel
    channel = await upsertChannel({
      youtube_channel_id: youtubeChannelId,
      name: channelDetails?.name || normalized.name,
      description: channelDetails?.description || normalized.notes,
      thumbnail_url: channelDetails?.thumbnail_url || null,
      custom_url: normalized.custom_url,
      category: normalized.category, // Keep flat category for backwards compat
      tags: normalized.tags,
      tier: normalized.tier,
      notes: normalized.notes,
      industry,
      is_competitor: true,
      client_id: clientId || null,
      subscriber_count: channelDetails?.subscriber_count || 0,
      total_view_count: channelDetails?.total_view_count || 0,
      video_count: channelDetails?.video_count || 0,
    });
  }

  // Assign to hierarchical category
  if (channel?.id && normalized.categorySlug) {
    const category = await getCategoryBySlug(normalized.categorySlug);
    if (category) {
      await assignChannelToCategory(channel.id, category.id);
    }
  }

  return { channel, skipped: false };
}

/**
 * Normalize channel data from different import formats
 */
function normalizeChannelData(data, datasetId) {
  if (datasetId === 'lds') {
    // LDS format: { youtube_channel_id, name, category, subcategory, tier, tags, notes }
    return {
      youtube_channel_id: data.youtube_channel_id,
      name: data.name,
      custom_url: data.custom_url,
      category: data.category,
      categorySlug: data.category, // Same as category for LDS
      subcategory: data.subcategory,
      tier: data.tier || 'secondary',
      tags: data.tags || [],
      notes: data.notes,
      url: null,
    };
  }

  if (datasetId === 'skullcandy') {
    // Skullcandy format: { url, name, categorySlug, tags }
    return {
      youtube_channel_id: extractChannelHandle(data.url),
      name: data.name,
      custom_url: extractHandle(data.url),
      category: data.categorySlug,
      categorySlug: data.categorySlug,
      subcategory: null,
      tier: 'secondary',
      tags: data.tags || [],
      notes: null,
      url: data.url,
    };
  }

  // Unknown format - return as-is
  return data;
}

/**
 * Extract channel handle from URL
 */
function extractHandle(url) {
  if (!url) return null;
  const match = url.match(/@[\w.-]+/);
  return match ? match[0] : null;
}

/**
 * Extract channel ID placeholder from URL
 */
function extractChannelHandle(url) {
  if (!url) return null;
  const handle = extractHandle(url);
  if (handle) {
    return `handle_${handle.replace('@', '')}`;
  }
  // Try to extract UC channel ID
  const ucMatch = url.match(/UC[\w-]{22}/);
  return ucMatch ? ucMatch[0] : `handle_${url.split('/').pop()}`;
}

// ============================================
// CSV IMPORT
// ============================================

/**
 * Category mapping from CSV category names to database slugs
 */
const CSV_CATEGORY_MAP = {
  // CPG / Audio categories
  'Direct_Lifestyle_Audio': 'lifestyle-audio-brands',
  'Budget_ECommerce_Audio': 'budget-value-audio',
  // Action Sports categories
  'Action_Sports_Culture': 'action-sports-culture',
  // Gaming categories
  'Gaming_Audio_Gear': 'gaming-peripherals',
  // Tech categories
  'Tech_Influence_Reviewers': 'hardware-reviewers',
};

/**
 * Industry mapping from CSV categories
 */
const CSV_INDUSTRY_MAP = {
  'Direct_Lifestyle_Audio': 'cpg',
  'Budget_ECommerce_Audio': 'cpg',
  'Action_Sports_Culture': 'cpg',
  'Gaming_Audio_Gear': 'gaming',
  'Tech_Influence_Reviewers': 'tech',
};

/**
 * Parse CSV string into array of objects
 */
export function parseCSV(csvString) {
  const lines = csvString.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || '';
    });
    return obj;
  });
}

/**
 * Import channels from CSV data
 *
 * Expected CSV format:
 * Category,Brand_Name,YouTube_URL,Overlap_Type
 *
 * @param {string} csvData - Raw CSV string
 * @param {string} clientId - Optional client ID to assign channels to
 * @param {Object} options
 * @param {function} options.onProgress - Called with (current, total, channelName)
 * @param {boolean} options.dryRun - If true, logs but doesn't write
 * @returns {Object} { imported, skipped, errors }
 */
export async function importFromCSV(csvData, clientId = null, options = {}) {
  const { onProgress, dryRun = false } = options;

  const rows = parseCSV(csvData);
  const results = { imported: 0, skipped: 0, errors: [], channels: [] };
  const total = rows.length;

  console.log('========================================');
  console.log('CSV Import');
  console.log(`Total rows: ${total}`);
  console.log(`Client ID: ${clientId || '(master only)'}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('========================================\n');

  for (let i = 0; i < total; i++) {
    const row = rows[i];
    const channelName = row.Brand_Name || row.name || 'Unknown';

    if (onProgress) {
      onProgress(i + 1, total, channelName);
    }

    console.log(`[${i + 1}/${total}] Processing: ${channelName}`);

    if (dryRun) {
      const category = CSV_CATEGORY_MAP[row.Category] || row.Category;
      const industry = CSV_INDUSTRY_MAP[row.Category] || 'cpg';
      console.log(`  [DRY RUN] Would import: category=${category}, industry=${industry}`);
      results.imported++;
      continue;
    }

    try {
      const channel = await importCSVRow(row, clientId);
      console.log(`  Imported: ${channel?.name || channelName}`);
      results.imported++;
      results.channels.push(channel);
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      results.errors.push({ channel: channelName, error: err.message });
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('CSV IMPORT SUMMARY');
  console.log('========================================');
  console.log(`Imported: ${results.imported}`);
  console.log(`Skipped:  ${results.skipped}`);
  console.log(`Errors:   ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(e => console.log(`  - ${e.channel}: ${e.error}`));
  }

  return results;
}

/**
 * Import a single CSV row
 */
async function importCSVRow(row, clientId) {
  const url = row.YouTube_URL || row.url;
  const name = row.Brand_Name || row.name;
  const csvCategory = row.Category || row.category;
  const overlapType = row.Overlap_Type || row.overlap_type;

  // Map category to slug
  const categorySlug = CSV_CATEGORY_MAP[csvCategory] || csvCategory?.toLowerCase().replace(/_/g, '-');
  const industry = CSV_INDUSTRY_MAP[csvCategory] || 'cpg';

  // Extract handle from URL
  const handle = extractHandle(url);
  const youtubeChannelId = extractChannelHandle(url);

  // Check if channel already exists
  const { data: existing } = await supabase
    .from('channels')
    .select('id, name')
    .eq('youtube_channel_id', youtubeChannelId)
    .single();

  let channel;

  if (existing) {
    // Update existing channel
    const { data: updated, error } = await supabase
      .from('channels')
      .update({
        industry,
        category: categorySlug,
        tags: overlapType ? [overlapType] : [],
        sync_enabled: true,
        is_competitor: true,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    channel = updated;
    console.log(`  Updated existing: ${existing.name}`);
  } else {
    // Try to resolve channel details from YouTube API
    let channelDetails = null;
    let resolvedId = youtubeChannelId;

    if (youtubeChannelId.startsWith('handle_')) {
      try {
        resolvedId = await youtubeAPI.resolveChannelId(url);
        channelDetails = await youtubeAPI.fetchChannelDetails(resolvedId);
      } catch (err) {
        console.warn(`  Could not resolve handle: ${err.message}`);
      }
    }

    // Create new channel
    channel = await upsertChannel({
      youtube_channel_id: resolvedId,
      name: channelDetails?.name || name,
      description: channelDetails?.description || null,
      thumbnail_url: channelDetails?.thumbnail_url || null,
      custom_url: handle,
      category: categorySlug,
      tags: overlapType ? [overlapType] : [],
      tier: 'secondary',
      notes: overlapType ? `Overlap: ${overlapType}` : null,
      industry,
      is_competitor: true,
      client_id: clientId,
      subscriber_count: channelDetails?.subscriber_count || 0,
      total_view_count: channelDetails?.total_view_count || 0,
      video_count: channelDetails?.video_count || 0,
    });
  }

  // Assign to hierarchical category
  if (channel?.id && categorySlug) {
    const category = await getCategoryBySlug(categorySlug);
    if (category) {
      await assignChannelToCategory(channel.id, category.id);
    }
  }

  return channel;
}

// ============================================
// EXPORTS
// ============================================

export default {
  getAvailableDatasets,
  getDatasetPreview,
  importDataset,
  importFromCSV,
  parseCSV,
};
