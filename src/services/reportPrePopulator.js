/**
 * Report Pre-Populator
 * Full View Analytics - Crux Media
 *
 * Transforms diagnostic audit output into the v2.0 external report JSONB structure.
 * Claude generates first-draft narrative for each section.
 * Team member edits in the report builder UI.
 */

import { getMetricLabel } from '../lib/metricTranslations';

const fmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return Math.round(n).toLocaleString();
};

/**
 * Pre-populate the v2.0 report structure from audit diagnostic data.
 * Returns the full JSONB object ready for storage and editing.
 *
 * @param {object} audit - The full audit record from Supabase
 * @returns {object} v2.0 report JSONB
 */
export function prePopulateReport(audit) {
  const snapshot = audit.channel_snapshot || {};
  const benchmark = audit.benchmark_data || {};
  const opportunities = audit.opportunities || {};
  const recommendations = audit.recommendations || {};
  const competitorData = audit.competitor_data || {};
  const config = audit.config || {};
  const alignment = opportunities.brand_intent_alignment || null;

  return {
    version: '2.0',
    audit_id: audit.id,
    audit_type: audit.audit_type || 'prospect',
    channel_name: snapshot.name || '',
    channel_thumbnail_url: snapshot.thumbnail_url || '',
    generated_at: new Date().toISOString(),
    last_edited_at: new Date().toISOString(),
    edited_by: null,

    sections: {
      brand_moment: buildBrandMoment(audit),
      channel_reality: buildChannelReality(snapshot, benchmark),
      alignment: buildAlignment(alignment, opportunities, config),
      competitive_window: buildCompetitiveWindow(competitorData, benchmark),
      what_we_build: buildWhatWeBuild(recommendations),
      path_forward: buildPathForward(audit),
    },

    meta: {
      legacy_opportunities: null,
      legacy_opening_text: null,
      legacy_closing_text: null,
    },
  };
}

// ─── Section Builders ──────────────────────────────────────────────────

function buildBrandMoment(audit) {
  const summary = audit.executive_summary || '';
  // Extract first paragraph as the brand moment seed
  const firstParagraph = summary.split('\n\n')[0] || '';

  return {
    included: true,
    fixed_frame: 'A strategic observation about what makes this brand\'s story valuable and why YouTube is the right platform for it.',
    variable_narrative: firstParagraph || '[Draft narrative — to be written by team member based on diagnostic]',
    data_point: '',
    source_refs: {
      from: 'executive_summary + brand_context',
      notes: '',
    },
  };
}

function buildChannelReality(snapshot, benchmark) {
  const peerMedianViews = benchmark?.benchmarks?.all?.median;
  const peerMedianEngagement = benchmark?.benchmarks?.engagementRate?.median;

  const metrics = [
    {
      key: 'subscriber_count',
      label: getMetricLabel('subscriber_count'),
      value: fmt(snapshot.subscriber_count),
      raw_value: snapshot.subscriber_count || 0,
      benchmark_value: snapshot.size_tier ? `${snapshot.size_tier} tier` : '',
      consequence: '',
    },
    {
      key: 'avg_views_recent',
      label: getMetricLabel('avg_views_recent'),
      value: fmt(snapshot.avg_views_recent),
      raw_value: snapshot.avg_views_recent || 0,
      benchmark_value: peerMedianViews ? `${fmt(peerMedianViews)} peer median` : '',
      consequence: '',
    },
    {
      key: 'avg_engagement_recent',
      label: getMetricLabel('engagement_rate'),
      value: `${((snapshot.avg_engagement_recent || 0) * 100).toFixed(2)}%`,
      raw_value: snapshot.avg_engagement_recent || 0,
      benchmark_value: peerMedianEngagement ? `${(peerMedianEngagement * 100).toFixed(2)}% peer median` : '',
      consequence: '',
    },
    {
      key: 'recent_videos_90d',
      label: getMetricLabel('recent_videos_90d'),
      value: String(snapshot.recent_videos_90d || 0),
      raw_value: snapshot.recent_videos_90d || 0,
      benchmark_value: '',
      consequence: '',
    },
  ];

  // Add paid content metric if applicable
  if (snapshot.paid_content?.paid > 0) {
    metrics.push({
      key: 'organic_video_count',
      label: getMetricLabel('organic_video_count'),
      value: `${snapshot.paid_content.organic} organic / ${snapshot.paid_content.paid} paid`,
      raw_value: snapshot.paid_content.organic,
      benchmark_value: 'Paid content excluded from all baselines',
      consequence: '',
    });
  }

  return {
    included: true,
    metrics,
    narrative: '[Channel reality narrative — describe the gap between brand strength and channel performance]',
    consistency_observation: '',
    size_tier: snapshot.size_tier || '',
    size_tier_label: getMetricLabel('size_tier'),
    source_refs: {
      from: 'channel_snapshot + benchmark_data',
      notes: '',
    },
  };
}

