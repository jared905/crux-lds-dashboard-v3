/**
 * CalibrationWorkspace — Strategy / Calibration tab.
 *
 * Closes the prediction-machine feedback loop. Loads the client's
 * repositioning audits (each containing predicted-tier-per-dimension
 * for every video), lets the strategist pick one as the source, and
 * computes calibration — per-dimension confusion matrices + accuracy
 * + high-traffic mismatches.
 *
 * Phase A baseline strategy: percentile_rank (view-rank quartile inside
 * the channel). Future Phase B will add pluggable pipeline strategies
 * (consultations, demos, donations) for clients with outcome data — the
 * UI's strategy picker already accepts the parameter so adding strategies
 * is a service + option change, not a UI rewrite.
 *
 * Mental model:
 *   Pre-flight         → "should we make this concept?"
 *   Repositioning      → "what's broken in our catalog?"
 *   Competitor scan    → "what should we adapt?"
 *   Calibration        → "is the scorer telling us the truth?"
 *
 * The calibration answers the meta-question: which scorer dimensions
 * are this client's strongest signal, and which should be treated as
 * a hypothesis. That's the defensibility layer.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../../services/supabaseClient.js';
import { computeCalibration, CALIBRATION_TIERS, CALIBRATION_DIMENSION_KEYS } from '../../../services/calibrationService.js';
import {
  saveCalibrationRun, listCalibrationRunsForClient, loadCalibrationRun, archiveCalibrationRun,
} from '../../../services/calibrationRunsService.js';

const TIER_LABELS = {
  very_likely_outperform: 'Very likely',
  likely_solid:           'Likely solid',
  risky:                  'Risky',
  predicted_under:        'Pred. under',
};
const TIER_COLORS = {
  very_likely_outperform: '#3fa66a',
  likely_solid:           '#8fbf6c',
  risky:                  '#E8A82B',
  predicted_under:        '#cf6b6b',
};
const DIMENSION_LABELS = {
  title_patterns:  'Title patterns',
  slot:            'Slot (day × hour)',
  length:          'Length',
  topic_authority: 'Topic authority',
};

export default function CalibrationWorkspace({ activeClient }) {
  const clientId = activeClient?.id;

  const [bootLoading, setBootLoading]       = useState(true);
  const [bootError, setBootError]           = useState(null);
  const [audits, setAudits]                 = useState([]);
  const [selectedAuditId, setSelectedAuditId] = useState(null);
  const [runsList, setRunsList]             = useState([]);
  const [selectedRun, setSelectedRun]       = useState(null);
  const [running, setRunning]               = useState(false);
  const [runError, setRunError]             = useState(null);
  // Migration 094 — split-by-format toggle. Defaults ON because the
  // Kendall test (2026-06-05) showed pooled metrics hide format-specific
  // scorer failure modes. Strategist can opt out by unchecking.
  const [splitByFormat, setSplitByFormat]   = useState(true);
  // Detail view mode — 'pooled' | 'shorts' | 'long_form'. Only used
  // when the loaded run has per_format_metrics; otherwise UI falls back
  // to pooled-only.
  const [viewMode, setViewMode]             = useState('pooled');

  // Bootstrap — hooks before any early return.
  useEffect(() => {
    if (!clientId) { setBootLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setBootLoading(true);
      setBootError(null);
      try {
        const [auditList, runList] = await Promise.all([
          listRepositioningAuditsLight(clientId),
          listCalibrationRunsForClient(clientId, { limit: 10 }),
        ]);
        if (cancelled) return;
        setAudits(auditList);
        if (auditList.length && !selectedAuditId) setSelectedAuditId(auditList[0].id);
        setRunsList(runList?.runs || []);
      } catch (err) {
        if (!cancelled) setBootError(err?.message || 'unknown error during bootstrap');
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (!clientId) {
    return (
      <div style={emptyShellStyle}>
        <div style={emptyHeaderStyle}>Calibration</div>
        <div style={emptyBodyStyle}>
          Pick a client from <strong style={{ color: '#cde4d6' }}>Operate → Clients</strong> first.
          Calibration compares the scorer's predictions against observed outcomes for a specific
          channel, so it needs a client context.
        </div>
      </div>
    );
  }

  const handleRun = async () => {
    if (!selectedAuditId) { setRunError('Pick a repositioning audit to calibrate against'); return; }
    setRunning(true);
    setRunError(null);
    try {
      // Load the full audit (video_scores can be large; only fetch on demand).
      const { data: audit, error } = await supabase
        .from('client_repositioning_audits')
        .select('id, video_scores, created_at, format_filter, videos_scored')
        .eq('id', selectedAuditId)
        .single();
      if (error) { setRunError(`Audit load failed: ${error.message}`); return; }
      if (!audit?.video_scores?.length) { setRunError('Selected audit has no video_scores'); return; }

      const result = computeCalibration({ audit, baselineStrategy: 'percentile_rank', splitByFormat });
      if (result.error) { setRunError(result.error); return; }

      const saved = await saveCalibrationRun({
        clientId,
        sourceAuditId:              audit.id,
        baselineStrategy:           result.baselineStrategy,
        videosCalibrated:           result.videosCalibrated,
        compositeAccuracy:          result.compositeAccuracy,
        compositeAdjacentAccuracy:  result.compositeAdjacentAccuracy,
        compositeMetrics:           result.compositeMetrics,
        perDimensionMetrics:        result.perDimensionMetrics,
        mismatchedVideos:           result.mismatchedVideos,
        perFormatMetrics:           result.perFormatMetrics,
        formatSplitEnabled:         result.formatSplitEnabled,
      });

      const refreshed = await listCalibrationRunsForClient(clientId, { limit: 10 });
      setRunsList(refreshed?.runs || []);
      setSelectedRun({
        id:                         saved?.id || null,
        source_audit_id:            audit.id,
        created_at:                 saved?.createdAt || new Date().toISOString(),
        baseline_strategy:          result.baselineStrategy,
        videos_calibrated:          result.videosCalibrated,
        composite_accuracy:         result.compositeAccuracy,
        composite_adjacent_accuracy:result.compositeAdjacentAccuracy,
        composite_metrics:          result.compositeMetrics,
        per_dimension_metrics:      result.perDimensionMetrics,
        mismatched_videos:          result.mismatchedVideos,
        per_format_metrics:         result.perFormatMetrics,
        format_split_enabled:       result.formatSplitEnabled,
      });
      setViewMode('pooled');
    } catch (err) {
      setRunError(err?.message || 'unknown error');
    } finally {
      setRunning(false);
    }
  };

  const handleLoadRun = async (runId) => {
    const res = await loadCalibrationRun(runId);
    if (res.ok) setSelectedRun(res.run);
  };

  const handleArchiveRun = async (runId) => {
    if (!window.confirm('Archive this calibration run?')) return;
    await archiveCalibrationRun(runId);
    const list = await listCalibrationRunsForClient(clientId, { limit: 10 });
    setRunsList(list?.runs || []);
    if (selectedRun?.id === runId) setSelectedRun(null);
  };

  return (
    <div style={workspaceShellStyle}>
      <div style={workspaceHeaderStyle}>
        <div style={kickerStyle}>Strategy · Calibration</div>
        <h1 style={titleStyle}>{activeClient.name}</h1>
        <div style={subtitleStyle}>
          Closes the prediction-machine feedback loop. Compares the scorer's predicted tiers
          against actual outcomes for every video in a repositioning audit. Surfaces which
          dimensions to trust most for this channel and where the scorer is systematically
          off. Phase A uses view-rank quartile inside the channel as the actual-tier baseline;
          Phase B will add pipeline strategies for clients with outcome data.
        </div>
      </div>

      {bootLoading && <Note tone="info">Loading audits + prior calibration runs…</Note>}
      {bootError   && <Note tone="error">{bootError}</Note>}

      {!bootLoading && !audits.length && (
        <Note tone="warn">
          No repositioning audits available for this client. Run an audit at <strong>Strategy → Repositioning</strong> first;
          calibration scores its predictions against actual outcomes from that audit's video pool.
        </Note>
      )}

      {!bootLoading && audits.length > 0 && (
        <>
          <RunBar
            audits={audits}
            selectedAuditId={selectedAuditId}
            onAuditChange={setSelectedAuditId}
            running={running}
            onRun={handleRun}
            splitByFormat={splitByFormat}
            onSplitByFormatChange={setSplitByFormat}
          />
          {runError && <Note tone="error">{runError}</Note>}

          <SavedRunsList
            runs={runsList}
            audits={audits}
            selectedId={selectedRun?.id}
            onLoad={handleLoadRun}
            onArchive={handleArchiveRun}
          />

          {selectedRun && (
            <CalibrationDetail
              run={selectedRun}
              audits={audits}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          )}
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Light list of audits (without video_scores) for the picker
// ──────────────────────────────────────────────────

async function listRepositioningAuditsLight(clientId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('client_repositioning_audits')
    .select('id, created_at, mode, videos_scored, videos_with_embeddings, format_filter')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.warn('[calibration] audit list failed:', error);
    return [];
  }
  return data || [];
}

// ──────────────────────────────────────────────────
// Run bar
// ──────────────────────────────────────────────────

function RunBar({ audits, selectedAuditId, onAuditChange, running, onRun, splitByFormat, onSplitByFormatChange }) {
  return (
    <div style={runBarStyle}>
      <div style={{ flex: 1 }}>
        <div style={kickerSmallStyle}>Source audit</div>
        <select
          value={selectedAuditId || ''}
          onChange={e => onAuditChange(e.target.value)}
          disabled={running}
          style={{ ...selectStyle, minWidth: 360 }}
        >
          {audits.map(a => (
            <option key={a.id} value={a.id}>
              {new Date(a.created_at).toLocaleString()} · {a.videos_scored} videos
              {a.format_filter ? ` · ${a.format_filter}` : ' · all formats'}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
          Baseline strategy: <strong style={{ color: '#cde4d6' }}>view-rank quartile</strong>{' '}
          (top 25% of the audit's videos by views = "very_likely_outperform" actual;
          bottom 25% = "predicted_under" actual). Phase B will add pipeline strategies for
          clients with outcome data.
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={splitByFormat}
            onChange={e => onSplitByFormatChange(e.target.checked)}
            disabled={running}
          />
          <span style={{ fontSize: 12, color: '#cde4d6' }}>
            Compute per-format metrics (shorts vs long-form)
          </span>
          <span style={{ fontSize: 11, color: '#666' }}>
            — quartile derived within each format pool, surfaces format-specific failure modes
          </span>
        </label>
      </div>
      <button onClick={onRun} disabled={running} style={runBtnStyle(running)}>
        {running ? 'Computing…' : 'Run calibration'}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Saved runs list
// ──────────────────────────────────────────────────

function SavedRunsList({ runs, audits, selectedId, onLoad, onArchive }) {
  if (!runs?.length) return null;
  const auditLookup = useMemo(() => {
    const m = {};
    for (const a of audits) m[a.id] = a;
    return m;
  }, [audits]);

  return (
    <div style={{ marginTop: 18 }}>
      <div style={kickerSmallStyle}>Saved calibration runs</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {runs.map(r => (
          <div key={r.id} style={listRowStyle(r.id === selectedId)}>
            <div style={{ flex: 1 }}>
              <div style={listRowDateStyle}>
                {new Date(r.created_at).toLocaleString()}
                <span style={listRowMetaStyle}>
                  {' · '}{r.videos_calibrated} videos
                  {r.composite_accuracy != null && ` · composite ${(r.composite_accuracy * 100).toFixed(0)}% exact / ${(r.composite_adjacent_accuracy * 100).toFixed(0)}% ±1`}
                  {auditLookup[r.source_audit_id] && ` · audit ${new Date(auditLookup[r.source_audit_id].created_at).toLocaleDateString()}`}
                  {r.format_split_enabled && (
                    <span style={{ marginLeft: 8, color: '#0A919B', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      · format-split
                    </span>
                  )}
                </span>
              </div>
            </div>
            <button onClick={() => onLoad(r.id)} style={smallBtnStyle}>load</button>
            <button onClick={() => onArchive(r.id)} style={smallBtnStyle}>archive</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Calibration detail
// ──────────────────────────────────────────────────

function CalibrationDetail({ run, audits, viewMode = 'pooled', onViewModeChange }) {
  const sourceAudit = audits.find(a => a.id === run.source_audit_id);

  // Resolve the view's metric block. Defaults to pooled; format-split
  // views pull from per_format_metrics[format] which has the same shape
  // as the pooled metrics (single dimension entry per dim, single
  // composite block, mismatch list).
  const view = useMemo(() => {
    if (viewMode === 'pooled' || !run.per_format_metrics) {
      return {
        label:             'Pooled (all formats)',
        n:                 run.videos_calibrated,
        compositeMetrics:  run.composite_metrics,
        perDimensionMetrics: run.per_dimension_metrics,
        mismatchedVideos:  run.mismatched_videos || [],
        compositeAccuracy: run.composite_accuracy,
        compositeAdjacent: run.composite_adjacent_accuracy,
        insufficient:      false,
      };
    }
    const block = run.per_format_metrics[viewMode];
    if (!block || block.insufficientData) {
      return {
        label:             viewMode === 'shorts' ? 'Shorts only' : 'Long-form only',
        n:                 block?.n || 0,
        compositeMetrics:  null,
        perDimensionMetrics: null,
        mismatchedVideos:  [],
        compositeAccuracy: null,
        compositeAdjacent: null,
        insufficient:      true,
      };
    }
    return {
      label:             viewMode === 'shorts' ? 'Shorts only' : 'Long-form only',
      n:                 block.n,
      compositeMetrics:  block.compositeMetrics,
      perDimensionMetrics: block.perDimensionMetrics,
      mismatchedVideos:  block.mismatchedVideos || [],
      compositeAccuracy: block.compositeAccuracy,
      compositeAdjacent: block.compositeAdjacentAccuracy,
      insufficient:      false,
    };
  }, [run, viewMode]);

  // Rank dimensions by accuracy to surface "trust most" vs "treat as hypothesis."
  const rankedDims = useMemo(() => {
    const entries = Object.entries(view.perDimensionMetrics || {})
      .filter(([_, m]) => m && m.n > 0)
      .map(([key, m]) => ({ key, ...m }));
    return entries.sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0));
  }, [view]);

  return (
    <div style={detailShellStyle}>
      <div style={detailHeaderStyle}>
        <div>
          <div style={kickerStyle}>
            Calibration · {new Date(run.created_at).toLocaleString()}
          </div>
          <div style={detailMetaStyle}>
            {run.videos_calibrated} videos pooled · baseline: {run.baseline_strategy}
            {sourceAudit && ` · source audit ${new Date(sourceAudit.created_at).toLocaleDateString()} (${sourceAudit.videos_scored} videos${sourceAudit.format_filter ? `, ${sourceAudit.format_filter}` : ''})`}
          </div>
          {run.per_format_metrics && (
            <ViewModeTabs
              run={run}
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
            />
          )}
        </div>
        <CompositeHeadline
          accuracy={view.compositeAccuracy}
          adjacent={view.compositeAdjacent}
          label={view.label}
          n={view.n}
        />
      </div>

      {view.insufficient ? (
        <Note tone="warn">
          {view.label}: insufficient data ({view.n} videos). Need at least 4 in this format to compute quartile-based actual_tier. Run an audit that includes more {viewMode === 'shorts' ? 'Shorts' : 'long-form videos'}.
        </Note>
      ) : (
        <>
          <DimensionRanking ranked={rankedDims} />

          <ConfusionPanel
            title={`Composite confusion matrix · ${view.label}`}
            metrics={view.compositeMetrics}
          />

          <PerDimensionConfusionGrid metrics={view.perDimensionMetrics} />

          <MismatchedVideosList videos={view.mismatchedVideos} />
        </>
      )}
    </div>
  );
}

function ViewModeTabs({ run, viewMode, onViewModeChange }) {
  const shorts = run.per_format_metrics?.shorts;
  const longForm = run.per_format_metrics?.long_form;
  const tabs = [
    { id: 'pooled',    label: `Pooled (${run.videos_calibrated})`,            available: true },
    { id: 'shorts',    label: `Shorts (${shorts?.n || 0})`,                   available: shorts && !shorts.insufficientData },
    { id: 'long_form', label: `Long-form (${longForm?.n || 0})`,              available: longForm && !longForm.insufficientData },
  ];
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onViewModeChange?.(t.id)}
          disabled={!t.available}
          style={viewModeTabStyle(viewMode === t.id, !t.available)}
          title={!t.available ? 'Insufficient data for this format' : undefined}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function CompositeHeadline({ accuracy, adjacent, label, n }) {
  if (accuracy == null) {
    return label ? (
      <div style={composHeadlineStyle}>
        <div style={composLabelStyle}>{label}</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>n/a</div>
      </div>
    ) : null;
  }
  const exact = Math.round(accuracy * 100);
  const adj   = adjacent != null ? Math.round(adjacent * 100) : null;
  return (
    <div style={composHeadlineStyle}>
      <div style={composScoreStyle}>{exact}%</div>
      <div style={composLabelStyle}>composite exact{label ? ` · ${label}` : ''}</div>
      {adj != null && (
        <div style={composSubStyle}>{adj}% within ±1 tier{n != null ? ` · n=${n}` : ''}</div>
      )}
    </div>
  );
}

function DimensionRanking({ ranked }) {
  if (!ranked?.length) return null;
  const best  = ranked[0];
  const worst = ranked[ranked.length - 1];
  return (
    <div style={rankingShellStyle}>
      <div style={kickerSmallStyle}>Trust ranking by dimension</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <RankingCard label="Most reliable" dim={best}  tone="strong" />
        {ranked.length > 1 && <RankingCard label="Treat as hypothesis" dim={worst} tone="weak" />}
      </div>
      <div style={{ fontSize: 11, color: '#666', lineHeight: 1.4 }}>
        Full ranking (exact / ±1-tier):
        {' '}
        {ranked.map((d, i) => (
          <span key={d.key} style={{ marginRight: 12 }}>
            <strong style={{ color: '#cde4d6' }}>{DIMENSION_LABELS[d.key] || d.key}</strong>{' '}
            {(d.accuracy * 100).toFixed(0)}% / {(d.adjacent_accuracy * 100).toFixed(0)}%{' '}
            <span style={{ color: '#666' }}>(n={d.n})</span>
            {i < ranked.length - 1 ? ' ·' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function RankingCard({ label, dim, tone }) {
  const color = tone === 'strong' ? '#3fa66a' : '#E8A82B';
  return (
    <div style={rankingCardStyle(color)}>
      <div style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e2d0', marginTop: 4 }}>
        {DIMENSION_LABELS[dim.key] || dim.key}
      </div>
      <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
        {(dim.accuracy * 100).toFixed(0)}% exact · {(dim.adjacent_accuracy * 100).toFixed(0)}% within ±1
        {' · '}n={dim.n}
      </div>
    </div>
  );
}

function ConfusionPanel({ title, metrics }) {
  if (!metrics?.n) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={kickerSmallStyle}>{title}</div>
      <ConfusionMatrix confusion={metrics.confusion} n={metrics.n} />
    </div>
  );
}

function ConfusionMatrix({ confusion, n }) {
  // Predicted tiers down rows, actual tiers across columns.
  return (
    <table style={confusionTableStyle}>
      <thead>
        <tr>
          <th style={confusionCornerStyle}>
            pred ↓ / actual →
          </th>
          {CALIBRATION_TIERS.slice().reverse().map(t => (
            <th key={t} style={confusionHeaderCellStyle(TIER_COLORS[t])}>
              {TIER_LABELS[t]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {CALIBRATION_TIERS.slice().reverse().map(pred => (
          <tr key={pred}>
            <td style={confusionRowLabelStyle(TIER_COLORS[pred])}>
              {TIER_LABELS[pred]}
            </td>
            {CALIBRATION_TIERS.slice().reverse().map(actual => {
              const count = confusion?.[pred]?.[actual] || 0;
              const pct = n > 0 ? (count / n) * 100 : 0;
              const isDiagonal = pred === actual;
              return (
                <td
                  key={actual}
                  style={confusionCellStyle({ count, pct, isDiagonal })}
                  title={`Predicted ${TIER_LABELS[pred]}, actual ${TIER_LABELS[actual]} — ${count} videos (${pct.toFixed(1)}%)`}
                >
                  <div style={{ fontWeight: 700 }}>{count}</div>
                  {count > 0 && <div style={{ fontSize: 9, opacity: 0.6 }}>{pct.toFixed(0)}%</div>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PerDimensionConfusionGrid({ metrics }) {
  if (!metrics) return null;
  const dims = CALIBRATION_DIMENSION_KEYS.filter(d => metrics[d]?.n > 0);
  if (!dims.length) return null;
  return (
    <details style={{ marginTop: 18 }} open={false}>
      <summary style={detailsSummaryStyle}>
        ▸ Per-dimension confusion matrices
      </summary>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginTop: 12 }}>
        {dims.map(d => (
          <div key={d}>
            <div style={{ fontSize: 11, color: '#0A919B', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
              {DIMENSION_LABELS[d]} · {(metrics[d].accuracy * 100).toFixed(0)}% exact · n={metrics[d].n}
            </div>
            <ConfusionMatrix confusion={metrics[d].confusion} n={metrics[d].n} />
          </div>
        ))}
      </div>
    </details>
  );
}

function MismatchedVideosList({ videos }) {
  if (!videos?.length) {
    return (
      <div style={{ marginTop: 18, fontSize: 12, color: '#777' }}>
        No mismatches — every scored video matched its actual tier exactly. Unusual; double-check the audit.
      </div>
    );
  }
  return (
    <div style={{ marginTop: 18 }}>
      <div style={kickerSmallStyle}>Highest-traffic mismatches</div>
      <div style={{ fontSize: 11, color: '#777', marginBottom: 6 }}>
        Videos where the composite predicted tier disagreed with the observed view-rank quartile. Sorted by view count desc — these are the calibration cases worth understanding. A "predicted_under" that actually performed top-quartile is teaching the scorer something.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {videos.map((v, i) => (
          <MismatchRow key={v.youtube_video_id || i} v={v} />
        ))}
      </div>
    </div>
  );
}

function MismatchRow({ v }) {
  const predColor   = TIER_COLORS[v.predicted_composite_tier] || '#888';
  const actualColor = TIER_COLORS[v.actual_tier] || '#888';
  return (
    <div style={mismatchRowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={mismatchTitleStyle}>{v.title}</div>
        <div style={mismatchMetaStyle}>
          {formatViews(v.view_count)} views
          {v.format && ` · ${v.format}`}
          {v.published_at && ` · ${new Date(v.published_at).toLocaleDateString()}`}
        </div>
        {v.per_dimension_disagreement?.length > 0 && (
          <div style={mismatchDimsStyle}>
            Disagreed on: {v.per_dimension_disagreement.map((d, i) => (
              <span key={i} style={{ marginRight: 8 }}>
                <strong>{DIMENSION_LABELS[d.dim] || d.dim}</strong>{' '}
                <span style={{ color: TIER_COLORS[d.predicted_tier] || '#888' }}>{TIER_LABELS[d.predicted_tier]}</span>
                {' → '}
                <span style={{ color: TIER_COLORS[d.actual_tier] || '#888' }}>{TIER_LABELS[d.actual_tier]}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={mismatchTiersStyle}>
        <div style={tinyChipStyle(predColor)}>pred {TIER_LABELS[v.predicted_composite_tier]}</div>
        <div style={{ color: '#666', fontSize: 11 }}>→</div>
        <div style={tinyChipStyle(actualColor)}>actual {TIER_LABELS[v.actual_tier]}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

function formatViews(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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
const subtitleStyle = { fontSize: 13, color: '#888', marginTop: 6, lineHeight: 1.5, maxWidth: 800 };

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
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
  marginTop: 14,
};

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
  whiteSpace: 'nowrap',
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
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
  borderBottom: '1px solid #2a2a30', paddingBottom: 12, marginBottom: 12,
};
const detailMetaStyle = { fontSize: 12, color: '#888' };

const composHeadlineStyle = {
  textAlign: 'center',
  background: '#1a1a1f',
  border: '1px solid rgba(10,145,155,0.30)',
  borderRadius: 6,
  padding: '10px 14px',
  flexShrink: 0,
};

const viewModeTabStyle = (active, disabled) => ({
  background: active ? 'rgba(10,145,155,0.18)' : '#1a1a1f',
  color: active ? '#0A919B' : (disabled ? '#444' : '#888'),
  border: `1px solid ${active ? 'rgba(10,145,155,0.55)' : '#2a2a30'}`,
  borderRadius: 4, padding: '4px 12px',
  fontSize: 11, fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  letterSpacing: 0.3, textTransform: 'uppercase',
  opacity: disabled ? 0.5 : 1,
});
const composScoreStyle = { fontSize: 28, fontWeight: 700, color: '#0A919B', lineHeight: 1 };
const composLabelStyle = { fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 };
const composSubStyle = { fontSize: 11, color: '#cde4d6', marginTop: 6 };

const rankingShellStyle = { marginTop: 14 };
const rankingCardStyle = (color) => ({
  background: '#1a1a1f',
  border: `1px solid ${color}40`,
  borderLeft: `2px solid ${color}`,
  borderRadius: 5,
  padding: 12,
});

const confusionTableStyle = {
  width: '100%', borderCollapse: 'separate', borderSpacing: 2, marginTop: 6, fontSize: 11,
};
const confusionCornerStyle = {
  background: '#0e0e11', color: '#666',
  fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
  padding: '6px 8px', textAlign: 'left',
};
const confusionHeaderCellStyle = (color) => ({
  background: `${color}22`,
  color,
  fontSize: 10, fontWeight: 700, padding: '6px 4px', textAlign: 'center',
  textTransform: 'uppercase', letterSpacing: 0.3,
});
const confusionRowLabelStyle = (color) => ({
  background: `${color}22`,
  color,
  fontSize: 10, fontWeight: 700, padding: '6px 8px', textAlign: 'left',
  textTransform: 'uppercase', letterSpacing: 0.3,
});
const confusionCellStyle = ({ count, pct, isDiagonal }) => {
  // Diagonal cells are correct predictions; tint them green.
  // Off-diagonal cells with high count are concerning; tint amber.
  let bg = '#0e0e11', color = '#666';
  if (count > 0) {
    if (isDiagonal) {
      const intensity = Math.min(pct / 25, 1);
      bg = `rgba(63, 166, 106, ${0.10 + 0.30 * intensity})`;
      color = '#cde4d6';
    } else {
      const intensity = Math.min(pct / 15, 1);
      bg = `rgba(232, 168, 43, ${0.06 + 0.25 * intensity})`;
      color = '#e8e2d0';
    }
  }
  return {
    background: bg, color,
    padding: '8px 6px', textAlign: 'center',
    border: isDiagonal ? '1px solid rgba(63,166,106,0.35)' : '1px solid #1a1a1f',
    fontSize: 12, minWidth: 56,
  };
};

const detailsSummaryStyle = {
  fontSize: 11, color: '#888', fontWeight: 600,
  letterSpacing: 0.3, cursor: 'pointer', listStyle: 'none',
};

const mismatchRowStyle = {
  display: 'flex', gap: 12, alignItems: 'flex-start',
  background: '#1a1a1f', border: '1px solid #2a2a30',
  borderRadius: 5, padding: 10,
};
const mismatchTitleStyle = {
  fontSize: 13, fontWeight: 600, color: '#e8e2d0', marginBottom: 2,
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
};
const mismatchMetaStyle = { fontSize: 11, color: '#888' };
const mismatchDimsStyle = { fontSize: 11, color: '#aaa', marginTop: 4, lineHeight: 1.4 };
const mismatchTiersStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  flexShrink: 0,
};
const tinyChipStyle = (color) => ({
  background: `${color}22`, color, border: `1px solid ${color}55`,
  borderRadius: 4, padding: '2px 8px',
  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3,
  whiteSpace: 'nowrap',
});
