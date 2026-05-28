/**
 * ClientDeliverable — the unified two-part client-facing document.
 *
 * Cover + "01 YouTube Category Audit" + "02 Positioning Recommendation".
 * Full-screen overlay over the strategist app; clean print CSS so
 * Cmd+P / browser Print outputs a polished, brandable PDF the
 * strategist can send to the client.
 *
 * Pulls everything via clientDeliverableService.loadDeliverableData.
 * Each sub-section degrades gracefully when its data slot is missing.
 *
 * Visual identity mirrors the CRUX two-part artifact spec: cream
 * panels, pink/magenta numbered section callouts, bold black
 * uppercase titles, editorial sans-serif body.
 */

import React, { useEffect, useState, useContext, createContext, useRef } from 'react';
import { Printer, X as XIcon, Loader, Copy, Check, Edit3, RotateCcw, Save } from 'lucide-react';
import { loadDeliverableData } from '../../services/clientDeliverableService.js';
import {
  loadOverrides,
  saveOverrides,
  clearAllOverrides,
} from '../../services/deliverableOverridesService.js';
import { brand } from '../../config/brand.js';

// Session-scoped edit mode. When on, certain prose elements become
// contentEditable. Edits to <E> instances tagged with a `path` prop
// are PERSISTABLE — clicking "Save edits" in the toolbar upserts them
// to client_deliverable_overrides. Edits to <E> instances WITHOUT a
// path stay session-scoped (still print + copy with the document).
const EditCtx = createContext(false);

// Override context — carries the loaded { path → html } map at render
// time AND a register/unregister API the path-tagged <E> elements use
// to enroll their DOM nodes with the save handler. Plumbed through
// from the top of ClientDeliverable so every <E> path is captured on
// Save without manual wiring per call site.
const OverrideCtx = createContext({
  values: {},
  register: () => {},
  unregister: () => {},
});

// Editable wrapper. Renders a tag (default <div>) with contentEditable
// toggled by context. Path-tagged instances apply the saved override
// (if any) at mount and enroll for Save capture; untagged instances
// stay session-only.
function E({ children, tag = 'div', className = '', style, path }) {
  const editMode = useContext(EditCtx);
  const overrides = useContext(OverrideCtx);
  const ref = useRef(null);
  const overrideHtml = path ? overrides?.values?.[path] : undefined;

  // Apply the saved override (if any) on mount. Only set innerHTML
  // when an override exists — otherwise we let React render the
  // default children. After this, the element is contentEditable;
  // its innerHTML is captured on Save.
  useEffect(() => {
    if (overrideHtml != null && ref.current) {
      ref.current.innerHTML = overrideHtml;
    }
    // Intentionally only re-run when the override value flips on/off
    // — not when children change. The override IS the children once
    // applied.
  }, [overrideHtml]);

  // Register with the OverrideCtx so the toolbar's Save handler can
  // capture this element's innerHTML at save time. Skip if no path.
  useEffect(() => {
    if (!path || !ref.current) return undefined;
    const el = ref.current;
    overrides.register?.(path, el);
    return () => overrides.unregister?.(path);
  }, [path, overrides]);

  return React.createElement(
    tag,
    {
      ref,
      'data-edit-path': path || undefined,
      className: `${className} ${editMode ? 'cd-editable' : ''} ${path && editMode ? 'cd-editable-persistable' : ''}`.trim(),
      contentEditable: editMode,
      suppressContentEditableWarning: true,
      spellCheck: editMode,
      style,
    },
    children,
  );
}

// Pull palette from brand config so a brand swap is one file edit.
const ACCENT = brand.colors.accent;
const ACCENT_SOFT = brand.colors.accentSoft;
const SURFACE = brand.colors.surface;
const SURFACE_DEEP = brand.colors.surfaceDeep;
const INK = brand.colors.ink;
const INK_SOFT = brand.colors.inkSoft;
const MUTED = brand.colors.muted;
const BORDER = brand.colors.border;
const DANGER = brand.colors.danger;
const FONT_STACK = brand.fontStack;
const FONT_HEAD_STACK = brand.fontHeadStack || brand.fontStack;
const FONT_ACCENT_STACK = brand.fontAccentStack || brand.fontStack;
const ACCENT_BRIGHT = brand.colors.accentBright || brand.colors.accent;
const ACCENT_WARM = brand.colors.accentWarm || brand.colors.accent;
const ACCENT_VIVID = brand.colors.accentVivid || brand.colors.accent;

// Deliverable modes — three artifacts collapsed into one component,
// each appropriate to a different stage in the strategist's
// engagement with a client.
//
//   audit     — "Audit & Landscape Report." Part 01 only. Premature
//               to talk positioning, voice, or host. Closes with a
//               CTA to schedule a Strategy Direction working session.
//   direction — "Audit + Strategy Direction." Adds positioning +
//               voice + editorial POV in Part 02. No hosts/rubric
//               (those come later in the engagement).
//   full      — "Audit + Positioning Recommendation." Everything,
//               including hosts and audition rubric.
//
// Mode is auto-detected from spine state, with strategist override.
const MODE_AUDIT = 'audit';
const MODE_DIRECTION = 'direction';
const MODE_FULL = 'full';

const MODE_LABEL = {
  [MODE_AUDIT]: 'Audit & Landscape Report',
  [MODE_DIRECTION]: 'Audit + Strategy Direction',
  [MODE_FULL]: 'Audit + Positioning Recommendation',
};

function detectMode(spine, hosts) {
  const hasPositioning = !!(
    spine?.positioning_oneliner?.trim()
    || spine?.positioning_hypothesis?.trim()
    || spine?.editorial_pov?.trim()
    || spine?.voice_tone?.trim()
  );
  const hasHosts = (hosts || []).length > 0 || !!spine?.host_archetype?.trim();
  if (!hasPositioning) return MODE_AUDIT;
  if (!hasHosts) return MODE_DIRECTION;
  return MODE_FULL;
}

// The override can only go DOWN from the auto-detected mode (you can't
// render "Full" if hosts aren't authored). Returns the modes available
// in the dropdown given what's actually authored.
function availableModes(detected) {
  if (detected === MODE_AUDIT) return [MODE_AUDIT];
  if (detected === MODE_DIRECTION) return [MODE_DIRECTION, MODE_AUDIT];
  return [MODE_FULL, MODE_DIRECTION, MODE_AUDIT];
}

