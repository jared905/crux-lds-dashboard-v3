/**
 * Audit Evidence service — compact, prompt-ready pack of the cohort
 * audit findings used to anchor positioning-recommendation suggestions
 * (Editorial POV, Voice/Tone, Host archetype).
 *
 * The Strategy Spine suggestion prompts used to operate on spine-text
 * alone — no cohort numbers — and produced narrator-voice output ("the
 * cohort's biggest gap frames why this POV is needed"). This service
 * is the plumbing fix: every prompt that recommends positioning pulls
 * audit evidence from here and is required to cite specific numbers
 * from it.
 *
 * Lighter than clientDeliverableService.loadDeliverableData because it
 * skips AI generation paths (briefing, takeaway) and audience signals.
 * Returns null if the client has no scope channels yet.
 */

import { supabase } from './supabaseClient';
import { resolveScopeToChannelIds, analyzePatterns } from './patternsService.js';
import { analyzeWhiteSpace } from './whiteSpaceService.js';
import { getActiveDemandSignals } from './demandSignalService';
import { getActiveProductionSignalsForChannels } from './productionSignalService';
import { fetchLandscapeChannels } from './researchV2Service.js';

/**
 * Load the audit evidence pack for a client. Pulls only the signals
 * the suggestion prompts need; skips briefing + audience-signal AI.
 *
 * @param {string} clientId
 * @param {object} opts
 * @param {number} [opts.windowDays=90]
 * @returns {Promise<object|null>}
 */
export async function loadAuditEvidence(clientId, { windowDays = 90 } = {}) {
  if (!clientId) return null;

  const scope = { clientId, tiers: ['priority', 'tracked'], windowDays };
  const scopeChannelIds = await resolveScopeToChannelIds(scope);
  if (!scopeChannelIds?.length) return null;

  const productionLookupIds = scopeChannelIds.includes(clientId)
    ? scopeChannelIds
    : [clientId, ...scopeChannelIds];

  const [
    demandRow,
    productionSignalsByChannel,
    channels,
    patternsResult,
    whiteSpaceResult,
    businessContextRow,
  ] = await Promise.all([
    getActiveDemandSignals(clientId).catch(() => null),
    getActiveProductionSignalsForChannels(productionLookupIds).catch(() => ({})),
    fetchLandscapeChannels(scope).catch(() => []),
    analyzePatterns({ scopeChannelIds, windowDays }).catch(() => null),
    analyzeWhiteSpace({ scopeChannelIds, windowDays, scopeLabel: `Client: ${clientId}`, clientId }).catch(() => null),
    supabase
      .from('client_business_context')
      .select('one_line_summary, products_offered, products_not_offered, target_market')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .maybeSingle()
      .then(r => r.data || null)
      .catch(() => null),
  ]);

  // Cohort production-tier rollup (excluding the client itself so we
  // measure the field, not the client+field).
  const competitorSignals = Object.entries(productionSignalsByChannel || {})
    .filter(([id]) => id !== clientId)
    .map(([, s]) => s)
    .filter(Boolean);

  const tierRollup = { high: 0, mid: 0, low: 0 };
  for (const s of competitorSignals) {
    const tier = (s.production_tier || '').toLowerCase();
    if (tier === 'high' || tier === 'mid' || tier === 'low') tierRollup[tier]++;
  }
  const totalTiered = tierRollup.high + tierRollup.mid + tierRollup.low;
  const dominantTier = totalTiered > 0
    ? Object.entries(tierRollup).sort(([, a], [, b]) => b - a)[0][0]
    : null;

  const hostVisVals = competitorSignals
    .map(s => parseFloat(s?.host_framing?.host_visible_pct))
    .filter(n => !isNaN(n));
  const cohortHostVisible = hostVisVals.length
    ? Math.round(hostVisVals.reduce((a, b) => a + b, 0) / hostVisVals.length)
    : null;

  const faceVals = competitorSignals
    .map(s => parseFloat(s?.visual_treatment?.face_pct))
    .filter(n => !isNaN(n));
  const cohortFaceDriven = faceVals.length
    ? Math.round(faceVals.reduce((a, b) => a + b, 0) / faceVals.length)
    : null;

  // White-space findings (the new evidence-led ones)
  const findings = whiteSpaceResult?.brief?.opportunities || [];

  // Topic coverage split
  const topicCoverage = whiteSpaceResult?.topicCoverage || [];
  const topicGaps = topicCoverage.filter(t => t.coverage === 'gap').slice(0, 5);
  const topicSaturated = topicCoverage.filter(t => t.coverage === 'saturated').slice(0, 5);

  // Format buckets with lift
  const formatGaps = whiteSpaceResult?.formatGaps || [];

  // Title patterns
  const titlePatterns = patternsResult?.scope?.titlePatterns || [];
  const topPattern = titlePatterns
    .filter(p => p.viewsLift != null && p.confidence === 'statistical')
    .sort((a, b) => b.viewsLift - a.viewsLift)[0] || null;
  const worstPattern = titlePatterns
    .filter(p => p.viewsLift != null && p.viewsLift < -30 && p.confidence === 'statistical')
    .sort((a, b) => a.viewsLift - b.viewsLift)[0] || null;

  // Unserved demand (audience asks no one in cohort is answering)
  const topUnserved = demandRow?.signals?.unserved_requests?.[0] || null;

  // Client business context — recommendations must fit what the
  // client sells. Loaded directly here (parallel to whiteSpaceService
  // which loads it for the brief) so positioning prompts can apply
  // the same constraint.
  const businessContext = businessContextRow;

  return {
    scopeChannelIds,
    channelCount: scopeChannelIds.length,
    competitorCount: (channels || []).filter(c => c.id !== clientId).length,
    videoCount: whiteSpaceResult?.videoCount || 0,
    windowDays,
    findings: findings.slice(0, 3),
    topFinding: findings[0] || null,
    topicGaps,
    topicSaturated,
    formatGaps,
    cohortTier: {
      high: tierRollup.high,
      mid: tierRollup.mid,
      low: tierRollup.low,
      total: totalTiered,
      dominant: dominantTier,
    },
    cohortHostVisible,
    cohortFaceDriven,
    topUnserved,
    topPattern,
    worstPattern,
    businessContext,
  };
}

