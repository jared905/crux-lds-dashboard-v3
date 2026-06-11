/**
 * dataFreshnessService — single source of truth for "when was each
 * data source for this channel last refreshed?"
 *
 * Powers the DataFreshnessBadge component that lives in every Strategy
 * workspace header. Strategist sees at a glance how stale the inputs
 * to their current view are, without having to open Settings → API
 * Keys to check.
 *
 * Per-source freshness model (migration 104, 2026-06-11):
 *   - data_api_pull   — YouTube Data API (videos, sub counts, snapshots)
 *                       reads channels.last_data_api_pull_at + _error
 *   - analytics_pull  — YouTube Analytics API (Watch Hours, Retention,
 *                       Subs Gained — per-video OR channel-level fallback)
 *                       reads channels.last_analytics_pull_at + _error
 *   - reporting_pull  — YouTube Reporting API (impressions, CTR)
 *                       reads channels.last_reporting_pull_at + _error
 *   - surface_pull    — Surface intelligence (traffic sources, search queries)
 *                       reads channels.last_surface_pull_at + _error
 *   - oauth_refresh   — OAuth token refresh heartbeat (NOT data ingestion)
 *                       reads youtube_oauth_connections.last_refreshed_at
 *
 * Each per-source state surfaces:
 *   - at:    last successful pull (null when never pulled)
 *   - tier:  fresh / stale / very_stale / missing / error
 *   - error: persisted error message from last failed attempt (if any)
 *
 * Tiers (per source):
 *   - error:      _error column is set    → red (highest severity)
 *   - fresh:      < 24h ago               → green
 *   - stale:      24h–72h ago             → amber
 *   - very_stale: > 72h ago               → red
 *   - missing:    at: null, no error      → gray (never pulled)
 *
 * The badge renders the overall worst-case tier as the dot icon and
 * each source as a chip with relative time + inline error if present.
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

  // 1) Channel row with per-source columns (migration 104). Falls back
  // gracefully when the migration hasn't been applied — undefined
  // columns become null and surface as 'missing' tiers.
  const { data: channel, error: chErr } = await supabase
    .from('channels')
    .select(`
      id, youtube_channel_id,
      last_synced_at, last_sync_attempt_at, last_sync_error,
      last_data_api_pull_at, last_data_api_pull_error,
      last_analytics_pull_at, last_analytics_pull_error,
      last_reporting_pull_at, last_reporting_pull_error,
      last_surface_pull_at, last_surface_pull_error,
      is_prelaunch, prelaunch_intended_launch_at
    `)
    .eq('id', clientId)
    .maybeSingle();

  if (chErr || !channel) return emptyFreshness();

  // Pre-launch short-circuit (2026-06-09).
  if (channel.is_prelaunch) {
    const na = (label) => ({ at: null, tier: 'not_applicable', label });
    return {
      is_prelaunch:                 true,
      prelaunch_intended_launch_at: channel.prelaunch_intended_launch_at || null,
      data_api_pull:                na('Channel'),
      analytics_pull:               na('Analytics'),
      reporting_pull:               na('Reporting'),
      surface_pull:                 na('Surface'),
      oauth_refresh:                { at: null, tier: 'not_applicable', hasConnection: false },
      worstTier:                    'not_applicable',
      anyError:                     false,
    };
  }

  // 2) OAuth connection — team-OAuth model: freshest connection for the
  // youtube_channel_id, regardless of which user owns it.
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

  // 3) Build per-source state. Each source gets its own honest tier
  // based on its own _at + _error columns. Errors win over staleness;
  // the badge surfaces the actual reason.
  const data_api_pull = buildSource({
    label: 'Channel',
    at:    channel.last_data_api_pull_at,
    error: channel.last_data_api_pull_error,
    // Fallback to legacy last_synced_at when migration 104 hasn't been
    // applied or when the cron hasn't run a per-source write yet —
    // existing data shouldn't suddenly read as "never pulled."
    fallbackAt: channel.last_synced_at,
  });
  const analytics_pull = buildSource({
    label: 'Analytics',
    at:    channel.last_analytics_pull_at,
    error: channel.last_analytics_pull_error,
  });
  const reporting_pull = buildSource({
    label: 'Reporting',
    at:    channel.last_reporting_pull_at,
    error: channel.last_reporting_pull_error,
  });
  const surface_pull = buildSource({
    label: 'Surface',
    at:    channel.last_surface_pull_at,
    error: channel.last_surface_pull_error,
  });

  const oauth_refresh = {
    at:              connection?.last_refreshed_at || null,
    tier:            connection ? computeTier(connection.last_refreshed_at) : 'missing',
    errorMessage:    connection?.connection_error || null,
    hasConnection:   !!connection,
    isActive:        connection?.is_active ?? null,
    label:           'OAuth',
  };

  // 4) Silent-failure detection on the legacy last_synced_at path:
  // if a sync was attempted recently but no success column moved, flag
  // the data_api source even when its own _error wasn't persisted.
  const SILENT_GAP_MIN_MINUTES = 2;
  const silentFailure = isSilentlyStale(
    channel.last_synced_at,
    channel.last_sync_attempt_at,
    SILENT_GAP_MIN_MINUTES,
  );
  if (silentFailure) {
    data_api_pull.tier = 'very_stale';
    data_api_pull.silentFailure = true;
    data_api_pull.lastAttemptAt = channel.last_sync_attempt_at;
    if (!data_api_pull.errorMessage && channel.last_sync_error) {
      data_api_pull.errorMessage = channel.last_sync_error;
    }
  }

  // 5) Worst-case tier across all sources for the badge dot color.
  // Errors are treated as 'very_stale' severity. 'missing' is excluded
  // unless every source is missing (no data yet).
  const sources = [data_api_pull, analytics_pull, reporting_pull, surface_pull, oauth_refresh];
  const visibleTiers = sources
    .map(s => s.tier === 'error' ? 'very_stale' : s.tier)
    .filter(t => t !== 'missing' && t !== 'not_applicable');
  const worstTier = visibleTiers.length ? worst(visibleTiers) : 'missing';
  const anyError = sources.some(s => !!s.errorMessage) || silentFailure;

  return {
    data_api_pull,
    analytics_pull,
    reporting_pull,
    surface_pull,
    oauth_refresh,
    worstTier,
    anyError,
  };
}

/**
 * Build a per-source state object. Errors win over staleness:
 *   - error present     → tier: 'error'
 *   - at null, no error → tier: 'missing'
 *   - at present        → tier: computeTier(at)
 */
function buildSource({ label, at, error, fallbackAt = null }) {
  const effectiveAt = at || fallbackAt || null;
  let tier;
  if (error)                  tier = 'error';
  else if (!effectiveAt)      tier = 'missing';
  else                        tier = computeTier(effectiveAt);
  return {
    label,
    at:            effectiveAt,
    tier,
    errorMessage:  error || null,
    isFallback:    !at && !!fallbackAt,
  };
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
  const empty = (label) => ({ at: null, tier: 'missing', errorMessage: null, label });
  return {
    data_api_pull:  empty('Channel'),
    analytics_pull: empty('Analytics'),
    reporting_pull: empty('Reporting'),
    surface_pull:   empty('Surface'),
    oauth_refresh:  { at: null, tier: 'missing', errorMessage: null, hasConnection: false, label: 'OAuth' },
    worstTier:      'missing',
    anyError:       false,
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
