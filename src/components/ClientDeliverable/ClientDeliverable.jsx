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

import React, { useEffect, useState, useContext, createContext } from 'react';
import { Printer, X as XIcon, Loader, Download, Copy, Check, Edit3, RotateCcw } from 'lucide-react';
import { loadDeliverableData } from '../../services/clientDeliverableService.js';
import { generateAuditPack, downloadMarkdown } from '../../services/auditPackService.js';
import { brand } from '../../config/brand.js';

// Session-scoped edit mode. When on, certain prose elements become
// contentEditable. Edits live in the DOM and survive Print / Save-as-PDF
// / Copy actions; they're lost when the modal closes. No persistence —
// the spine and business context remain the source of truth.
const EditCtx = createContext(false);

// Editable wrapper. Renders a tag (default <div>) with contentEditable
// toggled by context. Safe to use anywhere prose lives — tables,
// charts, and numeric values stay out of this so data integrity isn't
// at the strategist's typing speed.
function E({ children, tag = 'div', className = '', style }) {
  const editMode = useContext(EditCtx);
  return React.createElement(
    tag,
    {
      className: `${className} ${editMode ? 'cd-editable' : ''}`.trim(),
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

export default function ClientDeliverable({ clientId, clientName, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // resetKey bumps when the strategist clicks Reset — re-mounts the
  // document so all contentEditable edits are wiped back to defaults.
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadDeliverableData(clientId)
      .then(r => {
        if (cancelled) return;
        if (!r.ok) setError(r.error || 'Failed to load');
        else setData(r);
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  const handleExportMarkdown = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const md = await generateAuditPack({ clientId, tiers: ['priority', 'tracked'], windowDays: 30 });
      const date = new Date().toISOString().split('T')[0];
      downloadMarkdown(md, `deliverable-${(clientName || 'client').replace(/\s+/g, '-').toLowerCase()}-${date}.md`);
    } catch (e) {
      console.error('[deliverable] export failed:', e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="cd-overlay" role="dialog" aria-modal="true">
      <PrintStyles />

      <div className="cd-toolbar">
        <button
          onClick={() => setEditMode(e => !e)}
          disabled={!data}
          className={`cd-btn ${editMode ? 'cd-btn-primary' : ''}`}
          title={editMode ? 'Exit edit mode' : 'Edit prose inline — edits print but do not save when you close'}
        >
          <Edit3 size={13} /> {editMode ? 'Editing — done' : 'Edit'}
        </button>
        {editMode && (
          <button onClick={() => setResetKey(k => k + 1)} disabled={!data} className="cd-btn" title="Reset all inline edits back to the auto-generated text">
            <RotateCcw size={13} /> Reset
          </button>
        )}
        <button onClick={() => window.print()} disabled={!data} className="cd-btn cd-btn-primary">
          <Printer size={13} /> Print / Save as PDF
        </button>
        <button onClick={handleExportMarkdown} disabled={!data || exporting} className="cd-btn">
          {exporting ? <Loader size={13} className="cd-spin" /> : <Download size={13} />}
          {exporting ? 'Generating…' : 'Markdown'}
        </button>
        <button onClick={onClose} className="cd-btn"><XIcon size={13} /> Close</button>
      </div>

      {editMode && data && (
        <div className="cd-edit-banner">
          <strong>Edit mode.</strong> Click any highlighted prose to edit. Changes print + copy with the document but won't save when you close — the spine remains the source of truth. Use <strong>Reset</strong> to revert all edits.
        </div>
      )}

      <EditCtx.Provider value={editMode}>
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
          {data && <DeliverablePages data={data} clientName={clientName} />}
        </div>
      </EditCtx.Provider>
    </div>
  );
}

function DeliverablePages({ data, clientName }) {
  const { clientChannel, spine, hosts, legacyRubric, demandRow, productionSignalsByChannel, clientProductionRow, channels, patternsResult, whiteSpaceResult, diagnostic, briefing, audienceSignals, formatMixByChannel } = data;
  const displayName = clientName || clientChannel?.name || 'Client';
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  // Pre-launch detection: client exists but no usable performance data
  // anywhere. Their channel either hasn't been synced yet OR they're
  // pre-publication. The deliverable reframes Part 01 to lean on the
  // competitive landscape rather than the client's own (empty) signals.
  const isPreLaunch = !audienceSignals && !clientProductionRow && !demandRow;

  return (
    <>
      <Cover
        clientName={displayName}
        dateStr={dateStr}
        oneliner={spine?.positioning_oneliner}
        isPreLaunch={isPreLaunch}
      />

      <SynthesisPage
        clientName={displayName}
        spine={spine}
        hosts={hosts}
        synthesisData={buildSynthesis({
          spine,
          hosts,
          channels,
          patternsResult,
          whiteSpaceResult,
          productionSignalsByChannel,
          demandRow,
        })}
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
        isPreLaunch={isPreLaunch}
      />

      <PartCallout number="02" title="Positioning Recommendation" description="The channel's one-line articulation, editorial POV and mission, voice and tone guardrails, and the host archetype definition that feeds directly into a talent audition rubric." />

      <PartTwoContent
        spine={spine}
        hosts={hosts || []}
        legacyRubric={legacyRubric}
        rationales={buildRationales({
          channels,
          patternsResult,
          whiteSpaceResult,
          productionSignalsByChannel,
          clientProductionRow,
          demandRow,
        })}
      />

      <Footer />
    </>
  );
}

// ──────────────────────────────────────────────────
// Cover + section callouts
// ──────────────────────────────────────────────────

function Cover({ clientName, dateStr, oneliner, isPreLaunch }) {
  return (
    <section className="cd-page cd-cover">
      {brand.logoUrl ? (
        <img src={brand.logoUrl} alt={brand.studio || brand.name} className="cd-cover-logo" />
      ) : (
        <div className="cd-cover-wordmark">{brand.studio || brand.name}</div>
      )}
      <div className="cd-cover-label">
        {brand.productLabel}
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
      <div className="cd-cover-footer">{brand.footerNote || `Prepared by ${brand.studio || brand.name}`}</div>
    </section>
  );
}

// Brief framing block that sits between the "01" callout and Part 01
// content when the client has no published video data. Sets reader
// expectations and replaces the "your channel" data we don't have.
function PreLaunchFraming({ clientName }) {
  return (
    <section className="cd-page cd-prelaunch">
      <div className="cd-prelaunch-kicker">Why this deliverable looks different</div>
      <h3 className="cd-prelaunch-title">{clientName} hasn't published yet — so we're reading the field, not the channel.</h3>
      <div className="cd-prelaunch-body">
        <p>
          When a channel has a year of uploads behind it, an audit reads the channel: what's worked, what's flatlined, where the audience is leaning. This deliverable can't do that yet — and shouldn't pretend to.
        </p>
        <p>
          Instead, the audit below describes the <strong>category</strong> {clientName} is entering: who occupies it today, how those channels post, what they look like, and where the field has open ground. The Positioning Recommendation that follows is calibrated against that landscape — so the channel can launch into a defined slot rather than discover one mid-flight.
        </p>
        <p>
          The performance-feedback layer (what your audience watches, what they comment on, what time slots win for your content specifically) will populate after the first 90 days of uploads. We'll regenerate this document then with the channel's own signal layered on top of the landscape.
        </p>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────
// Synthesis page — "Where this lands"
// ──────────────────────────────────────────────────
// Consulting-deck pattern: lead with outcome, back with evidence.
// Sits between cover and the "01" callout. One page synthesis that
// compresses the whole positioning recommendation into one-liner +
// three moves (positioning / voice / host) + the data anchor for each
// + the explicit anti-stance pulled from guardrails. A reader can stop
// after this page and still know the bet.
function SynthesisPage({ clientName, spine, hosts, synthesisData }) {
  const { moves, antiStance, oneliner, first30 = [] } = synthesisData;
  const synthRef = React.useRef(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!synthRef.current) return;
    try {
      await navigator.clipboard.writeText(synthRef.current.innerText.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* fallback: markdown export covers it */ }
  };

  // Render unless every slot is empty (no oneliner, no populated moves,
  // no anti-stance). Missing moves still render as visible placeholders
  // so the strategist sees the gap rather than a silently-shorter list.
  const hasAnyContent = oneliner || moves.some(m => !m.missing) || antiStance.length;
  if (!hasAnyContent) return null;

  return (
    <section className="cd-page cd-synthesis">
      <div className="cd-synthesis-head">
        <div>
          <div className="cd-synthesis-kicker">Where this lands</div>
          <h2 className="cd-synthesis-title">{clientName}'s play, in {moves.length} {moves.length === 1 ? 'move' : 'moves'}</h2>
        </div>
        <button onClick={handleCopy} className="cd-copy-btn" title="Copy the synthesis to clipboard">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div ref={synthRef}>
        {oneliner && (
          <div className="cd-synthesis-oneliner">
            <span className="cd-synthesis-oneliner-mark">“</span>
            {oneliner}
            <span className="cd-synthesis-oneliner-mark">”</span>
          </div>
        )}

        {moves.length > 0 && (
          <ol className="cd-synthesis-moves">
            {moves.map((m, i) => (
              <li className={`cd-synthesis-move${m.missing ? ' cd-synthesis-move-empty' : ''}`} key={i}>
                <div className="cd-synthesis-move-num">{String(i + 1).padStart(2, '0')}</div>
                <div className="cd-synthesis-move-body">
                  <div className="cd-synthesis-move-label">{m.label}</div>
                  {m.missing ? (
                    <div className="cd-synthesis-move-missing">
                      <strong>Not yet authored.</strong> {m.missingHint}
                    </div>
                  ) : (
                    <>
                      <E className="cd-synthesis-move-text">{m.text}</E>
                      {m.evidence && (
                        <div className="cd-synthesis-move-evidence">
                          <span className="cd-synthesis-evidence-tag">Why</span>
                          <E tag="span">{m.evidence}</E>
                        </div>
                      )}
                      {m.nextMove && (
                        <div className="cd-synthesis-move-next">
                          <span className="cd-synthesis-next-tag">Next</span>
                          <E tag="span">{m.nextMove}</E>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        {antiStance.length > 0 && (
          <div className="cd-synthesis-anti">
            <div className="cd-synthesis-anti-label">What this isn't</div>
            <ul className="cd-synthesis-anti-list">
              {antiStance.map((a, i) => <E key={i} tag="li">{a}</E>)}
            </ul>
          </div>
        )}

        {first30.length > 0 && (
          <div className="cd-synthesis-first30">
            <div className="cd-synthesis-first30-label">First 30 days</div>
            <ol className="cd-synthesis-first30-list">
              {first30.map((a, i) => <E key={i} tag="li">{a}</E>)}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

// Compute the synthesis content. Each move's evidence COMPOUNDS multiple
// Part 01 findings (not just one) so the page reads as evidence-led,
// not opinion-led. Each move also gets a concrete "next move" action so
// the deliverable closes the loop from "what is this channel?" to
// "what does the team do this week?"
function buildSynthesis({ spine, hosts, channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, demandRow }) {
  // Always emit all three move slots so missing fields render as
  // explicit "not yet authored" placeholders rather than silently
  // shuffling smaller moves into the lead position.
  const positioningText = compressForSynthesis(spine?.positioning_hypothesis) || spine?.positioning_oneliner;
  const voiceText = firstSentence(spine?.voice_tone);
  const primaryHost = (hosts || [])[0];
  const hostText = primaryHost?.archetype || spine?.host_archetype;
  const hostLabel = (hosts || []).length > 1 ? `Hosts (${hosts.length})` : 'Host';

  // Pre-compute the data slices each move's evidence pulls from.
  const ctx = computeSynthesisContext({ channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, demandRow });

  const moves = [
    {
      label: 'Positioning',
      missingHint: 'Author the positioning one-liner or positioning hypothesis on the Strategy Spine.',
      text: positioningText,
      evidence: composePositioningEvidence(ctx),
      nextMove: composePositioningAction(ctx, hosts),
    },
    {
      label: 'Voice',
      missingHint: 'Author the voice + tone field on the Strategy Spine.',
      text: voiceText,
      evidence: composeVoiceEvidence(ctx),
      nextMove: 'Compress this voice description into a 200-word style sheet — register, signature moves, pacing, what to avoid. Share with anyone writing scripts. Producers reference it on every edit; AI-generated copy gets rejected if it drifts from the register.',
    },
    {
      label: hostLabel,
      missingHint: 'Add a host profile on the Strategy Spine (or fill in host_archetype on the legacy field).',
      text: hostText,
      evidence: composeHostEvidence(ctx, hosts),
      nextMove: composeHostAction(hosts),
    },
  ].map(m => ({ ...m, missing: !m.text }));

  const antiStance = (spine?.guardrails || '')
    .split(/[\n\.]+/)
    .map(s => s.trim().replace(/^[-*•]\s*/, ''))
    .filter(s => s.length > 6)
    .slice(0, 4);

  const first30 = buildFirst30Days({ ctx, hosts, spine });

  return {
    oneliner: spine?.positioning_oneliner || null,
    moves,
    antiStance,
    first30,
  };
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

function composePositioningEvidence(ctx) {
  const parts = [];
  if (ctx.topOpportunity?.title) {
    parts.push(<>The cohort's biggest unclaimed opening is <strong>{ctx.topOpportunity.title}</strong></>);
  }
  if (ctx.topUnserved?.topic) {
    parts.push(<>audiences keep asking for <strong>{ctx.topUnserved.topic}</strong>{ctx.topUnserved.mentions ? ` (${ctx.topUnserved.mentions} mentions)` : ''} with no one in the cohort answering it cleanly</>);
  }
  if (ctx.velocityLeader && ctx.velocityMultiplier && ctx.velocityMultiplier >= 3) {
    parts.push(<>and <strong>{ctx.velocityLeader.name}</strong> dominates by reach (~{ctx.velocityMultiplier}× median view velocity), so volume isn't a viable lane</>);
  }
  if (!parts.length) return null;
  return <>{joinFragments(parts)}. <strong>Therefore:</strong> the positioning has to name an unclaimed slot, not describe the crowded center.</>;
}

function composePositioningAction(ctx, hosts) {
  if (ctx.topOpportunity?.title) {
    return <>Pilot the <strong>{ctx.topOpportunity.title}</strong> direction with 2–3 videos in the first month. Treat them as positioning probes — measure whether the audience returns, not just whether they show up.</>;
  }
  return 'Pick the single sharpest positioning angle from the audit\'s opportunity brief and pilot 2–3 videos against it. Treat them as positioning probes — measure return rate, not first-view counts.';
}

function composeVoiceEvidence(ctx) {
  const parts = [];
  if (ctx.dominantTier && ctx.totalTiered >= 3) {
    const counter = ctx.dominantTier === 'high'
      ? 'polish is table stakes — voice has to carry differentiation'
      : ctx.dominantTier === 'low'
        ? 'craft is rare — a consistent voice reads premium against the field'
        : 'voice is the differentiator the cohort hasn\'t locked in';
    parts.push(<>Cohort skews <strong>{ctx.dominantTier}-tier production</strong> ({ctx.dominantTierCount}/{ctx.totalTiered} competitors), so {counter}</>);
  }
  if (ctx.statisticalPatterns.length >= 2) {
    const top = ctx.statisticalPatterns[0];
    parts.push(<><strong>{top.label}</strong> titles win by +{Math.round(top.viewsLift)}%, showing the audience responds to personality-led framing</>);
  }
  if (!parts.length) return null;
  return <>{joinFragments(parts)}. <strong>Therefore:</strong> the voice has to be instantly identifiable across every script and edit — not a vibe, a locked-in register.</>;
}

function composeHostEvidence(ctx, hosts) {
  const parts = [];
  if (ctx.hostVisibilityAvg != null && ctx.totalTiered >= 3) {
    if (ctx.hostVisibilityAvg < 30) {
      parts.push(<>Cohort runs <strong>host-light</strong> ({ctx.hostVisibilityAvg}% average host visibility) — a recurring on-camera anchor is a structural break</>);
    } else if (ctx.hostVisibilityAvg > 70) {
      parts.push(<>Cohort is <strong>host-heavy</strong> ({ctx.hostVisibilityAvg}% average visibility) — the archetype must be a distinct personality, not "a person on camera"</>);
    } else {
      parts.push(<>Cohort is mixed on host presence ({ctx.hostVisibilityAvg}% visibility, {ctx.faceDrivenAvg}% face-driven thumbnails) — no settled convention to copy or break</>);
    }
  }
  if (hosts && hosts.length > 1) {
    parts.push(<>this channel runs <strong>{hosts.length} hosts</strong> across different series, so the rubric has to score each archetype distinctly</>);
  }
  if (!parts.length) return null;
  return <>{joinFragments(parts)}. <strong>Therefore:</strong> the host archetype isn't a casting preference — it's a structural decision that compounds every other recommendation.</>;
}

function composeHostAction(hosts) {
  const n = hosts?.length || 1;
  if (n > 1) {
    return <>Run the audition rubric for <strong>each of the {n} hosts</strong> against 3–5 candidates per role. Don't share talent across series — each archetype scores against its own rubric.</>;
  }
  return 'Run the audition rubric against 3–5 candidates in the next 30 days. The strongest match anchors the series; the runners-up become the bench for spin-off formats.';
}

function buildFirst30Days({ ctx, hosts, spine }) {
  const actions = [];

  if (ctx.topSlot) {
    actions.push(<>Schedule the first 3 uploads in <strong>{ctx.topSlot.slot}</strong> — the cohort's strongest statistical slot at +{ctx.topSlot.liftPct}% lift ({ctx.topSlot.count} reference uploads).</>);
  }

  if (ctx.statisticalPatterns.length >= 1) {
    const stack = ctx.statisticalPatterns.slice(0, 2).map(p => p.label).join(' + ');
    actions.push(<>Test the <strong>{stack}</strong> title pattern{ctx.statisticalPatterns.length > 1 ? ' stack' : ''} on the next 4 uploads — both clear statistical thresholds in the cohort.</>);
  }

  if (ctx.bestBucket && ctx.longBeatsShortBy && ctx.longBeatsShortBy >= 3) {
    actions.push(<>Produce one <strong>{ctx.bestBucket.label}</strong> anchor video — long-form's median in this length is roughly {ctx.longBeatsShortBy}× the Shorts median.</>);
  }

  if (hosts?.length > 0) {
    actions.push(<>Run the <strong>Talent audition rubric</strong> on 3–5 candidates {hosts.length > 1 ? `for each of the ${hosts.length} hosts` : 'against the host archetype'} this month.</>);
  } else if (spine?.host_archetype) {
    actions.push(<>Generate the <strong>Talent audition rubric</strong> from the Strategy Spine and start scoring on-camera candidates.</>);
  }

  if (ctx.topOpportunity?.title && actions.length < 5) {
    actions.push(<>Storyboard one pilot against the <strong>{ctx.topOpportunity.title}</strong> opportunity — the audit's strongest unclaimed direction.</>);
  }

  return actions.slice(0, 5);
}

// Tiny helper for joining a list of React fragments with " AND " between
// them and a sentence-ending period left to the caller.
function joinFragments(parts) {
  return parts.reduce((acc, p, i) => {
    if (i === 0) return [p];
    const sep = i === parts.length - 1 ? <> AND </> : <>, </>;
    return [...acc, sep, p];
  }, []);
}

// Strip leading boilerplate ("We position [client] as...") so the
// synthesis reads as a tight statement rather than a paragraph opener.
function compressForSynthesis(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const first = firstSentence(trimmed);
  if (!first) return null;
  return first.length <= 180 ? first : `${first.slice(0, 177)}…`;
}

function firstSentence(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const match = trimmed.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : trimmed.slice(0, 200);
}

// Rationale strings produced by buildRationales are React elements
// (with <strong> tags etc.). For the synthesis page we want a flat
// text string. Walk the element tree and concatenate text.
function extractEvidenceText(node) {
  if (node == null) return null;
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractEvidenceText).filter(Boolean).join('');
  if (node.props?.children) return extractEvidenceText(node.props.children);
  return null;
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

function SubSection({ title, kicker, children }) {
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
          {kicker && <div className="cd-kicker">{kicker}</div>}
          <h3 className="cd-subtitle">{title}</h3>
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

function PartOneContent({ briefing, diagnostic, channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, clientProductionRow, demandRow, audienceSignals, formatMixByChannel, isPreLaunch }) {
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
        <div style={{ width: `${shortsFreq * 100}%`, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {shortsFreq >= 0.15 ? `Shorts ${Math.round(shortsFreq * 100)}%` : ''}
        </div>
        <div style={{ width: `${longsFreq * 100}%`, background: '#cbd5e1', color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
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
  // Normalize to a per-channel object with weekly upload rate + shorts share.
  const rows = (channels || [])
    .filter(c => c.uploadsPerWeek != null && c.uploadsPerWeek > 0)
    .map(c => {
      const mix = formatMixByChannel?.[c.id];
      const total = mix?.total || 0;
      const shortsShare = total > 0 ? mix.shorts / total : null;
      return {
        id: c.id,
        name: c.name,
        uploadsPerWeek: c.uploadsPerWeek,
        shortsShare, // null when unknown
        formatKnown: total > 0,
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
        <SubSection title="Editorial POV + mission" kicker="What this channel believes">
          {rationales.editorial_pov && <EvidenceLead>{rationales.editorial_pov}</EvidenceLead>}
          <E tag="p" className="cd-recommendation">{spine.editorial_pov}</E>
          <InPractice>Every script and brief is tested against this POV — if a video doesn't argue or stand for something in this frame, it doesn't ship.</InPractice>
        </SubSection>
      )}

      {spine?.voice_tone && (
        <SubSection title="Voice + tone" kicker="How this channel sounds">
          {rationales.voice_tone && <EvidenceLead>{rationales.voice_tone}</EvidenceLead>}
          <E tag="p" className="cd-recommendation">{spine.voice_tone}</E>
          <InPractice>This is the style sheet talent reads before takes and producers reference during edits — generated copy and scripts match this register or get rejected.</InPractice>
        </SubSection>
      )}

      {hostsToRender.length > 0 && (
        <SubSection
          title={hostsToRender.length === 1 ? 'Host' : `Hosts (${hostsToRender.length})`}
          kicker={hostsToRender.length === 1 ? 'Who is on screen' : 'Series-specific on-camera personas'}
        >
          {rationales.host_archetype && <EvidenceLead>{rationales.host_archetype}</EvidenceLead>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {hostsToRender.map((h, i) => (
              <HostBlock key={h.id || i} host={h} />
            ))}
          </div>
          <InPractice>
            {hostsToRender.length === 1
              ? 'Auditions score candidates against the rubric tied to this archetype. Producers brief on-camera takes against the archetype\'s specifics.'
              : 'Each series casts and briefs against its own host rubric. Producers don\'t move talent between series without re-auditioning against the target archetype.'}
          </InPractice>
        </SubSection>
      )}

      {spine?.guardrails && (
        <SubSection title="What this isn't" kicker="Explicit anti-stances">
          {rationales.guardrails && <EvidenceLead>{rationales.guardrails}</EvidenceLead>}
          <E className="cd-guardrails">{spine.guardrails}</E>
          <InPractice>AI generations, producer briefs, and content pitches explicitly exclude these stances. A pitch that drifts into them gets pulled before production.</InPractice>
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
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: '14px 16px', background: '#fdfcf8' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{label}</div>
        {host.series_label && host.series_label !== label && (
          <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {host.series_label}
          </div>
        )}
      </div>
      {host.archetype && (
        <div style={{ fontSize: 13, color: INK, marginBottom: host.voice_tone_refinement ? 6 : 0 }}>
          <strong style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginRight: 6 }}>Archetype</strong>
          {host.archetype}
        </div>
      )}
      {host.voice_tone_refinement && (
        <div style={{ fontSize: 13, color: INK, marginBottom: host.notes ? 6 : 0 }}>
          <strong style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginRight: 6 }}>Voice refinement</strong>
          <span>{host.voice_tone_refinement}</span>
        </div>
      )}
      {host.notes && (
        <div style={{ fontSize: 12, color: MUTED, fontStyle: 'italic', marginTop: 4 }}>
          {host.notes}
        </div>
      )}

      {host.rubric?.criteria?.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${BORDER}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Audition rubric · {host.rubric.criteria.length} criteria
          </div>
          {host.rubric.intro_note && (
            <div className="cd-quote" style={{ marginBottom: 8 }}>{host.rubric.intro_note}</div>
          )}
          <ol className="cd-list cd-list-numbered" style={{ marginTop: 6 }}>
            {host.rubric.criteria.map((c, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <strong>{c.name}</strong>{' '}
                <span style={{ color: MUTED, fontSize: 12 }}>· {c.weight || 'medium'} weight</span>
                {c.what_excellence_looks_like && (
                  <div style={{ marginTop: 3, fontSize: 13 }}><em>5/5:</em> {c.what_excellence_looks_like}</div>
                )}
                {c.disqualifier && (
                  <div style={{ marginTop: 3, fontSize: 13 }}><em style={{ color: '#b91c1c' }}>Disqualifier:</em> {c.disqualifier}</div>
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
function EvidenceLead({ children }) {
  return (
    <div className="cd-evidence">
      <div className="cd-evidence-tag">Why</div>
      <E className="cd-evidence-body">{children}</E>
    </div>
  );
}

// InPractice — the operational implication at the bottom of each Part 02
// field. Names what the strategist/team actually does with the
// recommendation. Closes the loop: why → what → how.
function InPractice({ children }) {
  return (
    <div className="cd-in-practice">
      <div className="cd-in-practice-tag">In practice</div>
      <E className="cd-in-practice-body">{children}</E>
    </div>
  );
}

// Build per-field rationales from Part 01 data. Each returns a React
// fragment or string, or null when no evidence supports it. Sources are
// woven into the rationale text — no separate citation list to clutter
// the deliverable.
function buildRationales({ channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, clientProductionRow, demandRow }) {
  const out = {};

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

  const topPattern = (patternsResult?.scope?.titlePatterns || [])
    .filter(p => p.viewsLift != null)
    .sort((a, b) => b.viewsLift - a.viewsLift)[0];
  const worstPattern = (patternsResult?.scope?.titlePatterns || [])
    .filter(p => p.viewsLift != null && p.viewsLift < -30 && p.confidence === 'statistical')
    .sort((a, b) => a.viewsLift - b.viewsLift)[0];

  // One-liner: anchored to the white-space opportunity or an unserved request.
  if (topOpportunity?.title) {
    out.oneliner = <>The headline names the field's clearest opening — <strong>{topOpportunity.title}</strong> — so the channel's articulation matches an unclaimed slot rather than describing the crowded center.</>;
  } else if (topUnserved?.topic) {
    out.oneliner = <>The headline responds to the audience's most-repeated unserved ask — <strong>"{topUnserved.topic}"</strong> ({topUnserved.mentions || 'multiple'} mentions) — so it speaks to a known appetite, not a guessed one.</>;
  }

  // Editorial POV — anchored to the gap or unserved demand
  if (topUnserved?.topic) {
    out.editorial_pov = <>This POV exists because the audience keeps asking for <strong>{topUnserved.topic}</strong> and no one in the cohort is answering it cleanly. The mission statement should be readable as a direct response to that ask.</>;
  } else if (topOpportunity?.title) {
    out.editorial_pov = <>The cohort's biggest gap — <strong>{topOpportunity.title}</strong> — frames why this POV is needed. The mission should make that connection legible.</>;
  }

  // Voice + tone — anchored to cohort production tier and visual conventions
  if (dominantTier && totalTiered >= 3) {
    const tierCount = tierRollup[dominantTier];
    const counterMove = dominantTier === 'high'
      ? 'lean warmth or imperfection — the cohort is already polished, so polish stops differentiating'
      : dominantTier === 'low'
        ? 'lean polish and design discipline — the cohort defaults to raw, so craft becomes the differentiator'
        : 'lean a consistent, recognizable register — the cohort is mixed, so an instantly identifiable voice is the edge';
    out.voice_tone = <>The cohort skews <strong>{dominantTier}-tier production</strong> ({tierCount}/{totalTiered} competitors). To stand out, {counterMove}.</>;
  }

  // Host archetype — anchored to cohort host visibility
  if (cohortHostVisible != null && totalTiered >= 3) {
    if (cohortHostVisible < 30) {
      out.host_archetype = <>The cohort runs <strong>host-light</strong> ({cohortHostVisible}% average host visibility across competitors). Putting a recurring human anchor on screen is a structural break from the field.</>;
    } else if (cohortHostVisible > 70) {
      out.host_archetype = <>The cohort is <strong>host-heavy</strong> ({cohortHostVisible}% average host visibility). To differentiate, the host archetype must be a distinct personality — not just "a person on camera."</>;
    } else if (cohortFaceDriven != null) {
      out.host_archetype = <>The cohort is mixed on host presence ({cohortHostVisible}% visibility, {cohortFaceDriven}% face-driven thumbnails). The archetype choice should be deliberate — the cohort hasn't settled into one convention.</>;
    }
  }

  // Guardrails — anchored to patterns with negative lift or the audit's worst-performing slots
  if (worstPattern?.label) {
    out.guardrails = <>The cohort data shows <strong>"{worstPattern.label}"</strong> titles under-perform by {Math.round(Math.abs(worstPattern.viewsLift))}% vs. median. Guardrails should keep that pattern off the production schedule.</>;
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
      }

      /* Cover */
      .cd-cover {
        background: ${SURFACE};
        text-align: left;
        min-height: 540px;
        display: flex; flex-direction: column; justify-content: center;
        padding: 96px 80px;
      }
      .cd-cover-logo {
        max-height: 36px; max-width: 200px; margin-bottom: 32px;
        object-fit: contain; object-position: left;
      }
      .cd-cover-wordmark {
        font-size: 13px; font-weight: 800;
        color: ${INK}; text-transform: uppercase;
        letter-spacing: 2px; margin-bottom: 32px;
      }
      .cd-cover-label {
        font-size: 11px; font-weight: 700;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 1.2px;
        margin-bottom: 24px;
        display: flex; align-items: center; gap: 10px;
      }
      .cd-cover-tag {
        font-size: 9px; font-weight: 700;
        background: ${ACCENT}; color: #fff;
        padding: 3px 8px; border-radius: 99px;
        letter-spacing: 0.8px;
      }
      .cd-cover-title {
        font-size: 56px; font-weight: 800; color: ${INK};
        margin: 0 0 12px; letter-spacing: -1.5px; line-height: 1.05;
      }
      .cd-cover-date {
        font-size: 14px; color: ${MUTED}; margin-bottom: 64px;
      }
      .cd-cover-oneliner {
        font-size: 22px; font-weight: 500; color: ${INK};
        line-height: 1.4; max-width: 580px;
        font-style: italic; padding-left: 18px;
        border-left: 3px solid ${ACCENT};
        margin-bottom: 96px;
      }
      .cd-cover-oneliner-mark {
        color: ${ACCENT}; font-weight: 700; font-style: normal;
      }
      .cd-cover-footer {
        font-size: 11px; color: ${MUTED};
        text-transform: uppercase; letter-spacing: 1px;
      }

      /* Section callouts (01 / 02 cards) */
      .cd-callout-page {
        background: transparent; box-shadow: none; padding: 0;
        margin-bottom: 20px;
      }
      .cd-callout {
        background: ${SURFACE};
        border-radius: 12px;
        padding: 48px 56px;
        position: relative;
      }
      .cd-callout-number {
        font-size: 28px; font-weight: 800;
        color: ${ACCENT};
        line-height: 1; margin-bottom: 14px;
      }
      .cd-callout-title {
        font-size: 28px; font-weight: 800; color: ${INK};
        text-transform: uppercase; letter-spacing: -0.3px;
        margin: 0 0 18px;
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
        font-size: 10px; font-weight: 700;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 1.2px; margin-bottom: 6px;
      }
      .cd-subtitle {
        font-size: 22px; font-weight: 700; color: ${INK_SOFT};
        margin: 0; letter-spacing: -0.3px;
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
        font-size: 11px; font-weight: 700;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 1.4px; margin-bottom: 8px;
      }
      .cd-synthesis-title {
        font-size: 32px; font-weight: 800;
        color: ${INK}; letter-spacing: -0.8px;
        margin: 0; line-height: 1.15;
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
        font-size: 10px; font-weight: 800;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 1.4px; padding-top: 3px;
        flex-shrink: 0; min-width: 28px;
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
         Part 01 data section. Reads the data, names the move. Distinct
         visual treatment from InPractice (Part 02) — accent-bordered
         box rather than dashed-top footer, because SoWhat is the
         section's payoff, not its operational footnote. */
      .cd-sowhat {
        display: flex; gap: 12px;
        margin-top: 16px;
        padding: 12px 14px;
        background: ${ACCENT_SOFT};
        border-radius: 6px;
        border-left: 3px solid ${ACCENT};
      }
      .cd-sowhat-tag {
        font-size: 10px; font-weight: 800;
        color: ${ACCENT}; text-transform: uppercase;
        letter-spacing: 1.4px; padding-top: 3px;
        flex-shrink: 0; min-width: 56px;
      }
      .cd-sowhat-body {
        font-size: 13px; color: ${INK}; line-height: 1.55;
        flex: 1; min-width: 0;
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
        font-size: 10px; font-weight: 800;
        color: ${MUTED}; text-transform: uppercase;
        letter-spacing: 1.4px; padding-top: 2px;
        flex-shrink: 0; min-width: 80px;
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
        background: ${SURFACE};
      }

      /* Print rules — hide app chrome, output only the deliverable pages */
      @media print {
        body * { visibility: hidden !important; }
        .cd-overlay, .cd-overlay * { visibility: visible !important; }
        .cd-overlay {
          position: absolute; inset: 0; background: white;
          padding: 0; margin: 0;
        }
        .cd-toolbar { display: none !important; }
        .cd-doc { max-width: none !important; margin: 0 !important; }
        .cd-page {
          margin: 0 !important; border-radius: 0 !important;
          box-shadow: none !important;
          page-break-after: always;
          break-after: page;
          padding: 0.7in 0.8in !important;
        }
        .cd-callout-page { padding: 0 !important; }
        .cd-callout { border-radius: 0; padding: 0.7in 0.8in !important; min-height: 4in; }
        .cd-cover { min-height: 9in; padding: 1.2in 1in !important; }
        .cd-subsection { break-inside: avoid; }
        .cd-copy-btn { display: none !important; }
        .cd-prelaunch { break-after: page; }
        .cd-synthesis { break-after: page; padding: 0.7in 0.8in !important; }
        .cd-synthesis-move { break-inside: avoid; }
        .cd-edit-banner { display: none !important; }
        .cd-editable { outline: none !important; background: transparent !important; }
      }
    `}</style>
  );
}
