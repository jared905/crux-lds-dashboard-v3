/**
 * ClientDiagnostic — top-of-page panel that appears when a client is pinned
 * in the ScopeBar. Pivots the cohort data so the client is the primary
 * axis: "what's working in your cohort" + (when client has its own YouTube
 * channel data) "where you're underperforming."
 *
 * The four lenses (Landscape, Patterns, White Space, Movement) stay
 * cohort-observation. This panel is the client-prescription layer.
 */
import {useEffect, useState} from 'react';
import { computeClientDiagnostic, loadOrGenerateBriefing } from '../../services/clientDiagnosticService.js';
import { resolveScopeToChannelIds } from '../../services/patternsService.js';
import { Briefcase, ChevronDown, Loader, Sparkles, Target, TrendingUp } from 'lucide-react';

export default function ClientDiagnostic({ scope, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  // The scope object's identity churns per render; this serialized key covers
  // every scope field the fetch reads, so it stands in as the dependency.
  const scopeKey = [scope.clientId, scope.categoryIds?.join(','), scope.tags?.join(','), scope.tiers?.join(','), scope.windowDays].join('|');
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, refreshKey]);

  if (!scope.clientId) return null;
  if (loading) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: 14, color: 'var(--outline)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
          Loading diagnostic…
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: 14, color: 'var(--faint)', fontSize: 12 }}>
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
        cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)',
        borderBottom: expanded ? '1px solid rgba(76,214,255,0.18)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Briefcase size={14} style={{ color: 'var(--accent-text)' }} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
              Diagnostic for <span style={{ color: 'var(--accent-text)' }}>{client.name}</span>
              <span style={{ fontSize: 10, color: 'var(--accent-text)', background: 'rgba(76,214,255,0.12)', padding: '2px 6px', borderRadius: 3, marginLeft: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {mode === 'comparison' ? 'comparison' : 'prescriptive'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 2 }}>
              {mode === 'comparison'
                ? `Comparing this client's ${data.clientStats?.videoCount || 0} videos to ${cohort.videoCount} cohort videos`
                : client.isStub
                  ? `Label-only client — showing what works in the ${cohort.videoCount}-video cohort`
                  : `Not enough client video data yet — showing cohort patterns. ${cohort.videoCount} cohort videos analyzed.`}
            </div>
          </div>
        </div>
        <ChevronDown size={14} style={{ color: 'var(--faint)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </button>

      {expanded && (
        <div style={{ padding: '14px 16px 16px' }}>
          {/* Claude-synthesized briefing — sits at the top so it reads first */}
          {(briefingLoading || briefing) && (
            <div style={{
              padding: '12px 14px', marginBottom: 14,
              background: 'rgba(76,214,255,0.08)',
              border: '1px solid rgba(76,214,255,0.30)',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Sparkles size={12} style={{ color: 'var(--accent-text)' }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  This week's play
                </div>
              </div>
              {briefingLoading && !briefing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12 }}>
                  <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  Synthesizing recommendation…
                </div>
              ) : briefing && (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 5, letterSpacing: '-0.2px' }}>
                    {briefing.headline}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55 }}>
                    {briefing.body}
                  </div>
                </>
              )}
            </div>
          )}

          {!hasAnyData ? (
            <div style={{ color: 'var(--faint)', fontSize: 12 }}>
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
                        <Lift value={p.lift} confidence={p.confidence} sampleSize={p.count} />
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
                        <Lift value={b.lift} confidence={b.confidence} sampleSize={b.count} />
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
                      <Lift value={s.lift} confidence={s.confidence} sampleSize={s.count} />
                      <span style={{ fontSize: 10, color: 'var(--faint)' }}>{s.count} uploads</span>
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
                        <span style={{ fontSize: 10, color: "var(--warn-text)", marginLeft: 6 }}>
                          cohort uses {g.freqRatio.toFixed(1)}× more
                        </span>
                      </span>
                      <RowMeta>
                        <Lift value={g.cohortLift} sampleSize={g.cohortFreq != null ? Math.round(g.cohortFreq * cohort.videoCount) : null} />
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
function Card({ icon, title, subtitle, accent = 'var(--accent-text)', wide = false, children }) {
  return (
    <div style={{
      padding: 12, borderRadius: 8,
      background: 'var(--bg)', border: `1px solid color-mix(in srgb, ${accent} 20%, transparent)`,
      gridColumn: wide ? '1 / -1' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ color: accent }}>{icon}</span>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{title}</div>
      </div>
      {subtitle && (
        <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 8 }}>{subtitle}</div>
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
      fontSize: 12, color: 'var(--text)',
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

function Lift({ value, confidence, sampleSize }) {
  if (value == null) {
    return <span style={{ fontSize: 10, color: 'var(--faint)' }} title={sampleSize != null ? `n=${sampleSize} — too small` : ''}>n/a</span>;
  }
  const pct = Math.round((value - 1) * 100);
  const directional = confidence === 'directional';
  const baseColor = pct >= 15 ? 'var(--pos-text)' : pct <= -15 ? 'var(--neg-text)' : 'var(--outline)';
  const color = directional ? (pct >= 15 ? 'var(--accent-text)' : 'var(--warn-text)') : baseColor;
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 38, justifyContent: 'flex-end' }}
      title={sampleSize != null ? `n=${sampleSize}${directional ? ' · directional, small sample' : ''}` : ''}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color }}>
        {pct > 0 ? '+' : ''}{pct}%
      </span>
      {directional && (
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: '0.4px',
          color: 'var(--accent-text)', background: 'rgba(76,214,255,0.10)',
          border: '1px solid rgba(76,214,255,0.30)',
          padding: '0 3px', borderRadius: 2, textTransform: 'uppercase',
        }}>dir</span>
      )}
    </span>
  );
}

function Freq({ label, value, highlight = false }) {
  return (
    <span style={{
      fontSize: 10, color: highlight ? "var(--warn-text)" : 'var(--outline)',
      minWidth: 56, textAlign: 'right', fontWeight: highlight ? 700 : 500,
    }}>
      {label} {(value * 100).toFixed(0)}%
    </span>
  );
}

function Empty({ children }) {
  return <div style={{ fontSize: 11, color: 'var(--faint)', padding: '4px 0' }}>{children}</div>;
}

const panelStyle = {
  marginBottom: 14,
  borderRadius: 10,
  background: 'linear-gradient(135deg, rgba(76,214,255,0.08), rgba(0,209,255,0.04))',
  border: '1px solid rgba(76,214,255,0.25)',
};
