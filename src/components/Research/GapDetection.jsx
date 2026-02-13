import React, { useState, useEffect, useCallback } from "react";
import {
  Crosshair, ChevronDown, ChevronUp, FileText, Check, Loader,
  Users, AlertTriangle,
} from "lucide-react";

const TYPE_CONFIG = {
  format:       { label: "Format",       color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  pattern:      { label: "Title Pattern",color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  content_type: { label: "Content Type", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  frequency:    { label: "Frequency",    color: "#ef4444", bg: "rgba(239,68,68,0.1)"  },
  series:       { label: "Series",       color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  topic:        { label: "Topic",        color: "#ec4899", bg: "rgba(236,72,153,0.1)" },
};

const IMPACT_COLORS = {
  high:   { color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  medium: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  low:    { color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
};

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

export default function GapDetection({ rows, activeClient }) {
  const [gaps, setGaps] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noCompetitors, setNoCompetitors] = useState(false);

  const [typeFilter, setTypeFilter] = useState("all");
  const [impactFilter, setImpactFilter] = useState("all");
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [sentToBrief, setSentToBrief] = useState({});

  const runDetection = useCallback(async () => {
    if (!rows || rows.length === 0 || !activeClient?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setNoCompetitors(false);

    try {
      const { detectAllGaps } = await import("../../services/gapDetectionService");
      const result = await detectAllGaps(rows, activeClient.id);

      if (result.noCompetitors) {
        setNoCompetitors(true);
        setGaps([]);
        setSummary(null);
      } else {
        setGaps(result.gaps);
        setSummary(result.summary);
      }
    } catch (err) {
      console.error("[GapDetection] Detection failed:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [rows, activeClient?.id]);

  useEffect(() => {
    runDetection();
  }, [runDetection]);

  const toggleCard = (id) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const sendGapToBrief = async (gap) => {
    try {
      const { supabase } = await import("../../services/supabaseClient");
      if (!supabase) throw new Error("Supabase not configured");

      const { data: { user } } = await supabase.auth.getUser();

      const { error: insertError } = await supabase
        .from("briefs")
        .insert({
          client_id: activeClient?.id || null,
          title: gap.action || gap.title,
          status: "draft",
          source_type: "gap_detection",
          brief_data: {
            gap_type: gap.type,
            gap_title: gap.title,
            description: gap.description,
            action: gap.action,
            impact: gap.impact,
            confidence: gap.confidence,
            effort: gap.effort,
            score: gap.score,
            evidence: gap.evidence,
            generated_from: "gap_detection",
          },
          created_by: user?.id || null,
        });

      if (insertError) throw insertError;
      setSentToBrief(prev => ({ ...prev, [gap.id]: true }));
    } catch (err) {
      console.error("[GapDetection] Failed to create brief:", err);
      setError("Failed to send to brief: " + err.message);
    }
  };

  // Filter gaps
  const filtered = gaps.filter(g => {
    if (typeFilter !== "all" && g.type !== typeFilter) return false;
    if (impactFilter !== "all" && g.impact !== impactFilter) return false;
    return true;
  });

  return (
    <div style={{ padding: "0" }}>
      {/* Header */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <Crosshair size={20} color="#ef4444" />
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff" }}>
            Gap Detection
          </div>
        </div>
        <div style={{ fontSize: "12px", color: "#888" }}>
          Automated comparison of your content strategy vs competitor strategies
        </div>
      </div>

      {error && (
        <div style={{
          background: "#2d1b1b",
          border: "1px solid #7f1d1d",
          borderRadius: "8px",
          padding: "12px",
          color: "#fca5a5",
          fontSize: "13px",
          marginBottom: "16px",
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "48px 24px",
          textAlign: "center",
          color: "#888",
        }}>
          <Loader size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ fontSize: "14px", fontWeight: "600" }}>Analyzing competitor gaps...</div>
          <div style={{ fontSize: "12px", marginTop: "4px" }}>
            Comparing formats, patterns, topics, and cadence
          </div>
        </div>
      )}

      {/* No competitors */}
      {!loading && noCompetitors && (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "48px 24px",
          textAlign: "center",
          color: "#666",
        }}>
          <Users size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
          <div style={{ fontSize: "15px", marginBottom: "6px", color: "#888" }}>
            No competitors tracked
          </div>
          <div style={{ fontSize: "12px" }}>
            Add competitor channels in the Competitors tab to enable gap detection.
          </div>
        </div>
      )}

      {/* No data */}
      {!loading && !noCompetitors && !error && rows?.length === 0 && (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "48px 24px",
          textAlign: "center",
          color: "#666",
        }}>
          <AlertTriangle size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
          <div style={{ fontSize: "15px", marginBottom: "6px", color: "#888" }}>
            No client video data
          </div>
          <div style={{ fontSize: "12px" }}>
            Upload your YouTube Analytics CSV to compare against competitors.
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && !noCompetitors && gaps.length > 0 && (
        <>
          {/* Summary bar */}
          {summary && (
            <div style={{
              background: "#1E1E1E",
              border: "1px solid #333",
              borderRadius: "12px",
              padding: "16px 20px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
            }}>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff" }}>
                {summary.total} gaps detected
              </div>
              <div style={{ fontSize: "11px", color: "#666" }}>
                from {summary.competitorCount} competitor{summary.competitorCount !== 1 ? 's' : ''} • {fmtInt(summary.videoCount)} videos analyzed
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {Object.entries(summary.byType || {}).map(([type, count]) => {
                  const cfg = TYPE_CONFIG[type] || {};
                  return (
                    <span key={type} style={{
                      background: cfg.bg,
                      color: cfg.color,
                      border: `1px solid ${cfg.color}`,
                      borderRadius: "12px",
                      padding: "2px 10px",
                      fontSize: "11px",
                      fontWeight: "600",
                    }}>
                      {cfg.label}: {count}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{
            display: "flex",
            gap: "6px",
            marginBottom: "20px",
            flexWrap: "wrap",
          }}>
            {/* Type filter */}
            {[
              { id: "all", label: "All Types" },
              ...Object.entries(TYPE_CONFIG).map(([id, cfg]) => ({ id, label: cfg.label })),
            ].map(f => (
              <button
                key={`type_${f.id}`}
                onClick={() => setTypeFilter(f.id)}
                style={{
                  background: typeFilter === f.id ? "#3b82f6" : "#252525",
                  border: `1px solid ${typeFilter === f.id ? "#3b82f6" : "#444"}`,
                  borderRadius: "16px",
                  padding: "6px 14px",
                  color: typeFilter === f.id ? "#fff" : "#b0b0b0",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            ))}

            <div style={{ width: "1px", background: "#333", margin: "0 4px" }} />

            {/* Impact filter */}
            {["all", "high", "medium", "low"].map(level => (
              <button
                key={`impact_${level}`}
                onClick={() => setImpactFilter(level)}
                style={{
                  background: impactFilter === level ? "#3b82f6" : "#252525",
                  border: `1px solid ${impactFilter === level ? "#3b82f6" : "#444"}`,
                  borderRadius: "16px",
                  padding: "6px 14px",
                  color: impactFilter === level ? "#fff" : "#b0b0b0",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {level === "all" ? "All Impact" : `${level} Impact`}
              </button>
            ))}
          </div>

          {/* Gap cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filtered.map((gap, idx) => {
              const typeCfg = TYPE_CONFIG[gap.type] || {};
              const impactCfg = IMPACT_COLORS[gap.impact] || {};
              const isExpanded = expandedCards.has(gap.id);

              return (
                <div key={gap.id} style={{
                  background: "#1E1E1E",
                  border: `1px solid #333`,
                  borderLeft: `4px solid ${typeCfg.color || "#666"}`,
                  borderRadius: "12px",
                  overflow: "hidden",
                }}>
                  {/* Card header (clickable) */}
                  <div
                    onClick={() => toggleCard(gap.id)}
                    style={{
                      padding: "16px 20px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                    }}
                  >
                    {/* Rank badge */}
                    <div style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      background: typeCfg.bg || "#252525",
                      color: typeCfg.color || "#888",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "13px",
                      fontWeight: "700",
                      flexShrink: 0,
                    }}>
                      {idx + 1}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title row */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                        <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>
                          {gap.title}
                        </div>
                        <span style={{
                          background: typeCfg.bg,
                          color: typeCfg.color,
                          border: `1px solid ${typeCfg.color}`,
                          borderRadius: "4px",
                          padding: "1px 8px",
                          fontSize: "10px",
                          fontWeight: "700",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}>
                          {gap.typeLabel}
                        </span>
                      </div>

                      {/* Description */}
                      <div style={{ fontSize: "13px", color: "#b0b0b0", marginBottom: "8px" }}>
                        {gap.description}
                      </div>

                      {/* Pills row */}
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{
                          background: impactCfg.bg,
                          color: impactCfg.color,
                          border: `1px solid ${impactCfg.color}`,
                          borderRadius: "4px",
                          padding: "1px 8px",
                          fontSize: "10px",
                          fontWeight: "600",
                          textTransform: "uppercase",
                        }}>
                          {gap.impact} impact
                        </span>
                        <span style={{
                          background: "#252525",
                          color: "#9ca3af",
                          border: "1px solid #444",
                          borderRadius: "4px",
                          padding: "1px 8px",
                          fontSize: "10px",
                          fontWeight: "600",
                          textTransform: "uppercase",
                        }}>
                          {gap.confidence} confidence
                        </span>
                        <span style={{
                          background: "#252525",
                          color: "#9ca3af",
                          border: "1px solid #444",
                          borderRadius: "4px",
                          padding: "1px 8px",
                          fontSize: "10px",
                          fontWeight: "600",
                          textTransform: "uppercase",
                        }}>
                          {gap.effort} effort
                        </span>

                        {/* Score bar */}
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{
                            width: "60px",
                            height: "6px",
                            background: "#252525",
                            borderRadius: "3px",
                            overflow: "hidden",
                          }}>
                            <div style={{
                              width: `${Math.round(gap.score * 100)}%`,
                              height: "100%",
                              background: typeCfg.color || "#666",
                              borderRadius: "3px",
                            }} />
                          </div>
                          <span style={{ fontSize: "11px", color: "#888", fontWeight: "600" }}>
                            {Math.round(gap.score * 100)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Expand chevron */}
                    <div style={{ flexShrink: 0, color: "#666", marginTop: "4px" }}>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{
                      padding: "0 20px 16px 60px",
                      borderTop: "1px solid #2a2a2a",
                    }}>
                      {/* Action */}
                      <div style={{
                        background: typeCfg.bg,
                        border: `1px solid ${typeCfg.color}`,
                        borderRadius: "8px",
                        padding: "12px 16px",
                        marginTop: "16px",
                        marginBottom: "16px",
                      }}>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: "#888", textTransform: "uppercase", marginBottom: "4px" }}>
                          Recommended Action
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: "600", color: typeCfg.color }}>
                          {gap.action}
                        </div>
                      </div>

                      {/* Evidence comparison */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginBottom: "16px",
                      }}>
                        <div style={{
                          background: "#252525",
                          borderRadius: "8px",
                          padding: "12px",
                          border: "1px solid #333",
                        }}>
                          <div style={{ fontSize: "10px", fontWeight: "700", color: "#888", textTransform: "uppercase", marginBottom: "4px" }}>
                            Competitors
                          </div>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff" }}>
                            {gap.evidence.competitorStat}
                          </div>
                        </div>
                        <div style={{
                          background: "#252525",
                          borderRadius: "8px",
                          padding: "12px",
                          border: "1px solid #333",
                        }}>
                          <div style={{ fontSize: "10px", fontWeight: "700", color: "#888", textTransform: "uppercase", marginBottom: "4px" }}>
                            Your Channel
                          </div>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff" }}>
                            {gap.evidence.clientStat}
                          </div>
                        </div>
                      </div>

                      {/* Top examples */}
                      {gap.evidence.topExamples?.length > 0 && (
                        <div style={{ marginBottom: "16px" }}>
                          <div style={{
                            fontSize: "11px",
                            fontWeight: "600",
                            color: "#888",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            marginBottom: "8px",
                          }}>
                            Top Competitor Examples
                          </div>
                          {gap.evidence.topExamples.map((ex, i) => (
                            <div key={i} style={{
                              background: "#0a0a0a",
                              border: "1px solid #222",
                              borderRadius: "6px",
                              padding: "10px 12px",
                              marginBottom: "6px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "12px",
                            }}>
                              <div style={{
                                color: "#E0E0E0",
                                fontSize: "13px",
                                fontWeight: "500",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                flex: 1,
                              }}>
                                {ex.title}
                              </div>
                              <div style={{ display: "flex", gap: "12px", flexShrink: 0 }}>
                                <span style={{ fontSize: "12px", color: "#888" }}>
                                  {fmtInt(ex.views)} views
                                </span>
                                {ex.channel && ex.channel !== '—' && (
                                  <span style={{ fontSize: "12px", color: "#666" }}>
                                    {ex.channel}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Send to Brief */}
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); sendGapToBrief(gap); }}
                          disabled={sentToBrief[gap.id]}
                          style={{
                            background: sentToBrief[gap.id] ? "rgba(16, 185, 129, 0.1)" : "#252525",
                            border: `1px solid ${sentToBrief[gap.id] ? "#10b981" : "#333"}`,
                            borderRadius: "8px",
                            padding: "6px 12px",
                            color: sentToBrief[gap.id] ? "#10b981" : "#9E9E9E",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: sentToBrief[gap.id] ? "default" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          {sentToBrief[gap.id] ? (
                            <><Check size={14} /> Sent to Briefs</>
                          ) : (
                            <><FileText size={14} /> Send to Briefs</>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* No results after filtering */}
          {filtered.length === 0 && gaps.length > 0 && (
            <div style={{
              background: "#1E1E1E",
              border: "1px solid #333",
              borderRadius: "12px",
              padding: "32px 24px",
              textAlign: "center",
              color: "#666",
              fontSize: "13px",
            }}>
              No gaps match your current filters. Try broadening your selection.
            </div>
          )}
        </>
      )}

      {/* No gaps found */}
      {!loading && !noCompetitors && !error && gaps.length === 0 && rows?.length > 0 && (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "48px 24px",
          textAlign: "center",
          color: "#666",
        }}>
          <Crosshair size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
          <div style={{ fontSize: "15px", marginBottom: "6px", color: "#888" }}>
            No significant gaps detected
          </div>
          <div style={{ fontSize: "12px" }}>
            Your content strategy closely matches competitor patterns — nice work!
          </div>
        </div>
      )}
    </div>
  );
}
