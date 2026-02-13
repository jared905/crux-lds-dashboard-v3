import React, { useState, useEffect, useCallback } from "react";
import {
  FileText, Trash2, ChevronDown, Loader, Link2, Unlink, TrendingUp, TrendingDown,
  Check, X as XIcon,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";

const STATUS_CONFIG = {
  draft:         { label: "Draft",         color: "#6b7280", bg: "#374151" },
  ready:         { label: "Ready",         color: "#3b82f6", bg: "#1e3a5f" },
  in_production: { label: "In Production", color: "#f59e0b", bg: "#854d0e" },
  published:     { label: "Published",     color: "#22c55e", bg: "#166534" },
  archived:      { label: "Archived",      color: "#9ca3af", bg: "#1f2937" },
};

const SOURCE_LABELS = {
  creative_brief: "Creative Brief",
  atomizer: "Atomizer",
  manual: "Manual",
  competitor_inspired: "Competitor",
  opportunity_synthesis: "Opportunity",
  gap_detection: "Gap Detection",
};

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

export default function BriefsList({ activeClient, clientVideos = [] }) {
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [linkingBriefId, setLinkingBriefId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  const fetchBriefs = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase
        .from("briefs")
        .select("*")
        .order("created_at", { ascending: false });

      if (activeClient?.id) {
        query = query.eq("client_id", activeClient.id);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;
      setBriefs(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeClient?.id, statusFilter]);

  useEffect(() => {
    fetchBriefs();
  }, [fetchBriefs]);

  const updateStatus = async (briefId, newStatus) => {
    try {
      const { error: updateErr } = await supabase
        .from("briefs")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", briefId);

      if (updateErr) throw updateErr;
      setBriefs(prev => prev.map(b => b.id === briefId ? { ...b, status: newStatus } : b));
    } catch (err) {
      setError("Failed to update: " + err.message);
    }
  };

  const deleteBrief = async (briefId) => {
    try {
      const { error: delErr } = await supabase
        .from("briefs")
        .delete()
        .eq("id", briefId);

      if (delErr) throw delErr;
      setBriefs(prev => prev.filter(b => b.id !== briefId));
    } catch (err) {
      setError("Failed to delete: " + err.message);
    }
  };

  // ─── Video Linking ──────────────────────────────────────────────────────

  const startLinking = async (brief) => {
    setLinkingBriefId(brief.id);
    try {
      const { suggestVideoMatches } = await import("../../services/feedbackService");
      const matches = suggestVideoMatches(brief, clientVideos);
      setSuggestions(matches);
    } catch (err) {
      console.error("[BriefsList] Failed to get suggestions:", err);
      setSuggestions([]);
    }
  };

  const linkVideo = async (briefId, video) => {
    try {
      const { computeBriefOutcome } = await import("../../services/feedbackService");
      const brief = briefs.find(b => b.id === briefId);
      if (!brief) return;

      const outcomeData = computeBriefOutcome(brief, video, clientVideos);

      const { error: updateErr } = await supabase
        .from("briefs")
        .update({
          linked_video_id: video.videoId || video.youtubeVideoId,
          outcome_data: outcomeData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", briefId);

      if (updateErr) throw updateErr;

      setBriefs(prev => prev.map(b =>
        b.id === briefId
          ? { ...b, linked_video_id: video.videoId || video.youtubeVideoId, outcome_data: outcomeData }
          : b
      ));
      setLinkingBriefId(null);
      setSuggestions([]);
    } catch (err) {
      setError("Failed to link video: " + err.message);
    }
  };

  const unlinkVideo = async (briefId) => {
    try {
      const { error: updateErr } = await supabase
        .from("briefs")
        .update({
          linked_video_id: null,
          outcome_data: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", briefId);

      if (updateErr) throw updateErr;

      setBriefs(prev => prev.map(b =>
        b.id === briefId ? { ...b, linked_video_id: null, outcome_data: null } : b
      ));
    } catch (err) {
      setError("Failed to unlink video: " + err.message);
    }
  };

  return (
    <div style={{ padding: "0" }}>
      {/* Header */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <FileText size={20} color="#3b82f6" />
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff" }}>Briefs</div>
            </div>
            <div style={{ fontSize: "12px", color: "#888" }}>
              Planned content items — link published briefs to videos to track outcomes
            </div>
          </div>
        </div>
      </div>

      {/* Status Filter */}
      <div style={{
        display: "flex",
        gap: "6px",
        marginBottom: "20px",
        flexWrap: "wrap"
      }}>
        {[
          { id: "all", label: "All" },
          ...Object.entries(STATUS_CONFIG).map(([id, cfg]) => ({ id, label: cfg.label })),
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            style={{
              background: statusFilter === f.id ? "#3b82f6" : "#252525",
              border: `1px solid ${statusFilter === f.id ? "#3b82f6" : "#444"}`,
              borderRadius: "16px",
              padding: "6px 14px",
              color: statusFilter === f.id ? "#fff" : "#b0b0b0",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          background: "#2d1b1b",
          border: "1px solid #7f1d1d",
          borderRadius: "8px",
          padding: "12px",
          color: "#fca5a5",
          fontSize: "13px",
          marginBottom: "16px"
        }}>
          {error}
        </div>
      )}

      {/* Briefs List */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        overflow: "hidden"
      }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
            <Loader size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
            <div style={{ fontSize: "13px" }}>Loading briefs...</div>
          </div>
        ) : briefs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "#666" }}>
            <FileText size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            <div style={{ fontSize: "15px", marginBottom: "6px" }}>No briefs yet</div>
            <div style={{ fontSize: "12px" }}>
              Use the Atomizer or Creative Brief to generate content briefs
            </div>
          </div>
        ) : (
          <div>
            {/* Table Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 120px 140px 80px",
              gap: "12px",
              padding: "12px 20px",
              borderBottom: "1px solid #333",
              fontSize: "11px",
              fontWeight: "600",
              color: "#888",
              textTransform: "uppercase",
            }}>
              <div>Title</div>
              <div>Status</div>
              <div>Source</div>
              <div>Created</div>
              <div></div>
            </div>

            {/* Rows */}
            {briefs.map(brief => {
              const statusCfg = STATUS_CONFIG[brief.status] || STATUS_CONFIG.draft;
              const isPublished = brief.status === "published";
              const hasLink = !!brief.linked_video_id;
              const isLinking = linkingBriefId === brief.id;
              const outcome = brief.outcome_data;

              return (
                <div key={brief.id} style={{ borderBottom: "1px solid #2a2a2a" }}>
                  {/* Main row */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 120px 140px 80px",
                    gap: "12px",
                    padding: "14px 20px",
                    alignItems: "center",
                    fontSize: "13px",
                  }}>
                    <div style={{
                      color: "#fff",
                      fontWeight: "500",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      {brief.title}
                    </div>

                    {/* Status dropdown */}
                    <div style={{ position: "relative" }}>
                      <select
                        value={brief.status}
                        onChange={(e) => updateStatus(brief.id, e.target.value)}
                        style={{
                          background: statusCfg.bg,
                          border: `1px solid ${statusCfg.color}`,
                          borderRadius: "6px",
                          padding: "4px 24px 4px 8px",
                          color: statusCfg.color,
                          fontSize: "11px",
                          fontWeight: "600",
                          cursor: "pointer",
                          appearance: "none",
                          width: "100%",
                        }}
                      >
                        {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                          <option key={val} value={val}>{cfg.label}</option>
                        ))}
                      </select>
                      <ChevronDown
                        size={12}
                        style={{
                          position: "absolute",
                          right: "6px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          pointerEvents: "none",
                          color: statusCfg.color,
                        }}
                      />
                    </div>

                    <div style={{ color: "#b0b0b0", fontSize: "12px" }}>
                      {SOURCE_LABELS[brief.source_type] || brief.source_type || "—"}
                    </div>

                    <div style={{ color: "#888", fontSize: "12px" }}>
                      {brief.created_at
                        ? new Date(brief.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </div>

                    <div style={{ display: "flex", gap: "4px" }}>
                      {/* Link/Unlink button for published briefs */}
                      {isPublished && !hasLink && clientVideos.length > 0 && (
                        <button
                          onClick={() => isLinking ? setLinkingBriefId(null) : startLinking(brief)}
                          style={{
                            background: isLinking ? "rgba(59, 130, 246, 0.15)" : "transparent",
                            border: `1px solid ${isLinking ? "#3b82f6" : "#555"}`,
                            borderRadius: "6px",
                            padding: "4px 8px",
                            color: isLinking ? "#3b82f6" : "#888",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                          }}
                          title="Link to video"
                        >
                          <Link2 size={12} />
                        </button>
                      )}
                      {hasLink && (
                        <button
                          onClick={() => unlinkVideo(brief.id)}
                          style={{
                            background: "transparent",
                            border: "1px solid #555",
                            borderRadius: "6px",
                            padding: "4px 8px",
                            color: "#888",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                          }}
                          title="Unlink video"
                        >
                          <Unlink size={12} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteBrief(brief.id)}
                        style={{
                          background: "transparent",
                          border: "1px solid #555",
                          borderRadius: "6px",
                          padding: "4px 8px",
                          color: "#888",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                        }}
                        title="Delete brief"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Outcome display for linked briefs */}
                  {hasLink && outcome && (
                    <div style={{
                      padding: "0 20px 14px 20px",
                    }}>
                      <div style={{
                        background: "#0a0a0a",
                        border: "1px solid #222",
                        borderRadius: "8px",
                        padding: "12px 16px",
                      }}>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "8px",
                        }}>
                          <Link2 size={12} color="#22c55e" />
                          <span style={{ fontSize: "12px", color: "#22c55e", fontWeight: "600" }}>
                            Linked Video
                          </span>
                          {outcome.actual?.title && (
                            <span style={{ fontSize: "12px", color: "#b0b0b0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {outcome.actual.title}
                            </span>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                          {/* Views */}
                          <MetricDelta
                            label="Views"
                            actual={outcome.actual?.views}
                            baseline={outcome.baseline?.views}
                            delta={outcome.delta?.views}
                            format="int"
                          />
                          {/* CTR */}
                          <MetricDelta
                            label="CTR"
                            actual={outcome.actual?.ctr}
                            baseline={outcome.baseline?.ctr}
                            delta={outcome.delta?.ctr}
                            format="pct"
                          />
                          {/* Retention */}
                          <MetricDelta
                            label="Retention"
                            actual={outcome.actual?.retention}
                            baseline={outcome.baseline?.retention}
                            delta={outcome.delta?.retention}
                            format="pct"
                          />

                          {/* Prediction comparison */}
                          {outcome.predicted?.viewsPerMonth && outcome.baseline?.views > 0 && (
                            <div style={{
                              marginLeft: "auto",
                              background: outcome.exceededPrediction
                                ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                              border: `1px solid ${outcome.exceededPrediction ? "#10b981" : "#ef4444"}`,
                              borderRadius: "6px",
                              padding: "4px 10px",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}>
                              <span style={{ fontSize: "10px", color: "#888", fontWeight: "600" }}>
                                PREDICTED
                              </span>
                              <span style={{
                                fontSize: "12px",
                                fontWeight: "700",
                                color: outcome.exceededPrediction ? "#10b981" : "#ef4444",
                              }}>
                                +{fmtInt(outcome.predicted.viewsPerMonth)}
                              </span>
                              <span style={{ fontSize: "10px", color: "#888" }}>vs actual</span>
                              <span style={{
                                fontSize: "12px",
                                fontWeight: "700",
                                color: outcome.exceededPrediction ? "#10b981" : "#ef4444",
                              }}>
                                {outcome.actual.views > outcome.baseline.views ? "+" : ""}{fmtInt(outcome.actual.views - outcome.baseline.views)}
                              </span>
                              {outcome.exceededPrediction ? (
                                <Check size={12} color="#10b981" />
                              ) : (
                                <XIcon size={12} color="#ef4444" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Video linking panel */}
                  {isLinking && (
                    <div style={{
                      padding: "0 20px 14px 20px",
                    }}>
                      <div style={{
                        background: "#0a0a0a",
                        border: "1px solid #3b82f6",
                        borderRadius: "8px",
                        padding: "12px 16px",
                      }}>
                        <div style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#3b82f6",
                          marginBottom: "8px",
                        }}>
                          Link to Published Video
                        </div>

                        {suggestions.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {suggestions.map((s, idx) => (
                              <div
                                key={idx}
                                onClick={() => linkVideo(brief.id, s)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  padding: "8px 12px",
                                  background: "#1E1E1E",
                                  border: "1px solid #333",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                }}
                              >
                                <div style={{
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  color: s.confidence > 0.3 ? "#22c55e" : "#f59e0b",
                                  minWidth: "36px",
                                }}>
                                  {Math.round(s.confidence * 100)}%
                                </div>
                                <div style={{
                                  flex: 1,
                                  fontSize: "12px",
                                  color: "#E0E0E0",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}>
                                  {s.title}
                                </div>
                                <div style={{ fontSize: "11px", color: "#888" }}>
                                  {fmtInt(s.views)} views
                                </div>
                                <div style={{ fontSize: "11px", color: "#666" }}>
                                  {s.publishDate
                                    ? new Date(s.publishDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                    : ""}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: "12px", color: "#666", padding: "8px 0" }}>
                            No matching videos found. Videos must be published within 60 days of this brief.
                          </div>
                        )}

                        <button
                          onClick={() => { setLinkingBriefId(null); setSuggestions([]); }}
                          style={{
                            marginTop: "8px",
                            background: "transparent",
                            border: "1px solid #444",
                            borderRadius: "6px",
                            padding: "4px 12px",
                            color: "#888",
                            fontSize: "11px",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Small metric with delta indicator
 */
function MetricDelta({ label, actual, baseline, delta, format }) {
  const formatVal = (v) => {
    if (v == null || isNaN(v)) return "—";
    return format === "pct" ? fmtPct(v) : fmtInt(v);
  };

  const isPositive = delta != null && delta > 0;
  const isNegative = delta != null && delta < 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <div style={{ fontSize: "10px", color: "#888", fontWeight: "600", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "14px", fontWeight: "700", color: "#fff" }}>
          {formatVal(actual)}
        </span>
        {delta != null && (
          <span style={{
            fontSize: "11px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "2px",
            color: isPositive ? "#22c55e" : isNegative ? "#ef4444" : "#888",
          }}>
            {isPositive ? <TrendingUp size={10} /> : isNegative ? <TrendingDown size={10} /> : null}
            {isPositive ? "+" : ""}{Math.round(delta * 100)}%
          </span>
        )}
      </div>
      {baseline > 0 && (
        <div style={{ fontSize: "10px", color: "#666" }}>
          baseline: {formatVal(baseline)}
        </div>
      )}
    </div>
  );
}
