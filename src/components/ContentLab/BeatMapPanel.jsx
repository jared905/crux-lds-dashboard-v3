import React, { useState } from "react";
import {
  ChevronDown, ChevronUp, Star, ArrowDown,
  AlertTriangle, CheckCircle, Music, Camera, Zap,
  GitBranch, AlertCircle, Layers,
} from "lucide-react";

const STRENGTH_COLORS = { strong: "#22c55e", moderate: "#f59e0b", weak: "#ef4444" };
const ARC_LABELS = {
  mountain: "Mountain — builds to peak then resolves",
  flat: "Flat — even intensity throughout",
  rising: "Rising — builds throughout",
  late_peak: "Late Peak — slow start, strong finish",
  erratic: "Erratic — inconsistent energy",
  double_peak: "Double Peak — two climaxes",
};
const SEVERITY_COLORS = { critical: "#ef4444", recommended: "#f59e0b", optional: "#6b7280" };

const ROLE_COLORS = {
  content: { bg: "#3b82f618", color: "#3b82f6", label: "CONTENT" },
  pacing: { bg: "#f59e0b18", color: "#f59e0b", label: "PACING" },
  hybrid: { bg: "#8b5cf618", color: "#8b5cf6", label: "HYBRID" },
  transition: { bg: "#6b728018", color: "#6b7280", label: "TRANSITION" },
};

const WEIGHT_COLORS = {
  primary: { bg: "#3b82f622", border: "#3b82f6", text: "#3b82f6" },
  supporting: { bg: "#f59e0b22", border: "#f59e0b", text: "#f59e0b" },
  illustrative: { bg: "#6b728022", border: "#6b7280", text: "#9ca3af" },
};

export const THREAD_COLORS = ["#3b82f6", "#ec4899", "#f59e0b", "#10b981", "#8b5cf6", "#06b6d4", "#f97316"];

const INTERLEAVING_COLORS = { none: "#22c55e", mild: "#22c55e", moderate: "#f59e0b", heavy: "#ef4444" };

