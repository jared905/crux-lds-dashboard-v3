import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Activity, TrendingUp, TrendingDown, ArrowRight, BarChart3,
  CheckCircle2, XCircle, Loader, Link2,
} from "lucide-react";
import UnifiedStrategy from "./UnifiedStrategy.jsx";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

const SOURCE_COLORS = {
  manual: "#6b7280",
  creative_brief: "#3b82f6",
  atomizer: "#8b5cf6",
  competitor_inspired: "#ec4899",
  opportunity_synthesis: "#f59e0b",
  gap_detection: "#ef4444",
};

const SOURCE_LABELS = {
  manual: "Manual",
  creative_brief: "Creative Brief",
  atomizer: "Atomizer",
  competitor_inspired: "Competitor",
  opportunity_synthesis: "Opportunity",
  gap_detection: "Gap Detection",
};

export default function PerformanceFeedback({
  rows, activeClient,
  channelSubscriberCount = 0, channelSubscriberMap = {}, selectedChannel = "all",
}) {
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadFeedback = useCallback(async () => {
    if (!rows || rows.length === 0 || !activeClient?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { supabase } = await import("../../services/supabaseClient");
      if (!supabase) { setLoading(false); return; }

      // Fetch all briefs for this client
      const { data: briefs, error } = await supabase
        .from("briefs")
        .select("*")
        .eq("client_id", activeClient.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { computeAggregateFeedback } = await import("../../services/feedbackService");
      const result = computeAggregateFeedback(briefs || [], rows);
      setFeedback({ ...result, totalBriefs: (briefs || []).length });
    } catch (err) {
      console.error("[PerformanceFeedback] Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, [rows, activeClient?.id]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  return (
    <div style={{ padding: "0" }}>
      {/* Header */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "4px",
          background: "linear-gradient(90deg, #22c55e, #3b82f6, #8b5cf6)",
        }} />
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <Activity size={20} color="#22c55e" />
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff" }}>
            Performance Feedback
          </div>
        </div>
        <div style={{ fontSize: "12px", color: "#888" }}>
          Track whether recommendations improved performance — link published briefs to videos in the Briefs tab
        </div>
      </div>

      {/* Section 1: Recommendation Accuracy */}
      {loading ? (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "32px",
          textAlign: "center",
          color: "#888",
          marginBottom: "24px",
        }}>
          <Loader size={20} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
          <div style={{ fontSize: "13px" }}>Loading feedback data...</div>
        </div>
      ) : (
        <>
          <AccuracySection feedback={feedback} />
          <ChannelTrendSection feedback={feedback} />
        </>
      )}

      {/* Section 3: Action Items (existing UnifiedStrategy) */}
      <UnifiedStrategy
        rows={rows}
        activeClient={activeClient}
        channelSubscriberCount={channelSubscriberCount}
        channelSubscriberMap={channelSubscriberMap}
        selectedChannel={selectedChannel}
      />
    </div>
  );
}

/**
 * Recommendation Accuracy card
 */
function AccuracySection({ feedback }) {
  if (!feedback) return null;

  const { accuracy, bySourceType, totalBriefs } = feedback;

  // No linked briefs yet
  if (!accuracy) {
    return (
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <BarChart3 size={18} color="#3b82f6" />
          <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>
            Recommendation Accuracy
          </div>
        </div>

        <div style={{
          background: "#252525",
          borderRadius: "8px",
          padding: "24px",
          textAlign: "center",
          color: "#666",
        }}>
          <Link2 size={32} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
          <div style={{ fontSize: "14px", color: "#888", marginBottom: "4px" }}>
            No linked briefs yet
          </div>
          <div style={{ fontSize: "12px" }}>
            {totalBriefs > 0
              ? `You have ${totalBriefs} brief${totalBriefs !== 1 ? 's' : ''} — mark them as "Published" and link to videos to track accuracy.`
              : "Create briefs from Action Items, Opportunities, or Gap Detection, then link them to published videos."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <BarChart3 size={18} color="#3b82f6" />
        <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>
          Recommendation Accuracy
        </div>
        <div style={{
          fontSize: "11px", color: "#888", background: "#252525",
          padding: "2px 8px", borderRadius: "4px",
        }}>
          {accuracy.total} linked brief{accuracy.total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Big stats */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{
          flex: 1,
          minWidth: "180px",
          background: accuracy.outperformedPct >= 50 ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
          border: `1px solid ${accuracy.outperformedPct >= 50 ? "#10b981" : "#ef4444"}`,
          borderRadius: "12px",
          padding: "20px",
          textAlign: "center",
        }}>
          <div style={{
            fontSize: "36px",
            fontWeight: "800",
            color: accuracy.outperformedPct >= 50 ? "#10b981" : "#ef4444",
          }}>
            {accuracy.outperformedPct}%
          </div>
          <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>
            outperformed baseline
          </div>
          <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
            {accuracy.outperformed} of {accuracy.total} recommendations
          </div>
        </div>

        {accuracy.exceededPredictionPct != null && (
          <div style={{
            flex: 1,
            minWidth: "180px",
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid #3b82f6",
            borderRadius: "12px",
            padding: "20px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "36px", fontWeight: "800", color: "#3b82f6" }}>
              {accuracy.exceededPredictionPct}%
            </div>
            <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>
              exceeded predictions
            </div>
            <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
              {accuracy.exceededPrediction} beat their estimated impact
            </div>
          </div>
        )}
      </div>

      {/* By source type */}
      {Object.keys(bySourceType).length > 0 && (
        <div>
          <div style={{
            fontSize: "11px", fontWeight: "600", color: "#888",
            textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px",
          }}>
            Accuracy by Source
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {Object.entries(bySourceType).map(([src, data]) => {
              const pct = data.total > 0 ? Math.round((data.outperformed / data.total) * 100) : 0;
              const color = SOURCE_COLORS[src] || "#666";
              return (
                <div key={src} style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "6px 0",
                }}>
                  <div style={{
                    width: "100px", fontSize: "12px", color: "#b0b0b0", fontWeight: "500",
                  }}>
                    {SOURCE_LABELS[src] || src}
                  </div>
                  <div style={{
                    flex: 1, height: "8px", background: "#252525",
                    borderRadius: "4px", overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${pct}%`, height: "100%",
                      background: color, borderRadius: "4px",
                    }} />
                  </div>
                  <div style={{ width: "40px", fontSize: "12px", fontWeight: "700", color, textAlign: "right" }}>
                    {pct}%
                  </div>
                  <div style={{ width: "50px", fontSize: "11px", color: "#666", textAlign: "right" }}>
                    {data.outperformed}/{data.total}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Channel Performance Trend (before/after)
 */
function ChannelTrendSection({ feedback }) {
  if (!feedback?.channelBefore || !feedback?.channelAfter) return null;

  const { channelBefore, channelAfter } = feedback;

  const metrics = [
    {
      label: "Avg Views/Video",
      before: channelBefore.avgViews,
      after: channelAfter.avgViews,
      format: "int",
    },
    {
      label: "Avg CTR",
      before: channelBefore.avgCtr,
      after: channelAfter.avgCtr,
      format: "pct",
    },
    {
      label: "Avg Retention",
      before: channelBefore.avgRetention,
      after: channelAfter.avgRetention,
      format: "pct",
    },
    {
      label: "Upload Count",
      before: channelBefore.videoCount,
      after: channelAfter.videoCount,
      format: "int",
    },
  ];

  return (
    <div style={{
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <TrendingUp size={18} color="#22c55e" />
        <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>
          Channel Performance Trend
        </div>
        <div style={{
          fontSize: "11px", color: "#888", background: "#252525",
          padding: "2px 8px", borderRadius: "4px",
        }}>
          Auto-computed
        </div>
      </div>

      {/* Period labels */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr 40px 1fr",
        gap: "12px",
        marginBottom: "12px",
        padding: "0 0 8px 0",
        borderBottom: "1px solid #333",
      }}>
        <div />
        <div style={{ fontSize: "11px", fontWeight: "600", color: "#888", textTransform: "uppercase", textAlign: "center" }}>
          {channelBefore.period}
        </div>
        <div />
        <div style={{ fontSize: "11px", fontWeight: "600", color: "#888", textTransform: "uppercase", textAlign: "center" }}>
          {channelAfter.period}
        </div>
      </div>

      {/* Metrics */}
      {metrics.map((m, idx) => {
        const formatVal = (v) => {
          if (v == null || isNaN(v)) return "—";
          return m.format === "pct" ? fmtPct(v) : fmtInt(v);
        };

        const delta = m.before > 0 ? ((m.after - m.before) / m.before) : null;
        const isPositive = delta != null && delta > 0;
        const isNegative = delta != null && delta < 0;

        return (
          <div key={idx} style={{
            display: "grid",
            gridTemplateColumns: "140px 1fr 40px 1fr",
            gap: "12px",
            padding: "10px 0",
            borderBottom: idx < metrics.length - 1 ? "1px solid #2a2a2a" : "none",
            alignItems: "center",
          }}>
            <div style={{ fontSize: "13px", color: "#b0b0b0", fontWeight: "500" }}>
              {m.label}
            </div>
            <div style={{
              textAlign: "center",
              fontSize: "15px",
              fontWeight: "700",
              color: "#9ca3af",
            }}>
              {formatVal(m.before)}
            </div>
            <div style={{ textAlign: "center" }}>
              <ArrowRight size={14} color="#666" />
            </div>
            <div style={{
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}>
              <span style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>
                {formatVal(m.after)}
              </span>
              {delta != null && (
                <span style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  color: isPositive ? "#22c55e" : isNegative ? "#ef4444" : "#888",
                  display: "flex",
                  alignItems: "center",
                  gap: "2px",
                }}>
                  {isPositive ? <TrendingUp size={10} /> : isNegative ? <TrendingDown size={10} /> : null}
                  {isPositive ? "+" : ""}{Math.round(delta * 100)}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
