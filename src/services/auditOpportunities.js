/**
 * Audit Opportunities Service
 * Claude-powered content gap analysis and growth opportunity detection.
 */

import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';
import { addAuditCost, updateAuditSection, updateAuditProgress } from './auditDatabase';

const OPPORTUNITIES_SYSTEM_PROMPT = `You are a YouTube content strategist conducting an opportunity analysis for a channel audit. Given channel data, series performance, and competitive benchmarks, identify actionable growth opportunities.

Rules:
- Be specific and data-driven — reference actual numbers from the data
- Focus on gaps between the channel and its peers
- Prioritize opportunities by potential impact
- You MUST identify at least 2 content gaps and 2 growth levers for every channel — even if data is limited, use the channel's own video performance trends, upload patterns, and content variety to find opportunities
- If peer benchmarks are unavailable, compare the channel against general YouTube best practices for its size tier
- Return ONLY valid JSON (no markdown fences, no commentary), starting with { and ending with }`;

/**
 * Analyze content gaps and growth opportunities.
 */
export async function analyzeOpportunities(auditId, context) {
  await updateAuditSection(auditId, 'opportunity_analysis', { status: 'running' });
  await updateAuditProgress(auditId, { step: 'opportunity_analysis', pct: 57, message: 'Analyzing opportunities...' });

  try {
    const { channelSnapshot, seriesSummary, benchmarkData, videos } = context;

    // Build context summary for the prompt
    const topVideos = (videos || [])
      .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
      .slice(0, 10);

    const recentVideos = (videos || [])
      .filter(v => {
        if (!v.published_at) return false;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        return new Date(v.published_at) > cutoff;
      })
      .slice(0, 20);

    const prompt = `Analyze opportunities for this YouTube channel:

## Channel Overview
- Name: ${channelSnapshot?.name || 'Unknown'}
- Subscribers: ${(channelSnapshot?.subscriber_count || 0).toLocaleString()}
- Size Tier: ${channelSnapshot?.size_tier || 'unknown'}
- Total Videos Analyzed: ${channelSnapshot?.total_videos_analyzed || 0}
- Recent Videos (90d): ${channelSnapshot?.recent_videos_90d || 0}
- Avg Views (recent): ${(channelSnapshot?.avg_views_recent || 0).toLocaleString()}
- Avg Engagement (recent): ${((channelSnapshot?.avg_engagement_recent || 0) * 100).toFixed(2)}%

## Series Performance
${seriesSummary?.series?.length > 0
  ? seriesSummary.series.map(s =>
      `- "${s.name}": ${s.videoCount} videos, ${s.avgViews.toLocaleString()} avg views, trend: ${s.performanceTrend}`
    ).join('\n')
  : 'No series detected'}
Uncategorized videos: ${seriesSummary?.uncategorized_count || 0}

## Competitive Benchmarks
${benchmarkData?.hasBenchmarks
  ? `Peer count: ${benchmarkData.peer_count}
Peer median views: ${benchmarkData.benchmarks?.all?.median?.toLocaleString() || 'N/A'}
Peer median engagement: ${((benchmarkData.benchmarks?.engagementRate?.median || 0) * 100).toFixed(2)}%
Peer avg upload frequency: ${benchmarkData.benchmarks?.uploadFrequency?.median?.toFixed(1) || 'N/A'}/week
Peer content mix: ${benchmarkData.benchmarks?.contentMix?.shortsRatio || 0}% shorts / ${benchmarkData.benchmarks?.contentMix?.longsRatio || 0}% long-form
${benchmarkData.comparison?.metrics?.map(m =>
  `- ${m.name}: Channel ${m.value?.toLocaleString()} vs Peer ${m.benchmark?.toLocaleString()} (${m.ratio}x, ${m.status})`
).join('\n') || ''}`
  : 'No peer benchmarks available — compare against general YouTube best practices for this size tier instead'}

## Top Performing Videos
${topVideos.map(v => `- "${v.title}" — ${(v.view_count || 0).toLocaleString()} views`).join('\n')}

## Recent Videos (last 90 days)
${recentVideos.map(v => `- "${v.title}" — ${(v.view_count || 0).toLocaleString()} views, ${v.video_type || 'long'}`).join('\n')}

Identify opportunities in this JSON format:
{
  "content_gaps": [
    {
      "gap": "Description of the content gap",
      "evidence": "Data-backed reasoning",
      "potential_impact": "high" | "medium" | "low",
      "suggested_action": "Specific action to take"
    }
  ],
  "growth_levers": [
    {
      "lever": "Growth lever name",
      "current_state": "Where the channel stands now",
      "target_state": "Where it could be",
      "evidence": "Data-backed reasoning",
      "priority": "high" | "medium" | "low"
    }
  ],
  "market_potential": {
    "tier_position": "How the channel compares within its tier",
    "growth_ceiling": "Realistic growth potential based on peer data",
    "key_differentiators": ["differentiator 1", "differentiator 2"],
    "biggest_risk": "Primary risk or weakness"
  }
}`;

    const result = await claudeAPI.call(
      prompt,
      OPPORTUNITIES_SYSTEM_PROMPT,
      'audit_opportunities',
      2500
    );

    // Track cost
    if (result.usage) {
      await addAuditCost(auditId, {
        tokens: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
        cost: result.cost || 0,
      });
    }

    const parsed = parseClaudeJSON(result.text, {
      content_gaps: [],
      growth_levers: [],
      market_potential: null,
    });

    const opportunityData = {
      content_gaps: parsed.content_gaps || [],
      growth_levers: parsed.growth_levers || [],
      market_potential: parsed.market_potential || null,
    };

    if (opportunityData.content_gaps.length === 0 && opportunityData.growth_levers.length === 0) {
      console.warn('[auditOpportunities] Parsed result has zero opportunities. Claude response (first 500 chars):', (result.text || '').slice(0, 500));
    }

    await updateAuditProgress(auditId, { step: 'opportunity_analysis', pct: 68, message: 'Opportunity analysis complete' });
    await updateAuditSection(auditId, 'opportunity_analysis', {
      status: 'completed',
      result_data: opportunityData,
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