/**
 * Format the evidence pack as a plain-text block for prompt injection.
 * Designed so a Claude prompt can append the exact-numbers-only-allowed
 * rule and then cite the lines below verbatim. The output is bounded
 * (~500 tokens) and contains no competitor brand names in theme labels
 * (whiteSpaceService.v3-no-brands rule already redacts those).
 */
export function formatEvidenceForPrompt(evidence) {
  if (!evidence) return '';
  const lines = [];
  lines.push(`AUDIT EVIDENCE — basis for every recommendation below:`);
  lines.push(`Scope: ${evidence.channelCount} channels (${evidence.competitorCount} competitors + client) · ${evidence.videoCount} videos · last ${evidence.windowDays} days.`);
  lines.push('');

  if (evidence.findings?.length) {
    lines.push('UNCLAIMED-TERRITORY FINDINGS (evidence-led — already audit-published):');
    evidence.findings.forEach((f, i) => {
      lines.push(`  ${i + 1}. ${f.title}`);
      if (f.body) lines.push(`     ${f.body}`);
    });
    lines.push('');
  }

  if (evidence.topicSaturated?.length) {
    lines.push('SATURATED TOPIC THEMES (cohort already crowds these — opposition / over-served territory):');
    evidence.topicSaturated.forEach(t => lines.push(`  - ${t.name} (${t.count} titles)`));
    lines.push('');
  }

  if (evidence.topicGaps?.length) {
    lines.push('GAP TOPIC THEMES (cohort barely covers — claimable territory):');
    evidence.topicGaps.forEach(t => lines.push(`  - ${t.name} (${t.count} titles)`));
    lines.push('');
  }

  if (evidence.formatGaps?.length) {
    lines.push('FORMAT BUCKETS (supply share + median-view lift vs length-class baseline):');
    evidence.formatGaps.forEach(b => {
      const liftStr = b.viewsLift != null
        ? ` — ${b.viewsLift >= 1 ? '+' : ''}${Math.round((b.viewsLift - 1) * 100)}% vs ${b.baselineLabel || 'baseline'}`
        : '';
      lines.push(`  - ${b.label}: ${b.count} videos (${(b.freq * 100).toFixed(1)}%)${liftStr}${b.isGap ? ' [GAP]' : ''}`);
    });
    lines.push('');
  }

  if (evidence.cohortTier?.total >= 3) {
    const t = evidence.cohortTier;
    lines.push(`COHORT PRODUCTION TIER: dominant=${t.dominant} (high:${t.high} / mid:${t.mid} / low:${t.low} of ${t.total} tiered).`);
  }
  if (evidence.cohortHostVisible != null) {
    lines.push(`COHORT HOST VISIBILITY: ${evidence.cohortHostVisible}% average host-on-screen across competitors.`);
  }
  if (evidence.cohortFaceDriven != null) {
    lines.push(`COHORT FACE-DRIVEN THUMBNAILS: ${evidence.cohortFaceDriven}% of competitor thumbnails feature a face.`);
  }
  if (evidence.topPattern?.label && evidence.topPattern.viewsLift != null) {
    lines.push(`TOP-PERFORMING TITLE PATTERN: "${evidence.topPattern.label}" (+${Math.round(evidence.topPattern.viewsLift)}% vs cohort median).`);
  }
  if (evidence.worstPattern?.label && evidence.worstPattern.viewsLift != null) {
    lines.push(`UNDER-PERFORMING TITLE PATTERN: "${evidence.worstPattern.label}" (${Math.round(evidence.worstPattern.viewsLift)}% vs cohort median).`);
  }
  if (evidence.topUnserved) {
    const mentions = evidence.topUnserved.mentions ? ` (${evidence.topUnserved.mentions} mentions)` : '';
    lines.push(`TOP UNSERVED AUDIENCE ASK: "${evidence.topUnserved.topic}"${mentions}.`);
  }

  if (evidence.businessContext) {
    const bc = evidence.businessContext;
    lines.push('');
    lines.push(`CLIENT BUSINESS CONTEXT (HARD CONSTRAINT — recommendations must fit within what this client sells):`);
    if (bc.one_line_summary) lines.push(`  Summary: ${bc.one_line_summary}`);
    if (bc.products_offered) lines.push(`  Offers: ${bc.products_offered}`);
    if (bc.products_not_offered) lines.push(`  Does NOT offer: ${bc.products_not_offered}`);
  }

  return lines.join('\n');
}

