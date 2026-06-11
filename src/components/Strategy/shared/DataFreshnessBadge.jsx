/**
 * DataFreshnessBadge — compact "when was this actually pulled" badge.
 *
 * Drops into every Strategy workspace header so the strategist can see
 * at a glance how stale the inputs to their current view are. Without
 * this, "I'm looking at last week's data and didn't notice" is a real
 * failure mode.
 *
 * Renders inline as:
 *   [●] Channel: 2h ago · Analytics: 6h ago · Reporting: 1d ago · Surface: 12h ago · OAuth: 1h ago
 *
 * Per-source freshness (migration 104, 2026-06-11):
 *   - Channel    = YouTube Data API pulls (videos, sub counts, snapshots)
 *   - Analytics  = YouTube Analytics API (Watch Hours, Retention, Subs Gained)
 *   - Reporting  = YouTube Reporting API (impressions, CTR)
 *   - Surface    = Surface intelligence (traffic sources, search queries)
 *   - OAuth      = Token refresh heartbeat (auth liveness, NOT data ingestion)
 *
 * Each chip color reflects per-source tier: green fresh, amber stale,
 * red very_stale OR error, gray missing. Errors win — if a source has
 * a persisted error message, its chip turns red regardless of timestamp.
 *
 * Tier colors (worst across all sources wins for the dot icon):
 *   fresh (<24h)     → teal/green
 *   stale (24-72h)   → amber
 *   very_stale (>72h)→ red
 *   missing          → gray
 *
 * Click expands to show full timestamps + last sync attempt + any
 * error messages. Useful for diagnosing "why is my data stale" without
 * navigating to Settings.
 */

import React, { useEffect, useState } from 'react';
import { loadChannelFreshness, formatRelativeAge } from '../../../services/dataFreshnessService.js';

const TIER_COLORS = {
  fresh:          '#3fa66a',
  stale:          '#E8A82B',
  very_stale:     '#ef6b6b',
  error:          '#ef6b6b',
  missing:        '#666',
  not_applicable: '#a78bfa',  // pre-launch
};
const TIER_LABELS = {
  fresh:          'Fresh',
  stale:          'Stale',
  very_stale:     'Very stale',
  error:          'Error',
  missing:        'Never',
  not_applicable: 'N/A',
};

