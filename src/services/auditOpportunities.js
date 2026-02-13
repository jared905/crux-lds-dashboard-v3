/**
 * Audit Opportunities Service
 * Claude-powered content gap analysis and growth opportunity detection.
 */

import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';
import { addAuditCost, updateAuditSection, updateAuditProgress } from './auditDatabase';
import { getBrandContextWithSignals } from './brandContextService';

const OPPORTUNITIES_SYSTEM_PROMPT = `You are a YouTube content strategist conducting an opportunity analysis for a channel audit. Given channel data, series performance, and competitive benchmarks, identify actionable growth opportunities.

Rules:
- Be specific and data-driven — reference actual numbers from the data
- Focus on gaps between the channel and its peers
- Prioritize opportunities by potential impact
- You MUST identify at least 2 content gaps and 2 growth levers for every channel — even if data is limited, use the channel's own video performance trends, upload patterns, and content variety to find opportunities
- If peer benchmarks are unavailable, compare the channel against general YouTube best practices for its size tier
- Analyze short-form (Shorts) and long-form content SEPARATELY — they have fundamentally different viewer behavior, discovery mechanics, and success benchmarks. Tag each gap and lever with the format it applies to
- When the channel produces both formats, identify format-specific gaps and growth levers. Also provide a format_insights assessment
- If the channel only produces one format, note the absence of the other as a potential opportunity or a strategic choice to respect
- Return ONLY valid JSON (no markdown fences, no commentary), starting with { and ending with }`;

/**
 * Analyze content gaps and growth opportunities.
 */
