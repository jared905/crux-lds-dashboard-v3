/**
 * Surface Intelligence pull panel.
 *
 * Lets the strategist refresh the client's per-video traffic-source
 * data + channel-level search queries by triggering a backend pull
 * against YouTube Analytics. Each pull writes a new snapshot to
 * client_video_traffic_sources + client_search_queries.
 *
 * Behavior:
 *   - Auto-finds the OAuth connection whose youtube_channel_id
 *     matches the current client's. If none, surfaces an inline
 *     "connect YouTube OAuth for this channel" message instead of
 *     a refresh button.
 *   - Shows last-pull freshness ("Updated 3h ago" or "Never pulled").
 *   - On refresh: spinner + status + summary counts when done
 *     (videos succeeded/failed, traffic-source rows inserted, search
 *     query rows inserted, branded vs unbranded split).
 *
 * Sits near the bottom of the Pre-flight panel — the surface data
 * refresh is rare (once per snapshot window), so it doesn't need
 * to be at the top of the strategist's eye-line. The Phase 2.5
 * scorer extension will consume the data this populates.
 */

import React, { useEffect, useState } from 'react';
import { youtubeOAuthService } from '../../../services/youtubeOAuthService';
import { supabase } from '../../../services/supabaseClient';

export default function SurfacePullPanel({ clientId }) {
  const [open, setOpen] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [clientYtId, setClientYtId] = useState(null);
  const [connection, setConnection] = useState(null);
  const [lastPullAt, setLastPullAt] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Bootstrap: resolve client's youtube_channel_id, find the matching
  // OAuth connection, and load the latest pull timestamp so the
  // collapsed header can show freshness without expanding.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBootstrapping(true);
      try {
        const { data: clientCh } = await supabase
          .from('channels')
          .select('youtube_channel_id')
          .eq('id', clientId)
          .maybeSingle();
        if (cancelled) return;
        const ytId = clientCh?.youtube_channel_id || null;
        setClientYtId(ytId);

        if (ytId) {
          const conns = await youtubeOAuthService.getConnections();
          if (cancelled) return;
          const match = (conns || []).find(c => c.youtube_channel_id === ytId) || null;
          setConnection(match);
        }

        const { data: latestRow } = await supabase
          .from('client_video_traffic_sources')
          .select('captured_at')
          .eq('client_id', clientId)
          .order('captured_at', { ascending: false })
          .limit(1);
        if (cancelled) return;
        setLastPullAt(latestRow?.[0]?.captured_at || null);
      } catch (err) {
        if (!cancelled) setError(`Bootstrap failed: ${err.message || err}`);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const handlePull = async () => {
    setError(null);
    setResult(null);
    if (!connection) { setError('No matching OAuth connection for this channel'); return; }

    setRunning(true);
    try {
      const token = await youtubeOAuthService.getAuthToken();
      if (!token) throw new Error('No session token — refresh and log in');
      const resp = await fetch('/api/youtube-analytics-surface-pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ connectionId: connection.id }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json?.error || `HTTP ${resp.status}`);
        setResult(json);
      } else {
        setResult(json);
        if (json?.ok) setLastPullAt(new Date().toISOString());
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setRunning(false);
    }
  };

  const freshnessLabel = lastPullAt
    ? `Updated ${formatRelative(lastPullAt)}`
    : 'Never pulled';

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={collapsedBtnStyle}>
        ▸ Surface intelligence · <span style={{ color: lastPullAt ? '#cde4d6' : '#E8A82B' }}>{freshnessLabel}</span>
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div>
          <div style={kickerStyle}>Surface intelligence</div>
          <div style={subtleStyle}>
            Pulls per-video traffic source + channel-level search query data from YouTube Analytics. Run once per snapshot window — Phase 2.5 scoring reads from the latest snapshot.
          </div>
        </div>
        <button onClick={() => setOpen(false)} style={collapseBtnStyle}>collapse ▴</button>
      </div>

      {bootstrapping ? (
        <Note tone="info">Loading…</Note>
      ) : !clientYtId ? (
        <Note tone="warn">
          This client doesn't have a <code>youtube_channel_id</code> on its <code>channels</code> row. Connect YouTube data ingestion first.
        </Note>
      ) : !connection ? (
        <Note tone="warn">
          No active YouTube OAuth connection matches this channel (<code>{clientYtId}</code>). Connect OAuth for this channel in Settings to enable surface scoring.
        </Note>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: '#888' }}>Connection</div>
              <div style={{ fontSize: 13, color: '#e8e2d0', fontWeight: 600 }}>
                {connection.youtube_channel_title || connection.youtube_channel_id}
              </div>
              <div style={{ fontSize: 11, color: lastPullAt ? '#cde4d6' : '#E8A82B', marginTop: 4 }}>
                {freshnessLabel}
              </div>
            </div>
            <button onClick={handlePull} disabled={running} style={runBtnStyle(running)}>
              {running ? 'Pulling…' : (lastPullAt ? 'Refresh snapshot' : 'Run first pull')}
            </button>
          </div>

          {error && <Note tone="error">{error}</Note>}
          {result?.summary && <ResultSummary result={result} />}
        </div>
      )}
    </div>
  );
}

