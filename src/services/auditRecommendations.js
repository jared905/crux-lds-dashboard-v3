/**
 * Audit Recommendations Service
 * Claude-powered Stop/Start/Optimize recommendation generation.
 */

import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';
import { addAuditCost, updateAuditSection, updateAuditProgress } from './auditDatabase';
import { getBrandContextWithSignals } from './brandContextService';

const RECOMMENDATIONS_SYSTEM_PROMPT = `You are the top YouTube strategist in the world, with deep expertise in platform algorithm behavior, audience psychology, retention mechanics, and content packaging across every vertical and channel size. You understand how YouTube's recommendation engine weighs watch time, session depth, click-through rate, and audience satisfaction signals at a granular level.

You work as a senior strategist at CRUX Media, a video strategy and production agency with 15 years of experience and over 3 billion views managed across enterprise clients. You are delivering Stop/Start/Optimize recommendations based on a comprehensive channel audit.

ANALYTICAL LENS:
* Read the data like a diagnostician. Identify root causes, not symptoms. If retention drops at a predictable point, explain WHY (pacing, hook structure, content density) and what to do about it.
* Think in systems. Every metric connects to others: CTR affects impressions velocity, retention drives recommendation reach, upload consistency affects subscriber notification trust.
* Contextualize by format. A 45% retention on an 18-minute video is strong. A 45% retention on a 90-second Short is a problem. Adjust your analysis to the format's benchmarks.
* Separate signal from noise. A single underperforming video is not a trend. Consistent patterns across multiple videos ARE worth addressing.

YOUR VOICE:
* Direct and confident. No hedging, no filler, no "it is important to" or "you should consider."
* Warm but authoritative. This is a partner who deeply understands their craft.
* Obsessively specific. Every recommendation must reference actual video titles, percentages, patterns, or numbers from this channel's data. If you cannot cite the data, do not make the recommendation.
* Forward-looking. Every observation connects to a concrete growth opportunity with a clear mechanism.
* Plain language. The client may not be a YouTube expert. Write so a marketing director or business owner understands every sentence. When you reference a platform concept (CTR, retention, impressions), briefly explain what it means in plain terms. The recommendations should feel smart, not intimidating.

RULES:
* Organize into three categories: Stop (things to stop doing), Start (new things to begin), and Optimize (existing things to improve).
* Limit to 3-5 recommendations per category. You MUST provide at least 1 per category — every channel has something to improve.
* Consider the channel's size tier when calibrating advice.
* If benchmark data is unavailable, base recommendations on the channel's own performance patterns and YouTube best practices for the size tier.
* Provide format-specific recommendations where relevant — tag each as long_form, short_form, or both. Shorts and long-form are fundamentally different formats with different algorithm pathways. Never conflate them.
* When recommending starting or stopping an entire format, make the rationale data-driven.

QUALITY FILTER — apply to every recommendation before including it:
1. Does it cite a specific video title, metric, or pattern from THIS channel's data? If not, cut it.
2. Could this recommendation apply to any YouTube channel without modification? If yes, cut it.
3. Does the rationale explain a specific growth mechanism, or is it just "this will improve performance"? If the latter, rewrite or cut it.

* Return ONLY valid JSON (no markdown fences, no commentary), starting with { and ending with }`;

/**
 * Generate stop/start/optimize recommendations.
 */
