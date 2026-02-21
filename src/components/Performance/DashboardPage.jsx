import { useState, useMemo } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, Activity, Eye, Clock, Users, Target, BarChart3, PlaySquare } from "lucide-react";
import { fmtInt, fmtPct } from "../../lib/formatters.js";
import { useInView } from "../../hooks/useInView.js";
import Chart from "./Chart.jsx";
import TopVideos from "./TopVideos.jsx";
import PublishingTimeline from "./PublishingTimeline.jsx";
import BrandFunnel from "./BrandFunnel.jsx";
import AudienceSignals from "./AudienceSignals.jsx";
import HeroBanner from "./HeroBanner.jsx";
import { generateNarrative } from "../../lib/narrativeGenerator.js";

/* ── Animated section wrapper — fades in when scrolled into view ── */
function AnimatedSection({ children, delay = 0, className = "" }) {
  const [ref, isInView] = useInView();
  return (
    <div
      ref={ref}
      className={isInView ? `animate-in ${className}` : className}
      style={{
        ...(!isInView ? { opacity: 0 } : {}),
        animationDelay: `${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ── tiny delta badge used on KPI cards ── */
function DeltaBadge({ current, previous, isPct }) {
  if (!previous && previous !== 0) return null;
  const delta = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : (current > 0 ? 100 : 0);
  if (Math.abs(delta) < 0.5) return (
    <span style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600" }}>No change vs prior</span>
  );
  const up = delta > 0;
  const Arrow = up ? TrendingUp : TrendingDown;
  const color = isPct
    ? (up ? "#10b981" : "#ef4444")  // for rates, up = good
    : (up ? "#10b981" : "#ef4444");
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: "600", color }}>
      <Arrow size={12} /> {up ? "+" : ""}{delta.toFixed(1)}% vs prior
    </span>
  );
}

/* ── progress ring for percentage KPIs ── */
function ProgressRing({ value, color, size = 56, stroke = 5 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(value, 0), 1);
  const offset = circumference * (1 - pct);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none"
        stroke="#252525" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }} />
    </svg>
  );
}

/* ── expandable KPI card wrapper ── */
function KpiCard({ icon: Icon, iconSrc, label, value, allTimeLabel, allTimeValue, color, accentBg, delta, filtered, metricKey, showRing, ringValue, animIndex = 0 }) {
  const [open, setOpen] = useState(false);

  // Build per-video mini-table when expanded
  const topForMetric = useMemo(() => {
    if (!open || !filtered?.length) return [];
    const key = metricKey || "views";
    return [...filtered]
      .sort((a, b) => (b[key] || 0) - (a[key] || 0))
      .slice(0, 5);
  }, [open, filtered, metricKey]);

  return (
    <div
      className="animate-in"
      onClick={() => setOpen(o => !o)}
      style={{
        background: "#1E1E1E",
        border: open ? `1px solid ${color}55` : "1px solid #2A2A2A",
        borderRadius: "8px",
        padding: "20px",
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        transition: "border-color 0.2s",
        animationDelay: `${animIndex * 0.06}s`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: `linear-gradient(135deg, ${color}, ${color}cc)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 16px ${color}4d` }}>
          {iconSrc ? <img src={iconSrc} width={24} height={24} alt={label} style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }} /> : <Icon size={22} style={{ color: "#fff" }} />}
        </div>
        <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
        <div style={{ marginLeft: "auto" }}>
          {open ? <ChevronUp size={14} style={{ color: "#666" }} /> : <ChevronDown size={14} style={{ color: "#666" }} />}
        </div>
      </div>
      {showRing ? (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
          <ProgressRing value={ringValue} color={color} />
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>
            {value}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: "32px", fontWeight: "700", color: "#fff", marginBottom: "4px", fontFamily: "'Barlow Condensed', sans-serif" }}>
          {value}
        </div>
      )}
      {/* Delta badge */}
      {delta}
      <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
        <span style={{ color: "#aaa" }}>{allTimeValue}</span> {allTimeLabel}
      </div>

      {/* Expandable drill-down */}
      {open && topForMetric.length > 0 && (
        <div style={{ marginTop: "14px", borderTop: "1px solid #333", paddingTop: "12px" }}>
          <div style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", marginBottom: "8px", letterSpacing: "0.5px" }}>Top 5 Videos</div>
          {topForMetric.map((v, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: i < 4 ? "1px solid #2a2a2a" : "none" }}>
              <div style={{ fontSize: "12px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                {v.title || "Untitled"}
              </div>
              <div style={{ fontSize: "12px", color, fontWeight: "600", flexShrink: 0 }}>
                {metricKey === "retention" || metricKey === "ctr" ? fmtPct(v[metricKey] || 0) : fmtInt(v[metricKey] || v.views || 0)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage({ filtered, rows, kpis, allTimeKpis, previousKpis, dateRange, chartMetric, setChartMetric, channelStats, activeClient }) {
  const { isMobile } = useMediaQuery();
  // Channel stats (subscribers, views, videoCount) are fetched by the parent (App.jsx)
  // which correctly handles per-channel resolution and "all channels" aggregation.
  const resolvedStats = channelStats;
  const isDateFiltered = dateRange !== "all";

  // Generate narrative headline from KPI data
  const narrative = useMemo(
    () => generateNarrative(kpis, previousKpis, filtered),
    [kpis, previousKpis, filtered]
  );

  // Compute the start date for the active period (reused for upload counts)
  const periodStartDate = useMemo(() => {
    if (!isDateFiltered) return null;
    const now = new Date();
    if (dateRange === "ytd") return new Date(now.getFullYear(), 0, 1);
    if (dateRange === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (dateRange === "28d") return new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    if (dateRange === "90d") return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    return null;
  }, [dateRange, isDateFiltered]);

  // Count videos uploaded within the selected date range, split by type
  const uploadCounts = useMemo(() => {
    const publishedInPeriod = periodStartDate
      ? filtered.filter(r => r.publishDate && new Date(r.publishDate) >= periodStartDate)
      : filtered;
    const shorts = publishedInPeriod.filter(r => r.type === 'short');
    const longs = publishedInPeriod.filter(r => r.type !== 'short');
    return {
      total: publishedInPeriod.length,
      shorts: shorts.length,
      longs: longs.length,
    };
  }, [filtered, periodStartDate]);

  const uploadedInPeriod = uploadCounts.total;

  return (
    <>
      {/* Hero Banner with client branding + wow stat */}
      <HeroBanner
        activeClient={activeClient}
        kpis={kpis}
        previousKpis={previousKpis}
        channelStats={channelStats}
        filtered={filtered}
      />

      {/* Narrative headline — tells the story before showing numbers */}
      {narrative.headline && (
        <div className="animate-in" style={{
          maxWidth: "700px",
          marginBottom: isMobile ? "20px" : "28px",
          animationDelay: "0.15s",
        }}>
          <div style={{
            fontSize: isMobile ? "20px" : "26px",
            fontWeight: "300",
            color: "#fff",
            lineHeight: 1.35,
          }}>
            {narrative.headline}
          </div>
          {narrative.subheadline && (
            <div style={{
              fontSize: "13px",
              color: "#666",
              marginTop: "8px",
              letterSpacing: "0.03em",
            }}>
              {narrative.subheadline}
            </div>
          )}
        </div>
      )}

      {/* Top Level KPIs - Period + All Time — now with deltas & click-to-expand */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(auto-fit, minmax(140px, 1fr))" : "repeat(auto-fit, minmax(180px, 1fr))",
        gap: isMobile ? "10px" : "16px",
        marginBottom: "24px"
      }}>
        {/* Videos */}
        <KpiCard animIndex={0}
          iconSrc="/icons/videos.svg" label={isDateFiltered ? "Uploaded Videos" : "Videos"} color="#94a3b8" accentBg="rgba(148, 163, 184, 0.1)"
          value={isDateFiltered ? fmtInt(uploadedInPeriod) : fmtInt(filtered.length)}
          allTimeLabel={isDateFiltered ? "active in period" : "total"}
          allTimeValue={isDateFiltered
            ? fmtInt(filtered.length)
            : resolvedStats?.videoCount
              ? fmtInt(resolvedStats.videoCount)
              : fmtInt(allTimeKpis.count)}
          delta={<DeltaBadge current={isDateFiltered ? uploadedInPeriod : filtered.length} previous={previousKpis.shortsMetrics.count + previousKpis.longsMetrics.count} />}
          filtered={filtered} metricKey="views"
        />

        {/* Views */}
        <KpiCard animIndex={1}
          iconSrc="/icons/views.svg" label={isDateFiltered ? "Period Views" : "Views"} color="#818cf8" accentBg="rgba(129, 140, 248, 0.1)"
          value={fmtInt(kpis.views)}
          allTimeLabel={isDateFiltered ? "lifetime" : "total"}
          allTimeValue={resolvedStats?.viewCount
            ? fmtInt(resolvedStats.viewCount)
            : fmtInt(allTimeKpis.views)}
          delta={<DeltaBadge current={kpis.views} previous={previousKpis.views} />}
          filtered={filtered} metricKey="views"
        />

        {/* Watch Hours */}
        <KpiCard animIndex={2}
          iconSrc="/icons/clock.svg" label="Watch Hours" color="#a78bfa" accentBg="rgba(167, 139, 250, 0.1)"
          value={fmtInt(kpis.watchHours)}
          allTimeLabel="total" allTimeValue={fmtInt(allTimeKpis.watchHours)}
          delta={<DeltaBadge current={kpis.watchHours} previous={previousKpis.watchHours} />}
          filtered={filtered} metricKey="watchHours"
        />

        {/* Subscribers — show period-gained when date range is active */}
        <KpiCard animIndex={3}
          iconSrc="/icons/subscribers.svg" label={isDateFiltered ? "Subscribers Gained" : "Subscribers"} color="#f472b6" accentBg="rgba(244, 114, 182, 0.1)"
          value={isDateFiltered
            ? `${kpis.subs >= 0 ? "+" : ""}${fmtInt(kpis.subs)}`
            : resolvedStats?.subscriberCount
              ? fmtInt(resolvedStats.subscriberCount)
              : `${kpis.subs >= 0 ? "+" : ""}${fmtInt(kpis.subs)}`}
          allTimeLabel={isDateFiltered ? "total subscribers" : "net gained"}
          allTimeValue={isDateFiltered && resolvedStats?.subscriberCount
            ? fmtInt(resolvedStats.subscriberCount)
            : `${allTimeKpis.subs >= 0 ? "+" : ""}${fmtInt(allTimeKpis.subs)}`}
          delta={<DeltaBadge current={kpis.subs} previous={previousKpis.subs} />}
          filtered={filtered} metricKey="subscribers"
        />

        {/* Avg Retention */}
        <KpiCard animIndex={4}
          iconSrc="/icons/retention.svg" label="Avg Retention" color="#34d399" accentBg="rgba(52, 211, 153, 0.1)"
          value={fmtPct(kpis.avgRet)}
          allTimeLabel="all-time avg" allTimeValue={fmtPct(allTimeKpis.avgRet)}
          delta={<DeltaBadge current={kpis.avgRet} previous={previousKpis.avgRet} isPct />}
          filtered={filtered} metricKey="retention"
          showRing ringValue={kpis.avgRet}
        />

        {/* Avg CTR */}
        <KpiCard animIndex={5}
          iconSrc="/icons/ctr.svg" label="Avg CTR" color="#fbbf24" accentBg="rgba(251, 191, 36, 0.1)"
          value={fmtPct(kpis.avgCtr)}
          allTimeLabel="all-time avg" allTimeValue={fmtPct(allTimeKpis.avgCtr)}
          delta={<DeltaBadge current={kpis.avgCtr} previous={previousKpis.avgCtr} isPct />}
          filtered={filtered} metricKey="ctr"
          showRing ringValue={kpis.avgCtr}
        />

      </div>

      {/* KPI Cards - Shorts vs Long-form Side by Side */}
      <div className="section-card" style={{
        background: "linear-gradient(135deg, rgba(249, 115, 22, 0.05), rgba(14, 165, 233, 0.03))",
        border: "1px solid rgba(249, 115, 22, 0.12)",
        borderRadius: "8px",
        padding: isMobile ? "16px" : "24px",
        marginBottom: "24px",
        "--glow-color": "rgba(249, 115, 22, 0.2)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #f97316, #0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(249, 115, 22, 0.3)" }}>
            <img src="/icons/shorts.svg" width={24} height={24} alt="Shorts" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }} />
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff" }}>
            Shorts & Long-Form Breakdown
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "16px" : "20px" }}>
          {/* Shorts Column */}
          <div style={{
            background: "#252525",
            border: "1px solid #f9731640",
            borderRadius: "8px",
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
              <div style={{ fontSize: "11px", color: "#888", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                {isDateFiltered ? (
                  <><span className="stat-chip amber">{uploadCounts.shorts} uploaded</span> <span className="stat-chip blue">{kpis.shortsMetrics.count} active</span></>
                ) : (
                  <span className="stat-chip amber">{kpis.shortsMetrics.count} videos</span>
                )}
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
                const shortsUploadCount = isDateFiltered ? uploadCounts.shorts : kpis.shortsMetrics.count;
                const uploadsPerMonth = monthsInPeriod > 0 ? shortsUploadCount / monthsInPeriod : 0;

                const metrics = [
                  {
                    icon: Activity,
                    label: isDateFiltered ? "Uploaded" : "Total Uploads",
                    value: shortsUploadCount,
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
                            <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff", marginBottom: "4px", fontFamily: "'Barlow Condensed', sans-serif" }}>
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
            borderRadius: "8px",
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
              <div style={{ fontSize: "11px", color: "#888", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                {isDateFiltered ? (
                  <><span className="stat-chip blue">{uploadCounts.longs} uploaded</span> <span className="stat-chip purple">{kpis.longsMetrics.count} active</span></>
                ) : (
                  <span className="stat-chip blue">{kpis.longsMetrics.count} videos</span>
                )}
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
                const longsUploadCount = isDateFiltered ? uploadCounts.longs : kpis.longsMetrics.count;
                const uploadsPerMonth = monthsInPeriod > 0 ? longsUploadCount / monthsInPeriod : 0;

                const metrics = [
                  {
                    icon: PlaySquare,
                    label: isDateFiltered ? "Uploaded" : "Total Uploads",
                    value: longsUploadCount,
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
                            <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff", marginBottom: "4px", fontFamily: "'Barlow Condensed', sans-serif" }}>
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
      <AnimatedSection>
        <TopVideos rows={filtered} n={10} />
      </AnimatedSection>

      {/* Upload Cadence Visualization */}
      <AnimatedSection delay={0.05}>
        <PublishingTimeline rows={filtered} dateRange={dateRange} />
      </AnimatedSection>

      {/* Brand Funnel - Conversion Funnel Analysis */}
      <AnimatedSection delay={0.1}>
        <BrandFunnel rows={filtered} dateRange={dateRange} />
      </AnimatedSection>

      {/* Performance Timeline - MOVED UP */}
      <div className="section-card" style={{ background: "linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(99, 102, 241, 0.02))", border: "1px solid rgba(59, 130, 246, 0.12)", borderRadius: "8px", marginBottom: "20px", "--glow-color": "rgba(59, 130, 246, 0.2)" }}>
        <div style={{ padding: "20px", borderBottom: "1px solid rgba(59, 130, 246, 0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #3b82f6, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(59, 130, 246, 0.3)" }}>
              <img src="/icons/trending.svg" width={24} height={24} alt="Trending" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }} />
            </div>
            <div style={{ fontSize: "26px", fontWeight: "700" }}>Performance Timeline</div>
          </div>
          <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value)} style={{ border: "1px solid #3b82f6", background: "#252525", borderRadius: "8px", padding: "8px 12px", color: "#E0E0E0", fontSize: "13px", cursor: "pointer", fontWeight: "600" }}>
            <option value="views">Views</option>
            <option value="watchHours">Watch Hours</option>
          </select>
        </div>
        <Chart rows={filtered} metric={chartMetric} />
      </div>

      {/* Format Performance Comparison - MOVED TO BOTTOM */}
      <div className="section-card" style={{
        background: "linear-gradient(135deg, rgba(249, 115, 22, 0.05), rgba(14, 165, 233, 0.03))",
        border: "1px solid rgba(249, 115, 22, 0.12)",
        borderRadius: "8px",
        padding: "24px",
        marginBottom: "20px",
        "--glow-color": "rgba(249, 115, 22, 0.2)",
      }}>
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #f97316, #0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(249, 115, 22, 0.3)" }}>
              <img src="/icons/compare.svg" width={24} height={24} alt="Compare" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }} />
            </div>
            <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff" }}>
              Format Performance Comparison
            </div>
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
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "16px" : "20px" }}>
            {/* Shorts Individual Metrics */}
            <div style={{
              background: "#252525",
              border: "2px solid #f9731640",
              borderRadius: "10px",
              padding: "20px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#f97316" }}>Shorts</div>
                <span className="stat-chip amber">{kpis.shortsMetrics.count} videos</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Views per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {fmtInt(kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.views / kpis.shortsMetrics.count : 0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Subs per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {fmtInt(kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.subs / kpis.shortsMetrics.count : 0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Watch Time per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {(kpis.shortsMetrics.count > 0 ? (kpis.shortsMetrics.watchHours / kpis.shortsMetrics.count) * 60 : 0).toFixed(1)} min
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Impressions per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>
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
                <span className="stat-chip blue">{kpis.longsMetrics.count} videos</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Views per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {fmtInt(kpis.longsMetrics.count > 0 ? kpis.longsMetrics.views / kpis.longsMetrics.count : 0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Subs per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {fmtInt(kpis.longsMetrics.count > 0 ? kpis.longsMetrics.subs / kpis.longsMetrics.count : 0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Watch Time per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {(kpis.longsMetrics.count > 0 ? (kpis.longsMetrics.watchHours / kpis.longsMetrics.count) * 60 : 0).toFixed(1)} min
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Impressions per Video</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>
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
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "200px 1fr 1fr 1fr", gap: isMobile ? "16px" : "24px", marginBottom: "24px" }}>

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
                <div style={{ fontSize: "42px", fontWeight: "700", color: "#fff", marginBottom: "8px", lineHeight: "1", fontFamily: "'Barlow Condensed', sans-serif" }}>
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
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 1fr",
              gap: isMobile ? "12px" : "16px",
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
                      flexShrink: 0,
                      fontFamily: "'Barlow Condensed', sans-serif"
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
                      flexShrink: 0,
                      fontFamily: "'Barlow Condensed', sans-serif"
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
                      flexShrink: 0,
                      fontFamily: "'Barlow Condensed', sans-serif"
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
                      flexShrink: 0,
                      fontFamily: "'Barlow Condensed', sans-serif"
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
      {/* Audience Signals - Auto-computed from YouTube data */}
      {activeClient?.id && <AudienceSignals channelId={activeClient.id} />}
    </>
  );
}
