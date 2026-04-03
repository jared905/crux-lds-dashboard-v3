/**
 * Audit Orchestrator Service
 * Master controller that runs all audit steps in sequence.
 *
 * Steps (with progress ranges):
 *   ingestion           0-15%
 *   series_detection    15-30%
 *   competitor_matching 30-40%  (part of benchmarking)
 *   benchmarking        40-55%
 *   opportunity_analysis 55-70%
 *   recommendations     70-85%
 *   executive_summary   85-100%
 */

import {
  createAudit,
  getAudit,
  updateAudit,
  initAuditSections,
  getAuditSections,
  updateAuditProgress,
} from './auditDatabase';
import { ingestChannelData } from './auditIngestion';
import { runSeriesDetection } from './seriesDetection';
import { runBenchmarking } from './auditBenchmark';
import { analyzeOpportunities } from './auditOpportunities';
import { generateRecommendations } from './auditRecommendations';
import { generateExecutiveSummary } from './auditSummary';
import { saveBrandContext } from './brandContextService';
import { fetchAuditCompetitors } from './auditCompetitorFetch';
import { generateLandscapeAnalysis } from './auditLandscape';
import { buildDeltaTable } from '../lib/buildDeltaTable';
import { classifyVideos } from '../lib/classifyFormats';
import {
  AUDIT_VOICE,
  AUDIT_AUDIENCE_PROSPECT,
  AUDIT_AUDIENCE_BASELINE,
  buildAuditStructure,
  buildLandscapeStructure,
} from '../lib/auditIdentity';

/**
 * Build the shared prompt identity context from audit state.
 * Used by both runAudit and resumeAudit to avoid duplication.
 */
function buildPromptContext({ auditType, channelSnapshot, benchmarkData, competitorData, organicVideos }) {
  const contentFormats = classifyVideos(organicVideos);
  const channelMetrics = {
    avgViews: benchmarkData?.channel_metrics?.avgViews || 0,
    avgEngagement: benchmarkData?.channel_metrics?.avgEngagement || 0,
    uploadFrequency: benchmarkData?.channel_metrics?.uploadFrequency || 0,
    subscriberCount: channelSnapshot?.subscriber_count || 0,
    contentFormats,
  };
  const { deltaTable, formatMixTable, hasCompetitors } = buildDeltaTable(
    channelMetrics,
    competitorData?.competitors || [],
    null, // trendData added separately in runAudit when available
  );
  return {
    auditVoice: AUDIT_VOICE,
    audienceBlock: auditType === 'prospect' ? AUDIT_AUDIENCE_PROSPECT : AUDIT_AUDIENCE_BASELINE,
    auditStructure: buildAuditStructure(deltaTable, formatMixTable, hasCompetitors),
    landscapeStructure: buildLandscapeStructure(deltaTable, formatMixTable, hasCompetitors),
  };
}

const AUDIT_STEPS = [
  'ingestion',
  'series_detection',
  'competitor_matching',
  'benchmarking',
  'opportunity_analysis',
  'recommendations',
  'executive_summary',
];

/**
 * Run a full audit pipeline.
 *
 * @param {Object} params
 * @param {string} params.channelInput - YouTube URL, handle, or channel ID
 * @param {string} params.auditType - 'prospect' or 'client_baseline'
 * @param {Object} [params.config] - Optional config overrides
 * @param {string} [params.createdBy] - User identifier
 * @param {Function} [onProgress] - Progress callback: ({ step, pct, message }) => void
 * @returns {Object} Completed audit record
 */