export async function generateRecommendations(auditId, context) {
  await updateAuditSection(auditId, 'recommendations', { status: 'running' });
  await updateAuditProgress(auditId, { step: 'recommendations', pct: 72, message: 'Generating recommendations...' });

  try {
    const { channelId, channelSnapshot, seriesSummary, benchmarkData, competitorData, opportunities, longFormVideos = [], shortFormVideos = [], formatMix = {}, brandIntent = null, auditVoice, audienceBlock, auditStructure } = context;

    // Fetch brand context for prompt enrichment
    let brandContextBlock = '';
    if (channelId) {
      try {
        brandContextBlock = await getBrandContextWithSignals(channelId, 'audit_recommendations');
      } catch (e) {
        console.warn('[auditRecommendations] Brand context fetch failed, proceeding without:', e.message);
      }
    }

    // Prepend shared identity blocks, then section-specific prompt
    const systemPrompt = [
      auditVoice,
      audienceBlock,
      auditStructure,
      '--- RECOMMENDATIONS INSTRUCTIONS BELOW ---',
      RECOMMENDATIONS_SYSTEM_PROMPT,
      brandContextBlock || null,
    ].filter(Boolean).join('\n\n');

    // Identify underperforming content — split by format
    const avgViews = channelSnapshot?.avg_views_recent || 0;
    const cutoff180d = new Date();
    cutoff180d.setDate(cutoff180d.getDate() - 180);

    const underperformingLong = longFormVideos
      .filter(v => v.published_at && new Date(v.published_at) > cutoff180d && (v.view_count || 0) < avgViews * 0.3)
      .slice(0, 6);
    const underperformingShort = shortFormVideos
      .filter(v => v.published_at && new Date(v.published_at) > cutoff180d && (v.view_count || 0) < avgViews * 0.3)
      .slice(0, 6);

    const prompt = `Generate strategic recommendations for this YouTube channel based on the full audit:

## Channel Overview
- Name: ${channelSnapshot?.name || 'Unknown'}
- Subscribers: ${(channelSnapshot?.subscriber_count || 0).toLocaleString()}
- Size Tier: ${channelSnapshot?.size_tier || 'unknown'}
- Avg Views (recent 90d): ${(channelSnapshot?.avg_views_recent || 0).toLocaleString()}
- Avg Engagement (recent): ${((channelSnapshot?.avg_engagement_recent || 0) * 100).toFixed(2)}%

## Format Breakdown
- Long-form: ${formatMix.longCount || 0} videos${benchmarkData?.benchmarks?.longForm?.median ? `, peer median views: ${benchmarkData.benchmarks.longForm.median.toLocaleString()}` : ''}
- Shorts: ${formatMix.shortCount || 0} videos${benchmarkData?.benchmarks?.shortForm?.median ? `, peer median views: ${benchmarkData.benchmarks.shortForm.median.toLocaleString()}` : ''}
${!formatMix.hasShortForm ? '(No Shorts published)' : ''}${!formatMix.hasLongForm ? '(No long-form videos published)' : ''}

## Format Insights (from opportunity analysis)
Long-form: ${opportunities?.format_insights?.long_form?.summary || 'N/A'}
Shorts: ${opportunities?.format_insights?.short_form?.summary || 'N/A'}
Balance: ${opportunities?.format_insights?.format_balance || 'N/A'}

## Series Analysis
${seriesSummary?.series?.length > 0
  ? seriesSummary.series.map(s =>
      `• "${s.name}": ${s.videoCount} videos, ${s.avgViews.toLocaleString()} avg views, engagement: ${(s.avgEngagementRate * 100).toFixed(2)}%, trend: ${s.performanceTrend}, cadence: ${s.cadenceDays ? s.cadenceDays + ' days' : 'irregular'}${s.formatBreakdown ? ` (${s.formatBreakdown.longCount} long / ${s.formatBreakdown.shortCount} shorts)` : ''}`
    ).join('\n')
  : 'No series detected'}

## Benchmark Comparison
${benchmarkData?.comparison?.metrics?.map(m =>
  `• ${m.name}: ${m.value?.toLocaleString()} vs peer median ${m.benchmark?.toLocaleString()} (${m.ratio}x, ${m.status})`
).join('\n') || 'No benchmarks available — base advice on the channel\'s own data and general best practices'}
${benchmarkData?.comparison?.overallScore ? `Overall benchmark score: ${benchmarkData.comparison.overallScore}x peer median` : ''}

## Identified Opportunities
Content Gaps:
${opportunities?.content_gaps?.map(g => `- ${g.gap} (${g.potential_impact} impact, ${g.format || 'both'})`).join('\n') || 'None identified'}

Growth Levers:
${opportunities?.growth_levers?.map(l => `- ${l.lever}: ${l.current_state} → ${l.target_state} (${l.priority} priority, ${l.format || 'both'})`).join('\n') || 'None identified'}

## Underperforming Long-form (last 180 days, <30% of avg views)
${underperformingLong.length > 0
  ? underperformingLong.map(v => `- "${v.title}" — ${(v.view_count || 0).toLocaleString()} views`).join('\n')
  : 'None identified'}

## Underperforming Shorts (last 180 days, <30% of avg views)
${underperformingShort.length > 0
  ? underperformingShort.map(v => `- "${v.title}" — ${(v.view_count || 0).toLocaleString()} views`).join('\n')
  : 'None identified'}
${brandIntent ? `
## Brand Intent
The client has expressed this direction: "${brandIntent}"
${opportunities?.brand_intent_alignment ? `Alignment scenario: ${opportunities.brand_intent_alignment.scenario}` : ''}
Your Start recommendations should work WITH this intent where possible. If the intent is in tension with what the data shows, frame Start recommendations as a way to bridge the gap — not as a contradiction.` : ''}

Provide recommendations in this JSON format. Tag each recommendation with the format it applies to.

CRITICAL: Every "start" recommendation MUST be structured as a Named Show Concept — not a vague suggestion like "do more heritage content" but a concrete, launchable show with a name and premise. This is what makes the recommendation actionable and closeable as a retainer.

{
  "stop": [
    {
      "action": "What to stop doing",
      "rationale": "Why, with data references",
      "evidence": "Specific data point supporting this",
      "impact": "high" | "medium" | "low",
      "format": "long_form" | "short_form" | "both"
    }
  ],
  "start": [
    {
      "show_name": "An actual show title (creative, memorable, brandable)",
      "premise": "One line, plain language — what is this show about?",
      "action": "Full description of the show concept and why to launch it",
      "rationale": "Why this specific concept, with data references",
      "evidence": "Specific data point supporting this",
      "format_length": "e.g. 8 to 12 minutes",
      "cadence": "e.g. Weekly, published every Tuesday",
      "shorts_atomization": "How to create 3-5 Shorts from each episode",
      "snowball_logic": "Why this format compounds over time — gets easier and more effective",
      "brand_fit": "One sentence connecting this show to something the brand already believes about itself",
      "impact": "high" | "medium" | "low",
      "effort": "high" | "medium" | "low",
      "format": "long_form" | "short_form" | "both"
    }
  ],
  "optimize": [
    {
      "action": "What to optimize",
      "rationale": "Why, with data references",
      "evidence": "Specific data point supporting this",
      "impact": "high" | "medium" | "low",
      "format": "long_form" | "short_form" | "both"
    }
  ]
}`;

    const result = await claudeAPI.call(
      prompt,
      systemPrompt,
      'audit_recommendations',
      5000
    );

    // Track cost
    if (result.usage) {
      await addAuditCost(auditId, {
        tokens: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
        cost: result.cost || 0,
      });
    }

    let parsed = parseClaudeJSON(result.text, { stop: [], start: [], optimize: [] });

    let recommendationData = {
      stop: parsed.stop || [],
      start: parsed.start || [],
      optimize: parsed.optimize || [],
    };

    const isEmpty = recommendationData.stop.length === 0 && recommendationData.start.length === 0 && recommendationData.optimize.length === 0;

    // Retry once if parsing returned nothing (likely truncated response)
    if (isEmpty) {
      console.warn('[auditRecommendations] First attempt returned zero recommendations, retrying...');
      try {
        const retry = await claudeAPI.call(
          prompt + '\n\nIMPORTANT: Keep each recommendation concise (1-2 sentences per field). Return valid JSON only.',
          systemPrompt,
          'audit_recommendations_retry',
          5000
        );
        if (retry.usage) {
          await addAuditCost(auditId, {
            tokens: (retry.usage.input_tokens || 0) + (retry.usage.output_tokens || 0),
            cost: retry.cost || 0,
          });
        }
        const retryParsed = parseClaudeJSON(retry.text, { stop: [], start: [], optimize: [] });
        const retryData = {
          stop: retryParsed.stop || [],
          start: retryParsed.start || [],
          optimize: retryParsed.optimize || [],
        };
        if (retryData.stop.length > 0 || retryData.start.length > 0 || retryData.optimize.length > 0) {
          recommendationData = retryData;
        }
      } catch (retryErr) {
        console.warn('[auditRecommendations] Retry also failed:', retryErr.message);
      }
    }

    const stillEmpty = recommendationData.stop.length === 0 && recommendationData.start.length === 0 && recommendationData.optimize.length === 0;
    if (stillEmpty) {
      console.warn('[auditRecommendations] All attempts returned zero recommendations. Claude response (first 500 chars):', (result.text || '').slice(0, 500));
    }

    await updateAuditProgress(auditId, { step: 'recommendations', pct: 83, message: 'Recommendations complete' });
    await updateAuditSection(auditId, 'recommendations', {
      status: stillEmpty ? 'warning' : 'completed',
      result_data: recommendationData,
      ...(stillEmpty && { error_message: 'Recommendations could not be generated — the AI response was incomplete. Try re-running.' }),
    });

    return recommendationData;

  } catch (err) {
    await updateAuditSection(auditId, 'recommendations', {
      status: 'failed',
      error_message: err.message,
    });
    throw err;
  }
}
