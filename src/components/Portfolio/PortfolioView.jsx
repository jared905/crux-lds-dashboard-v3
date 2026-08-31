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
import {useEffect, useMemo, useState} from 'react';
import {
  listPortfolio,
  setClientNetwork,
  renameNetwork,
  deleteNetwork,
  updateClientStage,
  LIFECYCLE_STAGES,
} from '../../services/portfolioService.js';
import { AlertTriangle, ExternalLink, Loader, RefreshCw, Sparkles } from 'lucide-react';
import AddPrelaunchClientModal from './AddPrelaunchClientModal.jsx';
import ChannelIssuesModal from '../ResearchV2/ChannelIssuesModal.jsx';
import StrategySpine from './StrategySpine.jsx';

export default function PortfolioView({ onNavigate } = {}) {
  const [clients, setClients] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  // Drilldown into one client's failing competitor cohort. Opened from
  // the "Resolve N sync errors" next-action chip.
  const [issuesClient, setIssuesClient] = useState(null);
  // Master/detail: when set, the spine view fills the page in place of
  // the client list. Clicking a client name opens it; back button clears.
  const [openSpineClient, setOpenSpineClient] = useState(null);
  // Pre-launch client creation modal — onboard clients before they
  // have a YouTube channel to OAuth.
  const [prelaunchOpen, setPrelaunchOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPortfolio().then(({ clients: rows }) => {
      if (!cancelled) {
        setClients(rows);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [refreshTick]);

  const grouped = useMemo(() => {
    if (!clients) return null;
    const buckets = LIFECYCLE_STAGES.map(s => ({ ...s, rows: [] }));
    const unset = { id: 'unset', label: 'Unset', color: 'var(--faint)', sort: 99, rows: [] };
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



  // ── Networks: assign / rename / delete (tags derive from the data) ──
  const networkTags = useMemo(
    () => [...new Set((clients || []).map(c => c.networkTag).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [clients]
  );
  // Native prompt/alert are suppressed in some embedding contexts, so
  // "+ New network…" is an inline input in the row and errors come back
  // to the caller for inline display.
  const handleSetNetwork = async (clientId, tag) => {
    try {
      await setClientNetwork(clientId, tag || null);
      setRefreshTick(t => t + 1);
      return { ok: true };
    } catch (err) {
      const missing = /network_tag/.test(err?.message || '');
      return {
        ok: false,
        error: missing
          ? 'Needs migration 113 (adds the network column).'
          : (err?.message || 'Could not save.'),
      };
    }
  };
  const handleRenameNetwork = async (tag) => {
    const next = window.prompt(`Rename network "${tag}" to:`, tag)?.trim();
    if (!next || next === tag) return;
    await renameNetwork(tag, next);
    setRefreshTick(t => t + 1);
  };
  const handleDeleteNetwork = async (tag) => {
    const n = clients.filter(c => c.networkTag === tag).length;
    if (!window.confirm(`Delete network "${tag}"? Its ${n} client${n === 1 ? '' : 's'} keep their data and go back to "no network".`)) return;
    await deleteNetwork(tag);
    setRefreshTick(t => t + 1);
  };

  // Every branch below is wrapped so the pre-launch modal can live
  // OUTSIDE them, at a stable position in the tree.
  //
  // It used to be rendered separately inside the empty and populated
  // branches, and not at all in the loading branch. Creating a client
  // fired onCreated -> setRefreshTick -> the effect set loading=true ->
  // this component returned the loading branch -> the modal unmounted
  // mid-flow and lost all its state. The client WAS written to the
  // database; the strategist just saw the form reappear blank, with no
  // success panel and no error. Keeping one instance outside the
  // branches means a refresh can never tear it down.
  const renderContent = () => {
  if (openSpineClient) {
    return (
      <StrategySpine
        client={openSpineClient}
        onBack={() => setOpenSpineClient(null)}
        onNavigate={onNavigate}
      />
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--faint)' }}>
        <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ marginTop: 8, fontSize: 12 }}>Loading portfolio…</div>
      </div>
    );
  }

  if (!clients?.length) {
    return (
      <div style={{ padding: '24px 28px', maxWidth: 1500, margin: '0 auto' }}>
        <Header total={0} onAddPrelaunch={() => setPrelaunchOpen(true)} />
        <div style={{ padding: 40, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 24, textAlign: 'center', color: 'var(--outline)' }}>
          <div style={{ marginBottom: 16 }}>No clients yet.</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setPrelaunchOpen(true)}
              style={{ background: 'var(--tert)', color: 'var(--on-tert)', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Sparkles size={13} /> Add pre-launch client
            </button>
            <div style={{ alignSelf: 'center', fontSize: 12, color: 'var(--faint)' }}>
              or use <strong>+ Add channels</strong> in Research to onboard one with an existing YouTube channel
            </div>
          </div>
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
        onAddPrelaunch={() => setPrelaunchOpen(true)}
        networkTags={networkTags}
        onRenameNetwork={handleRenameNetwork}
        onDeleteNetwork={handleDeleteNetwork}
      />

      {grouped.map(group => (
        <StageSection
          key={group.id}
          group={group}
          networkTags={networkTags}
          onSetNetwork={handleSetNetwork}
          onStageChange={handleStageChange}
          onOpenSyncErrors={(c) => setIssuesClient({ id: c.id, name: c.name })}
          onOpenSpine={(c) => setOpenSpineClient(c)}
        />
      ))}

      {issuesClient && (
        <ChannelIssuesModal
          view="failing"
          clientId={issuesClient.id}
          clientName={issuesClient.name}
          onClose={() => setIssuesClient(null)}
          onChanged={() => setRefreshTick(t => t + 1)}
        />
      )}
    </div>
  );
  };

  return (
    <>
      {renderContent()}
      <AddPrelaunchClientModal
        open={prelaunchOpen}
        onClose={() => setPrelaunchOpen(false)}
        onCreated={() => setRefreshTick(t => t + 1)}
        onNavigate={onNavigate}
      />
    </>
  );
}

function Header({ total, totals = [], onRefresh, onAddPrelaunch, networkTags = [], onRenameNetwork, onDeleteNetwork }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-label)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 4 }}>
          Portfolio · Clients
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--ink)", letterSpacing: '-0.02em', margin: 0 }}>
          Clients
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', marginLeft: 12 }}>
            {total} {total === 1 ? 'client' : 'clients'}
          </span>
        </h1>
        {networkTags.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-label)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Networks</span>
            {networkTags.map(t => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface-high)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 4px 2px 10px' }}>
                {t}
                <button onClick={() => onRenameNetwork?.(t)} title={`Rename "${t}"`}
                  style={{ background: 'transparent', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: '0 3px', fontSize: 11, fontFamily: 'inherit' }}>✎</button>
                <button onClick={() => onDeleteNetwork?.(t)} title={`Delete "${t}" (clients keep their data)`}
                  style={{ background: 'transparent', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: '0 3px', fontSize: 12, fontFamily: 'inherit' }}>×</button>
              </span>
            ))}
          </div>
        )}
        {totals.length > 0 && (
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--outline)', flexWrap: 'wrap' }}>
            {totals.map(s => (
              <span key={s.id}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color, marginRight: 5, verticalAlign: 'middle' }} />
                {s.label}: <strong style={{ color: 'var(--text)' }}>{s.count}</strong>
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onAddPrelaunch && (
          <button
            onClick={onAddPrelaunch}
            style={{ ...refreshBtn, background: 'var(--tert-bg)', borderColor: 'var(--tert-border)', color: 'var(--tert)' }}
            title="Add a client before they have a YouTube channel"
          >
            <Sparkles size={13} /> Add pre-launch client
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

function StageSection({ group, networkTags, onSetNetwork, onStageChange, onOpenSyncErrors, onOpenSpine }) {
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
        <h2 style={{ fontFamily: 'var(--font-label)', fontSize: 12, fontWeight: 700, color: "var(--ink)", margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {group.label}
        </h2>
        <span style={{ fontSize: 11, color: 'var(--faint)' }}>
          {group.rows.length} {group.rows.length === 1 ? 'client' : 'clients'}
        </span>
      </div>

      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 24,
        overflowX: 'auto', overflowY: 'hidden',
      }}>
        <table style={{ width: '100%', minWidth: 640, borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
          <thead style={{ background: 'var(--input-bg)' }}>
            <tr>
              <Th width="280px">Client</Th>
              <Th width="100px">Stage</Th>
              <Th width="130px">Network</Th>
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
              <ClientRow key={c.id} client={c} networkTags={networkTags} onSetNetwork={onSetNetwork} onStageChange={onStageChange} onOpenSyncErrors={onOpenSyncErrors} onOpenSpine={onOpenSpine} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientRow({ client: c, networkTags, onSetNetwork, onStageChange, onOpenSyncErrors, onOpenSpine }) {
  const coveragePct = Math.round(c.coverage * 100);
  // Network cell: reads as a quiet chip (or a "+ Network" invitation when
  // unassigned); the select only appears while editing, so new teammates
  // see what a network IS before they meet the control.
  const [editingNetwork, setEditingNetwork] = useState(false);
  const [newNetName, setNewNetName] = useState(null); // null = not typing a new one
  const [netErr, setNetErr] = useState(null);

  const applyNetwork = async (tag) => {
    setNetErr(null);
    const r = await onSetNetwork(c.id, tag);
    if (r?.ok) { setEditingNetwork(false); setNewNetName(null); }
    else setNetErr(r?.error || 'Could not save.');
  };
  // The next-action chip is clickable only when it surfaces sync errors,
  // since that's the one action we can route to a focused triage view.
  const canDrillNextAction = c.nextAction?.label?.startsWith?.('Resolve') && c.erroringCount > 0;
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {c.thumbnail ? (
            <img src={c.thumbnail} alt="" loading="lazy"
              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--input-bg)', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <button
              onClick={() => onOpenSpine?.(c)}
              title="Open strategy spine"
              style={{
                background: 'transparent', border: 'none', padding: 0, margin: 0,
                cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: 600, color: "var(--ink)", fontSize: 13,
                textAlign: 'left', textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.textDecorationColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.textUnderlineOffset = '3px'; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
            >
              {c.name}
            </button>
            {c.customUrl && (
              <div style={{ fontSize: 11, color: 'var(--faint)' }}>{c.customUrl}</div>
            )}
            {c.isStub && (
              <div style={{ fontSize: 10, color: 'var(--tert)', marginTop: 2 }}>Label-only (no YouTube)</div>
            )}
          </div>
        </div>
      </Td>
      <Td><StagePicker value={c.stage} onChange={(stage) => onStageChange(c.id, stage)} /></Td>
      <Td>
        {editingNetwork ? (
          newNetName !== null ? (
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input
                autoFocus
                value={newNetName}
                maxLength={5}
                title="Networks are 5-character codes, e.g. LDSAP for LDS Apostles"
                onChange={e => setNewNetName(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newNetName.trim()) applyNetwork(newNetName.trim());
                  if (e.key === 'Escape') { setNewNetName(null); setEditingNetwork(false); setNetErr(null); }
                }}
                placeholder="LDSAP"
                style={{ width: 72, background: 'var(--input-bg)', border: '1px solid var(--outline-variant)', borderRadius: 8, padding: '4px 8px', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--font-label)', letterSpacing: '0.06em', textTransform: 'uppercase', outline: 'none' }}
              />
              <button
                onClick={e => { e.stopPropagation(); newNetName.trim() && applyNetwork(newNetName.trim()); }}
                disabled={!newNetName.trim()}
                style={{ background: 'var(--blue)', color: 'var(--on-accent)', border: 'none', borderRadius: 6, padding: '4px 9px', fontSize: 10, fontWeight: 700, cursor: newNetName.trim() ? 'pointer' : 'default', fontFamily: 'inherit', opacity: newNetName.trim() ? 1 : 0.5 }}
              >Add</button>
            </span>
          ) : (
          <select
            autoFocus
            value={c.networkTag || ''}
            onChange={e => {
              if (e.target.value === '__new__') { setNewNetName(''); return; }
              applyNetwork(e.target.value || null);
            }}
            onBlur={() => { if (newNetName === null && !netErr) setEditingNetwork(false); }}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--input-bg)', color: c.networkTag ? 'var(--text)' : 'var(--faint)',
              border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 11, padding: '4px 8px', maxWidth: 120,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <option value="">— none —</option>
            {networkTags.map(t => <option key={t} value={t}>{t}</option>)}
            <option value="__new__">+ New network…</option>
          </select>
          )
        ) : c.networkTag ? (
          <button
            onClick={e => { e.stopPropagation(); setEditingNetwork(true); }}
            title="Change network"
            style={{
              background: 'var(--blue-dim)', color: 'var(--accent-text)',
              border: '1px solid var(--accent-border)', borderRadius: 999,
              fontSize: 11, fontWeight: 600, padding: '3px 10px', maxWidth: 130,
              cursor: 'pointer', fontFamily: 'inherit',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {c.networkTag}
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setEditingNetwork(true); }}
            title="Assign this client to a network"
            style={{
              background: 'transparent', color: 'var(--faint)',
              border: '1px dashed var(--outline-variant)', borderRadius: 999,
              fontSize: 11, fontWeight: 500, padding: '3px 10px',
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--outline)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--faint)'; e.currentTarget.style.borderColor = 'var(--outline-variant)'; }}
          >
            + Network
          </button>
        )}
        {netErr && editingNetwork && (
          <div style={{ fontSize: 10, color: 'var(--neg-text)', marginTop: 4, maxWidth: 150, lineHeight: 1.4 }}>{netErr}</div>
        )}
      </Td>
      <Td align="right">
        <span style={{ color: c.pinnedCount === 0 ? "var(--neg-text)" : 'var(--text)', fontWeight: 600 }}>
          {c.pinnedCount}
        </span>
      </Td>
      <Td align="right">
        {c.pinnedCount === 0 ? (
          <span style={{ color: 'var(--faint)' }}>—</span>
        ) : (
          <span title={`${c.categorizedCount} of ${c.pinnedCount} pinned competitors have category assignments`}
                style={{ color: coveragePct >= 80 ? "var(--pos-text)" : coveragePct >= 50 ? "var(--warn-text)" : "var(--neg-text)", fontWeight: 600 }}>
            {coveragePct}%
          </span>
        )}
      </Td>
      <Td align="right">
        {c.erroringCount > 0 ? (
          <button
            onClick={() => onOpenSyncErrors?.(c)}
            title={`View the ${c.erroringCount} failing channel${c.erroringCount === 1 ? '' : 's'} in ${c.name}'s cohort`}
            style={{
              color: "var(--neg-text)", fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'transparent', border: 'none', padding: 0, margin: 0,
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
              fontVariantNumeric: 'tabular-nums', textDecoration: 'underline',
              textDecorationColor: 'rgba(248,113,113,0.4)', textUnderlineOffset: 3,
            }}
          >
            <AlertTriangle size={11} />{c.erroringCount}
          </button>
        ) : (
          <span style={{ color: 'var(--faint)' }}>0</span>
        )}
      </Td>
      <Td>
        <span style={{ color: 'var(--outline)', fontSize: 12 }}>
          {c.lastSyncedAt ? formatRelative(c.lastSyncedAt) : <span style={{ color: "var(--neg-text)" }}>never</span>}
        </span>
      </Td>
      <Td>
        <NextAction
          action={c.nextAction}
          onClick={canDrillNextAction ? () => onOpenSyncErrors?.(c) : null}
        />
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
        background: 'var(--input-bg)', color: 'var(--text)',
        border: '1px solid var(--border)', borderRadius: 8,
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

function NextAction({ action, onClick }) {
  if (!action) return null;
  const color = action.urgency === 'high' ? 'var(--neg-text)'
    : action.urgency === 'attention' ? 'var(--warn-text)'
    : 'var(--text)';
  const content = (
    <>
      {action.urgency !== 'normal' && <AlertTriangle size={11} />}
      {action.label}
    </>
  );
  const baseStyle = {
    fontSize: 12, color, fontWeight: action.urgency === 'normal' ? 500 : 600,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  };
  if (onClick) {
    return (
      <button
        onClick={onClick}
        style={{
          ...baseStyle,
          background: 'transparent', border: 'none', padding: 0, margin: 0,
          cursor: 'pointer', fontFamily: 'inherit',
          textDecoration: 'underline', textDecorationColor: 'rgba(251,191,36,0.4)',
          textUnderlineOffset: 3,
        }}
      >
        {content}
      </button>
    );
  }
  return <span style={baseStyle}>{content}</span>;
}

// ─── presentational ─────────────────────────────────────────────
function Th({ children, align = 'left', width }) {
  return (
    <th style={{
      width, textAlign: align,
      padding: '10px 14px', fontSize: 10, fontWeight: 600,
      fontFamily: 'var(--font-label)',
      color: 'var(--muted)', letterSpacing: '0.1em',
      textTransform: 'uppercase',
      borderBottom: '1px solid var(--border)',
      background: 'var(--input-bg)',
      position: 'sticky', top: 0, zIndex: 1,
    }}>{children}</th>
  );
}

function Td({ children, align = 'left' }) {
  return (
    <td style={{
      padding: '12px 14px', textAlign: align,
      verticalAlign: 'middle', color: 'var(--text)',
      fontVariantNumeric: 'tabular-nums',
    }}>{children}</td>
  );
}

const refreshBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 10,
  background: 'var(--input-bg)', color: 'var(--text)',
  border: '1px solid var(--border)', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
};

const iconLink = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 6, borderRadius: 8, color: 'var(--muted)',
  background: 'var(--input-bg)', border: '1px solid var(--border)',
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
