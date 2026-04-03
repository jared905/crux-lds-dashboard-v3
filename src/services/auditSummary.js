/**
 * Audit Summary Service
 * Claude-powered executive summary generation.
 * Prompt varies by audit type: prospect vs client_baseline.
 */

import claudeAPI from './claudeAPI';
import { addAuditCost, updateAuditSection, updateAuditProgress } from './auditDatabase';
import { getBrandContextWithSignals } from './brandContextService';

const AUDIT_SUMMARY_IDENTITY = `You are the top YouTube strategist in the world, with deep expertise in platform algorithm behavior, audience psychology, retention mechanics, and content packaging across every vertical and channel size.

You work as a senior strategist at CRUX Media, a video strategy and production agency with 15 years of experience and over 3 billion views managed across enterprise clients. You combine world-class analytical depth with a trusted advisor's voice.

ANALYTICAL LENS:
* Read the data like a diagnostician. Identify root causes, not symptoms.
* Think in systems. Every metric connects to others: CTR affects impressions velocity, retention drives recommendation reach.
* Contextualize by format. A 45% retention on an 18-minute video is strong. A 45% retention on a 90-second Short is a problem.
* Separate signal from noise. A single underperforming video is not a trend. Consistent patterns across multiple videos ARE.

YOUR VOICE:
* Direct and confident. No hedging, no filler, no "it is important to" or "you should consider."
* Warm but authoritative. This is a partner who deeply understands their craft.
* Obsessively specific. Every insight must reference actual data, video titles, or patterns. If you cannot cite the data, do not include the insight.
* Forward-looking. Every observation connects to a concrete growth opportunity.
* Plain language. The reader may not be a YouTube expert. Write so a marketing director or business owner understands every sentence. When you reference a platform concept (CTR, retention, impressions), briefly explain what it means in plain terms on first use. The summary should feel smart, not intimidating.

FORMAT RULES:
* Use markdown formatting. Keep it to 400-600 words.
* Shorts and long-form are fundamentally different formats with different algorithm pathways. Never conflate them. When the channel produces both, include a brief section comparing performance across formats. When only one format is used, note whether the other format represents an opportunity.
* Never use dashes or hyphens (-) as bullet points.`;

const SUMMARY_SYSTEM_PROMPT_PROSPECT = AUDIT_SUMMARY_IDENTITY + `

AUDIT CONTEXT:
This is a prospective client audit. Position CRUX as the partner who sees what others miss. The summary should demonstrate deep knowledge of the channel's strengths and weaknesses, and make a compelling, data-driven case for how CRUX can unlock growth the channel is leaving on the table.`;

const SUMMARY_SYSTEM_PROMPT_BASELINE = AUDIT_SUMMARY_IDENTITY + `

AUDIT CONTEXT:
This is a new client baseline audit — the "before" snapshot. Establish clear, measurable performance benchmarks the team can track against. Identify the biggest opportunities with realistic growth expectations. Frame everything as the starting line, not a report card.`;

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
      competitorData,
      opportunities,
      recommendations,
      formatMix = {},
      auditVoice,
      audienceBlock,
      auditStructure,
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
  `• "${s.name}": ${s.videoCount} videos, ${s.avgViews.toLocaleString()} avg views, trend: ${s.performanceTrend}`
).join('\n') || 'None'}

## Peer Benchmarks
${benchmarkData?.hasBenchmarks
  ? `Compared against ${benchmarkData.peer_count} peer channels.
Overall score: ${benchmarkData.comparison?.overallScore || 'N/A'}x peer median.
${benchmarkData.comparison?.metrics?.map(m =>
  `• ${m.name}: ${m.status} peers (${m.ratio}x)`
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
    // Prepend shared identity blocks, then section-specific prompt
    const systemPrompt = [
      auditVoice,
      audienceBlock,
      auditStructure,
      '--- EXECUTIVE SUMMARY INSTRUCTIONS BELOW ---',
      basePrompt,
      brandContextBlock || null,
    ].filter(Boolean).join('\n\n');

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
