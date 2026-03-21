/**
 * Audit Landscape Analysis Service
 * AI-generated competitive positioning, saturation mapping, and white space detection.
 */

import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';
import { addAuditCost } from './auditDatabase';

const LANDSCAPE_SYSTEM_PROMPT = `You are the top YouTube competitive strategist in the world, working as a senior analyst at CRUX Media (a video strategy agency with 15+ years and 3B+ views managed).

You are generating a competitive landscape analysis for a YouTube channel audit. Your job is to map the competitive environment: who's winning, what formats dominate, where the white space is, and where the audited channel sits relative to the field.

ANALYTICAL APPROACH:
* Think in positioning terms. Every channel occupies a position in the content landscape — defined by their format choices, audience targeting, publishing cadence, and content style.
* Identify saturation vs. opportunity. Topics/formats that every competitor covers are saturated. Topics/formats that few or none cover (but audience demand exists) are white space.
* Be specific. Reference actual channel names, video titles, and data points. No generic insights.
* Make it actionable. Every observation should connect to what the audited channel should do differently.

YOUR VOICE:
* Strategic and authoritative. This is a landscape briefing for a media executive.
* Data-grounded. Every claim references the provided metrics.
* Concise. No filler or hedge words.

Return ONLY valid JSON (no markdown fences, no commentary), starting with { and ending with }`;

/**
 * Generate landscape analysis from competitor data.
 *
 * @param {string} auditId
 * @param {Object} context
 * @param {Object} context.channel - Audited channel
 * @param {Object} context.channelSnapshot - Audited channel snapshot
 * @param {Object} context.competitorData - From fetchAuditCompetitors
 * @param {Object} context.benchmarkData - From runBenchmarking
 */
export async function generateLandscapeAnalysis(auditId, context) {
  const { channelSnapshot, competitorData, benchmarkData } = context;

  if (!competitorData?.competitors?.length) {
    return null;
  }

  const competitorSummaries = competitorData.competitors.map(c => {
    const topFormats = Object.entries(c.metrics.contentFormats || {})
      .filter(([k]) => k !== 'unclassified')
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([name, { pct }]) => `${name} (${pct}%)`);

    const topPatterns = Object.entries(c.metrics.titlePatterns || {})
      .sort((a, b) => b[1].pct - a[1].pct)
      .slice(0, 3)
      .map(([name, { pct }]) => `${name} (${pct}%)`);

    return `### ${c.channel.name}
- Subscribers: ${(c.channel.subscriber_count || 0).toLocaleString()}
- Avg Views (90d): ${(c.metrics.avgViews || 0).toLocaleString()}
- Engagement Rate: ${((c.metrics.avgEngagement || 0) * 100).toFixed(2)}%
- Upload Frequency: ${c.metrics.uploadFrequency}/week
- Content Mix: ${c.metrics.contentMix.longForm} long-form, ${c.metrics.contentMix.shortForm} shorts (${c.metrics.contentMix.shortsRatio}% shorts)
- Top Formats: ${topFormats.join(', ') || 'N/A'}
- Title Patterns: ${topPatterns.join(', ') || 'N/A'}
- Videos Analyzed: ${c.videoCount}`;
  }).join('\n\n');

  const prompt = `Generate a competitive landscape analysis for this YouTube channel and its competitors.

## Audited Channel
- Name: ${channelSnapshot?.name || 'Unknown'}
- Subscribers: ${(channelSnapshot?.subscriber_count || 0).toLocaleString()}
- Avg Views (recent): ${(channelSnapshot?.avg_views_recent || 0).toLocaleString()}
- Avg Engagement: ${((channelSnapshot?.avg_engagement_recent || 0) * 100).toFixed(2)}%
- Size Tier: ${channelSnapshot?.size_tier || 'unknown'}

## Competitors
${competitorSummaries}

## Benchmark Context
${benchmarkData?.hasBenchmarks
  ? `Peer median views: ${benchmarkData.benchmarks?.all?.median?.toLocaleString() || 'N/A'}
Peer median engagement: ${((benchmarkData.benchmarks?.engagementRate?.median || 0) * 100).toFixed(2)}%
Peer upload frequency: ${benchmarkData.benchmarks?.uploadFrequency?.median?.toFixed(1) || 'N/A'}/week`
  : 'No broader peer benchmarks available'}

Return a landscape analysis in this JSON format:
{
  "positioning": {
    "x_axis": { "label": "e.g. Production Frequency", "description": "What this axis measures" },
    "y_axis": { "label": "e.g. Average Reach", "description": "What this axis measures" },
    "positions": [
      { "name": "Channel Name", "x": 0.0-1.0, "y": 0.0-1.0, "is_audited": true/false }
    ]
  },
  "saturation": {
    "oversaturated": [
      { "topic_or_format": "What's oversaturated", "channels_active": 3, "evidence": "Why this is crowded" }
    ],
    "white_space": [
      { "topic_or_format": "Opportunity area", "evidence": "Why this is open", "potential": "high/medium/low" }
    ]
  },
  "format_landscape": [
    { "channel": "Name", "dominant_format": "tutorial", "format_diversity": "high/medium/low", "shorts_adoption": "heavy/moderate/none" }
  ],
  "competitive_advantages": {
    "audited_channel_strengths": ["strength 1", "strength 2"],
    "audited_channel_vulnerabilities": ["vulnerability 1", "vulnerability 2"],
    "biggest_threat": "Which competitor poses the most direct threat and why"
  },
  "narrative": "2-3 paragraph strategic landscape summary written for a media executive. Reference specific channels and data. End with the single most important strategic implication."
}`;

  const result = await claudeAPI.call(
    prompt,
    LANDSCAPE_SYSTEM_PROMPT,
    'audit_landscape',
    4000
  );

  if (result.usage) {
    await addAuditCost(auditId, {
      tokens: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
      cost: result.cost || 0,
    });
  }

  const parsed = parseClaudeJSON(result.text, {
    positioning: null,
    saturation: null,
    format_landscape: null,
    competitive_advantages: null,
    narrative: '',
  });

  return parsed;
}