export default function DataFreshnessBadge({ clientId, compact = false }) {
  const [freshness, setFreshness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!clientId) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await loadChannelFreshness(clientId);
        if (!cancelled) setFreshness(data);
      } catch (err) {
        console.warn('[DataFreshnessBadge] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading) {
    return (
      <div style={containerStyle(compact)}>
        <span style={dotStyle('#444')} />
        <span style={chipTextStyle}>checking freshness…</span>
      </div>
    );
  }
  if (!freshness) return null;

  // 2026-06-09: pre-launch clients render a single calm purple chip.
  // No sync/oauth/surface chips, no error indicator — those concepts
  // don't apply until the channel actually launches.
  if (freshness.is_prelaunch) {
    return <PrelaunchFreshness launchAt={freshness.prelaunch_intended_launch_at} compact={compact} />;
  }

  const dotColor = TIER_COLORS[freshness.worstTier];

  // Compact (collapsed) view — single row inline
  return (
    <div style={{ display: 'inline-block' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={containerStyle(compact)}
        title="Click for details"
      >
        <span style={dotStyle(dotColor)} />
        <Chip value={freshness.data_api_pull}  />
        <Chip value={freshness.analytics_pull} skipIfMissing />
        <Chip value={freshness.reporting_pull} skipIfMissing />
        <Chip value={freshness.surface_pull}   skipIfMissing />
        <Chip value={freshness.oauth_refresh}  skipIfMissing />
        {freshness.data_api_pull?.silentFailure && (
          <span style={errorBadgeStyle} title="Cron attempted recently but did not write a fresh data_api timestamp — data is likely older than the chip suggests.">
            ⚠ silent sync failure
          </span>
        )}
        {freshness.anyError && !freshness.data_api_pull?.silentFailure && (
          <span style={errorBadgeStyle}>⚠ error</span>
        )}
      </button>

      {expanded && (
        <ExpandedDetails freshness={freshness} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Pre-launch — calm "N/A" state, no error semantics
// ──────────────────────────────────────────────────

function PrelaunchFreshness({ launchAt, compact }) {
  let detail = 'no channel data yet';
  if (launchAt) {
    const days = Math.round((new Date(launchAt).getTime() - Date.now()) / 86_400_000);
    if (days > 0)       detail = `${days} day${days === 1 ? '' : 's'} to launch`;
    else if (days === 0) detail = 'launches today';
    else                 detail = `${-days} day${days === -1 ? '' : 's'} past intended launch`;
  }
  return (
    <div style={containerStyle(compact)}>
      <span style={dotStyle('#a78bfa')} />
      <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Pre-launch
      </span>
      <span style={{ fontSize: 11, color: '#888' }}>· {detail}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Chip — one source's freshness inline
// ──────────────────────────────────────────────────

function Chip({ value, skipIfMissing }) {
  if (!value) return null;
  if (skipIfMissing && value.tier === 'missing') return null;
  const color = TIER_COLORS[value.tier] || '#666';
  const label = value.label || 'Source';
  const display = value.tier === 'error'
    ? 'error'
    : value.tier === 'missing'
      ? 'never'
      : formatRelativeAge(value.at);
  return (
    <span
      style={chipStyle(color)}
      title={value.errorMessage ? `${label}: ${value.errorMessage}` : undefined}
    >
      <span style={{ color: '#888' }}>{label}:</span>{' '}
      <strong style={{ color }}>{display}</strong>
    </span>
  );
}

// ──────────────────────────────────────────────────
// Expanded details
// ──────────────────────────────────────────────────

function ExpandedDetails({ freshness }) {
  const rows = [
    {
      key: 'data_api_pull',
      label: 'Channel data — videos, sub counts, snapshots (Data API)',
      value: freshness.data_api_pull,
      missingNote: freshness.data_api_pull.tier === 'missing'
        ? 'Channel data has never been synced. The daily sync runs at 06:00 / 07:00 UTC; or click Sync in the OAuth panel to trigger immediately.'
        : null,
    },
    {
      key: 'analytics_pull',
      label: 'Analytics — Watch Hours, Retention, Subs Gained (Analytics API)',
      value: freshness.analytics_pull,
      missingNote: freshness.analytics_pull.tier === 'missing'
        ? 'Analytics has never been pulled. Runs nightly as part of daily-sync when the channel has an OAuth connection. Brand Account channels may need owner OAuth (not manager) to access per-video metrics.'
        : null,
      errorHint: freshness.analytics_pull.errorMessage?.match(/forbidden|dimensions=video|insufficient/i)
        ? 'This looks like the documented Brand Account dimensions=video limitation. Per-video analytics requires owner-level OAuth on managed Brand Account channels.'
        : null,
    },
    {
      key: 'reporting_pull',
      label: 'Reporting — impressions, CTR (Reporting API)',
      value: freshness.reporting_pull,
      missingNote: freshness.reporting_pull.tier === 'missing'
        ? 'Reporting data hasn\'t arrived. Reporting jobs take 24–48h to produce their first CSV after creation; subsequent days are daily. "Never" right after connecting is expected.'
        : null,
    },
    {
      key: 'surface_pull',
      label: 'Surface — traffic sources, search queries',
      value: freshness.surface_pull,
      missingNote: freshness.surface_pull.tier === 'missing'
        ? 'Surface intelligence hasn\'t been pulled. Runs nightly as part of daily-sync for OAuth-connected channels; or trigger manually at Strategy → Pre-flight.'
        : null,
    },
    {
      key: 'oauth_refresh',
      label: 'OAuth — token refresh heartbeat (auth liveness only)',
      value: freshness.oauth_refresh,
      missingNote: !freshness.oauth_refresh.hasConnection
        ? 'No OAuth connection. Most analytics-side pulls require owner OAuth. Send an invite from Settings → API Keys.'
        : null,
    },
  ];
  return (
    <div style={expandedStyle}>
      {/* Silent-failure callout pinned to the top so it isn't buried. */}
      {freshness.data_api_pull?.silentFailure && (
        <div style={silentFailureNoteStyle}>
          <strong style={{ color: '#ef6b6b', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>
            Silent sync failure detected
          </strong>
          <div style={{ marginTop: 4, color: '#cde4d6', lineHeight: 1.5 }}>
            The sync cron ran more recently ({formatRelativeAge(freshness.data_api_pull.lastAttemptAt)})
            than the last <em>successful</em> Data API pull
            ({freshness.data_api_pull.at ? formatRelativeAge(freshness.data_api_pull.at) : 'never'}).
            That gap means the latest cron attempt didn't update channel data — likely a quota cap mid-run,
            a per-channel API error, or a partial-write bug. <strong>Recent uploads / view counts you see
            may be older than the chip suggests.</strong>
          </div>
        </div>
      )}

      {rows.map(r => (
        <div key={r.key} style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={dotStyle(TIER_COLORS[r.value.tier])} />
            <strong style={{ color: '#cde4d6', fontSize: 11 }}>{r.label}</strong>
            <span style={{ color: TIER_COLORS[r.value.tier], fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              · {TIER_LABELS[r.value.tier]}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#888', marginLeft: 14, marginTop: 2 }}>
            {r.value.at
              ? <>Last successful: {new Date(r.value.at).toLocaleString()} ({formatRelativeAge(r.value.at)}){r.value.isFallback ? ' (legacy last_synced_at — per-source column not populated yet)' : ''}</>
              : <>Not yet pulled.</>}
          </div>
          {r.value.errorMessage && (
            <div style={{ fontSize: 11, color: '#ef6b6b', marginLeft: 14, marginTop: 2, lineHeight: 1.4 }}>
              Error: {r.value.errorMessage}
            </div>
          )}
          {r.errorHint && (
            <div style={{ fontSize: 11, color: '#E8A82B', marginLeft: 14, marginTop: 2, lineHeight: 1.4, fontStyle: 'italic' }}>
              → {r.errorHint}
            </div>
          )}
          {r.missingNote && r.value.tier === 'missing' && (
            <div style={{ fontSize: 11, color: '#888', marginLeft: 14, marginTop: 2, lineHeight: 1.4 }}>
              {r.missingNote}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const containerStyle = (compact) => ({
  display: 'inline-flex', alignItems: 'center', gap: compact ? 6 : 10,
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid #2a2a30',
  borderRadius: 6, padding: compact ? '4px 10px' : '6px 12px',
  cursor: 'pointer', fontSize: 11,
  color: '#cde4d6', fontFamily: 'inherit',
});

const dotStyle = (color) => ({
  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
  background: color,
  boxShadow: `0 0 4px ${color}55`,
  flexShrink: 0,
});

const chipTextStyle = { fontSize: 11, color: '#888' };
const chipStyle = (color) => ({
  fontSize: 11, color: '#aaa',
});

const errorBadgeStyle = {
  background: 'rgba(239,107,107,0.10)',
  color: '#ef6b6b',
  border: '1px solid rgba(239,107,107,0.30)',
  borderRadius: 4, padding: '1px 6px',
  fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.5,
};

const expandedStyle = {
  position: 'absolute',
  zIndex: 10,
  marginTop: 6,
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 6,
  padding: 12,
  minWidth: 360,
  maxWidth: 480,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  display: 'flex', flexDirection: 'column', gap: 10,
};
const rowStyle = {
  paddingBottom: 8,
  borderBottom: '1px dashed #2a2a30',
};

const silentFailureNoteStyle = {
  background: 'rgba(239,107,107,0.08)',
  border: '1px solid rgba(239,107,107,0.30)',
  borderLeft: '2px solid #ef6b6b',
  borderRadius: 5,
  padding: 10,
  fontSize: 11,
};

const honestyNoteStyle = {
  marginTop: 4,
  background: 'rgba(255,255,255,0.02)',
  border: '1px dashed #2a2a30',
  borderRadius: 5,
  padding: 10,
  fontSize: 11,
  color: '#888',
  lineHeight: 1.55,
};
