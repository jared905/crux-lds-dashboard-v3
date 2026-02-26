/**
 * DiagnosticSummaryCard - Condensed diagnostic insights for the Dashboard.
 * Shows primary constraint, top 3 actionable patterns, and total opportunity.
 */

import { AlertTriangle, ArrowRight, Zap, Target, TrendingUp } from "lucide-react";
import useDiagnostics from "../../hooks/useDiagnostics";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

const severityColors = {
  Critical: "#ef4444",
  Warning: "#f59e0b",
  Monitor: "#10b981"
};

const severityBg = {
  Critical: "rgba(239, 68, 68, 0.1)",
  Warning: "rgba(245, 158, 11, 0.1)",
  Monitor: "rgba(16, 185, 129, 0.1)"
};

export default function DiagnosticSummaryCard({ rows, onNavigateToOpportunities }) {
  const diagnostics = useDiagnostics(rows);

  if (!diagnostics) return null;

  const totalOpportunity = diagnostics.patterns.reduce((sum, p) => sum + (p.opportunity || 0), 0);

  // Get top 3 actionable patterns (skip Format Ecosystem Analysis which is informational)
  const actionablePatterns = diagnostics.patterns
    .filter(p => p.action && p.effort !== "N/A")
    .slice(0, 3);

  const patternIcons = {
    "Topic Amplification": <TrendingUp size={14} style={{ color: "#22c55e" }} />,
    "Topic Elimination": <Target size={14} style={{ color: "#ef4444" }} />,
    "Packaging Formula": <Zap size={14} style={{ color: "#a855f7" }} />,
    "Packaging Optimization": <Zap size={14} style={{ color: "#ec4899" }} />,
    "Retention Optimization": <Zap size={14} style={{ color: "#f59e0b" }} />,
    "Upload Velocity": <TrendingUp size={14} style={{ color: "#3b82f6" }} />,
  };

  return (
    <div style={{
      backgroundColor: "#1E1E1E",
      border: "2px solid #333",
      borderRadius: "8px",
      padding: "24px",
      marginBottom: "20px"
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "20px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <AlertTriangle size={20} style={{ color: severityColors[diagnostics.constraintSeverity] }} />
          <div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>
              Channel Diagnostic
            </div>
            <div style={{ fontSize: "11px", color: "#9E9E9E", marginTop: "2px" }}>
              {rows.length} videos analyzed
            </div>
          </div>
        </div>

        {onNavigateToOpportunities && (
          <button
            onClick={onNavigateToOpportunities}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              backgroundColor: "#252525",
              border: "1px solid #333",
              borderRadius: "8px",
              color: "#60a5fa",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => { e.target.style.backgroundColor = "#333"; }}
            onMouseLeave={(e) => { e.target.style.backgroundColor = "#252525"; }}
          >
            View Full Strategy
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      {/* Constraint + Opportunity Row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        gap: "16px",
        alignItems: "center",
        marginBottom: "20px"
      }}>
        {/* Primary Constraint */}
        <div style={{
          backgroundColor: severityBg[diagnostics.constraintSeverity],
          border: `1px solid ${severityColors[diagnostics.constraintSeverity]}30`,
          borderRadius: "8px",
          padding: "14px 16px"
        }}>
          <div style={{
            fontSize: "9px",
            fontWeight: "700",
            color: severityColors[diagnostics.constraintSeverity],
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "4px"
          }}>
            {diagnostics.constraintSeverity} Constraint
          </div>
          <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>
            {diagnostics.primaryConstraint}
          </div>
          <div style={{ fontSize: "11px", color: "#b0b0b0", marginTop: "4px", lineHeight: "1.4" }}>
            {diagnostics.constraintEvidence.split('.')[0]}.
          </div>
        </div>

        <div style={{ width: "1px", height: "60px", backgroundColor: "#333" }} />

        {/* Total Opportunity */}
        <div style={{
          backgroundColor: "rgba(16, 185, 129, 0.08)",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          borderRadius: "8px",
          padding: "14px 16px"
        }}>
          <div style={{
            fontSize: "9px",
            fontWeight: "700",
            color: "#10b981",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "4px"
          }}>
            Total Opportunity
          </div>
          <div style={{ fontSize: "24px", fontWeight: "800", color: "#10b981" }}>
            +{fmtInt(totalOpportunity)}
          </div>
          <div style={{ fontSize: "11px", color: "#b0b0b0", marginTop: "2px" }}>
            potential views from {diagnostics.patterns.length} patterns
          </div>
        </div>
      </div>

      {/* Top Actions */}
      {actionablePatterns.length > 0 && (
        <div>
          <div style={{
            fontSize: "9px",
            fontWeight: "700",
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "10px"
          }}>
            Top Actions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {actionablePatterns.map((pattern, idx) => (
              <div key={idx} style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                backgroundColor: "#252525",
                borderRadius: "8px",
                border: "1px solid #333"
              }}>
                {patternIcons[pattern.type] || <Zap size={14} style={{ color: "#9E9E9E" }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#E0E0E0",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}>
                    {pattern.finding}
                  </div>
                </div>
                {pattern.effort && pattern.effort !== "N/A" && (
                  <div style={{
                    fontSize: "10px",
                    fontWeight: "600",
                    color: pattern.effort === "Low" ? "#22c55e" : pattern.effort === "Medium" ? "#f59e0b" : "#ef4444",
                    backgroundColor: pattern.effort === "Low" ? "rgba(34,197,94,0.1)" : pattern.effort === "Medium" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    textTransform: "uppercase",
                    flexShrink: 0
                  }}>
                    {pattern.effort} Effort
                  </div>
                )}
                {pattern.opportunity > 0 && (
                  <div style={{
                    fontSize: "11px",
                    fontWeight: "700",
                    color: "#10b981",
                    flexShrink: 0
                  }}>
                    +{fmtInt(pattern.opportunity)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
