/**
 * CohortRolesWorkspace — Strategy / Cohort tab.
 *
 * Tag each cohort channel with one of:
 *   peer         — scored against for prediction (Pre-flight,
 *                  Repositioning, Competitor Scan, Calibration)
 *   aspirational — where the client is growing toward; directional
 *                  intelligence only, NOT predictive
 *   reference    — case-study channel; not scored against
 *
 * Why this exists: Kendall Stahl's Calibration Phase A (2026-06-05)
 * revealed the scorer is systematically pessimistic — composite 30%
 * accuracy, 24 false-negatives on Risky predictions. Hypothesis: his
 * cohort mixes premium-tier channels (Andrei Jikh 1.6M, Erin Talks
 * Money 100K+, Azul 33K) with peer-scale advisor channels. Predictions
 * inherit the premium audience signal and don't transfer.
 *
 * This workspace is the minimum-viable cohort builder — manual tagging
 * with bulk operations + a composition diagnostic. If tagging Kendall's
 * cohort + re-running his audit improves calibration meaningfully, the
 * full discovery/recommender (and Spine extension fields) become the
 * obvious next builds. If not, we'll have learned the theory was wrong
 * and saved ourselves heavier infrastructure.
 */

import {useEffect, useState, useMemo} from 'react';
import {
  loadCohortWithRoles, updateCohortRole, getCohortComposition,
  COHORT_ROLES,
} from '../../../services/cohortRolesService.js';
import DataFreshnessBadge from '../shared/DataFreshnessBadge.jsx';
import NextStepCard from '../shared/NextStepCard.jsx';
import PrelaunchBadge from '../shared/PrelaunchBadge.jsx';

const ROLE_LABELS = {
  peer:         'Peer',
  aspirational: 'Aspirational',
  reference:    'Reference',
};

const ROLE_COLORS = {
  peer:         'var(--pos-text)',
  aspirational: 'var(--accent-text)',
  reference:    'var(--outline)',
};

const ROLE_DESCRIPTIONS = {
  peer:         'Scored against for prediction. Pre-flight, Repositioning, Competitor Scan, and Calibration all read peer-tagged channels as predictive ground truth.',
  aspirational: 'Where the client is growing toward. Visible in monitoring (Research, Portfolio) but NOT scored against — premium-tier patterns don\'t transfer.',
  reference:    'Case-study channel kept for context. Not scored against, not monitored heavily — useful for cross-vertical observation.',
};

