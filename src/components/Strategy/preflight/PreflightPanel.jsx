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
import { generateAlternativeTitles } from '../../../services/alternativeTitlesService';
import { loadSurfaceContext, TARGET_SURFACES } from '../../../services/surfaceIntelligenceService';
import { rateCuriosityGap } from '../../../services/curiosityGapService';
import { rateHookDelivery } from '../../../services/hookPromiseDeliveryService';
import {
  getConceptEmbedding,
  loadTopicAuthorityContext,
} from '../../../services/topicAuthorityService';
import Phase25Spike from './Phase25Spike.jsx';
import SurfacePullPanel from './SurfacePullPanel.jsx';
import EmbeddingsBackfillPanel from './EmbeddingsBackfillPanel.jsx';

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
  target_surface: '',  // Phase 2.5 — strategist picks per session via header tag
  hook_beat: '',       // Phase 2.6 — optional; activates hook_promise_delivery
});

// ──────────────────────────────────────────────────
// Main panel
// ──────────────────────────────────────────────────

export default function PreflightPanel({ clientId, clientName, pillars = [] }) {
  const [cohortContext, setCohortContext] = useState(null);
  const [cohortLoading, setCohortLoading] = useState(true);
  const [cohortError, setCohortError] = useState(null);
  // Phase 2.5 surface intelligence — loaded separately from the
  // deliverable cohort because it lives in different tables. Null when
  // no snapshot has been pulled yet; the scorer handles this by
  // returning null for surface_fit + search_keyword_match (excluded
  // from the composite).
  const [surfaceContext, setSurfaceContext] = useState(null);
  // Phase 2.6 step 3 — topic authority context (top historical hits +
  // cohort recent winners with title embeddings). Null when embeddings
  // haven't been backfilled yet; scorer excludes topic_authority then.
  const [topicAuthorityContext, setTopicAuthorityContext] = useState(null);
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
            // Phase 2.7b — pull the spine through so the scorer's tweak
            // generator and the LLM strategic-read prompt can apply
            // brand-register judgment to pattern recommendations.
            spine: data.spine || null,
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

  // Load latest surface intelligence snapshot. Independent from the
  // deliverable cohort load so a missing surface snapshot doesn't
  // block the rest of the panel. Re-fired when refreshSurfaceContext
  // is called (e.g. after SurfacePullPanel completes a pull).
  const refreshSurfaceContext = async () => {
    try {
      const ctx = await loadSurfaceContext(clientId);
      setSurfaceContext(ctx);
    } catch (err) {
      console.warn('[PreflightPanel] surface context load failed:', err);
      setSurfaceContext(null);
    }
  };
  useEffect(() => { refreshSurfaceContext(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  // Topic-authority context (top historical + cohort embeddings).
  // Re-fired after EmbeddingsBackfillPanel completes a batch.
  const refreshTopicAuthorityContext = async () => {
    try {
      const ctx = await loadTopicAuthorityContext({ clientId });
      setTopicAuthorityContext(ctx);
    } catch (err) {
      console.warn('[PreflightPanel] topic authority context load failed:', err);
      setTopicAuthorityContext(null);
    }
  };
  useEffect(() => { refreshTopicAuthorityContext(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

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
      // 1. Run the deterministic scorer (preceded by the Phase 2.6
      //    curiosity-gap LLM rating — title-only, cached, cheap).
      setScoringPhase('scoring');
      const input = buildInput(form);
      // Phase 2.6 — three async pieces fan out in parallel before
      // the deterministic scorer runs:
      //   - curiosity_gap: Claude rating, cached by title.
      //   - hook_promise_delivery: Claude rating (only if hook_beat
      //     filled); cached by (title, hook).
      //   - concept embedding: OpenAI text-embedding-3-small, cached
      //     per-session by title.
      // All three are null-safe — null results mean the dimension
      // self-excludes from the composite.
      const [curiosityResult, hookResult, conceptEmbedding] = await Promise.all([
        rateCuriosityGap(input.title, { format: input.format }),
        input.hook_beat
          ? rateHookDelivery(input.title, input.hook_beat, { format: input.format })
          : Promise.resolve(null),
        getConceptEmbedding(input.title),
      ]);
      const scoringOutput = scoreConcept({
        input,
        cohortContext: {
          patternsResult: cohortContext.patternsResult,
          whiteSpaceResult: cohortContext.whiteSpaceResult,
          // Phase 2.5 — surfaceContext drives surface_fit +
          // search_keyword_match. Null is fine; those dimensions
          // self-exclude from the composite when missing.
          surfaceContext,
          // Phase 2.6 — curiosity + hook + topic authority. Null is fine.
          curiosityResult,
          hookResult,
          conceptEmbedding,
          topicAuthorityContext,
          // Phase 2.7b — spine drives brand-register awareness in
          // the tweak generator. Null is fine.
          spine: cohortContext.spine,
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

      // 4. Fire the strategic-read pass AND the alternative-titles
      //    generator in parallel — both are LLM calls keyed off the
      //    same scorecard, no need to serialize. Strategic read goes
      //    to its own DB column (updateStrategicRead); alternatives
      //    live in scorecard state only for v1 (not yet persisted).
      setScoringPhase('reading');
      const sharedSummary = {
        clientName,
        channelCount: cohortContext.channelCount,
        videoCount: cohortContext.videoCount,
        spine: cohortContext.spine,
      };
      const [strategicReadResult, altTitlesResult] = await Promise.all([
        generateStrategicRead({ input, scoringOutput, cohortSummary: sharedSummary }),
        generateAlternativeTitles({
          input, scoringOutput, spine: cohortContext.spine, cohortSummary: sharedSummary,
        }),
      ]);

      const { text, promptVersion } = strategicReadResult || {};
      const alternatives = altTitlesResult?.alternatives || [];

      if (text) {
        await updateStrategicRead({ id: saved.id, text, promptVersion });
      }
      // Always update the scorecard (alternatives may exist even if
      // strategic-read returned empty, and vice versa).
      setCurrentScorecard({
        ...baseCard,
        strategic_read: text || null,
        alternative_titles: alternatives,
      });

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

      {/* Phase 2.5 — Target-surface picker. The strategist picks once
          per session; scoring against the picked surface determines
          surface_fit + drives the cross-surface divergence callouts.
          Disabled when no surface snapshot exists yet (the
          SurfacePullPanel below the form is where they pull one). */}
      <TargetSurfaceTag
        value={form.target_surface}
        onChange={(s) => setForm(f => ({ ...f, target_surface: s }))}
        surfaceContext={surfaceContext}
      />

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
              YouTube Analytics. The scorer reads the latest snapshot
              for surface_fit + search_keyword_match. After a successful
              pull we re-load the surface context so the target-surface
              picker activates immediately (no page refresh needed). */}
          <SurfacePullPanel clientId={clientId} onPullComplete={refreshSurfaceContext} />

          {/* Phase 2.6 step 3 — title-embedding backfill. Refreshes
              the topic-authority context on completion so the
              dimension activates immediately on the next score. */}
          <EmbeddingsBackfillPanel clientId={clientId} onBackfillComplete={refreshTopicAuthorityContext} />

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

          <Field label="Hook beat — first 15s (optional)" full>
            <textarea
              value={form.hook_beat}
              onChange={(e) => update({ hook_beat: e.target.value })}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="1–2 sentences describing what's on screen + spoken in the first 15 seconds. Activates the hook-promise-delivery dimension."
            />
          </Field>

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

// Phase 2.5 — Target-surface picker. Lives above the form (per the
// "header tag" UX decision earlier in the build): the strategist picks
// once per session and every scored concept this session uses it.
// Disabled when no surface snapshot exists (with inline messaging
// pointing them at the SurfacePullPanel below).
function TargetSurfaceTag({ value, onChange, surfaceContext }) {
  const haveData = !!surfaceContext?.surface_mix?.length;
  const dominant = surfaceContext?.dominant_surface;
  return (
    <div style={targetTagStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
          Target surface
        </span>
        {TARGET_SURFACES.map(s => {
          const isPicked = value === s;
          const isDominant = dominant === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(isPicked ? '' : s)}
              disabled={!haveData}
              style={surfaceChipStyle(isPicked, isDominant, haveData)}
              title={
                !haveData
                  ? 'No surface snapshot yet — pull one in Surface intelligence below.'
                  : isDominant
                    ? `${s} is this channel's home surface (${surfaceContext.dominant_share_pct}%)`
                    : `Score against ${s}`
              }
            >
              {s}{isDominant ? ' ★' : ''}
            </button>
          );
        })}
        {haveData && value && (
          <span style={{ fontSize: 11, color: '#666', marginLeft: 'auto' }}>
            scoring against <strong style={{ color: '#cde4d6' }}>{value}</strong>
          </span>
        )}
        {!haveData && (
          <span style={{ fontSize: 11, color: '#E8A82B', marginLeft: 'auto' }}>
            No surface snapshot yet — pull one below to unlock surface scoring.
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Scorecard display
// ──────────────────────────────────────────────────

function ScorecardDisplay({ scorecard, reading }) {
  const { scores, composite_tier, composite_rationale, suggested_tweaks, strategic_read, alternative_titles, input } = scorecard;
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
        {scores?.surface_fit &&    <DimensionCard name={`Surface · ${scores.surface_fit.target_surface}`} dim={scores.surface_fit} />}
        {scores?.search_keyword_match && <DimensionCard name="Search keyword match" dim={scores.search_keyword_match} />}
        {scores?.curiosity_gap &&  <DimensionCard name="Curiosity gap" dim={scores.curiosity_gap} />}
        {scores?.hook_promise_delivery && <DimensionCard name="Hook delivery" dim={scores.hook_promise_delivery} />}
        {scores?.topic_authority && <DimensionCard name="Topic authority" dim={scores.topic_authority} />}
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

      {/* Phase 2.7c — alternative titles. Editorial reframes proposed
          by the LLM that solve the diagnosed weaknesses while staying
          inside the channel's brand register. Renders when at least
          one alternative came back; shows the "thinking…" state while
          the parallel LLM call is still in flight. */}
      {(alternative_titles?.length > 0 || reading) && (
        <div style={altTitlesCardStyle}>
          <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Alternative titles
          </div>
          {!alternative_titles?.length && reading
            ? <div style={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>Generating alternatives…</div>
            : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {alternative_titles.map((alt, i) => (
                  <li key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i === alternative_titles.length - 1 ? 'none' : '1px solid #1f1f24' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e2d0', marginBottom: 4 }}>
                      "{alt.title}"
                    </div>
                    {alt.addresses && (
                      <div style={{ fontSize: 10, color: '#0A919B', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: 2 }}>
                        Addresses: {alt.addresses}
                      </div>
                    )}
                    {alt.rationale && (
                      <div style={{ fontSize: 12, color: '#888', lineHeight: 1.4 }}>
                        {alt.rationale}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}

      {/* Panel-level methodology footer — explains the framework once.
          Always visible (collapsed); strategist clicks to expand. Per-
          card methodology is the per-dimension specifics; this is the
          overall logic (confidence definitions, tier thresholds,
          composite rules) that doesn't fit on a single card. */}
      <HowWeScoreFooter />
    </div>
  );
}

// Panel-level "How we score" footer — the framework explanation.
// Collapsed by default; one click reveals confidence definitions, tier
// thresholds, and composite logic. Each per-dimension card has its own
// formula/sample/caveats expander; this footer covers what's shared
// across all of them.
function HowWeScoreFooter() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #1f1f24' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={methodologyToggleStyle}>
        {open ? '▾' : '▸'} How we score · framework
      </button>
      {open && (
        <div style={{ ...methodologyBlockStyle, marginTop: 8 }}>
          <MethodLine
            label="Confidence levels"
            body={'Statistical: sample size clears the per-dimension floor AND removing the top-view video doesn\'t shift the median by more than 25% (drop-top stability check). Directional: sample is in the suggestive range but fails one of the two checks. Insufficient: too few data points — excluded entirely. Directional results are framed as "worth testing once" not "this will work".'}
          />
          <MethodLine
            label="Dimension tiers"
            body={'very_likely_outperform → likely_solid → risky → predicted_under. For lift-based dimensions the boundaries are roughly +50% / +15% / 0% / -15% on statistical confidence; directional shifts everything one tier toward risky. LLM and similarity dimensions use their own 1–10 or 0–1 thresholds (each card\'s methodology expander shows the specifics).'}
          />
          <MethodLine
            label="Composite logic"
            body={'Two or more dimensions at predicted_under → composite predicted_under. Any one predicted_under → composite caps at risky. Two or more very_likely_outperform with no underperformers → composite very_likely_outperform. Majority risky → composite risky. Null dimensions self-exclude (they don\'t drag the composite down — they\'re just absent).'}
          />
          <MethodLine
            label="What's NOT measured"
            body={'Algorithmic luck on initial seed delivery. Topic trend tailwinds at upload time. Hook execution quality past the title-promise alignment. Off-platform amplification. Audience mood. The composite is a concept gate — not a view-count forecast.'}
          />
          <MethodLine
            label="Cohort window"
            body={'90 days by default. Snapshot timestamp shown on each scorecard (cohort_data_at) so older scorecards stay interpretable when the audit refreshes.'}
          />
        </div>
      )}
    </div>
  );
}

function DimensionCard({ name, dim }) {
  // Methodology expander state — collapsed by default. Strategist
  // clicks "How this was computed" to reveal formula + sample +
  // confidence definition + per-dimension caveats. The data the
  // methodology block reads has been computed all along; we just
  // weren't surfacing it.
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  // Pick the primary metric to render. Title/slot/length carry a
  // lift_pct (or composite_lift_pct). Surface fit uses share-of-views.
  // Search keyword match uses match %. Each picks the most descriptive
  // sub-label too.
  let primary = null;     // big number
  let subLabel = null;    // line under the big number
  if (dim.composite_lift_pct != null) {
    primary = `${dim.composite_lift_pct >= 0 ? '+' : ''}${dim.composite_lift_pct}%`;
    subLabel = dim.confidence
      ? `${dim.confidence}${dim.n != null ? ` · n=${dim.n}` : ''}`
      : null;
  } else if (dim.lift_pct != null) {
    primary = `${dim.lift_pct >= 0 ? '+' : ''}${dim.lift_pct}%`;
    subLabel = dim.confidence
      ? `${dim.confidence}${dim.n != null ? ` · n=${dim.n}` : ''}`
      : null;
  } else if (dim.surface_share_pct != null) {
    // Surface fit — render share of channel views as the primary metric.
    primary = `${dim.surface_share_pct}%`;
    subLabel = `share of ${dim.n_videos || 0}-video snapshot`;
  } else if (dim.match_pct != null) {
    // Search keyword match — render % of unbranded queries that match.
    primary = `${dim.match_pct}%`;
    subLabel = `${dim.matched_count}/${dim.total_unbranded_queries} unbranded queries match`;
  } else if (dim.curiosity_score != null) {
    // Curiosity gap — render 1–10 score as "X/10".
    primary = `${dim.curiosity_score}/10`;
    subLabel = dim.cached ? 'cached LLM rating' : 'fresh LLM rating';
  } else if (dim.hook_score != null) {
    // Hook promise delivery — same 1–10 visual shape as curiosity_gap.
    primary = `${dim.hook_score}/10`;
    subLabel = dim.cached ? 'cached LLM rating' : 'fresh LLM rating';
  } else if (dim.topic_max_similarity != null) {
    // Topic authority — render the max cosine similarity as the
    // primary metric. text-embedding-3-small similarities typically
    // fall in 0.30–0.70 for related content.
    primary = `${(dim.topic_max_similarity * 100).toFixed(0)}%`;
    subLabel = `closest: ${dim.dominant_source === 'channel' ? 'your channel' : 'cohort'}`;
  }

  const hasFormatSkew = dim.matched?.some?.(m => m.format_skew_warning);
  return (
    <div style={dimensionCardStyle(dim.tier)}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        {primary && <div style={{ fontSize: 20, fontWeight: 700, color: TIER_COLORS[dim.tier]?.fg || '#fff' }}>{primary}</div>}
        {subLabel && <div style={{ fontSize: 10, color: '#888' }}>{subLabel}</div>}
      </div>
      <TierBadge tier={dim.tier} />
      {hasFormatSkew && <div style={{ fontSize: 11, color: '#E8A82B', marginTop: 6 }}>⚠ Format-skew warning on matched pattern</div>}
      {dim.saturation && <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>Saturation: {dim.saturation}</div>}
      {dim.divergence_warning && (
        <div style={{ fontSize: 11, color: '#E8A82B', marginTop: 6, lineHeight: 1.4 }}>
          ⚠ {dim.divergence_warning}
        </div>
      )}
      {dim.top_matches?.length > 0 && (
        <div style={{ fontSize: 11, color: '#888', marginTop: 6, lineHeight: 1.4 }}>
          Top match: <em style={{ color: '#cde4d6' }}>"{dim.top_matches[0].query}"</em>
        </div>
      )}
      {/* Topic authority — surface the single closest neighbor; the
          full match list is in the persisted scorecard JSON for
          strategist drill-down later. */}
      {dim.top_channel_matches?.length > 0 && dim.dominant_source === 'channel' && (
        <div style={{ fontSize: 11, color: '#888', marginTop: 6, lineHeight: 1.4 }}>
          Closest hit on this channel: <em style={{ color: '#cde4d6' }}>"{dim.top_channel_matches[0].title}"</em>
        </div>
      )}
      {dim.top_cohort_matches?.length > 0 && dim.dominant_source === 'cohort' && (
        <div style={{ fontSize: 11, color: '#888', marginTop: 6, lineHeight: 1.4 }}>
          Closest hit in cohort: <em style={{ color: '#cde4d6' }}>"{dim.top_cohort_matches[0].title}"</em>
        </div>
      )}
      {dim.format_scope_note && (
        <div style={{ fontSize: 10, color: '#666', marginTop: 4, fontStyle: 'italic' }}>
          {dim.format_scope_note}
        </div>
      )}
      {dim.scope_used && dim.scope_used !== 'combined' && (
        <div style={{ fontSize: 10, color: '#666', marginTop: 4, fontStyle: 'italic' }}>
          Scope: {dim.scope_used === 'long_form' ? 'long-form' : dim.scope_used} cohort
        </div>
      )}
      {dim.rationale && (
        <div style={{ fontSize: 11, color: '#888', marginTop: 6, lineHeight: 1.4 }}>
          {dim.rationale}
        </div>
      )}
      {dim.note && <div style={{ fontSize: 11, color: '#888', marginTop: 4, fontStyle: 'italic' }}>{dim.note}</div>}

      {/* Methodology — collapsed by default. The data the methodology
          block reads is the same data the score above is built from;
          this just exposes the formula + sample + confidence rules so
          a strategist can defend the number to a stakeholder. */}
      <button
        type="button"
        onClick={() => setMethodologyOpen(o => !o)}
        style={methodologyToggleStyle}
      >
        {methodologyOpen ? '▾' : '▸'} How this was computed
      </button>
      {methodologyOpen && <MethodologyBlock dim={dim} dimensionName={name} />}
    </div>
  );
}

// Methodology helper — takes a dimension's score object and renders
// the formula, sample, confidence definition, and any caveats. Reads
// from the same data the score itself was computed from. Per-dimension
// branches because each dimension has different math + provenance.
function MethodologyBlock({ dim, dimensionName }) {
  const m = buildMethodology(dim, dimensionName);
  return (
    <div style={methodologyBlockStyle}>
      <MethodLine label="Formula" body={m.formula} />
      {m.sample &&     <MethodLine label="Sample"     body={m.sample} />}
      {m.confidence && <MethodLine label="Confidence" body={m.confidence} />}
      {m.caveats?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={methodLabelStyle}>Caveats</div>
          {m.caveats.map((c, i) => (
            <div key={i} style={methodCaveatStyle}>• {c}</div>
          ))}
        </div>
      )}
      {m.source && <MethodLine label="Source" body={m.source} />}
    </div>
  );
}

function MethodLine({ label, body }) {
  return (
    <div style={{ marginTop: 4 }}>
      <span style={methodLabelStyle}>{label}: </span>
      <span style={methodBodyStyle}>{body}</span>
    </div>
  );
}

// Builds the methodology content for a dimension based on its shape.
// Reads the same fields the DimensionCard already renders — confidence,
// n, scope_used, format-skew warnings, dominant_source, etc. — and
// composes them into prose a strategist can show a stakeholder.
function buildMethodology(dim, dimensionName) {
  const name = (dimensionName || '').toLowerCase();

  // Title pattern stack
  if (dim.matched !== undefined && dim.drags !== undefined) {
    const matchedCount = dim.matched?.length || 0;
    const dragCount = dim.drags?.length || 0;
    const hasFormatSkew = dim.matched?.some?.(m => m.format_skew_warning);
    return {
      formula: 'For each title-pattern the title matches, lift = (trimmed median views of cohort videos matching this pattern) ÷ (trimmed median views across the full cohort scope). The dimension tier is set by the BEST matched pattern; "drag" patterns (statistically-negative lift) cap the composite when present.',
      sample: `${matchedCount} pattern${matchedCount === 1 ? '' : 's'} matched in title, ${dragCount} drag${dragCount === 1 ? '' : 's'} (negative-lift patterns also present). Each match cites its own sample size (n=).`,
      confidence: 'Statistical: pattern n ≥ 30 AND removing the top-view video doesn\'t shift the median by more than 25% (drop-top stability check). Directional: n ≥ 10 but fails the drop-top check, or borderline sample size. Insufficient: n < 10 — pattern excluded.',
      caveats: [
        hasFormatSkew ? 'Format-skew warning fired: at least one matched pattern is dominated by the opposite format in the cohort (Shorts vs long-form). The lift figure may not transfer to this video\'s format.' : null,
        dragCount >= 2 ? 'Two or more drag patterns present — composite caps at "predicted under" regardless of positive matches.' : (dragCount === 1 ? 'One drag pattern present — composite caps at "risky" regardless of positive matches.' : null),
      ].filter(Boolean),
      source: 'patternsService — 14 regex patterns evaluated against cohort videos in the 90-day window.',
    };
  }

  // Slot (cadence heatmap)
  if (dim.day !== undefined && dim.block !== undefined) {
    return {
      formula: 'Lift = (trimmed median views of cohort videos uploaded in this day × hour-block) ÷ (cohort scope median). Day × hour-block is computed in Mountain Time; weekday is one of Sun–Sat, block is 12am–6am / 6am–12pm / 12pm–6pm / 6pm–12am.',
      sample: `n=${dim.n ?? 0} cohort uploads in the ${dim.day} ${dim.block} cell, 90-day window.`,
      confidence: 'Statistical: cell n ≥ 30 AND drop-top stability check passes. Directional: n ≥ 5 but fails drop-top or low sample. Insufficient: n < 5 — cell shows no lift.',
      caveats: [
        dim.scope_used && dim.scope_used !== 'combined'
          ? `Phase 2.7a filter active — this slot was scored against the ${dim.scope_used === 'long_form' ? 'long-form' : 'Shorts'}-only cohort subgrid, not the format-mixed combined grid.`
          : 'Currently scoring against the format-mixed combined grid — the format-specific subgrid for this cell was below the statistical floor, so we fell back to combined.',
      ].filter(Boolean),
      source: 'whiteSpaceService.computeCadenceGaps — 7×4 grid of upload counts + view medians per cell.',
    };
  }

  // Length (long-form only)
  if (dim.bucket !== undefined && dim.bucket_id !== undefined) {
    return {
      formula: 'Lift = (trimmed median views of cohort videos in this length bucket) ÷ (long-form median across the cohort). Critically, the baseline is the LONG-FORM median, not the all-videos median — comparing 8–15 min content against a Shorts-diluted scope median would inflate every long-form bucket.',
      sample: `n=${dim.n ?? 0} cohort videos in the ${dim.bucket} bucket.`,
      confidence: 'Statistical: n ≥ 30. Directional: 10 ≤ n < 30. Insufficient: n < 10 — bucket lift excluded.',
      caveats: [
        'Length scoring runs only for long-form (>180s). Shorts lift comes from a different signal — completion + loops, not length.',
      ],
      source: 'whiteSpaceService.computeFormatGaps — length-class baselined per the LDS audit pipeline.',
    };
  }

  // Topic (whitespace coverage)
  if (dim.saturation !== undefined || dim.matched_topic_name !== undefined) {
    return {
      formula: 'Topic coverage classification from the cohort\'s top-80 titles, clustered by Claude into 8–12 themes. Saturated: theme covers >15% of titles. Moderate: 5–15%. Gap: <5%.',
      sample: `Theme "${dim.matched_topic_name || dim.label}" — ${dim.cohort_share_pct}% of the top-80 cohort titles fall in this theme.`,
      confidence: 'This dimension is classification, not a measured lift. Treat as directional — the inference is "if no one is producing X and X performs well, there\'s room to claim it," not a forecast.',
      caveats: dim.note ? [dim.note] : (
        !dim.matched_topic_name ? ['Topic label not found in cohort clusters — treated as novel gap with no empirical backing.'] : []
      ),
      source: 'whiteSpaceService.computeTopicCoverage — Claude clustering of cohort\'s highest-view titles, cached 7 days.',
    };
  }

  // Surface fit (Phase 2.5)
  if (dim.target_surface !== undefined && dim.surface_share_pct !== undefined) {
    return {
      formula: 'Surface share = (views from the target surface across the channel\'s recent videos) ÷ (total views across the same set). Phase 2.5 architecture: this isn\'t a cohort lift — it\'s the channel\'s own surface profile from YouTube Analytics insightTrafficSourceType data.',
      sample: `${dim.n_videos || 0}-video snapshot from the latest /api/youtube-analytics-surface-pull. The target surface (${dim.target_surface}) carries ${dim.surface_share_pct}% of channel views over the snapshot window.`,
      confidence: 'Statistical when n ≥ 10 videos in the snapshot. Direct measurement from YouTube Analytics — no inference layer, but reflects only THIS channel, not the cohort.',
      caveats: [
        dim.divergence_warning,
        !dim.is_dominant && dim.dominant_surface ? `Targeting ${dim.target_surface} but ${dim.dominant_surface} carries ${dim.dominant_share_pct}% — this channel\'s algorithmic home is elsewhere.` : null,
      ].filter(Boolean),
      source: 'client_video_traffic_sources (latest snapshot) — direct YouTube Analytics insightTrafficSourceType.',
    };
  }

  // Search keyword match (Phase 2.5)
  if (dim.match_pct !== undefined && dim.total_unbranded_queries !== undefined) {
    return {
      formula: 'Match % = (number of top-20 unbranded search queries that share ≥1 non-stopword token with the proposed title) ÷ 20. Branded queries (containing the channel name/handle) are excluded at ingest — they reflect audience that already knew the brand.',
      sample: `${dim.total_unbranded_queries} unbranded queries pulled from channel-level YT_SEARCH detail (per-video aggregation), 90-day window. ${dim.matched_count} match the title's token set.`,
      confidence: 'Direct measurement from YouTube Analytics. Statistical when total unbranded queries ≥ 20.',
      caveats: [
        dim.total_unbranded_queries < 20 ? `Only ${dim.total_unbranded_queries} unbranded queries available — match % is a small-sample read.` : null,
        'Branded vs unbranded classification is conservative — false negatives (letting a branded query through) pollute the keyword pool but don\'t hide signal.',
      ].filter(Boolean),
      source: 'client_search_queries (latest snapshot) — YT_SEARCH detail per video, aggregated channel-wide.',
    };
  }

  // Curiosity gap (Phase 2.6 step 1)
  if (dim.curiosity_score !== undefined) {
    return {
      formula: 'Claude 1–10 rating of whether the title leaves an OPEN LOOP — a specific question or implied payoff the viewer can\'t predict from the title alone. Title-only input; format passed as context.',
      sample: 'One LLM call per (title, format) — single judgment, no cohort comparison.',
      confidence: `Prompt version ${dim.prompt_version || 'v1-curiosity-1-10'}. ${dim.cached ? 'Result was served from cache — original Claude call happened earlier and the result was stable enough to re-use.' : 'Fresh Claude call.'} Cached by (title, format, prompt-version) with 30-day TTL.`,
      caveats: [
        'LLM ratings have inherent variability — same title may score ±1 across calls. Score boundaries (3/4, 6/7, 8/9) are softer than they appear.',
        'Trust-sensitive niches deserve a lower bar for "good enough" curiosity — over-engineering a curiosity hook trades brand register for short-term clicks.',
      ],
      source: 'curiosityGapService — Claude Sonnet 4.5, max 300 output tokens.',
    };
  }

  // Hook promise delivery (Phase 2.6 step 2)
  if (dim.hook_score !== undefined) {
    return {
      formula: 'Claude 1–10 rating of whether the strategist-provided "hook beat" (1–2 sentences describing the first 15 seconds) delivers on the title\'s specific promise. Mis-alignment is the most common reason high-CTR videos lose retention at 0:30.',
      sample: 'One LLM call per (title, hook-beat, format) tuple. Only fires when the hook-beat field is filled.',
      confidence: `Prompt version ${dim.prompt_version || 'v1-hook-delivery-1-10'}. ${dim.cached ? 'Cached result.' : 'Fresh Claude call.'} Cached by (title, hook-beat, format, prompt-version), 30-day TTL.`,
      caveats: [
        'Quality of this score depends on the strategist\'s hook-beat description — a vague beat will rate the title charitably.',
        'The check is title-promise vs hook only; doesn\'t evaluate hook craft (pacing, cold-open quality) — only alignment.',
      ],
      source: 'hookPromiseDeliveryService — Claude Sonnet 4.5.',
    };
  }

  // Topic authority (Phase 2.6 step 3)
  if (dim.topic_max_similarity !== undefined) {
    return {
      formula: 'Cosine similarity between the proposed title\'s OpenAI text-embedding-3-small vector (1536 dims) and the embeddings of (a) the channel\'s top historical performers and (b) the cohort\'s top recent winners. The score = max similarity across the two corpora.',
      sample: `${dim.channel_corpus_size || 0} historical hits from this channel + ${dim.cohort_corpus_size || 0} cohort recent winners (90-day window). Dominant source: ${dim.dominant_source === 'channel' ? 'this channel\'s own catalog' : 'the competitor cohort'}.`,
      confidence: 'Direct geometric similarity, deterministic — but thresholds (0.55 / 0.40 / 0.25) are calibrated against text-embedding-3-small\'s typical 0.30–0.70 range for related content. Thresholds are tunable.',
      caveats: [
        dim.format_scope_note,
        'Text embeddings capture form similarity as well as topic. A non-matching topic with a familiar title shape ("X are better than Y") will still hit ~30% similarity. The composite logic plus other dimensions handle the false-positive risk.',
      ].filter(Boolean),
      source: 'topicAuthorityService — embeddings computed via /api/openai-embeddings, similarity computed client-side over the latest backfill snapshot.',
    };
  }

  // Default fallback for unknown dimension shapes
  return {
    formula: 'Per-dimension methodology not documented for this shape.',
    sample: null,
    confidence: null,
    caveats: [],
    source: null,
  };
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
  if (form.target_surface)      out.target_surface = form.target_surface;
  if (form.hook_beat?.trim())   out.hook_beat = form.hook_beat.trim();
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
const altTitlesCardStyle = {
  background: 'rgba(10, 145, 155, 0.04)',
  border: '1px solid rgba(10, 145, 155, 0.20)',
  borderLeft: '2px solid #0A919B',
  borderRadius: 6,
  padding: 12,
  marginTop: 10,
};

// Methodology toggle + block (Phase 2.7 follow-up — methodology transparency).
// Expose formula + sample + confidence + caveats per dimension so the
// scorer is defensible to a stakeholder (CFO, brand exec, legal).
const methodologyToggleStyle = {
  marginTop: 10,
  background: 'transparent',
  border: 'none',
  padding: 0,
  color: '#666',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  cursor: 'pointer',
  textAlign: 'left',
};
const methodologyBlockStyle = {
  marginTop: 8,
  padding: 10,
  background: 'rgba(255, 250, 241, 0.03)',
  border: '1px solid rgba(255, 250, 241, 0.08)',
  borderLeft: '2px solid rgba(10, 145, 155, 0.40)',
  borderRadius: 4,
};
const methodLabelStyle = {
  fontSize: 10,
  color: '#0A919B',
  textTransform: 'uppercase',
  letterSpacing: 0.7,
  fontWeight: 700,
};
const methodBodyStyle = {
  fontSize: 11,
  color: '#aaa',
  lineHeight: 1.5,
};
const methodCaveatStyle = {
  fontSize: 11,
  color: '#E8A82B',
  lineHeight: 1.5,
  marginTop: 3,
};
// Phase 2.5 — target-surface tag bar + chip styles
const targetTagStyle = {
  background: '#0e0e11',
  border: '1px solid #1f1f24',
  borderRadius: 6,
  padding: '8px 12px',
  marginBottom: 14,
};
const surfaceChipStyle = (picked, dominant, enabled) => ({
  padding: '5px 12px',
  borderRadius: 99,
  border: `1px solid ${picked ? 'rgba(10, 145, 155, 0.55)' : dominant ? 'rgba(232, 168, 43, 0.45)' : '#2a2a30'}`,
  background: picked ? 'rgba(10, 145, 155, 0.18)' : 'transparent',
  color: !enabled ? '#444' : picked ? '#0A919B' : dominant ? '#E8A82B' : '#cde4d6',
  fontSize: 12,
  fontWeight: 600,
  cursor: enabled ? 'pointer' : 'not-allowed',
  letterSpacing: 0.2,
  whiteSpace: 'nowrap',
});

const historyRowStyle = (active) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  background: active ? 'rgba(10, 145, 155, 0.06)' : '#1a1a1f',
  border: `1px solid ${active ? 'rgba(10, 145, 155, 0.25)' : '#1f1f24'}`,
  borderRadius: 6,
});
