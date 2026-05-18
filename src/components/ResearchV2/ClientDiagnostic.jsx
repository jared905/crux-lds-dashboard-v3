/**
 * ClientDiagnostic — top-of-page panel that appears when a client is pinned
 * in the ScopeBar. Pivots the cohort data so the client is the primary
 * axis: "what's working in your cohort" + (when client has its own YouTube
 * channel data) "where you're underperforming."
 *
 * The four lenses (Landscape, Patterns, White Space, Movement) stay
 * cohort-observation. This panel is the client-prescription layer.
 */
import React, { useEffect, useState } from 'react';
import { Loader, Sparkles, Target, TrendingUp, ChevronDown, Briefcase } from 'lucide-react';
import { computeClientDiagnostic, loadOrGenerateBriefing } from '../../services/clientDiagnosticService.js';
import { resolveScopeToChannelIds } from '../../services/patternsService.js';

export default function ClientDiagnostic({ scope, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  useEffect(() => {
    if (!scope.clientId) { setData(null); setBriefing(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setBriefing(null);
    (async () => {
      try {
        const scopeChannelIds = await resolveScopeToChannelIds(scope);
        const result = await computeClientDiagnostic({
          clientId: scope.clientId,
          scopeChannelIds,
          windowDays: scope.windowDays || 90,
        });
        if (cancelled) return;
        setData(result);
        setLoading(false);
        // Briefing runs in the background — slow first time (~2s Claude call),
        // cached thereafter. Don't block the data render on it.
        if (result) {
          setBriefingLoading(true);
          loadOrGenerateBriefing(result).then(b => {
            if (!cancelled) { setBriefing(b); setBriefingLoading(false); }
          });
        }
      } catch (err) {
        console.warn('[ClientDiagnostic] failed:', err);
        if (!cancelled) { setData(null); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [scope.clientId, scope.categoryIds?.join(','), scope.tags?.join(','), scope.tiers?.join(','), scope.windowDays, refreshKey]);

  if (!scope.clientId) return null;
  if (loading) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: 14, color: '#888', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
          Loading diagnostic…
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: 14, color: '#666', fontSize: 12 }}>
          No diagnostic available — try assigning some competitors to this client via the Pin to client action.
        </div>
      </div>
    );
  }

  const { client, mode, workingPatterns, workingBuckets, workingSlots, gaps, cohort } = data;
  const hasAnyData = workingPatterns.length || workingBuckets.length || workingSlots.length;

  return (
    <div style={panelStyle}>
      {/* Header */}
      <button onClick={() => setExpanded(v => !v)} style={{
        width: '100%', padding: '12px 16px', background: 'transparent', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', fontFamily: 'inherit', color: '#d4d4d8',
        borderBottom: expanded ? '1px solid rgba(167,139,250,0.18)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Briefcase size={14} style={{ color: '#a78bfa' }} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
              Diagnostic for <span style={{ color: '#a78bfa' }}>{client.name}</span>
              <span style={{ fontSize: 10, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '2px 6px', borderRadius: 3, marginLeft: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {mode === 'comparison' ? 'comparison' : 'prescriptive'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              {mode === 'comparison'
                ? `Comparing this client's ${data.clientStats?.videoCount || 0} videos to ${cohort.videoCount} cohort videos`
                : client.isStub
                  ? `Label-only client — showing what works in the ${cohort.videoCount}-video cohort`
                  : `Not enough client video data yet — showing cohort patterns. ${cohort.videoCount} cohort videos analyzed.`}
            </div>
          </div>
        </div>
        <ChevronDown size={14} style={{ color: '#666', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </button>

      {expanded && (
        <div style={{ padding: '14px 16px 16px' }}>
          {/* Claude-synthesized briefing — sits at the top so it reads first */}
          {(briefingLoading || briefing) && (
            <div style={{
              padding: '12px 14px', marginBottom: 14,
              background: 'rgba(167,139,250,0.08)',
              border: '1px solid rgba(167,139,250,0.30)',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Sparkles size={12} style={{ color: '#a78bfa' }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  This week's play
                </div>
              </div>
              {briefingLoading && !briefing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a1a1aa', fontSize: 12 }}>
                  <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  Synthesizing recommendation…
                </div>
              ) : briefing && (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#f4f4f5', marginBottom: 5, letterSpacing: '-0.2px' }}>
                    {briefing.headline}
                  </div>
                  <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 1.55 }}>
                    {briefing.body}
                  </div>
                </>
              )}
            </div>
          )}

          {!hasAnyData ? (
            <div style={{ color: '#666', fontSize: 12 }}>
              The cohort doesn't have enough video data with significant lift to draw insights yet.
              Sync the competitors and retry — needs at least a few videos per pattern / slot to compute a reliable lift.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              {/* Working patterns */}
              <Card icon={<TrendingUp size={12} />} title="Title patterns that work" subtitle="Cohort median views by pattern">
                {workingPatterns.length === 0 && <Empty>No patterns show significant lift in this cohort.</Empty>}
                {workingPatterns.map(p => {
                  const clientFreq = data.clientStats?.patterns.find(x => x.id === p.id)?.freq;
                  return (
                    <Row key={p.id}>
                      <span>{p.label}</span>
                      <RowMeta>
                        <Lift value={p.lift} />
                        <Freq label="Cohort" value={p.freq} />
                        {mode === 'comparison' && (
                          <Freq label="You" value={clientFreq ?? 0} highlight={clientFreq != null && p.freq > clientFreq * 2} />
                        )}
                      </RowMeta>
                    </Row>
                  );
                })}
              </Card>

              {/* Working format buckets */}
              <Card icon={<Target size={12} />} title="Length sweet spots" subtitle="Buckets where cohort over-performs">
                {workingBuckets.length === 0 && <Empty>No length bucket shows significant lift in this cohort.</Empty>}
                {workingBuckets.map(b => {
                  const clientFreq = data.clientStats?.buckets.find(x => x.id === b.id)?.freq;
                  return (
                    <Row key={b.id}>
                      <span style={{ fontSize: 12 }}>{b.label}</span>
                      <RowMeta>
                        <Lift value={b.lift} />
                        <Freq label="Cohort" value={b.freq} />
                        {mode === 'comparison' && (
                          <Freq label="You" value={clientFreq ?? 0} highlight={clientFreq != null && b.freq > clientFreq * 2} />
                        )}
                      </RowMeta>
                    </Row>
                  );
                })}
              </Card>

              {/* Working time slots */}
              <Card icon={<Sparkles size={12} />} title="Posting time sweet spots" subtitle="Day × time blocks (Mountain) where cohort over-performs">
                {workingSlots.length === 0 && <Empty>No time slot shows significant lift in this cohort.</Empty>}
                {workingSlots.map((s, i) => (
                  <Row key={`${s.day}-${s.block}-${i}`}>
                    <span style={{ fontSize: 12 }}>{s.slot}</span>
                    <RowMeta>
                      <Lift value={s.lift} />
                      <span style={{ fontSize: 10, color: '#666' }}>{s.count} uploads</span>
                    </RowMeta>
                  </Row>
                ))}
              </Card>

              {/* Gaps (comparison mode only) */}
              {mode === 'comparison' && gaps.length > 0 && (
                <Card icon={<TrendingUp size={12} />} title="Gaps to close" subtitle="Cohort uses these ≥2× more often" accent="#fbbf24" wide>
                  {gaps.map(g => (
                    <Row key={g.id}>
                      <span>
                        {g.label}
                        <span style={{ fontSize: 10, color: '#fbbf24', marginLeft: 6 }}>
                          cohort uses {g.freqRatio.toFixed(1)}× more
                        </span>
                      </span>
                      <RowMeta>
                        <Lift value={g.cohortLift} />
                        <Freq label="Cohort" value={g.cohortFreq} />
                        <Freq label="You" value={g.clientFreq} highlight />
                      </RowMeta>
                    </Row>
                  ))}
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Presentational ───
function Card({ icon, title, subtitle, accent = '#a78bfa', wide = false, children }) {
  return (
    <div style={{
      padding: 12, borderRadius: 8,
      background: '#101015', border: `1px solid ${accent}33`,
      gridColumn: wide ? '1 / -1' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ color: accent }}>{icon}</span>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{title}</div>
      </div>
      {subtitle && (
        <div style={{ fontSize: 10, color: '#666', marginBottom: 8 }}>{subtitle}</div>
      )}
      <div>{children}</div>
    </div>
  );
}

function Row({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 0', borderBottom: '1px solid #1c1c20',
      fontSize: 12, color: '#d4d4d8',
    }}>{children}</div>
  );
}

function RowMeta({ children }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </div>
  );
}

function Lift({ value }) {
  if (value == null) return <span style={{ fontSize: 10, color: '#555' }}>n/a</span>;
  const pct = Math.round((value - 1) * 100);
  const color = pct >= 15 ? '#34d399' : pct <= -15 ? '#f87171' : '#888';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 38, textAlign: 'right' }}>
      {pct > 0 ? '+' : ''}{pct}%
    </span>
  );
}

function Freq({ label, value, highlight = false }) {
  return (
    <span style={{
      fontSize: 10, color: highlight ? '#fbbf24' : '#888',
      minWidth: 56, textAlign: 'right', fontWeight: highlight ? 700 : 500,
    }}>
      {label} {(value * 100).toFixed(0)}%
    </span>
  );
}

function Empty({ children }) {
  return <div style={{ fontSize: 11, color: '#666', padding: '4px 0' }}>{children}</div>;
}

const panelStyle = {
  marginBottom: 14,
  borderRadius: 10,
  background: 'linear-gradient(135deg, rgba(167,139,250,0.08), rgba(59,130,246,0.04))',
  border: '1px solid rgba(167,139,250,0.25)',
};
