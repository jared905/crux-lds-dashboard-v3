/**
 * Intelligence Brief Service
 * Generates weekly strategy briefs by synthesizing diagnostics,
 * competitor insights, gaps, and recommendations.
 */

import { supabase } from './supabaseClient';
import { computeDiagnostics } from '../hooks/useDiagnostics';
import { getUnifiedRecommendations } from './unifiedRecommendationService';
import claudeAPI from './claudeAPI';
import { getBrandContextWithSignals } from './brandContextService';

/**
 * Fetch the latest brief for a client.
 */
export async function getLatestBrief(clientId) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('intelligence_briefs')
    .select('*')
    .eq('client_id', clientId)
    .order('brief_date', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.warn('[IntelligenceBrief] Fetch failed:', error.message);
  }
  return data || null;
}

/**
 * Fetch brief history for a client.
 */
export async function getBriefHistory(clientId, limit = 10) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('intelligence_briefs')
    .select('id, brief_date, brief_type, status, executive_summary, primary_constraint, generated_at')
    .eq('client_id', clientId)
    .order('brief_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[IntelligenceBrief] History fetch failed:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Generate a weekly intelligence brief for a client.
 * Can be called client-side (for manual generation) or server-side (via cron).
 *
 * @param {string} clientId
 * @param {Array} rows - Video performance rows
 * @param {Object} options
 * @returns {Object} The generated brief
 */
export async function generateWeeklyBrief(clientId, rows, {
  outliers = [],
  gaps = [],
  channelStats = null,
} = {}) {
  if (!rows || rows.length < 5) {
    throw new Error('Not enough video data to generate a brief (minimum 5 videos)');
  }

  // 1. Run diagnostics
  const diagnostics = computeDiagnostics(rows);

  // 2. Get unified recommendations
  const recommendations = getUnifiedRecommendations(rows, { gaps, outliers });

  // 3. Build metrics snapshot
  const totalViews = rows.reduce((s, r) => s + (r.views || 0), 0);
  const totalSubs = rows.reduce((s, r) => s + (r.subscribers || 0), 0);
  const avgCTR = rows.length > 0 ? rows.reduce((s, r) => s + (r.ctr || 0), 0) / rows.length : 0;
  const avgRet = rows.length > 0 ? rows.reduce((s, r) => s + (r.retention || r.avgViewPct || 0), 0) / rows.length : 0;

  const metricsSnapshot = {
    totalVideos: rows.length,
    totalViews,
    totalSubs,
    avgCTR,
    avgRetention: avgRet,
    subscriberCount: channelStats?.subscriberCount || null,
    generatedAt: new Date().toISOString(),
  };

  // 4. Structure the brief sections
  const primaryConstraint = diagnostics ? {
    constraint: diagnostics.primaryConstraint,
    severity: diagnostics.constraintSeverity,
    evidence: diagnostics.constraintEvidence,
  } : null;

  const topPatterns = diagnostics?.patterns?.slice(0, 5).map(p => ({
    type: p.type,
    finding: p.finding,
    recommendation: p.recommendation,
    opportunity: p.opportunity,
    effort: p.effort,
    confidence: p.confidence,
  })) || [];

  const competitorHighlights = outliers.slice(0, 5).map(o => ({
    title: o.title,
    channel: o.channel?.name,
    views: o.view_count,
    outlierScore: o.outlierScore,
  }));

  const contentGaps = gaps.slice(0, 5).map(g => ({
    title: g.title,
    type: g.typeLabel || g.type,
    impact: g.impact,
    action: g.action,
  }));

  const recommendedActions = recommendations.slice(0, 5).map(r => ({
    title: r.title,
    action: r.action,
    description: r.description,
    source: r.source,
    sourceLabel: r.sourceLabel,
    impact: r.impact,
    effort: r.effort,
    opportunity: r.opportunity,
    evidence: r.evidence,
    videoExamples: (r.videoExamples || []).slice(0, 5).map(v => ({
      title: v.title,
      views: v.views,
      ctr: v.ctr,
      retention: v.retention,
      youtubeVideoId: v.youtubeVideoId,
      youtubeUrl: v.youtubeUrl,
      channel: v.channel,
    })),
  }));

  // Build top performers list (top 20% by views) for evidence display
  const sortedByViews = [...rows].sort((a, b) => (b.views || 0) - (a.views || 0));
  const top20Count = Math.max(3, Math.ceil(rows.length * 0.2));
  const topPerformers = sortedByViews.slice(0, top20Count).map(v => ({
    title: v.title,
    views: v.views,
    ctr: v.ctr,
    retention: v.retention,
    youtubeVideoId: v.youtubeVideoId,
    youtubeUrl: v.youtubeUrl,
    type: v.type,
    publishDate: v.publishDate,
  }));

  // 5. Generate executive narrative via Claude
  let executiveSummary = '';
  let generationCost = 0;

  try {
    let systemPrompt = `You are a YouTube growth strategist writing a concise weekly intelligence brief for a content creator or brand. Write in a direct, editorial voice — like a smart advisor who respects the reader's time. No fluff, no cliches. Focus on what changed, what matters, and what to do next.`;

    if (clientId) {
      try {
        const brandBlock = await getBrandContextWithSignals(clientId, 'weekly_brief');
        if (brandBlock) systemPrompt += '\n\n' + brandBlock;
      } catch (e) {
        console.warn('[IntelligenceBrief] Brand context fetch failed:', e.message);
      }
    }

    const briefDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const prompt = `Write a 3-4 paragraph executive summary for this week's intelligence brief (${briefDate}).

Channel Metrics:
- ${metricsSnapshot.totalVideos} videos analyzed
- ${metricsSnapshot.totalViews.toLocaleString()} total views
- ${(metricsSnapshot.avgCTR * 100).toFixed(1)}% avg CTR
- ${(metricsSnapshot.avgRetention * 100).toFixed(1)}% avg retention
${metricsSnapshot.subscriberCount ? `- ${metricsSnapshot.subscriberCount.toLocaleString()} subscribers` : ''}

Primary Constraint: ${primaryConstraint?.constraint || 'None identified'} (${primaryConstraint?.severity || 'N/A'})
${primaryConstraint?.evidence || ''}

Top Findings:
${topPatterns.map((p, i) => `${i + 1}. ${p.finding}`).join('\n')}

${competitorHighlights.length > 0 ? `Competitor Breakouts:\n${competitorHighlights.map(c => `- "${c.title}" (${c.channel}) — ${c.outlierScore?.toFixed(1)}x their average`).join('\n')}` : ''}

Top Recommendations:
${recommendedActions.map((r, i) => `${i + 1}. ${r.title} (${r.impact} impact, ${r.effort} effort)`).join('\n')}

Write the summary as if briefing a busy executive. Lead with the most important insight. End with the single most impactful action to take this week.`;

    const result = await claudeAPI.call(prompt, systemPrompt, 'weekly_brief', 1024);
    executiveSummary = result.text.trim();
    generationCost = result.cost || 0;
  } catch (e) {
    console.error('[IntelligenceBrief] Claude call failed:', e.message);
    executiveSummary = `Brief generated on ${new Date().toLocaleDateString()}. Primary constraint: ${primaryConstraint?.constraint || 'None identified'}. ${topPatterns.length} patterns detected, ${recommendedActions.length} actions recommended.`;
  }

  // 6. Save to database
  const briefData = {
    client_id: clientId,
    brief_date: new Date().toISOString().split('T')[0],
    brief_type: 'weekly',
    status: 'generated',
    executive_summary: executiveSummary,
    primary_constraint: primaryConstraint,
    top_patterns: topPatterns,
    competitor_highlights: competitorHighlights,
    content_gaps: contentGaps,
    recommended_actions: recommendedActions,
    top_performers: topPerformers,
    metrics_snapshot: metricsSnapshot,
    generation_cost: generationCost,
  };

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('intelligence_briefs')
        .upsert(briefData, { onConflict: 'client_id,brief_date,brief_type' })
        .select()
        .single();

      if (error) {
        // If top_performers column doesn't exist yet, retry without it
        if (error.message?.includes('top_performers')) {
          console.warn('[IntelligenceBrief] top_performers column not found, storing in metrics_snapshot');
          const { top_performers, metrics_snapshot, ...rest } = briefData;
          const fallbackData = { ...rest, metrics_snapshot: { ...metrics_snapshot, top_performers } };
          const { data: d2, error: e2 } = await supabase
            .from('intelligence_briefs')
            .upsert(fallbackData, { onConflict: 'client_id,brief_date,brief_type' })
            .select()
            .single();
          if (!e2 && d2) return { ...d2, top_performers };
        }
        console.error('[IntelligenceBrief] Save failed:', error.message);
      } else {
        return data;
      }
    } catch (e) {
      console.error('[IntelligenceBrief] Save error:', e.message);
    }
  }

  // Return the brief data even if save failed
  return { ...briefData, id: crypto.randomUUID() };
}

export default {
  getLatestBrief,
  getBriefHistory,
  generateWeeklyBrief,
};
