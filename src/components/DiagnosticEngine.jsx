import React, { useMemo } from "react";
import { AlertTriangle, TrendingUp, Zap, Target } from "lucide-react";
import GrowKillMatrix from "./GrowKillMatrix.jsx";
import ExecutiveSummary from "./ExecutiveSummary.jsx";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

export default function DiagnosticEngine({ rows }) {
  // Calculate channel benchmarks and identify constraints
  const diagnostics = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    // Calculate aggregate channel metrics
    const totalViews = rows.reduce((s, r) => s + (r.views || 0), 0);
    const totalImpressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
    const avgCTR = totalImpressions > 0
      ? rows.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / totalImpressions
      : 0;
    const avgRetention = totalViews > 0
      ? rows.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / totalViews
      : 0;
    const avgSubs = rows.reduce((s, r) => s + (r.subscribers || 0), 0) / rows.length;

    // Calculate benchmarks (top 20% performance)
    const sortedByCTR = [...rows].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
    const sortedByRetention = [...rows].sort((a, b) => (b.retention || 0) - (a.retention || 0));
    const top20Pct = Math.ceil(rows.length * 0.2);

    const benchmarkCTR = sortedByCTR.slice(0, top20Pct).reduce((s, r) => s + (r.ctr || 0), 0) / top20Pct;
    const benchmarkRetention = sortedByRetention.slice(0, top20Pct).reduce((s, r) => s + (r.retention || 0), 0) / top20Pct;

    // Industry benchmarks (hardcoded - can be customized per niche)
    const industryBenchmarks = {
      ctr: 0.05,        // 5% industry average CTR
      retention: 0.45,  // 45% industry average retention
      subsPerView: 0.005 // 0.5% subscriber conversion rate
    };

    // Calculate performance gaps
    const ctrGap = benchmarkCTR > 0 ? (avgCTR - benchmarkCTR) / benchmarkCTR : 0;
    const retentionGap = benchmarkRetention > 0 ? (avgRetention - benchmarkRetention) / benchmarkRetention : 0;
    const viewsPerVideo = totalViews / rows.length;

    // Identify primary constraint (what's holding growth back?)
    let primaryConstraint = "Discovery"; // Default
    let constraintSeverity = "Monitor";
    let constraintEvidence = "";

    if (ctrGap < -0.3) { // 30% below benchmark
      primaryConstraint = "Discovery (CTR)";
      constraintSeverity = "Critical";
      constraintEvidence = `Average CTR (${fmtPct(avgCTR)}) is ${Math.abs(ctrGap * 100).toFixed(0)}% below your top performers (${fmtPct(benchmarkCTR)}). Poor packaging is limiting impressions.`;
    } else if (retentionGap < -0.3) {
      primaryConstraint = "Retention (AVD)";
      constraintSeverity = "Critical";
      constraintEvidence = `Average retention (${fmtPct(avgRetention)}) is ${Math.abs(retentionGap * 100).toFixed(0)}% below your top performers (${fmtPct(benchmarkRetention)}). Content isn't holding attention.`;
    } else if (avgCTR < industryBenchmarks.ctr) {
      primaryConstraint = "Discovery (CTR)";
      constraintSeverity = "Warning";
      constraintEvidence = `CTR (${fmtPct(avgCTR)}) is below industry average (${fmtPct(industryBenchmarks.ctr)}). Thumbnails and titles need optimization.`;
    } else if (avgRetention < industryBenchmarks.retention) {
      primaryConstraint = "Retention";
      constraintSeverity = "Warning";
      constraintEvidence = `Retention (${fmtPct(avgRetention)}) is below industry average (${fmtPct(industryBenchmarks.retention)}). Content quality or pacing needs work.`;
    } else {
      primaryConstraint = "Velocity";
      constraintSeverity = "Monitor";
      constraintEvidence = "Core metrics are healthy. Focus on upload frequency and topic selection to scale.";
    }

    // Pattern detection: ACTIONABLE forward-looking strategic decisions
    const patterns = [];

    // PATTERN 1: Format Ecosystem Analysis - Pure data comparison
    const shorts = rows.filter(r => r.type === 'short');
    const longs = rows.filter(r => r.type === 'long');

    if (shorts.length >= 3 && longs.length >= 3) {
      // Individual format stats
      const shortsAvgViews = shorts.reduce((s, r) => s + r.views, 0) / shorts.length;
      const longsAvgViews = longs.reduce((s, r) => s + r.views, 0) / longs.length;

      const shortsAvgCTR = shorts.reduce((s, r) => s + (r.ctr || 0), 0) / shorts.length;
      const longsAvgCTR = longs.reduce((s, r) => s + (r.ctr || 0), 0) / longs.length;

      const shortsAvgRetention = shorts.reduce((s, r) => s + (r.retention || 0), 0) / shorts.length;
      const longsAvgRetention = longs.reduce((s, r) => s + (r.retention || 0), 0) / longs.length;

      const shortsAvgSubs = shorts.reduce((s, r) => s + (r.subscribers || 0), 0) / shorts.length;
      const longsAvgSubs = longs.reduce((s, r) => s + (r.subscribers || 0), 0) / longs.length;

      const shortsAvgImpressions = shorts.reduce((s, r) => s + (r.impressions || 0), 0) / shorts.length;
      const longsAvgImpressions = longs.reduce((s, r) => s + (r.impressions || 0), 0) / longs.length;

      // Calculate average watch time (retention * duration)
      const shortsAvgWatchTime = shorts.reduce((s, r) => s + ((r.retention || 0) * (r.duration || 0)), 0) / shorts.length;
      const longsAvgWatchTime = longs.reduce((s, r) => s + ((r.retention || 0) * (r.duration || 0)), 0) / longs.length;

      // Partnership stats: How formats work together
      // Total contribution to channel
      const shortsTotalViews = shorts.reduce((s, r) => s + r.views, 0);
      const longsTotalViews = longs.reduce((s, r) => s + r.views, 0);
      const shortsViewShare = shortsTotalViews / (shortsTotalViews + longsTotalViews);

      const shortsTotalSubs = shorts.reduce((s, r) => s + (r.subscribers || 0), 0);
      const longsTotalSubs = longs.reduce((s, r) => s + (r.subscribers || 0), 0);
      const shortsSubShare = shortsTotalSubs / (shortsTotalSubs + longsTotalSubs);

      const shortsTotalImpressions = shorts.reduce((s, r) => s + (r.impressions || 0), 0);
      const longsTotalImpressions = longs.reduce((s, r) => s + (r.impressions || 0), 0);
      const shortsReachShare = shortsTotalImpressions / (shortsTotalImpressions + longsTotalImpressions);

      // Production ratio
      const formatRatio = shorts.length / longs.length;

      // Get top examples
      const topShorts = [...shorts].sort((a, b) => b.views - a.views).slice(0, 3);
      const topLongs = [...longs].sort((a, b) => b.views - a.views).slice(0, 3);

      patterns.push({
        type: "Format Ecosystem Analysis",
        finding: "Shorts vs Long-form performance comparison",
        confidence: shorts.length >= 10 && longs.length >= 10 ? "High" : "Medium",
        recommendation: `
📊 INDIVIDUAL FORMAT METRICS

SHORTS (${shorts.length} videos):
• Views/video: ${fmtInt(shortsAvgViews)}
• Subscribers/video: ${fmtInt(shortsAvgSubs)}
• Retention: ${fmtPct(shortsAvgRetention)}
• Watch Time: ${(shortsAvgWatchTime / 60).toFixed(1)} min
• CTR: ${fmtPct(shortsAvgCTR)}
• Impressions: ${fmtInt(shortsAvgImpressions)}

LONG-FORM (${longs.length} videos):
• Views/video: ${fmtInt(longsAvgViews)}
• Subscribers/video: ${fmtInt(longsAvgSubs)}
• Retention: ${fmtPct(longsAvgRetention)}
• Watch Time: ${(longsAvgWatchTime / 60).toFixed(1)} min
• CTR: ${fmtPct(longsAvgCTR)}
• Impressions: ${fmtInt(longsAvgImpressions)}

🔄 CHANNEL CONTRIBUTION

Output Mix:
• You produce ${formatRatio.toFixed(1)} Shorts for every 1 Long-form video

Total Views:
• ${fmtPct(shortsViewShare)} from Shorts (${fmtInt(shortsTotalViews)} views)
• ${fmtPct(1 - shortsViewShare)} from Long-form (${fmtInt(longsTotalViews)} views)

Total Subscribers:
• ${fmtPct(shortsSubShare)} from Shorts (${fmtInt(shortsTotalSubs)} subs)
• ${fmtPct(1 - shortsSubShare)} from Long-form (${fmtInt(longsTotalSubs)} subs)

Total Reach:
• ${fmtPct(shortsReachShare)} from Shorts (${fmtInt(shortsTotalImpressions)} impressions)
• ${fmtPct(1 - shortsReachShare)} from Long-form (${fmtInt(longsTotalImpressions)} impressions)

🎯 KEY OBSERVATIONS

Discovery: ${shortsAvgImpressions > longsAvgImpressions
  ? `Shorts get ${Math.abs(((shortsAvgImpressions - longsAvgImpressions) / longsAvgImpressions) * 100).toFixed(0)}% more impressions per video`
  : `Long-form gets ${Math.abs(((longsAvgImpressions - shortsAvgImpressions) / shortsAvgImpressions) * 100).toFixed(0)}% more impressions per video`}

Engagement: ${shortsAvgWatchTime > longsAvgWatchTime
  ? `Shorts deliver ${Math.abs(((shortsAvgWatchTime - longsAvgWatchTime) / longsAvgWatchTime) * 100).toFixed(0)}% more watch time per video`
  : `Long-form delivers ${Math.abs(((longsAvgWatchTime - shortsAvgWatchTime) / shortsAvgWatchTime) * 100).toFixed(0)}% more watch time per video`}

Subscriber Efficiency: ${shortsAvgSubs > longsAvgSubs
  ? `Shorts acquire ${Math.abs(((shortsAvgSubs - longsAvgSubs) / longsAvgSubs) * 100).toFixed(0)}% more subscribers per video`
  : `Long-form acquires ${Math.abs(((longsAvgSubs - shortsAvgSubs) / shortsAvgSubs) * 100).toFixed(0)}% more subscribers per video`}
        `.trim(),
        sampleSize: `${shorts.length} Shorts, ${longs.length} long-form`,
        opportunity: 0, // No opportunity calculation - this is pure analysis
        effort: "N/A", // Not applicable for analysis
        action: null, // No action - recommendations go elsewhere
        videoExamples: [
          ...topShorts.map(v => ({ ...v, format: 'Short' })),
          ...topLongs.map(v => ({ ...v, format: 'Long' }))
        ].map(v => ({
          title: `[${v.format}] ${v.title}`,
          views: v.views,
          ctr: v.ctr,
          retention: v.retention
        }))
      });
    }

    // PATTERN 2: Kill Low-Performer Topics (Stop making certain types of content)
    // Group by title keywords to find topic patterns
    const titleWords = {};
    rows.forEach(r => {
      const words = r.title.toLowerCase().split(' ').filter(w => w.length > 4 && !['video', 'with', 'this', 'that', 'about', 'from'].includes(w));
      words.forEach(word => {
        if (!titleWords[word]) titleWords[word] = [];
        titleWords[word].push(r);
      });
    });

    // Find topics with 3+ videos where performance is weak
    const weakTopics = Object.entries(titleWords)
      .filter(([word, videos]) => videos.length >= 3)
      .map(([word, videos]) => {
        const avgViews = videos.reduce((s, v) => s + v.views, 0) / videos.length;
        const avgCTR = videos.reduce((s, v) => s + (v.ctr || 0), 0) / videos.length;
        return { word, videos, avgViews, avgCTR, count: videos.length };
      })
      .filter(topic => topic.avgViews < viewsPerVideo * 0.6) // 40% below channel average
      .sort((a, b) => a.avgViews - b.avgViews);

    if (weakTopics.length > 0 && weakTopics[0].count >= 3) {
      const weakest = weakTopics[0];

      // Get worst 3 performing videos in this topic as examples to avoid
      const worstVideos = [...weakest.videos].sort((a, b) => a.views - b.views).slice(0, 3);

      patterns.push({
        type: "Topic Elimination",
        finding: `Stop producing "${weakest.word}" content`,
        delta: `${weakest.count} videos, ${((1 - weakest.avgViews/viewsPerVideo) * 100).toFixed(0)}% below avg`,
        confidence: weakest.count >= 5 ? "High" : "Medium",
        recommendation: `KILL: Stop creating "${weakest.word}"-related content. ${weakest.count} videos averaged only ${fmtInt(weakest.avgViews)} views (${fmtPct(weakest.avgCTR)} CTR) vs channel avg of ${fmtInt(viewsPerVideo)}.`,
        sampleSize: `${weakest.count} videos`,
        opportunity: Math.max(0, (viewsPerVideo - weakest.avgViews) * 2), // Opportunity cost of 2 future videos
        effort: "Low",
        action: `Remove "${weakest.word}" topics from content calendar. Reallocate to proven winners.`,
        videoExamples: worstVideos.map(v => ({
          title: v.title,
          views: v.views,
          ctr: v.ctr,
          retention: v.retention
        }))
      });
    }

    // PATTERN 3: Double Down on Winners (What topics to make MORE of)
    const strongTopics = Object.entries(titleWords)
      .filter(([word, videos]) => videos.length >= 3)
      .map(([word, videos]) => {
        const avgViews = videos.reduce((s, v) => s + v.views, 0) / videos.length;
        const avgCTR = videos.reduce((s, v) => s + (v.ctr || 0), 0) / videos.length;
        const avgRet = videos.reduce((s, v) => s + (v.retention || 0), 0) / videos.length;
        return { word, videos, avgViews, avgCTR, avgRet, count: videos.length };
      })
      .filter(topic => topic.avgViews > viewsPerVideo * 1.4) // 40% above average
      .sort((a, b) => b.avgViews - a.avgViews);

    if (strongTopics.length > 0 && strongTopics[0].count >= 3) {
      const strongest = strongTopics[0];
      const currentFrequency = Math.max(1, strongest.count / Math.max(1, rows.length / 30)); // per month
      const targetFrequency = Math.min(Math.ceil(currentFrequency * 2), 8); // Cap at 8/month

      // Get top 3 performing videos in this topic as examples to replicate
      const topVideos = [...strongest.videos].sort((a, b) => b.views - a.views).slice(0, 3);

      patterns.push({
        type: "Topic Amplification",
        finding: `Scale "${strongest.word}" content production`,
        delta: `${strongest.count} videos, ${((strongest.avgViews/viewsPerVideo - 1) * 100).toFixed(0)}% above avg`,
        confidence: strongest.count >= 5 ? "High" : "Medium",
        recommendation: `GROW: Increase "${strongest.word}"-related content from ${Math.round(currentFrequency)}/month to ${targetFrequency}/month. ${strongest.count} videos averaged ${fmtInt(strongest.avgViews)} views (${fmtPct(strongest.avgCTR)} CTR, ${fmtPct(strongest.avgRet)} retention).`,
        sampleSize: `${strongest.count} videos`,
        opportunity: Math.max(0, (strongest.avgViews - viewsPerVideo) * targetFrequency * 3),
        effort: "Low",
        action: `Add ${targetFrequency - Math.round(currentFrequency)} more "${strongest.word}" videos to next month's calendar`,
        videoExamples: topVideos.map(v => ({
          title: v.title,
          views: v.views,
          ctr: v.ctr,
          retention: v.retention
        }))
      });
    }

    // PATTERN 4: Packaging Pattern - What thumbnail/title style drives CTR
    const filteredByCTR = [...rows].filter(r => r.ctr > 0 && r.impressions > 500).sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
    const top20PctCTR = filteredByCTR.slice(0, Math.ceil(filteredByCTR.length * 0.2));
    const bottom20PctCTR = filteredByCTR.slice(Math.floor(filteredByCTR.length * 0.8));

    if (top20PctCTR.length >= 3 && bottom20PctCTR.length >= 3) {
      const avgTopCTR = top20PctCTR.reduce((s, r) => s + (r.ctr || 0), 0) / top20PctCTR.length;
      const avgBottomCTR = bottom20PctCTR.reduce((s, r) => s + (r.ctr || 0), 0) / bottom20PctCTR.length;

      // Analyze title characteristics
      const topHasNumbers = top20PctCTR.filter(r => /\d/.test(r.title)).length / top20PctCTR.length;
      const bottomHasNumbers = bottom20PctCTR.filter(r => /\d/.test(r.title)).length / bottom20PctCTR.length;

      const topHasQuestions = top20PctCTR.filter(r => /\?/.test(r.title)).length / top20PctCTR.length;
      const bottomHasQuestions = bottom20PctCTR.filter(r => /\?/.test(r.title)).length / bottom20PctCTR.length;

      let titlePattern = "";
      if (topHasNumbers > bottomHasNumbers + 0.3) {
        titlePattern = "numbers/data points";
      } else if (topHasQuestions > bottomHasQuestions + 0.3) {
        titlePattern = "questions";
      } else {
        titlePattern = "strong hooks";
      }

      // Get top 3 CTR videos as template examples
      const topCTRVideos = top20PctCTR.slice(0, 3);

      patterns.push({
        type: "Packaging Formula",
        finding: `Apply proven packaging pattern to all future videos`,
        delta: `${((avgTopCTR / avgBottomCTR - 1) * 100).toFixed(0)}% CTR gap`,
        confidence: "High",
        recommendation: `TEMPLATE: Top 20% CTR videos (${fmtPct(avgTopCTR)}) use ${titlePattern} in titles. Bottom 20% (${fmtPct(avgBottomCTR)}) don't. Apply this pattern to next 10 uploads.`,
        sampleSize: `${top20PctCTR.length} high CTR, ${bottom20PctCTR.length} low CTR`,
        opportunity: Math.max(0, rows.length * viewsPerVideo * (avgTopCTR - avgCTR) * 0.3),
        effort: "Low",
        action: `Create 3 thumbnail templates matching top performers. Use ${titlePattern}-based titles on next ${Math.min(10, rows.length)} videos`,
        videoExamples: topCTRVideos.map(v => ({
          title: v.title,
          views: v.views,
          ctr: v.ctr,
          retention: v.retention
        }))
      });
    }

    // PATTERN 5: Packaging Optimization (always recommend if CTR is below benchmark)
    if (avgCTR < benchmarkCTR * 0.9) { // 10% below benchmark
      const ctrGapPct = ((benchmarkCTR - avgCTR) / benchmarkCTR) * 100;
      const worstCTRVideos = [...rows]
        .filter(r => r.ctr > 0 && r.impressions > 100)
        .sort((a, b) => a.ctr - b.ctr)
        .slice(0, 3);

      patterns.push({
        type: "Packaging Optimization",
        finding: "Improve thumbnail & title packaging",
        delta: `${ctrGapPct.toFixed(0)}% below your best`,
        confidence: "High",
        recommendation: `OPTIMIZE: Your average CTR (${fmtPct(avgCTR)}) is ${ctrGapPct.toFixed(0)}% below your top performers (${fmtPct(benchmarkCTR)}). Better thumbnails and titles could unlock ${fmtInt((benchmarkCTR - avgCTR) * totalImpressions)} more views from existing impressions.`,
        sampleSize: `${rows.length} videos`,
        opportunity: Math.max(0, (benchmarkCTR - avgCTR) * totalImpressions),
        effort: "Medium",
        action: "A/B test 3 thumbnail styles on next uploads. Study top 20% CTR videos for title patterns. Use faces, contrast, text overlays.",
        videoExamples: worstCTRVideos.map(v => ({
          title: v.title,
          views: v.views,
          ctr: v.ctr,
          retention: v.retention
        }))
      });
    }

    // PATTERN 6: Retention/Hook Optimization (always recommend if retention is below benchmark)
    if (avgRetention < benchmarkRetention * 0.9) { // 10% below benchmark
      const retentionGapPct = ((benchmarkRetention - avgRetention) / benchmarkRetention) * 100;
      const worstRetentionVideos = [...rows]
        .filter(r => r.retention > 0 && r.views > 100)
        .sort((a, b) => a.retention - b.retention)
        .slice(0, 3);

      patterns.push({
        type: "Retention Optimization",
        finding: "Strengthen hooks & pacing",
        delta: `${retentionGapPct.toFixed(0)}% below your best`,
        confidence: "High",
        recommendation: `OPTIMIZE: Your average retention (${fmtPct(avgRetention)}) is ${retentionGapPct.toFixed(0)}% below your top performers (${fmtPct(benchmarkRetention)}). Better hooks, pacing, and editing could increase watch time significantly.`,
        sampleSize: `${rows.length} videos`,
        opportunity: Math.max(0, (benchmarkRetention - avgRetention) * totalViews * 0.5), // Rough estimate of view uplift
        effort: "High",
        action: "Analyze first 30 seconds of top performers. Cut fluff. Add pattern interrupts every 45-60 seconds. Tighten edit pacing.",
        videoExamples: worstRetentionVideos.map(v => ({
          title: v.title,
          views: v.views,
          ctr: v.ctr,
          retention: v.retention
        }))
      });
    }

    // PATTERN 7: Consistency/Velocity Optimization (if upload frequency is low)
    const videosWithDates = rows.filter(r => r.publishDate);
    if (videosWithDates.length >= 2) {
      const sortedByDate = [...videosWithDates].sort((a, b) =>
        new Date(b.publishDate) - new Date(a.publishDate)
      );

      let totalDays = 0;
      let intervals = 0;
      for (let i = 0; i < sortedByDate.length - 1; i++) {
        const dateA = new Date(sortedByDate[i].publishDate);
        const dateB = new Date(sortedByDate[i + 1].publishDate);
        totalDays += (dateA - dateB) / (1000 * 60 * 60 * 24);
        intervals++;
      }
      const avgDaysBetween = intervals > 0 ? totalDays / intervals : null;

      if (avgDaysBetween > 10) { // More than 10 days between uploads
        const targetDays = 7; // Weekly uploads
        const additionalUploadsPerMonth = Math.floor((30 / targetDays) - (30 / avgDaysBetween));

        patterns.push({
          type: "Upload Velocity",
          finding: "Increase upload consistency",
          delta: `${avgDaysBetween.toFixed(0)} days between uploads`,
          confidence: "Medium",
          recommendation: `OPTIMIZE: You're uploading every ${avgDaysBetween.toFixed(0)} days. Algorithm rewards consistency. Moving to ${targetDays}-day cadence could boost discovery and subscriber retention.`,
          sampleSize: `${sortedByDate.length} videos`,
          opportunity: Math.max(0, viewsPerVideo * additionalUploadsPerMonth * 3),
          effort: "High",
          action: `Build ${Math.ceil(additionalUploadsPerMonth * 1.5)} video buffer. Batch record. Schedule ${targetDays}-day upload rhythm.`,
          videoExamples: []
        });
      }
    }

    // Sort patterns by opportunity size
    patterns.sort((a, b) => (b.opportunity || 0) - (a.opportunity || 0));

    return {
      primaryConstraint,
      constraintSeverity,
      constraintEvidence,
      patterns: patterns.slice(0, 8), // Top 8 patterns (increased from 5)
      metrics: {
        avgCTR,
        avgRetention,
        benchmarkCTR,
        benchmarkRetention,
        totalViews,
        viewsPerVideo
      }
    };
  }, [rows]);

  if (!diagnostics) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
        No data available for diagnostics. Upload video data to get started.
      </div>
    );
  }

  const severityColors = {
    Critical: "#ef4444",
    Warning: "#f59e0b",
    Monitor: "#10b981"
  };

  // Calculate executive summary stats
  const totalOpportunity = diagnostics.patterns.reduce((sum, p) => sum + (p.opportunity || 0), 0);
  const numDecisions = diagnostics.patterns.length;
  const growPatterns = diagnostics.patterns.filter(p => p.type === "Topic Amplification" || p.type === "Production Mix");
  const stopPatterns = diagnostics.patterns.filter(p => p.type === "Topic Elimination");

  return (
    <div style={{ padding: "0" }}>
      {/* Monthly Executive Summary - PDF Export */}
      <ExecutiveSummary rows={rows} patterns={diagnostics.patterns} />

      {/* Executive Summary - Quick Stats */}
      <div style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px"
      }}>
        <div style={{ fontSize: "14px", color: "#888", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>
          Strategic Overview
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <div style={{ background: "#1E1E1E", padding: "16px", borderRadius: "8px", border: "1px solid #333" }}>
            <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Total Opportunity
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "#10b981", marginBottom: "4px" }}>
              +{fmtInt(totalOpportunity)}
            </div>
            <div style={{ fontSize: "11px", color: "#666" }}>potential views in next 3 months</div>
          </div>
          <div style={{ background: "#1E1E1E", padding: "16px", borderRadius: "8px", border: "1px solid #333" }}>
            <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Actionable Decisions
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "#3b82f6", marginBottom: "4px" }}>
              {numDecisions}
            </div>
            <div style={{ fontSize: "11px", color: "#666" }}>strategic changes recommended</div>
          </div>
          <div style={{ background: "#1E1E1E", padding: "16px", borderRadius: "8px", border: "1px solid #333" }}>
            <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Strategic Focus
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "#f59e0b", marginBottom: "4px" }}>
              {growPatterns.length}/{stopPatterns.length}
            </div>
            <div style={{ fontSize: "11px", color: "#666" }}>grow vs stop decisions</div>
          </div>
        </div>
      </div>

      {/* Diagnostic Summary Card */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <AlertTriangle size={24} style={{ color: severityColors[diagnostics.constraintSeverity] }} />
          <div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
              Growth Diagnostic Report
            </div>
            <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "4px" }}>
              Automated analysis of {rows.length} videos
            </div>
          </div>
        </div>

        {/* Primary Constraint */}
        <div style={{
          background: `${severityColors[diagnostics.constraintSeverity]}10`,
          border: `1px solid ${severityColors[diagnostics.constraintSeverity]}40`,
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <div style={{
              fontSize: "10px",
              color: severityColors[diagnostics.constraintSeverity],
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "1px",
              background: `${severityColors[diagnostics.constraintSeverity]}20`,
              padding: "4px 8px",
              borderRadius: "4px"
            }}>
              {diagnostics.constraintSeverity}
            </div>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff" }}>
              Primary Constraint: {diagnostics.primaryConstraint}
            </div>
          </div>
          <div style={{ fontSize: "14px", color: "#b0b0b0", lineHeight: "1.6" }}>
            {diagnostics.constraintEvidence}
          </div>
        </div>

        {/* Key Metrics Summary */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "12px",
          marginTop: "16px"
        }}>
          <div style={{ background: "#252525", padding: "12px", borderRadius: "8px" }}>
            <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px" }}>AVG CTR</div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "#ec4899" }}>
              {fmtPct(diagnostics.metrics.avgCTR)}
            </div>
            <div style={{ fontSize: "9px", color: "#666", marginTop: "2px" }}>
              Benchmark: {fmtPct(diagnostics.metrics.benchmarkCTR)}
            </div>
          </div>
          <div style={{ background: "#252525", padding: "12px", borderRadius: "8px" }}>
            <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px" }}>AVG RETENTION</div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "#f59e0b" }}>
              {fmtPct(diagnostics.metrics.avgRetention)}
            </div>
            <div style={{ fontSize: "9px", color: "#666", marginTop: "2px" }}>
              Benchmark: {fmtPct(diagnostics.metrics.benchmarkRetention)}
            </div>
          </div>
          <div style={{ background: "#252525", padding: "12px", borderRadius: "8px" }}>
            <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px" }}>VIEWS/VIDEO</div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "#3b82f6" }}>
              {fmtInt(diagnostics.metrics.viewsPerVideo)}
            </div>
          </div>
        </div>
      </div>

      {/* Upload Cadence Analysis */}
      <UploadCadenceAnalysis rows={rows} />

      {/* Grow vs Kill Matrix */}
      {diagnostics.patterns.length > 0 && (
        <GrowKillMatrix patterns={diagnostics.patterns} />
      )}
    </div>
  );
}

