import React, { useMemo, useState, useEffect } from "react";
import { Lightbulb, ChevronDown, ChevronUp, Zap, Target, TrendingUp, Eye, FileText, Check, ExternalLink, ArrowRight } from "lucide-react";
import { getUnifiedRecommendations } from "../../services/unifiedRecommendationService";
import { getYouTubeThumbnailUrl } from "../../lib/schema";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

const SOURCE_STYLES = {
  diagnostic: { bg: "rgba(96, 165, 250, 0.1)", border: "#60a5fa", text: "#60a5fa", label: "Diagnostics" },
  gap:        { bg: "rgba(168, 85, 247, 0.1)", border: "#a855f7", text: "#a855f7", label: "Competitor Gap" },
  outlier:    { bg: "rgba(251, 146, 60, 0.1)", border: "#fb923c", text: "#fb923c", label: "Breakout Intel" },
};

const IMPACT_STYLES = {
  high:   { color: "#10b981", label: "High Impact" },
  medium: { color: "#fbbf24", label: "Med Impact" },
  low:    { color: "#6b7280", label: "Low Impact" },
};

const EFFORT_MAP = {
  Low: { color: "#10b981", label: "Low Effort" },
  low: { color: "#10b981", label: "Low Effort" },
  Medium: { color: "#fbbf24", label: "Med Effort" },
  medium: { color: "#fbbf24", label: "Med Effort" },
  High: { color: "#ef4444", label: "High Effort" },
  high: { color: "#ef4444", label: "High Effort" },
};

