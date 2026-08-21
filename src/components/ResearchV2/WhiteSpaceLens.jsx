/**
 * White Space lens — AI-synthesized opportunity brief + topic / format / cadence gaps.
 * Built for client pitch decks.
 */
import React, { useEffect, useState } from 'react';
import { analyzeWhiteSpace, resolveScopeToChannelIds } from '../../services/whiteSpaceService.js';
import { Loader, Sparkles } from 'lucide-react';

export default function WhiteSpaceLens({ scope, refreshKey = 0 }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scopeLabel, setScopeLabel] = useState('All channels');

  // The scope object's identity churns per render; this serialized key covers
  // every scope field the fetch reads, so it stands in as the dependency.
  const scopeKey = [scope.categoryIds?.join(','), scope.tags?.join(','), scope.tiers?.join(','), scope.clientId, scope.windowDays].join('|');
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, refreshKey]);

  if (loading) return <Spinner label="Generating opportunity brief…" />;
  if (!result || result.empty) return <EmptyState />;

  return (
    <div>
      {/* Opportunity brief — hero */}
      <BriefCard brief={result.brief} scopeLabel={scopeLabel} videoCount={result.videoCount} channelCount={result.channelCount} windowDays={scope.windowDays || 90} />

      {/* Topic coverage */}
      <Panel
        title="Topic coverage"
        subtitle="Themes extracted from titles. Gap-flagged topics are candidate opportunities."
        style={{ marginTop: '16px' }}
      >
        <TopicCoverageList topics={result.topicCoverage} />
      </Panel>

      {/* Two-up: Format + Cadence */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
        <Panel title="Format gaps" subtitle="Length buckets with <8% representation are flagged.">
          <FormatGapsTable buckets={result.formatGaps} />
        </Panel>
        <Panel title="Cadence density" subtitle="Mountain Time. Lighter = empty windows.">
          <CadenceHeatmap data={result.cadenceGaps} />
        </Panel>
      </div>

      <div style={{ marginTop: '20px', fontSize: '11px', color: 'var(--faint)', fontStyle: 'italic', textAlign: 'center' }}>
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
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.2px', color: 'var(--accent-text)', textTransform: 'uppercase', marginBottom: '8px' }}>
          Opportunity brief
        </div>
        <div style={{ color: 'var(--outline)', fontSize: '13px' }}>
          {brief?.error
            ? `Brief generation failed: ${brief.error}`
            : 'Not enough content in scope to generate a brief. Expand the window or add more channels.'}
        </div>
      </div>
    );
  }

  const tagColor = (tag) => {
    if (!tag) return { bg: 'var(--card)', border: 'var(--outline-variant)', color: 'var(--muted)' };
    if (tag.includes('topic'))    return { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', color: 'var(--warn-text)' };
    if (tag.includes('format'))   return { bg: 'rgba(0,209,255,0.12)', border: 'rgba(0,209,255,0.3)', color: 'var(--accent-text)' };
    if (tag.includes('cadence'))  return { bg: 'rgba(14,165,233,0.12)', border: 'rgba(14,165,233,0.3)', color: 'var(--accent-text)' };
    if (tag.includes('audience')) return { bg: 'rgba(255,131,117,0.12)', border: 'rgba(255,131,117,0.3)', color: 'var(--tert)' };
    return { bg: 'var(--card)', border: 'var(--outline-variant)', color: 'var(--muted)' };
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #14132a 0%, #1a1830 100%)',
      border: '1px solid #2a2840',
      borderRadius: '10px',
      padding: '22px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.2px', color: 'var(--accent-text)', textTransform: 'uppercase' }}>
          <Sparkles size={11} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
          Opportunity brief · {scopeLabel}
        </div>
        <span style={{ fontSize: '10px', color: 'var(--faint)' }}>
          {brief.generatedAt && `Updated ${formatRelative(brief.generatedAt)}`}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--faint)', marginBottom: '18px' }}>
        AI synthesis · {channelCount} channels · {videoCount} videos · last {windowDays} days
      </div>

      {brief.opportunities.map((opp, i) => (
        <div key={i} style={{ padding: '14px 0', borderBottom: i < brief.opportunities.length - 1 ? '1px solid #252338' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
            <span style={{
              display: 'inline-block', width: '22px', height: '22px', borderRadius: '50%',
              background: 'rgba(0,209,255,0.2)', color: 'var(--blue-pale)',
              fontSize: '11px', fontWeight: 700, textAlign: 'center', lineHeight: '22px', flexShrink: 0,
            }}>{i + 1}</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: "var(--ink)", lineHeight: 1.35 }}>{opp.title}</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, paddingLeft: '32px' }}>
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
    return <div style={{ padding: '20px', color: 'var(--faint)', fontSize: '12px', textAlign: 'center' }}>
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
        const color = isGap ? 'var(--warn-text)' : t.coverage === 'saturated' ? 'var(--accent-text)' : 'var(--outline)';
        const barColor = isGap
          ? 'linear-gradient(to right, #b45309, #f59e0b)'
          : 'linear-gradient(to right, #00D1FF, #4cd6ff)';
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
            <span style={{ color: isGap ? "var(--warn-text)" : 'var(--text)', fontWeight: isGap ? 600 : 500 }}>{t.name}</span>
            <div style={{ height: '16px', background: 'var(--card)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${(t.count / max) * 100}%`, height: '100%', background: barColor, borderRadius: '3px' }} />
            </div>
            <span style={{ color: "var(--ink)", textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '12px' }}>{t.count}</span>
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
            <Td color={b.isGap ? 'var(--warn-text)' : 'var(--text)'}>{b.label}</Td>
            <Td align="right">{b.count}</Td>
            <Td align="right">{(b.freq * 100).toFixed(0)}%</Td>
            <Td align="right">
              {b.isGap ? (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: 'rgba(245,158,11,0.12)', color: "var(--warn-text)", border: '1px solid rgba(245,158,11,0.3)', letterSpacing: '0.3px' }}>GAP</span>
              ) : (
                <span style={{ color: 'var(--faint)', fontSize: '11px' }}>OK</span>
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
  // Hook first: it used to sit below the guard, so a render with no grid
  // skipped it and shifted every later hook by one slot.
  const [mode, setMode] = React.useState('performance'); // 'performance' | 'density'
  if (!data?.grid) return null;

  // Density max for shading the count view
  let maxCount = 0;
  for (const row of data.grid) for (const cell of row) if (cell > maxCount) maxCount = cell;

  const shadeDensity = (count) => {
    if (maxCount === 0) return 'var(--card)';
    const intensity = count / maxCount;
    if (intensity === 0) return 'rgba(245,158,11,0.10)';
    if (intensity < 0.25) return 'var(--surface-high)';
    if (intensity < 0.5) return 'var(--blue)';
    if (intensity < 0.75) return 'var(--blue)';
    return 'var(--accent-text)';
  };

  // Performance shading: green for >1× scope median, red for <1×, gray for n/a.
  // Directional (small-sample) cells are rendered at half intensity so the
  // viewer reads them as "early signal, not statistical."
  const shadePerf = (lift, count, conf) => {
    if (count === 0) return 'rgba(245,158,11,0.10)';
    if (lift == null) return 'var(--card)'; // not enough sample
    const directional = conf === 'directional';
    if (lift >= 1.5) return directional ? 'var(--pos-bg)' : 'var(--pos-text)';
    if (lift >= 1.15) return directional ? 'var(--pos-text)' : 'var(--pos)';
    if (lift >= 0.85) return 'var(--outline-variant)'; // ~flat
    if (lift >= 0.5) return directional ? 'var(--neg-bg)' : 'var(--neg-bg)';
    return 'var(--neg-bg)';
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
    const conf = data.confidenceGrid?.[dayIdx]?.[blockIdx];
    const parts = [`${count} upload${count === 1 ? '' : 's'}`];
    if (med != null) parts.push(`median ${med >= 1000 ? (med / 1000).toFixed(1) + 'K' : Math.round(med)} views`);
    if (lift != null) parts.push(`${lift.toFixed(2)}× scope median`);
    if (conf === 'directional') parts.push('directional — small sample');
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
          <span key={d} style={{ color: 'var(--outline)', textAlign: 'center', fontWeight: 600 }}>{d}</span>
        ))}
        {data.labels.blocks.map((blockLabel, blockIdx) => (
          <React.Fragment key={blockIdx}>
            <span style={{ color: 'var(--outline)', textAlign: 'right', paddingRight: '6px', alignSelf: 'center' }}>
              {blockLabel.split(' ')[0]}
            </span>
            {data.grid.map((dayRow, dayIdx) => {
              const count = dayRow[blockIdx];
              const conf = data.confidenceGrid?.[dayIdx]?.[blockIdx];
              const bg = mode === 'density'
                ? shadeDensity(count)
                : shadePerf(data.liftGrid?.[dayIdx]?.[blockIdx], count, conf);
              return (
                <div
                  key={dayIdx}
                  title={cellTitle(dayIdx, blockIdx)}
                  style={{
                    height: '24px', background: bg, borderRadius: '2px',
                    border: count === 0 ? '1px dashed rgba(251,191,36,0.5)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '9px', color: count === 0 ? "var(--warn-text)" : 'var(--ink)', fontWeight: 700,
                  }}
                >{cellText(dayIdx, blockIdx)}</div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--faint)', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span>
          <span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'rgba(245,158,11,0.10)', border: '1px dashed rgba(251,191,36,0.5)', borderRadius: '2px', marginRight: '4px', verticalAlign: 'middle' }} />
          Empty window
        </span>
        {mode === 'performance' ? (
          <span>
            <span style={{ color: 'var(--muted)' }}>Views vs scope median:</span>
            <span title="≤ 50%" style={{ display: 'inline-block', width: '14px', height: '8px', background: 'var(--neg-bg)', marginLeft: '4px', borderRadius: '2px' }} />
            <span title="50–85%" style={{ display: 'inline-block', width: '14px', height: '8px', background: 'var(--neg-bg)', marginLeft: '2px', borderRadius: '2px' }} />
            <span title="85–115% (flat)" style={{ display: 'inline-block', width: '14px', height: '8px', background: 'var(--outline-variant)', marginLeft: '2px', borderRadius: '2px' }} />
            <span title="115–150%" style={{ display: 'inline-block', width: '14px', height: '8px', background: "var(--pos)", marginLeft: '2px', borderRadius: '2px' }} />
            <span title="≥ 150%" style={{ display: 'inline-block', width: '14px', height: '8px', background: 'var(--pos-text)', marginLeft: '2px', borderRadius: '2px' }} />
          </span>
        ) : (
          <span>
            <span style={{ color: 'var(--muted)' }}>Density:</span>
            <span style={{ display: 'inline-block', width: '12px', height: '8px', background: 'var(--surface-high)', marginLeft: '4px', borderRadius: '2px' }} />
            <span style={{ display: 'inline-block', width: '12px', height: '8px', background: 'var(--blue)', marginLeft: '2px', borderRadius: '2px' }} />
            <span style={{ display: 'inline-block', width: '12px', height: '8px', background: 'var(--blue)', marginLeft: '2px', borderRadius: '2px' }} />
            <span style={{ display: 'inline-block', width: '12px', height: '8px', background: 'var(--accent-text)', marginLeft: '2px', borderRadius: '2px' }} />
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
      background: active ? 'var(--blue)' : 'var(--card)',
      color: active ? 'var(--ink)' : 'var(--muted)',
      border: `1px solid ${active ? 'var(--blue)' : 'var(--surface-high)'}`,
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
      background: 'var(--bg)', border: '1px solid #1f1f24',
      borderRadius: '10px', padding: '18px 20px',
      ...(style || {}),
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: "var(--ink)", marginBottom: subtitle ? '4px' : '14px' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '11px', color: 'var(--faint)', marginBottom: '14px' }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      padding: '8px 10px', textAlign: align,
      fontSize: '10px', fontWeight: 700, color: 'var(--faint)',
      letterSpacing: '0.7px', textTransform: 'uppercase',
      borderBottom: '1px solid #1f1f24',
    }}>{children}</th>
  );
}

function Td({ children, align = 'left', color = 'var(--text)' }) {
  return (
    <td style={{
      padding: '11px 10px', textAlign: align,
      color, fontVariantNumeric: 'tabular-nums',
    }}>{children}</td>
  );
}

function Spinner({ label }) {
  return (
    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--faint)' }}>
      <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
      <div style={{ marginTop: '8px', fontSize: '12px' }}>{label}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--outline)', background: 'var(--bg)', border: '1px solid #1f1f24', borderRadius: '10px' }}>
      <div style={{ fontSize: '15px', color: "var(--ink)", marginBottom: '8px' }}>No videos in this scope</div>
      <div style={{ fontSize: '12px', color: 'var(--faint)', maxWidth: '380px', margin: '0 auto', lineHeight: 1.6 }}>
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
  } catch {
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