function buildAlignment(alignment, opportunities, config) {
  // Map content gaps from diagnostic
  const gaps = (opportunities.content_gaps || []).map((gap, i) => ({
    id: `gap_${i + 1}`,
    headline: gap.gap || '',
    evidence: gap.evidence || '',
    snowball: gap.snowball_logic || '',
    impact: gap.potential_impact || 'medium',
    included: gap.potential_impact === 'high', // Auto-include high-impact gaps
  }));

  return {
    included: true,
    brand_intent_summary: alignment?.brand_intent_summary || config?.brandIntent || '',
    gaps,
    alignment_scenario: alignment?.scenario || 'alignment',
    bridge_narrative: alignment?.scenario === 'tension' || alignment?.scenario === 'partial_overlap'
      ? alignment?.analysis || '[Bridge narrative — diplomatically address the tension between intent and data]'
      : '',
    source_refs: {
      from: 'opportunities.brand_intent_alignment + opportunities.content_gaps',
      notes: '',
    },
  };
}

function buildCompetitiveWindow(competitorData, benchmark) {
  const competitors = competitorData?.competitors || [];
  const headToHead = benchmark?.head_to_head || [];

  // Merge data from both sources
  const benchmarks = competitors.map(comp => {
    const h2h = headToHead.find(h => h.name === comp.channel?.name);
    return {
      channel_name: comp.channel?.name || '',
      channel_thumbnail_url: comp.channel?.thumbnail_url || '',
      subscriber_count: comp.channel?.subscriber_count || 0,
      benchmark_type: 'direct_competitor', // Default — team member changes this
      approach_description: '',
      strongest_format: '',
      client_connection: '',
      included: true,
    };
  });

  // If no competitors from fetch, try head_to_head
  if (benchmarks.length === 0 && headToHead.length > 0) {
    headToHead.forEach(h => {
      benchmarks.push({
        channel_name: h.name || '',
        channel_thumbnail_url: h.thumbnail_url || '',
        subscriber_count: h.subscriber_count || 0,
        benchmark_type: 'direct_competitor',
        approach_description: '',
        strongest_format: '',
        client_connection: '',
        included: true,
      });
    });
  }

  return {
    included: benchmarks.length > 0,
    benchmarks,
    narrative: '[Competitive urgency narrative — make the opportunity feel finite and real]',
    source_refs: {
      from: 'competitor_data + benchmark_data.head_to_head',
      notes: '',
    },
  };
}

function buildWhatWeBuild(recommendations) {
  const starts = recommendations.start || [];

  const showConcepts = starts.map((rec, i) => ({
    show_name: rec.show_name || '',
    premise: rec.premise || '',
    format_length: rec.format_length || '',
    cadence: rec.cadence || '',
    shorts_atomization: rec.shorts_atomization || '',
    snowball_logic: rec.snowball_logic || '',
    brand_fit: rec.brand_fit || '',
    content_gap_addressed: '',
    recommendation_type: 'start',
    included: true,
  }));

  return {
    included: showConcepts.length > 0,
    show_concepts: showConcepts,
    source_refs: {
      from: 'recommendations.start',
      notes: '',
    },
  };
}

function buildPathForward(audit) {
  return {
    included: true,
    conviction_statement: '[One sentence strategic conviction — what Crux believes about this opportunity]',
    phases: [
      { label: '30 Days', description: '[Foundation — what gets built first]' },
      { label: '60 Days', description: '[Momentum — what launches and starts compounding]' },
      { label: '90 Days', description: '[Optimization — measure, adjust, scale what works]' },
    ],
    cta: '[Clear call to action — what happens next]',
    source_refs: {
      from: 'recommendations + executive_summary',
      notes: '',
    },
  };
}

