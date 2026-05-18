/**
 * White Space lens — AI-synthesized opportunity brief + topic / format / cadence gaps.
 * Built for client pitch decks.
 */
import React, { useEffect, useState } from 'react';
import { Loader, Sparkles, RefreshCw } from 'lucide-react';
import { analyzeWhiteSpace, resolveScopeToChannelIds } from '../../services/whiteSpaceService.js';

export default function WhiteSpaceLens({ scope, refreshKey = 0 }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scopeLabel, setScopeLabel] = useState('All channels');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const scopeIds = await resolveScopeToChannelIds(scope);
        if (cancelled) return;

        // Build a readable scope label for the AI brief
        const label = await buildScopeLabel(scope);
        setScopeLabel(label);

        const data = await analyzeWhiteSpace({
          scopeChannelIds: scopeIds,
          windowDays: scope.windowDays || 90,
          scopeLabel: label,
        });
        if (!cancelled) {
          setResult(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('[WhiteSpaceLens] analyze failed:', err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [
    scope.categoryIds?.join(','),
    scope.tags?.join(','),
    scope.tiers?.join(','),
    scope.clientId,
    scope.windowDays,
    refreshKey,
  ]);

  if (loading) return <Spinner label="Generating opportunity brief…" />;
  if (!result || result.empty) return <EmptyState />;

  return (
    <div>
      {/* Opportunity brief — hero */}
      <BriefCard brief={result.brief} scopeLabel={scopeLabel} videoCount={result.videoCount} channelCount={result.channelCount} windowDays={scope.windowDays || 90} />

      {/* Topic coverage */}
      <Panel
        title="📊 Topic coverage"
        subtitle="Themes extracted from titles. Gap-flagged topics are candidate opportunities."
        style={{ marginTop: '16px' }}
      >
        <TopicCoverageList topics={result.topicCoverage} />
      </Panel>

      {/* Two-up: Format + Cadence */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
        <Panel title="📐 Format gaps" subtitle="Length buckets with <8% representation are flagged.">
          <FormatGapsTable buckets={result.formatGaps} />
        </Panel>
        <Panel title="⏰ Cadence density" subtitle="Mountain Time. Lighter = empty windows.">
          <CadenceHeatmap data={result.cadenceGaps} />
        </Panel>
      </div>

      <div style={{ marginTop: '20px', fontSize: '11px', color: '#555', fontStyle: 'italic', textAlign: 'center' }}>
        White space is probabilistic. Use as a hypothesis generator — validate before pitching as strategy.
      </div>
    </div>
  );
}

// ───────────────────────────────────────────
// Brief card (hero)
// ───────────────────────────────────────────
function BriefCard({ brief, scopeLabel, videoCount, channelCount, windowDays }) {
  if (!brief?.opportunities?.length) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #14132a 0%, #1a1830 100%)',
        border: '1px solid #2a2840',
        borderRadius: '10px',
        padding: '20px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.2px', color: '#a78bfa', textTransform: 'uppercase', marginBottom: '8px' }}>
          Opportunity brief
        </div>
        <div style={{ color: '#888', fontSize: '13px' }}>
          {brief?.error
            ? `Brief generation failed: ${brief.error}`
            : 'Not enough content in scope to generate a brief. Expand the window or add more channels.'}
        </div>
      </div>
    );
  }

  const tagColor = (tag) => {
    if (!tag) return { bg: '#1c1c20', border: '#2a2a30', color: '#aaa' };
    if (tag.includes('topic'))    return { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', color: '#fbbf24' };
    if (tag.includes('format'))   return { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)', color: '#a78bfa' };
    if (tag.includes('cadence'))  return { bg: 'rgba(14,165,233,0.12)', border: 'rgba(14,165,233,0.3)', color: '#38bdf8' };
    if (tag.includes('audience')) return { bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.3)', color: '#f472b6' };
    return { bg: '#1c1c20', border: '#2a2a30', color: '#aaa' };
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #14132a 0%, #1a1830 100%)',
      border: '1px solid #2a2840',
      borderRadius: '10px',
      padding: '22px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.2px', color: '#a78bfa', textTransform: 'uppercase' }}>
          <Sparkles size={11} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
          Opportunity brief · {scopeLabel}
        </div>
        <span style={{ fontSize: '10px', color: '#666' }}>
          {brief.generatedAt && `Updated ${formatRelative(brief.generatedAt)}`}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: '#707070', marginBottom: '18px' }}>
        AI synthesis · {channelCount} channels · {videoCount} videos · last {windowDays} days
      </div>

      {brief.opportunities.map((opp, i) => (
        <div key={i} style={{ padding: '14px 0', borderBottom: i < brief.opportunities.length - 1 ? '1px solid #252338' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
            <span style={{
              display: 'inline-block', width: '22px', height: '22px', borderRadius: '50%',
              background: 'rgba(139,92,246,0.2)', color: '#c4b5fd',
              fontSize: '11px', fontWeight: 700, textAlign: 'center', lineHeight: '22px', flexShrink: 0,
            }}>{i + 1}</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff', lineHeight: 1.35 }}>{opp.title}</span>
          </div>
          <div style={{ fontSize: '13px', color: '#d4d4dc', lineHeight: 1.6, paddingLeft: '32px' }}>
            {opp.body}
          </div>
          {opp.tags?.length > 0 && (
            <div style={{ paddingLeft: '32px', marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {opp.tags.map((tag, ti) => {
                const c = tagColor(tag);
                return (
                  <span key={ti} style={{
                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px',
                    padding: '2px 8px', borderRadius: '4px',
                    background: c.bg, color: c.color, border: `1px solid ${c.border}`,
                  }}>{tag.toUpperCase()}</span>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────
// Topic coverage list
// ───────────────────────────────────────────
function TopicCoverageList({ topics }) {
  if (!topics?.length) {
    return <div style={{ padding: '20px', color: '#666', fontSize: '12px', textAlign: 'center' }}>
      Not enough titles to extract topics.
    </div>;
  }
  // Sort: gaps last (highlighted), saturated first
  const order = { saturated: 0, moderate: 1, gap: 2 };
  const sorted = [...topics].sort((a, b) => (order[a.coverage] || 0) - (order[b.coverage] || 0) || b.count - a.count);
  const max = Math.max(...topics.map(t => t.count), 1);

  return (
    <div>
      {sorted.map((t, i) => {
        const isGap = t.coverage === 'gap';
        const color = isGap ? '#fbbf24' : t.coverage === 'saturated' ? '#60a5fa' : '#888';
        const barColor = isGap
          ? 'linear-gradient(to right, #b45309, #f59e0b)'
          : 'linear-gradient(to right, #3b82f6, #60a5fa)';
        return (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '200px 1fr 70px 60px',
            gap: '12px',
            alignItems: 'center',
            padding: '9px 0',
            borderBottom: '1px solid #1c1c20',
            fontSize: '13px',
          }}>
            <span style={{ color: isGap ? '#fbbf24' : '#d4d4d4', fontWeight: isGap ? 600 : 500 }}>{t.name}</span>
            <div style={{ height: '16px', background: '#1c1c20', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${(t.count / max) * 100}%`, height: '100%', background: barColor, borderRadius: '3px' }} />
            </div>
            <span style={{ color: '#fff', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '12px' }}>{t.count}</span>
            <span style={{ color, textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
              {t.coverage}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────
// Format gaps table
// ───────────────────────────────────────────
function FormatGapsTable({ buckets }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr>
          <Th>Length</Th>
          <Th align="right">Videos</Th>
          <Th align="right">% total</Th>
          <Th align="right">Status</Th>
        </tr>
      </thead>
      <tbody>
        {buckets.map(b => (
          <tr key={b.id} style={{ borderBottom: '1px solid #1c1c20' }}>
            <Td color={b.isGap ? '#fbbf24' : '#d4d4d4'}>{b.label}</Td>
            <Td align="right">{b.count}</Td>
            <Td align="right">{(b.freq * 100).toFixed(0)}%</Td>
            <Td align="right">
              {b.isGap ? (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)', letterSpacing: '0.3px' }}>GAP</span>
              ) : (
                <span style={{ color: '#666', fontSize: '11px' }}>OK</span>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ───────────────────────────────────────────
// Cadence heatmap
// ───────────────────────────────────────────
function CadenceHeatmap({ data }) {
  if (!data?.grid) return null;
  const [mode, setMode] = React.useState('performance'); // 'performance' | 'density'

  // Density max for shading the count view
  let maxCount = 0;
  for (const row of data.grid) for (const cell of row) if (cell > maxCount) maxCount = cell;

  const shadeDensity = (count) => {
    if (maxCount === 0) return '#1c1c20';
    const intensity = count / maxCount;
    if (intensity === 0) return 'rgba(245,158,11,0.10)';
    if (intensity < 0.25) return '#1e3a5f';
    if (intensity < 0.5) return '#2563eb';
    if (intensity < 0.75) return '#3b82f6';
    return '#60a5fa';
  };

  // Performance shading: green for >1× scope median, red for <1×, gray for n/a
  const shadePerf = (lift, count) => {
    if (count === 0) return 'rgba(245,158,11,0.10)';
    if (lift == null) return '#1f1f25'; // not enough sample
    if (lift >= 1.5) return '#065f46'; // strong over
    if (lift >= 1.15) return '#10b981';
    if (lift >= 0.85) return '#374151'; // ~flat
    if (lift >= 0.5) return '#7f1d1d';
    return '#5b0d0d';
  };

  const cellText = (dayIdx, blockIdx) => {
    const count = data.grid[dayIdx][blockIdx];
    if (count === 0) return '';
    if (mode === 'density') return String(count);
    const lift = data.liftGrid?.[dayIdx]?.[blockIdx];
    if (lift == null) return `${count}`;
    const pct = Math.round((lift - 1) * 100);
    if (Math.abs(pct) < 5) return '—';
    return `${pct > 0 ? '+' : ''}${pct}%`;
  };

  const cellTitle = (dayIdx, blockIdx) => {
    const count = data.grid[dayIdx][blockIdx];
    const med = data.medianGrid?.[dayIdx]?.[blockIdx];
    const lift = data.liftGrid?.[dayIdx]?.[blockIdx];
    const parts = [`${count} upload${count === 1 ? '' : 's'}`];
    if (med != null) parts.push(`median ${med >= 1000 ? (med / 1000).toFixed(1) + 'K' : Math.round(med)} views`);
    if (lift != null) parts.push(`${lift.toFixed(2)}× scope median`);
    return parts.join(' · ');
  };

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <ToggleBtn active={mode === 'performance'} onClick={() => setMode('performance')}>Performance</ToggleBtn>
        <ToggleBtn active={mode === 'density'} onClick={() => setMode('density')}>Density</ToggleBtn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(7, 1fr)', gap: '3px', fontSize: '10px' }}>
        <span />
        {data.labels.days.map(d => (
          <span key={d} style={{ color: '#888', textAlign: 'center', fontWeight: 600 }}>{d}</span>
        ))}
        {data.labels.blocks.map((blockLabel, blockIdx) => (
          <React.Fragment key={blockIdx}>
            <span style={{ color: '#888', textAlign: 'right', paddingRight: '6px', alignSelf: 'center' }}>
              {blockLabel.split(' ')[0]}
            </span>
            {data.grid.map((dayRow, dayIdx) => {
              const count = dayRow[blockIdx];
              const bg = mode === 'density'
                ? shadeDensity(count)
                : shadePerf(data.liftGrid?.[dayIdx]?.[blockIdx], count);
              return (
                <div
                  key={dayIdx}
                  title={cellTitle(dayIdx, blockIdx)}
                  style={{
                    height: '24px', background: bg, borderRadius: '2px',
                    border: count === 0 ? '1px dashed rgba(251,191,36,0.5)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '9px', color: count === 0 ? '#fbbf24' : '#fff', fontWeight: 700,
                  }}
                >{cellText(dayIdx, blockIdx)}</div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span>
          <span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'rgba(245,158,11,0.10)', border: '1px dashed rgba(251,191,36,0.5)', borderRadius: '2px', marginRight: '4px', verticalAlign: 'middle' }} />
          Empty window
        </span>
        {mode === 'performance' ? (
          <span>
            <span style={{ color: '#aaa' }}>Views vs scope median:</span>
            <span title="≤ 50%" style={{ display: 'inline-block', width: '14px', height: '8px', background: '#5b0d0d', marginLeft: '4px', borderRadius: '2px' }} />
            <span title="50–85%" style={{ display: 'inline-block', width: '14px', height: '8px', background: '#7f1d1d', marginLeft: '2px', borderRadius: '2px' }} />
            <span title="85–115% (flat)" style={{ display: 'inline-block', width: '14px', height: '8px', background: '#374151', marginLeft: '2px', borderRadius: '2px' }} />
            <span title="115–150%" style={{ display: 'inline-block', width: '14px', height: '8px', background: '#10b981', marginLeft: '2px', borderRadius: '2px' }} />
            <span title="≥ 150%" style={{ display: 'inline-block', width: '14px', height: '8px', background: '#065f46', marginLeft: '2px', borderRadius: '2px' }} />
          </span>
        ) : (
          <span>
            <span style={{ color: '#aaa' }}>Density:</span>
            <span style={{ display: 'inline-block', width: '12px', height: '8px', background: '#1e3a5f', marginLeft: '4px', borderRadius: '2px' }} />
            <span style={{ display: 'inline-block', width: '12px', height: '8px', background: '#2563eb', marginLeft: '2px', borderRadius: '2px' }} />
            <span style={{ display: 'inline-block', width: '12px', height: '8px', background: '#3b82f6', marginLeft: '2px', borderRadius: '2px' }} />
            <span style={{ display: 'inline-block', width: '12px', height: '8px', background: '#60a5fa', marginLeft: '2px', borderRadius: '2px' }} />
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 4,
      background: active ? '#2563eb' : '#18181c',
      color: active ? '#fff' : '#a1a1aa',
      border: `1px solid ${active ? '#2563eb' : '#232328'}`,
      fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
    }}>{children}</button>
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
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: subtitle ? '4px' : '14px' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '11px', color: '#707070', marginBottom: '14px' }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      padding: '8px 10px', textAlign: align,
      fontSize: '10px', fontWeight: 700, color: '#707070',
      letterSpacing: '0.7px', textTransform: 'uppercase',
      borderBottom: '1px solid #1f1f24',
    }}>{children}</th>
  );
}

function Td({ children, align = 'left', color = '#d4d4d4' }) {
  return (
    <td style={{
      padding: '11px 10px', textAlign: align,
      color, fontVariantNumeric: 'tabular-nums',
    }}>{children}</td>
  );
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
        Pick a category, expand the time window, or sync more channels.
      </div>
    </div>
  );
}

// ───────────────────────────────────────────
// helpers
// ───────────────────────────────────────────
async function buildScopeLabel(scope) {
  if (!scope.categoryIds?.length && !scope.tags?.length) return 'All tracked channels';
  // For now just build a simple label from filter selections
  // (real implementation would resolve category names via supabase)
  try {
    const { supabase } = await import('../../services/supabaseClient');
    if (!scope.categoryIds?.length) {
      return scope.tags?.length ? `Tagged: ${scope.tags.join(', ')}` : 'All tracked channels';
    }
    const { data } = await supabase
      .from('categories')
      .select('name')
      .in('id', scope.categoryIds);
    const names = (data || []).map(c => c.name).filter(Boolean);
    if (!names.length) return 'All tracked channels';
    if (names.length === 1) return names[0];
    return names.join(' + ');
  } catch (err) {
    return 'this scope';
  }
}

function formatRelative(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) {
    const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    if (hours < 1) return 'just now';
    return `${hours}h ago`;
  }
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
