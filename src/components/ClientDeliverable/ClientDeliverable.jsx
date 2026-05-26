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
import { Printer, X as XIcon, Loader, Download } from 'lucide-react';
import { loadDeliverableData } from '../../services/clientDeliverableService.js';
import { generateAuditPack, downloadMarkdown } from '../../services/auditPackService.js';

const PINK = '#ec4899';
const CREAM = '#faf3e1';
const CREAM_DEEP = '#f5ead0';
const INK = '#1a1a1a';
const MUTED = '#5a5a5a';

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
  const { clientChannel, spine, rubric, demandRow, productionSignalsByChannel, clientProductionRow, channels, patternsResult, whiteSpaceResult, diagnostic, briefing } = data;
  const displayName = clientName || clientChannel?.name || 'Client';
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <Cover clientName={displayName} dateStr={dateStr} oneliner={spine?.positioning_oneliner} />

      <PartCallout number="01" title="YouTube Category Audit" description="Competitive landscape, with deep-dives (content types, cadence, production approach, performance patterns), audience behavior analysis, and content gap identification." />

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
      />

      <PartCallout number="02" title="Positioning Recommendation" description="The channel's one-line articulation, editorial POV and mission, voice and tone guardrails, and the host archetype definition that feeds directly into a talent audition rubric." />

      <PartTwoContent spine={spine} rubric={rubric} />

      <Footer />
    </>
  );
}

// ──────────────────────────────────────────────────
// Cover + section callouts
// ──────────────────────────────────────────────────

