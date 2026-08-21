import { useState, useMemo, useEffect } from "react";
import { expectedRetentionForMix } from "../../lib/retentionBenchmarks.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, Activity, PlaySquare, Eye, MousePointerClick, Timer, Users, Clock, Video
} from "lucide-react";
import { fmtInt, fmtPct } from "../../lib/formatters.js";
import { listAnnotations, addAnnotation } from "../../services/annotationService.js";

import { generateNarrative } from "../../lib/narrativeGenerator.js";
import AnimatedSection from '../Shared/AnimatedSection.jsx';
import AudienceIntelligence from './AudienceIntelligence.jsx';
import AudienceSignals from './AudienceSignals.jsx';
import BrandFunnel from './BrandFunnel.jsx';
import Chart from './Chart.jsx';
import DataFreshnessBadge from '../Strategy/shared/DataFreshnessBadge.jsx';
import HeroBanner from './HeroBanner.jsx';
import MakeMoreOfThis from './MakeMoreOfThis.jsx';
import PublishingTimeline from './PublishingTimeline.jsx';
import TopVideos from './TopVideos.jsx';
import VelocityCurves from './VelocityCurves.jsx';

/* ── tiny delta badge used on KPI cards ── */
function DeltaBadge({ current, previous, isPct }) {
  if (!previous && previous !== 0) return null;
  const delta = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : (current > 0 ? 100 : 0);
  if (Math.abs(delta) < 0.5) return (
    <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "600" }}>No change vs prior</span>
  );
  const up = delta > 0;
  const Arrow = up ? TrendingUp : TrendingDown;
  const color = isPct
    ? (up ? "var(--pos)" : "var(--neg)")  // for rates, up = good
    : (up ? "var(--pos)" : "var(--neg)");
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: "600", color }}>
      <Arrow size={12} /> {up ? "+" : ""}{delta.toFixed(1)}% vs prior
    </span>
  );
}



/* ── expandable KPI card wrapper ── */
/**
 * Annular-sector path with softly rounded corners (corner radius rc,
 * NOT the stroke-cap's full half-band semicircle). This is the middle
 * ground for the Format Breakdown donuts: full round caps inflated
 * every share (~5% per end), square butt ends looked clinical. Corners
 * are cut INTO the wedge, so both boundary angles stay exactly where
 * the data puts them — no length compensation needed.
 */
function roundedSectorPath(cx, cy, rOut, rIn, startDeg, endDeg, rc) {
  const span = endDeg - startDeg;
  if (span <= 0.5) return null;
  const rad = (d) => (d * Math.PI) / 180;
  const band = rOut - rIn;
  // Corner can't exceed half the band or eat the whole arc
  const rcEff = Math.min(rc, band / 2, (rad(span) * rIn) / 2.05);
  const phiOut = (rcEff / rOut) * (180 / Math.PI);
  const phiIn = (rcEff / rIn) * (180 / Math.PI);
  const pt = (r, d) => `${(cx + r * Math.cos(rad(d))).toFixed(2)} ${(cy + r * Math.sin(rad(d))).toFixed(2)}`;
  const largeOut = span - 2 * phiOut > 180 ? 1 : 0;
  const largeIn = span - 2 * phiIn > 180 ? 1 : 0;
  return [
    `M ${pt(rOut, startDeg + phiOut)}`,
    `A ${rOut} ${rOut} 0 ${largeOut} 1 ${pt(rOut, endDeg - phiOut)}`,
    `A ${rcEff} ${rcEff} 0 0 1 ${pt(rOut - rcEff, endDeg)}`,
    `L ${pt(rIn + rcEff, endDeg)}`,
    `A ${rcEff} ${rcEff} 0 0 1 ${pt(rIn, endDeg - phiIn)}`,
    `A ${rIn} ${rIn} 0 ${largeIn} 0 ${pt(rIn, startDeg + phiIn)}`,
    `A ${rcEff} ${rcEff} 0 0 1 ${pt(rIn + rcEff, startDeg)}`,
    `L ${pt(rOut - rcEff, startDeg)}`,
    `A ${rcEff} ${rcEff} 0 0 1 ${pt(rOut, startDeg + phiOut)}`,
    "Z",
  ].join(" ");
}

