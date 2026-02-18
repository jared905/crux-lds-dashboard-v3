import { useState, useMemo } from "react";
import {
  ArrowLeft,
  BarChart3,
  Layers,
  Users,
  Lightbulb,
  Target,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  AlertTriangle,
  Zap,
  Eye,
  MessageCircle,
  ThumbsUp,
  Mail,
  Info,
  Calendar,
  UserPlus,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ScatterChart,
  Scatter,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ReferenceLine,
  CartesianGrid,
  Legend,
} from "recharts";
import AuditPDFExport from "./AuditPDFExport";
import OutreachBuilder from "./OutreachBuilder";
import { categorizeVideos, getQuadrantBreakdown } from "../../services/videoCategorizationService";

const TABS = [
  { id: "summary", label: "Summary", icon: FileText },
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "insights", label: "Video Performance", icon: BarChart3 },
  { id: "series", label: "Series", icon: Layers },
  { id: "benchmarks", label: "Benchmarks", icon: Users },
  { id: "opportunities", label: "Opportunities", icon: Lightbulb },
  { id: "recommendations", label: "Recommendations", icon: Target },
  { id: "outreach", label: "Outreach", icon: Mail },
];

const TREND_ICONS = {
  growing: { Icon: TrendingUp, color: "#22c55e" },
  declining: { Icon: TrendingDown, color: "#ef4444" },
  stable: { Icon: Minus, color: "#9E9E9E" },
  new: { Icon: TrendingUp, color: "#3b82f6" },
};

const COLORS = {
  primary: "#3b82f6",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  purple: "#8b5cf6",
  pink: "#ec4899",
  gray: "#6b7280",
};

