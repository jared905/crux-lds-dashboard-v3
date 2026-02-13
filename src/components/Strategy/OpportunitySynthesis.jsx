import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Compass, Loader, FileText, Check, ChevronDown, ChevronRight } from "lucide-react";

const SOURCE_COLORS = {
  diagnostics: { bg: "rgba(59, 130, 246, 0.1)", border: "#3b82f6", text: "#3b82f6", label: "Diagnostics" },
  competitor: { bg: "rgba(139, 92, 246, 0.1)", border: "#8b5cf6", text: "#8b5cf6", label: "Competitor" },
  audit: { bg: "rgba(16, 185, 129, 0.1)", border: "#10b981", text: "#10b981", label: "Audit" },
};

const IMPACT_COLORS = {
  high: { bg: "rgba(239, 68, 68, 0.1)", color: "#ef4444" },
  medium: { bg: "rgba(245, 158, 11, 0.1)", color: "#f59e0b" },
  low: { bg: "rgba(107, 114, 128, 0.1)", color: "#6b7280" },
};

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "500",
        border: active ? "1px solid #3b82f6" : "1px solid #444",
        background: active ? "rgba(59, 130, 246, 0.15)" : "transparent",
        color: active ? "#93c5fd" : "#888",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export default function OpportunitySynthesis({ rows, activeClient }) {
  const [opportunities, setOpportunities] = useState([]);
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sourceFilter, setSourceFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [impactFilter, setImpactFilter] = useState("all");

  const [expandedCards, setExpandedCards] = useState({});
  const [sentToBrief, setSentToBrief] = useState({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { synthesizeOpportunities } = await import("../../services/opportunityService");
        const result = await synthesizeOpportunities(rows || [], activeClient?.id);
        if (!cancelled) {
          setOpportunities(result.opportunities);
          setSources(result.sources);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [rows, activeClient?.id]);

  const filtered = useMemo(() => {
    return opportunities.filter(op => {
      if (sourceFilter !== "all" && op.source !== sourceFilter) return false;
      if (formatFilter !== "all") {
        if (op.format !== formatFilter && op.format !== "both" && op.format !== null) return false;
      }
      if (impactFilter !== "all" && op.impact !== impactFilter) return false;
      return true;
    });
  }, [opportunities, sourceFilter, formatFilter, impactFilter]);

  const sendToBrief = useCallback(async (item) => {
    try {
      const { supabase } = await import("../../services/supabaseClient");
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();

      const { error: insertError } = await supabase.from("briefs").insert({
        client_id: activeClient?.id || null,
        title: item.action || item.title,
        status: "draft",
        source_type: "opportunity_synthesis",
        brief_data: {
          opportunity_title: item.title,
          source: item.sourceLabel,
          action: item.action,
          evidence: item.evidence,
          impact: item.impact,
          confidence: item.confidence,
          effort: item.effort,
          score: item.score,
          format: item.format,
          generated_from: `opportunity_synthesis_${item.source}`,
        },
        created_by: user?.id || null,
      });

      if (insertError) throw insertError;
      setSentToBrief(prev => ({ ...prev, [item.id]: true }));
    } catch (err) {
      console.error("[OpportunitySynthesis] Failed to create brief:", err);
    }
  }, [activeClient?.id]);

  const toggleExpand = (id) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", color: "#888" }}>
        <Loader size={28} style={{ animation: "spin 1s linear infinite", marginBottom: "12px" }} />
        <div style={{ fontSize: "14px" }}>Synthesizing opportunities...</div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const totalSources = sources ? [sources.diagnostics, sources.competitor, sources.audit].filter(s => s.count > 0).length : 0;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
      {/* Header */}
      <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", padding: "24px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
          <Compass size={22} color="#3b82f6" />
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff" }}>Opportunity Synthesis</div>
        </div>
        <div style={{ fontSize: "13px", color: "#888", marginBottom: "16px" }}>
          {opportunities.length} opportunities ranked from {totalSources} source{totalSources !== 1 ? "s" : ""}
        </div>

        {/* Source badges */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {sources && Object.entries(SOURCE_COLORS).map(([key, colors]) => {
            const src = sources[key];
            if (!src) return null;
            return (
              <div key={key} style={{
                padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "600",
                background: src.count > 0 ? colors.bg : "rgba(75,75,75,0.2)",
                color: src.count > 0 ? colors.text : "#555",
                border: `1px solid ${src.count > 0 ? colors.border : "#444"}`,
              }}>
                {colors.label}: {src.count > 0 ? `${src.count} items` : "No data"}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: "#666", fontWeight: "600", textTransform: "uppercase", marginRight: "4px" }}>Source</span>
        <FilterChip label="All" active={sourceFilter === "all"} onClick={() => setSourceFilter("all")} />
        <FilterChip label="Diagnostics" active={sourceFilter === "diagnostics"} onClick={() => setSourceFilter("diagnostics")} />
        <FilterChip label="Competitor" active={sourceFilter === "competitor"} onClick={() => setSourceFilter("competitor")} />
        <FilterChip label="Audit" active={sourceFilter === "audit"} onClick={() => setSourceFilter("audit")} />

        <span style={{ fontSize: "11px", color: "#666", fontWeight: "600", textTransform: "uppercase", marginLeft: "12px", marginRight: "4px" }}>Format</span>
        <FilterChip label="All" active={formatFilter === "all"} onClick={() => setFormatFilter("all")} />
        <FilterChip label="Shorts" active={formatFilter === "short"} onClick={() => setFormatFilter("short")} />
        <FilterChip label="Long-form" active={formatFilter === "long"} onClick={() => setFormatFilter("long")} />

        <span style={{ fontSize: "11px", color: "#666", fontWeight: "600", textTransform: "uppercase", marginLeft: "12px", marginRight: "4px" }}>Impact</span>
        <FilterChip label="All" active={impactFilter === "all"} onClick={() => setImpactFilter("all")} />
        <FilterChip label="High" active={impactFilter === "high"} onClick={() => setImpactFilter("high")} />
        <FilterChip label="Medium" active={impactFilter === "medium"} onClick={() => setImpactFilter("medium")} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#2d1b1b", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "14px", color: "#fca5a5", fontSize: "13px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!error && filtered.length === 0 && (
        <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", padding: "40px", textAlign: "center", color: "#666", fontSize: "14px" }}>
          {opportunities.length === 0
            ? "No opportunities found. Upload video data, run an audit, or add competitor channels to surface opportunities."
            : "No opportunities match your filters."}
        </div>
      )}

      {/* Opportunity Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {filtered.map((item, idx) => {
          const srcColor = SOURCE_COLORS[item.source] || SOURCE_COLORS.diagnostics;
          const impColor = IMPACT_COLORS[item.impact] || IMPACT_COLORS.medium;
          const expanded = expandedCards[item.id];

          return (
            <div key={item.id} style={{
              background: "#1E1E1E", border: "1px solid #333", borderRadius: "10px",
              overflow: "hidden",
            }}>
              {/* Main row */}
              <div
                onClick={() => toggleExpand(item.id)}
                style={{ padding: "16px", cursor: "pointer", display: "flex", gap: "14px", alignItems: "flex-start" }}
              >
                {/* Rank */}
                <div style={{
                  width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: idx < 3 ? "rgba(59, 130, 246, 0.15)" : "rgba(75,75,75,0.3)",
                  color: idx < 3 ? "#93c5fd" : "#888",
                  fontSize: "12px", fontWeight: "700",
                }}>
                  {idx + 1}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff" }}>{item.title}</div>
                    <span style={{
                      padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "600",
                      background: srcColor.bg, color: srcColor.text, border: `1px solid ${srcColor.border}`,
                    }}>
                      {srcColor.label}
                    </span>
                    {item.format && (
                      <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "10px", color: "#888", border: "1px solid #444" }}>
                        {item.format === "short" ? "Shorts" : item.format === "long" ? "Long-form" : "Both"}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: "13px", color: "#b0b0b0", marginBottom: "8px" }}>{item.action}</div>

                  {/* Impact / Confidence / Effort pills */}
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "600",
                      background: impColor.bg, color: impColor.color,
                    }}>
                      {item.impact} impact
                    </span>
                    <span style={{
                      padding: "2px 8px", borderRadius: "4px", fontSize: "10px",
                      background: "rgba(75,75,75,0.3)", color: "#888",
                    }}>
                      {item.confidence} confidence
                    </span>
                    <span style={{
                      padding: "2px 8px", borderRadius: "4px", fontSize: "10px",
                      background: "rgba(75,75,75,0.3)", color: "#888",
                    }}>
                      {item.effort} effort
                    </span>

                    {/* Score bar */}
                    <div style={{ flex: 1, maxWidth: "80px", height: "4px", background: "#333", borderRadius: "2px", marginLeft: "8px" }}>
                      <div style={{ width: `${Math.round(item.score * 100)}%`, height: "100%", background: "#3b82f6", borderRadius: "2px" }} />
                    </div>
                  </div>
                </div>

                {/* Chevron */}
                <div style={{ color: "#666", flexShrink: 0, marginTop: "4px" }}>
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </div>

              {/* Expanded detail */}
              {expanded && (
                <div style={{ padding: "0 16px 16px", borderTop: "1px solid #2a2a2a" }}>
                  {/* Evidence */}
                  <div style={{ padding: "12px 0" }}>
                    <div style={{ fontSize: "11px", fontWeight: "600", color: "#666", textTransform: "uppercase", marginBottom: "6px" }}>Evidence</div>
                    <div style={{ fontSize: "13px", color: "#b0b0b0", lineHeight: "1.6" }}>{item.evidence}</div>
                  </div>

                  {/* Source-specific details */}
                  {item.source === "diagnostics" && item.rawData?.examples?.length > 0 && (
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "600", color: "#666", textTransform: "uppercase", marginBottom: "6px" }}>Video Examples</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {item.rawData.examples.map((ex, i) => (
                          <div key={i} style={{ fontSize: "12px", color: "#999", padding: "6px 10px", background: "#252525", borderRadius: "6px" }}>
                            <span style={{ fontWeight: "600", color: ex.label?.startsWith("\u2713") ? "#22c55e" : "#ef4444" }}>{ex.label}</span>
                            {" — "}{ex.title} ({fmtInt(ex.views)} views)
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.source === "diagnostics" && item.rawData?.impact && (
                    <div style={{ marginBottom: "12px", padding: "10px", background: "#252525", borderRadius: "8px" }}>
                      <div style={{ fontSize: "12px", color: "#888" }}>Estimated impact</div>
                      <div style={{ fontSize: "16px", fontWeight: "700", color: "#3b82f6" }}>
                        +{fmtInt(item.rawData.impact.viewsPerMonth)} views/month
                        {item.rawData.impact.percentIncrease > 0 && (
                          <span style={{ fontSize: "13px", color: "#22c55e", marginLeft: "8px" }}>
                            (+{item.rawData.impact.percentIncrease}%)
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {item.source === "competitor" && item.rawData?.insight && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                      {item.rawData.insight.hookAnalysis && (
                        <div style={{ padding: "10px", background: "#252525", borderRadius: "8px" }}>
                          <div style={{ fontSize: "11px", fontWeight: "600", color: "#3b82f6", textTransform: "uppercase", marginBottom: "4px" }}>Hook Analysis</div>
                          <div style={{ fontSize: "13px", color: "#b0b0b0", lineHeight: "1.5" }}>{item.rawData.insight.hookAnalysis}</div>
                        </div>
                      )}
                      {item.rawData.insight.applicableTactics?.length > 0 && (
                        <div style={{ padding: "10px", background: "#252525", borderRadius: "8px" }}>
                          <div style={{ fontSize: "11px", fontWeight: "600", color: "#f59e0b", textTransform: "uppercase", marginBottom: "6px" }}>Applicable Tactics</div>
                          {item.rawData.insight.applicableTactics.map((t, i) => (
                            <div key={i} style={{ fontSize: "12px", color: "#b0b0b0", padding: "4px 8px", background: "#1a1a1a", borderRadius: "4px", marginBottom: "4px", borderLeft: "3px solid #f59e0b" }}>{t}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {item.source === "audit" && item.rawData && (
                    <div style={{ marginBottom: "12px" }}>
                      {item.rawData.current_state && item.rawData.target_state && (
                        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                          <div style={{ flex: 1, padding: "10px", background: "#252525", borderRadius: "8px" }}>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Current State</div>
                            <div style={{ fontSize: "13px", color: "#ef4444" }}>{item.rawData.current_state}</div>
                          </div>
                          <div style={{ flex: 1, padding: "10px", background: "#252525", borderRadius: "8px" }}>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Target State</div>
                            <div style={{ fontSize: "13px", color: "#22c55e" }}>{item.rawData.target_state}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reason (for diagnostics) */}
                  {item.rawData?.reason && (
                    <div style={{ fontSize: "12px", color: "#888", fontStyle: "italic", marginBottom: "12px" }}>
                      {item.rawData.reason}
                    </div>
                  )}

                  {/* Send to Brief */}
                  <button
                    onClick={(e) => { e.stopPropagation(); sendToBrief(item); }}
                    disabled={sentToBrief[item.id]}
                    style={{
                      padding: "8px 16px", borderRadius: "6px", border: "none",
                      background: sentToBrief[item.id] ? "#065f46" : "#3b82f6",
                      color: "#fff", fontSize: "12px", fontWeight: "600",
                      cursor: sentToBrief[item.id] ? "default" : "pointer",
                      display: "flex", alignItems: "center", gap: "6px",
                    }}
                  >
                    {sentToBrief[item.id]
                      ? <><Check size={14} /> Sent to Briefs</>
                      : <><FileText size={14} /> Send to Briefs</>}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
