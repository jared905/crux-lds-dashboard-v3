/**
 * prelaunchClientService — onboard a client BEFORE they have a YouTube
 * channel. Creates a placeholder channels row + optionally seeds the
 * business context from a market description so the brief generator,
 * Cohort Roles, and Competitor Scan all work immediately.
 *
 * Use case: strategist is doing pre-launch positioning work for a
 * brand / consultant / agency that hasn't started filming yet but
 * needs cohort + market intelligence to plan the launch.
 *
 * What works immediately after creation:
 *   - Cohort Roles (tag competitors as peer / aspirational / reference)
 *   - Competitor Scan (rank recent peer uploads by adaptability)
 *   - Strategy Spine + Brief generator (cohort-only signal — no client
 *     history needed)
 *   - Research V2 surfaces
 *
 * What's N/A until they actually launch:
 *   - Pre-flight scoring (needs client title embeddings for topic_authority)
 *   - Repositioning audit (needs client video catalog)
 *   - Calibration (needs a repositioning audit to score against)
 *   - DataFreshnessBadge analytics chip (no OAuth connection possible)
 *
 * Upgrade path (future): when the client launches, an upgradeToReal-
 * Channel call promotes the placeholder by swapping youtube_channel_id
 * for the real value, clearing is_prelaunch, and preserving everything
 * else (Spine, business context, competitor cohort).
 */

import { supabase } from './supabaseClient';

const PLACEHOLDER_PREFIX = 'placeholder_';

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * @param {Object} args
 * @param {string} args.name               — required, "Acme Brand"
 * @param {string} [args.marketDescription] — seeds business_context.target_market + one_line_summary
 * @param {string} [args.intendedLaunchAt] — optional ISO timestamp
 * @param {string} [args.customUrl]        — optional intended URL ("@acmebrand")
 * @param {string} [args.createdBy]        — user.id of the creator
 * @returns {Promise<{ ok, client?, error? }>}
 */
export async function createPrelaunchClient({
  name,
  marketDescription = null,
  intendedLaunchAt  = null,
  customUrl         = null,
  createdBy         = null,
}) {
  if (!supabase) return { ok: false, error: 'supabase not configured' };
  if (!name?.trim()) return { ok: false, error: 'name required' };

  // Placeholder youtube_channel_id — satisfies the UNIQUE NOT NULL
  // constraint without colliding with any real channel ID.
  const placeholderId = `${PLACEHOLDER_PREFIX}${crypto.randomUUID()}`;

  // 1) Create the channels row.
  const { data: channel, error: chErr } = await supabase
    .from('channels')
    .insert({
      youtube_channel_id:           placeholderId,
      name:                         name.trim(),
      custom_url:                   customUrl?.trim() || null,
      is_competitor:                false,
      is_client:                    true,
      is_prelaunch:                 true,
      prelaunch_intended_launch_at: intendedLaunchAt || null,
      created_via:                  'prelaunch',
      subscriber_count:             0,
      total_view_count:             0,
      video_count:                  0,
    })
    .select()
    .single();

  if (chErr || !channel) {
    console.error('[prelaunch] create failed:', chErr);
    return { ok: false, error: chErr?.message || 'Failed to create pre-launch client' };
  }

  // 2) Seed business context if a market description was provided.
  // Drafted directly into the 'active' status so it's immediately
  // available to the brief generator — strategist can refine later.
  if (marketDescription?.trim()) {
    try {
      await supabase
        .from('client_business_context')
        .insert({
          client_id:        channel.id,
          status:           'active',
          target_market:    marketDescription.trim(),
          one_line_summary: `${name.trim()} — pre-launch. ${marketDescription.trim().slice(0, 200)}`,
          confirmed_at:     new Date().toISOString(),
          notes:            'Auto-seeded from pre-launch client creation. Refine in Strategy Spine → Business context.',
        });
    } catch (err) {
      console.warn('[prelaunch] business context seed failed (non-fatal):', err?.message);
    }
  }

  return { ok: true, client: channel };
}

/**
 * Promote a placeholder pre-launch client to a real channel — the
 * client launched. Preserves all related data (Spine, business
 * context, competitor cohort, role tags, etc.) — only swaps the
 * youtube_channel_id + clears the pre-launch flag.
 *
 * Caller is responsible for verifying the YouTube channel ID is real
 * + matches the client (e.g., via OAuth callback).
 *
 * @param {Object} args
 * @param {string} args.clientId               — the placeholder channels.id
 * @param {string} args.youtubeChannelId       — the real UC… id
 * @param {Object} [args.channelMetadata]      — { name?, thumbnail_url?, subscriber_count?, total_view_count?, video_count? }
 */
export async function upgradeToRealChannel({ clientId, youtubeChannelId, channelMetadata = {} }) {
  if (!supabase) return { ok: false, error: 'supabase not configured' };
  if (!clientId || !youtubeChannelId) return { ok: false, error: 'clientId + youtubeChannelId required' };
  if (youtubeChannelId.startsWith(PLACEHOLDER_PREFIX)) {
    return { ok: false, error: 'youtubeChannelId is itself a placeholder — pass the real channel ID' };
  }

  // Sanity-check the new channel ID isn't already taken by another row.
  const { data: collision } = await supabase
    .from('channels')
    .select('id, name')
    .eq('youtube_channel_id', youtubeChannelId)
    .maybeSingle();
  if (collision && collision.id !== clientId) {
    return { ok: false, error: `youtube_channel_id ${youtubeChannelId} already belongs to another channel (${collision.name})` };
  }

  const patch = {
    youtube_channel_id:           youtubeChannelId,
    is_prelaunch:                 false,
    prelaunch_intended_launch_at: null,
  };
  if (channelMetadata.name)              patch.name             = channelMetadata.name;
  if (channelMetadata.thumbnail_url)     patch.thumbnail_url    = channelMetadata.thumbnail_url;
  if (channelMetadata.subscriber_count != null) patch.subscriber_count = channelMetadata.subscriber_count;
  if (channelMetadata.total_view_count != null) patch.total_view_count = channelMetadata.total_view_count;
  if (channelMetadata.video_count != null)      patch.video_count      = channelMetadata.video_count;

  const { error } = await supabase
    .from('channels')
    .update(patch)
    .eq('id', clientId);

  if (error) {
    console.error('[prelaunch] upgrade failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Identify whether a channel row is a pre-launch placeholder. Used by
 * UI surfaces to render the pre-launch badge / empty states.
 */
export function isPrelaunchClient(channelRow) {
  if (!channelRow) return false;
  if (channelRow.is_prelaunch === true) return true;
  // Defensive: also detect by youtube_channel_id prefix in case the
  // flag column hasn't been migrated yet on this row.
  return typeof channelRow.youtube_channel_id === 'string'
    && channelRow.youtube_channel_id.startsWith(PLACEHOLDER_PREFIX);
}

export const PRELAUNCH_PLACEHOLDER_PREFIX = PLACEHOLDER_PREFIX;

export default {
  createPrelaunchClient,
  upgradeToRealChannel,
  isPrelaunchClient,
  PRELAUNCH_PLACEHOLDER_PREFIX,
};
