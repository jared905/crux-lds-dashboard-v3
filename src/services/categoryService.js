/**
 * Category Service
 * Full View Analytics - Crux Media
 *
 * Handles category CRUD operations and hierarchical queries
 */

import { supabase } from './supabaseClient';

// ============================================
// CATEGORY CRUD
// ============================================

/**
 * Get all categories as a flat list
 */
export async function getAllCategories() {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order');

  if (error) throw error;
  return data;
}

/**
 * Get categories as a tree structure
 */
export async function getCategoryTree() {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('category_tree')
    .select('*');

  if (error) throw error;

  // Build nested tree from flat data
  return buildTree(data);
}

/**
 * Build nested tree from flat category list
 */
function buildTree(categories) {
  const map = {};
  const roots = [];

  // First pass: create map
  categories.forEach(cat => {
    map[cat.id] = { ...cat, children: [] };
  });

  // Second pass: build tree
  categories.forEach(cat => {
    if (cat.parent_id && map[cat.parent_id]) {
      map[cat.parent_id].children.push(map[cat.id]);
    } else if (!cat.parent_id) {
      roots.push(map[cat.id]);
    }
  });

  return roots;
}

/**
 * Get a single category by ID
 */
export async function getCategory(id) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get a category by slug
 */
export async function getCategoryBySlug(slug) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Create a new category
 */
