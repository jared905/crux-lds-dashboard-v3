/**
 * Patterns lens — title patterns, format mix, outliers.
 * Cross-scope comparison: "this category vs all channels".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader, ExternalLink } from 'lucide-react';
import { analyzePatterns, resolveScopeToChannelIds } from '../../services/patternsService.js';

const COMPARE_MODES = [
  { id: 'platform', label: 'All channels (platform avg)' },
  { id: 'none',     label: 'No comparison' },
];

export default function PatternsLens({ scope, refreshKey = 0 }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [compareMode, setCompareMode] = useState('platform');
  const [scopeCount, setScopeCount] = useState(0);
  const [baselineCount, setBaselineCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // Resolve scope to channel IDs
        const scopeIds = await resolveScopeToChannelIds(scope);
        if (cancelled) return;
        setScopeCount(scopeIds.length);

        // Baseline = ALL competitor channels (regardless of scope filters), minus scope itself
        let baselineIds = null;
        if (compareMode === 'platform') {
          const allIds = await resolveScopeToChannelIds({ tiers: ['priority', 'tracked'] });
          if (cancelled) return;
          baselineIds = allIds.filter(id => !scopeIds.includes(id));
          setBaselineCount(baselineIds.length);
        } else {
          setBaselineCount(0);
        }

        const data = await analyzePatterns({
          scopeChannelIds: scopeIds,
          baselineChannelIds: baselineIds,
          windowDays: scope.windowDays || 90,
        });
        if (!cancelled) {
          setResult(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('[PatternsLens] analyze failed:', err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [
    scope.categoryIds?.join(','),
    scope.tags?.join(','),
    scope.tiers?.join(','),
    scope.windowDays,
    compareMode,
    refreshKey,
  ]);

  if (loading) return <Spinner label="Analyzing patterns…" />;
  if (!result || !result.scope.videoCount) {
    return (
      <EmptyState scope={scope} />
    );
  }

  return (
    <div>
      {/* Compare bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 14px', background: '#131316', border: '1px solid #1f1f24',
        borderRadius: '8px', marginBottom: '16px',
      }}>
        <SmallLabel>Comparing</SmallLabel>
        <span style={{ ...pillStyle(true) }}>This scope ({scopeCount} ch)</span>
        <span style={{ color: '#666', fontWeight: 600, fontSize: '12px', padding: '0 6px' }}>vs</span>
        <select
          value={compareMode}
          onChange={(e) => setCompareMode(e.target.value)}
          style={{
            background: '#18181c', border: '1px solid #232328', color: '#d4d4d8',
            padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {COMPARE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#707070' }}>
          {result.scope.videoCount} videos in scope
          {compareMode === 'platform' && result.baseline ? ` · ${result.baseline.videoCount} in baseline` : ''}
        </span>
      </div>

      {/* Title patterns */}
      <Panel
        title="◇ Title patterns"
        subtitle={compareMode === 'platform'
          ? 'Lift shown vs platform average. Median views = how the videos with this pattern performed.'
          : 'Frequency and performance of common title structures.'}
      >
        <TitlePatternsTable
          patterns={result.scope.titlePatterns}
          compare={result.compare}
        />
      </Panel>

      {/* Format breakdown */}
      <Panel title="▥ Format mix" style={{ marginTop: '16px' }}>
        <FormatMix
          scope={result.scope.formatBreakdown}
          baseline={result.baseline?.formatBreakdown}
        />
      </Panel>

      {/* Outliers */}
      <Panel
        title="↗ Outliers"
        subtitle={`videos > 2× their channel's median (last ${scope.windowDays || 90} days). Proof points for pitch decks.`}
        style={{ marginTop: '16px' }}
      >
        <OutlierList outliers={result.scope.outliers} />
      </Panel>
    </div>
  );
}

