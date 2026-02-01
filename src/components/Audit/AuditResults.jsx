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
              {/* Tier Context Panel */}
              {(() => {
                const TIER_INFO = {
                  emerging:    { label: "Emerging",    range: "0 – 10K",   color: "#6b7280" },
                  growing:     { label: "Growing",     range: "10K – 100K", color: "#3b82f6" },
                  established: { label: "Established", range: "100K – 500K", color: "#8b5cf6" },
                  major:       { label: "Major",       range: "500K – 1M",  color: "#f59e0b" },
                  elite:       { label: "Elite",       range: "1M+",        color: "#ef4444" },
                };
                const tier = benchmark.tier || snapshot.size_tier;
                const info = TIER_INFO[tier];
                if (!info) return null;
                const subs = snapshot.subscriber_count || 0;
                return (
                  <div style={{
                    ...card(), display: "flex", alignItems: "center", gap: "16px",
                    borderLeft: `3px solid ${info.color}`,
                  }}>
                    <div style={{
                      width: "48px", height: "48px", borderRadius: "10px",
                      background: `${info.color}20`, display: "flex",
                      alignItems: "center", justifyContent: "center",
                      fontSize: "20px", fontWeight: "800", color: info.color,
                    }}>
                      {info.label[0]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "15px", fontWeight: "700" }}>
                        <span style={{ color: info.color }}>{info.label}</span> Tier
                      </div>
                      <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "2px" }}>
                        {info.range} subscribers · {subs.toLocaleString()} subs (this channel)
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "12px", color: "#9E9E9E" }}>Peers matched</div>
                      <div style={{ fontSize: "18px", fontWeight: "700" }}>{benchmark.peer_count}</div>
                    </div>
                  </div>
                );
              })()}

              {/* Peer Comparison with range bars */}
              <div style={card()}>
                {sectionTitle("Peer Comparison")}
                <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "16px" }}>
                  Compared against {benchmark.peer_count} channels in same/adjacent tier
                  {benchmark.peer_names?.length > 0 && `: ${benchmark.peer_names.slice(0, 5).join(", ")}${benchmark.peer_names.length > 5 ? "..." : ""}`}
                </div>

                {(benchmark.comparison?.metrics || []).map((m, i) => {
                  const statusColor = m.status === "above" ? "#22c55e" : m.status === "below" ? "#ef4444" : "#f59e0b";
                  const bm = benchmark.benchmarks || {};
                  // Get p25/p75 range for this metric
                  let p25, p75, channelVal, fmtVal;
                  if (m.name === "Engagement Rate") {
                    p25 = bm.engagementRate?.p25;
                    p75 = bm.engagementRate?.p75;
                    channelVal = m.value;
                    fmtVal = (v) => (v * 100).toFixed(2) + "%";
                  } else if (m.name === "Average Views per Video") {
                    p25 = bm.all?.p25;
                    p75 = bm.all?.p75;
                    channelVal = m.value;
                    fmtVal = (v) => Math.round(v).toLocaleString();
                  } else if (m.name.includes("Upload Frequency")) {
                    p25 = null; // upload frequency only has median/avg
                    p75 = null;
                    channelVal = m.value;
                    fmtVal = (v) => (typeof v === "number" ? v.toFixed(1) : v) + "/wk";
                  }

                  return (
                    <div key={i} style={{
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

                      {/* Values row */}
                      <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "#9E9E9E", marginBottom: p25 != null ? "10px" : "0" }}>
                        <span>You: <strong style={{ color: "#E0E0E0" }}>{typeof m.value === "number" && fmtVal ? fmtVal(m.value) : m.value}</strong></span>
                        <span>Peer median: <strong style={{ color: "#E0E0E0" }}>{typeof m.benchmark === "number" && fmtVal ? fmtVal(m.benchmark) : m.benchmark}</strong></span>
                        {p25 != null && p75 != null && fmtVal && (
                          <span>Range: <strong style={{ color: "#E0E0E0" }}>{fmtVal(p25)} – {fmtVal(p75)}</strong></span>
                        )}
                      </div>

                      {/* Range bar visualization */}
                      {p25 != null && p75 != null && channelVal != null && p75 > 0 && (
                        <div style={{ position: "relative", height: "24px" }}>
                          {/* Track */}
                          <div style={{
                            position: "absolute", top: "10px", left: 0, right: 0, height: "4px",
                            background: "#333", borderRadius: "2px",
                          }} />
                          {/* P25-P75 range (peer spread) */}
                          {(() => {
                            const rangeMax = Math.max(p75 * 1.5, channelVal * 1.2);
                            const leftPct = Math.min((p25 / rangeMax) * 100, 95);
                            const widthPct = Math.min(((p75 - p25) / rangeMax) * 100, 95 - leftPct);
                            const channelPct = Math.min((channelVal / rangeMax) * 100, 98);
                            const medianPct = Math.min((m.benchmark / rangeMax) * 100, 98);
                            return (
                              <>
                                {/* Peer range bar */}
                                <div style={{
                                  position: "absolute", top: "8px", height: "8px",
                                  left: `${leftPct}%`, width: `${Math.max(widthPct, 1)}%`,
                                  background: "rgba(96, 165, 250, 0.25)", borderRadius: "4px",
                                  border: "1px solid rgba(96, 165, 250, 0.4)",
                                }} />
                                {/* Median marker */}
                                <div style={{
                                  position: "absolute", top: "6px",
                                  left: `${medianPct}%`, width: "2px", height: "12px",
                                  background: "#60a5fa", borderRadius: "1px",
                                }} />
                                {/* Channel marker */}
                                <div style={{
                                  position: "absolute", top: "4px",
                                  left: `calc(${channelPct}% - 7px)`,
                                  width: "14px", height: "14px", borderRadius: "50%",
                                  background: statusColor, border: "2px solid #252525",
                                }} />
                              </>
                            );
                          })()}
                          {/* Labels */}
                          <div style={{
                            position: "absolute", top: "0", left: "0", right: "0",
                            display: "flex", justifyContent: "space-between",
                            fontSize: "9px", color: "#555",
                          }}>
                            <span>p25</span>
                            <span>p75</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {benchmark.comparison?.overallScore && (
                  <div style={{
                    marginTop: "12px", padding: "16px", background: "#252525",
                    borderRadius: "8px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: "12px", color: "#9E9E9E" }}>Overall Benchmark Score</div>
                    <div style={{
                      fontSize: "32px", fontWeight: "700", marginTop: "4px",
                      color: benchmark.comparison.overallScore >= 1.2 ? "#22c55e"
                        : benchmark.comparison.overallScore >= 0.8 ? "#f59e0b" : "#ef4444",
                    }}>
                      {benchmark.comparison.overallScore}x
                    </div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                      vs peer median · {benchmark.comparison.overallScore >= 1.2 ? "Outperforming peers" : benchmark.comparison.overallScore >= 0.8 ? "On par with peers" : "Below peer average"}
                    </div>
                  </div>
                )}
              </div>

              {/* Tier Ranges Reference */}
              {benchmark.benchmarks && (
                <div style={card()}>
                  {sectionTitle("Tier Ranges (90-day peer data)")}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {/* Views range */}
                    {benchmark.benchmarks.all && (
                      <div style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <div style={{ fontSize: "13px", fontWeight: "600" }}>Views per Video</div>
                          <div style={{ fontSize: "11px", color: "#9E9E9E" }}>
                            {benchmark.benchmarks.all.count} videos from {benchmark.peer_count} peers
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                          <div style={{ background: "#1E1E1E", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: "10px", color: "#666" }}>Bottom 25%</div>
                            <div style={{ fontSize: "14px", fontWeight: "600", color: "#ef4444" }}>{(benchmark.benchmarks.all.p25 || 0).toLocaleString()}</div>
                          </div>
                          <div style={{ background: "#1E1E1E", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: "10px", color: "#666" }}>Median</div>
                            <div style={{ fontSize: "14px", fontWeight: "600", color: "#f59e0b" }}>{(benchmark.benchmarks.all.median || 0).toLocaleString()}</div>
                          </div>
                          <div style={{ background: "#1E1E1E", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: "10px", color: "#666" }}>Top 25%</div>
                            <div style={{ fontSize: "14px", fontWeight: "600", color: "#22c55e" }}>{(benchmark.benchmarks.all.p75 || 0).toLocaleString()}</div>
                          </div>
                        </div>
                        {benchmark.channel_metrics?.avgViews != null && (
                          <div style={{ fontSize: "11px", color: "#9E9E9E", marginTop: "8px", textAlign: "center" }}>
                            This channel: <strong style={{ color: "#E0E0E0" }}>{benchmark.channel_metrics.avgViews.toLocaleString()}</strong> avg views
                          </div>
                        )}
                      </div>
                    )}

                    {/* Engagement range */}
                    {benchmark.benchmarks.engagementRate && (
                      <div style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                        <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>Engagement Rate</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                          <div style={{ background: "#1E1E1E", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: "10px", color: "#666" }}>Bottom 25%</div>
                            <div style={{ fontSize: "14px", fontWeight: "600", color: "#ef4444" }}>{((benchmark.benchmarks.engagementRate.p25 || 0) * 100).toFixed(2)}%</div>
                          </div>
                          <div style={{ background: "#1E1E1E", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: "10px", color: "#666" }}>Median</div>
                            <div style={{ fontSize: "14px", fontWeight: "600", color: "#f59e0b" }}>{((benchmark.benchmarks.engagementRate.median || 0) * 100).toFixed(2)}%</div>
                          </div>
                          <div style={{ background: "#1E1E1E", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: "10px", color: "#666" }}>Top 25%</div>
                            <div style={{ fontSize: "14px", fontWeight: "600", color: "#22c55e" }}>{((benchmark.benchmarks.engagementRate.p75 || 0) * 100).toFixed(2)}%</div>
                          </div>
                        </div>
                        {benchmark.channel_metrics?.avgEngagement != null && (
                          <div style={{ fontSize: "11px", color: "#9E9E9E", marginTop: "8px", textAlign: "center" }}>
                            This channel: <strong style={{ color: "#E0E0E0" }}>{(benchmark.channel_metrics.avgEngagement * 100).toFixed(2)}%</strong>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Long vs Short form breakdown */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                        <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "8px" }}>Long-form Views</div>
                        <div style={{ fontSize: "11px", color: "#9E9E9E", lineHeight: "1.8" }}>
                          <div>p25: <strong style={{ color: "#E0E0E0" }}>{(benchmark.benchmarks.longForm?.p25 || 0).toLocaleString()}</strong></div>
                          <div>Median: <strong style={{ color: "#E0E0E0" }}>{(benchmark.benchmarks.longForm?.median || 0).toLocaleString()}</strong></div>
                          <div>p75: <strong style={{ color: "#E0E0E0" }}>{(benchmark.benchmarks.longForm?.p75 || 0).toLocaleString()}</strong></div>
                        </div>
                        <div style={{ fontSize: "10px", color: "#555", marginTop: "4px" }}>{benchmark.benchmarks.longForm?.count || 0} videos</div>
                      </div>
                      <div style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                        <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "8px" }}>Short-form Views</div>
                        <div style={{ fontSize: "11px", color: "#9E9E9E", lineHeight: "1.8" }}>
                          <div>p25: <strong style={{ color: "#E0E0E0" }}>{(benchmark.benchmarks.shortForm?.p25 || 0).toLocaleString()}</strong></div>
                          <div>Median: <strong style={{ color: "#E0E0E0" }}>{(benchmark.benchmarks.shortForm?.median || 0).toLocaleString()}</strong></div>
                          <div>p75: <strong style={{ color: "#E0E0E0" }}>{(benchmark.benchmarks.shortForm?.p75 || 0).toLocaleString()}</strong></div>
                        </div>
                        <div style={{ fontSize: "10px", color: "#555", marginTop: "4px" }}>{benchmark.benchmarks.shortForm?.count || 0} videos</div>
                      </div>
                    </div>

                    {/* Upload frequency & content mix */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                        <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>Upload Frequency</div>
                        <div style={{ fontSize: "20px", fontWeight: "700" }}>{(benchmark.benchmarks.uploadFrequency?.median || 0).toFixed(1)}<span style={{ fontSize: "13px", color: "#9E9E9E" }}>/week</span></div>
                        <div style={{ fontSize: "11px", color: "#9E9E9E", marginTop: "4px" }}>
                          peer median
                          {benchmark.channel_metrics?.uploadFrequency != null && (
                            <> · You: <strong style={{ color: "#E0E0E0" }}>{benchmark.channel_metrics.uploadFrequency}/wk</strong></>
                          )}
                        </div>
                      </div>
                      <div style={{ padding: "14px", background: "#252525", borderRadius: "8px" }}>
                        <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>Content Mix</div>
                        <div style={{ fontSize: "20px", fontWeight: "700" }}>{benchmark.benchmarks.contentMix?.shortsRatio || 0}<span style={{ fontSize: "13px", color: "#9E9E9E" }}>% shorts</span></div>
                        <div style={{ fontSize: "11px", color: "#9E9E9E", marginTop: "4px" }}>
                          {benchmark.benchmarks.contentMix?.longsRatio || 0}% long-form · {benchmark.benchmarks.videos_analyzed} total videos
                        </div>
                      </div>
                    </div>
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
