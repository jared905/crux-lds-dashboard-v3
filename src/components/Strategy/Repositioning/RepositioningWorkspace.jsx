/**
 * RepositioningWorkspace — Strategy / Repositioning tab.
 *
 * Runs a bulk-audit of the client's existing catalog through the same
 * scorer the Pre-flight panel uses for proposed concepts, then surfaces
 * systemic gaps and strengths so the strategist can repoint the channel.
 *
 * Mental model for the user:
 *   Pre-flight  → "should we make THIS concept?"  (one concept in)
 *   Repositioning → "what's broken across our WHOLE catalog?"  (one row per dimension out)
 *
 * Load path on mount:
 *   1. loadDeliverableData(clientId)  → cohortContext (patterns + white-space + spine)
 *   2. loadTopicAuthorityContext()    → embeddings for the topic_authority dimension
 *   3. listAuditsForClient()          → prior audit runs (light columns only)
 *
 * Run path:
 *   1. runRepositioningAudit() with onProgress to keep the UI alive
 *   2. saveAudit() persists the run (cohort_data_at + per-video scores)
 *   3. setSelectedAudit(result) shows the just-completed run inline
 */

import React, { useEffect, useState, useMemo } from 'react';
import { loadDeliverableData } from '../../../services/clientDeliverableService.js';
import { loadTopicAuthorityContext } from '../../../services/topicAuthorityService.js';
import { runRepositioningAudit, REPORTED_DIMENSIONS } from '../../../services/repositioningAuditService.js';
import {
  saveAudit, listAuditsForClient, loadAudit, archiveAudit,
} from '../../../services/repositioningAuditsService.js';
import DataFreshnessBadge from '../shared/DataFreshnessBadge.jsx';
import PrelaunchBadge from '../shared/PrelaunchBadge.jsx';

const DIMENSION_LABELS = {
  title_patterns:  'Title patterns',
  slot:            'Slot (day × hour)',
  length:          'Length (long-form only)',
  topic_authority: 'Topic authority',
};

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
  null_count:             '#3a3a40',
};

const FORMAT_FILTERS = [
  { value: null,         label: 'All formats'   },
  { value: 'shorts',     label: 'Shorts only'   },
  { value: 'long_form',  label: 'Long-form only' },
];

