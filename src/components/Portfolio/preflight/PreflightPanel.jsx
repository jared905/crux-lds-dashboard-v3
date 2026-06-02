/**
 * Pre-flight scorecard panel — Phase 1 of the prediction machine,
 * surfaced as a section in the Strategy Spine.
 *
 * Strategist drops in a concept (title + format + optional slot /
 * length / topic / pillar), hits Score, and gets back the deterministic
 * per-dimension scorecard plus a Claude-written strategic read. Each
 * scored concept persists to client_concept_scorecards so the
 * strategist can compare title variants and producers can audit the
 * scorecards that justified greenlight decisions.
 *
 * Data path:
 *   - On mount: loadDeliverableData(clientId) → cohortContext with
 *     patternsResult + whiteSpaceResult + coverage (one Promise.all,
 *     same surface the deliverable uses).
 *   - On Score: scoreConcept(input, cohortContext) → saveScorecard →
 *     generateStrategicRead → updateStrategicRead → refresh history.
 *
 * Tone: matches the rest of Strategy Spine's dark editorial UI; tier
 * colors borrow from the brand palette (teal = strong, amber = risky,
 * danger red = predicted under).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { loadDeliverableData } from '../../../services/clientDeliverableService';
import { scoreConcept, TIERS } from '../../../services/conceptScorerService';
import {
  saveScorecard,
  listScorecards,
  updateStrategicRead,
  archiveScorecard,
} from '../../../services/conceptScorecardsService';
import { generateStrategicRead } from '../../../services/strategicReadService';
import Phase25Spike from './Phase25Spike.jsx';
import SurfacePullPanel from './SurfacePullPanel.jsx';

// ──────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────

const TIER_LABELS = {
  very_likely_outperform: 'Very likely to outperform',
  likely_solid:           'Likely solid',
  risky:                  'Risky',
  predicted_under:        'Predicted under',
};

// Tier accent colors. Match the brand palette where possible (teal for
// strong, amber for risky, red for predicted-under). Background is a
// muted tint so the badges don't overwhelm a dark form.
const TIER_COLORS = {
  very_likely_outperform: { fg: '#0A919B', bg: 'rgba(10, 145, 155, 0.12)', border: 'rgba(10, 145, 155, 0.35)' },
  likely_solid:           { fg: '#cde4d6', bg: 'rgba(205, 228, 214, 0.08)', border: 'rgba(205, 228, 214, 0.22)' },
  risky:                  { fg: '#E8A82B', bg: 'rgba(232, 168, 43, 0.12)',  border: 'rgba(232, 168, 43, 0.35)' },
  predicted_under:        { fg: '#ef6b6b', bg: 'rgba(239, 107, 107, 0.12)', border: 'rgba(239, 107, 107, 0.35)' },
};

const DAY_OPTIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BLOCK_OPTIONS = ['12am–6am', '6am–12pm', '12pm–6pm', '6pm–12am'];
const LENGTH_PRESETS = [
  { label: 'Short (3–8 min)',    seconds: 360 },
  { label: 'Mid (8–15 min)',     seconds: 720 },
  { label: 'Long (15–25 min)',   seconds: 1200 },
  { label: 'Documentary (25+ min)', seconds: 1800 },
];

const defaultForm = () => ({
  title: '',
  format: 'long_form',
  planned_day: '',
  planned_hour_block: '',
  length_seconds: '',
  topic_label: '',
  notes: '',
  pillar_id: '',
});

// ──────────────────────────────────────────────────
// Main panel
// ──────────────────────────────────────────────────

export default function PreflightPanel({ clientId, clientName, pillars = [] }) {
  const [cohortContext, setCohortContext] = useState(null);
  const [cohortLoading, setCohortLoading] = useState(true);
  const [cohortError, setCohortError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [form, setForm] = useState(defaultForm);
  const [optionalsOpen, setOptionalsOpen] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [scoringPhase, setScoringPhase] = useState(null); // 'scoring' | 'saving' | 'reading' | null
  const [currentScorecard, setCurrentScorecard] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Load cohort context + history on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCohortLoading(true);
      try {
        const data = await loadDeliverableData(clientId);
        if (cancelled) return;
        if (!data?.ok) {
          setCohortError(data?.error || 'Failed to load cohort data');
        } else if (!data.patternsResult || !data.whiteSpaceResult) {
          setCohortError('Cohort audit data is missing — run the audit first');
        } else {
          setCohortContext({
            patternsResult: data.patternsResult,
            whiteSpaceResult: data.whiteSpaceResult,
            coverage: data.coverage,
            channelCount: (data.channels || []).length,
            videoCount: data.coverage?.videoCount,
          });
        }
      } catch (err) {
        if (!cancelled) setCohortError(err?.message || 'unknown error loading cohort');
      } finally {
        if (!cancelled) setCohortLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  // Load history on mount + refresh after each save
  const refreshHistory = async () => {
    setHistoryLoading(true);
    const rows = await listScorecards({ clientId, limit: 20 });
    setHistory(rows);
    setHistoryLoading(false);
  };
  useEffect(() => { refreshHistory(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  // ── Score handler ──
  const handleScore = async () => {
    setActionError(null);
    if (!form.title.trim()) { setActionError('Title is required'); return; }
    if (!cohortContext) { setActionError('Cohort data not loaded yet'); return; }

    setScoring(true);
    try {
      // 1. Run the deterministic scorer
      setScoringPhase('scoring');
      const input = buildInput(form);
      const scoringOutput = scoreConcept({
        input,
        cohortContext: {
          patternsResult: cohortContext.patternsResult,
          whiteSpaceResult: cohortContext.whiteSpaceResult,
        },
      });

      // 2. Persist immediately (scorecard exists even if LLM fails)
      setScoringPhase('saving');
      const saved = await saveScorecard({
        clientId,
        pillarId: form.pillar_id || null,
        input,
        scoringOutput,
        cohortWindowDays: 90,
        cohortDataAt: cohortContext.coverage?.generatedAt,
      });
      if (!saved) {
        setActionError('Saved scorecard failed — see console');
        setCurrentScorecard({ ...scoringOutput, input, _unsaved: true });
        setScoringPhase(null);
        return;
      }

      // 3. Show the deterministic result while the LLM read runs
      const baseCard = { id: saved.id, created_at: saved.created_at, input, ...scoringOutput };
      setCurrentScorecard(baseCard);

      // 4. Fire the strategic-read pass (auto, as configured)
      setScoringPhase('reading');
      const { text, promptVersion } = await generateStrategicRead({
        input,
        scoringOutput,
        cohortSummary: {
          clientName,
          channelCount: cohortContext.channelCount,
          videoCount: cohortContext.videoCount,
        },
      });
      if (text) {
        await updateStrategicRead({ id: saved.id, text, promptVersion });
        setCurrentScorecard({ ...baseCard, strategic_read: text });
      }

      // 5. Refresh history
      refreshHistory();
    } catch (err) {
      setActionError(err?.message || 'Scoring failed');
    } finally {
      setScoring(false);
      setScoringPhase(null);
    }
  };

  const handleLoadFromHistory = async (id) => {
    const row = history.find(r => r.id === id);
    if (!row) return;
    setCurrentScorecard(row);
    // Optional: re-populate the form from row.input so the strategist
    // can iterate from this draft.
    if (row.input) setForm({ ...defaultForm(), ...row.input, pillar_id: row.pillar_id || '' });
  };

  const handleArchive = async (id) => {
    await archiveScorecard(id);
    refreshHistory();
    if (currentScorecard?.id === id) setCurrentScorecard(null);
  };

  // ── Render ──
  const accent = TIER_COLORS.very_likely_outperform.fg;

  return (
    <div style={shellStyle(accent)}>
      <div style={shellHeaderStyle}>
        <div>
          <h2 style={shellTitleStyle(accent)}>Pre-flight scorecard</h2>
          <div style={shellSubtitleStyle}>
            Score a concept against the cohort's audit data before greenlight — title patterns, slot, length, topic. Persisted with history so you can compare drafts side-by-side.
          </div>
        </div>
        {cohortContext?.coverage?.generatedAt && (
          <div style={{ fontSize: 11, color: '#666', textAlign: 'right' }}>
            Cohort data:<br />{formatRelative(cohortContext.coverage.generatedAt)}
          </div>
        )}
      </div>

      {cohortLoading && <InlineNote tone="info">Loading cohort data…</InlineNote>}
      {cohortError && <InlineNote tone="error">{cohortError}</InlineNote>}

      {!cohortLoading && !cohortError && (
        <>
          <ConceptForm
            form={form}
            setForm={setForm}
            optionalsOpen={optionalsOpen}
            setOptionalsOpen={setOptionalsOpen}
            pillars={pillars}
            onScore={handleScore}
            scoring={scoring}
            scoringPhase={scoringPhase}
          />

          {actionError && <InlineNote tone="error">{actionError}</InlineNote>}

          {currentScorecard && (
            <ScorecardDisplay scorecard={currentScorecard} reading={scoringPhase === 'reading'} />
          )}

          <ScorecardHistory
            history={history}
            loading={historyLoading}
            currentId={currentScorecard?.id}
            onLoad={handleLoadFromHistory}
            onArchive={handleArchive}
          />

          {/* Phase 2.5 surface intelligence — refresh per-video
              traffic-source data + channel-level search queries from
              YouTube Analytics. Once a snapshot lands the scorer's
              upcoming surface-aware dimension will read from it. */}
          <SurfacePullPanel clientId={clientId} />

          {/* Diagnostic — confirms the Phase 2.5 Analytics API paths
              before the real Phase 2.5 build commits to them. */}
          <Phase25Spike />
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Form
// ──────────────────────────────────────────────────

