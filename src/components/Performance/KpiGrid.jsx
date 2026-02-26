import React from "react";
import { fmtInt, fmtPct } from "../../lib/utils";

/* ── progress ring for percentage KPIs ── */
function ProgressRing({ value, color, size = 52, stroke = 5 }) {
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

export default function KpiGrid({ kpis, channelStats }) {
  const safeKpis = kpis || {};
  const safeChannelStats = channelStats || {};

  // Color Palette: We use RGBA for backgrounds so they glow against the dark card
  const cards = [
    {
      label: "Subscribers",
      value: safeChannelStats.subscriberCount
        ? fmtInt(safeChannelStats.subscriberCount)
        : fmtInt(safeKpis.subscribers || 0),
      iconSrc: "/icons/subscribers.svg",
      color: "#f472b6",
      gradient: "linear-gradient(135deg, #f472b6, #ec4899)",
      glow: "rgba(236, 72, 153, 0.3)",
      subtext: safeChannelStats.subscriberCount
        ? `+${fmtInt(safeKpis.subscribers || 0)} in period`
        : "Net gained",
    },
    {
      label: "Channel Views",
      value: safeChannelStats.viewCount
        ? fmtInt(safeChannelStats.viewCount)
        : fmtInt(safeKpis.views || 0),
      iconSrc: "/icons/views.svg",
      color: "#818cf8",
      gradient: "linear-gradient(135deg, #818cf8, #6366f1)",
      glow: "rgba(99, 102, 241, 0.3)",
      subtext: safeChannelStats.viewCount
        ? `${fmtInt(safeKpis.views || 0)} in period`
        : "Lifetime views",
    },
    {
      label: "Total Videos",
      value: safeChannelStats.videoCount
        ? fmtInt(safeChannelStats.videoCount)
        : fmtInt(safeKpis.uploads || 0),
      iconSrc: "/icons/upload.svg",
      color: "#94a3b8",
      gradient: "linear-gradient(135deg, #94a3b8, #64748b)",
      glow: "rgba(100, 116, 139, 0.3)",
      subtext: safeChannelStats.videoCount
        ? `${fmtInt(safeKpis.uploads || 0)} in period`
        : "All videos",
    },
    {
      label: "Watch Hours",
      value: fmtInt(safeKpis.watchHours || 0),
      iconSrc: "/icons/clock.svg",
      color: "#818cf8",
      gradient: "linear-gradient(135deg, #818cf8, #6366f1)",
      glow: "rgba(99, 102, 241, 0.3)",
      subtext: "In period",
    },
    {
      label: "Avg Retention",
      value: fmtPct(safeKpis.avgRetention || 0, 1),
      iconSrc: "/icons/retention.svg",
      color: "#34d399",
      gradient: "linear-gradient(135deg, #34d399, #10b981)",
      glow: "rgba(16, 185, 129, 0.3)",
      subtext: "Weighted avg",
      showRing: true,
      ringValue: safeKpis.avgRetention || 0,
    },
    {
      label: "Avg CTR",
      value: fmtPct(safeKpis.avgCtr || 0, 1),
      iconSrc: "/icons/click.svg",
      color: "#fbbf24",
      gradient: "linear-gradient(135deg, #fbbf24, #f59e0b)",
      glow: "rgba(245, 158, 11, 0.3)",
      subtext: "Click-through rate",
      showRing: true,
      ringValue: safeKpis.avgCtr || 0,
    },
  ];

  const s = {
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      gap: "20px",
      marginBottom: "24px",
      marginTop: "32px",
    },
    card: {
      // Dark Slate Background (Matches standard 'Dark Mode' UIs)
      backgroundColor: "#1e293b", // Slate-800
      // Subtle Border (Darker than card, but distinct)
      border: "1px solid #334155", // Slate-700
      borderRadius: "8px",
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      // Dark shadow for depth
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
      minHeight: "150px",
    },
    header: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: "16px",
    },
    iconBox: (gradient, glow) => ({
      width: "48px",
      height: "48px",
      borderRadius: "14px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      background: gradient,
      boxShadow: `0 4px 16px ${glow}`,
    }),
    label: {
      fontSize: "12px",
      fontWeight: "600",
      color: "#94a3b8", // Slate-400 (Muted Text)
      marginBottom: "6px",
      letterSpacing: "0.02em",
      textTransform: "uppercase", // Adds a 'Data' feel
    },
    value: {
      fontSize: "34px",
      fontWeight: "700",
      color: "#f8fafc",
      lineHeight: "1",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "-0.03em",
      fontFamily: "'Barlow Condensed', sans-serif",
    },
    subtext: {
      fontSize: "12px",
      color: "#64748b", // Slate-500 (Darker Text)
      marginTop: "6px",
      fontWeight: "500",
    }
  };

  return (
    <div style={s.grid}>
      {cards.map((item, i) => {
        return (
          <div key={i} style={s.card}>
            <div style={s.header}>
              <div style={s.iconBox(item.gradient, item.glow)}>
                <img src={item.iconSrc} width={24} height={24} alt={item.label} style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }} />
              </div>
            </div>
            
            <div>
              <div style={s.label}>{item.label}</div>
              {item.showRing ? (
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <ProgressRing value={item.ringValue} color={item.color} />
                  <div style={s.value}>{item.value}</div>
                </div>
              ) : (
                <div style={s.value}>{item.value}</div>
              )}
              <div style={s.subtext}>{item.subtext}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}