function ResultSummary({ result }) {
  const traffic = result?.summary?.traffic;
  const search = result?.summary?.search;
  const brandedTokens = result?.summary?.brandedTokens || [];

  const totalSearch = (search?.rowsInserted || 0);
  const branded = search?.brandedCount || 0;
  const unbranded = Math.max(totalSearch - branded, 0);

  return (
    <div style={resultCardStyle(result.ok)}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: result.ok ? '#cde4d6' : '#f3c5c5' }}>
        {result.ok ? '✓ Snapshot stored.' : '✗ Pull failed.'}
      </div>

      {traffic && (
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>
          <strong style={{ color: '#cde4d6' }}>Traffic-source:</strong>{' '}
          {traffic.videosOk} videos OK, {traffic.videosFailed} failed.{' '}
          {traffic.rowsInserted} surface rows inserted.
          {traffic.errors?.length > 0 && (
            <div style={{ fontSize: 11, color: '#E8A82B', marginTop: 4 }}>
              Errors: {traffic.errors.slice(0, 3).map(e => e.error).join('; ')}
              {traffic.errors.length > 3 ? ` (+${traffic.errors.length - 3} more)` : ''}
            </div>
          )}
        </div>
      )}

      {search && (
        <div style={{ fontSize: 12, color: '#aaa' }}>
          <strong style={{ color: '#cde4d6' }}>Search queries:</strong>{' '}
          {search.rowsInserted} unique stored ({unbranded} unbranded, {branded} branded)
          {search.videosOk != null && (
            <> · {search.videosOk}/{search.videosOk + (search.errors?.filter(e => e.videoId).length || 0)} videos returned data
              {search.videosWithSearchRows != null && (
                <> ({search.videosWithSearchRows} had search-driven views)</>
              )}
            </>
          )}.
          {search.errors?.length > 0 && (
            <div style={{ fontSize: 11, color: '#E8A82B', marginTop: 4 }}>
              {summarizeErrors(search.errors)}
            </div>
          )}
        </div>
      )}

      {brandedTokens.length > 0 && (
        <div style={{ fontSize: 11, color: '#666', marginTop: 8, fontFamily: 'ui-monospace, Menlo, monospace' }}>
          Branded tokens used: {brandedTokens.map(t => `"${t}"`).join(', ')}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

// Per-video pulls can produce N identical errors when an API path is
// uniformly blocked. Collapse them so the UI shows "20 videos: same
// FIELD_UNKNOWN_VALUE error" instead of the same string twenty times.
function summarizeErrors(errors) {
  if (!errors?.length) return '';
  const buckets = new Map();
  for (const e of errors) {
    const key = e.error || 'unknown error';
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const parts = [];
  for (const [msg, n] of buckets.entries()) {
    parts.push(n > 1 ? `${n}× ${msg}` : msg);
  }
  return `Errors: ${parts.join(' · ')}`;
}

function formatRelative(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Note({ tone, children }) {
  const palette = {
    info:  { bg: 'rgba(10,145,155,0.08)',  border: 'rgba(10,145,155,0.25)',  fg: '#0A919B' },
    warn:  { bg: 'rgba(232,168,43,0.08)',  border: 'rgba(232,168,43,0.30)',  fg: '#E8A82B' },
    error: { bg: 'rgba(239,107,107,0.08)', border: 'rgba(239,107,107,0.30)', fg: '#ef6b6b' },
  }[tone] || { bg: '#1a1a1f', border: '#333', fg: '#aaa' };
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 6,
      background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg,
      fontSize: 12, margin: '6px 0',
    }}>{children}</div>
  );
}

// ─────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────

const collapsedBtnStyle = {
  background: 'transparent', border: 'none',
  color: '#888', fontSize: 11, fontWeight: 600,
  textAlign: 'left', padding: 0, cursor: 'pointer', marginTop: 10,
};
const collapseBtnStyle = { ...collapsedBtnStyle, marginTop: 0 };

const panelStyle = {
  background: '#0e0e11',
  border: '1px solid rgba(10,145,155,0.20)',
  borderLeft: '2px solid #0A919B',
  borderRadius: 6, padding: 12, marginTop: 12,
};
const kickerStyle = {
  fontSize: 11, color: '#0A919B',
  textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700,
};
const subtleStyle = { fontSize: 11, color: '#666', marginTop: 2 };

const runBtnStyle = (running) => ({
  background: running ? '#1a1a1f' : '#0A919B',
  color: running ? '#666' : '#0a0a0e',
  border: 'none', padding: '8px 16px',
  borderRadius: 5, fontSize: 12, fontWeight: 700,
  cursor: running ? 'not-allowed' : 'pointer', letterSpacing: 0.3,
});

const resultCardStyle = (ok) => ({
  background: ok ? 'rgba(10,145,155,0.06)' : 'rgba(239,107,107,0.06)',
  border: `1px solid ${ok ? 'rgba(10,145,155,0.25)' : 'rgba(239,107,107,0.25)'}`,
  padding: 10, borderRadius: 5, marginTop: 10,
});