/**
 * Universal "evidence rules" block to append to every positioning
 * prompt. Centralizes the narrator-voice ban + numbers-only-from-input
 * rule so every prompt enforces the same standard.
 */
export const EVIDENCE_RULES = `
EVIDENCE RULES (apply to every candidate you generate):
- EVERY candidate cites at least one specific number, theme name, or pattern from the AUDIT EVIDENCE above. Generic claims that could apply to any channel are not acceptable.
- NO NARRATOR VOICE. Never write meta-commentary about the recommendation itself ("frames why this POV is needed," "the mission should make that connection legible," "this voice spec is calibrated to..."). State the recommendation; do not narrate that you're making it.
- NO MARKETING THROAT-CLEARING ("we strive to," "we empower," "we are committed to," "warm and engaging," "professional yet approachable").
- BRAND-NAME RULE: do NOT name specific competitor product brands (e.g., Ring, Nest, SimpliSafe, Wyze, eufy, Vivint, ADT, Blink, Arlo, Lorex). Refer to product categories generically. The only brand name allowed is the client's own.
- BUSINESS CONTEXT IS A HARD CONSTRAINT: if business context is provided, never recommend positioning that would require demonstrating products the client does not sell.
- The numbers you cite must come from the AUDIT EVIDENCE block above — do not invent statistics. If the evidence doesn't support a specific claim, drop the claim rather than guess.
`;

export default { loadAuditEvidence, formatEvidenceForPrompt, EVIDENCE_RULES };
