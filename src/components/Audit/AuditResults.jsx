import React, { useState } from "react";
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
} from "lucide-react";
import AuditPDFExport from "./AuditPDFExport";

const TABS = [
  { id: "summary", label: "Summary", icon: FileText },
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "series", label: "Series", icon: Layers },
  { id: "benchmarks", label: "Benchmarks", icon: Users },
  { id: "opportunities", label: "Opportunities", icon: Lightbulb },
  { id: "recommendations", label: "Recommendations", icon: Target },
];

const TREND_ICONS = {
  growing: { Icon: TrendingUp, color: "#22c55e" },
  declining: { Icon: TrendingDown, color: "#ef4444" },
  stable: { Icon: Minus, color: "#9E9E9E" },
  new: { Icon: TrendingUp, color: "#3b82f6" },
};

export default function AuditResults({ audit, onBack }) {
  const [activeTab, setActiveTab] = useState("summary");

  const snapshot = audit.channel_snapshot || {};
  const series = audit.series_summary || {};
  const benchmark = audit.benchmark_data || {};
  const opportunities = audit.opportunities || {};
  const recommendations = audit.recommendations || {};
  const summary = audit.executive_summary || "";

  // Card style helper
  const card = (extra = {}) => ({
    background: "#1E1E1E",
    borderRadius: "12px",
    border: "1px solid #333",
    padding: "24px",
    ...extra,
  });

  const sectionTitle = (text) => (
    <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>{text}</div>
  );

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
        <AuditPDFExport audit={audit} />
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
          </button>
        ))}
      </div>

      {/* ── Summary Tab ── */}
      {activeTab === "summary" && (
        <div style={card()}>
          {typeof summary === "string" ? (
            <div
              style={{ fontSize: "14px", lineHeight: "1.8", color: "#E0E0E0" }}
              dangerouslySetInnerHTML={{ __html: formatMarkdown(summary) }}
            />
          ) : summary?.summary ? (
            <div
              style={{ fontSize: "14px", lineHeight: "1.8", color: "#E0E0E0" }}
              dangerouslySetInnerHTML={{ __html: formatMarkdown(summary.summary) }}
            />
          ) : (
            <div style={{ color: "#666", textAlign: "center", padding: "40px" }}>
              No executive summary available.
            </div>
          )}
        </div>
      )}

      {/* ── Overview Tab ── */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Channel info */}
          <div style={card()}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
              {snapshot.thumbnail_url && (
                <img src={snapshot.thumbnail_url} alt="" style={{ width: "56px", height: "56px", borderRadius: "50%" }} />
              )}
              <div>
                <div style={{ fontSize: "18px", fontWeight: "700" }}>{snapshot.name}</div>
                <div style={{ fontSize: "13px", color: "#9E9E9E" }}>
                  {snapshot.youtube_channel_id} · {snapshot.size_tier}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
              {[
                { label: "Subscribers", value: (snapshot.subscriber_count || 0).toLocaleString() },
                { label: "Total Views", value: (snapshot.total_view_count || 0).toLocaleString() },
                { label: "Videos Analyzed", value: snapshot.total_videos_analyzed },
                { label: "Recent (90d)", value: snapshot.recent_videos_90d },
                { label: "Avg Views (90d)", value: (snapshot.avg_views_recent || 0).toLocaleString() },
                { label: "Avg Engagement", value: ((snapshot.avg_engagement_recent || 0) * 100).toFixed(2) + "%" },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "#252525", borderRadius: "8px", padding: "14px", textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "6px" }}>{label}</div>
                  <div style={{ fontSize: "16px", fontWeight: "700" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Series Tab ── */}
      {activeTab === "series" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {sectionTitle(`${series.total_series || 0} Series Detected`)}
          {(series.series || []).length === 0 && (
            <div style={{ ...card(), color: "#666", textAlign: "center" }}>
              No content series detected.
            </div>
          )}
          {(series.series || []).map((s, i) => {
            const trend = TREND_ICONS[s.performanceTrend] || TREND_ICONS.stable;
            const TrendIcon = trend.Icon;
            return (
              <div key={i} style={card()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: "600" }}>{s.name}</div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "2px" }}>
                      {s.detectionMethod === "semantic" ? "AI-detected" : "Pattern-matched"}
                      {s.cadenceDays && ` · Every ${s.cadenceDays} days`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <TrendIcon size={14} style={{ color: trend.color }} />
                    <span style={{ fontSize: "12px", color: trend.color, fontWeight: "600", textTransform: "capitalize" }}>
                      {s.performanceTrend}
                    </span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                  {[
                    { label: "Videos", value: s.videoCount },
                    { label: "Avg Views", value: (s.avgViews || 0).toLocaleString() },
                    { label: "Total Views", value: (s.totalViews || 0).toLocaleString() },
                    { label: "Engagement", value: ((s.avgEngagementRate || 0) * 100).toFixed(2) + "%" },
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
          {series.uncategorized_count > 0 && (
            <div style={{ fontSize: "13px", color: "#666", textAlign: "center", marginTop: "8px" }}>
              {series.uncategorized_count} videos not assigned to any series
            </div>
          )}
        </div>
      )}

      {/* ── Benchmarks Tab ── */}
      {activeTab === "benchmarks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {!benchmark.hasBenchmarks ? (
            <div style={{ ...card(), color: "#9E9E9E", textAlign: "center", padding: "40px" }}>
              <Users size={32} style={{ color: "#444", marginBottom: "12px" }} />
              <div style={{ fontSize: "14px" }}>
                {benchmark.reason || "No peer benchmarks available. Add competitors to enable benchmarking."}
              </div>
            </div>
          ) : (
            <>
              <div style={card()}>
                {sectionTitle("Peer Comparison")}
                <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "16px" }}>
                  Compared against {benchmark.peer_count} peer channels
                  {benchmark.peer_names?.length > 0 && `: ${benchmark.peer_names.slice(0, 5).join(", ")}${benchmark.peer_names.length > 5 ? "..." : ""}`}
                </div>

                {(benchmark.comparison?.metrics || []).map((m, i) => {
                  const statusColor = m.status === "above" ? "#22c55e" : m.status === "below" ? "#ef4444" : "#f59e0b";
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "12px 16px", background: "#252525", borderRadius: "8px",
                      marginBottom: "8px",
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: "600" }}>{m.name}</div>
                        <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "2px" }}>
                          You: {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
                          {" · "}Peers: {typeof m.benchmark === "number" ? m.benchmark.toLocaleString() : m.benchmark}
                        </div>
                      </div>
                      <div style={{
                        padding: "4px 10px", borderRadius: "6px", fontSize: "12px",
                        fontWeight: "600", color: statusColor,
                        background: `${statusColor}15`,
                        textTransform: "capitalize",
                      }}>
                        {m.ratio}x · {m.status}
                      </div>
                    </div>
                  );
                })}

                {benchmark.comparison?.overallScore && (
                  <div style={{
                    marginTop: "12px", padding: "14px", background: "#252525",
                    borderRadius: "8px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: "12px", color: "#9E9E9E" }}>Overall Benchmark Score</div>
                    <div style={{
                      fontSize: "28px", fontWeight: "700", marginTop: "4px",
                      color: benchmark.comparison.overallScore >= 1.2 ? "#22c55e"
                        : benchmark.comparison.overallScore >= 0.8 ? "#f59e0b" : "#ef4444",
                    }}>
                      {benchmark.comparison.overallScore}x
                    </div>
                    <div style={{ fontSize: "11px", color: "#666" }}>vs peer median</div>
                  </div>
                )}
              </div>

              {/* Benchmark stats */}
              {benchmark.benchmarks && (
                <div style={card()}>
                  {sectionTitle("Peer Statistics")}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                    {[
                      { label: "Peer Median Views (all)", value: (benchmark.benchmarks.all?.median || 0).toLocaleString() },
                      { label: "Long-form Median", value: (benchmark.benchmarks.longForm?.median || 0).toLocaleString() },
                      { label: "Short-form Median", value: (benchmark.benchmarks.shortForm?.median || 0).toLocaleString() },
                      { label: "Upload Frequency", value: `${(benchmark.benchmarks.uploadFrequency?.median || 0).toFixed(1)}/week` },
                      { label: "Content Mix", value: `${benchmark.benchmarks.contentMix?.shortsRatio || 0}% shorts` },
                      { label: "Videos Analyzed", value: benchmark.benchmarks.videos_analyzed },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ background: "#252525", borderRadius: "8px", padding: "12px" }}>
                        <div style={{ fontSize: "11px", color: "#9E9E9E" }}>{label}</div>
                        <div style={{ fontSize: "15px", fontWeight: "600", marginTop: "4px" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Opportunities Tab ── */}
      {activeTab === "opportunities" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Content Gaps */}
          <div style={card()}>
            {sectionTitle("Content Gaps")}
            {(opportunities.content_gaps || []).length === 0 ? (
              <div style={{ color: "#666", fontSize: "13px" }}>No content gaps identified.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {opportunities.content_gaps.map((g, i) => (
                  <div key={i} style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <div style={{ fontSize: "14px", fontWeight: "600" }}>{g.gap}</div>
                      <span style={{
                        fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "4px",
                        color: g.potential_impact === "high" ? "#22c55e" : g.potential_impact === "medium" ? "#f59e0b" : "#9E9E9E",
                        background: g.potential_impact === "high" ? "#16653415" : g.potential_impact === "medium" ? "#854d0e15" : "#37415115",
                      }}>
                        {g.potential_impact} impact
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "6px" }}>{g.evidence}</div>
                    {g.suggested_action && (
                      <div style={{ fontSize: "12px", color: "#60a5fa" }}>Action: {g.suggested_action}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Growth Levers */}
          <div style={card()}>
            {sectionTitle("Growth Levers")}
            {(opportunities.growth_levers || []).length === 0 ? (
              <div style={{ color: "#666", fontSize: "13px" }}>No growth levers identified.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {opportunities.growth_levers.map((l, i) => (
                  <div key={i} style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <div style={{ fontSize: "14px", fontWeight: "600" }}>{l.lever}</div>
                      <span style={{
                        fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "4px",
                        color: l.priority === "high" ? "#22c55e" : l.priority === "medium" ? "#f59e0b" : "#9E9E9E",
                        background: l.priority === "high" ? "#16653415" : l.priority === "medium" ? "#854d0e15" : "#37415115",
                      }}>
                        {l.priority}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E" }}>
                      {l.current_state} → {l.target_state}
                    </div>
                    {l.evidence && (
                      <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>{l.evidence}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Market Potential */}
          {opportunities.market_potential && (
            <div style={card()}>
              {sectionTitle("Market Potential")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                  <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Tier Position</div>
                  <div style={{ fontSize: "13px" }}>{opportunities.market_potential.tier_position}</div>
                </div>
                <div style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                  <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Growth Ceiling</div>
                  <div style={{ fontSize: "13px" }}>{opportunities.market_potential.growth_ceiling}</div>
                </div>
                <div style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                  <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Key Differentiators</div>
                  <div style={{ fontSize: "13px" }}>
                    {(opportunities.market_potential.key_differentiators || []).join(", ") || "—"}
                  </div>
                </div>
                <div style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                  <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Biggest Risk</div>
                  <div style={{ fontSize: "13px" }}>{opportunities.market_potential.biggest_risk}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Recommendations Tab ── */}
      {activeTab === "recommendations" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
          {/* Stop */}
          <div style={card()}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444" }} />
              <div style={{ fontSize: "16px", fontWeight: "700", color: "#ef4444" }}>Stop</div>
            </div>
            {(recommendations.stop || []).length === 0 ? (
              <div style={{ color: "#666", fontSize: "13px" }}>No recommendations.</div>
            ) : (
              recommendations.stop.map((r, i) => (
                <div key={i} style={{ padding: "12px", background: "#252525", borderRadius: "8px", marginBottom: "8px" }}>
                  <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>{r.action}</div>
                  <div style={{ fontSize: "12px", color: "#9E9E9E" }}>{r.rationale}</div>
                  {r.evidence && <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>{r.evidence}</div>}
                </div>
              ))
            )}
          </div>

          {/* Start */}
          <div style={card()}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e" }} />
              <div style={{ fontSize: "16px", fontWeight: "700", color: "#22c55e" }}>Start</div>
            </div>
            {(recommendations.start || []).length === 0 ? (
              <div style={{ color: "#666", fontSize: "13px" }}>No recommendations.</div>
            ) : (
              recommendations.start.map((r, i) => (
                <div key={i} style={{ padding: "12px", background: "#252525", borderRadius: "8px", marginBottom: "8px" }}>
                  <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>{r.action}</div>
                  <div style={{ fontSize: "12px", color: "#9E9E9E" }}>{r.rationale}</div>
                  {r.evidence && <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>{r.evidence}</div>}
                  {r.effort && (
                    <span style={{ fontSize: "10px", color: "#666", marginTop: "4px", display: "inline-block" }}>
                      Effort: {r.effort}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Optimize */}
          <div style={card()}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b" }} />
              <div style={{ fontSize: "16px", fontWeight: "700", color: "#f59e0b" }}>Optimize</div>
            </div>
            {(recommendations.optimize || []).length === 0 ? (
              <div style={{ color: "#666", fontSize: "13px" }}>No recommendations.</div>
            ) : (
              recommendations.optimize.map((r, i) => (
                <div key={i} style={{ padding: "12px", background: "#252525", borderRadius: "8px", marginBottom: "8px" }}>
                  <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>{r.action}</div>
                  <div style={{ fontSize: "12px", color: "#9E9E9E" }}>{r.rationale}</div>
                  {r.evidence && <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>{r.evidence}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Basic markdown to HTML converter for the executive summary.
 * Handles headers, bold, italic, lists, and line breaks.
 */
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
