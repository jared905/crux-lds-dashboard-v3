/**
 * Client Deliverable service — bundles every read the client-facing
 * two-part deliverable needs in one parallel call.
 *
 * What this exists for: the audit pack is the strategist's working
 * markdown. The client deliverable is the polished, branded document
 * (cover + "01 YouTube Category Audit" + "02 Positioning
 * Recommendation"). They share data sources; this service is the seam
 * between them.
 *
 * Returns a single shape the deliverable component reads from. Anything
 * missing (no rubric yet, no production signals, etc.) returns null in
 * its slot — the renderer handles missing data per-section.
 */

import { supabase } from './supabaseClient';
import { getSpine } from './strategySpineService';
import { getActiveTalentRubric } from './talentRubricService';
import { getActiveDemandSignals } from './demandSignalService';
import {
  getActiveProductionSignalsForChannels,
} from './productionSignalService';
import { fetchLandscapeChannels } from './researchV2Service.js';
import { analyzePatterns, resolveScopeToChannelIds } from './patternsService.js';
import { analyzeWhiteSpace } from './whiteSpaceService.js';
import { computeClientDiagnostic, loadOrGenerateBriefing } from './clientDiagnosticService';

/**
 * Load every data slot the deliverable needs. Heavy — parallelizes all
 * fetches but the AI-backed briefing + whitespace brief can run several
 * seconds. Caller should show a loading state.
 */
export async function loadDeliverableData(clientId, { windowDays = 30 } = {}) {
  if (!clientId) return { ok: false, error: 'missing clientId' };

  // The deliverable's scope is the client + their pinned competitors.
  const scope = { clientId, tiers: ['priority', 'tracked'], windowDays };
  const scopeChannelIds = await resolveScopeToChannelIds(scope);

  // Production signals lookup includes the client itself (clientId is
  // the channel UUID) so the deliverable shows their own production
  // approach alongside the cohort.
  const productionLookupIds = scopeChannelIds.includes(clientId)
    ? scopeChannelIds
    : [clientId, ...scopeChannelIds];

  const [
    clientChannel,
    spine,
    rubric,
    demandRow,
    productionSignalsByChannel,
    channels,
    patternsResult,
    whiteSpaceResult,
    diagnostic,
  ] = await Promise.all([
    supabase.from('channels').select('id, name, subscriber_count, total_view_count').eq('id', clientId).maybeSingle().then(r => r.data || null).catch(() => null),
    getSpine(clientId).catch(() => null),
    getActiveTalentRubric(clientId).catch(() => null),
    getActiveDemandSignals(clientId).catch(() => null),
    getActiveProductionSignalsForChannels(productionLookupIds).catch(() => ({})),
    fetchLandscapeChannels(scope).catch(() => []),
    analyzePatterns({ scopeChannelIds, windowDays: 90 }).catch(() => null),
    analyzeWhiteSpace({ scopeChannelIds, windowDays: 90, scopeLabel: `Client: ${clientId}` }).catch(() => null),
    computeClientDiagnostic({ clientId, scopeChannelIds, windowDays: 90 }).catch(() => null),
  ]);

  // Briefing is dependent on diagnostic — chained.
  const briefing = diagnostic ? await loadOrGenerateBriefing(diagnostic).catch(() => null) : null;

  return {
    ok: true,
    clientChannel,
    spine,
    rubric,
    demandRow,
    productionSignalsByChannel,
    clientProductionRow: productionSignalsByChannel?.[clientId] || null,
    channels,
    patternsResult,
    whiteSpaceResult,
    diagnostic,
    briefing,
    generatedAt: new Date().toISOString(),
  };
}

export default { loadDeliverableData };
