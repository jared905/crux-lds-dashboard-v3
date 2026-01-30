import React from "react";
import { Eye, Clock, Users, Target, BarChart3, TrendingUp, TrendingDown, Video, PlaySquare, Activity } from "lucide-react";
import { fmtInt, fmtPct } from "../../lib/formatters.js";
import Chart from "./Chart.jsx";
import TopVideos from "./TopVideos.jsx";
import PublishingTimeline from "./PublishingTimeline.jsx";
import BrandFunnel from "./BrandFunnel.jsx";

export default function DashboardPage({ filtered, rows, kpis, allTimeKpis, previousKpis, dateRange, chartMetric, setChartMetric }) {
  return (
    <>
      {/* Channel Stats Section Title */}
      <div style={{
        fontSize: "20px",
        fontWeight: "700",
        color: "#fff",
        marginBottom: "16px",
        display: "flex",
        alignItems: "center",
        gap: "10px"
      }}>
        <BarChart3 size={22} style={{ color: "#818cf8" }} />
        Channel Stats
      </div>

      {/* Top Level KPIs - Period + All Time */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "16px",
        marginBottom: "24px"
      }}>
        {/* Videos */}
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "20px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "#94a3b8" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(148, 163, 184, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Video size={16} style={{ color: "#94a3b8" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Videos</div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
            {fmtInt(filtered.length)}
          </div>
          <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            <span style={{ color: "#aaa" }}>{fmtInt(allTimeKpis.count)}</span> total
          </div>
        </div>

        {/* Views */}
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "20px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "#818cf8" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(129, 140, 248, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Eye size={16} style={{ color: "#818cf8" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Views</div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
            {fmtInt(kpis.views)}
          </div>
          <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            <span style={{ color: "#aaa" }}>{fmtInt(allTimeKpis.views)}</span> total
          </div>
        </div>

        {/* Watch Hours */}
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "20px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "#a78bfa" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(167, 139, 250, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Clock size={16} style={{ color: "#a78bfa" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Watch Hours</div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
            {fmtInt(kpis.watchHours)}
          </div>
          <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            <span style={{ color: "#aaa" }}>{fmtInt(allTimeKpis.watchHours)}</span> total
          </div>
        </div>

        {/* Subscribers Gained */}
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "20px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "#f472b6" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(244, 114, 182, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={16} style={{ color: "#f472b6" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Subscribers</div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
            {kpis.subs >= 0 ? '+' : ''}{fmtInt(kpis.subs)}
          </div>
          <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            <span style={{ color: "#aaa" }}>{allTimeKpis.subs >= 0 ? '+' : ''}{fmtInt(allTimeKpis.subs)}</span> total
          </div>
        </div>

        {/* Avg Retention */}
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "20px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "#34d399" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(52, 211, 153, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BarChart3 size={16} style={{ color: "#34d399" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Avg Retention</div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
            {fmtPct(kpis.avgRet)}
          </div>
          <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            <span style={{ color: "#aaa" }}>{fmtPct(allTimeKpis.avgRet)}</span> all-time avg
          </div>
        </div>

        {/* Avg CTR */}
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "20px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "#fbbf24" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(251, 191, 36, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Target size={16} style={{ color: "#fbbf24" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Avg CTR</div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
            {fmtPct(kpis.avgCtr)}
          </div>
          <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            <span style={{ color: "#aaa" }}>{fmtPct(allTimeKpis.avgCtr)}</span> all-time avg
          </div>
        </div>
      </div>

      {/* KPI Cards - Shorts vs Long-form Side by Side */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px",
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Gradient top border */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: "linear-gradient(90deg, #f97316 0%, #0ea5e9 100%)"
        }} />

        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
            Shorts & Long-Form Breakdown
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {/* Shorts Column */}
          <div style={{
            background: "#252525",
            border: "1px solid #f9731640",
            borderRadius: "12px",
            padding: "0",
            position: "relative",
            overflow: "hidden"
          }}>
            {/* Header */}
            <div style={{
              background: "linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(249, 115, 22, 0.05))",
              padding: "16px 20px",
              borderBottom: "1px solid #f9731640"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                <Activity size={20} style={{ color: "#f97316" }} />
                <div style={{ fontSize: "18px", fontWeight: "700", color: "#f97316" }}>
                  Shorts
                </div>
              </div>
              <div style={{ fontSize: "11px", color: "#888" }}>
                {kpis.shortsMetrics.count} videos in period
              </div>
            </div>

            {/* Metrics */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {(() => {
                // Calculate days in current period for upload frequency
                const now = new Date();
                let daysInPeriod = 30;
                if (dateRange === '7d') daysInPeriod = 7;
                else if (dateRange === '28d') daysInPeriod = 28;
                else if (dateRange === '90d') daysInPeriod = 90;
                else if (dateRange === 'ytd') {
                  const startOfYear = new Date(now.getFullYear(), 0, 1);
                  daysInPeriod = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
                } else if (dateRange === 'all') {
                  const dates = filtered.filter(r => r.publishDate).map(r => new Date(r.publishDate));
                  if (dates.length > 0) {
                    daysInPeriod = Math.floor((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24)) || 30;
                  }
                }
                const monthsInPeriod = daysInPeriod / 30;
                const uploadsPerMonth = monthsInPeriod > 0 ? kpis.shortsMetrics.count / monthsInPeriod : 0;

                const metrics = [
                  {
                    icon: Activity,
                    label: "Total Uploads",
                    value: kpis.shortsMetrics.count,
                    prevValue: previousKpis.shortsMetrics.count,
                    color: "#f97316",
                    format: fmtInt,
                    subtext: `${uploadsPerMonth.toFixed(1)} per month`
                  },
                  {
                    icon: Eye,
                    label: "Views",
                    value: kpis.shortsMetrics.views,
                    prevValue: previousKpis.shortsMetrics.views,
                    color: "#3b82f6",
                    format: fmtInt
                  },
                  {
                    icon: Clock,
                    label: "Watch Hours",
                    value: kpis.shortsMetrics.watchHours,
                    prevValue: previousKpis.shortsMetrics.watchHours,
                    color: "#8b5cf6",
                    format: fmtInt
                  },
                  {
                    icon: Users,
                    label: "Subscribers",
                    value: kpis.shortsMetrics.subs,
                    prevValue: previousKpis.shortsMetrics.subs,
                    color: "#10b981",
                    format: fmtInt
                  },
                  {
                    icon: Target,
                    label: "Avg Retention",
                    value: kpis.shortsMetrics.avgRet,
                    prevValue: previousKpis.shortsMetrics.avgRet,
                    color: "#f59e0b",
                    format: fmtPct,
                    benchmark: 0.45
                  },
                  {
                    icon: BarChart3,
                    label: "Avg CTR",
                    value: kpis.shortsMetrics.avgCtr,
                    prevValue: previousKpis.shortsMetrics.avgCtr,
                    color: "#ec4899",
                    format: fmtPct,
                    benchmark: 0.05
                  }
                ];

                return metrics.map((metric, idx) => {
                  const Icon = metric.icon;
                  const delta = metric.prevValue > 0 ? ((metric.value - metric.prevValue) / metric.prevValue) * 100 : 0;
                  const isPositive = delta > 0;
                  const isNeutral = Math.abs(delta) < 0.5;
                  const Arrow = isNeutral ? null : isPositive ? TrendingUp : TrendingDown;
                  const deltaColor = isNeutral ? "#9E9E9E" : isPositive ? "#10b981" : "#ef4444";

                  return (
                    <div key={idx} style={{
                      background: "#1E1E1E",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      padding: "12px"
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                          <Icon size={16} style={{ color: metric.color }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                              {metric.label}
                            </div>
                            <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                              {metric.format(metric.value)}
                            </div>
                            {/* Subtext: comparison or custom text */}
                            {metric.subtext ? (
                              <div style={{ fontSize: "11px", color: "#666", fontStyle: "italic" }}>
                                {metric.subtext}
                              </div>
                            ) : metric.prevValue > 0 && (
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                {Arrow && <Arrow size={12} style={{ color: deltaColor }} />}
                                <div style={{ fontSize: "11px", fontWeight: "600", color: deltaColor }}>
                                  {isNeutral ? "No change" : `${isPositive ? "+" : ""}${delta.toFixed(1)}%`} vs previous
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        {metric.benchmark !== undefined && (
                          <div style={{
                            fontSize: "16px",
                            marginLeft: "8px",
                            color: metric.value >= metric.benchmark ? "#10b981" : "#ef4444"
                          }}>
                            {metric.value >= metric.benchmark ? "\u2713" : "\u2717"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Long-form Column */}
          <div style={{
            background: "#252525",
            border: "1px solid #0ea5e940",
            borderRadius: "12px",
            padding: "0",
            position: "relative",
            overflow: "hidden"
          }}>
            {/* Header */}
            <div style={{
              background: "linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(14, 165, 233, 0.05))",
              padding: "16px 20px",
              borderBottom: "1px solid #0ea5e940"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                <PlaySquare size={20} style={{ color: "#0ea5e9" }} />
                <div style={{ fontSize: "18px", fontWeight: "700", color: "#0ea5e9" }}>
                  Long-form
                </div>
              </div>
              <div style={{ fontSize: "11px", color: "#888" }}>
                {kpis.longsMetrics.count} videos in period
              </div>
            </div>

            {/* Metrics */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {(() => {
                // Calculate days in current period for upload frequency
                const now = new Date();
                let daysInPeriod = 30;
                if (dateRange === '7d') daysInPeriod = 7;
                else if (dateRange === '28d') daysInPeriod = 28;
                else if (dateRange === '90d') daysInPeriod = 90;
                else if (dateRange === 'ytd') {
                  const startOfYear = new Date(now.getFullYear(), 0, 1);
                  daysInPeriod = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
                } else if (dateRange === 'all') {
                  const dates = filtered.filter(r => r.publishDate).map(r => new Date(r.publishDate));
                  if (dates.length > 0) {
                    daysInPeriod = Math.floor((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24)) || 30;
                  }
                }
                const monthsInPeriod = daysInPeriod / 30;
                const uploadsPerMonth = monthsInPeriod > 0 ? kpis.longsMetrics.count / monthsInPeriod : 0;

                const metrics = [
                  {
                    icon: PlaySquare,
                    label: "Total Uploads",
                    value: kpis.longsMetrics.count,
                    prevValue: previousKpis.longsMetrics.count,
                    color: "#0ea5e9",
                    format: fmtInt,
                    subtext: `${uploadsPerMonth.toFixed(1)} per month`
                  },
                  {
                    icon: Eye,
                    label: "Views",
                    value: kpis.longsMetrics.views,
                    prevValue: previousKpis.longsMetrics.views,
                    color: "#3b82f6",
                    format: fmtInt
                  },
                  {
                    icon: Clock,
                    label: "Watch Hours",
                    value: kpis.longsMetrics.watchHours,
                    prevValue: previousKpis.longsMetrics.watchHours,
                    color: "#8b5cf6",
                    format: fmtInt
                  },
                  {
                    icon: Users,
                    label: "Subscribers",
                    value: kpis.longsMetrics.subs,
                    prevValue: previousKpis.longsMetrics.subs,
                    color: "#10b981",
                    format: fmtInt
                  },
                  {
                    icon: Target,
                    label: "Avg Retention",
                    value: kpis.longsMetrics.avgRet,
                    prevValue: previousKpis.longsMetrics.avgRet,
                    color: "#f59e0b",
                    format: fmtPct,
                    benchmark: 0.45
                  },
                  {
                    icon: BarChart3,
                    label: "Avg CTR",
                    value: kpis.longsMetrics.avgCtr,
                    prevValue: previousKpis.longsMetrics.avgCtr,
                    color: "#ec4899",
                    format: fmtPct,
                    benchmark: 0.05
                  }
                ];

                return metrics.map((metric, idx) => {
                  const Icon = metric.icon;
                  const delta = metric.prevValue > 0 ? ((metric.value - metric.prevValue) / metric.prevValue) * 100 : 0;
                  const isPositive = delta > 0;
                  const isNeutral = Math.abs(delta) < 0.5;
                  const Arrow = isNeutral ? null : isPositive ? TrendingUp : TrendingDown;
                  const deltaColor = isNeutral ? "#9E9E9E" : isPositive ? "#10b981" : "#ef4444";

                  return (
                    <div key={idx} style={{
                      background: "#1E1E1E",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      padding: "12px"
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                          <Icon size={16} style={{ color: metric.color }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                              {metric.label}
                            </div>
                            <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                              {metric.format(metric.value)}
                            </div>
                            {/* Subtext: comparison or custom text */}
                            {metric.subtext ? (
                              <div style={{ fontSize: "11px", color: "#666", fontStyle: "italic" }}>
                                {metric.subtext}
                              </div>
                            ) : metric.prevValue > 0 && (
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                {Arrow && <Arrow size={12} style={{ color: deltaColor }} />}
                                <div style={{ fontSize: "11px", fontWeight: "600", color: deltaColor }}>
                                  {isNeutral ? "No change" : `${isPositive ? "+" : ""}${delta.toFixed(1)}%`} vs previous
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        {metric.benchmark !== undefined && (
                          <div style={{
                            fontSize: "16px",
                            marginLeft: "8px",
                            color: metric.value >= metric.benchmark ? "#10b981" : "#ef4444"
                          }}>
                            {metric.value >= metric.benchmark ? "\u2713" : "\u2717"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Dataset Info Note */}
      {rows.length > 0 && (
        <div style={{
          textAlign: "right",
          fontSize: "12px",
          color: "#666",
          marginBottom: "20px",
          fontStyle: "italic"
        }}>
          Analyzing top {rows.length} channel videos from dataset
        </div>
      )}

      {/* Visual Separator */}
      <div style={{ height: "32px", display: "flex", alignItems: "center", marginBottom: "20px" }}>
        <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, transparent, #333, transparent)" }}></div>
      </div>


      {/* Top Videos */}
      <TopVideos rows={filtered} n={8} />

      {/* Upload Cadence Visualization */}
      <PublishingTimeline rows={filtered} dateRange={dateRange} />

      {/* Brand Funnel - Conversion Funnel Analysis */}
      <BrandFunnel rows={filtered} dateRange={dateRange} />

      {/* Performance Timeline - MOVED UP */}
      <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", marginBottom: "20px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)" }} />
        <div style={{ padding: "20px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <TrendingUp size={20} style={{ color: "#3b82f6" }} />
            <div style={{ fontSize: "18px", fontWeight: "700" }}>Performance Timeline</div>
          </div>
          <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value)} style={{ border: "1px solid #3b82f6", background: "#252525", borderRadius: "8px", padding: "8px 12px", color: "#E0E0E0", fontSize: "13px", cursor: "pointer", fontWeight: "600" }}>
            <option value="views">Views</option>
            <option value="watchHours">Watch Hours</option>
          </select>
        </div>
        <Chart rows={filtered} metric={chartMetric} />
      </div>

      {/* Format Performance Comparison - MOVED TO BOTTOM */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "20px",
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Gradient top border */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: "linear-gradient(90deg, #f97316 0%, #0ea5e9 100%)"
        }} />

        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "6px" }}>
            Format Performance Comparison
          </div>
          <div style={{ fontSize: "13px", color: "#9E9E9E" }}>
            Individual metrics and channel contribution by format
          </div>
        </div>

        {/* Individual Format Metrics (Apples-to-Apples) */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "12px" }}>
            Individual Format Metrics
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            {/* Shorts Individual Metrics */}
            <div style={{
              background: "#252525",
              border: "2px solid #f9731640",
              borderRadius: "10px",
              padding: "20px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#f97316" }}>Shorts</div>
                <div style={{ fontSize: "11px", color: "#666", background: "#1a1a1a", padding: "3px 8px", borderRadius: "4px" }}>
                  {kpis.shortsMetrics.count} videos
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Views per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                    {fmtInt(kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.views / kpis.shortsMetrics.count : 0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Subs per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                    {fmtInt(kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.subs / kpis.shortsMetrics.count : 0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Watch Time per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                    {(kpis.shortsMetrics.count > 0 ? (kpis.shortsMetrics.watchHours / kpis.shortsMetrics.count) * 60 : 0).toFixed(1)} min
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Impressions per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                    {fmtInt(kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.imps / kpis.shortsMetrics.count : 0)}
                  </div>
                </div>
                <div style={{ borderTop: "1px solid #333", paddingTop: "12px", marginTop: "4px" }}>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg CTR</div>
                  <div style={{ fontSize: "16px", fontWeight: "600", color: "#fff" }}>
                    {fmtPct(kpis.shortsMetrics.avgCtr)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Retention</div>
                  <div style={{ fontSize: "16px", fontWeight: "600", color: "#fff" }}>
                    {fmtPct(kpis.shortsMetrics.avgRet)}
                  </div>
                </div>
              </div>
            </div>

            {/* Long-form Individual Metrics */}
            <div style={{
              background: "#252525",
              border: "2px solid #0ea5e940",
              borderRadius: "10px",
              padding: "20px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#0ea5e9" }}>Long-form</div>
                <div style={{ fontSize: "11px", color: "#666", background: "#1a1a1a", padding: "3px 8px", borderRadius: "4px" }}>
                  {kpis.longsMetrics.count} videos
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Views per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                    {fmtInt(kpis.longsMetrics.count > 0 ? kpis.longsMetrics.views / kpis.longsMetrics.count : 0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Subs per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                    {fmtInt(kpis.longsMetrics.count > 0 ? kpis.longsMetrics.subs / kpis.longsMetrics.count : 0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Watch Time per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                    {(kpis.longsMetrics.count > 0 ? (kpis.longsMetrics.watchHours / kpis.longsMetrics.count) * 60 : 0).toFixed(1)} min
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Impressions per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                    {fmtInt(kpis.longsMetrics.count > 0 ? kpis.longsMetrics.imps / kpis.longsMetrics.count : 0)}
                  </div>
                </div>
                <div style={{ borderTop: "1px solid #333", paddingTop: "12px", marginTop: "4px" }}>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg CTR</div>
                  <div style={{ fontSize: "16px", fontWeight: "600", color: "#fff" }}>
                    {fmtPct(kpis.longsMetrics.avgCtr)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Retention</div>
                  <div style={{ fontSize: "16px", fontWeight: "600", color: "#fff" }}>
                    {fmtPct(kpis.longsMetrics.avgRet)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Channel Contribution Stats */}
        <div>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "12px" }}>
            Channel Contribution
          </div>
          <div style={{
            background: "#252525",
            border: "1px solid #333",
            borderRadius: "10px",
            padding: "24px"
          }}>

            {/* Top Row: Production Mix + 3 Donut Charts */}
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr 1fr", gap: "24px", marginBottom: "24px" }}>

              {/* Production Mix - Color Outlined Box */}
              <div style={{
                background: "#1a1a1a",
                border: "2px solid",
                borderImage: "linear-gradient(135deg, #f97316 0%, #0ea5e9 100%) 1",
                borderRadius: "8px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center"
              }}>
                <div style={{ fontSize: "13px", color: "#888", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                  Production Mix
                </div>
                <div style={{ fontSize: "42px", fontWeight: "700", color: "#fff", marginBottom: "8px", lineHeight: "1" }}>
                  {kpis.longsMetrics.count > 0
                    ? (kpis.shortsMetrics.count / kpis.longsMetrics.count).toFixed(1)
                    : "0"
                  }:1
                </div>
                <div style={{ fontSize: "11px", color: "#666", textAlign: "center", lineHeight: "1.3" }}>
                  Shorts per<br />Long-form
                </div>
              </div>

              {/* Total Views Distribution - Donut Chart */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start"
              }}>
                <div style={{ fontSize: "13px", color: "#fff", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                  Total Views
                </div>

                {/* Donut Chart */}
                <svg width="140" height="140" viewBox="0 0 100 100" style={{ marginBottom: "12px" }}>
                  <circle cx="50" cy="50" r="35" fill="none" stroke="#1a1a1a" strokeWidth="18" />
                  <circle
                    cx="50"
                    cy="50"
                    r="35"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="18"
                    strokeDasharray={`${((kpis.shortsMetrics.views + kpis.longsMetrics.views) > 0 ? (kpis.shortsMetrics.views / (kpis.shortsMetrics.views + kpis.longsMetrics.views)) : 0.5) * 219.8} 219.8`}
                    transform="rotate(-90 50 50)"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="35"
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth="18"
                    strokeDasharray={`${((kpis.shortsMetrics.views + kpis.longsMetrics.views) > 0 ? (kpis.longsMetrics.views / (kpis.shortsMetrics.views + kpis.longsMetrics.views)) : 0.5) * 219.8} 219.8`}
                    transform={`rotate(${((kpis.shortsMetrics.views + kpis.longsMetrics.views) > 0 ? (kpis.shortsMetrics.views / (kpis.shortsMetrics.views + kpis.longsMetrics.views)) : 0.5) * 360 - 90} 50 50)`}
                    strokeLinecap="round"
                  />
                </svg>

                {/* Legend */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#f97316" }} />
                        <span style={{ fontSize: "12px", color: "#f97316", fontWeight: "600" }}>Shorts</span>
                      </div>
                      <div style={{ fontSize: "10px", color: "#666", marginLeft: "16px" }}>
                        {fmtInt(kpis.shortsMetrics.views)}
                      </div>
                    </div>
                    <div style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>
                      {fmtPct(kpis.shortsMetrics.views / (kpis.shortsMetrics.views + kpis.longsMetrics.views))}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#0ea5e9" }} />
                        <span style={{ fontSize: "12px", color: "#0ea5e9", fontWeight: "600" }}>Long-form</span>
                      </div>
                      <div style={{ fontSize: "10px", color: "#666", marginLeft: "16px" }}>
                        {fmtInt(kpis.longsMetrics.views)}
                      </div>
                    </div>
                    <div style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>
                      {fmtPct(kpis.longsMetrics.views / (kpis.shortsMetrics.views + kpis.longsMetrics.views))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Subscribers Distribution - Donut Chart */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start"
              }}>
                <div style={{ fontSize: "13px", color: "#fff", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                  Total Subscribers
                </div>

                {/* Donut Chart */}
                <svg width="140" height="140" viewBox="0 0 100 100" style={{ marginBottom: "12px" }}>
                  <circle cx="50" cy="50" r="35" fill="none" stroke="#1a1a1a" strokeWidth="18" />
                  <circle
                    cx="50"
                    cy="50"
                    r="35"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="18"
                    strokeDasharray={`${((kpis.shortsMetrics.subs + kpis.longsMetrics.subs) > 0 ? (kpis.shortsMetrics.subs / (kpis.shortsMetrics.subs + kpis.longsMetrics.subs)) : 0.5) * 219.8} 219.8`}
                    transform="rotate(-90 50 50)"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="35"
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth="18"
                    strokeDasharray={`${((kpis.shortsMetrics.subs + kpis.longsMetrics.subs) > 0 ? (kpis.longsMetrics.subs / (kpis.shortsMetrics.subs + kpis.longsMetrics.subs)) : 0.5) * 219.8} 219.8`}
                    transform={`rotate(${((kpis.shortsMetrics.subs + kpis.longsMetrics.subs) > 0 ? (kpis.shortsMetrics.subs / (kpis.shortsMetrics.subs + kpis.longsMetrics.subs)) : 0.5) * 360 - 90} 50 50)`}
                    strokeLinecap="round"
                  />
                </svg>

                {/* Legend */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#f97316" }} />
                        <span style={{ fontSize: "12px", color: "#f97316", fontWeight: "600" }}>Shorts</span>
                      </div>
                      <div style={{ fontSize: "10px", color: "#666", marginLeft: "16px" }}>
                        {fmtInt(kpis.shortsMetrics.subs)}
                      </div>
                    </div>
                    <div style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>
                      {fmtPct(kpis.shortsMetrics.subs / (kpis.shortsMetrics.subs + kpis.longsMetrics.subs))}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#0ea5e9" }} />
                        <span style={{ fontSize: "12px", color: "#0ea5e9", fontWeight: "600" }}>Long-form</span>
                      </div>
                      <div style={{ fontSize: "10px", color: "#666", marginLeft: "16px" }}>
                        {fmtInt(kpis.longsMetrics.subs)}
                      </div>
                    </div>
                    <div style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>
                      {fmtPct(kpis.longsMetrics.subs / (kpis.shortsMetrics.subs + kpis.longsMetrics.subs))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Reach Distribution - Donut Chart */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start"
              }}>
                <div style={{ fontSize: "13px", color: "#fff", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                  Total Reach
                </div>

                {/* Donut Chart */}
                <svg width="140" height="140" viewBox="0 0 100 100" style={{ marginBottom: "12px" }}>
                  <circle cx="50" cy="50" r="35" fill="none" stroke="#1a1a1a" strokeWidth="18" />
                  <circle
                    cx="50"
                    cy="50"
                    r="35"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="18"
                    strokeDasharray={`${((kpis.shortsMetrics.imps + kpis.longsMetrics.imps) > 0 ? (kpis.shortsMetrics.imps / (kpis.shortsMetrics.imps + kpis.longsMetrics.imps)) : 0.5) * 219.8} 219.8`}
                    transform="rotate(-90 50 50)"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="35"
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth="18"
                    strokeDasharray={`${((kpis.shortsMetrics.imps + kpis.longsMetrics.imps) > 0 ? (kpis.longsMetrics.imps / (kpis.shortsMetrics.imps + kpis.longsMetrics.imps)) : 0.5) * 219.8} 219.8`}
                    transform={`rotate(${((kpis.shortsMetrics.imps + kpis.longsMetrics.imps) > 0 ? (kpis.shortsMetrics.imps / (kpis.shortsMetrics.imps + kpis.longsMetrics.imps)) : 0.5) * 360 - 90} 50 50)`}
                    strokeLinecap="round"
                  />
                </svg>

                {/* Legend */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#f97316" }} />
                        <span style={{ fontSize: "12px", color: "#f97316", fontWeight: "600" }}>Shorts</span>
                      </div>
                      <div style={{ fontSize: "10px", color: "#666", marginLeft: "16px" }}>
                        {fmtInt(kpis.shortsMetrics.imps)}
                      </div>
                    </div>
                    <div style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>
                      {fmtPct(kpis.shortsMetrics.imps / (kpis.shortsMetrics.imps + kpis.longsMetrics.imps))}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#0ea5e9" }}  />
                        <span style={{ fontSize: "12px", color: "#0ea5e9", fontWeight: "600" }}>Long-form</span>
                      </div>
                      <div style={{ fontSize: "10px", color: "#666", marginLeft: "16px" }}>
                        {fmtInt(kpis.longsMetrics.imps)}
                      </div>
                    </div>
                    <div style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>
                      {fmtPct(kpis.longsMetrics.imps / (kpis.shortsMetrics.imps + kpis.longsMetrics.imps))}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Bottom Row: Insights */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: "16px",
              paddingTop: "16px",
              borderTop: "1px solid #333"
            }}>

              {/* Discovery Advantage */}
              <div style={{
                background: "#1a1a1a",
                padding: "20px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                    Discovery Advantage
                  </div>
                  {(() => {
                    const shortsImpsPerVideo = kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.imps / kpis.shortsMetrics.count : 0;
                    const longsImpsPerVideo = kpis.longsMetrics.count > 0 ? kpis.longsMetrics.imps / kpis.longsMetrics.count : 0;
                    const advantage = shortsImpsPerVideo > longsImpsPerVideo ? "Shorts" : "Long-form";
                    const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";

                    return (
                      <div style={{ fontSize: "13px", color: "#b0b0b0", lineHeight: "1.5" }}>
                        <span style={{ color: advantageColor, fontWeight: "600" }}>{advantage}</span> impressions per video
                      </div>
                    );
                  })()}
                </div>
                {(() => {
                  const shortsImpsPerVideo = kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.imps / kpis.shortsMetrics.count : 0;
                  const longsImpsPerVideo = kpis.longsMetrics.count > 0 ? kpis.longsMetrics.imps / kpis.longsMetrics.count : 0;
                  const advantage = shortsImpsPerVideo > longsImpsPerVideo ? "Shorts" : "Long-form";
                  const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";
                  const multiplier = Math.max(shortsImpsPerVideo, longsImpsPerVideo) / Math.min(shortsImpsPerVideo, longsImpsPerVideo);

                  return (
                    <div style={{
                      fontSize: "32px",
                      fontWeight: "700",
                      color: advantageColor,
                      marginLeft: "16px",
                      flexShrink: 0
                    }}>
                      {multiplier.toFixed(1)}x
                    </div>
                  );
                })()}
              </div>

              {/* Subscriber Efficiency */}
              <div style={{
                background: "#1a1a1a",
                padding: "20px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                    Subscriber Efficiency
                  </div>
                  {(() => {
                    const shortsSubsPerVideo = kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.subs / kpis.shortsMetrics.count : 0;
                    const longsSubsPerVideo = kpis.longsMetrics.count > 0 ? kpis.longsMetrics.subs / kpis.longsMetrics.count : 0;
                    const advantage = shortsSubsPerVideo > longsSubsPerVideo ? "Shorts" : "Long-form";
                    const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";

                    return (
                      <div style={{ fontSize: "13px", color: "#b0b0b0", lineHeight: "1.5" }}>
                        <span style={{ color: advantageColor, fontWeight: "600" }}>{advantage}</span> subs per video
                      </div>
                    );
                  })()}
                </div>
                {(() => {
                  const shortsSubsPerVideo = kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.subs / kpis.shortsMetrics.count : 0;
                  const longsSubsPerVideo = kpis.longsMetrics.count > 0 ? kpis.longsMetrics.subs / kpis.longsMetrics.count : 0;
                  const advantage = shortsSubsPerVideo > longsSubsPerVideo ? "Shorts" : "Long-form";
                  const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";
                  const multiplier = Math.max(shortsSubsPerVideo, longsSubsPerVideo) / Math.min(shortsSubsPerVideo, longsSubsPerVideo);

                  return (
                    <div style={{
                      fontSize: "32px",
                      fontWeight: "700",
                      color: advantageColor,
                      marginLeft: "16px",
                      flexShrink: 0
                    }}>
                      {multiplier.toFixed(1)}x
                    </div>
                  );
                })()}
              </div>

              {/* Engagement Rate */}
              <div style={{
                background: "#1a1a1a",
                padding: "20px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                    Engagement Rate
                  </div>
                  {(() => {
                    const shortsEngagement = kpis.shortsMetrics.imps > 0 ? kpis.shortsMetrics.views / kpis.shortsMetrics.imps : 0;
                    const longsEngagement = kpis.longsMetrics.imps > 0 ? kpis.longsMetrics.views / kpis.longsMetrics.imps : 0;
                    const advantage = shortsEngagement > longsEngagement ? "Shorts" : "Long-form";
                    const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";

                    return (
                      <div style={{ fontSize: "13px", color: "#b0b0b0", lineHeight: "1.5" }}>
                        <span style={{ color: advantageColor, fontWeight: "600" }}>{advantage}</span> views per impression
                      </div>
                    );
                  })()}
                </div>
                {(() => {
                  const shortsEngagement = kpis.shortsMetrics.imps > 0 ? kpis.shortsMetrics.views / kpis.shortsMetrics.imps : 0;
                  const longsEngagement = kpis.longsMetrics.imps > 0 ? kpis.longsMetrics.views / kpis.longsMetrics.imps : 0;
                  const advantage = shortsEngagement > longsEngagement ? "Shorts" : "Long-form";
                  const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";
                  const multiplier = Math.max(shortsEngagement, longsEngagement) / Math.min(shortsEngagement, longsEngagement);

                  return (
                    <div style={{
                      fontSize: "32px",
                      fontWeight: "700",
                      color: advantageColor,
                      marginLeft: "16px",
                      flexShrink: 0
                    }}>
                      {multiplier.toFixed(1)}x
                    </div>
                  );
                })()}
              </div>

              {/* Watch Time Efficiency */}
              <div style={{
                background: "#1a1a1a",
                padding: "20px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                    Watch Time Efficiency
                  </div>
                  {(() => {
                    const shortsWatchPerVideo = kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.watchHours / kpis.shortsMetrics.count : 0;
                    const longsWatchPerVideo = kpis.longsMetrics.count > 0 ? kpis.longsMetrics.watchHours / kpis.longsMetrics.count : 0;
                    const advantage = shortsWatchPerVideo > longsWatchPerVideo ? "Shorts" : "Long-form";
                    const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";

                    return (
                      <div style={{ fontSize: "13px", color: "#b0b0b0", lineHeight: "1.5" }}>
                        <span style={{ color: advantageColor, fontWeight: "600" }}>{advantage}</span> watch hours per video
                      </div>
                    );
                  })()}
                </div>
                {(() => {
                  const shortsWatchPerVideo = kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.watchHours / kpis.shortsMetrics.count : 0;
                  const longsWatchPerVideo = kpis.longsMetrics.count > 0 ? kpis.longsMetrics.watchHours / kpis.longsMetrics.count : 0;
                  const advantage = shortsWatchPerVideo > longsWatchPerVideo ? "Shorts" : "Long-form";
                  const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";
                  const multiplier = Math.max(shortsWatchPerVideo, longsWatchPerVideo) / Math.min(shortsWatchPerVideo, longsWatchPerVideo);

                  return (
                    <div style={{
                      fontSize: "32px",
                      fontWeight: "700",
                      color: advantageColor,
                      marginLeft: "16px",
                      flexShrink: 0
                    }}>
                      {multiplier.toFixed(1)}x
                    </div>
                  );
                })()}
              </div>

            </div>

          </div>
        </div>
      </div>
    </>
  );
}
