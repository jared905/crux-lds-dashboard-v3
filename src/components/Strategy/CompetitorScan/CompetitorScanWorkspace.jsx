/**
 * CompetitorScanWorkspace — Strategy / Competitor Scan tab.
 *
 * Runs a scan of the client's competitor cohort's recent uploads,
 * filters to notable (signal_multiplier >= channel_avg), then scores
 * each AS IF THE CLIENT MADE IT through the Pre-flight scorer.
 * Surfaces findings ranked by adaptability_score.
 *
 * Mental model:
 *   CompetitorPulse (Research)     → "what just popped"
 *   CompetitorScan  (Strategy)     → "of what just popped, what should
 *                                     WE consider adapting — and what
 *                                     would our scorer say if we did?"
 *
 * Load path on mount:
 *   1. loadDeliverableData(clientId)  → cohortContext
 *   2. loadTopicAuthorityContext()    → embeddings for topic_authority
 *   3. listScansForClient()           → prior scan runs
 *
 * Run path:
 *   1. runCompetitorScan() with onProgress
 *   2. saveScan() persists the run
 *   3. setSelectedScan(result) shows just-completed scan inline
 */

import React, { useEffect, useState, useMemo } from 'react';
import { loadDeliverableData } from '../../../services/clientDeliverableService.js';
import { loadTopicAuthorityContext } from '../../../services/topicAuthorityService.js';
import { runCompetitorScan } from '../../../services/competitorScanService.js';
import {
  saveScan, listScansForClient, loadScan, archiveScan,
} from '../../../services/competitorScansService.js';
import DataFreshnessBadge from '../shared/DataFreshnessBadge.jsx';

const TIER_LABELS = {
  very_likely_outperform: 'Very likely outperform',
  likely_solid:           'Likely solid',
  risky:                  'Risky',
  predicted_under:        'Predicted under',
};
const TIER_COLORS = {
  very_likely_outperform: '#3fa66a',
  likely_solid:           '#8fbf6c',
  risky:                  '#E8A82B',
  predicted_under:        '#cf6b6b',
};

const FORMAT_FILTERS = [
  { value: null,        label: 'All formats'   },
  { value: 'shorts',    label: 'Shorts only'   },
  { value: 'long_form', label: 'Long-form only' },
];

const WINDOW_OPTIONS = [
  { value: 7,  label: 'Last 7 days'  },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
];

const SIGNAL_OPTIONS = [
  { value: 1.5, label: '1.5× channel avg' },
  { value: 2.0, label: '2× channel avg'   },
  { value: 3.0, label: '3× channel avg'   },
];

// sessionStorage key used as a one-shot bridge to PreflightPanel —
// scan finding writes the prefill, navigates to pre-flight, panel reads
// and clears it on mount. Avoids leaking shared state across tabs.
const PREFLIGHT_PREFILL_KEY = 'preflight_prefill_v1';

