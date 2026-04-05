import React, { useState } from "react";
import {
  ChevronDown, ChevronUp, Check, Plus,
  Image, Type, Copy, Video, Layers, ClipboardCheck,
  Rocket, RefreshCw, Loader,
} from "lucide-react";

// Re-export for Atomizer.jsx backward compat
export { THREAD_COLORS } from "./BeatMapPanel";
import { THREAD_COLORS } from "./BeatMapPanel";

const scoreColor = (score) => {
  if (score >= 8) return { bg: "#166534", border: "#22c55e", text: "#22c55e" };
  if (score >= 5) return { bg: "#854d0e", border: "#f59e0b", text: "#f59e0b" };
  return { bg: "#374151", border: "#6b7280", text: "#9ca3af" };
};

const TITLE_STYLE_LABELS = {
  curiosity_gap: "Curiosity Gap",
  direct_value: "Direct Value",
  pattern_interrupt: "Pattern Interrupt",
};

const MOTION_GRAPHIC_LABELS = {
  lower_third: "Lower Third",
  title_card: "Title Card",
  stat_callout: "Stat Callout",
  animated_text: "Animated Text",
  full_screen_text: "Full Screen Text",
};

function SelectBox({ checked, onChange, color = "#3b82f6" }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      style={{
        width: "18px", height: "18px", flexShrink: 0,
        background: checked ? color : "transparent",
        border: `2px solid ${checked ? color : "#555"}`,
        borderRadius: "4px", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 0, transition: "all 0.15s",
      }}
    >
      {checked && <Check size={12} color="#fff" />}
    </button>
  );
}

