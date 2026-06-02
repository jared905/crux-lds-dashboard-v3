/**
 * Phase 2.5 spike runner — diagnostic UI for the Analytics API spike.
 *
 * One job: confirm /api/youtube-analytics-spike succeeds against a real
 * client video. If both query paths return ok=true with the expected
 * response shapes, Phase 2.5's pull service is unblocked. If either
 * errors, this surfaces the error message + reason so we can triage
 * against the known dimensions=video block on Brand Account channels.
 *
 * Disposable — when the real Phase 2.5 service lands, this UI gets
 * replaced by the actual scoring-cohort view. Mounted in PreflightPanel
 * inside a collapsible section so it doesn't clutter the routine
 * scoring workflow.
 */

import React, { useEffect, useState } from 'react';
import { youtubeOAuthService } from '../../../services/youtubeOAuthService';

export default function Phase25Spike() {
  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState([]);
  const [connectionId, setConnectionId] = useState('');
  const [videoId, setVideoId] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const list = await youtubeOAuthService.getConnections();
        setConnections(list || []);
        if (list?.length && !connectionId) setConnectionId(list[0].id);
      } catch (err) {
        setError(`Failed to load OAuth connections: ${err.message || err}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = async () => {
    setError(null);
    setResult(null);
    if (!connectionId) { setError('Pick a YouTube OAuth connection'); return; }
    if (!videoId.trim()) { setError('Enter a YouTube video ID (the 11-character id from the URL)'); return; }

    setRunning(true);
    try {
      const token = await youtubeOAuthService.getAuthToken();
      if (!token) throw new Error('No session token — refresh and log in');
      const resp = await fetch('/api/youtube-analytics-spike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ connectionId, videoId: videoId.trim() }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json?.error || `HTTP ${resp.status}`);
        setResult(json);
      } else {
        setResult(json);
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setRunning(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={collapsedBtnStyle}
        title="Diagnostic — confirm Analytics API paths Phase 2.5 needs"
      >
        ▸ Phase 2.5 Analytics spike (diagnostic)
      </button>
    );
  }

  const verdict = result ? renderVerdict(result) : null;

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: '#0A919B', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
            Phase 2.5 Analytics spike
          </div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
            Confirms traffic-source + suggested-video adjacency paths before building Phase 2.5.
          </div>
        </div>
        <button onClick={() => setOpen(false)} style={{ ...collapsedBtnStyle, padding: 0 }}>collapse ▴</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>OAuth connection</label>
          <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} style={inputStyle}>
            <option value="">— pick a connection —</option>
            {connections.map(c => (
              <option key={c.id} value={c.id}>
                {c.youtube_channel_name || c.youtube_channel_id} {c.is_active ? '' : '(inactive)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>YouTube video id (11 chars)</label>
          <input
            type="text"
            value={videoId}
            onChange={(e) => setVideoId(e.target.value)}
            placeholder="dQw4w9WgXcQ"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <button onClick={run} disabled={running} style={runBtnStyle(running)}>
          {running ? 'Running spike…' : 'Run spike'}
        </button>
        {error && <div style={{ fontSize: 12, color: '#ef6b6b' }}>{error}</div>}
      </div>

      {verdict}
      {result && <pre style={preStyle}>{JSON.stringify(prune(result), null, 2)}</pre>}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Verdict — interprets the raw spike result so the user doesn't have
// to read JSON to know if Phase 2.5 is unblocked.
// ─────────────────────────────────────────────────────
function renderVerdict(result) {
  const tsOk = !!result?.trafficSource?.ok;
  const adjOk = !!result?.adjacency?.ok;
  const tone = tsOk && adjOk ? 'go' : 'block';

  const lines = [];
  if (tsOk) {
    const surfaces = result.trafficSource?.summary?.bySurface || [];
    const top = surfaces[0];
    lines.push(`✓ Traffic-source query OK — ${surfaces.length} surface buckets returned${top ? ` (top: ${top.surface} @ ${top.sharePct}%)` : ''}.`);
  } else {
    lines.push(`✗ Traffic-source query FAILED — ${result.trafficSource?.error || 'unknown error'}${result.trafficSource?.errorReason ? ` (reason: ${result.trafficSource.errorReason})` : ''}.`);
  }
  if (adjOk) {
    const s = result.adjacency?.summary;
    lines.push(`✓ Adjacency query OK — ${s?.sourceVideoCount || 0} source videos drove ${s?.totalSuggestedViews || 0} suggested-video impressions.`);
  } else {
    lines.push(`✗ Adjacency query FAILED — ${result.adjacency?.error || 'unknown error'}${result.adjacency?.errorReason ? ` (reason: ${result.adjacency.errorReason})` : ''}.`);
  }

  return (
    <div style={verdictStyle(tone)}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
        {tone === 'go'
          ? 'Phase 2.5 unblocked — both Analytics paths working.'
          : 'Phase 2.5 blocked — at least one path failed. See errors below.'}
      </div>
      {lines.map((l, i) => <div key={i} style={{ fontSize: 12 }}>{l}</div>)}
    </div>
  );
}

// Drop the noisy `rows` arrays for the pretty-printed view — the
// summaries above already capture the actionable info, and raw rows
// make the JSON blob wall-of-text.
function prune(obj) {
  const out = JSON.parse(JSON.stringify(obj));
  if (out?.trafficSource?.rows) out.trafficSource.rows = `(${out.trafficSource.rows.length} rows — see summary)`;
  if (out?.adjacency?.rows) out.adjacency.rows = `(${out.adjacency.rows.length} rows — see summary)`;
  return out;
}

// ─────────────────────────────────────────────────────
// Styles — match the dark Strategy Spine palette
// ─────────────────────────────────────────────────────
const collapsedBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#666',
  fontSize: 11,
  fontWeight: 600,
  textAlign: 'left',
  padding: 0,
  cursor: 'pointer',
  marginTop: 10,
};
const panelStyle = {
  background: '#0e0e11',
  border: '1px solid rgba(10, 145, 155, 0.25)',
  borderLeft: '2px solid #0A919B',
  borderRadius: 6,
  padding: 12,
  marginTop: 12,
};
const labelStyle = {
  display: 'block',
  fontSize: 10,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  marginBottom: 4,
  fontWeight: 600,
};
const inputStyle = {
  width: '100%',
  padding: '7px 10px',
  background: '#1a1a1f',
  border: '1px solid #2a2a30',
  borderRadius: 5,
  color: '#e8e2d0',
  fontSize: 12,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const runBtnStyle = (running) => ({
  background: running ? '#1a1a1f' : '#0A919B',
  color: running ? '#666' : '#0a0a0e',
  border: 'none',
  padding: '7px 14px',
  borderRadius: 5,
  fontSize: 12,
  fontWeight: 700,
  cursor: running ? 'not-allowed' : 'pointer',
  letterSpacing: 0.3,
});
const verdictStyle = (tone) => ({
  background: tone === 'go' ? 'rgba(10, 145, 155, 0.08)' : 'rgba(239, 107, 107, 0.08)',
  border: `1px solid ${tone === 'go' ? 'rgba(10, 145, 155, 0.30)' : 'rgba(239, 107, 107, 0.30)'}`,
  color: tone === 'go' ? '#cde4d6' : '#f3c5c5',
  padding: 10,
  borderRadius: 5,
  marginBottom: 10,
});
const preStyle = {
  background: '#0a0a0e',
  border: '1px solid #1f1f24',
  borderRadius: 5,
  padding: 10,
  fontSize: 11,
  color: '#aaa',
  overflow: 'auto',
  maxHeight: 320,
  fontFamily: 'ui-monospace, Menlo, monospace',
  margin: 0,
};
