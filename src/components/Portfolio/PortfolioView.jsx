/**
 * Portfolio — operator-facing home view for the strategy team.
 *
 * One row per client, grouped by lifecycle stage. Designed so a
 * strategist can glance and know:
 *   - which clients need attention this week
 *   - where each client is in the engagement lifecycle
 *   - what next deliverable they owe
 *
 * Single-strategist today; multi-strategist scaffolding (ownership,
 * stage transitions) is in place for the hires-coming-soon case.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader, AlertTriangle, ChevronDown, ExternalLink, RefreshCw, EyeOff, Eye } from 'lucide-react';
import {
  listPortfolio,
  updateClientStage,
  setPortfolioRoot,
  LIFECYCLE_STAGES,
} from '../../services/portfolioService.js';

export default function PortfolioView() {
  const [clients, setClients] = useState(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPortfolio({ includeHidden }).then(({ clients: rows, hiddenCount: hc }) => {
      if (!cancelled) {
        setClients(rows);
        setHiddenCount(hc);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [refreshTick, includeHidden]);

  const grouped = useMemo(() => {
    if (!clients) return null;
    const buckets = LIFECYCLE_STAGES.map(s => ({ ...s, rows: [] }));
    const unset = { id: 'unset', label: 'Unset', color: '#555', sort: 99, rows: [] };
    for (const c of clients) {
      const target = buckets.find(b => b.id === c.stage) || unset;
      target.rows.push(c);
    }
    return [...buckets, ...(unset.rows.length ? [unset] : [])]
      .filter(b => b.rows.length > 0)
      .sort((a, b) => a.sort - b.sort);
  }, [clients]);

  const handleStageChange = async (clientId, stage) => {
    await updateClientStage(clientId, stage);
    setRefreshTick(t => t + 1);
  };

  const handleHide = async (clientId) => {
    await setPortfolioRoot(clientId, false);
    setRefreshTick(t => t + 1);
  };

  const handleShow = async (clientId) => {
    await setPortfolioRoot(clientId, true);
    setRefreshTick(t => t + 1);
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>
        <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ marginTop: 8, fontSize: 12 }}>Loading portfolio…</div>
      </div>
    );
  }

  if (!clients?.length) {
    return (
      <div style={{ padding: '24px 28px', maxWidth: 1500, margin: '0 auto' }}>
        <Header total={0} />
        <div style={{ padding: 40, background: '#131316', border: '1px solid #1f1f24', borderRadius: 10, textAlign: 'center', color: '#888' }}>
          No clients yet. Add a client in <strong>Settings → Clients</strong> or via <strong>+ Add channels</strong> in Research.
        </div>
      </div>
    );
  }

  const totals = LIFECYCLE_STAGES.map(s => ({
    ...s,
    count: clients.filter(c => c.stage === s.id).length,
  }));

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1500, margin: '0 auto' }}>
      <Header
        total={clients.length}
        totals={totals}
        onRefresh={() => setRefreshTick(t => t + 1)}
        hiddenCount={hiddenCount}
        includeHidden={includeHidden}
        onToggleHidden={() => setIncludeHidden(v => !v)}
      />

      {grouped.map(group => (
        <StageSection
          key={group.id}
          group={group}
          onStageChange={handleStageChange}
          onHide={handleHide}
          onShow={handleShow}
        />
      ))}
    </div>
  );
}

function Header({ total, totals = [], onRefresh, hiddenCount = 0, includeHidden = false, onToggleHidden }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px', margin: 0 }}>
          Clients
          <span style={{ fontSize: 13, fontWeight: 500, color: '#707070', marginLeft: 10 }}>
            Portfolio — {total} {total === 1 ? 'client' : 'clients'}
          </span>
        </h1>
        {totals.length > 0 && (
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: '#888', flexWrap: 'wrap' }}>
            {totals.map(s => (
              <span key={s.id}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color, marginRight: 5, verticalAlign: 'middle' }} />
                {s.label}: <strong style={{ color: '#d4d4d8' }}>{s.count}</strong>
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {hiddenCount > 0 && (
          <button
            onClick={onToggleHidden}
            title={includeHidden
              ? 'Hide sub-channels and other rows you marked hidden'
              : 'Show all rows including sub-channels you marked hidden'}
            style={{ ...refreshBtn, background: includeHidden ? '#1e3a5f' : '#18181c' }}
          >
            {includeHidden ? <Eye size={13} /> : <EyeOff size={13} />}
            {includeHidden ? `Hide ${hiddenCount} sub-channel${hiddenCount === 1 ? '' : 's'}` : `Show ${hiddenCount} hidden`}
          </button>
        )}
        {onRefresh && (
          <button onClick={onRefresh} style={refreshBtn} title="Refresh portfolio">
            <RefreshCw size={13} /> Refresh
          </button>
        )}
      </div>
    </div>
  );
}

function StageSection({ group, onStageChange, onHide, onShow }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10, paddingLeft: 2,
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: group.color, display: 'inline-block',
        }} />
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.1px' }}>
          {group.label}
        </h2>
        <span style={{ fontSize: 11, color: '#666' }}>
          {group.rows.length} {group.rows.length === 1 ? 'client' : 'clients'}
        </span>
      </div>

      <div style={{
        background: '#131316', border: '1px solid #1f1f24', borderRadius: 10,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
          <thead style={{ background: '#16161a' }}>
            <tr>
              <Th width="280px">Client</Th>
              <Th width="100px">Stage</Th>
              <Th align="right" width="100px">Pinned</Th>
              <Th align="right" width="120px">Categorized</Th>
              <Th align="right" width="100px">Sync errors</Th>
              <Th width="100px">Last sync</Th>
              <Th width="220px">Next action</Th>
              <Th width="80px" />
            </tr>
          </thead>
          <tbody>
            {group.rows.map(c => (
              <ClientRow key={c.id} client={c} onStageChange={onStageChange} onHide={onHide} onShow={onShow} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientRow({ client: c, onStageChange, onHide, onShow }) {
  const coveragePct = Math.round(c.coverage * 100);
  const isHidden = c.isPortfolioRoot === false;
  return (
    <tr style={{ borderTop: '1px solid #1c1c20', opacity: isHidden ? 0.55 : 1 }}>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {c.thumbnail ? (
            <img src={c.thumbnail} alt="" loading="lazy"
              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#18181c', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.name}
            </div>
            {c.customUrl && (
              <div style={{ fontSize: 11, color: '#666' }}>{c.customUrl}</div>
            )}
            {c.isStub && (
              <div style={{ fontSize: 10, color: '#a78bfa', marginTop: 2 }}>Label-only (no YouTube)</div>
            )}
          </div>
        </div>
      </Td>
      <Td><StagePicker value={c.stage} onChange={(stage) => onStageChange(c.id, stage)} /></Td>
      <Td align="right">
        <span style={{ color: c.pinnedCount === 0 ? '#f87171' : '#d4d4d8', fontWeight: 600 }}>
          {c.pinnedCount}
        </span>
      </Td>
      <Td align="right">
        {c.pinnedCount === 0 ? (
          <span style={{ color: '#555' }}>—</span>
        ) : (
          <span title={`${c.categorizedCount} of ${c.pinnedCount} pinned competitors have category assignments`}
                style={{ color: coveragePct >= 80 ? '#34d399' : coveragePct >= 50 ? '#fbbf24' : '#f87171', fontWeight: 600 }}>
            {coveragePct}%
          </span>
        )}
      </Td>
      <Td align="right">
        {c.erroringCount > 0 ? (
          <span style={{ color: '#f87171', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={11} />{c.erroringCount}
          </span>
        ) : (
          <span style={{ color: '#555' }}>0</span>
        )}
      </Td>
      <Td>
        <span style={{ color: '#888', fontSize: 12 }}>
          {c.lastSyncedAt ? formatRelative(c.lastSyncedAt) : <span style={{ color: '#f87171' }}>never</span>}
        </span>
      </Td>
      <Td>
        <NextAction action={c.nextAction} />
      </Td>
      <Td>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {c.youtubeChannelId && !c.isStub && (
            <a href={`https://youtube.com/channel/${c.youtubeChannelId}`}
               target="_blank" rel="noreferrer"
               title="Open channel on YouTube"
               style={iconLink}>
              <ExternalLink size={13} />
            </a>
          )}
          {isHidden ? (
            <button
              onClick={() => onShow?.(c.id)}
              title="Show in portfolio — mark as portfolio root"
              style={iconLink}
            >
              <Eye size={13} />
            </button>
          ) : (
            <button
              onClick={() => onHide?.(c.id)}
              title="Hide from portfolio — mark as sub-channel (keeps OAuth/analytics access)"
              style={iconLink}
            >
              <EyeOff size={13} />
            </button>
          )}
        </div>
      </Td>
    </tr>
  );
}

function StagePicker({ value, onChange }) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      style={{
        background: '#18181c', color: '#d4d4d8',
        border: '1px solid #232328', borderRadius: 5,
        fontSize: 11, padding: '4px 8px',
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <option value="" disabled>— set —</option>
      {LIFECYCLE_STAGES.map(s => (
        <option key={s.id} value={s.id}>{s.label}</option>
      ))}
    </select>
  );
}

function NextAction({ action }) {
  if (!action) return null;
  const color = action.urgency === 'high' ? '#f87171'
    : action.urgency === 'attention' ? '#fbbf24'
    : '#d4d4d8';
  return (
    <span style={{
      fontSize: 12, color, fontWeight: action.urgency === 'normal' ? 500 : 600,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {action.urgency !== 'normal' && <AlertTriangle size={11} />}
      {action.label}
    </span>
  );
}

// ─── presentational ─────────────────────────────────────────────
function Th({ children, align = 'left', width }) {
  return (
    <th style={{
      width, textAlign: align,
      padding: '10px 14px', fontSize: 10, fontWeight: 700,
      color: '#707070', letterSpacing: '0.7px',
      textTransform: 'uppercase',
      borderBottom: '1px solid #1f1f24',
      background: '#16161a',
      position: 'sticky', top: 0, zIndex: 1,
    }}>{children}</th>
  );
}

function Td({ children, align = 'left' }) {
  return (
    <td style={{
      padding: '12px 14px', textAlign: align,
      verticalAlign: 'middle', color: '#d4d4d8',
      fontVariantNumeric: 'tabular-nums',
    }}>{children}</td>
  );
}

const refreshBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 6,
  background: '#18181c', color: '#d4d4d8',
  border: '1px solid #232328', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
};

const iconLink = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 6, borderRadius: 5, color: '#888',
  background: '#18181c', border: '1px solid #232328',
  cursor: 'pointer', textDecoration: 'none',
};

function formatRelative(iso) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return 'Today';
  if (d === 1) return '1d ago';
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}yr ago`;
}
