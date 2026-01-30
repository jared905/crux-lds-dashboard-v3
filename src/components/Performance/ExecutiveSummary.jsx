import React, { useMemo } from "react";
import { Download, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import jsPDF from "jspdf";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

export default function ExecutiveSummary({ rows, patterns }) {
  // Calculate month-over-month metrics
  const analysis = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Current month (last 30 days)
    const currentMonth = rows.filter(r => r.publishDate && new Date(r.publishDate) >= thirtyDaysAgo);
    // Previous month (30-60 days ago)
    const previousMonth = rows.filter(r => r.publishDate && new Date(r.publishDate) >= sixtyDaysAgo && new Date(r.publishDate) < thirtyDaysAgo);

    // Helper to calculate totals
    const calcTotals = (videos) => {
      if (videos.length === 0) return { views: 0, subscribers: 0, ctr: 0, retention: 0, uploads: 0 };
      const totalImpressions = videos.reduce((s, r) => s + (r.impressions || 0), 0);
      const totalViews = videos.reduce((s, r) => s + (r.views || 0), 0);
      const avgCTR = totalImpressions > 0
        ? videos.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / totalImpressions
        : 0;
      const avgRetention = totalViews > 0
        ? videos.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / totalViews
        : 0;

      return {
        views: totalViews,
        subscribers: videos.reduce((s, r) => s + (r.subscribers || 0), 0),
        ctr: avgCTR,
        retention: avgRetention,
        uploads: videos.length
      };
    };

    const current = calcTotals(currentMonth);
    const previous = calcTotals(previousMonth);

    // Calculate changes (% change)
    const calcChange = (curr, prev) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    const changes = {
      views: calcChange(current.views, previous.views),
      subscribers: calcChange(current.subscribers, previous.subscribers),
      ctr: calcChange(current.ctr, previous.ctr),
      retention: calcChange(current.retention, previous.retention),
      uploads: calcChange(current.uploads, previous.uploads)
    };

    // Identify top 3 wins (positive highlights)
    const wins = [];

    // Win: View growth
    if (changes.views > 10) {
      wins.push({
        icon: "📈",
        title: "Strong View Growth",
        description: `Views increased ${fmtPct(changes.views / 100)} month-over-month (${fmtInt(previous.views)} → ${fmtInt(current.views)})`,
        impact: "high"
      });
    }

    // Win: Subscriber growth
    if (changes.subscribers > 15) {
      wins.push({
        icon: "👥",
        title: "Subscriber Acceleration",
        description: `Gained ${fmtInt(current.subscribers)} new subscribers, up ${fmtPct(changes.subscribers / 100)} from last month`,
        impact: "high"
      });
    }

    // Win: CTR improvement
    if (changes.ctr > 5) {
      wins.push({
        icon: "🎯",
        title: "Improved Click-Through Rate",
        description: `CTR improved ${fmtPct(changes.ctr / 100)} (${fmtPct(previous.ctr)} → ${fmtPct(current.ctr)}), indicating better packaging`,
        impact: "medium"
      });
    }

    // Win: Retention improvement
    if (changes.retention > 5) {
      wins.push({
        icon: "⏱️",
        title: "Better Audience Retention",
        description: `Retention up ${fmtPct(changes.retention / 100)} (${fmtPct(previous.retention)} → ${fmtPct(current.retention)}), viewers watching longer`,
        impact: "medium"
      });
    }

    // Win: Upload consistency
    if (changes.uploads > 20) {
      wins.push({
        icon: "🚀",
        title: "Increased Upload Velocity",
        description: `Published ${current.uploads} videos vs ${previous.uploads} last month (+${Math.round(changes.uploads)}%)`,
        impact: "medium"
      });
    }

    // Win: Best performing video
    if (currentMonth.length > 0) {
      const topVideo = [...currentMonth].sort((a, b) => b.views - a.views)[0];
      if (topVideo.views > (previous.views / Math.max(previous.uploads, 1)) * 1.5) {
        wins.push({
          icon: "🏆",
          title: "Breakout Video Performance",
          description: `"${topVideo.title}" hit ${fmtInt(topVideo.views)} views (${fmtPct(topVideo.ctr)} CTR, ${fmtPct(topVideo.retention)} retention)`,
          impact: "high",
          videoTitle: topVideo.title
        });
      }
    }

    // Identify top 3 problems (areas needing attention)
    const problems = [];

    // Problem: View decline
    if (changes.views < -10) {
      problems.push({
        icon: "📉",
        title: "Declining Views",
        description: `Views dropped ${fmtPct(Math.abs(changes.views) / 100)} month-over-month (${fmtInt(previous.views)} → ${fmtInt(current.views)})`,
        severity: "critical"
      });
    }

    // Problem: Upload frequency drop
    if (changes.uploads < -20) {
      problems.push({
        icon: "⚠️",
        title: "Upload Frequency Dropped",
        description: `Only ${current.uploads} uploads vs ${previous.uploads} last month. Consistency is key for algorithm.`,
        severity: "warning"
      });
    }

    // Problem: CTR decline
    if (changes.ctr < -10) {
      problems.push({
        icon: "🎨",
        title: "CTR Decline",
        description: `CTR fell ${fmtPct(Math.abs(changes.ctr) / 100)} (${fmtPct(previous.ctr)} → ${fmtPct(current.ctr)}). Thumbnails/titles need work.`,
        severity: "warning"
      });
    }

    // Problem: Retention decline
    if (changes.retention < -10) {
      problems.push({
        icon: "🎬",
        title: "Retention Drop",
        description: `Retention down ${fmtPct(Math.abs(changes.retention) / 100)} (${fmtPct(previous.retention)} → ${fmtPct(current.retention)}). Content quality/pacing issue.`,
        severity: "warning"
      });
    }

    // Problem: Low subscriber conversion
    if (current.subscribers > 0 && current.views > 0 && (current.subscribers / current.views) < 0.003) {
      problems.push({
        icon: "👤",
        title: "Low Subscriber Conversion",
        description: `Only ${((current.subscribers / current.views) * 100).toFixed(2)}% of viewers subscribe. Add stronger CTAs.`,
        severity: "warning"
      });
    }

    // Problem: Underperforming videos
    if (currentMonth.length >= 3) {
      const avgViews = current.views / current.uploads;
      const underperformers = currentMonth.filter(v => v.views < avgViews * 0.5);
      if (underperformers.length >= currentMonth.length * 0.4) {
        problems.push({
          icon: "🚨",
          title: "High Underperformer Rate",
          description: `${underperformers.length} of ${currentMonth.length} videos (${Math.round(underperformers.length / currentMonth.length * 100)}%) performing below 50% of average`,
          severity: "critical"
        });
      }
    }

    // If no problems found, add a positive message
    if (problems.length === 0) {
      problems.push({
        icon: "✅",
        title: "No Critical Issues",
        description: "Channel metrics are stable or improving across all key areas.",
        severity: "monitor"
      });
    }

    // Sort by impact/severity
    wins.sort((a, b) => {
      const impactOrder = { high: 1, medium: 2, low: 3 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    });
    problems.sort((a, b) => {
      const severityOrder = { critical: 1, warning: 2, monitor: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    return {
      current,
      previous,
      changes,
      wins: wins.slice(0, 3),
      problems: problems.slice(0, 3),
      period: {
        current: `Last 30 days (${currentMonth.length} videos)`,
        previous: `Previous 30 days (${previousMonth.length} videos)`
      }
    };
  }, [rows]);

  // Generate budget allocation recommendation
  const budgetRecommendation = useMemo(() => {
    if (!patterns || patterns.length === 0) return null;

    // Categorize patterns by type
    const growPatterns = patterns.filter(p =>
      p.type === "Topic Amplification" ||
      (p.opportunity > 0 && p.effort === "Low")
    );
    const optimizePatterns = patterns.filter(p =>
      p.type === "Packaging Optimization" ||
      p.type === "Retention Optimization" ||
      p.effort === "Medium" || p.effort === "High"
    );
    const stopPatterns = patterns.filter(p => p.type === "Topic Elimination");

    // Calculate total opportunity
    const totalOpportunity = patterns.reduce((sum, p) => sum + (p.opportunity || 0), 0);

    let allocation = [];

    if (growPatterns.length > 0) {
      const growOpp = growPatterns.reduce((sum, p) => sum + (p.opportunity || 0), 0);
      const pct = totalOpportunity > 0 ? (growOpp / totalOpportunity) * 100 : 0;
      allocation.push({
        category: "Content Production",
        allocation: Math.min(60, Math.max(30, pct)),
        rationale: `Focus on proven topics. ${growPatterns.length} high-ROI opportunities identified.`,
        action: "Increase production of top-performing topics and formats"
      });
    }

    if (optimizePatterns.length > 0) {
      allocation.push({
        category: "Optimization & Quality",
        allocation: 30,
        rationale: `${optimizePatterns.length} opportunities to improve CTR, retention, or packaging.`,
        action: "Invest in better thumbnails, titles, hooks, and editing quality"
      });
    }

    if (stopPatterns.length > 0) {
      allocation.push({
        category: "Reduce/Eliminate",
        allocation: 10,
        rationale: `${stopPatterns.length} underperforming topics to phase out.`,
        action: "Stop producing content that consistently underperforms"
      });
    } else {
      allocation.push({
        category: "Experimentation",
        allocation: 10,
        rationale: "Test new formats and topics to find future winners.",
        action: "Try 1-2 new content ideas per month"
      });
    }

    // Normalize to 100%
    const total = allocation.reduce((sum, a) => sum + a.allocation, 0);
    allocation = allocation.map(a => ({
      ...a,
      allocation: Math.round((a.allocation / total) * 100)
    }));

    return {
      allocation,
      totalOpportunity,
      keyFocus: growPatterns.length > 0 ? growPatterns[0].finding : "Maintain current strategy"
    };
  }, [patterns]);

  // Export to PDF
  const exportToPDF = () => {
    if (!analysis) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let yPos = 20;

    // Helper to add text with wrapping
    const addText = (text, x, y, maxWidth, fontSize = 10) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, x, y);
      return lines.length * (fontSize * 0.35); // Approximate line height
    };

    // Title
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text("YouTube Channel Executive Summary", margin, yPos);
    yPos += 10;

    // Date
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), margin, yPos);
    yPos += 15;
    doc.setTextColor(0, 0, 0);

    // Performance Summary
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text("Performance vs Last Month", margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');

    const metrics = [
      { label: "Views", current: analysis.current.views, previous: analysis.previous.views, change: analysis.changes.views },
      { label: "Subscribers", current: analysis.current.subscribers, previous: analysis.previous.subscribers, change: analysis.changes.subscribers },
      { label: "CTR", current: analysis.current.ctr, previous: analysis.previous.ctr, change: analysis.changes.ctr, isPct: true },
      { label: "Retention", current: analysis.current.retention, previous: analysis.previous.retention, change: analysis.changes.retention, isPct: true },
      { label: "Uploads", current: analysis.current.uploads, previous: analysis.previous.uploads, change: analysis.changes.uploads }
    ];

    metrics.forEach(metric => {
      const changeColor = metric.change >= 0 ? [34, 197, 94] : [239, 68, 68];
      const changeSymbol = metric.change >= 0 ? "↑" : "↓";
      const currentVal = metric.isPct ? fmtPct(metric.current) : fmtInt(metric.current);
      const previousVal = metric.isPct ? fmtPct(metric.previous) : fmtInt(metric.previous);

      doc.text(`${metric.label}:`, margin, yPos);
      doc.text(`${previousVal} → ${currentVal}`, margin + 40, yPos);
      doc.setTextColor(...changeColor);
      doc.text(`${changeSymbol} ${Math.abs(metric.change).toFixed(1)}%`, margin + 100, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 6;
    });

    yPos += 10;

    // Top 3 Wins
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text("Top 3 Wins", margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');

    analysis.wins.forEach((win, idx) => {
      doc.setFont(undefined, 'bold');
      doc.text(`${idx + 1}. ${win.title}`, margin, yPos);
      yPos += 5;
      doc.setFont(undefined, 'normal');
      const height = addText(win.description, margin + 5, yPos, pageWidth - margin * 2 - 5, 9);
      yPos += height + 5;
    });

    yPos += 5;

    // Top 3 Problems
    if (yPos > 220) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text("Top 3 Areas for Improvement", margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');

    analysis.problems.forEach((problem, idx) => {
      doc.setFont(undefined, 'bold');
      doc.text(`${idx + 1}. ${problem.title}`, margin, yPos);
      yPos += 5;
      doc.setFont(undefined, 'normal');
      const height = addText(problem.description, margin + 5, yPos, pageWidth - margin * 2 - 5, 9);
      yPos += height + 5;
    });

    yPos += 5;

    // Budget Allocation
    if (budgetRecommendation) {
      if (yPos > 200) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text("Recommended Budget Allocation", margin, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');

      budgetRecommendation.allocation.forEach(item => {
        doc.setFont(undefined, 'bold');
        doc.text(`${item.category}: ${item.allocation}%`, margin, yPos);
        yPos += 5;
        doc.setFont(undefined, 'normal');
        const height = addText(item.rationale, margin + 5, yPos, pageWidth - margin * 2 - 5, 9);
        yPos += height + 3;
      });

      yPos += 5;
      doc.setFont(undefined, 'bold');
      doc.text("Key Focus:", margin, yPos);
      yPos += 5;
      doc.setFont(undefined, 'normal');
      addText(budgetRecommendation.keyFocus, margin + 5, yPos, pageWidth - margin * 2 - 5, 9);
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Generated by CRUX YouTube Analytics Dashboard", margin, doc.internal.pageSize.getHeight() - 10);

    // Save
    doc.save(`YouTube-Executive-Summary-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!analysis) {
    return (
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px",
        textAlign: "center",
        color: "#666"
      }}>
        Not enough data for month-over-month comparison. Upload more videos with publish dates.
      </div>
    );
  }

  return (
    <div style={{
      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "24px"
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff", marginBottom: "6px" }}>
            Executive Summary
          </div>
          <div style={{ fontSize: "12px", color: "#888" }}>
            {analysis.period.current} vs {analysis.period.previous}
          </div>
        </div>
        <button
          onClick={exportToPDF}
          style={{
            background: "#10b981",
            border: "none",
            borderRadius: "8px",
            padding: "10px 16px",
            color: "#fff",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.2s ease"
          }}
          onMouseOver={(e) => e.currentTarget.style.background = "#059669"}
          onMouseOut={(e) => e.currentTarget.style.background = "#10b981"}
        >
          <Download size={16} />
          Export PDF
        </button>
      </div>

      {/* Performance Metrics Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "12px",
        marginBottom: "24px"
      }}>
        <MetricCard
          label="Views"
          current={analysis.current.views}
          previous={analysis.previous.views}
          change={analysis.changes.views}
        />
        <MetricCard
          label="Subscribers"
          current={analysis.current.subscribers}
          previous={analysis.previous.subscribers}
          change={analysis.changes.subscribers}
        />
        <MetricCard
          label="CTR"
          current={analysis.current.ctr}
          previous={analysis.previous.ctr}
          change={analysis.changes.ctr}
          isPercentage
        />
        <MetricCard
          label="Retention"
          current={analysis.current.retention}
          previous={analysis.previous.retention}
          change={analysis.changes.retention}
          isPercentage
        />
        <MetricCard
          label="Uploads"
          current={analysis.current.uploads}
          previous={analysis.previous.uploads}
          change={analysis.changes.uploads}
        />
      </div>

      {/* Wins and Problems */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        {/* Top 3 Wins */}
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #10b98140",
          borderRadius: "10px",
          padding: "20px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <TrendingUp size={20} style={{ color: "#10b981" }} />
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>
              Top 3 Wins
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {analysis.wins.map((win, idx) => (
              <div key={idx} style={{
                background: "#252525",
                border: "1px solid #333",
                borderRadius: "8px",
                padding: "12px"
              }}>
                <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
                  <div style={{ fontSize: "18px" }}>{win.icon}</div>
                  <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>
                    {win.title}
                  </div>
                </div>
                <div style={{ fontSize: "11px", color: "#b0b0b0", lineHeight: "1.5" }}>
                  {win.description}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 3 Problems */}
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #ef444440",
          borderRadius: "10px",
          padding: "20px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <AlertCircle size={20} style={{ color: "#ef4444" }} />
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>
              Top 3 Areas for Improvement
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {analysis.problems.map((problem, idx) => (
              <div key={idx} style={{
                background: "#252525",
                border: "1px solid #333",
                borderRadius: "8px",
                padding: "12px"
              }}>
                <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
                  <div style={{ fontSize: "18px" }}>{problem.icon}</div>
                  <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>
                    {problem.title}
                  </div>
                </div>
                <div style={{ fontSize: "11px", color: "#b0b0b0", lineHeight: "1.5" }}>
                  {problem.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Budget Allocation */}
      {budgetRecommendation && (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "10px",
          padding: "20px"
        }}>
          <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff", marginBottom: "16px" }}>
            Recommended Budget Allocation
          </div>

          {/* Allocation bars */}
          <div style={{ marginBottom: "16px" }}>
            {budgetRecommendation.allocation.map((item, idx) => (
              <div key={idx} style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#fff" }}>
                    {item.category}
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: "#10b981" }}>
                    {item.allocation}%
                  </div>
                </div>
                <div style={{
                  width: "100%",
                  height: "8px",
                  background: "#252525",
                  borderRadius: "4px",
                  overflow: "hidden",
                  marginBottom: "4px"
                }}>
                  <div style={{
                    width: `${item.allocation}%`,
                    height: "100%",
                    background: idx === 0 ? "#10b981" : idx === 1 ? "#f59e0b" : "#3b82f6",
                    transition: "width 0.3s ease"
                  }} />
                </div>
                <div style={{ fontSize: "10px", color: "#888", lineHeight: "1.4" }}>
                  {item.rationale}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            background: "#252525",
            border: "1px solid #333",
            borderRadius: "6px",
            padding: "12px"
          }}>
            <div style={{ fontSize: "11px", fontWeight: "600", color: "#10b981", marginBottom: "4px" }}>
              KEY FOCUS:
            </div>
            <div style={{ fontSize: "12px", color: "#b0b0b0" }}>
              {budgetRecommendation.keyFocus}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Metric Card Component
function MetricCard({ label, current, previous, change, isPercentage = false }) {
  const isPositive = change >= 0;
  const changeColor = isPositive ? "#10b981" : "#ef4444";
  const Icon = isPositive ? TrendingUp : TrendingDown;

  const formatValue = (val) => {
    if (isPercentage) return fmtPct(val);
    return fmtInt(val);
  };

  return (
    <div style={{
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "8px",
      padding: "14px"
    }}>
      <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </div>
      <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
        {formatValue(current)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <Icon size={14} style={{ color: changeColor }} />
        <div style={{ fontSize: "11px", color: changeColor, fontWeight: "600" }}>
          {Math.abs(change).toFixed(1)}%
        </div>
        <div style={{ fontSize: "10px", color: "#666", marginLeft: "4px" }}>
          vs {formatValue(previous)}
        </div>
      </div>
    </div>
  );
}