export default function RepositioningWorkspace({ activeClient }) {
  // ── State ─────────────────────────────────────────────
  const [cohortContext, setCohortContext]               = useState(null);
  const [cohortError, setCohortError]                   = useState(null);
  const [topicAuthorityContext, setTopicAuthorityCtx]   = useState(null);
  const [auditsList, setAuditsList]                     = useState([]);
  const [selectedAudit, setSelectedAudit]               = useState(null);
  const [formatFilter, setFormatFilter]                 = useState(null);
  const [running, setRunning]                           = useState(false);
  const [progress, setProgress]                         = useState({ scored: 0, total: 0 });
  const [runError, setRunError]                         = useState(null);
  const [bootLoading, setBootLoading]                   = useState(true);

  const clientId = activeClient?.id;

  // ── Bootstrap loaders ────────────────────────────────
  // Hooks come before any early return per the rules of hooks.
  useEffect(() => {
    if (!clientId) {
      setBootLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setBootLoading(true);
      setCohortError(null);
      try {
        const [deliverable, topicCtx, list] = await Promise.all([
          loadDeliverableData(clientId),
          loadTopicAuthorityContext({ clientId }).catch(() => null),
          listAuditsForClient(clientId, { limit: 10 }),
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
        setAuditsList(list?.audits || []);
      } catch (err) {
        if (!cancelled) setCohortError(err?.message || 'unknown error during bootstrap');
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  // ── Empty state ───────────────────────────────────────
  if (!clientId) {
    return (
      <div style={emptyShellStyle}>
        <div style={emptyHeaderStyle}>Repositioning audit</div>
        <div style={emptyBodyStyle}>
          Pick a client from <strong style={{ color: '#cde4d6' }}>Operate → Clients</strong> first.
          The repositioning audit bulk-scores the channel's existing catalog, so it needs a
          specific channel context to run against.
        </div>
      </div>
    );
  }

  // ── Run audit ────────────────────────────────────────
  const handleRun = async () => {
    if (!cohortContext) { setRunError('Cohort data not loaded yet'); return; }
    setRunning(true);
    setRunError(null);
    setProgress({ scored: 0, total: 0 });
    try {
      const result = await runRepositioningAudit({
        clientId,
        cohortContext,
        topicAuthorityContext,
        formatFilter,
        videoLimit: 500,
        onProgress: (p) => setProgress(p),
      });
      if (!result.ok) {
        setRunError(result.error || 'Audit failed');
        return;
      }
      const saved = await saveAudit({
        clientId,
        mode: 'deterministic',
        videosScored:           result.videosScored,
        videosWithEmbeddings:   result.videosWithEmbeddings,
        formatFilter,
        cohortDataAt:           cohortContext.coverage?.generatedAt || new Date().toISOString(),
        cohortWindowDays:       90,
        compositeDistribution:  result.compositeDistribution,
        dimensionBreakdowns:    result.dimensionBreakdowns,
        systemicGaps:           result.systemicGaps,
        systemicStrengths:      result.systemicStrengths,
        videoScores:            result.videoScores,
      });
      // Refresh list and select the just-completed audit (hydrate from
      // the in-memory result instead of re-fetching).
      const list = await listAuditsForClient(clientId, { limit: 10 });
      setAuditsList(list?.audits || []);
      setSelectedAudit({
        id: saved?.id || null,
        created_at: saved?.createdAt || new Date().toISOString(),
        mode: 'deterministic',
        videos_scored: result.videosScored,
        videos_with_embeddings: result.videosWithEmbeddings,
        format_filter: formatFilter,
        composite_distribution: result.compositeDistribution,
        dimension_breakdowns:   result.dimensionBreakdowns,
        systemic_gaps:          result.systemicGaps,
        systemic_strengths:     result.systemicStrengths,
        video_scores:           result.videoScores,
      });
    } catch (err) {
      setRunError(err?.message || 'unknown error');
    } finally {
      setRunning(false);
    }
  };

  // ── Load a saved audit ───────────────────────────────
  const handleLoad = async (auditId) => {
    const res = await loadAudit(auditId);
    if (res.ok) setSelectedAudit(res.audit);
  };

  const handleArchive = async (auditId) => {
    if (!window.confirm('Archive this audit? It will be hidden from the list.')) return;
    await archiveAudit(auditId);
    const list = await listAuditsForClient(clientId, { limit: 10 });
    setAuditsList(list?.audits || []);
    if (selectedAudit?.id === auditId) setSelectedAudit(null);
  };

  // ── Render ───────────────────────────────────────────
  return (
    <div style={workspaceShellStyle}>
      <div style={workspaceHeaderStyle}>
        <div style={kickerStyle}>Strategy · Repositioning</div>
        <h1 style={titleStyle}>
          {activeClient.name}
          <span style={{ marginLeft: 12, display: 'inline-block', verticalAlign: 'middle' }}>
            <PrelaunchBadge client={activeClient} />
          </span>
        </h1>
        <div style={subtitleStyle}>
          Bulk-score the channel's existing catalog through the same scorer Pre-flight uses for
          proposed concepts. Surfaces dimensions where the channel is systemically weak or
          systemically strong, so repositioning gets pointed at the right lever.
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
            cohortContext={cohortContext}
            formatFilter={formatFilter}
            onFormatChange={setFormatFilter}
            onRun={handleRun}
            running={running}
            progress={progress}
            embeddingsLoaded={!!topicAuthorityContext}
          />
          {runError && <Note tone="error">{runError}</Note>}

          <SavedAuditsList
            audits={auditsList}
            selectedId={selectedAudit?.id}
            onLoad={handleLoad}
            onArchive={handleArchive}
          />

          {selectedAudit && (
            <AuditDetail audit={selectedAudit} />
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Run bar
// ─────────────────────────────────────────────────────

function RunBar({ cohortContext, formatFilter, onFormatChange, onRun, running, progress, embeddingsLoaded }) {
  const channels = cohortContext?.coverage?.channelCount;
  const cohortVideos = cohortContext?.coverage?.videoCount;
  return (
    <div style={runBarStyle}>
      <div style={{ flex: 1 }}>
        <div style={runBarLineStyle}>
          <span style={runBarLabelStyle}>Cohort:</span>{' '}
          {channels ? `${channels} channels · ${cohortVideos || 0} videos` : '—'}
        </div>
        <div style={runBarLineStyle}>
          <span style={runBarLabelStyle}>Embeddings:</span>{' '}
          {embeddingsLoaded ? (
            <span style={{ color: '#cde4d6' }}>loaded · topic-authority active</span>
          ) : (
            <span style={{ color: '#E8A82B' }}>not loaded · dimension self-excludes</span>
          )}
        </div>
        {running && progress.total > 0 && (
          <div style={progressLineStyle}>
            Scoring {progress.scored} / {progress.total}…
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={formatFilter || ''}
          onChange={(e) => onFormatChange(e.target.value || null)}
          disabled={running}
          style={selectStyle}
        >
          {FORMAT_FILTERS.map((f) => (
            <option key={f.label} value={f.value || ''}>{f.label}</option>
          ))}
        </select>
        <button onClick={onRun} disabled={running} style={runBtnStyle(running)}>
          {running ? 'Auditing…' : 'Run audit'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Saved audits list
// ─────────────────────────────────────────────────────

function SavedAuditsList({ audits, selectedId, onLoad, onArchive }) {
  if (!audits || audits.length === 0) return null;
  return (
    <div style={listShellStyle}>
      <div style={kickerSmallStyle}>Saved audits</div>
      <div style={listGridStyle}>
        {audits.map((a) => (
          <div
            key={a.id}
            style={listRowStyle(a.id === selectedId)}
          >
            <div style={{ flex: 1 }}>
              <div style={listRowDateStyle}>
                {new Date(a.created_at).toLocaleString()}
                <span style={listRowMetaStyle}>
                  {' · '}{a.videos_scored} videos
                  {a.format_filter ? ` · ${a.format_filter}` : ''}
                </span>
              </div>
              {a.systemic_gaps?.length > 0 && (
                <div style={listRowGapsStyle}>
                  {a.systemic_gaps.length} systemic gap{a.systemic_gaps.length === 1 ? '' : 's'}:{' '}
                  {a.systemic_gaps.map(g => DIMENSION_LABELS[g.dimension] || g.dimension).join(', ')}
                </div>
              )}
            </div>
            <button onClick={() => onLoad(a.id)} style={smallBtnStyle}>load</button>
            <button onClick={() => onArchive(a.id)} style={smallBtnStyle}>archive</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Audit detail
// ─────────────────────────────────────────────────────

function AuditDetail({ audit }) {
  const total = useMemo(() => sumNonNull(audit.composite_distribution || {}), [audit]);
  return (
    <div style={detailShellStyle}>
      <div style={detailHeaderStyle}>
        <div>
          <div style={kickerStyle}>Audit · {new Date(audit.created_at).toLocaleString()}</div>
          <div style={detailMetaStyle}>
            {audit.videos_scored} videos scored
            {audit.format_filter ? ` · format: ${audit.format_filter}` : ' · all formats'}
            {audit.videos_with_embeddings != null && ` · ${audit.videos_with_embeddings} with embeddings`}
            {audit.mode === 'deep' && ' · deep mode'}
          </div>
        </div>
      </div>

      <CompositeStrip distribution={audit.composite_distribution} total={total} />

      <SystemicCallouts
        gaps={audit.systemic_gaps || []}
        strengths={audit.systemic_strengths || []}
      />

      <DimensionBreakdownTable breakdowns={audit.dimension_breakdowns || {}} />

      <WeakestVideosList videos={audit.video_scores || []} />
    </div>
  );
}

function CompositeStrip({ distribution, total }) {
  if (!distribution || total === 0) return null;
  const tiers = ['very_likely_outperform', 'likely_solid', 'risky', 'predicted_under'];
  return (
    <div style={{ marginTop: 14 }}>
      <div style={kickerSmallStyle}>Composite distribution</div>
      <div style={stripStyle}>
        {tiers.map((tier) => {
          const n = distribution[tier] || 0;
          if (!n) return null;
          const pct = (n / total) * 100;
          return (
            <div key={tier} style={stripSegmentStyle(pct, TIER_COLORS[tier])}>
              {pct >= 8 ? `${Math.round(pct)}%` : ''}
            </div>
          );
        })}
      </div>
      <div style={legendRowStyle}>
        {tiers.map((tier) => (
          <span key={tier} style={legendItemStyle}>
            <span style={legendSwatchStyle(TIER_COLORS[tier])} />
            {TIER_LABELS[tier]} · {distribution[tier] || 0}
          </span>
        ))}
      </div>
    </div>
  );
}

function SystemicCallouts({ gaps, strengths }) {
  if (!gaps.length && !strengths.length) {
    return (
      <div style={{ marginTop: 14, fontSize: 12, color: '#777' }}>
        No dimension crosses systemic gap (&gt;60% under) or systemic strength (&gt;50% over) thresholds.
      </div>
    );
  }
  return (
    <div style={calloutsGridStyle}>
      {gaps.length > 0 && (
        <div style={calloutCardStyle('#cf6b6b')}>
          <div style={calloutTitleStyle('#cf6b6b')}>Systemic gaps</div>
          {gaps.map((g) => (
            <div key={g.dimension} style={calloutRowStyle}>
              <div style={{ fontWeight: 700, color: '#e8e2d0' }}>
                {DIMENSION_LABELS[g.dimension] || g.dimension}
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                {Math.round(g.share_under * 100)}% scoring risky or predicted_under
              </div>
            </div>
          ))}
        </div>
      )}
      {strengths.length > 0 && (
        <div style={calloutCardStyle('#3fa66a')}>
          <div style={calloutTitleStyle('#3fa66a')}>Systemic strengths</div>
          {strengths.map((s) => (
            <div key={s.dimension} style={calloutRowStyle}>
              <div style={{ fontWeight: 700, color: '#e8e2d0' }}>
                {DIMENSION_LABELS[s.dimension] || s.dimension}
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                {Math.round(s.share_over * 100)}% scoring likely_solid or very_likely_outperform
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DimensionBreakdownTable({ breakdowns }) {
  const rows = REPORTED_DIMENSIONS.filter((d) => breakdowns[d]);
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={kickerSmallStyle}>Per-dimension distribution</div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Dimension</th>
            <th style={thStyle}>Very likely</th>
            <th style={thStyle}>Likely solid</th>
            <th style={thStyle}>Risky</th>
            <th style={thStyle}>Predicted under</th>
            <th style={thStyle}>N/A</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const dist = breakdowns[d];
            return (
              <tr key={d}>
                <td style={tdLabelStyle}>{DIMENSION_LABELS[d] || d}</td>
                <td style={tdStyle}>{dist.very_likely_outperform || 0}</td>
                <td style={tdStyle}>{dist.likely_solid || 0}</td>
                <td style={tdStyle}>{dist.risky || 0}</td>
                <td style={tdStyle}>{dist.predicted_under || 0}</td>
                <td style={tdNullStyle}>{dist.null_count || 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WeakestVideosList({ videos }) {
  // Reformulation ROI is highest where the audience already shows up —
  // a 91k-view risky video has more upside from a title fix than a
  // 189-view predicted_under video does. Sort by view_count desc among
  // underperforming tiers (risky + predicted_under); tier weight is only
  // used as a tie-breaker so predicted_under wins at equal traffic.
  const ranked = useMemo(() => {
    const tierWeight = { predicted_under: 3, risky: 2, likely_solid: 1, very_likely_outperform: 0 };
    return [...(videos || [])]
      .filter((v) => v.composite_tier === 'risky' || v.composite_tier === 'predicted_under')
      .sort((a, b) => {
        const dv = (b.view_count || 0) - (a.view_count || 0);
        if (dv !== 0) return dv;
        return (tierWeight[b.composite_tier] ?? 0) - (tierWeight[a.composite_tier] ?? 0);
      })
      .slice(0, 10);
  }, [videos]);

  if (!ranked.length) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={kickerSmallStyle}>Highest-traffic underperformers</div>
      <div style={{ fontSize: 11, color: '#777', marginBottom: 6 }}>
        Sorted by composite tier (weakest first), then by view count. These are the candidates
        for the next round of reformulation.
      </div>
      <div style={videosListStyle}>
        {ranked.map((v) => (
          <div key={v.youtube_video_id || v.video_id} style={videoRowStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={videoTitleStyle}>{v.title}</div>
              <div style={videoMetaStyle}>
                {v.view_count != null && `${formatViews(v.view_count)} views`}
                {v.format && ` · ${v.format}`}
                {v.published_at && ` · ${new Date(v.published_at).toLocaleDateString()}`}
              </div>
              {v.composite_rationale && (
                <div style={videoRationaleStyle}>{v.composite_rationale}</div>
              )}
            </div>
            <div style={tierChipStyle(TIER_COLORS[v.composite_tier])}>
              {TIER_LABELS[v.composite_tier] || v.composite_tier}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

function sumNonNull(dist) {
  return (dist.very_likely_outperform || 0)
       + (dist.likely_solid || 0)
       + (dist.risky || 0)
       + (dist.predicted_under || 0);
}

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

// ─────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────

const workspaceShellStyle = {
  padding: '20px 24px 60px',
  maxWidth: 1280,
  margin: '0 auto',
};
const workspaceHeaderStyle = { marginBottom: 18 };
const kickerStyle = {
  fontSize: 11, color: '#0A919B',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700,
  marginBottom: 4,
};
const kickerSmallStyle = {
  fontSize: 10, color: '#888',
  textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
  marginBottom: 6,
};
const titleStyle = {
  fontSize: 24, fontWeight: 700, color: '#e8e2d0', margin: 0,
};
const subtitleStyle = {
  fontSize: 13, color: '#888', marginTop: 6, lineHeight: 1.5, maxWidth: 720,
};

const emptyShellStyle = {
  padding: '60px 24px', maxWidth: 720, margin: '0 auto', textAlign: 'center',
};
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

const listShellStyle = { marginTop: 18 };
const listGridStyle = { display: 'flex', flexDirection: 'column', gap: 6 };
const listRowStyle = (selected) => ({
  display: 'flex', alignItems: 'center', gap: 10,
  background: selected ? 'rgba(10,145,155,0.10)' : '#0e0e11',
  border: `1px solid ${selected ? 'rgba(10,145,155,0.40)' : '#2a2a30'}`,
  borderRadius: 5, padding: 10,
});
const listRowDateStyle = { fontSize: 12, fontWeight: 600, color: '#cde4d6' };
const listRowMetaStyle = { color: '#888', fontWeight: 400 };
const listRowGapsStyle = { fontSize: 11, color: '#E8A82B', marginTop: 2 };

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
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  borderBottom: '1px solid #2a2a30', paddingBottom: 12, marginBottom: 12,
};
const detailMetaStyle = { fontSize: 12, color: '#888' };

const stripStyle = {
  display: 'flex', height: 22, borderRadius: 4, overflow: 'hidden',
  background: '#1a1a1f', border: '1px solid #2a2a30',
};
const stripSegmentStyle = (pct, color) => ({
  width: `${pct}%`,
  background: color,
  color: '#0a0a0e',
  fontSize: 10, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});
const legendRowStyle = { display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8 };
const legendItemStyle = { fontSize: 11, color: '#aaa', display: 'inline-flex', alignItems: 'center', gap: 6 };
const legendSwatchStyle = (color) => ({
  width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block',
});

const calloutsGridStyle = {
  marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
};
const calloutCardStyle = (color) => ({
  background: '#1a1a1f',
  border: `1px solid ${color}40`,
  borderLeft: `2px solid ${color}`,
  borderRadius: 5, padding: 12,
});
const calloutTitleStyle = (color) => ({
  fontSize: 11, color, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
});
const calloutRowStyle = { padding: '6px 0', borderTop: '1px dashed #2a2a30' };

const tableStyle = {
  width: '100%', borderCollapse: 'collapse', marginTop: 6, fontSize: 12,
};
const thStyle = {
  textAlign: 'left', fontSize: 10, color: '#888',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600,
  padding: '8px 8px', borderBottom: '1px solid #2a2a30',
};
const tdStyle = {
  padding: '8px 8px', color: '#cde4d6',
  borderBottom: '1px solid #1a1a1f',
};
const tdLabelStyle = { ...tdStyle, color: '#e8e2d0', fontWeight: 600 };
const tdNullStyle = { ...tdStyle, color: '#666' };

const videosListStyle = { display: 'flex', flexDirection: 'column', gap: 6 };
const videoRowStyle = {
  display: 'flex', gap: 12, alignItems: 'flex-start',
  background: '#1a1a1f', border: '1px solid #2a2a30',
  borderRadius: 5, padding: 10,
};
const videoTitleStyle = {
  fontSize: 13, fontWeight: 600, color: '#e8e2d0',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const videoMetaStyle = { fontSize: 11, color: '#888', marginTop: 2 };
const videoRationaleStyle = { fontSize: 11, color: '#aaa', marginTop: 4, fontStyle: 'italic' };

const tierChipStyle = (color) => ({
  background: `${color}22`,
  color,
  border: `1px solid ${color}55`,
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.5,
  whiteSpace: 'nowrap', flexShrink: 0,
});
