import { useState, useMemo, useEffect } from "react";
import {
  FileText,
  Copy,
  Check,
  Eye,
  TrendingUp,
  Zap,
  HelpCircle,
  Sparkles,
  MessageSquare,
  Target,
  Clock,
  BarChart3,
  Video,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  ExternalLink,
} from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

/**
 * OutreachBuilder - Creates personalized "Channel Notes" for cold outreach
 * Generates natural, personal emails — not formatted reports
 */
export default function OutreachBuilder({ audit, videoAnalysis }) {
  const snapshot = audit.channel_snapshot || {};
  const series = audit.series_summary || {};
  const benchmark = audit.benchmark_data || {};
  const videos = audit.videos || [];

  // Generate observation options from audit data (always 5+)
  const generatedObservations = useMemo(() => {
    return generateObservations(audit, videoAnalysis, videos);
  }, [audit, videoAnalysis, videos]);

  // Generate quick wins from audit data (always 5)
  const generatedQuickWins = useMemo(() => {
    return generateQuickWins(audit, videoAnalysis, videos);
  }, [audit, videoAnalysis, videos]);

  // Generate deeper questions (teases)
  const generatedTeases = useMemo(() => {
    return generateTeases(audit, videoAnalysis, videos, benchmark);
  }, [audit, videoAnalysis, videos, benchmark]);

  // Auto-select featured videos
  const autoSelectedVideos = useMemo(() => {
    return selectFeaturedVideos(videos, videoAnalysis);
  }, [videos, videoAnalysis]);

  // State
  const [personalNote, setPersonalNote] = useState("");
  const [selectedObservations, setSelectedObservations] = useState([]);
  const [customObservations, setCustomObservations] = useState([]);
  const [selectedQuickWin, setSelectedQuickWin] = useState(null);
  const [customQuickWin, setCustomQuickWin] = useState("");
  const [selectedTeases, setSelectedTeases] = useState([]);
  const [customTeases, setCustomTeases] = useState([]);
  const [featuredVideos, setFeaturedVideos] = useState([]);
  const [signOff, setSignOff] = useState(
    "Quick bit about us — we work with brands on YouTube, everything from channel strategy and direction to production, editing, and packaging (titles, thumbnails, the stuff that actually moves the needle). We're not trying to pitch you — just genuinely impressed by what you're building and wanted to share what we saw. If it ever makes sense to talk, we're here."
  );
  const [senderName, setSenderName] = useState("Jared");
  const [senderCompany, setSenderCompany] = useState("CRUX");
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    observations: true,
    quickWin: true,
    teases: true,
    videos: false,
  });

  // Initialize featured videos
  useEffect(() => {
    if (autoSelectedVideos.length > 0 && featuredVideos.length === 0) {
      setFeaturedVideos(autoSelectedVideos.map(v => ({
        ...v,
        caption: v.defaultCaption,
        included: true,
      })));
    }
  }, [autoSelectedVideos]);

  // Initialize with first 2 observations selected
  useEffect(() => {
    if (generatedObservations.length > 0 && selectedObservations.length === 0) {
      setSelectedObservations(generatedObservations.slice(0, 2).map(o => o.id));
    }
  }, [generatedObservations]);

  // Initialize with first quick win selected
  useEffect(() => {
    if (generatedQuickWins.length > 0 && selectedQuickWin === null) {
      setSelectedQuickWin(generatedQuickWins[0].id);
    }
  }, [generatedQuickWins]);

  // Initialize with first 2 teases selected
  useEffect(() => {
    if (generatedTeases.length > 0 && selectedTeases.length === 0) {
      setSelectedTeases(generatedTeases.slice(0, 2).map(t => t.id));
    }
  }, [generatedTeases]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleObservation = (id) => {
    setSelectedObservations(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleTease = (id) => {
    setSelectedTeases(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const addCustomObservation = () => {
    const id = `custom-obs-${Date.now()}`;
    setCustomObservations(prev => [...prev, { id, text: "" }]);
    setSelectedObservations(prev => [...prev, id]);
  };

  const updateCustomObservation = (id, text) => {
    setCustomObservations(prev => prev.map(o => o.id === id ? { ...o, text } : o));
  };

  const removeCustomObservation = (id) => {
    setCustomObservations(prev => prev.filter(o => o.id !== id));
    setSelectedObservations(prev => prev.filter(x => x !== id));
  };

  const addCustomTease = () => {
    const id = `custom-tease-${Date.now()}`;
    setCustomTeases(prev => [...prev, { id, text: "" }]);
    setSelectedTeases(prev => [...prev, id]);
  };

  const updateCustomTease = (id, text) => {
    setCustomTeases(prev => prev.map(t => t.id === id ? { ...t, text } : t));
  };

  const removeCustomTease = (id) => {
    setCustomTeases(prev => prev.filter(t => t.id !== id));
    setSelectedTeases(prev => prev.filter(x => x !== id));
  };

  const updateVideoCaption = (index, caption) => {
    setFeaturedVideos(prev => prev.map((v, i) => i === index ? { ...v, caption } : v));
  };

  const toggleVideoIncluded = (index) => {
    setFeaturedVideos(prev => prev.map((v, i) => i === index ? { ...v, included: !v.included } : v));
  };

  // Build final content for export
  const buildContent = () => {
    const observations = [
      ...generatedObservations.filter(o => selectedObservations.includes(o.id)),
      ...customObservations.filter(o => selectedObservations.includes(o.id) && o.text.trim()),
    ];

    const quickWin = selectedQuickWin === "custom"
      ? { text: customQuickWin }
      : generatedQuickWins.find(q => q.id === selectedQuickWin);

    const teases = [
      ...generatedTeases.filter(t => selectedTeases.includes(t.id)),
      ...customTeases.filter(t => selectedTeases.includes(t.id) && t.text.trim()),
    ];

    const includedVideos = featuredVideos.filter(v => v.included);

    return {
      channelName: snapshot.name,
      channelThumbnail: snapshot.thumbnail_url,
      subscriberCount: snapshot.subscriber_count,
      sizeTier: snapshot.size_tier,
      personalNote,
      observations,
      quickWin,
      teases,
      videos: includedVideos,
      signOff,
      senderName,
      senderCompany,
    };
  };

  // Copy as email - writes like a natural personal email
  const copyAsEmail = () => {
    const content = buildContent();
    let email = "";

    // Start with personal note as opening
    if (content.personalNote) {
      email += `${content.personalNote}\n\n`;
    }

    // Weave observations naturally into prose
    if (content.observations.length > 0) {
      email += "I spent some time going through your channel and wanted to share a few things that caught my eye:\n\n";
      content.observations.forEach(o => {
        if (o.videoUrl) {
          email += `${o.text}\n${o.videoUrl}\n\n`;
        } else {
          email += `${o.text}\n\n`;
        }
      });
    }

    // Quick win as a gift
    if (content.quickWin) {
      email += `One thought that might be useful: ${content.quickWin.text}\n\n`;
    }

    // Teases as curiosity hooks
    if (content.teases.length > 0) {
      email += "A few other things I'd be curious to explore with you:\n";
      content.teases.forEach(t => {
        email += `- ${t.text}\n`;
      });
      email += "\n";
    }

    // Sign-off flows naturally
    email += `${content.signOff}\n\n`;
    email += `${content.senderName}`;
    if (content.senderCompany) {
      email += `\n${content.senderCompany}`;
    }

    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export as PDF
  const exportPDF = async () => {
    setExporting(true);
    try {
      const content = buildContent();
      const el = buildPDFElement(content);
      document.body.appendChild(el);

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      document.body.removeChild(el);

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = 210;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgWidth, Math.min(imgHeight, 297));

      const channelName = (content.channelName || "Channel").replace(/[^a-zA-Z0-9]/g, "_");
      pdf.save(`Channel_Notes_${channelName}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("Failed to export PDF: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  const isValid = personalNote.trim().length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)",
        borderRadius: "12px",
        border: "1px solid rgba(139, 92, 246, 0.3)",
        padding: "20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <MessageSquare size={24} style={{ color: "#8b5cf6" }} />
          <div style={{ fontSize: "18px", fontWeight: "700" }}>Outreach Email Builder</div>
        </div>
        <div style={{ fontSize: "13px", color: "#9E9E9E", lineHeight: "1.6" }}>
          Craft a personal email to <strong style={{ color: "#E0E0E0" }}>{snapshot.name}</strong>.
          The output reads like a real email, not a report.
        </div>
      </div>

      {/* Personal Note (Required) */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <Sparkles size={18} style={{ color: "#f59e0b" }} />
          <div style={{ fontSize: "14px", fontWeight: "700" }}>Opening Line</div>
          <span style={{ fontSize: "11px", color: "#ef4444", marginLeft: "4px" }}>Required</span>
        </div>
        <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "12px" }}>
          Start with something specific. Reference a video you watched, a series you liked, or why you reached out.
        </div>
        <textarea
          value={personalNote}
          onChange={(e) => setPersonalNote(e.target.value)}
          placeholder="Hey! I came across your channel while researching [topic] and your video on [specific video] really stood out..."
          style={{
            width: "100%",
            minHeight: "100px",
            padding: "12px",
            background: "#252525",
            border: personalNote.trim() ? "1px solid #333" : "1px solid #ef4444",
            borderRadius: "8px",
            color: "#E0E0E0",
            fontSize: "13px",
            lineHeight: "1.6",
            resize: "vertical",
          }}
        />
      </div>

      {/* Observations - with video thumbnails */}
      <div style={cardStyle}>
        <button
          onClick={() => toggleSection("observations")}
          style={sectionHeaderStyle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Eye size={18} style={{ color: "#3b82f6" }} />
            <div style={{ fontSize: "14px", fontWeight: "700" }}>What I Noticed</div>
            <span style={{ fontSize: "11px", color: "#9E9E9E" }}>
              ({selectedObservations.length} selected)
            </span>
          </div>
          {expandedSections.observations ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandedSections.observations && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "12px" }}>
              Pick 2-3 observations. Each includes a link to the specific video when relevant.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {generatedObservations.map(obs => (
                <ObservationItem
                  key={obs.id}
                  observation={obs}
                  selected={selectedObservations.includes(obs.id)}
                  onToggle={() => toggleObservation(obs.id)}
                />
              ))}

              {customObservations.map(obs => (
                <div key={obs.id} style={{
                  display: "flex", gap: "8px", alignItems: "flex-start",
                  padding: "12px", background: "#252525", borderRadius: "8px",
                  border: selectedObservations.includes(obs.id) ? "1px solid #3b82f6" : "1px solid #333",
                }}>
                  <input
                    type="checkbox"
                    checked={selectedObservations.includes(obs.id)}
                    onChange={() => toggleObservation(obs.id)}
                    style={{ marginTop: "4px" }}
                  />
                  <textarea
                    value={obs.text}
                    onChange={(e) => updateCustomObservation(obs.id, e.target.value)}
                    placeholder="Your custom observation..."
                    style={{
                      flex: 1,
                      padding: "8px",
                      background: "#1E1E1E",
                      border: "1px solid #333",
                      borderRadius: "6px",
                      color: "#E0E0E0",
                      fontSize: "13px",
                      minHeight: "60px",
                      resize: "vertical",
                    }}
                  />
                  <button
                    onClick={() => removeCustomObservation(obs.id)}
                    style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer" }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}

              <button onClick={addCustomObservation} style={addButtonStyle}>
                <Plus size={14} />
                Add custom observation
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Win - 5 options */}
      <div style={cardStyle}>
        <button
          onClick={() => toggleSection("quickWin")}
          style={sectionHeaderStyle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Zap size={18} style={{ color: "#22c55e" }} />
            <div style={{ fontSize: "14px", fontWeight: "700" }}>Quick Win (The Gift)</div>
          </div>
          {expandedSections.quickWin ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandedSections.quickWin && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "12px" }}>
              One actionable thing they can use today. This is what makes the email valuable even if they never reply.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {generatedQuickWins.map(qw => (
                <QuickWinItem
                  key={qw.id}
                  quickWin={qw}
                  selected={selectedQuickWin === qw.id}
                  onSelect={() => setSelectedQuickWin(qw.id)}
                />
              ))}

              {/* Custom quick win option */}
              <div style={{
                display: "flex", gap: "8px", alignItems: "flex-start",
                padding: "12px", background: "#252525", borderRadius: "8px",
                border: selectedQuickWin === "custom" ? "1px solid #22c55e" : "1px solid #333",
              }}>
                <input
                  type="radio"
                  name="quickWin"
                  checked={selectedQuickWin === "custom"}
                  onChange={() => setSelectedQuickWin("custom")}
                  style={{ marginTop: "4px" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "6px" }}>Write your own:</div>
                  <textarea
                    value={customQuickWin}
                    onChange={(e) => setCustomQuickWin(e.target.value)}
                    onFocus={() => setSelectedQuickWin("custom")}
                    placeholder="Your custom quick win..."
                    style={{
                      width: "100%",
                      padding: "8px",
                      background: "#1E1E1E",
                      border: "1px solid #333",
                      borderRadius: "6px",
                      color: "#E0E0E0",
                      fontSize: "13px",
                      minHeight: "60px",
                      resize: "vertical",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Deeper Questions (Teases) */}
      <div style={cardStyle}>
        <button
          onClick={() => toggleSection("teases")}
          style={sectionHeaderStyle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <HelpCircle size={18} style={{ color: "#8b5cf6" }} />
            <div style={{ fontSize: "14px", fontWeight: "700" }}>What I'd Explore Further</div>
            <span style={{ fontSize: "11px", color: "#9E9E9E" }}>
              ({selectedTeases.length} selected)
            </span>
          </div>
          {expandedSections.teases ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandedSections.teases && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "12px" }}>
              2-3 things you'd dig into if you worked together. Creates curiosity without overpromising.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {generatedTeases.map(tease => (
                <TeaseItem
                  key={tease.id}
                  tease={tease}
                  selected={selectedTeases.includes(tease.id)}
                  onToggle={() => toggleTease(tease.id)}
                />
              ))}

              {customTeases.map(tease => (
                <div key={tease.id} style={{
                  display: "flex", gap: "8px", alignItems: "flex-start",
                  padding: "12px", background: "#252525", borderRadius: "8px",
                  border: selectedTeases.includes(tease.id) ? "1px solid #8b5cf6" : "1px solid #333",
                }}>
                  <input
                    type="checkbox"
                    checked={selectedTeases.includes(tease.id)}
                    onChange={() => toggleTease(tease.id)}
                    style={{ marginTop: "4px" }}
                  />
                  <textarea
                    value={tease.text}
                    onChange={(e) => updateCustomTease(tease.id, e.target.value)}
                    placeholder="Your custom question..."
                    style={{
                      flex: 1,
                      padding: "8px",
                      background: "#1E1E1E",
                      border: "1px solid #333",
                      borderRadius: "6px",
                      color: "#E0E0E0",
                      fontSize: "13px",
                      minHeight: "60px",
                      resize: "vertical",
                    }}
                  />
                  <button
                    onClick={() => removeCustomTease(tease.id)}
                    style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer" }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}

              <button onClick={addCustomTease} style={addButtonStyle}>
                <Plus size={14} />
                Add custom question
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Featured Videos - collapsed by default */}
      <div style={cardStyle}>
        <button
          onClick={() => toggleSection("videos")}
          style={sectionHeaderStyle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Video size={18} style={{ color: "#ec4899" }} />
            <div style={{ fontSize: "14px", fontWeight: "700" }}>Reference Videos</div>
            <span style={{ fontSize: "11px", color: "#666" }}>(optional, for PDF only)</span>
          </div>
          {expandedSections.videos ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandedSections.videos && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "12px" }}>
              These appear in the PDF attachment. The email itself references videos inline via the observations.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {featuredVideos.map((video, index) => (
                <div key={index} style={{
                  display: "flex", gap: "12px",
                  padding: "12px", background: "#252525", borderRadius: "8px",
                  border: video.included ? "1px solid #ec4899" : "1px solid #333",
                  opacity: video.included ? 1 : 0.5,
                }}>
                  <input
                    type="checkbox"
                    checked={video.included}
                    onChange={() => toggleVideoIncluded(index)}
                    style={{ marginTop: "4px" }}
                  />
                  {video.thumbnail && (
                    <img
                      src={video.thumbnail}
                      alt=""
                      style={{ width: "100px", height: "56px", borderRadius: "6px", objectFit: "cover" }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: "500", marginBottom: "6px", color: "#E0E0E0" }}>
                      {video.title}
                    </div>
                    <input
                      type="text"
                      value={video.caption}
                      onChange={(e) => updateVideoCaption(index, e.target.value)}
                      placeholder="Your note about this video..."
                      style={{
                        width: "100%",
                        padding: "8px",
                        background: "#1E1E1E",
                        border: "1px solid #333",
                        borderRadius: "6px",
                        color: "#E0E0E0",
                        fontSize: "12px",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sign-off */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <MessageSquare size={18} style={{ color: "#6b7280" }} />
          <div style={{ fontSize: "14px", fontWeight: "700" }}>Closing</div>
        </div>
        <textarea
          value={signOff}
          onChange={(e) => setSignOff(e.target.value)}
          style={{
            width: "100%",
            minHeight: "80px",
            padding: "12px",
            background: "#252525",
            border: "1px solid #333",
            borderRadius: "8px",
            color: "#E0E0E0",
            fontSize: "13px",
            lineHeight: "1.6",
            resize: "vertical",
            marginBottom: "12px",
          }}
        />
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Your name</div>
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Company (optional)</div>
            <input
              type="text"
              value={senderCompany}
              onChange={(e) => setSenderCompany(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: "flex", gap: "12px", justifyContent: "flex-end",
        padding: "16px 0",
        borderTop: "1px solid #333",
      }}>
        <button
          onClick={() => setShowPreview(!showPreview)}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "10px 16px", background: "#252525", border: "1px solid #444",
            borderRadius: "8px", color: "#E0E0E0", cursor: "pointer", fontSize: "13px",
          }}
        >
          <Eye size={16} />
          {showPreview ? "Hide Preview" : "Preview Email"}
        </button>

        <button
          onClick={copyAsEmail}
          disabled={!isValid}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "10px 16px",
            background: isValid ? "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)" : "#252525",
            border: isValid ? "none" : "1px solid #444",
            borderRadius: "8px", color: "#fff",
            cursor: isValid ? "pointer" : "not-allowed",
            fontSize: "13px", fontWeight: "600",
            opacity: isValid ? 1 : 0.5,
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Copied!" : "Copy Email"}
        </button>

        <button
          onClick={exportPDF}
          disabled={!isValid || exporting}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "10px 16px", background: "#252525", border: "1px solid #444",
            borderRadius: "8px", color: "#E0E0E0",
            cursor: isValid ? "pointer" : "not-allowed", fontSize: "13px",
            opacity: isValid ? 1 : 0.5,
          }}
        >
          <FileText size={16} />
          {exporting ? "Exporting..." : "Export PDF"}
        </button>
      </div>

      {!isValid && (
        <div style={{ fontSize: "12px", color: "#ef4444", textAlign: "right", marginTop: "-8px" }}>
          Add an opening line to enable export.
        </div>
      )}

      {/* Preview - shows as plain email */}
      {showPreview && (
        <div style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "32px",
          color: "#333",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: "14px",
          lineHeight: "1.7",
          whiteSpace: "pre-wrap",
        }}>
          <EmailPreview content={buildContent()} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function ObservationItem({ observation, selected, onToggle }) {
  return (
    <div style={{
      display: "flex", gap: "12px", alignItems: "flex-start",
      padding: "12px", background: "#252525", borderRadius: "8px",
      border: selected ? "1px solid #3b82f6" : "1px solid #333",
      cursor: "pointer",
    }} onClick={onToggle}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        style={{ marginTop: "2px" }}
      />
      <div style={{ flex: 1 }}>
        {/* Show thumbnail if observation has a linked video */}
        {observation.thumbnail && (
          <div style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
            <img
              src={observation.thumbnail}
              alt=""
              style={{ width: "80px", height: "45px", borderRadius: "4px", objectFit: "cover" }}
            />
            {observation.videoUrl && (
              <a
                href={observation.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: "11px", color: "#60a5fa",
                  display: "flex", alignItems: "center", gap: "4px",
                }}
              >
                <ExternalLink size={12} />
                View video
              </a>
            )}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
          {observation.icon}
          <span style={{
            fontSize: "10px", fontWeight: "600", padding: "2px 6px", borderRadius: "4px",
            background: observation.type === "compliment" ? "#22c55e20" : observation.type === "opportunity" ? "#f59e0b20" : "#3b82f620",
            color: observation.type === "compliment" ? "#22c55e" : observation.type === "opportunity" ? "#f59e0b" : "#3b82f6",
            textTransform: "uppercase",
          }}>
            {observation.type}
          </span>
        </div>
        <div style={{ fontSize: "13px", color: "#E0E0E0", lineHeight: "1.5" }}>
          {observation.text}
        </div>
      </div>
    </div>
  );
}

function QuickWinItem({ quickWin, selected, onSelect }) {
  return (
    <div style={{
      display: "flex", gap: "12px", alignItems: "flex-start",
      padding: "12px", background: "#252525", borderRadius: "8px",
      border: selected ? "1px solid #22c55e" : "1px solid #333",
      cursor: "pointer",
    }} onClick={onSelect}>
      <input
        type="radio"
        name="quickWin"
        checked={selected}
        onChange={onSelect}
        onClick={(e) => e.stopPropagation()}
        style={{ marginTop: "2px" }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
          {quickWin.icon}
          <span style={{
            fontSize: "10px", fontWeight: "600", padding: "2px 6px", borderRadius: "4px",
            background: "#22c55e20", color: "#22c55e", textTransform: "uppercase",
          }}>
            {quickWin.category}
          </span>
        </div>
        <div style={{ fontSize: "13px", color: "#E0E0E0", lineHeight: "1.5" }}>
          {quickWin.text}
        </div>
      </div>
    </div>
  );
}

function TeaseItem({ tease, selected, onToggle }) {
  return (
    <div style={{
      display: "flex", gap: "12px", alignItems: "flex-start",
      padding: "12px", background: "#252525", borderRadius: "8px",
      border: selected ? "1px solid #8b5cf6" : "1px solid #333",
      cursor: "pointer",
    }} onClick={onToggle}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        style={{ marginTop: "2px" }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "13px", color: "#E0E0E0", lineHeight: "1.5" }}>
          {tease.text}
        </div>
      </div>
    </div>
  );
}

function EmailPreview({ content }) {
  let email = "";

  if (content.personalNote) {
    email += content.personalNote + "\n\n";
  }

  if (content.observations.length > 0) {
    email += "I spent some time looking at your channel and a few things stood out:\n\n";
    content.observations.forEach(o => {
      if (o.videoUrl) {
        email += o.text + "\n" + o.videoUrl + "\n\n";
      } else {
        email += o.text + "\n\n";
      }
    });
  }

  if (content.quickWin) {
    email += "One thing you could try right away: " + content.quickWin.text + "\n\n";
  }

  if (content.teases.length > 0) {
    email += "If you're curious, I'd love to dig into:\n";
    content.teases.forEach(t => {
      email += "- " + t.text + "\n";
    });
    email += "\n";
  }

  email += content.signOff + "\n\n";
  email += content.senderName;
  if (content.senderCompany) {
    email += "\n" + content.senderCompany;
  }

  return <div>{email}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

function generateObservations(audit, videoAnalysis, videos) {
  const observations = [];
  const snapshot = audit.channel_snapshot || {};
  const series = audit.series_summary || {};
  const benchmark = audit.benchmark_data || {};

  // Sort videos by views for reference
  const sortedByViews = [...videos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
  const topVideo = sortedByViews[0];

  // 1. Top performing video (always include with thumbnail)
  if (topVideo) {
    observations.push({
      id: "top-video",
      type: "compliment",
      icon: <TrendingUp size={14} style={{ color: "#22c55e" }} />,
      text: `"${topVideo.title}" is a standout — ${(topVideo.view_count || 0).toLocaleString()} views. You clearly tapped into something your audience cares about here.`,
      thumbnail: topVideo.thumbnail_url,
      videoUrl: topVideo.youtube_video_id ? `https://youtube.com/watch?v=${topVideo.youtube_video_id}` : null,
    });
  }

  // 2. Series performance (with example video)
  if (series.series?.length > 0) {
    const topSeries = [...series.series].sort((a, b) => (b.avgViews || 0) - (a.avgViews || 0))[0];
    if (topSeries && topSeries.videoCount >= 3) {
      const seriesVideo = videos.find(v => v.title?.toLowerCase().includes(topSeries.name?.toLowerCase().slice(0, 10)));
      observations.push({
        id: "series-performance",
        type: "compliment",
        icon: <TrendingUp size={14} style={{ color: "#22c55e" }} />,
        text: `The "${topSeries.name}" series is clearly resonating — ${topSeries.videoCount} episodes in, averaging ${(topSeries.avgViews || 0).toLocaleString()} views. That kind of consistency builds real audience trust.`,
        thumbnail: seriesVideo?.thumbnail_url || topSeries.thumbnail,
        videoUrl: seriesVideo?.youtube_video_id ? `https://youtube.com/watch?v=${seriesVideo.youtube_video_id}` : null,
      });
    }
  }

  // 3. Investigation candidate (high reach, low engagement)
  if (videoAnalysis?.investigateVideos?.length > 0) {
    const investigateVideo = videoAnalysis.investigateVideos[0];
    observations.push({
      id: "investigate-video",
      type: "insight",
      icon: <HelpCircle size={14} style={{ color: "#3b82f6" }} />,
      text: `This one's interesting — "${investigateVideo.title}" pulled ${(investigateVideo.view_count || 0).toLocaleString()} views but the engagement didn't match the reach. Feels like the algorithm caught a wave, but the audience might have been different than your usual viewers. Would be worth looking at the traffic sources.`,
      thumbnail: investigateVideo.thumbnail_url,
      videoUrl: investigateVideo.youtube_video_id ? `https://youtube.com/watch?v=${investigateVideo.youtube_video_id}` : null,
    });
  }

  // 4. Shorts opportunity (with example)
  const shorts = videos.filter(v => v.is_short || (v.duration && v.duration < 62));
  const longForm = videos.filter(v => !v.is_short && (!v.duration || v.duration >= 62));

  if (shorts.length > 0 && longForm.length > 0) {
    const shortsAvg = shorts.reduce((s, v) => s + (v.view_count || 0), 0) / shorts.length;
    const longAvg = longForm.reduce((s, v) => s + (v.view_count || 0), 0) / longForm.length;
    const topShort = [...shorts].sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0];

    if (shortsAvg > longAvg * 1.3) {
      observations.push({
        id: "shorts-winning",
        type: "opportunity",
        icon: <Zap size={14} style={{ color: "#f59e0b" }} />,
        text: `Your Shorts are averaging ${(shortsAvg / longAvg).toFixed(1)}x the views of your long-form content — that's a real signal. Seems like your audience wants more of those bite-sized takes.`,
        thumbnail: topShort?.thumbnail_url,
        videoUrl: topShort?.youtube_video_id ? `https://youtube.com/watch?v=${topShort.youtube_video_id}` : null,
      });
    }
  }

  // 5. Recent momentum or drop
  const recentVideos = videos.filter(v => {
    if (!v.published_at) return false;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 1);
    return new Date(v.published_at) > cutoff;
  }).sort((a, b) => (b.view_count || 0) - (a.view_count || 0));

  if (recentVideos.length > 0) {
    const recentTop = recentVideos[0];
    const recentAvg = recentVideos.reduce((s, v) => s + (v.view_count || 0), 0) / recentVideos.length;
    const overallAvg = videos.reduce((s, v) => s + (v.view_count || 0), 0) / videos.length;

    if (recentAvg > overallAvg * 1.2) {
      observations.push({
        id: "recent-momentum",
        type: "compliment",
        icon: <TrendingUp size={14} style={{ color: "#22c55e" }} />,
        text: `You've got real momentum right now — your recent uploads are outpacing your usual numbers. "${recentTop.title}" being a good example. Whatever shifted, it's working.`,
        thumbnail: recentTop.thumbnail_url,
        videoUrl: recentTop.youtube_video_id ? `https://youtube.com/watch?v=${recentTop.youtube_video_id}` : null,
      });
    } else if (recentAvg < overallAvg * 0.7 && recentVideos.length >= 3) {
      observations.push({
        id: "recent-dip",
        type: "insight",
        icon: <Clock size={14} style={{ color: "#3b82f6" }} />,
        text: `Your recent videos are landing below where they usually do. Could be a few things — topic selection, packaging, or just timing. Sometimes small tweaks to titles and thumbnails unlock it again.`,
        thumbnail: recentTop.thumbnail_url,
        videoUrl: recentTop.youtube_video_id ? `https://youtube.com/watch?v=${recentTop.youtube_video_id}` : null,
      });
    }
  }

  // 6. Benchmark comparison
  if (benchmark.hasBenchmarks && benchmark.comparison?.overallScore) {
    if (benchmark.comparison.overallScore >= 1.3) {
      observations.push({
        id: "benchmark-strong",
        type: "compliment",
        icon: <Target size={14} style={{ color: "#22c55e" }} />,
        text: `For context, we looked at ${benchmark.peer_count} channels in your space — and you're outperforming most of them by about ${Math.round((benchmark.comparison.overallScore - 1) * 100)}%. That's genuinely impressive and not something we see often.`,
      });
    }
  }

  // 7. Engagement standout
  if (videoAnalysis?.categorized) {
    const highEngagement = videoAnalysis.categorized
      .filter(v => v.engagement_ratio > 1.5 && !v.is_high_reach)
      .sort((a, b) => b.engagement_ratio - a.engagement_ratio)[0];

    if (highEngagement) {
      observations.push({
        id: "engagement-gem",
        type: "insight",
        icon: <Sparkles size={14} style={{ color: "#8b5cf6" }} />,
        text: `"${highEngagement.title}" is a hidden gem — it didn't get the biggest reach, but your audience was ${highEngagement.engagement_ratio}x more engaged than usual. That kind of content builds a loyal community even if the algorithm doesn't always reward it.`,
        thumbnail: highEngagement.thumbnail_url,
        videoUrl: highEngagement.youtube_video_id ? `https://youtube.com/watch?v=${highEngagement.youtube_video_id}` : null,
      });
    }
  }

  // Ensure we have at least 5 observations
  while (observations.length < 5) {
    const remainingVideos = sortedByViews.filter(v =>
      !observations.some(o => o.videoUrl?.includes(v.youtube_video_id))
    );

    if (remainingVideos.length === 0) break;

    const video = remainingVideos[observations.length % remainingVideos.length];
    observations.push({
      id: `video-${observations.length}`,
      type: "compliment",
      icon: <Video size={14} style={{ color: "#ec4899" }} />,
      text: `Really liked "${video.title}" — ${(video.view_count || 0).toLocaleString()} views and the topic clearly landed.`,
      thumbnail: video.thumbnail_url,
      videoUrl: video.youtube_video_id ? `https://youtube.com/watch?v=${video.youtube_video_id}` : null,
    });
  }

  return observations.slice(0, 7); // Max 7 options
}

function generateQuickWins(audit, videoAnalysis, videos) {
  const quickWins = [];
  const snapshot = audit.channel_snapshot || {};

  // Sort for analysis
  const sortedByViews = [...videos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
  const top20pct = sortedByViews.slice(0, Math.max(Math.ceil(videos.length * 0.2), 3));

  // 1. Title pattern - numbers
  const topWithNumbers = top20pct.filter(v => /\d/.test(v.title || "")).length;
  const recentWithoutNumbers = videos.slice(0, 5).filter(v => !/\d/.test(v.title || "")).length;

  if (topWithNumbers >= 2 && recentWithoutNumbers >= 2) {
    quickWins.push({
      id: "title-numbers",
      category: "packaging",
      icon: <Sparkles size={14} style={{ color: "#22c55e" }} />,
      text: `Something we noticed in your data — ${topWithNumbers} of your best-performing videos use numbers in the title. Your recent uploads haven't. Small tweak, but worth testing on your next upload to see if it moves the click-through rate.`,
    });
  }

  // 2. Title pattern - questions
  const topWithQuestions = top20pct.filter(v => /\?/.test(v.title || "")).length;
  if (topWithQuestions >= 2) {
    quickWins.push({
      id: "title-questions",
      category: "packaging",
      icon: <Sparkles size={14} style={{ color: "#22c55e" }} />,
      text: `Your audience clearly responds to curiosity — ${topWithQuestions} of your top performers use questions in the title. Leaning into that more could be an easy win.`,
    });
  }

  // 3. Shorts recency
  const shorts = videos.filter(v => v.is_short || (v.duration && v.duration < 62))
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

  if (shorts.length > 0) {
    const lastShort = shorts[0];
    const daysSinceShort = Math.floor((Date.now() - new Date(lastShort.published_at)) / (1000 * 60 * 60 * 24));

    if (daysSinceShort > 14) {
      quickWins.push({
        id: "shorts-recency",
        category: "format",
        icon: <Video size={14} style={{ color: "#22c55e" }} />,
        text: `It's been ${daysSinceShort} days since your last Short. You don't need to create new content for these — pulling a strong 30-second moment from a recent long-form video works great as a way to bring new people into your world.`,
      });
    }
  }

  // 4. Upload consistency
  const uploadDates = videos
    .filter(v => v.published_at)
    .map(v => new Date(v.published_at))
    .sort((a, b) => b - a);

  if (uploadDates.length >= 5) {
    const gaps = [];
    for (let i = 0; i < Math.min(uploadDates.length - 1, 10); i++) {
      gaps.push((uploadDates[i] - uploadDates[i + 1]) / (1000 * 60 * 60 * 24));
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const maxGap = Math.max(...gaps);

    if (maxGap > avgGap * 2 && maxGap > 10) {
      quickWins.push({
        id: "consistency",
        category: "cadence",
        icon: <Clock size={14} style={{ color: "#22c55e" }} />,
        text: `There are some gaps in your upload schedule (up to ${Math.round(maxGap)} days between videos). Consistency matters more than volume on YouTube — even a lighter-lift video during slower periods keeps your audience and the algorithm engaged.`,
      });
    }
  }

  // 5. Engagement CTA
  if (snapshot.avg_engagement_recent && snapshot.avg_engagement_recent < 0.04) {
    quickWins.push({
      id: "engagement-cta",
      category: "engagement",
      icon: <MessageSquare size={14} style={{ color: "#22c55e" }} />,
      text: `One thing we've seen work well for channels your size — ending with a specific question for the audience. Not "like and subscribe" but something related to the video topic. It invites conversation and signals to YouTube that people care about what you're making.`,
    });
  }

  // 6. Thumbnail consistency
  quickWins.push({
    id: "thumbnail-test",
    category: "packaging",
    icon: <Sparkles size={14} style={{ color: "#22c55e" }} />,
    text: `YouTube now lets you A/B test thumbnails — worth trying on one of your recent videos that underperformed. Sometimes a bolder thumbnail (more contrast, cleaner text, or a different still) unlocks a video that the algorithm overlooked.`,
  });

  // 7. Series format
  quickWins.push({
    id: "series-format",
    category: "content",
    icon: <Target size={14} style={{ color: "#22c55e" }} />,
    text: `Your best-performing topic has series potential. Revisiting a winning topic as a "part 2" or follow-up gives you a built-in audience from the first video and YouTube tends to recommend them together.`,
  });

  // Return exactly 5
  return quickWins.slice(0, 5);
}

function generateTeases(audit, videoAnalysis, videos, benchmark) {
  const teases = [];
  const snapshot = audit.channel_snapshot || {};

  teases.push({
    id: "retention-analysis",
    text: "Where viewers are dropping off in your videos — and what small editing or pacing changes tend to fix it",
  });

  if (benchmark.hasBenchmarks) {
    teases.push({
      id: "competitor-analysis",
      text: `How your channel compares to ${benchmark.peer_count} others in your space — not to compete, but to spot what's working for similar audiences`,
    });
  }

  if (videoAnalysis?.investigateVideos?.length > 0) {
    teases.push({
      id: "investigate-deep-dive",
      text: `The pattern behind ${videoAnalysis.investigateVideos.length} of your videos that got big reach but lower engagement — there's something interesting happening there`,
    });
  }

  teases.push({
    id: "content-pillars",
    text: "Which topics are actually converting viewers into subscribers vs. just getting one-time views — they're often different",
  });

  teases.push({
    id: "packaging-formula",
    text: "Your specific title and thumbnail patterns that outperform — based on your own data, not generic YouTube advice",
  });

  teases.push({
    id: "growth-roadmap",
    text: `A focused content direction for the next quarter, built around what's already resonating with your audience`,
  });

  return teases.slice(0, 5);
}

function selectFeaturedVideos(videos, videoAnalysis) {
  const selected = [];
  if (!videos.length) return selected;

  // Best performer with good engagement
  if (videoAnalysis?.highReachVideos) {
    const win = videoAnalysis.highReachVideos.find(v => !v.is_low_engagement);
    if (win) {
      selected.push({
        ...win,
        role: "win",
        roleLabel: "Top Performer",
        defaultCaption: "This one connected.",
      });
    }
  }

  // Investigation candidate
  if (videoAnalysis?.investigateVideos?.length > 0) {
    const question = videoAnalysis.investigateVideos[0];
    selected.push({
      ...question,
      role: "question",
      roleLabel: "Worth Exploring",
      defaultCaption: "High reach, unusual engagement pattern.",
    });
  }

  // Fill with top performers
  const remaining = [...videos]
    .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
    .filter(v => !selected.find(s => s.id === v.id || s.youtube_video_id === v.youtube_video_id));

  for (const video of remaining) {
    if (selected.length >= 3) break;
    selected.push({
      ...video,
      role: "highlight",
      roleLabel: "Notable",
      defaultCaption: "Solid performance.",
    });
  }

  return selected.map(v => ({
    id: v.id || v.youtube_video_id,
    title: v.title,
    thumbnail: v.thumbnail_url,
    role: v.role,
    roleLabel: v.roleLabel,
    defaultCaption: v.defaultCaption,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildPDFElement(content) {
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = "-9999px";
  el.style.width = "800px";
  el.style.backgroundColor = "#ffffff";
  el.style.padding = "48px";
  el.style.fontFamily = "Georgia, serif";
  el.style.color = "#333";
  el.style.fontSize = "14px";
  el.style.lineHeight = "1.8";

  const esc = (str) => {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  let html = "";

  // Header - minimal
  html += `
    <div style="margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid #eee;">
      <div style="font-size:12px;color:#888;margin-bottom:4px;">Notes for</div>
      <div style="font-size:24px;font-weight:600;color:#1a1a2e;">${esc(content.channelName)}</div>
    </div>
  `;

  // Personal note
  if (content.personalNote) {
    html += `<div style="margin-bottom:24px;">${esc(content.personalNote)}</div>`;
  }

  // Observations as prose
  if (content.observations.length > 0) {
    html += `<div style="margin-bottom:24px;">`;
    html += `<div style="font-weight:600;margin-bottom:12px;">A few things I noticed:</div>`;
    content.observations.forEach(o => {
      html += `<div style="margin-bottom:12px;padding-left:16px;border-left:2px solid #e5e7eb;">`;
      html += esc(o.text);
      if (o.videoUrl) {
        html += `<br/><span style="font-size:12px;color:#3b82f6;">${esc(o.videoUrl)}</span>`;
      }
      html += `</div>`;
    });
    html += `</div>`;
  }

  // Quick win
  if (content.quickWin) {
    html += `
      <div style="margin-bottom:24px;padding:16px;background:#f0fdf4;border-radius:8px;">
        <div style="font-weight:600;margin-bottom:8px;">Something you could try:</div>
        <div>${esc(content.quickWin.text)}</div>
      </div>
    `;
  }

  // Teases
  if (content.teases.length > 0) {
    html += `<div style="margin-bottom:24px;">`;
    html += `<div style="font-weight:600;margin-bottom:8px;">If you're curious, I'd love to explore:</div>`;
    content.teases.forEach(t => {
      html += `<div style="margin-bottom:4px;">• ${esc(t.text)}</div>`;
    });
    html += `</div>`;
  }

  // Videos - only if included
  if (content.videos.length > 0) {
    html += `
      <div style="margin-bottom:24px;">
        <div style="font-weight:600;margin-bottom:12px;">Videos that stood out:</div>
        <div style="display:flex;gap:16px;">
          ${content.videos.map(v => `
            <div style="flex:1;">
              ${v.thumbnail ? `<img src="${v.thumbnail}" style="width:100%;border-radius:6px;margin-bottom:8px;" />` : ""}
              <div style="font-size:12px;font-weight:500;">${esc(v.title?.slice(0, 40))}${v.title?.length > 40 ? "..." : ""}</div>
              <div style="font-size:11px;color:#666;font-style:italic;">${esc(v.caption)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  // Sign-off
  html += `
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #eee;">
      <div style="margin-bottom:16px;">${esc(content.signOff)}</div>
      <div style="font-weight:600;">${esc(content.senderName)}</div>
      ${content.senderCompany ? `<div style="color:#666;">${esc(content.senderCompany)}</div>` : ""}
    </div>
  `;

  el.innerHTML = html;
  return el;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const cardStyle = {
  background: "#1E1E1E",
  borderRadius: "12px",
  border: "1px solid #333",
  padding: "20px",
};

const sectionHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  background: "transparent",
  border: "none",
  color: "#E0E0E0",
  cursor: "pointer",
  padding: 0,
};

const addButtonStyle = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "10px 14px",
  background: "transparent",
  border: "1px dashed #444",
  borderRadius: "8px",
  color: "#9E9E9E",
  cursor: "pointer",
  fontSize: "12px",
  width: "100%",
  justifyContent: "center",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  background: "#252525",
  border: "1px solid #333",
  borderRadius: "8px",
  color: "#E0E0E0",
  fontSize: "13px",
};
