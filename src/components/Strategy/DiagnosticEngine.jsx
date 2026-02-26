import React, { useMemo } from "react";
import { AlertTriangle, TrendingUp, Zap, Target } from "lucide-react";
import GrowKillMatrix from "./GrowKillMatrix.jsx";
import ExecutiveSummary from "../Performance/ExecutiveSummary.jsx";
import useDiagnostics from "../../hooks/useDiagnostics";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

export default function DiagnosticEngine({ rows }) {
  const diagnostics = useDiagnostics(rows);

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
        borderRadius: "8px",
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
            <div style={{ fontSize: "28px", fontWeight: "700", color: "#10b981", marginBottom: "4px", fontFamily: "'Barlow Condensed', sans-serif" }}>
              +{fmtInt(totalOpportunity)}
            </div>
            <div style={{ fontSize: "11px", color: "#666" }}>potential views in next 3 months</div>
          </div>
          <div style={{ background: "#1E1E1E", padding: "16px", borderRadius: "8px", border: "1px solid #333" }}>
            <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Actionable Decisions
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "#3b82f6", marginBottom: "4px", fontFamily: "'Barlow Condensed', sans-serif" }}>
              {numDecisions}
            </div>
            <div style={{ fontSize: "11px", color: "#666" }}>strategic changes recommended</div>
          </div>
          <div style={{ background: "#1E1E1E", padding: "16px", borderRadius: "8px", border: "1px solid #333" }}>
            <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Strategic Focus
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "#f59e0b", marginBottom: "4px", fontFamily: "'Barlow Condensed', sans-serif" }}>
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
        borderRadius: "8px",
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
      borderRadius: "8px",
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
          <div style={{ fontSize: "28px", fontWeight: "700", color: cadenceData.urgencyColor, marginBottom: "4px", fontFamily: "'Barlow Condensed', sans-serif" }}>
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
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#3b82f6", marginBottom: "4px", fontFamily: "'Barlow Condensed', sans-serif" }}>
            {cadenceData.avgDaysBetweenUploads !== null ? `${cadenceData.avgDaysBetweenUploads.toFixed(1)}` : "N/A"}
          </div>
          <div style={{ fontSize: "11px", color: "#666" }}>days between uploads</div>
        </div>

        <div style={{ background: "#252525", padding: "16px", borderRadius: "8px" }}>
          <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Consistency Score
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#f59e0b", marginBottom: "4px", fontFamily: "'Barlow Condensed', sans-serif" }}>
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
