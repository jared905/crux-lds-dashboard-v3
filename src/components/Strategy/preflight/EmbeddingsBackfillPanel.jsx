/**
 * Embeddings backfill panel — companion to SurfacePullPanel.
 *
 * Triggers /api/embed-channel-videos to populate
 * videos.title_embedding for the client's own channel + the client's
 * competitor cohort. The topic_authority scorer reads these to compute
 * concept-to-history similarity; without embeddings present the
 * dimension self-excludes.
 *
 * UX: collapsed by default with a freshness label. When expanded,
 * shows pending counts per scope (client / cohort) and a "Backfill
 * batch" button. Each click runs up to 20 batches of 50 videos
 * (the API's per-click cap) and surfaces remaining work so the
 * strategist knows whether to click again.
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import { youtubeOAuthService } from '../../../services/youtubeOAuthService';
import { countPendingEmbeddings } from '../../../services/topicAuthorityService';

export default function EmbeddingsBackfillPanel({ clientId, onBackfillComplete }) {
  const [open, setOpen] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [clientChannel, setClientChannel] = useState(null);
  const [cohortChannelIds, setCohortChannelIds] = useState([]);
  const [clientPending, setClientPending] = useState(null);
  const [cohortPending, setCohortPending] = useState(null);
  const [running, setRunning] = useState(null); // 'client' | 'cohort' | null
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Bootstrap — resolve client channel + cohort ids + pending counts.
  // Re-fires when the panel is expanded so adding competitors in
  // another tab + coming back picks up the new junction rows without
  // a page reload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBootstrapping(true);
      setError(null);
      try {
        const { data: ch } = await supabase
          .from('channels')
          .select('id, youtube_channel_id, name')
          .eq('id', clientId)
          .maybeSingle();
        if (cancelled) return;
        setClientChannel(ch || null);

        // Cohort membership = client_channels junction (client_id,
        // channel_id) ∩ channels.is_competitor=true. The naive
        // `channels.client_id=…` query is wrong — competitor links
        // live in the junction table, not a column on channels.
        let cohortIds = [];
        if (ch?.id) {
          const { data: junctionRows } = await supabase
            .from('client_channels')
            .select('channel_id')
            .eq('client_id', ch.id);
          const linkedIds = (junctionRows || []).map(r => r.channel_id);
          if (linkedIds.length) {
            const { data: cohort } = await supabase
              .from('channels')
              .select('id')
              .in('id', linkedIds)
              .eq('is_competitor', true);
            cohortIds = (cohort || []).map(c => c.id);
          }
        }
        if (cancelled) return;
        setCohortChannelIds(cohortIds);

        await refreshPending(ch?.id, cohortIds, cancelled);
      } catch (err) {
        if (!cancelled) setError(`Bootstrap failed: ${err.message || err}`);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, open]);

  const refreshPending = async (clientChannelId, cohortIds, cancelled = false) => {
    if (clientChannelId) {
      const n = await countPendingEmbeddings(clientChannelId);
      if (!cancelled) setClientPending(n);
    }
    if (cohortIds?.length) {
      // Cohort pending = sum across cohort channels. Run in parallel.
      const counts = await Promise.all(cohortIds.map(id => countPendingEmbeddings(id)));
      if (!cancelled) setCohortPending(counts.reduce((s, n) => s + (n || 0), 0));
    } else {
      if (!cancelled) setCohortPending(0);
    }
  };

  const runBackfill = async (scope) => {
    if (scope === 'client' && !clientChannel?.id) return;
    if (scope === 'cohort' && !cohortChannelIds.length) return;

    setRunning(scope);
    setError(null);
    setResult(null);

    try {
      const token = await youtubeOAuthService.getAuthToken();
      if (!token) throw new Error('No session token — refresh and log in');

      const channelsToRun = scope === 'client' ? [clientChannel.id] : cohortChannelIds;
      const summaries = [];
      let totalEmbedded = 0;
      let totalTokens = 0;
      const errors = [];

      for (const chId of channelsToRun) {
        const resp = await fetch('/api/embed-channel-videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ channelId: chId }),
        });
        const json = await resp.json();
        if (!resp.ok) {
          errors.push({ channelId: chId, error: json?.error || `HTTP ${resp.status}` });
          continue;
        }
        summaries.push(json);
        totalEmbedded += json.videosEmbedded || 0;
        totalTokens += json.totalTokens || 0;
        if (json.errors?.length) errors.push(...json.errors);
      }

      setResult({ scope, summaries, totalEmbedded, totalTokens, errors });
      await refreshPending(clientChannel.id, cohortChannelIds);
      if (typeof onBackfillComplete === 'function') onBackfillComplete();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setRunning(null);
    }
  };

  const totalPending = (clientPending || 0) + (cohortPending || 0);
  const freshnessLabel = totalPending === 0
    ? 'All videos embedded'
    : `${totalPending} videos pending`;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={collapsedBtnStyle}>
        ▸ Topic authority embeddings ·{' '}
        <span style={{ color: totalPending === 0 ? '#cde4d6' : '#E8A82B' }}>{freshnessLabel}</span>
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div>
          <div style={kickerStyle}>Topic authority embeddings</div>
          <div style={subtleStyle}>
            Backfills OpenAI text-embedding-3-small vectors for video titles. Topic-authority scoring activates once embeddings exist for the client + cohort. Each click runs up to 20 batches of 50 videos.
          </div>
        </div>
        <button onClick={() => setOpen(false)} style={collapseBtnStyle}>collapse ▴</button>
      </div>

      {bootstrapping && <Note tone="info">Loading…</Note>}
      {error && <Note tone="error">{error}</Note>}

      {!bootstrapping && !clientChannel && (
        <Note tone="warn">This client doesn't have a channels row resolved.</Note>
      )}

      {!bootstrapping && clientChannel && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <ScopeRow
            label="Client channel"
            sublabel={clientChannel.name}
            pending={clientPending}
            running={running === 'client'}
            disabled={running !== null || (clientPending ?? 0) === 0}
            onRun={() => runBackfill('client')}
          />
          <ScopeRow
            label="Cohort"
            sublabel={`${cohortChannelIds.length} competitor channels`}
            pending={cohortPending}
            running={running === 'cohort'}
            disabled={running !== null || (cohortPending ?? 0) === 0 || cohortChannelIds.length === 0}
            onRun={() => runBackfill('cohort')}
          />
        </div>
      )}

      {result && (
        <div style={resultCardStyle(true)}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: '#cde4d6' }}>
            ✓ {result.scope === 'client' ? 'Client' : 'Cohort'} backfill complete.
          </div>
          <div style={{ fontSize: 12, color: '#aaa' }}>
            {result.totalEmbedded} videos embedded · {result.totalTokens} OpenAI tokens used.
          </div>
          {result.errors?.length > 0 && (
            <div style={{ fontSize: 11, color: '#E8A82B', marginTop: 4, lineHeight: 1.4 }}>
              {result.errors.length} error{result.errors.length === 1 ? '' : 's'}:
              {result.errors.slice(0, 3).map((e, i) => (
                <div key={i} style={{ marginLeft: 8, marginTop: 2 }}>
                  <span style={{ color: '#666' }}>[{e.stage || 'unknown'}]</span>{' '}
                  {e.error || 'unknown error'}
                </div>
              ))}
              {result.errors.length > 3 && (
                <div style={{ marginLeft: 8, marginTop: 2, color: '#666' }}>
                  …{result.errors.length - 3} more
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────

function ScopeRow({ label, sublabel, pending, running, disabled, onRun }) {
  return (
    <div style={scopeRowStyle}>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#cde4d6', marginTop: 2 }}>{sublabel}</div>
      <div style={{ fontSize: 11, color: pending === 0 ? '#cde4d6' : '#E8A82B', marginTop: 4 }}>
        {pending == null ? '—' : pending === 0 ? 'All embedded' : `${pending} pending`}
      </div>
      <button onClick={onRun} disabled={disabled} style={runBtnStyle(running, disabled)}>
        {running ? 'Embedding…' : pending === 0 ? 'Done' : 'Backfill batch'}
      </button>
    </div>
  );
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
// Styles — match SurfacePullPanel
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

const scopeRowStyle = {
  background: '#1a1a1f',
  border: '1px solid #2a2a30',
  borderRadius: 5,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const runBtnStyle = (running, disabled) => ({
  marginTop: 8,
  background: running || disabled ? '#1a1a1f' : '#0A919B',
  color: running || disabled ? '#666' : '#0a0a0e',
  border: running || disabled ? '1px solid #2a2a30' : 'none',
  padding: '6px 12px',
  borderRadius: 5, fontSize: 12, fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer', letterSpacing: 0.3,
});

const resultCardStyle = (ok) => ({
  background: ok ? 'rgba(10,145,155,0.06)' : 'rgba(239,107,107,0.06)',
  border: `1px solid ${ok ? 'rgba(10,145,155,0.25)' : 'rgba(239,107,107,0.25)'}`,
  padding: 10, borderRadius: 5, marginTop: 10,
});