export default function AuditResults({ audit, onBack }) {
  const [activeTab, setActiveTab] = useState("summary");
  const [formatFilter, setFormatFilter] = useState("all"); // 'all' | 'long_form' | 'short_form'

  const snapshot = audit.channel_snapshot || {};
  const series = audit.series_summary || {};
  const benchmark = audit.benchmark_data || {};
  const opportunities = audit.opportunities || {};
  const recommendations = audit.recommendations || {};
  const summary = audit.executive_summary || "";
  const videos = audit.videos || [];

  // Format breakdown
  const formatMix = useMemo(() => {
    const longCount = videos.filter(v => v.video_type === "long").length;
    const shortCount = videos.filter(v => v.video_type === "short").length;
    return { longCount, shortCount, hasBoth: longCount > 0 && shortCount > 0 };
  }, [videos]);

  // Video categorization
  const videoAnalysis = useMemo(() => {
    if (!videos.length) return null;
    return categorizeVideos(videos);
  }, [videos]);

  const quadrants = useMemo(() => {
    if (!videoAnalysis?.categorized) return null;
    return getQuadrantBreakdown(videoAnalysis.categorized);
  }, [videoAnalysis]);

  // Calculate date range from videos
  const videoDateRange = useMemo(() => {
    if (!videos.length) return null;
    const dates = videos
      .filter(v => v.published_at)
      .map(v => new Date(v.published_at))
      .sort((a, b) => a - b);
    if (dates.length === 0) return null;
    return {
      oldest: dates[0],
      newest: dates[dates.length - 1],
    };
  }, [videos]);

  // Card style helper
  const card = (extra = {}) => ({
    background: "#1E1E1E",
    borderRadius: "12px",
    border: "1px solid #333",
    padding: "24px",
    ...extra,
  });

  const sectionTitle = (text, subtitle) => (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ fontSize: "16px", fontWeight: "700" }}>{text}</div>
      {subtitle && <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "4px" }}>{subtitle}</div>}
    </div>
  );

  // Format helpers
  const fmtNum = (n) => (n || 0).toLocaleString();
  const fmtPct = (n) => ((n || 0) * 100).toFixed(2) + "%";

  return (
    <div>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: "24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 14px", background: "transparent",
              border: "1px solid #444", borderRadius: "8px",
              color: "#9E9E9E", cursor: "pointer", fontSize: "13px",
            }}
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: "700", margin: 0 }}>
              Audit: {snapshot.name || "Channel"}
            </h2>
            <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "4px" }}>
              {new Date(audit.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              {audit.total_cost > 0 && ` · Cost: $${parseFloat(audit.total_cost).toFixed(3)}`}
            </div>
          </div>
        </div>
        <AuditPDFExport audit={audit} videoAnalysis={videoAnalysis} />
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex", gap: "4px", marginBottom: "24px",
        overflowX: "auto", paddingBottom: "4px",
      }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 16px", borderRadius: "8px",
              background: activeTab === id ? "rgba(41, 98, 255, 0.15)" : "transparent",
              border: activeTab === id ? "1px solid #2962FF" : "1px solid transparent",
              color: activeTab === id ? "#60a5fa" : "#9E9E9E",
              cursor: "pointer", fontSize: "13px", fontWeight: "600",
              whiteSpace: "nowrap",
            }}
          >
            <Icon size={14} />
            {label}
            {id === "insights" && videoAnalysis?.summary?.investigateCount > 0 && (
              <span style={{
                background: COLORS.warning,
                color: "#000",
                fontSize: "10px",
                fontWeight: "700",
                padding: "2px 6px",
                borderRadius: "10px",
                marginLeft: "4px",
              }}>
                {videoAnalysis.summary.investigateCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Summary Tab ── */}
      {activeTab === "summary" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* 1. Channel Hero Card */}
          <div style={card()}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {snapshot.thumbnail_url && (
                <img src={snapshot.thumbnail_url} alt="" style={{ width: "56px", height: "56px", borderRadius: "50%", border: "2px solid #333" }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "20px", fontWeight: "700" }}>{snapshot.name || "Channel"}</div>
                <div style={{ fontSize: "13px", color: "#9E9E9E", marginTop: "4px" }}>
                  {new Date(audit.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  {" · "}{videos.length} videos analyzed
                  {videoDateRange && (
                    <span>
                      {" · "}{videoDateRange.oldest.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      {" – "}{videoDateRange.newest.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {audit.audit_type && (
                  <div style={{
                    padding: "6px 14px",
                    background: audit.audit_type === "prospect" ? "rgba(139, 92, 246, 0.15)" : "rgba(59, 130, 246, 0.15)",
                    border: `1px solid ${audit.audit_type === "prospect" ? "#8b5cf6" : "#3b82f6"}`,
                    borderRadius: "20px",
                    color: audit.audit_type === "prospect" ? "#8b5cf6" : "#3b82f6",
                    fontWeight: "600", fontSize: "12px",
                  }}>
                    {audit.audit_type === "prospect" ? "Prospect" : "Baseline"}
                  </div>
                )}
                {snapshot.size_tier && (
                  <div style={{
                    padding: "6px 14px",
                    background: getTierColor(snapshot.size_tier) + "20",
                    border: `1px solid ${getTierColor(snapshot.size_tier)}`,
                    borderRadius: "20px",
                    color: getTierColor(snapshot.size_tier),
                    fontWeight: "600", fontSize: "12px", textTransform: "capitalize",
                  }}>
                    {snapshot.size_tier}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2. Key Metrics Strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            <MetricCard label="Subscribers" value={fmtNum(snapshot.subscriber_count)} icon={Users} color={COLORS.primary} />
            <MetricCard label="Videos Analyzed" value={snapshot.total_videos_analyzed || videos.length} icon={BarChart3} color={COLORS.pink} />
            <MetricCard label="Avg Views (90d)" value={fmtNum(snapshot.avg_views_recent)} icon={Eye} color={COLORS.success} />
            <MetricCard label="Engagement Rate" value={fmtPct(snapshot.avg_engagement_recent)} icon={TrendingUp} color={COLORS.warning} />
          </div>

          {/* 3. Two-column: Score Gauge + At a Glance */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={card()}>
              {benchmark?.hasBenchmarks && benchmark.comparison?.overallScore ? (
                <>
                  {sectionTitle("Benchmark Score", `vs ${benchmark.peer_count} peer channels`)}
                  <SummaryScoreGauge score={benchmark.comparison.overallScore} />
                </>
              ) : (
                <>
                  {sectionTitle("Content Mix", "Shorts vs Long-form")}
                  <ContentMixChart videos={videos} />
                </>
              )}
            </div>

            <div style={card()}>
              {sectionTitle("At a Glance")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <GlanceItem icon={Layers} label="Series Detected" value={series.total_series || 0} color={COLORS.primary} />
                <GlanceItem icon={Lightbulb} label="Content Gaps" value={(opportunities.content_gaps || []).length} color={COLORS.purple} />
                <GlanceItem icon={TrendingUp} label="Growth Levers" value={(opportunities.growth_levers || []).length} color={COLORS.success} />
                <GlanceItem icon={Target} label="Recommendations" value={
                  (recommendations.stop || []).length +
                  (recommendations.start || []).length +
                  (recommendations.optimize || []).length
                } color={COLORS.warning} />
              </div>
            </div>
          </div>

          {/* 4. Highlights Grid */}
          <SummaryHighlights
            benchmark={benchmark}
            opportunities={opportunities}
            series={series}
            videoAnalysis={videoAnalysis}
            cardStyle={card}
          />

          {/* 5. Recommendations Summary Bar */}
          {((recommendations.stop?.length || 0) + (recommendations.start?.length || 0) + (recommendations.optimize?.length || 0) > 0) && (
            <div style={card()}>
              {sectionTitle("Recommendations Overview")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div style={{ borderTop: `3px solid ${COLORS.danger}`, background: "#252525", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "14px" }}>🛑</span>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: COLORS.danger }}>Stop ({(recommendations.stop || []).length})</span>
                  </div>
                  {(recommendations.stop || []).slice(0, 3).map((r, i) => (
                    <div key={i} style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "6px", paddingLeft: "8px", borderLeft: "2px solid #333" }}>
                      {r.action}
                    </div>
                  ))}
                  {!(recommendations.stop || []).length && <div style={{ fontSize: "12px", color: "#555" }}>None</div>}
                </div>
                <div style={{ borderTop: `3px solid ${COLORS.success}`, background: "#252525", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "14px" }}>🚀</span>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: COLORS.success }}>Start ({(recommendations.start || []).length})</span>
                  </div>
                  {(recommendations.start || []).slice(0, 3).map((r, i) => (
                    <div key={i} style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "6px", paddingLeft: "8px", borderLeft: "2px solid #333" }}>
                      {r.action}
                    </div>
                  ))}
                  {!(recommendations.start || []).length && <div style={{ fontSize: "12px", color: "#555" }}>None</div>}
                </div>
                <div style={{ borderTop: `3px solid ${COLORS.warning}`, background: "#252525", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "14px" }}>⚡</span>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: COLORS.warning }}>Optimize ({(recommendations.optimize || []).length})</span>
                  </div>
                  {(recommendations.optimize || []).slice(0, 3).map((r, i) => (
                    <div key={i} style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "6px", paddingLeft: "8px", borderLeft: "2px solid #333" }}>
                      {r.action}
                    </div>
                  ))}
                  {!(recommendations.optimize || []).length && <div style={{ fontSize: "12px", color: "#555" }}>None</div>}
                </div>
              </div>
            </div>
          )}

          {/* 6. AI Executive Narrative */}
          {(typeof summary === "string" ? summary : summary?.summary) ? (
            <div style={card({ borderLeft: "3px solid #3b82f6" })}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <div style={{
                  width: "36px", height: "36px", borderRadius: "8px",
                  background: "rgba(59, 130, 246, 0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <FileText size={18} style={{ color: COLORS.primary }} />
                </div>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: "700" }}>Executive Analysis</div>
                  <div style={{ fontSize: "12px", color: "#9E9E9E" }}>AI-generated narrative summary</div>
                </div>
              </div>
              <div
                style={{ fontSize: "14px", lineHeight: "1.8", color: "#E0E0E0" }}
                dangerouslySetInnerHTML={{ __html: formatMarkdown(typeof summary === "string" ? summary : summary.summary) }}
              />
            </div>
          ) : (
            <div style={{ ...card(), color: "#666", textAlign: "center", padding: "40px" }}>
              No executive summary available.
            </div>
          )}
        </div>
      )}

      {/* ── Overview Tab ── */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Channel info header */}
          <div style={card()}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
              {snapshot.thumbnail_url && (
                <img src={snapshot.thumbnail_url} alt="" style={{ width: "56px", height: "56px", borderRadius: "50%" }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "18px", fontWeight: "700" }}>{snapshot.name}</div>
                <div style={{ fontSize: "13px", color: "#9E9E9E", marginTop: "2px" }}>
                  {snapshot.youtube_channel_id} · {snapshot.size_tier}
                </div>
              </div>
              {/* Tier badge */}
              <div style={{
                padding: "8px 16px",
                background: getTierColor(snapshot.size_tier) + "20",
                border: `1px solid ${getTierColor(snapshot.size_tier)}`,
                borderRadius: "8px",
                color: getTierColor(snapshot.size_tier),
                fontWeight: "700",
                fontSize: "13px",
                textTransform: "capitalize",
              }}>
                {snapshot.size_tier}
              </div>
            </div>

            {/* Main metrics grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              <MetricCard label="Subscribers" value={fmtNum(snapshot.subscriber_count)} icon={Users} color={COLORS.primary} />
              <MetricCard label="Total Views" value={fmtNum(snapshot.total_view_count)} icon={Eye} color={COLORS.purple} />
              <MetricCard label="Videos Analyzed" value={snapshot.total_videos_analyzed} icon={BarChart3} color={COLORS.pink} />
            </div>
          </div>

          {/* Data Range Info */}
          {videoDateRange && (
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "12px 16px", background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.2)", borderRadius: "8px",
            }}>
              <Calendar size={16} style={{ color: COLORS.primary }} />
              <span style={{ fontSize: "13px", color: "#9E9E9E" }}>
                Analyzing <strong style={{ color: "#E0E0E0" }}>{videos.length} videos</strong> from{" "}
                <strong style={{ color: "#E0E0E0" }}>
                  {videoDateRange.oldest.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </strong>{" "}to{" "}
                <strong style={{ color: "#E0E0E0" }}>
                  {videoDateRange.newest.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </strong>
              </span>
            </div>
          )}

          {/* Visual charts row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {/* Content Mix Donut */}
            <div style={card()}>
              {sectionTitle("Content Mix", "Shorts vs Long-form distribution")}
              <ContentMixChart videos={videos} />
            </div>

            {/* Recent Performance */}
            <div style={card()}>
              {sectionTitle("90-Day Performance", "Recent upload activity")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div style={{ background: "#252525", borderRadius: "8px", padding: "14px", textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "6px" }}>Recent Videos</div>
                  <div style={{ fontSize: "24px", fontWeight: "700", color: COLORS.primary }}>{snapshot.recent_videos_90d || 0}</div>
                </div>
                <div style={{ background: "#252525", borderRadius: "8px", padding: "14px", textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "6px" }}>Avg Views</div>
                  <div style={{ fontSize: "24px", fontWeight: "700", color: COLORS.success }}>{fmtNum(snapshot.avg_views_recent)}</div>
                </div>
              </div>
              <div style={{ background: "#252525", borderRadius: "8px", padding: "14px", textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "6px" }}>
                  <span style={{ fontSize: "11px", color: "#9E9E9E" }}>Avg Engagement Rate</span>
                  <div style={{ position: "relative", display: "inline-block" }} className="engagement-tooltip">
                    <Info size={12} style={{ color: "#666", cursor: "help" }} />
                    <div className="tooltip-content" style={{
                      position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
                      background: "#1E1E1E", border: "1px solid #444", borderRadius: "8px",
                      padding: "12px", width: "220px", fontSize: "11px", color: "#9E9E9E",
                      lineHeight: "1.5", zIndex: 100, display: "none", marginBottom: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    }}>
                      <strong style={{ color: "#E0E0E0" }}>Engagement Rate</strong><br/>
                      (Likes + Comments) ÷ Views<br/><br/>
                      Measures how actively viewers interact with content relative to how many saw it.
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: "24px", fontWeight: "700", color: COLORS.warning }}>{fmtPct(snapshot.avg_engagement_recent)}</div>
              </div>
            </div>
          </div>

          {/* Engagement Definition Note */}
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "10px",
            padding: "14px 16px", background: "#252525", borderRadius: "8px",
            fontSize: "12px", color: "#9E9E9E", lineHeight: "1.6",
          }}>
            <Info size={16} style={{ color: "#666", flexShrink: 0, marginTop: "1px" }} />
            <div>
              <strong style={{ color: "#E0E0E0" }}>How we calculate Engagement Rate:</strong>{" "}
              (Likes + Comments) ÷ Views. This measures how actively viewers interact with content.
              A higher rate suggests content resonates strongly with the audience.
            </div>
          </div>

          {/* Views Distribution */}
          <div style={card()}>
            {sectionTitle("Views Distribution", "How views are spread across your videos")}
            <ViewsDistributionChart videos={videos} />
          </div>
        </div>
      )}

      {/* ── Video Performance Tab ── */}
      {activeTab === "insights" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {!videoAnalysis || !videos.length ? (
            <div style={{ ...card(), color: "#666", textAlign: "center", padding: "60px" }}>
              <BarChart3 size={32} style={{ color: "#444", marginBottom: "12px" }} />
              <div>No video data available for analysis.</div>
            </div>
          ) : (() => {
            const breakoutCount = videoAnalysis.highReachVideos?.filter(v => !v.is_low_engagement).length || 0;
            const investigateCount = videoAnalysis.investigateVideos?.length || 0;
            const totalVideos = videoAnalysis.summary?.totalVideos || videos.length;
            const normalCount = totalVideos - breakoutCount - investigateCount;
            return (
            <>
              {/* Performance Snapshot */}
              <div style={card()}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "10px",
                    background: "rgba(59, 130, 246, 0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <BarChart3 size={20} style={{ color: COLORS.primary }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "16px", fontWeight: "700" }}>Performance Snapshot</div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E" }}>
                      {totalVideos} videos analyzed
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: COLORS.success }} />
                    <span style={{ fontSize: "13px", color: "#E0E0E0" }}><strong>{breakoutCount}</strong> <span style={{ color: "#9E9E9E" }}>breakout performers</span></span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: COLORS.warning }} />
                    <span style={{ fontSize: "13px", color: "#E0E0E0" }}><strong>{investigateCount}</strong> <span style={{ color: "#9E9E9E" }}>need attention</span></span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#333" }} />
                    <span style={{ fontSize: "13px", color: "#E0E0E0" }}><strong>{normalCount}</strong> <span style={{ color: "#9E9E9E" }}>performing as expected</span></span>
                  </div>
                </div>

                {/* Stacked distribution bar */}
                <div style={{ display: "flex", height: "28px", borderRadius: "8px", overflow: "hidden", background: "#252525" }}>
                  {breakoutCount > 0 && (
                    <div style={{
                      width: `${(breakoutCount / totalVideos) * 100}%`,
                      background: COLORS.success,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: "700", color: "#000",
                      minWidth: breakoutCount > 0 ? "24px" : "0",
                    }}>
                      {breakoutCount}
                    </div>
                  )}
                  {investigateCount > 0 && (
                    <div style={{
                      width: `${(investigateCount / totalVideos) * 100}%`,
                      background: COLORS.warning,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: "700", color: "#000",
                      minWidth: investigateCount > 0 ? "24px" : "0",
                    }}>
                      {investigateCount}
                    </div>
                  )}
                  <div style={{
                    flex: 1,
                    background: "#333",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "11px", fontWeight: "600", color: "#9E9E9E",
                  }}>
                    {normalCount}
                  </div>
                </div>
              </div>

              {/* Breakout Performers (the wins — shown first) */}
              {breakoutCount > 0 && (
                <div style={card()}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "10px",
                      background: "rgba(34, 197, 94, 0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Zap size={20} style={{ color: COLORS.success }} />
                    </div>
                    <div>
                      <div style={{ fontSize: "16px", fontWeight: "700" }}>Breakout Performers</div>
                      <div style={{ fontSize: "12px", color: "#9E9E9E" }}>
                        High reach with strong engagement — replicate these
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {videoAnalysis.highReachVideos.filter(v => !v.is_low_engagement).slice(0, 5).map((video, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: "12px", padding: "12px",
                        background: "#252525", borderRadius: "8px",
                      }}>
                        <div style={{
                          width: "24px", height: "24px", borderRadius: "50%",
                          background: COLORS.success, color: "#000",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: "700", fontSize: "12px", flexShrink: 0,
                        }}>
                          {i + 1}
                        </div>
                        {video.thumbnail_url && (
                          <img src={video.thumbnail_url} alt="" style={{
                            width: "80px", height: "45px", borderRadius: "4px", objectFit: "cover", flexShrink: 0,
                          }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.title}</div>
                          <div style={{ fontSize: "11px", color: "#9E9E9E", marginTop: "2px" }}>{fmtNum(video.view_count)} views</div>
                        </div>
                        <div style={{
                          fontSize: "14px", fontWeight: "700", color: COLORS.success, flexShrink: 0,
                          background: "rgba(34, 197, 94, 0.1)", padding: "4px 10px", borderRadius: "6px",
                        }}>
                          {video.views_ratio}x
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Videos to Investigate (the opportunities) */}
              {investigateCount > 0 && (
                <div style={card()}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "10px",
                      background: "rgba(245, 158, 11, 0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <AlertTriangle size={20} style={{ color: COLORS.warning }} />
                    </div>
                    <div>
                      <div style={{ fontSize: "16px", fontWeight: "700" }}>Videos to Investigate</div>
                      <div style={{ fontSize: "12px", color: "#9E9E9E" }}>
                        High reach but low engagement — worth a closer look
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {videoAnalysis.investigateVideos.slice(0, 10).map((video, i) => (
                      <div key={i} style={{
                        display: "flex", gap: "12px", padding: "14px",
                        background: "#252525", borderRadius: "8px",
                        borderLeft: `3px solid ${COLORS.warning}`,
                      }}>
                        {video.thumbnail_url && (
                          <img
                            src={video.thumbnail_url}
                            alt=""
                            style={{ width: "120px", height: "68px", borderRadius: "6px", objectFit: "cover" }}
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "6px" }}>
                            {video.title}
                          </div>
                          <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "#9E9E9E", marginBottom: "8px" }}>
                            <span><Eye size={12} style={{ marginRight: "4px" }} />{fmtNum(video.view_count)} views ({video.views_ratio}x median)</span>
                            <span><ThumbsUp size={12} style={{ marginRight: "4px" }} />{fmtPct(video.engagement_rate)} engagement ({video.engagement_ratio}x median)</span>
                          </div>
                          <div style={{
                            fontSize: "12px", color: COLORS.warning, fontStyle: "italic",
                            background: "rgba(245, 158, 11, 0.1)", padding: "8px 12px", borderRadius: "6px",
                          }}>
                            <MessageCircle size={12} style={{ marginRight: "6px" }} />
                            {video.conversation_prompt}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Performance Map (scatter plot — supporting detail at bottom) */}
              <div style={card()}>
                {sectionTitle("Performance Map", "Each dot is a video plotted by views and engagement rate")}
                <VideoScatterPlot categorized={videoAnalysis.categorized} baselines={videoAnalysis.baselines} />
              </div>
            </>
            );
          })()}
        </div>
      )}

      {/* ── Series Tab ── */}
      {activeTab === "series" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {sectionTitle(`${series.total_series || 0} Series Detected`, `${series.uncategorized_count || 0} videos not in any series`)}

          {(series.series || []).length === 0 ? (
            <div style={{ ...card(), color: "#666", textAlign: "center" }}>
              No content series detected.
            </div>
          ) : (
            <>
              {/* Series Performance Chart */}
              <div style={card()}>
                {sectionTitle("Series by Average Views")}
                <SeriesBarChart series={series.series} />
              </div>

              {/* Series Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "12px" }}>
                {(series.series || []).map((s, i) => {
                  const trend = TREND_ICONS[s.performanceTrend] || TREND_ICONS.stable;
                  const TrendIcon = trend.Icon;
                  return (
                    <div key={i} style={card({ padding: "16px" })}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                        <div>
                          <div style={{ fontSize: "15px", fontWeight: "600" }}>{s.name}</div>
                          <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "2px" }}>
                            {s.detectionMethod === "semantic" ? "AI-detected" : "Pattern-matched"}
                            {s.cadenceDays && ` · Every ${s.cadenceDays} days`}
                          </div>
                        </div>
                        <div style={{
                          display: "flex", alignItems: "center", gap: "4px",
                          padding: "4px 10px", borderRadius: "12px",
                          background: `${trend.color}15`,
                        }}>
                          <TrendIcon size={14} style={{ color: trend.color }} />
                          <span style={{ fontSize: "12px", color: trend.color, fontWeight: "600", textTransform: "capitalize" }}>
                            {s.performanceTrend}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                        {[
                          { label: "Videos", value: s.videoCount },
                          { label: "Avg Views", value: fmtNum(s.avgViews) },
                          { label: "Total Views", value: fmtNum(s.totalViews) },
                          { label: "Engagement", value: fmtPct(s.avgEngagementRate) },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ background: "#252525", borderRadius: "6px", padding: "10px", textAlign: "center" }}>
                            <div style={{ fontSize: "10px", color: "#9E9E9E" }}>{label}</div>
                            <div style={{ fontSize: "14px", fontWeight: "600", marginTop: "2px" }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Benchmarks Tab ── */}
      {activeTab === "benchmarks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {!benchmark.hasBenchmarks ? (
            <div style={card()}>
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <Users size={48} style={{ color: "#444", marginBottom: "16px" }} />
                <div style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px", color: "#E0E0E0" }}>
                  No Peer Benchmarks Available
                </div>
                <div style={{ fontSize: "14px", color: "#9E9E9E", maxWidth: "500px", margin: "0 auto", lineHeight: "1.6" }}>
                  {benchmark.reason || "Benchmarking compares this channel against similar channels in your competitor database."}
                </div>
              </div>

              {/* How Benchmarking Works */}
              <div style={{
                marginTop: "20px", padding: "20px",
                background: "rgba(59, 130, 246, 0.05)",
                border: "1px solid rgba(59, 130, 246, 0.15)",
                borderRadius: "12px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <Info size={18} style={{ color: COLORS.primary }} />
                  <span style={{ fontSize: "14px", fontWeight: "600", color: "#E0E0E0" }}>How Benchmarking Works</span>
                </div>
                <div style={{ fontSize: "13px", color: "#9E9E9E", lineHeight: "1.7" }}>
                  <p style={{ margin: "0 0 12px 0" }}>
                    The benchmark system automatically finds <strong style={{ color: "#E0E0E0" }}>peer channels</strong> in
                    the same subscriber tier (±1 tier) from your competitor database, then compares key metrics:
                  </p>
                  <ul style={{ margin: "0 0 12px 0", paddingLeft: "20px" }}>
                    <li>Average views per video (90-day)</li>
                    <li>Engagement rate</li>
                    <li>Upload frequency</li>
                    <li>Content mix (Shorts vs Long-form)</li>
                  </ul>
                </div>
              </div>

              {/* How to Enable Benchmarks */}
              <div style={{
                marginTop: "16px", padding: "20px",
                background: "rgba(34, 197, 94, 0.05)",
                border: "1px solid rgba(34, 197, 94, 0.15)",
                borderRadius: "12px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <UserPlus size={18} style={{ color: COLORS.success }} />
                  <span style={{ fontSize: "14px", fontWeight: "600", color: "#E0E0E0" }}>How to Enable Benchmarks</span>
                </div>
                <div style={{ fontSize: "13px", color: "#9E9E9E", lineHeight: "1.7" }}>
                  <ol style={{ margin: 0, paddingLeft: "20px" }}>
                    <li style={{ marginBottom: "8px" }}>
                      Go to <strong style={{ color: "#E0E0E0" }}>Research → Competitor Analysis</strong>
                    </li>
                    <li style={{ marginBottom: "8px" }}>
                      Add competitor channels that are similar in size/niche to this channel
                    </li>
                    <li style={{ marginBottom: "8px" }}>
                      Enable <strong style={{ color: "#E0E0E0" }}>sync</strong> on those channels to track their videos
                    </li>
                    <li>
                      Re-run the audit — the system will automatically find matching peers
                    </li>
                  </ol>
                </div>
              </div>

              {/* Current Tier Info */}
              {snapshot.size_tier && (
                <div style={{
                  marginTop: "16px", padding: "16px",
                  background: "#252525", borderRadius: "8px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>This channel's tier</div>
                    <div style={{ fontSize: "15px", fontWeight: "600", color: getTierColor(snapshot.size_tier), textTransform: "capitalize" }}>
                      {snapshot.size_tier}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Subscribers</div>
                    <div style={{ fontSize: "15px", fontWeight: "600" }}>{fmtNum(snapshot.subscriber_count)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Peers needed</div>
                    <div style={{ fontSize: "15px", fontWeight: "600", color: COLORS.warning }}>Add to Research tab</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Tier Context Panel */}
              <TierContextPanel benchmark={benchmark} snapshot={snapshot} />

              {/* Radar Chart Overview */}
              <div style={card()}>
                {sectionTitle("Performance Radar", "Multi-metric comparison at a glance")}
                <BenchmarkRadarChart benchmark={benchmark} />
              </div>

              {/* Peer Comparison with range bars */}
              <div style={card()}>
                {sectionTitle("Peer Comparison")}
                <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "16px" }}>
                  Compared against {benchmark.peer_count} channels in same/adjacent tier
                  {benchmark.peer_names?.length > 0 && `: ${benchmark.peer_names.slice(0, 5).join(", ")}${benchmark.peer_names.length > 5 ? "..." : ""}`}
                </div>

                {(benchmark.comparison?.metrics || []).map((m, i) => (
                  <BenchmarkMetricBar key={i} metric={m} benchmarks={benchmark.benchmarks} />
                ))}

                {benchmark.comparison?.overallScore && (
                  <div style={{
                    marginTop: "16px", padding: "20px", background: "#252525",
                    borderRadius: "12px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: "12px", color: "#9E9E9E" }}>Overall Benchmark Score</div>
                    <div style={{
                      fontSize: "48px", fontWeight: "800", marginTop: "4px",
                      color: benchmark.comparison.overallScore >= 1.2 ? COLORS.success
                        : benchmark.comparison.overallScore >= 0.8 ? COLORS.warning : COLORS.danger,
                    }}>
                      {benchmark.comparison.overallScore}x
                    </div>
                    <div style={{ fontSize: "13px", color: "#666", marginTop: "4px" }}>
                      {benchmark.comparison.overallScore >= 1.2 ? "Outperforming peers" : benchmark.comparison.overallScore >= 0.8 ? "On par with peers" : "Below peer average"}
                    </div>
                  </div>
                )}
              </div>

              {/* Tier Ranges Reference */}
              {benchmark.benchmarks && <TierRangesPanel benchmark={benchmark} />}
            </>
          )}
        </div>
      )}

      {/* ── Opportunities Tab ── */}
      {activeTab === "opportunities" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Format Toggle + Insights */}
          {formatMix.hasBoth && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <FormatToggle value={formatFilter} onChange={setFormatFilter} />
            </div>
          )}

          {opportunities.format_insights && (
            <FormatInsightsCard insights={opportunities.format_insights} />
          )}

          {/* Content Gaps */}
          <div style={card()}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div style={{
                width: "40px", height: "40px", borderRadius: "10px",
                background: "rgba(139, 92, 246, 0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Lightbulb size={20} style={{ color: COLORS.purple }} />
              </div>
              <div>
                <div style={{ fontSize: "16px", fontWeight: "700" }}>Content Gaps</div>
                <div style={{ fontSize: "12px", color: "#9E9E9E" }}>Opportunities to fill unmet audience needs</div>
              </div>
            </div>
            {filterByFormat(opportunities.content_gaps || [], formatFilter).length === 0 ? (
              <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "20px" }}>No content gaps identified{formatFilter !== "all" ? " for this format" : ""}.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {filterByFormat(opportunities.content_gaps, formatFilter).map((g, i) => (
                  <OpportunityCard key={i} item={g} type="gap" />
                ))}
              </div>
            )}
          </div>

          {/* Growth Levers */}
          <div style={card()}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div style={{
                width: "40px", height: "40px", borderRadius: "10px",
                background: "rgba(34, 197, 94, 0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <TrendingUp size={20} style={{ color: COLORS.success }} />
              </div>
              <div>
                <div style={{ fontSize: "16px", fontWeight: "700" }}>Growth Levers</div>
                <div style={{ fontSize: "12px", color: "#9E9E9E" }}>Actionable improvements to accelerate growth</div>
              </div>
            </div>
            {filterByFormat(opportunities.growth_levers || [], formatFilter).length === 0 ? (
              <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "20px" }}>No growth levers identified{formatFilter !== "all" ? " for this format" : ""}.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {filterByFormat(opportunities.growth_levers, formatFilter).map((l, i) => (
                  <OpportunityCard key={i} item={l} type="lever" />
                ))}
              </div>
            )}
          </div>

          {/* Market Potential */}
          {opportunities.market_potential && (
            <div style={card()}>
              {sectionTitle("Market Potential")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {[
                  { label: "Tier Position", value: opportunities.market_potential.tier_position },
                  { label: "Growth Ceiling", value: opportunities.market_potential.growth_ceiling },
                  { label: "Key Differentiators", value: (opportunities.market_potential.key_differentiators || []).join(", ") || "—" },
                  { label: "Biggest Risk", value: opportunities.market_potential.biggest_risk },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                    <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>{label}</div>
                    <div style={{ fontSize: "13px" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Recommendations Tab ── */}
      {activeTab === "recommendations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Check if recommendations are completely empty */}
          {(!recommendations.stop?.length && !recommendations.start?.length && !recommendations.optimize?.length) ? (
            <div style={card()}>
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <Target size={48} style={{ color: "#444", marginBottom: "16px" }} />
                <div style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px", color: "#E0E0E0" }}>
                  No Recommendations Generated
                </div>
                <div style={{ fontSize: "14px", color: "#9E9E9E", maxWidth: "500px", margin: "0 auto", lineHeight: "1.6" }}>
                  The AI analysis didn't produce recommendations for this audit. This can happen if:
                </div>
                <ul style={{ textAlign: "left", maxWidth: "400px", margin: "16px auto", fontSize: "13px", color: "#9E9E9E", lineHeight: "1.7" }}>
                  <li>The channel has very few videos to analyze</li>
                  <li>There was an error during the AI analysis step</li>
                  <li>The audit was interrupted before completing</li>
                </ul>
                <div style={{ fontSize: "13px", color: "#666", marginTop: "16px" }}>
                  Try running a new audit to generate fresh recommendations.
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Format Toggle */}
              {formatMix.hasBoth && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <FormatToggle value={formatFilter} onChange={setFormatFilter} />
                </div>
              )}

              {/* Impact Overview */}
              <RecommendationsOverview recommendations={recommendations} />

          {/* Stop/Start/Optimize Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
            {/* Stop */}
            <RecommendationColumn
              title="Stop"
              color={COLORS.danger}
              icon="🛑"
              items={filterByFormat(recommendations.stop || [], formatFilter)}
              description="Discontinue or phase out"
            />

            {/* Start */}
            <RecommendationColumn
              title="Start"
              color={COLORS.success}
              icon="🚀"
              items={filterByFormat(recommendations.start || [], formatFilter)}
              description="New initiatives to begin"
            />

            {/* Optimize */}
            <RecommendationColumn
              title="Optimize"
              color={COLORS.warning}
              icon="⚡"
              items={filterByFormat(recommendations.optimize || [], formatFilter)}
              description="Improve existing processes"
            />
          </div>
            </>
          )}
        </div>
      )}

      {/* ── Outreach Tab ── */}
      {activeTab === "outreach" && (
        <OutreachBuilder audit={audit} videoAnalysis={videoAnalysis} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function SummaryScoreGauge({ score }) {
  const value = Math.min(Math.max(score, 0), 2.5);
  const percentage = (value / 2.5) * 100;
  const gaugeColor = score >= 1.2 ? COLORS.success : score >= 0.8 ? COLORS.warning : COLORS.danger;
  const data = [
    { value: percentage, color: gaugeColor },
    { value: 100 - percentage, color: "#252525" },
  ];

  return (
    <div style={{ position: "relative", width: "100%", height: "180px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="85%"
            startAngle={180}
            endAngle={0}
            innerRadius="60%"
            outerRadius="85%"
            paddingAngle={0}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`gauge-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: "absolute", bottom: "15px", left: "50%",
        transform: "translateX(-50%)", textAlign: "center",
      }}>
        <div style={{ fontSize: "36px", fontWeight: "800", color: gaugeColor, lineHeight: 1 }}>{score}x</div>
        <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "4px" }}>
          {score >= 1.2 ? "Outperforming peers" : score >= 0.8 ? "On par with peers" : "Below peer average"}
        </div>
      </div>
    </div>
  );
}

function GlanceItem({ icon: Icon, label, value, color }) {
  return (
    <div style={{
      background: "#252525", borderRadius: "8px", padding: "14px",
      display: "flex", alignItems: "center", gap: "12px",
    }}>
      <div style={{
        width: "36px", height: "36px", borderRadius: "8px",
        background: `${color}15`, display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: "20px", fontWeight: "700" }}>{value}</div>
        <div style={{ fontSize: "11px", color: "#9E9E9E" }}>{label}</div>
      </div>
    </div>
  );
}

function SummaryHighlights({ benchmark, opportunities, series, videoAnalysis, cardStyle }) {
  const strengths = [];

  if (benchmark?.comparison?.metrics) {
    benchmark.comparison.metrics
      .filter(m => m.status === "above")
      .forEach(m => strengths.push(`${m.name}: ${m.ratio}x peer median`));
  }

  if (videoAnalysis?.highReachVideos) {
    const breakouts = videoAnalysis.highReachVideos.filter(v => !v.is_low_engagement).length;
    if (breakouts > 0) {
      strengths.push(`${breakouts} breakout performer${breakouts > 1 ? "s" : ""} with high reach & engagement`);
    }
  }

  if (series?.series) {
    const growing = series.series.filter(s => s.performanceTrend === "growing");
    if (growing.length > 0) {
      strengths.push(`${growing.length} series with growing performance trend`);
    }
  }

  const opps = [];
  if (opportunities?.content_gaps) {
    opportunities.content_gaps.slice(0, 3).forEach(g => opps.push(g.gap));
  }
  if (opps.length < 3 && opportunities?.growth_levers) {
    opportunities.growth_levers.slice(0, 3 - opps.length).forEach(l => opps.push(l.lever));
  }

  if (!strengths.length && !opps.length) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <div style={cardStyle({ borderLeft: `3px solid ${COLORS.success}` })}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <Zap size={16} style={{ color: COLORS.success }} />
          <div style={{ fontSize: "14px", fontWeight: "700", color: COLORS.success }}>Strengths</div>
        </div>
        {strengths.length === 0 ? (
          <div style={{ fontSize: "12px", color: "#666" }}>Add peer benchmarks to identify strengths</div>
        ) : (
          strengths.slice(0, 3).map((s, i) => (
            <div key={i} style={{
              fontSize: "13px", color: "#E0E0E0", marginBottom: "8px",
              paddingLeft: "12px", borderLeft: "2px solid rgba(34, 197, 94, 0.3)",
            }}>
              {s}
            </div>
          ))
        )}
      </div>

      <div style={cardStyle({ borderLeft: `3px solid ${COLORS.purple}` })}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <Lightbulb size={16} style={{ color: COLORS.purple }} />
          <div style={{ fontSize: "14px", fontWeight: "700", color: COLORS.purple }}>Key Opportunities</div>
        </div>
        {opps.length === 0 ? (
          <div style={{ fontSize: "12px", color: "#666" }}>No opportunities identified yet</div>
        ) : (
          opps.slice(0, 3).map((o, i) => (
            <div key={i} style={{
              fontSize: "13px", color: "#E0E0E0", marginBottom: "8px",
              paddingLeft: "12px", borderLeft: "2px solid rgba(139, 92, 246, 0.3)",
            }}>
              {o}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, color }) {
  return (
    <div style={{
      background: "#252525", borderRadius: "8px", padding: "16px",
      display: "flex", alignItems: "center", gap: "12px",
    }}>
      <div style={{
        width: "40px", height: "40px", borderRadius: "10px",
        background: `${color}20`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "2px" }}>{label}</div>
        <div style={{ fontSize: "20px", fontWeight: "700" }}>{value}</div>
      </div>
    </div>
  );
}

function ContentMixChart({ videos }) {
  const data = useMemo(() => {
    const shorts = videos.filter(v => v.is_short || (v.duration && v.duration < 62)).length;
    const longForm = videos.length - shorts;
    return [
      { name: "Shorts", value: shorts, color: COLORS.pink },
      { name: "Long-form", value: longForm, color: COLORS.primary },
    ];
  }, [videos]);

  if (!videos.length) {
    return <div style={{ color: "#666", textAlign: "center", padding: "40px" }}>No video data</div>;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
      <div style={{ width: "160px", height: "160px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ flex: 1 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: d.color }} />
            <div style={{ flex: 1, fontSize: "13px" }}>{d.name}</div>
            <div style={{ fontSize: "16px", fontWeight: "700" }}>{d.value}</div>
            <div style={{ fontSize: "12px", color: "#9E9E9E" }}>
              ({Math.round((d.value / videos.length) * 100)}%)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ViewsDistributionChart({ videos }) {
  const data = useMemo(() => {
    if (!videos.length) return [];
    const buckets = [
      { label: "<1K", min: 0, max: 1000, count: 0 },
      { label: "1K-10K", min: 1000, max: 10000, count: 0 },
      { label: "10K-50K", min: 10000, max: 50000, count: 0 },
      { label: "50K-100K", min: 50000, max: 100000, count: 0 },
      { label: "100K-500K", min: 100000, max: 500000, count: 0 },
      { label: "500K+", min: 500000, max: Infinity, count: 0 },
    ];
    videos.forEach(v => {
      const views = v.view_count || 0;
      const bucket = buckets.find(b => views >= b.min && views < b.max);
      if (bucket) bucket.count++;
    });
    return buckets.map(b => ({ name: b.label, value: b.count }));
  }, [videos]);

  if (!data.length) {
    return <div style={{ color: "#666", textAlign: "center", padding: "40px" }}>No video data</div>;
  }

  return (
    <div style={{ height: "200px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
          <XAxis type="number" stroke="#666" fontSize={11} />
          <YAxis type="category" dataKey="name" stroke="#666" fontSize={11} width={70} />
          <Tooltip
            contentStyle={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "8px" }}
            labelStyle={{ color: "#E0E0E0" }}
          />
          <Bar dataKey="value" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function VideoScatterPlot({ categorized, baselines }) {
  const data = useMemo(() => {
    return categorized.map(v => ({
      x: Math.max(v.view_count || 1, 1),
      y: (v.engagement_rate || 0) * 100,
      title: v.title,
      isInvestigate: v.is_high_reach && v.is_low_engagement,
      isHighReach: v.is_high_reach && !v.is_low_engagement,
      isLowEngagement: !v.is_high_reach && v.is_low_engagement,
    }));
  }, [categorized]);

  const investigateData = data.filter(d => d.isInvestigate);
  const highReachData = data.filter(d => d.isHighReach);
  const lowEngagementData = data.filter(d => d.isLowEngagement);
  const normalData = data.filter(d => !d.isInvestigate && !d.isHighReach && !d.isLowEngagement);

  return (
    <div style={{ height: "350px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            type="number"
            dataKey="x"
            name="Views"
            stroke="#666"
            fontSize={11}
            scale="log"
            domain={['auto', 'auto']}
            tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
            label={{ value: 'Views (log scale)', position: 'bottom', offset: 20, fill: '#666', fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Engagement %"
            stroke="#666"
            fontSize={11}
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            label={{ value: 'Engagement Rate', angle: -90, position: 'insideLeft', fill: '#666', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "8px", maxWidth: "300px" }}
            labelStyle={{ color: "#E0E0E0" }}
            formatter={(value, name) => [name === 'x' ? value.toLocaleString() + ' views' : value.toFixed(2) + '%', name === 'x' ? 'Views' : 'Engagement']}
            labelFormatter={(_, payload) => payload[0]?.payload?.title || ''}
          />
          <ReferenceLine x={baselines.highReachThreshold} stroke={COLORS.success} strokeDasharray="5 5" strokeOpacity={0.5} />
          <ReferenceLine y={baselines.lowEngagementThreshold * 100} stroke={COLORS.danger} strokeDasharray="5 5" strokeOpacity={0.5} />
          <Scatter name="Normal" data={normalData} fill={COLORS.gray} fillOpacity={0.4} />
          <Scatter name="High Reach" data={highReachData} fill={COLORS.success} />
          <Scatter name="Low Engagement" data={lowEngagementData} fill={COLORS.danger} fillOpacity={0.6} />
          <Scatter name="Investigate" data={investigateData} fill={COLORS.warning} />
          <Legend wrapperStyle={{ paddingTop: "10px" }} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function SeriesBarChart({ series }) {
  const data = useMemo(() => {
    return [...series]
      .sort((a, b) => (b.avgViews || 0) - (a.avgViews || 0))
      .slice(0, 10)
      .map(s => ({
        name: s.name.length > 20 ? s.name.slice(0, 20) + "..." : s.name,
        avgViews: s.avgViews || 0,
        videoCount: s.videoCount,
      }));
  }, [series]);

  return (
    <div style={{ height: "300px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
          <XAxis type="number" stroke="#666" fontSize={11} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
          <YAxis type="category" dataKey="name" stroke="#666" fontSize={11} width={150} />
          <Tooltip
            contentStyle={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "8px" }}
            formatter={(value, name) => [value.toLocaleString(), name === 'avgViews' ? 'Avg Views' : 'Videos']}
          />
          <Bar dataKey="avgViews" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BenchmarkRadarChart({ benchmark }) {
  const data = useMemo(() => {
    if (!benchmark.comparison?.metrics) return [];
    return benchmark.comparison.metrics.map(m => ({
      metric: m.name.replace("Average ", "Avg ").replace("per Video", "/Video"),
      value: Math.min(m.ratio * 100, 200), // Cap at 200% for visual balance
      fullMark: 200,
    }));
  }, [benchmark]);

  if (!data.length) return null;

  return (
    <div style={{ height: "300px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#333" />
          <PolarAngleAxis dataKey="metric" stroke="#9E9E9E" fontSize={11} />
          <PolarRadiusAxis angle={90} domain={[0, 200]} stroke="#333" fontSize={10} tickFormatter={(v) => `${v}%`} />
          <Radar
            name="Channel"
            dataKey="value"
            stroke={COLORS.primary}
            fill={COLORS.primary}
            fillOpacity={0.3}
            strokeWidth={2}
          />
          <ReferenceLine y={100} stroke="#666" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "8px" }}
            formatter={(value) => [`${(value).toFixed(0)}% of peer median`]}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BenchmarkMetricBar({ metric, benchmarks }) {
  const m = metric;
  const statusColor = m.status === "above" ? COLORS.success : m.status === "below" ? COLORS.danger : COLORS.warning;
  const bm = benchmarks || {};

  let p25, p75, fmtVal;
  if (m.name === "Engagement Rate") {
    p25 = bm.engagementRate?.p25;
    p75 = bm.engagementRate?.p75;
    fmtVal = (v) => (v * 100).toFixed(2) + "%";
  } else if (m.name === "Average Views per Video") {
    p25 = bm.all?.p25;
    p75 = bm.all?.p75;
    fmtVal = (v) => Math.round(v).toLocaleString();
  } else {
    p25 = null;
    p75 = null;
    fmtVal = (v) => (typeof v === "number" ? v.toFixed(1) : v) + "/wk";
  }

  return (
    <div style={{
      padding: "14px 16px", background: "#252525", borderRadius: "8px",
      marginBottom: "10px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ fontSize: "13px", fontWeight: "600" }}>{m.name}</div>
        <div style={{
          padding: "3px 10px", borderRadius: "6px", fontSize: "12px",
          fontWeight: "600", color: statusColor,
          background: `${statusColor}15`,
          textTransform: "capitalize",
        }}>
          {m.ratio}x · {m.status}
        </div>
      </div>

      <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "#9E9E9E", marginBottom: p25 != null ? "10px" : "0" }}>
        <span>You: <strong style={{ color: "#E0E0E0" }}>{typeof m.value === "number" && fmtVal ? fmtVal(m.value) : m.value}</strong></span>
        <span>Peer median: <strong style={{ color: "#E0E0E0" }}>{typeof m.benchmark === "number" && fmtVal ? fmtVal(m.benchmark) : m.benchmark}</strong></span>
        {p25 != null && p75 != null && fmtVal && (
          <span>Range: <strong style={{ color: "#E0E0E0" }}>{fmtVal(p25)} – {fmtVal(p75)}</strong></span>
        )}
      </div>

      {p25 != null && p75 != null && m.value != null && p75 > 0 && (
        <RangeBar p25={p25} p75={p75} median={m.benchmark} channelVal={m.value} statusColor={statusColor} />
      )}
    </div>
  );
}

function RangeBar({ p25, p75, median, channelVal, statusColor }) {
  const rangeMax = Math.max(p75 * 1.5, channelVal * 1.2);
  const leftPct = Math.min((p25 / rangeMax) * 100, 95);
  const widthPct = Math.min(((p75 - p25) / rangeMax) * 100, 95 - leftPct);
  const channelPct = Math.min((channelVal / rangeMax) * 100, 98);
  const medianPct = Math.min((median / rangeMax) * 100, 98);

  return (
    <div style={{ position: "relative", height: "24px" }}>
      <div style={{
        position: "absolute", top: "10px", left: 0, right: 0, height: "4px",
        background: "#333", borderRadius: "2px",
      }} />
      <div style={{
        position: "absolute", top: "8px", height: "8px",
        left: `${leftPct}%`, width: `${Math.max(widthPct, 1)}%`,
        background: "rgba(96, 165, 250, 0.25)", borderRadius: "4px",
        border: "1px solid rgba(96, 165, 250, 0.4)",
      }} />
      <div style={{
        position: "absolute", top: "6px",
        left: `${medianPct}%`, width: "2px", height: "12px",
        background: "#60a5fa", borderRadius: "1px",
      }} />
      <div style={{
        position: "absolute", top: "4px",
        left: `calc(${channelPct}% - 7px)`,
        width: "14px", height: "14px", borderRadius: "50%",
        background: statusColor, border: "2px solid #252525",
      }} />
      <div style={{
        position: "absolute", top: "0", left: "0", right: "0",
        display: "flex", justifyContent: "space-between",
        fontSize: "9px", color: "#555",
      }}>
        <span>p25</span>
        <span>p75</span>
      </div>
    </div>
  );
}

function TierContextPanel({ benchmark, snapshot }) {
  const TIER_INFO = {
    emerging: { label: "Emerging", range: "0 – 10K", color: "#6b7280" },
    growing: { label: "Growing", range: "10K – 100K", color: "#3b82f6" },
    established: { label: "Established", range: "100K – 500K", color: "#8b5cf6" },
    major: { label: "Major", range: "500K – 1M", color: "#f59e0b" },
    elite: { label: "Elite", range: "1M+", color: "#ef4444" },
  };
  const tier = benchmark.tier || snapshot.size_tier;
  const info = TIER_INFO[tier];
  if (!info) return null;
  const subs = snapshot.subscriber_count || 0;

  return (
    <div style={{
      background: "#1E1E1E", borderRadius: "12px", border: "1px solid #333",
      padding: "24px", display: "flex", alignItems: "center", gap: "16px",
      borderLeft: `3px solid ${info.color}`,
    }}>
      <div style={{
        width: "56px", height: "56px", borderRadius: "12px",
        background: `${info.color}20`, display: "flex",
        alignItems: "center", justifyContent: "center",
        fontSize: "24px", fontWeight: "800", color: info.color,
      }}>
        {info.label[0]}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "18px", fontWeight: "700" }}>
          <span style={{ color: info.color }}>{info.label}</span> Tier
        </div>
        <div style={{ fontSize: "13px", color: "#9E9E9E", marginTop: "4px" }}>
          {info.range} subscribers · {subs.toLocaleString()} subs (this channel)
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "12px", color: "#9E9E9E" }}>Peers matched</div>
        <div style={{ fontSize: "28px", fontWeight: "700" }}>{benchmark.peer_count}</div>
      </div>
    </div>
  );
}

function TierRangesPanel({ benchmark }) {
  const bm = benchmark.benchmarks;

  return (
    <div style={{
      background: "#1E1E1E", borderRadius: "12px", border: "1px solid #333", padding: "24px",
    }}>
      <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>Tier Ranges (90-day peer data)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
        {bm.all && (
          <TierRangeCard
            title="Views per Video"
            subtitle={`${bm.all.count} videos from ${benchmark.peer_count} peers`}
            p25={bm.all.p25}
            median={bm.all.median}
            p75={bm.all.p75}
            format={(v) => v.toLocaleString()}
          />
        )}
        {bm.engagementRate && (
          <TierRangeCard
            title="Engagement Rate"
            p25={bm.engagementRate.p25}
            median={bm.engagementRate.median}
            p75={bm.engagementRate.p75}
            format={(v) => (v * 100).toFixed(2) + "%"}
          />
        )}
        {bm.uploadFrequency && (
          <TierRangeCard
            title="Upload Frequency"
            median={bm.uploadFrequency.median}
            format={(v) => v.toFixed(1) + "/week"}
            singleValue
          />
        )}
        {bm.contentMix && (
          <TierRangeCard
            title="Content Mix"
            customContent={
              <div style={{ fontSize: "13px", color: "#E0E0E0" }}>
                {bm.contentMix.shortsRatio}% Shorts · {bm.contentMix.longsRatio}% Long-form
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}

function TierRangeCard({ title, subtitle, p25, median, p75, format, singleValue, customContent }) {
  return (
    <div style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
      <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>{title}</div>
      {subtitle && <div style={{ fontSize: "10px", color: "#666", marginBottom: "8px" }}>{subtitle}</div>}
      {customContent ? customContent : singleValue ? (
        <div style={{ fontSize: "20px", fontWeight: "700" }}>{format(median)}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
          <div style={{ background: "#1E1E1E", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
            <div style={{ fontSize: "9px", color: "#666" }}>p25</div>
            <div style={{ fontSize: "13px", fontWeight: "600", color: COLORS.danger }}>{format(p25 || 0)}</div>
          </div>
          <div style={{ background: "#1E1E1E", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
            <div style={{ fontSize: "9px", color: "#666" }}>Median</div>
            <div style={{ fontSize: "13px", fontWeight: "600", color: COLORS.warning }}>{format(median || 0)}</div>
          </div>
          <div style={{ background: "#1E1E1E", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
            <div style={{ fontSize: "9px", color: "#666" }}>p75</div>
            <div style={{ fontSize: "13px", fontWeight: "600", color: COLORS.success }}>{format(p75 || 0)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ item, type }) {
  const isGap = type === "gap";
  const impact = isGap ? item.potential_impact : item.priority;
  const impactColor = impact === "high" ? COLORS.success : impact === "medium" ? COLORS.warning : COLORS.gray;

  return (
    <div style={{
      padding: "16px", background: "#252525", borderRadius: "8px",
      borderLeft: `3px solid ${impactColor}`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ fontSize: "14px", fontWeight: "600" }}>
          {isGap ? item.gap : item.lever}
          <FormatBadge format={item.format} />
        </div>
        <span style={{
          fontSize: "10px", fontWeight: "600", padding: "3px 8px", borderRadius: "4px",
          color: impactColor, background: `${impactColor}15`, textTransform: "uppercase", flexShrink: 0,
        }}>
          {impact} {isGap ? "impact" : "priority"}
        </span>
      </div>
      <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "6px" }}>
        {isGap ? item.evidence : `${item.current_state} → ${item.target_state}`}
      </div>
      {item.suggested_action && (
        <div style={{ fontSize: "12px", color: COLORS.primary, marginTop: "8px" }}>
          → {item.suggested_action}
        </div>
      )}
    </div>
  );
}

function RecommendationsOverview({ recommendations }) {
  const allRecs = [
    ...(recommendations.stop || []).map(r => ({ ...r, type: "stop" })),
    ...(recommendations.start || []).map(r => ({ ...r, type: "start" })),
    ...(recommendations.optimize || []).map(r => ({ ...r, type: "optimize" })),
  ];

  const highImpact = allRecs.filter(r => r.impact === "high").length;
  const mediumImpact = allRecs.filter(r => r.impact === "medium").length;
  const lowImpact = allRecs.filter(r => r.impact === "low" || !r.impact).length;

  return (
    <div style={{
      background: "#1E1E1E", borderRadius: "12px", border: "1px solid #333",
      padding: "24px", display: "flex", alignItems: "center", gap: "24px",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "8px" }}>
          {allRecs.length} Recommendations
        </div>
        <div style={{ display: "flex", gap: "16px", fontSize: "13px" }}>
          <span style={{ color: COLORS.danger }}>🛑 {(recommendations.stop || []).length} Stop</span>
          <span style={{ color: COLORS.success }}>🚀 {(recommendations.start || []).length} Start</span>
          <span style={{ color: COLORS.warning }}>⚡ {(recommendations.optimize || []).length} Optimize</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: "12px" }}>
        {[
          { label: "High Impact", count: highImpact, color: COLORS.success },
          { label: "Medium", count: mediumImpact, color: COLORS.warning },
          { label: "Low", count: lowImpact, color: COLORS.gray },
        ].map(({ label, count, color }) => (
          <div key={label} style={{
            background: "#252525", borderRadius: "8px", padding: "12px 16px", textAlign: "center",
            minWidth: "80px",
          }}>
            <div style={{ fontSize: "20px", fontWeight: "700", color }}>{count}</div>
            <div style={{ fontSize: "10px", color: "#9E9E9E" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendationColumn({ title, color, icon, items, description }) {
  return (
    <div style={{
      background: "#1E1E1E", borderRadius: "12px", border: "1px solid #333", padding: "24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <span style={{ fontSize: "20px" }}>{icon}</span>
        <div style={{ fontSize: "18px", fontWeight: "700", color }}>{title}</div>
      </div>
      <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "16px" }}>{description}</div>
      {items.length === 0 ? (
        <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "20px" }}>
          No recommendations.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {items.map((r, i) => (
            <div key={i} style={{
              padding: "14px", background: "#252525", borderRadius: "8px",
              borderLeft: `3px solid ${color}`,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "6px" }}>
                <div style={{ fontSize: "13px", fontWeight: "600" }}>
                  {r.action}
                  <FormatBadge format={r.format} />
                </div>
                {r.impact && (
                  <span style={{
                    fontSize: "9px", fontWeight: "600", padding: "2px 6px", borderRadius: "4px",
                    color: r.impact === "high" ? COLORS.success : r.impact === "medium" ? COLORS.warning : COLORS.gray,
                    background: r.impact === "high" ? `${COLORS.success}15` : r.impact === "medium" ? `${COLORS.warning}15` : `${COLORS.gray}15`,
                    textTransform: "uppercase",
                  }}>
                    {r.impact}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "12px", color: "#9E9E9E" }}>{r.rationale}</div>
              {r.evidence && <div style={{ fontSize: "11px", color: "#666", marginTop: "6px" }}>{r.evidence}</div>}
              {r.effort && (
                <div style={{ fontSize: "10px", color: "#666", marginTop: "6px" }}>
                  Effort: <span style={{ color: "#9E9E9E" }}>{r.effort}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormatToggle({ value, onChange }) {
  const options = [
    { id: "all", label: "All" },
    { id: "long_form", label: "Long-form" },
    { id: "short_form", label: "Shorts" },
  ];
  return (
    <div style={{ display: "flex", gap: "4px", background: "#252525", borderRadius: "8px", padding: "3px" }}>
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)} style={{
          padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "600",
          border: "none", cursor: "pointer", transition: "all 0.15s",
          background: value === o.id ? "#3b82f6" : "transparent",
          color: value === o.id ? "#fff" : "#9E9E9E",
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FormatBadge({ format }) {
  if (!format || format === "both") return null;
  const isShort = format === "short_form";
  return (
    <span style={{
      fontSize: "9px", fontWeight: "600", padding: "2px 6px", borderRadius: "4px",
      color: isShort ? "#ec4899" : "#3b82f6",
      background: isShort ? "rgba(236, 72, 153, 0.15)" : "rgba(59, 130, 246, 0.15)",
      marginLeft: "6px", textTransform: "uppercase",
    }}>
      {isShort ? "Shorts" : "Long-form"}
    </span>
  );
}

function FormatInsightsCard({ insights }) {
  if (!insights) return null;
  const healthColor = (h) =>
    h === "strong" ? COLORS.success : h === "moderate" ? COLORS.warning : h === "weak" ? COLORS.danger : COLORS.gray;

  return (
    <div style={{
      background: "#1E1E1E", borderRadius: "12px", border: "1px solid #333",
      padding: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px",
    }}>
      {[
        { label: "Long-form", data: insights.long_form, color: "#3b82f6" },
        { label: "Shorts", data: insights.short_form, color: "#ec4899" },
      ].map(({ label, data, color }) => (
        <div key={label} style={{ padding: "16px", background: "#252525", borderRadius: "8px", borderTop: `3px solid ${color}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: "700" }}>{label}</div>
            {data?.health && (
              <span style={{
                fontSize: "10px", fontWeight: "600", padding: "3px 8px", borderRadius: "4px",
                color: healthColor(data.health), background: `${healthColor(data.health)}15`,
                textTransform: "uppercase",
              }}>
                {data.health}
              </span>
            )}
          </div>
          <div style={{ fontSize: "12px", color: "#9E9E9E", lineHeight: "1.5" }}>
            {data?.summary || "No data available"}
          </div>
        </div>
      ))}
      {insights.format_balance && (
        <div style={{ gridColumn: "1 / -1", fontSize: "12px", color: "#9E9E9E", padding: "8px 0 0" }}>
          {insights.format_balance}
        </div>
      )}
    </div>
  );
}

function filterByFormat(items, filter) {
  if (filter === "all") return items;
  return items.filter(item => {
    const f = item.format || "both";
    return f === filter || f === "both";
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getTierColor(tier) {
  const colors = {
    emerging: "#6b7280",
    growing: "#3b82f6",
    established: "#8b5cf6",
    major: "#f59e0b",
    elite: "#ef4444",
  };
  return colors[tier] || "#6b7280";
}

function formatMarkdown(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<div style="font-size:15px;font-weight:700;margin:16px 0 8px">$1</div>')
    .replace(/^## (.+)$/gm, '<div style="font-size:17px;font-weight:700;margin:20px 0 10px">$1</div>')
    .replace(/^# (.+)$/gm, '<div style="font-size:20px;font-weight:700;margin:24px 0 12px">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, '<div style="padding-left:16px;margin:4px 0">• $1</div>')
    .replace(/\n\n/g, '<div style="margin-top:12px"></div>')
    .replace(/\n/g, "<br/>");
}
