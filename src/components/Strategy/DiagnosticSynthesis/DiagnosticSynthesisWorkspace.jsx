/**
 * DiagnosticSynthesisWorkspace — Strategy → Strategic State.
 *
 * The unifying landing layer (Ship 1 of the Diagnostic Synthesis build,
 * 2026-06-19). Reads every upstream signal Crux has on a client and
 * synthesizes a one-screen strategic-state diagnosis: one-sentence
 * state + top 3 leverage points + top 3 risks + unblockers.
 *
 * Ship 1: basic render + synthesize button + history dropdown.
 * Ship 2: nav restructure + per-client landing + drilldowns wired.
 * Ship 3 (2026-06-19, this revision): critique → revise loop visible
 *   in the UI (Critique reviewed badge), changes_since_last narrative
 *   shown below the strategic-state card when present.
 */

import React, { useEffect, useState } from 'react';
import {
  Sparkles, Loader, ChevronDown, ChevronRight, Brain,
  TrendingUp, AlertTriangle, KeyRound,
  ArrowRight, Clock, GitCompare, ShieldCheck,
} from 'lucide-react';
import {
  generateDiagnosticSynthesis,
  getLatestSynthesis,
  listSyntheses,
  loadSynthesisById,
} from '../../../services/diagnosticSynthesisService.js';
import PrelaunchBadge from '../shared/PrelaunchBadge.jsx';

const TAB_LABELS = {
  audience:        'Audience',
  'weekly-brief':  'Weekly Brief',
  'pre-flight':    'Pre-flight',
  repositioning:   'Repositioning',
  'cohort-roles':  'Cohort',
  calibration:     'Calibration',
  'competitor-scan': 'Competitor Scan',
  install:         'Install',
  opportunities:   'Opportunities',
};