function KpiCard({ icon: Icon, label, value, allTimeLabel, allTimeValue, color, _accentBg, delta, filtered, metricKey, sparkKey, benchNote = null, _showRing, _ringValue, animIndex = 0, isMobileCell = false, spark = false }) {
  const [open, setOpen] = useState(false);

  // Studio-style sparkline: the metric bucketed by publish day across
  // the filtered set. Every cell carries one so the row's baselines
  // align (2026-08-20). Honest per type: volumes sum, "count" counts
  // uploads, and rates are weighted daily averages (retention by views,
  // CTR by impressions) — never a plain mean of percentages.
  const sparkPath = useMemo(() => {
    if (!spark || !filtered?.length) return null;
    const key = sparkKey || metricKey || "views";
    const isRate = key === "retention" || key === "ctr";
    const num = new Map(), den = new Map();
    for (const r of filtered) {
      if (!r.publishDate) continue;
      const day = String(r.publishDate).slice(0, 10);
      if (key === "count") {
        num.set(day, (num.get(day) || 0) + 1);
      } else if (isRate) {
        const w = key === "retention" ? (r.views || 0) : (r.impressions || 0);
        const v = Number(r[key]) || 0;
        if (w > 0 && v > 0) {
          num.set(day, (num.get(day) || 0) + v * w);
          den.set(day, (den.get(day) || 0) + w);
        }
      } else {
        num.set(day, (num.get(day) || 0) + (Number(r[key]) || 0));
      }
    }
    if (num.size < 3) return null;
    const series = [...num.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)
      .map(([day, v]) => isRate ? v / (den.get(day) || 1) : v);
    const max = Math.max(...series);
    if (max <= 0) return null;
    const W = 96, H = 22;
    const pts = series.map((v, i) => {
      const x = (i / (series.length - 1)) * W;
      const y = H - 2 - (v / max) * (H - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { line: pts.join(" "), last: pts[pts.length - 1].split(",").map(Number), W, H };
  }, [spark, filtered, metricKey, sparkKey]);

  // Build per-video mini-table when expanded
  const topForMetric = useMemo(() => {
    if (!open || !filtered?.length) return [];
    const key = metricKey || "views";
    return [...filtered]
      .sort((a, b) => (b[key] || 0) - (a[key] || 0))
      .slice(0, 5);
  }, [open, filtered, metricKey]);

  return (
    <button
      type="button"
      className="animate-in kpi-card"
      onClick={() => setOpen(o => !o)}
      aria-expanded={open}
      style={{
        background: "transparent",
        border: "none",
        borderLeft: animIndex > 0 && !(isMobileCell && animIndex % 2 === 0)
          ? "1px solid var(--border)" : "none",
        borderTop: isMobileCell && animIndex > 1 ? "1px solid var(--border)" : "none",
        borderRadius: 0,
        padding: "16px 18px",
        textAlign: "left",
        font: "inherit",
        color: "inherit",
        position: "relative",
        cursor: "pointer",
        animationDelay: `${animIndex * 0.06}s`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
        {Icon ? (
          <span style={{ display: "inline-flex", width: 18, height: 18, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={14} style={{ color: "var(--muted)" }} />
          </span>
        ) : null}
        <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.3 }}>{label}</div>
        <div style={{ marginLeft: "auto" }}>
          {open ? <ChevronUp size={13} style={{ color: "var(--faint)" }} /> : <ChevronDown size={13} style={{ color: "var(--faint)" }} />}
        </div>
      </div>
      {/* Numerals in Inter with tabular figures. Barlow Condensed is the
          display voice for the hero client name — on every digit it made
          all forty numbers shout at once, so nothing ranked. */}
      <div className="number-pop" style={{ fontSize: "26px", fontWeight: "600", color: "var(--ink)", marginBottom: "4px", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", animationDelay: `${animIndex * 0.06 + 0.3}s` }}>
        {value}
      </div>
      {spark && (
        sparkPath ? (
          <svg width={sparkPath.W} height={sparkPath.H} viewBox={`0 0 ${sparkPath.W} ${sparkPath.H}`}
            aria-hidden="true" style={{ display: "block", marginBottom: 4, overflow: "visible" }}>
            <polyline points={sparkPath.line} fill="none" stroke="var(--blue)" strokeWidth="1.5"
              strokeLinejoin="round" opacity="0.75" />
            <circle cx={sparkPath.last[0]} cy={sparkPath.last[1]} r="2" fill="var(--blue)" />
          </svg>
        ) : (
          <div aria-hidden="true" style={{ height: 22, marginBottom: 4 }} />
        )
      )}
      {/* Delta badge */}
      {delta}
      <div style={{ fontSize: "13px", color: "var(--outline)", marginTop: "6px" }}>
        <span style={{ color: "var(--muted)" }}>{allTimeValue}</span> {allTimeLabel}
      </div>
      {/* The note line reserves its height in EVERY cell — one cell
          growing an extra line un-aligned the whole row (user,
          2026-08-20), and any cell may carry a note some week. */}
      <div style={{ fontSize: "11px", color: "var(--faint)", marginTop: "2px", minHeight: "15px", lineHeight: "15px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={benchNote || undefined}>
        {benchNote || "\u00A0"}
      </div>

      {/* Expandable drill-down */}
      {open && topForMetric.length > 0 && (
        <div style={{ marginTop: "14px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
          <div style={{ fontSize: "10px", color: "var(--faint)", textTransform: "uppercase", marginBottom: "8px", letterSpacing: "0.5px" }}>Top 5 Videos</div>
          {topForMetric.map((v, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
              <div style={{ fontSize: "12px", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                {v.title || "Untitled"}
              </div>
              <div style={{ fontSize: "12px", color, fontWeight: "600", flexShrink: 0 }}>
                {metricKey === "retention" || metricKey === "ctr" ? fmtPct(v[metricKey] || 0) : fmtInt(v[metricKey] || v.views || 0)}
              </div>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

/**
 * LatestUploadCard — Blue Edition right column: how the newest upload
 * is doing against the channel's own averages. Three metric rows, each
 * with a small verdict chip; lime = beating the channel's norm, impact
 * red = under it. All numbers from rows already on hand.
 */
function LatestUploadCard({ filtered, kpis }) {
  const latest = useMemo(() => {
    if (!filtered?.length) return null;
    return [...filtered]
      .filter(v => v.publishDate)
      .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate))[0] || null;
  }, [filtered]);

  if (!latest) return null;

  const isShort = (latest.type || "").toLowerCase().includes("short") || (latest.duration && latest.duration <= 180);
  const avgViews = filtered.length ? filtered.reduce((s, r) => s + (r.views || 0), 0) / filtered.length : 0;

  const Chip = ({ good, children }) => (
    <span style={{
      fontFamily: "var(--font-label)", fontSize: 11, fontWeight: 600,
      color: good ? "var(--pos)" : "var(--neg)",
      background: good ? "var(--pos-bg)" : "var(--neg-bg)",
      border: `1px solid ${good ? "var(--pos-border)" : "var(--neg-border)"}`,
      borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
    }}>{children}</span>
  );

  const rows = [
    latest.views != null && avgViews > 0 && {
      label: "Views", value: fmtInt(latest.views),
      good: latest.views >= avgViews,
      chip: `${latest.views >= avgViews ? "↑" : "↓"} ${(latest.views / avgViews).toFixed(1)}x avg`,
    },
    latest.ctr != null && kpis.avgCtr > 0 && {
      label: "Click-through rate", value: fmtPct(latest.ctr),
      good: latest.ctr >= kpis.avgCtr,
      chip: `${latest.ctr >= kpis.avgCtr ? "↑" : "↓"} vs ${fmtPct(kpis.avgCtr)} avg`,
    },
    latest.retention != null && kpis.avgRet > 0 && {
      label: "Retention", value: fmtPct(latest.retention),
      good: latest.retention >= kpis.avgRet,
      chip: `${latest.retention >= kpis.avgRet ? "↑" : "↓"} vs ${fmtPct(kpis.avgRet)} avg`,
    },
  ].filter(Boolean);

  return (
    <div className="section-card" style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: "24px",
      padding: "18px 24px", marginBottom: "20px",
      display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
    }}>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-label)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 6 }}>
          Latest upload
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", lineHeight: 1.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={latest.title}>
          {latest.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
          {isShort ? "Short" : "Long-form"} · {new Date(latest.publishDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
      </div>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start", paddingLeft: 24, borderLeft: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{r.value}</div>
          <Chip good={r.good}>{r.chip}</Chip>
        </div>
      ))}
      {rows.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>No comparable metrics for this upload yet.</div>
      )}
    </div>
  );
}

/**
 * CtrImpressionsScatter — the packaging diagnostic from the 2026-08-20
 * expert review: CTR only means something at its impression volume
 * (browse-served CTR falls as reach scales), so 6% at 40K impressions
 * and 6% at 400 are different claims. Each dot is a video; the quadrant
 * that matters is bottom-right — big reach, weak packaging — those are
 * the retitle/rethumbnail candidates.
 */
function CtrImpressionsScatter({ rows }) {
  const pts = useMemo(() => {
    const usable = (rows || []).filter(v => (v.impressions || 0) >= 100 && (v.ctr || 0) > 0);
    if (usable.length < 8) return null;
    const ctrs = usable.map(v => v.ctr).sort((a, b) => a - b);
    const caps = ctrs[Math.min(Math.floor(ctrs.length * 0.95), ctrs.length - 1)];
    const yMax = Math.max(caps * 1.15, 0.02);
    const xs = usable.map(v => Math.log10(v.impressions));
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    if (xMax - xMin < 0.3) return null; // no spread, nothing to read
    const W = 800, H = 250, P = { l: 10, r: 14, t: 12, b: 26 };
    const px = (imp) => P.l + ((Math.log10(imp) - xMin) / (xMax - xMin)) * (W - P.l - P.r);
    const py = (ctr) => P.t + (1 - Math.min(ctr, yMax) / yMax) * (H - P.t - P.b);
    const medianOf = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    return {
      dots: usable.map(v => ({ x: px(v.impressions), y: py(v.ctr), short: v.type === "short", title: v.title, imp: v.impressions, ctr: v.ctr })),
      medX: px(medianOf(usable.map(v => v.impressions))),
      medY: py(medianOf(usable.map(v => v.ctr))),
      yMax, xMin, xMax, W, H, P,
    };
  }, [rows]);

  if (!pts) return null;
  const fmtImp = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(Math.round(n));

  return (
    <div className="section-card" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "24px", padding: "24px", marginBottom: "20px" }}>
      <div style={{ fontFamily: "var(--font-label)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 2 }}>Packaging</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>Click-through vs reach</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, marginBottom: 14, maxWidth: "78ch", lineHeight: 1.5 }}>
        Every dot is a video. Bottom-right — big reach, weak click-through — are the retitle and
        rethumbnail candidates; top-right is packaging that held up at scale.
      </div>
      <svg width="100%" viewBox={`0 0 ${pts.W} ${pts.H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        <line x1={pts.medX} x2={pts.medX} y1={pts.P.t} y2={pts.H - pts.P.b} stroke="var(--outline-variant)" strokeDasharray="4,6" strokeWidth="1" />
        <line x1={pts.P.l} x2={pts.W - pts.P.r} y1={pts.medY} y2={pts.medY} stroke="var(--outline-variant)" strokeDasharray="4,6" strokeWidth="1" />
        {pts.dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="5"
            fill={d.short ? "var(--pos)" : "var(--blue)"} opacity="0.75"
            stroke="#0e1417" strokeWidth="1">
            <title>{`${d.title || "Untitled"} — ${fmtImp(d.imp)} impressions, ${(d.ctr * 100).toFixed(1)}% CTR`}</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 11, color: "var(--faint)" }}>← fewer impressions · more impressions (log scale) →</span>
        <span style={{ display: "flex", gap: 14, fontSize: 11, fontWeight: 600 }}>
          <span style={{ color: "var(--fmt-shorts)" }}>● Shorts</span>
          <span style={{ color: "var(--fmt-long)" }}>● Long-form</span>
          <span style={{ color: "var(--faint)" }}>┄ medians</span>
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage({ filtered, rows, kpis, allTimeKpis, previousKpis, dateRange, customDateRange, chartMetric, setChartMetric, channelStats, activeClient, selectedChannel, setTab, dailyViews, subSeries , promotedFlags, organicOverrides, onOrganicOverride }) {
  const { isMobile } = useMediaQuery();
  // Channel stats (subscribers, views, videoCount) are fetched by the parent (App.jsx)
  // which correctly handles per-channel resolution and "all channels" aggregation.
  const resolvedStats = channelStats;
  const isDateFiltered = dateRange !== "all";

  // Generate narrative headline from KPI data
  const narrative = useMemo(() => {
    if (activeClient?.isAggregate) {
      // The union's prior-period coverage is too sparse for honest
      // growth claims ("grew 8147%") — the aggregate standfirst states
      // scale, not change.
      const channelCount = activeClient.networkMembers?.length || 0;
      return `Everything the portfolio published, in one view — ${channelCount} channels, ${fmtInt(kpis?.views || 0)} views this period.`;
    }
    return generateNarrative(kpis, previousKpis, filtered);
  }, [kpis, previousKpis, filtered, activeClient?.isAggregate, activeClient?.networkMembers?.length]);

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

  // Timeline annotations for the Momentum chart (migration 114 —
  // empty until it runs, chart simply has no markers).
  const [annotations, setAnnotations] = useState([]);
  const [annRefresh, setAnnRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setAnnotations([]);
    if (!activeClient?.id) return;
    const channelIds = activeClient.isNetwork && activeClient.networkMembers
      ? activeClient.networkMembers.map(m => m.id)
      : [activeClient.id];
    const end = new Date().toISOString().slice(0, 10);
    const start = periodStartDate ? periodStartDate.toISOString().slice(0, 10) : "2000-01-01";
    listAnnotations(channelIds, start, end)
      .then(rows => { if (!cancelled) setAnnotations(rows); });
    return () => { cancelled = true; };
  }, [activeClient?.id, activeClient?.isNetwork, activeClient?.networkMembers, periodStartDate, annRefresh]);

  const handleAddNote = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const date = window.prompt("When did it happen? (YYYY-MM-DD)", today)?.trim();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const label = window.prompt("What happened? (e.g. \"New thumbnail style\", \"Went weekly\")")?.trim();
    if (!label) return;
    try {
      await addAnnotation(activeClient.id, date, label);
      setAnnRefresh(t => t + 1);
    } catch (e) {
      window.alert(e.message?.includes("channel_annotations")
        ? "Notes need migration 114 — run the pending migration batch first."
        : `Couldn't save the note: ${e.message}`);
    }
  };

  return (
    <>
      {/* Hero: client name + story on the left, the Momentum pulse in the
          top-right (2026-08-20 note: the full-height chart row hid that
          there was anything below the fold — compact keeps the KPI row
          peeking up). */}
      <div style={{ display: "flex", gap: 20, alignItems: "stretch", flexDirection: isMobile ? "column" : "row" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <HeroBanner
            activeClient={activeClient}
            kpis={kpis}
            previousKpis={previousKpis}
            channelStats={channelStats}
            filtered={filtered}
            narrative={narrative}
            onNavigateToStrategy={() => setTab?.("opportunities")}
          />
        </div>
        <div className="section-card" style={{ flex: isMobile ? "none" : 1.05, minWidth: 0, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "24px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ padding: "16px 22px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontFamily: "var(--font-label)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--blue)", display: "inline-block" }} />
              Momentum
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!activeClient?.isAggregate && (
                <button onClick={handleAddNote} title='Mark an event on the timeline ("new thumbnail style", "went weekly") so the chart explains its own bends'
                  style={{ border: "1px solid var(--border)", background: "transparent", borderRadius: "10px", padding: "5px 10px", color: "var(--muted)", fontSize: "12px", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>
                  + Note
                </button>
              )}
              <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value)} style={{ border: "1px solid var(--border)", background: "var(--input-bg)", borderRadius: "10px", padding: "5px 9px", color: "var(--text)", fontSize: "12px", cursor: "pointer", fontWeight: "600" }}>
                <option value="views">Views</option>
                <option value="watchHours">Watch Hours</option>
                <option value="subscribers">Subscribers</option>
              </select>
            </div>
          </div>
          <Chart compact rows={filtered} metric={chartMetric} dailySeries={dailyViews} subSeries={subSeries} annotations={annotations} prevTotals={{ views: previousKpis.views, watchHours: previousKpis.watchHours, subscribers: previousKpis.subs }} />
        </div>
      </div>

      {/* Data freshness — sits just below the hero so the strategist sees
          how fresh the underlying data is before scanning the KPIs. */}
      {activeClient?.id && !activeClient.isAggregate && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6, marginBottom: 12 }}>
          <DataFreshnessBadge clientId={activeClient.id} />
        </div>
      )}

      {/* Top Level KPIs - Period + All Time — now with deltas & click-to-expand */}
      {/* One unbounded row divided by hairlines — six boxed cards with six
          gradient icon chips in six hues was the strongest remaining
          template tell. The row treats the six numbers as one instrument
          panel; hierarchy comes from the numerals, not the chrome. */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(6, 1fr)",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "24px",
        marginBottom: "24px",
        overflow: "hidden",
      }}>
        {/* Views */}
        <KpiCard animIndex={0} isMobileCell={isMobile}
          icon={Eye} label={isDateFiltered ? "Period Views" : "Views"} color="#818cf8" accentBg="rgba(129, 140, 248, 0.1)"
          value={fmtInt(kpis.views)}
          allTimeLabel={isDateFiltered ? "lifetime" : "total"}
          allTimeValue={resolvedStats?.viewCount
            ? fmtInt(resolvedStats.viewCount)
            : fmtInt(allTimeKpis.views)}
          delta={<DeltaBadge current={kpis.views} previous={previousKpis.views} />}
          filtered={filtered} metricKey="views" spark
        />
        {/* Avg CTR */}
        <KpiCard animIndex={1} isMobileCell={isMobile}
          icon={MousePointerClick} label="Avg CTR" color="#fbbf24" accentBg="rgba(251, 191, 36, 0.1)"
          value={fmtPct(kpis.avgCtr)}
          allTimeLabel="all-time avg" allTimeValue={fmtPct(allTimeKpis.avgCtr)}
          delta={<DeltaBadge current={kpis.avgCtr} previous={previousKpis.avgCtr} isPct />}
          filtered={filtered} metricKey="ctr" spark
        />
        {/* Avg Retention */}
        <KpiCard animIndex={2} isMobileCell={isMobile}
          icon={Timer} label="Avg Retention" color="#dcff45" accentBg="rgba(52, 211, 153, 0.1)"
          value={fmtPct(kpis.avgRet)}
          allTimeLabel="all-time avg" allTimeValue={fmtPct(allTimeKpis.avgRet)}
          delta={<DeltaBadge current={kpis.avgRet} previous={previousKpis.avgRet} isPct />}
          benchNote={(() => {
            const exp = expectedRetentionForMix(filtered);
            return exp != null ? `typical for this length mix: ~${Math.round(exp * 100)}%` : null;
          })()}
          filtered={filtered} metricKey="retention" spark
        />
        {/* Subscribers — show period-gained when date range is active */}
        <KpiCard animIndex={3} isMobileCell={isMobile}
          icon={Users} label={isDateFiltered ? "Subscribers Gained" : "Subscribers"} color="#ffab9d" accentBg="rgba(255, 171, 157, 0.1)"
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
          filtered={filtered} metricKey="subscribers" spark
        />
        {/* Watch Hours */}
        <KpiCard animIndex={4} isMobileCell={isMobile}
          icon={Clock} label="Watch Hours" color="#4cd6ff" accentBg="rgba(76, 214, 255, 0.1)"
          value={fmtInt(kpis.watchHours)}
          allTimeLabel="total" allTimeValue={fmtInt(allTimeKpis.watchHours)}
          delta={<DeltaBadge current={kpis.watchHours} previous={previousKpis.watchHours} />}
          filtered={filtered} metricKey="watchHours" spark
        />
        {/* Videos */}
        <KpiCard animIndex={5} isMobileCell={isMobile}
          icon={Video} label={isDateFiltered ? "Uploaded Videos" : "Videos"} color="#94a3b8" accentBg="rgba(148, 163, 184, 0.1)"
          value={isDateFiltered ? fmtInt(uploadedInPeriod) : fmtInt(filtered.length)}
          allTimeLabel={isDateFiltered ? "active in period" : "total"}
          allTimeValue={isDateFiltered
            ? fmtInt(filtered.length)
            : resolvedStats?.videoCount
              ? fmtInt(resolvedStats.videoCount)
              : fmtInt(allTimeKpis.count)}
          delta={<DeltaBadge current={isDateFiltered ? uploadedInPeriod : filtered.length} previous={previousKpis.shortsMetrics.count + previousKpis.longsMetrics.count} />}
          filtered={filtered} metricKey="views" sparkKey="count" spark
        />

      </div>

      {/* Latest upload verdicts — one slim strip between the KPIs and
          the leaderboards: how the NEWEST video is doing vs the
          channel's own norms. */}
      <LatestUploadCard filtered={filtered} kpis={kpis} />

      {/* What to make next — breakouts + audience demand, per the
          2026-08-20 expert-panel review ("promote a make-more-of-this
          strip onto the dashboard"). */}
      <MakeMoreOfThis filtered={filtered} activeClient={activeClient} />

      {/* Launch velocity — first-14-day curves from daily snapshots */}
      <VelocityCurves activeClient={activeClient} />

      {/* Top Videos */}
      <AnimatedSection>
        <TopVideos rows={filtered} n={10} promotedFlags={promotedFlags} organicOverrides={organicOverrides} onOrganicOverride={onOrganicOverride} />
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
          if (neutral) return <span style={{ fontSize: "11px", color: "var(--faint)" }}>--</span>;
          const Arrow = pos ? TrendingUp : TrendingDown;
          const color = pos ? "var(--pos)" : "var(--neg)";
          return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "11px", fontWeight: "600", color }}>
              <Arrow size={11} />{pos ? "+" : ""}{d.toFixed(1)}%
            </span>
          );
        };

        return (
      <div className="section-card vs-icon" style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "24px",
        padding: isMobile ? "16px" : "24px",
        marginBottom: "20px",
      }}>
        {/* Section title */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(205, 242, 0, 0.10)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "default", flexShrink: 0 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "17px", fontWeight: 800, color: "var(--pos)", letterSpacing: "0.03em", lineHeight: 1 }}>VS</span>
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "var(--track-label)", fontFamily: "var(--font-label)", color: "var(--muted)", marginBottom: "2px" }}>Format</div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--ink)" }}>Format Breakdown</div>
            <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "2px" }}>Shorts vs Long-form — totals, averages, and contribution</div>
          </div>
        </div>

        {/* Column headers */}
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: isMobile ? "12px" : "12px 20px",
          background: "var(--input-bg)",
          borderRadius: "8px 8px 0 0",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <Activity size={18} style={{ color: "var(--fmt-shorts)" }} />
              <span style={{ fontSize: "17px", fontWeight: "700", color: "var(--fmt-shorts)" }}>Shorts</span>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {isDateFiltered ? (
                <><span className="stat-chip lime" style={{ fontSize: "12px", padding: "2px 7px" }}>{uploadCounts.shorts} uploaded</span><span className="stat-chip blue" style={{ fontSize: "12px", padding: "2px 7px" }}>{kpis.shortsMetrics.count} active</span></>
              ) : (
                <span className="stat-chip lime" style={{ fontSize: "12px", padding: "2px 7px" }}>{kpis.shortsMetrics.count} videos</span>
              )}
            </div>
          </div>
          {!isMobile && <div style={{ width: "120px", textAlign: "center" }} />}
          <div style={{ flex: 1, textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end", marginBottom: "4px" }}>
              <span style={{ fontSize: "17px", fontWeight: "700", color: "var(--blue)" }}>Long-form</span>
              <PlaySquare size={18} style={{ color: "var(--blue)" }} />
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
        <div style={{ background: "var(--input-bg)", borderRadius: "0 0 8px 8px" }}>
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
                borderBottom: isLast ? "none" : "1px solid var(--border)",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: isMobile ? "22px" : "26px",
                    fontWeight: "700",
                    fontVariantNumeric: "tabular-nums",
                    color: tied ? "var(--ink)" : shortsWins ? "var(--ink)" : "var(--outline)",
                    letterSpacing: "-0.02em",
                  }}>
                    {m.format(m.shortsVal)}
                    {m.benchmark !== undefined && (
                      <span style={{ fontSize: "15px", marginLeft: "6px", color: m.shortsVal >= m.benchmark ? "var(--pos)" : "var(--neg)" }}>
                        {m.shortsVal >= m.benchmark ? "\u2713" : "\u2717"}
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: "2px" }}>
                    {m.subShorts ? (
                      <span style={{ fontSize: "13px", color: "var(--faint)", fontStyle: "italic" }}>{m.subShorts}</span>
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
                  color: "var(--muted)",
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
                    fontVariantNumeric: "tabular-nums",
                    color: tied ? "var(--ink)" : longsWins ? "var(--ink)" : "var(--outline)",
                    letterSpacing: "-0.02em",
                  }}>
                    {m.benchmark !== undefined && (
                      <span style={{ fontSize: "15px", marginRight: "6px", color: m.longsVal >= m.benchmark ? "var(--pos)" : "var(--neg)" }}>
                        {m.longsVal >= m.benchmark ? "\u2713" : "\u2717"}
                      </span>
                    )}
                    {m.format(m.longsVal)}
                  </div>
                  <div style={{ marginTop: "2px" }}>
                    {m.subLongs ? (
                      <span style={{ fontSize: "13px", color: "var(--faint)", fontStyle: "italic" }}>{m.subLongs}</span>
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
          background: "var(--input-bg)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          padding: isMobile ? "16px" : "24px",
          marginTop: "20px",
        }}>

          {/* Donut charts row: Production Mix + 3 donuts */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "160px 1fr 1fr 1fr", gap: isMobile ? "16px" : "24px", marginBottom: "20px" }}>

            {/* Production Mix */}
            <div className="production-mix" style={{
              background: "var(--input-bg)",
              border: "2px solid",
              borderImage: "linear-gradient(135deg, #CDF200 0%, #00D1FF 100%) 1",
              borderRadius: "8px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "default",
            }}>
              <div style={{ fontSize: "11px", color: "var(--outline)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                Production Mix
              </div>
              <div style={{ fontSize: "24px", fontWeight: "600", color: "var(--ink)", marginBottom: "6px", lineHeight: "1", fontVariantNumeric: "tabular-nums" }}>
                {kpis.longsMetrics.count > 0
                  ? (kpis.shortsMetrics.count / kpis.longsMetrics.count).toFixed(1)
                  : "0"
                }<span style={{ color: "var(--faint)" }}>:</span>1
              </div>
              <div style={{ fontSize: "10px", color: "var(--faint)", textAlign: "center", lineHeight: "1.3" }}>
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
                  <div style={{ fontSize: "13px", color: "var(--ink)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                    {chart.title}
                  </div>

                  <svg className="donut-hover" width="120" height="120" viewBox="0 0 100 100" style={{ marginBottom: "10px" }}>
                    {(() => {
                      // Majority colour paints the full ring; the minority is a
                      // rounded-corner wedge on top (roundedSectorPath). Soft
                      // corners keep the friendliness of round caps without the
                      // full semicircle that inflated every share, and the
                      // wedge's boundary angles are exactly the data's.
                      const shortsMajority = shortsPct >= longsPct;
                      const baseColor = shortsMajority ? "var(--pos)" : "var(--blue)";
                      const arcColor = shortsMajority ? "var(--blue)" : "var(--pos)";
                      const arcPct = shortsMajority ? longsPct : shortsPct;
                      const wedge = roundedSectorPath(50, 50, 47, 23, -90, -90 + arcPct * 360, 5);
                      return (
                        <>
                          <circle cx="50" cy="50" r="35" fill="none" stroke={baseColor} strokeWidth="24" />
                          {wedge && <path d={wedge} fill={arcColor} />}
                        </>
                      );
                    })()}
                  </svg>

                  {/* Compact legend */}
                  <div style={{ display: "flex", gap: "14px", fontSize: "14px" }}>
                    <span style={{ color: "var(--fmt-shorts)", fontWeight: "700" }}>{fmtPct(shortsPct)}</span>
                    <span style={{ color: "var(--faint)" }}>|</span>
                    <span style={{ color: "var(--blue)", fontWeight: "700" }}>{fmtPct(longsPct)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Which-means verdict — the panel's note: numbers without a
              sentence make the reader do the analysis. Deterministic,
              from the same ratios the chips show. */}
          {(() => {
            const sm = kpis.shortsMetrics, lm = kpis.longsMetrics;
            if (!sm?.count || !lm?.count) return null;
            const per = (m, k) => m.count > 0 ? (m[k] || 0) / m.count : 0;
            const watchRatio = per(sm, "watchHours") > 0 ? per(lm, "watchHours") / per(sm, "watchHours") : null;
            const subsRatioShorts = per(lm, "subs") > 0 ? per(sm, "subs") / per(lm, "subs") : null;
            let verdict = null;
            if (watchRatio > 3 && subsRatioShorts > 1.5) {
              verdict = `Which means: Shorts are the recruiter (${subsRatioShorts.toFixed(1)}× the subscribers per video) and long-form is the depth engine (${watchRatio.toFixed(1)}× the watch time) — feed both, they do different jobs.`;
            } else if (watchRatio > 3) {
              verdict = `Which means: long-form carries the relationship — ${watchRatio.toFixed(1)}× the watch time per video. Shorts are reach, not retention, here.`;
            } else if (subsRatioShorts > 1.5) {
              verdict = `Which means: Shorts are doing the audience-building — ${subsRatioShorts.toFixed(1)}× the subscribers per video. Protect that pipeline.`;
            } else if (watchRatio != null && watchRatio < 1) {
              verdict = "Which means: Shorts currently outwork long-form on every job — worth asking whether the long-form format needs a rethink.";
            }
            if (!verdict) return null;
            return (
              <div style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.6, padding: "12px 16px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: "12px", margin: "16px 0", maxWidth: "90ch" }}>
                {verdict}
              </div>
            );
          })()}

          {/* Insight chips row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
            gap: isMobile ? "10px" : "16px",
            paddingTop: "20px",
            borderTop: "1px solid var(--border)"
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
              const advantageColor = insight.metricA > insight.metricB ? "var(--pos)" : "var(--blue)";
              const multiplier = Math.min(insight.metricA, insight.metricB) > 0
                ? Math.max(insight.metricA, insight.metricB) / Math.min(insight.metricA, insight.metricB) : 0;
              const fmtVal = insight.isRate ? fmtPct : (n) => {
                if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
                if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
                return n.toFixed(1);
              };
              return (
                <div key={insight.label} style={{
                  background: "var(--input-bg)",
                  padding: "20px 22px",
                  borderRadius: "8px",
                }}>
                  {/* Header: label + winner badge */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ fontSize: "12px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                      {insight.label}
                    </div>
                    <div style={{ fontSize: "12px", color: advantageColor, fontWeight: "700", background: `color-mix(in srgb, ${advantageColor} 9%, transparent)`, padding: "3px 10px", borderRadius: "4px" }}>
                      {advantage} {multiplier > 0 ? `${multiplier.toFixed(1)}x` : ""}
                    </div>
                  </div>
                  {/* Hero values */}
                  <div style={{ fontSize: "20px", fontWeight: "600", lineHeight: "1", marginBottom: "10px", fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: "var(--fmt-shorts)" }}>{fmtVal(insight.metricA)}</span>
                    <span style={{ color: "var(--faint)", margin: "0 8px", fontSize: "15px", fontWeight: "400" }}>vs</span>
                    <span style={{ color: "var(--blue)" }}>{fmtVal(insight.metricB)}</span>
                  </div>
                  {/* Description */}
                  <div style={{ fontSize: "13px", color: "var(--muted)" }}>
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

      {/* Packaging diagnostic — CTR only means something at its
          impression volume */}
      <CtrImpressionsScatter rows={filtered} />

      {/* Publishing Pattern — full width */}
      <PublishingTimeline rows={filtered} dateRange={dateRange} />

      {/* Audience Intelligence — Demographics, Geography, Traffic Sources, Devices */}
      <AnimatedSection delay={0.05}>
        <AudienceIntelligence activeClient={activeClient} selectedChannel={selectedChannel} dateRange={dateRange} />
      </AnimatedSection>

      {/* Dataset Info Note */}
      {rows.length > 0 && (
        <div style={{
          textAlign: "right",
          fontSize: "12px",
          color: "var(--faint)",
          marginBottom: "20px",
          fontStyle: "italic"
        }}>
          Based on your {rows.length} most-viewed videos
        </div>
      )}

      {/* Brand Funnel - Conversion Funnel Analysis.
          Hidden entirely on "All Channels": the aggregate's cached rows
          mix lifetime view counts with 28-day impressions/watch hours,
          so even a filtered-to-covered subset yields an impossible
          funnel (impressions < views) and a fabricated diagnosis on top
          of it. It returns automatically once every channel has
          period-scoped snapshot rows (migration 112 + full sync
          coverage) — single channels compute from one source and keep
          their funnel today. */}
      {!activeClient?.isAggregate && (
        <AnimatedSection delay={0.1}>
          <BrandFunnel rows={filtered} dateRange={dateRange} />
        </AnimatedSection>
      )}

      {/* Audience Signals - Auto-computed from YouTube data */}
      {activeClient?.id && <AudienceSignals channelId={activeClient.id} />}
    </>
  );
}
