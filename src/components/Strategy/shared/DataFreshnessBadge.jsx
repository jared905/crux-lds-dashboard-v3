/**
 * DataFreshnessBadge — compact "when was this actually pulled" badge.
 *
 * Drops into every Strategy workspace header so the strategist can see
 * at a glance how stale the inputs to their current view are. Without
 * this, "I'm looking at last week's data and didn't notice" is a real
 * failure mode.
 *
 * Renders inline as:
 *   [●] Channel: 2h ago  ·  Analytics: 1h ago  ·  Surface: 1d ago
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
  fresh:      '#3fa66a',
  stale:      '#E8A82B',
  very_stale: '#ef6b6b',
  missing:    '#666',
};
const TIER_LABELS = {
  fresh:      'Fresh',
  stale:      'Stale',
  very_stale: 'Very stale',
  missing:    'Never',
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
        <Chip label="Channel"   value={freshness.channel_sync}  />
        <Chip label="Analytics" value={freshness.oauth_refresh} skipIfMissing />
        <Chip label="Surface"   value={freshness.surface_pull}  skipIfMissing />
        {freshness.anyError && (
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
// Chip — one source's freshness inline
// ──────────────────────────────────────────────────

function Chip({ label, value, skipIfMissing }) {
  if (!value) return null;
  if (skipIfMissing && value.tier === 'missing') return null;
  const color = TIER_COLORS[value.tier];
  return (
    <span style={chipStyle(color)}>
      <span style={{ color: '#888' }}>{label}:</span>{' '}
      <strong style={{ color }}>{formatRelativeAge(value.at)}</strong>
    </span>
  );
}

// ──────────────────────────────────────────────────
// Expanded details
// ──────────────────────────────────────────────────

function ExpandedDetails({ freshness }) {
  const rows = [
    {
      key: 'channel_sync',
      label: 'Competitor sync (daily 06:00 UTC)',
      value: freshness.channel_sync,
      showError: freshness.channel_sync.errorMessage,
    },
    {
      key: 'oauth_refresh',
      label: 'OAuth token refresh',
      value: freshness.oauth_refresh,
      showError: freshness.oauth_refresh.connectionError,
      missingNote: !freshness.oauth_refresh.hasConnection
        ? 'No OAuth connection — analytics-side pulls (per-video traffic, search queries) require owner OAuth. Send a guest invite from Settings → API Keys.'
        : null,
    },
    {
      key: 'surface_pull',
      label: 'Surface intelligence (traffic / search queries)',
      value: freshness.surface_pull,
      missingNote: freshness.surface_pull.tier === 'missing'
        ? 'Never pulled. Go to Strategy → Pre-flight and hit "Pull surface intelligence" on the connected channel.'
        : null,
    },
  ];
  return (
    <div style={expandedStyle}>
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
              ? <>Last pulled: {new Date(r.value.at).toLocaleString()} ({formatRelativeAge(r.value.at)})</>
              : <>Not yet pulled.</>}
          </div>
          {r.value.lastAttemptAt && r.value.errorMessage && (
            <div style={{ fontSize: 11, color: '#ef6b6b', marginLeft: 14, marginTop: 2 }}>
              Last attempt: {formatRelativeAge(r.value.lastAttemptAt)} — failed: {r.value.errorMessage}
            </div>
          )}
          {r.showError && !r.value.lastAttemptAt && (
            <div style={{ fontSize: 11, color: '#ef6b6b', marginLeft: 14, marginTop: 2 }}>
              Error: {r.showError}
            </div>
          )}
          {r.missingNote && (
            <div style={{ fontSize: 11, color: '#E8A82B', marginLeft: 14, marginTop: 2, lineHeight: 1.4 }}>
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