export default function DiagnosticSynthesisWorkspace({ activeClient, onNavigate }) {
  const clientId = activeClient?.id;
  const [synthesis, setSynthesis] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!clientId) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [latest, list] = await Promise.all([
          getLatestSynthesis(clientId),
          listSyntheses(clientId, { limit: 10 }),
        ]);
        if (cancelled) return;
        setSynthesis(latest);
        setHistory(list);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (!clientId) {
    return (
      <div style={emptyShellStyle}>
        <div style={emptyHeaderStyle}>Strategic State</div>
        <div style={emptyBodyStyle}>
          Pick a client from <strong style={{ color: '#cde4d6' }}>Operate → Clients</strong> first.
        </div>
      </div>
    );
  }

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await generateDiagnosticSynthesis({ clientId });
      if (!r.ok) {
        setError(r.error || 'generation failed');
        if (r.rawResponse) setError(prev => `${prev}\n\nRaw response (first 600 chars):\n${r.rawResponse}`);
        return;
      }
      setSynthesis(r.synthesis);
      const list = await listSyntheses(clientId, { limit: 10 });
      setHistory(list);
    } finally {
      setGenerating(false);
    }
  };

  const handleLoadHistory = async (id) => {
    const full = await loadSynthesisById(id);
    if (full) {
      setSynthesis(full);
      setShowHistory(false);
    }
  };

  const handleDrilldown = (tab) => {
    if (typeof onNavigate === 'function' && tab) onNavigate(tab);
  };

  return (
    <div style={shellStyle}>
      <div style={headerStyle}>
        <div style={kickerStyle}>Strategy · Strategic State</div>
        <h1 style={titleStyle}>
          {activeClient.name}
          <span style={{ marginLeft: 12, display: 'inline-block', verticalAlign: 'middle' }}>
            <PrelaunchBadge client={activeClient} />
          </span>
        </h1>
        <div style={subtitleStyle}>
          One-screen synthesis across Spine + persona + cohort distributions + audit + calibration + recent uploads + platform mechanics. <strong style={{ color: '#cde4d6' }}>State-shaped</strong> — what's true about this engagement right now. (The weekly brief is the output-shaped artifact that recommends next moves; this is the diagnosis upstream of it.)
        </div>
      </div>

      <ActionBar
        synthesis={synthesis}
        generating={generating}
        onGenerate={handleGenerate}
        history={history}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        onLoadHistory={handleLoadHistory}
      />

      {error && (
        <Note tone="error">
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, fontFamily: error.length > 200 ? 'ui-monospace, Menlo, monospace' : 'inherit' }}>{error}</div>
        </Note>
      )}

      {loading && <Note tone="info">Loading…</Note>}

      {!loading && !synthesis && !error && (
        <EmptyState onGenerate={handleGenerate} generating={generating} />
      )}

      {!loading && synthesis && (
        <>
          <StrategicStateCard synthesis={synthesis} />

          {synthesis.changes_since_last && (
            <ChangesSinceLastCard text={synthesis.changes_since_last} />
          )}

          <Section
            icon={TrendingUp}
            color="#3fa66a"
            title="Top leverage points"
            count={synthesis.leverage_points?.length || 0}
          >
            {(synthesis.leverage_points || []).map((lp, i) => (
              <LeverageRiskCard key={i} item={lp} type="leverage" index={i} onDrill={handleDrilldown} />
            ))}
          </Section>

          <Section
            icon={AlertTriangle}
            color="#E8A82B"
            title="Top risks"
            count={synthesis.risks?.length || 0}
          >
            {(synthesis.risks || []).map((rk, i) => (
              <LeverageRiskCard key={i} item={rk} type="risk" index={i} onDrill={handleDrilldown} />
            ))}
          </Section>

          {synthesis.unblockers?.length > 0 && (
            <Section
              icon={KeyRound}
              color="#a78bfa"
              title="Unblockers"
              count={synthesis.unblockers.length}
            >
              {synthesis.unblockers.map((u, i) => (
                <UnblockerCard key={i} unblocker={u} onDrill={handleDrilldown} />
              ))}
            </Section>
          )}

          {synthesis.notes && (
            <Note tone="info">
              <strong style={{ color: '#cde4d6' }}>Notes:</strong> {synthesis.notes}
            </Note>
          )}

          <RawJsonToggle synthesis={synthesis} showRaw={showRaw} setShowRaw={setShowRaw} />
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Action bar
// ──────────────────────────────────────────────────

function ActionBar({ synthesis, generating, onGenerate, history, showHistory, setShowHistory, onLoadHistory }) {
  const ageDays = synthesis?.generated_at
    ? Math.round((Date.now() - new Date(synthesis.generated_at).getTime()) / 86_400_000)
    : null;
  return (
    <div style={actionBarStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={kickerSmallStyle}>{synthesis ? 'Current synthesis' : 'No synthesis yet'}</div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
          {synthesis ? (
            <>
              Generated {new Date(synthesis.generated_at).toLocaleString()}
              {ageDays != null && ` · ${ageDays === 0 ? 'today' : `${ageDays}d ago`}`}
              {synthesis.prompt_version && ` · ${synthesis.prompt_version}`}
            </>
          ) : (
            'Synthesize from every upstream signal (Spine + persona + cohort + audit + calibration + uploads + mechanics).'
          )}
        </div>
      </div>
      {history.length > 0 && (
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowHistory(h => !h)} style={historyBtnStyle}>
            <Clock size={11} /> History ({history.length})
          </button>
          {showHistory && (
            <>
              <div onClick={() => setShowHistory(false)} style={menuBackdropStyle} />
              <div style={historyMenuStyle}>
                {history.map(h => (
                  <button
                    key={h.id}
                    onClick={() => onLoadHistory(h.id)}
                    style={historyItemStyle}
                  >
                    <div style={{ fontSize: 11, color: '#cde4d6', fontWeight: 600 }}>
                      {new Date(h.generated_at).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.strategic_state || '—'}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <button onClick={onGenerate} disabled={generating} style={primaryBtnStyle(generating)}>
        {generating
          ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Synthesizing…</>
          : <><Sparkles size={13} /> {synthesis ? 'Re-synthesize' : 'Synthesize'}</>}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Strategic state card
// ──────────────────────────────────────────────────

function StrategicStateCard({ synthesis }) {
  return (
    <div style={stateCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <Brain size={13} style={{ color: '#0A919B' }} />
        <span style={{ fontSize: 10, color: '#0A919B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Strategic state
        </span>
        {/* Critique-loop status. Surfaces honestly whether the synthesis
            went through draft → critique → revise vs. came back clean
            on first pass. Both outcomes are valid — the chip tells the
            strategist which they're looking at. */}
        {synthesis.revision_applied === true && (
          <span style={critiqueChipStyle}>
            <ShieldCheck size={9} /> Critique applied
          </span>
        )}
        {synthesis.revision_applied === false && synthesis.critique_text === null && (
          <span style={cleanChipStyle}>
            <ShieldCheck size={9} /> Clean on first pass
          </span>
        )}
      </div>
      <div style={{ fontSize: 16, color: '#e8e2d0', lineHeight: 1.55, fontWeight: 500 }}>
        {synthesis.strategic_state || '(no state)'}
      </div>
    </div>
  );
}

function ChangesSinceLastCard({ text }) {
  return (
    <div style={diffCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <GitCompare size={12} style={{ color: '#a78bfa' }} />
        <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Changes since last synthesis
        </span>
      </div>
      <div style={{ fontSize: 13, color: '#cde4d6', lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Section + cards
// ──────────────────────────────────────────────────

function Section({ icon: Icon, color, title, count, children }) {
  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <Icon size={14} style={{ color }} />
        <span style={{ fontSize: 12, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: '#666' }}>· {count}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function LeverageRiskCard({ item, type, index, onDrill }) {
  const color = type === 'leverage' ? '#3fa66a' : '#E8A82B';
  return (
    <div style={cardStyle(color)}>
      <div style={cardHeaderStyle}>
        <span style={cardNumStyle(color)}>{index + 1}.</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={cardTitleStyle}>{item.title}</div>
        </div>
      </div>
      <div style={cardBodyStyle}>{item.rationale}</div>
      {type === 'risk' && item.early_warning_signal && (
        <div style={earlyWarningStyle}>
          <strong style={{ color: '#E8A82B' }}>Early warning:</strong> {item.early_warning_signal}
        </div>
      )}
      <div style={metaRowStyle}>
        {item.confidence && (
          <span style={confidenceChipStyle(item.confidence)}>{item.confidence}</span>
        )}
        {item.provenance && (
          <span style={{ fontSize: 10, color: '#888' }}>From: {item.provenance}</span>
        )}
        {item.mechanics_cited?.length > 0 && (
          <span style={{ fontSize: 10, color: '#0A919B', fontWeight: 600 }}>
            Mechanic {item.mechanics_cited.join(', ')}
          </span>
        )}
        {item.drilldown_tab && (
          <button onClick={() => onDrill(item.drilldown_tab)} style={drillBtnStyle}>
            Open {TAB_LABELS[item.drilldown_tab] || item.drilldown_tab} <ArrowRight size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

function UnblockerCard({ unblocker, onDrill }) {
  return (
    <div style={unblockerStyle}>
      <div style={{ fontSize: 13, color: '#e8e2d0', marginBottom: 4 }}>
        <strong>Missing:</strong> {unblocker.missing_input}
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
        {unblocker.why_it_matters}
      </div>
      {unblocker.where_to_provide && (
        <button onClick={() => onDrill(unblocker.where_to_provide)} style={drillBtnStyle}>
          Open {TAB_LABELS[unblocker.where_to_provide] || unblocker.where_to_provide} <ArrowRight size={10} />
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Empty + raw JSON + Note
// ──────────────────────────────────────────────────

function EmptyState({ onGenerate, generating }) {
  return (
    <div style={emptySynthStyle}>
      <Brain size={32} style={{ color: '#0A919B', marginBottom: 12 }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: '#cde4d6', marginBottom: 6 }}>
        No synthesis yet
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 16, maxWidth: 520, lineHeight: 1.5 }}>
        Synthesize from every upstream signal. Returns a one-sentence strategic state plus 3 leverage points + 3 risks + unblockers, each cited to specific inputs and platform mechanics.
      </div>
      <button onClick={onGenerate} disabled={generating} style={primaryBtnStyle(generating)}>
        {generating
          ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Synthesizing…</>
          : <><Sparkles size={13} /> Synthesize now</>}
      </button>
    </div>
  );
}

function RawJsonToggle({ synthesis, showRaw, setShowRaw }) {
  return (
    <div style={{ marginTop: 16 }}>
      <button onClick={() => setShowRaw(r => !r)} style={rawToggleStyle}>
        {showRaw ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        Raw JSON (debug)
      </button>
      {showRaw && (
        <pre style={rawBlockStyle}>{JSON.stringify({
          strategic_state: synthesis.strategic_state,
          leverage_points: synthesis.leverage_points,
          risks: synthesis.risks,
          unblockers: synthesis.unblockers,
          notes: synthesis.notes,
          inputs_snapshot: synthesis.inputs_snapshot,
        }, null, 2)}</pre>
      )}
    </div>
  );
}

function Note({ tone, children }) {
  const palette = {
    info:  { bg: 'rgba(10,145,155,0.08)',  border: 'rgba(10,145,155,0.25)',  fg: '#0A919B' },
    warn:  { bg: 'rgba(232,168,43,0.08)',  border: 'rgba(232,168,43,0.30)',  fg: '#E8A82B' },
    error: { bg: 'rgba(239,107,107,0.08)', border: 'rgba(239,107,107,0.30)', fg: '#ef6b6b' },
  }[tone] || { bg: '#1a1a1f', border: '#333', fg: '#aaa' };
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6,
      background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg,
      fontSize: 13, margin: '12px 0',
    }}>{children}</div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const shellStyle = { padding: '20px 24px 60px', maxWidth: 1100, margin: '0 auto' };
const headerStyle = { marginBottom: 16 };
const kickerStyle = { fontSize: 11, color: '#0A919B', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 4 };
const kickerSmallStyle = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 };
const titleStyle = { fontSize: 24, fontWeight: 700, color: '#e8e2d0', margin: 0 };
const subtitleStyle = { fontSize: 13, color: '#888', marginTop: 6, lineHeight: 1.5, maxWidth: 800 };

const emptyShellStyle = { padding: '60px 24px', maxWidth: 720, margin: '0 auto', textAlign: 'center' };
const emptyHeaderStyle = { fontSize: 14, color: '#0A919B', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 14 };
const emptyBodyStyle = { fontSize: 14, color: '#888', lineHeight: 1.6 };

const actionBarStyle = {
  display: 'flex', alignItems: 'center', gap: 12,
  background: '#0e0e11', border: '1px solid #2a2a30',
  borderLeft: '2px solid #0A919B', borderRadius: 6, padding: 14, marginBottom: 14,
};
const primaryBtnStyle = (busy) => ({
  background: busy ? '#1a1a1f' : '#0A919B',
  color: busy ? '#666' : '#0a0a0e',
  border: busy ? '1px solid #2a2a30' : 'none',
  borderRadius: 5,
  padding: '8px 16px', fontSize: 13, fontWeight: 700,
  cursor: busy ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  whiteSpace: 'nowrap', flexShrink: 0,
});
const historyBtnStyle = {
  background: 'transparent', color: '#888',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '6px 10px', fontSize: 11, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 5,
};
const menuBackdropStyle = {
  position: 'fixed', inset: 0, zIndex: 50, background: 'transparent',
};
const historyMenuStyle = {
  position: 'absolute', top: '100%', right: 0, marginTop: 4,
  background: '#0e0e11', border: '1px solid #2a2a30',
  borderRadius: 5, padding: 4, minWidth: 300, maxWidth: 420, zIndex: 51,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  display: 'flex', flexDirection: 'column', gap: 2,
  maxHeight: 400, overflowY: 'auto',
};
const historyItemStyle = {
  background: 'transparent', color: '#cde4d6',
  border: 'none', padding: '6px 8px',
  fontSize: 11, cursor: 'pointer', textAlign: 'left',
  borderRadius: 3,
};

const stateCardStyle = {
  background: '#0e0e11', border: '1px solid #2a2a30',
  borderLeft: '3px solid #0A919B',
  borderRadius: 6, padding: 16, marginBottom: 14,
};
const diffCardStyle = {
  background: 'rgba(167,139,250,0.05)',
  border: '1px solid rgba(167,139,250,0.25)',
  borderLeft: '3px solid #a78bfa',
  borderRadius: 6, padding: 14, marginBottom: 18,
};
const critiqueChipStyle = {
  background: 'rgba(63,166,106,0.10)', color: '#3fa66a',
  border: '1px solid rgba(63,166,106,0.30)', borderRadius: 3,
  padding: '1px 6px', fontSize: 9, fontWeight: 700,
  letterSpacing: 0.4, textTransform: 'uppercase',
  display: 'inline-flex', alignItems: 'center', gap: 3,
};
const cleanChipStyle = {
  background: 'rgba(10,145,155,0.10)', color: '#0A919B',
  border: '1px solid rgba(10,145,155,0.30)', borderRadius: 3,
  padding: '1px 6px', fontSize: 9, fontWeight: 700,
  letterSpacing: 0.4, textTransform: 'uppercase',
  display: 'inline-flex', alignItems: 'center', gap: 3,
};

const sectionStyle = { marginBottom: 18 };
const sectionHeaderStyle = {
  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
};

const cardStyle = (color) => ({
  background: '#0e0e11', border: '1px solid #2a2a30',
  borderLeft: `2px solid ${color}`, borderRadius: 6, padding: 14,
});
const cardHeaderStyle = { display: 'flex', gap: 8, marginBottom: 8 };
const cardNumStyle = (color) => ({
  fontSize: 14, fontWeight: 700, color, flexShrink: 0,
});
const cardTitleStyle = { fontSize: 14, fontWeight: 700, color: '#e8e2d0', lineHeight: 1.4 };
const cardBodyStyle = { fontSize: 13, color: '#cde4d6', lineHeight: 1.55, marginBottom: 8 };
const earlyWarningStyle = {
  background: 'rgba(232,168,43,0.05)',
  border: '1px dashed rgba(232,168,43,0.30)',
  borderRadius: 5, padding: 8,
  fontSize: 12, color: '#cde4d6', lineHeight: 1.5,
  marginBottom: 8,
};
const metaRowStyle = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  paddingTop: 8, borderTop: '1px dashed #2a2a30',
};
const confidenceChipStyle = (conf) => {
  const color = conf === 'confirmed' ? '#3fa66a' : conf === 'extracted' ? '#0A919B' : '#E8A82B';
  return {
    background: `${color}18`, color, border: `1px solid ${color}55`,
    borderRadius: 3, padding: '1px 6px',
    fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
  };
};
const drillBtnStyle = {
  background: 'rgba(10,145,155,0.10)', color: '#0A919B',
  border: '1px solid rgba(10,145,155,0.40)', borderRadius: 4,
  padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 3,
  marginLeft: 'auto',
};

const unblockerStyle = {
  background: '#0e0e11', border: '1px solid #2a2a30',
  borderLeft: '2px solid #a78bfa', borderRadius: 6, padding: 12,
};

const emptySynthStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  padding: 40, marginTop: 20,
  background: '#0e0e11', border: '1px solid #2a2a30', borderRadius: 8,
};

const rawToggleStyle = {
  background: 'transparent', color: '#666',
  border: 'none', cursor: 'pointer',
  fontSize: 10, fontWeight: 600, padding: 0,
  display: 'inline-flex', alignItems: 'center', gap: 4,
  textTransform: 'uppercase', letterSpacing: 0.5,
};
const rawBlockStyle = {
  background: '#0a0a0e', border: '1px solid #2a2a30',
  borderRadius: 5, padding: 12,
  fontSize: 10, color: '#888', overflow: 'auto',
  maxHeight: 400, marginTop: 6,
  fontFamily: 'ui-monospace, Menlo, monospace',
};