export async function createCategory({ name, parentId, color, icon, description }) {
  if (!supabase) throw new Error('Supabase not configured');

  // Generate slug from name
  const slug = generateSlug(name);

  const { data, error } = await supabase
    .from('categories')
    .insert({
      name,
      slug,
      parent_id: parentId || null,
      color: color || '#2962FF',
      icon: icon || 'folder',
      description,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a category
 */
export async function updateCategory(id, updates) {
  if (!supabase) throw new Error('Supabase not configured');

  // If name is being updated, regenerate slug
  if (updates.name) {
    updates.slug = generateSlug(updates.name);
  }

  // Map parentId to parent_id
  if ('parentId' in updates) {
    updates.parent_id = updates.parentId;
    delete updates.parentId;
  }

  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a category (cascades to children and channel assignments)
 */
export async function deleteCategory(id) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Reorder categories within a parent
 */
export async function reorderCategories(categoryIds) {
  if (!supabase) throw new Error('Supabase not configured');

  // Update sort_order for each category
  const updates = categoryIds.map((id, index) => ({
    id,
    sort_order: index,
  }));

  for (const update of updates) {
    const { error } = await supabase
      .from('categories')
      .update({ sort_order: update.sort_order })
      .eq('id', update.id);

    if (error) throw error;
  }
}

// ============================================
// CHANNEL-CATEGORY ASSIGNMENTS
// ============================================

/**
 * Get categories for a channel
 */
export async function getChannelCategories(channelId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('channel_categories')
    .select('category_id, categories(*)')
    .eq('channel_id', channelId);

  if (error) throw error;
  return data.map(d => d.categories);
}

/**
 * Get categories for multiple channels in a single query (batch)
 * Returns { [channelId]: category[] }
 */
export async function getBulkChannelCategories(channelIds) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!channelIds?.length) return {};

  const { data, error } = await supabase
    .from('channel_categories')
    .select('channel_id, category_id, categories(*)')
    .in('channel_id', channelIds);

  if (error) throw error;

  // Group by channel_id
  const result = {};
  (data || []).forEach(row => {
    if (!result[row.channel_id]) {
      result[row.channel_id] = [];
    }
    if (row.categories) {
      result[row.channel_id].push(row.categories);
    }
  });

  return result;
}

/**
 * Get channels in a category
 */
export async function getChannelsInCategory(categoryId, { includeSubcategories = true } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  let categoryIds = [categoryId];

  // If including subcategories, get all descendant category IDs
  if (includeSubcategories) {
    const descendants = await getCategoryDescendants(categoryId);
    categoryIds = [...categoryIds, ...descendants.map(d => d.id)];
  }

  const { data, error } = await supabase
    .from('channel_categories')
    .select('channel_id, channels(*)')
    .in('category_id', categoryIds);

  if (error) throw error;

  // Deduplicate channels (might appear in multiple subcategories)
  const channelMap = {};
  data.forEach(d => {
    if (d.channels) {
      channelMap[d.channels.id] = d.channels;
    }
  });

  return Object.values(channelMap);
}

/**
 * Get all descendant categories of a parent
 */
export async function getCategoryDescendants(parentId) {
  if (!supabase) throw new Error('Supabase not configured');

  // Get all categories and filter for descendants
  const { data, error } = await supabase
    .from('category_tree')
    .select('*');

  if (error) throw error;

  // Find all categories that have parentId in their path
  const parent = data.find(c => c.id === parentId);
  if (!parent) return [];

  return data.filter(c =>
    c.depth > parent.depth &&
    c.path.includes(parentId)
  );
}

/**
 * Assign a channel to a category
 */
export async function assignChannelToCategory(channelId, categoryId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('channel_categories')
    .upsert(
      { channel_id: channelId, category_id: categoryId },
      { onConflict: 'channel_id,category_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Remove a channel from a category
 */
export async function removeChannelFromCategory(channelId, categoryId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('channel_categories')
    .delete()
    .eq('channel_id', channelId)
    .eq('category_id', categoryId);

  if (error) throw error;
}

/**
 * Set all categories for a channel (replaces existing)
 */
export async function setChannelCategories(channelId, categoryIds) {
  if (!supabase) throw new Error('Supabase not configured');

  // Delete existing assignments
  const { error: deleteError } = await supabase
    .from('channel_categories')
    .delete()
    .eq('channel_id', channelId);

  if (deleteError) throw deleteError;

  // Insert new assignments
  if (categoryIds.length > 0) {
    const assignments = categoryIds.map(categoryId => ({
      channel_id: channelId,
      category_id: categoryId,
    }));

    const { error: insertError } = await supabase
      .from('channel_categories')
      .insert(assignments);

    if (insertError) throw insertError;
  }
}

// ============================================
// ANALYSIS PRESETS
// ============================================

/**
 * Get all presets
 */
export async function getPresets({ includeShared = true } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  let query = supabase
    .from('analysis_presets')
    .select('*')
    .order('use_count', { ascending: false });

  if (!includeShared) {
    query = query.eq('is_shared', false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Get a single preset
 */
export async function getPreset(id) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('analysis_presets')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create a preset
 */
export async function createPreset({
  name,
  description,
  selectedCategoryIds,
  selectedChannelIds,
  excludedChannelIds,
  includeSubcategories,
  videoTypeFilter,
  dateRangeDays,
  isShared,
  createdBy,
}) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('analysis_presets')
    .insert({
      name,
      description,
      selected_category_ids: selectedCategoryIds || [],
      selected_channel_ids: selectedChannelIds || [],
      excluded_channel_ids: excludedChannelIds || [],
      include_subcategories: includeSubcategories ?? true,
      video_type_filter: videoTypeFilter,
      date_range_days: dateRangeDays || 30,
      is_shared: isShared || false,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a preset
 */
export async function updatePreset(id, updates) {
  if (!supabase) throw new Error('Supabase not configured');

  // Map camelCase to snake_case
  const dbUpdates = {};
  if ('name' in updates) dbUpdates.name = updates.name;
  if ('description' in updates) dbUpdates.description = updates.description;
  if ('selectedCategoryIds' in updates) dbUpdates.selected_category_ids = updates.selectedCategoryIds;
  if ('selectedChannelIds' in updates) dbUpdates.selected_channel_ids = updates.selectedChannelIds;
  if ('excludedChannelIds' in updates) dbUpdates.excluded_channel_ids = updates.excludedChannelIds;
  if ('includeSubcategories' in updates) dbUpdates.include_subcategories = updates.includeSubcategories;
  if ('videoTypeFilter' in updates) dbUpdates.video_type_filter = updates.videoTypeFilter;
  if ('dateRangeDays' in updates) dbUpdates.date_range_days = updates.dateRangeDays;
  if ('isShared' in updates) dbUpdates.is_shared = updates.isShared;

  const { data, error } = await supabase
    .from('analysis_presets')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a preset
 */
export async function deletePreset(id) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('analysis_presets')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Record preset usage (for sorting by popularity)
 */
export async function recordPresetUsage(id) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase.rpc('increment_preset_usage', { preset_id: id });

  // Fallback if RPC doesn't exist
  if (error) {
    await supabase
      .from('analysis_presets')
      .update({
        use_count: supabase.sql`use_count + 1`,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', id);
  }
}

/**
 * Get channels matching a preset's criteria
 */
export async function getChannelsForPreset(presetId) {
  const preset = await getPreset(presetId);
  if (!preset) throw new Error('Preset not found');

  let channels = [];

  // Get channels from selected categories
  if (preset.selected_category_ids?.length > 0) {
    for (const categoryId of preset.selected_category_ids) {
      const categoryChannels = await getChannelsInCategory(categoryId, {
        includeSubcategories: preset.include_subcategories,
      });
      channels = [...channels, ...categoryChannels];
    }
  }

  // Add specifically selected channels
  if (preset.selected_channel_ids?.length > 0) {
    const { data } = await supabase
      .from('channels')
      .select('*')
      .in('id', preset.selected_channel_ids);

    if (data) {
      channels = [...channels, ...data];
    }
  }

  // Deduplicate
  const channelMap = {};
  channels.forEach(c => {
    channelMap[c.id] = c;
  });

  // Remove excluded channels
  if (preset.excluded_channel_ids?.length > 0) {
    preset.excluded_channel_ids.forEach(id => {
      delete channelMap[id];
    });
  }

  return Object.values(channelMap);
}

// ============================================
// HELPERS
// ============================================

/**
 * Generate URL-safe slug from name
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default {
  // Categories
  getAllCategories,
  getCategoryTree,
  getCategory,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,

  // Channel-Category
  getChannelCategories,
  getBulkChannelCategories,
  getChannelsInCategory,
  getCategoryDescendants,
  assignChannelToCategory,
  removeChannelFromCategory,
  setChannelCategories,

  // Presets
  getPresets,
  getPreset,
  createPreset,
  updatePreset,
  deletePreset,
  recordPresetUsage,
  getChannelsForPreset,
};
