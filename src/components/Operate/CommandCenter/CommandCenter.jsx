/**
 * CommandCenter — cross-portfolio landing page.
 *
 * Replaces the single-client dashboard as the default first-page
 * experience. Single-client dashboard still accessible via
 * click-into-client from the client grid (Option A from the
 * 2026-06-12 decision).
 *
 * Three sections:
 *   1. Pulse strip — portfolio counters at the top of the fold
 *   2. Top alerts — the 3 highest-severity items from This Week,
 *      surfaced inline so the strategist sees what needs attention
 *      without an extra click
 *   3. Client grid — one card per client. Card shows status snapshot
 *      and click-through routes to the per-client dashboard
 *
 * Sales-credible — wide overview reads as institutional portfolio
 * management, not a single-channel dashboard.
 */

import {useEffect, useState, useMemo} from 'react';
import {
  AlertTriangle, AlertCircle, Info, ChevronRight,
  Users, Activity, ClipboardCheck, Wifi, Sparkles, RefreshCw,
  EyeOff, MoreVertical,
} from 'lucide-react';
import { loadCommandCenter } from '../../../services/commandCenterService.js';
import { dismissAlert, SNOOZE_OPTIONS } from '../../../services/alertDismissService.js';
import { setClientNetwork } from '../../../services/portfolioService.js';
import BrandLoader from '../../Shared/Loading.jsx';
import { Skeleton } from '../../Shared/Loading.jsx';

const SEVERITY_COLOR = {
  high:   'var(--neg-text)',
  medium: 'var(--warn)',
  low:    'var(--accent-text)',
};
const SEVERITY_ICON = {
  high:   AlertCircle,
  medium: AlertTriangle,
  low:    Info,
};

