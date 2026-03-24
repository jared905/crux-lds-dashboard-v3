import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Search,
  Loader,
  Users,
  BarChart3,
  Play,
  AlertCircle,
  Tag,
  Palette,
  Sparkles,
  Check,
  SkipForward,
  X,
  Plus,
  Crosshair,
  Map,
} from "lucide-react";
import { youtubeAPI } from "../../services/youtubeAPI";
import { claudeAPI } from "../../services/claudeAPI";
import { classifySizeTier, getTierConfig } from "../../services/auditIngestion";
import { runAudit } from "../../services/auditOrchestrator";
import {
  getContextByYoutubeChannelId,
  extractBrandContext,
} from "../../services/brandContextService";
import { getChannels } from "../../services/competitorDatabase";
import CategorySelector from "../Research/CategorySelector";

const TIER_LABELS = {
  emerging: "Emerging (0 – 10K subs)",
  growing: "Growing (10K – 100K)",
  established: "Established (100K – 500K)",
  major: "Major (500K – 1M)",
  elite: "Elite (1M+)",
};

const TIER_COLORS = {
  emerging: "#6b7280",
  growing: "#3b82f6",
  established: "#8b5cf6",
  major: "#f59e0b",
  elite: "#ef4444",
};

const STEP_LABELS = ["Channel", "Preview", "Brand Context", "Competitors", "Configure"];

