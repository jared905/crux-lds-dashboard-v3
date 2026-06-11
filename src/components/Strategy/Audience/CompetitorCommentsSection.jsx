/**
 * CompetitorCommentsSection — on-demand competitor-comment sweep.
 *
 * Path A from the 2026-06-10 deep-research synthesis on YouTube
 * comments-mining for institutional brand strategy. Per the synthesis,
 * comments are surfaced as Strategy Spine INPUT CANDIDATES the
 * strategist reviews — never auto-merged into the persona, because
 * participation inequality (<1% commenter rate on institutional
 * channels) makes comments a self-selected vocal minority that
 * misrepresents the silent decision-maker audience the brand serves.
 *
 * Flow:
 *   1. Strategist picks one competitor channel (default: peer-tagged
 *      cohort channels for the active client).
 *   2. Click "Run sweep" → fetches recent uploads from that channel →
 *      pulls top-relevance comments → regex-classifies into questions
 *      and content_requests.
 *   3. Results render grouped by signal type. Each signal can be
 *      starred (keep in mind), merged to Spine (used as input for
 *      persona / pillars / concept seeds), or dismissed (junk).
 *
 * Honest framing in the UI: this is competitive-intelligence content-gap
 * detection, not audience research. Each card surfaces the source video
 * + author + like count so the strategist judges signal quality before
 * promoting anything to Spine inputs.
 */

import React, { useEffect, useState } from 'react';
import {
  MessageCircle, Loader, ChevronDown, ChevronRight, Sparkles,
  HelpCircle, Megaphone, Star, Check, X as XIcon, ExternalLink,
} from 'lucide-react';
import {
  runSweep,
  listSweeps,
  getSweepWithSignals,
  updateSignalStatus,
  listCompetitorCandidates,
  DEFAULT_MAX_VIDEOS,
  DEFAULT_MAX_COMMENTS_PER_VIDEO,
} from '../../../services/commentSweepService.js';

const ROLE_LABELS = {
  peer:         'Peer',
  aspirational: 'Aspirational',
  reference:    'Reference',
};
const ROLE_COLORS = {
  peer:         '#3fa66a',
  aspirational: '#E8A82B',
  reference:    '#0A919B',
};

