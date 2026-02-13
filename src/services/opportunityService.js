/**
 * Opportunity Service
 * Aggregates, normalizes, and ranks opportunities from three intelligence sources:
 * 1. Diagnostic action items (from video performance patterns)
 * 2. Competitor outlier insights (from competitor analysis)
 * 3. Audit opportunities (from completed channel audits)
 */

// ─── Helpers ────────────────────────────────────────────────────────────────────

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

// ─── 1. Generate Action Items (extracted from UnifiedStrategy.jsx) ──────────

/**
 * Pure function: takes video rows, returns action items.
 * Detects performance patterns and produces prioritized actions.
 */
export function generateActionItems(rows) {
  if (!rows || rows.length === 0) return [];

  const actions = [];

  const formatVideoExample = (video, label) => ({
    label,
    title: video.title,
    views: video.views,
    ctr: video.ctr,
    retention: video.retention,
    publishDate: video.publishDate
  });

  // UPLOAD CADENCE ANALYSIS
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const last30Days = rows.filter(r => r.publishDate && new Date(r.publishDate) >= thirtyDaysAgo);
  const days3060 = rows.filter(r => r.publishDate && new Date(r.publishDate) >= sixtyDaysAgo && new Date(r.publishDate) < thirtyDaysAgo);

  const last30Shorts = last30Days.filter(v => v.type === 'short').length;
  const last30Long = last30Days.filter(v => v.type === 'long').length;

  // 1. UPLOAD FREQUENCY DROP
  if (last30Days.length > 0 && days3060.length > 0 && last30Days.length < days3060.length * 0.7) {
    const dropPct = Math.round((1 - last30Days.length / days3060.length) * 100);
    const missingUploads = days3060.length - last30Days.length;
    const avgViewsPerVideo = last30Days.reduce((sum, v) => sum + v.views, 0) / last30Days.length;
    const estimatedViewImpact = missingUploads * avgViewsPerVideo;
    const currentMonthlyViews = last30Days.reduce((sum, v) => sum + v.views, 0);
    const impactPercent = Math.round((estimatedViewImpact / currentMonthlyViews) * 100);

    actions.push({
      priority: "high",
      icon: "\u{1F4C9}",
      title: "Upload Frequency Declining",
      description: `${last30Days.length} uploads in last 30 days vs ${days3060.length} in previous 30 days (${dropPct}% decrease)`,
      action: `Return to ${days3060.length} uploads/month pace`,
      reason: "Algorithm favors consistent publishers\u2014upload frequency directly correlates with 2-3x higher recommended reach.",
      impact: {
        viewsPerMonth: estimatedViewImpact,
        percentIncrease: impactPercent
      }
    });
  }

  // Separate Shorts and Long-form
  const shorts = rows.filter(r => r.type === 'short');
  const longs = rows.filter(r => r.type === 'long');

  // 2. CTR OPTIMIZATION - SHORTS
  if (shorts.length >= 5) {
    const avgCTR = shorts.reduce((sum, r) => sum + (r.ctr || 0), 0) / shorts.length;
    const sortedByCTR = [...shorts].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
    const top20PctCTR = sortedByCTR.slice(0, Math.ceil(shorts.length * 0.2));
    const topAvgCTR = top20PctCTR.reduce((sum, r) => sum + (r.ctr || 0), 0) / top20PctCTR.length;
    const bottom20PctCTR = sortedByCTR.slice(Math.floor(shorts.length * 0.8));

    if (avgCTR < topAvgCTR * 0.8) {
      const bestExample = top20PctCTR[0];
      const worstExample = bottom20PctCTR[0];

      actions.push({
        priority: "high",
        icon: "\u{1F4F1}",
        contentType: "short",
        title: "Improve Shorts Thumbnail & Title Packaging",
        description: `Shorts CTR ${fmtPct(avgCTR)} vs top performers ${fmtPct(topAvgCTR)}`,
        action: "A/B test 3 thumbnail styles on next 5 Shorts matching top performers",
        reason: "Better packaging on Shorts could unlock significant views from existing impressions.",
        examples: [
          formatVideoExample(bestExample, "\u2713 WORKING"),
          formatVideoExample(worstExample, "\u2717 NEEDS WORK")
        ]
      });
    }
  }

  // 3. CTR OPTIMIZATION - LONG-FORM
  if (longs.length >= 5) {
    const avgCTR = longs.reduce((sum, r) => sum + (r.ctr || 0), 0) / longs.length;
    const sortedByCTR = [...longs].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
    const top20PctCTR = sortedByCTR.slice(0, Math.ceil(longs.length * 0.2));
    const topAvgCTR = top20PctCTR.reduce((sum, r) => sum + (r.ctr || 0), 0) / top20PctCTR.length;
    const bottom20PctCTR = sortedByCTR.slice(Math.floor(longs.length * 0.8));

    if (avgCTR < topAvgCTR * 0.8) {
      const bestExample = top20PctCTR[0];
      const worstExample = bottom20PctCTR[0];

      actions.push({
        priority: "high",
        icon: "\u{1F3AC}",
        contentType: "long",
        title: "Improve Long-Form Thumbnail & Title Packaging",
        description: `Long-form CTR ${fmtPct(avgCTR)} vs top performers ${fmtPct(topAvgCTR)}`,
        action: "A/B test 3 thumbnail styles on next 5 long-form videos matching top performers",
        reason: "Better packaging on long-form could unlock significant views from existing impressions.",
        examples: [
          formatVideoExample(bestExample, "\u2713 WORKING"),
          formatVideoExample(worstExample, "\u2717 NEEDS WORK")
        ]
      });
    }
  }

  // 4. REPLICATE TOP PERFORMERS - SHORTS
  if (shorts.length >= 10) {
    const sortedShorts = [...shorts].sort((a, b) => b.views - a.views);
    const top20Pct = sortedShorts.slice(0, Math.ceil(shorts.length * 0.2));
    const bottom20Pct = sortedShorts.slice(Math.floor(shorts.length * 0.8));
    const avgViews = shorts.reduce((sum, r) => sum + r.views, 0) / shorts.length;
    const topAvgViews = top20Pct.reduce((sum, r) => sum + r.views, 0) / top20Pct.length;

    if (topAvgViews > avgViews * 1.5) {
      const topTitles = top20Pct.map(v => v.title).join(' ').toLowerCase();
      let pattern = "successful formula";
      if ((topTitles.match(/\?/g) || []).length > top20Pct.length * 0.5) {
        pattern = "question-based hooks";
      } else if ((topTitles.match(/\d+/g) || []).length > top20Pct.length * 0.5) {
        pattern = "numbered list formats";
      }

      const viewsPerShort = avgViews;
      const potentialViewsPerShort = topAvgViews;
      const nextShortsCount = 5;
      const impactPerVideo = potentialViewsPerShort - viewsPerShort;
      const totalImpact = impactPerVideo * nextShortsCount;
      const monthlyShorts = last30Shorts || Math.max(1, shorts.length / 3);
      const impactPercent = Math.round((totalImpact / (avgViews * monthlyShorts)) * 100);

      actions.push({
        priority: "high",
        icon: "\u{1F4F1}",
        contentType: "short",
        title: "Replicate Top-Performing Shorts Formula",
        description: `Top 20% of Shorts average ${fmtInt(topAvgViews)} views vs overall avg ${fmtInt(avgViews)}`,
        action: `Study top ${top20Pct.length} Shorts - identify ${pattern} and apply to next 5 Shorts`,
        reason: "Replicating proven winners is the fastest path to consistent results.",
        impact: { viewsPerMonth: totalImpact, percentIncrease: impactPercent },
        examples: [
          formatVideoExample(top20Pct[0], `\u2713 TOP PERFORMER (${pattern})`),
          formatVideoExample(top20Pct[1], `\u2713 TOP PERFORMER (${pattern})`),
          formatVideoExample(bottom20Pct[0], "\u2717 UNDERPERFORMING")
        ]
      });
    }
  }

  // 5. REPLICATE TOP PERFORMERS - LONG-FORM
  if (longs.length >= 10) {
    const sortedLongs = [...longs].sort((a, b) => b.views - a.views);
    const top20Pct = sortedLongs.slice(0, Math.ceil(longs.length * 0.2));
    const bottom20Pct = sortedLongs.slice(Math.floor(longs.length * 0.8));
    const avgViews = longs.reduce((sum, r) => sum + r.views, 0) / longs.length;
    const topAvgViews = top20Pct.reduce((sum, r) => sum + r.views, 0) / top20Pct.length;

    if (topAvgViews > avgViews * 1.5) {
      const topTitles = top20Pct.map(v => v.title).join(' ').toLowerCase();
      let pattern = "successful formula";
      if ((topTitles.match(/\?/g) || []).length > top20Pct.length * 0.5) {
        pattern = "question-based hooks";
      } else if ((topTitles.match(/how to/gi) || []).length > top20Pct.length * 0.3) {
        pattern = "how-to tutorials";
      } else if ((topTitles.match(/\d+/g) || []).length > top20Pct.length * 0.5) {
        pattern = "numbered list formats";
      }

      const viewsPerVideo = avgViews;
      const potentialViewsPerVideo = topAvgViews;
      const nextVideosCount = 5;
      const impactPerVideo = potentialViewsPerVideo - viewsPerVideo;
      const totalImpact = impactPerVideo * nextVideosCount;
      const monthlyLongs = last30Long || Math.max(1, longs.length / 3);
      const impactPercent = Math.round((totalImpact / (avgViews * monthlyLongs)) * 100);

      actions.push({
        priority: "high",
        icon: "\u{1F3AC}",
        contentType: "long",
        title: "Replicate Top-Performing Long-Form Formula",
        description: `Top 20% of long-form videos average ${fmtInt(topAvgViews)} views vs overall avg ${fmtInt(avgViews)}`,
        action: `Study top ${top20Pct.length} videos - identify ${pattern} and apply to next 5 uploads`,
        reason: "Replicating proven winners is the fastest path to consistent growth.",
        impact: { viewsPerMonth: totalImpact, percentIncrease: impactPercent },
        examples: [
          formatVideoExample(top20Pct[0], `\u2713 TOP PERFORMER (${pattern})`),
          formatVideoExample(top20Pct[1], `\u2713 TOP PERFORMER (${pattern})`),
          formatVideoExample(bottom20Pct[0], "\u2717 UNDERPERFORMING")
        ]
      });
    }
  }

  // 6. RETENTION OPTIMIZATION - SHORTS
  if (shorts.length >= 5) {
    const avgRetention = shorts.reduce((sum, r) => sum + (r.retention || 0), 0) / shorts.length;
    const sortedByRetention = [...shorts].sort((a, b) => (b.retention || 0) - (a.retention || 0));
    const top20PctRetention = sortedByRetention.slice(0, Math.ceil(shorts.length * 0.2));
    const topAvgRetention = top20PctRetention.reduce((sum, r) => sum + (r.retention || 0), 0) / top20PctRetention.length;
    const bottom20PctRetention = sortedByRetention.slice(Math.floor(shorts.length * 0.8));

    if (avgRetention > 0 && avgRetention < topAvgRetention * 0.85) {
      actions.push({
        priority: "medium",
        icon: "\u{1F4F1}",
        contentType: "short",
        title: "Improve Shorts Viewer Retention",
        description: `Shorts retention ${fmtPct(avgRetention)} vs top performers ${fmtPct(topAvgRetention)}`,
        action: "Analyze hooks in top 20% Shorts - first 3 seconds are critical",
        reason: "Better retention on Shorts drives 40-60% more algorithmic recommendations.",
        examples: [
          formatVideoExample(sortedByRetention[0], "\u2713 STRONG HOOK"),
          formatVideoExample(bottom20PctRetention[0], "\u2717 WEAK HOOK")
        ]
      });
    }
  }

  // 7. RETENTION OPTIMIZATION - LONG-FORM
  if (longs.length >= 5) {
    const avgRetention = longs.reduce((sum, r) => sum + (r.retention || 0), 0) / longs.length;
    const sortedByRetention = [...longs].sort((a, b) => (b.retention || 0) - (a.retention || 0));
    const top20PctRetention = sortedByRetention.slice(0, Math.ceil(longs.length * 0.2));
    const topAvgRetention = top20PctRetention.reduce((sum, r) => sum + (r.retention || 0), 0) / top20PctRetention.length;
    const bottom20PctRetention = sortedByRetention.slice(Math.floor(longs.length * 0.8));

    if (avgRetention > 0 && avgRetention < topAvgRetention * 0.85) {
      actions.push({
        priority: "medium",
        icon: "\u{1F3AC}",
        contentType: "long",
        title: "Improve Long-Form Viewer Retention",
        description: `Long-form retention ${fmtPct(avgRetention)} vs top performers ${fmtPct(topAvgRetention)}`,
        action: "Analyze hooks in top 20% long-form videos - apply pattern to next 5 uploads",
        reason: "Better retention on long-form drives 40-60% more algorithmic recommendations.",
        examples: [
          formatVideoExample(sortedByRetention[0], "\u2713 STRONG HOOK"),
          formatVideoExample(bottom20PctRetention[0], "\u2717 WEAK HOOK")
        ]
      });
    }
  }

  // 8. ELIMINATE BOTTOM PERFORMERS
  const viewsPerVideo = rows.reduce((sum, r) => sum + r.views, 0) / rows.length;
  const sortedByViews = [...rows].sort((a, b) => a.views - b.views);
  const bottom20Pct = sortedByViews.slice(0, Math.ceil(rows.length * 0.2));
  const top20PctViews = sortedByViews.slice(Math.floor(rows.length * 0.8));
  const bottomAvgViews = bottom20Pct.reduce((sum, r) => sum + r.views, 0) / bottom20Pct.length;

  if (bottom20Pct.length >= 5 && bottomAvgViews < viewsPerVideo * 0.4) {
    const bottomAvgCTR = bottom20Pct.reduce((sum, r) => sum + (r.ctr || 0), 0) / bottom20Pct.length;
    const bottomAvgRetention = bottom20Pct.reduce((sum, r) => sum + (r.retention || 0), 0) / bottom20Pct.length;

    let antiPattern = "unclear hooks and weak packaging";
    if (bottomAvgCTR < 0.02) {
      antiPattern = "poor thumbnails and titles (very low CTR)";
    } else if (bottomAvgRetention < 0.3) {
      antiPattern = "weak hooks and poor pacing (low retention)";
    }

    actions.push({
      priority: "medium",
      icon: "\u{1F6AB}",
      title: "Avoid Bottom-Performer Patterns",
      description: `Bottom 20% average only ${fmtInt(bottomAvgViews)} views (${Math.round(((1 - bottomAvgViews / viewsPerVideo) * 100))}% below avg)`,
      action: `Review bottom ${bottom20Pct.length} videos - identify ${antiPattern} and avoid in future content`,
      reason: "Learning what NOT to do is as valuable as replicating winners.",
      examples: [
        formatVideoExample(top20PctViews[top20PctViews.length - 1], "\u2713 HIGH PERFORMER"),
        formatVideoExample(bottom20Pct[0], `\u2717 AVOID (${antiPattern})`),
        formatVideoExample(bottom20Pct[1], `\u2717 AVOID (${antiPattern})`)
      ]
    });
  }

  // 9. SHORTS VS LONG-FORM BALANCE
  if (shorts.length > 0 && longs.length > 0) {
    const shortsAvgViews = shorts.reduce((s, r) => s + r.views, 0) / shorts.length;
    const longsAvgViews = longs.reduce((s, r) => s + r.views, 0) / longs.length;
    const shortsRatio = shorts.length / (shorts.length + longs.length);

    if (shortsAvgViews > longsAvgViews * 1.5 && shortsRatio < 0.4) {
      const topShort = [...shorts].sort((a, b) => b.views - a.views)[0];
      actions.push({
        priority: "medium",
        icon: "\u{1F4F1}",
        contentType: "short",
        title: "Increase Shorts Production",
        description: `Shorts averaging ${fmtInt(shortsAvgViews)} views vs long-form ${fmtInt(longsAvgViews)} (${Math.round(((shortsAvgViews / longsAvgViews - 1) * 100))}% better)`,
        action: `Shift ratio from ${Math.round(shortsRatio * 100)}% to 50% Shorts`,
        reason: "Shorts are outperforming long-form\u2014increase frequency to maximize reach.",
        examples: [formatVideoExample(topShort, "\u2713 TOP SHORT")]
      });
    } else if (longsAvgViews > shortsAvgViews * 1.5 && shortsRatio > 0.6) {
      const topLong = [...longs].sort((a, b) => b.views - a.views)[0];
      actions.push({
        priority: "medium",
        icon: "\u{1F3AC}",
        contentType: "long",
        title: "Increase Long-Form Production",
        description: `Long-form averaging ${fmtInt(longsAvgViews)} views vs Shorts ${fmtInt(shortsAvgViews)} (${Math.round(((longsAvgViews / shortsAvgViews - 1) * 100))}% better)`,
        action: `Shift ratio from ${Math.round((1 - shortsRatio) * 100)}% to 50% long-form`,
        reason: "Long-form is outperforming Shorts\u2014increase frequency for better results.",
        examples: [formatVideoExample(topLong, "\u2713 TOP LONG-FORM")]
      });
    }
  }

  // 10. HIGH RETENTION, LOW CTR VIDEOS
  const highRetentionLowCTR = rows.filter(r =>
    (r.retention || 0) > 0.5 && (r.ctr || 0) < 0.04 && (r.impressions || 0) > 1000
  );
  if (highRetentionLowCTR.length > 0) {
    const sortedByRetention = [...highRetentionLowCTR].sort((a, b) => (b.retention || 0) - (a.retention || 0));
    const bestRetentionWorstCTR = sortedByRetention[0];
    const sortedByCTR = [...rows].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
    const bestCTRExample = sortedByCTR.find(v => (v.retention || 0) > 0.4) || sortedByCTR[0];

    actions.push({
      priority: "high",
      icon: "\u{1F48E}",
      title: "Fix Packaging on High-Quality Videos",
      description: `${highRetentionLowCTR.length} videos have great retention (${fmtPct(bestRetentionWorstCTR.retention)}) but low CTR (${fmtPct(bestRetentionWorstCTR.ctr)})`,
      action: `Replace thumbnails/titles on these ${highRetentionLowCTR.length} videos - the content is already working`,
      reason: "These videos prove the content quality is there. Better packaging could 3-5x their views.",
      examples: [
        formatVideoExample(bestCTRExample, "\u2713 GOOD PACKAGING"),
        formatVideoExample(bestRetentionWorstCTR, "\u2717 GREAT CONTENT, BAD PACKAGING")
      ]
    });
  }

  // 11. HIGH IMPRESSION, LOW CTR VIDEOS
  const highImpressionLowCTR = rows.filter(r => r.impressions > 5000 && r.ctr < 0.03);
  if (highImpressionLowCTR.length > 0) {
    const totalMissedViews = highImpressionLowCTR.reduce((sum, v) => sum + (v.impressions * (0.05 - v.ctr)), 0);
    const sortedByCTR = [...rows].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
    const bestCTR = sortedByCTR[0];
    const worstHighImpression = [...highImpressionLowCTR].sort((a, b) => a.ctr - b.ctr)[0];

    const top3HighImpression = [...highImpressionLowCTR].sort((a, b) => b.impressions - a.impressions).slice(0, 3);
    const potentialNewViews = top3HighImpression.reduce((sum, v) => sum + (v.impressions * (0.05 - v.ctr)), 0);
    const totalMonthlyViews = rows.reduce((sum, r) => sum + r.views, 0) / Math.max(1, rows.length / 10);
    const impactPercent = Math.round((potentialNewViews / totalMonthlyViews) * 100);

    actions.push({
      priority: "high",
      icon: "\u{1F50D}",
      title: "Refresh Thumbnails on High-Impression Videos",
      description: `${highImpressionLowCTR.length} videos with ${fmtInt(totalMissedViews)} potential missed views`,
      action: "Update thumbnails on top 3 underperforming videos with high impressions",
      reason: "Algorithm already favors these videos\u2014better CTR could unlock massive view gains.",
      impact: { viewsPerMonth: potentialNewViews, percentIncrease: impactPercent },
      examples: [
        formatVideoExample(bestCTR, "\u2713 HIGH CTR EXAMPLE"),
        formatVideoExample(worstHighImpression, "\u2717 NEEDS NEW THUMBNAIL")
      ]
    });
  }

  // Sort by impact (highest first), then by priority
  const priorityOrder = { high: 1, medium: 2, low: 3 };
  actions.sort((a, b) => {
    if (a.impact && b.impact) return (b.impact.viewsPerMonth || 0) - (a.impact.viewsPerMonth || 0);
    if (a.impact) return -1;
    if (b.impact) return 1;
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return actions.slice(0, 10);
}

// ─── 2. Fetch Competitor Opportunities ──────────────────────────────────────

export async function fetchCompetitorOpportunities(clientId) {
  if (!clientId) return [];

  try {
    const { getChannels } = await import('./competitorDatabase');
    const { getOutlierVideos } = await import('./competitorInsightsService');
    const { supabase } = await import('./supabaseClient');

    const competitors = await getChannels({ isCompetitor: true, clientId });
    if (!competitors || competitors.length === 0) return [];

    const channelIds = competitors.map(c => c.id);
    const outliers = await getOutlierVideos({ channelIds, days: 90, limit: 20 });
    if (!outliers || outliers.length === 0) return [];

    // Batch-fetch cached insights
    const videoIds = outliers.map(o => o.id);
    const { data: insights } = await supabase
      .from('competitor_insights')
      .select('video_id, insight_data')
      .in('video_id', videoIds)
      .eq('insight_type', 'full_analysis');

    const insightMap = {};
    (insights || []).forEach(row => { insightMap[row.video_id] = row.insight_data; });

    return outliers.map(outlier => ({
      ...outlier,
      insight: insightMap[outlier.id] || null,
    }));
  } catch (err) {
    console.warn('[OpportunityService] Competitor fetch failed:', err.message);
    return [];
  }
}

// ─── 3. Fetch Audit Opportunities ───────────────────────────────────────────

export async function fetchAuditOpportunities(clientId) {
  if (!clientId) return null;

  try {
    const { supabase } = await import('./supabaseClient');
    const { listAudits } = await import('./auditDatabase');

    // Find client channel(s)
    const { data: clientChannels } = await supabase
      .from('channels')
      .select('id')
      .eq('is_client', true)
      .eq('client_id', clientId);

    if (!clientChannels || clientChannels.length === 0) return null;

    for (const channel of clientChannels) {
      const audits = await listAudits({ channel_id: channel.id, status: 'completed', limit: 1 });
      if (audits.length > 0 && audits[0].opportunities) {
        return audits[0].opportunities;
      }
    }

    return null;
  } catch (err) {
    console.warn('[OpportunityService] Audit fetch failed:', err.message);
    return null;
  }
}

// ─── 4. Normalization + Scoring ─────────────────────────────────────────────

const IMPACT_WEIGHTS = { high: 1.0, medium: 0.6, low: 0.3 };
const CONFIDENCE_WEIGHTS = { high: 1.0, medium: 0.6, low: 0.3 };
const EFFORT_INVERSE = { low: 1.0, medium: 0.6, high: 0.3 };

function computeScore(impact, confidence, effort) {
  const impactW = IMPACT_WEIGHTS[impact] || 0.5;
  const confidenceW = CONFIDENCE_WEIGHTS[confidence] || 0.5;
  const effortInv = EFFORT_INVERSE[effort] || 0.5;
  return impactW * 0.4 + confidenceW * 0.3 + effortInv * 0.3;
}

export function normalizeDiagnosticItems(actionItems) {
  return actionItems.map((item, i) => ({
    id: `diag-${i}`,
    title: item.title,
    source: 'diagnostics',
    sourceLabel: 'Diagnostic Engine',
    action: item.action,
    evidence: item.description,
    format: item.contentType === 'short' ? 'short' : item.contentType === 'long' ? 'long' : null,
    impact: item.priority === 'high' ? 'high' : item.priority === 'medium' ? 'medium' : 'low',
    confidence: item.impact ? 'high' : 'medium',
    effort: item.priority === 'high' ? 'low' : 'medium',
    score: 0,
    rawData: item,
  }));
}

export function normalizeCompetitorItems(outliersWithInsights) {
  return outliersWithInsights
    .filter(o => o.insight)
    .map((outlier) => ({
      id: `comp-${outlier.id}`,
      title: `Replicate: "${outlier.title}"`,
      source: 'competitor',
      sourceLabel: 'Competitor Analysis',
      action: outlier.insight.applicableTactics?.join('; ') || outlier.insight.contentAngle || 'Study and replicate this format',
      evidence: `${outlier.channel?.name}: ${outlier.view_count?.toLocaleString()} views (${outlier.outlierScore}x channel avg). ${outlier.insight.whyItWorked || ''}`,
      format: outlier.video_type === 'short' ? 'short' : 'long',
      impact: outlier.outlierScore >= 5 ? 'high' : outlier.outlierScore >= 3 ? 'medium' : 'low',
      confidence: outlier.insight.replicability === 'high' ? 'high' : outlier.insight.replicability === 'medium' ? 'medium' : 'low',
      effort: outlier.insight.replicability === 'high' ? 'low' : 'medium',
      score: 0,
      rawData: { outlier, insight: outlier.insight },
    }));
}

export function normalizeAuditItems(auditOpportunities) {
  if (!auditOpportunities) return [];

  const items = [];

  (auditOpportunities.content_gaps || []).forEach((gap, i) => {
    items.push({
      id: `audit-gap-${i}`,
      title: gap.gap,
      source: 'audit',
      sourceLabel: 'Channel Audit',
      action: gap.suggested_action,
      evidence: gap.evidence,
      format: gap.format === 'long_form' ? 'long' : gap.format === 'short_form' ? 'short' : gap.format === 'both' ? 'both' : null,
      impact: gap.potential_impact || 'medium',
      confidence: 'medium',
      effort: 'medium',
      score: 0,
      rawData: gap,
    });
  });

  (auditOpportunities.growth_levers || []).forEach((lever, i) => {
    items.push({
      id: `audit-lever-${i}`,
      title: lever.lever,
      source: 'audit',
      sourceLabel: 'Channel Audit',
      action: `Move from: "${lever.current_state}" to: "${lever.target_state}"`,
      evidence: lever.evidence,
      format: lever.format === 'long_form' ? 'long' : lever.format === 'short_form' ? 'short' : lever.format === 'both' ? 'both' : null,
      impact: lever.priority || 'medium',
      confidence: 'medium',
      effort: 'medium',
      score: 0,
      rawData: lever,
    });
  });

  return items;
}

function scoreAndRank(items) {
  return items
    .map(item => ({ ...item, score: computeScore(item.impact, item.confidence, item.effort) }))
    .sort((a, b) => b.score - a.score);
}

// ─── 5. Orchestrator ────────────────────────────────────────────────────────

export async function synthesizeOpportunities(rows, clientId) {
  // 1. Diagnostic items (synchronous)
  const actionItems = generateActionItems(rows);
  const diagnosticItems = normalizeDiagnosticItems(actionItems);

  // 2. Competitor items (async)
  const outliers = await fetchCompetitorOpportunities(clientId);
  const competitorItems = normalizeCompetitorItems(outliers);

  // 3. Audit items (async)
  const auditOps = await fetchAuditOpportunities(clientId);
  const auditItems = normalizeAuditItems(auditOps);

  // 4. Combine, score, rank
  const allItems = [...diagnosticItems, ...competitorItems, ...auditItems];
  const ranked = scoreAndRank(allItems);

  return {
    opportunities: ranked,
    sources: {
      diagnostics: { count: diagnosticItems.length, available: rows && rows.length > 0 },
      competitor: { count: competitorItems.length, available: competitorItems.length > 0 },
      audit: { count: auditItems.length, available: auditItems.length > 0 },
    },
  };
}