export default function ClientDeliverable({ clientId, clientName, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  // resetKey bumps when the strategist clicks Reset — re-mounts the
  // document so all contentEditable edits are wiped back to defaults.
  const [resetKey, setResetKey] = useState(0);
  // Mode auto-initialized once data loads; strategist can override down
  // via the toolbar dropdown.
  const [modeOverride, setModeOverride] = useState(null);
  // Persisted overrides — loaded from client_deliverable_overrides at
  // mount and any time we save. The path-tagged <E> elements read from
  // this map on render and enroll their nodes with the save handler.
  const [overrides, setOverrides] = useState({ values: {}, lastEditedAt: null });
  const [savingState, setSavingState] = useState('idle'); // idle | saving | saved | error
  // Live registry of mounted path-tagged DOM nodes — keyed by path.
  // Save handler reads innerHTML out of these refs.
  const registryRef = useRef(new Map());
  // Initial-load flag — used to suppress the Save button's "saved" toast
  // on the very first render.
  const initialOverridesLoaded = useRef(false);
  // (Markdown export was removed in Step 17 — the .md output had
  // diverged significantly from the rendered deliverable since Step 8,
  // making it actively misleading to send. The strategist's raw
  // working-notes markdown still lives on the Research v2 page's
  // "Download audit pack" button, which is a different artifact.)

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Load the deliverable data + any persisted overrides in parallel.
    // Overrides apply on first render via the OverrideCtx, so the
    // strategist sees their saved edits exactly as last saved.
    Promise.all([
      loadDeliverableData(clientId),
      loadOverrides(clientId).catch(() => ({ values: {}, lastEditedAt: null })),
    ])
      .then(([r, ov]) => {
        if (cancelled) return;
        if (!r.ok) setError(r.error || 'Failed to load');
        else setData(r);
        setOverrides(ov || { values: {}, lastEditedAt: null });
        initialOverridesLoaded.current = true;
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  // Stable register/unregister functions that path-tagged <E> elements
  // use to enroll their DOM nodes with the save handler. Stored in a
  // ref-backed Map so we don't re-render on every mount.
  const overrideCtxValue = React.useMemo(() => ({
    values: overrides.values,
    register: (path, el) => {
      registryRef.current.set(path, el);
    },
    unregister: (path) => {
      registryRef.current.delete(path);
    },
  }), [overrides.values]);

  // Save handler — capture innerHTML of every currently-registered
  // path-tagged element, diff against the loaded overrides, upsert
  // the changes. Empty/whitespace-only content is treated as a
  // deletion (the strategist erased their edit → revert to default).
  const handleSaveEdits = React.useCallback(async () => {
    if (!data || savingState === 'saving') return;
    setSavingState('saving');
    const captured = [];
    for (const [path, el] of registryRef.current.entries()) {
      const html = (el?.innerHTML || '').trim();
      // Skip empties — strategist who clears the field wants the
      // default back. (We delete the row server-side in that case.)
      if (!html) continue;
      // Skip if unchanged from the loaded override (no point re-saving).
      if (overrides.values?.[path] === html) continue;
      captured.push({ path, content: html, content_type: 'html' });
    }
    if (!captured.length) {
      setSavingState('saved');
      setTimeout(() => setSavingState('idle'), 1400);
      return;
    }
    const res = await saveOverrides(clientId, captured);
    if (!res.ok) {
      setSavingState('error');
      setTimeout(() => setSavingState('idle'), 2000);
      return;
    }
    // Merge the captured edits into our overrides state so subsequent
    // saves can detect changes correctly.
    const nextValues = { ...overrides.values };
    for (const e of captured) nextValues[e.path] = e.content;
    setOverrides({ values: nextValues, lastEditedAt: res.lastEditedAt });
    setSavingState('saved');
    setTimeout(() => setSavingState('idle'), 1400);
  }, [clientId, data, savingState, overrides.values]);

  // Reset handler — wipe all persisted overrides AND the in-session
  // contentEditable edits (the resetKey bump re-mounts the doc).
  const handleResetEdits = React.useCallback(async () => {
    if (!data) return;
    if (!window.confirm('Reset ALL saved edits for this client? Auto-generated text replaces every override. This cannot be undone.')) return;
    await clearAllOverrides(clientId);
    setOverrides({ values: {}, lastEditedAt: null });
    setResetKey(k => k + 1);
  }, [clientId, data]);

  // Compute the effective mode once data loads. Default to auto-detected;
  // the strategist's override (if any) takes precedence as long as it's
  // achievable given what's actually authored.
  const detectedMode = data ? detectMode(data.spine, data.hosts) : MODE_FULL;
  const validOverrides = availableModes(detectedMode);
  const mode = modeOverride && validOverrides.includes(modeOverride) ? modeOverride : detectedMode;


  return (
    <div className="cd-overlay" role="dialog" aria-modal="true">
      <PrintStyles />

      <div className="cd-toolbar">
        {data && validOverrides.length > 1 && (
          <select
            value={mode}
            onChange={e => setModeOverride(e.target.value)}
            className="cd-mode-select"
            title="Choose which artifact to render. You can only render at or below the level your spine supports."
          >
            {validOverrides.map(m => (
              <option key={m} value={m}>{MODE_LABEL[m]}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => setEditMode(e => !e)}
          disabled={!data}
          className={`cd-btn ${editMode ? 'cd-btn-primary' : ''}`}
          title={editMode ? 'Exit edit mode' : 'Edit prose inline — path-tagged elements (headers, rationales, host fields) can be saved'}
        >
          <Edit3 size={13} /> {editMode ? 'Editing — done' : 'Edit'}
        </button>
        {editMode && (
          <>
            <button
              onClick={handleSaveEdits}
              disabled={!data || savingState === 'saving'}
              className={`cd-btn ${savingState === 'saved' ? 'cd-btn-success' : 'cd-btn-primary'}`}
              title="Save edits to highlighted (persistable) elements. Spine fields stay canonical; this layer is your prose overlay."
            >
              {savingState === 'saving'
                ? <><Loader size={13} className="cd-spin" /> Saving…</>
                : savingState === 'saved'
                  ? <><Check size={13} /> Saved</>
                  : savingState === 'error'
                    ? <><Save size={13} /> Save failed — retry</>
                    : <><Save size={13} /> Save edits</>
              }
            </button>
            <button onClick={handleResetEdits} disabled={!data} className="cd-btn" title="Wipe ALL saved overrides for this client. Auto-generated text returns.">
              <RotateCcw size={13} /> Reset saved
            </button>
          </>
        )}
        <button onClick={() => window.print()} disabled={!data} className="cd-btn cd-btn-primary">
          <Printer size={13} /> Print / Save as PDF
        </button>
        <button onClick={onClose} className="cd-btn"><XIcon size={13} /> Close</button>
      </div>

      {editMode && data && (
        <div className="cd-edit-banner">
          <strong>Edit mode.</strong> Click any highlighted prose to edit. Elements with a <strong>dashed underline</strong> are persistable — <strong>Save edits</strong> writes those to this client. Unmarked edits print + copy with the document but reset on close. The spine remains source of truth for positioning data.
          {overrides.lastEditedAt && (
            <span style={{ marginLeft: 8, opacity: 0.7 }}>
              · Last saved {new Date(overrides.lastEditedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}

      <EditCtx.Provider value={editMode}>
        <OverrideCtx.Provider value={overrideCtxValue}>
          <div className="cd-doc" key={resetKey}>
            {loading && (
              <div className="cd-loading">
                <Loader size={28} className="cd-spin" />
                <div style={{ marginTop: 10, fontSize: 14, color: MUTED }}>
                  Loading deliverable… this can take 10–30 seconds — the briefing and white-space brief are AI-generated.
                </div>
              </div>
            )}
            {error && (
              <div className="cd-error">
                <strong>Couldn't load deliverable:</strong> {error}
              </div>
            )}
            {data && <DeliverablePages data={data} clientName={clientName} mode={mode} />}
          </div>
        </OverrideCtx.Provider>
      </EditCtx.Provider>

      {/* Print-only footer — hidden on screen, fixed to the bottom of
          every printed page. Lives inside .cd-overlay so the print
          visibility-visible rule catches it. */}
      <div className="cd-print-footer" aria-hidden="true">
        <div className="cd-print-footer-left">
          {brand.logoUrl && (
            <img
              src={brand.logoUrl}
              alt={brand.studio || brand.name}
              className="cd-print-footer-logo"
            />
          )}
          <span>{(clientName || 'Client')} · Competitive audit</span>
        </div>
        <div className="cd-print-footer-right">
          {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
    </div>
  );
}

function DeliverablePages({ data, clientName, mode = MODE_FULL }) {
  const { clientChannel, spine, hosts, legacyRubric, demandRow, productionSignalsByChannel, clientProductionRow, channels, patternsResult, whiteSpaceResult, diagnostic, briefing, audienceSignals, formatMixByChannel, alerts, coverage } = data;
  const displayName = clientName || clientChannel?.name || 'Client';
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  // Pre-launch detection: client exists but no usable performance data
  // anywhere. Their channel either hasn't been synced yet OR they're
  // pre-publication. The deliverable reframes Part 01 to lean on the
  // competitive landscape rather than the client's own (empty) signals.
  const isPreLaunch = !audienceSignals && !clientProductionRow && !demandRow;

  const showPart2 = mode !== MODE_AUDIT;
  const showHosts = mode === MODE_FULL;

  return (
    <>
      <Cover
        clientName={displayName}
        dateStr={dateStr}
        oneliner={mode === MODE_AUDIT ? null : spine?.positioning_oneliner}
        isPreLaunch={isPreLaunch}
        mode={mode}
        coverage={coverage}
      />

      <AuditTopSheet
        clientName={displayName}
        channels={channels}
        patternsResult={patternsResult}
        whiteSpaceResult={whiteSpaceResult}
        productionSignalsByChannel={productionSignalsByChannel}
        demandRow={demandRow}
        alerts={alerts}
      />

      <PartCallout
        number="01"
        title="YouTube Category Audit"
        description={
          isPreLaunch
            ? 'The field this channel is entering: who occupies it, how they post, what they look like, and where the openings are.'
            : 'Competitive landscape, with deep-dives (content types, cadence, production approach, performance patterns), audience behavior analysis, and content gap identification.'
        }
      />

      {isPreLaunch && <PreLaunchFraming clientName={displayName} />}

      <PartOneContent
        clientName={displayName}
        briefing={briefing}
        diagnostic={diagnostic}
        channels={channels}
        patternsResult={patternsResult}
        whiteSpaceResult={whiteSpaceResult}
        productionSignalsByChannel={productionSignalsByChannel}
        clientProductionRow={clientProductionRow}
        demandRow={demandRow}
        audienceSignals={audienceSignals}
        formatMixByChannel={formatMixByChannel}
        alerts={alerts}
        isPreLaunch={isPreLaunch}
      />

      {showPart2 && (
        <>
          <PartCallout
            number="02"
            title={showHosts ? 'Positioning Recommendation' : 'Strategy Direction'}
            description={showHosts
              ? 'The channel\'s one-line articulation, editorial POV and mission, voice and tone guardrails, and the host archetype definition that feeds directly into a talent audition rubric.'
              : 'The channel\'s one-line articulation, editorial POV and mission, and voice and tone guardrails. Casting and the talent audition rubric come in a later phase, after the positioning lands.'
            }
          />

          <PartTwoContent
            spine={spine}
            hosts={showHosts ? (hosts || []) : []}
            legacyRubric={showHosts ? legacyRubric : null}
            rationales={buildRationales({
              channels,
              patternsResult,
              whiteSpaceResult,
              productionSignalsByChannel,
              clientProductionRow,
              demandRow,
            })}
          />
        </>
      )}

      <Footer />
    </>
  );
}

// ──────────────────────────────────────────────────
// Cover + section callouts
// ──────────────────────────────────────────────────

function Cover({ clientName, dateStr, oneliner, isPreLaunch, mode = MODE_FULL, coverage }) {
  // Cover label adapts to mode so the artifact's identity is clear from
  // the first page — "Audit & Landscape Report" is a different document
  // from "Audit + Positioning Recommendation" and the cover sets the
  // reader's expectation.
  const label = MODE_LABEL[mode] || brand.productLabel;

  // Data-coverage stats. Signals rigor — surfaces what the audit was
  // actually built from so the reader knows the basis at a glance.
  // Rendered as a 3-stat row (videos / channels / window) with the
  // numbers in Gotham Ultra and the labels in small caps.
  const coverageStats = coverage && coverage.videoCount && coverage.channelCount
    ? [
        { num: fmtNum(coverage.videoCount), label: 'Videos analyzed' },
        { num: String(coverage.channelCount), label: 'Channels in scope' },
        { num: `${coverage.windowDays || 90}`, label: 'Day window', suffix: ' days' },
      ]
    : null;

  return (
    <section className="cd-page cd-cover">
      {brand.logoUrl ? (
        <img src={brand.logoUrl} alt={brand.studio || brand.name} className="cd-cover-logo" />
      ) : (
        <div className="cd-cover-wordmark">{brand.studio || brand.name}</div>
      )}
      <div className="cd-cover-label">
        {label}
        {isPreLaunch && <span className="cd-cover-tag">Pre-launch</span>}
      </div>
      <h1 className="cd-cover-title">{clientName}</h1>
      <div className="cd-cover-date">{dateStr}</div>
      {oneliner && (
        <div className="cd-cover-oneliner">
          <span className="cd-cover-oneliner-mark">“</span>
          <E tag="span">{oneliner}</E>
          <span className="cd-cover-oneliner-mark">”</span>
        </div>
      )}
      {coverageStats && (
        <div className="cd-cover-stats">
          <div className="cd-cover-stats-label">Audit basis</div>
          <div className="cd-cover-stats-row">
            {coverageStats.map((s, i) => (
              <div key={i} className="cd-cover-stat">
                <div className="cd-cover-stat-num">{s.num}</div>
                <div className="cd-cover-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="cd-cover-footer">{brand.footerNote || `Prepared by ${brand.studio || brand.name}`}</div>
    </section>
  );
}

// Audit top sheet — the audit-mode synthesis page. Three groups of
// three findings + a closing Next Steps block. Structure matches the
// strategist's hand-drawn spec (per Step 22):
//   - Unclaimed Territory: top 3 white-space opportunities
//   - How the Cohort Shows Up: cadence / production / engagement
//   - What's Moving Now: active formulas / format pivots / rank changes
//   - Next Steps: content strategy / pillar development / reconvene pitch
function AuditTopSheet({ clientName, channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, demandRow, alerts }) {
  const ctx = computeSynthesisContext({ channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, demandRow });
  const unclaimed = buildUnclaimedTerritory(whiteSpaceResult);
  const cohortBehavior = buildHowCohortShowsUp(ctx, channels);
  const movement = buildWhatsMovingNow(alerts);
  const nextSteps = buildAuditNextSteps();

  const synthRef = React.useRef(null);
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!synthRef.current) return;
    try {
      await navigator.clipboard.writeText(synthRef.current.innerText.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* fallback covered by Print */ }
  };

  return (
    <section className="cd-page cd-audit-topsheet">
      <div className="cd-synthesis-head">
        <div>
          <div className="cd-synthesis-kicker">Audit summary</div>
          <h2 className="cd-synthesis-title">What we've learned about {clientName}'s category</h2>
        </div>
        <button onClick={handleCopy} className="cd-copy-btn" title="Copy this page to clipboard">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div ref={synthRef}>
        {/* Group labels all render in brand pink against the deep-teal
            pull-page — a consistent, bold system. Inline styles so they
            win over the page-level color override. */}
        <TopsheetGroup
          label="Unclaimed territory"
          items={unclaimed}
          accent={ACCENT_VIVID}
          emptyText="Opportunity brief is still generating or returned no findings under the current business-context constraints. Re-run the deliverable to retry; if it stays empty, loosen the business-context offer list or widen the analysis window."
        />
        <TopsheetGroup
          label="How the cohort shows up"
          items={cohortBehavior}
          accent={ACCENT_VIVID}
          emptyText="Cohort data is too thin to characterize cadence, production, or engagement signals."
        />
        <TopsheetGroup
          label="What's moving now"
          items={movement}
          accent={ACCENT_VIVID}
          emptyText="No named-channel movement in the cohort over the last 30 days — the field is steady-state."
        />

        <div className="cd-audit-divider" />

        <div className="cd-audit-nextsteps">
          <div className="cd-audit-nextsteps-label">Next steps</div>
          <ol className="cd-audit-nextsteps-list">
            {nextSteps.map((step, i) => (
              <li key={i}>
                <E tag="span">{step}</E>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

// One of the three audit-topsheet groups. Heading + numbered list of
// 3 items, each with a short label and a body sentence. Renders the
// group with an explicit empty-state line when items is empty so the
// audit topsheet always shows 3 groups (a silent vanish is worse than
// a visible "no findings" placeholder).
function TopsheetGroup({ label, items, accent, emptyText }) {
  const hasItems = !!items?.length;
  return (
    <div className="cd-topsheet-group">
      <div className="cd-topsheet-group-label" style={{ color: accent }}>{label}</div>
      {hasItems ? (
        <ol className="cd-topsheet-list">
          {items.map((item, i) => (
            <li key={i} className="cd-topsheet-item">
              <div className="cd-topsheet-item-num">{i + 1}</div>
              <div className="cd-topsheet-item-body">
                {item.label && <div className="cd-topsheet-item-label">{item.label}</div>}
                <E className="cd-topsheet-item-text">{item.text}</E>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="cd-topsheet-empty">
          <E tag="span">{emptyText || 'No findings to show.'}</E>
        </div>
      )}
    </div>
  );
}

// Unclaimed territory — top 3 white-space opportunities. Each one is
// a candidate position the channel could own; the strategist picks
// which to lean into during pillar development.
function buildUnclaimedTerritory(whiteSpaceResult) {
  const opps = whiteSpaceResult?.brief?.opportunities || [];
  return opps.slice(0, 3).map(o => ({
    label: o.title,
    // Full body — the brief prompt already constrains each finding to
    // 1-2 sentences, so no truncation. (Was compressText(220), which
    // cut findings mid-sentence with an ellipsis.)
    text: o.body || <em style={{ color: '#888' }}>Detail TK</em>,
  }));
}

// How the cohort shows up — three dimensions of cohort behavior:
// cadence, production, engagement. One sentence per dimension.
function buildHowCohortShowsUp(ctx, channels) {
  const items = [];

  // Upload cadence — use REAL upload-per-week data, not view velocity.
  // Surface landscape context (median + range + distribution) AND the
  // outlier so the strategist sees both "what's typical" and "who's
  // unattainable."
  const cadenceRows = (channels || [])
    .filter(c => typeof c.uploadsPerWeek === 'number' && c.uploadsPerWeek > 0);
  if (cadenceRows.length >= 3) {
    const sorted = [...cadenceRows].sort((a, b) => b.uploadsPerWeek - a.uploadsPerWeek);
    const leader = sorted[0];
    const median = sorted[Math.floor(sorted.length / 2)].uploadsPerWeek;
    const bottom = sorted[sorted.length - 1].uploadsPerWeek;
    // Distribution buckets
    const mostlyLight = sorted.filter(c => c.uploadsPerWeek >= 1 && c.uploadsPerWeek < 4).length;
    const heavy = sorted.filter(c => c.uploadsPerWeek >= 7).length;
    const leaderMult = Math.round(leader.uploadsPerWeek / median);
    const tempoFmt = (perWeek) => perWeek >= 1 ? `${perWeek.toFixed(1)}/wk` : `${(perWeek * 30 / 7).toFixed(1)}/mo`;
    items.push({
      label: 'Upload cadence',
      text: <>
        Cohort tempo runs from <strong>{tempoFmt(bottom)}</strong> at the bottom to <strong>{tempoFmt(leader.uploadsPerWeek)}</strong> at the top, with a <strong>{tempoFmt(median)} median</strong>. {mostlyLight}/{sorted.length} channels post in the moderate 1–4/wk band — the realistic target range for a new entrant.
        {leaderMult >= 4 && (
          <> <strong>{leader.name}</strong> sits {leaderMult}× the median ({heavy >= 2 ? `${heavy} channels run at 7+/wk` : 'a content-factory pace'}); not a comparable lane unless the client commits to that production volume.</>
        )}
      </>,
    });
  } else {
    items.push({ label: 'Upload cadence', text: <>Not enough channels with upload data to call cohort tempo confidently.</> });
  }

  if (ctx.dominantTier && ctx.totalTiered >= 3) {
    const tierReads = {
      high: <>Cohort skews <strong>high-tier production</strong> ({ctx.dominantTierCount}/{ctx.totalTiered} competitors). Polish is table stakes — differentiation has to be aesthetic identity, not budget.</>,
      medium: <>Cohort skews <strong>medium-tier production</strong> ({ctx.dominantTierCount}/{ctx.totalTiered} competitors). The bar is reachable; most channels here are competent without being distinctive.</>,
      low: <>Cohort skews <strong>low-tier production</strong> ({ctx.dominantTierCount}/{ctx.totalTiered} competitors). Even moderate craft reads premium against the baseline.</>,
      mixed: <>Cohort is <strong>visually inconsistent</strong> ({ctx.dominantTierCount} mixed-tier channels). A coherent system reads professional by default.</>,
    };
    items.push({ label: 'Production', text: tierReads[ctx.dominantTier] });
  } else {
    items.push({ label: 'Production', text: <>Not enough production-signal data yet to call cohort tier confidently.</> });
  }

  const ranked = (channels || []).filter(c => typeof c.engagementRate === 'number').sort((a, b) => b.engagementRate - a.engagementRate);
  if (ranked.length >= 3) {
    const top = ranked[0];
    const median = ranked[Math.floor(ranked.length / 2)];
    const topByVel = [...channels].filter(c => c.viewVelocity != null).sort((a, b) => b.viewVelocity - a.viewVelocity)[0];
    const sameLeader = top.id === topByVel?.id;
    if (!sameLeader && top.engagementRate && median.engagementRate) {
      const mult = (top.engagementRate / median.engagementRate).toFixed(1);
      items.push({
        label: 'Engagement',
        text: <><strong>{top.name}</strong> leads engagement ({(top.engagementRate * 100).toFixed(1)}%, ~{mult}× median) but doesn't lead reach — engagement and reach decouple in this category.</>,
      });
    } else {
      items.push({
        label: 'Engagement',
        text: <>Engagement clusters around <strong>{(median.engagementRate * 100).toFixed(1)}% median</strong>. Match the baseline to feel native; exceed to feel beloved.</>,
      });
    }
  } else {
    items.push({ label: 'Engagement', text: <>Not enough engagement data across the cohort to call meaningful divergence.</> });
  }

  return items;
}

// What's moving now — the time-sensitive layer. Reads real movement
// data from alerts: channel_name comes from the join (_channelName),
// structured details come from alert.payload (video_title, multiplier,
// prev_format/curr_format, pct_change). Skips items entirely when the
// data is too thin rather than rendering a soft 'A cohort channel' line.
function buildWhatsMovingNow(alerts) {
  const items = [];
  const list = Array.isArray(alerts) ? alerts : [];

  // Helpers: only count rows that have a real channel name AND
  // structured payload data. Anything missing both gets filtered out.
  const named = (a) => !!(a._channelName && a._channelName.trim() && a._channelName !== 'Unknown');

  // 1. Active formulas — group breakouts by channel, pick the channel
  //    with the most. A channel stacking breakouts is running a formula
  //    worth watching INSIDE the saturation window.
  const breakouts = list.filter(a => a.alert_type === 'breakout' && named(a));
  const byChannel = {};
  for (const b of breakouts) {
    const key = b.channel_id;
    if (!byChannel[key]) byChannel[key] = { name: b._channelName, count: 0, sample: null, latest: null };
    byChannel[key].count++;
    const ts = b.generated_at || b.detected_at;
    if (!byChannel[key].latest || new Date(ts) > new Date(byChannel[key].latest)) {
      byChannel[key].latest = ts;
      byChannel[key].sample = b;
    }
  }
  const topActive = Object.values(byChannel).sort((a, b) => b.count - a.count)[0];
  if (topActive && topActive.count >= 2) {
    const sampleTitle = topActive.sample?.payload?.video_title;
    const sampleMult = topActive.sample?.payload?.multiplier;
    items.push({
      label: 'Active formulas',
      text: <>
        <strong>{topActive.name}</strong> is stacking breakouts — <strong>{topActive.count}</strong> in the last 30 days
        {sampleTitle ? <>, most recently <em>"{compressText(sampleTitle, 80)}"</em>{sampleMult ? <> at {Number(sampleMult).toFixed(1)}× channel median</> : ''}</> : ''}.
        A formula gaining traction inside the saturation window — react in the next 2–3 weeks before the cohort catches up.
      </>,
    });
  } else if (topActive) {
    const sampleTitle = topActive.sample?.payload?.video_title;
    const sampleMult = topActive.sample?.payload?.multiplier;
    items.push({
      label: 'Active formulas',
      text: <>
        <strong>{topActive.name}</strong> just had a single breakout
        {sampleTitle ? <> on <em>"{compressText(sampleTitle, 80)}"</em>{sampleMult ? <> ({Number(sampleMult).toFixed(1)}× channel median)</> : ''}</> : ''}.
        One-shot signal — worth watching to see if it repeats.
      </>,
    });
  } else {
    items.push({ label: 'Active formulas', text: <>No named-channel breakout activity in the cohort over the last 30 days. The field is steady-state; opportunities live in unclaimed territory, not in reacting to momentum.</> });
  }

  // 2. Format pivots — read from payload.prev_format → payload.curr_format
  //    with percentages. Skip if no named pivots exist.
  const pivots = list
    .filter(a => (a.alert_type === 'format_shift' || a.alert_type === 'format_pivot') && named(a))
    .sort((a, b) => new Date(b.generated_at || b.detected_at) - new Date(a.generated_at || a.detected_at));
  if (pivots.length > 0) {
    const top = pivots[0];
    const p = top.payload || {};
    const direction = p.prev_format && p.curr_format
      ? <>shifted from <strong>{readableFormat(p.prev_format)}</strong>{p.prev_pct != null ? ` (${Math.round(p.prev_pct)}%)` : ''} to <strong>{readableFormat(p.curr_format)}</strong>{p.curr_pct != null ? ` (${Math.round(p.curr_pct)}%)` : ''}</>
      : <>shifted format mix</>;
    items.push({
      label: 'Format pivots',
      text: <><strong>{top._channelName}</strong> {direction}. Format pivots signal where a competitor thinks the audience IS or ISN'T responding — read this against the gaps before you commit to your own mix.</>,
    });
  } else {
    items.push({ label: 'Format pivots', text: <>No cohort format pivots in the last 30 days. The field's format mix is steady, which gives you cleaner data to anchor your own format decisions against.</> });
  }

  // 3. Rank changes — read pct_change from payload. Show top mover by
  //    magnitude (up or down) + a second mover if available.
  const rankChanges = list
    .filter(a => a.alert_type === 'rank_change' && named(a))
    .sort((a, b) => Math.abs(b.payload?.pct_change || 0) - Math.abs(a.payload?.pct_change || 0));
  if (rankChanges.length > 0) {
    const top = rankChanges[0];
    const p = top.payload || {};
    const pct = Math.round(Math.abs(p.pct_change || 0));
    const arrow = (p.pct_change || 0) >= 0 ? 'up' : 'down';
    const others = rankChanges.slice(1, 3).filter(r => r._channelName);
    items.push({
      label: 'Rank changes',
      text: <>
        <strong>{top._channelName}</strong> {arrow} <strong>{pct}%</strong> on average views in the last 30 days
        {p.prev_velocity && p.curr_velocity ? <> ({fmtNum(p.prev_velocity)}/day → {fmtNum(p.curr_velocity)}/day)</> : ''}.
        {others.length > 0 && <> Also moving: {others.map((o, i) => {
          const oPct = Math.round(Math.abs(o.payload?.pct_change || 0));
          const oArrow = (o.payload?.pct_change || 0) >= 0 ? '↑' : '↓';
          return <span key={i}>{i > 0 ? ', ' : ''}<strong>{o._channelName}</strong> {oArrow}{oPct}%</span>;
        })}.</>}
        {' '}Movement on the leaderboard is the cohort's early indicator of what's working vs cooling.
      </>,
    });
  } else {
    items.push({ label: 'Rank changes', text: <>No meaningful rank shifts in the last 30 days. Cohort positions are stable — your entry won't be reacting to turmoil, which is good for clean testing.</> });
  }

  return items;
}

// Map raw format codes from payloads ('lf_8_15', 'shorts') to readable
// labels. Default to the raw code if unknown so the sentence still parses.
function readableFormat(code) {
  if (!code) return '';
  const map = {
    'shorts': 'Shorts',
    'lf_0_3': 'short long-form (0–3 min)',
    'lf_3_8': 'short long-form (3–8 min)',
    'lf_8_15': 'mid long-form (8–15 min)',
    'lf_15_25': 'long-form (15–25 min)',
    'lf_25_plus': 'long-form (25+ min)',
  };
  return map[code] || code;
}

// The three audit next-steps. Hardcoded — they map to the strategist's
// defined post-audit phases (content strategy → pillar development →
// reconvene pitch meeting).
function buildAuditNextSteps() {
  return [
    <><strong>Content strategy.</strong> Develop the working strategy doc anchored on the gaps named above.</>,
    <><strong>Pillar development.</strong> Draft 5 pillar candidates spanning long-form, Shorts, and multi-cut formats.</>,
    <><strong>Reconvene pitch meeting.</strong> Present the pillar slate for greenlight on 1–3 to start producing.</>,
  ];
}

// Compress a long string on word boundary + append ellipsis. Used for
// opportunity bodies which can run long; top sheet has limited space.
function compressText(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.7 ? slice.slice(0, lastSpace) : slice) + '…';
}

function WhereWeAre({ clientName, mode, spine, hosts, ctx, findings, decisions, actions }) {
  const synthRef = React.useRef(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!synthRef.current) return;
    try {
      await navigator.clipboard.writeText(synthRef.current.innerText.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* fallback covered by Print */ }
  };

  const stateLine = describeWhereWeAre(mode, decisions);
  const openDecisions = decisions.filter(d => !d.resolved).length;
  const totalDecisions = decisions.length;

  if (!findings.length && !decisions.length && !actions.length) return null;

  return (
    <section className="cd-page cd-wherewe">
      <div className="cd-synthesis-head">
        <div>
          <div className="cd-synthesis-kicker">Where we are</div>
          <h2 className="cd-synthesis-title">{clientName}{stateLine ? ` · ${stateLine}` : ''}</h2>
        </div>
        <button onClick={handleCopy} className="cd-copy-btn" title="Copy this page to clipboard">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div ref={synthRef}>
        {findings.length > 0 && (
          <div className="cd-wherewe-block cd-wherewe-learned">
            <div className="cd-wherewe-block-head">
              <div className="cd-wherewe-block-num">01</div>
              <div className="cd-wherewe-block-label">What we've learned</div>
            </div>
            <ol className="cd-wherewe-list">
              {findings.map((f, i) => (
                <li key={i} className="cd-wherewe-item">
                  <div className="cd-wherewe-item-num">{String(i + 1).padStart(2, '0')}</div>
                  <div className="cd-wherewe-item-body">
                    <div className="cd-wherewe-item-label">{f.label}</div>
                    <E className="cd-wherewe-item-text">{f.text}</E>
                    {f.evidence && (
                      <div className="cd-wherewe-item-evidence">
                        <span className="cd-wherewe-evidence-tag">Why</span>
                        <E tag="span">{f.evidence}</E>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {decisions.length > 0 && (
          <div className="cd-wherewe-block cd-wherewe-decide">
            <div className="cd-wherewe-block-head">
              <div className="cd-wherewe-block-num">02</div>
              <div className="cd-wherewe-block-label">
                What we want to decide
                {totalDecisions > 0 && (
                  <span className="cd-wherewe-block-meta">{totalDecisions - openDecisions}/{totalDecisions} resolved</span>
                )}
              </div>
            </div>
            <ol className="cd-wherewe-list">
              {decisions.map((d, i) => (
                <li key={i} className={`cd-wherewe-item cd-wherewe-decision ${d.resolved ? 'is-resolved' : 'is-open'}`}>
                  <div className="cd-wherewe-decision-status">
                    {d.resolved ? <Check size={14} /> : <span className="cd-wherewe-open-dot">?</span>}
                  </div>
                  <div className="cd-wherewe-item-body">
                    <div className="cd-wherewe-item-label">{d.label}</div>
                    {d.resolved ? (
                      <E className="cd-wherewe-decision-resolved">{d.resolvedValue}</E>
                    ) : (
                      <>
                        <E className="cd-wherewe-decision-open">{d.openQuestion}</E>
                        {d.context && (
                          <div className="cd-wherewe-item-evidence">
                            <span className="cd-wherewe-evidence-tag">Context</span>
                            <E tag="span">{d.context}</E>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {actions.length > 0 && (
          <div className="cd-wherewe-block cd-wherewe-do">
            <div className="cd-wherewe-block-head">
              <div className="cd-wherewe-block-num">03</div>
              <div className="cd-wherewe-block-label">What we'll do next</div>
            </div>
            <ol className="cd-wherewe-do-list">
              {actions.map((a, i) => <E key={i} tag="li">{a}</E>)}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

// Build the "What we want to decide" list. Each entry is either RESOLVED
// (with the actual value from the spine) or OPEN (with the question we
// need to answer in the next working session). The label + question
// stay constant; the resolved value comes directly from the spine.
function buildDecisions(spine, hosts, mode, ctx) {
  const decisions = [];

  // Positioning: the headline articulation
  const positioningResolved = !!(spine?.positioning_oneliner?.trim());
  decisions.push({
    label: 'Positioning',
    resolved: positioningResolved,
    resolvedValue: spine?.positioning_oneliner?.trim() || null,
    openQuestion: 'What angle does this channel take in the field?',
    context: ctx?.topOpportunity?.title
      ? <>The audit's strongest unclaimed slot is <strong>{ctx.topOpportunity.title}</strong> — a candidate angle worth pressure-testing in the working session.</>
      : null,
  });

  // Editorial POV: what the channel argues
  const povResolved = !!(spine?.editorial_pov?.trim());
  decisions.push({
    label: 'Editorial POV',
    resolved: povResolved,
    resolvedValue: spine?.editorial_pov?.trim() || null,
    openQuestion: 'What does this channel argue, and why does it exist?',
    context: <>The conviction every script tests against. Distinct from positioning (competitive) — this is the editorial soul.</>,
  });

  // Voice + tone: how the channel sounds
  const voiceResolved = !!(spine?.voice_tone?.trim());
  decisions.push({
    label: 'Voice + tone',
    resolved: voiceResolved,
    resolvedValue: spine?.voice_tone?.trim() || null,
    openQuestion: 'What register does the channel sound in?',
    context: <>The style sheet talent reads before takes and producers reference during edits.</>,
  });

  // Host: only surfaces in full mode (premature in audit/direction)
  if (mode === MODE_FULL) {
    const hostResolved = (hosts && hosts.length > 0) || !!spine?.host_archetype?.trim();
    let resolvedText = null;
    if (hosts && hosts.length > 0) {
      resolvedText = hosts.map(h => {
        const parts = [h.archetype || 'Host'];
        if (h.series_label) parts.push(`(${h.series_label})`);
        return parts.join(' ');
      }).join(' · ');
    } else if (spine?.host_archetype?.trim()) {
      resolvedText = spine.host_archetype.trim();
    }
    decisions.push({
      label: hosts?.length > 1 ? `Hosts (${hosts.length})` : 'Host',
      resolved: hostResolved,
      resolvedValue: resolvedText,
      openQuestion: 'Who is on screen — and for which series?',
      context: <>Anchors casting + the audition rubric. In multi-series channels, each series can carry its own host archetype.</>,
    });
  }

  return decisions;
}

// Mode-aware action list — the Do block of WhereWeAre. For audit
// mode, leads with the Strategy Direction working session CTA;
// for direction/full modes, leads with operational starters.
function buildNextActions({ spine, hosts, mode, channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, demandRow }) {
  const ctx = computeSynthesisContext({ channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, demandRow });
  const actions = [];

  // Audit mode opens with the conversion CTA — the working session is
  // the next phase, everything else is supporting.
  if (mode === MODE_AUDIT) {
    if (ctx.topOpportunity?.title) {
      actions.push(<>Schedule the <strong>Strategy Direction working session</strong>. Bring <strong>{ctx.topOpportunity.title}</strong> — the audit's strongest unclaimed slot — as the lead candidate to pressure-test.</>);
    } else {
      actions.push(<>Schedule the <strong>Strategy Direction working session</strong> to translate the audit findings into a defined positioning, voice, and host plan.</>);
    }
  }

  if (ctx.topSlot) {
    const verb = mode === MODE_AUDIT ? 'Pilot a single upload' : 'Schedule the first 3 uploads';
    actions.push(<>{verb} in <strong>{ctx.topSlot.slot}</strong> — the cohort's strongest statistical slot at +{ctx.topSlot.liftPct}% lift ({ctx.topSlot.count} reference uploads).</>);
  }

  if (ctx.statisticalPatterns.length >= 1) {
    const stack = ctx.statisticalPatterns.slice(0, 2).map(p => p.label).join(' + ');
    actions.push(<>Test the <strong>{stack}</strong> title pattern{ctx.statisticalPatterns.length > 1 ? ' stack' : ''} on the next 4 uploads — clears the statistical threshold in the cohort.</>);
  }

  if (ctx.bestBucket && ctx.longBeatsShortBy && ctx.longBeatsShortBy >= 3) {
    actions.push(<>Produce one <strong>{ctx.bestBucket.label}</strong> anchor video — long-form's median in this length is roughly {ctx.longBeatsShortBy}× the Shorts median.</>);
  }

  // Host audition action — full mode only
  if (mode === MODE_FULL) {
    if (hosts?.length > 0) {
      actions.push(<>Run the <strong>Talent audition rubric</strong> on 3–5 candidates {hosts.length > 1 ? `for each of the ${hosts.length} hosts` : 'against the host archetype'} this month.</>);
    } else if (spine?.host_archetype) {
      actions.push(<>Generate the <strong>Talent audition rubric</strong> from the Strategy Spine and start scoring on-camera candidates.</>);
    }
  } else if (mode === MODE_DIRECTION) {
    actions.push(<>Compress the <strong>Voice + tone</strong> field into a 200-word style sheet — register, signature moves, what to avoid. Producers + AI prompts reference it on every edit.</>);
  }

  // Storyboard the top opportunity — skip in audit mode (already named in the CTA)
  if (ctx.topOpportunity?.title && mode !== MODE_AUDIT && actions.length < 5) {
    actions.push(<>Storyboard one pilot against the <strong>{ctx.topOpportunity.title}</strong> opportunity — the audit's strongest unclaimed direction.</>);
  }

  return actions.slice(0, 5);
}

// One-line state description that gets appended to the page title.
// Reads off the decision-resolution count + mode. Honest about state
// rather than performative.
function describeWhereWeAre(mode, decisions) {
  const total = decisions.length;
  const open = decisions.filter(d => !d.resolved).length;
  if (open === 0 && total > 0) return 'strategy locked, ready to execute';
  if (open === total) {
    if (mode === MODE_AUDIT) return 'audit complete, strategy to decide';
    return 'positioning open, working session next';
  }
  return `${total - open} of ${total} decisions resolved`;
}

function buildAuditFindings({ channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, demandRow }) {
  const findings = [];
  const ctx = computeSynthesisContext({ channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, demandRow });

  // Finding 1: the strongest unclaimed opening
  if (ctx.topOpportunity?.title) {
    findings.push({
      label: 'The unclaimed slot',
      text: ctx.topOpportunity.title,
      evidence: ctx.topOpportunity.body
        ? (ctx.topOpportunity.body.length > 200 ? ctx.topOpportunity.body.slice(0, 197) + '…' : ctx.topOpportunity.body)
        : <>The single strongest cohort gap — content that audiences in this category aren't being served and no competitor is naming clearly.</>,
    });
  }

  // Finding 2: top statistical title pattern
  if (ctx.statisticalPatterns.length >= 1) {
    const top = ctx.statisticalPatterns[0];
    findings.push({
      label: 'What earns views in this category',
      text: <><strong>{top.label}</strong> titles win by +{Math.round(top.viewsLift)}% vs. the cohort median (n={top.count}, statistical).</>,
      evidence: ctx.statisticalPatterns.length >= 2
        ? <>Multiple patterns clear the statistical threshold; this one tops the list. Stack with the next strongest ({ctx.statisticalPatterns[1].label}, +{Math.round(ctx.statisticalPatterns[1].viewsLift)}%) for compound effect.</>
        : <>The clearest reproducible lever in this category — pattern-tested across the cohort, not a one-video fluke.</>,
    });
  }

  // Finding 3: cohort visual posture (production tier)
  if (ctx.totalTiered >= 3 && ctx.dominantTier) {
    const tierReads = {
      high: <>The cohort competes on production polish. Differentiation has to be vertical (aesthetic identity, point of view) — outspending isn't a real lane.</>,
      medium: <>Production is reachable. Most competitors are competent but not distinctive — a coherent visual system is the differentiator the cohort hasn't locked in.</>,
      low: <>The cohort runs raw production. Polish is an immediate differentiator if executed; even moderate craft reads premium against this baseline.</>,
      mixed: <>The cohort is visually inconsistent. The bar for differentiation isn't height, it's consistency — a coherent system reads professional by default.</>,
    };
    findings.push({
      label: 'How the cohort presents itself',
      text: <>Cohort skews <strong>{ctx.dominantTier}-tier production</strong> ({ctx.dominantTierCount}/{ctx.totalTiered} competitors).</>,
      evidence: tierReads[ctx.dominantTier],
    });
  }

  // Finding 4: cadence — when the category gets seen
  if (ctx.topSlot) {
    findings.push({
      label: 'When this category gets seen',
      text: <><strong>{ctx.topSlot.slot}</strong> leads at +{ctx.topSlot.liftPct}% lift across {ctx.topSlot.count} reference uploads (statistical).</>,
      evidence: <>The cohort's strongest reproducible posting window. Anchor any test schedule to this slot rather than guessing on launch day timing.</>,
    });
  }

  // Cap at 4 to keep the page legible
  return findings.slice(0, 4);
}

// Brief framing block that sits between the "01" callout and Part 01
// content when the client has no published video data. Sets reader
// expectations and replaces the "your channel" data we don't have.
function PreLaunchFraming({ clientName }) {
  return (
    <section className="cd-page cd-prelaunch">
      <div className="cd-prelaunch-kicker">Why this deliverable looks different</div>
      <h3 className="cd-prelaunch-title">{clientName} hasn't published in over 90 days — so we're reading the field, not the channel.</h3>
      <div className="cd-prelaunch-body">
        <p>
          When a channel has a year of recent uploads behind it, an audit reads the channel: what's worked, what's flatlined, where the audience is leaning. This deliverable can't do that yet — there isn't enough current data — and shouldn't pretend to.
        </p>
        <p>
          Instead, the audit below describes the <strong>category</strong> {clientName} is operating in: who occupies it today, how those channels post, what they look like, and where the field has open ground. The Positioning Recommendation that follows is calibrated against that landscape — so the channel can re-enter into a defined slot rather than discover one mid-flight.
        </p>
        <p>
          The performance-feedback layer (what your audience watches, what they comment on, what time slots win for your content specifically) will populate once the channel publishes consistently again — roughly 90 days of activity. We'll regenerate this document then with the channel's own signal layered on top of the landscape.
        </p>
      </div>
    </section>
  );
}


// Pre-computes the Part 01 data slices that synthesis evidence + actions
// read from. Keeps the compose* functions clean and readable.
function computeSynthesisContext({ channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, demandRow }) {
  // Production tier rollup across competitors
  const competitorSignals = (channels || [])
    .map(c => productionSignalsByChannel?.[c.id]?.signals)
    .filter(Boolean);
  const tiers = { high: 0, medium: 0, low: 0, mixed: 0 };
  for (const s of competitorSignals) {
    if (s.production_tier && tiers[s.production_tier] != null) tiers[s.production_tier]++;
  }
  const totalTiered = Object.values(tiers).reduce((s, n) => s + n, 0);
  const dominantTier = totalTiered > 0
    ? Object.entries(tiers).sort(([, a], [, b]) => b - a)[0][0]
    : null;
  const dominantTierCount = totalTiered > 0 ? tiers[dominantTier] : 0;

  // Cohort host visibility average
  const hostVisibilityAvg = competitorSignals.length
    ? Math.round(mean(competitorSignals.map(s => parseFloat(s.host_framing?.host_visible_pct) || 0)))
    : null;
  const faceDrivenAvg = competitorSignals.length
    ? Math.round(mean(competitorSignals.map(s => parseFloat(s.visual_treatment?.face_pct) || 0)))
    : null;

  // Top white-space opportunity
  const topOpportunity = whiteSpaceResult?.brief?.opportunities?.[0] || null;
  // Top demand signal
  const topUnserved = demandRow?.signals?.unserved_requests?.[0] || null;

  // Top title patterns (statistical winners only, sorted by lift)
  const statisticalPatterns = (patternsResult?.scope?.titlePatterns || [])
    .filter(p => p.viewsLift != null && p.viewsLift >= 15 && p.confidence === 'statistical')
    .sort((a, b) => b.viewsLift - a.viewsLift);

  // Top cadence slot
  const cadenceGaps = whiteSpaceResult?.cadenceGaps;
  let topSlot = null;
  if (cadenceGaps?.liftGrid && cadenceGaps?.labels) {
    const { liftGrid, confidenceGrid, grid, labels } = cadenceGaps;
    const winners = [];
    for (let d = 0; d < 7; d++) {
      for (let b = 0; b < (labels.blocks?.length || 0); b++) {
        const lift = liftGrid?.[d]?.[b];
        if (lift == null || lift < 1.15) continue;
        if (confidenceGrid?.[d]?.[b] !== 'statistical') continue;
        winners.push({
          slot: `${labels.days?.[d]} ${labels.blocks?.[b]}`.trim(),
          liftPct: Math.round((lift - 1) * 100),
          count: grid[d][b],
        });
      }
    }
    winners.sort((a, b) => b.liftPct - a.liftPct);
    topSlot = winners[0] || null;
  }

  // Best long-form length bucket by median views
  const buckets = patternsResult?.scope?.formatBreakdown?.buckets || [];
  const bestBucket = [...buckets].sort((a, b) => (b.medianViews || 0) - (a.medianViews || 0))[0] || null;
  const shortsMedian = patternsResult?.scope?.formatBreakdown?.shortsMedianViews || 0;
  const longBeatsShortBy = bestBucket?.medianViews && shortsMedian
    ? Math.round(bestBucket.medianViews / shortsMedian)
    : null;

  // Cohort velocity leader vs median
  const byVelocity = (channels || []).filter(c => c.viewVelocity != null).sort((a, b) => b.viewVelocity - a.viewVelocity);
  const velocityLeader = byVelocity[0] || null;
  const velocityMedian = byVelocity[Math.floor(byVelocity.length / 2)]?.viewVelocity || 0;
  const velocityMultiplier = velocityLeader && velocityMedian
    ? Math.round(velocityLeader.viewVelocity / velocityMedian)
    : null;

  return {
    competitorCount: (channels || []).length,
    tiers, totalTiered, dominantTier, dominantTierCount,
    hostVisibilityAvg, faceDrivenAvg,
    topOpportunity, topUnserved,
    statisticalPatterns,
    topSlot,
    bestBucket, longBeatsShortBy,
    velocityLeader, velocityMultiplier,
  };
}


function PartCallout({ number, title, description }) {
  return (
    <section className="cd-page cd-callout-page">
      <div className="cd-callout">
        <div className="cd-callout-number">{number}</div>
        <h2 className="cd-callout-title">{title}</h2>
        <div className="cd-callout-desc">{description}</div>
      </div>
    </section>
  );
}

function SubSection({ title, kicker, children, path }) {
  const bodyRef = React.useRef(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!bodyRef.current) return;
    // innerText gives a readable plaintext version that pastes cleanly
    // into Google Slides / Keynote / Notion. Tables come through with
    // tab-separated columns; lists keep one-item-per-line.
    const text = `${title}\n\n${bodyRef.current.innerText.trim()}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard API denied (likely insecure context). Silent fail —
      // the markdown export button is still available as the fallback.
    }
  };

  return (
    <div className="cd-subsection">
      <div className="cd-subsection-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          {kicker && <E className="cd-kicker" path={path ? `${path}.kicker` : undefined}>{kicker}</E>}
          <E tag="h3" className="cd-subtitle" path={path ? `${path}.title` : undefined}>{title}</E>
        </div>
        <button onClick={handleCopy} className="cd-copy-btn" title="Copy this section to clipboard (paste into your deck)">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="cd-body" ref={bodyRef}>{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Part 01 sub-sections (client-facing curation)
// ──────────────────────────────────────────────────

function PartOneContent({ briefing, diagnostic, channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, clientProductionRow, demandRow, audienceSignals, formatMixByChannel, alerts, isPreLaunch }) {
  const titlePatterns = patternsResult?.scope?.titlePatterns || [];
  const opportunities = whiteSpaceResult?.brief?.opportunities || [];
  const cadenceGaps = whiteSpaceResult?.cadenceGaps || null;
  const unservedRequests = demandRow?.signals?.unserved_requests || [];
  const recurringThemes = demandRow?.signals?.recurring_themes || [];

  // Cohort production tier rollup (competitors only, like the audit pack)
  const competitorProdSignals = channels
    .map(c => productionSignalsByChannel?.[c.id]?.signals)
    .filter(Boolean);
  const tierRollup = { high: 0, medium: 0, low: 0, mixed: 0 };
  for (const s of competitorProdSignals) {
    if (s.production_tier && tierRollup[s.production_tier] != null) tierRollup[s.production_tier]++;
  }

  return (
    <section className="cd-page">
      {(briefing || diagnostic) && (
        <SubSection title="Where to start" kicker="The single highest-leverage move">
          {briefing?.headline && <E className="cd-headline">{briefing.headline}</E>}
          {briefing?.body && <E tag="p">{briefing.body}</E>}
          {!briefing && diagnostic && (
            <p style={{ color: MUTED, fontStyle: 'italic' }}>
              Briefing not yet generated. {diagnostic.cohort?.videoCount} cohort videos analyzed.
            </p>
          )}
        </SubSection>
      )}

      <SubSection title="Competitive landscape" kicker="Who you're up against">
        <p>
          {channels?.length || 0} channels analyzed in the cohort.
          {channels?.length > 0 && (
            <> Lead by view velocity: {topByVelocity(channels, 3).map(c => c.name).join(', ')}.</>
          )}
        </p>
        {channels?.length > 0 && (
          <table className="cd-table">
            <thead><tr><th>Channel</th><th className="cd-num">Subs</th><th className="cd-num">View velocity</th><th className="cd-num">Engagement</th></tr></thead>
            <tbody>
              {topByVelocity(channels, 8).map(c => (
                <tr key={c.id || c.name}>
                  <td>{c.name}</td>
                  <td className="cd-num">{fmtNum(c.subscriberCount)}</td>
                  <td className="cd-num">{fmtNum(c.viewVelocity)}/day</td>
                  <td className="cd-num">{c.engagementRate == null ? '—' : `${(c.engagementRate * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <SoWhat>{soWhatCompetitiveLandscape(channels)}</SoWhat>
      </SubSection>

      {competitorProdSignals.length > 0 && (
        <SubSection title="Production approach" kicker="How the cohort looks">
          <p style={{ marginBottom: 12 }}>
            <strong>Cohort production tiers</strong>{' '}
            <span style={{ color: MUTED, fontSize: 12 }}>({competitorProdSignals.length} competitors analyzed)</span>
          </p>
          <ProductionTierBar rollup={tierRollup} />
          {clientProductionRow?.signals?.summary && !isPreLaunch && (
            <div className="cd-callout-inline">
              <div className="cd-callout-inline-label">Your channel</div>
              <p style={{ margin: 0 }}>{clientProductionRow.signals.summary}</p>
            </div>
          )}
          <SoWhat>{soWhatProductionApproach(channels, productionSignalsByChannel)}</SoWhat>
        </SubSection>
      )}

      {titlePatterns.length > 0 && (
        <SubSection title="Performance patterns" kicker="What's working">
          <p>Title patterns sorted by views lift (vs. cohort median):</p>
          <TitlePatternBars patterns={titlePatterns} />
          <SoWhat>{soWhatPerformancePatterns(patternsResult)}</SoWhat>
        </SubSection>
      )}

      {patternsResult?.scope?.formatBreakdown && (
        <SubSection title="Content mix" kicker="Format split + length sweet spots">
          <ContentMix formatBreakdown={patternsResult.scope.formatBreakdown} />
          <SoWhat>{soWhatContentMix(patternsResult.scope.formatBreakdown)}</SoWhat>
        </SubSection>
      )}

      {channels?.length > 0 && (
        <SubSection title="Upload tempo" kicker="What we're up against, by volume">
          <UploadTempo channels={channels} formatMixByChannel={formatMixByChannel} />
          <SoWhat>{soWhatUploadTempo(channels)}</SoWhat>
        </SubSection>
      )}

      {cadenceGaps?.grid && (
        <SubSection title="Cadence" kicker="When the cohort gets seen">
          <TopSlotsCallout cadenceGaps={cadenceGaps} />
          <CadenceHeatmap cadenceGaps={cadenceGaps} />
        </SubSection>
      )}

      {isPreLaunch && channels?.length > 0 && (
        <SubSection title="How the category engages" kicker="Cohort-level audience behavior">
          <CohortEngagementSummary channels={channels} patternsResult={patternsResult} />
          <SoWhat>{soWhatCategoryEngagement(channels)}</SoWhat>
        </SubSection>
      )}

      {!isPreLaunch && audienceSignals && (
        <SubSection title="What this audience watches" kicker="Audience behavior · format + duration">
          <AudienceFormatSummary audienceSignals={audienceSignals} />
        </SubSection>
      )}

      {!isPreLaunch && (unservedRequests.length > 0 || recurringThemes.length > 0) && (
        <SubSection title="What this audience asks for" kicker="Audience behavior · mined from comments">
          {unservedRequests.length > 0 && (
            <>
              <p><strong>Unserved requests</strong> (top topics commenters keep raising on your channel):</p>
              <ul className="cd-list">
                {unservedRequests.slice(0, 4).map((r, i) => (
                  <li key={i}>
                    <strong>{r.topic}</strong>
                    {r.mentions ? <span style={{ color: MUTED }}> · {r.mentions} mentions</span> : null}
                    {r.sample_quote && <div className="cd-quote">"{r.sample_quote}"</div>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {recurringThemes.length > 0 && (
            <>
              <p style={{ marginTop: 14 }}><strong>Recurring themes:</strong></p>
              <ul className="cd-list">
                {recurringThemes.slice(0, 4).map((t, i) => (
                  <li key={i}>
                    <strong>{t.pattern}</strong>
                    {t.count ? <span style={{ color: MUTED }}> · {t.count} commenters</span> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </SubSection>
      )}

      {opportunities.length > 0 && (
        <SubSection title="Content gaps" kicker="Where the field is open">
          <ol className="cd-list cd-list-numbered">
            {opportunities.slice(0, 5).map((o, i) => (
              <li key={i}>
                <E tag="strong">{o.title}</E>
                {o.body && <E style={{ marginTop: 4 }}>{o.body}</E>}
              </li>
            ))}
          </ol>
        </SubSection>
      )}

      {Array.isArray(alerts) && alerts.length > 0 && (
        <SubSection title="Recent movement" kicker="What just popped in the last 30 days">
          <MovementSummary alerts={alerts} />
        </SubSection>
      )}
    </section>
  );
}

// Content mix — format split (shorts vs long-form) + length buckets.
// Reads from patternsResult.scope.formatBreakdown. Renders as a small
// stacked bar for the shorts/long split + a clean table for length
// buckets with their median views — the "where does length pay off"
// read a client cares about.
function ContentMix({ formatBreakdown }) {
  const shortsFreq = formatBreakdown.shortsFreq || 0;
  const longsFreq = 1 - shortsFreq;
  const shortsMedian = formatBreakdown.shortsMedianViews;
  const longsMedian = formatBreakdown.longsMedianViews;
  const buckets = formatBreakdown.buckets || [];

  return (
    <div>
      <p style={{ marginBottom: 12 }}>
        <strong>The cohort posts {Math.round(shortsFreq * 100)}% Shorts</strong> ({fmtNum(shortsMedian)} median views) and{' '}
        <strong>{Math.round(longsFreq * 100)}% long-form</strong> ({fmtNum(longsMedian)} median views).
      </p>

      <div style={{ display: 'flex', width: '100%', height: 22, borderRadius: 4, overflow: 'hidden', border: `1px solid ${BORDER}`, marginBottom: 18 }}>
        <div style={{ width: `${shortsFreq * 100}%`, background: ACCENT_WARM, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {shortsFreq >= 0.15 ? `Shorts ${Math.round(shortsFreq * 100)}%` : ''}
        </div>
        <div style={{ width: `${longsFreq * 100}%`, background: ACCENT, color: brand.colors.background, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {longsFreq >= 0.15 ? `Long ${Math.round(longsFreq * 100)}%` : ''}
        </div>
      </div>

      {buckets.length > 0 && longsFreq > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Length sweet spots (long-form only)</div>
          <table className="cd-table">
            <thead><tr><th>Length</th><th className="cd-num">Share of long-form</th><th className="cd-num">Median views</th></tr></thead>
            <tbody>
              {buckets.map((b, i) => {
                // formatBreakdown.buckets[].freq is share-of-cohort.
                // Rebase to share-of-long-form so the column reads as
                // "of the long-form videos this cohort produces, where's
                // the volume" — and the four rows sum to 100%.
                const shareOfLong = (b.freq || 0) / longsFreq;
                return (
                  <tr key={i}>
                    <td>{b.label}</td>
                    <td className="cd-num">{Math.round(shareOfLong * 100)}%</td>
                    <td className="cd-num">{fmtNum(b.medianViews)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// Cohort engagement summary — activates in pre-launch mode as a stand-in
// for "your audience" sections we can't render. Surfaces engagement-rate
// leaders in the cohort and flags where title-pattern engagement diverges
// from views — the audience-behavior read for a channel that doesn't yet
// have an audience of its own.
function CohortEngagementSummary({ channels, patternsResult }) {
  const ranked = (channels || [])
    .filter(c => typeof c.engagementRate === 'number')
    .sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0));

  const top = ranked.slice(0, 5);
  const cohortMedianEng = ranked.length
    ? ranked[Math.floor(ranked.length / 2)].engagementRate
    : null;

  // Look for title patterns where engagement and views diverge meaningfully
  // — "audiences engage with X even when it doesn't pull big views" or
  // vice versa.
  const titlePatterns = (patternsResult?.scope?.titlePatterns || [])
    .filter(p => p.avgEngagement != null && p.viewsLift != null && p.count >= 10);
  const engagementWinners = titlePatterns
    .filter(p => p.avgEngagement > 0.02 && p.viewsLift < 0)
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 2);

  return (
    <>
      <p style={{ marginBottom: 12 }}>
        With no published videos yet, this section reads the <strong>category's</strong> audience behavior rather than yours — which channels keep viewers engaged, and where engagement decouples from raw views. Once you publish, your own behavior layer replaces this.
      </p>

      {top.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Engagement-rate leaders in the cohort</div>
          <table className="cd-table">
            <thead><tr><th>Channel</th><th className="cd-num">Engagement rate</th><th className="cd-num">vs cohort median</th></tr></thead>
            <tbody>
              {top.map(c => {
                const mult = cohortMedianEng ? (c.engagementRate / cohortMedianEng) : null;
                return (
                  <tr key={c.id || c.name}>
                    <td>{c.name}</td>
                    <td className="cd-num">{(c.engagementRate * 100).toFixed(1)}%</td>
                    <td className="cd-num">{mult ? `${mult.toFixed(1)}×` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {engagementWinners.length > 0 && (
        <>
          <p style={{ marginTop: 18, marginBottom: 6, fontSize: 13 }}>
            <strong>Where engagement diverges from views</strong> — patterns audiences engage with even when reach is weak. Worth pairing with reach-winners to balance the content strategy:
          </p>
          <ul className="cd-list">
            {engagementWinners.map((p, i) => (
              <li key={i}>
                <strong>{p.label}</strong> · {(p.avgEngagement * 100).toFixed(1)}% engagement
                <span style={{ color: MUTED }}> · but views {Math.round(p.viewsLift)}% vs cohort median</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// Movement summary — recent breakouts + rank changes from the cohort.
// The most actionable competitive intel in the doc: what's just popped
// in the last 30 days, who shifted, what's worth reacting to before
// the formula saturates. Renders the top 4-5 breakouts and 2-3 rank
// changes, compressed and sorted by recency.
// Channel avatar — circle. Falls back to monogram of channel name
// when no thumbnail URL is available or the image fails to load.
function ChannelAvatar({ name, url, size = 28 }) {
  const [errored, setErrored] = useState(false);
  const initials = (name || '?').trim().slice(0, 1).toUpperCase();
  const showImg = url && !errored;
  return (
    <div
      className="cd-channel-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      title={name}
    >
      {showImg ? (
        <img src={url} alt="" onError={() => setErrored(true)} />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

// Short / Long-form pill. Used inline on breakout rows so the reader
// can tell at a glance whether a high-multiplier video is a Short or
// a long-form upload (those mean very different things creatively).
function FormatTag({ kind }) {
  const isShort = kind === 'Short';
  // Brand colors: Shorts = amber, Long-form = deep teal. Solid pill
  // with high-contrast text reads cleanly at 10px.
  return (
    <span
      className="cd-format-tag"
      style={{
        background: isShort ? ACCENT_WARM : ACCENT,
        color: isShort ? INK : brand.colors.background,
      }}
    >
      {kind}
    </span>
  );
}

function MovementSummary({ alerts }) {
  // Alerts come from movementService.loadAlerts. The real shape is:
  //   { id, channel_id, video_id, alert_type, payload, generated_at,
  //     _channelName, _channelYoutubeId, _videoThumbnail }
  // Earlier version of this component read non-existent fields
  // (channel_name, body, title, detected_at, youtube_video_id) and
  // rendered "Unknown" everywhere. Match the schema:
  //   - timestamp:    generated_at
  //   - channel name: _channelName (attached by attachThumbnails)
  //   - video title:  payload.video_title
  //   - multiplier:   payload.multiplier
  //   - youtube id:   payload.youtube_video_id
  //   - rank delta:   payload.pct_change + payload.direction
  const named = (a) => !!(a._channelName && a._channelName.trim() && a._channelName !== 'Unknown');

  const breakouts = (alerts || [])
    .filter(a => a.alert_type === 'breakout' && named(a))
    .sort((a, b) => new Date(b.generated_at || 0) - new Date(a.generated_at || 0))
    .slice(0, 5);
  const rankChanges = (alerts || [])
    .filter(a => a.alert_type === 'rank_change' && named(a))
    .sort((a, b) => new Date(b.generated_at || 0) - new Date(a.generated_at || 0))
    .slice(0, 3);

  if (!breakouts.length && !rankChanges.length) return null;

  const fmtDate = (iso) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    catch { return ''; }
  };

  return (
    <>
      {breakouts.length > 0 && (
        <>
          <p style={{ marginBottom: 8 }}><strong>Breakouts</strong> — videos hitting unusual multipliers off their channel's baseline:</p>
          <ul className="cd-movement-list">
            {breakouts.map((b, i) => {
              const p = b.payload || {};
              const multi = p.multiplier != null ? Number(p.multiplier).toFixed(1) : null;
              const videoTitle = p.video_title;
              const ytId = p.youtube_video_id;
              // Format tag: Shorts < 3 min, anything else is Long-form.
              // Null duration → omit the tag (don't guess).
              const dur = b._videoDurationSeconds;
              const formatTag = dur == null
                ? null
                : (dur > 0 && dur < 180 ? 'Short' : 'Long-form');
              return (
                <li key={i} className="cd-movement-item">
                  <ChannelAvatar name={b._channelName} url={b._channelThumbnail} />
                  <div className="cd-movement-body">
                    <div>
                      <strong>{b._channelName}</strong>
                      {multi && <span style={{ color: MUTED }}> · {multi}× channel median</span>}
                      {formatTag && <FormatTag kind={formatTag} />}
                    </div>
                    {videoTitle && <div className="cd-quote">"{videoTitle}"</div>}
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                      {fmtDate(b.generated_at)}
                      {ytId && (
                        <> · <a href={`https://youtu.be/${ytId}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, textDecoration: 'none' }}>watch</a></>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {rankChanges.length > 0 && (
        <>
          <p style={{ marginTop: 14, marginBottom: 8 }}><strong>Rank changes</strong> — channels whose recent average shifted meaningfully:</p>
          <ul className="cd-movement-list">
            {rankChanges.map((r, i) => {
              const p = r.payload || {};
              const pct = p.pct_change != null ? Math.round(Math.abs(p.pct_change)) : null;
              const arrow = (p.pct_change || 0) >= 0 ? '↑' : '↓';
              const prev = p.prev_velocity != null ? Number(p.prev_velocity).toLocaleString() : null;
              const curr = p.curr_velocity != null ? Number(p.curr_velocity).toLocaleString() : null;
              return (
                <li key={i} className="cd-movement-item">
                  <ChannelAvatar name={r._channelName} url={r._channelThumbnail} />
                  <div className="cd-movement-body">
                    <div>
                      <strong>{r._channelName}</strong>
                      {pct != null && (
                        <span style={{ color: MUTED }}>
                          {' '}— avg views {arrow} <strong>{pct}%</strong>
                          {prev && curr && <span> ({prev}/day → {curr}/day)</span>}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{fmtDate(r.generated_at)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <SoWhat>
        <strong>Movement is the time-sensitive signal in this audit.</strong> Breakouts named here are still inside the saturation window — testing an equivalent angle in the next 2–3 weeks captures the slope before the formula gets crowded. Rank changes flag who's gaining or fading in the field; both inform where to compete.
      </SoWhat>
    </>
  );
}

// Audience format summary — reads from audienceSignalService output
// (high_engagement_formats + _computed.optimal_duration + subscriber_drivers).
// Picks the highest-signal slices for a client-facing read.
function AudienceFormatSummary({ audienceSignals }) {
  const formats = (audienceSignals.high_engagement_formats || []).filter(f => f._computed?.count >= 2);
  const sweetSpots = audienceSignals._computed?.optimal_duration?.sweet_spots || [];
  const subDrivers = audienceSignals._computed?.subscriber_drivers || null;

  if (!formats.length && !sweetSpots.length) {
    return <p style={{ color: MUTED, fontStyle: 'italic' }}>Not enough video history on this channel yet to call audience behavior with confidence.</p>;
  }

  // Filter formats to the most informative — top by composite score, max 3
  const topFormats = [...formats]
    .sort((a, b) => (b._computed.composite_score ?? 0) - (a._computed.composite_score ?? 0))
    .slice(0, 3);

  return (
    <>
      {topFormats.length > 0 && (
        <>
          <p><strong>Top formats by engagement</strong> (vs. this channel's average):</p>
          <table className="cd-table">
            <thead><tr><th>Format</th><th className="cd-num">Avg views</th><th className="cd-num">vs. avg</th><th className="cd-num">Signal</th></tr></thead>
            <tbody>
              {topFormats.map((f, i) => (
                <tr key={i}>
                  <td>{f.format}</td>
                  <td className="cd-num">{fmtNum(f._computed.avg_views)}</td>
                  <td className="cd-num">{f._computed.vs_channel_avg}×</td>
                  <td className="cd-num" style={{ color: f.signal_strength === 'strong' ? ACCENT : MUTED }}>{f.signal_strength}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {sweetSpots.length > 0 && (
        <>
          <p style={{ marginTop: 14 }}><strong>Duration sweet spots:</strong></p>
          <ul className="cd-list">
            {sweetSpots.slice(0, 3).map((b, i) => (
              <li key={i}>
                <strong>{b.range}</strong> · {fmtNum(b.avg_views)} avg views ({b.vs_channel_avg}× this channel's average)
                <span style={{ color: MUTED, fontSize: 12 }}> · {b.count} videos</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {subDrivers?.top_drivers?.length > 0 && (
        <p style={{ marginTop: 14, fontSize: 13, color: MUTED }}>
          <strong style={{ color: INK }}>What drives subs:</strong> {subDrivers.top_drivers.slice(0, 2).map(d => d.title || d.label || d.format).filter(Boolean).join(' · ')}
        </p>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────
// Charts (inline SVG — no library, print-friendly)
// ──────────────────────────────────────────────────

// Horizontal bar chart for title-pattern lifts. Bars proportional to
// absolute lift; positive lifts pink, negative lifts gray. Directional
// confidence shown as a hatched fill, statistical as solid.
function TitlePatternBars({ patterns }) {
  // Sort by lift desc, cap at 8 to keep the chart legible.
  const rows = [...patterns]
    .sort((a, b) => (b.viewsLift ?? -Infinity) - (a.viewsLift ?? -Infinity))
    .slice(0, 8)
    .filter(p => p.viewsLift != null);

  if (!rows.length) return null;

  // Scale: max abs lift sets the bar length scale. Cap at +250% so a
  // single outlier doesn't dwarf the rest.
  const maxAbs = Math.min(250, Math.max(...rows.map(r => Math.abs(r.viewsLift)), 50));
  const labelWidth = 220;
  const valueWidth = 70;
  const barAreaWidth = 460;
  const rowHeight = 26;
  const height = rows.length * rowHeight + 18;
  const zeroX = labelWidth + (barAreaWidth * (maxAbs / (2 * maxAbs)));  // center the zero line

  return (
    <svg className="cd-chart" viewBox={`0 0 ${labelWidth + barAreaWidth + valueWidth} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', maxWidth: 760 }}>
      {/* Zero line */}
      <line x1={zeroX} x2={zeroX} y1={4} y2={height - 6} stroke="#d9cfb1" strokeWidth={1} strokeDasharray="2 2" />
      {rows.map((p, i) => {
        const y = i * rowHeight + 8;
        const lift = Math.max(-maxAbs, Math.min(maxAbs, p.viewsLift));
        const width = (Math.abs(lift) / (2 * maxAbs)) * barAreaWidth;
        const x = lift >= 0 ? zeroX : zeroX - width;
        const isDirectional = p.confidence === 'directional';
        const color = lift >= 0 ? ACCENT : '#9ca3af';
        return (
          <g key={i}>
            <text x={labelWidth - 8} y={y + 13} textAnchor="end" fontSize="11.5" fill={INK} style={{ fontWeight: 500 }}>
              {p.label}
            </text>
            <rect x={x} y={y + 4} width={width} height={14} fill={color} opacity={isDirectional ? 0.45 : 0.92} rx={2} />
            <text x={labelWidth + barAreaWidth + 6} y={y + 13} fontSize="11" fill={INK} style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>
              {lift >= 0 ? '+' : ''}{Math.round(p.viewsLift)}%{isDirectional ? '*' : ''}
            </text>
          </g>
        );
      })}
      <text x={labelWidth + barAreaWidth + valueWidth} y={height - 1} textAnchor="end" fontSize="9" fill={MUTED}>
        * directional (small sample)
      </text>
    </svg>
  );
}

// Top-slots callout — extracts the highest-lift slots from the heatmap
// data and renders them as plain English above the grid. Lets the
// strategist take action without reading 28 cells.
//
// Math rules:
//   - Statistical wins (full confidence) — include ALL that cross +15%
//     lift, capped at 5. We never hide a slot the heatmap flags
//     statistical: the callout and the grid must agree on what's a
//     reproducible win.
//   - Directional wins (small sample) — only "respectable" lifts make
//     the callout, currently +15% to +200%. Above +200%, a single
//     viral video in a small-sample cell distorts the median and the
//     slot itself isn't reproducible. The heatmap still shows the raw
//     number (with its dashed border + small n=) for transparency, but
//     the callout shouldn't recommend it as a scheduling target.
const DIRECTIONAL_MAX_LIFT_PCT = 200;
const STATISTICAL_CAP = 5;

function TopSlotsCallout({ cadenceGaps }) {
  const { grid, liftGrid, confidenceGrid, labels } = cadenceGaps;
  if (!grid || !labels) return null;
  const winners = [];
  for (let d = 0; d < 7; d++) {
    for (let b = 0; b < (labels.blocks?.length || 0); b++) {
      const lift = liftGrid?.[d]?.[b];
      if (lift == null || lift < 1.15) continue;
      winners.push({
        slot: `${labels.days?.[d] || ''} ${labels.blocks?.[b] || ''}`.trim(),
        liftPct: Math.round((lift - 1) * 100),
        count: grid[d][b],
        confidence: confidenceGrid?.[d]?.[b] || 'directional',
      });
    }
  }
  // Sort by lift desc within each confidence tier.
  winners.sort((a, b) => b.liftPct - a.liftPct);

  const statistical = winners
    .filter(w => w.confidence === 'statistical')
    .slice(0, STATISTICAL_CAP);
  const directionalAll = winners.filter(w => w.confidence === 'directional');
  const directional = directionalAll
    .filter(w => w.liftPct <= DIRECTIONAL_MAX_LIFT_PCT)
    .slice(0, 2);
  const directionalOutliers = directionalAll.filter(w => w.liftPct > DIRECTIONAL_MAX_LIFT_PCT);

  if (!statistical.length && !directional.length && !directionalOutliers.length) {
    return <p style={{ marginBottom: 14, color: MUTED, fontStyle: 'italic' }}>No slots show meaningful lift in the current window. Upload distribution is essentially flat across the week.</p>;
  }

  return (
    <div style={{ marginBottom: 14, padding: '12px 14px', background: ACCENT_SOFT, borderRadius: 6, borderLeft: `3px solid ${ACCENT}` }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: ACCENT, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 6 }}>When to post</div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: INK }}>
        {statistical.length > 0 ? (
          <>
            <strong>{statistical[0].slot}</strong> leads at <strong>+{statistical[0].liftPct}%</strong>{' '}
            <span style={{ color: MUTED }}>(n={statistical[0].count}, statistical)</span>.
            {statistical.length > 1 && (
              <> Followed by {statistical.slice(1).map((w, i) => (
                <span key={i}>
                  {i > 0 ? ', ' : ''}<strong>{w.slot}</strong> (+{w.liftPct}%)
                </span>
              ))}.</>
            )}
          </>
        ) : (
          <>No slot crosses the statistical threshold yet — sample sizes are still thin.</>
        )}
        {directional.length > 0 && (
          <>
            {' '}<span style={{ color: MUTED }}>
              Directional flags worth testing once (small sample): {directional.map((w, i) => (
                <span key={i}>{i > 0 ? ', ' : ''}{w.slot} (+{w.liftPct}%)</span>
              ))}.
            </span>
          </>
        )}
        {directionalOutliers.length > 0 && (
          <>
            {' '}<span style={{ color: MUTED, fontStyle: 'italic' }}>
              {directionalOutliers.length} slot{directionalOutliers.length === 1 ? '' : 's'} show{directionalOutliers.length === 1 ? 's' : ''} extreme directional lift ({directionalOutliers.map(w => w.slot).join(', ')}) but with very small samples — likely outlier-driven by individual viral videos, not a reproducible scheduling win. See heatmap for raw numbers.
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// Upload tempo — per-channel cadence with format-mix split. Answers
// "what are we up against, by volume" without conflating "channel
// posts often" with "channel posts the same kind of content as us."
// Each bar is two-toned: pink-saturated for Shorts share, neutral for
// long-form share — so eufy's 25/wk reads as "Shorts pumping" and
// Smart Home Solver's 0.2/wk reads as "long-form essays" at a glance.
function UploadTempo({ channels, formatMixByChannel }) {
  // Format mix + tempo come from the SAME source (researchV2Service's
  // landscape query) with the SAME 30-day window and the SAME
  // duration-based Shorts detection. The bar length (uploadsPerWeek)
  // and the bar split (shortsShare) are now mathematically coherent.
  const rows = (channels || [])
    .filter(c => c.uploadsPerWeek != null && c.uploadsPerWeek > 0)
    .map(c => {
      const mix = formatMixByChannel?.[c.id];
      const shortsShare = mix?.shortsShare != null ? mix.shortsShare : null;
      return {
        id: c.id,
        name: c.name,
        uploadsPerWeek: c.uploadsPerWeek,
        shortsShare, // null when unknown (channel has no videos in window)
        formatKnown: shortsShare != null,
      };
    })
    .sort((a, b) => b.uploadsPerWeek - a.uploadsPerWeek);

  if (!rows.length) {
    return <p style={{ color: MUTED, fontStyle: 'italic' }}>No upload-rate data for the cohort yet.</p>;
  }

  const maxRate = rows[0].uploadsPerWeek;
  const labelWidth = 180;
  const barAreaWidth = 380;
  const valueWidth = 100;
  const rowHeight = 26;
  const height = rows.length * rowHeight + 6;

  // Compact format helpers — under 1/wk shows as /mo for readability
  const formatTempo = (perWeek) => {
    if (perWeek >= 1) return `${perWeek.toFixed(1)}/wk`;
    const perMonth = perWeek * 30 / 7;
    return `${perMonth.toFixed(1)}/mo`;
  };

  return (
    <div>
      <p style={{ marginBottom: 12 }}>
        Cohort tempo ranges from <strong>{formatTempo(maxRate)}</strong> at the top to{' '}
        <strong>{formatTempo(rows[rows.length - 1].uploadsPerWeek)}</strong> at the bottom. Bars split into Shorts (pink) and long-form (neutral) so volume reads alongside what kind of volume it is.
      </p>
      <svg className="cd-chart" viewBox={`0 0 ${labelWidth + barAreaWidth + valueWidth} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', maxWidth: 760 }}>
        {rows.map((r, i) => {
          const y = i * rowHeight + 6;
          const width = (r.uploadsPerWeek / maxRate) * barAreaWidth;
          const shortsW = r.shortsShare != null ? width * r.shortsShare : width;
          const longsW = r.shortsShare != null ? width * (1 - r.shortsShare) : 0;
          const formatNote = r.formatKnown
            ? r.shortsShare >= 0.85 ? 'shorts'
              : r.shortsShare <= 0.15 ? 'long-form'
              : 'mixed'
            : null;
          return (
            <g key={r.id || r.name}>
              <text x={labelWidth - 8} y={y + 14} textAnchor="end" fontSize="11.5" fill={INK} style={{ fontWeight: 500 }}>
                {r.name}
              </text>
              {r.shortsShare != null ? (
                <>
                  <rect x={labelWidth} y={y + 6} width={shortsW} height={14} fill={ACCENT} opacity={0.92} rx={2} />
                  <rect x={labelWidth + shortsW} y={y + 6} width={longsW} height={14} fill="#cbd5e1" rx={2} />
                </>
              ) : (
                <rect x={labelWidth} y={y + 6} width={width} height={14} fill="#cbd5e1" rx={2} />
              )}
              <text x={labelWidth + barAreaWidth + 6} y={y + 14} fontSize="11" fill={INK} style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>
                {formatTempo(r.uploadsPerWeek)}
                {formatNote && <tspan style={{ fontWeight: 400 }} fill={MUTED}>{` · ${formatNote}`}</tspan>}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: MUTED }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, background: ACCENT, borderRadius: 2 }} /> Shorts
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, background: '#cbd5e1', borderRadius: 2 }} /> Long-form
        </span>
      </div>
    </div>
  );
}

// Heatmap of cadence performance. 7 cols × N blocks. Cells filled by
// lift (green = positive, neutral = around 1, faint red = negative).
// Cells with no uploads render empty. Confidence shown by border style.
function CadenceHeatmap({ cadenceGaps }) {
  const { grid, liftGrid, confidenceGrid, labels } = cadenceGaps;
  if (!grid || !labels) return null;
  const days = labels.days || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const blocks = labels.blocks || [];
  const cellW = 86;
  const cellH = 38;
  const headerH = 22;
  const labelW = 100;
  const W = labelW + days.length * cellW + 8;
  const H = headerH + blocks.length * cellH + 24;

  // Lift→color. Positive lift uses the pink brand at varying opacity.
  // Negative uses muted gray. ~1.0 (no lift) renders very pale.
  function cellFill(lift) {
    if (lift == null) return '#f5f0df';
    if (lift >= 1.05) {
      const intensity = Math.min(1, (lift - 1) / 1.5);  // saturates at +150%
      return `rgba(236, 72, 153, ${0.18 + intensity * 0.6})`;
    }
    if (lift <= 0.85) {
      const intensity = Math.min(1, (1 - lift) / 0.7);
      return `rgba(120, 113, 108, ${0.15 + intensity * 0.35})`;
    }
    return '#f5f0df';
  }

  return (
    <div>
      <svg className="cd-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', maxWidth: 760 }}>
        {/* Day headers */}
        {days.map((d, i) => (
          <text key={d} x={labelW + i * cellW + cellW / 2} y={headerH - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill={MUTED} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{d}</text>
        ))}
        {/* Row labels + cells */}
        {blocks.map((block, b) => (
          <g key={block}>
            <text x={labelW - 8} y={headerH + b * cellH + cellH / 2 + 4} textAnchor="end" fontSize="11" fill={INK} fontWeight="600">{block}</text>
            {days.map((d, dIdx) => {
              const count = grid[dIdx]?.[b] ?? 0;
              const lift = liftGrid?.[dIdx]?.[b];
              const conf = confidenceGrid?.[dIdx]?.[b];
              const isDirectional = conf === 'directional';
              const x = labelW + dIdx * cellW;
              const y = headerH + b * cellH;
              const liftLabel = lift != null
                ? `${lift >= 1 ? '+' : ''}${Math.round((lift - 1) * 100)}%`
                : '';
              return (
                <g key={dIdx}>
                  <rect
                    x={x + 2} y={y + 2} width={cellW - 4} height={cellH - 4}
                    fill={cellFill(lift)}
                    stroke={isDirectional ? '#d9cfb1' : (lift != null && lift >= 1.15 ? ACCENT : '#e8e2d0')}
                    strokeWidth={isDirectional ? 1 : (lift != null && lift >= 1.15 ? 1.2 : 0.7)}
                    strokeDasharray={isDirectional ? '3 2' : 'none'}
                    rx={2}
                  />
                  {count > 0 && (
                    <>
                      <text x={x + cellW / 2} y={y + cellH / 2 - 2} textAnchor="middle" fontSize="11" fontWeight="700" fill={INK}>
                        {liftLabel || `${count}`}
                      </text>
                      <text x={x + cellW / 2} y={y + cellH / 2 + 11} textAnchor="middle" fontSize="9" fill={MUTED}>
                        n={count}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        ))}
        {/* Legend */}
        <g transform={`translate(${labelW}, ${headerH + blocks.length * cellH + 8})`}>
          <rect x={0} y={0} width={14} height={10} fill="rgba(236, 72, 153, 0.7)" rx={2} />
          <text x={20} y={9} fontSize="10" fill={MUTED}>+lift (statistical)</text>
          <rect x={150} y={0} width={14} height={10} fill="rgba(236, 72, 153, 0.4)" stroke="#d9cfb1" strokeDasharray="3 2" rx={2} />
          <text x={170} y={9} fontSize="10" fill={MUTED}>directional</text>
          <rect x={290} y={0} width={14} height={10} fill="rgba(120, 113, 108, 0.4)" rx={2} />
          <text x={310} y={9} fontSize="10" fill={MUTED}>under-performing</text>
        </g>
      </svg>
      {cadenceGaps.total != null && (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
          {cadenceGaps.total} uploads in window · Mountain Time · Lift vs cohort median
        </div>
      )}
    </div>
  );
}

// Small horizontal stacked bar showing cohort production tier distribution.
function ProductionTierBar({ rollup }) {
  const total = Object.values(rollup).reduce((s, n) => s + n, 0);
  if (total === 0) return null;
  const order = ['high', 'medium', 'mixed', 'low'];
  const tierColor = { high: ACCENT, medium: '#a78bfa', mixed: '#fbbf24', low: '#9ca3af' };
  return (
    <div>
      <div style={{ display: 'flex', width: '100%', height: 20, borderRadius: 4, overflow: 'hidden', border: '1px solid #e8e2d0' }}>
        {order.map(t => {
          const n = rollup[t];
          if (!n) return null;
          const pct = (n / total) * 100;
          return (
            <div key={t} title={`${t}: ${n}`} style={{ width: `${pct}%`, background: tierColor[t], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {pct >= 12 ? `${t} ${n}` : n}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        {order.map(t => rollup[t] > 0 && (
          <span key={t} style={{ fontSize: 11, color: INK, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, background: tierColor[t], borderRadius: 2, display: 'inline-block' }} />
            <span style={{ textTransform: 'capitalize' }}>{t}</span>
            <span style={{ color: MUTED }}>{rollup[t]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Part 02 sub-sections (positioning)
// ──────────────────────────────────────────────────

function PartTwoContent({ spine, hosts = [], legacyRubric, rationales = {} }) {
  // Hosts to render — prefer the multi-host list. Fall back to a synthetic
  // single-host shape from the legacy spine.host_archetype + legacyRubric
  // if no multi-host rows exist yet.
  const hostsToRender = hosts.length > 0
    ? hosts
    : (spine?.host_archetype || legacyRubric)
      ? [{ id: 'legacy', name: null, archetype: spine?.host_archetype || null, series_label: null, voice_tone_refinement: null, rubric: legacyRubric }]
      : [];

  const hasAnyPositioning =
    spine?.positioning_oneliner
    || spine?.editorial_pov
    || spine?.voice_tone
    || hostsToRender.length > 0;

  return (
    <section className="cd-page">
      {spine?.editorial_pov && (
        <SubSection title="Editorial POV + mission" kicker="What this channel believes" path="positioning.editorial_pov">
          {rationales.whys?.editorial_pov && <EvidenceLead path="positioning.editorial_pov.why">{rationales.whys.editorial_pov}</EvidenceLead>}
          <E tag="p" className="cd-recommendation" path="positioning.editorial_pov.body">{spine.editorial_pov}</E>
          <InPractice path="positioning.editorial_pov.in_practice">
            {rationales.inPractice?.editorial_pov || <>Every script and brief is tested against this POV — if a video doesn't argue or stand for something in this frame, it doesn't ship.</>}
          </InPractice>
        </SubSection>
      )}

      {spine?.voice_tone && (
        <SubSection title="Voice + tone" kicker="How this channel sounds" path="positioning.voice_tone">
          {rationales.whys?.voice_tone && <EvidenceLead path="positioning.voice_tone.why">{rationales.whys.voice_tone}</EvidenceLead>}
          <E tag="p" className="cd-recommendation" path="positioning.voice_tone.body">{spine.voice_tone}</E>
          <InPractice path="positioning.voice_tone.in_practice">
            {rationales.inPractice?.voice_tone || <>This is the style sheet talent reads before takes and producers reference during edits — generated copy and scripts match this register or get rejected.</>}
          </InPractice>
        </SubSection>
      )}

      {hostsToRender.length > 0 && (
        <SubSection
          title={hostsToRender.length === 1 ? 'Host' : `Hosts (${hostsToRender.length})`}
          kicker={hostsToRender.length === 1 ? 'Who is on screen' : 'Series-specific on-camera personas'}
          path="positioning.host"
        >
          {rationales.whys?.host_archetype && <EvidenceLead path="positioning.host.why">{rationales.whys.host_archetype}</EvidenceLead>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {hostsToRender.map((h, i) => (
              <HostBlock key={h.id || i} host={h} />
            ))}
          </div>
          <InPractice path="positioning.host.in_practice">
            {rationales.inPractice?.host_archetype || (hostsToRender.length === 1
              ? <>Auditions score candidates against the rubric tied to this archetype. Producers brief on-camera takes against the archetype's specifics.</>
              : <>Each series casts and briefs against its own host rubric. Producers don't move talent between series without re-auditioning against the target archetype.</>)}
          </InPractice>
        </SubSection>
      )}

      {spine?.guardrails && (
        <SubSection title="What this isn't" kicker="Explicit anti-stances" path="positioning.guardrails">
          {rationales.whys?.guardrails && <EvidenceLead path="positioning.guardrails.why">{rationales.whys.guardrails}</EvidenceLead>}
          <E className="cd-guardrails" path="positioning.guardrails.body">{spine.guardrails}</E>
          <InPractice path="positioning.guardrails.in_practice">
            {rationales.inPractice?.guardrails || <>AI generations, producer briefs, and content pitches explicitly exclude these stances. A pitch that drifts into them gets pulled before production.</>}
          </InPractice>
        </SubSection>
      )}

      {!hasAnyPositioning && (
        <div style={{ color: MUTED, fontStyle: 'italic', padding: 40, textAlign: 'center' }}>
          No positioning fields authored yet. Open the Strategy Spine to add them.
        </div>
      )}
    </section>
  );
}

// One host block inside Part 02's "Hosts" subsection. Renders the host's
// archetype + series label + voice refinement + (when available) the
// host's audition rubric criteria. The printable scorecard for each
// host lives in the spine UI; this block is the document's read-only
// summary of what that scorecard scores against.
function HostBlock({ host }) {
  const label = host.name || host.series_label || host.archetype || 'Host';
  // Path prefix per host so each host's overrides are keyed independently.
  // Hosts without a stable id (legacy seeded rows) fall back to their
  // series label or array position — less durable but unblocks editing
  // for those rows.
  const pp = host.id ? `host.${host.id}` : null;
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: '14px 16px', background: '#fdfcf8' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <E style={{ fontSize: 16, fontWeight: 700, color: INK }} path={pp ? `${pp}.name` : undefined}>{label}</E>
        {host.series_label && host.series_label !== label && (
          <E style={{ fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: 0.8 }} path={pp ? `${pp}.series_label` : undefined}>
            {host.series_label}
          </E>
        )}
      </div>
      {host.archetype && (
        <div style={{ fontSize: 13, color: INK, marginBottom: host.voice_tone_refinement ? 6 : 0 }}>
          <strong style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginRight: 6 }}>Archetype</strong>
          <E tag="span" path={pp ? `${pp}.archetype` : undefined}>{host.archetype}</E>
        </div>
      )}
      {host.voice_tone_refinement && (
        <div style={{ fontSize: 13, color: INK, marginBottom: host.notes ? 6 : 0 }}>
          <strong style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginRight: 6 }}>Voice refinement</strong>
          <E tag="span" path={pp ? `${pp}.voice_refinement` : undefined}>{host.voice_tone_refinement}</E>
        </div>
      )}
      {host.notes && (
        <E style={{ fontSize: 12, color: MUTED, fontStyle: 'italic', marginTop: 4 }} path={pp ? `${pp}.notes` : undefined}>
          {host.notes}
        </E>
      )}

      {host.rubric?.criteria?.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${BORDER}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Audition rubric · {host.rubric.criteria.length} criteria
          </div>
          {host.rubric.intro_note && (
            <E className="cd-quote" style={{ marginBottom: 8 }} path={pp ? `${pp}.rubric.intro_note` : undefined}>{host.rubric.intro_note}</E>
          )}
          <ol className="cd-list cd-list-numbered" style={{ marginTop: 6 }}>
            {host.rubric.criteria.map((c, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <E tag="strong" path={pp ? `${pp}.rubric.criteria.${i}.name` : undefined}>{c.name}</E>{' '}
                <span style={{ color: MUTED, fontSize: 12 }}>· {c.weight || 'medium'} weight</span>
                {c.what_excellence_looks_like && (
                  <div style={{ marginTop: 3, fontSize: 13 }}><em>5/5:</em> <E tag="span" path={pp ? `${pp}.rubric.criteria.${i}.excellence` : undefined}>{c.what_excellence_looks_like}</E></div>
                )}
                {c.disqualifier && (
                  <div style={{ marginTop: 3, fontSize: 13 }}><em style={{ color: '#b91c1c' }}>Disqualifier:</em> <E tag="span" path={pp ? `${pp}.rubric.criteria.${i}.disqualifier` : undefined}>{c.disqualifier}</E></div>
                )}
              </li>
            ))}
          </ol>
          <p style={{ marginTop: 8, fontSize: 11, color: MUTED, fontStyle: 'italic' }}>
            The printable scorecard with 1–5 scoring rows for each criterion lives in the Strategy Spine view. Print it separately to use during this host's auditions.
          </p>
        </div>
      )}
    </div>
  );
}

// SoWhat — the strategic-implication closer at the bottom of each
// Part 01 data section. Mirrors the consulting-deck habit of turning
// "here's the data" into "here's what it means for our approach." Not
// the same as Part 02's InPractice (which is operational what-to-do);
// SoWhat is data-level strategic reading.
function SoWhat({ children }) {
  if (!children) return null;
  return (
    <div className="cd-sowhat">
      <div className="cd-sowhat-tag">So what</div>
      <E className="cd-sowhat-body">{children}</E>
    </div>
  );
}

// Per-section synthesis builders. All deterministic — read the
// section's data and apply a strategic frame. No LLM call. Each
// returns a React fragment, or null when the data is too thin for a
// confident read.
function soWhatCompetitiveLandscape(channels) {
  if (!channels?.length) return null;
  const sorted = [...channels].filter(c => c.viewVelocity != null).sort((a, b) => b.viewVelocity - a.viewVelocity);
  if (sorted.length < 3) return null;
  const top = sorted[0];
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!top.viewVelocity || !median.viewVelocity) return null;
  const multiplier = Math.round(top.viewVelocity / median.viewVelocity);
  if (multiplier >= 3) {
    return <>Cohort is led by <strong>{top.name}</strong> at roughly <strong>{multiplier}×</strong> the median view velocity. The math doesn't favor matching that volume — differentiation has to be vertical (positioning, voice, host), not horizontal (frequency, reach for reach's sake).</>;
  }
  return <>Cohort is broadly distributed — no single channel dominates by reach. Plenty of room to enter, but no single competitor to define against. Your <strong>positioning</strong> IS the differentiation, not your reach math.</>;
}

function soWhatProductionApproach(channels, productionSignalsByChannel) {
  const tiers = { high: 0, medium: 0, low: 0, mixed: 0 };
  const competitorSignals = (channels || [])
    .map(c => productionSignalsByChannel?.[c.id]?.signals)
    .filter(Boolean);
  for (const s of competitorSignals) {
    if (s.production_tier && tiers[s.production_tier] != null) tiers[s.production_tier]++;
  }
  const total = competitorSignals.length;
  if (total < 3) return null;
  const sortedTiers = Object.entries(tiers).sort(([, a], [, b]) => b - a);
  const dominant = sortedTiers[0][0];
  if (dominant === 'high') {
    return <>Cohort skews <strong>high-tier polish</strong> ({tiers.high}/{total} competitors). Outspending the field on production isn't a real lane — differentiate through <strong>aesthetic identity</strong> (a recognizable visual system) rather than raw production budget.</>;
  }
  if (dominant === 'medium') {
    return <>Cohort skews <strong>medium-tier polish</strong> ({tiers.medium}/{total} competitors). The bar is reachable. Match medium-tier production but invest in <strong>a sharper visual identity</strong> than the field — most channels here are competent but not distinctive.</>;
  }
  if (dominant === 'low') {
    return <>Cohort skews <strong>low-tier production</strong> ({tiers.low}/{total} competitors). Polish is an immediate differentiator if you can execute it — even moderate craft reads premium against this baseline.</>;
  }
  return <>Cohort is <strong>visually inconsistent</strong> ({tiers.mixed} mixed-tier channels). A coherent aesthetic system reads as professional by default — the bar for differentiation isn't height, it's consistency.</>;
}

function soWhatPerformancePatterns(patternsResult) {
  const patterns = (patternsResult?.scope?.titlePatterns || [])
    .filter(p => p.viewsLift != null && p.viewsLift > 0)
    .sort((a, b) => b.viewsLift - a.viewsLift);
  if (!patterns.length) return null;
  const statistical = patterns.filter(p => p.confidence === 'statistical' && p.viewsLift >= 15);
  if (statistical.length >= 2) {
    const top = statistical.slice(0, 3);
    return <>Multiple title patterns show statistical lift: {top.map((p, i) => (
      <span key={i}>{i > 0 ? ', ' : ''}<strong>{p.label}</strong> (+{Math.round(p.viewsLift)}%)</span>
    ))}. These compound — a title combining two or three of these patterns leverages each. Default titles toward this stack unless you're explicitly testing alternatives.</>;
  }
  if (statistical.length === 1) {
    const p = statistical[0];
    return <><strong>{p.label}</strong> shows statistical lift (+{Math.round(p.viewsLift)}%). Default titles toward this pattern unless you're explicitly testing alternatives — the rest of the patterns are noise or directional.</>;
  }
  return <>No title patterns clear the statistical threshold yet. Don't lock title strategy to small-sample patterns — pick one or two directional candidates to test, leave the rest alone until volume builds.</>;
}

function soWhatContentMix(formatBreakdown) {
  if (!formatBreakdown) return null;
  const shortsFreq = formatBreakdown.shortsFreq || 0;
  const longsFreq = 1 - shortsFreq;
  const shortsMedian = formatBreakdown.shortsMedianViews || 0;
  const longsMedian = formatBreakdown.longsMedianViews || 0;
  if (shortsFreq < 0.05 && longsFreq < 0.05) return null;

  // Find the best-performing long-form bucket
  const buckets = formatBreakdown.buckets || [];
  const bestBucket = [...buckets].sort((a, b) => (b.medianViews || 0) - (a.medianViews || 0))[0];

  const longBeatsShort = longsMedian > shortsMedian * 1.5;
  if (longBeatsShort && bestBucket) {
    return <>Cohort posts mostly Shorts ({Math.round(shortsFreq * 100)}%) but <strong>long-form earns {Math.round(longsMedian / shortsMedian)}× the views</strong> ({fmtNum(longsMedian)} vs {fmtNum(shortsMedian)} median). Specifically <strong>{bestBucket.label}</strong> videos at {fmtNum(bestBucket.medianViews)} median are the sweet spot. Use Shorts for volume + reach; long-form for retention + the bigger views.</>;
  }
  if (shortsFreq > 0.7) {
    return <>Cohort is <strong>{Math.round(shortsFreq * 100)}% Shorts</strong>. The category has chosen its format — don't try to invent a long-form-only strategy unless you're explicitly differentiating against the field. Mix Shorts heavily with selective long-form anchors.</>;
  }
  return <>Cohort posts <strong>{Math.round(shortsFreq * 100)}% Shorts and {Math.round(longsFreq * 100)}% long-form</strong>. Both formats earn meaningful views — running a balanced split matches the category baseline and gives you reach + retention.</>;
}

function soWhatUploadTempo(channels) {
  const rows = (channels || []).filter(c => c.uploadsPerWeek != null && c.uploadsPerWeek > 0);
  if (rows.length < 3) return null;
  const sorted = [...rows].sort((a, b) => b.uploadsPerWeek - a.uploadsPerWeek);
  const top = sorted[0];
  const median = sorted[Math.floor(sorted.length / 2)].uploadsPerWeek;
  const ratio = top.uploadsPerWeek / median;
  if (ratio >= 5) {
    return <><strong>{top.name}</strong> posts at {top.uploadsPerWeek.toFixed(1)}/wk — roughly <strong>{Math.round(ratio)}×</strong> the cohort median. Volume is a losing lane against that. Compete on <strong>depth or differentiation</strong> (sharper positioning, distinct voice, higher-craft individual videos), not frequency.</>;
  }
  if (median < 1.5) {
    return <>Cohort tempo is moderate at <strong>{median.toFixed(1)}/wk median</strong>. No one is dominating by frequency. A consistent <strong>2–3/wk cadence</strong> is enough to stay in the conversation — focus craft on each upload rather than chasing volume.</>;
  }
  return <>Cohort tempo varies widely from <strong>{top.uploadsPerWeek.toFixed(1)}/wk</strong> at the top to under <strong>1/wk</strong> at the bottom. Match the median (~{median.toFixed(1)}/wk) to stay in the conversation; chasing the top isn't realistic and isn't necessary to be in the field.</>;
}

function soWhatCategoryEngagement(channels) {
  const ranked = (channels || []).filter(c => typeof c.engagementRate === 'number').sort((a, b) => b.engagementRate - a.engagementRate);
  if (ranked.length < 4) return null;
  const top = ranked[0];
  const median = ranked[Math.floor(ranked.length / 2)];
  // Top engagement vs top view velocity — are they the same channel?
  const byVelocity = [...channels].filter(c => c.viewVelocity != null).sort((a, b) => b.viewVelocity - a.viewVelocity);
  const topReach = byVelocity[0];
  const engagementLeaderIsReachLeader = top.id && topReach.id && top.id === topReach.id;
  if (!engagementLeaderIsReachLeader && top.engagementRate && median.engagementRate) {
    const mult = (top.engagementRate / median.engagementRate).toFixed(1);
    return <><strong>{top.name}</strong> leads engagement at {(top.engagementRate * 100).toFixed(1)}% ({mult}× cohort median) — but doesn't lead on reach. Engagement and reach decouple in this category. Build the engagement layer first; reach compounds from it, not the other way around.</>;
  }
  return <>Engagement leaders ({(top.engagementRate * 100).toFixed(1)}% at the top) cluster around <strong>{(median.engagementRate * 100).toFixed(1)}% median</strong>. Match the cohort baseline to feel native; exceed it to feel beloved.</>;
}

// EvidenceLead — the data chain that ANCHORS each Part 02 recommendation.
// Sits ABOVE the spine field (not below it as a sidebar) so the reader
// sees the evidence before the conclusion. Computed deterministically
// from Part 01 findings — no LLM call.
function EvidenceLead({ children, path }) {
  return (
    <div className="cd-evidence">
      <E className="cd-evidence-tag" path={path ? `${path}.label` : undefined}>Why</E>
      <E className="cd-evidence-body" path={path ? `${path}.body` : undefined}>{children}</E>
    </div>
  );
}

// InPractice — the operational implication at the bottom of each Part 02
// field. Names what the strategist/team actually does with the
// recommendation. Closes the loop: why → what → how.
function InPractice({ children, path }) {
  return (
    <div className="cd-in-practice">
      <E className="cd-in-practice-tag" path={path ? `${path}.label` : undefined}>In practice</E>
      <E className="cd-in-practice-body" path={path ? `${path}.body` : undefined}>{children}</E>
    </div>
  );
}

// Build per-field rationales + operational implications from Part 01
// data. Each WHY cites specific cohort numbers; each IN-PRACTICE names
// a concrete editorial action anchored to evidence (not generic "every
// script tested against this" filler). Computed deterministically — no
// LLM call.
function buildRationales({ channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, clientProductionRow, demandRow }) {
  const out = { whys: {}, inPractice: {} };

  const competitorSignals = (channels || [])
    .map(c => productionSignalsByChannel?.[c.id]?.signals)
    .filter(Boolean);
  const tierRollup = { high: 0, medium: 0, low: 0, mixed: 0 };
  for (const s of competitorSignals) {
    if (s.production_tier && tierRollup[s.production_tier] != null) tierRollup[s.production_tier]++;
  }
  const totalTiered = Object.values(tierRollup).reduce((s, n) => s + n, 0);
  const dominantTier = totalTiered > 0
    ? Object.entries(tierRollup).sort(([, a], [, b]) => b - a)[0][0]
    : null;
  const cohortFaceDriven = competitorSignals.length
    ? Math.round(mean(competitorSignals.map(s => parseFloat(s.visual_treatment?.face_pct) || 0)))
    : null;
  const cohortHostVisible = competitorSignals.length
    ? Math.round(mean(competitorSignals.map(s => parseFloat(s.host_framing?.host_visible_pct) || 0)))
    : null;

  const topOpportunity = whiteSpaceResult?.brief?.opportunities?.[0];
  const topUnserved = demandRow?.signals?.unserved_requests?.[0];
  const topicSaturated = (whiteSpaceResult?.topicCoverage || []).filter(t => t.coverage === 'saturated');
  const topSaturated = topicSaturated[0] || null;

  const titlePatterns = patternsResult?.scope?.titlePatterns || [];
  const topPattern = titlePatterns
    .filter(p => p.viewsLift != null && p.confidence === 'statistical')
    .sort((a, b) => b.viewsLift - a.viewsLift)[0];
  const worstPattern = titlePatterns
    .filter(p => p.viewsLift != null && p.viewsLift < -30 && p.confidence === 'statistical')
    .sort((a, b) => a.viewsLift - b.viewsLift)[0];

  // ───── ONE-LINER ─────
  if (topOpportunity?.title) {
    out.whys.oneliner = <>The headline names the audit's strongest unclaimed slot — <strong>{topOpportunity.title}</strong>. The cohort isn't articulating this position; the one-liner claims it before they do.</>;
    out.inPractice.oneliner = <>This is the single sentence every pitch, every channel description, and every long-form intro tests against. If a script's premise can't be defended as a beat of this one-liner, it gets killed in pitch — not in edit.</>;
  } else if (topUnserved?.topic) {
    out.whys.oneliner = <>The headline answers the audience's most-repeated unserved ask — <strong>"{topUnserved.topic}"</strong>{topUnserved.mentions ? <> ({topUnserved.mentions} mentions in the demand window)</> : null}. Articulation matches a named appetite, not a guessed one.</>;
    out.inPractice.oneliner = <>This is the sentence every pitch tests against. A script that doesn't deliver against the unserved ask either gets reframed in pitch or doesn't ship.</>;
  }

  // ───── EDITORIAL POV + MISSION ─────
  // Lead with evidence: the saturated theme is the opposition, the gap
  // is the claimable position. Cite numbers. Drop narrator voice
  // ("frames why this POV is needed", "should make the connection
  // legible") completely.
  const povBits = [];
  if (topSaturated?.name && topSaturated.count) {
    povBits.push(<>The cohort crowds <strong>{topSaturated.name}</strong> ({topSaturated.count} titles) — that's the opposition this POV must explicitly reject.</>);
  }
  if (topOpportunity?.title) {
    povBits.push(<>The audit's strongest unclaimed slot — <strong>{topOpportunity.title}</strong> — is the position this POV claims.</>);
  } else if (topUnserved?.topic) {
    povBits.push(<>The audience keeps asking for <strong>"{topUnserved.topic}"</strong>{topUnserved.mentions ? <> ({topUnserved.mentions} mentions)</> : null}; no cohort channel answers it cleanly. This POV is the answer.</>);
  }
  if (povBits.length) {
    out.whys.editorial_pov = <>{povBits.map((b, i) => <span key={i}>{i > 0 ? ' ' : ''}{b}</span>)}</>;
    out.inPractice.editorial_pov = topSaturated?.name
      ? <>Every pitch is tested against the opposition: if a video reads like more <strong>{topSaturated.name}</strong> content, it doesn't ship. If it argues the POV without naming the opposition, it gets rewritten.</>
      : <>Every pitch is tested against this POV. A video that doesn't argue or stand for something in this frame doesn't ship — there's no "neutral information" tier on this channel.</>;
  }

  // ───── VOICE + TONE ─────
  if (dominantTier && totalTiered >= 3) {
    const tierCount = tierRollup[dominantTier];
    const counterMove = dominantTier === 'high'
      ? 'lean warmth or imperfection — polish stops differentiating when the cohort is already polished'
      : dominantTier === 'low'
        ? 'lean polish and design discipline — craft becomes the differentiator when the cohort defaults to raw'
        : 'lean a consistent, recognizable register — an instantly identifiable voice is the edge when the field is mixed';
    out.whys.voice_tone = <>The cohort skews <strong>{dominantTier}-tier production</strong> ({tierCount}/{totalTiered} competitors). To break the field, {counterMove}.</>;
    out.inPractice.voice_tone = <>Producers reject scripts that drift toward the cohort's <strong>{dominantTier}-tier</strong> default. Generated copy and AI-assist runs are checked against this register before they reach a script.</>;
  }

  // ───── HOST ARCHETYPE ─────
  if (cohortHostVisible != null && totalTiered >= 3) {
    if (cohortHostVisible < 30) {
      out.whys.host_archetype = <>The cohort runs <strong>host-light</strong> ({cohortHostVisible}% average host-on-screen). A recurring on-camera anchor is a structural break from the field.</>;
      out.inPractice.host_archetype = <>Casting holds out for the right person rather than backfilling fast. A host-light cohort means a wrong-fit host on this channel reads as the cohort's default — wasted differentiation.</>;
    } else if (cohortHostVisible > 70) {
      out.whys.host_archetype = <>The cohort runs <strong>host-heavy</strong> ({cohortHostVisible}% average host-on-screen). Generic on-camera presence won't differentiate — the archetype must be a distinct personality.</>;
      out.inPractice.host_archetype = <>Auditions score against the archetype's specifics, not "camera presence." A candidate who fits a generic host slot but not THIS archetype doesn't move forward.</>;
    } else if (cohortFaceDriven != null) {
      out.whys.host_archetype = <>The cohort is mixed on host presence ({cohortHostVisible}% on-screen, {cohortFaceDriven}% face-driven thumbnails). The archetype choice is a positioning lever — either direction is claimable.</>;
      out.inPractice.host_archetype = <>The archetype decision precedes the host-search, not after. Once chosen, talent briefs, audition rubrics, and thumbnail conventions all line up to it.</>;
    }
  }

  // ───── GUARDRAILS ─────
  if (worstPattern?.label) {
    out.whys.guardrails = <>The cohort data shows <strong>"{worstPattern.label}"</strong> titles under-perform by {Math.round(Math.abs(worstPattern.viewsLift))}% vs. median. Guardrails keep that pattern off the production schedule.</>;
    out.inPractice.guardrails = <>AI generations, producer briefs, and pitches explicitly exclude these patterns. Drift into them gets caught in pitch review — before storyboarding.</>;
  }

  return out;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function Footer() {
  return (
    <section className="cd-page cd-final">
      <div style={{ color: MUTED, fontSize: 11, marginTop: 60, textAlign: 'center' }}>
        {brand.footerNote || `Prepared by ${brand.studio || brand.name}`} · {new Date().getFullYear()}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

function topByVelocity(channels, n) {
  return [...(channels || [])]
    .sort((a, b) => (b.viewVelocity ?? 0) - (a.viewVelocity ?? 0))
    .slice(0, n);
}
function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
function fmtPct(v) {
  if (v == null) return '—';
  const pct = v > 1 ? v : v * 100;
  return `${Math.round(pct)}%`;
}
function fmtLift(lift, confidence) {
  if (lift == null) return '—';
  const sign = lift > 0 ? '+' : '';
  const suffix = confidence === 'directional' ? ' (directional)' : '';
  return `${sign}${Math.round(lift)}%${suffix}`;
}

// ──────────────────────────────────────────────────
// Styles — scoped to .cd-* via <style>
// ──────────────────────────────────────────────────

function PrintStyles() {
  return (
    <style>{`
      .cd-overlay {
        position: fixed; inset: 0; z-index: 1000;
        background: #0a0a0c;
        overflow: auto;
        padding: 0;
      }
      .cd-toolbar {
        position: sticky; top: 0; z-index: 10;
        display: flex; gap: 8px; justify-content: flex-end;
        padding: 14px 22px;
        background: rgba(10, 10, 12, 0.85);
        backdrop-filter: blur(6px);
        border-bottom: 1px solid #1a1a20;
      }
      .cd-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 7px 13px; border-radius: 6px;
        background: #18181c; color: #d4d4d8;
        border: 1px solid #232328; cursor: pointer;
        font-size: 12px; font-weight: 600; font-family: inherit;
      }
      .cd-btn:disabled { opacity: 0.5; cursor: wait; }
      .cd-btn-primary { background: #1e3a5f; color: #dbeafe; border-color: #2a4f7f; }
      .cd-btn-success { background: #14532d; color: #d1fae5; border-color: #166534; }

      /* Persistable edits — dashed underline in edit mode so the
         strategist can tell at a glance which clicks will SAVE vs.
         which are session-only. Non-persistable editables keep the
         default cd-editable highlight. */
      .cd-editable-persistable {
        text-decoration: underline dashed rgba(20, 83, 45, 0.5);
        text-underline-offset: 4px;
        text-decoration-thickness: 1.5px;
      }

      /* Mode dropdown — lets the strategist render below the
         auto-detected mode (e.g., generate "Audit & Landscape Report"
         even when positioning fields are authored). */
      .cd-mode-select {
        padding: 7px 10px; border-radius: 6px;
        background: #18181c; color: #d4d4d8;
        border: 1px solid #232328;
        font-size: 12px; font-weight: 600; font-family: inherit;
        cursor: pointer;
        margin-right: auto;  /* push everything else right */
      }
      .cd-mode-select:focus { outline: none; border-color: ${ACCENT}; }
      @media print { .cd-mode-select { display: none !important; } }
      .cd-spin { animation: cd-spin 1s linear infinite; }
      @keyframes cd-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

      /* Edit-mode banner — surfaces what's happening + the constraint */
      .cd-edit-banner {
        max-width: 840px; margin: 12px auto -12px;
        padding: 10px 16px;
        background: rgba(236, 72, 153, 0.12);
        border: 1px solid rgba(236, 72, 153, 0.35);
        border-radius: 6px;
        color: #fce7f3;
        font-size: 12px; line-height: 1.55;
      }
      .cd-edit-banner strong { color: #fbcfe8; }

      /* Editable affordance — subtle dashed outline on the editable
         elements when edit mode is on, brighter on hover/focus.
         Crucially: never appears in print (handled below). */
      .cd-editable {
        outline: 1px dashed rgba(236, 72, 153, 0.4);
        outline-offset: 2px;
        border-radius: 2px;
        cursor: text;
        transition: outline-color 0.15s;
      }
      .cd-editable:hover {
        outline-color: rgba(236, 72, 153, 0.75);
      }
      .cd-editable:focus {
        outline: 2px solid ${ACCENT};
        background: rgba(236, 72, 153, 0.04);
      }

      .cd-doc {
        max-width: 840px; margin: 32px auto 80px;
        font-family: ${FONT_STACK};
        color: ${INK};
        line-height: 1.55;
      }
      .cd-loading, .cd-error {
        padding: 80px 40px; text-align: center;
        background: #fff; border-radius: 8px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      }
      .cd-error { color: #b91c1c; }

      .cd-page {
        background: #ffffff;
        padding: 64px 72px;
        margin-bottom: 28px;
        border-radius: 6px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        position: relative;
      }

      /* Corner wordmark — subtle on-screen brand ornament in the
         bottom-right of every body page. Skipped on the cover (which
         has the full logo) and the callout interstitials. Hidden in
         print since the print footer already carries the logo. */
      ${brand.wordmarkUrl ? `
      .cd-page:not(.cd-cover):not(.cd-callout-page)::after {
        content: '';
        position: absolute;
        bottom: 18px;
        right: 18px;
        width: 110px;
        height: 26px;
        background: url('${brand.wordmarkUrl}') right center / contain no-repeat;
        opacity: 0.5;
        pointer-events: none;
      }
      /* Audit topsheet has a dark teal background — invert the
         wordmark filter so a black-ink mark reads as cream against
         the deep teal. */
      .cd-audit-topsheet::after {
        filter: invert(1) brightness(1.2);
        opacity: 0.5;
      }
      ` : ''}

      /* Cover */
      .cd-cover {
        background: ${SURFACE};
        text-align: left;
        min-height: 540px;
        display: flex; flex-direction: column; justify-content: center;
        padding: 96px 80px;
      }
      .cd-cover-logo {
        max-height: 44px; max-width: 240px; margin-bottom: 48px;
        object-fit: contain; object-position: left;
      }
      .cd-cover-wordmark {
        font-family: ${FONT_HEAD_STACK};
        font-size: 14px; font-weight: 900;
        color: ${INK}; text-transform: uppercase;
        letter-spacing: 3px; margin-bottom: 40px;
      }
      .cd-cover-label {
        font-family: ${FONT_HEAD_STACK};
        font-size: 11px; font-weight: 900;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 2px;
        margin-bottom: 28px;
        display: flex; align-items: center; gap: 10px;
      }
      .cd-cover-tag {
        font-family: ${FONT_HEAD_STACK};
        font-size: 9px; font-weight: 900;
        background: ${ACCENT_VIVID}; color: #fff;
        padding: 4px 9px; border-radius: 99px;
        letter-spacing: 1.2px;
      }
      .cd-cover-title {
        font-family: ${FONT_HEAD_STACK};
        font-size: 64px; font-weight: 900; color: ${INK};
        margin: 0 0 14px; letter-spacing: -0.5px; line-height: 1.0;
        text-transform: uppercase;
      }
      .cd-cover-date {
        font-size: 14px; color: ${MUTED}; margin-bottom: 64px;
        letter-spacing: 0.3px;
      }
      .cd-cover-oneliner {
        font-size: 22px; font-weight: 400; color: ${INK};
        line-height: 1.4; max-width: 600px;
        font-style: italic; padding-left: 18px;
        border-left: 3px solid ${ACCENT};
        margin-bottom: 96px;
      }
      .cd-cover-oneliner-mark {
        color: ${ACCENT}; font-weight: 700; font-style: normal;
      }
      /* Audit-basis stats — 3-up row on the cover (videos, channels,
         window). Numbers in Gotham Ultra so the rigor reads at a
         glance; small-cap labels in Gotham Book underneath. */
      .cd-cover-stats {
        margin-bottom: 32px;
        padding-top: 18px;
        border-top: 1px solid ${BORDER};
      }
      .cd-cover-stats-label {
        font-family: ${FONT_HEAD_STACK};
        font-size: 10px; font-weight: 900;
        color: ${MUTED}; text-transform: uppercase;
        letter-spacing: 2px; margin-bottom: 12px;
      }
      .cd-cover-stats-row {
        display: flex; gap: 40px;
        align-items: flex-start;
      }
      .cd-cover-stat-num {
        font-family: ${FONT_HEAD_STACK};
        font-size: 36px; font-weight: 900;
        color: ${ACCENT};
        line-height: 1; letter-spacing: 0;
        margin-bottom: 6px;
        font-variant-numeric: tabular-nums;
      }
      .cd-cover-stat-label {
        font-size: 11px; color: ${INK_SOFT};
        font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.8px;
      }
      .cd-cover-footer {
        font-family: ${FONT_HEAD_STACK};
        font-size: 11px; font-weight: 700; color: ${MUTED};
        text-transform: uppercase; letter-spacing: 1.4px;
      }

      /* Section callouts (01 / 02 cards) */
      .cd-callout-page {
        background: transparent; box-shadow: none; padding: 0;
        margin-bottom: 20px;
      }
      .cd-callout {
        background: ${SURFACE_DEEP};
        border-radius: 12px;
        padding: 48px 56px;
        position: relative;
      }
      .cd-callout-number {
        font-family: ${FONT_HEAD_STACK};
        font-size: 32px; font-weight: 900;
        color: ${ACCENT};
        line-height: 1; margin-bottom: 14px;
      }
      .cd-callout-title {
        font-family: ${FONT_HEAD_STACK};
        font-size: 32px; font-weight: 900; color: ${INK};
        text-transform: uppercase; letter-spacing: 0.3px;
        margin: 0 0 18px;
        line-height: 1.05;
      }
      .cd-callout-desc {
        font-size: 14px; color: ${INK}; line-height: 1.55;
        max-width: 580px;
      }

      /* Sub-sections within content pages */
      .cd-subsection {
        margin-bottom: 36px;
        padding-bottom: 28px;
        border-bottom: 1px solid ${BORDER};
      }
      .cd-subsection:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
      .cd-subsection-head {
        display: flex; align-items: flex-start; gap: 14px;
        margin-bottom: 14px;
      }
      .cd-copy-btn {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 5px 10px; border-radius: 5px;
        background: transparent; color: ${MUTED};
        border: 1px solid ${BORDER};
        font-size: 11px; font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: all 0.15s;
      }
      .cd-copy-btn:hover { color: ${ACCENT}; border-color: ${ACCENT}; }
      .cd-kicker {
        font-family: ${FONT_HEAD_STACK};
        font-size: 10px; font-weight: 900;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 1.8px; margin-bottom: 6px;
      }
      .cd-subtitle {
        font-family: ${FONT_HEAD_STACK};
        font-size: 26px; font-weight: 900; color: ${INK};
        margin: 0; letter-spacing: 0.5px;
        text-transform: uppercase;
        line-height: 1.1;
      }

      /* Audit top sheet — Step 22. Three groups of three findings +
         Next Steps. Matches the strategist's hand-drawn structure.
         Editorial pull-page treatment: deep teal background, cream
         text. Differentiates the strategic centerpiece from the
         analytical body pages. All text overrides scoped under
         .cd-audit-topsheet so other pages stay on the default
         cream-on-ink palette. */
      .cd-audit-topsheet {
        background: ${brand.colors.accent};
        padding: 56px 64px;
        color: ${brand.colors.background};
      }
      .cd-audit-topsheet .cd-synthesis-title,
      .cd-audit-topsheet .cd-topsheet-group-label,
      .cd-audit-topsheet .cd-topsheet-item-num,
      .cd-audit-topsheet .cd-topsheet-item-label,
      .cd-audit-topsheet .cd-topsheet-item-text,
      .cd-audit-topsheet .cd-audit-nextsteps-label,
      .cd-audit-topsheet .cd-audit-nextsteps-list,
      .cd-audit-topsheet .cd-audit-nextsteps-list li {
        color: ${brand.colors.background};
      }
      .cd-audit-topsheet .cd-synthesis-kicker {
        color: ${brand.colors.accentVivid || brand.colors.accentWarm};
      }
      .cd-audit-topsheet .cd-topsheet-group-label {
        border-bottom-color: rgba(255, 250, 241, 0.22);
      }
      .cd-audit-topsheet .cd-topsheet-item-num {
        opacity: 0.45;
      }
      .cd-audit-topsheet .cd-topsheet-item-label {
        color: ${brand.colors.accentWarm};
      }
      .cd-audit-topsheet .cd-topsheet-empty {
        color: rgba(255, 250, 241, 0.6);
      }
      .cd-audit-topsheet .cd-audit-divider {
        background: ${brand.colors.background};
        opacity: 0.25;
      }
      /* Copy button on dark needs an inverted treatment so it doesn't
         disappear into the teal. */
      .cd-audit-topsheet .cd-copy-btn {
        background: rgba(255, 250, 241, 0.08);
        color: ${brand.colors.background};
        border-color: rgba(255, 250, 241, 0.25);
      }
      .cd-audit-topsheet .cd-copy-btn:hover {
        background: rgba(255, 250, 241, 0.16);
        border-color: ${brand.colors.background};
        color: ${brand.colors.background};
      }
      .cd-topsheet-group {
        margin-bottom: 28px;
        break-inside: avoid;
      }
      .cd-topsheet-group:last-of-type { margin-bottom: 0; }
      .cd-topsheet-group-label {
        font-family: ${FONT_HEAD_STACK};
        font-size: 11px; font-weight: 900;
        text-transform: uppercase; letter-spacing: 2px;
        margin-bottom: 14px;
        padding-bottom: 8px;
        border-bottom: 1px solid ${BORDER};
      }
      .cd-topsheet-list {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 14px;
      }
      .cd-topsheet-item {
        display: flex; gap: 14px;
        break-inside: avoid;
      }
      .cd-topsheet-item-num {
        font-size: 16px; font-weight: 700;
        color: ${INK_SOFT};
        line-height: 1.4; min-width: 24px; flex-shrink: 0;
        font-variant-numeric: tabular-nums;
        opacity: 0.5;
      }
      .cd-topsheet-item-body { flex: 1; min-width: 0; }
      .cd-topsheet-item-label {
        font-size: 13px; font-weight: 700;
        color: ${INK_SOFT}; margin-bottom: 4px;
        letter-spacing: -0.1px;
      }
      .cd-topsheet-item-text {
        font-size: 14px; color: ${INK};
        line-height: 1.55;
      }
      .cd-topsheet-empty {
        font-size: 13px; color: ${INK_SOFT};
        line-height: 1.5; font-style: italic;
        padding: 6px 0 0 28px;
      }

      .cd-audit-divider {
        height: 1px; background: ${INK};
        margin: 32px 0 28px;
        opacity: 0.65;
      }
      .cd-audit-nextsteps {
        break-inside: avoid;
      }
      .cd-audit-nextsteps-label {
        font-family: ${FONT_HEAD_STACK};
        font-size: 12px; font-weight: 900;
        color: ${INK}; text-transform: uppercase;
        letter-spacing: 2px; margin-bottom: 14px;
      }
      .cd-audit-nextsteps-list {
        list-style: decimal; padding-left: 24px; margin: 0;
        font-size: 14px; line-height: 1.6; color: ${INK};
      }
      .cd-audit-nextsteps-list li { margin-bottom: 8px; }
      .cd-audit-nextsteps-list li:last-child { margin-bottom: 0; }

      @media print {
        .cd-audit-topsheet { break-after: page; padding: 0.7in 0.8in !important; }
        .cd-topsheet-group { break-inside: avoid; }
        .cd-topsheet-item { break-inside: avoid; }
        .cd-audit-nextsteps { break-inside: avoid; }
      }

      /* WhereWeAre — unified Learned / Decide / Do synthesis page.
         Three blocks staged across a temporal arc: warm surface for
         past (Learned), deeper warm surface for present (Decide),
         navy accent for future (Do). Same skeleton renders across
         all three modes; the Decide column compresses as decisions
         get resolved. */
      .cd-wherewe {
        background: ${brand.colors.background};
        padding: 56px 64px;
      }
      .cd-wherewe-block {
        margin-bottom: 24px;
        border-radius: 10px;
        padding: 24px 28px;
        break-inside: avoid;
      }
      .cd-wherewe-block:last-child { margin-bottom: 0; }
      .cd-wherewe-learned {
        background: ${SURFACE};
      }
      .cd-wherewe-decide {
        background: ${SURFACE_DEEP};
      }
      .cd-wherewe-do {
        background: ${ACCENT};
        color: #fff;
      }
      .cd-wherewe-block-head {
        display: flex; align-items: baseline; gap: 14px;
        margin-bottom: 18px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(0,0,0,0.08);
      }
      .cd-wherewe-do .cd-wherewe-block-head {
        border-bottom-color: rgba(255,255,255,0.18);
      }
      .cd-wherewe-block-num {
        font-size: 22px; font-weight: 800;
        color: ${ACCENT};
        line-height: 1; min-width: 32px;
        font-variant-numeric: tabular-nums;
      }
      .cd-wherewe-do .cd-wherewe-block-num { color: #fff; opacity: 0.7; }
      .cd-wherewe-block-label {
        font-size: 14px; font-weight: 800;
        color: ${INK}; text-transform: uppercase;
        letter-spacing: 1.4px;
        display: flex; align-items: baseline; gap: 12px;
      }
      .cd-wherewe-do .cd-wherewe-block-label { color: #fff; }
      .cd-wherewe-block-meta {
        font-size: 10px; font-weight: 700;
        letter-spacing: 1px; color: ${MUTED};
        text-transform: uppercase;
      }
      .cd-wherewe-list {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 18px;
      }
      .cd-wherewe-item {
        display: flex; gap: 16px;
        break-inside: avoid;
      }
      .cd-wherewe-item-num {
        font-size: 18px; font-weight: 700;
        color: ${INK_SOFT};
        line-height: 1.25; min-width: 32px; flex-shrink: 0;
        font-variant-numeric: tabular-nums;
        opacity: 0.45;
      }
      .cd-wherewe-item-body { flex: 1; min-width: 0; }
      .cd-wherewe-item-label {
        font-size: 10px; font-weight: 700;
        color: ${MUTED}; text-transform: uppercase;
        letter-spacing: 1.2px; margin-bottom: 4px;
      }
      .cd-wherewe-item-text {
        font-size: 16px; font-weight: 700;
        color: ${INK}; line-height: 1.4;
        margin-bottom: 8px;
      }
      .cd-wherewe-item-evidence {
        display: flex; gap: 10px; align-items: flex-start;
        font-size: 13px; color: ${MUTED};
        line-height: 1.55;
      }
      .cd-wherewe-evidence-tag {
        font-size: 9px; font-weight: 800;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 1.4px; padding-top: 3px;
        flex-shrink: 0; min-width: 50px;
      }

      /* Decisions — resolved vs open get distinct visual treatments */
      .cd-wherewe-decision-status {
        min-width: 28px; padding-top: 2px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .cd-wherewe-decision.is-resolved .cd-wherewe-decision-status {
        color: #16a34a;
      }
      .cd-wherewe-decision.is-open .cd-wherewe-decision-status {
        color: ${ACCENT};
      }
      .cd-wherewe-open-dot {
        display: inline-flex; align-items: center; justify-content: center;
        width: 18px; height: 18px; border-radius: 50%;
        background: ${ACCENT}; color: #fff;
        font-size: 11px; font-weight: 800;
      }
      .cd-wherewe-decision-resolved {
        font-size: 14px; color: ${INK}; line-height: 1.5;
        white-space: pre-wrap;
      }
      .cd-wherewe-decision-open {
        font-size: 16px; font-weight: 600;
        color: ${INK}; line-height: 1.4;
        font-style: italic;
        margin-bottom: 8px;
      }

      /* Do block — accent-tinted numbered action list */
      .cd-wherewe-do-list {
        margin: 0; padding-left: 22px;
        font-size: 13.5px; line-height: 1.55;
        color: #fff;
      }
      .cd-wherewe-do-list li { margin-bottom: 10px; }
      .cd-wherewe-do-list li:last-child { margin-bottom: 0; }
      .cd-wherewe-do-list li strong { color: #fff; font-weight: 700; }

      @media print {
        .cd-wherewe { break-after: page; padding: 0.7in 0.8in !important; }
        .cd-wherewe-block { break-inside: avoid; }
        .cd-wherewe-item { break-inside: avoid; }
      }

      /* Synthesis page — "Where this lands". Consulting-deck pattern:
         lead with outcome + three moves + evidence + anti-stance. */
      .cd-synthesis {
        background: ${SURFACE};
        padding: 56px 64px;
      }
      .cd-synthesis-head {
        display: flex; align-items: flex-start; justify-content: space-between; gap: 14px;
        margin-bottom: 24px;
      }
      .cd-synthesis-kicker {
        font-family: ${FONT_HEAD_STACK};
        font-size: 11px; font-weight: 900;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 2px; margin-bottom: 8px;
      }
      .cd-synthesis-title {
        font-family: ${FONT_HEAD_STACK};
        font-size: 36px; font-weight: 900;
        color: ${INK}; letter-spacing: 0;
        margin: 0; line-height: 1.05;
        text-transform: uppercase;
      }
      .cd-synthesis-oneliner {
        font-size: 22px; font-weight: 600;
        color: ${INK}; line-height: 1.4;
        font-style: italic;
        max-width: 620px;
        padding: 16px 0 24px;
        border-bottom: 1px solid ${BORDER};
        margin-bottom: 28px;
      }
      .cd-synthesis-oneliner-mark {
        color: ${ACCENT}; font-weight: 700; font-style: normal;
        margin: 0 4px;
      }
      .cd-synthesis-moves {
        list-style: none; padding: 0; margin: 0 0 28px;
        display: flex; flex-direction: column; gap: 22px;
      }
      .cd-synthesis-move {
        display: flex; gap: 18px;
        break-inside: avoid;
      }
      .cd-synthesis-move-num {
        font-size: 28px; font-weight: 800;
        color: ${ACCENT};
        line-height: 1; min-width: 48px; flex-shrink: 0;
        font-variant-numeric: tabular-nums;
      }
      .cd-synthesis-move-body { flex: 1; min-width: 0; }
      .cd-synthesis-move-label {
        font-size: 10px; font-weight: 700;
        color: ${MUTED}; text-transform: uppercase;
        letter-spacing: 1.2px; margin-bottom: 4px;
      }
      .cd-synthesis-move-text {
        font-size: 17px; font-weight: 700;
        color: ${INK}; line-height: 1.4;
        margin-bottom: 8px;
      }
      .cd-synthesis-move-evidence {
        display: flex; gap: 10px; align-items: flex-start;
        font-size: 13px; color: ${MUTED};
        line-height: 1.5;
      }
      .cd-synthesis-move-empty .cd-synthesis-move-num { color: ${MUTED}; opacity: 0.4; }
      .cd-synthesis-move-empty .cd-synthesis-move-label { color: ${MUTED}; }
      .cd-synthesis-move-missing {
        font-size: 13px; color: ${MUTED};
        line-height: 1.5;
        padding: 8px 12px;
        background: #f5f5f5;
        border-radius: 4px;
        border-left: 2px dashed ${MUTED};
      }
      .cd-synthesis-move-missing strong {
        color: ${INK}; display: block; margin-bottom: 2px;
      }
      .cd-synthesis-evidence-tag {
        font-size: 9px; font-weight: 800;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 1.4px; padding-top: 3px;
        flex-shrink: 0; min-width: 26px;
      }
      /* Next-move action under each synthesis move — concrete first step.
         Distinct from Why (evidence above) with a darker accent tag so
         the eye can scan the page as why → recommendation → action. */
      .cd-synthesis-move-next {
        display: flex; gap: 10px; align-items: flex-start;
        font-size: 13px; color: ${INK};
        line-height: 1.5; margin-top: 8px;
        padding-top: 8px;
        border-top: 1px dashed ${BORDER};
        font-weight: 500;
      }
      .cd-synthesis-next-tag {
        font-size: 9px; font-weight: 800;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 1.4px; padding-top: 3px;
        flex-shrink: 0; min-width: 26px;
      }

      .cd-synthesis-anti {
        margin-top: 28px; padding: 18px 22px;
        background: ${SURFACE_DEEP};
        border-radius: 6px;
      }
      .cd-synthesis-anti-label {
        font-size: 11px; font-weight: 800;
        color: ${INK}; text-transform: uppercase;
        letter-spacing: 1.6px; margin-bottom: 10px;
      }
      .cd-synthesis-anti-list {
        margin: 0; padding-left: 18px;
        font-size: 13px; line-height: 1.55;
      }
      .cd-synthesis-anti-list li { margin-bottom: 6px; }
      .cd-synthesis-anti-list li:last-child { margin-bottom: 0; }

      /* First 30 days footer — concrete operational starters. Stands out
         visually as an action band, accent-tinted, numbered. The reader
         leaves this page with a list of things they can schedule. */
      .cd-synthesis-first30 {
        margin-top: 24px; padding: 18px 22px;
        background: ${ACCENT};
        color: #fff;
        border-radius: 6px;
      }
      .cd-synthesis-first30-label {
        font-size: 11px; font-weight: 800;
        color: #fff; text-transform: uppercase;
        letter-spacing: 1.6px; margin-bottom: 10px;
        opacity: 0.85;
      }
      .cd-synthesis-first30-list {
        margin: 0; padding-left: 22px;
        font-size: 13.5px; line-height: 1.55;
        color: #fff;
      }
      .cd-synthesis-first30-list li { margin-bottom: 8px; }
      .cd-synthesis-first30-list li:last-child { margin-bottom: 0; }
      .cd-synthesis-first30-list li strong { color: #fff; font-weight: 700; }

      /* Pre-launch framing block — sits between the 01 callout and Part 01
         content for clients with no published video data */
      .cd-prelaunch {
        background: ${SURFACE_DEEP};
        padding: 40px 56px;
      }
      .cd-prelaunch-kicker {
        font-size: 10px; font-weight: 700;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 1.2px; margin-bottom: 10px;
      }
      .cd-prelaunch-title {
        font-size: 22px; font-weight: 700; color: ${INK};
        margin: 0 0 18px; letter-spacing: -0.3px; line-height: 1.3;
      }
      .cd-prelaunch-body p {
        margin: 0 0 12px; font-size: 14px; line-height: 1.6;
      }
      .cd-prelaunch-body p:last-child { margin-bottom: 0; }
      .cd-body {
        font-size: 14px; color: ${INK};
      }
      .cd-body p { margin: 0 0 10px; }
      .cd-body p:last-child { margin-bottom: 0; }
      .cd-headline {
        font-size: 17px; font-weight: 700;
        color: ${INK}; line-height: 1.4;
        margin-bottom: 12px;
      }

      .cd-list {
        margin: 0; padding-left: 22px;
      }
      .cd-list li { margin-bottom: 12px; line-height: 1.5; }
      .cd-list-numbered { list-style: decimal; }
      .cd-quote {
        font-style: italic; color: ${MUTED};
        margin-top: 4px;
        padding-left: 12px;
        border-left: 2px solid #d9cfb1;
      }

      .cd-movement-list {
        list-style: none; margin: 0; padding: 0;
      }
      .cd-movement-item {
        display: flex; align-items: flex-start; gap: 10px;
        margin-bottom: 12px;
      }
      .cd-movement-body { flex: 1; min-width: 0; line-height: 1.5; }
      .cd-channel-avatar {
        flex-shrink: 0;
        border-radius: 50%;
        background: #e8e2d0;
        color: ${INK};
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
        font-weight: 700;
        margin-top: 1px;
      }
      .cd-channel-avatar img {
        width: 100%; height: 100%; object-fit: cover;
      }
      .cd-format-tag {
        display: inline-block;
        margin-left: 8px;
        padding: 1px 7px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        vertical-align: middle;
      }

      .cd-table {
        width: 100%; border-collapse: collapse;
        font-size: 12px; margin-top: 8px;
      }
      .cd-table th, .cd-table td {
        text-align: left;
        padding: 7px 10px;
        border-bottom: 1px solid #e8e2d0;
      }
      .cd-table th {
        font-size: 10px; font-weight: 700;
        color: ${MUTED}; text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 2px solid #d9cfb1;
      }
      .cd-num { text-align: right; font-variant-numeric: tabular-nums; }

      .cd-callout-inline {
        background: ${SURFACE_DEEP};
        border-radius: 6px;
        padding: 14px 16px;
        margin-top: 12px;
        border-left: 3px solid ${ACCENT};
      }
      .cd-callout-inline-label {
        font-size: 10px; font-weight: 700;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 1px; margin-bottom: 6px;
      }

      /* Part 02 one-liner panel */
      .cd-oneliner-panel {
        background: ${SURFACE};
        border-radius: 8px;
        padding: 40px 48px;
        margin-bottom: 36px;
        display: flex; align-items: flex-start; gap: 18px;
      }
      .cd-oneliner-mark {
        font-size: 60px; line-height: 1;
        color: ${ACCENT}; font-weight: 800;
      }
      .cd-oneliner-text {
        font-size: 24px; font-weight: 600;
        color: ${INK}; line-height: 1.4;
      }

      .cd-guardrails {
        background: #fef2f2; border-left: 3px solid #b91c1c;
        padding: 14px 16px; border-radius: 4px;
        font-size: 13px; line-height: 1.55;
        white-space: pre-wrap;
      }

      /* EvidenceLead — sits ABOVE each Part 02 recommendation so the
         reader sees the data chain before the conclusion. Mirrors the
         consulting-deck pattern: lead with evidence, then the call. */
      .cd-evidence {
        display: flex; gap: 12px;
        margin-bottom: 14px;
        padding: 12px 14px;
        background: ${ACCENT_SOFT};
        border-radius: 6px;
        border-left: 3px solid ${ACCENT};
      }
      .cd-evidence-tag {
        font-family: ${FONT_ACCENT_STACK};
        font-size: 18px; font-weight: 400;
        color: ${ACCENT};
        letter-spacing: 0; padding-top: 0;
        line-height: 1; flex-shrink: 0; min-width: 42px;
        transform: rotate(-3deg);
        transform-origin: left center;
      }
      .cd-evidence-body {
        font-size: 13px; color: ${INK}; line-height: 1.55;
        flex: 1; min-width: 0;
      }

      /* The recommendation itself — the spine field content. Visually
         the centerpiece between evidence (above) and in-practice (below). */
      .cd-recommendation {
        font-size: 15px; line-height: 1.6;
        color: ${INK}; font-weight: 500;
        margin: 0 0 14px;
      }

      /* SoWhat — strategic-implication closer at the bottom of each
         Part 01 data section. Distinct from EvidenceLead (Part 02
         "Why"): SoWhat reads as a section's PAYOFF — surface-tone
         background, heavier left rule, bolder body, the data section's
         own strategic conclusion. EvidenceLead is the evidence chain
         supporting a positioning RECOMMENDATION, not the conclusion
         of a data section. The reader's eye learns the two layers
         this way: Part 01 SoWhat = warm tone, Part 02 EvidenceLead
         = cool tone (accent-soft). */
      .cd-sowhat {
        display: flex; gap: 12px;
        margin-top: 16px;
        padding: 14px 16px;
        background: ${SURFACE_DEEP};
        border-radius: 6px;
        border-left: 4px solid ${INK};
      }
      .cd-sowhat-tag {
        font-family: ${FONT_ACCENT_STACK};
        font-size: 28px; font-weight: 400;
        color: ${ACCENT_VIVID};
        letter-spacing: 0; padding-top: 0;
        line-height: 1; flex-shrink: 0; min-width: 100px;
        transform: rotate(-3deg);
        transform-origin: left center;
      }
      .cd-sowhat-body {
        font-size: 13.5px; color: ${INK}; line-height: 1.55;
        flex: 1; min-width: 0;
        font-weight: 500;
      }

      /* InPractice — operational implication at the bottom. Closes the
         loop from "why" through "what" to "how this gets used." */
      .cd-in-practice {
        display: flex; gap: 12px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px dashed ${BORDER};
      }
      .cd-in-practice-tag {
        font-family: ${FONT_ACCENT_STACK};
        font-size: 18px; font-weight: 400;
        color: ${ACCENT};
        letter-spacing: 0; padding-top: 0;
        line-height: 1; flex-shrink: 0; min-width: 92px;
        transform: rotate(-3deg);
        transform-origin: left center;
      }
      .cd-in-practice-body {
        font-size: 12px; color: ${MUTED}; line-height: 1.55;
        flex: 1; font-style: italic;
      }

      /* SVG chart container */
      .cd-chart {
        display: block;
        margin: 12px 0 4px;
      }

      .cd-final {
        padding: 40px 72px;
        background: ${SURFACE_DEEP};
      }

      /* Print-only footer — hidden on screen, fixed to bottom in print
         so the client name + date repeat on every printed page. */
      .cd-print-footer { display: none; }

      /* Paged-media page setup — Letter at 0.5in margin top/sides,
         0.7in bottom to leave room for the fixed footer. */
      /* Full-bleed: no paper margin so colored pages (cover cream,
         callout sage, audit-summary teal) fill the entire sheet edge-
         to-edge, matching the on-screen card appearance. Content inset
         comes from each .cd-page's own padding. */
      @page { size: letter; margin: 0; }

      /* Print rules — produce a clean, color-accurate, paginated PDF
         from the on-screen deliverable. The deliverable lives inside a
         nested .cd-overlay div (not a body child), so we keep the
         visibility-hidden + un-hide pattern, but reset html/body and
         flow the overlay naturally so layout doesn't introduce blank
         pages. */
      @media print {
        /* Preserve brand colors across every element — without this,
           Chrome strips colored backgrounds and the deliverable prints
           as black-on-white. */
        *, *::before, *::after {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* Reset the document to a clean print canvas. */
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          height: auto !important;
          overflow: visible !important;
          width: 100% !important;
        }

        /* Hide everything; reveal only the deliverable overlay. */
        body * { visibility: hidden !important; }
        .cd-overlay, .cd-overlay * { visibility: visible !important; }

        /* Flow the overlay as a normal block so its parents' layout
           doesn't create blank pages. */
        .cd-overlay {
          position: static !important;
          inset: auto !important;
          width: 100% !important;
          height: auto !important;
          overflow: visible !important;
          background: white !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        /* Strip all UI chrome and interactive controls. button is a
           blanket safety-net: nothing interactive should print. */
        .cd-toolbar,
        .cd-toolbar *,
        .cd-edit-banner,
        .cd-edit-banner *,
        .cd-copy-btn,
        .cd-mode-select,
        button {
          display: none !important;
        }

        .cd-doc {
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        /* Page boundaries — each .cd-page breaks to a new sheet and
           fills the full sheet (min-height 100vh) so colored-page
           backgrounds bleed edge-to-edge instead of floating in a
           white margin. box-sizing keeps padding inside the 100vh so
           the page doesn't overflow to a blank trailing sheet. */
        .cd-page {
          margin: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: 0.7in 0.75in !important;
          min-height: 100vh;
          box-sizing: border-box;
          page-break-after: always;
          break-after: page;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .cd-page:last-of-type {
          page-break-after: auto;
          break-after: auto;
        }

        .cd-callout-page { padding: 0 !important; min-height: 0 !important; }
        .cd-callout {
          border-radius: 0 !important;
          padding: 1.2in 0.9in !important;
          /* Fill the full sheet so the sage background bleeds edge-to-
             edge, matching the on-screen card. The callout is the only
             thing on its page, so 100vh is safe. */
          min-height: 100vh;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .cd-cover {
          min-height: 100vh;
          box-sizing: border-box;
          padding: 1.2in 1in !important;
        }

        /* Internal break protection for known compound blocks. */
        .cd-subsection,
        .cd-synthesis-move,
        .cd-wherewe-block,
        .cd-topsheet-group,
        .cd-audit-nextsteps,
        .cd-movement-item {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .cd-prelaunch {
          break-after: page;
          page-break-after: always;
        }
        .cd-synthesis {
          break-after: page;
          page-break-after: always;
          padding: 0.65in 0.7in !important;
        }

        /* Tables — repeat the header on continuation pages, never
           split a row across pages. Both were missing entirely. */
        .cd-table { page-break-inside: auto; }
        .cd-table thead { display: table-header-group !important; }
        .cd-table tbody { display: table-row-group !important; }
        .cd-table tr,
        .cd-table tfoot {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .cd-table caption {
          break-after: avoid;
          page-break-after: avoid;
        }

        /* Charts + SVGs — flow to the printable area; never split. */
        .cd-chart,
        svg,
        [class*="recharts"] {
          max-width: 100% !important;
          width: 100% !important;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        img {
          max-width: 100% !important;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        /* Headings: never orphan a heading on the prior page. */
        h1, h2, h3, h4 {
          break-after: avoid;
          page-break-after: avoid;
        }

        /* Long-string overflow guard — table cells and prose with
           long unbroken strings (URLs, channel names) shouldn't
           clip in print. */
        .cd-page, .cd-table td, .cd-table th {
          word-wrap: break-word;
          overflow-wrap: break-word;
        }

        /* Audit top sheet — must fit on a single printed page. Tighten
           padding + scale type down so 3 groups + Next Steps fit. */
        .cd-audit-topsheet {
          padding: 0.5in 0.6in !important;
          break-after: page;
          page-break-after: always;
        }
        .cd-audit-topsheet .cd-synthesis-title {
          font-size: 22px !important;
          margin: 0 0 14px 0 !important;
        }
        .cd-audit-topsheet .cd-synthesis-kicker {
          font-size: 10px !important;
          margin-bottom: 2px !important;
        }
        .cd-topsheet-group {
          margin-bottom: 12px !important;
        }
        .cd-topsheet-group-label {
          font-size: 11px !important;
          margin-bottom: 6px !important;
        }
        .cd-topsheet-item {
          margin-bottom: 6px !important;
        }
        .cd-topsheet-item-text {
          font-size: 12px !important;
          line-height: 1.4 !important;
        }
        .cd-topsheet-item-label {
          font-size: 11px !important;
          margin-bottom: 2px !important;
        }
        .cd-topsheet-empty {
          font-size: 11px !important;
        }
        .cd-audit-divider {
          margin: 14px 0 12px !important;
        }
        .cd-audit-nextsteps-label {
          font-size: 11px !important;
        }
        .cd-audit-nextsteps-list li {
          font-size: 12px !important;
          margin-bottom: 5px !important;
          line-height: 1.4 !important;
        }

        /* Edit-mode affordances disabled — the prose still prints
           with whatever the user typed, but no focus outlines or
           contentEditable backgrounds leak into the PDF. */
        .cd-editable {
          outline: none !important;
          background: transparent !important;
        }

        /* Corner wordmark prints too. Lift it above the fixed print
           footer (which sits at bottom 0.25in, bottom-left) so the
           bottom-right ornament doesn't collide with it. */
        .cd-page:not(.cd-cover):not(.cd-callout-page)::after {
          bottom: 0.55in;
          right: 0.4in;
          opacity: 0.45 !important;
        }

        /* Show the print-only footer on every page. position: fixed
           in print context repeats the element on each printed page
           in Chrome/Safari (the typical user environment). */
        .cd-print-footer {
          display: flex !important;
          position: fixed;
          bottom: 0.25in;
          left: 0.5in;
          right: 0.5in;
          font-family: ${FONT_HEAD_STACK};
          font-size: 9px;
          color: #555;
          border-top: 1px solid ${BORDER};
          padding-top: 5px;
          justify-content: space-between;
          align-items: center;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .cd-print-footer-left {
          display: flex; align-items: center; gap: 8px;
          font-weight: 700;
        }
        .cd-print-footer-right {
          font-weight: 700;
        }
        .cd-print-footer-logo {
          max-height: 14px; max-width: 70px;
          object-fit: contain; object-position: left;
        }
      }
    `}</style>
  );
}