export default function CompetitorScanWorkspace({ activeClient, onNavigate }) {
  const clientId = activeClient?.id;

  const [cohortContext, setCohortContext]             = useState(null);
  const [cohortError, setCohortError]                 = useState(null);
  const [topicAuthorityContext, setTopicAuthorityCtx] = useState(null);
  const [scansList, setScansList]                     = useState([]);
  const [selectedScan, setSelectedScan]               = useState(null);
  const [running, setRunning]                         = useState(false);
  const [progress, setProgress]                       = useState({ phase: null, scanned: 0, total: 0 });
  const [runError, setRunError]                       = useState(null);
  const [bootLoading, setBootLoading]                 = useState(true);

  const [windowDays,       setWindowDays]       = useState(14);
  const [formatFilter,     setFormatFilter]     = useState(null);
  const [signalMultiplier, setSignalMultiplier] = useState(2.0);

  // Bootstrap — hooks before any early return.
  useEffect(() => {
    if (!clientId) { setBootLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setBootLoading(true);
      setCohortError(null);
      try {
        const [deliverable, topicCtx, list] = await Promise.all([
          loadDeliverableData(clientId),
          loadTopicAuthorityContext({ clientId }).catch(() => null),
          listScansForClient(clientId, { limit: 10 }),
        ]);
        if (cancelled) return;
        if (!deliverable?.ok) {
          setCohortError(deliverable?.error || 'Failed to load cohort data');
        } else if (!deliverable.patternsResult || !deliverable.whiteSpaceResult) {
          setCohortError('Cohort audit data is missing — run the audit first');
        } else {
          setCohortContext({
            patternsResult:   deliverable.patternsResult,
            whiteSpaceResult: deliverable.whiteSpaceResult,
            spine:            deliverable.spine || null,
            coverage:         deliverable.coverage,
          });
        }
        setTopicAuthorityCtx(topicCtx);
        setScansList(list?.scans || []);
      } catch (err) {
        if (!cancelled) setCohortError(err?.message || 'unknown error during bootstrap');
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (!clientId) {
    return (
      <div style={emptyShellStyle}>
        <div style={emptyHeaderStyle}>Competitor concept scan</div>
        <div style={emptyBodyStyle}>
          Pick a client from <strong style={{ color: '#cde4d6' }}>Operate → Clients</strong> first.
          The competitor scan reads the client's cohort and scores recent peer uploads as-if-the-
          client-made-them, so it needs a specific channel context to run against.
        </div>
      </div>
    );
  }

  const handleRun = async () => {
    if (!cohortContext) { setRunError('Cohort context not loaded'); return; }
    setRunning(true);
    setRunError(null);
    setProgress({ phase: 'starting', scanned: 0, total: 0 });
    try {
      const result = await runCompetitorScan({
        clientId,
        cohortContext,
        topicAuthorityContext,
        windowDays,
        formatFilter,
        signalMultiplier,
        onProgress: (p) => setProgress(p),
      });
      if (!result.ok) {
        setRunError(result.error || 'Scan failed');
        return;
      }
      const saved = await saveScan({
        clientId,
        mode: 'deterministic',
        windowDays,
        formatFilter,
        signalMultiplier,
        competitorChannelsScanned: result.channelsScanned,
        videosEvaluated:           result.videosEvaluated,
        findings:                  result.findings,
        cohortDataAt:              cohortContext.coverage?.generatedAt || new Date().toISOString(),
      });
      const list = await listScansForClient(clientId, { limit: 10 });
      setScansList(list?.scans || []);
      setSelectedScan({
        id: saved?.id || null,
        created_at: saved?.createdAt || new Date().toISOString(),
        window_days: windowDays,
        format_filter: formatFilter,
        signal_multiplier: signalMultiplier,
        competitor_channels_scanned: result.channelsScanned,
        videos_evaluated: result.videosEvaluated,
        findings_count: result.findings.length,
        findings: result.findings,
      });
    } catch (err) {
      setRunError(err?.message || 'unknown error');
    } finally {
      setRunning(false);
    }
  };

  const handleLoad = async (scanId) => {
    const res = await loadScan(scanId);
    if (res.ok) setSelectedScan(res.scan);
  };

  const handleArchive = async (scanId) => {
    if (!window.confirm('Archive this scan?')) return;
    await archiveScan(scanId);
    const list = await listScansForClient(clientId, { limit: 10 });
    setScansList(list?.scans || []);
    if (selectedScan?.id === scanId) setSelectedScan(null);
  };

  // Score-in-Pre-flight handoff. Writes the competitor video's title +
  // format + length to sessionStorage, then navigates to the Pre-flight
  // tab. PreflightPanel reads + clears the key on mount, pre-filling
  // the form so the strategist can iterate from there. The notes field
  // captures provenance so the scorecard, once saved, remembers where
  // it came from.
  const handleScoreInPreflight = (finding) => {
    if (!onNavigate) return;
    const v = finding?.competitor_video;
    if (!v) return;
    const isShorts = v.format === 'shorts';
    const prefill = {
      title:          v.title || '',
      format:         v.format || 'long_form',
      length_seconds: isShorts ? null : (v.duration_seconds || null),
      notes:          `Adapted from competitor: ${v.channel?.name || 'unknown'} — "${v.title}" (${formatViews(v.view_count)} views, ${finding?.signal?.multiplier}× channel avg)`,
    };
    try {
      sessionStorage.setItem(PREFLIGHT_PREFILL_KEY, JSON.stringify(prefill));
    } catch (err) {
      console.warn('[competitorScan] prefill write failed:', err);
    }
    onNavigate('pre-flight');
  };

  return (
    <div style={workspaceShellStyle}>
      <div style={workspaceHeaderStyle}>
        <div style={kickerStyle}>Strategy · Competitor scan</div>
        <h1 style={titleStyle}>{activeClient.name}</h1>
        <div style={subtitleStyle}>
          Scan recent uploads from the competitor cohort, score each as-if-the-client-made-it
          through the Pre-flight scorer, and rank by adaptability — the composite of peer
          early-performance signal, the as-if-client tier, and topic-authority similarity
          to the client's catalog.
        </div>
        <div style={{ marginTop: 10 }}>
          <DataFreshnessBadge clientId={clientId} />
        </div>
      </div>

      {bootLoading && <Note tone="info">Loading cohort + embeddings…</Note>}
      {cohortError && <Note tone="error">{cohortError}</Note>}

      {!bootLoading && cohortContext && (
        <>
          <RunBar
            running={running}
            progress={progress}
            windowDays={windowDays}
            onWindowChange={setWindowDays}
            formatFilter={formatFilter}
            onFormatChange={setFormatFilter}
            signalMultiplier={signalMultiplier}
            onSignalChange={setSignalMultiplier}
            embeddingsLoaded={!!topicAuthorityContext}
            onRun={handleRun}
          />
          {runError && <Note tone="error">{runError}</Note>}

          <SavedScansList
            scans={scansList}
            selectedId={selectedScan?.id}
            onLoad={handleLoad}
            onArchive={handleArchive}
          />

          {selectedScan && (
            <ScanDetail scan={selectedScan} onScoreInPreflight={handleScoreInPreflight} />
          )}
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Run bar
// ──────────────────────────────────────────────────

function RunBar({
  running, progress,
  windowDays, onWindowChange,
  formatFilter, onFormatChange,
  signalMultiplier, onSignalChange,
  embeddingsLoaded,
  onRun,
}) {
  const phaseLabel = (() => {
    if (!running) return null;
    if (progress.phase === 'resolving_competitors') return 'Resolving competitor channels…';
    if (progress.phase === 'pulling_videos') return `Pulling recent uploads (${progress.scanned}/${progress.total} channels)…`;
    if (progress.phase === 'scoring')        return `Scoring as-if-client (${progress.scanned}/${progress.total})…`;
    return 'Starting…';
  })();

  return (
    <div style={runBarStyle}>
      <div style={{ flex: 1 }}>
        <div style={runBarLineStyle}>
          <span style={runBarLabelStyle}>Embeddings:</span>{' '}
          {embeddingsLoaded
            ? <span style={{ color: '#cde4d6' }}>loaded · topic-authority active</span>
            : <span style={{ color: '#E8A82B' }}>not loaded · topic match self-excludes</span>}
        </div>
        {phaseLabel && <div style={progressLineStyle}>{phaseLabel}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={windowDays} onChange={e => onWindowChange(Number(e.target.value))} disabled={running} style={selectStyle}>
          {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={formatFilter || ''} onChange={e => onFormatChange(e.target.value || null)} disabled={running} style={selectStyle}>
          {FORMAT_FILTERS.map(f => <option key={f.label} value={f.value || ''}>{f.label}</option>)}
        </select>
        <select value={signalMultiplier} onChange={e => onSignalChange(Number(e.target.value))} disabled={running} style={selectStyle}>
          {SIGNAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={onRun} disabled={running} style={runBtnStyle(running)}>
          {running ? 'Scanning…' : 'Run scan'}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Saved scans list
// ──────────────────────────────────────────────────

function SavedScansList({ scans, selectedId, onLoad, onArchive }) {
  if (!scans || scans.length === 0) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={kickerSmallStyle}>Saved scans</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {scans.map(s => (
          <div key={s.id} style={listRowStyle(s.id === selectedId)}>
            <div style={{ flex: 1 }}>
              <div style={listRowDateStyle}>
                {new Date(s.created_at).toLocaleString()}
                <span style={listRowMetaStyle}>
                  {' · '}window {s.window_days}d · {s.findings_count} findings
                  {' · '}{s.competitor_channels_scanned} channels
                  {s.format_filter ? ` · ${s.format_filter}` : ''}
                  {' · '}{s.signal_multiplier}× signal
                </span>
              </div>
            </div>
            <button onClick={() => onLoad(s.id)} style={smallBtnStyle}>load</button>
            <button onClick={() => onArchive(s.id)} style={smallBtnStyle}>archive</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Scan detail
// ──────────────────────────────────────────────────

function ScanDetail({ scan, onScoreInPreflight }) {
  const tierCounts = useMemo(() => countTiers(scan.findings || []), [scan]);
  return (
    <div style={detailShellStyle}>
      <div style={detailHeaderStyle}>
        <div>
          <div style={kickerStyle}>Scan · {new Date(scan.created_at).toLocaleString()}</div>
          <div style={detailMetaStyle}>
            {scan.findings?.length || 0} findings
            {' · '}{scan.competitor_channels_scanned} competitor channels
            {' · '}{scan.videos_evaluated} videos evaluated
            {' · '}{scan.window_days}-day window
            {scan.format_filter ? ` · ${scan.format_filter}` : ''}
          </div>
          {tierCounts && (
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              As-if-client tiers:{' '}
              {Object.entries(tierCounts).map(([tier, n], i) => (
                <span key={tier} style={{ marginRight: 10 }}>
                  <span style={{ color: TIER_COLORS[tier] || '#888', fontWeight: 700 }}>{n}</span>{' '}
                  {TIER_LABELS[tier] || tier}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {(!scan.findings || scan.findings.length === 0) ? (
        <div style={{ fontSize: 13, color: '#888', padding: '20px 0' }}>
          No findings — no competitor videos in this window cleared the {scan.signal_multiplier}×
          signal threshold. Lower the threshold, expand the window, or backfill recent competitor
          videos.
        </div>
      ) : (
        <FindingsList findings={scan.findings} onScoreInPreflight={onScoreInPreflight} />
      )}
    </div>
  );
}

function FindingsList({ findings, onScoreInPreflight }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
      {findings.map((f, i) => (
        <FindingCard
          key={`${f.competitor_video?.youtube_video_id || i}`}
          finding={f}
          rank={i + 1}
          onScoreInPreflight={onScoreInPreflight}
        />
      ))}
    </div>
  );
}

function FindingCard({ finding, rank, onScoreInPreflight }) {
  const v = finding.competitor_video || {};
  const tier = finding.as_if_client_score?.composite_tier;
  const tierColor = TIER_COLORS[tier] || '#888';
  return (
    <div style={findingCardStyle}>
      <div style={findingHeaderStyle}>
        <div style={rankBadgeStyle}>#{rank}</div>
        {v.thumbnail_url && (
          <img src={v.thumbnail_url} alt="" style={thumbStyle} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={findingTitleStyle}>{v.title}</div>
          <div style={findingMetaRowStyle}>
            <span style={{ color: '#cde4d6', fontWeight: 600 }}>{v.channel?.name || 'Unknown channel'}</span>
            <span style={metaDotStyle} />
            <span>{formatViews(v.view_count)} views</span>
            <span style={metaDotStyle} />
            <span>{v.format}</span>
            {v.published_at && (
              <>
                <span style={metaDotStyle} />
                <span>{daysAgo(v.published_at)}</span>
              </>
            )}
          </div>
        </div>
        <div style={adaptabilityBlockStyle}>
          <div style={adaptabilityScoreStyle}>{finding.adaptability_score}</div>
          <div style={adaptabilityLabelStyle}>adaptability</div>
        </div>
      </div>

      <div style={findingBodyStyle}>
        <div style={signalChipStyle}>
          <span style={{ color: '#E8A82B', fontWeight: 700 }}>{finding.signal.multiplier}×</span>{' '}
          their channel avg ({formatViews(finding.signal.channel_avg)})
        </div>
        <div style={tierChipStyle(tierColor)}>
          As-if-client: {TIER_LABELS[tier] || tier}
        </div>
        {finding.topic_authority_similarity != null && (
          <div style={similarityChipStyle}>
            Topic similarity {(finding.topic_authority_similarity * 100).toFixed(0)}%
          </div>
        )}
      </div>

      {finding.as_if_client_score?.composite_rationale && (
        <div style={rationaleStyle}>
          {finding.as_if_client_score.composite_rationale}
        </div>
      )}

      {onScoreInPreflight && (
        <div style={findingActionsStyle}>
          <button
            onClick={() => onScoreInPreflight(finding)}
            style={scoreInPreflightBtnStyle}
            title="Open the Pre-flight scorecard with this title, format, and length pre-filled — iterate from there"
          >
            Score in Pre-flight →
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

function countTiers(findings) {
  const counts = { very_likely_outperform: 0, likely_solid: 0, risky: 0, predicted_under: 0 };
  for (const f of findings) {
    const t = f.as_if_client_score?.composite_tier;
    if (counts[t] != null) counts[t]++;
  }
  return counts;
}

function formatViews(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function daysAgo(iso) {
  const d = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (d === 0) return 'today';
  if (d === 1) return '1 day ago';
  return `${d} days ago`;
}

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
      fontSize: 13, margin: '14px 0',
    }}>{children}</div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const workspaceShellStyle = { padding: '20px 24px 60px', maxWidth: 1280, margin: '0 auto' };
const workspaceHeaderStyle = { marginBottom: 18 };
const kickerStyle = {
  fontSize: 11, color: '#0A919B',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 4,
};
const kickerSmallStyle = {
  fontSize: 10, color: '#888',
  textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6,
};
const titleStyle = { fontSize: 24, fontWeight: 700, color: '#e8e2d0', margin: 0 };
const subtitleStyle = { fontSize: 13, color: '#888', marginTop: 6, lineHeight: 1.5, maxWidth: 760 };

const emptyShellStyle = { padding: '60px 24px', maxWidth: 720, margin: '0 auto', textAlign: 'center' };
const emptyHeaderStyle = {
  fontSize: 14, color: '#0A919B',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 14,
};
const emptyBodyStyle = { fontSize: 14, color: '#888', lineHeight: 1.6 };

const runBarStyle = {
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderLeft: '2px solid #0A919B',
  borderRadius: 6, padding: 14,
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
  marginTop: 14,
};
const runBarLineStyle = { fontSize: 12, color: '#cde4d6', marginBottom: 2 };
const runBarLabelStyle = { color: '#888', fontWeight: 600 };
const progressLineStyle = { fontSize: 12, color: '#E8A82B', marginTop: 4 };

const selectStyle = {
  background: '#1a1a1f', color: '#cde4d6',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '6px 10px', fontSize: 12, cursor: 'pointer',
};
const runBtnStyle = (running) => ({
  background: running ? '#1a1a1f' : '#0A919B',
  color: running ? '#666' : '#0a0a0e',
  border: running ? '1px solid #2a2a30' : 'none',
  padding: '8px 16px', borderRadius: 5,
  fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
  cursor: running ? 'not-allowed' : 'pointer',
});

const listRowStyle = (selected) => ({
  display: 'flex', alignItems: 'center', gap: 10,
  background: selected ? 'rgba(10,145,155,0.10)' : '#0e0e11',
  border: `1px solid ${selected ? 'rgba(10,145,155,0.40)' : '#2a2a30'}`,
  borderRadius: 5, padding: 10,
});
const listRowDateStyle = { fontSize: 12, fontWeight: 600, color: '#cde4d6' };
const listRowMetaStyle = { color: '#888', fontWeight: 400 };
const smallBtnStyle = {
  background: '#1a1a1f', color: '#888',
  border: '1px solid #2a2a30', borderRadius: 4,
  padding: '4px 10px', fontSize: 11, cursor: 'pointer',
};

const detailShellStyle = {
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 6, padding: 20, marginTop: 18,
};
const detailHeaderStyle = {
  borderBottom: '1px solid #2a2a30', paddingBottom: 12, marginBottom: 12,
};
const detailMetaStyle = { fontSize: 12, color: '#888' };

const findingCardStyle = {
  background: '#1a1a1f',
  border: '1px solid #2a2a30',
  borderRadius: 6, padding: 14,
};
const findingHeaderStyle = {
  display: 'flex', alignItems: 'flex-start', gap: 12,
};
const rankBadgeStyle = {
  background: '#0A919B', color: '#0a0a0e',
  fontSize: 11, fontWeight: 700,
  padding: '4px 8px', borderRadius: 4,
  flexShrink: 0,
};
const thumbStyle = {
  width: 96, height: 54,
  objectFit: 'cover', borderRadius: 4,
  background: '#0a0a0e',
  flexShrink: 0,
};
const findingTitleStyle = {
  fontSize: 14, fontWeight: 600, color: '#e8e2d0',
  marginBottom: 4,
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
};
const findingMetaRowStyle = {
  fontSize: 11, color: '#888',
  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
};
const metaDotStyle = {
  display: 'inline-block', width: 3, height: 3, borderRadius: '50%', background: '#444',
};

const adaptabilityBlockStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  background: '#0e0e11',
  border: '1px solid rgba(10,145,155,0.30)',
  borderRadius: 5,
  padding: '6px 12px',
  flexShrink: 0,
};
const adaptabilityScoreStyle = {
  fontSize: 20, fontWeight: 700, color: '#0A919B', lineHeight: 1,
};
const adaptabilityLabelStyle = {
  fontSize: 9, color: '#666',
  textTransform: 'uppercase', letterSpacing: 0.5,
  marginTop: 2,
};

const findingBodyStyle = {
  display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10,
};
const signalChipStyle = {
  background: 'rgba(232,168,43,0.10)',
  border: '1px solid rgba(232,168,43,0.35)',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11, color: '#cde4d6',
};
const similarityChipStyle = {
  background: 'rgba(10,145,155,0.10)',
  border: '1px solid rgba(10,145,155,0.35)',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11, color: '#cde4d6',
};
const tierChipStyle = (color) => ({
  background: `${color}22`,
  color,
  border: `1px solid ${color}55`,
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.3,
});
const rationaleStyle = {
  fontSize: 12, color: '#aaa', fontStyle: 'italic',
  marginTop: 8, lineHeight: 1.4,
  paddingTop: 8, borderTop: '1px dashed #2a2a30',
};

const findingActionsStyle = {
  display: 'flex', justifyContent: 'flex-end',
  marginTop: 10,
};
const scoreInPreflightBtnStyle = {
  background: 'rgba(10,145,155,0.10)',
  color: '#0A919B',
  border: '1px solid rgba(10,145,155,0.40)',
  borderRadius: 4,
  padding: '6px 14px',
  fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
  cursor: 'pointer',
  textTransform: 'uppercase',
};
