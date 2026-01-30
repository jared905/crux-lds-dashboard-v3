import React, { useMemo, useState } from "react";
import { Layers, TrendingUp, TrendingDown, Zap, AlertCircle, Lightbulb, Play, Minus } from "lucide-react";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

export default function ContentSeriesAnalysis({ rows }) {
  const [viewMode, setViewMode] = useState("all"); // 'all' | 'winners' | 'opportunities'

  const analysis = useMemo(() => {
    if (!rows || rows.length === 0) return { series: [], oneHitWonders: [], avgViews: 0, avgCtr: 0, avgRet: 0 };

    // Calculate channel baselines
    const validRows = rows.filter(r => r.views > 0);
    const avgViews = validRows.reduce((sum, r) => sum + r.views, 0) / validRows.length;
    const avgCtr = validRows.filter(r => r.ctr > 0).reduce((sum, r) => sum + r.ctr, 0) / Math.max(validRows.filter(r => r.ctr > 0).length, 1);
    const avgRet = validRows.filter(r => r.retention > 0).reduce((sum, r) => sum + r.retention, 0) / Math.max(validRows.filter(r => r.retention > 0).length, 1);
    const avgSubs = validRows.reduce((sum, r) => sum + (r.subscribers || 0), 0) / validRows.length;
    
    // Channel-wide subscriber conversion rate
    const totalChannelViews = validRows.reduce((sum, r) => sum + r.views, 0);
    const totalChannelSubs = validRows.reduce((sum, r) => sum + (r.subscribers || 0), 0);
    const avgSubsPerKViews = totalChannelViews > 0 ? (totalChannelSubs / totalChannelViews) * 1000 : 0;

    // === SERIES DETECTION ===
    const seriesMap = {};
    const ungroupedVideos = [];

    // Common series patterns to detect
    const SERIES_PATTERNS = [
      { regex: /^first time (hearing|listening|watching|reacting to)/i, name: "First Time Reactions" },
      { regex: /^never heard of/i, name: "Never Heard Of Series" },
      { regex: /reaction|reacts to/i, name: "Reaction Videos" },
      { regex: /live performance|live in/i, name: "Live Performances" },
      { regex: /^i show (my|the)/i, name: "Introduction Videos" },
      { regex: /^who (is|tf is)/i, name: "Artist Discovery" },
      { regex: /didn't know (about|of)/i, name: "Discovery Content" },
      { regex: /vs\.|versus/i, name: "Comparison/VS Videos" },
    ];

    rows.forEach(r => {
      if (!r.title) return;

      let assigned = false;
      
      // Try pattern matching first
      for (const pattern of SERIES_PATTERNS) {
        if (pattern.regex.test(r.title)) {
          if (!seriesMap[pattern.name]) {
            seriesMap[pattern.name] = { name: pattern.name, videos: [], isPattern: true };
          }
          seriesMap[pattern.name].videos.push(r);
          assigned = true;
          break;
        }
      }

      // If no pattern match, try title structure detection
      if (!assigned) {
        // Check for colon/pipe/dash separators (common in series)
        const separatorMatch = r.title.match(/^([^:|–—-]+)[:|\-–—]/);
        if (separatorMatch) {
          const seriesName = separatorMatch[1].trim();
          
          // Filter out generic prefixes (if it appears in >75% of videos, it's likely channel name)
          if (seriesName.length > 3 && seriesName.length < 40) {
            if (!seriesMap[seriesName]) {
              seriesMap[seriesName] = { name: seriesName, videos: [], isPattern: false };
            }
            seriesMap[seriesName].videos.push(r);
            assigned = true;
          }
        }
      }

      if (!assigned) {
        ungroupedVideos.push(r);
      }
    });

    // Filter out series that are likely just channel prefixes (appear in >75% of content)
    const totalVideos = rows.length;
    const validSeries = Object.values(seriesMap)
      .filter(s => s.videos.length >= 2 && s.videos.length <= totalVideos * 0.75);

    // === SERIES ANALYTICS ===
    const analyzedSeries = validSeries.map(series => {
      const videos = series.videos;
      const count = videos.length;
      
      // Sort by publish date to detect trends
      const sortedByDate = [...videos]
        .filter(v => v.publishDate)
        .sort((a, b) => new Date(a.publishDate) - new Date(b.publishDate));

      // Performance metrics
      const totalViews = videos.reduce((sum, v) => sum + v.views, 0);
      const totalSubs = videos.reduce((sum, v) => sum + (v.subscribers || 0), 0);
      const seriesAvgViews = totalViews / count;
      const seriesAvgCtr = videos.reduce((sum, v) => sum + (v.ctr || 0), 0) / count;
      const seriesAvgRet = videos.reduce((sum, v) => sum + (v.retention || 0), 0) / count;
      const seriesAvgSubs = totalSubs / count;
      
      // Subscriber conversion rate (subs per 1000 views)
      const subsPerKViews = totalViews > 0 ? (totalSubs / totalViews) * 1000 : 0;

      // Trend detection (first half vs second half)
      let trend = "stable";
      let trendPct = 0;
      if (sortedByDate.length >= 4) {
        const midpoint = Math.floor(sortedByDate.length / 2);
        const firstHalf = sortedByDate.slice(0, midpoint);
        const secondHalf = sortedByDate.slice(midpoint);
        
        const firstHalfAvg = firstHalf.reduce((sum, v) => sum + v.views, 0) / firstHalf.length;
        const secondHalfAvg = secondHalf.reduce((sum, v) => sum + v.views, 0) / secondHalf.length;
        
        trendPct = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
        
        if (trendPct > 0.15) trend = "growing";
        else if (trendPct < -0.15) trend = "declining";
      }

      // Best and worst performers
      const sortedByViews = [...videos].sort((a, b) => b.views - a.views);
      const bestVideo = sortedByViews[0];
      const worstVideo = sortedByViews[sortedByViews.length - 1];

      // Performance vs channel average
      const viewLift = (seriesAvgViews - avgViews) / avgViews;
      const ctrLift = (seriesAvgCtr - avgCtr) / avgCtr;
      const retLift = (seriesAvgRet - avgRet) / avgRet;
      const subsLift = avgSubs > 0 ? (seriesAvgSubs - avgSubs) / avgSubs : 0;
      const subsConversionLift = avgSubsPerKViews > 0 ? (subsPerKViews - avgSubsPerKViews) / avgSubsPerKViews : 0;

      // Overall performance score (now including subscriber growth)
      const performanceScore = (1 + viewLift) * (1 + ctrLift) * (1 + retLift) * (1 + subsConversionLift * 0.5);

      // Strategic recommendation
      let recommendation = "maintain";
      let recommendationText = "";
      
      // High CTR + High Retention = Quality content (even if views are lower)
      const hasQualityEngagement = seriesAvgCtr > avgCtr * 1.1 && seriesAvgRet > avgRet * 1.1;
      
      // Strong subscriber growth = Audience-building content
      const isAudienceBuilder = subsConversionLift > 0.3 || subsPerKViews > avgSubsPerKViews * 1.5;
      
      // Strong overall performance
      if (performanceScore > 1.3 && trend !== "declining") {
        recommendation = "scale";
        recommendationText = "High performer across all metrics - increase frequency";
      }
      // Audience builder (even if other metrics are average)
      else if (isAudienceBuilder && !trend === "declining") {
        recommendation = "scale";
        recommendationText = `Strong subscriber conversion (${subsPerKViews.toFixed(1)} subs/1K views) - this builds your audience`;
      }
      // Good engagement, just needs more reach
      else if (hasQualityEngagement && viewLift < 0.2) {
        recommendation = "optimize";
        recommendationText = "Strong engagement (CTR + Retention) - improve thumbnails/titles for more reach";
      }
      // Growing momentum
      else if (trend === "growing" && trendPct > 0.2 && count < 15) {
        recommendation = "scale";
        recommendationText = "Growing momentum - publish more to capitalize";
      }
      // Good views but weak engagement
      else if (viewLift > 0.2 && (seriesAvgCtr < avgCtr * 0.9 || seriesAvgRet < avgRet * 0.9)) {
        recommendation = "optimize";
        recommendationText = "Good views but weak engagement - improve content quality/hooks";
      }
      // Declining across the board
      else if (performanceScore < 0.7 && trend === "declining") {
        recommendation = "sunset";
        recommendationText = "Declining performance across metrics - consider ending or major refresh";
      }
      // Low views AND low engagement
      else if (viewLift < -0.3 && seriesAvgCtr < avgCtr * 0.8 && seriesAvgRet < avgRet * 0.8) {
        recommendation = "sunset";
        recommendationText = "Underperforming on views and engagement - audience not interested";
      }
      // Declining with poor engagement
      else if (trend === "declining" && trendPct < -0.3 && !hasQualityEngagement) {
        recommendation = "sunset";
        recommendationText = "Sharp decline with weak engagement - time to move on";
      }
      // Decent performance, room to optimize
      else if (performanceScore > 0.9 && performanceScore < 1.2) {
        recommendation = "optimize";
        recommendationText = "Good baseline - test improvements to reach next level";
      }
      else {
        recommendationText = "Stable performance - maintain current pace";
      }

      // Recency check
      const daysSinceLastEpisode = sortedByDate.length > 0 ? 
        (new Date() - new Date(sortedByDate[sortedByDate.length - 1].publishDate)) / (1000 * 60 * 60 * 24) : 
        999;

      return {
        name: series.name,
        count,
        avgViews: seriesAvgViews,
        avgCtr: seriesAvgCtr,
        avgRet: seriesAvgRet,
        avgSubs: seriesAvgSubs,
        subsPerKViews,
        viewLift,
        ctrLift,
        retLift,
        subsLift,
        subsConversionLift,
        trend,
        trendPct,
        performanceScore,
        bestVideo,
        worstVideo,
        recommendation,
        recommendationText,
        daysSinceLastEpisode,
        isAbandoned: daysSinceLastEpisode > 60 && count >= 3,
        isAudienceBuilder: subsConversionLift > 0.3 || subsPerKViews > avgSubsPerKViews * 1.5,
        videos
      };
    }).sort((a, b) => b.performanceScore - a.performanceScore);

    // === ONE-HIT WONDERS (potential new series) ===
    const oneHitWonders = ungroupedVideos
      .filter(v => v.views > avgViews * 1.5) // Significantly outperformed average
      .sort((a, b) => b.views - a.views)
      .slice(0, 5)
      .map(v => ({
        title: v.title,
        views: v.views,
        viewLift: (v.views - avgViews) / avgViews,
        ctr: v.ctr,
        retention: v.retention
      }));

    return {
      series: analyzedSeries,
      oneHitWonders,
      avgViews,
      avgCtr,
      avgRet,
      avgSubsPerKViews
    };
  }, [rows]);

  if (!rows || rows.length === 0) {
    return (
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "40px",
        marginBottom: "20px",
        textAlign: "center",
        color: "#9E9E9E"
      }}>
        <div style={{ fontSize: "16px", fontWeight: "600" }}>No data available</div>
        <div style={{ fontSize: "13px", marginTop: "8px" }}>Upload client data to see series analysis</div>
      </div>
    );
  }

  const s = {
    section: {
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "20px",
      position: "relative",
      overflow: "hidden"
    },
    gradientBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "4px",
      background: "linear-gradient(90deg, #f59e0b, #ec4899, #8b5cf6)"
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "20px"
    },
    title: { fontSize: "20px", fontWeight: "700", color: "#fff" },
    subtitle: {
      fontSize: "12px",
      color: "#9E9E9E",
      background: "#252525",
      padding: "4px 10px",
      borderRadius: "6px"
    },
    tabs: { display: "flex", gap: "8px" },
    tab: (active) => ({
      padding: "8px 16px",
      borderRadius: "8px",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      border: "1px solid",
      borderColor: active ? "#2962FF" : "#333",
      backgroundColor: active ? "rgba(41, 98, 255, 0.15)" : "transparent",
      color: active ? "#60a5fa" : "#9E9E9E",
      transition: "all 0.2s"
    }),
    seriesCard: {
      background: "#252525",
      border: "1px solid #333",
      borderRadius: "8px",
      padding: "16px",
      marginBottom: "12px"
    },
    seriesHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "12px"
    },
    seriesName: {
      fontSize: "16px",
      fontWeight: "700",
      color: "#fff",
      marginBottom: "4px"
    },
    episodeCount: {
      fontSize: "12px",
      color: "#9E9E9E",
      display: "flex",
      alignItems: "center",
      gap: "4px"
    },
    recommendationBadge: (rec) => {
      const colors = {
        scale: { bg: "rgba(34, 197, 94, 0.15)", border: "#10b981", text: "#10b981" },
        optimize: { bg: "rgba(59, 130, 246, 0.15)", border: "#3b82f6", text: "#3b82f6" },
        maintain: { bg: "rgba(107, 114, 128, 0.15)", border: "#6b7280", text: "#9E9E9E" },
        sunset: { bg: "rgba(239, 68, 68, 0.15)", border: "#ef4444", text: "#ef4444" }
      };
      const c = colors[rec] || colors.maintain;
      return {
        fontSize: "11px",
        fontWeight: "700",
        textTransform: "uppercase",
        padding: "4px 10px",
        borderRadius: "6px",
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        display: "inline-flex",
        alignItems: "center",
        gap: "4px"
      };
    },
    statsGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "12px",
      marginBottom: "12px"
    },
    stat: {
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    },
    statValue: (good) => ({
      fontSize: "15px",
      fontWeight: "700",
      color: good ? "#10b981" : "#E0E0E0"
    }),
    statLabel: {
      fontSize: "11px",
      color: "#9E9E9E",
      textTransform: "uppercase"
    },
    trendIndicator: (trend) => {
      const colors = {
        growing: "#10b981",
        declining: "#ef4444",
        stable: "#9E9E9E"
      };
      return {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "12px",
        color: colors[trend],
        fontWeight: "600"
      };
    },
    insightRow: {
      fontSize: "12px",
      color: "#9E9E9E",
      lineHeight: "1.5",
      paddingTop: "12px",
      borderTop: "1px solid #333"
    },
    opportunityCard: {
      background: "rgba(59, 130, 246, 0.1)",
      border: "1px solid #3b82f6",
      borderLeft: "4px solid #3b82f6",
      borderRadius: "8px",
      padding: "16px",
      marginBottom: "12px"
    },
    opportunityTitle: {
      fontSize: "14px",
      fontWeight: "700",
      color: "#fff",
      marginBottom: "8px"
    }
  };

  const filteredSeries = viewMode === "winners" 
    ? analysis.series.filter(s => s.recommendation === "scale" || s.performanceScore > 1.2)
    : viewMode === "opportunities"
    ? analysis.series.filter(s => s.isAbandoned || s.recommendation === "optimize")
    : analysis.series;

  return (
    <div style={s.section}>
      <div style={s.gradientBar} />
      
      <div style={s.header}>
        <div>
          <div style={s.title}>📺 Content Series Analysis</div>
          <div style={s.subtitle}>Recurring formats & strategic recommendations</div>
        </div>
        <div style={s.tabs}>
          <button style={s.tab(viewMode === 'all')} onClick={() => setViewMode('all')}>
            All Series ({analysis.series.length})
          </button>
          <button style={s.tab(viewMode === 'winners')} onClick={() => setViewMode('winners')}>
            Top Performers
          </button>
          <button style={s.tab(viewMode === 'opportunities')} onClick={() => setViewMode('opportunities')}>
            Opportunities
          </button>
        </div>
      </div>

      {/* SERIES CARDS */}
      {filteredSeries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
          {viewMode === "winners" ? "No high-performing series detected yet." :
           viewMode === "opportunities" ? "No optimization opportunities or abandoned series." :
           "No distinct series detected. Try more consistent title formatting."}
        </div>
      ) : (
        filteredSeries.map(series => (
          <div key={series.name} style={s.seriesCard}>
            <div style={s.seriesHeader}>
              <div>
                <div style={s.seriesName}>{series.name}</div>
                <div style={s.episodeCount}>
                  <Layers size={12} />
                  {series.count} episodes
                  {series.isAbandoned && (
                    <span style={{ color: "#ef4444", marginLeft: "8px" }}>
                      • Abandoned {Math.round(series.daysSinceLastEpisode)} days ago
                    </span>
                  )}
                </div>
              </div>
              <div style={s.recommendationBadge(series.recommendation)}>
                {series.recommendation === "scale" && <Zap size={12} />}
                {series.recommendation === "sunset" && <AlertCircle size={12} />}
                {series.recommendation === "optimize" && <Lightbulb size={12} />}
                {series.recommendation === "maintain" && <Minus size={12} />}
                {series.recommendation}
              </div>
            </div>

            <div style={s.statsGrid}>
              <div style={s.stat}>
                <span style={s.statValue(series.viewLift > 0.1)}>
                  {fmtInt(series.avgViews)}
                </span>
                <span style={s.statLabel}>
                  Avg Views ({series.viewLift > 0 ? '+' : ''}{Math.round(series.viewLift * 100)}%)
                </span>
              </div>
              
              <div style={s.stat}>
                <span style={s.statValue(series.avgCtr > analysis.avgCtr)}>
                  {fmtPct(series.avgCtr)}
                </span>
                <span style={s.statLabel}>
                  Avg CTR ({series.ctrLift > 0 ? '+' : ''}{Math.round(series.ctrLift * 100)}%)
                </span>
              </div>
              
              <div style={s.stat}>
                <span style={s.statValue(series.avgRet > analysis.avgRet)}>
                  {fmtPct(series.avgRet)}
                </span>
                <span style={s.statLabel}>
                  Retention ({series.retLift > 0 ? '+' : ''}{Math.round(series.retLift * 100)}%)
                </span>
              </div>

              <div style={s.stat}>
                <span style={s.statValue(series.subsConversionLift > 0.1)}>
                  {series.subsPerKViews.toFixed(1)}
                  {series.isAudienceBuilder && <span style={{ marginLeft: "4px", fontSize: "16px" }}>🔥</span>}
                </span>
                <span style={s.statLabel}>
                  Subs/1K Views ({series.subsConversionLift > 0 ? '+' : ''}{Math.round(series.subsConversionLift * 100)}%)
                </span>
              </div>
            </div>

            <div style={{ ...s.statsGrid, marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #333" }}>
              <div style={s.stat}>
                <div style={s.trendIndicator(series.trend)}>
                  {series.trend === "growing" && <TrendingUp size={14} />}
                  {series.trend === "declining" && <TrendingDown size={14} />}
                  {series.trend === "stable" && <Minus size={14} />}
                  {series.trend === "growing" ? "Growing" : series.trend === "declining" ? "Declining" : "Stable"}
                  {series.trend !== "stable" && ` (${series.trendPct > 0 ? '+' : ''}${Math.round(series.trendPct * 100)}%)`}
                </div>
                <span style={s.statLabel}>Trend</span>
              </div>
              
              <div style={s.stat}>
                <span style={s.statValue(true)}>
                  {fmtInt(series.avgSubs)}
                </span>
                <span style={s.statLabel}>
                  Avg Subs/Video
                </span>
              </div>
            </div>

            <div style={s.insightRow}>
              <div style={{ marginBottom: "8px", color: "#E0E0E0" }}>
                <strong>💡 {series.recommendationText}</strong>
              </div>
              {series.bestVideo && (
                <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                  Best: "{series.bestVideo.title}" ({fmtInt(series.bestVideo.views)} views)
                </div>
              )}
              {series.isAbandoned && series.viewLift > 0 && (
                <div style={{ fontSize: "11px", color: "#f59e0b", marginTop: "8px" }}>
                  ⚠️ This series was performing well but hasn't been updated in {Math.round(series.daysSinceLastEpisode)} days - consider reviving it
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {/* ONE-HIT WONDERS (Opportunities Section) */}
      {viewMode === "opportunities" && analysis.oneHitWonders.length > 0 && (
        <div style={{ marginTop: "32px" }}>
          <div style={{ fontSize: "16px", fontWeight: "700", color: "#3b82f6", marginBottom: "16px" }}>
            💡 One-Hit Wonders (Consider Making Into Series)
          </div>
          {analysis.oneHitWonders.map((video, i) => (
            <div key={i} style={s.opportunityCard}>
              <div style={s.opportunityTitle}>"{video.title}"</div>
              <div style={{ fontSize: "12px", color: "#9E9E9E" }}>
                {fmtInt(video.views)} views ({Math.round(video.viewLift * 100)}% above average) • 
                {fmtPct(video.ctr)} CTR • {fmtPct(video.retention)} retention
              </div>
              <div style={{ fontSize: "12px", color: "#60a5fa", marginTop: "8px" }}>
                This video significantly outperformed your average - consider creating more content in this style/topic
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}