/**
 * LDS Channels to Hierarchy Migration
 * Full View Analytics - Crux Media
 *
 * One-time migration script to link existing LDS channels
 * (which use the flat channels.category field) to the
 * hierarchical categories table via channel_categories junction.
 *
 * Run from browser console:
 *   import { migrateLDSChannelsToHierarchy } from './services/migrateLDSToHierarchy';
 *   await migrateLDSChannelsToHierarchy();
 */

import { supabase } from './supabaseClient';

// Map flat category slugs to their hierarchical category slugs
const CATEGORY_SLUG_MAP = {
  'lds-official': 'lds-official',
  'lds-faithful': 'lds-faithful',
  'ex-mormon': 'ex-mormon',
  'counter-cult': 'counter-cult',
  'megachurch': 'megachurch',
  'catholic': 'catholic',
  'muslim': 'muslim',
  'jewish': 'jewish',
  'deconstruction': 'deconstruction',
};

/**
 * Migrate LDS channels to use channel_categories junction table
 */
export async function migrateLDSChannelsToHierarchy(options = {}) {
  const { dryRun = false, onProgress } = options;

  console.log('========================================');
  console.log('LDS Channels to Hierarchy Migration');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('========================================\n');

  // Step 1: Get all categories and build slug->id map
  console.log('Step 1: Loading category hierarchy...');
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, slug, name');

  if (catError) {
    console.error('Failed to load categories:', catError);
    throw catError;
  }

  const categoryMap = {};
  categories.forEach(cat => {
    categoryMap[cat.slug] = cat.id;
  });

  console.log(`  Found ${categories.length} categories`);

  // Verify our expected categories exist
  const missingCategories = Object.values(CATEGORY_SLUG_MAP).filter(
    slug => !categoryMap[slug]
  );

  if (missingCategories.length > 0) {
    console.error('Missing expected categories:', missingCategories);
    console.error('Please run migration 012_unified_category_hierarchy.sql first');
    throw new Error(`Missing categories: ${missingCategories.join(', ')}`);
  }

  console.log('  All expected LDS categories found\n');

  // Step 2: Get all channels with flat category field
  console.log('Step 2: Loading channels with flat categories...');
  const { data: channels, error: chError } = await supabase
    .from('channels')
    .select('id, name, category')
    .not('category', 'is', null)
    .in('category', Object.keys(CATEGORY_SLUG_MAP));

  if (chError) {
    console.error('Failed to load channels:', chError);
    throw chError;
  }

  console.log(`  Found ${channels.length} channels to migrate\n`);

  if (channels.length === 0) {
    console.log('No channels to migrate. Done!');
    return { migrated: 0, skipped: 0, errors: [] };
  }

  // Step 3: Check existing channel_categories entries
  console.log('Step 3: Checking existing assignments...');
  const { data: existing, error: existError } = await supabase
    .from('channel_categories')
    .select('channel_id, category_id')
    .in('channel_id', channels.map(c => c.id));

  if (existError) {
    console.error('Failed to check existing assignments:', existError);
    throw existError;
  }

  const existingSet = new Set(
    (existing || []).map(e => `${e.channel_id}:${e.category_id}`)
  );

  console.log(`  Found ${existing?.length || 0} existing assignments\n`);

  // Step 4: Create new assignments
  console.log('Step 4: Creating junction table entries...');
  const results = { migrated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const targetSlug = CATEGORY_SLUG_MAP[channel.category];
    const targetCategoryId = categoryMap[targetSlug];

    if (onProgress) {
      onProgress(i + 1, channels.length, channel.name);
    }

    // Check if already assigned
    const key = `${channel.id}:${targetCategoryId}`;
    if (existingSet.has(key)) {
      console.log(`  [${i + 1}/${channels.length}] SKIP: ${channel.name} (already assigned)`);
      results.skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [${i + 1}/${channels.length}] WOULD ASSIGN: ${channel.name} -> ${targetSlug}`);
      results.migrated++;
      continue;
    }

    try {
      const { error: insertError } = await supabase
        .from('channel_categories')
        .insert({
          channel_id: channel.id,
          category_id: targetCategoryId,
        });

      if (insertError) {
        console.error(`  [${i + 1}/${channels.length}] ERROR: ${channel.name}:`, insertError.message);
        results.errors.push({ channel: channel.name, error: insertError.message });
      } else {
        console.log(`  [${i + 1}/${channels.length}] ASSIGNED: ${channel.name} -> ${targetSlug}`);
        results.migrated++;
      }
    } catch (err) {
      console.error(`  [${i + 1}/${channels.length}] ERROR: ${channel.name}:`, err.message);
      results.errors.push({ channel: channel.name, error: err.message });
    }
  }

  // Step 5: Summary
  console.log('\n========================================');
  console.log('MIGRATION SUMMARY');
  console.log('========================================');
  console.log(`Migrated: ${results.migrated}`);
  console.log(`Skipped:  ${results.skipped}`);
  console.log(`Errors:   ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(e => console.log(`  - ${e.channel}: ${e.error}`));
  }

  return results;
}

/**
 * Verify migration was successful
 */
export async function verifyLDSMigration() {
  console.log('Verifying LDS migration...\n');

  // Get channels with flat categories
  const { data: channels } = await supabase
    .from('channels')
    .select('id, name, category')
    .in('category', Object.keys(CATEGORY_SLUG_MAP));

  // Get their junction table entries
  const { data: assignments } = await supabase
    .from('channel_categories')
    .select('channel_id, categories(slug)')
    .in('channel_id', channels.map(c => c.id));

  const assignmentMap = {};
  (assignments || []).forEach(a => {
    if (!assignmentMap[a.channel_id]) {
      assignmentMap[a.channel_id] = [];
    }
    assignmentMap[a.channel_id].push(a.categories?.slug);
  });

  let missing = 0;
  let matched = 0;

  channels.forEach(ch => {
    const assigned = assignmentMap[ch.id] || [];
    if (assigned.includes(ch.category)) {
      matched++;
    } else {
      missing++;
      console.log(`MISSING: ${ch.name} (${ch.category}) - has [${assigned.join(', ')}]`);
    }
  });

  console.log(`\nVerification: ${matched}/${channels.length} channels properly assigned`);

  if (missing > 0) {
    console.log(`${missing} channels need migration`);
  } else {
    console.log('All LDS channels are properly linked to category hierarchy!');
  }

  return { total: channels.length, matched, missing };
}

export default {
  migrateLDSChannelsToHierarchy,
  verifyLDSMigration,
};
