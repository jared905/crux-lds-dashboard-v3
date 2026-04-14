import { useState, useMemo } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, Activity, PlaySquare } from "lucide-react";
import { fmtInt, fmtPct } from "../../lib/formatters.js";
import Chart from "./Chart.jsx";
import TopVideos from "./TopVideos.jsx";
import PublishingTimeline from "./PublishingTimeline.jsx";
import BrandFunnel from "./BrandFunnel.jsx";
import AudienceSignals from "./AudienceSignals.jsx";
import AudienceIntelligence from "./AudienceIntelligence.jsx";
import HeroBanner from "./HeroBanner.jsx";
import AnimatedSection from "../Shared/AnimatedSection.jsx";

import { generateNarrative } from "../../lib/narrativeGenerator.js";

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

/* ── Inline SVG KPI icons with hover animations ── */
function KpiIconVideos() {
  return (
    <svg width="24" height="24" viewBox="0 0 48 48" fill="none" style={{ overflow: "visible" }}>
      <rect x="4" y="10" width="28" height="28" rx="4" fill="white" opacity="0.9"/>
      <path d="M32 17l13-6v26l-13-6V17z" fill="white" opacity="0.7"/>
      <circle cx="18" cy="24" r="5" fill="#1a1a2e" opacity="0.3"/>
      <path d="M16 21.5v5l4.5-2.5L16 21.5z" fill="#1a1a2e" opacity="0.5"/>
      {/* Upload arrow — hidden, shoots up from camera center on hover */}
      <g className="icon-upload-arrow" style={{ opacity: 0, transformOrigin: "18px 24px" }}>
        <line x1="18" y1="30" x2="18" y2="4" stroke="white" strokeWidth="4.5" strokeLinecap="round"/>
        <path d="M10 12l8-9 8 9" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </g>
    </svg>
  );
}
function KpiIconViews() {
  return (
    <svg className="icon-eye" width="24" height="24" viewBox="0 0 48 48" fill="none">
      <path d="M24 8C14 8 5.46 14.88 2 24c3.46 9.12 12 16 22 16s18.54-6.88 22-16C42.54 14.88 34 8 24 8z" fill="white" opacity="0.9"/>
      <circle cx="24" cy="24" r="9" fill="white"/>
      <circle cx="24" cy="24" r="4.5" fill="#1a1a2e"/>
      <circle cx="22" cy="22" r="1.5" fill="white" opacity="0.7"/>
    </svg>
  );
}
function KpiIconClock() {
  return (
    <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" fill="white" opacity="0.9"/>
      <circle cx="24" cy="24" r="16" fill="#1a1a2e"/>
      <circle cx="24" cy="24" r="14" fill="white" opacity="0.15"/>
      <line x1="24" y1="24" x2="24" y2="14" stroke="white" strokeWidth="3" strokeLinecap="round"/>
      <line className="icon-clock-hand" x1="24" y1="24" x2="32" y2="28" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="24" cy="24" r="2" fill="white"/>
    </svg>
  );
}
function KpiIconSubscribers() {
  return (
    <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
      {/* Left person — hidden, pops in on hover */}
      <g className="icon-person-side icon-person-left" style={{ opacity: 0 }}>
        <circle cx="8" cy="18" r="5.5" fill="white" opacity="0.7"/>
        <path d="M-2 44c0-6.08 4.48-11 10-11s10 4.92 10 11" fill="white" opacity="0.7"/>
      </g>
      {/* Right person — hidden, pops in on hover */}
      <g className="icon-person-side icon-person-right" style={{ opacity: 0 }}>
        <circle cx="40" cy="18" r="5.5" fill="white" opacity="0.7"/>
        <path d="M30 44c0-6.08 4.48-11 10-11s10 4.92 10 11" fill="white" opacity="0.7"/>
      </g>
      {/* Center person — always visible */}
      <circle cx="24" cy="14" r="9" fill="white" opacity="0.9"/>
      <path d="M6 44c0-9.94 8.06-18 18-18s18 8.06 18 18" fill="white" opacity="0.9"/>
    </svg>
  );
}
function KpiIconRetention() {
  return (
    <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
      <rect className="icon-bar" x="3" y="26" width="9" height="18" rx="2" fill="white" opacity="0.5" style={{ animationDelay: "0s" }}/>
      <rect className="icon-bar" x="14.5" y="18" width="9" height="26" rx="2" fill="white" opacity="0.7" style={{ animationDelay: "0.1s" }}/>
      <rect className="icon-bar" x="26" y="10" width="9" height="34" rx="2" fill="white" opacity="0.85" style={{ animationDelay: "0.2s" }}/>
      <rect className="icon-bar" x="37.5" y="4" width="9" height="40" rx="2" fill="white" opacity="1" style={{ animationDelay: "0.3s" }}/>
    </svg>
  );
}
function KpiIconCtr() {
  return (
    <svg className="icon-target-click" width="24" height="24" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" fill="white" opacity="0.2"/>
      <circle cx="24" cy="24" r="14" fill="white" opacity="0.35"/>
      <circle cx="24" cy="24" r="8" fill="white" opacity="0.6"/>
      <circle cx="24" cy="24" r="3.5" fill="white"/>
      <path d="M24 4v6M24 38v6M4 24h6M38 24h6" stroke="white" strokeWidth="1.5" opacity="0.4"/>
      {/* Ripple rings — scale from 0, expand outward on hover */}
      <circle className="icon-ripple" cx="24" cy="24" r="22" fill="none" stroke="white" strokeWidth="3" style={{ opacity: 0, transform: "scale(0)", transformOrigin: "24px 24px", animationDelay: "0.1s" }}/>
      <circle className="icon-ripple" cx="24" cy="24" r="22" fill="none" stroke="white" strokeWidth="2.5" style={{ opacity: 0, transform: "scale(0)", transformOrigin: "24px 24px", animationDelay: "0.3s" }}/>
      <circle className="icon-ripple" cx="24" cy="24" r="22" fill="none" stroke="white" strokeWidth="2" style={{ opacity: 0, transform: "scale(0)", transformOrigin: "24px 24px", animationDelay: "0.5s" }}/>
    </svg>
  );
}