export default function CohortRolesWorkspace({ activeClient, onNavigate }) {
  const clientId = activeClient?.id;

  const [bootLoading, setBootLoading]   = useState(true);
  const [bootError, setBootError]       = useState(null);
  const [rows, setRows]                 = useState([]);
  const [composition, setComposition]   = useState(null);
  const [pendingUpdates, setPending]    = useState({});  // channelId → 'updating' | 'error'
  const [filter, setFilter]             = useState('all'); // 'all' | role
  const [sortBy, setSortBy]             = useState('subs_desc');

  useEffect(() => {
    if (!clientId) { setBootLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setBootLoading(true);
      setBootError(null);
      try {
        const [cohort, comp] = await Promise.all([
          loadCohortWithRoles(clientId),
          getCohortComposition(clientId),
        ]);
        if (cancelled) return;
        setRows(cohort || []);
        setComposition(comp || null);
      } catch (err) {
        if (!cancelled) setBootError(err?.message || 'failed to load cohort');
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  // Hooks run before the early return below. This useMemo used to sit
  // after it, so a render with no selected client skipped the hook and
  // changed hook order between renders.
  const displayRows = useMemo(() => {
    let r = rows;
    if (filter !== 'all') r = r.filter(x => x.cohort_role === filter);
    const sorted = [...r];
    if (sortBy === 'subs_desc') {
      sorted.sort((a, b) => (b.channel?.subscriber_count || 0) - (a.channel?.subscriber_count || 0));
    } else if (sortBy === 'name_asc') {
      sorted.sort((a, b) => (a.channel?.name || '').localeCompare(b.channel?.name || ''));
    }
    return sorted;
  }, [rows, filter, sortBy]);

  if (!clientId) {
    return (
      <div style={emptyShellStyle}>
        <div style={emptyHeaderStyle}>Cohort roles</div>
        <div style={emptyBodyStyle}>
          Pick a client from <strong style={{ color: 'var(--text)' }}>Portfolio → Clients</strong> first.
        </div>
      </div>
    );
  }

  const handleRoleChange = async (channelId, role) => {
    setPending(p => ({ ...p, [channelId]: 'updating' }));
    const res = await updateCohortRole({ clientId, channelId, role });
    if (res.ok) {
      setRows(prev => prev.map(r => r.channel_id === channelId ? { ...r, cohort_role: role, cohort_role_updated_at: new Date().toISOString() } : r));
      const comp = await getCohortComposition(clientId);
      setComposition(comp);
      setPending(p => { const next = { ...p }; delete next[channelId]; return next; });
    } else {
      setPending(p => ({ ...p, [channelId]: 'error' }));
    }
  };


  // Cohort fit diagnostic — only meaningful if we have a client subscriber count + peer-tier data
  const clientSubCount = activeClient?.subscriber_count;
  const peerAvg = composition?.peer_avg_subscribers;
  const aspAvg  = composition?.aspirational_avg_subscribers;
  const peerGap = (clientSubCount && peerAvg)
    ? Math.round((peerAvg / clientSubCount) * 10) / 10  // e.g., 1.2x
    : null;

  return (
    <div style={workspaceShellStyle}>
      <div style={workspaceHeaderStyle}>
        <div style={kickerStyle}>Strategy · Cohort roles</div>
        <h1 style={titleStyle}>
          {activeClient.name}
          <span style={{ marginLeft: 12, display: 'inline-block', verticalAlign: 'middle' }}>
            <PrelaunchBadge client={activeClient} />
          </span>
        </h1>
        <div style={subtitleStyle}>
          Separate predictive ground truth (peer) from directional intelligence (aspirational) and
          case-study (reference) channels. The scorer reads only peer-tagged channels for prediction;
          aspirational and reference stay visible in monitoring surfaces.
        </div>
        <div style={{ marginTop: 10 }}>
          <DataFreshnessBadge clientId={clientId} />
        </div>
      </div>

      {bootLoading && <Note tone="info">Loading cohort…</Note>}
      {bootError && <Note tone="error">{bootError}</Note>}

      {!bootLoading && rows.length === 0 && (
        <Note tone="warn">
          No competitor channels linked to this client yet. Add competitors via{' '}
          <strong>Research → Competitors</strong> first.
        </Note>
      )}

      {!bootLoading && rows.length > 0 && (
        <>
          <CompositionPanel
            composition={composition}
            clientSubCount={clientSubCount}
            peerAvg={peerAvg}
            aspAvg={aspAvg}
            peerGap={peerGap}
          />

          <RoleLegend />

          <Controls
            filter={filter}
            onFilterChange={setFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
            composition={composition}
          />

          <CohortTable
            rows={displayRows}
            pending={pendingUpdates}
            onRoleChange={handleRoleChange}
          />

          <NextStepCard
            setTab={onNavigate}
            nextTab="repositioning"
            label="Re-run the repositioning audit"
            description="Re-tagging channels changes the predictive cohort. Run a fresh audit to see how systemic gaps and strengths shift now that aspirational / reference channels are excluded from the scorer."
          />
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Composition panel
// ──────────────────────────────────────────────────

function CompositionPanel({ composition, clientSubCount, peerAvg, aspAvg, peerGap }) {
  if (!composition) return null;
  return (
    <div style={panelStyle}>
      <div style={kickerSmallStyle}>Cohort composition</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 10 }}>
        <CompositionCard role="peer"         count={composition.peer}         avg={peerAvg} />
        <CompositionCard role="aspirational" count={composition.aspirational} avg={aspAvg} />
        <CompositionCard role="reference"    count={composition.reference}    avg={null} />
      </div>

      {clientSubCount && peerAvg && peerGap != null && (
        <div style={fitDiagnosticStyle(peerGap)}>
          <div style={{ fontSize: 11, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Cohort-fit diagnostic
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
            Your channel: <strong>{formatSubs(clientSubCount)}</strong>{' '}subs ·
            {' '}Peer cohort avg: <strong>{formatSubs(peerAvg)}</strong>{' '}({peerGap}x){' '}
            {peerGap > 3 && <span style={{ color: "var(--warn)" }}>
              · Peer cohort is significantly larger than client. Consider re-tagging some peers as aspirational.
            </span>}
            {peerGap <= 3 && peerGap >= 0.3 && <span style={{ color: "var(--pos-deep)" }}>
              · Peer cohort is in scale range. Predictions should be more reliable.
            </span>}
            {peerGap < 0.3 && <span style={{ color: "var(--warn)" }}>
              · Peer cohort is significantly smaller than client. Topic/cadence signals may not reflect client's audience tier.
            </span>}
          </div>
        </div>
      )}
    </div>
  );
}

function CompositionCard({ role, count, avg }) {
  const color = ROLE_COLORS[role];
  return (
    <div style={compCardStyle(color)}>
      <div style={{ fontSize: 11, color, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
        {ROLE_LABELS[role]}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{count}</div>
      <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 2 }}>
        {count === 1 ? 'channel' : 'channels'}
        {avg != null && ` · avg ${formatSubs(avg)} subs`}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Role legend
// ──────────────────────────────────────────────────

function RoleLegend() {
  return (
    <details style={{ marginTop: 12 }}>
      <summary style={legendSummaryStyle}>▸ What do the roles mean?</summary>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {COHORT_ROLES.map(role => (
          <div key={role} style={legendItemStyle(ROLE_COLORS[role])}>
            <strong style={{ color: ROLE_COLORS[role], textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11 }}>
              {ROLE_LABELS[role]}
            </strong>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4, marginTop: 2 }}>
              {ROLE_DESCRIPTIONS[role]}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

// ──────────────────────────────────────────────────
// Controls
// ──────────────────────────────────────────────────

function Controls({ filter, onFilterChange, sortBy, onSortChange, composition }) {
  return (
    <div style={controlsStyle}>
      <div style={{ display: 'flex', gap: 4 }}>
        <FilterChip label={`All (${composition?.total || 0})`} active={filter === 'all'} onClick={() => onFilterChange('all')} />
        {COHORT_ROLES.map(role => (
          <FilterChip
            key={role}
            label={`${ROLE_LABELS[role]} (${composition?.[role] || 0})`}
            color={ROLE_COLORS[role]}
            active={filter === role}
            onClick={() => onFilterChange(role)}
          />
        ))}
      </div>
      <select value={sortBy} onChange={e => onSortChange(e.target.value)} style={selectStyle}>
        <option value="subs_desc">Sort: subs ↓</option>
        <option value="name_asc">Sort: name ↑</option>
      </select>
    </div>
  );
}

function FilterChip({ label, color = 'var(--outline)', active, onClick }) {
  return (
    <button onClick={onClick} style={filterChipStyle(active, color)}>
      {label}
    </button>
  );
}

// ──────────────────────────────────────────────────
// Cohort table
// ──────────────────────────────────────────────────

function CohortTable({ rows, pending, onRoleChange }) {
  if (!rows.length) {
    return (
      <div style={{ fontSize: 12, color: 'var(--outline)', padding: 20, textAlign: 'center' }}>
        No channels match this filter.
      </div>
    );
  }
  return (
    <div style={tableShellStyle}>
      {rows.map(r => (
        <CohortRow
          key={r.channel_id}
          row={r}
          pending={pending[r.channel_id]}
          onRoleChange={onRoleChange}
        />
      ))}
    </div>
  );
}

function CohortRow({ row, pending, onRoleChange }) {
  const ch = row.channel || {};
  const color = ROLE_COLORS[row.cohort_role] || 'var(--outline)';
  return (
    <div style={rowStyle(color)}>
      {ch.thumbnail_url && (
        <img src={ch.thumbnail_url} alt="" style={thumbStyle} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={rowTitleStyle}>{ch.name || '(unnamed)'}</div>
        <div style={rowMetaStyle}>
          {ch.subscriber_count > 0 && `${formatSubs(ch.subscriber_count)} subs`}
          {ch.category && ` · ${ch.category}`}
          {ch.youtube_channel_id && (
            <a
              href={`https://youtube.com/channel/${ch.youtube_channel_id}`}
              target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--faint)', marginLeft: 8, fontSize: 11 }}
            >
YouTube
</a>
          )}
        </div>
      </div>
      <select
        value={row.cohort_role}
        onChange={e => onRoleChange(row.channel_id, e.target.value)}
        disabled={pending === 'updating'}
        style={roleSelectStyle(color, pending === 'updating')}
      >
        {COHORT_ROLES.map(role => (
          <option key={role} value={role}>{ROLE_LABELS[role]}</option>
        ))}
      </select>
      {pending === 'updating' && <span style={{ fontSize: 10, color: 'var(--faint)' }}>saving…</span>}
      {pending === 'error' && <span style={{ fontSize: 10, color: "var(--neg-text)" }}>error</span>}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

function formatSubs(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function Note({ tone, children }) {
  const palette = {
    info:  { bg: 'rgba(10,145,155,0.08)',  border: 'rgba(10,145,155,0.25)',  fg: 'var(--accent-text)' },
    warn:  { bg: 'rgba(232,168,43,0.08)',  border: 'rgba(232,168,43,0.30)',  fg: 'var(--warn)' },
    error: { bg: 'rgba(239,107,107,0.08)', border: 'rgba(239,107,107,0.30)', fg: 'var(--neg-text)' },
  }[tone] || { bg: 'var(--input-bg)', border: 'var(--outline-variant)', fg: 'var(--muted)' };
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
  fontSize: 11, color: 'var(--accent-text)',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 4,
};
const kickerSmallStyle = {
  fontSize: 10, color: 'var(--outline)',
  textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6,
};
const titleStyle = { fontSize: 24, fontWeight: 700, color: 'var(--ink)', margin: 0 };
const subtitleStyle = { fontSize: 13, color: 'var(--outline)', marginTop: 6, lineHeight: 1.5, maxWidth: 800 };

const emptyShellStyle = { padding: '60px 24px', maxWidth: 720, margin: '0 auto', textAlign: 'center' };
const emptyHeaderStyle = {
  fontSize: 14, color: 'var(--accent-text)',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 14,
};
const emptyBodyStyle = { fontSize: 14, color: 'var(--outline)', lineHeight: 1.6 };

const panelStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderLeft: '2px solid var(--border)',
  borderRadius: 6, padding: 14, marginTop: 14,
};
const compCardStyle = (color) => ({
  background: 'var(--input-bg)',
  border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
  borderLeft: '2px solid var(--border)',
  borderRadius: 5, padding: 12,
});
const fitDiagnosticStyle = (_peerGap) => ({
  background: 'var(--input-bg)',
  border: '1px dashed #2a2a30',
  borderRadius: 5, padding: 10, marginTop: 12,
});

const legendSummaryStyle = {
  fontSize: 11, color: 'var(--outline)', fontWeight: 600,
  letterSpacing: 0.3, cursor: 'pointer', listStyle: 'none',
};
const legendItemStyle = (_color) => ({
  background: 'var(--input-bg)',
  borderLeft: '2px solid var(--border)',
  borderRadius: 4, padding: '8px 12px',
});

const controlsStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginTop: 14, marginBottom: 10, gap: 12, flexWrap: 'wrap',
};
const filterChipStyle = (active, color) => ({
  background: active ? `color-mix(in srgb, ${color} 13%, transparent)` : 'var(--input-bg)',
  color: active ? color : 'var(--outline)',
  border: `1px solid ${active ? `color-mix(in srgb, ${color} 33%, transparent)` : 'var(--outline-variant)'}`,
  borderRadius: 4, padding: '5px 12px',
  fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.3,
});
const selectStyle = {
  background: 'var(--input-bg)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 5,
  padding: '6px 10px', fontSize: 12, cursor: 'pointer',
};

const tableShellStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
const rowStyle = (_color) => ({
  display: 'flex', alignItems: 'center', gap: 12,
  background: 'var(--input-bg)',
  border: '1px solid var(--border)', borderLeft: '2px solid var(--border)',
  borderRadius: 4, padding: '8px 12px',
});
const thumbStyle = {
  width: 36, height: 36, borderRadius: '50%', objectFit: 'cover',
  background: 'var(--bg)', flexShrink: 0,
};
const rowTitleStyle = {
  fontSize: 13, fontWeight: 600, color: 'var(--ink)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const rowMetaStyle = { fontSize: 11, color: 'var(--outline)', marginTop: 2 };
const roleSelectStyle = (color, disabled) => ({
  background: 'var(--card)', color,
  border: `1px solid color-mix(in srgb, ${color} 33%, transparent)`,
  borderRadius: 4, padding: '4px 10px',
  fontSize: 11, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  letterSpacing: 0.3, opacity: disabled ? 0.5 : 1,
});
