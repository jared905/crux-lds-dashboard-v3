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

    notify({ step: 'ingestion', pct: 15, message: 'Ingestion complete' });

    // ── Format split (used by all downstream stages) ──
    const longFormVideos = videos.filter(v => v.video_type === 'long' || (!v.video_type && v.duration_seconds > 180));
    const shortFormVideos = videos.filter(v => v.video_type === 'short' || (!v.video_type && v.duration_seconds && v.duration_seconds <= 180));
    const formatMix = {
      longCount: longFormVideos.length,
      shortCount: shortFormVideos.length,
      hasLongForm: longFormVideos.length > 0,
      hasShortForm: shortFormVideos.length > 0,
      hasBothFormats: longFormVideos.length > 0 && shortFormVideos.length > 0,
    };

    // ── Step 2: Series Detection ──
    notify({ step: 'series_detection', pct: 17, message: 'Detecting series...' });
    const seriesSummary = await runSeriesDetection(auditId, channel.id, videos);

    await updateAudit(auditId, { series_summary: seriesSummary });
    notify({ step: 'series_detection', pct: 30, message: `Detected ${seriesSummary.total_series} series` });

    // ── Steps 3-4: Competitor Matching + Benchmarking ──
    // These are handled together in runBenchmarking, which manages both
    // the competitor_matching and benchmarking audit sections.
    // If categoryIds are specified, benchmarks will only compare against those categories.
    notify({ step: 'benchmarking', pct: 32, message: 'Finding peers and benchmarking...' });
    const benchmarkData = await runBenchmarking(auditId, channel, sizeTier, {
      clientId: config.clientId,
      categoryIds: config.categoryIds,
    });

    await updateAudit(auditId, { benchmark_data: benchmarkData });
    notify({ step: 'benchmarking', pct: 55, message: 'Benchmarking complete' });

    // ── Step 5: Opportunity Analysis ──
    notify({ step: 'opportunity_analysis', pct: 57, message: 'Analyzing opportunities...' });
    const opportunities = await analyzeOpportunities(auditId, {
      channelId: channel.id,
      channelSnapshot,
      seriesSummary,
      benchmarkData,
      videos,
      longFormVideos,
      shortFormVideos,
      formatMix,
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
      opportunities,
      videos,
      longFormVideos,
      shortFormVideos,
      formatMix,
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
      opportunities,
      recommendations,
      formatMix,
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
        notify({ step, pct: 32, message: 'Resuming benchmarking...' });
        benchmarkData = await runBenchmarking(auditId, channel, sizeTier, {
          clientId: audit.config?.clientId,
          categoryIds: audit.config?.categoryIds,
        });
        await updateAudit(auditId, { benchmark_data: benchmarkData });
      }

      if (step === 'opportunity_analysis') {
        notify({ step, pct: 57, message: 'Resuming opportunity analysis...' });
        opportunities = await analyzeOpportunities(auditId, {
          channelId: channel.id,
          channelSnapshot,
          seriesSummary,
          benchmarkData,
          videos: videos || [],
          longFormVideos,
          shortFormVideos,
          formatMix,
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
          opportunities,
          videos: videos || [],
          longFormVideos,
          shortFormVideos,
          formatMix,
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
          opportunities,
          recommendations,
          formatMix,
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
