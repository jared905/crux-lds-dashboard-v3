import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// Helper to create date keys (YYYY-MM-DD)
function toDayKey(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtCompact(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export default function ViewsChart({
  title = "Daily Trend",
  totalsSeries = null, 
  rows = [],           
}) {
  const [metric, setMetric] = useState("views");

  // --- DATA ENGINE ---
  const { data, debugInfo } = useMemo(() => {
    let pts = [];
    let debug = null;

    // SCENARIO A: Pre-calculated series (Network View)
    if (totalsSeries?.points?.length) {
      pts = totalsSeries.points
        .map(p => ({ day: toDayKey(p.date), value: Number(p.value) }))
        .filter(p => p.day && Number.isFinite(p.value));
    } 
    // SCENARIO B: Drill-Down (Calculate from Rows)
    else if (rows && rows.length > 0) {
      const map = new Map();
      
      rows.forEach(r => {
        // BRUTE FORCE DATE FINDER
        // We check every possible column name for a date
        const dateStr = 
          r.publishDate || 
          r.publishTime || 
          r['Video publish time'] || 
          r['Publish date'] || 
          r['Date'] ||          // Common in simple CSVs
          r['date'] || 
          r['Time'] ||          // Common in YouTube Exports
          r['time'] || 
          r['Upload date'] ||
          r['upload_date'] ||
          r['created_at'];

        const day = toDayKey(dateStr);
        
        if (day) {
          let v = 0;
          if (metric === "views") v = Number(r.views || r['Views'] || r['watch_time_minutes'] || 0); // fallback keys
          if (metric === "watchHours") v = Number(r.watchHours || r['Watch time (hours)'] || 0);
          if (metric === "subscribers") v = Number(r.subscribers || r['Subscribers'] || 0);

          if (Number.isFinite(v)) {
            map.set(day, (map.get(day) || 0) + v);
          }
        }
      });
      
      pts = Array.from(map.entries()).map(([day, value]) => ({ day, value }));

      // If we failed to find points, save debug info
      if (pts.length === 0 && rows.length > 0) {
        debug = {
          rowCount: rows.length,
          firstRowKeys: Object.keys(rows[0] || {}).join(", ")
        };
      }
    }

    // Sort chronologically
    pts.sort((a, b) => a.day.localeCompare(b.day));
    
    return { data: pts, debugInfo: debug };
  }, [totalsSeries, rows, metric]);

  const hasData = data?.length >= 2;

  // --- MIDNIGHT THEME COLORS ---
  const colors = {
    bg: "#1e293b",       // Slate-800
    border: "#334155",   // Slate-700
    line: "#818cf8",     // Indigo-400
    gradStart: "#6366f1",// Indigo-500
    gradEnd: "#1e293b",  // Fade to Slate-800
    text: "#94a3b8",     // Slate-400
    grid: "#334155",     // Slate-700
    tooltip: "#0f172a",  // Slate-900
  };

  const s = {
    card: {
      backgroundColor: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: "12px",
      padding: "24px",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
      display: "flex",
      flexDirection: "column",
      minHeight: "360px",
      height: "100%" 
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "20px",
    },
    title: {
      fontSize: "18px",
      fontWeight: "700",
      color: "#f8fafc",
      letterSpacing: "-0.01em",
    },
    controls: {
      display: "flex",
      gap: "12px",
      alignItems: "center",
    },
    select: {
      backgroundColor: "#0f172a",
      color: "#cbd5e1", 
      border: `1px solid ${colors.border}`,
      borderRadius: "6px",
      padding: "6px 12px",
      fontSize: "13px",
      outline: "none",
      cursor: "pointer",
    },
    label: {
      fontSize: "13px",
      color: colors.text,
      fontWeight: "500",
    },
    emptyState: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      color: colors.text,
      fontSize: "14px",
      textAlign: "center",
      gap: "12px"
    },
    debugBox: {
      marginTop: "12px",
      padding: "12px",
      backgroundColor: "rgba(239, 68, 68, 0.1)", // Red tint
      border: "1px solid rgba(239, 68, 68, 0.2)",
      borderRadius: "8px",
      color: "#fca5a5",
      fontSize: "12px",
      fontFamily: "monospace",
      maxWidth: "90%",
      wordBreak: "break-all"
    }
  };

  return (
    <div style={s.card}>
      <div style={s.header}>
        <div style={s.title}>{title}</div>
        
        <div style={s.controls}>
          <span style={s.label}>Metric:</span>
          <select
            style={s.select}
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            <option value="views">Views</option>
            <option value="watchHours">Watch Hours</option>
            <option value="subscribers">Subscribers</option>
          </select>
        </div>
      </div>

      {!hasData ? (
        <div style={s.emptyState}>
          <div>No trend data available for this selection.</div>
          
          {/* VISIBLE DEBUGGER: Tells us why the chart is broken */}
          {debugInfo && (
            <div style={s.debugBox}>
              <strong>DEBUG:</strong> Found {debugInfo.rowCount} rows but 0 valid dates.<br/>
              <strong>Available Keys:</strong> {debugInfo.firstRowKeys}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, width: "100%", minHeight: "260px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.gradStart} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={colors.gradEnd} stopOpacity={0} />
                </linearGradient>
              </defs>
              
              <CartesianGrid 
                strokeDasharray="3 3" 
                vertical={false} 
                stroke={colors.grid} 
              />
              
              <XAxis 
                dataKey="day" 
                tick={{ fontSize: 11, fill: colors.text }} 
                axisLine={false}
                tickLine={false}
                minTickGap={30}
                tickFormatter={(val) => {
                  const parts = val.split("-");
                  return `${Number(parts[1])}/${Number(parts[2])}`;
                }}
                dy={10}
              />
              
              <YAxis 
                tickFormatter={fmtCompact} 
                tick={{ fontSize: 11, fill: colors.text }} 
                axisLine={false}
                tickLine={false}
                width={40}
              />
              
              <Tooltip
                contentStyle={{ 
                  backgroundColor: colors.tooltip, 
                  border: `1px solid ${colors.border}`, 
                  borderRadius: "8px", 
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                  color: "#f8fafc"
                }}
                itemStyle={{ color: colors.line }}
                formatter={(v) => [fmtCompact(v), metric === 'watchHours' ? 'Hours' : metric === 'subscribers' ? 'Subs' : 'Views']}
                labelFormatter={(l) => {
                  const parts = l.split("-");
                  return `${Number(parts[1])}/${Number(parts[2])}/${parts[0]}`;
                }}
                labelStyle={{ color: colors.text, marginBottom: "4px" }}
                cursor={{ stroke: colors.border, strokeWidth: 1 }}
              />
              
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={colors.line} 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorMetric)" 
                activeDot={{ r: 5, strokeWidth: 0, fill: "#f8fafc" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}