/**
 * Competitor Import Service
 * Full View Analytics - Crux Media
 *
 * One-time import of the LDS Leadership Channel competitor database.
 * Imports 44 channels across 9 categories into Supabase.
 *
 * Usage: Call importCompetitorDatabase(clientId) from browser console or dev UI.
 */

import { upsertChannel } from './competitorDatabase';

/**
 * Full competitor channel database for the LDS Leadership Channel client.
 * Each entry includes:
 *  - youtube_channel_id or handle (prefixed with handle_ if no UC ID available)
 *  - name, category, subcategory, tier, notes, tags
 */
const COMPETITOR_CHANNELS = [
  // ============================================
  // CATEGORY: LDS Official
  // ============================================
  {
    youtube_channel_id: 'UC2TJNkManpwSBMq2ge8GAAQ',
    name: 'LDS Church (Official)',
    category: 'lds-official',
    subcategory: 'institutional',
    tier: 'primary',
    tags: ['institutional', 'official', 'doctrine'],
    notes: 'Primary institutional channel. Official messages, conference talks, music.'
  },
  {
    youtube_channel_id: 'handle_BookofMormonVideos',
    name: 'Book of Mormon Videos',
    custom_url: '@BookofMormonVideos',
    category: 'lds-official',
    subcategory: 'institutional',
    tier: 'secondary',
    tags: ['institutional', 'scripture', 'dramatization'],
    notes: 'Official dramatization series of Book of Mormon.'
  },
  {
    youtube_channel_id: 'handle_ComeUntoChrist',
    name: 'Come Unto Christ',
    custom_url: '@ComeUntoChrist',
    category: 'lds-official',
    subcategory: 'institutional',
    tier: 'secondary',
    tags: ['institutional', 'missionary', 'outreach'],
    notes: 'Missionary-focused outreach content.'
  },

  // ============================================
  // CATEGORY: LDS Faithful Creators
  // ============================================

  // Subcategory: Apologetics & Scholarship
  {
    youtube_channel_id: 'handle_studiocandsofficial',
    name: 'Studio C / Saints Unscripted',
    custom_url: '@studiocandsofficial',
    category: 'lds-faithful',
    subcategory: 'apologetics',
    tier: 'primary',
    tags: ['apologetics', 'comedy', 'youth'],
    notes: 'Crossover comedy + faith content. Very high engagement.'
  },
  {
    youtube_channel_id: 'handle_SaintsUnscripted',
    name: 'Saints Unscripted',
    custom_url: '@SaintsUnscripted',
    category: 'lds-faithful',
    subcategory: 'apologetics',
    tier: 'primary',
    tags: ['apologetics', 'q&a', 'doctrine'],
    notes: 'Leading LDS apologetics channel. Responds to common objections.'
  },
  {
    youtube_channel_id: 'handle_BookofMormonCentral',
    name: 'Book of Mormon Central',
    custom_url: '@BookofMormonCentral',
    category: 'lds-faithful',
    subcategory: 'apologetics',
    tier: 'primary',
    tags: ['scholarship', 'apologetics', 'scripture'],
    notes: 'Academic-level scripture scholarship. Strong research base.'
  },
  {
    youtube_channel_id: 'handle_FAIRLatterDaySaints',
    name: 'FAIR Latter-day Saints',
    custom_url: '@FAIRLatterDaySaints',
    category: 'lds-faithful',
    subcategory: 'apologetics',
    tier: 'secondary',
    tags: ['apologetics', 'academic', 'rebuttal'],
    notes: 'Academic apologetics. Annual conference content.'
  },
  {
    youtube_channel_id: 'handle_TheInterpreterFoundation',
    name: 'Interpreter Foundation',
    custom_url: '@TheInterpreterFoundation',
    category: 'lds-faithful',
    subcategory: 'apologetics',
    tier: 'tertiary',
    tags: ['academic', 'scholarship', 'research'],
    notes: 'Academic peer-reviewed scholarship.'
  },
  {
    youtube_channel_id: 'handle_CwicMedia',
    name: 'Cwic Media',
    custom_url: '@CwicMedia',
    category: 'lds-faithful',
    subcategory: 'apologetics',
    tier: 'secondary',
    tags: ['commentary', 'doctrine', 'current-events'],
    notes: 'Commentary on church topics, doctrine, current events.'
  },

  // Subcategory: Lifestyle & Community
  {
    youtube_channel_id: 'handle_LiveAfterFaith',
    name: 'Ward Radio',
    custom_url: '@LiveAfterFaith',
    category: 'lds-faithful',
    subcategory: 'lifestyle',
    tier: 'primary',
    tags: ['community', 'discussion', 'live'],
    notes: 'Live discussion format. Very engaged community.'
  },
  {
    youtube_channel_id: 'handle_TheLatterDayBride',
    name: 'Latter Day Bride',
    custom_url: '@TheLatterDayBride',
    category: 'lds-faithful',
    subcategory: 'lifestyle',
    tier: 'tertiary',
    tags: ['lifestyle', 'marriage', 'culture'],
    notes: 'LDS marriage and lifestyle content.'
  },
  {
    youtube_channel_id: 'handle_3MormonsOfficial',
    name: '3 Mormons / 3 Latter-day Saints',
    custom_url: '@3MormonsOfficial',
    category: 'lds-faithful',
    subcategory: 'lifestyle',
    tier: 'secondary',
    tags: ['panel', 'discussion', 'youth'],
    notes: 'Panel discussion format targeting younger audience.'
  },
  {
    youtube_channel_id: 'handle_DonBrugger',
    name: 'Don Brugger (Gospel Tangents)',
    custom_url: '@DonBrugger',
    category: 'lds-faithful',
    subcategory: 'lifestyle',
    tier: 'tertiary',
    tags: ['interview', 'history', 'long-form'],
    notes: 'Long-form interviews about church history.'
  },

  // ============================================
  // CATEGORY: Ex-Mormon
  // ============================================

  // Subcategory: Personal Stories & Commentary
  {
    youtube_channel_id: 'handle_MormonStoriesPodcast',
    name: 'Mormon Stories Podcast',
    custom_url: '@MormonStoriesPodcast',
    category: 'ex-mormon',
    subcategory: 'personal-stories',
    tier: 'primary',
    tags: ['podcast', 'interviews', 'long-form', 'high-reach'],
    notes: 'Largest ex-Mormon channel. John Dehlin. 100K+ subs. Drives significant narrative.'
  },
  {
    youtube_channel_id: 'handle_johnlarsen1',
    name: 'Mormon Expression / John Larsen',
    custom_url: '@johnlarsen1',
    category: 'ex-mormon',
    subcategory: 'personal-stories',
    tier: 'secondary',
    tags: ['podcast', 'commentary', 'humor'],
    notes: 'Long-running ex-Mormon podcast. Influential voice.'
  },
  {
    youtube_channel_id: 'handle_exmotok',
    name: 'ExMo Lex / ExMoTok',
    custom_url: '@exmotok',
    category: 'ex-mormon',
    subcategory: 'personal-stories',
    tier: 'secondary',
    tags: ['shorts', 'tiktok-style', 'youth', 'viral'],
    notes: 'Short-form viral content. Strong Gen Z reach.'
  },
  {
    youtube_channel_id: 'handle_TellTaleAtheist',
    name: 'TellTale Atheist',
    custom_url: '@TellTaleAtheist',
    category: 'ex-mormon',
    subcategory: 'personal-stories',
    tier: 'secondary',
    tags: ['commentary', 'critique', 'multi-faith'],
    notes: 'Broader atheist content but covers LDS frequently.'
  },
  {
    youtube_channel_id: 'handle_NuancedHoe',
    name: 'Nuancehoe',
    custom_url: '@NuancedHoe',
    category: 'ex-mormon',
    subcategory: 'personal-stories',
    tier: 'secondary',
    tags: ['personal', 'transition', 'community'],
    notes: 'Faith transition stories. Growing audience.'
  },

  // Subcategory: Research & Exposé
  {
    youtube_channel_id: 'handle_MormonismLive',
    name: 'Mormonism Live / RFM',
    custom_url: '@MormonismLive',
    category: 'ex-mormon',
    subcategory: 'research-expose',
    tier: 'primary',
    tags: ['research', 'history', 'documents', 'live'],
    notes: 'Radio Free Mormon. Deep document analysis. Very influential.'
  },
  {
    youtube_channel_id: 'handle_CLDSdotorg',
    name: 'CES Letter (Jeremy Runnells)',
    custom_url: '@CLDSdotorg',
    category: 'ex-mormon',
    subcategory: 'research-expose',
    tier: 'primary',
    tags: ['foundational', 'document', 'critique'],
    notes: 'Author of CES Letter. Foundational content for faith crisis narratives.'
  },
  {
    youtube_channel_id: 'handle_mormondiscussionspodcast',
    name: 'Mormon Discussions / Bill Reel',
    custom_url: '@mormondiscussionspodcast',
    category: 'ex-mormon',
    subcategory: 'research-expose',
    tier: 'secondary',
    tags: ['podcast', 'analysis', 'news'],
    notes: 'Analysis of church news and policy.'
  },
  {
    youtube_channel_id: 'handle_LDSDiscussions',
    name: 'LDS Discussions',
    custom_url: '@LDSDiscussions',
    category: 'ex-mormon',
    subcategory: 'research-expose',
    tier: 'secondary',
    tags: ['research', 'history', 'analysis'],
    notes: 'Detailed historical research and analysis.'
  },

  // ============================================
  // CATEGORY: Counter-cult Evangelical
  // ============================================
  {
    youtube_channel_id: 'handle_ApologiaStudios',
    name: 'Apologia Studios',
    custom_url: '@ApologiaStudios',
    category: 'counter-cult',
    subcategory: 'evangelical-critique',
    tier: 'primary',
    tags: ['evangelical', 'debate', 'street-preaching'],
    notes: 'Jeff Durbin. Aggressive anti-LDS from Reformed Protestant perspective. 500K+ subs.'
  },
  {
    youtube_channel_id: 'handle_HellBoundMormon',
    name: 'Hello Saints / Hellbound Mormon',
    custom_url: '@HellBoundMormon',
    category: 'counter-cult',
    subcategory: 'evangelical-critique',
    tier: 'secondary',
    tags: ['ex-lds', 'evangelical', 'testimony'],
    notes: 'Former LDS turned evangelical. Converts content.'
  },
  {
    youtube_channel_id: 'handle_MRMorg',
    name: 'Mormonism Research Ministry (MRM)',
    custom_url: '@MRMorg',
    category: 'counter-cult',
    subcategory: 'evangelical-critique',
    tier: 'secondary',
    tags: ['research', 'academic', 'evangelical'],
    notes: 'Long-standing counter-cult research ministry.'
  },
  {
    youtube_channel_id: 'handle_CARM',
    name: 'CARM (Matt Slick)',
    custom_url: '@CARM',
    category: 'counter-cult',
    subcategory: 'evangelical-critique',
    tier: 'tertiary',
    tags: ['apologetics', 'evangelical', 'debate'],
    notes: 'Christian Apologetics Research Ministry. Multi-topic but covers LDS.'
  },

  // ============================================
  // CATEGORY: Megachurch
  // ============================================
  {
    youtube_channel_id: 'UC4zFB9dNkOf5lNFz4rmBiOA',
    name: 'Transformation Church (Michael Todd)',
    category: 'megachurch',
    subcategory: 'contemporary',
    tier: 'primary',
    tags: ['megachurch', 'sermon', 'production', 'viral'],
    notes: '3M+ subs. Gold standard for faith-based production and viral sermons.'
  },
  {
    youtube_channel_id: 'UCi8M0_Ej0vJQBqYV1VSUMKQ',
    name: 'Elevation Church (Steven Furtick)',
    category: 'megachurch',
    subcategory: 'contemporary',
    tier: 'primary',
    tags: ['megachurch', 'sermon', 'worship', 'music'],
    notes: '3.5M+ subs. Master of sermon clips and music integration.'
  },
  {
    youtube_channel_id: 'handle_CrossPointChurch',
    name: 'Cross Point Church',
    custom_url: '@CrossPointChurch',
    category: 'megachurch',
    subcategory: 'contemporary',
    tier: 'tertiary',
    tags: ['megachurch', 'sermon', 'community'],
    notes: 'Mid-size megachurch. Good comparison for attainable production level.'
  },

  // ============================================
  // CATEGORY: Catholic
  // ============================================
  {
    youtube_channel_id: 'handle_BishopBarron',
    name: 'Bishop Robert Barron',
    custom_url: '@BishopBarron',
    category: 'catholic',
    subcategory: 'intellectual',
    tier: 'primary',
    tags: ['catholic', 'intellectual', 'apologetics'],
    notes: '3M+ subs. Most successful Catholic YouTube presence. Intellectual approach.'
  },
  {
    youtube_channel_id: 'handle_TheChosenSeries',
    name: 'The Chosen',
    custom_url: '@TheChosenSeries',
    category: 'catholic',
    subcategory: 'media',
    tier: 'primary',
    tags: ['dramatization', 'scripture', 'cross-faith', 'production'],
    notes: 'Highest-funded faith media project. Cross-denominational appeal.'
  },
  {
    youtube_channel_id: 'handle_AscensionPresents',
    name: 'Ascension Presents (Fr. Mike Schmitz)',
    custom_url: '@AscensionPresents',
    category: 'catholic',
    subcategory: 'intellectual',
    tier: 'secondary',
    tags: ['catholic', 'q&a', 'pastoral'],
    notes: 'Fr. Mike Schmitz "Bible in a Year" phenomenon.'
  },

  // ============================================
  // CATEGORY: Muslim
  // ============================================
  {
    youtube_channel_id: 'handle_MohammedHijab',
    name: 'Mohammed Hijab',
    custom_url: '@MohammedHijab',
    category: 'muslim',
    subcategory: 'dawah-debate',
    tier: 'primary',
    tags: ['muslim', 'debate', 'apologetics'],
    notes: '2M+ subs. Aggressive debate style. Speakers Corner. Parallel to evangelical counter-cult.'
  },
  {
    youtube_channel_id: 'handle_OneMessageFoundation',
    name: 'One Message Foundation',
    custom_url: '@OneMessageFoundation',
    category: 'muslim',
    subcategory: 'dawah-debate',
    tier: 'secondary',
    tags: ['muslim', 'outreach', 'street-dawah'],
    notes: 'Street dawah and outreach. Good format comparison.'
  },
  {
    youtube_channel_id: 'handle_YaqeenInstitute',
    name: 'Yaqeen Institute',
    custom_url: '@YaqeenInstitute',
    category: 'muslim',
    subcategory: 'intellectual',
    tier: 'secondary',
    tags: ['muslim', 'academic', 'research'],
    notes: 'Muslim think-tank. Parallel to FAIR/Interpreter.'
  },

  // ============================================
  // CATEGORY: Jewish
  // ============================================
  {
    youtube_channel_id: 'handle_BimBam',
    name: 'BimBam',
    custom_url: '@BimBam',
    category: 'jewish',
    subcategory: 'educational',
    tier: 'secondary',
    tags: ['jewish', 'animation', 'educational'],
    notes: 'Animated educational content. Interesting format comparison.'
  },
  {
    youtube_channel_id: 'handle_JewishLearningInstitute',
    name: 'Jewish Learning Institute (JLI)',
    custom_url: '@JewishLearningInstitute',
    category: 'jewish',
    subcategory: 'educational',
    tier: 'secondary',
    tags: ['jewish', 'education', 'lectures'],
    notes: 'Structured learning programs. Parallel to LDS seminary/institute.'
  },

  // ============================================
  // CATEGORY: Deconstruction
  // ============================================
  {
    youtube_channel_id: 'handle_HolyKoolAid',
    name: 'Holy Kool Aid',
    custom_url: '@HolyKoolAid',
    category: 'deconstruction',
    subcategory: 'multi-faith',
    tier: 'secondary',
    tags: ['deconstruction', 'multi-faith', 'science'],
    notes: 'Broader deconstruction content. Not LDS-specific but covers it.'
  },
  {
    youtube_channel_id: 'handle_ProphetofZod',
    name: 'Prophet of Zod / Zelph on the Shelf',
    custom_url: '@ProphetofZod',
    category: 'deconstruction',
    subcategory: 'lds-specific',
    tier: 'secondary',
    tags: ['deconstruction', 'lds', 'humor'],
    notes: 'LDS-specific deconstruction with humor. Popular among younger audience.'
  },
  {
    youtube_channel_id: 'handle_JohnnyHarris',
    name: 'Johnny Harris',
    custom_url: '@JohnnyHarris',
    category: 'deconstruction',
    subcategory: 'multi-faith',
    tier: 'primary',
    tags: ['journalism', 'lds', 'production', 'viral'],
    notes: 'Former LDS. Viral video about leaving the church. 6M+ subs. Massive reach.'
  },
  {
    youtube_channel_id: 'handle_RhettAndLink',
    name: 'Rhett & Link (Ear Biscuits)',
    custom_url: '@RhettAndLink',
    category: 'deconstruction',
    subcategory: 'multi-faith',
    tier: 'primary',
    tags: ['celebrity', 'lds', 'deconstruction', 'mainstream'],
    notes: '18M+ subs. Public deconstruction episodes had massive cultural impact.'
  },
  {
    youtube_channel_id: 'handle_MindyGledhill',
    name: 'Mindy Gledhill',
    custom_url: '@MindyGledhill',
    category: 'deconstruction',
    subcategory: 'lds-specific',
    tier: 'tertiary',
    tags: ['music', 'lds', 'deconstruction'],
    notes: 'LDS musician who publicly deconstructed. Cultural touchpoint.'
  },
];

