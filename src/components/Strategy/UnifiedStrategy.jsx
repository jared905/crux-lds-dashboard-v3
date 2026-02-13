import React, { useMemo, useState } from "react";
import { CheckCircle2, Circle, ChevronDown, Video, Film, FileText, Check } from "lucide-react";
import DiagnosticEngine from "./DiagnosticEngine.jsx";
import ContentPerformanceTiers from "./ContentPerformanceTiers.jsx";
import GrowKillMatrix from "./GrowKillMatrix.jsx";
import GrowthSimulator from "./GrowthSimulator.jsx";
import { generateActionItems } from "../../services/opportunityService";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

/**
 * Unified Strategy Component
 * Combines Diagnostics + Strategist + Dynamic Action Items
 * Creates a clear narrative: What to do next and in what order
 */
export default function UnifiedStrategy({ rows, activeClient, channelSubscriberCount = 0, channelSubscriberMap = {}, selectedChannel = "all" }) {
  // Generate action items from GROW quadrant patterns
  const actionItems = useMemo(() => {
    if (!rows || rows.length === 0) return [];

    // We'll derive these from the diagnostic patterns
    // For now, return empty array and let DiagnosticEngine handle the patterns
    return [];
  }, [rows]);

  return (
    <div style={{ padding: "0" }}>
      {/* 1. EXECUTIVE SUMMARY - Already in DiagnosticEngine */}

      {/* 2. ACTION ITEMS - Dynamic from GROW quadrant */}
      <ActionItemsSection rows={rows} activeClient={activeClient} />

      {/* 3. PROJECTED GROWTH CHART - Visual motivation */}
      <GrowthSimulator rows={rows} currentSubscribers={channelSubscriberCount} channelSubscriberMap={channelSubscriberMap} selectedChannel={selectedChannel} />

      {/* 4-7. REST OF STRATEGY - Handled by DiagnosticEngine */}
      <DiagnosticEngine rows={rows} />

      {/* 8. CONTENT PERFORMANCE TIERS - Evidence layer */}
      <ContentPerformanceTiers rows={rows} />
    </div>
  );
}

/**
 * Action Items Section
 * Dynamically generated from top GROW quadrant items
 */