export default function CompetitorCommentsSection({ clientId }) {
  const [candidates, setCandidates] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [maxVideos, setMaxVideos] = useState(DEFAULT_MAX_VIDEOS);
  const [maxComments, setMaxComments] = useState(DEFAULT_MAX_COMMENTS_PER_VIDEO);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeSweep, setActiveSweep] = useState(null);
  const [loadingSweep, setLoadingSweep] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const [cands, sweeps] = await Promise.all([
        listCompetitorCandidates(clientId),
        listSweeps(clientId, { limit: 10 }),
      ]);
      if (cancelled) return;
      setCandidates(cands || []);
      setHistory(sweeps || []);
      if (cands?.[0]?.id) setSelectedId(cands[0].id);
      // Auto-load the most recent complete sweep so the section isn't empty.
      const mostRecent = (sweeps || []).find(s => s.status === 'complete');
      if (mostRecent) loadSweep(mostRecent.id);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const loadSweep = async (sweepId) => {
    setLoadingSweep(true);
    try {
      const full = await getSweepWithSignals(sweepId);
      setActiveSweep(full);
    } finally {
      setLoadingSweep(false);
    }
  };

  const handleRun = async () => {
    if (!selectedId) return;
    setRunning(true);
    setError(null);
    try {
      const r = await runSweep({
        clientId,
        competitorChannelId: selectedId,
        maxVideos,
        maxCommentsPerVideo: maxComments,
      });
      if (!r.ok) {
        setError(r.error || 'sweep failed');
      } else {
        const sweeps = await listSweeps(clientId, { limit: 10 });
        setHistory(sweeps || []);
        await loadSweep(r.sweepId);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleStatus = async (signalId, status, reason = null) => {
    const r = await updateSignalStatus(signalId, status, { reason });
    if (r.ok && activeSweep) {
      setActiveSweep({
        ...activeSweep,
        signals: activeSweep.signals.map(s =>
          s.id === signalId ? { ...s, status, reviewed_at: new Date().toISOString() } : s
        ),
      });
    }
  };

  return (
    <div style={sectionShellStyle}>
      <div style={sectionHeaderStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={kickerStyle}>Competitor comment sweep</div>
          <div style={subtitleStyle}>
            On-demand sweep of a competitor channel's recent comments. Heuristic-classified into
            questions and explicit content requests. Surfaced as <strong style={{ color: '#cde4d6' }}>Strategy Spine input candidates</strong> —
            the strategist judges what's worth merging into persona / pillars / concept seeds. Not
            auto-merged: participation inequality makes comments unreliable as audience-wide signal.
          </div>
        </div>
      </div>

      {/* Run controls */}
      {candidates.length === 0 ? (
        <Note tone="warn">
          No peer / aspirational / reference channels tagged for this client. Add cohort channels at <strong>Strategy → Cohort Roles</strong> first.
        </Note>
      ) : (
        <div style={runBarStyle}>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            disabled={running}
            style={selectStyle}
          >
            {candidates.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} · {ROLE_LABELS[c.cohort_role] || c.cohort_role}
              </option>
            ))}
          </select>
          <select
            value={maxVideos}
            onChange={e => setMaxVideos(Number(e.target.value))}
            disabled={running}
            style={selectSmallStyle}
            title="Videos to sample (most recent uploads)"
          >
            <option value={5}>5 videos</option>
            <option value={10}>10 videos</option>
            <option value={15}>15 videos</option>
            <option value={25}>25 videos</option>
          </select>
          <select
            value={maxComments}
            onChange={e => setMaxComments(Number(e.target.value))}
            disabled={running}
            style={selectSmallStyle}
            title="Comments per video (top relevance)"
          >
            <option value={20}>20 comments</option>
            <option value={50}>50 comments</option>
            <option value={100}>100 comments</option>
          </select>
          <button onClick={handleRun} disabled={running || !selectedId} style={runBtnStyle(running)}>
            {running
              ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Sweeping…</>
              : <><Sparkles size={13} /> Run sweep</>}
          </button>
        </div>
      )}

      {error && <Note tone="error">{error}</Note>}

      {/* Sweep history */}
      {history.length > 0 && (
        <SweepHistory
          history={history}
          activeId={activeSweep?.id}
          onSelect={loadSweep}
        />
      )}

      {/* Active sweep */}
      {loadingSweep ? (
        <Note tone="info">Loading sweep…</Note>
      ) : activeSweep ? (
        <SweepResults sweep={activeSweep} onStatus={handleStatus} />
      ) : !history.length && candidates.length > 0 && (
        <div style={emptyStyle}>
          <MessageCircle size={26} style={{ color: '#0A919B', marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: '#cde4d6', fontWeight: 600, marginBottom: 4 }}>
            No sweeps yet
          </div>
          <div style={{ fontSize: 12, color: '#888', maxWidth: 480, lineHeight: 1.5 }}>
            Pick a competitor channel and run a sweep. A typical sweep (10 videos × 50 comments)
            uses ~12 YouTube API quota units against a daily 10,000-unit budget.
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Sweep history
// ──────────────────────────────────────────────────

function SweepHistory({ history, activeId, onSelect }) {
  return (
    <div style={historyBarStyle}>
      <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        Recent sweeps
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {history.map(s => {
          const tone = s.status === 'complete' ? '#3fa66a' : s.status === 'error' ? '#ef6b6b' : '#E8A82B';
          const isActive = s.id === activeId;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={historyChipStyle(isActive, tone)}
              title={s.status_message || s.status}
            >
              <div style={{ fontWeight: 600, color: isActive ? '#cde4d6' : '#aaa' }}>
                {s.competitor_name || s.competitor_youtube_id?.slice(0, 8)}
              </div>
              <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>
                {s.status === 'complete' && (
                  <>{s.signals_extracted || 0} signals · {new Date(s.created_at).toLocaleDateString()}</>
                )}
                {s.status === 'error' && <span style={{ color: '#ef6b6b' }}>error</span>}
                {s.status !== 'complete' && s.status !== 'error' && s.status}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Sweep results — grouped by signal type
// ──────────────────────────────────────────────────

function SweepResults({ sweep, onStatus }) {
  const signals = sweep.signals || [];
  const questions = signals.filter(s => s.signal_type === 'question');
  const requests  = signals.filter(s => s.signal_type === 'content_request');

  if (sweep.status === 'error') {
    return <Note tone="error">Sweep failed: {sweep.status_message || 'unknown'}</Note>;
  }

  return (
    <div style={resultsShellStyle}>
      <div style={resultsHeaderStyle}>
        <div>
          <strong style={{ color: '#cde4d6', fontSize: 13 }}>{sweep.competitor_name || 'Competitor'}</strong>
          <span style={{ fontSize: 11, color: '#666', marginLeft: 8 }}>
            · {sweep.videos_sampled} videos · {sweep.comments_fetched} comments · {sweep.signals_extracted} actionable signals
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#666' }}>
          {new Date(sweep.created_at).toLocaleString()}
        </div>
      </div>

      {sweep.comments_fetched === 0 && (
        <Note tone="warn">
          No comments fetched. The channel may have comments disabled, no recent uploads, or be filtering out top-relevance results.
        </Note>
      )}

      {requests.length > 0 && (
        <SignalGroup
          title="Content requests"
          subtitle={`${requests.length} explicit "make a video about X" / "would love to see Y" patterns. Highest-leverage signal type — even one is a content gap worth scoring.`}
          icon={Megaphone}
          color="#a78bfa"
          signals={requests}
          onStatus={onStatus}
        />
      )}

      {questions.length > 0 && (
        <SignalGroup
          title="Questions"
          subtitle={`${questions.length} question-shaped comments. Recurring questions across multiple commenters indicate a content gap; one-off curiosity is lower-signal.`}
          icon={HelpCircle}
          color="#0A919B"
          signals={questions}
          onStatus={onStatus}
        />
      )}

      {questions.length === 0 && requests.length === 0 && sweep.comments_fetched > 0 && (
        <Note tone="info">
          0% actionable yield on {sweep.comments_fetched} comments — this competitor's audience isn't asking questions or requesting content in comments. Per the deep-research synthesis, this is itself a signal: try a different cohort tier (aspirational instead of peer, or peer instead of reference).
        </Note>
      )}
    </div>
  );
}

function SignalGroup({ title, subtitle, icon: Icon, color, signals, onStatus }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={groupShellStyle}>
      <button onClick={() => setExpanded(e => !e)} style={groupHeaderBtnStyle(color)}>
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Icon size={14} style={{ color }} />
        <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: '#888', flex: 1, textAlign: 'left', marginLeft: 4 }}>
          · {signals.length}
        </span>
      </button>
      {expanded && (
        <>
          <div style={{ fontSize: 11, color: '#888', padding: '0 14px 8px', lineHeight: 1.5 }}>
            {subtitle}
          </div>
          <div style={signalListStyle}>
            {signals.map(s => (
              <SignalCard key={s.id} signal={s} onStatus={onStatus} accent={color} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SignalCard({ signal, onStatus, accent }) {
  const dismissed = signal.status === 'dismissed';
  const merged    = signal.status === 'merged_to_spine';
  const starred   = signal.status === 'starred';
  const reviewed  = dismissed || merged || starred;

  return (
    <div style={signalCardStyle(reviewed, accent)}>
      <div style={signalTextStyle(dismissed)}>"{signal.comment_text}"</div>
      <div style={signalMetaStyle}>
        <span style={{ color: '#888' }}>{signal.author || 'anonymous'}</span>
        {signal.like_count > 0 && (
          <span style={{ color: '#666' }}>· {signal.like_count} like{signal.like_count === 1 ? '' : 's'}</span>
        )}
        <span style={{ color: '#666' }}>· on{' '}
          <a
            href={`https://youtube.com/watch?v=${signal.source_video_youtube_id}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#0A919B', textDecoration: 'none' }}
            title={signal.source_video_title || 'View source video'}
          >
            {(signal.source_video_title || signal.source_video_youtube_id).slice(0, 60)}
            {(signal.source_video_title || '').length > 60 ? '…' : ''}
            <ExternalLink size={9} style={{ marginLeft: 3, verticalAlign: 'middle' }} />
          </a>
        </span>
        {reviewed && (
          <span style={statusBadgeStyle(signal.status)}>
            {merged && <><Check size={9} /> Merged to Spine inputs</>}
            {starred && <><Star size={9} /> Starred</>}
            {dismissed && <>Dismissed</>}
          </span>
        )}
      </div>
      {!reviewed && (
        <div style={signalActionsStyle}>
          <button onClick={() => onStatus(signal.id, 'merged_to_spine')} style={actionBtnStyle('#3fa66a')}>
            <Check size={11} /> Use as Spine input
          </button>
          <button onClick={() => onStatus(signal.id, 'starred')} style={actionBtnStyle('#E8A82B')}>
            <Star size={11} /> Star
          </button>
          <button onClick={() => onStatus(signal.id, 'dismissed')} style={actionBtnGhostStyle}>
            <XIcon size={11} /> Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

function Note({ tone, children }) {
  const palette = {
    info:  { bg: 'rgba(10,145,155,0.08)',  border: 'rgba(10,145,155,0.25)',  fg: '#0A919B' },
    warn:  { bg: 'rgba(232,168,43,0.08)',  border: 'rgba(232,168,43,0.30)',  fg: '#E8A82B' },
    error: { bg: 'rgba(239,107,107,0.08)', border: 'rgba(239,107,107,0.30)', fg: '#ef6b6b' },
  }[tone] || { bg: '#1a1a1f', border: '#333', fg: '#aaa' };
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6,
      background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg,
      fontSize: 13, margin: '10px 0',
    }}>{children}</div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const sectionShellStyle = { marginTop: 24 };
const sectionHeaderStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
  marginBottom: 12, flexWrap: 'wrap',
};
const kickerStyle = {
  fontSize: 12, color: '#0A919B', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
};
const subtitleStyle = { fontSize: 12, color: '#888', maxWidth: 720, lineHeight: 1.5 };

const runBarStyle = {
  display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap',
};
const selectStyle = {
  background: '#1a1a1f', color: '#cde4d6',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '7px 10px', fontSize: 12, cursor: 'pointer',
  minWidth: 220,
};
const selectSmallStyle = {
  ...({
    background: '#1a1a1f', color: '#cde4d6',
    border: '1px solid #2a2a30', borderRadius: 5,
    padding: '7px 10px', fontSize: 12, cursor: 'pointer',
  }),
};
const runBtnStyle = (busy) => ({
  background: busy ? '#1a1a1f' : '#0A919B',
  color: busy ? '#666' : '#0a0a0e',
  border: busy ? '1px solid #2a2a30' : 'none',
  borderRadius: 5,
  padding: '8px 16px',
  fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
  cursor: busy ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
});

const historyBarStyle = {
  marginBottom: 12, padding: 10,
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 6,
};
const historyChipStyle = (active, tone) => ({
  background: active ? `${tone}22` : 'transparent',
  border: `1px solid ${active ? tone : '#2a2a30'}`,
  borderRadius: 5,
  padding: '6px 10px',
  cursor: 'pointer',
  textAlign: 'left',
  minWidth: 140,
  flexShrink: 0,
  fontSize: 11,
});

const resultsShellStyle = {
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 6, padding: 12,
};
const resultsHeaderStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  marginBottom: 12, flexWrap: 'wrap', gap: 6,
};

const groupShellStyle = {
  background: '#0a0a0e',
  border: '1px solid #2a2a30',
  borderRadius: 6,
  marginBottom: 10,
};
const groupHeaderBtnStyle = (color) => ({
  background: 'transparent',
  border: 'none',
  width: '100%',
  padding: '10px 14px',
  display: 'flex', alignItems: 'center', gap: 8,
  cursor: 'pointer',
  borderLeft: `2px solid ${color}`,
  borderRadius: '6px 6px 0 0',
});

const signalListStyle = {
  display: 'flex', flexDirection: 'column', gap: 6,
  padding: '4px 14px 14px',
};
const signalCardStyle = (reviewed, accent) => ({
  background: reviewed ? '#0e0e11' : '#1a1a1f',
  border: '1px solid #2a2a30',
  borderLeft: `2px solid ${reviewed ? '#2a2a30' : `${accent}88`}`,
  borderRadius: 4, padding: 10,
  opacity: reviewed ? 0.7 : 1,
});
const signalTextStyle = (dismissed) => ({
  fontSize: 13, color: '#e8e2d0', lineHeight: 1.55, marginBottom: 6,
  textDecoration: dismissed ? 'line-through' : 'none',
});
const signalMetaStyle = {
  fontSize: 11, color: '#888',
  display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
};
const signalActionsStyle = {
  display: 'flex', gap: 6, justifyContent: 'flex-end',
  marginTop: 8, paddingTop: 8, borderTop: '1px dashed #2a2a30',
};
const actionBtnStyle = (color) => ({
  background: `${color}22`,
  color, border: `1px solid ${color}55`,
  borderRadius: 4, padding: '4px 10px',
  fontSize: 11, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
});
const actionBtnGhostStyle = {
  background: 'transparent', color: '#888',
  border: '1px solid #2a2a30', borderRadius: 4,
  padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
const statusBadgeStyle = (status) => ({
  marginLeft: 'auto',
  background: status === 'merged_to_spine' ? 'rgba(63,166,106,0.15)'
            : status === 'starred'         ? 'rgba(232,168,43,0.15)'
            : 'rgba(128,128,128,0.10)',
  color: status === 'merged_to_spine' ? '#3fa66a'
       : status === 'starred'         ? '#E8A82B'
       : '#888',
  border: status === 'merged_to_spine' ? '1px solid rgba(63,166,106,0.40)'
        : status === 'starred'         ? '1px solid rgba(232,168,43,0.40)'
        : '1px solid #2a2a30',
  borderRadius: 3, padding: '1px 7px',
  fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
  display: 'inline-flex', alignItems: 'center', gap: 3,
});

const emptyStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  padding: 28, background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 6,
};
