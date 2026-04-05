import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Zap, FileText, Scissors, MessageSquare, Loader,
  ChevronDown, ChevronUp, Check, Plus, Shuffle,
  Film, Smartphone, AlignLeft, X,
  Target, BarChart3, Users, Swords, GitBranch,
} from "lucide-react";
import {
  generateStrategy, saveTranscript, markTranscriptAnalyzed,
  saveAtomizedContent, createBriefFromAtomized,
  remixDirections, saveRemixAsBrief, fetchAtomizerContext,
  getAtomizedContent,
  deployDirection, updateAtomizedContentWithProduction,
  generateRecut, updateAtomizedContentWithRecut,
  getChannelContentType, updateChannelContentType,
} from "../../services/atomizerService";
import { getChannels } from "../../services/competitorDatabase";
import AtomizerHistory from "./AtomizerHistory";
import BeatMapPanel, { THREAD_COLORS } from "./BeatMapPanel";
import ContentTypeConfirmBanner from "./ContentTypeConfirmBanner";
import DirectionCard from "./DirectionCard";
import DirectionLanes from "./DirectionLanes";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

// ============================================
// Main Atomizer Component
// ============================================
export default function Atomizer({ activeClient }) {
  // Input state
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [transcriptText, setTranscriptText] = useState("");

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("long_form");

  // Save state
  const [savedTranscriptId, setSavedTranscriptId] = useState(null);
  const [briefCreating, setBriefCreating] = useState(null);

  // History & channel state
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [clientChannels, setClientChannels] = useState([]);
  const [channelFilter, setChannelFilter] = useState(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Content type state (persists per channel)
  const [channelContentType, setChannelContentType] = useState(null);
  const [detectedContentType, setDetectedContentType] = useState(null);
  const [detectedConfidence, setDetectedConfidence] = useState(null);
  const [showContentTypeBanner, setShowContentTypeBanner] = useState(false);

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

  // Deploy state (Stage 2)
  const [deploying, setDeploying] = useState(null);        // _savedId being deployed
  const [deployedData, setDeployedData] = useState({});     // dirKey → Stage 2 data

  // V3.1: Beat analysis + thread state (Stages 0a/0b)
  const [beatAnalysis, setBeatAnalysis] = useState(null);
  const [stageCosts, setStageCosts] = useState(null);       // { segment, threads, strategy }
  const [structureOpen, setStructureOpen] = useState(false); // Collapsible structure panel

  // V3: Recut state (Stage 3)
  const [recutting, setRecutting] = useState(null);         // _savedId being recut
  const [recutData, setRecutData] = useState({});           // dirKey → recut data

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

  // Fetch client channels for channel picker
  useEffect(() => {
    if (!activeClient?.id) { setClientChannels([]); return; }
    getChannels({ clientId: activeClient.id, isCompetitor: false })
      .then(data => {
        const chs = data || [];
        setClientChannels(chs);
        if (chs.length === 1) setSelectedChannelId(chs[0].id);
      })
      .catch(err => console.warn('[atomizer] Failed to fetch channels:', err.message));
  }, [activeClient?.id]);

  // Fetch saved content type when channel changes
  useEffect(() => {
    if (!selectedChannelId) { setChannelContentType(null); return; }
    getChannelContentType(selectedChannelId)
      .then(type => setChannelContentType(type))
      .catch(() => setChannelContentType(null));
  }, [selectedChannelId]);

  // Cost estimates — Stages 0a (8192) + 0b (8192) + 1 (16384 output tokens)
  const estimatedInputTokens = 2800 + Math.ceil(wordCount / 0.75);
  const estimatedCostAnalysis = wordCount > 0
    ? Math.max(0.06, ((estimatedInputTokens * 3) / 1000000) * 3.00 + (32768 / 1000000) * 15.00).toFixed(2)
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
  const sortByScore = (dirs) => [...dirs].sort((a, b) => {
    const sa = a.subscores?.overall ?? a.virality_score ?? 0;
    const sb = b.subscores?.overall ?? b.virality_score ?? 0;
    return sb - sa;
  });

  const sortedLongForm = useMemo(
    () => results ? sortByScore(results.long_form_directions || []) : [],
    [results]
  );
  const sortedShortForm = useMemo(
    () => results ? sortByScore(results.short_form_directions || []) : [],
    [results]
  );

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
    setDeployedData({});
    setDeploying(null);
    setBeatAnalysis(null);
    setStageCosts(null);
    setRecutData({});
    setRecutting(null);

    try {
      const data = await generateStrategy(
        transcriptText,
        title || "Untitled",
        selectedChannelId || activeClient?.id,
        { contextInputs, contentTypeOverride: channelContentType },
      );
      setResults(data);

      // Store beat analysis and per-stage costs
      if (data.beat_analysis) {
        setBeatAnalysis(data.beat_analysis);

        // Show content type confirmation banner if channel doesn't have a saved type
        if (!channelContentType && selectedChannelId && data.beat_analysis.content_type) {
          setDetectedContentType(data.beat_analysis.content_type);
          setDetectedConfidence(data.beat_analysis.content_type_confidence);
          setShowContentTypeBanner(true);
        }
      }
      if (data.stage_costs) {
        setStageCosts(data.stage_costs);
      }

      // Default to Long-Form tab, open structure panel if beats found
      setActiveTab(data.long_form_directions?.length ? "long_form" : "short_form");
      if (data.beat_analysis?.beats?.length) {
        setStructureOpen(true);
      }

      // Auto-save to Supabase
      try {
        const saved = await saveTranscript({
          title: title || "Untitled",
          subtitle: subtitle || null,
          text: transcriptText,
          sourceType: "paste",
          clientId: activeClient?.id,
          channelId: selectedChannelId || null,
          contextSnapshot: contextInputs,
          analysisSummary: data.summary || null,
          beatAnalysis: data.beat_analysis || null,
        });
        setSavedTranscriptId(saved.id);
        await markTranscriptAnalyzed(saved.id);

        const savedItems = await saveAtomizedContent(saved.id, data, activeClient?.id, selectedChannelId);

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
        setHistoryRefreshKey(prev => prev + 1);
      } catch (saveErr) {
        console.warn("Failed to save to database:", saveErr);
      }
    } catch (err) {
      setError(err.message || "Analysis failed. Check your Claude API key in Settings.");
    } finally {
      setAnalyzing(false);
    }
  }, [transcriptText, title, activeClient, contextInputs, selectedChannelId]);

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

  const handleDeploy = useCallback(async (dirKey, direction) => {
    if (!direction._savedId) {
      setError("Cannot deploy — direction not saved yet.");
      return;
    }
    setDeploying(direction._savedId);
    setError("");
    try {
      const result = await deployDirection(
        direction,
        transcriptText,
        title || "Untitled",
        selectedChannelId || activeClient?.id,
        contextInputs,
      );

      // Save to database
      await updateAtomizedContentWithProduction(direction._savedId, result);

      // Store in local state for immediate rendering
      setDeployedData(prev => ({ ...prev, [dirKey]: result }));

      // Auto-expand the card
      setExpandedCards(prev => {
        const next = new Set(prev);
        next.add(dirKey);
        return next;
      });
    } catch (err) {
      setError("Deploy failed: " + err.message);
    } finally {
      setDeploying(null);
    }
  }, [transcriptText, title, selectedChannelId, activeClient, contextInputs]);

  // Stage 3: Generate recut for a deployed direction
  const handleRecut = useCallback(async (dirKey, direction) => {
    if (!direction._savedId || !beatAnalysis) {
      setError("Cannot generate recut — missing beat analysis or unsaved direction.");
      return;
    }
    setRecutting(direction._savedId);
    setError("");
    try {
      const result = await generateRecut(
        direction,
        beatAnalysis,
        transcriptText,
        title || "Untitled",
        selectedChannelId || activeClient?.id,
        contextInputs,
      );

      await updateAtomizedContentWithRecut(direction._savedId, result);
      setRecutData(prev => ({ ...prev, [dirKey]: result }));
    } catch (err) {
      setError("Recut generation failed: " + err.message);
    } finally {
      setRecutting(null);
    }
  }, [transcriptText, title, selectedChannelId, activeClient, contextInputs, beatAnalysis]);

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
        await saveRemixAsBrief(result, selectedArr, activeClient?.id, selectedChannelId);
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

  // Load a past transcript from history sidebar
  const handleLoadTranscript = useCallback(async (transcript) => {
    // 1. Restore input fields
    setTitle(transcript.title || "");
    setSubtitle(transcript.subtitle || "");
    setTranscriptText(transcript.transcript_text || "");
    setSavedTranscriptId(transcript.id);
    setSelectedChannelId(transcript.channel_id || null);
    setError("");

    // 2. Restore context snapshot if available
    if (transcript.context_snapshot) {
      setContextInputs({
        strategyBrief: transcript.context_snapshot.strategyBrief || "",
        performanceData: transcript.context_snapshot.performanceData || "",
        audiencePersona: transcript.context_snapshot.audiencePersona || "",
        competitorBenchmarks: transcript.context_snapshot.competitorBenchmarks || "",
      });
      setAutoFilledKeys(new Set());
      setContextOpen(true);
    }

    // 3. Reset remix/selection/deploy/recut state
    setSelections({});
    setExpandedCards(new Set());
    setRemixResult(null);
    setRemixOpen(false);
    setDeployedData({});
    setDeploying(null);
    setRecutData({});
    setRecutting(null);

    // Restore beat analysis if available (V3.1 thread data or V3 flat beats)
    setBeatAnalysis(transcript.beat_analysis || null);
    setStageCosts(null); // Per-stage costs not available for historical items

    // 4. Load atomized content and reconstruct results
    try {
      const atomized = await getAtomizedContent(transcript.id);
      if (atomized && atomized.length > 0) {
        const mapDirection = (a) => ({
          ...a,
          _savedId: a.id,
          _briefCreated: a.status === "brief_created",
          title_variations: a.title_variations || [],
          thumbnail_suggestion: a.thumbnail_suggestion || {},
          description: a.description_text,
          virality_score: a.virality_score,
          virality_rationale: a.direction_metadata?.virality_rationale || a.direction_metadata?.rationale,
          direction_metadata: a.direction_metadata || {},
          estimated_duration: a.direction_metadata?.estimated_duration,
          format_type: a.direction_metadata?.format_type,
          timestamps: a.direction_metadata?.timestamps || [],
          edl: a.direction_metadata?.edl || [],
          b_roll: a.direction_metadata?.b_roll || [],
          motion_graphics: a.direction_metadata?.motion_graphics || [],
          // Stage 2 fields
          edited_transcript: a.edited_transcript || a.direction_metadata?.edited_transcript,
          deployed_at: a.deployed_at || a.direction_metadata?.deployed_at,
          // V3.1: Beat/thread references
          thread_refs: a.direction_metadata?.thread_refs || null,
          beat_flow: a.direction_metadata?.beat_flow || null,
          beat_role_counts: a.direction_metadata?.beat_role_counts || null,
          featured_hybrid_beats: a.direction_metadata?.featured_hybrid_beats || null,
        });

        const longForm = atomized.filter(a => a.content_type === "long_form_direction").map(mapDirection);
        const shortForm = atomized.filter(a => a.content_type === "short_form_direction").map(a => ({
          ...mapDirection(a),
          cta: a.suggested_cta || a.direction_metadata?.cta,
          subscores: a.subscores || null,
        }));
        const clips = atomized.filter(a => a.content_type === "clip").map(a => ({
          ...a, _savedId: a.id, _briefCreated: a.status === "brief_created",
          viralityScore: a.virality_score, startTimecode: a.timecode_start, endTimecode: a.timecode_end,
        }));
        const shorts = atomized.filter(a => a.content_type === "short").map(a => ({
          ...a, _savedId: a.id, _briefCreated: a.status === "brief_created",
          viralityScore: a.virality_score, timecode: a.timecode_start, suggestedCTA: a.suggested_cta,
        }));
        const quotes = atomized.filter(a => a.content_type === "quote").map(a => ({
          ...a, _savedId: a.id, _briefCreated: a.status === "brief_created",
          viralityScore: a.virality_score, text: a.transcript_excerpt, timecode: a.timecode_start,
          suggestedVisual: a.suggested_visual,
        }));

        const reconstructed = {
          long_form_directions: longForm,
          short_form_directions: shortForm,
          total_directions: longForm.length + shortForm.length,
          summary: transcript.analysis_summary || "",
        };
        if (clips.length > 0) reconstructed.clips = clips;
        if (shorts.length > 0) reconstructed.shorts = shorts;
        if (quotes.length > 0) reconstructed.quotes = quotes;

        // Restore recut data from atomized content
        const restoredRecutData = {};
        [...longForm, ...shortForm].forEach((d, i) => {
          const type = longForm.includes(d) ? "long_form" : "short_form";
          const idx = type === "long_form" ? longForm.indexOf(d) : shortForm.indexOf(d);
          const original = atomized.find(a => a.id === d._savedId);
          if (original?.recut_data) {
            restoredRecutData[`${type}_${idx}`] = original.recut_data;
          }
        });
        if (Object.keys(restoredRecutData).length > 0) {
          setRecutData(restoredRecutData);
        }

        setResults(reconstructed);
        setActiveTab(
          transcript.beat_analysis?.beats?.length ? "structure"
          : longForm.length > 0 ? "long_form"
          : shortForm.length > 0 ? "short_form"
          : "long_form"
        );
      } else {
        setResults(null);
      }
    } catch (err) {
      console.warn("[atomizer] Failed to load atomized content:", err.message);
      setResults(null);
    }
  }, []);

  // ============================================
  // Render
  // ============================================

  return (
    <div style={{ display: "flex", gap: "0" }}>
    <div style={{ flex: 1, minWidth: 0, padding: "0" }}>
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
          <label style={{ fontSize: "12px", fontWeight: "600", color: "#b0b0b0", display: "block", marginBottom: "6px" }}>
            Subtitle
          </label>
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Brief description of the content"
            style={{
              width: "100%", background: "#252525", border: "1px solid #444",
              borderRadius: "8px", padding: "10px 14px", color: "#fff",
              fontSize: "14px", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Channel picker (only if client has multiple channels) */}
        {clientChannels.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "#b0b0b0", display: "block", marginBottom: "6px" }}>
              Channel
            </label>
            <select
              value={selectedChannelId || ""}
              onChange={(e) => setSelectedChannelId(e.target.value || null)}
              style={{
                width: "100%", background: "#252525", border: "1px solid #444",
                borderRadius: "8px", padding: "10px 14px", color: "#fff",
                fontSize: "14px", outline: "none", boxSizing: "border-box",
                cursor: "pointer",
              }}
            >
              <option value="">No channel assigned</option>
              {clientChannels.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.name}</option>
              ))}
            </select>
          </div>
        )}

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
            Est. ~${estimatedCostAnalysis} analysis (3 stages: segment + threads + strategy){selectedCount > 0 ? " + ~$0.06 remix" : ""} (deploy: ~$0.30-0.60, recut: ~$0.15-0.40)
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
              {beatAnalysis && (
                <span style={{ color: "#b0b0b0" }}>
                  {beatAnalysis.threads?.length > 0 && (
                    <><span style={{ color: "#8b5cf6", fontWeight: "600" }}>{beatAnalysis.threads.length}</span> threads / </>
                  )}
                  <span style={{ color: "#10b981", fontWeight: "600" }}>{beatAnalysis.beats?.length || 0}</span> beats
                </span>
              )}
            </div>
            <div style={{ fontSize: "11px", color: "#666" }}>
              {stageCosts ? (
                <>Seg: ${parseFloat(stageCosts.segment || 0).toFixed(4)} | Threads: ${parseFloat(stageCosts.threads || 0).toFixed(4)} | Strategy: ${parseFloat(stageCosts.strategy || 0).toFixed(4)} | Total: ${typeof results.cost === 'string' ? results.cost : (results.cost?.toFixed?.(4) || "0.00")}</>
              ) : (
                <>Cost: ${typeof results.cost === 'string' ? results.cost : (results.cost?.toFixed?.(4) || "0.00")}</>
              )}
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

          {/* Content Type Confirmation Banner */}
          {showContentTypeBanner && selectedChannelId && (
            <ContentTypeConfirmBanner
              detectedType={detectedContentType}
              confidence={detectedConfidence}
              onConfirm={async (type) => {
                try {
                  await updateChannelContentType(selectedChannelId, type);
                  setChannelContentType(type);
                } catch (e) {
                  console.warn('[atomizer] Failed to save content type:', e.message);
                }
                setShowContentTypeBanner(false);
              }}
              onDismiss={() => setShowContentTypeBanner(false)}
            />
          )}

          {/* Collapsible Structure Panel */}
          {beatAnalysis?.beats?.length > 0 && (
            <div style={{ marginBottom: "2px" }}>
              <button
                onClick={() => setStructureOpen(prev => !prev)}
                style={{
                  width: "100%",
                  background: "#1E1E1E", border: "1px solid #333",
                  borderRadius: structureOpen ? "12px 12px 0 0" : "12px",
                  padding: "14px 20px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  cursor: "pointer", color: "#fff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <GitBranch size={14} color="#10b981" />
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>Structure</span>
                  <span style={{
                    background: "#10b98122", color: "#10b981",
                    borderRadius: "10px", padding: "2px 8px",
                    fontSize: "11px", fontWeight: "700",
                  }}>
                    {beatAnalysis.threads?.length ? `${beatAnalysis.threads.length}T / ${beatAnalysis.beats.length}B` : `${beatAnalysis.beats.length}B`}
                  </span>
                </div>
                {structureOpen ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
              </button>
              {structureOpen && (
                <div style={{
                  background: "#1E1E1E", border: "1px solid #333", borderTop: "none",
                  borderRadius: "0 0 12px 12px", padding: "20px 24px",
                }}>
                  <BeatMapPanel beatAnalysis={beatAnalysis} />
                </div>
              )}
            </div>
          )}

          {/* Direction Lanes — two columns on wide, tabs on narrow */}
          <div style={{ marginBottom: "24px" }}>
            <DirectionLanes
              longFormDirs={sortedLongForm}
              shortFormDirs={sortedShortForm}
              expandedCards={expandedCards}
              onToggleExpand={toggleCardExpanded}
              selections={selections}
              onToggleElement={toggleElement}
              onCreateBrief={handleCreateBrief}
              briefCreating={briefCreating}
              onDeploy={handleDeploy}
              deploying={deploying}
              deployedData={deployedData}
              onRecut={handleRecut}
              recutting={recutting}
              recutData={recutData}
              beatAnalysis={beatAnalysis}
            />
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

    {/* History Sidebar */}
    <AtomizerHistory
      clientId={activeClient?.id}
      channelFilter={channelFilter}
      channels={clientChannels}
      onChannelFilterChange={setChannelFilter}
      activeTranscriptId={savedTranscriptId}
      onSelectTranscript={handleLoadTranscript}
      refreshKey={historyRefreshKey}
    />
    </div>
  );
}