function ConceptForm({ form, setForm, optionalsOpen, setOptionalsOpen, pillars, onScore, scoring, scoringPhase }) {
  const update = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const phaseLabel = scoringPhase === 'scoring' ? 'Computing scores…'
    : scoringPhase === 'saving' ? 'Saving…'
    : scoringPhase === 'reading' ? 'Writing strategic read…'
    : 'Score concept';

  return (
    <div style={formCardStyle}>
      {/* Required row — always visible */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12, marginBottom: 12 }}>
        <Field label="Title" required>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder='e.g. "How to install your first system in under 30 minutes"'
            style={inputStyle}
          />
        </Field>
        <Field label="Format" required>
          <select value={form.format} onChange={(e) => update({ format: e.target.value })} style={inputStyle}>
            <option value="long_form">Long-form</option>
            <option value="shorts">Shorts</option>
          </select>
        </Field>
      </div>

      {/* Optionals disclosure */}
      <button
        type="button"
        onClick={() => setOptionalsOpen(o => !o)}
        style={disclosureBtnStyle}
        title="Slot, length, topic, pillar — improves prediction accuracy"
      >
        {optionalsOpen ? '▾' : '▸'} More options (slot, length, topic, pillar)
      </button>

      {optionalsOpen && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <Field label="Planned day">
            <select value={form.planned_day} onChange={(e) => update({ planned_day: e.target.value })} style={inputStyle}>
              <option value="">—</option>
              {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Planned hour block">
            <select value={form.planned_hour_block} onChange={(e) => update({ planned_hour_block: e.target.value })} style={inputStyle}>
              <option value="">—</option>
              {BLOCK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>

          {form.format === 'long_form' && (
            <Field label="Planned length" full>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {LENGTH_PRESETS.map(p => (
                  <button
                    key={p.seconds}
                    type="button"
                    onClick={() => update({ length_seconds: p.seconds })}
                    style={presetChipStyle(form.length_seconds === p.seconds)}
                  >
                    {p.label}
                  </button>
                ))}
                <input
                  type="number"
                  value={form.length_seconds || ''}
                  onChange={(e) => update({ length_seconds: e.target.value ? Number(e.target.value) : '' })}
                  placeholder="custom seconds"
                  style={{ ...inputStyle, width: 130 }}
                />
              </div>
            </Field>
          )}

          <Field label="Topic" full>
            <input
              type="text"
              value={form.topic_label}
              onChange={(e) => update({ topic_label: e.target.value })}
              placeholder="e.g. installation walkthroughs"
              style={inputStyle}
            />
          </Field>

          {pillars.length > 0 && (
            <Field label="Pillar (optional)" full>
              <select value={form.pillar_id} onChange={(e) => update({ pillar_id: e.target.value })} style={inputStyle}>
                <option value="">— Exploratory (no pillar)</option>
                {pillars.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </Field>
          )}

          <Field label="Strategist notes (optional)" full>
            <textarea
              value={form.notes}
              onChange={(e) => update({ notes: e.target.value })}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Why this concept, what you're testing, anything the producer needs to know."
            />
          </Field>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={onScore} disabled={scoring || !form.title.trim()} style={scoreBtnStyle(scoring)}>
          {scoring ? phaseLabel : 'Score concept'}
        </button>
        <button onClick={() => setForm(defaultForm())} disabled={scoring} style={ghostBtnStyle}>
          Clear
        </button>
      </div>
    </div>
  );
}

function Field({ label, required, children, full }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={labelStyle}>{label}{required && <span style={{ color: '#ef6b6b' }}> *</span>}</label>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Scorecard display
// ──────────────────────────────────────────────────

function ScorecardDisplay({ scorecard, reading }) {
  const { scores, composite_tier, composite_rationale, suggested_tweaks, strategic_read, input } = scorecard;
  return (
    <div style={scorecardCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Scoring result</div>
          {input?.title && <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e2d0', marginBottom: 6 }}>"{input.title}"</div>}
          <div style={{ fontSize: 12, color: '#888' }}>{composite_rationale}</div>
        </div>
        <TierBadge tier={composite_tier} size="lg" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
        {scores?.title_patterns && <DimensionCard name="Title pattern stack" dim={scores.title_patterns} />}
        {scores?.slot &&           <DimensionCard name={`Slot · ${scores.slot.day} ${scores.slot.block}`} dim={scores.slot} />}
        {scores?.length &&         <DimensionCard name={`Length · ${scores.length.bucket}`} dim={scores.length} />}
        {scores?.topic &&          <DimensionCard name={`Topic · ${scores.topic.label}`} dim={scores.topic} />}
      </div>

      {suggested_tweaks?.length > 0 && (
        <div style={tweaksCardStyle}>
          <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Suggested tweaks</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {suggested_tweaks.map((t, i) => (
              <li key={i} style={{ fontSize: 13, color: '#cde4d6', marginBottom: 6, paddingLeft: 16, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#0A919B', fontWeight: 700 }}>→</span>
                {t.suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strategic read — LLM narrative below the deterministic panel */}
      <div style={strategicReadCardStyle}>
        <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Strategic read</div>
        {strategic_read
          ? <div style={{ fontSize: 13, color: '#e8e2d0', lineHeight: 1.55 }}>{strategic_read}</div>
          : reading
            ? <div style={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>Writing strategic read…</div>
            : <div style={{ fontSize: 13, color: '#666', fontStyle: 'italic' }}>No strategic read on this scorecard.</div>}
      </div>
    </div>
  );
}

function DimensionCard({ name, dim }) {
  const liftStr = dim.composite_lift_pct != null
    ? `${dim.composite_lift_pct >= 0 ? '+' : ''}${dim.composite_lift_pct}%`
    : dim.lift_pct != null
      ? `${dim.lift_pct >= 0 ? '+' : ''}${dim.lift_pct}%`
      : null;
  const hasWarning = dim.matched?.some(m => m.format_skew_warning);
  return (
    <div style={dimensionCardStyle(dim.tier)}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        {liftStr && <div style={{ fontSize: 20, fontWeight: 700, color: TIER_COLORS[dim.tier]?.fg || '#fff' }}>{liftStr}</div>}
        {dim.confidence && (
          <div style={{ fontSize: 10, color: '#888' }}>
            {dim.confidence}{dim.n != null ? ` · n=${dim.n}` : ''}
          </div>
        )}
      </div>
      <TierBadge tier={dim.tier} />
      {hasWarning && <div style={{ fontSize: 11, color: '#E8A82B', marginTop: 6 }}>⚠ Format-skew warning on matched pattern</div>}
      {dim.saturation && <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>Saturation: {dim.saturation}</div>}
      {dim.note && <div style={{ fontSize: 11, color: '#888', marginTop: 4, fontStyle: 'italic' }}>{dim.note}</div>}
    </div>
  );
}

function TierBadge({ tier, size = 'sm' }) {
  const colors = TIER_COLORS[tier] || TIER_COLORS.risky;
  const big = size === 'lg';
  return (
    <span style={{
      display: 'inline-block',
      padding: big ? '6px 12px' : '2px 8px',
      borderRadius: 99,
      background: colors.bg,
      color: colors.fg,
      border: `1px solid ${colors.border}`,
      fontSize: big ? 12 : 10,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      whiteSpace: 'nowrap',
    }}>
      {TIER_LABELS[tier] || tier}
    </span>
  );
}

// ──────────────────────────────────────────────────
// History
// ──────────────────────────────────────────────────

function ScorecardHistory({ history, loading, currentId, onLoad, onArchive }) {
  if (loading) return <InlineNote tone="info">Loading history…</InlineNote>;
  if (!history.length) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Recent scorecards
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {history.map(row => (
          <div key={row.id} style={historyRowStyle(row.id === currentId)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <TierBadge tier={row.composite_tier} />
                <div style={{ fontSize: 11, color: '#888' }}>{formatRelative(row.created_at)}</div>
              </div>
              <div style={{ fontSize: 13, color: '#e8e2d0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.input?.title || '(no title)'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => onLoad(row.id)} style={ghostBtnSmStyle}>Open</button>
              <button onClick={() => onArchive(row.id)} style={ghostBtnSmStyle} title="Archive">Archive</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Helpers + small components
// ──────────────────────────────────────────────────

function buildInput(form) {
  const out = {
    title: form.title.trim(),
    format: form.format,
  };
  if (form.planned_day)        out.planned_day = form.planned_day;
  if (form.planned_hour_block) out.planned_hour_block = form.planned_hour_block;
  if (form.length_seconds && form.format === 'long_form') out.length_seconds = Number(form.length_seconds);
  if (form.topic_label?.trim()) out.topic_label = form.topic_label.trim();
  if (form.notes?.trim())       out.notes = form.notes.trim();
  return out;
}

function formatRelative(iso) {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function InlineNote({ tone, children }) {
  const colors = {
    info:  { bg: 'rgba(10, 145, 155, 0.08)', border: 'rgba(10, 145, 155, 0.25)', fg: '#0A919B' },
    error: { bg: 'rgba(239, 107, 107, 0.10)', border: 'rgba(239, 107, 107, 0.30)', fg: '#ef6b6b' },
  }[tone] || { bg: '#1a1a1f', border: '#333', fg: '#aaa' };
  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: 6,
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      color: colors.fg,
      fontSize: 12,
      margin: '8px 0',
    }}>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const shellStyle = (accent) => ({
  background: '#131316',
  border: '1px solid #1f1f24',
  borderLeft: `3px solid ${accent}`,
  borderRadius: 10,
  padding: '18px 20px',
  marginBottom: 14,
});
const shellHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 };
const shellTitleStyle = (accent) => ({ fontSize: 13, fontWeight: 700, color: accent, margin: 0, letterSpacing: 0.2, textTransform: 'uppercase' });
const shellSubtitleStyle = { fontSize: 12, color: '#888', marginTop: 4, lineHeight: 1.5 };

const formCardStyle = {
  background: '#0e0e11',
  border: '1px solid #1f1f24',
  borderRadius: 8,
  padding: 14,
  marginBottom: 14,
};
const labelStyle = { display: 'block', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, fontWeight: 600 };
const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  background: '#1a1a1f',
  border: '1px solid #2a2a30',
  borderRadius: 6,
  color: '#e8e2d0',
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const disclosureBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#888',
  fontSize: 12,
  fontWeight: 600,
  padding: 0,
  cursor: 'pointer',
  textAlign: 'left',
};
const presetChipStyle = (active) => ({
  padding: '6px 10px',
  borderRadius: 99,
  background: active ? 'rgba(10, 145, 155, 0.16)' : '#1a1a1f',
  border: `1px solid ${active ? 'rgba(10, 145, 155, 0.45)' : '#2a2a30'}`,
  color: active ? '#0A919B' : '#cde4d6',
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 600,
});
const scoreBtnStyle = (disabled) => ({
  background: disabled ? '#1a1a1f' : '#0A919B',
  color: disabled ? '#666' : '#0a0a0e',
  border: 'none',
  padding: '10px 18px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  letterSpacing: 0.3,
});
const ghostBtnStyle = {
  background: 'transparent',
  border: '1px solid #2a2a30',
  color: '#888',
  padding: '8px 14px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};
const ghostBtnSmStyle = {
  ...ghostBtnStyle,
  padding: '4px 10px',
  fontSize: 11,
};

const scorecardCardStyle = {
  background: '#0e0e11',
  border: '1px solid #1f1f24',
  borderRadius: 8,
  padding: 16,
  marginBottom: 14,
};
const dimensionCardStyle = (tier) => ({
  background: '#1a1a1f',
  border: `1px solid ${TIER_COLORS[tier]?.border || '#2a2a30'}`,
  borderRadius: 6,
  padding: 12,
});
const tweaksCardStyle = {
  background: 'rgba(10, 145, 155, 0.05)',
  border: '1px solid rgba(10, 145, 155, 0.18)',
  borderRadius: 6,
  padding: 12,
  marginBottom: 10,
};
const strategicReadCardStyle = {
  background: '#1a1a1f',
  border: '1px solid #2a2a30',
  borderRadius: 6,
  padding: 12,
};
const historyRowStyle = (active) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  background: active ? 'rgba(10, 145, 155, 0.06)' : '#1a1a1f',
  border: `1px solid ${active ? 'rgba(10, 145, 155, 0.25)' : '#1f1f24'}`,
  borderRadius: 6,
});