/**
 * Generate Claude first-draft narratives for report sections.
 * Called after pre-population to fill in the variable zones.
 *
 * @param {object} report - The pre-populated v2.0 report JSONB
 * @param {object} audit - The full audit record
 * @returns {object} Updated report with Claude-generated narratives
 */
export async function generateReportNarratives(report, audit) {
  try {
    const claudeAPI = (await import('./claudeAPI')).default;

    const snapshot = audit.channel_snapshot || {};
    const opportunities = audit.opportunities || {};
    const recommendations = audit.recommendations || {};
    const alignment = opportunities.brand_intent_alignment || {};

    const prompt = `You are writing sections of an external client report for a YouTube channel audit. The client is a CMO or VP Marketing with no YouTube fluency. Every sentence must be plain language — no jargon unless immediately explained.

The channel: ${snapshot.name || 'Unknown'} (${fmt(snapshot.subscriber_count)} subscribers, ${snapshot.size_tier || 'unknown'} tier)

Brand intent: ${report.sections.alignment.brand_intent_summary || 'Not provided'}
Alignment scenario: ${alignment.scenario || 'unknown'}

Top content gaps:
${(opportunities.content_gaps || []).slice(0, 3).map(g => `- ${g.gap} (${g.potential_impact} impact)`).join('\n') || 'None identified'}

Key benchmarks:
${audit.benchmark_data?.comparison?.metrics?.map(m => `- ${m.name}: ${m.ratio}x peer median (${m.status})`).join('\n') || 'No benchmarks'}

Show concepts from recommendations:
${(recommendations.start || []).slice(0, 3).map(s => `- "${s.show_name || s.action}": ${s.premise || s.rationale}`).join('\n') || 'None'}

Generate the following sections. Return ONLY valid JSON:
{
  "brand_moment_narrative": "4-6 sentence paragraph. Not a compliment — a strategic observation about what makes this brand's story genuinely valuable and why YouTube is the right place for it. Reference one data point proving audience appetite exists.",
  "channel_reality_narrative": "3-4 sentences describing the gap between brand strength and channel performance. Create tension without blame. Frame as untapped potential, not failure.",
  "competitive_narrative": "2-3 sentences making the competitive window feel urgent. Reference specific competitors if available.",
  "conviction_statement": "One sentence articulating the strategic conviction — what Crux believes about this channel's opportunity.",
  "metric_consequences": {
    "subscriber_count": "One sentence business consequence of the subscriber position",
    "avg_views_recent": "One sentence business consequence of the view performance",
    "avg_engagement_recent": "One sentence business consequence of the engagement level",
    "recent_videos_90d": "One sentence business consequence of the upload frequency"
  }
}`;

    const result = await claudeAPI.call(
      prompt,
      'You are a senior strategist at CRUX Media writing a client-facing report. Your voice is warm, confident, and strategically sharp. No filler, no hedging. Every sentence earns its place. Return ONLY valid JSON.',
      'report_narratives',
      2000
    );

    const { parseClaudeJSON } = await import('../lib/parseClaudeJSON');
    const parsed = parseClaudeJSON(result.text, {});

    // Apply narratives to report
    if (parsed.brand_moment_narrative) {
      report.sections.brand_moment.variable_narrative = parsed.brand_moment_narrative;
    }
    if (parsed.channel_reality_narrative) {
      report.sections.channel_reality.narrative = parsed.channel_reality_narrative;
    }
    if (parsed.competitive_narrative) {
      report.sections.competitive_window.narrative = parsed.competitive_narrative;
    }
    if (parsed.conviction_statement) {
      report.sections.path_forward.conviction_statement = parsed.conviction_statement;
    }
    if (parsed.metric_consequences) {
      report.sections.channel_reality.metrics.forEach(m => {
        if (parsed.metric_consequences[m.key]) {
          m.consequence = parsed.metric_consequences[m.key];
        }
      });
    }

    report.last_edited_at = new Date().toISOString();
    return report;

  } catch (err) {
    console.warn('[reportPrePopulator] Narrative generation failed:', err.message);
    return report; // Return without narratives — team member writes manually
  }
}

export default { prePopulateReport, generateReportNarratives };