// Upload Cadence Analysis Component
function UploadCadenceAnalysis({ rows }) {
  const cadenceData = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    // Sort by publish date (newest first)
    const sortedRows = [...rows].sort((a, b) => {
      const dateA = a.publishDate ? new Date(a.publishDate) : new Date(0);
      const dateB = b.publishDate ? new Date(b.publishDate) : new Date(0);
      return dateB - dateA;
    });

    // Calculate days since last upload
    const mostRecentUpload = sortedRows[0];
    const lastUploadDate = mostRecentUpload.publishDate ? new Date(mostRecentUpload.publishDate) : null;
    const daysSinceLastUpload = lastUploadDate
      ? Math.floor((new Date() - lastUploadDate) / (1000 * 60 * 60 * 24))
      : null;

    // Calculate upload frequency (average days between uploads)
    let totalDaysBetween = 0;
    let intervals = 0;
    for (let i = 0; i < sortedRows.length - 1; i++) {
      const dateA = sortedRows[i].publishDate ? new Date(sortedRows[i].publishDate) : null;
      const dateB = sortedRows[i + 1].publishDate ? new Date(sortedRows[i + 1].publishDate) : null;
      if (dateA && dateB) {
        totalDaysBetween += (dateA - dateB) / (1000 * 60 * 60 * 24);
        intervals++;
      }
    }
    const avgDaysBetweenUploads = intervals > 0 ? totalDaysBetween / intervals : null;

    // Calculate consistency score (0-100)
    // Lower variance in upload intervals = higher consistency
    let variance = 0;
    if (intervals > 1 && avgDaysBetweenUploads) {
      for (let i = 0; i < sortedRows.length - 1; i++) {
        const dateA = sortedRows[i].publishDate ? new Date(sortedRows[i].publishDate) : null;
        const dateB = sortedRows[i + 1].publishDate ? new Date(sortedRows[i + 1].publishDate) : null;
        if (dateA && dateB) {
          const daysBetween = (dateA - dateB) / (1000 * 60 * 60 * 24);
          variance += Math.pow(daysBetween - avgDaysBetweenUploads, 2);
        }
      }
      variance = variance / intervals;
    }
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgDaysBetweenUploads ? stdDev / avgDaysBetweenUploads : 0;
    const consistencyScore = Math.max(0, Math.min(100, 100 - (coefficientOfVariation * 100)));

    // Recommended schedule based on performance
    let recommendedSchedule = "Weekly";
    let scheduleRationale = "";

    if (avgDaysBetweenUploads) {
      if (avgDaysBetweenUploads > 14) {
        recommendedSchedule = "Weekly (2x current rate)";
        scheduleRationale = "Currently uploading too infrequently. Algorithm favors consistency.";
      } else if (avgDaysBetweenUploads > 7) {
        recommendedSchedule = "Weekly";
        scheduleRationale = "Maintain or slightly increase frequency for better momentum.";
      } else if (avgDaysBetweenUploads > 3) {
        recommendedSchedule = "2-3x per week";
        scheduleRationale = "Good cadence. Scale if quality remains high.";
      } else {
        recommendedSchedule = "Daily";
        scheduleRationale = "High frequency. Ensure quality doesn't suffer.";
      }
    }

    // Urgency assessment
    let urgency = "Monitor";
    let urgencyColor = "#10b981";
    if (daysSinceLastUpload > 14) {
      urgency = "Critical";
      urgencyColor = "#ef4444";
    } else if (daysSinceLastUpload > 7) {
      urgency = "Warning";
      urgencyColor = "#f59e0b";
    }

    return {
      daysSinceLastUpload,
      avgDaysBetweenUploads,
      consistencyScore,
      recommendedSchedule,
      scheduleRationale,
      urgency,
      urgencyColor,
      lastUploadTitle: mostRecentUpload.title
    };
  }, [rows]);

  if (!cadenceData) return null;

  return (
    <div style={{
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "24px"
    }}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", marginBottom: "8px" }}>
          Upload Cadence Analysis
        </div>
        <div style={{ fontSize: "14px", color: "#9E9E9E" }}>
          Consistency drives algorithmic momentum
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "16px",
        marginBottom: "20px"
      }}>
        <div style={{ background: "#252525", padding: "16px", borderRadius: "8px" }}>
          <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Days Since Last Upload
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: cadenceData.urgencyColor, marginBottom: "4px" }}>
            {cadenceData.daysSinceLastUpload !== null ? cadenceData.daysSinceLastUpload : "N/A"}
          </div>
          <div style={{
            fontSize: "9px",
            color: cadenceData.urgencyColor,
            background: `${cadenceData.urgencyColor}20`,
            padding: "4px 8px",
            borderRadius: "4px",
            display: "inline-block",
            fontWeight: "600",
            textTransform: "uppercase"
          }}>
            {cadenceData.urgency}
          </div>
        </div>

        <div style={{ background: "#252525", padding: "16px", borderRadius: "8px" }}>
          <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Average Upload Frequency
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#3b82f6", marginBottom: "4px" }}>
            {cadenceData.avgDaysBetweenUploads !== null ? `${cadenceData.avgDaysBetweenUploads.toFixed(1)}` : "N/A"}
          </div>
          <div style={{ fontSize: "11px", color: "#666" }}>days between uploads</div>
        </div>

        <div style={{ background: "#252525", padding: "16px", borderRadius: "8px" }}>
          <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Consistency Score
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#f59e0b", marginBottom: "4px" }}>
            {cadenceData.consistencyScore.toFixed(0)}%
          </div>
          <div style={{ fontSize: "11px", color: "#666" }}>
            {cadenceData.consistencyScore >= 70 ? "Excellent" : cadenceData.consistencyScore >= 50 ? "Good" : "Needs work"}
          </div>
        </div>
      </div>

      <div style={{
        background: "#252525",
        border: "1px solid #333",
        borderRadius: "8px",
        padding: "16px"
      }}>
        <div style={{ fontSize: "12px", fontWeight: "600", color: "#fff", marginBottom: "8px" }}>
          Recommended Schedule: {cadenceData.recommendedSchedule}
        </div>
        <div style={{ fontSize: "12px", color: "#b0b0b0", marginBottom: "8px" }}>
          {cadenceData.scheduleRationale}
        </div>
        {cadenceData.lastUploadTitle && (
          <div style={{ fontSize: "11px", color: "#666", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #333" }}>
            Last upload: <span style={{ color: "#888" }}>{cadenceData.lastUploadTitle}</span>
          </div>
        )}
      </div>
    </div>
  );
}