export default function CommandCenter({ clients, onClientChange, onNavigate }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const payload = await loadCommandCenter();
        if (!cancelled) setData(payload);
      } catch (err) {
        // There was no catch here at all, so a failed query became an
        // unhandled rejection and the page rendered its empty state - which
        // on this screen reads as "nothing needs your attention". Silence is
        // the one thing a portfolio alert view must never do.
        console.error('[CommandCenter] load failed:', err);
        if (!cancelled) {
          setLoadError(err?.message || 'Could not load the portfolio.');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshTick]);

  const handleOpenClient = (card, { forceTab = null } = {}) => {
    // Resolve the full client object from the parent's clients list
    const full = (clients || []).find(c => c.id === card.id) || { id: card.id, name: card.name };
    if (typeof onClientChange === 'function') onClientChange(full);
    // Routing precedence:
    //   1) Explicit forceTab (e.g. "Performance →" escape link on the card)
    //   2) Top alert's targetTab (alerted card click — the strategist
    //      came here to FIX the issue, not browse, per 2026-06-12 fix)
    //   3) Strategic State — the new default landing (Ship 2 of the
    //      Diagnostic Synthesis build, 2026-06-19). Replaces 'dashboard'
    //      because the strategist's first read on entering a client is
    //      "what's the strategic state?", not "show me the metric grid."
    const targetTab = forceTab
      || (card.topAlert?.targetTab)
      || 'strategic-state';
    if (typeof onNavigate === 'function') onNavigate(targetTab);
  };

  const handleAlertClick = (alert) => {
    if (alert.clientId) {
      const full = (clients || []).find(c => c.id === alert.clientId);
      if (full && typeof onClientChange === 'function') onClientChange(full);
    }
    if (alert.targetTab && typeof onNavigate === 'function') onNavigate(alert.targetTab);
  };

  // Assign / clear a client's network straight from the card corner.
  // No window.prompt/alert here — native dialogs are suppressed in some
  // embedding contexts (the in-app preview swallowed them: "+ New network
  // does nothing", 2026-08-21). The corner menu renders its own input and
  // shows errors inline from the returned result.
  const handleAssignNetwork = async (clientId, tag) => {
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

  const handleDismiss = async (alert, snoozeDays) => {
    await dismissAlert({
      clientId:   alert.clientId || null,
      alertType:  alert.type,
      snoozeDays,
    });
    // Refresh data so the alert disappears immediately
    setRefreshTick(t => t + 1);
  };

  return (
    <div style={shellStyle}>
      <div style={headerRowStyle}>
        <div>
          <div style={kickerStyle}>Portfolio · Command Center</div>
          <h1 style={titleStyle}>Portfolio</h1>
          <div style={subtitleStyle}>
            One view of every client, every alert, and every installation in flight.
            Click any card to drill into that client.
          </div>
        </div>
        <button onClick={() => setRefreshTick(t => t + 1)} style={refreshBtnStyle} disabled={loading}>
          <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : null} /> Refresh
        </button>
      </div>

      {loading && !data && (
        <div>
          <BrandLoader label="Reading the portfolio — every client, every alert…" style={{ padding: '28px 20px 20px' }} />
          {/* skeleton pulse strip in the shape of the real one */}
          <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px' }}>
                <Skeleton w="55%" h={8} style={{ marginBottom: 10 }} />
                <Skeleton w="35%" h={18} />
              </div>
            ))}
          </div>
        </div>
      )}

      {loadError && !loading && (
        <div role="alert" style={{
          background: "var(--card)",
          border: '1px solid #4a2c2c',
          borderRadius: 8,
          padding: '16px 18px',
          margin: '4px 0 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <AlertCircle size={15} style={{ color: "var(--neg-text)" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              Couldn’t load the portfolio
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, marginBottom: 12 }}>
            This is a load failure, not an all-clear — there may be alerts you
            aren’t seeing. Nothing below is showing until it succeeds.
          </div>
          <div style={{
            fontSize: 12, color: "var(--neg-text)", fontFamily: 'monospace',
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 5,
            padding: '8px 10px', marginBottom: 12, wordBreak: 'break-word',
          }}>
            {loadError}
          </div>
          <button onClick={() => setRefreshTick(t => t + 1)} style={refreshBtnStyle}>
            <RefreshCw size={12} /> Try again
          </button>
        </div>
      )}

      {data && (
        <>
          {/* ─── Pulse strip ─── */}
          <PulseStrip pulse={data.pulse} />

          {/* ─── Top alerts ─── */}
          {data.topAlerts.length > 0 ? (
            <TopAlerts alerts={data.topAlerts} allAlerts={data.allAlerts} onClick={handleAlertClick} onDismiss={handleDismiss} totalAlerts={data.pulse.alertsBySeverity.total} />
          ) : (
            <NoAlertsCard />
          )}

          {/* ─── Client grid ─── */}
          {data.clientCards.length === 0 ? (
            <Note tone="info">No clients yet — add your first from the Manage Clients button, top right.</Note>
          ) : (
            <ClientGrid cards={data.clientCards} onOpen={(card, opts) => handleOpenClient(card, opts)} onAssignNetwork={handleAssignNetwork} />
          )}
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Pulse strip
// ──────────────────────────────────────────────────

function PulseStrip({ pulse }) {
  const intakePct = pulse.avgIntakeCompletionPct;
  const items = [
    { icon: Users,          label: 'Clients',          value: pulse.totalClients,                                   detail: `${pulse.prelaunchCount} pre-launch` },
    { icon: Wifi,           label: 'Channels connected',     value: `${pulse.oauthHealthPct}%`,                           detail: `${pulse.oauthActiveCount} active`, accent: pulse.oauthHealthPct >= 80 ? 'var(--pos-text)' : pulse.oauthHealthPct >= 50 ? 'var(--warn)' : 'var(--neg-text)' },
    { icon: AlertCircle,    label: 'Alerts',           value: pulse.alertsBySeverity.total,                         detail: `${pulse.alertsBySeverity.high} high · ${pulse.alertsBySeverity.medium} med`, accent: pulse.alertsBySeverity.high > 0 ? 'var(--neg-text)' : pulse.alertsBySeverity.medium > 0 ? 'var(--warn)' : 'var(--pos-text)' },
    { icon: ClipboardCheck, label: 'Onboarding progress',     value: intakePct == null ? '—' : `${intakePct}%`,           detail: intakePct == null ? 'not started yet' : `across ${pulse.intakeStartedClients} client${pulse.intakeStartedClients === 1 ? '' : 's'}`, accent: intakePct == null ? 'var(--faint)' : intakePct >= 75 ? 'var(--pos-text)' : intakePct >= 40 ? 'var(--warn)' : 'var(--faint)' },
    { icon: Activity,       label: 'Client sign-off',   value: pulse.intakePendingCount,                             detail: `waiting on the client`, accent: pulse.intakePendingCount > 0 ? 'var(--warn)' : 'var(--faint)' },
  ];
  return (
    <div style={pulseStripStyle}>
      {items.map((it, i) => (
        <div key={i} style={pulseCellStyle}>
          <div style={pulseLabelRowStyle}>
            <it.icon size={11} style={{ color: it.accent || 'var(--outline)' }} />
            <span style={pulseLabelStyle}>{it.label}</span>
          </div>
          <div style={pulseValueStyle(it.accent)}>{it.value}</div>
          <div style={pulseDetailStyle}>{it.detail}</div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Top alerts
// ──────────────────────────────────────────────────

function TopAlerts({ alerts, allAlerts = [], onClick, onDismiss, totalAlerts }) {
  // "See all" expands in place — the separate This Week page this used
  // to link to was the same feed under a different header (folded in,
  // 2026-08-20 reduction).
  const [expanded, setExpanded] = useState(false);
  const shown = expanded && allAlerts.length > alerts.length ? allAlerts : alerts;
  // Group by alert type.
  //
  // Every alert of the same kind carries the same `description`, so three
  // clients missing peer tags rendered as three near-identical rows with the
  // same two-line explanation repeated verbatim. That is most of the visual
  // weight of this section for one piece of information. Collapse them into
  // a single row that names the affected clients and explains once; expand
  // to act on an individual client.
  const groups = useMemo(() => {
    const m = new Map();
    for (const a of shown) {
      const key = a.label || 'Other';
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(a);
    }
    return [...m.values()];
  }, [shown]);

  return (
    <div style={alertsSectionStyle}>
      <div style={sectionHeaderStyle}>
        <span style={sectionKickerStyle}>Needs attention</span>
        {totalAlerts > alerts.length && (
          <button onClick={() => setExpanded(e => !e)} style={seeAllBtnStyle}>
            {expanded ? 'Show fewer' : `See all ${totalAlerts}`}
            <ChevronRight size={11} style={{ transform: expanded ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {groups.map((items, i) =>
          items.length === 1 ? (
            <AlertRow key={i} alert={items[0]} onClick={() => onClick(items[0])} onDismiss={(days) => onDismiss(items[0], days)} />
          ) : (
            <AlertGroup key={i} items={items} onClick={onClick} onDismiss={onDismiss} />
          )
        )}
      </div>
    </div>
  );
}

function AlertGroup({ items, onClick, _onDismiss }) {
  const [open, setOpen] = useState(false);
  const first = items[0];
  const Icon = SEVERITY_ICON[first.severity] || Info;
  const color = SEVERITY_COLOR[first.severity] || 'var(--faint)';
  const names = items.map((a) => a.clientName).filter(Boolean);

  return (
    <div style={alertRowWrapStyle(color)}>
      <button onClick={() => setOpen((o) => !o)} style={{ ...alertRowButtonStyle, flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <Icon size={14} style={{ color, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, marginBottom: 2 }}>
              <span style={{ color: 'var(--outline)', marginRight: 6 }}>{items.length} clients &middot;</span>
              {first.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--outline)', lineHeight: 1.4 }}>
              {names.join(', ')}
            </div>
            {open && (
              <div style={{ fontSize: 11, color: 'var(--outline)', lineHeight: 1.45, marginTop: 6 }}>
                {first.description}
              </div>
            )}
          </div>
          <ChevronRight
            size={12}
            style={{ color: 'var(--faint)', flexShrink: 0, marginTop: 4, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}
          />
        </div>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 10px 8px 34px', width: '100%' }}>
          {items.map((a, i) => (
            <button
              key={i}
              onClick={() => onClick(a)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'transparent', border: '1px solid var(--border)', borderRadius: 5,
                padding: '6px 9px', cursor: 'pointer', fontSize: 11, color: 'var(--text)', textAlign: 'left',
              }}
            >
              <span>{a.clientName}</span>
              <ChevronRight size={11} style={{ color: 'var(--faint)' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert, onClick, onDismiss }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = SEVERITY_ICON[alert.severity] || Info;
  const color = SEVERITY_COLOR[alert.severity] || 'var(--faint)';
  return (
    <div style={alertRowWrapStyle(color)}>
      <button onClick={onClick} style={alertRowButtonStyle}>
        <Icon size={14} style={{ color, flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, marginBottom: 2 }}>
            {alert.clientName && <span style={{ color: 'var(--outline)', marginRight: 6 }}>{alert.clientName} ·</span>}
            {alert.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--outline)', lineHeight: 1.4 }}>{alert.description}</div>
        </div>
        <ChevronRight size={12} style={{ color: 'var(--faint)', flexShrink: 0, marginTop: 4 }} />
      </button>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(m => !m); }}
          style={alertMenuBtnStyle}
          title="Ignore options"
          aria-label="Ignore alert"
        >
          <MoreVertical size={12} />
        </button>
        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={menuBackdropStyle} />
            <div style={dismissMenuStyle}>
              <div style={dismissMenuHeaderStyle}>
                <EyeOff size={10} /> Ignore for
              </div>
              {SNOOZE_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDismiss(opt.value); }}
                  style={dismissMenuItemStyle}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NoAlertsCard() {
  return (
    <div style={noAlertsStyle}>
      <Sparkles size={14} style={{ color: "var(--pos-deep)" }} />
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        Nothing needs you right now. Genuinely. A quiet stretch is for proactive work:
        review one client's strategy, push a brief, or start an install conversation.
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Client grid
// ──────────────────────────────────────────────────

function ClientGrid({ cards, onOpen, onAssignNetwork }) {
  // Network filter — every client shows by default; the chips narrow to
  // one network (e.g. the LDS apostles' channels) when wanted.
  const [networkFilter, setNetworkFilter] = useState(null); // null = all, '' = no network, else tag
  const networks = useMemo(() => {
    const counts = new Map();
    for (const c of cards) {
      const t = c.networkTag || '';
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    const tags = [...counts.entries()].filter(([t]) => t !== '').sort((a, b) => a[0].localeCompare(b[0]));
    return { tags, untagged: counts.get('') || 0 };
  }, [cards]);
  const [sortBy, setSortBy] = useState('alpha');
  const visible = useMemo(() => {
    const filtered = networkFilter == null
      ? cards
      : cards.filter(c => (c.networkTag || '') === networkFilter);
    const sorted = [...filtered];
    if (sortBy === 'subs') {
      sorted.sort((a, b) => (b.subscriberCount || 0) - (a.subscriberCount || 0));
    } else if (sortBy === 'recent') {
      // most recent upload first; never-uploaded sinks to the bottom
      const t = (c) => c.lastUploadAt ? new Date(c.lastUploadAt).getTime() : -Infinity;
      sorted.sort((a, b) => t(b) - t(a));
    } else {
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return sorted;
  }, [cards, networkFilter, sortBy]);

  const filterChip = (active) => ({
    background: active ? 'rgba(0, 209, 255, 0.14)' : 'var(--input-bg)',
    color: active ? 'var(--accent-text)' : 'var(--muted)',
    border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`,
    borderRadius: 999, padding: '3px 12px',
    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={gridSectionStyle}>
      <div style={sectionHeaderStyle}>
        <span style={sectionKickerStyle}>Clients ({visible.length}{networkFilter != null ? ` of ${cards.length}` : ''})</span>
        {networks.tags.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={filterChip(networkFilter == null)} onClick={() => setNetworkFilter(null)}>All</button>
            {networks.tags.map(([tag, n]) => (
              <button key={tag} style={filterChip(networkFilter === tag)} onClick={() => setNetworkFilter(networkFilter === tag ? null : tag)}>
                {tag} · {n}
              </button>
            ))}
            {networks.untagged > 0 && (
              <button style={filterChip(networkFilter === '')} onClick={() => setNetworkFilter(networkFilter === '' ? null : '')}>
                No network · {networks.untagged}
              </button>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>
            No networks yet — tag a client via its card's + NTWRK corner to filter here.
          </span>
        )}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          aria-label="Sort clients"
          style={{
            marginLeft: 'auto',
            background: 'var(--input-bg)', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 8,
            fontSize: 11, fontWeight: 600, padding: '4px 8px',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <option value="alpha">A – Z</option>
          <option value="subs">Most subscribers</option>
          <option value="recent">Recent uploads</option>
        </select>
      </div>
      <div style={gridStyle}>
        {visible.map(c => (
          <ClientCard
            key={c.id}
            card={c}
            networkTags={networks.tags.map(([t]) => t)}
            onAssignNetwork={onAssignNetwork}
            onOpen={() => onOpen(c)}
            onOpenPerformance={() => onOpen(c, { forceTab: 'dashboard' })}
          />
        ))}
      </div>
    </div>
  );
}

function ClientCard({ card, networkTags = [], onAssignNetwork, onOpen, onOpenPerformance }) {
  const [networkMenuOpen, setNetworkMenuOpen] = useState(false);
  const [newNetName, setNewNetName] = useState(null); // null = not creating
  const [netErr, setNetErr] = useState(null);

  const closeNetworkMenu = () => { setNetworkMenuOpen(false); setNewNetName(null); setNetErr(null); };
  const assign = async (tag) => {
    setNetErr(null);
    const r = await onAssignNetwork(card.id, tag);
    if (r?.ok) closeNetworkMenu();
    else setNetErr(r?.error || 'Could not save.');
  };
  const sevColor = card.alertSeverityMax ? SEVERITY_COLOR[card.alertSeverityMax] : null;
  const hasAlerts = card.alertCount > 0;
  const TopSeverityIcon = card.alertSeverityMax ? SEVERITY_ICON[card.alertSeverityMax] : null;

  // Activity heartbeat — channel-pulse line shown for non-prospect clients
  const activityLine = (() => {
    if (card.noChannelStage) return null;
    if (card.videosLast30d > 0) {
      const lastUploadAge = card.lastUploadAt ? formatAge(card.lastUploadAt) : '?';
      return `${card.videosLast30d} video${card.videosLast30d === 1 ? '' : 's'} / 30d · last ${lastUploadAge} ago`;
    }
    if (card.lastUploadAt) {
      return `Quiet ${formatAge(card.lastUploadAt)}`;
    }
    return null;
  })();

  return (
    <div style={cardStyle(card.alertSeverityMax)}>
      {/* Network corner — 5-char chip top-right; quiet + NTWRK invite when
          unassigned so a new teammate can see and set it in place. */}
      {onAssignNetwork && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
          <button
            onClick={(e) => { e.stopPropagation(); if (networkMenuOpen) { setNetworkMenuOpen(false); setNewNetName(null); setNetErr(null); } else setNetworkMenuOpen(true); }}
            title={card.networkTag ? `Network: ${card.networkTag} — click to change` : 'Assign this client to a network'}
            style={card.networkTag ? {
              background: 'var(--blue-dim)', color: 'var(--accent-text)',
              border: '1px solid var(--accent-border)', borderRadius: 999,
              fontFamily: 'var(--font-label)', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
            } : {
              background: 'transparent', color: 'var(--faint)',
              border: '1px dashed var(--outline-variant)', borderRadius: 999,
              fontFamily: 'var(--font-label)', fontSize: 9, fontWeight: 600,
              letterSpacing: '0.06em', padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {card.networkTag ? card.networkTag.slice(0, 5).toUpperCase() : '+ NTWRK'}
          </button>
          {networkMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute', top: 24, right: 0, zIndex: 3, minWidth: 170,
                background: 'var(--surface-high)', border: '1px solid var(--outline-variant)',
                borderRadius: 10, padding: 4, boxShadow: 'var(--e-2)',
              }}>
              {networkTags.map(t => (
                <button key={t}
                  onClick={() => assign(t)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 6, padding: '6px 10px', color: t === card.networkTag ? 'var(--accent-text)' : 'var(--text)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >{t}</button>
              ))}
              {newNetName === null ? (
                <button
                  onClick={() => setNewNetName('')}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 6, padding: '6px 10px', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >+ New network…</button>
              ) : (
                <div style={{ display: 'flex', gap: 4, padding: '4px 6px', alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={newNetName}
                    maxLength={5}
                    onChange={(e) => setNewNetName(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter' && newNetName.trim()) assign(newNetName.trim()); if (e.key === 'Escape') setNewNetName(null); }}
                    placeholder="LDSAP"
                    title="Networks are 5-character codes, e.g. LDSAP for LDS Apostles"
                    style={{ flex: 1, minWidth: 0, background: 'var(--input-bg)', border: '1px solid var(--outline-variant)', borderRadius: 6, padding: '5px 8px', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-label)', letterSpacing: '0.06em', textTransform: 'uppercase', outline: 'none' }}
                  />
                  <button
                    onClick={() => newNetName.trim() && assign(newNetName.trim())}
                    disabled={!newNetName.trim()}
                    style={{ background: 'var(--blue)', color: 'var(--on-accent)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: newNetName.trim() ? 'pointer' : 'default', fontFamily: 'inherit', opacity: newNetName.trim() ? 1 : 0.5 }}
                  >Add</button>
                </div>
              )}
              {newNetName !== null && (
                <div style={{ padding: '2px 8px 4px', fontSize: 10, color: 'var(--faint)' }}>max 5 characters — e.g. LDSAP</div>
              )}
              {card.networkTag && (
                <button
                  onClick={() => assign(null)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 6, padding: '6px 10px', color: 'var(--faint)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >Remove from network</button>
              )}
              {netErr && (
                <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--neg-text)', lineHeight: 1.4, maxWidth: 200 }}>{netErr}</div>
              )}
            </div>
          )}
        </div>
      )}
      <button onClick={onOpen} style={cardButtonStyle} aria-label={hasAlerts ? `Fix ${card.alertCount} alert(s) for ${card.name}` : `Open ${card.name}`}>
        {/* Identity: who this is, at a glance */}
        <div style={cardHeaderStyle}>
          {card.thumbnailUrl
            ? <img src={card.thumbnailUrl} alt="" style={cardThumbStyle} />
            : <div style={{ ...cardThumbStyle, background: 'var(--input-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'var(--outline)', fontWeight: 700 }}>{(card.name || '?').slice(0, 2).toUpperCase()}</div>
          }
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={cardHeaderTopRowStyle}>
              <div style={cardNameStyle}>{card.name}</div>
            </div>
          </div>
        </div>

        {/* The one big number: where the audience stands */}
        <div style={{ margin: '12px 0 10px' }}>
          {card.noChannelStage ? (
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--outline)' }}>No channel yet</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {formatCompact(card.subscriberCount)}
              </span>
              <span style={{ fontFamily: 'var(--font-label)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--faint)' }}>
                subscribers
              </span>
              {card.subDelta30d != null && card.subDelta30d !== 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: card.subDelta30d > 0 ? "var(--pos)" : "var(--neg-text)" }}>
                  {card.subDelta30d > 0 ? '+' : ''}{formatCompact(card.subDelta30d)} / 30d
                </span>
              )}
            </div>
          )}
        </div>

        <div style={cardBodyStyle}>
          {/* Activity heartbeat (real channels only) */}
          {activityLine && (
            <div style={activityLineStyle}>{activityLine}</div>
          )}

          <div style={cardMetaRowStyle}>
            {hasAlerts ? (
              <span style={metaPillStyle(sevColor)}>
                {TopSeverityIcon && <TopSeverityIcon size={9} />}
                {card.alertCount} alert{card.alertCount === 1 ? '' : 's'}
              </span>
            ) : (
              <span style={metaPillStyle("var(--pos-deep)")}>✓ healthy</span>
            )}
            {card.hasSyncError && (
              <span style={metaPillStyle("var(--neg-text)")}>sync error</span>
            )}
            {card.latestBriefAgeDays != null && (
              <span style={metaPillStyle(card.latestBriefAgeDays <= 7 ? "var(--pos-deep)" : card.latestBriefAgeDays <= 14 ? "var(--warn)" : 'var(--outline)')}>
                Brief {card.latestBriefAgeDays}d
              </span>
            )}
          </div>

          {/* Stage + top alert share one quiet row: "ACTIVE · → Fix: …"
              (user, 2026-08-21 — the name row gave ACTIVE too much attention). */}
          {(card.lifecycleStage || card.isPrelaunch || (hasAlerts && card.topAlert)) && (
            <div style={{ ...topAlertInlineStyle(), display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <StageBadge stage={card.lifecycleStage} isPrelaunch={card.isPrelaunch} />
              {(card.lifecycleStage || card.isPrelaunch) && hasAlerts && card.topAlert && (
                <span style={{ color: 'var(--faint)' }}>·</span>
              )}
              {hasAlerts && card.topAlert && (
                <span>
                  <span style={{ color: sevColor, fontWeight: 700 }}>→ Fix:</span>{' '}
                  <span style={{ color: 'var(--text)' }}>{card.topAlert.label}</span>
                </span>
              )}
            </div>
          )}

          <div style={cardFooterRowStyle}>
            <span style={{ fontSize: 10, color: 'var(--faint)' }}>
              {card.noChannelStage
                ? (card.isPrelaunch ? 'Pre-launch · awaiting channel' : 'Prospect · no channel yet')
                : card.lastSyncedAt ? `Last sync ${formatAge(card.lastSyncedAt)} ago` : 'Never synced'}
            </span>
            {/* Rendered unconditionally. This used to hide behind hasAlerts,
                which meant a HEALTHY client had no route to its own numbers
                from the card — the reward for being fine was a dead end. */}
            <span
              onClick={(e) => { e.stopPropagation(); onOpenPerformance(); }}
              style={escapeLinkStyle}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onOpenPerformance(); } }}
            >
              Performance <ChevronRight size={9} />
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

function StageBadge({ stage, isPrelaunch }) {
  if (isPrelaunch) return <span style={stageBadgeStyle('var(--tert)')}>PRE-LAUNCH</span>;
  if (!stage) return null;
  const labels = {
    prospect:      { text: 'PROSPECT',   color: 'var(--outline)' },
    non_oauth:     { text: 'NON-OAUTH',  color: 'var(--accent-text)' },
    oauth_active:  { text: 'ACTIVE',     color: 'var(--pos-text)' },
    oauth_renewal: { text: 'RENEWAL',    color: 'var(--warn)' },
  };
  const meta = labels[stage];
  if (!meta) return null;
  return <span style={stageBadgeStyle(meta.color)}>{meta.text}</span>;
}

function formatCompact(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

function formatAge(timestamp) {
  if (!timestamp) return 'never';
  const ms = Date.now() - new Date(timestamp).getTime();
  if (ms < 60_000)        return 'just now';
  if (ms < 3_600_000)     return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000)    return `${Math.floor(ms / 3_600_000)}h`;
  if (ms < 30 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d`;
  return `${Math.floor(ms / (30 * 86_400_000))}mo`;
}

function Note({ tone, children }) {
  const palette = {
    info: { bg: 'rgba(10,145,155,0.08)', border: 'rgba(10,145,155,0.25)', fg: 'var(--accent-text)' },
  }[tone] || { bg: 'var(--input-bg)', border: 'var(--outline-variant)', fg: 'var(--muted)' };
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 6,
      background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg,
      fontSize: 13, marginTop: 16,
    }}>{children}</div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const shellStyle = { padding: '20px 24px 60px', maxWidth: 1400, margin: '0 auto' };
const headerRowStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  gap: 16, marginBottom: 20, flexWrap: 'wrap',
};
const kickerStyle = {
  fontSize: 11, color: 'var(--accent-text)',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 4,
};
const titleStyle = { fontSize: 26, fontWeight: 700, color: 'var(--ink)', margin: 0 };
const subtitleStyle = { fontSize: 13, color: 'var(--outline)', marginTop: 6, lineHeight: 1.5, maxWidth: 800 };
const refreshBtnStyle = {
  background: 'transparent', color: 'var(--outline)',
  border: '1px solid var(--border)', borderRadius: 5,
  padding: '6px 12px', fontSize: 11, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 5,
};


// Pulse strip
const pulseStripStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 8, marginBottom: 18,
};
const pulseCellStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 6, padding: 12,
};
const pulseLabelRowStyle = { display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 };
const pulseLabelStyle = {
  fontSize: 10, color: 'var(--outline)',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700,
};
const pulseValueStyle = (accent) => ({
  fontSize: 22, fontWeight: 700, color: accent || 'var(--ink)',
  lineHeight: 1.2,
});
const pulseDetailStyle = { fontSize: 10, color: 'var(--faint)', marginTop: 2 };

// Alerts
const alertsSectionStyle = { marginBottom: 18 };
const sectionHeaderStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  flexWrap: 'wrap', gap: 10,
  marginBottom: 8,
};
const sectionKickerStyle = {
  fontSize: 11, color: 'var(--outline)',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700,
};
const seeAllBtnStyle = {
  background: 'transparent', color: 'var(--accent-text)',
  border: 'none', cursor: 'pointer',
  fontSize: 11, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', gap: 2,
};
// Severity lives in the row's icon, not in a coloured border-cap. The
// colour-cap-per-row pattern made every alert equally loud, so the eye
// learned to skip the whole section.
const alertRowWrapStyle = () => ({
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  display: 'flex', alignItems: 'stretch',
});
const alertRowButtonStyle = {
  background: 'transparent',
  border: 'none',
  padding: '10px 12px',
  display: 'flex', alignItems: 'flex-start', gap: 10,
  flex: 1, minWidth: 0,
  cursor: 'pointer',
  color: 'inherit', fontFamily: 'inherit',
  textAlign: 'left',
};
const alertMenuBtnStyle = {
  background: 'transparent', color: 'var(--faint)',
  border: 'none', borderLeft: '1px solid var(--border)',
  padding: '8px 10px',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '0 4px 4px 0',
};

const menuBackdropStyle = {
  position: 'fixed', inset: 0, zIndex: 50,
  background: 'transparent',
};
const dismissMenuStyle = {
  position: 'absolute', top: '100%', right: 0, marginTop: 4,
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 5, padding: 4,
  minWidth: 140, zIndex: 51,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  display: 'flex', flexDirection: 'column', gap: 2,
};
const dismissMenuHeaderStyle = {
  fontSize: 9, color: 'var(--outline)', fontWeight: 700,
  letterSpacing: 0.5, textTransform: 'uppercase',
  padding: '6px 8px 4px',
  display: 'flex', alignItems: 'center', gap: 4,
  borderBottom: '1px solid var(--border)',
  marginBottom: 2,
};
const dismissMenuItemStyle = {
  background: 'transparent', color: 'var(--text)',
  border: 'none', padding: '6px 8px',
  fontSize: 11, fontWeight: 600,
  cursor: 'pointer', textAlign: 'left',
  borderRadius: 3,
};
const noAlertsStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: 'rgba(63,166,106,0.04)',
  border: '1px solid rgba(63,166,106,0.25)',
  borderRadius: 6,
  padding: '12px 14px',
  marginBottom: 18,
};

// Client grid
const gridSectionStyle = {};
const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 10,
};
const cardStyle = () => ({
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  transition: 'border-color 0.15s',
  // Card is now the wrapper; inner button handles the click.
  position: 'relative',
});
const cardButtonStyle = {
  background: 'transparent',
  border: 'none',
  width: '100%', padding: 18,
  textAlign: 'left',
  cursor: 'pointer',
  color: 'inherit',
  fontFamily: 'inherit',
};
const cardHeaderStyle = {
  display: 'flex', gap: 12, alignItems: 'center',
};
const cardThumbStyle = {
  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
  objectFit: 'cover',
  outline: '1px solid rgba(255, 255, 255, 0.1)', outlineOffset: -1,
};
const cardNameStyle = {
  fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  flex: 1, minWidth: 0,
};
const cardHeaderTopRowStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
};
const stageBadgeStyle = (color) => ({
  background: `color-mix(in srgb, ${color} 9%, transparent)`, color,
  border: `1px solid color-mix(in srgb, ${color} 33%, transparent)`,
  borderRadius: 3, padding: '1px 6px',
  fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
  flexShrink: 0,
});
const activityLineStyle = {
  fontSize: 11, color: 'var(--outline)',
  padding: '4px 0', marginBottom: 4,
  borderBottom: '1px dashed rgba(255,255,255,0.04)',
};

const cardBodyStyle = {};

const cardMetaRowStyle = {
  display: 'flex', gap: 4, flexWrap: 'wrap',
  marginTop: 4,
};
const metaPillStyle = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 3,
  background: `color-mix(in srgb, ${color} 8%, transparent)`, color,
  border: `1px solid color-mix(in srgb, ${color} 27%, transparent)`,
  borderRadius: 3, padding: '1px 6px',
  fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
});

// A plain line, not a tinted dashed box. Ten cards each shouting in amber
// and red meant none of them were heard; the coloured "Fix:" word is enough.
const topAlertInlineStyle = () => ({
  marginTop: 8,
  paddingTop: 8,
  borderTop: '1px solid var(--border)',
  fontSize: 11, lineHeight: 1.4,
});

const cardFooterRowStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginTop: 8, gap: 6,
};
const escapeLinkStyle = {
  fontSize: 10, color: 'var(--faint)',
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 2,
  padding: '2px 5px',
  borderRadius: 3,
};
