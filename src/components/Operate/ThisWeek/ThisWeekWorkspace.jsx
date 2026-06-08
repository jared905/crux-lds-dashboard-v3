/**
 * ThisWeekWorkspace — strategist's "what should I do right now?" feed.
 *
 * Lives at Operate → This Week. Pulls alerts from across all clients
 * (stale audits, failing syncs, OAuth errors, briefs overdue, empty
 * peer cohorts, pre-launch past launch date, invites expiring) and
 * sorts by severity desc.
 *
 * Each row is one-click: click → switch active client + navigate to
 * the surface that resolves the alert.
 *
 * Mental model: the Portfolio is "all my clients at a glance"; this
 * tab is "all my work at a glance — sorted by urgency."
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Clock, ArrowRight, RefreshCw, Loader, Inbox, ChevronRight,
} from 'lucide-react';
import { loadThisWeekAlerts } from '../../../services/thisWeekService.js';

const SEVERITY_STYLES = {
  high:   { color: '#ef6b6b', bg: 'rgba(239,107,107,0.06)', border: 'rgba(239,107,107,0.30)', label: 'High' },
  medium: { color: '#E8A82B', bg: 'rgba(232,168,43,0.06)',  border: 'rgba(232,168,43,0.30)',  label: 'Medium' },
  low:    { color: '#8fbf6c', bg: 'rgba(143,191,108,0.06)', border: 'rgba(143,191,108,0.30)', label: 'Low' },
};

export default function ThisWeekWorkspace({ clients = [], onClientChange, onNavigate }) {
  const [loading, setLoading]   = useState(true);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);

  const clientIds = clients.map(c => c.id).filter(Boolean);

  useEffect(() => {
    if (!clientIds.length) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await loadThisWeekAlerts({ clientIds });
        if (!cancelled) setResult(r);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'failed to load alerts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientIds.join(',')]); // intentional — only re-fetch when client set changes

  const handleAlertClick = (alert) => {
    // Switch active client + navigate. The Portfolio target is a
    // special case (no client switch needed; just navigate).
    if (alert.clientId) {
      const client = clients.find(c => c.id === alert.clientId);
      if (client && typeof onClientChange === 'function') {
        onClientChange(client);
      }
    }
    if (alert.targetTab && typeof onNavigate === 'function') {
      onNavigate(alert.targetTab);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await loadThisWeekAlerts({ clientIds });
      setResult(r);
    } catch (err) {
      setError(err?.message || 'refresh failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shellStyle}>
      <div style={headerStyle}>
        <div>
          <div style={kickerStyle}>Operate · This Week</div>
          <h1 style={titleStyle}>What needs attention</h1>
          <div style={subtitleStyle}>
            Alerts across all clients sorted by severity. Click any row to switch to that client
            and open the surface that resolves it.
          </div>
        </div>
        <button onClick={refresh} disabled={loading} style={refreshBtnStyle}>
          {loading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
          <span>Refresh</span>
        </button>
      </div>

      {loading && !result && (
        <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 13 }}>
          Scanning your portfolio…
        </div>
      )}

      {error && (
        <div style={errorBoxStyle}>{error}</div>
      )}

      {result && !loading && (
        <>
          <Summary summary={result.summary} />
          {result.alerts.length === 0 ? (
            <EmptyState />
          ) : (
            <AlertsList alerts={result.alerts} onClick={handleAlertClick} />
          )}
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Summary strip
// ──────────────────────────────────────────────────

function Summary({ summary }) {
  return (
    <div style={summaryStyle}>
      <SummaryCard label="Total alerts" value={summary.total} color="#cde4d6" />
      <SummaryCard label="High severity" value={summary.high} color={SEVERITY_STYLES.high.color} />
      <SummaryCard label="Medium" value={summary.medium} color={SEVERITY_STYLES.medium.color} />
      <SummaryCard label="Low" value={summary.low} color={SEVERITY_STYLES.low.color} />
      <SummaryCard label="Clients affected" value={summary.clientsWithAlerts} color="#a78bfa" />
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Alerts list
// ──────────────────────────────────────────────────

function AlertsList({ alerts, onClick }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 18 }}>
      {alerts.map(alert => (
        <AlertRow key={alert.id} alert={alert} onClick={() => onClick(alert)} />
      ))}
    </div>
  );
}

function AlertRow({ alert, onClick }) {
  const sev = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.low;
  const Icon = alert.severity === 'high' ? AlertTriangle : Clock;
  return (
    <button onClick={onClick} style={rowStyle(sev)}>
      <Icon size={14} style={{ color: sev.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={severityChipStyle(sev)}>{sev.label}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e2d0' }}>{alert.clientName}</span>
        </div>
        <div style={{ fontSize: 13, color: '#cde4d6', marginTop: 2 }}>
          {alert.label}
        </div>
        {alert.description && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 4, lineHeight: 1.45 }}>
            {alert.description}
          </div>
        )}
      </div>
      <ChevronRight size={14} style={{ color: '#666', flexShrink: 0 }} />
    </button>
  );
}

function EmptyState() {
  return (
    <div style={emptyStateStyle}>
      <Inbox size={32} style={{ color: '#3fa66a', marginBottom: 12 }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: '#cde4d6', marginBottom: 6 }}>
        All clear
      </div>
      <div style={{ fontSize: 12, color: '#888' }}>
        No stale audits, no failing syncs, no overdue briefs. Get ahead of next week.
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const shellStyle = { padding: '20px 24px 60px', maxWidth: 1280, margin: '0 auto' };
const headerStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  marginBottom: 18, gap: 16,
};
const kickerStyle = {
  fontSize: 11, color: '#0A919B',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 4,
};
const titleStyle = { fontSize: 24, fontWeight: 700, color: '#e8e2d0', margin: 0 };
const subtitleStyle = { fontSize: 13, color: '#888', marginTop: 6, lineHeight: 1.5, maxWidth: 800 };
const refreshBtnStyle = {
  background: '#1a1a1f', color: '#cde4d6',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '8px 14px', fontSize: 12, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  whiteSpace: 'nowrap', flexShrink: 0,
};

const errorBoxStyle = {
  background: 'rgba(239,107,107,0.08)',
  border: '1px solid rgba(239,107,107,0.30)',
  color: '#ef6b6b',
  borderRadius: 6, padding: '10px 14px',
  fontSize: 13, marginTop: 14,
};

const summaryStyle = {
  display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10,
  marginTop: 14,
};
const summaryCardStyle = {
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 6, padding: 14,
};

const rowStyle = (sev) => ({
  display: 'flex', alignItems: 'flex-start', gap: 12,
  background: sev.bg, border: `1px solid ${sev.border}`,
  borderLeft: `2px solid ${sev.color}`,
  borderRadius: 5, padding: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
});
const severityChipStyle = (sev) => ({
  fontSize: 9, fontWeight: 700, color: sev.color,
  background: sev.bg, border: `1px solid ${sev.border}`,
  borderRadius: 3, padding: '1px 6px',
  textTransform: 'uppercase', letterSpacing: 0.5,
});

const emptyStateStyle = {
  marginTop: 24,
  padding: 40,
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 8,
  textAlign: 'center',
};