export default function BeatMapPanel({ beatAnalysis }) {
  const [expandedBeats, setExpandedBeats] = useState(new Set());

  if (!beatAnalysis || !beatAnalysis.beats?.length) {
    return <div style={{ textAlign: "center", padding: "24px", color: "#666", fontSize: "13px" }}>No beat analysis available.</div>;
  }

  const { beats, content_type, content_type_confidence, emotional_arc, hook_analysis, structural_diagnosis, threads, interleaving } = beatAnalysis;
  const arc = emotional_arc || {};
  const hook = hook_analysis || {};
  const diag = structural_diagnosis || {};
  const hasThreads = threads?.length > 0;

  // Build thread color map
  const threadColorMap = {};
  (threads || []).forEach((t, i) => { threadColorMap[t.id] = THREAD_COLORS[i % THREAD_COLORS.length]; });

  const toggleBeat = (id) => {
    setExpandedBeats(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Render a single beat card (shared by flat and thread-grouped views)
  const renderBeatCard = (b) => {
    const isExpanded = expandedBeats.has(b.id);
    const strengthColor = STRENGTH_COLORS[b.structuralStrength] || "#6b7280";
    const isPeak = arc.peakBeat === b.id;
    const notes = b.productionNotes || {};
    const role = ROLE_COLORS[b.beatRole] || ROLE_COLORS.content;

    return (
      <div key={b.id} style={{
        background: "#252525", border: `1px solid ${isPeak ? "#f59e0b33" : "#333"}`,
        borderRadius: "8px", overflow: "hidden",
      }}>
        <button
          onClick={() => toggleBeat(b.id)}
          style={{
            width: "100%", background: "transparent", border: "none",
            padding: "12px 16px", cursor: "pointer", textAlign: "left",
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px", flexWrap: "wrap" }}>
              <span style={{
                fontSize: "9px", fontWeight: "700", textTransform: "uppercase",
                background: strengthColor + "18", color: strengthColor,
                borderRadius: "3px", padding: "2px 6px",
              }}>
                {b.beatType || b.label}
              </span>
              {b.beatRole && b.beatRole !== "content" && (
                <span style={{
                  fontSize: "8px", fontWeight: "700", textTransform: "uppercase",
                  background: role.bg, color: role.color,
                  borderRadius: "3px", padding: "2px 5px",
                }}>
                  {role.label}
                </span>
              )}
              {isPeak && <Star size={10} color="#f59e0b" fill="#f59e0b" />}
              <span style={{ fontSize: "12px", fontWeight: "600", color: "#e0e0e0" }}>
                {b.displayName}
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "#888", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
              <span>{b.startApprox}{b.endApprox ? ` → ${b.endApprox}` : ""}</span>
              <span>| Intensity: {b.emotionalIntensity}/5 | {b.emotionalQuality}</span>
              {b.threadConfidence != null && b.threadConfidence < 0.7 && (
                <span style={{
                  fontSize: "9px", background: "#ef444418", color: "#ef4444",
                  borderRadius: "3px", padding: "1px 6px",
                }}>
                  Low conf ({Math.round(b.threadConfidence * 100)}%)
                </span>
              )}
              {b.threads?.length > 1 && (
                <span style={{
                  fontSize: "9px", background: "#8b5cf618", color: "#8b5cf6",
                  borderRadius: "3px", padding: "1px 6px",
                }}>
                  {b.threads.length} threads
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            {b.weaknessFlags?.length > 0 && <AlertTriangle size={12} color="#ef4444" />}
            {isExpanded ? <ChevronUp size={14} color="#888" /> : <ChevronDown size={14} color="#888" />}
          </div>
        </button>

        {isExpanded && (
          <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "12px", color: "#d4d4d4", lineHeight: "1.6" }}>{b.summary}</div>

            {(notes.musicMood || notes.brollSuggestions?.length > 0) && (
              <div style={{ background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "10px 12px" }}>
                <div style={{ fontSize: "9px", fontWeight: "700", color: "#888", textTransform: "uppercase", marginBottom: "6px" }}>Production Notes</div>
                {notes.musicMood && (
                  <div style={{ fontSize: "11px", color: "#b0b0b0", marginBottom: "4px" }}>
                    <Music size={10} style={{ verticalAlign: "middle", marginRight: "4px" }} color="#a78bfa" />
                    {notes.musicMood}{notes.musicTempo ? ` (${notes.musicTempo})` : ""}
                  </div>
                )}
                {notes.pacing && (
                  <div style={{ fontSize: "11px", color: "#b0b0b0", marginBottom: "4px" }}>
                    <Zap size={10} style={{ verticalAlign: "middle", marginRight: "4px" }} color="#f59e0b" />
                    Pacing: {notes.pacing}
                  </div>
                )}
                {notes.brollSuggestions?.length > 0 && (
                  <div style={{ marginTop: "4px" }}>
                    <div style={{ fontSize: "10px", color: "#888", marginBottom: "3px" }}>
                      <Camera size={10} style={{ verticalAlign: "middle", marginRight: "4px" }} color="#3b82f6" />
                      B-Roll Ideas
                    </div>
                    {notes.brollSuggestions.map((br, i) => (
                      <div key={i} style={{ fontSize: "11px", color: "#999", paddingLeft: "14px" }}>• {br}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {b.weaknessFlags?.length > 0 && (
              <div style={{ background: "#ef44440a", border: "1px solid #ef444422", borderRadius: "6px", padding: "8px 12px" }}>
                <div style={{ fontSize: "10px", fontWeight: "600", color: "#ef4444", marginBottom: "4px" }}>Issues</div>
                {b.weaknessFlags.map((flag, i) => (
                  <div key={i} style={{ fontSize: "11px", color: "#fca5a5" }}>• {flag}</div>
                ))}
                {b.remediationSuggestion && (
                  <div style={{ fontSize: "11px", color: "#d4d4d4", marginTop: "6px", fontStyle: "italic" }}>
                    Fix: {b.remediationSuggestion}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Overall Assessment */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{
          fontSize: "11px", fontWeight: "700", textTransform: "uppercase",
          background: "#10b98118", color: "#10b981", borderRadius: "6px", padding: "4px 10px",
        }}>
          {content_type?.replace(/_/g, " ")}
        </span>
        <span style={{ fontSize: "11px", color: "#888" }}>
          {Math.round((content_type_confidence || 0) * 100)}% confidence
        </span>
        <span style={{ fontSize: "11px", color: "#888" }}>|</span>
        {hasThreads && (
          <>
            <span style={{ fontSize: "11px", color: "#d4d4d4" }}>
              {threads.length} threads
            </span>
            <span style={{ fontSize: "11px", color: "#888" }}>|</span>
          </>
        )}
        <span style={{ fontSize: "11px", color: "#888" }}>
          {beats.length} beats
        </span>
        {arc.arcShape && (
          <>
            <span style={{ fontSize: "11px", color: "#888" }}>|</span>
            <span style={{ fontSize: "11px", color: "#d4d4d4" }}>
              Arc: {ARC_LABELS[arc.arcShape] || arc.arcShape}
            </span>
          </>
        )}
      </div>

      {/* Thread Overview Cards (V3.1 only) */}
      {hasThreads && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {threads.map((t, i) => {
            const wc = WEIGHT_COLORS[t.weight] || WEIGHT_COLORS.illustrative;
            const threadColor = threadColorMap[t.id] || "#888";
            return (
              <div key={t.id} style={{
                background: wc.bg, border: `1px solid ${wc.border}`,
                borderRadius: "8px", padding: "10px 14px", flex: "1 1 200px", minWidth: "180px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: threadColor, flexShrink: 0 }} />
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#e0e0e0", lineHeight: "1.3" }}>{t.principle}</div>
                </div>
                <div style={{ fontSize: "10px", color: wc.text, marginBottom: "4px" }}>
                  {t.weight.toUpperCase()} — {t.beats?.length || 0} beats
                </div>
                {t.completeness?.missing?.length > 0 && (
                  <div style={{ fontSize: "9px", color: "#ef4444", marginTop: "2px" }}>
                    Missing: {t.completeness.missing.join(", ")}
                  </div>
                )}
                {t.completeness?.assessment && (
                  <div style={{ fontSize: "10px", color: "#888", marginTop: "3px", lineHeight: "1.4" }}>
                    {t.completeness.assessment}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Emotional Arc Visualization */}
      <div style={{
        background: "#0d0d0d", border: "1px solid #333",
        borderRadius: "8px", padding: "16px",
      }}>
        <div style={{ fontSize: "10px", fontWeight: "600", color: "#10b981", textTransform: "uppercase", marginBottom: "12px" }}>
          Emotional Arc
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "80px" }}>
          {beats.map((b) => {
            const height = Math.max(10, (b.emotionalIntensity / 5) * 100);
            // Color by thread in V3.1, by structural strength in V3
            const color = hasThreads && b.primaryThread
              ? (threadColorMap[b.primaryThread] || "#6b7280")
              : (STRENGTH_COLORS[b.structuralStrength] || "#6b7280");
            const isPeak = arc.peakBeat === b.id;
            const isValley = arc.valleyBeat === b.id;
            return (
              <div key={b.id} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
              }}>
                {isPeak && <Star size={10} color="#f59e0b" fill="#f59e0b" />}
                {isValley && <ArrowDown size={10} color="#6b7280" />}
                <div
                  title={`${b.displayName}\nIntensity: ${b.emotionalIntensity}/5\n${b.beatType || b.label} (${b.beatRole || "content"})\n${b.emotionalQuality}${b.primaryThread ? `\nThread: ${b.primaryThread}` : ""}`}
                  style={{
                    width: "100%", height: `${height}%`, minHeight: "8px",
                    background: `linear-gradient(to top, ${color}88, ${color})`,
                    borderRadius: "3px 3px 0 0",
                    cursor: "pointer",
                  }}
                  onClick={() => toggleBeat(b.id)}
                />
                <div style={{
                  fontSize: "8px", color: "#888", textAlign: "center",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  maxWidth: "100%",
                }}>
                  {b.emotionalIntensity}
                </div>
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", flexWrap: "wrap", gap: "8px" }}>
          {hasThreads ? (
            <span style={{ fontSize: "9px", color: "#666", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {threads.map((t) => (
                <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  <span style={{ display: "inline-block", width: "8px", height: "8px", background: threadColorMap[t.id], borderRadius: "2px" }} />
                  {t.id.replace(/_/g, " ")}
                </span>
              ))}
            </span>
          ) : (
            <span style={{ fontSize: "9px", color: "#666" }}>
              <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#22c55e", borderRadius: "2px", marginRight: "4px" }} />Strong
              <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#f59e0b", borderRadius: "2px", margin: "0 4px 0 10px" }} />Moderate
              <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#ef4444", borderRadius: "2px", margin: "0 4px 0 10px" }} />Weak
            </span>
          )}
          <span style={{ fontSize: "9px", color: "#666" }}>
            <Star size={8} color="#f59e0b" fill="#f59e0b" style={{ verticalAlign: "middle", marginRight: "3px" }} />Peak
            <ArrowDown size={8} color="#6b7280" style={{ verticalAlign: "middle", margin: "0 3px 0 8px" }} />Valley
          </span>
        </div>
        {arc.arcAnalysis && (
          <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6", marginTop: "12px", borderTop: "1px solid #222", paddingTop: "10px" }}>
            {arc.arcAnalysis}
          </div>
        )}
      </div>

      {/* Hook Analysis */}
      {hook.currentHookStrength != null && (
        <div style={{
          background: "#0d0d0d", border: "1px solid #333",
          borderRadius: "8px", padding: "16px",
        }}>
          <div style={{ fontSize: "10px", fontWeight: "600", color: "#f59e0b", textTransform: "uppercase", marginBottom: "10px" }}>
            Hook Analysis
          </div>
          <div style={{ display: "flex", gap: "24px", marginBottom: "10px" }}>
            <div>
              <div style={{ fontSize: "10px", color: "#888", marginBottom: "2px" }}>Current Hook</div>
              <div style={{
                fontSize: "20px", fontWeight: "700",
                color: hook.currentHookStrength >= 7 ? "#22c55e" : hook.currentHookStrength >= 5 ? "#f59e0b" : "#ef4444",
              }}>
                {hook.currentHookStrength}<span style={{ fontSize: "12px", color: "#888" }}>/10</span>
              </div>
            </div>
            {hook.bestHookCandidate && hook.bestHookCandidate !== beats[0]?.id && (
              <div>
                <div style={{ fontSize: "10px", color: "#888", marginBottom: "2px" }}>Best Candidate</div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#10b981" }}>
                  {hook.bestHookCandidate}
                </div>
              </div>
            )}
          </div>
          {hook.reorderRecommendation && (
            <div style={{
              fontSize: "12px", color: "#d4d4d4", lineHeight: "1.6",
              background: "#f59e0b0a", border: "1px solid #f59e0b22",
              borderRadius: "6px", padding: "10px",
            }}>
              {hook.reorderRecommendation}
            </div>
          )}
        </div>
      )}

      {/* Interleaving Indicator (V3.1 only) */}
      {hasThreads && interleaving?.detected && (
        <div style={{
          background: "#0d0d0d", border: "1px solid #333",
          borderRadius: "8px", padding: "12px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <GitBranch size={14} color={INTERLEAVING_COLORS[interleaving.severity] || "#888"} />
            <span style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", color: INTERLEAVING_COLORS[interleaving.severity] || "#888" }}>
              Thread Interleaving: {interleaving.severity}
            </span>
          </div>
          {interleaving.details && (
            <div style={{ fontSize: "12px", color: "#b0b0b0", marginTop: "6px", lineHeight: "1.6" }}>
              {interleaving.details}
            </div>
          )}
        </div>
      )}

      {/* Thread Completeness Panel (V3.1 only) */}
      {hasThreads && threads.some(t => t.completeness) && (
        <div style={{
          background: "#0d0d0d", border: "1px solid #333",
          borderRadius: "8px", padding: "16px",
        }}>
          <div style={{ fontSize: "10px", fontWeight: "600", color: "#8b5cf6", textTransform: "uppercase", marginBottom: "10px" }}>
            <Layers size={10} style={{ verticalAlign: "middle", marginRight: "4px" }} />
            Thread Completeness
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {threads.map(t => {
              if (!t.completeness) return null;
              const threadColor = threadColorMap[t.id] || "#888";
              return (
                <div key={t.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: threadColor }} />
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#e0e0e0" }}>{t.principle}</span>
                  </div>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "3px" }}>
                    {t.completeness.has?.map(type => (
                      <span key={type} style={{
                        fontSize: "9px", background: "#22c55e18", color: "#22c55e",
                        borderRadius: "3px", padding: "2px 6px",
                      }}>{type}</span>
                    ))}
                    {t.completeness.missing?.map(type => (
                      <span key={type} style={{
                        fontSize: "9px", background: "transparent", color: "#ef4444",
                        border: "1px solid #ef444444", borderRadius: "3px", padding: "1px 5px",
                      }}>{type}</span>
                    ))}
                  </div>
                  {t.completeness.assessment && (
                    <div style={{ fontSize: "10px", color: "#888", lineHeight: "1.4" }}>
                      {t.completeness.assessment}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Structural Diagnosis */}
      {(diag.priorityFixes?.length > 0 || diag.weightInversions?.length > 0 || diag.incompleteThreads?.length > 0 || diag.ambiguousBeats?.length > 0 || diag.missingBeats?.length > 0) && (
        <div style={{
          background: "#0d0d0d", border: "1px solid #333",
          borderRadius: "8px", padding: "16px",
        }}>
          <div style={{ fontSize: "10px", fontWeight: "600", color: "#ef4444", textTransform: "uppercase", marginBottom: "10px" }}>
            Structural Diagnosis
          </div>

          {/* Weight inversions (V3.1) */}
          {diag.weightInversions?.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", color: "#f59e0b", marginBottom: "4px" }}>Weight Inversions</div>
              {diag.weightInversions.map((inv, i) => (
                <div key={i} style={{ fontSize: "11px", color: "#d4d4d4", lineHeight: "1.5", padding: "2px 0" }}>
                  <AlertCircle size={10} style={{ verticalAlign: "middle", marginRight: "4px" }} color="#f59e0b" />
                  {typeof inv === "string" ? inv : `${inv.threadId}: ${inv.detail || inv.description || "supporting thread overdeveloped"}`}
                </div>
              ))}
            </div>
          )}

          {/* Ambiguous beats (V3.1) */}
          {diag.ambiguousBeats?.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", color: "#8b5cf6", marginBottom: "4px" }}>Ambiguous Beats (editor judgment needed)</div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {diag.ambiguousBeats.map(id => (
                  <span key={id} style={{
                    fontSize: "10px", background: "#8b5cf618", color: "#8b5cf6",
                    borderRadius: "4px", padding: "2px 8px",
                  }}>{id}</span>
                ))}
              </div>
            </div>
          )}

          {/* Missing beats (legacy V3 format) */}
          {diag.missingBeats?.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px" }}>Missing Beats</div>
              {diag.missingBeats.map((mb, i) => (
                <div key={i} style={{
                  display: "flex", gap: "8px", alignItems: "flex-start",
                  padding: "6px 0", borderBottom: i < diag.missingBeats.length - 1 ? "1px solid #1a1a1a" : "none",
                }}>
                  <span style={{
                    fontSize: "9px", fontWeight: "700", textTransform: "uppercase",
                    background: (SEVERITY_COLORS[mb.severity] || "#888") + "18",
                    color: SEVERITY_COLORS[mb.severity] || "#888",
                    borderRadius: "3px", padding: "2px 6px", flexShrink: 0,
                  }}>
                    {mb.severity}
                  </span>
                  <div>
                    <div style={{ fontSize: "12px", color: "#e0e0e0", fontWeight: "600" }}>
                      {(mb.beat || "")?.replace(/_/g, " ")}
                    </div>
                    {mb.remediation && (
                      <div style={{ fontSize: "11px", color: "#999", marginTop: "2px" }}>{mb.remediation}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Incomplete threads (V3.1) */}
          {diag.incompleteThreads?.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px" }}>Incomplete Threads</div>
              {diag.incompleteThreads.map((it, i) => (
                <div key={i} style={{
                  display: "flex", gap: "8px", alignItems: "flex-start",
                  padding: "6px 0", borderBottom: i < diag.incompleteThreads.length - 1 ? "1px solid #1a1a1a" : "none",
                }}>
                  <span style={{
                    fontSize: "9px", fontWeight: "700", textTransform: "uppercase",
                    background: (SEVERITY_COLORS[it.severity] || "#888") + "18",
                    color: SEVERITY_COLORS[it.severity] || "#888",
                    borderRadius: "3px", padding: "2px 6px", flexShrink: 0,
                  }}>
                    {it.severity || "recommended"}
                  </span>
                  <div>
                    <div style={{ fontSize: "12px", color: "#e0e0e0", fontWeight: "600" }}>
                      {it.threadId?.replace(/_/g, " ")}
                    </div>
                    {it.missing?.length > 0 && (
                      <div style={{ fontSize: "11px", color: "#999", marginTop: "2px" }}>Missing: {it.missing.join(", ")}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Strong/weak beats */}
          <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
            {diag.strongBeats?.length > 0 && (
              <div>
                <div style={{ fontSize: "10px", color: "#22c55e", marginBottom: "4px" }}>Strong</div>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {diag.strongBeats.map(id => (
                    <span key={id} style={{
                      fontSize: "10px", background: "#22c55e18", color: "#22c55e",
                      borderRadius: "4px", padding: "2px 8px",
                    }}>{id}</span>
                  ))}
                </div>
              </div>
            )}
            {diag.weakBeats?.length > 0 && (
              <div>
                <div style={{ fontSize: "10px", color: "#ef4444", marginBottom: "4px" }}>Weak</div>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {diag.weakBeats.map(id => (
                    <span key={id} style={{
                      fontSize: "10px", background: "#ef444418", color: "#ef4444",
                      borderRadius: "4px", padding: "2px 8px",
                    }}>{id}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Priority fixes */}
          {diag.priorityFixes?.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px" }}>Priority Fixes</div>
              {diag.priorityFixes.map((fix, i) => (
                <div key={i} style={{ fontSize: "12px", color: "#d4d4d4", lineHeight: "1.5", padding: "4px 0" }}>
                  {fix}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Beat Cards — grouped by thread (V3.1) or flat list (V3) */}
      {hasThreads ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {threads.map((thread) => {
            const threadColor = threadColorMap[thread.id] || "#888";
            const threadBeats = (thread.beats || [])
              .map(beatId => beats.find(b => b.id === beatId))
              .filter(Boolean);
            if (!threadBeats.length) return null;
            return (
              <div key={thread.id}>
                <div style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  marginBottom: "8px", paddingBottom: "4px", borderBottom: `2px solid ${threadColor}33`,
                }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: threadColor }} />
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "#e0e0e0" }}>
                    {thread.principle}
                  </span>
                  <span style={{
                    fontSize: "9px", fontWeight: "700", textTransform: "uppercase",
                    color: WEIGHT_COLORS[thread.weight]?.text || "#888",
                  }}>
                    ({thread.weight})
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {threadBeats.map(renderBeatCard)}
                </div>
              </div>
            );
          })}
          {/* Orphan beats (assigned to no thread or only pacing/transition) */}
          {(() => {
            const threadBeatIds = new Set(threads.flatMap(t => t.beats || []));
            const orphans = beats.filter(b => !threadBeatIds.has(b.id));
            if (!orphans.length) return null;
            return (
              <div>
                <div style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  marginBottom: "8px", paddingBottom: "4px", borderBottom: "2px solid #33333366",
                }}>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "#888" }}>
                    Unassigned Beats
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {orphans.map(renderBeatCard)}
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {beats.map(renderBeatCard)}
        </div>
      )}
    </div>
  );
}
