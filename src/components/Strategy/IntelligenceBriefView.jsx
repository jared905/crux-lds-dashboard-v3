import React, { useState, useEffect } from "react";
import { FileText, Calendar, AlertTriangle, TrendingUp, Target, Lightbulb, Eye, Loader2, RefreshCw, ChevronDown, ChevronUp, ExternalLink, BarChart3 } from "lucide-react";
import { getLatestBrief, getBriefHistory, generateWeeklyBrief } from "../../services/intelligenceBriefService";
import { getYouTubeThumbnailUrl } from "../../lib/schema";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

const SEVERITY_STYLES = {
  Critical: { bg: "rgba(239, 68, 68, 0.1)", border: "#ef4444", text: "#ef4444" },
  Warning:  { bg: "rgba(245, 158, 11, 0.1)", border: "#f59e0b", text: "#f59e0b" },
  Monitor:  { bg: "rgba(96, 165, 250, 0.1)", border: "#60a5fa", text: "#60a5fa" },
};

const IMPACT_COLORS = { high: "#10b981", medium: "#fbbf24", low: "#6b7280" };

export default function IntelligenceBriefView({ activeClient, rows, channelStats, outliers = [], gaps = [] }) {
  const [brief, setBrief] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expanded, setExpanded] = useState({ patterns: false, gaps: false, competitors: false });
  const [expandedFindings, setExpandedFindings] = useState({});

  useEffect(() => {
    if (!activeClient?.id) return;
    setLoading(true);
    Promise.all([
      getLatestBrief(activeClient.id),
      getBriefHistory(activeClient.id, 8),
    ]).then(([latestBrief, briefHistory]) => {
      setBrief(latestBrief);
      setHistory(briefHistory);
    }).catch(err => {
      console.warn('[BriefView] Load failed:', err.message);
    }).finally(() => setLoading(false));
  }, [activeClient?.id]);

  const handleGenerate = async () => {
    if (!activeClient?.id || !rows?.length) return;
    setGenerating(true);
    try {
      const newBrief = await generateWeeklyBrief(activeClient.id, rows, {
        outliers, gaps, channelStats,
      });
      setBrief(newBrief);
      // Refresh history
      const briefHistory = await getBriefHistory(activeClient.id, 8);
      setHistory(briefHistory);
    } catch (err) {
      console.error('[BriefView] Generation failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  const loadBrief = async (briefId) => {
    try {
      const { supabase } = await import("../../services/supabaseClient");
      if (!supabase) return;
      const { data } = await supabase.from('intelligence_briefs').select('*').eq('id', briefId).single();
      if (data) setBrief(data);
      setShowHistory(false);
    } catch (e) {
      console.warn('[BriefView] Load brief failed:', e.message);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
        <div>Loading intelligence brief...</div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div style={{
        background: "#1E1E1E", border: "2px dashed #333", borderRadius: "8px",
        padding: "40px", textAlign: "center", marginBottom: "24px",
      }}>
        <FileText size={32} style={{ color: "#666", margin: "0 auto 12px" }} />
        <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "8px" }}>
          No Intelligence Brief Yet
        </div>
        <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "20px" }}>
          Generate your first weekly brief to get a comprehensive strategy summary.
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || !rows?.length}
          style={{
            padding: "10px 24px", borderRadius: "8px",
            background: "linear-gradient(135deg, #10b981, #3b82f6)",
            border: "none", color: "#fff", fontSize: "14px",
            fontWeight: "700", cursor: generating ? "wait" : "pointer",
            display: "inline-flex", alignItems: "center", gap: "8px",
          }}
        >
          {generating ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Generating...</> : <><Lightbulb size={16} /> Generate First Brief</>}
        </button>
      </div>
    );
  }

  const constraint = brief.primary_constraint;
  const sevStyle = SEVERITY_STYLES[constraint?.severity] || SEVERITY_STYLES.Monitor;
  const patterns = brief.top_patterns || [];
  const gapsList = brief.content_gaps || [];
  const competitors = brief.competitor_highlights || [];
  const actions = brief.recommended_actions || [];
  const topPerformers = brief.top_performers || brief.metrics_snapshot?.top_performers || [];
  const metrics = brief.metrics_snapshot || {};

  return (
    <div style={{ marginBottom: "24px" }}>
      {/* Header */}
      <div style={{
        background: "#1E1E1E", border: "1px solid #2A2A2A", borderRadius: "8px",
        padding: "24px", marginBottom: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "14px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(99, 102, 241, 0.3)",
            }}>
              <FileText size={22} style={{ color: "#fff" }} />
            </div>
            <div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff" }}>Weekly Intelligence Brief</div>
              <div style={{ fontSize: "12px", color: "#9E9E9E", display: "flex", alignItems: "center", gap: "6px" }}>
                <Calendar size={12} />
                {new Date(brief.brief_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                {brief.generation_cost > 0 && (
                  <span style={{ color: "#666" }}>• ${brief.generation_cost.toFixed(4)}</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {history.length > 1 && (
              <button
                onClick={() => setShowHistory(s => !s)}
                style={{
                  padding: "6px 12px", borderRadius: "6px",
                  border: "1px solid #333", background: "#252525",
                  color: "#E0E0E0", fontSize: "12px", fontWeight: "600",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                }}
              >
                <Calendar size={12} /> History ({history.length})
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                padding: "6px 12px", borderRadius: "6px",
                border: "1px solid #333", background: "#252525",
                color: "#E0E0E0", fontSize: "12px", fontWeight: "600",
                cursor: generating ? "wait" : "pointer",
                display: "flex", alignItems: "center", gap: "4px",
              }}
            >
              {generating ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={12} />}
              {generating ? "Generating..." : "Regenerate"}
            </button>
          </div>
        </div>

        {/* History Dropdown */}
        {showHistory && (
          <div style={{ borderTop: "1px solid #333", paddingTop: "12px", marginBottom: "12px" }}>
            {history.map(h => (
              <button
                key={h.id}
                onClick={() => loadBrief(h.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "8px 12px", borderRadius: "6px",
                  border: h.id === brief.id ? "1px solid #6366f1" : "1px solid transparent",
                  background: h.id === brief.id ? "rgba(99, 102, 241, 0.1)" : "transparent",
                  color: "#E0E0E0", fontSize: "13px", cursor: "pointer",
                  marginBottom: "4px",
                }}
              >
                <span>{new Date(h.brief_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span style={{ fontSize: "11px", color: "#666" }}>
                  {h.primary_constraint?.constraint || 'No constraint'}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Executive Summary */}
        <div style={{ fontSize: "15px", color: "#ccc", lineHeight: "1.6", whiteSpace: "pre-line" }}>
          {brief.executive_summary}
        </div>
      </div>

      {/* Metrics Snapshot + Constraint */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
        {/* Primary Constraint */}
        {constraint && (
          <div style={{
            background: sevStyle.bg, border: `1px solid ${sevStyle.border}`,
            borderRadius: "8px", padding: "16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <AlertTriangle size={16} style={{ color: sevStyle.text }} />
              <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: sevStyle.text }}>
                Primary Constraint — {constraint.severity}
              </span>
            </div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "6px" }}>
              {constraint.constraint}
            </div>
            <div style={{ fontSize: "13px", color: "#ccc" }}>{constraint.evidence}</div>
          </div>
        )}

        {/* Metrics */}
        <div style={{ background: "#1E1E1E", border: "1px solid #2A2A2A", borderRadius: "8px", padding: "16px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "#9E9E9E", marginBottom: "12px" }}>
            Snapshot
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {[
              { label: "Videos", value: fmtInt(metrics.totalVideos) },
              { label: "Views", value: fmtInt(metrics.totalViews) },
              { label: "Avg CTR", value: `${((metrics.avgCTR || 0) * 100).toFixed(1)}%` },
              { label: "Avg Retention", value: `${((metrics.avgRetention || 0) * 100).toFixed(1)}%` },
            ].map(m => (
              <div key={m.label}>
                <div style={{ fontSize: "11px", color: "#666" }}>{m.label}</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* This Week's Findings — evidence-rich diagnostic insights */}
      {actions.length > 0 && (
        <div style={{
          background: "#1E1E1E", border: "1px solid #2A2A2A",
          borderRadius: "8px", padding: "20px", marginBottom: "16px",
        }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#E0E0E0", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
            <BarChart3 size={16} style={{ color: "#60a5fa" }} /> This Week's Findings
          </div>
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "16px" }}>
            What the data reveals — click any finding to see the supporting evidence
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {actions.map((a, i) => {
              const isOpen = expandedFindings[i];
              const videos = a.videoExamples || [];
              const impactColor = IMPACT_COLORS[a.impact] || "#666";
              const fmtPctLocal = (n) => (!n || isNaN(n)) ? "—" : `${(n * 100).toFixed(1)}%`;

              return (
                <div key={i} style={{
                  backgroundColor: "#161616",
                  border: isOpen ? "1px solid #60a5fa40" : "1px solid #2A2A2A",
                  borderRadius: "8px",
                  overflow: "hidden",
                  transition: "border-color 0.2s ease",
                }}>
                  {/* Finding header — clickable */}
                  <button
                    onClick={() => setExpandedFindings(p => ({ ...p, [i]: !p[i] }))}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: "12px",
                      padding: "14px 16px", background: "none", border: "none",
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{
                      width: "24px", height: "24px", borderRadius: "6px",
                      background: `${impactColor}15`, color: impactColor,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "12px", fontWeight: "800", flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff" }}>
                        {a.title}
                      </div>
                      {a.description && (
                        <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isOpen ? "normal" : "nowrap" }}>
                          {a.description?.split('\n')[0]}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      {a.sourceLabel && (
                        <span style={{
                          fontSize: "9px", fontWeight: "700", textTransform: "uppercase",
                          color: "#9E9E9E", background: "rgba(158, 158, 158, 0.1)",
                          padding: "2px 6px", borderRadius: "3px",
                        }}>
                          {a.sourceLabel}
                        </span>
                      )}
                      {a.opportunity > 0 && (
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "#10b981" }}>
                          +{fmtInt(a.opportunity)}
                        </span>
                      )}
                      {videos.length > 0 && (
                        <span style={{ fontSize: "10px", color: "#666" }}>
                          {videos.length} video{videos.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {isOpen ? <ChevronUp size={14} style={{ color: "#666" }} /> : <ChevronDown size={14} style={{ color: "#666" }} />}
                    </div>
                  </button>

                  {/* Expanded evidence */}
                  {isOpen && (
                    <div style={{ padding: "0 16px 16px", borderTop: "1px solid #2A2A2A" }}>
                      {/* Full description + action */}
                      {a.description && (
                        <div style={{ fontSize: "13px", color: "#ccc", lineHeight: "1.5", padding: "12px 0 8px", whiteSpace: "pre-line" }}>
                          {a.description}
                        </div>
                      )}

                      {/* Evidence badges */}
                      {a.evidence && (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                          {a.evidence.delta && (
                            <span style={{ fontSize: "11px", color: "#60a5fa", background: "rgba(96, 165, 250, 0.08)", padding: "4px 10px", borderRadius: "6px" }}>
                              {a.evidence.delta}
                            </span>
                          )}
                          {a.evidence.outlierScore && (
                            <span style={{ fontSize: "11px", color: "#fb923c", background: "rgba(251, 146, 60, 0.08)", padding: "4px 10px", borderRadius: "6px" }}>
                              {a.evidence.outlierScore.toFixed(1)}x channel average
                            </span>
                          )}
                          {a.evidence.competitorStat && (
                            <span style={{ fontSize: "11px", color: "#a855f7", background: "rgba(168, 85, 247, 0.08)", padding: "4px 10px", borderRadius: "6px" }}>
                              Competitors: {a.evidence.competitorStat}
                            </span>
                          )}
                          {a.evidence.clientStat && (
                            <span style={{ fontSize: "11px", color: "#60a5fa", background: "rgba(96, 165, 250, 0.08)", padding: "4px 10px", borderRadius: "6px" }}>
                              You: {a.evidence.clientStat}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Video evidence with thumbnails */}
                      {videos.length > 0 && (
                        <div>
                          <div style={{ fontSize: "10px", fontWeight: "700", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                            Supporting Videos
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {videos.map((v, vi) => (
                              <div key={vi} style={{
                                display: "flex", alignItems: "center", gap: "10px",
                                padding: "8px 10px", borderRadius: "6px",
                                backgroundColor: "#0f0f0f", border: "1px solid #1a1a1a",
                              }}>
                                {/* Thumbnail */}
                                {v.youtubeVideoId ? (
                                  <a
                                    href={v.youtubeUrl || `https://youtube.com/watch?v=${v.youtubeVideoId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ flexShrink: 0 }}
                                  >
                                    <img
                                      src={getYouTubeThumbnailUrl(v.youtubeVideoId)}
                                      alt={v.title}
                                      style={{
                                        width: "80px", height: "45px",
                                        borderRadius: "4px", objectFit: "cover",
                                        border: "1px solid #333",
                                      }}
                                      onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                  </a>
                                ) : (
                                  <div style={{
                                    width: "80px", height: "45px", borderRadius: "4px",
                                    backgroundColor: "#1a1a1a", display: "flex",
                                    alignItems: "center", justifyContent: "center",
                                    flexShrink: 0,
                                  }}>
                                    <FileText size={14} style={{ color: "#444" }} />
                                  </div>
                                )}

                                {/* Title + meta */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  {v.youtubeUrl || v.youtubeVideoId ? (
                                    <a
                                      href={v.youtubeUrl || `https://youtube.com/watch?v=${v.youtubeVideoId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        fontSize: "12px", fontWeight: "600", color: "#E0E0E0",
                                        textDecoration: "none", display: "block",
                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                      }}
                                    >
                                      {v.title}
                                      <ExternalLink size={10} style={{ marginLeft: "4px", color: "#666", verticalAlign: "middle" }} />
                                    </a>
                                  ) : (
                                    <div style={{
                                      fontSize: "12px", fontWeight: "600", color: "#E0E0E0",
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>
                                      {v.title}
                                    </div>
                                  )}
                                  {v.channel && (
                                    <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>{v.channel}</div>
                                  )}
                                </div>

                                {/* Stats */}
                                <div style={{ display: "flex", gap: "12px", flexShrink: 0 }}>
                                  {v.views != null && (
                                    <div style={{ textAlign: "right" }}>
                                      <div style={{ fontSize: "12px", fontWeight: "700", color: "#fff" }}>{fmtInt(v.views)}</div>
                                      <div style={{ fontSize: "9px", color: "#666" }}>views</div>
                                    </div>
                                  )}
                                  {v.ctr > 0 && (
                                    <div style={{ textAlign: "right" }}>
                                      <div style={{ fontSize: "12px", fontWeight: "700", color: "#60a5fa" }}>{fmtPctLocal(v.ctr)}</div>
                                      <div style={{ fontSize: "9px", color: "#666" }}>CTR</div>
                                    </div>
                                  )}
                                  {v.retention > 0 && (
                                    <div style={{ textAlign: "right" }}>
                                      <div style={{ fontSize: "12px", fontWeight: "700", color: "#a855f7" }}>{fmtPctLocal(v.retention)}</div>
                                      <div style={{ fontSize: "9px", color: "#666" }}>retention</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Performers — the top 20% videos for reference */}
      {topPerformers.length > 0 && (
        <CollapsibleSection
          title={`Top ${topPerformers.length} Videos (Top 20%)`}
          icon={<TrendingUp size={16} style={{ color: "#10b981" }} />}
          count={topPerformers.length}
          expanded={expanded.topPerformers}
          onToggle={() => setExpanded(p => ({ ...p, topPerformers: !p.topPerformers }))}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {topPerformers.map((v, i) => {
              const fmtPctLocal = (n) => (!n || isNaN(n)) ? "—" : `${(n * 100).toFixed(1)}%`;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "6px 8px", borderRadius: "6px",
                  backgroundColor: i % 2 === 0 ? "#161616" : "transparent",
                }}>
                  {v.youtubeVideoId ? (
                    <a
                      href={v.youtubeUrl || `https://youtube.com/watch?v=${v.youtubeVideoId}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ flexShrink: 0 }}
                    >
                      <img
                        src={getYouTubeThumbnailUrl(v.youtubeVideoId)}
                        alt={v.title}
                        style={{ width: "64px", height: "36px", borderRadius: "4px", objectFit: "cover", border: "1px solid #333" }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </a>
                  ) : (
                    <div style={{ width: "64px", height: "36px", borderRadius: "4px", backgroundColor: "#1a1a1a", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {v.youtubeUrl || v.youtubeVideoId ? (
                      <a
                        href={v.youtubeUrl || `https://youtube.com/watch?v=${v.youtubeVideoId}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: "12px", fontWeight: "600", color: "#E0E0E0", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
                      >
                        {v.title} <ExternalLink size={9} style={{ color: "#666", verticalAlign: "middle" }} />
                      </a>
                    ) : (
                      <div style={{ fontSize: "12px", fontWeight: "600", color: "#E0E0E0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</div>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: "#fff", flexShrink: 0 }}>{fmtInt(v.views)}</div>
                  {v.ctr > 0 && <div style={{ fontSize: "11px", color: "#60a5fa", flexShrink: 0 }}>{fmtPctLocal(v.ctr)}</div>}
                  {v.retention > 0 && <div style={{ fontSize: "11px", color: "#a855f7", flexShrink: 0 }}>{fmtPctLocal(v.retention)}</div>}
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Collapsible Sections */}
      {patterns.length > 0 && (
        <CollapsibleSection
          title="Top Patterns"
          icon={<TrendingUp size={16} />}
          count={patterns.length}
          expanded={expanded.patterns}
          onToggle={() => setExpanded(p => ({ ...p, patterns: !p.patterns }))}
        >
          {patterns.map((p, i) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: i < patterns.length - 1 ? "1px solid #2A2A2A" : "none" }}>
              <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff" }}>{p.finding}</div>
              <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "4px" }}>{p.recommendation}</div>
              <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
                <span style={{ fontSize: "11px", color: "#666" }}>Opportunity: {fmtInt(p.opportunity)} views</span>
                <span style={{ fontSize: "11px", color: "#666" }}>Effort: {p.effort}</span>
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {competitors.length > 0 && (
        <CollapsibleSection
          title="Competitor Highlights"
          icon={<Eye size={16} />}
          count={competitors.length}
          expanded={expanded.competitors}
          onToggle={() => setExpanded(p => ({ ...p, competitors: !p.competitors }))}
        >
          {competitors.map((c, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < competitors.length - 1 ? "1px solid #2A2A2A" : "none" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>{c.title}</div>
                <div style={{ fontSize: "12px", color: "#9E9E9E" }}>{c.channel}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#fb923c" }}>{c.outlierScore?.toFixed(1)}x</div>
                <div style={{ fontSize: "11px", color: "#666" }}>{fmtInt(c.views)} views</div>
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {gapsList.length > 0 && (
        <CollapsibleSection
          title="Content Gaps"
          icon={<Target size={16} />}
          count={gapsList.length}
          expanded={expanded.gaps}
          onToggle={() => setExpanded(p => ({ ...p, gaps: !p.gaps }))}
        >
          {gapsList.map((g, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: i < gapsList.length - 1 ? "1px solid #2A2A2A" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>{g.title}</span>
                <span style={{ fontSize: "10px", color: IMPACT_COLORS[g.impact], fontWeight: "600" }}>{g.impact}</span>
              </div>
              <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "2px" }}>{g.action}</div>
            </div>
          ))}
        </CollapsibleSection>
      )}
    </div>
  );
}

function CollapsibleSection({ title, icon, count, expanded, onToggle, children }) {
  return (
    <div style={{ background: "#1E1E1E", border: "1px solid #2A2A2A", borderRadius: "8px", marginBottom: "12px" }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", padding: "14px 16px", background: "none", border: "none",
          color: "#fff", cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {icon}
          <span style={{ fontSize: "14px", fontWeight: "700" }}>{title}</span>
          <span style={{ fontSize: "11px", color: "#666" }}>({count})</span>
        </div>
        {expanded ? <ChevronUp size={16} style={{ color: "#666" }} /> : <ChevronDown size={16} style={{ color: "#666" }} />}
      </button>
      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid #2A2A2A" }}>
          {children}
        </div>
      )}
    </div>
  );
}