function ActionItemsSection({ rows, activeClient }) {
  const [showAll, setShowAll] = React.useState(false);
  const [sentToBrief, setSentToBrief] = useState({});

  const sendActionToBrief = async (item, idx) => {
    try {
      const { supabase } = await import('../../services/supabaseClient');
      if (!supabase) throw new Error('Supabase not configured');

      const { data: { user } } = await supabase.auth.getUser();

      const { error: insertError } = await supabase
        .from('briefs')
        .insert({
          client_id: activeClient?.id || null,
          title: item.action || item.title,
          status: 'draft',
          source_type: 'manual',
          brief_data: {
            diagnostic_title: item.title,
            description: item.description,
            action: item.action,
            reason: item.reason,
            priority: item.priority,
            content_type: item.contentType || null,
            impact: item.impact || null,
            generated_from: 'diagnostic_engine',
          },
          created_by: user?.id || null,
        });

      if (insertError) throw insertError;
      setSentToBrief(prev => ({ ...prev, [idx]: true }));
    } catch (err) {
      console.error('[ActionItems] Failed to create brief:', err);
    }
  };

  const actionItems = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    return generateActionItems(rows);
  }, [rows]);

  if (actionItems.length === 0) return null;

  const priorityColors = {
    high: { bg: "rgba(239, 68, 68, 0.1)", border: "#ef4444", text: "#ef4444" },
    medium: { bg: "rgba(245, 158, 11, 0.1)", border: "#f59e0b", text: "#f59e0b" },
    low: { bg: "rgba(59, 130, 246, 0.1)", border: "#3b82f6", text: "#3b82f6" }
  };

  return (
    <div style={{
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "24px",
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Top gradient */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "4px",
        background: "linear-gradient(90deg, #f59e0b, #ef4444, #ec4899)"
      }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>⚡ Action Items</div>
        <div style={{
          fontSize: "12px",
          color: "#9E9E9E",
          background: "#252525",
          padding: "4px 10px",
          borderRadius: "6px"
        }}>
          AI-generated recommendations
        </div>
      </div>

      {/* Action Items List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {(showAll ? actionItems : actionItems.slice(0, 3)).map((item, idx) => {
          const colors = priorityColors[item.priority];
          return (
            <div key={idx} style={{
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderLeft: `4px solid ${colors.border}`,
              borderRadius: "8px",
              padding: "16px"
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "8px" }}>
                <div style={{ fontSize: "24px", lineHeight: "1" }}>{item.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>
                      {item.title}
                    </div>
                    {item.contentType && (
                      <div style={{
                        fontSize: "10px",
                        fontWeight: "700",
                        textTransform: "uppercase",
                        color: item.contentType === "short" ? "#fb923c" : "#60a5fa",
                        background: item.contentType === "short" ? "rgba(251, 146, 60, 0.1)" : "rgba(96, 165, 250, 0.1)",
                        border: `1px solid ${item.contentType === "short" ? "#fb923c" : "#60a5fa"}`,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}>
                        {item.contentType === "short" ? (
                          <>
                            <Video width={10} height={10} strokeWidth={2} />
                            <span>SHORT</span>
                          </>
                        ) : (
                          <>
                            <Film width={10} height={10} strokeWidth={2} />
                            <span>LONG-FORM</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: "13px", color: "#E0E0E0", marginBottom: "8px" }}>
                    {item.description}
                  </div>
                  <div style={{
                    fontSize: "13px",
                    color: colors.text,
                    background: "#1E1E1E",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    marginTop: "8px",
                    fontWeight: "600"
                  }}>
                    → {item.action}
                  </div>

                  {/* Impact Estimate */}
                  {item.impact && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginTop: "12px",
                      padding: "10px 12px",
                      background: item.impact.percentIncrease > 20 ? "rgba(16, 185, 129, 0.1)" :
                                  item.impact.percentIncrease > 10 ? "rgba(251, 191, 36, 0.1)" : "rgba(107, 114, 128, 0.1)",
                      border: `1px solid ${item.impact.percentIncrease > 20 ? "#10b981" :
                                           item.impact.percentIncrease > 10 ? "#fbbf24" : "#6b7280"}`,
                      borderRadius: "6px"
                    }}>
                      <span style={{ fontSize: "12px", color: "#9ca3af", fontWeight: "600" }}>📈 ESTIMATED IMPACT:</span>
                      <span style={{
                        fontSize: "14px",
                        fontWeight: "700",
                        color: item.impact.percentIncrease > 20 ? "#10b981" :
                               item.impact.percentIncrease > 10 ? "#fbbf24" : "#6b7280"
                      }}>
                        +{fmtInt(item.impact.viewsPerMonth)} views/month
                      </span>
                      <span style={{ fontSize: "12px", color: "#6b7280" }}>
                        ({item.impact.percentIncrease}% increase)
                      </span>
                      {item.impact.percentIncrease > 20 && (
                        <span style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          textTransform: "uppercase",
                          color: "#10b981",
                          background: "rgba(16, 185, 129, 0.15)",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          marginLeft: "auto"
                        }}>
                          HIGH IMPACT
                        </span>
                      )}
                    </div>
                  )}

                  <div style={{
                    fontSize: "12px",
                    color: "#888",
                    marginTop: "8px",
                    fontStyle: "italic"
                  }}>
                    WHY: {item.reason}
                  </div>

                  {/* Video Examples */}
                  {item.examples && item.examples.length > 0 && (
                    <div style={{ marginTop: "12px", borderTop: "1px solid #333", paddingTop: "12px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "600", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Video Examples:
                      </div>
                      {item.examples.map((ex, exIdx) => (
                        <div key={exIdx} style={{
                          background: "#0a0a0a",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          marginBottom: "8px",
                          border: "1px solid #222"
                        }}>
                          <div style={{
                            color: ex.label.includes("✓") ? "#10b981" : "#ef4444",
                            fontWeight: "700",
                            marginBottom: "6px",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.3px"
                          }}>
                            {ex.label}
                          </div>
                          <div style={{ color: "#E0E0E0", marginBottom: "6px", fontSize: "13px", fontWeight: "500" }}>
                            {ex.title}
                          </div>
                          <div style={{ fontSize: "11px", color: "#666", display: "flex", gap: "12px" }}>
                            <span>{fmtInt(ex.views)} views</span>
                            <span>•</span>
                            <span>CTR: {fmtPct(ex.ctr)}</span>
                            <span>•</span>
                            <span>Retention: {fmtPct(ex.retention)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Send to Brief */}
                  <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => sendActionToBrief(item, idx)}
                      disabled={sentToBrief[idx]}
                      style={{
                        background: sentToBrief[idx] ? "rgba(16, 185, 129, 0.1)" : "#252525",
                        border: `1px solid ${sentToBrief[idx] ? "#10b981" : "#333"}`,
                        borderRadius: "8px",
                        padding: "6px 12px",
                        color: sentToBrief[idx] ? "#10b981" : "#9E9E9E",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: sentToBrief[idx] ? "default" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {sentToBrief[idx] ? (
                        <><Check size={14} /> Sent to Briefs</>
                      ) : (
                        <><FileText size={14} /> Send to Briefs</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show More/Less Button */}
      {actionItems.length > 3 && (
        <div style={{
          marginTop: "16px",
          textAlign: "center"
        }}>
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              background: "#252525",
              border: "1px solid #333",
              borderRadius: "6px",
              padding: "10px 20px",
              color: "#E0E0E0",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#2a2a2a";
              e.currentTarget.style.borderColor = "#444";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#252525";
              e.currentTarget.style.borderColor = "#333";
            }}
          >
            {showAll ? (
              <>
                <ChevronDown size={16} style={{ transform: "rotate(180deg)" }} />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown size={16} />
                Show {actionItems.length - 3} More Action Items
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