function Cover({ clientName, dateStr, oneliner }) {
  return (
    <section className="cd-page cd-cover">
      <div className="cd-cover-label">YouTube Audit + Positioning Recommendation</div>
      <h1 className="cd-cover-title">{clientName}</h1>
      <div className="cd-cover-date">{dateStr}</div>
      {oneliner && (
        <div className="cd-cover-oneliner">
          <span className="cd-cover-oneliner-mark">“</span>
          {oneliner}
          <span className="cd-cover-oneliner-mark">”</span>
        </div>
      )}
      <div className="cd-cover-footer">Prepared by Full View · CRUX</div>
    </section>
  );
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
  return (
    <div className="cd-subsection">
      {kicker && <div className="cd-kicker">{kicker}</div>}
      <h3 className="cd-subtitle">{title}</h3>
      <div className="cd-body">{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Part 01 sub-sections (client-facing curation)
// ──────────────────────────────────────────────────

function PartOneContent({ briefing, diagnostic, channels, patternsResult, whiteSpaceResult, productionSignalsByChannel, clientProductionRow, demandRow }) {
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

      {(competitorProdSignals.length > 0 || clientProductionRow) && (
        <SubSection title="Production approach" kicker="How the cohort looks">
          {competitorProdSignals.length > 0 && (
            <p>
              <strong>Cohort tiers:</strong>{' '}
              {Object.entries(tierRollup).filter(([, n]) => n > 0).map(([t, n]) => `${t} ${n}`).join(' · ')}
              {' '}({competitorProdSignals.length} competitors analyzed)
            </p>
          )}
          {clientProductionRow?.signals?.summary && (
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
          <table className="cd-table">
            <thead><tr><th>Pattern</th><th className="cd-num">Frequency</th><th className="cd-num">Median views</th><th className="cd-num">Lift</th></tr></thead>
            <tbody>
              {titlePatterns.slice(0, 6).map((p, i) => (
                <tr key={i}>
                  <td>{p.pattern}</td>
                  <td className="cd-num">{fmtPct(p.frequency)} (n={p.sampleSize ?? p.n ?? '—'})</td>
                  <td className="cd-num">{fmtNum(p.medianViews)}</td>
                  <td className="cd-num">{fmtLift(p.viewsLift, p.confidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SubSection>
      )}

      {cadenceGaps && (
        <SubSection title="Cadence" kicker="When the cohort gets seen">
          <CadenceSummary cadenceGaps={cadenceGaps} />
        </SubSection>
      )}

      {(unservedRequests.length > 0 || recurringThemes.length > 0) && (
        <SubSection title="Audience behavior" kicker="What this audience is actually asking for">
          {unservedRequests.length > 0 && (
            <>
              <p><strong>Unserved requests</strong> (mined from your own comments):</p>
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

function CadenceSummary({ cadenceGaps }) {
  const longForm = (cadenceGaps.long_form || cadenceGaps.slots || []).filter(s => s && !s.release_slot_caveat);
  const shorts = (cadenceGaps.shorts || []).filter(s => s && !s.release_slot_caveat);
  const top = (slots) => slots.slice(0, 3).map(s => {
    const day = s.day || s.weekday;
    const block = s.block || s.time_block;
    const lift = s.lift_pct != null ? `+${Math.round(s.lift_pct)}%` : (s.lift ? `+${Math.round((s.lift - 1) * 100)}%` : '');
    return `${day} ${block}${lift ? ` (${lift})` : ''}`;
  });
  return (
    <>
      {longForm.length > 0 && (
        <p><strong>Long-form top slots:</strong> {top(longForm).join(' · ')}</p>
      )}
      {shorts.length > 0 && (
        <p><strong>Shorts top slots:</strong> {top(shorts).join(' · ')}</p>
      )}
      {!longForm.length && !shorts.length && (
        <p style={{ color: MUTED, fontStyle: 'italic' }}>Not enough upload volume to call cadence slots yet.</p>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────
// Part 02 sub-sections (positioning)
// ──────────────────────────────────────────────────

function PartTwoContent({ spine, rubric }) {
  return (
    <section className="cd-page">
      {spine?.positioning_oneliner && (
        <div className="cd-oneliner-panel">
          <div className="cd-oneliner-mark">“</div>
          <div className="cd-oneliner-text">{spine.positioning_oneliner}</div>
        </div>
      )}

      {spine?.editorial_pov && (
        <SubSection title="Editorial POV + mission" kicker="What this channel believes">
          <p>{spine.editorial_pov}</p>
        </SubSection>
      )}

      {spine?.voice_tone && (
        <SubSection title="Voice + tone" kicker="How this channel sounds">
          <p>{spine.voice_tone}</p>
        </SubSection>
      )}

      {spine?.host_archetype && (
        <SubSection title="Host archetype" kicker="Who is on screen">
          <p>{spine.host_archetype}</p>
        </SubSection>
      )}

      {spine?.guardrails && (
        <SubSection title="Guardrails" kicker="What this channel must NOT do">
          <div className="cd-guardrails">{spine.guardrails}</div>
        </SubSection>
      )}

      {rubric?.criteria?.length > 0 && (
        <SubSection title="Talent audition rubric" kicker="Scorecard for on-camera auditions">
          {rubric.intro_note && (
            <div className="cd-quote">{rubric.intro_note}</div>
          )}
          <ol className="cd-list cd-list-numbered">
            {rubric.criteria.map((c, i) => (
              <li key={i}>
                <strong>{c.name}</strong>{' '}
                <span style={{ color: MUTED, fontSize: 12 }}>· {c.weight || 'medium'} weight</span>
                {c.what_excellence_looks_like && (
                  <div style={{ marginTop: 4 }}><em>5/5:</em> {c.what_excellence_looks_like}</div>
                )}
                {c.disqualifier && (
                  <div style={{ marginTop: 4 }}><em style={{ color: '#b91c1c' }}>Disqualifier:</em> {c.disqualifier}</div>
                )}
              </li>
            ))}
          </ol>
          <p style={{ marginTop: 14, fontSize: 12, color: MUTED, fontStyle: 'italic' }}>
            The printable scorecard with 1–5 scoring rows for each criterion lives in the Strategy Spine view. Print it separately to use during auditions.
          </p>
        </SubSection>
      )}

      {!spine?.positioning_oneliner && !spine?.editorial_pov && !spine?.voice_tone && !spine?.host_archetype && (
        <div style={{ color: MUTED, fontStyle: 'italic', padding: 40, textAlign: 'center' }}>
          No positioning fields authored yet. Open the Strategy Spine to add them.
        </div>
      )}
    </section>
  );
}

function Footer() {
  return (
    <section className="cd-page cd-final">
      <div style={{ color: MUTED, fontSize: 11, marginTop: 60, textAlign: 'center' }}>
        Prepared by Full View · CRUX Media · {new Date().getFullYear()}
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
        font-family: ui-sans-serif, system-ui, -apple-system, 'Inter', sans-serif;
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
        background: ${CREAM};
        text-align: left;
        min-height: 540px;
        display: flex; flex-direction: column; justify-content: center;
        padding: 96px 80px;
      }
      .cd-cover-label {
        font-size: 11px; font-weight: 700;
        color: ${PINK}; text-transform: uppercase;
        letter-spacing: 1.2px;
        margin-bottom: 24px;
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
        border-left: 3px solid ${PINK};
        margin-bottom: 96px;
      }
      .cd-cover-oneliner-mark {
        color: ${PINK}; font-weight: 700; font-style: normal;
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
        background: ${CREAM};
        border-radius: 12px;
        padding: 48px 56px;
        position: relative;
      }
      .cd-callout-number {
        font-size: 28px; font-weight: 800;
        color: ${PINK};
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
        border-bottom: 1px solid #e8e2d0;
      }
      .cd-subsection:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
      .cd-kicker {
        font-size: 10px; font-weight: 700;
        color: ${PINK}; text-transform: uppercase;
        letter-spacing: 1.2px; margin-bottom: 6px;
      }
      .cd-subtitle {
        font-size: 22px; font-weight: 700; color: ${INK};
        margin: 0 0 14px; letter-spacing: -0.3px;
      }
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
        background: ${CREAM_DEEP};
        border-radius: 6px;
        padding: 14px 16px;
        margin-top: 12px;
        border-left: 3px solid ${PINK};
      }
      .cd-callout-inline-label {
        font-size: 10px; font-weight: 700;
        color: ${PINK}; text-transform: uppercase;
        letter-spacing: 1px; margin-bottom: 6px;
      }

      /* Part 02 one-liner panel */
      .cd-oneliner-panel {
        background: ${CREAM};
        border-radius: 8px;
        padding: 40px 48px;
        margin-bottom: 36px;
        display: flex; align-items: flex-start; gap: 18px;
      }
      .cd-oneliner-mark {
        font-size: 60px; line-height: 1;
        color: ${PINK}; font-weight: 800;
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

      .cd-final {
        padding: 40px 72px;
        background: ${CREAM};
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
      }
    `}</style>
  );
}
