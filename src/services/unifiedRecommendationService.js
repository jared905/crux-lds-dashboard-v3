/**
 * Unified Recommendation Service
 * Synthesizes diagnostics, gap detection, and competitor outlier data
 * into a single prioritized list of "What to Create Next" recommendations.
 */

import { computeDiagnostics } from '../hooks/useDiagnostics';
import { generateActionItems } from './opportunityService';

/**
 * Build unified recommendations from multiple data sources.
 *
 * @param {Array} rows - Video performance rows (from dashboard)
 * @param {Object} options
 * @param {Array}  options.gaps - Pre-fetched gaps from gapDetectionService (optional)
 * @param {Array}  options.outliers - Pre-fetched outlier videos (optional)
 * @returns {Array} Prioritized recommendations
 */
export function getUnifiedRecommendations(rows, { gaps = [], outliers = [] } = {}) {
  const items = [];

  // ── Source 1: Diagnostic Engine patterns ──
  const diagnostics = computeDiagnostics(rows);
  if (diagnostics?.patterns) {
    for (const pattern of diagnostics.patterns) {
      // Skip Format Ecosystem Analysis — it's descriptive, not actionable
      if (pattern.type === 'Format Ecosystem Analysis') continue;
      if (!pattern.action && !pattern.recommendation) continue;

      items.push({
        id: `diag_${pattern.type.replace(/\s+/g, '_').toLowerCase()}`,
        title: pattern.finding,
        description: pattern.recommendation,
        action: pattern.action || pattern.recommendation?.split('\n')[0],
        source: 'diagnostic',
        sourceLabel: 'Channel Diagnostics',
        impact: pattern.opportunity > 50000 ? 'high' : pattern.opportunity > 10000 ? 'medium' : 'low',
        effort: pattern.effort || 'Medium',
        score: 0,
        opportunity: pattern.opportunity || 0,
        confidence: pattern.confidence || 'Medium',
        evidence: {
          delta: pattern.delta,
          sampleSize: pattern.sampleSize,
        },
        videoExamples: pattern.videoExamples || [],
      });
    }
  }

  // ── Source 2: Opportunity Service action items ──
  const actionItems = generateActionItems(rows);
  for (const item of actionItems) {
    items.push({
      id: `action_${item.title.replace(/\s+/g, '_').toLowerCase().slice(0, 30)}`,
      title: item.title,
      description: item.description,
      action: item.action,
      source: 'diagnostic',
      sourceLabel: 'Performance Analysis',
      impact: item.priority === 'high' ? 'high' : item.priority === 'medium' ? 'medium' : 'low',
      effort: 'Medium',
      score: 0,
      opportunity: item.impact?.viewsPerMonth || 0,
      confidence: 'High',
      evidence: {
        reason: item.reason,
        impactEstimate: item.impact,
      },
      videoExamples: item.examples || [],
      contentType: item.contentType,
      icon: item.icon,
    });
  }

  // ── Source 3: Gap detection ──
  for (const gap of gaps) {
    items.push({
      id: `gap_${gap.id || gap.type}`,
      title: gap.title,
      description: gap.description,
      action: gap.action,
      source: 'gap',
      sourceLabel: `${gap.typeLabel || 'Content'} Gap`,
      impact: gap.impact || 'medium',
      effort: gap.effort || 'medium',
      score: 0,
      opportunity: gap.gapSize ? gap.gapSize * 100000 : 0, // Normalize 0-1 to rough views
      confidence: gap.confidence || 'medium',
      evidence: {
        competitorStat: gap.evidence?.competitorStat,
        clientStat: gap.evidence?.clientStat,
      },
      videoExamples: (gap.evidence?.topExamples || []).map(ex => ({
        title: ex.title,
        views: ex.views,
        channel: ex.channel,
        youtubeVideoId: ex.youtubeVideoId || ex.youtube_video_id,
        youtubeUrl: ex.youtubeUrl || ex.youtube_url,
      })),
    });
  }

  // ── Source 4: Competitor outliers ──
  for (const outlier of outliers.slice(0, 5)) {
    items.push({
      id: `outlier_${outlier.id}`,
      title: `Breakout: "${outlier.title}"`,
      description: `This competitor video hit ${(outlier.outlierScore || 0).toFixed(1)}x their channel average. Study what made it work.`,
      action: `Analyze the packaging and topic of "${outlier.title}" — consider creating your version.`,
      source: 'outlier',
      sourceLabel: 'Competitor Breakout',
      impact: outlier.outlierScore >= 5 ? 'high' : outlier.outlierScore >= 3 ? 'medium' : 'low',
      effort: 'medium',
      score: 0,
      opportunity: outlier.view_count || 0,
      confidence: 'Medium',
      evidence: {
        outlierScore: outlier.outlierScore,
        channelAvg: outlier.channelAvgViews,
        views: outlier.view_count,
      },
      videoExamples: [{
        title: outlier.title,
        views: outlier.view_count,
        channel: outlier.channel?.name,
        youtubeVideoId: outlier.youtube_video_id,
        youtubeUrl: outlier.youtube_video_id ? `https://youtube.com/watch?v=${outlier.youtube_video_id}` : null,
      }],
    });
  }

  // ── Score and rank ──
  return rankAndDeduplicate(items);
}

/**
 * Score each recommendation and remove near-duplicates.
 */
function rankAndDeduplicate(items) {
  const impactWeights = { high: 1, medium: 0.6, low: 0.3 };
  const effortWeights = { Low: 1, low: 1, Medium: 0.7, medium: 0.7, High: 0.4, high: 0.4, 'N/A': 0.5 };
  const confidenceWeights = { High: 1, high: 1, Medium: 0.7, medium: 0.7, Low: 0.4, low: 0.4 };
  const sourceWeights = { diagnostic: 1, gap: 0.85, outlier: 0.7 };

  // Score each item
  for (const item of items) {
    const impactScore = impactWeights[item.impact] || 0.5;
    const effortScore = effortWeights[item.effort] || 0.5;
    const confScore = confidenceWeights[item.confidence] || 0.5;
    const srcScore = sourceWeights[item.source] || 0.5;

    item.score = (impactScore * 0.35) + (effortScore * 0.25) + (confScore * 0.2) + (srcScore * 0.2);
  }

  // Sort by score desc
  items.sort((a, b) => b.score - a.score);

  // Deduplicate by fuzzy title similarity
  const seen = [];
  const unique = [];

  for (const item of items) {
    const titleWords = new Set(item.title.toLowerCase().split(/\s+/));
    const isDuplicate = seen.some(seenWords => {
      const overlap = [...titleWords].filter(w => seenWords.has(w)).length;
      const similarity = overlap / Math.max(titleWords.size, seenWords.size);
      return similarity > 0.6;
    });

    if (!isDuplicate) {
      seen.push(titleWords);
      unique.push(item);
    }
  }

  return unique;
}

export default { getUnifiedRecommendations };