export default function AuditCreateFlow({ onBack, onAuditStarted, activeClient }) {
  const [step, setStep] = useState(1); // 1: input, 2: preview, 3: brand context, 4: competitors, 5: config
  const [channelInput, setChannelInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");

  // Resolved channel preview
  const [channelPreview, setChannelPreview] = useState(null);
  const [sizeTier, setSizeTier] = useState("");
  const [tierConfig, setTierConfig] = useState(null);

  // Brand context (step 3)
  const [brandContextData, setBrandContextData] = useState(null);
  const [existingBrandContext, setExistingBrandContext] = useState(null);
  const [bcLoading, setBcLoading] = useState(false);
  const [bcExtracting, setBcExtracting] = useState(false);
  const [pasteContent, setPasteContent] = useState("");
  const [brandName, setBrandName] = useState("");

  // Competitors (step 4)
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [resolvedCompetitors, setResolvedCompetitors] = useState([]);
  const [competitorSuggestions, setCompetitorSuggestions] = useState([]);
  const [competitorResolving, setCompetitorResolving] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [landscapeOptIn, setLandscapeOptIn] = useState(false);
  const [categoryTree, setCategoryTree] = useState([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState(null);

  // Config
  const [auditType, setAuditType] = useState("prospect");
  const [forceRefresh, setForceRefresh] = useState(false);

  // Category selection for scoped benchmarking (hierarchical)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);

  // Running
  const [launching, setLaunching] = useState(false);

  // ── Step 1: Resolve channel ──
  const handleResolve = async () => {
    if (!channelInput.trim()) return;
    setResolving(true);
    setError("");
    try {
      const channelId = await youtubeAPI.resolveChannelId(channelInput.trim());
      const details = await youtubeAPI.fetchChannelDetails(channelId);
      const tier = classifySizeTier(details.subscriber_count);
      const config = getTierConfig(tier);

      setChannelPreview(details);
      setSizeTier(tier);
      setTierConfig(config);
      setBrandName(details.name || "");
      setStep(2);
    } catch (err) {
      setError(err.message || "Could not resolve channel. Check the URL or handle.");
    } finally {
      setResolving(false);
    }
  };

  // ── Step 3: Check for existing brand context when entering step 3 ──
  useEffect(() => {
    if (step !== 3 || !channelPreview?.youtube_channel_id) return;

    let cancelled = false;
    setBcLoading(true);
    setExistingBrandContext(null);

    (async () => {
      try {
        const { context } = await getContextByYoutubeChannelId(channelPreview.youtube_channel_id);
        if (!cancelled) {
          setExistingBrandContext(context);
          if (context) {
            setBrandContextData(context);
          }
        }
      } catch (err) {
        console.warn("[AuditCreateFlow] Failed to check existing brand context:", err.message);
      } finally {
        if (!cancelled) setBcLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [step, channelPreview?.youtube_channel_id]);

  // ── Step 4: Load competitor suggestions when entering step 4 ──
  useEffect(() => {
    if (step !== 4) return;
    let cancelled = false;
    setSuggestionsLoading(true);

    (async () => {
      try {
        // Load all competitors from DB
        const { data } = await getChannels({
          isCompetitor: true,
          ...(activeClient?.id && { clientId: activeClient.id }),
        });
        if (!cancelled && data?.length > 0) {
          const auditedYtId = channelPreview?.youtube_channel_id;
          const filtered = data.filter(c =>
            c.youtube_channel_id !== auditedYtId
          );
          setCompetitorSuggestions(filtered);
        }

        // Load category tree
        try {
          const { getCategoryTree } = await import('../../services/categoryService');
          const tree = await getCategoryTree();
          if (!cancelled) setCategoryTree(tree || []);
        } catch (catErr) {
          console.warn("[AuditCreateFlow] Failed to load categories:", catErr.message);
        }
      } catch (err) {
        console.warn("[AuditCreateFlow] Failed to load competitor suggestions:", err.message);
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [step, activeClient?.id]);

  // ── Resolve competitor URL ──
  const handleAddCompetitor = async () => {
    if (!competitorUrl.trim() || resolvedCompetitors.length >= 5) return;
    setCompetitorResolving(true);
    setError("");
    try {
      const channelId = await youtubeAPI.resolveChannelId(competitorUrl.trim());
      // Check for duplicates
      if (resolvedCompetitors.some(c => c.youtube_channel_id === channelId)) {
        setError("This channel is already in your competitor list.");
        return;
      }
      if (channelId === channelPreview?.youtube_channel_id) {
        setError("You can't add the audited channel as a competitor.");
        return;
      }
      const details = await youtubeAPI.fetchChannelDetails(channelId);
      setResolvedCompetitors(prev => [...prev, details]);
      setCompetitorUrl("");
      // Remove from suggestions if present
      setCompetitorSuggestions(prev => prev.filter(c => c.youtube_channel_id !== channelId));
    } catch (err) {
      setError(err.message || "Could not resolve channel. Check the URL or handle.");
    } finally {
      setCompetitorResolving(false);
    }
  };

  const handleAddSuggestion = (channel) => {
    if (resolvedCompetitors.length >= 5) return;
    if (resolvedCompetitors.some(c => c.youtube_channel_id === channel.youtube_channel_id)) return;
    setResolvedCompetitors(prev => [...prev, channel]);
    setCompetitorSuggestions(prev => prev.filter(c => c.id !== channel.id));
  };

  const handleRemoveCompetitor = (ytChannelId) => {
    setResolvedCompetitors(prev => prev.filter(c => c.youtube_channel_id !== ytChannelId));
  };

  // ── Step 3: Extract brand context ──
  const handleExtract = async () => {
    if (!pasteContent.trim()) {
      setError("Please paste some content to extract from.");
      return;
    }
    setBcExtracting(true);
    setError("");
    try {
      const result = await extractBrandContext(pasteContent, brandName || channelPreview?.name || "Unknown");
      const { raw_extraction, extraction_model, usage, cost, ...contextFields } = result;
      const extractedData = { ...contextFields, raw_extraction, extraction_model };
      setBrandContextData(extractedData);
    } catch (err) {
      setError(err.message || "Extraction failed. Check your Claude API key.");
    } finally {
      setBcExtracting(false);
    }
  };

  // Count filled sections in brand context
  const countFilledSections = (data) => {
    if (!data) return 0;
    const keys = ["brand_voice", "messaging_priorities", "audience_signals", "content_themes", "visual_identity", "platform_presence"];
    return keys.filter(k => data[k] && typeof data[k] === "object" && Object.keys(data[k]).length > 0).length;
  };

  // ── Step 5: Launch audit ──
  const handleLaunch = async () => {
    // Pre-flight: check API keys before creating audit record
    if (!claudeAPI.apiKey) {
      setError("Claude API key not configured. Go to Settings → API Keys and add your Anthropic key.");
      return;
    }
    if (!youtubeAPI.apiKey) {
      setError("YouTube API key not configured. Go to Settings → API Keys and add your YouTube Data API key.");
      return;
    }

    setLaunching(true);
    setError("");
    try {
      const auditPromise = runAudit({
        channelInput: channelPreview?.youtube_channel_id || channelInput.trim(),
        auditType,
        config: {
          forceRefresh,
          categoryIds: selectedCategoryIds.length > 0 ? selectedCategoryIds : null,
          brandContext: brandContextData || null,
          competitorChannelIds: resolvedCompetitors.length > 0
            ? resolvedCompetitors.map(c => c.youtube_channel_id)
            : null,
          landscapeOptIn: landscapeOptIn && resolvedCompetitors.length > 0,
        },
      });

      const audit = await auditPromise;
      onAuditStarted(audit.id);
    } catch (err) {
      setError(err.message);
      setLaunching(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            background: "transparent",
            border: "1px solid #444",
            borderRadius: "8px",
            color: "#9E9E9E",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <h2 style={{ fontSize: "20px", fontWeight: "700", margin: 0 }}>New Audit</h2>
      </div>

      {/* Step indicator */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "32px", flexWrap: "wrap" }}>
        {STEP_LABELS.map((label, i) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              background: step > i + 1 ? "rgba(34, 197, 94, 0.1)" : step === i + 1 ? "rgba(41, 98, 255, 0.15)" : "#252525",
              border: `1px solid ${step > i + 1 ? "rgba(34, 197, 94, 0.3)" : step === i + 1 ? "#2962FF" : "#333"}`,
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              color: step > i + 1 ? "#22c55e" : step === i + 1 ? "#60a5fa" : "#666",
            }}
          >
            <span style={{
              width: "20px", height: "20px", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: "700",
              background: step > i + 1 ? "#166534" : step === i + 1 ? "#2962FF" : "#444",
              color: step > i + 1 ? "#22c55e" : "#fff",
            }}>
              {step > i + 1 ? "\u2713" : i + 1}
            </span>
            {label}
          </div>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "12px 16px", background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px",
          color: "#ef4444", fontSize: "13px", marginBottom: "16px",
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── Step 1: Channel Input ── */}
      {step === 1 && (
        <div style={{ maxWidth: "600px" }}>
          <div style={{
            background: "#1E1E1E", borderRadius: "8px", border: "1px solid #333",
            padding: "32px",
          }}>
            <div style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>
              Enter a YouTube Channel
            </div>
            <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "20px" }}>
              Paste a channel URL, @handle, or channel ID
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleResolve()}
                placeholder="https://youtube.com/@channel or UCxxxxxxx"
                style={{
                  flex: 1, padding: "12px 16px", background: "#252525",
                  border: "1px solid #444", borderRadius: "8px", color: "#E0E0E0",
                  fontSize: "14px", outline: "none",
                }}
              />
              <button
                onClick={handleResolve}
                disabled={resolving || !channelInput.trim()}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "12px 20px", background: "#2962FF", border: "none",
                  borderRadius: "8px", color: "#fff", cursor: "pointer",
                  fontWeight: "600", fontSize: "14px",
                  opacity: resolving || !channelInput.trim() ? 0.5 : 1,
                }}
              >
                {resolving ? <Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Search size={16} />}
                {resolving ? "Resolving..." : "Look Up"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Channel Preview ── */}
      {step === 2 && channelPreview && (
        <div style={{ maxWidth: "600px" }}>
          <div style={{
            background: "#1E1E1E", borderRadius: "8px", border: "1px solid #333",
            padding: "32px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
              {channelPreview.thumbnail_url && (
                <img
                  src={channelPreview.thumbnail_url}
                  alt=""
                  style={{ width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover" }}
                />
              )}
              <div>
                <div style={{ fontSize: "18px", fontWeight: "700" }}>{channelPreview.name}</div>
                <div style={{ fontSize: "13px", color: "#9E9E9E" }}>
                  {channelPreview.custom_url || channelPreview.youtube_channel_id}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
              <div style={{ background: "#252525", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Subscribers</div>
                <div style={{ fontSize: "18px", fontWeight: "700" }}>
                  {(channelPreview.subscriber_count || 0).toLocaleString()}
                </div>
              </div>
              <div style={{ background: "#252525", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Total Views</div>
                <div style={{ fontSize: "18px", fontWeight: "700" }}>
                  {(channelPreview.total_view_count || 0).toLocaleString()}
                </div>
              </div>
              <div style={{ background: "#252525", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Videos</div>
                <div style={{ fontSize: "18px", fontWeight: "700" }}>
                  {(channelPreview.video_count || 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Tier */}
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "10px 14px", background: "#252525", borderRadius: "8px", marginBottom: "20px",
            }}>
              <div style={{
                width: "10px", height: "10px", borderRadius: "50%",
                background: TIER_COLORS[sizeTier] || "#666",
              }} />
              <span style={{ fontSize: "13px", fontWeight: "600", color: TIER_COLORS[sizeTier] || "#9E9E9E" }}>
                {TIER_LABELS[sizeTier] || sizeTier}
              </span>
              <span style={{ fontSize: "12px", color: "#666", marginLeft: "auto" }}>
                Will analyze up to {tierConfig?.maxVideos} videos
              </span>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => { setStep(1); setChannelPreview(null); setError(""); }}
                style={{
                  padding: "10px 20px", background: "transparent",
                  border: "1px solid #444", borderRadius: "8px",
                  color: "#9E9E9E", cursor: "pointer", fontSize: "13px",
                }}
              >
                Change Channel
              </button>
              <button
                onClick={() => setStep(3)}
                style={{
                  padding: "10px 24px", background: "#2962FF", border: "none",
                  borderRadius: "8px", color: "#fff", cursor: "pointer",
                  fontWeight: "600", fontSize: "14px",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Brand Context (optional) ── */}
      {step === 3 && (
        <div style={{ maxWidth: "600px" }}>
          <div style={{
            background: "#1E1E1E", borderRadius: "8px", border: "1px solid #333",
            padding: "32px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <Palette size={20} style={{ color: "#60a5fa" }} />
              <div style={{ fontSize: "16px", fontWeight: "600" }}>Brand Context</div>
              <span style={{ fontSize: "11px", color: "#9E9E9E", background: "#333", padding: "2px 8px", borderRadius: "4px" }}>
                Optional
              </span>
            </div>
            <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "20px" }}>
              Provide brand intelligence to make AI analysis more relevant and commercially aligned.
            </div>

            {/* Loading state */}
            {bcLoading && (
              <div style={{ textAlign: "center", padding: "24px", color: "#9E9E9E" }}>
                <Loader size={20} style={{ animation: "spin 1s linear infinite", marginBottom: "8px" }} />
                <div style={{ fontSize: "13px" }}>Checking for existing brand context...</div>
              </div>
            )}

            {/* Existing context found */}
            {!bcLoading && existingBrandContext && !bcExtracting && brandContextData === existingBrandContext && (
              <div>
                <div style={{
                  padding: "14px", background: "rgba(34, 197, 94, 0.08)",
                  border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "8px",
                  marginBottom: "16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <Check size={16} style={{ color: "#22c55e" }} />
                    <span style={{ fontSize: "14px", fontWeight: "600", color: "#22c55e" }}>
                      Existing Brand Context Found
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#9E9E9E" }}>
                    {countFilledSections(existingBrandContext)} of 6 sections populated
                    {existingBrandContext.snapshot_date && (
                      <span> — saved {new Date(existingBrandContext.snapshot_date).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => {
                      setBrandContextData(null);
                      setExistingBrandContext(null);
                    }}
                    style={{
                      padding: "10px 16px", background: "transparent",
                      border: "1px solid #444", borderRadius: "8px",
                      color: "#9E9E9E", cursor: "pointer", fontSize: "13px",
                    }}
                  >
                    Re-extract
                  </button>
                  <button
                    onClick={() => { setBrandContextData(null); setStep(4); }}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "10px 16px", background: "transparent",
                      border: "1px solid #444", borderRadius: "8px",
                      color: "#9E9E9E", cursor: "pointer", fontSize: "13px",
                    }}
                  >
                    <SkipForward size={14} /> Skip
                  </button>
                  <button
                    onClick={() => setStep(4)}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "10px 20px", background: "#2962FF", border: "none",
                      borderRadius: "8px", color: "#fff", cursor: "pointer",
                      fontWeight: "600", fontSize: "14px",
                    }}
                  >
                    <Check size={16} /> Use This
                  </button>
                </div>
              </div>
            )}

            {/* Extracted context summary (from fresh extraction) */}
            {!bcLoading && brandContextData && brandContextData !== existingBrandContext && !bcExtracting && (
              <div>
                <div style={{
                  padding: "14px", background: "rgba(41, 98, 255, 0.08)",
                  border: "1px solid rgba(41, 98, 255, 0.3)", borderRadius: "8px",
                  marginBottom: "16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <Sparkles size={16} style={{ color: "#60a5fa" }} />
                    <span style={{ fontSize: "14px", fontWeight: "600", color: "#60a5fa" }}>
                      Brand Context Extracted
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#9E9E9E" }}>
                    {countFilledSections(brandContextData)} of 6 sections populated.
                    This will be saved when the audit runs.
                  </div>
                  {/* Section summary */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
                    {["brand_voice", "messaging_priorities", "audience_signals", "content_themes", "visual_identity", "platform_presence"].map(key => {
                      const filled = brandContextData[key] && typeof brandContextData[key] === "object" && Object.keys(brandContextData[key]).length > 0;
                      return (
                        <span
                          key={key}
                          style={{
                            fontSize: "11px",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            background: filled ? "rgba(34, 197, 94, 0.15)" : "#333",
                            color: filled ? "#22c55e" : "#666",
                          }}
                        >
                          {key.replace(/_/g, " ")}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setBrandContextData(null)}
                    style={{
                      padding: "10px 16px", background: "transparent",
                      border: "1px solid #444", borderRadius: "8px",
                      color: "#9E9E9E", cursor: "pointer", fontSize: "13px",
                    }}
                  >
                    Re-extract
                  </button>
                  <button
                    onClick={() => setStep(4)}
                    style={{
                      padding: "10px 24px", background: "#2962FF", border: "none",
                      borderRadius: "8px", color: "#fff", cursor: "pointer",
                      fontWeight: "600", fontSize: "14px",
                    }}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Paste + extract form (no existing context, or re-extract mode) */}
            {!bcLoading && !brandContextData && !bcExtracting && (
              <div>
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "12px", color: "#9E9E9E", fontWeight: "600", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Brand Name
                  </div>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder={channelPreview?.name || "Brand name"}
                    style={{
                      width: "100%", padding: "10px 12px", background: "#252525",
                      border: "1px solid #333", borderRadius: "8px", color: "#E0E0E0",
                      fontSize: "14px", boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "12px", color: "#9E9E9E", fontWeight: "600", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Paste Content
                  </div>
                  <textarea
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder="Paste website copy, about page, social media posts, mission statement, or any brand content..."
                    style={{
                      width: "100%", padding: "12px", background: "#252525",
                      border: "1px solid #333", borderRadius: "8px", color: "#E0E0E0",
                      fontSize: "14px", resize: "vertical", minHeight: "120px",
                      fontFamily: "inherit", boxSizing: "border-box",
                    }}
                  />
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
                    The more content you provide, the better the extraction. Include website copy, social bios, recent posts, etc.
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setStep(2)}
                    style={{
                      padding: "10px 20px", background: "transparent",
                      border: "1px solid #444", borderRadius: "8px",
                      color: "#9E9E9E", cursor: "pointer", fontSize: "13px",
                    }}
                  >
                    Back
                  </button>
                  <button
                    onClick={() => { setBrandContextData(null); setStep(4); }}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "10px 16px", background: "transparent",
                      border: "1px solid #444", borderRadius: "8px",
                      color: "#9E9E9E", cursor: "pointer", fontSize: "13px",
                    }}
                  >
                    <SkipForward size={14} /> Skip
                  </button>
                  <button
                    onClick={handleExtract}
                    disabled={!pasteContent.trim()}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "10px 20px", background: "#2962FF", border: "none",
                      borderRadius: "8px", color: "#fff", cursor: "pointer",
                      fontWeight: "600", fontSize: "14px",
                      opacity: !pasteContent.trim() ? 0.5 : 1,
                    }}
                  >
                    <Sparkles size={16} /> Extract
                  </button>
                </div>
              </div>
            )}

            {/* Extracting state */}
            {bcExtracting && (
              <div style={{ textAlign: "center", padding: "32px", color: "#9E9E9E" }}>
                <Loader size={24} style={{ animation: "spin 1s linear infinite", marginBottom: "12px" }} />
                <div style={{ fontSize: "14px", fontWeight: "600", color: "#E0E0E0", marginBottom: "4px" }}>
                  Extracting brand context...
                </div>
                <div style={{ fontSize: "12px" }}>
                  Claude is analyzing the pasted content for brand intelligence.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 4: Competitors (optional) ── */}
      {step === 4 && (
        <div style={{ maxWidth: "600px" }}>
          <div style={{
            background: "#1E1E1E", borderRadius: "8px", border: "1px solid #333",
            padding: "32px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <Crosshair size={20} style={{ color: "#60a5fa" }} />
              <div style={{ fontSize: "16px", fontWeight: "600" }}>Add Competitors</div>
              <span style={{ fontSize: "11px", color: "#9E9E9E", background: "#333", padding: "2px 8px", borderRadius: "4px" }}>
                Optional
              </span>
            </div>
            <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "20px" }}>
              Add up to 5 competitor channels for head-to-head benchmarking. Paste YouTube URLs or select from your tracked competitors.
            </div>

            {/* Manual URL input */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <input
                type="text"
                value={competitorUrl}
                onChange={(e) => setCompetitorUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCompetitor()}
                placeholder="https://youtube.com/@channel or UCxxxxxxx"
                disabled={resolvedCompetitors.length >= 5}
                style={{
                  flex: 1, padding: "10px 12px", background: "#252525",
                  border: "1px solid #444", borderRadius: "8px", color: "#E0E0E0",
                  fontSize: "13px", outline: "none",
                  opacity: resolvedCompetitors.length >= 5 ? 0.5 : 1,
                }}
              />
              <button
                onClick={handleAddCompetitor}
                disabled={competitorResolving || !competitorUrl.trim() || resolvedCompetitors.length >= 5}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "10px 16px", background: "#2962FF", border: "none",
                  borderRadius: "8px", color: "#fff", cursor: "pointer",
                  fontWeight: "600", fontSize: "13px",
                  opacity: competitorResolving || !competitorUrl.trim() || resolvedCompetitors.length >= 5 ? 0.5 : 1,
                }}
              >
                {competitorResolving ? <Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />}
                Add
              </button>
            </div>

            {/* Selected competitors */}
            {resolvedCompetitors.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", color: "#9E9E9E", fontWeight: "600", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Selected ({resolvedCompetitors.length}/5)
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {resolvedCompetitors.map(c => (
                    <div key={c.youtube_channel_id} style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      padding: "8px 12px", background: "#252525", borderRadius: "8px",
                      border: "1px solid #444",
                    }}>
                      {c.thumbnail_url && (
                        <img src={c.thumbnail_url} alt="" style={{ width: "28px", height: "28px", borderRadius: "50%" }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.name}
                        </div>
                        <div style={{ fontSize: "11px", color: "#9E9E9E" }}>
                          {(c.subscriber_count || 0).toLocaleString()} subscribers
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveCompetitor(c.youtube_channel_id)}
                        style={{
                          background: "none", border: "none", color: "#9E9E9E",
                          cursor: "pointer", padding: "4px",
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions from database — grouped by category */}
            {suggestionsLoading && (
              <div style={{ textAlign: "center", padding: "16px", color: "#9E9E9E", fontSize: "12px" }}>
                <Loader size={14} style={{ animation: "spin 1s linear infinite", marginRight: "6px", verticalAlign: "middle" }} />
                Loading tracked competitors...
              </div>
            )}

            {!suggestionsLoading && competitorSuggestions.length > 0 && resolvedCompetitors.length < 5 && (() => {
              // Build category slugs from tree
              const catSlugs = {};
              const flattenTree = (nodes) => {
                nodes.forEach(n => {
                  catSlugs[n.slug] = { label: n.name, color: n.color || '#666', icon: n.icon };
                  if (n.children) flattenTree(n.children);
                });
              };
              flattenTree(categoryTree);

              // Group available suggestions by category
              const selectedIds = new Set(resolvedCompetitors.map(c => c.youtube_channel_id));
              const available = competitorSuggestions.filter(c => !selectedIds.has(c.youtube_channel_id));
              const byCategory = {};
              available.forEach(c => {
                const cat = c.category || 'uncategorized';
                if (!byCategory[cat]) byCategory[cat] = [];
                byCategory[cat].push(c);
              });

              const categoryKeys = Object.keys(byCategory).sort((a, b) => {
                const la = catSlugs[a]?.label || a;
                const lb = catSlugs[b]?.label || b;
                return la.localeCompare(lb);
              });

              // Filter channels by selected category
              const displayChannels = selectedCategoryFilter
                ? (byCategory[selectedCategoryFilter] || [])
                : available.slice(0, 15);

              return (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "12px", color: "#9E9E9E", fontWeight: "600", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    From Your Competitor Database ({available.length} channels)
                  </div>

                  {/* Category filter pills */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "10px" }}>
                    <button
                      onClick={() => setSelectedCategoryFilter(null)}
                      style={{
                        padding: "4px 10px", borderRadius: "6px", fontSize: "10px", fontWeight: "600",
                        border: `1px solid ${!selectedCategoryFilter ? '#3b82f6' : '#444'}`,
                        background: !selectedCategoryFilter ? 'rgba(59,130,246,0.15)' : 'transparent',
                        color: !selectedCategoryFilter ? '#60a5fa' : '#888',
                        cursor: "pointer",
                      }}
                    >
                      All
                    </button>
                    {categoryKeys.map(slug => {
                      const cfg = catSlugs[slug] || {};
                      const count = byCategory[slug].length;
                      const isActive = selectedCategoryFilter === slug;
                      return (
                        <button
                          key={slug}
                          onClick={() => setSelectedCategoryFilter(isActive ? null : slug)}
                          style={{
                            padding: "4px 10px", borderRadius: "6px", fontSize: "10px", fontWeight: "600",
                            border: `1px solid ${isActive ? cfg.color || '#3b82f6' : '#444'}`,
                            background: isActive ? `${cfg.color || '#3b82f6'}20` : 'transparent',
                            color: isActive ? cfg.color || '#3b82f6' : '#888',
                            cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          {cfg.label || slug} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {/* Channel list */}
                  <div style={{ maxHeight: "240px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {displayChannels
                      .sort((a, b) => (b.subscriber_count || 0) - (a.subscriber_count || 0))
                      .map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleAddSuggestion(c)}
                          style={{
                            display: "flex", alignItems: "center", gap: "8px",
                            padding: "6px 10px", background: "transparent",
                            border: "none", borderRadius: "6px",
                            color: "#E0E0E0", cursor: "pointer", fontSize: "12px",
                            textAlign: "left", width: "100%",
                            transition: "background 0.1s",
                          }}
                          onMouseOver={e => e.currentTarget.style.background = "#252525"}
                          onMouseOut={e => e.currentTarget.style.background = "transparent"}
                        >
                          {c.thumbnail_url && (
                            <img src={c.thumbnail_url} alt="" style={{ width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0 }} />
                          )}
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                          <span style={{ fontSize: "10px", color: "#888", flexShrink: 0 }}>
                            {(c.subscriber_count || 0).toLocaleString()} subs
                          </span>
                          <Plus size={12} style={{ color: "#60a5fa", flexShrink: 0 }} />
                        </button>
                      ))
                    }
                  </div>
                </div>
              );
            })()}

            {/* Landscape opt-in */}
            {resolvedCompetitors.length > 0 && (
              <div style={{
                padding: "12px 14px", background: "rgba(41, 98, 255, 0.08)",
                border: "1px solid rgba(41, 98, 255, 0.2)", borderRadius: "8px",
                marginBottom: "16px",
              }}>
                <label style={{
                  display: "flex", alignItems: "flex-start", gap: "10px",
                  cursor: "pointer",
                }}>
                  <input
                    type="checkbox"
                    checked={landscapeOptIn}
                    onChange={(e) => setLandscapeOptIn(e.target.checked)}
                    style={{ accentColor: "#2962FF", marginTop: "2px" }}
                  />
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#E0E0E0" }}>
                      <Map size={14} style={{ verticalAlign: "middle", marginRight: "6px", color: "#60a5fa" }} />
                      Include Landscape Analysis
                    </div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "4px" }}>
                      AI-generated competitive positioning, content saturation map, and white space identification.
                    </div>
                  </div>
                </label>
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setStep(3)}
                style={{
                  padding: "10px 20px", background: "transparent",
                  border: "1px solid #444", borderRadius: "8px",
                  color: "#9E9E9E", cursor: "pointer", fontSize: "13px",
                }}
              >
                Back
              </button>
              <button
                onClick={() => setStep(5)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "10px 16px", background: resolvedCompetitors.length === 0 ? "transparent" : "#2962FF",
                  border: resolvedCompetitors.length === 0 ? "1px solid #444" : "none",
                  borderRadius: "8px",
                  color: resolvedCompetitors.length === 0 ? "#9E9E9E" : "#fff",
                  cursor: "pointer", fontSize: "13px", fontWeight: "600",
                }}
              >
                {resolvedCompetitors.length === 0 ? (
                  <><SkipForward size={14} /> Skip</>
                ) : (
                  "Continue"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 5: Configure ── */}
      {step === 5 && (
        <div style={{ maxWidth: "600px" }}>
          <div style={{
            background: "#1E1E1E", borderRadius: "8px", border: "1px solid #333",
            padding: "32px",
          }}>
            <div style={{ fontSize: "16px", fontWeight: "600", marginBottom: "20px" }}>
              Audit Configuration
            </div>

            {/* Brand context indicator */}
            {brandContextData && (
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "10px 14px", background: "rgba(34, 197, 94, 0.08)",
                border: "1px solid rgba(34, 197, 94, 0.2)", borderRadius: "8px",
                marginBottom: "12px", fontSize: "13px", color: "#22c55e",
              }}>
                <Palette size={16} />
                Brand context will be included ({countFilledSections(brandContextData)} sections)
                <button
                  onClick={() => { setBrandContextData(null); setStep(3); }}
                  style={{
                    marginLeft: "auto", background: "none", border: "none",
                    color: "#9E9E9E", fontSize: "12px", cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Change
                </button>
              </div>
            )}

            {/* Competitor indicator */}
            {resolvedCompetitors.length > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "10px 14px", background: "rgba(41, 98, 255, 0.08)",
                border: "1px solid rgba(41, 98, 255, 0.2)", borderRadius: "8px",
                marginBottom: "20px", fontSize: "13px", color: "#60a5fa",
              }}>
                <Crosshair size={16} />
                {resolvedCompetitors.length} competitor{resolvedCompetitors.length !== 1 ? "s" : ""} selected
                {landscapeOptIn && <span style={{ color: "#8b5cf6" }}> + Landscape Analysis</span>}
                <button
                  onClick={() => setStep(4)}
                  style={{
                    marginLeft: "auto", background: "none", border: "none",
                    color: "#9E9E9E", fontSize: "12px", cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Change
                </button>
              </div>
            )}

            {/* Audit Type */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "8px" }}>Audit Type</div>
              <div style={{ display: "flex", gap: "8px" }}>
                {[
                  { id: "prospect", label: "Prospect Analysis", icon: Users, desc: "Positioning & competitive edge for sales" },
                  { id: "client_baseline", label: "Client Baseline", icon: BarChart3, desc: "Benchmark starting point for new clients" },
                ].map(({ id, label, icon: Icon, desc }) => (
                  <button
                    key={id}
                    onClick={() => setAuditType(id)}
                    style={{
                      flex: 1, padding: "16px", background: auditType === id ? "rgba(41, 98, 255, 0.15)" : "#252525",
                      border: `1px solid ${auditType === id ? "#2962FF" : "#444"}`,
                      borderRadius: "10px", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <Icon size={20} style={{ color: auditType === id ? "#60a5fa" : "#666", marginBottom: "8px" }} />
                    <div style={{ fontSize: "14px", fontWeight: "600", color: auditType === id ? "#60a5fa" : "#E0E0E0" }}>
                      {label}
                    </div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "4px" }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Benchmark Scope - Category Selection (Hierarchical) */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "8px" }}>
                <Tag size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "6px" }} />
                Benchmark Categories
              </div>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px" }}>
                Select categories to compare against. Expand parent categories to select specific subcategories.
                Leave empty to compare against all competitors.
              </div>
              <CategorySelector
                selectedIds={selectedCategoryIds}
                onChange={setSelectedCategoryIds}
                placeholder="Select benchmark categories..."
              />
              {selectedCategoryIds.length > 0 && (
                <div style={{ fontSize: "12px", color: "#60a5fa", marginTop: "8px" }}>
                  {selectedCategoryIds.length} categor{selectedCategoryIds.length === 1 ? "y" : "ies"} selected
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryIds([])}
                    style={{
                      marginLeft: "12px", background: "none", border: "none",
                      color: "#9E9E9E", fontSize: "12px", cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {/* Force Refresh */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{
                display: "flex", alignItems: "center", gap: "8px",
                fontSize: "13px", color: "#9E9E9E", cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={forceRefresh}
                  onChange={(e) => setForceRefresh(e.target.checked)}
                  style={{ accentColor: "#2962FF" }}
                />
                Force refresh YouTube data (skip cache)
              </label>
            </div>

            {/* Summary */}
            <div style={{
              padding: "14px", background: "#252525", borderRadius: "8px",
              fontSize: "13px", color: "#9E9E9E", marginBottom: "24px",
            }}>
              <div style={{ fontWeight: "600", color: "#E0E0E0", marginBottom: "6px" }}>Audit will include:</div>
              <ul style={{ margin: 0, paddingLeft: "20px", lineHeight: "1.8" }}>
                <li>Channel data ingestion & video analysis</li>
                <li>Content series detection (pattern + AI)</li>
                <li>
                  {resolvedCompetitors.length > 0
                    ? <span>Head-to-head benchmarking <span style={{ color: "#60a5fa" }}>({resolvedCompetitors.length} competitor{resolvedCompetitors.length !== 1 ? "s" : ""})</span></span>
                    : <>Tier-stratified peer benchmarking
                      {selectedCategoryIds.length > 0 && (
                        <span style={{ color: "#60a5fa" }}>
                          {" "}(scoped to {selectedCategoryIds.length} selected categor{selectedCategoryIds.length === 1 ? "y" : "ies"})
                        </span>
                      )}
                    </>
                  }
                </li>
                {landscapeOptIn && resolvedCompetitors.length > 0 && (
                  <li>AI landscape analysis <span style={{ color: "#8b5cf6" }}>(positioning + white space)</span></li>
                )}
                <li>AI opportunity analysis{brandContextData ? <span style={{ color: "#22c55e" }}> (brand-aware)</span> : ""}</li>
                <li>Stop/Start/Optimize recommendations{brandContextData ? <span style={{ color: "#22c55e" }}> (brand-aware)</span> : ""}</li>
                <li>Executive summary{brandContextData ? <span style={{ color: "#22c55e" }}> (brand-aware)</span> : ""}</li>
              </ul>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setStep(4)}
                style={{
                  padding: "10px 20px", background: "transparent",
                  border: "1px solid #444", borderRadius: "8px",
                  color: "#9E9E9E", cursor: "pointer", fontSize: "13px",
                }}
              >
                Back
              </button>
              <button
                onClick={handleLaunch}
                disabled={launching}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "10px 24px", background: "#22c55e", border: "none",
                  borderRadius: "8px", color: "#fff", cursor: "pointer",
                  fontWeight: "600", fontSize: "14px",
                  opacity: launching ? 0.6 : 1,
                }}
              >
                {launching ? (
                  <Loader size={16} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Play size={16} />
                )}
                {launching ? "Launching..." : "Run Audit"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
