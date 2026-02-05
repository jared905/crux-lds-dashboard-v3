import { useState, useMemo, useEffect } from "react";
import {
  Mail,
  Linkedin,
  FileText,
  Copy,
  Check,
  Eye,
  TrendingUp,
  TrendingDown,
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
} from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

/**
 * OutreachBuilder - Creates personalized "Channel Notes" for cold outreach
 * Pulls insights from audit data but requires human curation and personal touch
 */
export default function OutreachBuilder({ audit, videoAnalysis }) {
  const snapshot = audit.channel_snapshot || {};
  const series = audit.series_summary || {};
  const benchmark = audit.benchmark_data || {};
  const videos = audit.videos || [];
  const recommendations = audit.recommendations || {};

  // Generate observation options from audit data
  const generatedObservations = useMemo(() => {
    return generateObservations(audit, videoAnalysis, videos);
  }, [audit, videoAnalysis, videos]);

  // Generate quick wins from audit data
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
    "We're fans of what you're building. If there's ever an opportunity to help, we'd love to be part of it. Either way — keep going."
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
    videos: true,
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

  // Copy as email
  const copyAsEmail = () => {
    const content = buildContent();
    let email = "";

    if (content.personalNote) {
      email += `${content.personalNote}\n\n`;
    }

    if (content.observations.length > 0) {
      email += "What We Noticed:\n";
      content.observations.forEach(o => {
        email += `• ${o.text}\n`;
      });
      email += "\n";
    }

    if (content.quickWin) {
      email += "Quick Win:\n";
      email += `${content.quickWin.text}\n\n`;
    }

    if (content.teases.length > 0) {
      email += "What We'd Dig Into:\n";
      content.teases.forEach(t => {
        email += `• ${t.text}\n`;
      });
      email += "\n";
    }

    if (content.videos.length > 0) {
      email += "Videos That Stood Out:\n";
      content.videos.forEach(v => {
        email += `• "${v.title}" — ${v.caption}\n`;
      });
      email += "\n";
    }

    email += `${content.signOff}\n\n`;
    email += `— ${content.senderName}, ${content.senderCompany}`;

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
          <div style={{ fontSize: "18px", fontWeight: "700" }}>Channel Notes for Outreach</div>
        </div>
        <div style={{ fontSize: "13px", color: "#9E9E9E", lineHeight: "1.6" }}>
          Create a personalized, value-first message for <strong style={{ color: "#E0E0E0" }}>{snapshot.name}</strong>.
          Select the insights that matter, add your personal touch, and export.
        </div>
      </div>

      {/* Personal Note (Required) */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <Sparkles size={18} style={{ color: "#f59e0b" }} />
          <div style={{ fontSize: "14px", fontWeight: "700" }}>Personal Note</div>
          <span style={{ fontSize: "11px", color: "#ef4444", marginLeft: "4px" }}>Required</span>
        </div>
        <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "12px" }}>
          Start with something specific about their work. This can't be auto-generated — it has to come from you.
        </div>
        <textarea
          value={personalNote}
          onChange={(e) => setPersonalNote(e.target.value)}
          placeholder="I've been watching your content for a few months now, and your [specific series/video] really stood out to me because..."
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

      {/* Observations */}
      <div style={cardStyle}>
        <button
          onClick={() => toggleSection("observations")}
          style={sectionHeaderStyle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Eye size={18} style={{ color: "#3b82f6" }} />
            <div style={{ fontSize: "14px", fontWeight: "700" }}>What We Noticed</div>
            <span style={{ fontSize: "11px", color: "#9E9E9E" }}>
              ({selectedObservations.length} selected)
            </span>
          </div>
          {expandedSections.observations ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandedSections.observations && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "12px" }}>
              Select 2-3 specific observations. Include at least one genuine compliment.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
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

      {/* Quick Win */}
      <div style={cardStyle}>
        <button
          onClick={() => toggleSection("quickWin")}
          style={sectionHeaderStyle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Zap size={18} style={{ color: "#22c55e" }} />
            <div style={{ fontSize: "14px", fontWeight: "700" }}>Quick Win</div>
            <span style={{ fontSize: "11px", color: "#9E9E9E" }}>
              (1 selected)
            </span>
          </div>
          {expandedSections.quickWin ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandedSections.quickWin && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "12px" }}>
              One actionable thing they can use today — no strings attached. This is the gift.
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
                  <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "6px" }}>Custom quick win:</div>
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
            <div style={{ fontSize: "14px", fontWeight: "700" }}>What We'd Dig Into</div>
            <span style={{ fontSize: "11px", color: "#9E9E9E" }}>
              ({selectedTeases.length} selected)
            </span>
          </div>
          {expandedSections.teases ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandedSections.teases && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "12px" }}>
              2-3 things you <em>could</em> explore together. Creates curiosity without overpromising.
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

      {/* Featured Videos */}
      <div style={cardStyle}>
        <button
          onClick={() => toggleSection("videos")}
          style={sectionHeaderStyle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Video size={18} style={{ color: "#ec4899" }} />
            <div style={{ fontSize: "14px", fontWeight: "700" }}>Featured Videos</div>
            <span style={{ fontSize: "11px", color: "#9E9E9E" }}>
              ({featuredVideos.filter(v => v.included).length} included)
            </span>
          </div>
          {expandedSections.videos ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandedSections.videos && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "12px" }}>
              Their content, curated by you. Each video gets a personal caption.
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
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{
                        fontSize: "10px",
                        fontWeight: "700",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: video.role === "win" ? "#22c55e20" : video.role === "opportunity" ? "#f59e0b20" : "#8b5cf620",
                        color: video.role === "win" ? "#22c55e" : video.role === "opportunity" ? "#f59e0b" : "#8b5cf6",
                        textTransform: "uppercase",
                      }}>
                        {video.roleLabel}
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "500", marginBottom: "6px", color: "#E0E0E0" }}>
                      {video.title}
                    </div>
                    <input
                      type="text"
                      value={video.caption}
                      onChange={(e) => updateVideoCaption(index, e.target.value)}
                      placeholder="Your caption for this video..."
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
          <div style={{ fontSize: "14px", fontWeight: "700" }}>Sign-off</div>
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
            <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Company</div>
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
          {showPreview ? "Hide Preview" : "Preview"}
        </button>

        <button
          onClick={copyAsEmail}
          disabled={!isValid}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "10px 16px", background: "#252525", border: "1px solid #444",
            borderRadius: "8px", color: "#E0E0E0", cursor: isValid ? "pointer" : "not-allowed",
            fontSize: "13px", opacity: isValid ? 1 : 0.5,
          }}
        >
          {copied ? <Check size={16} style={{ color: "#22c55e" }} /> : <Copy size={16} />}
          {copied ? "Copied!" : "Copy as Email"}
        </button>

        <button
          onClick={exportPDF}
          disabled={!isValid || exporting}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "10px 16px",
            background: "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)",
            border: "none", borderRadius: "8px", color: "#fff",
            cursor: isValid ? "pointer" : "not-allowed", fontSize: "13px", fontWeight: "600",
            opacity: isValid ? 1 : 0.5,
          }}
        >
          <FileText size={16} />
          {exporting ? "Exporting..." : "Export PDF"}
        </button>
      </div>

      {!isValid && (
        <div style={{ fontSize: "12px", color: "#ef4444", textAlign: "right", marginTop: "-8px" }}>
          Please add a personal note before exporting.
        </div>
      )}

      {/* Preview */}
      {showPreview && (
        <div style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "32px",
          color: "#333",
        }}>
          <ChannelNotesPreview content={buildContent()} />
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

