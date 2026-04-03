/**
 * Audit Opportunities Service
 * Claude-powered content gap analysis and growth opportunity detection.
 */

import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';
import { addAuditCost, updateAuditSection, updateAuditProgress } from './auditDatabase';
import { getBrandContextWithSignals } from './brandContextService';

const OPPORTUNITIES_SYSTEM_PROMPT = `You are the top YouTube strategist in the world, with deep expertise in platform algorithm behavior, audience psychology, retention mechanics, and content packaging across every vertical and channel size. You understand how YouTube's recommendation engine weighs watch time, session depth, click-through rate, and audience satisfaction signals at a granular level.

You work as a senior strategist at CRUX Media, a video strategy and production agency with 15 years of experience and over 3 billion views managed across enterprise clients. You are conducting an opportunity analysis for a channel audit — identifying the specific gaps and growth levers that will drive measurable results.

ANALYTICAL LENS:
* Read the data like a diagnostician. Identify root causes, not symptoms. If a content gap exists, explain WHY it matters in terms of audience demand, algorithm behavior, or competitive positioning.
* Think in systems. Every metric connects to others: CTR affects impressions velocity, retention drives recommendation reach, upload consistency affects subscriber notification trust.
* Contextualize by format. A 45% retention on an 18-minute video is strong. A 45% retention on a 90-second Short is a problem. Adjust your analysis to the format's benchmarks and audience behavior patterns.
* Separate signal from noise. A single underperforming video is not a trend. Consistent patterns across multiple videos ARE worth flagging.

YOUR VOICE:
* Direct and confident. No hedging, no filler.
* Warm but authoritative. This is a partner who deeply understands their craft.
* Obsessively specific. Every gap and lever must reference actual data, video titles, or patterns. If you cannot cite the data, do not include it.
* Forward-looking. Every observation connects to a concrete growth opportunity with a clear mechanism — explain HOW the opportunity drives growth, not just that it exists.
* Plain language. The client may not be a YouTube expert. Write so a marketing director or business owner understands every sentence. When you reference a platform concept (CTR, retention, impressions), briefly explain what it means in plain terms. Insights should feel smart, not intimidating.

RULES:
* You MUST identify at least 2 content gaps and 2 growth levers for every channel — even if data is limited, use the channel's own performance trends, upload patterns, and content variety to find opportunities.
* If peer benchmarks are unavailable, compare the channel against general YouTube best practices for its size tier.
* Analyze Shorts and long-form content SEPARATELY — they have fundamentally different viewer behavior, discovery mechanics, and success benchmarks. Tag each gap and lever with the format it applies to (long_form, short_form, or both).
* When the channel produces both formats, identify format-specific gaps and growth levers. Also provide a format_insights assessment.
* If the channel only produces one format, note the absence of the other as a potential opportunity or a strategic choice to respect.
* Prioritize opportunities by potential impact. Highest leverage opportunities first.

QUALITY FILTER — apply to every gap and lever before including it:
1. Does it cite a specific metric, pattern, or data point from THIS channel? If not, cut it.
2. Could this opportunity apply to any YouTube channel without modification? If yes, cut it.
3. Does the evidence explain a specific growth mechanism, or is it just "this could help"? If the latter, rewrite or cut it.

* Return ONLY valid JSON (no markdown fences, no commentary), starting with { and ending with }`;

/**
 * Analyze content gaps and growth opportunities.
 */
