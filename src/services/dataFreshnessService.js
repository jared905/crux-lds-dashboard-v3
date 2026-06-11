/**
 * dataFreshnessService — single source of truth for "when was each
 * data source for this channel last refreshed?"
 *
 * Powers the DataFreshnessBadge component that lives in every Strategy
 * workspace header. Strategist sees at a glance how stale the inputs
 * to their current view are, without having to open Settings → API
 * Keys to check.
 *
 * Sources surfaced:
 *   - channel_sync        — competitor sync cron (06:00 UTC daily)
 *                           reads channels.last_synced_at
 *   - oauth_refresh       — token refresh timestamp on the channel's
 *                           OAuth connection (team-OAuth model — any
 *                           user's connection counts)
 *                           reads youtube_oauth_connections.last_refreshed_at
 *   - surface_pull        — surface-intelligence pull timestamp
 *                           (traffic sources, search queries — set by
 *                           /api/youtube-analytics-surface-pull)
 *                           reads channels.last_surface_pull_at (migration 097)
 *
 * Freshness tiers (per source):
 *   - fresh:  < 24h ago     → green
 *   - stale:  24h–72h ago   → amber
 *   - very_stale: > 72h ago → red
 *   - missing: null         → gray (never pulled)
 *
 * The component renders the overall worst-case tier as the icon color,
 * with each source shown as a chip with relative time.
 */

import { supabase } from './supabaseClient';

export const FRESHNESS_THRESHOLD_HOURS = {
  fresh:      24,   // < 24h: fresh
  stale:      72,   // 24h–72h: stale
  very_stale: Infinity, // > 72h: very stale
};

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * Load all freshness signals for a channel (by Supabase UUID).
 *
 * @param {string} clientId — channels.id (UUID), NOT the youtube_channel_id
 * @returns {Promise<{
 *   channel_sync:   { at: string|null, tier: string, errorMessage?: string },
 *   oauth_refresh:  { at: string|null, tier: string, connectionError?: string, hasConnection: boolean },
 *   surface_pull:   { at: string|null, tier: string },
 *   worstTier:      string,
 *   anyError:       boolean,
 * }>}
 */
export async function loadChannelFreshness(clientId) {
  if (!clientId || !supabase) {
    return emptyFreshness();
  }

  // 1) Channel-level timestamps (sync + surface pull) plus pre-launch
  //    flag so the badge can short-circuit for clients without a channel.
  const { data: channel, error: chErr } = await supabase
    .from('channels')
    .select('id, youtube_channel_id, last_synced_at, last_sync_attempt_at, last_sync_error, last_surface_pull_at, is_prelaunch, prelaunch_intended_launch_at')
    .eq('id', clientId)
    .maybeSingle();

  if (chErr || !channel) return emptyFreshness();

  // 2026-06-09: pre-launch clients have no channel by definition.
  // Don't render sync/oauth/surface chips OR fire downstream queries —
  // freshness is conceptually N/A, not "stale" or "error." The UI
  // renders a single calm purple chip instead.
  if (channel.is_prelaunch) {
    return {
      is_prelaunch:                 true,
      prelaunch_intended_launch_at: channel.prelaunch_intended_launch_at || null,
      channel_sync:                 { at: null, tier: 'not_applicable' },
      oauth_refresh:                { at: null, tier: 'not_applicable', hasConnection: false },
      surface_pull:                 { at: null, tier: 'not_applicable' },
      worstTier:                    'not_applicable',
      anyError:                     false,
    };
  }

  // 2) OAuth connection timestamps — team-OAuth model means we want
  // the freshest connection for this youtube_channel_id, regardless of
  // which user OAuthed it.
  let connection = null;
  if (channel.youtube_channel_id) {
    const { data: conns } = await supabase
      .from('youtube_oauth_connections')
      .select('last_refreshed_at, last_used_at, is_active, connection_error')
      .eq('youtube_channel_id', channel.youtube_channel_id)
      .order('last_refreshed_at', { ascending: false, nullsFirst: false })
      .limit(1);
    connection = conns?.[0] || null;
  }

  // 3) Compute tiers.
  // Silent-failure detection: the cron writes last_sync_attempt_at on
  // every attempt and last_synced_at only on success. If attempt is
  // meaningfully more recent than success, the cron ran but didn't
  // complete — symptoms include "freshness chip says 15m ago, latest
  // video is 3 days behind." Surface this loudly instead of letting
  // last_synced_at masquerade as fresh.
  const SILENT_GAP_MIN_MINUTES = 2;
  const silentFailure = isSilentlyStale(
    channel.last_synced_at,
    channel.last_sync_attempt_at,
    SILENT_GAP_MIN_MINUTES,
  );

  const channelSync = {
    at: channel.last_synced_at,
    tier: silentFailure ? 'very_stale' : computeTier(channel.last_synced_at),
    errorMessage: channel.last_sync_error || null,
    lastAttemptAt: channel.last_sync_attempt_at,
    silentFailure,
  };
  const oauthRefresh = {
    at: connection?.last_refreshed_at || null,
    tier: connection ? computeTier(connection.last_refreshed_at) : 'missing',
    connectionError: connection?.connection_error || null,
    hasConnection: !!connection,
    isActive: connection?.is_active ?? null,
  };
  const surfacePull = {
    at: channel.last_surface_pull_at,
    tier: computeTier(channel.last_surface_pull_at),
  };

  // 4) Compute overall worst-case tier (ignoring "missing" — that's
  // typed as gray, not red). If everything is missing, surface that.
  const tiers = [channelSync, oauthRefresh, surfacePull]
    .map(t => t.tier)
    .filter(t => t !== 'missing');
  const worstTier = tiers.length ? worst(tiers) : 'missing';
  const anyError = !!(channelSync.errorMessage || oauthRefresh.connectionError || silentFailure);

  return { channel_sync: channelSync, oauth_refresh: oauthRefresh, surface_pull: surfacePull, worstTier, anyError };
}

function isSilentlyStale(syncedAt, attemptAt, minGapMinutes) {
  if (!attemptAt) return false;
  if (!syncedAt)  return true;   // attempted but never succeeded — silent fail
  const gapMs = new Date(attemptAt).getTime() - new Date(syncedAt).getTime();
  return gapMs > minGapMinutes * 60_000;
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

function emptyFreshness() {
  return {
    channel_sync:  { at: null, tier: 'missing' },
    oauth_refresh: { at: null, tier: 'missing', hasConnection: false },
    surface_pull:  { at: null, tier: 'missing' },
    worstTier:     'missing',
    anyError:      false,
  };
}

function computeTier(timestamp) {
  if (!timestamp) return 'missing';
  const ageHours = (Date.now() - new Date(timestamp).getTime()) / 3_600_000;
  if (ageHours < FRESHNESS_THRESHOLD_HOURS.fresh) return 'fresh';
  if (ageHours < FRESHNESS_THRESHOLD_HOURS.stale) return 'stale';
  return 'very_stale';
}

function worst(tiers) {
  // very_stale > stale > fresh > missing
  if (tiers.includes('very_stale')) return 'very_stale';
  if (tiers.includes('stale')) return 'stale';
  if (tiers.includes('fresh')) return 'fresh';
  return 'missing';
}

/**
 * Render a compact relative time ("2h ago", "3d ago", "never"). Used
 * by the badge component; exported so the same labels show up
 * consistently across surfaces.
 */
export function formatRelativeAge(timestamp) {
  if (!timestamp) return 'never';
  const ms = Date.now() - new Date(timestamp).getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default { loadChannelFreshness, formatRelativeAge, FRESHNESS_THRESHOLD_HOURS };