export async function runAudit({ channelInput, auditType, config = {}, createdBy = null }, onProgress) {
  let auditId;

  try {
    // ── Step 0: Create audit record ──
    // We need a channel_id for the audit row. We'll do a quick resolve first,
    // then create the audit. If we don't have a channel_id yet, create with null
    // and update after ingestion.
    const audit = await createAudit({
      channel_id: null,
      audit_type: auditType,
      config: { channel_input: channelInput, ...config },
      created_by: createdBy,
    });
    auditId = audit.id;

    await initAuditSections(auditId);
    await updateAudit(auditId, { status: 'running' });

    const notify = (progress) => {
      if (onProgress) onProgress(progress);
    };

    // ── Step 1: Ingestion ──
    notify({ step: 'ingestion', pct: 2, message: 'Starting ingestion...' });
    const { channel, videos, sizeTier, channelSnapshot } = await ingestChannelData(
      auditId,
      channelInput,
      { forceRefresh: config.forceRefresh, maxVideos: config.maxVideos }
    );

    // Now that we have the channel, link it to the audit
    await updateAudit(auditId, {
      channel_id: channel.id,
      channel_snapshot: channelSnapshot,
    });

    // Save pre-extracted brand context if provided (from audit creation flow)
    if (config.brandContext) {
      try {
        await saveBrandContext(channel.id, config.brandContext);
        console.log('[auditOrchestrator] Pre-extracted brand context saved for', channel.id);
      } catch (e) {
        console.warn('[auditOrchestrator] Failed to save brand context, continuing:', e.message);
      }
    }

    // Save brand intent + paid content signals to brand_context
    if (config.brandIntent || config.paidContentSignals || config.paidContentOverride) {
      try {
        const { supabase } = await import('./supabaseClient');
        if (supabase) {
          // Check if brand_context exists for this channel
          const { data: existing } = await supabase
            .from('brand_context')
            .select('id')
            .eq('channel_id', channel.id)
            .eq('is_current', true)
            .single();

          const updates = {};
          if (config.brandIntent) updates.brand_intent = config.brandIntent;
          if (config.brandIntentStakeholder) updates.brand_intent_stakeholder = config.brandIntentStakeholder;
          if (config.brandIntentTimeline) updates.brand_intent_timeline = config.brandIntentTimeline;
          if (config.paidContentSignals) updates.paid_content_signals = config.paidContentSignals;
          if (config.paidContentOverride) updates.paid_content_override = config.paidContentOverride;
          if (config.paidDurationRules) updates.paid_duration_rules = config.paidDurationRules;

          if (existing) {
            await supabase.from('brand_context').update(updates).eq('id', existing.id);
          } else {
            await supabase.from('brand_context').insert({
              channel_id: channel.id, is_current: true, ...updates,
            });
          }
          console.log('[auditOrchestrator] Brand intent & paid signals saved');

          // Re-classify videos with the newly saved signals
          if (config.paidContentSignals || config.paidContentOverride) {
            try {
              const { classifyVideos, persistClassifications } = await import('./paidContentClassifier');
              const signals = {
                keywords: config.paidContentSignals || [],
                overrideIds: config.paidContentOverride || [],
                durationRules: config.paidDurationRules || [],
              };
              const classified = classifyVideos(videos, signals);
              await persistClassifications(classified);
              // Update local video array
              classified.forEach((cv, i) => { videos[i].is_paid = cv.is_paid; });
              const paidCount = classified.filter(v => v.is_paid).length;
              console.log(`[auditOrchestrator] Re-classified: ${paidCount} paid, ${classified.length - paidCount} organic`);
            } catch (e) {
              console.warn('[auditOrchestrator] Re-classification failed:', e.message);
            }
          }
        }
      } catch (e) {
        console.warn('[auditOrchestrator] Failed to save brand intent/paid signals:', e.message);
      }
    }

    notify({ step: 'ingestion', pct: 15, message: 'Ingestion complete' });

    // ── Format split (used by all downstream stages) ──
    // Filter to organic content only for baseline calculations
    const organicVideos = videos.filter(v => !v.is_paid);
    // Use organic videos for all downstream analysis
    const longFormVideos = organicVideos.filter(v => v.video_type === 'long' || (!v.video_type && v.duration_seconds > 180));
    const shortFormVideos = organicVideos.filter(v => v.video_type === 'short' || (!v.video_type && v.duration_seconds && v.duration_seconds <= 180));
    const paidVideos = videos.filter(v => v.is_paid);
    const formatMix = {
      longCount: longFormVideos.length,
      shortCount: shortFormVideos.length,
      paidCount: paidVideos.length,
      totalAnalyzed: videos.length,
      organicAnalyzed: organicVideos.length,
      hasLongForm: longFormVideos.length > 0,
      hasShortForm: shortFormVideos.length > 0,
      hasBothFormats: longFormVideos.length > 0 && shortFormVideos.length > 0,
      hasPaidContent: paidVideos.length > 0,
    };

    // ── Step 2: Series Detection ──
    notify({ step: 'series_detection', pct: 17, message: 'Detecting series...' });
    const seriesSummary = await runSeriesDetection(auditId, channel.id, videos);

    await updateAudit(auditId, { series_summary: seriesSummary });
    notify({ step: 'series_detection', pct: 30, message: `Detected ${seriesSummary.total_series} series` });

    // ── Steps 3-4: Competitor Matching + Benchmarking ──
    // If manual competitors are specified, fetch their data and use them for benchmarking.
    // If no manual competitors but categories are selected, pull channels from those categories.
    let competitorData = null;
    let competitorChannelIds = config.competitorChannelIds || [];

    if (competitorChannelIds.length === 0 && config.categoryIds?.length > 0) {
      // Auto-populate competitors from selected categories
      notify({ step: 'competitor_matching', pct: 31, message: 'Loading competitors from selected categories...' });
      try {
        const { getChannelsInCategory, getCategoryBySlug, getAllCategories } = await import('./categoryService');
        const { supabase: sb } = await import('./supabaseClient');
        let categoryChannels = [];

        // Try junction table first
        for (const catId of config.categoryIds) {
          const channels = await getChannelsInCategory(catId, { includeSubcategories: true });
          categoryChannels.push(...channels);
        }

        // If junction table returned nothing, fall back to channels.category slug matching
        if (categoryChannels.length === 0 && sb) {
          // Get category slugs for the selected IDs
          const allCats = await getAllCategories();
          const selectedSlugs = new Set();
          const addSlugsRecursive = (catId) => {
            const cat = allCats.find(c => c.id === catId);
            if (cat) {
              selectedSlugs.add(cat.slug);
              // Add children
              allCats.filter(c => c.parent_id === catId).forEach(child => {
                selectedSlugs.add(child.slug);
                addSlugsRecursive(child.id);
              });
            }
          };
          config.categoryIds.forEach(addSlugsRecursive);

          if (selectedSlugs.size > 0) {
            const { data: fallbackChannels } = await sb
              .from('channels')
              .select('*')
              .in('category', [...selectedSlugs])
              .eq('is_competitor', true);
            categoryChannels = fallbackChannels || [];
          }
        }

        // Deduplicate and exclude the audited channel
        const seen = new Set();
        const auditedYtId = channel.youtube_channel_id;
        competitorChannelIds = categoryChannels
          .filter(c => {
            if (!c.youtube_channel_id || c.youtube_channel_id === auditedYtId) return false;
            if (seen.has(c.youtube_channel_id)) return false;
            seen.add(c.youtube_channel_id);
            return true;
          })
          .map(c => c.youtube_channel_id)
          .slice(0, 10);
      } catch (err) {
        console.warn('[Audit] Failed to load category competitors:', err.message);
      }
    }

    if (competitorChannelIds.length > 0) {
      notify({ step: 'competitor_matching', pct: 31, message: `Fetching data for ${competitorChannelIds.length} competitors...` });
      competitorData = await fetchAuditCompetitors(competitorChannelIds);
      await updateAudit(auditId, { competitor_data: competitorData });
    }

    notify({ step: 'benchmarking', pct: 35, message: 'Finding peers and benchmarking...' });
    const benchmarkData = await runBenchmarking(auditId, channel, sizeTier, {
      clientId: config.clientId,
      categoryIds: config.categoryIds,
      specifiedCompetitors: competitorData,
    });

    await updateAudit(auditId, { benchmark_data: benchmarkData });

    // ── Pre-compute prompt identity (delta tables, voice, audience) ──
    let trendData = null;
    try {
      const { supabase } = await import('./supabaseClient');
      if (supabase) {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const { data: snap } = await supabase
          .from('channel_snapshots')
          .select('subscriber_count, avg_views_per_video, snapshot_date')
          .eq('channel_id', channel.id)
          .lte('snapshot_date', ninetyDaysAgo.toISOString())
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .single();

        if (snap?.subscriber_count) {
          const curViews = benchmarkData?.channel_metrics?.avgViews || 0;
          const oldViews = snap.avg_views_per_video || 0;
          trendData = {
            subsStart: snap.subscriber_count,
            avgViewsStart: oldViews,
            subsDeltaPct: snap.subscriber_count > 0
              ? ((channelSnapshot.subscriber_count - snap.subscriber_count) / snap.subscriber_count) * 100 : 0,
            viewsDeltaPct: oldViews > 0
              ? ((curViews - oldViews) / oldViews) * 100 : 0,
          };
        }
      }
    } catch (e) {
      console.warn('[auditOrchestrator] Trend fetch failed:', e.message);
    }

    // Build with trend data (runAudit has it; resumeAudit doesn't)
    const contentFormats = classifyVideos(organicVideos);
    const { deltaTable, formatMixTable, hasCompetitors } = buildDeltaTable(
      {
        avgViews: benchmarkData?.channel_metrics?.avgViews || 0,
        avgEngagement: benchmarkData?.channel_metrics?.avgEngagement || 0,
        uploadFrequency: benchmarkData?.channel_metrics?.uploadFrequency || 0,
        subscriberCount: channelSnapshot?.subscriber_count || 0,
        contentFormats,
      },
      competitorData?.competitors || [],
      trendData,
    );
    const audienceBlock = auditType === 'prospect' ? AUDIT_AUDIENCE_PROSPECT : AUDIT_AUDIENCE_BASELINE;
    const auditStructure = buildAuditStructure(deltaTable, formatMixTable, hasCompetitors);
    const landscapeStructure = buildLandscapeStructure(deltaTable, formatMixTable, hasCompetitors);

    // ── Optional: Landscape Analysis ──
    let landscapeData = null;
    if (config.landscapeOptIn && competitorData?.competitors?.length > 0) {
      notify({ step: 'benchmarking', pct: 50, message: 'Generating landscape analysis...' });
      landscapeData = await generateLandscapeAnalysis(auditId, {
        channel,
        channelSnapshot,
        competitorData,
        benchmarkData,
        auditVoice: AUDIT_VOICE,
        auditStructure: landscapeStructure,
      });
      await updateAudit(auditId, { landscape_data: landscapeData });
    }

    notify({ step: 'benchmarking', pct: 55, message: 'Benchmarking complete' });

    // ── Step 5: Opportunity Analysis ──
    notify({ step: 'opportunity_analysis', pct: 57, message: 'Analyzing opportunities...' });
    const opportunities = await analyzeOpportunities(auditId, {
      channelId: channel.id,
      channelSnapshot,
      seriesSummary,
      benchmarkData,
      competitorData,
      videos: organicVideos,
      longFormVideos,
      shortFormVideos,
      formatMix,
      brandIntent: config.brandIntent || null,
      paidContentSummary: channelSnapshot.paid_content || null,
      auditVoice: AUDIT_VOICE,
      audienceBlock,
      auditStructure,
    });

    await updateAudit(auditId, { opportunities });
    notify({ step: 'opportunity_analysis', pct: 70, message: 'Opportunity analysis complete' });

    // ── Step 6: Recommendations ──
    notify({ step: 'recommendations', pct: 72, message: 'Generating recommendations...' });
    const recommendations = await generateRecommendations(auditId, {
      channelId: channel.id,
      channelSnapshot,
      seriesSummary,
      benchmarkData,
      competitorData,
      opportunities,
      videos: organicVideos,
      longFormVideos,
      shortFormVideos,
      formatMix,
      brandIntent: config.brandIntent || null,
      auditVoice: AUDIT_VOICE,
      audienceBlock,
      auditStructure,
    });

    await updateAudit(auditId, { recommendations });
    notify({ step: 'recommendations', pct: 85, message: 'Recommendations complete' });

    // ── Step 7: Executive Summary ──
    notify({ step: 'executive_summary', pct: 87, message: 'Writing executive summary...' });
    const executiveSummary = await generateExecutiveSummary(auditId, {
      channelId: channel.id,
      auditType,
      channelSnapshot,
      seriesSummary,
      benchmarkData,
      competitorData,
      opportunities,
      recommendations,
      formatMix,
      auditVoice: AUDIT_VOICE,
      audienceBlock,
      auditStructure,
    });

    await updateAudit(auditId, { executive_summary: executiveSummary });
    notify({ step: 'executive_summary', pct: 97, message: 'Summary complete' });

    // ── Finalize ──
    await updateAudit(auditId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
    await updateAuditProgress(auditId, { step: 'complete', pct: 100, message: 'Audit complete' });
    notify({ step: 'complete', pct: 100, message: 'Audit complete' });

    return await getAudit(auditId);

  } catch (err) {
    console.error('Audit failed:', err);
    if (auditId) {
      await updateAudit(auditId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
      }).catch(() => {});
      await updateAuditProgress(auditId, {
        step: 'failed',
        pct: -1,
        message: err.message,
      }).catch(() => {});
    }
    throw err;
  }
}

