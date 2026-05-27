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
import { listActiveTalentRubrics } from './talentRubricService';
import { listHosts } from './clientHostsService';
import { getActiveDemandSignals } from './demandSignalService';
import {
  getActiveProductionSignalsForChannels,
} from './productionSignalService';
import { fetchLandscapeChannels } from './researchV2Service.js';
import { analyzePatterns, resolveScopeToChannelIds } from './patternsService.js';
import { analyzeWhiteSpace } from './whiteSpaceService.js';
import { computeClientDiagnostic, loadOrGenerateBriefing } from './clientDiagnosticService';
import { computeAudienceSignals } from './audienceSignalService';
import { loadAlerts } from './movementService.js';

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
    hosts,
    rubricsByKey,
    demandRow,
    productionSignalsByChannel,
    channels,
    patternsResult,
    whiteSpaceResult,
    diagnostic,
    audienceSignals,
    alerts,
  ] = await Promise.all([
    supabase.from('channels').select('id, name, subscriber_count, total_view_count').eq('id', clientId).maybeSingle().then(r => r.data || null).catch(() => null),
    getSpine(clientId).catch(() => null),
    listHosts(clientId).catch(() => []),
    listActiveTalentRubrics(clientId).catch(() => ({})),
    getActiveDemandSignals(clientId).catch(() => null),
    getActiveProductionSignalsForChannels(productionLookupIds).catch(() => ({})),
    fetchLandscapeChannels(scope).catch(() => []),
    analyzePatterns({ scopeChannelIds, windowDays: 90 }).catch(() => null),
    analyzeWhiteSpace({ scopeChannelIds, windowDays: 90, scopeLabel: `Client: ${clientId}`, clientId }).catch(() => null),
    computeClientDiagnostic({ clientId, scopeChannelIds, windowDays: 90 }).catch(() => null),
    computeAudienceSignals(clientId, { days: 90 }).catch(() => null),
    loadAlerts({ scopeChannelIds, windowDays: 30 }).catch(() => []),
  ]);

  // Decorate each host with its active rubric (rubricsByKey is keyed
  // 'host_id' or 'client' for legacy unscoped). Hosts without a rubric
  // get null; the renderer handles that.
  const hostsWithRubrics = (hosts || []).map(h => ({
    ...h,
    rubric: rubricsByKey?.[h.id] || null,
  }));

  // Legacy unscoped rubric (host_id NULL) — kept for backward compat
  // when an old client has a rubric but no hosts yet. Renderer falls
  // back to this when hostsWithRubrics is empty.
  const legacyRubric = rubricsByKey?.['client'] || null;

  // Briefing is dependent on diagnostic — chained.
  const briefing = diagnostic ? await loadOrGenerateBriefing(diagnostic).catch(() => null) : null;

  // Per-channel format mix comes pre-computed on every landscape
  // channel row (formatMix, uploadsPerWeekShort, uploadsPerWeekLong)
  // using the same 30-day window and the same duration-based detection
  // that uploadsPerWeek uses. The earlier per-channel query was using
  // a 90-day window AND video_type-column detection, which produced
  // a bar where length and split disagreed on what counts as a Short.
  // We just key the existing data by channel id for the renderer.
  const formatMixByChannel = {};
  for (const c of (channels || [])) {
    if (!c.id || !c.formatMix) continue;
    formatMixByChannel[c.id] = {
      shorts: c.uploadsPerWeekShort || 0,
      longs: c.uploadsPerWeekLong || 0,
      total: c.uploadsPerWeek || 0,
      shortsShare: c.formatMix.short ?? null,
      longsShare: c.formatMix.long ?? null,
    };
  }

  return {
    ok: true,
    clientChannel,
    spine,
    hosts: hostsWithRubrics,
    legacyRubric,
    demandRow,
    productionSignalsByChannel,
    clientProductionRow: productionSignalsByChannel?.[clientId] || null,
    channels,
    patternsResult,
    whiteSpaceResult,
    diagnostic,
    briefing,
    audienceSignals,
    formatMixByChannel,
    alerts,
    // Data coverage — surfaced on the cover so the client can read
    // the audit's basis at a glance.
    coverage: {
      videoCount: diagnostic?.cohort?.videoCount || null,
      channelCount: (channels || []).length,
      windowDays: 90,
      generatedAt: new Date().toISOString(),
    },
    generatedAt: new Date().toISOString(),
  };
}


export default { loadDeliverableData };