export default function NextUpPanel({ rows, activeClient }) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [gaps, setGaps] = useState([]);
  const [outliers, setOutliers] = useState([]);
  const [sentToBrief, setSentToBrief] = useState({});

  // Fetch gaps and outliers asynchronously
  useEffect(() => {
    let cancelled = false;

    async function fetchGaps() {
      if (!activeClient?.id || !rows?.length) return;
      try {
        const { detectAllGaps } = await import("../../services/gapDetectionService");
        const result = await detectAllGaps(rows, activeClient.id);
        if (!cancelled && result?.gaps) setGaps(result.gaps);
      } catch (e) {
        console.warn("[NextUpPanel] Gap detection failed:", e.message);
      }
    }

    async function fetchOutliers() {
      if (!activeClient?.id) return;
      try {
        const { getChannels } = await import("../../services/competitorDatabase");
        const competitors = await getChannels({ clientId: activeClient.id, isCompetitor: true });
        if (!competitors?.length) return;

        const { getOutlierVideos } = await import("../../services/competitorInsightsService");
        const result = await getOutlierVideos({
          channelIds: competitors.map(c => c.id),
          days: 30,
          limit: 5,
        });
        if (!cancelled && result) setOutliers(result);
      } catch (e) {
        console.warn("[NextUpPanel] Outlier fetch failed:", e.message);
      }
    }

    fetchGaps();
    fetchOutliers();

    return () => { cancelled = true; };
  }, [activeClient?.id, rows]);

  const recommendations = useMemo(() => {
    if (!rows || rows.length < 5) return [];
    return getUnifiedRecommendations(rows, { gaps, outliers });
  }, [rows, gaps, outliers]);

  const filtered = useMemo(() => {
    if (filter === "all") return recommendations;
    return recommendations.filter(r => r.source === filter);
  }, [recommendations, filter]);

  const visible = showAll ? filtered : filtered.slice(0, 6);

  const sendToBrief = async (item) => {
    try {
      const { supabase } = await import("../../services/supabaseClient");
      if (!supabase) return;

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("briefs").insert({
        client_id: activeClient?.id || null,
        title: item.action || item.title,
        status: "draft",
        source_type: "unified_recommendation",
        brief_data: {
          recommendation_title: item.title,
          description: item.description,
          action: item.action,
          source: item.source,
          impact: item.impact,
          effort: item.effort,
          evidence: item.evidence,
        },
        created_by: user?.id || null,
      });
      setSentToBrief(prev => ({ ...prev, [item.id]: true }));
    } catch (err) {
      console.error("[NextUpPanel] Brief creation failed:", err);
    }
  };

  if (recommendations.length === 0) return null;

  const totalOpportunity = recommendations.reduce((sum, r) => sum + (r.opportunity || 0), 0);

  return (
    <div className="section-card" style={{
      background: "linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(96, 165, 250, 0.03))",
      border: "1px solid rgba(16, 185, 129, 0.15)",
      borderRadius: "8px",
      padding: "24px",
      marginBottom: "24px",
      "--glow-color": "rgba(16, 185, 129, 0.2)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "14px",
            background: "linear-gradient(135deg, #10b981, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(16, 185, 129, 0.3)", flexShrink: 0,
          }}>
            <Lightbulb size={22} style={{ color: "#fff" }} />
          </div>
          <div>
            <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff" }}>What to Create Next</div>
            <div style={{ fontSize: "13px", color: "#9E9E9E", marginTop: "2px" }}>
              Prioritized actions based on {recommendations.length} signals — turn insights into content
              {totalOpportunity > 0 && (
                <span style={{ color: "#10b981", fontWeight: "600", marginLeft: "8px" }}>
                  {fmtInt(totalOpportunity)} views in potential opportunity
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Chips */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { key: "all", label: "All", count: recommendations.length },
          { key: "diagnostic", label: "Diagnostics", count: recommendations.filter(r => r.source === "diagnostic").length },
          { key: "gap", label: "Competitor Gaps", count: recommendations.filter(r => r.source === "gap").length },
          { key: "outlier", label: "Breakout Intel", count: recommendations.filter(r => r.source === "outlier").length },
        ].filter(f => f.count > 0).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              border: filter === f.key ? "2px solid #10b981" : "1px solid #333",
              backgroundColor: filter === f.key ? "rgba(16, 185, 129, 0.15)" : "#252525",
              color: filter === f.key ? "#10b981" : "#E0E0E0",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Recommendations */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {visible.map((rec) => {
          const srcStyle = SOURCE_STYLES[rec.source] || SOURCE_STYLES.diagnostic;
          const impactStyle = IMPACT_STYLES[rec.impact] || IMPACT_STYLES.medium;
          const effortStyle = EFFORT_MAP[rec.effort] || EFFORT_MAP.Medium;
          const isExpanded = expanded[rec.id];

          return (
            <div key={rec.id} style={{
              backgroundColor: "#1E1E1E",
              border: `1px solid ${srcStyle.border}30`,
              borderLeft: `4px solid ${srcStyle.border}`,
              borderRadius: "8px",
              padding: "16px",
              transition: "border-color 0.2s ease",
            }}>
              {/* Top row: title + badges */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                    <span style={{
                      fontSize: "10px", fontWeight: "700", textTransform: "uppercase",
                      color: srcStyle.text, background: srcStyle.bg,
                      border: `1px solid ${srcStyle.border}`,
                      padding: "2px 8px", borderRadius: "4px",
                    }}>
                      {rec.sourceLabel || srcStyle.label}
                    </span>
                    <span style={{
                      fontSize: "10px", fontWeight: "700",
                      color: impactStyle.color, background: `${impactStyle.color}15`,
                      border: `1px solid ${impactStyle.color}`,
                      padding: "2px 8px", borderRadius: "4px",
                    }}>
                      {impactStyle.label}
                    </span>
                    <span style={{
                      fontSize: "10px", fontWeight: "700",
                      color: effortStyle.color, background: `${effortStyle.color}15`,
                      border: `1px solid ${effortStyle.color}`,
                      padding: "2px 8px", borderRadius: "4px",
                    }}>
                      {effortStyle.label}
                    </span>
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                    {rec.title}
                  </div>
                  {rec.action && (
                    <div style={{
                      fontSize: "13px", color: "#10b981", fontWeight: "600",
                      background: "rgba(16, 185, 129, 0.08)",
                      padding: "6px 10px", borderRadius: "6px", marginTop: "6px",
                    }}>
                      → {rec.action}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  {/* Create Brief button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); sendToBrief(rec); }}
                    disabled={sentToBrief[rec.id]}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: sentToBrief[rec.id] ? "1px solid #10b981" : "1px solid #333",
                      backgroundColor: sentToBrief[rec.id] ? "rgba(16, 185, 129, 0.15)" : "#252525",
                      color: sentToBrief[rec.id] ? "#10b981" : "#E0E0E0",
                      fontSize: "11px",
                      fontWeight: "700",
                      cursor: sentToBrief[rec.id] ? "default" : "pointer",
                      display: "flex", alignItems: "center", gap: "4px",
                    }}
                  >
                    {sentToBrief[rec.id] ? <><Check size={12} /> Sent</> : <><FileText size={12} /> Brief</>}
                  </button>
                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpanded(p => ({ ...p, [rec.id]: !p[rec.id] }))}
                    style={{
                      padding: "6px 8px", borderRadius: "6px",
                      border: "1px solid #333", backgroundColor: "#252525",
                      color: "#E0E0E0", cursor: "pointer", display: "flex", alignItems: "center",
                    }}
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #333" }}>
                  {rec.description && (
                    <div style={{ fontSize: "13px", color: "#ccc", marginBottom: "10px", lineHeight: "1.5", whiteSpace: "pre-line" }}>
                      {rec.description}
                    </div>
                  )}

                  {/* Evidence */}
                  {rec.evidence && (
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
                      {rec.evidence.competitorStat && (
                        <div style={{ fontSize: "12px", color: "#a855f7", background: "rgba(168, 85, 247, 0.08)", padding: "4px 10px", borderRadius: "6px" }}>
                          Competitors: {rec.evidence.competitorStat}
                        </div>
                      )}
                      {rec.evidence.clientStat && (
                        <div style={{ fontSize: "12px", color: "#60a5fa", background: "rgba(96, 165, 250, 0.08)", padding: "4px 10px", borderRadius: "6px" }}>
                          You: {rec.evidence.clientStat}
                        </div>
                      )}
                      {rec.evidence.outlierScore && (
                        <div style={{ fontSize: "12px", color: "#fb923c", background: "rgba(251, 146, 60, 0.08)", padding: "4px 10px", borderRadius: "6px" }}>
                          {rec.evidence.outlierScore.toFixed(1)}x channel average ({fmtInt(rec.evidence.views)} views)
                        </div>
                      )}
                      {rec.evidence.delta && (
                        <div style={{ fontSize: "12px", color: "#9E9E9E", background: "rgba(158, 158, 158, 0.08)", padding: "4px 10px", borderRadius: "6px" }}>
                          {rec.evidence.delta}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Video examples with thumbnails */}
                  {rec.videoExamples?.length > 0 && (
                    <div>
                      <div style={{ fontSize: "11px", fontWeight: "600", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                        Reference Videos
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {rec.videoExamples.slice(0, 5).map((v, i) => (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: "10px",
                            padding: "6px 10px", borderRadius: "6px",
                            backgroundColor: "#0a0a0a", border: "1px solid #1a1a1a",
                          }}>
                            {v.youtubeVideoId ? (
                              <a
                                href={v.youtubeUrl || `https://youtube.com/watch?v=${v.youtubeVideoId}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ flexShrink: 0 }}
                              >
                                <img
                                  src={getYouTubeThumbnailUrl(v.youtubeVideoId)}
                                  alt={v.title}
                                  style={{ width: "64px", height: "36px", borderRadius: "4px", objectFit: "cover", border: "1px solid #333" }}
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              </a>
                            ) : (
                              <div style={{ width: "64px", height: "36px", borderRadius: "4px", backgroundColor: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <FileText size={12} style={{ color: "#444" }} />
                              </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {v.youtubeUrl || v.youtubeVideoId ? (
                                <a
                                  href={v.youtubeUrl || `https://youtube.com/watch?v=${v.youtubeVideoId}`}
                                  target="_blank" rel="noopener noreferrer"
                                  style={{ fontSize: "12px", fontWeight: "600", color: "#ccc", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
                                >
                                  {v.title} <ExternalLink size={9} style={{ color: "#666", verticalAlign: "middle" }} />
                                </a>
                              ) : (
                                <div style={{ fontSize: "12px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {v.title}
                                </div>
                              )}
                              {v.channel && <div style={{ fontSize: "10px", color: "#666", marginTop: "1px" }}>{v.channel}</div>}
                            </div>
                            <div style={{ fontSize: "12px", color: "#10b981", fontWeight: "600", flexShrink: 0 }}>
                              {fmtInt(v.views)} views
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show More */}
      {filtered.length > 6 && (
        <button
          onClick={() => setShowAll(s => !s)}
          style={{
            marginTop: "16px", padding: "10px 20px",
            borderRadius: "8px", border: "1px solid #333",
            backgroundColor: "#252525", color: "#E0E0E0",
            fontSize: "13px", fontWeight: "700", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "6px",
            width: "100%", justifyContent: "center",
          }}
        >
          {showAll ? <><ChevronUp size={14} /> Show Less</> : <><ChevronDown size={14} /> Show All {filtered.length} Recommendations</>}
        </button>
      )}
    </div>
  );
}
