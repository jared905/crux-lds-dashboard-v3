import React, { useMemo } from "react";
import { CheckCircle2, Circle, ChevronDown, Video, Film } from "lucide-react";
import DiagnosticEngine from "./DiagnosticEngine.jsx";
import ContentPerformanceTiers from "./ContentPerformanceTiers.jsx";
import GrowKillMatrix from "./GrowKillMatrix.jsx";
import GrowthSimulator from "./GrowthSimulator.jsx";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

/**
 * Unified Strategy Component
 * Combines Diagnostics + Strategist + Dynamic Action Items
 * Creates a clear narrative: What to do next and in what order
 */
export default function UnifiedStrategy({ rows, activeClient, channelSubscriberCount = 0 }) {
  // Generate action items from GROW quadrant patterns
  const actionItems = useMemo(() => {
    if (!rows || rows.length === 0) return [];

    // We'll derive these from the diagnostic patterns
    // For now, return empty array and let DiagnosticEngine handle the patterns
    return [];
  }, [rows]);

  return (
    <div style={{ padding: "0" }}>
      {/* 1. EXECUTIVE SUMMARY - Already in DiagnosticEngine */}

      {/* 2. ACTION ITEMS - Dynamic from GROW quadrant */}
      <ActionItemsSection rows={rows} />

      {/* 3. PROJECTED GROWTH CHART - Visual motivation */}
      <GrowthSimulator rows={rows} currentSubscribers={channelSubscriberCount} />

      {/* 4-7. REST OF STRATEGY - Handled by DiagnosticEngine */}
      <DiagnosticEngine rows={rows} />

      {/* 8. CONTENT PERFORMANCE TIERS - Evidence layer */}
      <ContentPerformanceTiers rows={rows} />
    </div>
  );
}

/**
 * Action Items Section
 * Dynamically generated from top GROW quadrant items
 */
