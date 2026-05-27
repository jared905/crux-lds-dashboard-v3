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
  ] = await Promise.all([
    supabase.from('channels').select('id, name, subscriber_count, total_view_count').eq('id', clientId).maybeSingle().then(r => r.data || null).catch(() => null),
    getSpine(clientId).catch(() => null),
    listHosts(clientId).catch(() => []),
    listActiveTalentRubrics(clientId).catch(() => ({})),
    getActiveDemandSignals(clientId).catch(() => null),
    getActiveProductionSignalsForChannels(productionLookupIds).catch(() => ({})),
    fetchLandscapeChannels(scope).catch(() => []),
    analyzePatterns({ scopeChannelIds, windowDays: 90 }).catch(() => null),
    analyzeWhiteSpace({ scopeChannelIds, windowDays: 90, scopeLabel: `Client: ${clientId}` }).catch(() => null),
    computeClientDiagnostic({ clientId, scopeChannelIds, windowDays: 90 }).catch(() => null),
    computeAudienceSignals(clientId, { days: 90 }).catch(() => null),
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

  // Per-channel format mix — Shorts vs long-form split over the cadence
  // window. Powers the Upload tempo section so each channel's volume
  // can be read alongside its format strategy. Without this the
  // 25-uploads-a-week eufy bar looks comparable to Smart Home Solver's
  // monthly 30-minute essay, which it isn't.
  const channelIdsForTempo = (channels || []).map(c => c.id).filter(Boolean);
  const formatMixByChannel = await fetchPerChannelFormatMix(channelIdsForTempo, 90).catch(() => ({}));

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
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Per-channel Shorts vs long-form counts over a recent window. Returns
 * `{ [channelId]: { shorts, longs, total } }`. Used by the deliverable's
 * Upload tempo section so volume reads alongside format strategy.
 */
async function fetchPerChannelFormatMix(channelIds, windowDays = 90) {
  if (!supabase || !Array.isArray(channelIds) || !channelIds.length) return {};
  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const { data } = await supabase
    .from('videos')
    .select('channel_id, video_type')
    .in('channel_id', channelIds)
    .gte('published_at', cutoff);
  const byChannel = {};
  for (const v of (data || [])) {
    if (!byChannel[v.channel_id]) byChannel[v.channel_id] = { shorts: 0, longs: 0, total: 0 };
    const bucket = byChannel[v.channel_id];
    bucket.total++;
    if (v.video_type === 'short') bucket.shorts++;
    else bucket.longs++;
  }
  return byChannel;
}

export default { loadDeliverableData };