const KPI_ICONS = {
  "/icons/videos.svg": KpiIconVideos,
  "/icons/views.svg": KpiIconViews,
  "/icons/clock.svg": KpiIconClock,
  "/icons/subscribers.svg": KpiIconSubscribers,
  "/icons/retention.svg": KpiIconRetention,
  "/icons/ctr.svg": KpiIconCtr,
};

/* ── progress ring for percentage KPIs ── */
function ProgressRing({ value, color, size = 56, stroke = 5 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(value, 0), 1);
  const offset = circumference * (1 - pct);
  return (
    <svg className="ring-pulse" width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0, "--ring-color": color }}>
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
      className="animate-in kpi-card"
      onClick={() => setOpen(o => !o)}
      style={{
        background: "#1E1E1E",
        border: open ? `1px solid ${color}55` : "1px solid #2A2A2A",
        borderRadius: "8px",
        padding: "20px",
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        animationDelay: `${animIndex * 0.06}s`,
        "--glow-color": `${color}55`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <div className="kpi-icon" style={{ width: "48px", height: "48px", borderRadius: "14px", background: `linear-gradient(135deg, ${color}, ${color}cc)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 16px ${color}4d` }}>
          {iconSrc && KPI_ICONS[iconSrc] ? (() => { const SvgIcon = KPI_ICONS[iconSrc]; return <SvgIcon />; })() : iconSrc ? <img src={iconSrc} alt={label} style={{ width: "24px", height: "24px", objectFit: "contain", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }} /> : <Icon size={22} style={{ color: "#fff" }} />}
        </div>
        <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
        <div style={{ marginLeft: "auto" }}>
          {open ? <ChevronUp size={14} style={{ color: "#666" }} /> : <ChevronDown size={14} style={{ color: "#666" }} />}
        </div>
      </div>
      {showRing ? (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
          <ProgressRing value={ringValue} color={color} />
          <div className="number-pop" style={{ fontSize: "32px", fontWeight: "700", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", animationDelay: `${animIndex * 0.06 + 0.3}s` }}>
            {value}
          </div>
        </div>
      ) : (
        <div className="number-pop" style={{ fontSize: "32px", fontWeight: "700", color: "#fff", marginBottom: "4px", fontFamily: "'Barlow Condensed', sans-serif", animationDelay: `${animIndex * 0.06 + 0.3}s` }}>
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

export default function DashboardPage({ filtered, rows, kpis, allTimeKpis, previousKpis, dateRange, customDateRange, chartMetric, setChartMetric, channelStats, activeClient, setTab }) {
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

  // Compute the start/end dates for the active period (reused for upload counts)
  const periodStartDate = useMemo(() => {
    if (!isDateFiltered) return null;
    const now = new Date();
    if (dateRange === "ytd") return new Date(now.getFullYear(), 0, 1);
    if (dateRange === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (dateRange === "28d") return new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    if (dateRange === "90d") return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    if (dateRange === "custom" && customDateRange?.start) return new Date(customDateRange.start);
    return null;
  }, [dateRange, isDateFiltered, customDateRange]);

  const periodEndDate = useMemo(() => {
    if (!isDateFiltered) return null;
    if (dateRange === "custom" && customDateRange?.end) {
      const end = new Date(customDateRange.end);
      end.setHours(23, 59, 59, 999);
      return end;
    }
    return null; // standard ranges end at "now" — no cap needed
  }, [dateRange, isDateFiltered, customDateRange]);

  // Count videos uploaded within the selected date range, split by type
  // Uses ALL rows (not just filtered/snapshot) so upload count reflects actual publishes
  const uploadCounts = useMemo(() => {
    const source = rows.filter(r => !r.isTotal && r.publishDate);
    let publishedInPeriod;
    if (periodStartDate) {
      publishedInPeriod = source.filter(r => {
        const pub = new Date(r.publishDate);
        if (pub < periodStartDate) return false;
        if (periodEndDate && pub > periodEndDate) return false;
        return true;
      });
    } else {
      publishedInPeriod = source;
    }
    const shorts = publishedInPeriod.filter(r => r.type === 'short');
    const longs = publishedInPeriod.filter(r => r.type !== 'short');
    return {
      total: publishedInPeriod.length,
      shorts: shorts.length,
      longs: longs.length,
    };
  }, [rows, periodStartDate, periodEndDate]);

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
        narrative={narrative}
        onNavigateToStrategy={() => setTab?.("opportunities")}
      />

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
        />

        {/* Avg CTR */}
        <KpiCard animIndex={5}
          iconSrc="/icons/ctr.svg" label="Avg CTR" color="#fbbf24" accentBg="rgba(251, 191, 36, 0.1)"
          value={fmtPct(kpis.avgCtr)}
          allTimeLabel="all-time avg" allTimeValue={fmtPct(allTimeKpis.avgCtr)}
          delta={<DeltaBadge current={kpis.avgCtr} previous={previousKpis.avgCtr} isPct />}
          filtered={filtered} metricKey="ctr"
        />

      </div>

      {/* Top Videos */}
      <AnimatedSection>
        <TopVideos rows={filtered} n={10} />
      </AnimatedSection>

      {/* Format Breakdown — unified comparison + contribution */}
      {(() => {
        // Shared period calculation
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
          if (dates.length > 0) daysInPeriod = Math.floor((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24)) || 30;
        }
        const monthsInPeriod = daysInPeriod / 30;
        const shortsUploads = isDateFiltered ? uploadCounts.shorts : kpis.shortsMetrics.count;
        const longsUploads = isDateFiltered ? uploadCounts.longs : kpis.longsMetrics.count;
        const shortsPerMo = monthsInPeriod > 0 ? shortsUploads / monthsInPeriod : 0;
        const longsPerMo = monthsInPeriod > 0 ? longsUploads / monthsInPeriod : 0;

        const comparisonMetrics = [
          { label: isDateFiltered ? "Uploaded" : "Uploads", shortsVal: shortsUploads, shortsPrev: previousKpis.shortsMetrics.count, longsVal: longsUploads, longsPrev: previousKpis.longsMetrics.count, format: fmtInt, subShorts: `${shortsPerMo.toFixed(1)}/mo`, subLongs: `${longsPerMo.toFixed(1)}/mo` },
          { label: "Views", shortsVal: kpis.shortsMetrics.views, shortsPrev: previousKpis.shortsMetrics.views, longsVal: kpis.longsMetrics.views, longsPrev: previousKpis.longsMetrics.views, format: fmtInt },
          { label: "Watch Hours", shortsVal: kpis.shortsMetrics.watchHours, shortsPrev: previousKpis.shortsMetrics.watchHours, longsVal: kpis.longsMetrics.watchHours, longsPrev: previousKpis.longsMetrics.watchHours, format: fmtInt },
          { label: "Subscribers", shortsVal: kpis.shortsMetrics.subs, shortsPrev: previousKpis.shortsMetrics.subs, longsVal: kpis.longsMetrics.subs, longsPrev: previousKpis.longsMetrics.subs, format: fmtInt },
          { label: "Avg Retention", shortsVal: kpis.shortsMetrics.avgRet, shortsPrev: previousKpis.shortsMetrics.avgRet, longsVal: kpis.longsMetrics.avgRet, longsPrev: previousKpis.longsMetrics.avgRet, format: fmtPct, benchmark: 0.45 },
          { label: "Avg CTR", shortsVal: kpis.shortsMetrics.avgCtr, shortsPrev: previousKpis.shortsMetrics.avgCtr, longsVal: kpis.longsMetrics.avgCtr, longsPrev: previousKpis.longsMetrics.avgCtr, format: fmtPct, benchmark: 0.05 },
        ];

        const DeltaChip = ({ value, prev }) => {
          if (!prev || prev === 0) return null;
          const d = ((value - prev) / prev) * 100;
          const pos = d > 0;
          const neutral = Math.abs(d) < 0.5;
          if (neutral) return <span style={{ fontSize: "11px", color: "#666" }}>--</span>;
          const Arrow = pos ? TrendingUp : TrendingDown;
          const color = pos ? "#10b981" : "#ef4444";
          return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "11px", fontWeight: "600", color }}>
              <Arrow size={11} />{pos ? "+" : ""}{d.toFixed(1)}%
            </span>
          );
        };

        return (
      <div className="section-card vs-icon" style={{
        background: "#1E1E1E",
        border: "1px solid #2A2A2A",
        borderRadius: "8px",
        padding: isMobile ? "16px" : "24px",
        marginBottom: "20px",
      }}>
        {/* Section title */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #6366f1, #6366f1cc)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px #6366f14d", cursor: "default" }}>
            <svg width="36" height="36" viewBox="0 0 48 48" fill="none" style={{ overflow: "visible" }}>
              <text x="2" y="36" fontFamily="'Barlow Condensed', sans-serif" fontSize="34" fontWeight="800" fill="white" opacity="0.95">V</text>
              <text x="26" y="36" fontFamily="'Barlow Condensed', sans-serif" fontSize="34" fontWeight="800" fill="white" opacity="0.95">S</text>
              <path className="vs-bolt" d="M25 -8l-12 26h14l-12 38 22-34h-16l12-30z" fill="#fbbf24" style={{ opacity: 0, filter: "drop-shadow(0 0 8px #fbbf24)" }} />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff" }}>Format Breakdown</div>
            <div style={{ fontSize: "15px", color: "#888", marginTop: "2px" }}>Shorts vs Long-form — totals, averages, and contribution</div>
          </div>
        </div>

        {/* Column headers */}
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: isMobile ? "12px" : "12px 20px",
          background: "#252525",
          borderRadius: "8px 8px 0 0",
          borderBottom: "1px solid #333",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <Activity size={18} style={{ color: "#f97316" }} />
              <span style={{ fontSize: "17px", fontWeight: "700", color: "#f97316" }}>Shorts</span>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {isDateFiltered ? (
                <><span className="stat-chip amber" style={{ fontSize: "12px", padding: "2px 7px" }}>{uploadCounts.shorts} uploaded</span><span className="stat-chip blue" style={{ fontSize: "12px", padding: "2px 7px" }}>{kpis.shortsMetrics.count} active</span></>
              ) : (
                <span className="stat-chip amber" style={{ fontSize: "12px", padding: "2px 7px" }}>{kpis.shortsMetrics.count} videos</span>
              )}
            </div>
          </div>
          {!isMobile && <div style={{ width: "120px", textAlign: "center" }} />}
          <div style={{ flex: 1, textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end", marginBottom: "4px" }}>
              <span style={{ fontSize: "17px", fontWeight: "700", color: "#0ea5e9" }}>Long-form</span>
              <PlaySquare size={18} style={{ color: "#0ea5e9" }} />
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {isDateFiltered ? (
                <><span className="stat-chip blue" style={{ fontSize: "12px", padding: "2px 7px" }}>{uploadCounts.longs} uploaded</span><span className="stat-chip purple" style={{ fontSize: "12px", padding: "2px 7px" }}>{kpis.longsMetrics.count} active</span></>
              ) : (
                <span className="stat-chip blue" style={{ fontSize: "12px", padding: "2px 7px" }}>{kpis.longsMetrics.count} videos</span>
              )}
            </div>
          </div>
        </div>

        {/* Comparison rows */}
        <div style={{ background: "#252525", borderRadius: "0 0 8px 8px" }}>
          {comparisonMetrics.map((m, idx) => {
            const shortsWins = m.shortsVal > m.longsVal;
            const longsWins = m.longsVal > m.shortsVal;
            const tied = m.shortsVal === m.longsVal;
            const isLast = idx === comparisonMetrics.length - 1;

            return (
              <div key={m.label} className="comparison-row" style={{
                display: "flex",
                alignItems: "center",
                padding: isMobile ? "10px 12px" : "10px 20px",
                borderBottom: isLast ? "none" : "1px solid #2A2A2A",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: isMobile ? "22px" : "26px",
                    fontWeight: "700",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    color: tied ? "#fff" : shortsWins ? "#fff" : "#888",
                    letterSpacing: "-0.02em",
                  }}>
                    {m.format(m.shortsVal)}
                    {m.benchmark !== undefined && (
                      <span style={{ fontSize: "15px", marginLeft: "6px", color: m.shortsVal >= m.benchmark ? "#10b981" : "#ef4444" }}>
                        {m.shortsVal >= m.benchmark ? "\u2713" : "\u2717"}
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: "2px" }}>
                    {m.subShorts ? (
                      <span style={{ fontSize: "13px", color: "#666", fontStyle: "italic" }}>{m.subShorts}</span>
                    ) : (
                      <DeltaChip value={m.shortsVal} prev={m.shortsPrev} />
                    )}
                  </div>
                </div>

                <div style={{
                  width: isMobile ? "80px" : "120px",
                  textAlign: "center",
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "#999",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  flexShrink: 0,
                }}>
                  {m.label}
                </div>

                <div style={{ flex: 1, textAlign: "right" }}>
                  <div style={{
                    fontSize: isMobile ? "22px" : "26px",
                    fontWeight: "700",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    color: tied ? "#fff" : longsWins ? "#fff" : "#888",
                    letterSpacing: "-0.02em",
                  }}>
                    {m.benchmark !== undefined && (
                      <span style={{ fontSize: "15px", marginRight: "6px", color: m.longsVal >= m.benchmark ? "#10b981" : "#ef4444" }}>
                        {m.longsVal >= m.benchmark ? "\u2713" : "\u2717"}
                      </span>
                    )}
                    {m.format(m.longsVal)}
                  </div>
                  <div style={{ marginTop: "2px" }}>
                    {m.subLongs ? (
                      <span style={{ fontSize: "13px", color: "#666", fontStyle: "italic" }}>{m.subLongs}</span>
                    ) : (
                      <DeltaChip value={m.longsVal} prev={m.longsPrev} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Channel Contribution — donut charts + insights */}
        <div style={{
          background: "#252525",
          border: "1px solid #333",
          borderRadius: "10px",
          padding: isMobile ? "16px" : "24px",
          marginTop: "20px",
        }}>

          {/* Donut charts row: Production Mix + 3 donuts */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "160px 1fr 1fr 1fr", gap: isMobile ? "16px" : "24px", marginBottom: "20px" }}>

            {/* Production Mix */}
            <div className="production-mix" style={{
              background: "#1a1a1a",
              border: "2px solid",
              borderImage: "linear-gradient(135deg, #f97316 0%, #0ea5e9 100%) 1",
              borderRadius: "8px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "default",
            }}>
              <div style={{ fontSize: "11px", color: "#888", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                Production Mix
              </div>
              <div style={{ fontSize: "36px", fontWeight: "700", color: "#fff", marginBottom: "6px", lineHeight: "1", fontFamily: "'Barlow Condensed', sans-serif" }}>
                {kpis.longsMetrics.count > 0
                  ? (kpis.shortsMetrics.count / kpis.longsMetrics.count).toFixed(1)
                  : "0"
                }<span style={{ color: "#666" }}>:</span>1
              </div>
              <div style={{ fontSize: "10px", color: "#666", textAlign: "center", lineHeight: "1.3" }}>
                Shorts per<br />Long-form
              </div>
            </div>

            {/* Donut Charts */}
            {[
              { title: "Views", shortsVal: kpis.shortsMetrics.views, longsVal: kpis.longsMetrics.views },
              { title: "Subscribers", shortsVal: kpis.shortsMetrics.subs, longsVal: kpis.longsMetrics.subs },
              { title: "Reach", shortsVal: kpis.shortsMetrics.imps, longsVal: kpis.longsMetrics.imps },
            ].map((chart) => {
              const total = chart.shortsVal + chart.longsVal;
              const shortsPct = total > 0 ? chart.shortsVal / total : 0.5;
              const longsPct = total > 0 ? chart.longsVal / total : 0.5;
              return (
                <div key={chart.title} style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start"
                }}>
                  <div style={{ fontSize: "13px", color: "#fff", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                    {chart.title}
                  </div>

                  <svg className="donut-hover" width="120" height="120" viewBox="0 0 100 100" style={{ marginBottom: "10px" }}>
                    <circle cx="50" cy="50" r="35" fill="none" stroke="#1a1a1a" strokeWidth="24" />
                    <circle cx="50" cy="50" r="35" fill="none" stroke="#f97316" strokeWidth="24"
                      strokeDasharray={`${shortsPct * 219.8} 219.8`}
                      transform="rotate(-90 50 50)" strokeLinecap="round" />
                    <circle cx="50" cy="50" r="35" fill="none" stroke="#0ea5e9" strokeWidth="24"
                      strokeDasharray={`${longsPct * 219.8} 219.8`}
                      transform={`rotate(${shortsPct * 360 - 90} 50 50)`} strokeLinecap="round" />
                  </svg>

                  {/* Compact legend */}
                  <div style={{ display: "flex", gap: "14px", fontSize: "14px" }}>
                    <span style={{ color: "#f97316", fontWeight: "700" }}>{fmtPct(shortsPct)}</span>
                    <span style={{ color: "#666" }}>|</span>
                    <span style={{ color: "#0ea5e9", fontWeight: "700" }}>{fmtPct(longsPct)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Insight chips row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
            gap: isMobile ? "10px" : "16px",
            paddingTop: "20px",
            borderTop: "1px solid #333"
          }}>
            {[
              { label: "Discovery", desc: "impressions/video",
                metricA: kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.imps / kpis.shortsMetrics.count : 0,
                metricB: kpis.longsMetrics.count > 0 ? kpis.longsMetrics.imps / kpis.longsMetrics.count : 0 },
              { label: "Sub Efficiency", desc: "subs/video",
                metricA: kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.subs / kpis.shortsMetrics.count : 0,
                metricB: kpis.longsMetrics.count > 0 ? kpis.longsMetrics.subs / kpis.longsMetrics.count : 0 },
              { label: "Engagement", desc: "views/impression", isRate: true,
                metricA: kpis.shortsMetrics.imps > 0 ? kpis.shortsMetrics.views / kpis.shortsMetrics.imps : 0,
                metricB: kpis.longsMetrics.imps > 0 ? kpis.longsMetrics.views / kpis.longsMetrics.imps : 0 },
              { label: "Watch Time", desc: "hours/video",
                metricA: kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.watchHours / kpis.shortsMetrics.count : 0,
                metricB: kpis.longsMetrics.count > 0 ? kpis.longsMetrics.watchHours / kpis.longsMetrics.count : 0 },
            ].map((insight) => {
              const advantage = insight.metricA > insight.metricB ? "Shorts" : "Long-form";
              const advantageColor = insight.metricA > insight.metricB ? "#f97316" : "#0ea5e9";
              const multiplier = Math.min(insight.metricA, insight.metricB) > 0
                ? Math.max(insight.metricA, insight.metricB) / Math.min(insight.metricA, insight.metricB) : 0;
              const fmtVal = insight.isRate ? fmtPct : (n) => {
                if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
                if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
                return n.toFixed(1);
              };
              return (
                <div key={insight.label} style={{
                  background: "#1a1a1a",
                  padding: "20px 22px",
                  borderRadius: "8px",
                }}>
                  {/* Header: label + winner badge */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ fontSize: "12px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                      {insight.label}
                    </div>
                    <div style={{ fontSize: "12px", color: advantageColor, fontWeight: "700", background: `${advantageColor}18`, padding: "3px 10px", borderRadius: "4px" }}>
                      {advantage} {multiplier > 0 ? `${multiplier.toFixed(1)}x` : ""}
                    </div>
                  </div>
                  {/* Hero values */}
                  <div style={{ fontSize: "28px", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: "700", lineHeight: "1", marginBottom: "10px" }}>
                    <span style={{ color: "#f97316" }}>{fmtVal(insight.metricA)}</span>
                    <span style={{ color: "#555", margin: "0 8px", fontSize: "15px", fontWeight: "400" }}>vs</span>
                    <span style={{ color: "#0ea5e9" }}>{fmtVal(insight.metricB)}</span>
                  </div>
                  {/* Description */}
                  <div style={{ fontSize: "13px", color: "#999" }}>
                    {insight.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
        );
      })()}

      {/* Publishing Pattern — full width */}
      <PublishingTimeline rows={filtered} dateRange={dateRange} />

      {/* Performance Timeline — full-width below the format row */}
      <div className="section-card" style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "8px", marginBottom: "24px" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #2A2A2A", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>Performance Timeline</div>
          <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value)} style={{ border: "1px solid #333", background: "#252525", borderRadius: "6px", padding: "6px 10px", color: "#E0E0E0", fontSize: "12px", cursor: "pointer", fontWeight: "600" }}>
            <option value="views">Views</option>
            <option value="watchHours">Watch Hours</option>
          </select>
        </div>
        <Chart rows={filtered} metric={chartMetric} />
      </div>

      {/* Audience Intelligence — Demographics, Geography, Traffic Sources, Devices */}
      <AnimatedSection delay={0.05}>
        <AudienceIntelligence activeClient={activeClient} dateRange={dateRange} />
      </AnimatedSection>

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

      {/* Brand Funnel - Conversion Funnel Analysis */}
      <AnimatedSection delay={0.1}>
        <BrandFunnel rows={filtered} dateRange={dateRange} />
      </AnimatedSection>

      {/* Audience Signals - Auto-computed from YouTube data */}
      {activeClient?.id && <AudienceSignals channelId={activeClient.id} />}
    </>
  );
}