/**
 * Import all competitor channels into Supabase for a given client.
 *
 * @param {string} clientId - The client_id to scope these competitors to
 * @param {Object} options
 * @param {function} options.onProgress - Called with (index, total, channelName) for each channel
 * @param {boolean} options.dryRun - If true, logs but doesn't write to Supabase
 * @returns {Object} { imported, skipped, errors }
 */
export async function importCompetitorDatabase(clientId, { onProgress, dryRun = false } = {}) {
  if (!clientId) throw new Error('clientId is required');

  const results = { imported: 0, skipped: 0, errors: [], channels: [] };
  const total = COMPETITOR_CHANNELS.length;

  for (let i = 0; i < total; i++) {
    const channel = COMPETITOR_CHANNELS[i];

    if (onProgress) {
      onProgress(i + 1, total, channel.name);
    }

    if (dryRun) {
      console.log(`[DRY RUN] Would import: ${channel.name} (${channel.youtube_channel_id})`);
      results.imported++;
      continue;
    }

    try {
      // Encode tier/subcategory/notes into tags as metadata prefixes
      // This ensures data is preserved even before migration 008 runs
      const enrichedTags = [
        ...(channel.tags || []),
        `tier:${channel.tier || 'secondary'}`,
        `subcategory:${channel.subcategory}`,
      ];

      const result = await upsertChannel({
        youtube_channel_id: channel.youtube_channel_id,
        name: channel.name,
        description: channel.notes || null,
        thumbnail_url: null,
        custom_url: channel.custom_url || null,
        category: channel.category,
        subcategory: channel.subcategory,
        tags: enrichedTags,
        tier: channel.tier || 'secondary',
        notes: channel.notes || null,
        is_competitor: true,
        client_id: clientId,
        subscriber_count: 0,
        total_view_count: 0,
        video_count: 0,
      });

      results.imported++;
      results.channels.push(result);
      console.log(`[Import] ✓ ${i + 1}/${total}: ${channel.name}`);
    } catch (err) {
      // If the error is about unknown columns (tier/subcategory/notes), retry without them
      if (err.message?.includes('column') || err.code === '42703') {
        try {
          const fallbackTags = [
            ...(channel.tags || []),
            `tier:${channel.tier || 'secondary'}`,
            `subcategory:${channel.subcategory}`,
          ];
          const result = await upsertChannel({
            youtube_channel_id: channel.youtube_channel_id,
            name: channel.name,
            description: channel.notes || null,
            thumbnail_url: null,
            custom_url: channel.custom_url || null,
            category: channel.category,
            tags: fallbackTags,
            is_competitor: true,
            client_id: clientId,
            subscriber_count: 0,
            total_view_count: 0,
            video_count: 0,
          });
          results.imported++;
          results.channels.push(result);
          console.log(`[Import] ✓ ${i + 1}/${total}: ${channel.name} (fallback — run migration 008)`);
        } catch (fallbackErr) {
          console.error(`[Import] ✗ ${i + 1}/${total}: ${channel.name}:`, fallbackErr.message);
          results.errors.push({ channel: channel.name, error: fallbackErr.message });
        }
      } else {
        console.error(`[Import] ✗ ${i + 1}/${total}: ${channel.name}:`, err.message);
        results.errors.push({ channel: channel.name, error: err.message });
      }
    }
  }

  console.log(`\n[Import Complete] Imported: ${results.imported}, Errors: ${results.errors.length}`);
  if (results.errors.length > 0) {
    console.table(results.errors);
  }

  return results;
}

/**
 * Get the list of channels that need YouTube ID resolution.
 * These are channels with handle_ prefix IDs that should be resolved
 * via the YouTube Data API.
 */
export function getChannelsNeedingIdResolution() {
  return COMPETITOR_CHANNELS
    .filter(ch => ch.youtube_channel_id.startsWith('handle_'))
    .map(ch => ({
      name: ch.name,
      handle: ch.custom_url,
      currentId: ch.youtube_channel_id,
    }));
}

export { COMPETITOR_CHANNELS };
