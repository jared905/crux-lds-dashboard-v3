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

import React, { useEffect, useState } from 'react';
import {
  Loader, AlertTriangle, AlertCircle, Info, ChevronRight,
  Users, Activity, ClipboardCheck, Wifi, Sparkles, RefreshCw,
  EyeOff, MoreVertical,
} from 'lucide-react';
import { loadCommandCenter } from '../../../services/commandCenterService.js';
import { dismissAlert, SNOOZE_OPTIONS } from '../../../services/alertDismissService.js';

const SEVERITY_COLOR = {
  high:   '#ef6b6b',
  medium: '#E8A82B',
  low:    '#0A919B',
};
const SEVERITY_ICON = {
  high:   AlertCircle,
  medium: AlertTriangle,
  low:    Info,
};

export default function CommandCenter({ clients, onClientChange, onNavigate }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const payload = await loadCommandCenter();
        if (!cancelled) setData(payload);
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
    // 2026-06-12 fix: when an alerted card is clicked, the strategist's
    // intent is to FIX the issue, not see the performance dashboard.
    // Route to the top alert's targetTab. Healthy cards (no alerts) and
    // explicit 'view performance' clicks still go to the single-client
    // dashboard.
    const targetTab = forceTab
      || (card.topAlert?.targetTab)
      || 'dashboard';
    if (typeof onNavigate === 'function') onNavigate(targetTab);
  };

  const handleAlertClick = (alert) => {
    if (alert.clientId) {
      const full = (clients || []).find(c => c.id === alert.clientId);
      if (full && typeof onClientChange === 'function') onClientChange(full);
    }
    if (alert.targetTab && typeof onNavigate === 'function') onNavigate(alert.targetTab);
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
          <div style={kickerStyle}>Operate · Command Center</div>
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
        <div style={loadingShellStyle}>
          <Loader size={20} style={{ animation: 'spin 1s linear infinite', color: '#0A919B' }} />
          <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>Loading portfolio state…</div>
        </div>
      )}

      {data && (
        <>
          {/* ─── Pulse strip ─── */}
          <PulseStrip pulse={data.pulse} />

          {/* ─── Top alerts ─── */}
          {data.topAlerts.length > 0 ? (
            <TopAlerts alerts={data.topAlerts} onClick={handleAlertClick} onDismiss={handleDismiss} totalAlerts={data.pulse.alertsBySeverity.total} onSeeAll={() => onNavigate?.('this-week')} />
          ) : (
            <NoAlertsCard />
          )}

          {/* ─── Client grid ─── */}
          {data.clientCards.length === 0 ? (
            <Note tone="info">No clients yet. Add one at Operate → Clients.</Note>
          ) : (
            <ClientGrid cards={data.clientCards} onOpen={(card, opts) => handleOpenClient(card, opts)} />
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
    { icon: Wifi,           label: 'OAuth health',     value: `${pulse.oauthHealthPct}%`,                           detail: `${pulse.oauthActiveCount} active`, accent: pulse.oauthHealthPct >= 80 ? '#3fa66a' : pulse.oauthHealthPct >= 50 ? '#E8A82B' : '#ef6b6b' },
    { icon: AlertCircle,    label: 'Alerts',           value: pulse.alertsBySeverity.total,                         detail: `${pulse.alertsBySeverity.high} high · ${pulse.alertsBySeverity.medium} med`, accent: pulse.alertsBySeverity.high > 0 ? '#ef6b6b' : pulse.alertsBySeverity.medium > 0 ? '#E8A82B' : '#3fa66a' },
    { icon: ClipboardCheck, label: 'Intake (avg)',     value: intakePct == null ? '—' : `${intakePct}%`,           detail: intakePct == null ? 'no installs started' : `across ${pulse.intakeStartedClients} client${pulse.intakeStartedClients === 1 ? '' : 's'}`, accent: intakePct == null ? '#666' : intakePct >= 75 ? '#3fa66a' : intakePct >= 40 ? '#E8A82B' : '#666' },
    { icon: Activity,       label: 'Intake pending',   value: pulse.intakePendingCount,                             detail: `awaiting confirmation`, accent: pulse.intakePendingCount > 0 ? '#E8A82B' : '#666' },
  ];
  return (
    <div style={pulseStripStyle}>
      {items.map((it, i) => (
        <div key={i} style={pulseCellStyle}>
          <div style={pulseLabelRowStyle}>
            <it.icon size={11} style={{ color: it.accent || '#888' }} />
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

function TopAlerts({ alerts, onClick, onDismiss, totalAlerts, onSeeAll }) {
  return (
    <div style={alertsSectionStyle}>
      <div style={sectionHeaderStyle}>
        <span style={sectionKickerStyle}>Needs attention</span>
        {totalAlerts > alerts.length && (
          <button onClick={onSeeAll} style={seeAllBtnStyle}>
            See all {totalAlerts} <ChevronRight size={11} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alerts.map((a, i) => (
          <AlertRow key={i} alert={a} onClick={() => onClick(a)} onDismiss={(days) => onDismiss(a, days)} />
        ))}
      </div>
    </div>
  );
}

function AlertRow({ alert, onClick, onDismiss }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = SEVERITY_ICON[alert.severity] || Info;
  const color = SEVERITY_COLOR[alert.severity] || '#666';
  return (
    <div style={alertRowWrapStyle(color)}>
      <button onClick={onClick} style={alertRowButtonStyle}>
        <Icon size={14} style={{ color, flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div style={{ fontSize: 12, color: '#cde4d6', fontWeight: 600, marginBottom: 2 }}>
            {alert.clientName && <span style={{ color: '#888', marginRight: 6 }}>{alert.clientName} ·</span>}
            {alert.label}
          </div>
          <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>{alert.description}</div>
        </div>
        <ChevronRight size={12} style={{ color: '#666', flexShrink: 0, marginTop: 4 }} />
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
      <Sparkles size={14} style={{ color: '#3fa66a' }} />
      <span style={{ fontSize: 12, color: '#aaa' }}>
        Nothing flagged across the portfolio right now. Use this stretch for proactive work — review one client's
        Spine, push a brief, or run an install conversation.
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Client grid
// ──────────────────────────────────────────────────

function ClientGrid({ cards, onOpen }) {
  return (
    <div style={gridSectionStyle}>
      <div style={sectionHeaderStyle}>
        <span style={sectionKickerStyle}>Clients ({cards.length})</span>
      </div>
      <div style={gridStyle}>
        {cards.map(c => (
          <ClientCard
            key={c.id}
            card={c}
            onOpen={() => onOpen(c)}
            onOpenPerformance={() => onOpen(c, { forceTab: 'dashboard' })}
          />
        ))}
      </div>
    </div>
  );
}

function ClientCard({ card, onOpen, onOpenPerformance }) {
  const sevColor = card.alertSeverityMax ? SEVERITY_COLOR[card.alertSeverityMax] : null;
  const intakeColor = card.intakeCompletionPct == null ? '#444'
    : card.intakeCompletionPct >= 75 ? '#3fa66a'
    : card.intakeCompletionPct >= 40 ? '#E8A82B' : '#666';
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
      <button onClick={onOpen} style={cardButtonStyle} aria-label={hasAlerts ? `Fix ${card.alertCount} alert(s) for ${card.name}` : `Open ${card.name}`}>
        <div style={cardHeaderStyle}>
          {card.thumbnailUrl
            ? <img src={card.thumbnailUrl} alt="" style={cardThumbStyle} />
            : <div style={{ ...cardThumbStyle, background: '#1a1a1f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#666', fontWeight: 700 }}>{(card.name || '?').slice(0, 2).toUpperCase()}</div>
          }
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={cardHeaderTopRowStyle}>
              <div style={cardNameStyle}>{card.name}</div>
              <StageBadge stage={card.lifecycleStage} isPrelaunch={card.isPrelaunch} />
            </div>
            <div style={cardSubLineStyle}>
              {card.noChannelStage ? (
                <span>No channel yet</span>
              ) : (
                <>
                  <span style={{ color: '#cde4d6', fontWeight: 600 }}>{formatCompact(card.subscriberCount)}</span>
                  <span style={{ color: '#666' }}>subs</span>
                  {card.subDelta30d != null && card.subDelta30d !== 0 && (
                    <span style={{ color: card.subDelta30d > 0 ? '#3fa66a' : '#ef6b6b', fontWeight: 600 }}>
                      {card.subDelta30d > 0 ? '+' : ''}{formatCompact(card.subDelta30d)} 30d
                    </span>
                  )}
                  {card.peerCohortCount > 0 && (
                    <span style={{ color: '#666' }}>· {card.peerCohortCount} peer{card.peerCohortCount === 1 ? '' : 's'}</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div style={cardBodyStyle}>
          {/* Intake completion bar — null state shows "—" not 0% */}
          <div style={cardMetricRowStyle}>
            <span style={cardMetricLabelStyle}>Intake</span>
            <div style={installBarShellStyle}>
              {card.intakeCompletionPct != null && (
                <div style={{ width: `${card.intakeCompletionPct}%`, height: '100%', background: intakeColor }} />
              )}
            </div>
            <span style={cardMetricValueStyle(intakeColor)}>
              {card.intakeCompletionPct == null ? '—' : `${card.intakeCompletionPct}%`}
            </span>
          </div>

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
              <span style={metaPillStyle('#3fa66a')}>✓ healthy</span>
            )}
            {card.hasSyncError && (
              <span style={metaPillStyle('#ef6b6b')}>sync error</span>
            )}
            {card.intakeConfirmed < card.intakeAnswered && (
              <span style={metaPillStyle('#E8A82B')}>
                {card.intakeAnswered - card.intakeConfirmed} to confirm
              </span>
            )}
            {card.latestBriefAgeDays != null && (
              <span style={metaPillStyle(card.latestBriefAgeDays <= 7 ? '#3fa66a' : card.latestBriefAgeDays <= 14 ? '#E8A82B' : '#888')}>
                Brief {card.latestBriefAgeDays}d
              </span>
            )}
          </div>

          {/* Top alert inline */}
          {hasAlerts && card.topAlert && (
            <div style={topAlertInlineStyle(sevColor)}>
              <span style={{ color: sevColor, fontWeight: 700 }}>→ Fix:</span>{' '}
              <span style={{ color: '#cde4d6' }}>{card.topAlert.label}</span>
            </div>
          )}

          <div style={cardFooterRowStyle}>
            <span style={{ fontSize: 10, color: '#666' }}>
              {card.noChannelStage
                ? (card.isPrelaunch ? 'Pre-launch · awaiting channel' : 'Prospect · no channel yet')
                : card.lastSyncedAt ? `Last sync ${formatAge(card.lastSyncedAt)} ago` : 'Never synced'}
            </span>
            {hasAlerts && (
              <span
                onClick={(e) => { e.stopPropagation(); onOpenPerformance(); }}
                style={escapeLinkStyle}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onOpenPerformance(); } }}
              >
                Performance <ChevronRight size={9} />
              </span>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

function StageBadge({ stage, isPrelaunch }) {
  if (isPrelaunch) return <span style={stageBadgeStyle('#a78bfa')}>PRE-LAUNCH</span>;
  if (!stage) return null;
  const labels = {
    prospect:      { text: 'PROSPECT',   color: '#a78bfa' },
    non_oauth:     { text: 'NON-OAUTH',  color: '#60a5fa' },
    oauth_active:  { text: 'ACTIVE',     color: '#3fa66a' },
    oauth_renewal: { text: 'RENEWAL',    color: '#E8A82B' },
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
    info: { bg: 'rgba(10,145,155,0.08)', border: 'rgba(10,145,155,0.25)', fg: '#0A919B' },
  }[tone] || { bg: '#1a1a1f', border: '#333', fg: '#aaa' };
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
  fontSize: 11, color: '#0A919B',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 4,
};
const titleStyle = { fontSize: 26, fontWeight: 700, color: '#e8e2d0', margin: 0 };
const subtitleStyle = { fontSize: 13, color: '#888', marginTop: 6, lineHeight: 1.5, maxWidth: 800 };
const refreshBtnStyle = {
  background: 'transparent', color: '#888',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '6px 12px', fontSize: 11, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 5,
};

const loadingShellStyle = {
  textAlign: 'center', padding: 60,
};

// Pulse strip
const pulseStripStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 8, marginBottom: 18,
};
const pulseCellStyle = {
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 6, padding: 12,
};
const pulseLabelRowStyle = { display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 };
const pulseLabelStyle = {
  fontSize: 10, color: '#888',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700,
};
const pulseValueStyle = (accent) => ({
  fontSize: 22, fontWeight: 700, color: accent || '#e8e2d0',
  lineHeight: 1.2,
});
const pulseDetailStyle = { fontSize: 10, color: '#666', marginTop: 2 };

// Alerts
const alertsSectionStyle = { marginBottom: 18 };
const sectionHeaderStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginBottom: 8,
};
const sectionKickerStyle = {
  fontSize: 11, color: '#888',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700,
};
const seeAllBtnStyle = {
  background: 'transparent', color: '#0A919B',
  border: 'none', cursor: 'pointer',
  fontSize: 11, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', gap: 2,
};
const alertRowWrapStyle = (color) => ({
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderLeft: `2px solid ${color}`,
  borderRadius: 5,
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
  background: 'transparent', color: '#666',
  border: 'none', borderLeft: '1px solid #2a2a30',
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
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 5, padding: 4,
  minWidth: 140, zIndex: 51,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  display: 'flex', flexDirection: 'column', gap: 2,
};
const dismissMenuHeaderStyle = {
  fontSize: 9, color: '#888', fontWeight: 700,
  letterSpacing: 0.5, textTransform: 'uppercase',
  padding: '6px 8px 4px',
  display: 'flex', alignItems: 'center', gap: 4,
  borderBottom: '1px solid #2a2a30',
  marginBottom: 2,
};
const dismissMenuItemStyle = {
  background: 'transparent', color: '#cde4d6',
  border: 'none', padding: '6px 8px',
  fontSize: 11, fontWeight: 600,
  cursor: 'pointer', textAlign: 'left',
  borderRadius: 3,
};
const noAlertsStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: 'rgba(63,166,106,0.04)',
  border: '1px solid rgba(63,166,106,0.25)',
  borderLeft: '2px solid #3fa66a',
  borderRadius: 5,
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
const cardStyle = (sevMax) => ({
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderLeft: `2px solid ${sevMax ? SEVERITY_COLOR[sevMax] : '#2a2a30'}`,
  borderRadius: 6,
  transition: 'border-color 0.15s',
  // Card is now the wrapper; inner button handles the click.
  position: 'relative',
});
const cardButtonStyle = {
  background: 'transparent',
  border: 'none',
  width: '100%', padding: 14,
  textAlign: 'left',
  cursor: 'pointer',
  color: 'inherit',
  fontFamily: 'inherit',
};
const cardHeaderStyle = {
  display: 'flex', gap: 10, alignItems: 'flex-start',
  marginBottom: 10,
};
const cardThumbStyle = {
  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
  objectFit: 'cover',
};
const cardNameStyle = {
  fontSize: 13, fontWeight: 700, color: '#e8e2d0',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  flex: 1, minWidth: 0,
};
const cardHeaderTopRowStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
};
const cardSubLineStyle = {
  fontSize: 10, color: '#888', marginTop: 3,
  display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center',
};
const stageBadgeStyle = (color) => ({
  background: `${color}18`, color,
  border: `1px solid ${color}55`,
  borderRadius: 3, padding: '1px 6px',
  fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
  flexShrink: 0,
});
const activityLineStyle = {
  fontSize: 10, color: '#888',
  padding: '4px 0', marginBottom: 4,
  borderBottom: '1px dashed rgba(255,255,255,0.04)',
};

const cardBodyStyle = {};
const cardMetricRowStyle = {
  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
};
const cardMetricLabelStyle = {
  fontSize: 10, color: '#888',
  textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700,
  width: 50,
};
const installBarShellStyle = {
  flex: 1, height: 4,
  background: '#1a1a1f', borderRadius: 2, overflow: 'hidden',
};
const cardMetricValueStyle = (color) => ({
  fontSize: 11, color, fontWeight: 700,
  minWidth: 30, textAlign: 'right',
});

const cardMetaRowStyle = {
  display: 'flex', gap: 4, flexWrap: 'wrap',
  marginTop: 4,
};
const metaPillStyle = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 3,
  background: `${color}15`, color,
  border: `1px solid ${color}44`,
  borderRadius: 3, padding: '1px 6px',
  fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
});

const topAlertInlineStyle = (color) => ({
  marginTop: 8,
  padding: '5px 8px',
  background: `${color || '#666'}10`,
  border: `1px dashed ${color || '#666'}55`,
  borderRadius: 4,
  fontSize: 11, lineHeight: 1.4,
});

const cardFooterRowStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginTop: 8, gap: 6,
};
const escapeLinkStyle = {
  fontSize: 10, color: '#666',
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 2,
  padding: '2px 5px',
  borderRadius: 3,
};