export async function analyzeOpportunities(auditId, context) {
  await updateAuditSection(auditId, 'opportunity_analysis', { status: 'running' });
  await updateAuditProgress(auditId, { step: 'opportunity_analysis', pct: 57, message: 'Analyzing opportunities...' });

  try {
    const { channelId, channelSnapshot, seriesSummary, benchmarkData, competitorData, longFormVideos = [], shortFormVideos = [], formatMix = {}, brandIntent = null, paidContentSummary = null, auditVoice, audienceBlock, auditStructure } = context;

    // Fetch brand context for prompt enrichment
    let brandContextBlock = '';
    if (channelId) {
      try {
        brandContextBlock = await getBrandContextWithSignals(channelId, 'audit_opportunities');
      } catch (e) {
        console.warn('[auditOpportunities] Brand context fetch failed, proceeding without:', e.message);
      }
    }

    // Prepend shared identity blocks, then section-specific prompt
    const systemPrompt = [
      auditVoice,
      audienceBlock,
      auditStructure,
      '--- OPPORTUNITIES INSTRUCTIONS BELOW ---',
      OPPORTUNITIES_SYSTEM_PROMPT,
      brandContextBlock || null,
    ].filter(Boolean).join('\n\n');

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
      `• "${s.name}": ${s.videoCount} videos, ${s.avgViews.toLocaleString()} avg views, trend: ${s.performanceTrend}${s.formatBreakdown ? ` (${s.formatBreakdown.longCount} long / ${s.formatBreakdown.shortCount} shorts)` : ''}`
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
  `• ${m.name}: Channel ${m.value?.toLocaleString()} vs Peer ${m.benchmark?.toLocaleString()} (${m.ratio}x, ${m.status})`
).join('\n') || ''}`
  : 'No peer benchmarks available — compare against general YouTube best practices for this size tier instead'}

## Top Long-form Videos
${topLongForm.length > 0 ? topLongForm.map(v => `• "${v.title}" — ${(v.view_count || 0).toLocaleString()} views`).join('\n') : 'None'}

## Top Shorts
${topShorts.length > 0 ? topShorts.map(v => `• "${v.title}" — ${(v.view_count || 0).toLocaleString()} views`).join('\n') : 'None'}

## Recent Long-form (last 90 days)
${recentLongForm.length > 0 ? recentLongForm.map(v => `• "${v.title}" — ${(v.view_count || 0).toLocaleString()} views`).join('\n') : 'None'}

## Recent Shorts (last 90 days)
${recentShorts.length > 0 ? recentShorts.map(v => `• "${v.title}" — ${(v.view_count || 0).toLocaleString()} views`).join('\n') : 'None'}
${competitorData?.competitors?.length > 0 ? `
## Head-to-Head Competitors
${competitorData.competitors.map(c => {
  const topFormats = Object.entries(c.metrics?.contentFormats || {})
    .filter(([k]) => k !== 'unclassified')
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([name, { pct }]) => `${name} (${pct}%)`);
  return `• ${c.channel.name} (${(c.channel.subscriber_count || 0).toLocaleString()} subs): avg views ${(c.metrics.avgViews || 0).toLocaleString()}, engagement ${((c.metrics.avgEngagement || 0) * 100).toFixed(2)}%, ${c.metrics.uploadFrequency}/week, top formats: ${topFormats.join(', ') || 'N/A'}`;
}).join('\n')}
Use these specific competitors to identify where the audited channel is losing ground and where it has competitive advantages.` : ''}
${brandIntent ? `
## Brand Intent (from client)
The client has expressed this direction for their YouTube presence:
"${brandIntent}"

Compare this stated intent against what the data shows audiences actually respond to. Your analysis should surface whether the brand intent aligns with audience demand, partially overlaps, or is in tension with what performs.` : ''}
${paidContentSummary?.paid > 0 ? `
## Paid Content Note
${paidContentSummary.paid} videos (${((paidContentSummary.paid / paidContentSummary.total) * 100).toFixed(1)}% of library) were identified as paid/boosted content and EXCLUDED from all metrics above. All baselines, averages, and benchmarks reflect organic performance only.` : ''}

Identify opportunities in this JSON format. Tag each item with the format it applies to:
{
  "content_gaps": [
    {
      "gap": "Description of the content gap",
      "evidence": "Data-backed reasoning",
      "potential_impact": "high" | "medium" | "low",
      "suggested_action": "Specific action to take",
      "snowball_logic": "Why filling this gap compounds over time — explain the flywheel effect",
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
  "brand_intent_alignment": {
    "scenario": "alignment" | "partial_overlap" | "tension",
    "brand_intent_summary": "1-2 sentence restatement of what the client wants",
    "audience_demand_summary": "1-2 sentences on what the data shows audiences respond to",
    "platform_logic_summary": "1-2 sentences on what YouTube will reward given the channel's current state",
    "analysis": "2-3 sentences explaining the alignment or tension and what it means for strategy"
  },
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
}
${!brandIntent ? '\nNote: No brand intent was provided. Omit the brand_intent_alignment section or return it as null.' : ''}`;

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
