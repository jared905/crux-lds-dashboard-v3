import React, { useState, useEffect, useCallback } from "react";
import {
  FileText, Trash2, ChevronDown, ChevronUp, Loader, Link2, Unlink, TrendingUp, TrendingDown,
  Check, X as XIcon, Copy, ClipboardCheck,
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
  remix: "Remix",
};

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

// ─── Copy helper ────────────────────────────────────────────────────────
function useCopyField() {
  const [copiedField, setCopiedField] = useState(null);
  const copyText = useCallback(async (text, fieldKey) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 1500);
    } catch { /* silent */ }
  }, []);
  return { copiedField, copyText };
}

function CopyBtn({ fieldKey, text, copiedField, copyText }) {
  const isCopied = copiedField === fieldKey;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); copyText(text, fieldKey); }}
      style={{
        background: "transparent", border: "1px solid #444", borderRadius: "4px",
        padding: "2px 6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
        color: isCopied ? "#22c55e" : "#888", fontSize: "10px", flexShrink: 0,
      }}
      title="Copy"
    >
      {isCopied ? <Check size={10} /> : <Copy size={10} />}
      {isCopied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Markdown export builder ────────────────────────────────────────────
function buildBriefMarkdown(brief, channelName) {
  const d = brief.brief_data || {};
  const meta = d.direction_metadata || {};
  const lines = [];

  lines.push(`# ${brief.title || "Untitled Brief"}`);
  if (channelName) lines.push(`Channel: ${channelName}`);
  if (meta.format_type) lines.push(`Format: ${meta.format_type}`);
  if (meta.estimated_duration) lines.push(`Duration: ${meta.estimated_duration}`);
  lines.push("");

  if (d.hook) {
    lines.push("## Hook");
    lines.push(d.hook);
    lines.push("");
  }

  if (d.arc_summary || d.arc) {
    lines.push("## Arc");
    lines.push(d.arc_summary || d.arc);
    lines.push("");
  }

  if (d.title_variations?.length) {
    lines.push("## Title Options");
    d.title_variations.forEach((tv, i) => {
      const label = typeof tv === "string" ? tv : tv.text || tv.title || "";
      const style = typeof tv === "object" && tv.style ? ` (${tv.style})` : "";
      lines.push(`${i + 1}. ${label}${style}`);
    });
    lines.push("");
  }

  if (d.description) {
    lines.push("## Description");
    lines.push(d.description);
    lines.push("");
  }

  const thumb = d.thumbnail_suggestion || d.thumbnail;
  if (thumb) {
    lines.push("## Thumbnail");
    if (typeof thumb === "string") {
      lines.push(thumb);
    } else {
      if (thumb.concept) lines.push(`Concept: ${thumb.concept}`);
      if (thumb.transcript_reference) lines.push(`Reference: ${thumb.transcript_reference}`);
      if (thumb.visual_elements?.length) lines.push(`Elements: ${thumb.visual_elements.join(", ")}`);
      if (thumb.text_overlay) lines.push(`Text: ${thumb.text_overlay}`);
    }
    lines.push("");
  }

  if (meta.edl?.length) {
    lines.push("## EDL");
    meta.edl.forEach((step, i) => {
      lines.push(`${i + 1}. ${step.action || step.description || ""} — ${step.segment || ""} (${step.pacing || ""})`);
    });
    lines.push("");
  }

  if (meta.b_roll?.length) {
    lines.push("## B-Roll");
    meta.b_roll.forEach(br => {
      lines.push(`- ${br.segment || br.timecode || ""}: ${br.direction || br.description || ""}`);
    });
    lines.push("");
  }

  if (meta.motion_graphics?.length) {
    lines.push("## Motion Graphics");
    meta.motion_graphics.forEach(mg => {
      lines.push(`- ${mg.type || "graphic"} at ${mg.timecode || "—"}: ${mg.content || mg.description || ""}`);
    });
    lines.push("");
  }

  if (meta.timestamps?.length) {
    lines.push("## Timestamps");
    meta.timestamps.forEach(ts => {
      lines.push(`- ${ts.in || ts.timecode || "—"} → ${ts.out || ""}: ${ts.note || ts.label || ""}`);
    });
    lines.push("");
  }

  if (d.rationale) {
    lines.push("## Rationale");
    lines.push(d.rationale);
    lines.push("");
  }

  const cta = d.suggested_cta || d.cta || meta.cta;
  if (cta) {
    lines.push("## CTA");
    lines.push(cta);
    lines.push("");
  }

  if (d.editor_notes) {
    lines.push("## Editor Notes");
    lines.push(d.editor_notes);
    lines.push("");
  }

  return lines.join("\n").trim();
}

// ═══════════════════════════════════════════════════════════════════════
// BriefDetailPanel
// ═══════════════════════════════════════════════════════════════════════
function BriefDetailPanel({ brief, channelName }) {
  const { copiedField, copyText } = useCopyField();
  const d = brief.brief_data || {};
  const meta = d.direction_metadata || {};

  const sectionHeader = (label) => (
    <div style={{
      fontSize: "11px", fontWeight: "700", color: "#888", textTransform: "uppercase",
      letterSpacing: "0.05em", marginBottom: "6px",
    }}>
      {label}
    </div>
  );

  const fullMarkdown = buildBriefMarkdown(brief, channelName);

  return (
    <div style={{
      background: "#161616", border: "1px solid #2a2a2a", borderTop: "none",
      borderRadius: "0 0 8px 8px", padding: "20px 24px",
    }}>
      {/* Copy All bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid #2a2a2a",
      }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {meta.format_type && (
            <span style={{
              fontSize: "11px", fontWeight: "600", color: "#f59e0b", background: "#f59e0b22",
              borderRadius: "6px", padding: "2px 10px",
            }}>
              {meta.format_type}
            </span>
          )}
          {meta.estimated_duration && (
            <span style={{ fontSize: "11px", color: "#888" }}>{meta.estimated_duration}</span>
          )}
          {d.virality_score != null && (
            <span style={{
              fontSize: "11px", fontWeight: "600", color: "#22c55e", background: "#22c55e22",
              borderRadius: "6px", padding: "2px 10px",
            }}>
              Score: {d.virality_score}/10
            </span>
          )}
        </div>
        <button
          onClick={() => copyText(fullMarkdown, "_all")}
          style={{
            background: copiedField === "_all" ? "#16a34a" : "#252525",
            border: `1px solid ${copiedField === "_all" ? "#22c55e" : "#444"}`,
            borderRadius: "6px", padding: "6px 14px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "6px",
            color: copiedField === "_all" ? "#fff" : "#e0e0e0", fontSize: "12px", fontWeight: "600",
          }}
        >
          {copiedField === "_all" ? <ClipboardCheck size={14} /> : <Copy size={14} />}
          {copiedField === "_all" ? "Copied!" : "Copy Brief"}
        </button>
      </div>

      {/* Hook */}
      {d.hook && (
        <div style={{ marginBottom: "16px", borderLeft: "3px solid #f59e0b", paddingLeft: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {sectionHeader("Hook")}
            <CopyBtn fieldKey="hook" text={d.hook} copiedField={copiedField} copyText={copyText} />
          </div>
          <div style={{ fontSize: "13px", color: "#e0e0e0", lineHeight: "1.5" }}>{d.hook}</div>
        </div>
      )}

      {/* Arc */}
      {(d.arc_summary || d.arc) && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {sectionHeader("Arc")}
            <CopyBtn fieldKey="arc" text={d.arc_summary || d.arc} copiedField={copiedField} copyText={copyText} />
          </div>
          <div style={{ fontSize: "13px", color: "#c0c0c0", lineHeight: "1.5" }}>{d.arc_summary || d.arc}</div>
        </div>
      )}

      {/* Title Variations */}
      {d.title_variations?.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {sectionHeader("Title Variations")}
            <CopyBtn
              fieldKey="titles"
              text={d.title_variations.map((tv, i) => {
                const label = typeof tv === "string" ? tv : tv.text || tv.title || "";
                const style = typeof tv === "object" && tv.style ? ` (${tv.style})` : "";
                return `${i + 1}. ${label}${style}`;
              }).join("\n")}
              copiedField={copiedField} copyText={copyText}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {d.title_variations.map((tv, i) => {
              const label = typeof tv === "string" ? tv : tv.text || tv.title || "";
              const style = typeof tv === "object" ? tv.style : null;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#666", minWidth: "18px" }}>{i + 1}.</span>
                  <span style={{ fontSize: "13px", color: "#e0e0e0" }}>{label}</span>
                  {style && (
                    <span style={{
                      fontSize: "10px", fontWeight: "600",
                      color: style.includes("Curiosity") ? "#f59e0b" : style.includes("Direct") ? "#3b82f6" : "#a855f7",
                      background: style.includes("Curiosity") ? "#f59e0b18" : style.includes("Direct") ? "#3b82f618" : "#a855f718",
                      borderRadius: "6px", padding: "1px 8px",
                    }}>
                      {style}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Description */}
      {d.description && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {sectionHeader("Description")}
            <CopyBtn fieldKey="desc" text={d.description} copiedField={copiedField} copyText={copyText} />
          </div>
          <div style={{ fontSize: "13px", color: "#c0c0c0", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{d.description}</div>
        </div>
      )}

      {/* Thumbnail */}
      {(d.thumbnail_suggestion || d.thumbnail) && (() => {
        const thumb = d.thumbnail_suggestion || d.thumbnail;
        const thumbText = typeof thumb === "string"
          ? thumb
          : [thumb.concept, thumb.transcript_reference, thumb.visual_elements?.join(", "), thumb.text_overlay].filter(Boolean).join("\n");
        return (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {sectionHeader("Thumbnail Direction")}
              <CopyBtn fieldKey="thumb" text={thumbText} copiedField={copiedField} copyText={copyText} />
            </div>
            {typeof thumb === "string" ? (
              <div style={{ fontSize: "13px", color: "#c0c0c0", lineHeight: "1.5" }}>{thumb}</div>
            ) : (
              <div style={{ fontSize: "13px", color: "#c0c0c0", lineHeight: "1.6" }}>
                {thumb.concept && <div><span style={{ color: "#888", fontWeight: "600" }}>Concept:</span> {thumb.concept}</div>}
                {thumb.transcript_reference && <div><span style={{ color: "#888", fontWeight: "600" }}>Reference:</span> {thumb.transcript_reference}</div>}
                {thumb.visual_elements?.length > 0 && <div><span style={{ color: "#888", fontWeight: "600" }}>Elements:</span> {thumb.visual_elements.join(", ")}</div>}
                {thumb.text_overlay && <div><span style={{ color: "#888", fontWeight: "600" }}>Text:</span> {thumb.text_overlay}</div>}
              </div>
            )}
          </div>
        );
      })()}

      {/* EDL */}
      {meta.edl?.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {sectionHeader("EDL")}
            <CopyBtn
              fieldKey="edl"
              text={meta.edl.map((s, i) => `${i + 1}. ${s.action || s.description || ""}\t${s.segment || ""}\t${s.pacing || ""}`).join("\n")}
              copiedField={copiedField} copyText={copyText}
            />
          </div>
          <div style={{
            background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: "6px",
            padding: "10px 14px", fontFamily: "monospace", fontSize: "12px",
          }}>
            {meta.edl.map((step, i) => (
              <div key={i} style={{ color: "#c0c0c0", marginBottom: i < meta.edl.length - 1 ? "4px" : 0 }}>
                <span style={{ color: "#f59e0b", fontWeight: "600" }}>{i + 1}.</span>{" "}
                {step.action || step.description || "—"}{" "}
                <span style={{ color: "#666" }}>—</span>{" "}
                <span style={{ color: "#3b82f6" }}>{step.segment || ""}</span>{" "}
                {step.pacing && <span style={{ color: "#888" }}>({step.pacing})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* B-Roll */}
      {meta.b_roll?.length > 0 && (
        <div style={{ marginBottom: "16px", borderLeft: "3px solid #06b6d4", paddingLeft: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {sectionHeader("B-Roll")}
            <CopyBtn
              fieldKey="broll"
              text={meta.b_roll.map(br => `${br.segment || br.timecode || ""}: ${br.direction || br.description || ""}`).join("\n")}
              copiedField={copiedField} copyText={copyText}
            />
          </div>
          {meta.b_roll.map((br, i) => (
            <div key={i} style={{
              fontSize: "13px", color: "#c0c0c0", marginBottom: "4px",
              display: "flex", gap: "8px",
            }}>
              <span style={{ color: "#06b6d4", fontWeight: "600", flexShrink: 0 }}>{br.segment || br.timecode || `Shot ${i + 1}`}</span>
              <span>{br.direction || br.description || ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* Motion Graphics */}
      {meta.motion_graphics?.length > 0 && (
        <div style={{ marginBottom: "16px", borderLeft: "3px solid #a855f7", paddingLeft: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {sectionHeader("Motion Graphics")}
            <CopyBtn
              fieldKey="mfx"
              text={meta.motion_graphics.map(mg => `${mg.type || "graphic"} at ${mg.timecode || "—"}: ${mg.content || mg.description || ""}`).join("\n")}
              copiedField={copiedField} copyText={copyText}
            />
          </div>
          {meta.motion_graphics.map((mg, i) => (
            <div key={i} style={{
              fontSize: "13px", color: "#c0c0c0", marginBottom: "4px",
              display: "flex", gap: "8px",
            }}>
              <span style={{ color: "#a855f7", fontWeight: "600", flexShrink: 0 }}>{mg.type || "Graphic"}</span>
              {mg.timecode && <span style={{ color: "#888" }}>at {mg.timecode}</span>}
              <span>{mg.content || mg.description || ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* Timestamps */}
      {meta.timestamps?.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {sectionHeader("Timestamps")}
            <CopyBtn
              fieldKey="ts"
              text={meta.timestamps.map(ts => `${ts.in || ts.timecode || ""} → ${ts.out || ""}: ${ts.note || ts.label || ""}`).join("\n")}
              copiedField={copiedField} copyText={copyText}
            />
          </div>
          <div style={{
            background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: "6px",
            padding: "10px 14px", fontFamily: "monospace", fontSize: "12px",
          }}>
            {meta.timestamps.map((ts, i) => (
              <div key={i} style={{ color: "#c0c0c0", marginBottom: i < meta.timestamps.length - 1 ? "3px" : 0 }}>
                <span style={{ color: "#22c55e" }}>{ts.in || ts.timecode || "—"}</span>
                {ts.out && <span style={{ color: "#666" }}> → </span>}
                {ts.out && <span style={{ color: "#22c55e" }}>{ts.out}</span>}
                <span style={{ color: "#888" }}> {ts.note || ts.label || ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rationale */}
      {d.rationale && (
        <div style={{ marginBottom: "16px" }}>
          {sectionHeader("Rationale")}
          <div style={{ fontSize: "13px", color: "#999", lineHeight: "1.5", fontStyle: "italic" }}>{d.rationale}</div>
        </div>
      )}

      {/* CTA */}
      {(d.suggested_cta || d.cta || meta.cta) && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {sectionHeader("CTA")}
            <CopyBtn fieldKey="cta" text={d.suggested_cta || d.cta || meta.cta} copiedField={copiedField} copyText={copyText} />
          </div>
          <div style={{ fontSize: "13px", color: "#c0c0c0" }}>{d.suggested_cta || d.cta || meta.cta}</div>
        </div>
      )}

      {/* Editor Notes (remix) */}
      {d.editor_notes && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {sectionHeader("Editor Notes")}
            <CopyBtn fieldKey="notes" text={d.editor_notes} copiedField={copiedField} copyText={copyText} />
          </div>
          <div style={{ fontSize: "13px", color: "#c0c0c0", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>{d.editor_notes}</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BriefsList (main export)
// ═══════════════════════════════════════════════════════════════════════
export default function BriefsList({ activeClient, clientVideos = [] }) {
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [linkingBriefId, setLinkingBriefId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [expandedBriefId, setExpandedBriefId] = useState(null);

  const fetchBriefs = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase
        .from("briefs")
        .select("*, channels(name)")
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
      if (expandedBriefId === briefId) setExpandedBriefId(null);
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
        borderRadius: "8px",
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
              Planned content items — click a brief to view details and copy for your editor
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
              borderRadius: "8px",
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
        borderRadius: "8px",
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
              const isExpanded = expandedBriefId === brief.id;
              const channelName = brief.channels?.name || null;
              const hasBriefData = brief.brief_data && Object.keys(brief.brief_data).length > 0;

              return (
                <div key={brief.id} style={{ borderBottom: "1px solid #2a2a2a" }}>
                  {/* Main row */}
                  <div
                    onClick={() => hasBriefData && setExpandedBriefId(isExpanded ? null : brief.id)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px 120px 140px 80px",
                      gap: "12px",
                      padding: "14px 20px",
                      alignItems: "center",
                      fontSize: "13px",
                      cursor: hasBriefData ? "pointer" : "default",
                      background: isExpanded ? "#1a1a2e" : "transparent",
                      transition: "background 0.1s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                      {hasBriefData && (
                        isExpanded
                          ? <ChevronUp size={14} color="#3b82f6" style={{ flexShrink: 0 }} />
                          : <ChevronDown size={14} color="#666" style={{ flexShrink: 0 }} />
                      )}
                      <span style={{
                        color: "#fff",
                        fontWeight: "500",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {brief.title}
                      </span>
                      {channelName && (
                        <span style={{
                          fontSize: "10px", fontWeight: "600", color: "#3b82f6", background: "#3b82f622",
                          borderRadius: "6px", padding: "1px 8px", flexShrink: 0,
                        }}>
                          {channelName}
                        </span>
                      )}
                    </div>

                    {/* Status dropdown */}
                    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
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

                    <div style={{ display: "flex", gap: "4px" }} onClick={(e) => e.stopPropagation()}>
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

                  {/* Expanded detail panel */}
                  {isExpanded && hasBriefData && (
                    <BriefDetailPanel brief={brief} channelName={channelName} />
                  )}

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
                          <MetricDelta
                            label="Views"
                            actual={outcome.actual?.views}
                            baseline={outcome.baseline?.views}
                            delta={outcome.delta?.views}
                            format="int"
                          />
                          <MetricDelta
                            label="CTR"
                            actual={outcome.actual?.ctr}
                            baseline={outcome.baseline?.ctr}
                            delta={outcome.delta?.ctr}
                            format="pct"
                          />
                          <MetricDelta
                            label="Retention"
                            actual={outcome.actual?.retention}
                            baseline={outcome.baseline?.retention}
                            delta={outcome.delta?.retention}
                            format="pct"
                          />

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
