/**
 * Movement lens — alerts feed for the competitor set.
 * Reads competitor_alerts, groups by day, supports type filters and dismiss.
 */
import {useEffect, useState, useMemo} from 'react';
import {
  Loader, RefreshCw, Sparkles, X, ExternalLink, TrendingUp, TrendingDown,
  Zap, ArrowLeftRight, UserPlus, BarChart3,
} from 'lucide-react';
import {
  loadAlerts, dismissAlert, dismissAllInScope, triggerAlertGeneration,
  groupAlertsByDay, loadOrGenerateTakeaway, ALERT_TYPE_META, resolveScopeToChannelIds,
} from '../../services/movementService.js';

const TYPE_OPTIONS = [
  { id: 'all',          label: 'All' },
  { id: 'breakout',     label: 'Breakouts' },
  { id: 'rank_change',  label: 'Rank changes' },
  { id: 'format_shift', label: 'Format shifts' },
  { id: 'new_entrant',  label: 'New entrants' },
];

const TYPE_ICONS = {
  breakout:     Zap,
  rank_change:  TrendingUp,
  format_shift: ArrowLeftRight,
  new_entrant:  UserPlus,
  trend:        BarChart3,
};

export default function MovementLens({ scope, refreshKey = 0 }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [scopeIds, setScopeIds] = useState([]);
  const [takeaway, setTakeaway] = useState(null);
  const [takeawayLoading, setTakeawayLoading] = useState(false);
  const [scopeLabel, setScopeLabel] = useState('this scope');

  // Load alerts on scope change
  // The scope object's identity churns per render; this serialized key covers
  // every scope field the fetch reads, so it stands in as the dependency.
  const scopeKey = [scope.categoryIds?.join(','), scope.tags?.join(','), scope.tiers?.join(','), scope.clientId].join('|');
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const ids = await resolveScopeToChannelIds(scope);
        if (cancelled) return;
        setScopeIds(ids);
        const label = await buildScopeLabel(scope);
        setScopeLabel(label);
        const data = await loadAlerts({ scopeChannelIds: ids, windowDays: 30 });
        if (!cancelled) {
          setAlerts(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('[MovementLens] load failed:', err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, refreshKey]);

  // Generate takeaway when alerts are loaded
  useEffect(() => {
    if (!alerts.length || !scopeIds.length) {
      setTakeaway(null);
      return;
    }
    let cancelled = false;
    setTakeawayLoading(true);
    (async () => {
      const t = await loadOrGenerateTakeaway({ scopeChannelIds: scopeIds, scopeLabel, alerts });
      if (!cancelled) {
        setTakeaway(t);
        setTakeawayLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // Re-summarize when the alert count or scope changes; alerts/scopeIds
  // themselves churn identity every fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.length, scopeIds.join(','), scopeLabel]);

  const filtered = useMemo(() => {
    if (filter === 'all') return alerts;
    return alerts.filter(a => a.alert_type === filter);
  }, [alerts, filter]);

  const grouped = useMemo(() => groupAlertsByDay(filtered), [filtered]);

  const counts = useMemo(() => {
    const c = { all: alerts.length, breakout: 0, rank_change: 0, format_shift: 0, new_entrant: 0 };
    for (const a of alerts) c[a.alert_type] = (c[a.alert_type] || 0) + 1;
    return c;
  }, [alerts]);

  const handleScan = async () => {
    if (generating) return;
    setGenerating(true);
    setGenResult(null);
    const res = await triggerAlertGeneration();
    setGenerating(false);
    setGenResult(res);
    if (res?.success) {
      // Refresh feed
      const data = await loadAlerts({ scopeChannelIds: scopeIds, windowDays: 30 });
      setAlerts(data);
    }
    setTimeout(() => setGenResult(null), 8000);
  };

  const handleDismiss = async (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
    await dismissAlert(id);
  };

  const handleDismissAll = async () => {
    if (!confirm(`Dismiss all ${filtered.length} alerts shown?`)) return;
    setAlerts(prev => prev.filter(a => !filtered.includes(a)));
    await dismissAllInScope({ scopeChannelIds: scopeIds, windowDays: 30 });
  };

  if (loading) return <Spinner label="Loading movement feed…" />;

  return (
    <div>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TYPE_OPTIONS.map(opt => {
            const isActive = filter === opt.id;
            const count = counts[opt.id] || 0;
            return (
              <button
                key={opt.id}
                onClick={() => setFilter(opt.id)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  background: isActive ? 'var(--blue)' : 'var(--bg)',
                  color: isActive ? 'var(--ink)' : 'var(--muted)',
                  border: `1px solid ${isActive ? 'var(--blue)' : 'var(--surface-high)'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {opt.label}
                <span style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 99,
                  background: isActive ? 'rgba(255,255,255,0.18)' : 'var(--bg)',
                  color: isActive ? 'var(--ink)' : 'var(--faint)',
                }}>{count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {genResult && (
            <span style={{
              fontSize: 12,
              color: genResult.success ? "var(--pos-text)" : "var(--neg-text)",
              fontWeight: 500,
            }}>
              {genResult.success
                ? `+${genResult.total || 0} alerts (${genResult.breakouts || 0} breakouts · ${genResult.rank_changes || 0} ranks · ${genResult.format_shifts || 0} formats · ${genResult.new_entrants || 0} new)`
                : `Scan failed: ${genResult.error}`}
            </span>
          )}
          {filtered.length > 0 && (
            <button
              onClick={handleDismissAll}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                background: 'var(--bg)',
                color: 'var(--muted)',
                border: '1px solid #232328',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
            >
              Dismiss all
            </button>
          )}
          <button
            onClick={handleScan}
            disabled={generating}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              background: generating ? 'var(--card)' : 'var(--card)',
              color: generating ? 'var(--faint)' : 'var(--text)',
              border: '1px solid #232328',
              borderRadius: 6,
              cursor: generating ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Run alert detection across all tracked competitors"
          >
            {generating
              ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Scanning…</>
              : <><RefreshCw size={12} /> Scan for movement</>}
          </button>
        </div>
      </div>

      {/* Weekly takeaway */}
      <TakeawayCard takeaway={takeaway} loading={takeawayLoading} alertCount={alerts.length} scopeLabel={scopeLabel} />

      {/* Feed */}
      {grouped.length === 0 ? (
        <EmptyState onScan={handleScan} hasAlerts={alerts.length > 0} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {grouped.map(({ day, items }) => (
            <div key={day}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--faint)',
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: 8,
                paddingLeft: 2,
              }}>
                {formatDayLabel(day)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(a => (
                  <AlertCard key={a.id} alert={a} onDismiss={() => handleDismiss(a.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────

function TakeawayCard({ takeaway, loading, alertCount, scopeLabel }) {
  if (!alertCount) return null;
  if (loading && !takeaway) {
    return (
      <div style={{
        padding: '14px 16px',
        marginBottom: 18,
        background: 'linear-gradient(135deg, rgba(0,209,255,0.10), rgba(0,209,255,0.08))',
        border: '1px solid rgba(0,209,255,0.25)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: 'var(--muted)',
        fontSize: 13,
      }}>
        <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
        Synthesizing this week's takeaway…
      </div>
    );
  }
  if (!takeaway) return null;
  return (
    <div style={{
      padding: '16px 18px',
      marginBottom: 18,
      background: 'linear-gradient(135deg, rgba(0,209,255,0.10), rgba(0,209,255,0.08))',
      border: '1px solid rgba(0,209,255,0.25)',
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Sparkles size={14} style={{ color: 'var(--accent-text)' }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          This week in motion · {scopeLabel}
        </div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6, letterSpacing: '-0.2px' }}>
        {takeaway.headline}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
        {takeaway.body}
      </div>
    </div>
  );
}

function AlertThumbnail({ alert, Icon, color }) {
  const p = alert.payload || {};
  // Breakouts are video-centric → video thumb (16:9 cropped to square)
  // Everything else is channel-centric → channel avatar
  const isBreakout = alert.alert_type === 'breakout';
  const videoThumb = p.video_thumbnail_url || alert._videoThumbnail || null;
  const channelThumb = p.channel_thumbnail_url || alert._channelThumbnail || null;
  const primary = isBreakout ? (videoThumb || channelThumb) : (channelThumb || videoThumb);
  const channelYoutubeId = p.channel_youtube_id || alert._channelYoutubeId || null;

  const containerStyle = {
    position: 'relative',
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    background: 'var(--card)',
    flexShrink: 0,
    border: '1px solid #232328',
  };

  const badgeStyle = {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 6,
    background: color,
    color: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid #101014',
  };

  const inner = primary ? (
    <img
      src={primary}
      alt=""
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        if (e.currentTarget.nextElementSibling) e.currentTarget.nextElementSibling.style.display = 'flex';
      }}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: 'center',
        display: 'block',
      }}
    />
  ) : null;

  const fallback = (
    <div style={{
      display: primary ? 'none' : 'flex',
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
      color,
    }}>
      <Icon size={20} />
    </div>
  );

  if (channelYoutubeId) {
    return (
      <a
        href={`https://youtube.com/channel/${channelYoutubeId}`}
        target="_blank"
        rel="noreferrer"
        style={{ ...containerStyle, display: 'block', textDecoration: 'none' }}
        title="Open channel on YouTube"
      >
        {inner}
        {fallback}
        <div style={badgeStyle}><Icon size={11} /></div>
      </a>
    );
  }

  return (
    <div style={containerStyle}>
      {inner}
      {fallback}
      <div style={badgeStyle}><Icon size={11} /></div>
    </div>
  );
}

function AlertCard({ alert, onDismiss }) {
  const meta = ALERT_TYPE_META[alert.alert_type] || { label: alert.alert_type, color: 'var(--muted)' };
  const Icon = TYPE_ICONS[alert.alert_type] || BarChart3;
  const p = alert.payload || {};

  return (
    <div style={{
      padding: '12px 14px',
      background: 'var(--bg)',
      border: '1px solid #1c1c22',
      borderRadius: 8,
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
    }}>
      <AlertThumbnail alert={alert} Icon={Icon} color={meta.color} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: meta.color,
            background: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
            padding: '2px 7px',
            borderRadius: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
          }}>{meta.label}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
            {p.channel_name || 'Unknown channel'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>
            {formatTime(alert.generated_at)}
          </span>
        </div>
        <AlertBody type={alert.alert_type} payload={p} />
      </div>

      <button
        onClick={onDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--faint)',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4,
        }}
        title="Dismiss alert"
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--muted)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--faint)'; }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function AlertBody({ type, payload: p }) {
  if (type === 'breakout') {
    return (
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>"{truncate(p.video_title, 90)}"</span>
        {' '}hit <strong style={{ color: "var(--pos)" }}>{p.multiplier}×</strong> the channel median
        {' '}({fmt(p.views_at_48h)} vs {fmt(p.channel_median)} median at 48h).
        {p.youtube_video_id && (
          <a
            href={`https://youtube.com/watch?v=${p.youtube_video_id}`}
            target="_blank"
            rel="noreferrer"
            style={{ marginLeft: 6, color: 'var(--accent-text)', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12 }}
          >
            Watch <ExternalLink size={11} />
          </a>
        )}
      </div>
    );
  }
  if (type === 'format_shift') {
    return (
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
        Dominant format flipped from <FormatTag id={p.prev_format} /> ({p.prev_pct}%) to{' '}
        <FormatTag id={p.curr_format} highlight /> ({p.curr_pct}%).
        {' '}Based on {p.recent_count} recent uploads.
      </div>
    );
  }
  if (type === 'rank_change') {
    const isUp = p.direction === 'up';
    const TrendIcon = isUp ? TrendingUp : TrendingDown;
    const color = isUp ? 'var(--pos)' : 'var(--neg-text)';
    return (
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        Avg views per upload
        <span style={{ color, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <TrendIcon size={13} /> {Math.abs(p.pct_change)}%
        </span>
        ({fmt(p.prev_velocity)} → {fmt(p.curr_velocity)}) over the last 14 days.
      </div>
    );
  }
  if (type === 'new_entrant') {
    return (
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
        Newly added to the tracked set
        {p.subscriber_count ? <> · <strong>{fmt(p.subscriber_count)}</strong> subscribers</> : null}
        {p.channel_tier ? <> · tier: <span style={{ textTransform: 'capitalize' }}>{p.channel_tier}</span></> : null}.
      </div>
    );
  }
  return <div style={{ fontSize: 12, color: 'var(--faint)' }}>{JSON.stringify(p).slice(0, 200)}</div>;
}

function FormatTag({ id, highlight = false }) {
  const labels = {
    shorts:   'Shorts (<3m)',
    lf_3_8:   '3–8m',
    lf_8_15:  '8–15m',
    lf_15_25: '15–25m',
    doc_25p:  '25m+',
    unknown:  '?',
  };
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      background: highlight ? 'rgba(0,209,255,0.18)' : 'var(--card)',
      color: highlight ? 'var(--accent-text)' : 'var(--muted)',
      border: `1px solid ${highlight ? 'rgba(0,209,255,0.35)' : 'var(--surface-high)'}`,
    }}>{labels[id] || id}</span>
  );
}

function Spinner({ label }) {
  return (
    <div style={{
      padding: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      color: 'var(--faint)',
      fontSize: 13,
    }}>
      <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
      {label}
    </div>
  );
}

function EmptyState({ onScan, hasAlerts }) {
  return (
    <div style={{
      padding: '40px 20px',
      textAlign: 'center',
      background: 'var(--bg)',
      border: '1px solid #1c1c22',
      borderRadius: 10,
      color: 'var(--faint)',
    }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}></div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
        {hasAlerts ? 'No alerts match this filter' : 'No movement detected yet'}
      </div>
      <div style={{ fontSize: 12, maxWidth: 420, margin: '0 auto 12px' }}>
        {hasAlerts
          ? 'Try a different filter, or scan again to pick up new activity.'
          : 'Run a scan after the next competitor sync. Breakouts, rank changes, format shifts, and new entrants will surface here.'}
      </div>
      <button
        onClick={onScan}
        style={{
          padding: '7px 14px',
          fontSize: 12,
          background: 'var(--card)',
          color: 'var(--text)',
          border: '1px solid #232328',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <RefreshCw size={12} /> Scan for movement
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function formatDayLabel(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86400000);
  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

async function buildScopeLabel(scope) {
  if (!scope.categoryIds?.length && !scope.tags?.length) return 'All tracked channels';
  try {
    const { supabase } = await import('../../services/supabaseClient');
    if (!scope.categoryIds?.length) {
      return scope.tags?.length ? `Tagged: ${scope.tags.join(', ')}` : 'All tracked channels';
    }
    const { data } = await supabase.from('categories').select('name').in('id', scope.categoryIds);
    const names = (data || []).map(c => c.name).filter(Boolean);
    if (!names.length) return 'All tracked channels';
    return names.join(' + ');
  } catch {
    return 'this scope';
  }
}
