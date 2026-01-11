import React from "react";
import { 
  UploadCloud, Eye, Clock, 
  BarChart3, MousePointerClick, Users 
} from "lucide-react";
import { fmtInt, fmtPct } from "../lib/utils";

export default function KpiGrid({ kpis }) {
  const safeKpis = kpis || {};

  // Color Palette: We use RGBA for backgrounds so they glow against the dark card
  const cards = [
    {
      label: "Total Uploads",
      value: fmtInt(safeKpis.uploads || 0),
      icon: UploadCloud,
      color: "#94a3b8", // Slate-400 (Lighter for dark mode)
      bg: "rgba(148, 163, 184, 0.1)", // Translucent Slate
      subtext: "All videos",
    },
    {
      label: "Total Views",
      value: fmtInt(safeKpis.views || 0),
      icon: Eye,
      color: "#818cf8", // Indigo-400 (Brighter for dark mode)
      bg: "rgba(129, 140, 248, 0.1)", // Translucent Indigo
      subtext: "Lifetime views",
    },
    {
      label: "Watch Hours",
      value: fmtInt(safeKpis.watchHours || 0),
      icon: Clock,
      color: "#818cf8", // Indigo-400
      bg: "rgba(129, 140, 248, 0.1)",
      subtext: "Total consumption",
    },
    {
      label: "Subscribers",
      value: fmtInt(safeKpis.subscribers || 0),
      icon: Users,
      color: "#818cf8", // Indigo-400
      bg: "rgba(129, 140, 248, 0.1)",
      subtext: "Net gained",
    },
    {
      label: "Avg Retention",
      value: fmtPct(safeKpis.avgRetention || 0, 1),
      icon: BarChart3,
      color: "#34d399", // Emerald-400 (Brighter)
      bg: "rgba(52, 211, 153, 0.1)", // Translucent Emerald
      subtext: "Weighted avg",
    },
    {
      label: "Avg CTR",
      value: fmtPct(safeKpis.avgCtr || 0, 1),
      icon: MousePointerClick,
      color: "#fbbf24", // Amber-400 (Brighter)
      bg: "rgba(251, 191, 36, 0.1)", // Translucent Amber
      subtext: "Click-through rate",
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
      borderRadius: "12px",
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
    iconBox: (color, bg) => ({
      width: "40px",
      height: "40px",
      borderRadius: "8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: color,
      backgroundColor: bg,
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
      fontSize: "28px",
      fontWeight: "700",
      color: "#f8fafc", // Slate-50 (Bright White Text)
      lineHeight: "1",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "-0.02em",
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
        const Icon = item.icon;
        return (
          <div key={i} style={s.card}>
            <div style={s.header}>
              <div style={s.iconBox(item.color, item.bg)}>
                <Icon size={20} strokeWidth={2} />
              </div>
            </div>
            
            <div>
              <div style={s.label}>{item.label}</div>
              <div style={s.value}>{item.value}</div>
              <div style={s.subtext}>{item.subtext}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}