/**
 * Resume an audit from its last incomplete step.
 * Reads audit_sections to find where it left off.
 *
 * @param {string} auditId - The audit UUID to resume
 * @param {Function} [onProgress] - Progress callback
 * @returns {Object} Completed audit record
 */
export async function resumeAudit(auditId, onProgress) {
  const audit = await getAudit(auditId);
  if (!audit) throw new Error(`Audit ${auditId} not found`);
  if (audit.status === 'completed') return audit;

  const sections = await getAuditSections(auditId);
  const sectionMap = {};
  for (const s of sections) {
    sectionMap[s.section_key] = s;
  }

  // Find the first non-completed step
  let resumeFromIndex = 0;
  for (let i = 0; i < AUDIT_STEPS.length; i++) {
    const step = AUDIT_STEPS[i];
    const section = sectionMap[step];
    if (!section || section.status !== 'completed') {
      resumeFromIndex = i;
      break;
    }
    if (i === AUDIT_STEPS.length - 1) {
      // All steps completed, just finalize
      await updateAudit(auditId, { status: 'completed', completed_at: new Date().toISOString() });
      return await getAudit(auditId);
    }
  }

  await updateAudit(auditId, { status: 'running' });

  const notify = (progress) => {
    if (onProgress) onProgress(progress);
  };

  try {
    const channel = audit.channel;
    if (!channel) throw new Error('Audit has no linked channel — cannot resume');

    // Reload videos
    const { supabase } = await import('./supabaseClient');
    const { data: videos } = await supabase
      .from('videos')
      .select('*')
      .eq('channel_id', channel.id)
      .order('published_at', { ascending: false });

    const sizeTier = channel.size_tier || 'established';
    const channelSnapshot = audit.channel_snapshot;
    let seriesSummary = audit.series_summary;
    let benchmarkData = audit.benchmark_data;
    let opportunities = audit.opportunities;
    let recommendations = audit.recommendations;

    // Format split for downstream stages
    const longFormVideos = (videos || []).filter(v => v.video_type === 'long' || (!v.video_type && v.duration_seconds > 180));
    const shortFormVideos = (videos || []).filter(v => v.video_type === 'short' || (!v.video_type && v.duration_seconds && v.duration_seconds <= 180));
    const formatMix = {
      longCount: longFormVideos.length,
      shortCount: shortFormVideos.length,
      hasLongForm: longFormVideos.length > 0,
      hasShortForm: shortFormVideos.length > 0,
      hasBothFormats: longFormVideos.length > 0 && shortFormVideos.length > 0,
    };

    const organicVideosResume = (videos || []).filter(v => !v.is_paid);

    const rebuildIdentity = () => buildPromptContext({
      auditType: audit.audit_type,
      channelSnapshot,
      benchmarkData,
      competitorData: audit.competitor_data,
      organicVideos: organicVideosResume,
    });
    let resumeIdentity = benchmarkData ? rebuildIdentity() : null;

    // Run remaining steps
    for (let i = resumeFromIndex; i < AUDIT_STEPS.length; i++) {
      const step = AUDIT_STEPS[i];

      if (step === 'ingestion') {
        // If ingestion isn't done, we can't resume — need channel data
        throw new Error('Cannot resume audit: ingestion incomplete. Start a new audit.');
      }

      if (step === 'series_detection') {
        notify({ step, pct: 17, message: 'Resuming series detection...' });
        seriesSummary = await runSeriesDetection(auditId, channel.id, videos || []);
        await updateAudit(auditId, { series_summary: seriesSummary });
      }

      if (step === 'competitor_matching' || step === 'benchmarking') {
        // These run together; skip competitor_matching, handle at benchmarking
        if (step === 'competitor_matching') continue;

        // Re-fetch competitors if specified
        let competitorData = audit.competitor_data;
        if (!competitorData && audit.config?.competitorChannelIds?.length > 0) {
          notify({ step, pct: 31, message: 'Re-fetching competitor data...' });
          competitorData = await fetchAuditCompetitors(audit.config.competitorChannelIds);
          await updateAudit(auditId, { competitor_data: competitorData });
        }

        notify({ step, pct: 32, message: 'Resuming benchmarking...' });
        benchmarkData = await runBenchmarking(auditId, channel, sizeTier, {
          clientId: audit.config?.clientId,
          categoryIds: audit.config?.categoryIds,
          specifiedCompetitors: competitorData,
        });
        await updateAudit(auditId, { benchmark_data: benchmarkData });
        resumeIdentity = rebuildIdentity();

        // Landscape analysis if opted in
        if (audit.config?.landscapeOptIn && competitorData?.competitors?.length > 0 && !audit.landscape_data) {
          notify({ step, pct: 50, message: 'Generating landscape analysis...' });
          const landscapeData = await generateLandscapeAnalysis(auditId, {
            channel, channelSnapshot, competitorData, benchmarkData,
            auditVoice: resumeIdentity.auditVoice,
            auditStructure: resumeIdentity.landscapeStructure,
          });
          await updateAudit(auditId, { landscape_data: landscapeData });
        }
      }

      if (step === 'opportunity_analysis') {
        notify({ step, pct: 57, message: 'Resuming opportunity analysis...' });
        opportunities = await analyzeOpportunities(auditId, {
          channelId: channel.id,
          channelSnapshot,
          seriesSummary,
          benchmarkData,
          competitorData: audit.competitor_data,
          videos: videos || [],
          longFormVideos,
          shortFormVideos,
          formatMix,
          ...(resumeIdentity || {}),
        });
        await updateAudit(auditId, { opportunities });
      }

      if (step === 'recommendations') {
        notify({ step, pct: 72, message: 'Resuming recommendations...' });
        recommendations = await generateRecommendations(auditId, {
          channelId: channel.id,
          channelSnapshot,
          seriesSummary,
          benchmarkData,
          competitorData: audit.competitor_data,
          opportunities,
          videos: videos || [],
          longFormVideos,
          shortFormVideos,
          formatMix,
          ...(resumeIdentity || {}),
        });
        await updateAudit(auditId, { recommendations });
      }

      if (step === 'executive_summary') {
        notify({ step, pct: 87, message: 'Resuming executive summary...' });
        const executiveSummary = await generateExecutiveSummary(auditId, {
          channelId: channel.id,
          auditType: audit.audit_type,
          channelSnapshot,
          seriesSummary,
          benchmarkData,
          competitorData: audit.competitor_data,
          opportunities,
          recommendations,
          formatMix,
          ...(resumeIdentity || {}),
        });
        await updateAudit(auditId, { executive_summary: executiveSummary });
      }
    }

    // Finalize
    await updateAudit(auditId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
    await updateAuditProgress(auditId, { step: 'complete', pct: 100, message: 'Audit complete' });
    notify({ step: 'complete', pct: 100, message: 'Audit complete' });

    return await getAudit(auditId);

  } catch (err) {
    console.error('Audit resume failed:', err);
    await updateAudit(auditId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
    }).catch(() => {});
    throw err;
  }
}