function ActionItemsSection({ rows }) {
  const [showAll, setShowAll] = React.useState(false);

  const actionItems = useMemo(() => {
    if (!rows || rows.length === 0) return [];

    // Calculate basic metrics for action items
    const actions = [];

    // Helper to format video examples
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
    const prev30Shorts = days3060.filter(v => v.type === 'short').length;
    const prev30Long = days3060.filter(v => v.type === 'long').length;

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
        icon: "📉",
        title: "Upload Frequency Declining",
        description: `${last30Days.length} uploads in last 30 days vs ${days3060.length} in previous 30 days (${dropPct}% decrease)`,
        action: `Return to ${days3060.length} uploads/month pace`,
        reason: "Algorithm favors consistent publishers—upload frequency directly correlates with 2-3x higher recommended reach.",
        impact: {
          viewsPerMonth: estimatedViewImpact,
          percentIncrease: impactPercent
        }
      });
    }

    // Separate Shorts and Long-form for format-specific analysis
    const shorts = rows.filter(r => r.type === 'short');
    const longs = rows.filter(r => r.type === 'long');

    // Common words to exclude from topic analysis (expanded list)
    const commonWords = new Set([
      'about', 'after', 'again', 'before', 'being', 'could', 'doing', 'every',
      'first', 'found', 'going', 'great', 'having', 'learn', 'makes', 'never',
      'other', 'really', 'should', 'still', 'their', 'there', 'these', 'thing',
      'things', 'think', 'those', 'through', 'until', 'using', 'wants', 'watch',
      'where', 'which', 'while', 'world', 'would', 'years', 'your', 'south',
      'north', 'east', 'west', 'when', 'what', 'how', 'why', 'who', 'been',
      'have', 'will', 'can', 'may', 'also', 'just', 'like', 'more', 'some',
      'time', 'very', 'then', 'into', 'only', 'over', 'such', 'take', 'than',
      'them', 'they', 'this', 'that', 'with', 'from', 'video', 'episode'
    ]);

    // Helper to extract meaningful topics from titles
    const extractTopics = (videos) => {
      const titleWords = {};
      videos.forEach(r => {
        const words = r.title.toLowerCase()
          .split(/\s+/)
          .map(w => w.replace(/[^a-z]/g, ''))
          .filter(w => w.length > 4 && !commonWords.has(w));

        words.forEach(word => {
          if (!titleWords[word]) titleWords[word] = [];
          titleWords[word].push(r);
        });
      });
      return titleWords;
    };

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
          icon: "📱",
          contentType: "short",
          title: "Improve Shorts Thumbnail & Title Packaging",
          description: `Shorts CTR ${fmtPct(avgCTR)} vs top performers ${fmtPct(topAvgCTR)}`,
          action: "A/B test 3 thumbnail styles on next 5 Shorts matching top performers",
          reason: "Better packaging on Shorts could unlock significant views from existing impressions.",
          examples: [
            formatVideoExample(bestExample, "✓ WORKING"),
            formatVideoExample(worstExample, "✗ NEEDS WORK")
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
          icon: "🎬",
          contentType: "long",
          title: "Improve Long-Form Thumbnail & Title Packaging",
          description: `Long-form CTR ${fmtPct(avgCTR)} vs top performers ${fmtPct(topAvgCTR)}`,
          action: "A/B test 3 thumbnail styles on next 5 long-form videos matching top performers",
          reason: "Better packaging on long-form could unlock significant views from existing impressions.",
          examples: [
            formatVideoExample(bestExample, "✓ WORKING"),
            formatVideoExample(worstExample, "✗ NEEDS WORK")
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
        // Analyze top performers for common patterns
        const topTitles = top20Pct.map(v => v.title).join(' ').toLowerCase();
        let pattern = "successful formula";

        if ((topTitles.match(/\?/g) || []).length > top20Pct.length * 0.5) {
          pattern = "question-based hooks";
        } else if ((topTitles.match(/\d+/g) || []).length > top20Pct.length * 0.5) {
          pattern = "numbered list formats";
        }

        // Calculate impact: If next 5 Shorts match top 20% performance
        const viewsPerShort = avgViews;
        const potentialViewsPerShort = topAvgViews;
        const nextShortsCount = 5;
        const impactPerVideo = potentialViewsPerShort - viewsPerShort;
        const totalImpact = impactPerVideo * nextShortsCount;
        const monthlyShorts = last30Shorts || Math.max(1, shorts.length / 3); // Estimate monthly Shorts
        const impactPercent = Math.round((totalImpact / (avgViews * monthlyShorts)) * 100);

        actions.push({
          priority: "high",
          icon: "📱",
          contentType: "short",
          title: "Replicate Top-Performing Shorts Formula",
          description: `Top 20% of Shorts average ${fmtInt(topAvgViews)} views vs overall avg ${fmtInt(avgViews)}`,
          action: `Study top ${top20Pct.length} Shorts - identify ${pattern} and apply to next 5 Shorts`,
          reason: "Replicating proven winners is the fastest path to consistent results.",
          impact: {
            viewsPerMonth: totalImpact,
            percentIncrease: impactPercent
          },
          examples: [
            formatVideoExample(top20Pct[0], `✓ TOP PERFORMER (${pattern})`),
            formatVideoExample(top20Pct[1], `✓ TOP PERFORMER (${pattern})`),
            formatVideoExample(bottom20Pct[0], "✗ UNDERPERFORMING")
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
        // Analyze top performers for common patterns
        const topTitles = top20Pct.map(v => v.title).join(' ').toLowerCase();
        let pattern = "successful formula";

        if ((topTitles.match(/\?/g) || []).length > top20Pct.length * 0.5) {
          pattern = "question-based hooks";
        } else if ((topTitles.match(/how to/gi) || []).length > top20Pct.length * 0.3) {
          pattern = "how-to tutorials";
        } else if ((topTitles.match(/\d+/g) || []).length > top20Pct.length * 0.5) {
          pattern = "numbered list formats";
        }

        // Calculate impact: If next 5 long-form videos match top 20% performance
        const viewsPerVideo = avgViews;
        const potentialViewsPerVideo = topAvgViews;
        const nextVideosCount = 5;
        const impactPerVideo = potentialViewsPerVideo - viewsPerVideo;
        const totalImpact = impactPerVideo * nextVideosCount;
        const monthlyLongs = last30Long || Math.max(1, longs.length / 3); // Estimate monthly long-form
        const impactPercent = Math.round((totalImpact / (avgViews * monthlyLongs)) * 100);

        actions.push({
          priority: "high",
          icon: "🎬",
          contentType: "long",
          title: "Replicate Top-Performing Long-Form Formula",
          description: `Top 20% of long-form videos average ${fmtInt(topAvgViews)} views vs overall avg ${fmtInt(avgViews)}`,
          action: `Study top ${top20Pct.length} videos - identify ${pattern} and apply to next 5 uploads`,
          reason: "Replicating proven winners is the fastest path to consistent growth.",
          impact: {
            viewsPerMonth: totalImpact,
            percentIncrease: impactPercent
          },
          examples: [
            formatVideoExample(top20Pct[0], `✓ TOP PERFORMER (${pattern})`),
            formatVideoExample(top20Pct[1], `✓ TOP PERFORMER (${pattern})`),
            formatVideoExample(bottom20Pct[0], "✗ UNDERPERFORMING")
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
        const bestExample = top20PctRetention[0];
        const worstExample = bottom20PctRetention[0];

        actions.push({
          priority: "medium",
          icon: "📱",
          contentType: "short",
          title: "Improve Shorts Viewer Retention",
          description: `Shorts retention ${fmtPct(avgRetention)} vs top performers ${fmtPct(topAvgRetention)}`,
          action: "Analyze hooks in top 20% Shorts - first 3 seconds are critical",
          reason: "Better retention on Shorts drives 40-60% more algorithmic recommendations.",
          examples: [
            formatVideoExample(bestExample, "✓ STRONG HOOK"),
            formatVideoExample(worstExample, "✗ WEAK HOOK")
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
        const bestExample = top20PctRetention[0];
        const worstExample = bottom20PctRetention[0];

        actions.push({
          priority: "medium",
          icon: "🎬",
          contentType: "long",
          title: "Improve Long-Form Viewer Retention",
          description: `Long-form retention ${fmtPct(avgRetention)} vs top performers ${fmtPct(topAvgRetention)}`,
          action: "Analyze hooks in top 20% long-form videos - apply pattern to next 5 uploads",
          reason: "Better retention on long-form drives 40-60% more algorithmic recommendations.",
          examples: [
            formatVideoExample(bestExample, "✓ STRONG HOOK"),
            formatVideoExample(worstExample, "✗ WEAK HOOK")
          ]
        });
      }
    }

    // 8. ELIMINATE BOTTOM PERFORMERS - Pattern-based
    const viewsPerVideo = rows.reduce((sum, r) => sum + r.views, 0) / rows.length;
    const sortedByViews = [...rows].sort((a, b) => a.views - b.views);
    const bottom20Pct = sortedByViews.slice(0, Math.ceil(rows.length * 0.2));
    const top20PctViews = sortedByViews.slice(Math.floor(rows.length * 0.8));
    const bottomAvgViews = bottom20Pct.reduce((sum, r) => sum + r.views, 0) / bottom20Pct.length;

    if (bottom20Pct.length >= 5 && bottomAvgViews < viewsPerVideo * 0.4) {
      // Analyze bottom performers for common anti-patterns
      const bottomTitles = bottom20Pct.map(v => v.title).join(' ').toLowerCase();
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
        icon: "🚫",
        title: "Avoid Bottom-Performer Patterns",
        description: `Bottom 20% average only ${fmtInt(bottomAvgViews)} views (${Math.round(((1 - bottomAvgViews/viewsPerVideo) * 100))}% below avg)`,
        action: `Review bottom ${bottom20Pct.length} videos - identify ${antiPattern} and avoid in future content`,
        reason: "Learning what NOT to do is as valuable as replicating winners.",
        examples: [
          formatVideoExample(top20PctViews[top20PctViews.length - 1], "✓ HIGH PERFORMER"),
          formatVideoExample(bottom20Pct[0], `✗ AVOID (${antiPattern})`),
          formatVideoExample(bottom20Pct[1], `✗ AVOID (${antiPattern})`)
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
          icon: "📱",
          contentType: "short",
          title: "Increase Shorts Production",
          description: `Shorts averaging ${fmtInt(shortsAvgViews)} views vs long-form ${fmtInt(longsAvgViews)} (${Math.round(((shortsAvgViews/longsAvgViews - 1) * 100))}% better)`,
          action: `Shift ratio from ${Math.round(shortsRatio * 100)}% to 50% Shorts`,
          reason: "Shorts are outperforming long-form—increase frequency to maximize reach.",
          examples: [
            formatVideoExample(topShort, "✓ TOP SHORT")
          ]
        });
      } else if (longsAvgViews > shortsAvgViews * 1.5 && shortsRatio > 0.6) {
        const topLong = [...longs].sort((a, b) => b.views - a.views)[0];

        actions.push({
          priority: "medium",
          icon: "🎬",
          contentType: "long",
          title: "Increase Long-Form Production",
          description: `Long-form averaging ${fmtInt(longsAvgViews)} views vs Shorts ${fmtInt(shortsAvgViews)} (${Math.round(((longsAvgViews/shortsAvgViews - 1) * 100))}% better)`,
          action: `Shift ratio from ${Math.round((1 - shortsRatio) * 100)}% to 50% long-form`,
          reason: "Long-form is outperforming Shorts—increase frequency for better results.",
          examples: [
            formatVideoExample(topLong, "✓ TOP LONG-FORM")
          ]
        });
      }
    }

    // 10. HIGH RETENTION, LOW CTR VIDEOS (Great content, bad packaging)
    const highRetentionLowCTR = rows.filter(r =>
      (r.retention || 0) > 0.5 && // Good retention (50%+)
      (r.ctr || 0) < 0.04 && // Low CTR (4%)
      (r.impressions || 0) > 1000 // Minimum impressions
    );
    if (highRetentionLowCTR.length > 0) {
      const sortedByRetention = [...highRetentionLowCTR].sort((a, b) => (b.retention || 0) - (a.retention || 0));
      const bestRetentionWorstCTR = sortedByRetention[0];
      const sortedByCTR = [...rows].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
      const bestCTRExample = sortedByCTR.find(v => (v.retention || 0) > 0.4) || sortedByCTR[0];

      actions.push({
        priority: "high",
        icon: "💎",
        title: "Fix Packaging on High-Quality Videos",
        description: `${highRetentionLowCTR.length} videos have great retention (${fmtPct(bestRetentionWorstCTR.retention)}) but low CTR (${fmtPct(bestRetentionWorstCTR.ctr)})`,
        action: `Replace thumbnails/titles on these ${highRetentionLowCTR.length} videos - the content is already working`,
        reason: "These videos prove the content quality is there. Better packaging could 3-5x their views.",
        examples: [
          formatVideoExample(bestCTRExample, "✓ GOOD PACKAGING"),
          formatVideoExample(bestRetentionWorstCTR, "✗ GREAT CONTENT, BAD PACKAGING")
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

      // Calculate monthly impact: If CTR improves from current to 5% on top 3 videos
      const top3HighImpression = [...highImpressionLowCTR].sort((a, b) => b.impressions - a.impressions).slice(0, 3);
      const potentialNewViews = top3HighImpression.reduce((sum, v) => sum + (v.impressions * (0.05 - v.ctr)), 0);
      const totalMonthlyViews = rows.reduce((sum, r) => sum + r.views, 0) / Math.max(1, rows.length / 10); // Approx monthly
      const impactPercent = Math.round((potentialNewViews / totalMonthlyViews) * 100);

      actions.push({
        priority: "high",
        icon: "🔍",
        title: "Refresh Thumbnails on High-Impression Videos",
        description: `${highImpressionLowCTR.length} videos with ${fmtInt(totalMissedViews)} potential missed views`,
        action: "Update thumbnails on top 3 underperforming videos with high impressions",
        reason: "Algorithm already favors these videos—better CTR could unlock massive view gains.",
        impact: {
          viewsPerMonth: potentialNewViews,
          percentIncrease: impactPercent
        },
        examples: [
          formatVideoExample(bestCTR, "✓ HIGH CTR EXAMPLE"),
          formatVideoExample(worstHighImpression, "✗ NEEDS NEW THUMBNAIL")
        ]
      });
    }

    // Sort by impact (highest first), then by priority
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    actions.sort((a, b) => {
      // If both have impact data, sort by impact
      if (a.impact && b.impact) {
        return (b.impact.viewsPerMonth || 0) - (a.impact.viewsPerMonth || 0);
      }
      // If only one has impact, prioritize it
      if (a.impact) return -1;
      if (b.impact) return 1;
      // Otherwise sort by priority
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return actions.slice(0, 10);
  }, [rows]);

  if (actionItems.length === 0) return null;

  const priorityColors = {
    high: { bg: "rgba(239, 68, 68, 0.1)", border: "#ef4444", text: "#ef4444" },
    medium: { bg: "rgba(245, 158, 11, 0.1)", border: "#f59e0b", text: "#f59e0b" },
    low: { bg: "rgba(59, 130, 246, 0.1)", border: "#3b82f6", text: "#3b82f6" }
  };

  return (
    <div style={{
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "24px",
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Top gradient */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "4px",
        background: "linear-gradient(90deg, #f59e0b, #ef4444, #ec4899)"
      }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>⚡ Action Items</div>
        <div style={{
          fontSize: "12px",
          color: "#9E9E9E",
          background: "#252525",
          padding: "4px 10px",
          borderRadius: "6px"
        }}>
          AI-generated recommendations
        </div>
      </div>

      {/* Action Items List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {(showAll ? actionItems : actionItems.slice(0, 3)).map((item, idx) => {
          const colors = priorityColors[item.priority];
          return (
            <div key={idx} style={{
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderLeft: `4px solid ${colors.border}`,
              borderRadius: "8px",
              padding: "16px"
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "8px" }}>
                <div style={{ fontSize: "24px", lineHeight: "1" }}>{item.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>
                      {item.title}
                    </div>
                    {item.contentType && (
                      <div style={{
                        fontSize: "10px",
                        fontWeight: "700",
                        textTransform: "uppercase",
                        color: item.contentType === "short" ? "#fb923c" : "#60a5fa",
                        background: item.contentType === "short" ? "rgba(251, 146, 60, 0.1)" : "rgba(96, 165, 250, 0.1)",
                        border: `1px solid ${item.contentType === "short" ? "#fb923c" : "#60a5fa"}`,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}>
                        {item.contentType === "short" ? (
                          <>
                            <Video width={10} height={10} strokeWidth={2} />
                            <span>SHORT</span>
                          </>
                        ) : (
                          <>
                            <Film width={10} height={10} strokeWidth={2} />
                            <span>LONG-FORM</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: "13px", color: "#E0E0E0", marginBottom: "8px" }}>
                    {item.description}
                  </div>
                  <div style={{
                    fontSize: "13px",
                    color: colors.text,
                    background: "#1E1E1E",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    marginTop: "8px",
                    fontWeight: "600"
                  }}>
                    → {item.action}
                  </div>

                  {/* Impact Estimate */}
                  {item.impact && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginTop: "12px",
                      padding: "10px 12px",
                      background: item.impact.percentIncrease > 20 ? "rgba(16, 185, 129, 0.1)" :
                                  item.impact.percentIncrease > 10 ? "rgba(251, 191, 36, 0.1)" : "rgba(107, 114, 128, 0.1)",
                      border: `1px solid ${item.impact.percentIncrease > 20 ? "#10b981" :
                                           item.impact.percentIncrease > 10 ? "#fbbf24" : "#6b7280"}`,
                      borderRadius: "6px"
                    }}>
                      <span style={{ fontSize: "12px", color: "#9ca3af", fontWeight: "600" }}>📈 ESTIMATED IMPACT:</span>
                      <span style={{
                        fontSize: "14px",
                        fontWeight: "700",
                        color: item.impact.percentIncrease > 20 ? "#10b981" :
                               item.impact.percentIncrease > 10 ? "#fbbf24" : "#6b7280"
                      }}>
                        +{fmtInt(item.impact.viewsPerMonth)} views/month
                      </span>
                      <span style={{ fontSize: "12px", color: "#6b7280" }}>
                        ({item.impact.percentIncrease}% increase)
                      </span>
                      {item.impact.percentIncrease > 20 && (
                        <span style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          textTransform: "uppercase",
                          color: "#10b981",
                          background: "rgba(16, 185, 129, 0.15)",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          marginLeft: "auto"
                        }}>
                          HIGH IMPACT
                        </span>
                      )}
                    </div>
                  )}

                  <div style={{
                    fontSize: "12px",
                    color: "#888",
                    marginTop: "8px",
                    fontStyle: "italic"
                  }}>
                    WHY: {item.reason}
                  </div>

                  {/* Video Examples */}
                  {item.examples && item.examples.length > 0 && (
                    <div style={{ marginTop: "12px", borderTop: "1px solid #333", paddingTop: "12px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "600", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Video Examples:
                      </div>
                      {item.examples.map((ex, exIdx) => (
                        <div key={exIdx} style={{
                          background: "#0a0a0a",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          marginBottom: "8px",
                          border: "1px solid #222"
                        }}>
                          <div style={{
                            color: ex.label.includes("✓") ? "#10b981" : "#ef4444",
                            fontWeight: "700",
                            marginBottom: "6px",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.3px"
                          }}>
                            {ex.label}
                          </div>
                          <div style={{ color: "#E0E0E0", marginBottom: "6px", fontSize: "13px", fontWeight: "500" }}>
                            {ex.title}
                          </div>
                          <div style={{ fontSize: "11px", color: "#666", display: "flex", gap: "12px" }}>
                            <span>{fmtInt(ex.views)} views</span>
                            <span>•</span>
                            <span>CTR: {fmtPct(ex.ctr)}</span>
                            <span>•</span>
                            <span>Retention: {fmtPct(ex.retention)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show More/Less Button */}
      {actionItems.length > 3 && (
        <div style={{
          marginTop: "16px",
          textAlign: "center"
        }}>
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              background: "#252525",
              border: "1px solid #333",
              borderRadius: "6px",
              padding: "10px 20px",
              color: "#E0E0E0",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#2a2a2a";
              e.currentTarget.style.borderColor = "#444";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#252525";
              e.currentTarget.style.borderColor = "#333";
            }}
          >
            {showAll ? (
              <>
                <ChevronDown size={16} style={{ transform: "rotate(180deg)" }} />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown size={16} />
                Show {actionItems.length - 3} More Action Items
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
