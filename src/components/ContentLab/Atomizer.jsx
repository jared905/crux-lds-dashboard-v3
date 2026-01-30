import React, { useState, useCallback } from "react";
import { Zap, FileText, Scissors, MessageSquare, Loader, ChevronDown, ChevronUp, Check, Plus } from "lucide-react";
import { analyzeTranscript, saveTranscript, markTranscriptAnalyzed, saveAtomizedContent, createBriefFromAtomized } from "../../services/atomizerService";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

export default function Atomizer({ activeClient }) {
  // Input state
  const [title, setTitle] = useState("");
  const [transcriptText, setTranscriptText] = useState("");

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("clips"); // clips | shorts | quotes

  // Save state
  const [saving, setSaving] = useState(false);
  const [savedTranscriptId, setSavedTranscriptId] = useState(null);
  const [briefCreating, setBriefCreating] = useState(null); // atomized content id being converted

  const wordCount = transcriptText.trim() ? transcriptText.trim().split(/\s+/).length : 0;

  // Estimated cost: ~$0.04 per analysis
  const estimatedCost = wordCount > 0 ? Math.max(0.01, (wordCount / 1000) * 0.008).toFixed(3) : "0.00";

  const handleAnalyze = useCallback(async () => {
    if (!transcriptText.trim()) {
      setError("Please paste a transcript to analyze.");
      return;
    }

    setAnalyzing(true);
    setError("");
    setResults(null);

    try {
      const data = await analyzeTranscript(transcriptText, title || "Untitled");
      setResults(data);

      // Auto-save transcript to Supabase
      try {
        const saved = await saveTranscript({
          title: title || "Untitled",
          text: transcriptText,
          sourceType: "paste",
          clientId: activeClient?.id,
        });
        setSavedTranscriptId(saved.id);
        await markTranscriptAnalyzed(saved.id);

        // Save atomized content items
        await saveAtomizedContent(saved.id, data, activeClient?.id);
      } catch (saveErr) {
        console.warn("Failed to save to database:", saveErr);
        // Analysis still succeeded, just not persisted
      }
    } catch (err) {
      setError(err.message || "Analysis failed. Check your Claude API key in Settings.");
    } finally {
      setAnalyzing(false);
    }
  }, [transcriptText, title, activeClient]);

  const handleCreateBrief = useCallback(async (atomizedContentId) => {
    setBriefCreating(atomizedContentId);
    try {
      await createBriefFromAtomized(atomizedContentId, activeClient?.id);
      // Update local results to show brief_created status
      setResults(prev => {
        if (!prev) return prev;
        const updateItems = (items) => items?.map(item =>
          item._savedId === atomizedContentId ? { ...item, _briefCreated: true } : item
        );
        return {
          ...prev,
          clips: updateItems(prev.clips),
          shorts: updateItems(prev.shorts),
          quotes: updateItems(prev.quotes),
        };
      });
    } catch (err) {
      setError("Failed to create brief: " + err.message);
    } finally {
      setBriefCreating(null);
    }
  }, [activeClient]);

  // Virality score badge color
  const scoreColor = (score) => {
    if (score >= 8) return { bg: "#166534", border: "#22c55e", text: "#22c55e" };
    if (score >= 5) return { bg: "#854d0e", border: "#f59e0b", text: "#f59e0b" };
    return { bg: "#374151", border: "#6b7280", text: "#9ca3af" };
  };

  const tabCounts = results ? {
    clips: (results.clips || []).length,
    shorts: (results.shorts || []).length,
    quotes: (results.quotes || []).length,
  } : { clips: 0, shorts: 0, quotes: 0 };

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
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <Zap size={20} color="#f59e0b" />
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff" }}>
            Content Atomizer
          </div>
        </div>
        <div style={{ fontSize: "12px", color: "#888" }}>
          Paste a transcript to extract clips, shorts, and quotable moments scored by viral potential
        </div>
      </div>

      {/* Input Section */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px"
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
              width: "100%",
              background: "#252525",
              border: "1px solid #444",
              borderRadius: "8px",
              padding: "10px 14px",
              color: "#fff",
              fontSize: "14px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "#b0b0b0" }}>
              Transcript
            </label>
            <span style={{ fontSize: "11px", color: "#666" }}>
              {fmtInt(wordCount)} words
            </span>
          </div>
          <textarea
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            placeholder="Paste your transcript here..."
            rows={12}
            style={{
              width: "100%",
              background: "#252525",
              border: "1px solid #444",
              borderRadius: "8px",
              padding: "12px 14px",
              color: "#e0e0e0",
              fontSize: "13px",
              lineHeight: "1.6",
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "11px", color: "#666" }}>
            Estimated cost: ~${estimatedCost}
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !transcriptText.trim()}
            style={{
              background: analyzing ? "#374151" : "#3b82f6",
              border: "none",
              borderRadius: "8px",
              padding: "10px 24px",
              color: "#fff",
              fontSize: "14px",
              fontWeight: "600",
              cursor: analyzing || !transcriptText.trim() ? "not-allowed" : "pointer",
              opacity: analyzing || !transcriptText.trim() ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {analyzing ? (
              <>
                <Loader size={16} style={{ animation: "spin 1s linear infinite" }} />
                Analyzing...
              </>
            ) : (
              <>
                <Scissors size={16} />
                Atomize Transcript
              </>
            )}
          </button>
        </div>

        {error && (
          <div style={{
            background: "#2d1b1b",
            border: "1px solid #7f1d1d",
            borderRadius: "8px",
            padding: "12px",
            color: "#fca5a5",
            fontSize: "13px",
            marginTop: "16px"
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Results Section */}
      {results && (
        <>
          {/* Summary Bar */}
          <div style={{
            background: "#1E1E1E",
            border: "1px solid #333",
            borderRadius: "12px",
            padding: "16px 24px",
            marginBottom: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
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

          {/* Summary */}
          {results.summary && (
            <div style={{
              background: "#1E1E1E",
              border: "1px solid #333",
              borderRadius: "12px",
              padding: "20px 24px",
              marginBottom: "24px"
            }}>
              <div style={{ fontSize: "11px", fontWeight: "600", color: "#3b82f6", textTransform: "uppercase", marginBottom: "8px" }}>
                Summary
              </div>
              <div style={{ fontSize: "13px", color: "#e0e0e0", lineHeight: "1.7" }}>
                {results.summary}
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div style={{
            display: "flex",
            gap: "2px",
            marginBottom: "2px"
          }}>
            {[
              { id: "clips", label: "Clips", icon: FileText, count: tabCounts.clips, color: "#3b82f6" },
              { id: "shorts", label: "Shorts", icon: Scissors, count: tabCounts.shorts, color: "#ec4899" },
              { id: "quotes", label: "Quotes", icon: MessageSquare, count: tabCounts.quotes, color: "#f59e0b" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  flex: 1,
                  background: activeTab === t.id ? "#1E1E1E" : "#161616",
                  border: activeTab === t.id ? "1px solid #333" : "1px solid transparent",
                  borderBottom: activeTab === t.id ? "none" : "1px solid #333",
                  borderRadius: "8px 8px 0 0",
                  padding: "12px",
                  color: activeTab === t.id ? "#fff" : "#888",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <t.icon size={14} color={activeTab === t.id ? t.color : "#888"} />
                {t.label}
                <span style={{
                  background: activeTab === t.id ? t.color + "22" : "#333",
                  color: activeTab === t.id ? t.color : "#888",
                  borderRadius: "10px",
                  padding: "2px 8px",
                  fontSize: "11px",
                  fontWeight: "700",
                }}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{
            background: "#1E1E1E",
            border: "1px solid #333",
            borderTop: "none",
            borderRadius: "0 0 12px 12px",
            padding: "20px 24px",
            marginBottom: "24px"
          }}>
            {activeTab === "clips" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {(results.clips || []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px", color: "#666", fontSize: "13px" }}>
                    No clips extracted from this transcript.
                  </div>
                ) : (results.clips || []).map((clip, idx) => {
                  const sc = scoreColor(clip.viralityScore);
                  return (
                    <div key={idx} style={{
                      background: "#252525",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      padding: "16px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "4px" }}>
                            {clip.title}
                          </div>
                          <div style={{ fontSize: "11px", color: "#888" }}>
                            {clip.startTimecode} - {clip.endTimecode}
                          </div>
                        </div>
                        <div style={{
                          background: sc.bg,
                          border: `1px solid ${sc.border}`,
                          borderRadius: "6px",
                          padding: "4px 10px",
                          textAlign: "center",
                          flexShrink: 0,
                          marginLeft: "12px"
                        }}>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: sc.text }}>{clip.viralityScore}</div>
                          <div style={{ fontSize: "8px", color: "#888" }}>VIRAL</div>
                        </div>
                      </div>

                      {clip.hook && (
                        <div style={{
                          background: "#1a1a1a",
                          borderLeft: "3px solid #3b82f6",
                          borderRadius: "4px",
                          padding: "8px 12px",
                          marginBottom: "10px",
                          fontSize: "12px",
                          color: "#e0e0e0",
                          fontStyle: "italic"
                        }}>
                          Hook: {clip.hook}
                        </div>
                      )}

                      {clip.transcript_excerpt && (
                        <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6", marginBottom: "10px" }}>
                          {clip.transcript_excerpt}
                        </div>
                      )}

                      <div style={{ fontSize: "11px", color: "#888", marginBottom: "12px" }}>
                        {clip.rationale}
                      </div>

                      <button
                        onClick={() => clip._savedId && handleCreateBrief(clip._savedId)}
                        disabled={!clip._savedId || clip._briefCreated || briefCreating === clip._savedId}
                        style={{
                          background: clip._briefCreated ? "#166534" : "#374151",
                          border: `1px solid ${clip._briefCreated ? "#22c55e" : "#555"}`,
                          borderRadius: "6px",
                          padding: "6px 14px",
                          color: "#fff",
                          fontSize: "11px",
                          fontWeight: "600",
                          cursor: !clip._savedId || clip._briefCreated ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          opacity: clip._savedId ? 1 : 0.5,
                        }}
                      >
                        {clip._briefCreated ? (
                          <><Check size={12} /> Brief Created</>
                        ) : briefCreating === clip._savedId ? (
                          <><Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> Creating...</>
                        ) : (
                          <><Plus size={12} /> Create Brief</>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "shorts" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {(results.shorts || []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px", color: "#666", fontSize: "13px" }}>
                    No shorts extracted from this transcript.
                  </div>
                ) : (results.shorts || []).map((short, idx) => {
                  const sc = scoreColor(short.viralityScore);
                  return (
                    <div key={idx} style={{
                      background: "#252525",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      padding: "16px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "4px" }}>
                            {short.title}
                          </div>
                          <div style={{ fontSize: "11px", color: "#888" }}>
                            ~{short.timecode}
                          </div>
                        </div>
                        <div style={{
                          background: sc.bg,
                          border: `1px solid ${sc.border}`,
                          borderRadius: "6px",
                          padding: "4px 10px",
                          textAlign: "center",
                          flexShrink: 0,
                          marginLeft: "12px"
                        }}>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: sc.text }}>{short.viralityScore}</div>
                          <div style={{ fontSize: "8px", color: "#888" }}>VIRAL</div>
                        </div>
                      </div>

                      {short.hook && (
                        <div style={{
                          background: "#1a1a1a",
                          borderLeft: "3px solid #ec4899",
                          borderRadius: "4px",
                          padding: "8px 12px",
                          marginBottom: "10px",
                          fontSize: "12px",
                          color: "#e0e0e0",
                          fontStyle: "italic"
                        }}>
                          Hook: {short.hook}
                        </div>
                      )}

                      {short.transcript_excerpt && (
                        <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.6", marginBottom: "10px" }}>
                          {short.transcript_excerpt}
                        </div>
                      )}

                      <div style={{ fontSize: "11px", color: "#888", marginBottom: "8px" }}>
                        {short.rationale}
                      </div>

                      {short.suggestedCTA && (
                        <div style={{ fontSize: "11px", color: "#ec4899", marginBottom: "12px" }}>
                          CTA: {short.suggestedCTA}
                        </div>
                      )}

                      <button
                        onClick={() => short._savedId && handleCreateBrief(short._savedId)}
                        disabled={!short._savedId || short._briefCreated || briefCreating === short._savedId}
                        style={{
                          background: short._briefCreated ? "#166534" : "#374151",
                          border: `1px solid ${short._briefCreated ? "#22c55e" : "#555"}`,
                          borderRadius: "6px",
                          padding: "6px 14px",
                          color: "#fff",
                          fontSize: "11px",
                          fontWeight: "600",
                          cursor: !short._savedId || short._briefCreated ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          opacity: short._savedId ? 1 : 0.5,
                        }}
                      >
                        {short._briefCreated ? (
                          <><Check size={12} /> Brief Created</>
                        ) : briefCreating === short._savedId ? (
                          <><Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> Creating...</>
                        ) : (
                          <><Plus size={12} /> Create Brief</>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "quotes" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {(results.quotes || []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px", color: "#666", fontSize: "13px" }}>
                    No quotes extracted from this transcript.
                  </div>
                ) : (results.quotes || []).map((quote, idx) => {
                  const sc = scoreColor(quote.viralityScore);
                  return (
                    <div key={idx} style={{
                      background: "#252525",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      padding: "16px",
                      display: "flex",
                      gap: "14px",
                      alignItems: "flex-start"
                    }}>
                      <div style={{
                        background: sc.bg,
                        border: `1px solid ${sc.border}`,
                        borderRadius: "6px",
                        padding: "4px 10px",
                        textAlign: "center",
                        flexShrink: 0
                      }}>
                        <div style={{ fontSize: "14px", fontWeight: "700", color: sc.text }}>{quote.viralityScore}</div>
                        <div style={{ fontSize: "8px", color: "#888" }}>VIRAL</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: "15px",
                          fontWeight: "600",
                          color: "#fff",
                          fontStyle: "italic",
                          lineHeight: "1.5",
                          marginBottom: "8px"
                        }}>
                          "{quote.text}"
                        </div>
                        {quote.timecode && (
                          <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px" }}>
                            ~{quote.timecode}
                          </div>
                        )}
                        {quote.suggestedVisual && (
                          <div style={{ fontSize: "11px", color: "#f59e0b" }}>
                            Visual: {quote.suggestedVisual}
                          </div>
                        )}
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
