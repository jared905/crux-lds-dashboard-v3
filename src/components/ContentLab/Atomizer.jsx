import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Zap, FileText, Scissors, MessageSquare, Loader,
  ChevronDown, ChevronUp, Check, Plus, Shuffle,
  Film, Smartphone, Image, Type, AlignLeft, X,
  Copy, Video, Layers, ClipboardCheck, Target, BarChart3, Users, Swords,
} from "lucide-react";
import {
  analyzeTranscript, saveTranscript, markTranscriptAnalyzed,
  saveAtomizedContent, createBriefFromAtomized,
  remixDirections, saveRemixAsBrief, fetchAtomizerContext,
} from "../../services/atomizerService";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

// Virality score badge color
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

// ============================================
// Checkbox component for remix selection
// ============================================
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

// ============================================
// Direction Card (expandable, with checkboxes)
// ============================================

const MOTION_GRAPHIC_LABELS = {
  lower_third: "Lower Third",
  title_card: "Title Card",
  stat_callout: "Stat Callout",
  animated_text: "Animated Text",
  full_screen_text: "Full Screen Text",
};

function DirectionCard({
  dir, dirKey, isLongForm, expanded, onToggleExpand,
  selectedElements, onToggleElement, onCreateBrief,
  briefCreating, accentColor,
}) {
  const [edlCopied, setEdlCopied] = React.useState(false);
  const sc = scoreColor(dir.virality_score ?? dir.viralityScore);
  const hookPreview = dir.hook?.length > 100 ? dir.hook.slice(0, 100) + "..." : dir.hook;
  const rationalePreview = dir.rationale?.length > 100 ? dir.rationale.slice(0, 100) + "..." : dir.rationale;
  const titleVars = dir.title_variations || [];
  const thumb = dir.thumbnail_suggestion || {};
  const meta = dir.direction_metadata || {};
  const timestamps = dir.timestamps || meta.timestamps || [];
  const edl = dir.edl || meta.edl || [];
  const bRoll = dir.b_roll || meta.b_roll || [];
  const motionGraphics = dir.motion_graphics || meta.motion_graphics || [];
  const formatType = dir.format_type || meta.format_type || null;
  const isSelected = (key) => selectedElements.has(key);

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

  return (
    <div style={{
      background: "#252525",
      border: `1px solid ${selectedElements.size > 0 ? accentColor + "44" : "#333"}`,
      borderRadius: "8px",
      overflow: "hidden",
      transition: "border-color 0.15s",
    }}>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => onToggleExpand(dirKey)}
        style={{
          width: "100%", background: "transparent", border: "none",
          padding: "16px", cursor: "pointer", textAlign: "left",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff" }}>
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
          </div>
          <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px" }}>
            {dir.hook_timecode ? `~${dir.hook_timecode}` : ""}
            {meta.estimated_duration || dir.estimated_duration
              ? ` / ${meta.estimated_duration || dir.estimated_duration}`
              : ""}
          </div>
          {!expanded && dir.hook && (
            <div style={{
              fontSize: "12px", color: "#b0b0b0", fontStyle: "italic",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              "{hookPreview}"
            </div>
          )}
          {!expanded && dir.rationale && (
            <div style={{
              fontSize: "11px", color: "#777", marginTop: "4px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {rationalePreview}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <div style={{
            background: sc.bg, border: `1px solid ${sc.border}`,
            borderRadius: "6px", padding: "4px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: sc.text }}>
              {dir.virality_score ?? dir.viralityScore}
            </div>
            <div style={{ fontSize: "8px", color: "#888" }}>VIRAL</div>
          </div>
          {expanded ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Hook */}
          {dir.hook && (
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <SelectBox
                checked={isSelected("hook")}
                onChange={() => onToggleElement(dirKey, "hook", dir)}
                color={accentColor}
              />
              <div style={{
                flex: 1, background: "#1a1a1a",
                borderLeft: `3px solid ${accentColor}`,
                borderRadius: "4px", padding: "10px 12px",
              }}>
                <div style={{ fontSize: "10px", fontWeight: "600", color: accentColor, textTransform: "uppercase", marginBottom: "4px" }}>
                  Hook (verbatim)
                </div>
                <div style={{ fontSize: "13px", color: "#e0e0e0", fontStyle: "italic", lineHeight: "1.6" }}>
                  "{dir.hook}"
                </div>
              </div>
            </div>
          )}

          {/* Arc */}
          {dir.arc_summary && (
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <SelectBox
                checked={isSelected("arc")}
                onChange={() => onToggleElement(dirKey, "arc", dir)}
                color={accentColor}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: "4px" }}>
                  Narrative Arc
                </div>
                <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6" }}>
                  {dir.arc_summary}
                </div>
              </div>
            </div>
          )}

          {/* Title Variations */}
          {titleVars.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "28px" }}>
                Title Options
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {titleVars.map((tv, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <SelectBox
                      checked={isSelected(`title_${i}`)}
                      onChange={() => onToggleElement(dirKey, `title_${i}`, dir)}
                      color={accentColor}
                    />
                    <div style={{
                      flex: 1, background: "#1a1a1a", borderRadius: "6px",
                      padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span style={{ fontSize: "13px", color: "#e0e0e0" }}>{tv.text}</span>
                      <span style={{
                        fontSize: "10px", fontWeight: "600",
                        color: accentColor, background: accentColor + "18",
                        borderRadius: "4px", padding: "2px 8px", flexShrink: 0,
                      }}>
                        {TITLE_STYLE_LABELS[tv.style] || tv.style}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {(dir.description_text || dir.description) && (
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <SelectBox
                checked={isSelected("description")}
                onChange={() => onToggleElement(dirKey, "description", dir)}
                color={accentColor}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: "4px" }}>
                  Description
                </div>
                <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6", whiteSpace: "pre-line" }}>
                  {dir.description_text || dir.description}
                </div>
              </div>
            </div>
          )}

          {/* Thumbnail */}
          {thumb.concept && (
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <SelectBox
                checked={isSelected("thumbnail")}
                onChange={() => onToggleElement(dirKey, "thumbnail", dir)}
                color={accentColor}
              />
              <div style={{
                flex: 1, background: "#1a1a1a", borderRadius: "6px",
                padding: "10px 12px", border: "1px solid #333",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <Image size={12} color="#f59e0b" />
                  <span style={{ fontSize: "10px", fontWeight: "600", color: "#f59e0b", textTransform: "uppercase" }}>
                    Thumbnail Direction
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "#e0e0e0", marginBottom: "4px" }}>
                  {thumb.concept}
                </div>
                {thumb.transcript_reference && (
                  <div style={{ fontSize: "11px", color: "#888", fontStyle: "italic" }}>
                    Reference: {thumb.transcript_reference}
                  </div>
                )}
                {thumb.visual_elements?.length > 0 && (
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                    {thumb.visual_elements.map((el, i) => (
                      <span key={i} style={{
                        fontSize: "10px", background: "#333", color: "#ccc",
                        borderRadius: "4px", padding: "2px 8px",
                      }}>
                        {el}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timestamps */}
          {timestamps.length > 0 && (
            <div style={{ paddingLeft: "28px" }}>
              <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: "8px" }}>
                Timestamps
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {timestamps.map((ts, i) => (
                  <div key={i} style={{
                    display: "flex", gap: "8px", alignItems: "baseline",
                    fontSize: "12px", color: "#b0b0b0",
                  }}>
                    <span style={{ color: accentColor, fontWeight: "600", fontFamily: "monospace", fontSize: "11px", flexShrink: 0 }}>
                      IN: {ts.in}
                    </span>
                    <span style={{ color: "#666" }}>&rarr;</span>
                    <span style={{ color: accentColor, fontWeight: "600", fontFamily: "monospace", fontSize: "11px", flexShrink: 0 }}>
                      OUT: {ts.out}
                    </span>
                    {ts.note && <span style={{ color: "#888", fontSize: "11px" }}>({ts.note})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EDL — Edit Decision List */}
          {edl.length > 0 && (
            <div style={{ paddingLeft: "28px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase" }}>
                  Edit Decision List
                </div>
                <button
                  onClick={copyEdl}
                  style={{
                    background: edlCopied ? "#166534" : "#333",
                    border: `1px solid ${edlCopied ? "#22c55e" : "#555"}`,
                    borderRadius: "4px", padding: "3px 8px",
                    color: edlCopied ? "#22c55e" : "#ccc",
                    fontSize: "10px", fontWeight: "600", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "4px",
                  }}
                >
                  {edlCopied ? <><ClipboardCheck size={10} /> Copied</> : <><Copy size={10} /> Copy EDL</>}
                </button>
              </div>
              <div style={{
                background: "#0d0d0d", border: "1px solid #333",
                borderRadius: "6px", padding: "12px 14px",
                fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                fontSize: "11px", lineHeight: "1.8", color: "#d4d4d4",
                whiteSpace: "pre-wrap", overflowX: "auto",
              }}>
                {edl.map(e =>
                  `${String(e.step).padStart(2, "0")}. ${e.action} — ${e.segment}${e.pacing ? `  |  ${e.pacing}` : ""}`
                ).join("\n")}
              </div>
            </div>
          )}

          {/* B-Roll Directions */}
          {bRoll.length > 0 && (
            <div style={{ paddingLeft: "28px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <Video size={12} color="#06b6d4" />
                <span style={{ fontSize: "10px", fontWeight: "600", color: "#06b6d4", textTransform: "uppercase" }}>
                  B-Roll Directions
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {bRoll.map((br, i) => (
                  <div key={i} style={{
                    background: "#1a1a1a", border: "1px solid #2a2a2a",
                    borderRadius: "6px", padding: "8px 12px",
                  }}>
                    <div style={{ fontSize: "10px", fontWeight: "600", color: "#06b6d4", marginBottom: "3px" }}>
                      {br.segment}
                    </div>
                    <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.5" }}>
                      {br.direction}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Motion Graphics / Text Overlays */}
          {motionGraphics.length > 0 && (
            <div style={{ paddingLeft: "28px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <Type size={12} color="#a78bfa" />
                <span style={{ fontSize: "10px", fontWeight: "600", color: "#a78bfa", textTransform: "uppercase" }}>
                  Motion Graphics / Text Overlays
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {motionGraphics.map((mg, i) => (
                  <div key={i} style={{
                    background: "#1a1a1a", border: "1px solid #2a2a2a",
                    borderRadius: "6px", padding: "8px 12px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                      <span style={{
                        fontSize: "9px", fontWeight: "700", textTransform: "uppercase",
                        background: "#a78bfa18", color: "#a78bfa",
                        borderRadius: "3px", padding: "1px 6px",
                      }}>
                        {MOTION_GRAPHIC_LABELS[mg.type] || mg.type}
                      </span>
                      <span style={{ fontSize: "10px", color: "#888" }}>{mg.timecode_ref}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#e0e0e0", marginBottom: "2px" }}>
                      {mg.content}
                    </div>
                    {mg.purpose && (
                      <div style={{ fontSize: "11px", color: "#888", fontStyle: "italic" }}>
                        {mg.purpose}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA (short-form) */}
          {(dir.cta || meta.cta || dir.suggested_cta) && (
            <div style={{ paddingLeft: "28px", fontSize: "12px", color: "#ec4899" }}>
              CTA: {dir.cta || meta.cta || dir.suggested_cta}
            </div>
          )}

          {/* Rationale */}
          {dir.rationale && (
            <div style={{ paddingLeft: "28px", fontSize: "11px", color: "#888", lineHeight: "1.5" }}>
              {dir.rationale}
            </div>
          )}

          {/* Create Brief button */}
          <div style={{ paddingLeft: "28px" }}>
            <button
              onClick={() => dir._savedId && onCreateBrief(dir._savedId)}
              disabled={!dir._savedId || dir._briefCreated || briefCreating === dir._savedId}
              style={{
                background: dir._briefCreated ? "#166534" : "#374151",
                border: `1px solid ${dir._briefCreated ? "#22c55e" : "#555"}`,
                borderRadius: "6px", padding: "6px 14px",
                color: "#fff", fontSize: "11px", fontWeight: "600",
                cursor: !dir._savedId || dir._briefCreated ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: "6px",
                opacity: dir._savedId ? 1 : 0.5,
              }}
            >
              {dir._briefCreated ? (
                <><Check size={12} /> Brief Created</>
              ) : briefCreating === dir._savedId ? (
                <><Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> Creating...</>
              ) : (
                <><Plus size={12} /> Create Brief</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Atomizer Component
// ============================================
export default function Atomizer({ activeClient }) {
  // Input state
  const [title, setTitle] = useState("");
  const [transcriptText, setTranscriptText] = useState("");

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("long_form");

  // Save state
  const [savedTranscriptId, setSavedTranscriptId] = useState(null);
  const [briefCreating, setBriefCreating] = useState(null);

  // Expansion
  const [expandedCards, setExpandedCards] = useState(new Set());

  // Selection state for remix
  const [selections, setSelections] = useState({});

  // Context inputs
  const [contextOpen, setContextOpen] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextInputs, setContextInputs] = useState({
    strategyBrief: "",
    performanceData: "",
    audiencePersona: "",
    competitorBenchmarks: "",
  });
  const [autoFilledKeys, setAutoFilledKeys] = useState(new Set());

  // Remix state
  const [remixOpen, setRemixOpen] = useState(false);
  const [remixFeedback, setRemixFeedback] = useState("");
  const [remixing, setRemixing] = useState(false);
  const [remixResult, setRemixResult] = useState(null);

  const wordCount = transcriptText.trim() ? transcriptText.trim().split(/\s+/).length : 0;

  const contextFilledCount = useMemo(() =>
    Object.values(contextInputs).filter(v => v.trim()).length,
    [contextInputs]
  );

  const updateContext = useCallback((key, value) => {
    setContextInputs(prev => ({ ...prev, [key]: value }));
    // Mark as no longer auto-filled once user edits
    setAutoFilledKeys(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Auto-populate context fields from existing data sources
  useEffect(() => {
    if (!activeClient?.id) return;
    let cancelled = false;
    setContextLoading(true);

    fetchAtomizerContext(activeClient.id, activeClient.id)
      .then(fetched => {
        if (cancelled) return;
        const filled = new Set();
        const newInputs = {};
        for (const key of ['strategyBrief', 'performanceData', 'audiencePersona', 'competitorBenchmarks']) {
          if (fetched[key]) {
            newInputs[key] = fetched[key];
            filled.add(key);
          } else {
            newInputs[key] = '';
          }
        }
        setContextInputs(newInputs);
        setAutoFilledKeys(filled);
        if (filled.size > 0) setContextOpen(true);
      })
      .catch(err => console.warn('[atomizer] Context auto-fetch failed:', err.message))
      .finally(() => { if (!cancelled) setContextLoading(false); });

    return () => { cancelled = true; };
  }, [activeClient?.id]);

  // Cost estimates
  const estimatedInputTokens = 2800 + Math.ceil(wordCount / 0.75);
  const estimatedCostAnalysis = wordCount > 0
    ? Math.max(0.02, (estimatedInputTokens / 1000000) * 3.00 + (8192 / 1000000) * 15.00).toFixed(2)
    : "0.00";

  // Detect V2 vs legacy results
  const isV2 = results && (results.long_form_directions || results.short_form_directions);
  const isLegacy = results && !isV2 && (results.clips || results.shorts || results.quotes);

  const tabCounts = useMemo(() => {
    if (!results) return { long_form: 0, short_form: 0, clips: 0, shorts: 0, quotes: 0 };
    return {
      long_form: (results.long_form_directions || []).length,
      short_form: (results.short_form_directions || []).length,
      clips: (results.clips || []).length,
      shorts: (results.shorts || []).length,
      quotes: (results.quotes || []).length,
    };
  }, [results]);

  const selectedCount = useMemo(() =>
    Object.values(selections).reduce((sum, sel) => sum + sel.elements.size, 0),
    [selections]
  );

  // Current tab's directions
  const currentDirections = useMemo(() => {
    if (!results) return [];
    if (activeTab === "long_form") return results.long_form_directions || [];
    if (activeTab === "short_form") return results.short_form_directions || [];
    return [];
  }, [results, activeTab]);

  // ============================================
  // Handlers
  // ============================================

  const toggleCardExpanded = useCallback((dirKey) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(dirKey)) next.delete(dirKey);
      else next.add(dirKey);
      return next;
    });
  }, []);

  const toggleElement = useCallback((dirKey, elementKey, direction) => {
    setSelections(prev => {
      const existing = prev[dirKey] || { direction, elements: new Set() };
      const newElements = new Set(existing.elements);
      if (newElements.has(elementKey)) newElements.delete(elementKey);
      else newElements.add(elementKey);

      if (newElements.size === 0) {
        const { [dirKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [dirKey]: { ...existing, direction, elements: newElements } };
    });
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!transcriptText.trim()) {
      setError("Please paste a transcript to analyze.");
      return;
    }

    setAnalyzing(true);
    setError("");
    setResults(null);
    setSelections({});
    setExpandedCards(new Set());
    setRemixResult(null);

    try {
      const data = await analyzeTranscript(
        transcriptText,
        title || "Untitled",
        activeClient?.id,
        { contextInputs },
      );
      setResults(data);
      setActiveTab(data.long_form_directions?.length ? "long_form" : "short_form");

      // Auto-save to Supabase
      try {
        const saved = await saveTranscript({
          title: title || "Untitled",
          text: transcriptText,
          sourceType: "paste",
          clientId: activeClient?.id,
        });
        setSavedTranscriptId(saved.id);
        await markTranscriptAnalyzed(saved.id);

        const savedItems = await saveAtomizedContent(saved.id, data, activeClient?.id);

        // Attach _savedId to results for brief creation
        if (savedItems?.length) {
          setResults(prev => {
            if (!prev) return prev;
            let longIdx = 0, shortIdx = 0;
            const tagIds = (items, type) => items?.map((item, i) => {
              const match = savedItems.find(s =>
                s.content_type === type && s.title === item.title
              );
              return match ? { ...item, _savedId: match.id } : item;
            });
            return {
              ...prev,
              long_form_directions: tagIds(prev.long_form_directions, "long_form_direction"),
              short_form_directions: tagIds(prev.short_form_directions, "short_form_direction"),
              clips: tagIds(prev.clips, "clip"),
              shorts: tagIds(prev.shorts, "short"),
              quotes: tagIds(prev.quotes, "quote"),
            };
          });
        }
      } catch (saveErr) {
        console.warn("Failed to save to database:", saveErr);
      }
    } catch (err) {
      setError(err.message || "Analysis failed. Check your Claude API key in Settings.");
    } finally {
      setAnalyzing(false);
    }
  }, [transcriptText, title, activeClient, contextInputs]);

  const handleCreateBrief = useCallback(async (atomizedContentId) => {
    setBriefCreating(atomizedContentId);
    try {
      await createBriefFromAtomized(atomizedContentId, activeClient?.id);
      setResults(prev => {
        if (!prev) return prev;
        const markCreated = (items) => items?.map(item =>
          item._savedId === atomizedContentId ? { ...item, _briefCreated: true } : item
        );
        return {
          ...prev,
          long_form_directions: markCreated(prev.long_form_directions),
          short_form_directions: markCreated(prev.short_form_directions),
          clips: markCreated(prev.clips),
          shorts: markCreated(prev.shorts),
          quotes: markCreated(prev.quotes),
        };
      });
    } catch (err) {
      setError("Failed to create brief: " + err.message);
    } finally {
      setBriefCreating(null);
    }
  }, [activeClient]);

  const handleRemix = useCallback(async () => {
    setRemixing(true);
    setError("");
    try {
      const selectedArr = Object.entries(selections).map(([key, sel]) => ({
        directionId: sel.direction?._savedId || key,
        direction: sel.direction,
        elements: Array.from(sel.elements),
      }));
      const result = await remixDirections(selectedArr, remixFeedback, activeClient?.id);
      setRemixResult(result);

      // Auto-save as brief
      try {
        await saveRemixAsBrief(result, selectedArr, activeClient?.id);
      } catch (saveErr) {
        console.warn("Failed to save remix brief:", saveErr);
      }

      setRemixOpen(false);
    } catch (err) {
      setError("Remix failed: " + err.message);
    } finally {
      setRemixing(false);
    }
  }, [selections, remixFeedback, activeClient]);

  // ============================================
  // Render
  // ============================================

  return (
    <div style={{ padding: "0" }}>
      {/* Header */}
      <div style={{
        background: "#1E1E1E", border: "1px solid #333",
        borderRadius: "8px", padding: "24px", marginBottom: "24px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <Zap size={20} color="#f59e0b" />
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff" }}>
            Content Atomizer
          </div>
        </div>
        <div style={{ fontSize: "12px", color: "#888" }}>
          Paste a transcript to generate edit directions with hooks, titles, descriptions, and thumbnail suggestions
        </div>
      </div>

      {/* Input Section */}
      <div style={{
        background: "#1E1E1E", border: "1px solid #333",
        borderRadius: "8px", padding: "24px", marginBottom: "24px"
      }}>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "12px", fontWeight: "600", color: "#b0b0b0", display: "block", marginBottom: "6px" }}>
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Episode title or video name"
            style={{
              width: "100%", background: "#252525", border: "1px solid #444",
              borderRadius: "8px", padding: "10px 14px", color: "#fff",
              fontSize: "14px", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "#b0b0b0" }}>Transcript</label>
            <span style={{ fontSize: "11px", color: "#666" }}>{fmtInt(wordCount)} words</span>
          </div>
          <textarea
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            placeholder="Paste your transcript here..."
            rows={12}
            style={{
              width: "100%", background: "#252525", border: "1px solid #444",
              borderRadius: "8px", padding: "12px 14px", color: "#e0e0e0",
              fontSize: "13px", lineHeight: "1.6", resize: "vertical",
              outline: "none", fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Context Inputs (Collapsible, Auto-populated) */}
        <div style={{
          background: "#1a1a1a", border: `1px solid ${contextFilledCount > 0 ? "#3b82f644" : "#333"}`,
          borderRadius: "8px", marginBottom: "16px", overflow: "hidden",
        }}>
          <button
            onClick={() => setContextOpen(prev => !prev)}
            style={{
              width: "100%", background: "transparent", border: "none",
              padding: "12px 14px", cursor: "pointer", textAlign: "left",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Layers size={14} color="#888" />
              <span style={{ fontSize: "12px", fontWeight: "600", color: "#b0b0b0" }}>
                Context Inputs
              </span>
              {contextLoading && (
                <Loader size={12} color="#3b82f6" style={{ animation: "spin 1s linear infinite" }} />
              )}
              {!contextLoading && contextFilledCount > 0 && (
                <span style={{
                  fontSize: "10px", fontWeight: "700", background: autoFilledKeys.size > 0 ? "#16a34a22" : "#3b82f622",
                  color: autoFilledKeys.size > 0 ? "#22c55e" : "#3b82f6", borderRadius: "10px", padding: "2px 8px",
                }}>
                  {contextFilledCount}/4 {autoFilledKeys.size > 0 ? "auto-filled" : "filled"}
                </span>
              )}
            </div>
            {contextOpen ? <ChevronUp size={14} color="#888" /> : <ChevronDown size={14} color="#888" />}
          </button>

          {contextOpen && (
            <div style={{ padding: "0 14px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[
                { key: "strategyBrief", label: "Strategy Brief", icon: Target, placeholder: "Channel goals, content pillars, target outcomes, key messaging priorities..." },
                { key: "performanceData", label: "Performance Data", icon: BarChart3, placeholder: "Top performing videos, avg view duration, CTR benchmarks, what's worked and what hasn't..." },
                { key: "audiencePersona", label: "Audience Persona", icon: Users, placeholder: "Who the viewer is, what they care about, pain points, desired transformation..." },
                { key: "competitorBenchmarks", label: "Competitor Benchmarks", icon: Swords, placeholder: "What formats, hooks, and topics are performing in this space..." },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <f.icon size={12} color={contextInputs[f.key].trim() ? "#3b82f6" : "#666"} />
                    <label style={{ fontSize: "11px", fontWeight: "600", color: contextInputs[f.key].trim() ? "#b0b0b0" : "#666" }}>
                      {f.label}
                    </label>
                    {autoFilledKeys.has(f.key) && (
                      <span style={{ fontSize: "9px", fontWeight: "600", color: "#22c55e", background: "#16a34a22", borderRadius: "6px", padding: "1px 6px" }}>
                        Auto-filled
                      </span>
                    )}
                  </div>
                  <textarea
                    value={contextInputs[f.key]}
                    onChange={(e) => updateContext(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    rows={4}
                    style={{
                      width: "100%", background: "#252525",
                      border: `1px solid ${autoFilledKeys.has(f.key) ? "#16a34a44" : contextInputs[f.key].trim() ? "#3b82f644" : "#333"}`,
                      borderRadius: "6px", padding: "8px 10px", color: "#e0e0e0",
                      fontSize: "12px", lineHeight: "1.5", resize: "vertical",
                      outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "11px", color: "#666" }}>
            Est. ~${estimatedCostAnalysis} analysis{selectedCount > 0 ? " + ~$0.06 remix" : ""}
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !transcriptText.trim()}
            style={{
              background: analyzing ? "#374151" : "#3b82f6",
              border: "none", borderRadius: "8px", padding: "10px 24px",
              color: "#fff", fontSize: "14px", fontWeight: "600",
              cursor: analyzing || !transcriptText.trim() ? "not-allowed" : "pointer",
              opacity: analyzing || !transcriptText.trim() ? 0.6 : 1,
              display: "flex", alignItems: "center", gap: "8px",
            }}
          >
            {analyzing ? (
              <><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> Analyzing...</>
            ) : (
              <><Scissors size={16} /> Atomize Transcript</>
            )}
          </button>
        </div>

        {error && (
          <div style={{
            background: "#2d1b1b", border: "1px solid #7f1d1d",
            borderRadius: "8px", padding: "12px", color: "#fca5a5",
            fontSize: "13px", marginTop: "16px"
          }}>
            {error}
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* V2 RESULTS — Edit Directions                */}
      {/* ============================================ */}
      {isV2 && (
        <>
          {/* Summary Bar */}
          <div style={{
            background: "#1E1E1E", border: "1px solid #333",
            borderRadius: "8px", padding: "16px 24px", marginBottom: "24px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ display: "flex", gap: "24px", fontSize: "13px" }}>
              <span style={{ color: "#b0b0b0" }}>
                <span style={{ color: "#fff", fontWeight: "600" }}>
                  {results.total_directions || (tabCounts.long_form + tabCounts.short_form)}
                </span> directions
              </span>
              <span style={{ color: "#b0b0b0" }}>
                <span style={{ color: "#3b82f6", fontWeight: "600" }}>{tabCounts.long_form}</span> long-form
              </span>
              <span style={{ color: "#b0b0b0" }}>
                <span style={{ color: "#ec4899", fontWeight: "600" }}>{tabCounts.short_form}</span> short-form
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "#666" }}>
              Cost: ${results.cost?.toFixed(4) || "0.00"}
            </div>
          </div>

          {/* Summary */}
          {results.summary && (
            <div style={{
              background: "#1E1E1E", border: "1px solid #333",
              borderRadius: "8px", padding: "20px 24px", marginBottom: "24px"
            }}>
              <div style={{ fontSize: "11px", fontWeight: "600", color: "#3b82f6", textTransform: "uppercase", marginBottom: "8px" }}>
                Editorial Strategy
              </div>
              <div style={{ fontSize: "13px", color: "#e0e0e0", lineHeight: "1.7" }}>
                {results.summary}
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div style={{ display: "flex", gap: "2px", marginBottom: "2px" }}>
            {[
              { id: "long_form", label: "Long-Form", icon: Film, count: tabCounts.long_form, color: "#3b82f6" },
              { id: "short_form", label: "Short-Form", icon: Smartphone, count: tabCounts.short_form, color: "#ec4899" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  flex: 1,
                  background: activeTab === t.id ? "#1E1E1E" : "#161616",
                  border: activeTab === t.id ? "1px solid #333" : "1px solid transparent",
                  borderBottom: activeTab === t.id ? "none" : "1px solid #333",
                  borderRadius: "8px 8px 0 0", padding: "12px",
                  color: activeTab === t.id ? "#fff" : "#888",
                  fontSize: "13px", fontWeight: "600", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                }}
              >
                <t.icon size={14} color={activeTab === t.id ? t.color : "#888"} />
                {t.label}
                <span style={{
                  background: activeTab === t.id ? t.color + "22" : "#333",
                  color: activeTab === t.id ? t.color : "#888",
                  borderRadius: "10px", padding: "2px 8px",
                  fontSize: "11px", fontWeight: "700",
                }}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Tab Content — Direction Cards */}
          <div style={{
            background: "#1E1E1E", border: "1px solid #333", borderTop: "none",
            borderRadius: "0 0 12px 12px", padding: "20px 24px", marginBottom: "24px",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {currentDirections.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px", color: "#666", fontSize: "13px" }}>
                  No {activeTab === "long_form" ? "long-form" : "short-form"} directions found.
                </div>
              ) : currentDirections.map((dir, idx) => {
                const dirKey = `${activeTab}_${idx}`;
                return (
                  <DirectionCard
                    key={dirKey}
                    dir={dir}
                    dirKey={dirKey}
                    isLongForm={activeTab === "long_form"}
                    expanded={expandedCards.has(dirKey)}
                    onToggleExpand={toggleCardExpanded}
                    selectedElements={selections[dirKey]?.elements || new Set()}
                    onToggleElement={toggleElement}
                    onCreateBrief={handleCreateBrief}
                    briefCreating={briefCreating}
                    accentColor={activeTab === "long_form" ? "#3b82f6" : "#ec4899"}
                  />
                );
              })}
            </div>
          </div>

          {/* Remix Bar — appears when elements are selected */}
          {selectedCount > 0 && (
            <div style={{
              position: "sticky", bottom: "16px", zIndex: 10,
              background: "#1a1a2e", border: "1px solid #8b5cf6",
              borderRadius: "12px", padding: "14px 20px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              boxShadow: "0 -4px 20px rgba(139, 92, 246, 0.15)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Shuffle size={16} color="#8b5cf6" />
                <span style={{ fontSize: "13px", color: "#e0e0e0" }}>
                  <span style={{ fontWeight: "700", color: "#8b5cf6" }}>{selectedCount}</span> elements selected
                  {" from "}
                  <span style={{ fontWeight: "700", color: "#8b5cf6" }}>{Object.keys(selections).length}</span> directions
                </span>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={() => setSelections({})}
                  style={{
                    background: "transparent", border: "1px solid #555",
                    borderRadius: "8px", padding: "8px 14px", color: "#999",
                    fontSize: "12px", cursor: "pointer",
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={() => { setRemixOpen(true); setRemixResult(null); }}
                  style={{
                    background: "#8b5cf6", border: "none", borderRadius: "8px",
                    padding: "8px 20px", color: "#fff", fontSize: "13px",
                    fontWeight: "600", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "6px",
                  }}
                >
                  <Shuffle size={14} /> Remix Selected
                </button>
              </div>
            </div>
          )}

          {/* Remix Modal */}
          {remixOpen && (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
              zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
              padding: "24px",
            }}
              onClick={(e) => { if (e.target === e.currentTarget) setRemixOpen(false); }}
            >
              <div style={{
                background: "#1E1E1E", border: "1px solid #444",
                borderRadius: "12px", padding: "28px", width: "100%",
                maxWidth: "640px", maxHeight: "80vh", overflowY: "auto",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Shuffle size={20} color="#8b5cf6" />
                    <span style={{ fontSize: "18px", fontWeight: "700", color: "#fff" }}>Remix Directions</span>
                  </div>
                  <button
                    onClick={() => setRemixOpen(false)}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px" }}
                  >
                    <X size={20} color="#888" />
                  </button>
                </div>

                {/* Selected elements summary */}
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: "8px" }}>
                    Selected Elements
                  </div>
                  {Object.entries(selections).map(([key, sel]) => (
                    <div key={key} style={{
                      background: "#252525", borderRadius: "6px",
                      padding: "10px 12px", marginBottom: "6px",
                    }}>
                      <div style={{ fontSize: "12px", fontWeight: "600", color: "#e0e0e0", marginBottom: "4px" }}>
                        {sel.direction?.title || key}
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {Array.from(sel.elements).map(el => (
                          <span key={el} style={{
                            fontSize: "10px", background: "#8b5cf622", color: "#8b5cf6",
                            borderRadius: "4px", padding: "2px 8px", fontWeight: "600",
                          }}>
                            {el.startsWith("title_")
                              ? `Title: ${sel.direction?.title_variations?.[parseInt(el.split("_")[1])]?.text?.slice(0, 30) || el}`
                              : el}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Feedback textarea */}
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#b0b0b0", display: "block", marginBottom: "6px" }}>
                    Feedback / Instructions (optional)
                  </label>
                  <textarea
                    value={remixFeedback}
                    onChange={(e) => setRemixFeedback(e.target.value)}
                    placeholder="Adjust tone, combine differently, add constraints, specify the target audience..."
                    rows={4}
                    style={{
                      width: "100%", background: "#252525", border: "1px solid #444",
                      borderRadius: "8px", padding: "12px 14px", color: "#e0e0e0",
                      fontSize: "13px", lineHeight: "1.6", resize: "vertical",
                      outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "11px", color: "#666" }}>
                    Est. ~$0.06 for remix
                  </div>
                  <button
                    onClick={handleRemix}
                    disabled={remixing}
                    style={{
                      background: remixing ? "#374151" : "#8b5cf6",
                      border: "none", borderRadius: "8px", padding: "10px 24px",
                      color: "#fff", fontSize: "14px", fontWeight: "600",
                      cursor: remixing ? "not-allowed" : "pointer",
                      opacity: remixing ? 0.6 : 1,
                      display: "flex", alignItems: "center", gap: "8px",
                    }}
                  >
                    {remixing ? (
                      <><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> Synthesizing...</>
                    ) : (
                      <><Shuffle size={16} /> Generate Final Brief</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Remix Result */}
          {remixResult && (
            <div style={{
              background: "#1E1E1E", border: "1px solid #8b5cf6",
              borderRadius: "12px", padding: "24px", marginBottom: "24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <Shuffle size={18} color="#8b5cf6" />
                <span style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>
                  Remixed Brief
                </span>
                <span style={{
                  fontSize: "10px", fontWeight: "600", background: "#166534",
                  color: "#22c55e", borderRadius: "4px", padding: "2px 8px",
                }}>
                  Saved to Briefs
                </span>
              </div>

              {/* Title */}
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "16px" }}>
                {remixResult.title}
              </div>

              {/* Hook */}
              {remixResult.hook && (
                <div style={{
                  background: "#1a1a1a", borderLeft: "3px solid #8b5cf6",
                  borderRadius: "4px", padding: "10px 12px", marginBottom: "14px",
                }}>
                  <div style={{ fontSize: "10px", fontWeight: "600", color: "#8b5cf6", textTransform: "uppercase", marginBottom: "4px" }}>
                    Hook
                  </div>
                  <div style={{ fontSize: "13px", color: "#e0e0e0", fontStyle: "italic", lineHeight: "1.6" }}>
                    "{remixResult.hook}"
                  </div>
                </div>
              )}

              {/* Arc */}
              {remixResult.arc && (
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: "4px" }}>
                    Narrative Arc
                  </div>
                  <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6" }}>
                    {remixResult.arc}
                  </div>
                </div>
              )}

              {/* Description */}
              {remixResult.description && (
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: "4px" }}>
                    Description
                  </div>
                  <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6", whiteSpace: "pre-line" }}>
                    {remixResult.description}
                  </div>
                </div>
              )}

              {/* Thumbnail */}
              {remixResult.thumbnail?.concept && (
                <div style={{
                  background: "#1a1a1a", borderRadius: "6px",
                  padding: "10px 12px", border: "1px solid #333", marginBottom: "14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <Image size={12} color="#f59e0b" />
                    <span style={{ fontSize: "10px", fontWeight: "600", color: "#f59e0b", textTransform: "uppercase" }}>
                      Thumbnail
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#e0e0e0", marginBottom: "4px" }}>
                    {remixResult.thumbnail.concept}
                  </div>
                  {remixResult.thumbnail.transcript_reference && (
                    <div style={{ fontSize: "11px", color: "#888", fontStyle: "italic" }}>
                      Reference: {remixResult.thumbnail.transcript_reference}
                    </div>
                  )}
                </div>
              )}

              {/* CTA */}
              {remixResult.cta && (
                <div style={{ fontSize: "12px", color: "#ec4899", marginBottom: "14px" }}>
                  CTA: {remixResult.cta}
                </div>
              )}

              {/* Editor Notes */}
              {remixResult.editor_notes && (
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: "4px" }}>
                    Editor Notes
                  </div>
                  <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6" }}>
                    {remixResult.editor_notes}
                  </div>
                </div>
              )}

              {/* Rationale */}
              {remixResult.rationale && (
                <div style={{ fontSize: "11px", color: "#888", lineHeight: "1.5", borderTop: "1px solid #333", paddingTop: "12px" }}>
                  {remixResult.rationale}
                </div>
              )}

              {/* Cost */}
              <div style={{ fontSize: "11px", color: "#666", marginTop: "12px" }}>
                Remix cost: ${remixResult.cost?.toFixed(4) || "—"}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================================ */}
      {/* LEGACY RESULTS — Clips / Shorts / Quotes    */}
      {/* ============================================ */}
      {isLegacy && (
        <>
          <div style={{
            background: "#1E1E1E", border: "1px solid #333",
            borderRadius: "8px", padding: "16px 24px", marginBottom: "24px",
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <div style={{ display: "flex", gap: "24px", fontSize: "13px" }}>
              <span style={{ color: "#b0b0b0" }}>
                <span style={{ color: "#fff", fontWeight: "600" }}>{results.totalAtomizedPieces || (tabCounts.clips + tabCounts.shorts + tabCounts.quotes)}</span> pieces extracted
              </span>
              <span style={{ color: "#b0b0b0" }}>
                <span style={{ color: "#3b82f6", fontWeight: "600" }}>{tabCounts.clips}</span> clips
              </span>
              <span style={{ color: "#b0b0b0" }}>
                <span style={{ color: "#ec4899", fontWeight: "600" }}>{tabCounts.shorts}</span> shorts
              </span>
              <span style={{ color: "#b0b0b0" }}>
                <span style={{ color: "#f59e0b", fontWeight: "600" }}>{tabCounts.quotes}</span> quotes
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "#666" }}>
              Cost: ${results.cost?.toFixed(4) || "0.00"}
            </div>
          </div>

          {results.summary && (
            <div style={{
              background: "#1E1E1E", border: "1px solid #333",
              borderRadius: "8px", padding: "20px 24px", marginBottom: "24px"
            }}>
              <div style={{ fontSize: "11px", fontWeight: "600", color: "#3b82f6", textTransform: "uppercase", marginBottom: "8px" }}>Summary</div>
              <div style={{ fontSize: "13px", color: "#e0e0e0", lineHeight: "1.7" }}>{results.summary}</div>
            </div>
          )}

          <div style={{ display: "flex", gap: "2px", marginBottom: "2px" }}>
            {[
              { id: "clips", label: "Clips", icon: FileText, count: tabCounts.clips, color: "#3b82f6" },
              { id: "shorts", label: "Shorts", icon: Scissors, count: tabCounts.shorts, color: "#ec4899" },
              { id: "quotes", label: "Quotes", icon: MessageSquare, count: tabCounts.quotes, color: "#f59e0b" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  flex: 1, background: activeTab === t.id ? "#1E1E1E" : "#161616",
                  border: activeTab === t.id ? "1px solid #333" : "1px solid transparent",
                  borderBottom: activeTab === t.id ? "none" : "1px solid #333",
                  borderRadius: "8px 8px 0 0", padding: "12px",
                  color: activeTab === t.id ? "#fff" : "#888",
                  fontSize: "13px", fontWeight: "600", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                }}
              >
                <t.icon size={14} color={activeTab === t.id ? t.color : "#888"} />
                {t.label}
                <span style={{
                  background: activeTab === t.id ? t.color + "22" : "#333",
                  color: activeTab === t.id ? t.color : "#888",
                  borderRadius: "10px", padding: "2px 8px", fontSize: "11px", fontWeight: "700",
                }}>{t.count}</span>
              </button>
            ))}
          </div>

          <div style={{
            background: "#1E1E1E", border: "1px solid #333", borderTop: "none",
            borderRadius: "0 0 12px 12px", padding: "20px 24px", marginBottom: "24px"
          }}>
            {activeTab === "clips" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {(results.clips || []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px", color: "#666", fontSize: "13px" }}>No clips extracted.</div>
                ) : (results.clips || []).map((clip, idx) => {
                  const sc = scoreColor(clip.viralityScore);
                  return (
                    <div key={idx} style={{ background: "#252525", border: "1px solid #333", borderRadius: "8px", padding: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "4px" }}>{clip.title}</div>
                          <div style={{ fontSize: "11px", color: "#888" }}>{clip.startTimecode} - {clip.endTimecode}</div>
                        </div>
                        <div style={{ background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: "6px", padding: "4px 10px", textAlign: "center", flexShrink: 0, marginLeft: "12px" }}>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: sc.text }}>{clip.viralityScore}</div>
                          <div style={{ fontSize: "8px", color: "#888" }}>VIRAL</div>
                        </div>
                      </div>
                      {clip.hook && (
                        <div style={{ background: "#1a1a1a", borderLeft: "3px solid #3b82f6", borderRadius: "4px", padding: "8px 12px", marginBottom: "10px", fontSize: "12px", color: "#e0e0e0", fontStyle: "italic" }}>
                          Hook: {clip.hook}
                        </div>
                      )}
                      {clip.transcript_excerpt && (
                        <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6", marginBottom: "10px" }}>{clip.transcript_excerpt}</div>
                      )}
                      <div style={{ fontSize: "11px", color: "#888", marginBottom: "12px" }}>{clip.rationale}</div>
                      <button
                        onClick={() => clip._savedId && handleCreateBrief(clip._savedId)}
                        disabled={!clip._savedId || clip._briefCreated || briefCreating === clip._savedId}
                        style={{
                          background: clip._briefCreated ? "#166534" : "#374151",
                          border: `1px solid ${clip._briefCreated ? "#22c55e" : "#555"}`,
                          borderRadius: "6px", padding: "6px 14px", color: "#fff",
                          fontSize: "11px", fontWeight: "600",
                          cursor: !clip._savedId || clip._briefCreated ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", gap: "6px", opacity: clip._savedId ? 1 : 0.5,
                        }}
                      >
                        {clip._briefCreated ? <><Check size={12} /> Brief Created</> : briefCreating === clip._savedId ? <><Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> Creating...</> : <><Plus size={12} /> Create Brief</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "shorts" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {(results.shorts || []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px", color: "#666", fontSize: "13px" }}>No shorts extracted.</div>
                ) : (results.shorts || []).map((short, idx) => {
                  const sc = scoreColor(short.viralityScore);
                  return (
                    <div key={idx} style={{ background: "#252525", border: "1px solid #333", borderRadius: "8px", padding: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "4px" }}>{short.title}</div>
                          <div style={{ fontSize: "11px", color: "#888" }}>~{short.timecode}</div>
                        </div>
                        <div style={{ background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: "6px", padding: "4px 10px", textAlign: "center", flexShrink: 0, marginLeft: "12px" }}>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: sc.text }}>{short.viralityScore}</div>
                          <div style={{ fontSize: "8px", color: "#888" }}>VIRAL</div>
                        </div>
                      </div>
                      {short.hook && (
                        <div style={{ background: "#1a1a1a", borderLeft: "3px solid #ec4899", borderRadius: "4px", padding: "8px 12px", marginBottom: "10px", fontSize: "12px", color: "#e0e0e0", fontStyle: "italic" }}>
                          Hook: {short.hook}
                        </div>
                      )}
                      {short.transcript_excerpt && (
                        <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6", marginBottom: "10px" }}>{short.transcript_excerpt}</div>
                      )}
                      <div style={{ fontSize: "11px", color: "#888", marginBottom: "8px" }}>{short.rationale}</div>
                      {short.suggestedCTA && <div style={{ fontSize: "11px", color: "#ec4899", marginBottom: "12px" }}>CTA: {short.suggestedCTA}</div>}
                      <button
                        onClick={() => short._savedId && handleCreateBrief(short._savedId)}
                        disabled={!short._savedId || short._briefCreated || briefCreating === short._savedId}
                        style={{
                          background: short._briefCreated ? "#166534" : "#374151",
                          border: `1px solid ${short._briefCreated ? "#22c55e" : "#555"}`,
                          borderRadius: "6px", padding: "6px 14px", color: "#fff",
                          fontSize: "11px", fontWeight: "600",
                          cursor: !short._savedId || short._briefCreated ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", gap: "6px", opacity: short._savedId ? 1 : 0.5,
                        }}
                      >
                        {short._briefCreated ? <><Check size={12} /> Brief Created</> : briefCreating === short._savedId ? <><Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> Creating...</> : <><Plus size={12} /> Create Brief</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "quotes" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {(results.quotes || []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px", color: "#666", fontSize: "13px" }}>No quotes extracted.</div>
                ) : (results.quotes || []).map((quote, idx) => {
                  const sc = scoreColor(quote.viralityScore);
                  return (
                    <div key={idx} style={{ background: "#252525", border: "1px solid #333", borderRadius: "8px", padding: "16px", display: "flex", gap: "14px", alignItems: "flex-start" }}>
                      <div style={{ background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: "6px", padding: "4px 10px", textAlign: "center", flexShrink: 0 }}>
                        <div style={{ fontSize: "14px", fontWeight: "700", color: sc.text }}>{quote.viralityScore}</div>
                        <div style={{ fontSize: "8px", color: "#888" }}>VIRAL</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "15px", fontWeight: "600", color: "#fff", fontStyle: "italic", lineHeight: "1.5", marginBottom: "8px" }}>"{quote.text}"</div>
                        {quote.timecode && <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px" }}>~{quote.timecode}</div>}
                        {quote.suggestedVisual && <div style={{ fontSize: "11px", color: "#f59e0b" }}>Visual: {quote.suggestedVisual}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