export default function DirectionCard({
  dir, dirKey, isLongForm, expanded, onToggleExpand,
  selectedElements, onToggleElement, onCreateBrief,
  briefCreating, accentColor,
  onDeploy, deploying, deployedData,
  onRecut, recutting, recutData, beatAnalysis,
}) {
  const [edlCopied, setEdlCopied] = useState(false);
  const score = dir.subscores?.overall ?? dir.virality_score ?? dir.viralityScore ?? 0;
  const sc = scoreColor(score);
  const titleVars = dir.title_variations || [];
  const thumb = dir.thumbnail_suggestion || {};
  const meta = dir.direction_metadata || {};
  const formatType = dir.format_type || meta.format_type || null;
  const isSelected = (key) => selectedElements.has(key);
  const viralityRationale = dir.virality_rationale || meta.virality_rationale || dir.rationale;

  // Production data
  const production = deployedData || {};
  const editedTranscript = production.edited_transcript || dir.edited_transcript || meta.edited_transcript;
  const prodEdl = production.edl || [];
  const visualDirections = production.visual_directions || meta.visual_directions || [];
  const legacyEdl = dir.edl || meta.edl || [];
  const legacyBRoll = dir.b_roll || meta.b_roll || [];
  const legacyMotionGraphics = dir.motion_graphics || meta.motion_graphics || [];
  const hasLegacyProduction = legacyEdl.length > 0 || legacyBRoll.length > 0;
  const edl = prodEdl.length > 0 ? prodEdl : legacyEdl;
  const hasProductionData = !!(editedTranscript || prodEdl.length > 0 || visualDirections.length > 0 || production.deployed_at || meta.deployed_at);
  const isDeploying = deploying === dir._savedId;

  const formatEdlText = () => edl.map(e =>
    `${String(e.step).padStart(2, "0")}. ${e.action} — ${e.segment}${e.pacing ? ` | ${e.pacing}` : ""}`
  ).join("\n");

  const copyEdl = async () => {
    try {
      await navigator.clipboard.writeText(formatEdlText());
      setEdlCopied(true);
      setTimeout(() => setEdlCopied(false), 2000);
    } catch { /* ignore */ }
  };

  // Hook-first collapsed state
  const hookText = dir.hook || '';
  const hookDisplay = hookText.length > 150 ? hookText.slice(0, 150) + '...' : hookText;
  const quickPitch = dir.quick_pitch || viralityRationale;
  const pitchDisplay = quickPitch?.length > 120 ? quickPitch.slice(0, 120) + '...' : quickPitch;
  const isHighScore = score >= 9;

  return (
    <div style={{
      background: "#252525",
      borderLeft: `3px solid ${accentColor}`,
      border: `1px solid ${selectedElements.size > 0 ? accentColor + "44" : hasProductionData ? "#f59e0b33" : "#333"}`,
      borderLeftWidth: "3px",
      borderLeftColor: accentColor,
      borderRadius: "8px",
      overflow: "hidden",
      transition: "border-color 0.15s",
    }}>
      {/* Hook-first collapsed header */}
      <button
        onClick={() => onToggleExpand(dirKey)}
        style={{
          width: "100%", background: "transparent", border: "none",
          padding: "16px", cursor: "pointer", textAlign: "left",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Hook — primary element */}
          {hookText && (
            <div style={{
              fontSize: "15px", fontWeight: "600", color: "#fff",
              fontStyle: "italic", lineHeight: "1.5", marginBottom: "8px",
            }}>
              "{hookDisplay}"
            </div>
          )}
          {/* Title + format badge + deployed badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "12px", fontWeight: "500", color: "#999" }}>
              {dir.title}
            </div>
            {formatType && (
              <span style={{
                fontSize: "9px", fontWeight: "600", textTransform: "uppercase",
                background: accentColor + "18", color: accentColor,
                borderRadius: "4px", padding: "2px 6px", flexShrink: 0,
              }}>
                {formatType}
              </span>
            )}
            {hasProductionData && (
              <span style={{
                fontSize: "9px", fontWeight: "600", textTransform: "uppercase",
                background: "#16a34a22", color: "#22c55e",
                borderRadius: "4px", padding: "2px 6px", flexShrink: 0,
              }}>
                Deployed
              </span>
            )}
          </div>
          {/* Quick pitch — one-sentence value prop */}
          {!expanded && pitchDisplay && (
            <div style={{
              fontSize: "11px", color: "#666", marginTop: "4px",
              lineHeight: "1.4",
              overflow: "hidden", textOverflow: "ellipsis",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}>
              {pitchDisplay}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          {/* Subscores mini-badges for short-form */}
          {!isLongForm && dir.subscores && (
            <div style={{ display: "flex", gap: "3px", flexDirection: "column", alignItems: "flex-end" }}>
              {[
                { key: "hookStrength", alt: "hook_strength", label: "HOOK", color: "#f59e0b" },
                { key: "emotionalPunch", alt: "emotional_punch", label: "PUNCH", color: "#ec4899" },
                { key: "standaloneComprehensibility", alt: "comprehensibility", label: "COMP", color: "#3b82f6" },
                { key: "loop_potential", label: "LOOP", color: "#8b5cf6" },
              ].map(s => {
                const val = dir.subscores[s.key] ?? dir.subscores[s.alt];
                return val != null ? (
                  <div key={s.key} style={{
                    fontSize: "8px", fontWeight: "700", color: s.color,
                    background: s.color + "15", borderRadius: "3px", padding: "1px 5px",
                    display: "flex", gap: "3px", alignItems: "center",
                  }}>
                    {s.label} <span style={{ fontSize: "9px", color: "#fff" }}>{val}</span>
                  </div>
                ) : null;
              })}
            </div>
          )}
          <div style={{
            background: sc.bg, border: `1px solid ${sc.border}`,
            borderRadius: "6px", padding: "4px 10px", textAlign: "center",
            ...(isHighScore ? { boxShadow: `0 0 12px ${sc.border}44` } : {}),
          }}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: sc.text }}>
              {score || '—'}
            </div>
            <div style={{ fontSize: "8px", color: "#888" }}>{dir.subscores ? "SCORE" : "VIRAL"}</div>
          </div>
          {expanded ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Thumbnail */}
          {thumb.concept && (
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <SelectBox checked={isSelected("thumbnail")} onChange={() => onToggleElement(dirKey, "thumbnail", dir)} color={accentColor} />
              <div style={{ flex: 1, background: "#1a1a1a", borderRadius: "6px", padding: "10px 12px", border: "1px solid #333" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <Image size={12} color="#f59e0b" />
                  <span style={{ fontSize: "10px", fontWeight: "600", color: "#f59e0b", textTransform: "uppercase" }}>Thumbnail Direction</span>
                </div>
                <div style={{ fontSize: "12px", color: "#e0e0e0", marginBottom: "4px" }}>{thumb.concept}</div>
                {thumb.transcript_reference && (
                  <div style={{ fontSize: "11px", color: "#888", fontStyle: "italic" }}>Reference: {thumb.transcript_reference}</div>
                )}
                {thumb.visual_elements?.length > 0 && (
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                    {thumb.visual_elements.map((el, i) => (
                      <span key={i} style={{ fontSize: "10px", background: "#333", color: "#ccc", borderRadius: "4px", padding: "2px 8px" }}>{el}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {(dir.description_text || dir.description) && (
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <SelectBox checked={isSelected("description")} onChange={() => onToggleElement(dirKey, "description", dir)} color={accentColor} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: "4px" }}>Description</div>
                <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6", whiteSpace: "pre-line" }}>{dir.description_text || dir.description}</div>
              </div>
            </div>
          )}

          {/* Hook (verbatim) */}
          {dir.hook && (
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <SelectBox checked={isSelected("hook")} onChange={() => onToggleElement(dirKey, "hook", dir)} color={accentColor} />
              <div style={{ flex: 1, background: "#1a1a1a", borderLeft: `3px solid ${accentColor}`, borderRadius: "4px", padding: "10px 12px" }}>
                <div style={{ fontSize: "10px", fontWeight: "600", color: accentColor, textTransform: "uppercase", marginBottom: "4px" }}>Hook (verbatim)</div>
                <div style={{ fontSize: "13px", color: "#e0e0e0", fontStyle: "italic", lineHeight: "1.6" }}>"{dir.hook}"</div>
              </div>
            </div>
          )}

          {/* Arc Summary */}
          {dir.arc_summary && (
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <SelectBox checked={isSelected("arc")} onChange={() => onToggleElement(dirKey, "arc", dir)} color={accentColor} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: "4px" }}>Creative Direction</div>
                <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6" }}>{dir.arc_summary}</div>
              </div>
            </div>
          )}

          {/* Content Flow — Beat/Thread visualization */}
          {dir.beat_flow?.length > 0 && beatAnalysis?.threads?.length > 0 && (
            <div style={{ paddingLeft: "28px" }}>
              {dir.thread_refs?.length > 0 && (
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                  {dir.thread_refs.map(ref => {
                    const thread = beatAnalysis.threads.find(t => t.id === ref.thread_id);
                    const threadIdx = beatAnalysis.threads.findIndex(t => t.id === ref.thread_id);
                    const color = THREAD_COLORS[threadIdx % THREAD_COLORS.length];
                    if (!thread) return null;
                    return (
                      <span key={ref.thread_id} style={{
                        fontSize: "10px", fontWeight: "600",
                        background: color + "18", color: color,
                        borderRadius: "4px", padding: "2px 8px",
                        border: ref.role === "primary" || ref.role === "featured" ? `1px solid ${color}44` : "none",
                      }}>
                        {(ref.role === "primary" || ref.role === "featured") && "\u25CF "}
                        {thread.principle?.length > 50 ? thread.principle.slice(0, 50) + "..." : thread.principle}
                      </span>
                    );
                  })}
                </div>
              )}
              <div style={{
                display: "flex", gap: "3px", flexWrap: "wrap",
                background: "#1a1a1a", borderRadius: "6px", padding: "8px 10px", border: "1px solid #2a2a2a",
              }}>
                <div style={{ fontSize: "9px", fontWeight: "700", color: "#888", textTransform: "uppercase", marginBottom: "4px", width: "100%" }}>Content Flow</div>
                {dir.beat_flow.map((beatId, i) => {
                  const beat = beatAnalysis.beats?.find(b => b.id === beatId);
                  if (!beat) return <span key={i} style={{ fontSize: "10px", background: "#333", color: "#888", borderRadius: "3px", padding: "2px 6px" }}>{beatId.replace(/_/g, " ")}</span>;
                  const threadIdx = beat.primaryThread ? beatAnalysis.threads.findIndex(t => t.id === beat.primaryThread) : -1;
                  const color = threadIdx >= 0 ? THREAD_COLORS[threadIdx % THREAD_COLORS.length] : "#6b7280";
                  const isHybrid = beat.beatRole === "hybrid";
                  const isFeatured = dir.featured_hybrid_beats?.includes(beatId);
                  return (
                    <span key={i} title={`${beat.displayName || beatId}\n${beat.beatType} (${beat.beatRole})\nThread: ${beat.primaryThread || "none"}`}
                      style={{
                        fontSize: "10px", fontWeight: isHybrid ? "700" : "500",
                        background: color + "22", color: color, borderRadius: "3px", padding: "2px 7px",
                        border: isFeatured ? `1px solid ${color}` : `1px solid ${color}33`,
                      }}>
                      {beat.beatType?.replace(/_/g, " ")}{isHybrid && " \u2605"}
                    </span>
                  );
                })}
              </div>
              {isLongForm && dir.beat_role_counts && (
                <div style={{ display: "flex", gap: "8px", marginTop: "6px", fontSize: "10px", color: "#888" }}>
                  {dir.beat_role_counts.content > 0 && <span><span style={{ color: "#3b82f6" }}>{dir.beat_role_counts.content}</span> content</span>}
                  {dir.beat_role_counts.pacing > 0 && <span><span style={{ color: "#f59e0b" }}>{dir.beat_role_counts.pacing}</span> pacing</span>}
                  {dir.beat_role_counts.hybrid > 0 && <span><span style={{ color: "#8b5cf6" }}>{dir.beat_role_counts.hybrid}</span> hybrid</span>}
                  {dir.beat_role_counts.transition > 0 && <span><span style={{ color: "#6b7280" }}>{dir.beat_role_counts.transition}</span> transition</span>}
                </div>
              )}
              {!isLongForm && dir.featured_hybrid_beats?.length > 0 && (
                <div style={{ marginTop: "6px", fontSize: "10px", color: "#8b5cf6" }}>
                  {"\u2605"} Hybrid beats featured: {dir.featured_hybrid_beats.map(id => {
                    const b = beatAnalysis.beats?.find(x => x.id === id);
                    return b?.displayName || id.replace(/_/g, " ");
                  }).join(", ")}
                </div>
              )}
            </div>
          )}

          {/* Virality Rationale */}
          {viralityRationale && (
            <div style={{ paddingLeft: "28px" }}>
              <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: "4px" }}>Virality Rationale</div>
              <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6" }}>{viralityRationale}</div>
            </div>
          )}

          {/* Title Variations */}
          {titleVars.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "28px" }}>Title Options</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {titleVars.map((tv, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <SelectBox checked={isSelected(`title_${i}`)} onChange={() => onToggleElement(dirKey, `title_${i}`, dir)} color={accentColor} />
                    <div style={{ flex: 1, background: "#1a1a1a", borderRadius: "6px", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", color: "#e0e0e0" }}>{tv.text}</span>
                      <span style={{ fontSize: "10px", fontWeight: "600", color: accentColor, background: accentColor + "18", borderRadius: "4px", padding: "2px 8px", flexShrink: 0 }}>
                        {TITLE_STYLE_LABELS[tv.style] || tv.style}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA (short-form) */}
          {(dir.cta || meta.cta || dir.suggested_cta) && (
            <div style={{ paddingLeft: "28px", fontSize: "12px", color: "#ec4899" }}>CTA: {dir.cta || meta.cta || dir.suggested_cta}</div>
          )}

          {/* Deploy button */}
          {!hasProductionData && !hasLegacyProduction && (
            <div style={{ paddingLeft: "28px" }}>
              <button onClick={() => onDeploy && onDeploy(dirKey, dir)} disabled={!dir._savedId || isDeploying}
                style={{
                  background: isDeploying ? "#374151" : "linear-gradient(135deg, #f59e0b, #d97706)",
                  border: "none", borderRadius: "8px", padding: "10px 20px",
                  color: isDeploying ? "#ccc" : "#000", fontSize: "13px", fontWeight: "700",
                  cursor: isDeploying ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: "8px",
                  opacity: dir._savedId ? 1 : 0.5,
                }}>
                {isDeploying ? <><Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> Deploying...</> : <><Rocket size={14} /> Deploy to AI</>}
              </button>
              <div style={{ fontSize: "10px", color: "#666", marginTop: "4px" }}>Generates edited transcript, EDL, and visual directions (~$0.30-0.60)</div>
            </div>
          )}

          {/* Production Package */}
          {(hasProductionData || hasLegacyProduction) && (
            <>
              {hasProductionData && (
                <div style={{ paddingLeft: "28px" }}>
                  <span style={{ fontSize: "10px", fontWeight: "700", background: "#16a34a22", color: "#22c55e", borderRadius: "6px", padding: "3px 10px" }}>Production Package Ready</span>
                </div>
              )}
              {editedTranscript && (
                <div style={{ paddingLeft: "28px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "600", color: "#22c55e", textTransform: "uppercase", marginBottom: "8px" }}>Edited Transcript</div>
                  <div style={{ background: "#0d0d0d", border: "1px solid #333", borderRadius: "6px", padding: "14px", fontSize: "12px", color: "#d4d4d4", lineHeight: "1.8", whiteSpace: "pre-wrap", maxHeight: "400px", overflowY: "auto" }}>{editedTranscript}</div>
                </div>
              )}
              {edl.length > 0 && (
                <div style={{ paddingLeft: "28px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase" }}>Edit Decision List</div>
                    <button onClick={copyEdl} style={{ background: edlCopied ? "#166534" : "#333", border: `1px solid ${edlCopied ? "#22c55e" : "#555"}`, borderRadius: "4px", padding: "3px 8px", color: edlCopied ? "#22c55e" : "#ccc", fontSize: "10px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                      {edlCopied ? <><ClipboardCheck size={10} /> Copied</> : <><Copy size={10} /> Copy EDL</>}
                    </button>
                  </div>
                  <div style={{ background: "#0d0d0d", border: "1px solid #333", borderRadius: "6px", padding: "12px 14px", fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace", fontSize: "11px", lineHeight: "1.8", color: "#d4d4d4", whiteSpace: "pre-wrap", overflowX: "auto" }}>
                    {edl.map(e => `${String(e.step).padStart(2, "0")}. ${e.action} — ${e.segment}${e.pacing ? `  |  ${e.pacing}` : ""}`).join("\n")}
                  </div>
                </div>
              )}
              {visualDirections.length > 0 && (
                <div style={{ paddingLeft: "28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <Layers size={12} color="#06b6d4" />
                    <span style={{ fontSize: "10px", fontWeight: "600", color: "#06b6d4", textTransform: "uppercase" }}>Visual Directions</span>
                  </div>
                  {visualDirections.map((vd, i) => (
                    <div key={i} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "10px 12px", marginBottom: "8px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "600", color: "#06b6d4", marginBottom: "6px" }}>{vd.segment}</div>
                      {vd.b_roll && <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.5", marginBottom: "6px" }}><span style={{ fontSize: "9px", fontWeight: "600", color: "#06b6d4" }}>B-ROLL: </span>{vd.b_roll}</div>}
                      {(vd.motion_graphics || []).map((mg, j) => (
                        <div key={j} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <span style={{ fontSize: "9px", fontWeight: "700", textTransform: "uppercase", background: "#a78bfa18", color: "#a78bfa", borderRadius: "3px", padding: "1px 6px" }}>{MOTION_GRAPHIC_LABELS[mg.type] || mg.type}</span>
                          <span style={{ fontSize: "11px", color: "#e0e0e0" }}>{mg.content}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {visualDirections.length === 0 && legacyBRoll.length > 0 && (
                <div style={{ paddingLeft: "28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}><Video size={12} color="#06b6d4" /><span style={{ fontSize: "10px", fontWeight: "600", color: "#06b6d4", textTransform: "uppercase" }}>B-Roll Directions</span></div>
                  {legacyBRoll.map((br, i) => (
                    <div key={i} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "8px 12px", marginBottom: "6px" }}>
                      <div style={{ fontSize: "10px", fontWeight: "600", color: "#06b6d4", marginBottom: "3px" }}>{br.segment}</div>
                      <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.5" }}>{br.direction}</div>
                    </div>
                  ))}
                </div>
              )}
              {visualDirections.length === 0 && legacyMotionGraphics.length > 0 && (
                <div style={{ paddingLeft: "28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}><Type size={12} color="#a78bfa" /><span style={{ fontSize: "10px", fontWeight: "600", color: "#a78bfa", textTransform: "uppercase" }}>Motion Graphics</span></div>
                  {legacyMotionGraphics.map((mg, i) => (
                    <div key={i} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "8px 12px", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                        <span style={{ fontSize: "9px", fontWeight: "700", textTransform: "uppercase", background: "#a78bfa18", color: "#a78bfa", borderRadius: "3px", padding: "1px 6px" }}>{MOTION_GRAPHIC_LABELS[mg.type] || mg.type}</span>
                        <span style={{ fontSize: "10px", color: "#888" }}>{mg.timecode_ref}</span>
                      </div>
                      <div style={{ fontSize: "12px", color: "#e0e0e0", marginBottom: "2px" }}>{mg.content}</div>
                      {mg.purpose && <div style={{ fontSize: "11px", color: "#888", fontStyle: "italic" }}>{mg.purpose}</div>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Recut button */}
          {hasProductionData && beatAnalysis && !recutData && (
            <div style={{ paddingLeft: "28px" }}>
              <button onClick={() => onRecut && onRecut(dirKey, dir)} disabled={recutting === dir._savedId}
                style={{
                  background: recutting === dir._savedId ? "#374151" : "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                  border: "none", borderRadius: "8px", padding: "8px 16px",
                  color: "#fff", fontSize: "12px", fontWeight: "600",
                  cursor: recutting === dir._savedId ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: "8px",
                }}>
                {recutting === dir._savedId ? <><Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> Generating Recut...</> : <><RefreshCw size={14} /> Generate Recut</>}
              </button>
              <div style={{ fontSize: "10px", color: "#666", marginTop: "4px" }}>Proposes beat reordering to improve narrative flow (~$0.15-0.40)</div>
            </div>
          )}

          {/* Recut display */}
          {recutData && (
            <div style={{ paddingLeft: "28px" }}>
              <div style={{ fontSize: "10px", fontWeight: "600", color: "#8b5cf6", textTransform: "uppercase", marginBottom: "8px" }}>Recut Suggestion</div>
              <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                <div style={{ flex: 1, background: "#0d0d0d", border: "1px solid #333", borderRadius: "6px", padding: "10px" }}>
                  <div style={{ fontSize: "9px", fontWeight: "700", color: "#888", textTransform: "uppercase", marginBottom: "6px" }}>Original</div>
                  {(recutData.original_sequence || []).map((id, i) => <div key={i} style={{ fontSize: "11px", color: "#999", padding: "2px 0" }}>{i + 1}. {id}</div>)}
                </div>
                <div style={{ flex: 1, background: "#0d0d0d", border: "1px solid #8b5cf622", borderRadius: "6px", padding: "10px" }}>
                  <div style={{ fontSize: "9px", fontWeight: "700", color: "#8b5cf6", textTransform: "uppercase", marginBottom: "6px" }}>Proposed</div>
                  {(recutData.proposed_sequence || []).map((id, i) => <div key={i} style={{ fontSize: "11px", color: "#e0e0e0", padding: "2px 0" }}>{i + 1}. {id}</div>)}
                </div>
              </div>
              {recutData.moves?.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "9px", fontWeight: "700", color: "#888", textTransform: "uppercase", marginBottom: "6px" }}>Moves</div>
                  {recutData.moves.map((m, i) => (
                    <div key={i} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "8px 12px", marginBottom: "6px" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "3px" }}>
                        <span style={{ fontSize: "9px", fontWeight: "700", textTransform: "uppercase", background: "#8b5cf618", color: "#8b5cf6", borderRadius: "3px", padding: "1px 6px" }}>{m.action}</span>
                        <span style={{ fontSize: "11px", color: "#e0e0e0", fontWeight: "600" }}>{m.beatId}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#b0b0b0" }}>{m.rationale}</div>
                      {m.transitionNote && <div style={{ fontSize: "10px", color: "#888", fontStyle: "italic", marginTop: "3px" }}>{m.transitionNote}</div>}
                    </div>
                  ))}
                </div>
              )}
              {recutData.recut_script?.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "9px", fontWeight: "700", color: "#888", textTransform: "uppercase", marginBottom: "6px" }}>Edit Script</div>
                  {recutData.recut_script.map((s, i) => (
                    <div key={i} style={{ background: "#0d0d0d", border: "1px solid #333", borderRadius: "6px", padding: "8px 12px", marginBottom: "4px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: "#8b5cf6", flexShrink: 0 }}>{s.position}.</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "11px", color: "#e0e0e0" }}>{s.editAction}</div>
                        <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>{s.beatId} — {s.estimatedDuration}{s.transitionOut && ` → ${s.transitionOut}`}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {recutData.estimated_improvement && (
                <div style={{ background: "#8b5cf60a", border: "1px solid #8b5cf622", borderRadius: "6px", padding: "10px 12px", fontSize: "12px", color: "#c4b5fd", lineHeight: "1.6" }}>{recutData.estimated_improvement}</div>
              )}
            </div>
          )}

          {/* Create Brief */}
          <div style={{ paddingLeft: "28px" }}>
            <button onClick={() => dir._savedId && onCreateBrief(dir._savedId)} disabled={!dir._savedId || dir._briefCreated || briefCreating === dir._savedId}
              style={{
                background: dir._briefCreated ? "#166534" : "#374151",
                border: `1px solid ${dir._briefCreated ? "#22c55e" : "#555"}`,
                borderRadius: "6px", padding: "6px 14px",
                color: "#fff", fontSize: "11px", fontWeight: "600",
                cursor: !dir._savedId || dir._briefCreated ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: "6px",
                opacity: dir._savedId ? 1 : 0.5,
              }}>
              {dir._briefCreated ? <><Check size={12} /> Brief Created</> : briefCreating === dir._savedId ? <><Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> Creating...</> : <><Plus size={12} /> Create Brief</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