// ───────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────
function TitlePatternsTable({ patterns, compare }) {
  // Order: significant + present patterns first, by freq desc
  const sorted = [...patterns].sort((a, b) => b.freq - a.freq);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ background: 'transparent' }}>
          <Th>Pattern</Th>
          <Th align="right">Freq</Th>
          <Th align="right">Median views</Th>
          <Th align="right">Engagement</Th>
          {compare && <Th align="right">vs baseline</Th>}
        </tr>
      </thead>
      <tbody>
        {sorted.map(p => {
          const lift = compare?.titlePatternLifts.find(l => l.id === p.id);
          return (
            <tr key={p.id} style={{ borderBottom: '1px solid #1c1c20' }}>
              <Td>{p.label}</Td>
              <Td align="right">{(p.freq * 100).toFixed(0)}%</Td>
              <Td align="right">{p.medianViews != null ? formatNumber(p.medianViews) : '—'}</Td>
              <Td align="right">
                {p.avgEngagement != null ? `${(p.avgEngagement * 100).toFixed(1)}%` : '—'}
              </Td>
              {compare && (
                <Td align="right">
                  <LiftBadges freqLift={lift?.freqLift} engLift={lift?.engagementLift} />
                </Td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LiftBadges({ freqLift, engLift }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
      {engLift && (
        <span style={{
          fontSize: '11px', fontWeight: 600,
          color: engLift.direction === 'pos' ? '#34d399' : engLift.direction === 'neg' ? '#f87171' : '#707070',
        }}>
          {engLift.direction === 'pos' && '▲ '}
          {engLift.direction === 'neg' && '▼ '}
          {engLift.direction === 'flat' ? '— eng' : `eng ${Math.abs(engLift.pct).toFixed(0)}%`}
        </span>
      )}
      {freqLift && (
        <span style={{
          fontSize: '10px', fontWeight: 500,
          color: freqLift.direction === 'pos' ? '#22c55e' : freqLift.direction === 'neg' ? '#dc2626' : '#666',
        }}>
          {freqLift.direction === 'pos' && '▲ '}
          {freqLift.direction === 'neg' && '▼ '}
          {freqLift.direction === 'flat' ? '— freq' : `freq ${Math.abs(freqLift.pct).toFixed(0)}%`}
        </span>
      )}
      {!engLift && !freqLift && <span style={{ color: '#555', fontSize: '11px' }}>—</span>}
    </div>
  );
}

function FormatMix({ scope, baseline }) {
  return (
    <div>
      {/* Shorts vs long bar */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#aaa', marginBottom: '6px' }}>
          <span>Scope</span>
          <span>
            <b style={{ color: '#fff' }}>{Math.round(scope.longsFreq * 100)}%</b> long-form ·{' '}
            <b style={{ color: '#fff' }}>{Math.round(scope.shortsFreq * 100)}%</b> Shorts
          </span>
        </div>
        <div style={{ display: 'flex', height: '12px', borderRadius: '4px', overflow: 'hidden', background: '#1c1c20' }}>
          <div style={{ width: `${scope.longsFreq * 100}%`, background: '#0ea5e9' }} />
          <div style={{ width: `${scope.shortsFreq * 100}%`, background: '#f97316' }} />
        </div>
        {baseline && (
          <div style={{ fontSize: '11px', color: '#888', marginTop: '6px' }}>
            Baseline: {Math.round(baseline.longsFreq * 100)}% long / {Math.round(baseline.shortsFreq * 100)}% Shorts
            {' · '}
            {scope.shortsFreq > baseline.shortsFreq + 0.05
              ? <span style={{ color: '#fb923c' }}>scope leans more Shorts-heavy</span>
              : scope.shortsFreq < baseline.shortsFreq - 0.05
                ? <span style={{ color: '#38bdf8' }}>scope leans more long-form-heavy</span>
                : <span style={{ color: '#888' }}>similar mix to baseline</span>}
          </div>
        )}
      </div>

      {/* Length buckets */}
      <div style={{ fontSize: '11px', color: '#666', fontWeight: 600, letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: '8px' }}>
        Long-form length distribution
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>
            <Th>Length</Th>
            <Th align="right">Videos</Th>
            <Th align="right">% of total</Th>
            <Th align="right">Median views</Th>
          </tr>
        </thead>
        <tbody>
          {scope.buckets.map(b => (
            <tr key={b.id} style={{ borderBottom: '1px solid #1c1c20' }}>
              <Td>{b.label}</Td>
              <Td align="right">{b.count}</Td>
              <Td align="right">{(b.freq * 100).toFixed(0)}%</Td>
              <Td align="right">{b.medianViews != null ? formatNumber(b.medianViews) : '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutlierList({ outliers }) {
  if (!outliers?.length) {
    return <div style={{ padding: '20px', color: '#666', fontSize: '12px', textAlign: 'center' }}>
      No outliers in this window. Channels need ≥5 videos for outlier detection.
    </div>;
  }
  return outliers.map(o => {
    const videoHref = o.youtubeVideoId ? `https://youtu.be/${o.youtubeVideoId}` : '#';
    const suspect = o.isSuspect;
    return (
      <a
        key={o.id}
        href={videoHref}
        target="_blank" rel="noopener noreferrer"
        title={suspect
          ? 'Engagement is well below this channel’s norm — likely inflated views'
          : ''}
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: '12px',
          padding: '12px 0',
          borderBottom: '1px solid #1c1c20',
          textDecoration: 'none',
          alignItems: 'center',
          opacity: suspect ? 0.7 : 1,
        }}
      >
        <OutlierThumb video={o} suspect={suspect} />
        <div style={{ overflow: 'hidden' }}>
          <div style={{
            fontSize: '13px', color: '#fff', fontWeight: 600, lineHeight: 1.4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title}</span>
            {suspect && <SuspectBadge ratio={o.engagementRatio} />}
          </div>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', display: 'flex', alignItems: 'center', gap: 6 }}>
            {o.channel.thumbnailUrl && (
              <img
                src={o.channel.thumbnailUrl}
                alt=""
                loading="lazy"
                onError={e => { e.currentTarget.style.display = 'none'; }}
                style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
            )}
            <span><b style={{ color: '#d4d4d4' }}>{o.channel.name}</b> · {formatNumber(o.views)} views
            {o.engagement != null && (
              <> · <span style={{ color: suspect ? '#f87171' : '#888' }}>{(o.engagement * 100).toFixed(1)}% engagement</span></>
            )}
            {' · '}{formatRelative(o.publishedAt)}</span>
          </div>
        </div>
        <div style={{
          fontSize: '14px', fontWeight: 700,
          color: suspect ? '#9ca3af' : '#34d399',
          background: suspect ? 'rgba(156,163,175,0.08)' : 'rgba(16,185,129,0.10)',
          padding: '4px 10px', borderRadius: '6px',
          border: `1px solid ${suspect ? 'rgba(156,163,175,0.2)' : 'rgba(16,185,129,0.25)'}`,
          whiteSpace: 'nowrap',
        }}>
          {o.multiplier.toFixed(1)}× median
        </div>
      </a>
    );
  });
}

function SuspectBadge({ ratio }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700,
      color: '#fbbf24', background: 'rgba(251,191,36,0.10)',
      border: '1px solid rgba(251,191,36,0.30)',
      padding: '2px 6px', borderRadius: 3,
      textTransform: 'uppercase', letterSpacing: '0.4px',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      Low eng{ratio != null ? ` · ${Math.round(ratio * 100)}% of norm` : ''}
    </span>
  );
}

function OutlierThumb({ video, suspect }) {
  const w = 96, h = 54;
  const wrapStyle = {
    width: w, height: h, borderRadius: 6, overflow: 'hidden',
    background: '#18181c',
    border: `1px solid ${suspect ? 'rgba(251,191,36,0.35)' : '#232328'}`,
    flexShrink: 0,
  };
  if (!video.thumbnailUrl) return <div style={wrapStyle} />;
  return (
    <div style={wrapStyle}>
      <img
        src={video.thumbnailUrl}
        alt=""
        loading="lazy"
        onError={e => { e.currentTarget.style.display = 'none'; }}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: suspect ? 'saturate(0.5)' : 'none' }}
      />
    </div>
  );
}

// ───────────────────────────────────────────
// Layout primitives
// ───────────────────────────────────────────
function Panel({ title, subtitle, children, style }) {
  return (
    <div style={{
      background: '#131316', border: '1px solid #1f1f24',
      borderRadius: '10px', padding: '18px 20px',
      ...(style || {}),
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: subtitle ? '4px' : '14px' }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: '11px', color: '#707070', marginBottom: '14px' }}>
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      padding: '8px 10px',
      textAlign: align,
      fontSize: '10px',
      fontWeight: 700,
      color: '#707070',
      letterSpacing: '0.7px',
      textTransform: 'uppercase',
      borderBottom: '1px solid #1f1f24',
    }}>{children}</th>
  );
}

function Td({ children, align = 'left' }) {
  return (
    <td style={{
      padding: '11px 10px',
      textAlign: align,
      color: '#d4d4d4',
      fontVariantNumeric: 'tabular-nums',
    }}>{children}</td>
  );
}

function SmallLabel({ children }) {
  return <span style={{
    fontSize: '10px', fontWeight: 700, letterSpacing: '1.2px',
    color: '#555', textTransform: 'uppercase', marginRight: '2px',
  }}>{children}</span>;
}

function Spinner({ label }) {
  return (
    <div style={{ padding: '60px', textAlign: 'center', color: '#666' }}>
      <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
      <div style={{ marginTop: '8px', fontSize: '12px' }}>{label}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: '#888', background: '#131316', border: '1px solid #1f1f24', borderRadius: '10px' }}>
      <div style={{ fontSize: '15px', color: '#fff', marginBottom: '8px' }}>No videos in this scope</div>
      <div style={{ fontSize: '12px', color: '#666', maxWidth: '380px', margin: '0 auto', lineHeight: 1.6 }}>
        Either no channels are tagged for this scope, or no videos were published in the selected window.
        Try expanding the window or removing filters.
      </div>
    </div>
  );
}

function pillStyle(active) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '5px 11px', borderRadius: '6px',
    background: active ? '#1e3a8a' : '#1c1c20',
    border: `1px solid ${active ? '#2563eb' : '#2a2a30'}`,
    fontSize: '12px',
    color: active ? '#fff' : '#c0c0c0',
  };
}

// ───────────────────────────────────────────
// formatters
// ───────────────────────────────────────────
function formatNumber(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return Math.round(n).toLocaleString();
}
function formatRelative(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}yr ago`;
}
