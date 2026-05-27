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

import React, { useEffect, useState } from 'react';
import { Printer, X as XIcon, Loader, Download, Copy, Check } from 'lucide-react';
import { loadDeliverableData } from '../../services/clientDeliverableService.js';
import { generateAuditPack, downloadMarkdown } from '../../services/auditPackService.js';
import { brand } from '../../config/brand.js';

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
        <button onClick={() => window.print()} disabled={!data} className="cd-btn cd-btn-primary">
          <Printer size={13} /> Print / Save as PDF
        </button>
        <button onClick={handleExportMarkdown} disabled={!data || exporting} className="cd-btn">
          {exporting ? <Loader size={13} className="cd-spin" /> : <Download size={13} />}
          {exporting ? 'Generating…' : 'Markdown'}
        </button>
        <button onClick={onClose} className="cd-btn"><XIcon size={13} /> Close</button>
      </div>

      <div className="cd-doc">
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
    </div>
  );
}

function DeliverablePages({ data, clientName }) {
  const { clientChannel, spine, hosts, legacyRubric, demandRow, productionSignalsByChannel, clientProductionRow, channels, patternsResult, whiteSpaceResult, diagnostic, briefing, audienceSignals } = data;
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
          {oneliner}
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
  const { moves, antiStance, oneliner } = synthesisData;
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

  if (!oneliner && !moves.length && !antiStance.length) return null;

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
              <li className="cd-synthesis-move" key={i}>
                <div className="cd-synthesis-move-num">{String(i + 1).padStart(2, '0')}</div>
                <div className="cd-synthesis-move-body">
                  <div className="cd-synthesis-move-label">{m.label}</div>
                  <div className="cd-synthesis-move-text">{m.text}</div>
                  {m.evidence && (
                    <div className="cd-synthesis-move-evidence">
                      <span className="cd-synthesis-evidence-tag">Why</span>
                      <span>{m.evidence}</span>
                    </div>
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
              {antiStance.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

// Compute the synthesis content. Each move's text comes from a spine
// field; each move's evidence comes from the same per-field rationale
// builder used in Part 02 (kept in sync so the synthesis and the
// deeper section agree on the "why").
function buildSynthesis({ spine, hosts, channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, demandRow }) {
  const rationales = buildRationales({
    channels,
    patternsResult,
    whiteSpaceResult,
    productionSignalsByChannel,
    clientProductionRow: null,
    demandRow,
  });

  const moves = [];

  // Move 1: Positioning — compressed from positioning_hypothesis
  const positioningText = compressForSynthesis(spine?.positioning_hypothesis) || spine?.positioning_oneliner;
  if (positioningText) {
    moves.push({
      label: 'Positioning',
      text: positioningText,
      evidence: extractEvidenceText(rationales.editorial_pov || rationales.oneliner),
    });
  }

  // Move 2: Voice — first sentence of voice_tone
  const voiceText = firstSentence(spine?.voice_tone);
  if (voiceText) {
    moves.push({
      label: 'Voice',
      text: voiceText,
      evidence: extractEvidenceText(rationales.voice_tone),
    });
  }

  // Move 3: Host — primary host archetype (multi-host) or spine.host_archetype
  const primaryHost = (hosts || [])[0];
  const hostText = primaryHost?.archetype || spine?.host_archetype;
  if (hostText) {
    const label = (hosts || []).length > 1 ? `Hosts (${hosts.length})` : 'Host';
    moves.push({
      label,
      text: hostText,
      evidence: extractEvidenceText(rationales.host_archetype),
    });
  }

  // Anti-stance — pulled from guardrails. Split into individual constraints.
  const antiStance = (spine?.guardrails || '')
    .split(/[\n\.]+/)
    .map(s => s.trim().replace(/^[-*•]\s*/, ''))
    .filter(s => s.length > 6)
    .slice(0, 4);

  return {
    oneliner: spine?.positioning_oneliner || null,
    moves,
    antiStance,
  };
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

function PartOneContent({ briefing, diagnostic, channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, clientProductionRow, demandRow, audienceSignals, isPreLaunch }) {
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
          {briefing?.headline && <div className="cd-headline">{briefing.headline}</div>}
          {briefing?.body && <p>{briefing.body}</p>}
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
        </SubSection>
      )}

      {titlePatterns.length > 0 && (
        <SubSection title="Performance patterns" kicker="What's working">
          <p>Title patterns sorted by views lift (vs. cohort median):</p>
          <TitlePatternBars patterns={titlePatterns} />
        </SubSection>
      )}

      {cadenceGaps?.grid && (
        <SubSection title="Cadence" kicker="When the cohort gets seen">
          <CadenceHeatmap cadenceGaps={cadenceGaps} />
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
                <strong>{o.title}</strong>
                {o.body && <div style={{ marginTop: 4 }}>{o.body}</div>}
              </li>
            ))}
          </ol>
        </SubSection>
      )}
    </section>
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
          <p className="cd-recommendation">{spine.editorial_pov}</p>
          <InPractice>Every script and brief is tested against this POV — if a video doesn't argue or stand for something in this frame, it doesn't ship.</InPractice>
        </SubSection>
      )}

      {spine?.voice_tone && (
        <SubSection title="Voice + tone" kicker="How this channel sounds">
          {rationales.voice_tone && <EvidenceLead>{rationales.voice_tone}</EvidenceLead>}
          <p className="cd-recommendation">{spine.voice_tone}</p>
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
          <div className="cd-guardrails">{spine.guardrails}</div>
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

// EvidenceLead — the data chain that ANCHORS each Part 02 recommendation.
// Sits ABOVE the spine field (not below it as a sidebar) so the reader
// sees the evidence before the conclusion. Computed deterministically
// from Part 01 findings — no LLM call.
function EvidenceLead({ children }) {
  return (
    <div className="cd-evidence">
      <div className="cd-evidence-tag">Why</div>
      <div className="cd-evidence-body">{children}</div>
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
      <div className="cd-in-practice-body">{children}</div>
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
      .cd-synthesis-evidence-tag {
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
      }
    `}</style>
  );
}
