/**
 * Audit Summary Service
 * Claude-powered executive summary generation.
 * Prompt varies by audit type: prospect vs client_baseline.
 */

import claudeAPI from './claudeAPI';
import { addAuditCost, updateAuditSection, updateAuditProgress } from './auditDatabase';
import { getBrandContextWithSignals } from './brandContextService';

const SUMMARY_SYSTEM_PROMPT_PROSPECT = `You are a YouTube growth consultant writing an executive summary for a prospective client audit. The summary should position the agency as knowledgeable about the channel's strengths and weaknesses, and make a compelling case for how the agency can help.

Write in professional but approachable tone. Use markdown formatting. Include specific data points. Keep it to 400-600 words.
When the channel produces both Shorts and long-form content, include a brief section comparing performance across formats. When only one format is used, note whether the other format represents an opportunity.`;

const SUMMARY_SYSTEM_PROMPT_BASELINE = `You are a YouTube growth consultant writing an executive summary for a new client baseline audit. The summary should establish current performance benchmarks, identify the biggest opportunities, and set expectations for growth. This will serve as the "before" snapshot.

Write in professional but approachable tone. Use markdown formatting. Include specific data points. Keep it to 400-600 words.
When the channel produces both Shorts and long-form content, include a brief section comparing performance across formats. When only one format is used, note whether the other format represents an opportunity.`;

/**
 * Generate executive summary markdown.
 */
export async function generateExecutiveSummary(auditId, context) {
  await updateAuditSection(auditId, 'executive_summary', { status: 'running' });
  await updateAuditProgress(auditId, { step: 'executive_summary', pct: 87, message: 'Writing executive summary...' });

  try {
    const {
      channelId,
      auditType,
      channelSnapshot,
      seriesSummary,
      benchmarkData,
      opportunities,
      recommendations,
      formatMix = {},
    } = context;

    const isProspect = auditType === 'prospect';

    // Fetch brand context for prompt enrichment (non-blocking — returns '' if none)
    let brandContextBlock = '';
    if (channelId) {
      try {
        brandContextBlock = await getBrandContextWithSignals(channelId, 'audit_summary');
      } catch (e) {
        console.warn('[auditSummary] Brand context fetch failed, proceeding without:', e.message);
      }
    }

    const prompt = `Write an executive summary for this ${isProspect ? 'prospect' : 'client baseline'} YouTube channel audit:

## Channel
- Name: ${channelSnapshot?.name || 'Unknown'}
- Subscribers: ${(channelSnapshot?.subscriber_count || 0).toLocaleString()}
- Size Tier: ${channelSnapshot?.size_tier || 'unknown'}
- Total Videos: ${channelSnapshot?.total_videos_analyzed || 0}
- Recent Videos (90d): ${channelSnapshot?.recent_videos_90d || 0}
- Avg Views (90d): ${(channelSnapshot?.avg_views_recent || 0).toLocaleString()}
- Avg Engagement (90d): ${((channelSnapshot?.avg_engagement_recent || 0) * 100).toFixed(2)}%

## Format Performance
${formatMix.hasBothFormats
  ? `- Long-form: ${formatMix.longCount} videos${benchmarkData?.benchmarks?.longForm?.median ? `, peer median: ${benchmarkData.benchmarks.longForm.median.toLocaleString()}` : ''}
- Shorts: ${formatMix.shortCount} videos${benchmarkData?.benchmarks?.shortForm?.median ? `, peer median: ${benchmarkData.benchmarks.shortForm.median.toLocaleString()}` : ''}`
  : formatMix.hasShortForm
  ? `Shorts-only channel: ${formatMix.shortCount} videos`
  : `Long-form only: ${formatMix.longCount || 0} videos, no Shorts published`}
${opportunities?.format_insights?.format_balance || ''}

## Series (${seriesSummary?.total_series || 0} detected)
${seriesSummary?.series?.slice(0, 5).map(s =>
  `- "${s.name}": ${s.videoCount} videos, ${s.avgViews.toLocaleString()} avg views, trend: ${s.performanceTrend}`
).join('\n') || 'None'}

## Peer Benchmarks
${benchmarkData?.hasBenchmarks
  ? `Compared against ${benchmarkData.peer_count} peer channels.
Overall score: ${benchmarkData.comparison?.overallScore || 'N/A'}x peer median.
${benchmarkData.comparison?.metrics?.map(m =>
  `- ${m.name}: ${m.status} peers (${m.ratio}x)`
).join('\n') || ''}`
  : 'No peer benchmarks available.'}

## Top Opportunities
${opportunities?.content_gaps?.slice(0, 3).map(g => `- ${g.gap} (${g.potential_impact} impact)`).join('\n') || 'None identified'}

## Key Growth Levers
${opportunities?.growth_levers?.slice(0, 3).map(l => `- ${l.lever} (${l.priority} priority)`).join('\n') || 'None identified'}

## Recommendations Summary
Stop: ${recommendations?.stop?.map(r => r.action).join('; ') || 'None'}
Start: ${recommendations?.start?.map(r => r.action).join('; ') || 'None'}
Optimize: ${recommendations?.optimize?.map(r => r.action).join('; ') || 'None'}

${isProspect
  ? 'Frame this as a pitch — highlight what the agency can unlock for this channel.'
  : 'Frame this as a baseline — establish measurable starting points and realistic growth targets.'}`;

    const basePrompt = isProspect
      ? SUMMARY_SYSTEM_PROMPT_PROSPECT
      : SUMMARY_SYSTEM_PROMPT_BASELINE;
    const systemPrompt = basePrompt + (brandContextBlock ? '\n\n' + brandContextBlock : '');

    const result = await claudeAPI.call(
      prompt,
      systemPrompt,
      'audit_summary',
      2000
    );

    // Track cost
    if (result.usage) {
      await addAuditCost(auditId, {
        tokens: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
        cost: result.cost || 0,
      });
    }

    // Summary is markdown text, not JSON
    const summaryText = result.text.trim();

    await updateAuditProgress(auditId, { step: 'executive_summary', pct: 97, message: 'Summary complete' });
    await updateAuditSection(auditId, 'executive_summary', {
      status: 'completed',
      result_data: { summary: summaryText },
    });

    return summaryText;

  } catch (err) {
    await updateAuditSection(auditId, 'executive_summary', {
      status: 'failed',
      error_message: err.message,
    });
    throw err;
  }
}
