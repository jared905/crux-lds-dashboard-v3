import React, { useState, useEffect } from "react";
import { FileText, Calendar, ChevronDown, ChevronUp, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { getLatestBrief } from "../../services/intelligenceBriefService";

const SEVERITY_STYLES = {
  Critical: { bg: "rgba(239, 68, 68, 0.15)", border: "#ef4444", text: "#ef4444" },
  Warning:  { bg: "rgba(245, 158, 11, 0.15)", border: "#f59e0b", text: "#f59e0b" },
  Monitor:  { bg: "rgba(96, 165, 250, 0.15)", border: "#60a5fa", text: "#60a5fa" },
};

export default function IntelligenceBriefHero({ activeClient, onNavigateToStrategy }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!activeClient?.id) { setLoading(false); return; }
    setLoading(true);
    getLatestBrief(activeClient.id)
      .then(b => setBrief(b))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeClient?.id]);

  if (loading || !brief) return null;

  const constraint = brief.primary_constraint;
  const sevStyle = constraint ? SEVERITY_STYLES[constraint.severity] || SEVERITY_STYLES.Monitor : null;
  const actions = brief.recommended_actions || [];

  // Truncate executive summary to first 2-3 sentences for the hero card
  const summaryPreview = brief.executive_summary
    ? brief.executive_summary.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ')
    : null;

  return (
    <div className="section-card" style={{
      background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.04))",
      border: "1px solid rgba(99, 102, 241, 0.2)",
      borderRadius: "8px",
      padding: "20px",
      marginBottom: "24px",
      "--glow-color": "rgba(99, 102, 241, 0.15)",
    }}>
      {/* Top Row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "10px",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)",
          }}>
            <FileText size={18} style={{ color: "#fff" }} />
          </div>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>Weekly Intelligence Brief</div>
            <div style={{ fontSize: "11px", color: "#9E9E9E", display: "flex", alignItems: "center", gap: "4px" }}>
              <Calendar size={10} />
              {new Date(brief.brief_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {/* Constraint Badge */}
          {constraint && (
            <span style={{
              fontSize: "10px", fontWeight: "700", textTransform: "uppercase",
              color: sevStyle.text, background: sevStyle.bg,
              border: `1px solid ${sevStyle.border}`,
              padding: "3px 10px", borderRadius: "4px",
              display: "flex", alignItems: "center", gap: "4px",
            }}>
              <AlertTriangle size={10} /> {constraint.constraint}
            </span>
          )}

          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              padding: "4px 8px", borderRadius: "4px",
              border: "1px solid #333", background: "#252525",
              color: "#E0E0E0", cursor: "pointer", display: "flex", alignItems: "center",
            }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Summary Preview */}
      {summaryPreview && (
        <div style={{ fontSize: "13px", color: "#ccc", lineHeight: "1.5", marginBottom: expanded ? "16px" : "0" }}>
          {expanded ? brief.executive_summary : summaryPreview}
          {!expanded && brief.executive_summary.length > summaryPreview.length && (
            <span style={{ color: "#6366f1", cursor: "pointer", marginLeft: "4px" }} onClick={() => setExpanded(true)}>Read more</span>
          )}
        </div>
      )}

      {/* Expanded: actions + link */}
      {expanded && (
        <div style={{ borderTop: "1px solid #333", paddingTop: "12px" }}>
          {actions.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "#10b981", marginBottom: "8px" }}>
                Top Actions
              </div>
              {actions.slice(0, 3).map((a, i) => (
                <div key={i} style={{ fontSize: "13px", color: "#E0E0E0", padding: "4px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "#10b981", fontWeight: "700" }}>{i + 1}.</span>
                  {a.title}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => onNavigateToStrategy?.()}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 16px", borderRadius: "6px",
              background: "rgba(99, 102, 241, 0.15)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              color: "#818cf8", fontSize: "12px", fontWeight: "700",
              cursor: "pointer",
            }}
          >
            View Full Brief <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
