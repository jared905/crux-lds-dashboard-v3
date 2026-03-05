import React, { useState } from "react";
import {
  ChevronDown, ChevronUp, Star, ArrowDown,
  AlertTriangle, CheckCircle, Music, Camera, Zap,
} from "lucide-react";

const STRENGTH_COLORS = { strong: "#22c55e", moderate: "#f59e0b", weak: "#ef4444" };
const INTENSITY_COLORS = ["#374151", "#6b7280", "#f59e0b", "#f97316", "#ef4444"];
const ARC_LABELS = {
  mountain: "Mountain — builds to peak then resolves",
  flat: "Flat — even intensity throughout",
  rising: "Rising — builds throughout",
  late_peak: "Late Peak — slow start, strong finish",
  erratic: "Erratic — inconsistent energy",
  double_peak: "Double Peak — two climaxes",
};
const SEVERITY_COLORS = { critical: "#ef4444", recommended: "#f59e0b", optional: "#6b7280" };

export default function BeatMapPanel({ beatAnalysis }) {
  const [expandedBeats, setExpandedBeats] = useState(new Set());

  if (!beatAnalysis || !beatAnalysis.beats?.length) {
    return <div style={{ textAlign: "center", padding: "24px", color: "#666", fontSize: "13px" }}>No beat analysis available.</div>;
  }

  const { beats, content_type, content_type_confidence, emotional_arc, hook_analysis, structural_diagnosis } = beatAnalysis;
  const arc = emotional_arc || {};
  const hook = hook_analysis || {};
  const diag = structural_diagnosis || {};

  const toggleBeat = (id) => {
    setExpandedBeats(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Overall Assessment */}
      <div style={{
        display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap",
      }}>
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
            const color = STRENGTH_COLORS[b.structuralStrength] || "#6b7280";
            const isPeak = arc.peakBeat === b.id;
            const isValley = arc.valleyBeat === b.id;
            return (
              <div key={b.id} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
              }}>
                {isPeak && <Star size={10} color="#f59e0b" fill="#f59e0b" />}
                {isValley && <ArrowDown size={10} color="#6b7280" />}
                <div
                  title={`${b.displayName}\nIntensity: ${b.emotionalIntensity}/5\nStrength: ${b.structuralStrength}\n${b.emotionalQuality}`}
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
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
          <span style={{ fontSize: "9px", color: "#666" }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#22c55e", borderRadius: "2px", marginRight: "4px" }} />Strong
            <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#f59e0b", borderRadius: "2px", margin: "0 4px 0 10px" }} />Moderate
            <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#ef4444", borderRadius: "2px", margin: "0 4px 0 10px" }} />Weak
          </span>
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

      {/* Structural Diagnosis */}
      {(diag.missingBeats?.length > 0 || diag.priorityFixes?.length > 0) && (
        <div style={{
          background: "#0d0d0d", border: "1px solid #333",
          borderRadius: "8px", padding: "16px",
        }}>
          <div style={{ fontSize: "10px", fontWeight: "600", color: "#ef4444", textTransform: "uppercase", marginBottom: "10px" }}>
            Structural Diagnosis
          </div>

          {/* Missing beats */}
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
                      {mb.beat?.replace(/_/g, " ")}
                    </div>
                    {mb.remediation && (
                      <div style={{ fontSize: "11px", color: "#999", marginTop: "2px" }}>{mb.remediation}</div>
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
                <div key={i} style={{
                  fontSize: "12px", color: "#d4d4d4", lineHeight: "1.5",
                  padding: "4px 0",
                }}>
                  {fix}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Beat Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {beats.map((b) => {
          const isExpanded = expandedBeats.has(b.id);
          const strengthColor = STRENGTH_COLORS[b.structuralStrength] || "#6b7280";
          const isPeak = arc.peakBeat === b.id;
          const notes = b.productionNotes || {};

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
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                    <span style={{
                      fontSize: "9px", fontWeight: "700", textTransform: "uppercase",
                      background: strengthColor + "18", color: strengthColor,
                      borderRadius: "3px", padding: "2px 6px",
                    }}>
                      {b.label}
                    </span>
                    {isPeak && <Star size={10} color="#f59e0b" fill="#f59e0b" />}
                    <span style={{ fontSize: "12px", fontWeight: "600", color: "#e0e0e0" }}>
                      {b.displayName}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#888" }}>
                    {b.startApprox}{b.endApprox ? ` → ${b.endApprox}` : ""} | Intensity: {b.emotionalIntensity}/5 | {b.emotionalQuality}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  {b.weaknessFlags?.length > 0 && (
                    <AlertTriangle size={12} color="#ef4444" />
                  )}
                  {isExpanded ? <ChevronUp size={14} color="#888" /> : <ChevronDown size={14} color="#888" />}
                </div>
              </button>

              {isExpanded && (
                <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {/* Summary */}
                  <div style={{ fontSize: "12px", color: "#d4d4d4", lineHeight: "1.6" }}>
                    {b.summary}
                  </div>

                  {/* Production Notes */}
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

                  {/* Weakness Flags */}
                  {b.weaknessFlags?.length > 0 && (
                    <div style={{
                      background: "#ef44440a", border: "1px solid #ef444422",
                      borderRadius: "6px", padding: "8px 12px",
                    }}>
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
        })}
      </div>
    </div>
  );
}