function ChannelNotesPreview({ content }) {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
        {content.channelThumbnail && (
          <img
            src={content.channelThumbnail}
            alt=""
            style={{ width: "56px", height: "56px", borderRadius: "50%" }}
          />
        )}
        <div>
          <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "1px" }}>
            Channel Notes
          </div>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#1a1a2e" }}>
            {content.channelName}
          </div>
        </div>
      </div>

      {/* Personal Note */}
      {content.personalNote && (
        <div style={{ fontSize: "14px", color: "#333", lineHeight: "1.7", marginBottom: "24px" }}>
          {content.personalNote}
        </div>
      )}

      {/* Observations */}
      {content.observations.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#3b82f6", marginBottom: "12px" }}>
            What We Noticed
          </div>
          {content.observations.map((obs, i) => (
            <div key={i} style={{
              padding: "12px", background: "#f5f5f5", borderRadius: "8px",
              marginBottom: "8px", fontSize: "13px", lineHeight: "1.6",
            }}>
              {obs.text}
            </div>
          ))}
        </div>
      )}

      {/* Quick Win */}
      {content.quickWin && (
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#22c55e", marginBottom: "12px" }}>
            Quick Win
          </div>
          <div style={{
            padding: "12px", background: "#f0fdf4", borderRadius: "8px",
            borderLeft: "3px solid #22c55e", fontSize: "13px", lineHeight: "1.6",
          }}>
            {content.quickWin.text}
          </div>
        </div>
      )}

      {/* Teases */}
      {content.teases.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#8b5cf6", marginBottom: "12px" }}>
            What We'd Dig Into
          </div>
          {content.teases.map((tease, i) => (
            <div key={i} style={{
              padding: "10px 12px", background: "#faf5ff", borderRadius: "6px",
              marginBottom: "6px", fontSize: "13px", color: "#6b21a8",
            }}>
              • {tease.text}
            </div>
          ))}
        </div>
      )}

      {/* Videos */}
      {content.videos.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#ec4899", marginBottom: "12px" }}>
            Videos That Stood Out
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            {content.videos.map((video, i) => (
              <div key={i} style={{ flex: 1, minWidth: 0 }}>
                {video.thumbnail && (
                  <img
                    src={video.thumbnail}
                    alt=""
                    style={{ width: "100%", borderRadius: "8px", marginBottom: "8px" }}
                  />
                )}
                <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", color: "#1a1a2e" }}>
                  {video.title?.slice(0, 50)}{video.title?.length > 50 ? "..." : ""}
                </div>
                <div style={{ fontSize: "11px", color: "#666", fontStyle: "italic" }}>
                  "{video.caption}"
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sign-off */}
      <div style={{
        paddingTop: "16px", borderTop: "1px solid #eee",
        fontSize: "14px", color: "#333", lineHeight: "1.7",
      }}>
        {content.signOff}
        <div style={{ marginTop: "12px", fontWeight: "600" }}>
          — {content.senderName}, {content.senderCompany}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

function generateObservations(audit, videoAnalysis, videos) {
  const observations = [];
  const snapshot = audit.channel_snapshot || {};
  const series = audit.series_summary || {};
  const benchmark = audit.benchmark_data || {};

  // Series performance (compliment if top series exists)
  if (series.series?.length > 0) {
    const topSeries = series.series.sort((a, b) => (b.avgViews || 0) - (a.avgViews || 0))[0];
    if (topSeries) {
      const channelAvg = snapshot.avg_views_recent || 0;
      const ratio = channelAvg > 0 ? (topSeries.avgViews / channelAvg).toFixed(1) : null;
      if (ratio && ratio > 1.3) {
        observations.push({
          id: "series-performance",
          type: "compliment",
          icon: <TrendingUp size={14} style={{ color: "#22c55e" }} />,
          text: `Your "${topSeries.name}" series consistently outperforms your other content by ${ratio}x — your audience is clearly resonating with it.`,
        });
      }
    }
  }

  // Shorts vs long-form opportunity
  if (videos.length > 0) {
    const shorts = videos.filter(v => v.is_short || (v.duration && v.duration < 62));
    const longForm = videos.filter(v => !v.is_short && (!v.duration || v.duration >= 62));

    if (shorts.length > 0 && longForm.length > 0) {
      const shortsAvg = shorts.reduce((s, v) => s + (v.view_count || 0), 0) / shorts.length;
      const longAvg = longForm.reduce((s, v) => s + (v.view_count || 0), 0) / longForm.length;
      const shortsRatio = Math.round((shorts.length / videos.length) * 100);

      if (shortsAvg > longAvg * 1.5 && shortsRatio < 30) {
        observations.push({
          id: "shorts-opportunity",
          type: "opportunity",
          icon: <Zap size={14} style={{ color: "#f59e0b" }} />,
          text: `Your Shorts are getting ${(shortsAvg / longAvg).toFixed(1)}x the views of your long-form content, but only ${shortsRatio}% of your uploads are Shorts.`,
        });
      }
    }
  }

  // Investigation candidates
  if (videoAnalysis?.investigateVideos?.length > 0) {
    observations.push({
      id: "investigate-videos",
      type: "insight",
      icon: <HelpCircle size={14} style={{ color: "#3b82f6" }} />,
      text: `We found ${videoAnalysis.investigateVideos.length} videos with unusually high reach but low engagement — worth understanding what drove that distribution.`,
    });
  }

  // High performer (compliment)
  if (videoAnalysis?.highReachVideos?.length > 0) {
    const topPerformer = videoAnalysis.highReachVideos.filter(v => !v.is_low_engagement)[0];
    if (topPerformer) {
      observations.push({
        id: "top-performer",
        type: "compliment",
        icon: <TrendingUp size={14} style={{ color: "#22c55e" }} />,
        text: `"${topPerformer.title}" performed ${topPerformer.views_ratio}x above your baseline — that's the kind of content your audience wants more of.`,
      });
    }
  }

  // Benchmark comparison
  if (benchmark.hasBenchmarks && benchmark.comparison?.overallScore) {
    if (benchmark.comparison.overallScore >= 1.2) {
      observations.push({
        id: "benchmark-strong",
        type: "compliment",
        icon: <Target size={14} style={{ color: "#22c55e" }} />,
        text: `You're outperforming ${benchmark.peer_count} peer channels in your tier by ${((benchmark.comparison.overallScore - 1) * 100).toFixed(0)}% on average — you're doing something right.`,
      });
    } else if (benchmark.comparison.overallScore < 0.8) {
      observations.push({
        id: "benchmark-opportunity",
        type: "opportunity",
        icon: <BarChart3 size={14} style={{ color: "#f59e0b" }} />,
        text: `There's room to grow — channels in your tier are averaging ${Math.round((1 / benchmark.comparison.overallScore - 1) * 100)}% more views per video.`,
      });
    }
  }

  // Upload cadence
  const recentVideos = videos.filter(v => {
    if (!v.published_at) return false;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 1);
    return new Date(v.published_at) > cutoff;
  });
  const olderVideos = videos.filter(v => {
    if (!v.published_at) return false;
    const now = new Date();
    const cutoff1 = new Date();
    cutoff1.setMonth(cutoff1.getMonth() - 1);
    const cutoff2 = new Date();
    cutoff2.setMonth(cutoff2.getMonth() - 2);
    return new Date(v.published_at) <= cutoff1 && new Date(v.published_at) > cutoff2;
  });

  if (recentVideos.length < olderVideos.length * 0.6 && olderVideos.length > 2) {
    observations.push({
      id: "cadence-drop",
      type: "insight",
      icon: <Clock size={14} style={{ color: "#3b82f6" }} />,
      text: `Your upload cadence dropped from ${olderVideos.length} videos last month to ${recentVideos.length} this month — consistency compounds on YouTube.`,
    });
  }

  return observations;
}

function generateQuickWins(audit, videoAnalysis, videos) {
  const quickWins = [];
  const snapshot = audit.channel_snapshot || {};

  // Title pattern analysis
  if (videos.length >= 10) {
    const sortedByViews = [...videos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
    const top20pct = sortedByViews.slice(0, Math.ceil(videos.length * 0.2));

    // Check for numbers in titles
    const topWithNumbers = top20pct.filter(v => /\d/.test(v.title || "")).length;
    const topWithNumbersPct = Math.round((topWithNumbers / top20pct.length) * 100);

    if (topWithNumbersPct > 60) {
      quickWins.push({
        id: "title-numbers",
        category: "packaging",
        icon: <Sparkles size={14} style={{ color: "#22c55e" }} />,
        text: `${topWithNumbersPct}% of your top-performing videos use numbers in the title. Your recent uploads that don't use numbers might be missing easy clicks.`,
      });
    }

    // Check for questions in titles
    const topWithQuestions = top20pct.filter(v => /\?/.test(v.title || "")).length;
    if (topWithQuestions >= 3) {
      quickWins.push({
        id: "title-questions",
        category: "packaging",
        icon: <Sparkles size={14} style={{ color: "#22c55e" }} />,
        text: `Questions in titles are working for you — ${topWithQuestions} of your top performers use them. Try framing your next video as a question.`,
      });
    }
  }

  // Shorts recency
  if (videos.length > 0) {
    const shorts = videos.filter(v => v.is_short || (v.duration && v.duration < 62))
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

    if (shorts.length > 0) {
      const lastShort = shorts[0];
      const daysSinceShort = Math.floor((Date.now() - new Date(lastShort.published_at)) / (1000 * 60 * 60 * 24));

      if (daysSinceShort > 14) {
        const shortsAvg = shorts.reduce((s, v) => s + (v.view_count || 0), 0) / shorts.length;
        const longForm = videos.filter(v => !v.is_short && (!v.duration || v.duration >= 62));
        const longAvg = longForm.length > 0 ? longForm.reduce((s, v) => s + (v.view_count || 0), 0) / longForm.length : 0;

        if (shortsAvg > longAvg) {
          quickWins.push({
            id: "shorts-recency",
            category: "format",
            icon: <Video size={14} style={{ color: "#22c55e" }} />,
            text: `You haven't posted a Short in ${daysSinceShort} days. Your Shorts average ${Math.round(shortsAvg).toLocaleString()} views vs ${Math.round(longAvg).toLocaleString()} for long-form — might be worth revisiting.`,
          });
        }
      }
    }
  }

  // Topic concentration
  if (videoAnalysis?.categorized && videos.length >= 10) {
    // This is a simplified version - in practice you'd do topic analysis
    quickWins.push({
      id: "topic-signal",
      category: "content",
      icon: <Target size={14} style={{ color: "#22c55e" }} />,
      text: `Your audience engages most with [specific topic] — doubling down there could accelerate growth.`,
    });
  }

  // Engagement optimization
  if (snapshot.avg_engagement_recent && snapshot.avg_engagement_recent < 0.03) {
    quickWins.push({
      id: "engagement-cta",
      category: "engagement",
      icon: <MessageSquare size={14} style={{ color: "#22c55e" }} />,
      text: `Your engagement rate (${(snapshot.avg_engagement_recent * 100).toFixed(2)}%) has room to grow. A simple "What do you think?" at the end of videos can significantly boost comments.`,
    });
  }

  return quickWins;
}

function generateTeases(audit, videoAnalysis, videos, benchmark) {
  const teases = [];

  // Retention analysis
  teases.push({
    id: "retention-analysis",
    text: "Why your retention drops at specific moments and what editing patterns could fix it",
  });

  // Competitor analysis
  if (benchmark.hasBenchmarks) {
    teases.push({
      id: "competitor-analysis",
      text: `Which of your ${benchmark.peer_count} peer channels are growing fastest and what they're doing differently`,
    });
  }

  // Investigation videos
  if (videoAnalysis?.investigateVideos?.length > 0) {
    teases.push({
      id: "investigate-deep-dive",
      text: `The ${videoAnalysis.investigateVideos.length} videos that had reach but not resonance — what that pattern might mean`,
    });
  }

  // Content strategy
  teases.push({
    id: "content-strategy",
    text: "How to turn your best-performing content into a repeatable series format",
  });

  // Thumbnail/packaging
  teases.push({
    id: "packaging-analysis",
    text: "What your top CTR thumbnails have in common and how to apply it",
  });

  // Growth modeling
  teases.push({
    id: "growth-modeling",
    text: "What your channel could look like in 12 months with optimized strategy",
  });

  return teases;
}

function selectFeaturedVideos(videos, videoAnalysis) {
  const selected = [];

  if (!videos.length) return selected;

  // The Win - highest performing with good engagement
  if (videoAnalysis?.highReachVideos) {
    const win = videoAnalysis.highReachVideos.find(v => !v.is_low_engagement);
    if (win) {
      selected.push({
        ...win,
        role: "win",
        roleLabel: "The Win",
        defaultCaption: "This one connected. Let's figure out why.",
      });
    }
  }

  // The Opportunity - underperformer with potential
  if (videoAnalysis?.categorized) {
    const underperformers = videoAnalysis.categorized
      .filter(v => !v.is_high_reach && v.view_count > 0)
      .sort((a, b) => (a.views_ratio || 0) - (b.views_ratio || 0));

    if (underperformers.length > 0) {
      const opportunity = underperformers[0];
      selected.push({
        ...opportunity,
        role: "opportunity",
        roleLabel: "The Opportunity",
        defaultCaption: "This had potential — packaging might've held it back.",
      });
    }
  }

  // The Question - investigate candidate
  if (videoAnalysis?.investigateVideos?.length > 0) {
    const question = videoAnalysis.investigateVideos[0];
    selected.push({
      ...question,
      role: "question",
      roleLabel: "The Question",
      defaultCaption: "High reach, low engagement — what drove this?",
    });
  }

  // Fill remaining slots with top performers if needed
  if (selected.length < 3) {
    const remaining = videos
      .filter(v => !selected.find(s => s.id === v.id || s.youtube_video_id === v.youtube_video_id))
      .sort((a, b) => (b.view_count || 0) - (a.view_count || 0));

    for (const video of remaining) {
      if (selected.length >= 3) break;
      selected.push({
        ...video,
        role: "win",
        roleLabel: "Strong Performer",
        defaultCaption: "Solid performance worth noting.",
      });
    }
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
  el.style.fontFamily = "system-ui, -apple-system, sans-serif";
  el.style.color = "#333";

  const esc = (str) => {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  el.innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #eee;">
      ${content.channelThumbnail ? `<img src="${content.channelThumbnail}" style="width:64px;height:64px;border-radius:50%;" />` : ""}
      <div>
        <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Channel Notes</div>
        <div style="font-size:28px;font-weight:700;color:#1a1a2e;">${esc(content.channelName)}</div>
      </div>
    </div>

    <!-- Personal Note -->
    ${content.personalNote ? `
      <div style="font-size:15px;color:#333;line-height:1.8;margin-bottom:32px;">
        ${esc(content.personalNote)}
      </div>
    ` : ""}

    <!-- Observations -->
    ${content.observations.length > 0 ? `
      <div style="margin-bottom:28px;">
        <div style="font-size:15px;font-weight:700;color:#3b82f6;margin-bottom:14px;">What We Noticed</div>
        ${content.observations.map(obs => `
          <div style="padding:14px 16px;background:#f8fafc;border-radius:8px;margin-bottom:10px;font-size:14px;line-height:1.7;">
            ${esc(obs.text)}
          </div>
        `).join("")}
      </div>
    ` : ""}

    <!-- Quick Win -->
    ${content.quickWin ? `
      <div style="margin-bottom:28px;">
        <div style="font-size:15px;font-weight:700;color:#22c55e;margin-bottom:14px;">Quick Win</div>
        <div style="padding:14px 16px;background:#f0fdf4;border-radius:8px;border-left:3px solid #22c55e;font-size:14px;line-height:1.7;">
          ${esc(content.quickWin.text)}
        </div>
      </div>
    ` : ""}

    <!-- Teases -->
    ${content.teases.length > 0 ? `
      <div style="margin-bottom:28px;">
        <div style="font-size:15px;font-weight:700;color:#8b5cf6;margin-bottom:14px;">What We'd Dig Into</div>
        ${content.teases.map(t => `
          <div style="padding:10px 14px;background:#faf5ff;border-radius:6px;margin-bottom:8px;font-size:14px;color:#6b21a8;">
            • ${esc(t.text)}
          </div>
        `).join("")}
      </div>
    ` : ""}

    <!-- Videos -->
    ${content.videos.length > 0 ? `
      <div style="margin-bottom:28px;">
        <div style="font-size:15px;font-weight:700;color:#ec4899;margin-bottom:14px;">Videos That Stood Out</div>
        <div style="display:flex;gap:16px;">
          ${content.videos.map(v => `
            <div style="flex:1;min-width:0;">
              ${v.thumbnail ? `<img src="${v.thumbnail}" style="width:100%;border-radius:8px;margin-bottom:10px;" />` : ""}
              <div style="font-size:13px;font-weight:600;margin-bottom:4px;color:#1a1a2e;">
                ${esc(v.title?.slice(0, 50))}${v.title?.length > 50 ? "..." : ""}
              </div>
              <div style="font-size:12px;color:#666;font-style:italic;">
                "${esc(v.caption)}"
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    ` : ""}

    <!-- Sign-off -->
    <div style="padding-top:24px;border-top:1px solid #eee;font-size:15px;color:#333;line-height:1.8;">
      ${esc(content.signOff)}
      <div style="margin-top:16px;font-weight:600;">
        — ${esc(content.senderName)}, ${esc(content.senderCompany)}
      </div>
    </div>
  `;

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