export async function analyzeOpportunities(auditId, context) {
  await updateAuditSection(auditId, 'opportunity_analysis', { status: 'running' });
  await updateAuditProgress(auditId, { step: 'opportunity_analysis', pct: 57, message: 'Analyzing opportunities...' });

  try {
    const { channelId, channelSnapshot, seriesSummary, benchmarkData, longFormVideos = [], shortFormVideos = [], formatMix = {} } = context;

    // Fetch brand context for prompt enrichment
    let brandContextBlock = '';
    if (channelId) {
      try {
        brandContextBlock = await getBrandContextWithSignals(channelId, 'audit_opportunities');
      } catch (e) {
        console.warn('[auditOpportunities] Brand context fetch failed, proceeding without:', e.message);
      }
    }

    const systemPrompt = OPPORTUNITIES_SYSTEM_PROMPT + (brandContextBlock ? '\n\n' + brandContextBlock : '');

    // Build context summary for the prompt — split by format
    const cutoff90d = new Date();
    cutoff90d.setDate(cutoff90d.getDate() - 90);

    const topLongForm = [...longFormVideos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 8);
    const topShorts = [...shortFormVideos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 8);

    const recentLongForm = longFormVideos.filter(v => v.published_at && new Date(v.published_at) > cutoff90d).slice(0, 10);
    const recentShorts = shortFormVideos.filter(v => v.published_at && new Date(v.published_at) > cutoff90d).slice(0, 10);

    const avgViewsLong = longFormVideos.length > 0
      ? Math.round(longFormVideos.reduce((s, v) => s + (v.view_count || 0), 0) / longFormVideos.length) : 0;
    const avgViewsShort = shortFormVideos.length > 0
      ? Math.round(shortFormVideos.reduce((s, v) => s + (v.view_count || 0), 0) / shortFormVideos.length) : 0;

    const prompt = `Analyze opportunities for this YouTube channel:

## Channel Overview
- Name: ${channelSnapshot?.name || 'Unknown'}
- Subscribers: ${(channelSnapshot?.subscriber_count || 0).toLocaleString()}
- Size Tier: ${channelSnapshot?.size_tier || 'unknown'}
- Total Videos Analyzed: ${channelSnapshot?.total_videos_analyzed || 0}
- Recent Videos (90d): ${channelSnapshot?.recent_videos_90d || 0}
- Avg Views (recent): ${(channelSnapshot?.avg_views_recent || 0).toLocaleString()}
- Avg Engagement (recent): ${((channelSnapshot?.avg_engagement_recent || 0) * 100).toFixed(2)}%

## Format Breakdown
- Long-form: ${formatMix.longCount || 0} videos, avg views: ${avgViewsLong.toLocaleString()}${benchmarkData?.benchmarks?.longForm?.median ? `, peer median: ${benchmarkData.benchmarks.longForm.median.toLocaleString()}` : ''}
- Shorts: ${formatMix.shortCount || 0} videos, avg views: ${avgViewsShort.toLocaleString()}${benchmarkData?.benchmarks?.shortForm?.median ? `, peer median: ${benchmarkData.benchmarks.shortForm.median.toLocaleString()}` : ''}
${!formatMix.hasShortForm ? '(No Shorts published — consider whether this is a missed opportunity)' : ''}
${!formatMix.hasLongForm ? '(No long-form videos published — this is a Shorts-focused channel)' : ''}

## Series Performance
${seriesSummary?.series?.length > 0
  ? seriesSummary.series.map(s =>
      `- "${s.name}": ${s.videoCount} videos, ${s.avgViews.toLocaleString()} avg views, trend: ${s.performanceTrend}${s.formatBreakdown ? ` (${s.formatBreakdown.longCount} long / ${s.formatBreakdown.shortCount} shorts)` : ''}`
    ).join('\n')
  : 'No series detected'}
Uncategorized videos: ${seriesSummary?.uncategorized_count || 0}

## Competitive Benchmarks
${benchmarkData?.hasBenchmarks
  ? `Peer count: ${benchmarkData.peer_count}
Peer median views (all): ${benchmarkData.benchmarks?.all?.median?.toLocaleString() || 'N/A'}
Peer median views (long-form): ${benchmarkData.benchmarks?.longForm?.median?.toLocaleString() || 'N/A'}
Peer median views (shorts): ${benchmarkData.benchmarks?.shortForm?.median?.toLocaleString() || 'N/A'}
Peer median engagement: ${((benchmarkData.benchmarks?.engagementRate?.median || 0) * 100).toFixed(2)}%
Peer avg upload frequency: ${benchmarkData.benchmarks?.uploadFrequency?.median?.toFixed(1) || 'N/A'}/week
Peer content mix: ${benchmarkData.benchmarks?.contentMix?.shortsRatio || 0}% shorts / ${benchmarkData.benchmarks?.contentMix?.longsRatio || 0}% long-form
${benchmarkData.comparison?.metrics?.map(m =>
  `- ${m.name}: Channel ${m.value?.toLocaleString()} vs Peer ${m.benchmark?.toLocaleString()} (${m.ratio}x, ${m.status})`
).join('\n') || ''}`
  : 'No peer benchmarks available — compare against general YouTube best practices for this size tier instead'}

## Top Long-form Videos
${topLongForm.length > 0 ? topLongForm.map(v => `- "${v.title}" — ${(v.view_count || 0).toLocaleString()} views`).join('\n') : 'None'}

## Top Shorts
${topShorts.length > 0 ? topShorts.map(v => `- "${v.title}" — ${(v.view_count || 0).toLocaleString()} views`).join('\n') : 'None'}

## Recent Long-form (last 90 days)
${recentLongForm.length > 0 ? recentLongForm.map(v => `- "${v.title}" — ${(v.view_count || 0).toLocaleString()} views`).join('\n') : 'None'}

## Recent Shorts (last 90 days)
${recentShorts.length > 0 ? recentShorts.map(v => `- "${v.title}" — ${(v.view_count || 0).toLocaleString()} views`).join('\n') : 'None'}

Identify opportunities in this JSON format. Tag each item with the format it applies to:
{
  "content_gaps": [
    {
      "gap": "Description of the content gap",
      "evidence": "Data-backed reasoning",
      "potential_impact": "high" | "medium" | "low",
      "suggested_action": "Specific action to take",
      "format": "long_form" | "short_form" | "both"
    }
  ],
  "growth_levers": [
    {
      "lever": "Growth lever name",
      "current_state": "Where the channel stands now",
      "target_state": "Where it could be",
      "evidence": "Data-backed reasoning",
      "priority": "high" | "medium" | "low",
      "format": "long_form" | "short_form" | "both"
    }
  ],
  "format_insights": {
    "long_form": {
      "health": "strong" | "moderate" | "weak" | "not_active",
      "summary": "1-2 sentence assessment of long-form performance"
    },
    "short_form": {
      "health": "strong" | "moderate" | "weak" | "not_active",
      "summary": "1-2 sentence assessment of Shorts performance"
    },
    "format_balance": "1-2 sentence assessment of how well the channel balances formats"
  },
  "market_potential": {
    "tier_position": "How the channel compares within its tier",
    "growth_ceiling": "Realistic growth potential based on peer data",
    "key_differentiators": ["differentiator 1", "differentiator 2"],
    "biggest_risk": "Primary risk or weakness"
  }
}`;

    const result = await claudeAPI.call(
      prompt,
      systemPrompt,
      'audit_opportunities',
      4500
    );

    // Track cost
    if (result.usage) {
      await addAuditCost(auditId, {
        tokens: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
        cost: result.cost || 0,
      });
    }

    let parsed = parseClaudeJSON(result.text, {
      content_gaps: [],
      growth_levers: [],
      format_insights: null,
      market_potential: null,
    });

    let opportunityData = {
      content_gaps: parsed.content_gaps || [],
      growth_levers: parsed.growth_levers || [],
      format_insights: parsed.format_insights || null,
      market_potential: parsed.market_potential || null,
    };

    const isEmpty = opportunityData.content_gaps.length === 0 && opportunityData.growth_levers.length === 0;

    // Retry once if parsing returned nothing (likely truncated response)
    if (isEmpty) {
      console.warn('[auditOpportunities] First attempt returned zero opportunities, retrying...');
      try {
        const retry = await claudeAPI.call(
          prompt + '\n\nIMPORTANT: Keep each item concise (1-2 sentences per field). Return valid JSON only.',
          systemPrompt,
          'audit_opportunities_retry',
          4500
        );
        if (retry.usage) {
          await addAuditCost(auditId, {
            tokens: (retry.usage.input_tokens || 0) + (retry.usage.output_tokens || 0),
            cost: retry.cost || 0,
          });
        }
        const retryParsed = parseClaudeJSON(retry.text, {
          content_gaps: [],
          growth_levers: [],
          format_insights: null,
          market_potential: null,
        });
        const retryData = {
          content_gaps: retryParsed.content_gaps || [],
          growth_levers: retryParsed.growth_levers || [],
          format_insights: retryParsed.format_insights || null,
          market_potential: retryParsed.market_potential || null,
        };
        if (retryData.content_gaps.length > 0 || retryData.growth_levers.length > 0) {
          opportunityData = retryData;
        }
      } catch (retryErr) {
        console.warn('[auditOpportunities] Retry also failed:', retryErr.message);
      }
    }

    const stillEmpty = opportunityData.content_gaps.length === 0 && opportunityData.growth_levers.length === 0;
    if (stillEmpty) {
      console.warn('[auditOpportunities] All attempts returned zero opportunities. Claude response (first 500 chars):', (result.text || '').slice(0, 500));
    }

    await updateAuditProgress(auditId, { step: 'opportunity_analysis', pct: 68, message: 'Opportunity analysis complete' });
    await updateAuditSection(auditId, 'opportunity_analysis', {
      status: stillEmpty ? 'warning' : 'completed',
      result_data: opportunityData,
      ...(stillEmpty && { error_message: 'Opportunities could not be generated — the AI response was incomplete. Try re-running.' }),
    });

    return opportunityData;

  } catch (err) {
    await updateAuditSection(auditId, 'opportunity_analysis', {
      status: 'failed',
      error_message: err.message,
    });
    throw err;
  }
}
