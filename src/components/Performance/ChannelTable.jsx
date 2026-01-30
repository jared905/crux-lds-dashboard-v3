import React, { useMemo, useState } from "react";
import { 
  ArrowUpDown, ArrowUp, ArrowDown, 
  Smartphone, MonitorPlay 
} from "lucide-react";
import { fmtInt, fmtPct } from "../../lib/utils";

export default function ChannelTable({ rows, onSelect }) {
  const [sortCol, setSortCol] = useState("views");
  const [sortDesc, setSortDesc] = useState(true);

  // --- 1. Data Processing ---
  const channelStats = useMemo(() => {
    if (!Array.isArray(rows)) return [];

    const groups = {};

    rows.forEach((r) => {
      const key = r.leader || r.channel || "Unknown";
      
      if (!groups[key]) {
        groups[key] = {
          name: key,
          views: 0,
          shorts: 0,
          longs: 0,
          total: 0,
          ctrSum: 0,
          retSum: 0,
          videosWithMetrics: 0
        };
      }

      const g = groups[key];
      
      const views = Number(r.views || 0);
      g.views += views;
      g.total += 1;

      // Type Logic (Consistent with App.js)
      const type = String(r.type || "").toLowerCase();
      // If duration logic was handled upstream, we just trust the type here
      if (type === "short") {
        g.shorts += 1;
      } else {
        g.longs += 1; 
      }
      
      const ctr = Number(r.ctr || 0);
      const ret = Number(r.avgViewPct || 0);

      if (ctr > 0 || ret > 0) {
        g.ctrSum += ctr;
        g.retSum += ret;
        g.videosWithMetrics += 1;
      }
    });

    return Object.values(groups).map(g => ({
      name: g.name,
      views: g.views,
      shorts: g.shorts,
      longs: g.longs,
      total: g.total,
      avgCtr: g.videosWithMetrics ? g.ctrSum / g.videosWithMetrics : 0,
      avgRet: g.videosWithMetrics ? g.retSum / g.videosWithMetrics : 0
    }));
  }, [rows]);

  // --- 2. Sorting ---
  const sorted = useMemo(() => {
    return [...channelStats].sort((a, b) => {
      const vA = a[sortCol];
      const vB = b[sortCol];
      return sortDesc ? (vB - vA) : (vA - vB);
    });
  }, [channelStats, sortCol, sortDesc]);

  const maxViews = Math.max(...channelStats.map(c => c.views), 1);

  const handleSort = (col) => {
    if (sortCol === col) setSortDesc(!sortDesc);
    else {
      setSortCol(col);
      setSortDesc(true);
    }
  };

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ArrowUpDown size={14} style={{ opacity: 0.3, marginLeft: 6, verticalAlign: 'middle' }} />;
    return sortDesc 
      ? <ArrowDown size={14} style={{ marginLeft: 6, color: "#f8fafc", verticalAlign: 'middle' }}/> 
      : <ArrowUp size={14} style={{ marginLeft: 6, color: "#f8fafc", verticalAlign: 'middle' }}/>;
  };

  // --- 3. Styles (Midnight Theme) ---
  const s = {
    card: {
      backgroundColor: "#1e293b",
      border: "1px solid #334155",
      borderRadius: "12px",
      overflow: "hidden",
      marginTop: "24px",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)"
    },
    header: {
      padding: "24px",
      borderBottom: "1px solid #334155",
      backgroundColor: "#1e293b",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    },
    title: { 
      fontSize: "18px", fontWeight: "700", color: "#f8fafc", letterSpacing: "-0.01em"
    },
    subtitle: { 
      fontSize: "13px", color: "#94a3b8", marginTop: "4px" 
    }, 
    table: { 
      width: "100%", borderCollapse: "collapse", fontSize: "14px" 
    },
    th: {
      textAlign: "right",
      padding: "16px 24px",
      borderBottom: "1px solid #334155",
      color: "#94a3b8",
      fontWeight: "700",
      fontSize: "11px",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      cursor: "pointer",
      userSelect: "none",
      backgroundColor: "#1e293b"
    },
    thLeft: { textAlign: "left", paddingLeft: "24px" },
    tr: { 
      transition: "background-color 0.1s ease",
      cursor: "pointer" // ✅ Indicates clickability
    },
    td: {
      textAlign: "right",
      padding: "16px 24px",
      borderBottom: "1px solid #334155",
      color: "#cbd5e1", 
      fontWeight: "500",
      fontVariantNumeric: "tabular-nums",
      verticalAlign: "middle",
    },
    tdLeft: {
      textAlign: "left",
      paddingLeft: "24px",
      fontWeight: "600",
      color: "#f8fafc",
      display: "flex", alignItems: "center", gap: "12px"
    },
    avatar: {
      width: "32px", height: "32px", borderRadius: "8px",
      backgroundColor: "rgba(99, 102, 241, 0.1)", color: "#818cf8",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "12px", fontWeight: "700",
      border: "1px solid rgba(99, 102, 241, 0.2)",
      flexShrink: 0
    },
    uploadsCell: {
      display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "12px"
    },
    totalCount: {
      fontSize: "14px", fontWeight: "700", color: "#f8fafc",
      minWidth: "24px", textAlign: "right"
    },
    badgeContainer: {
      display: "flex", gap: "6px"
    },
    badge: (isShort) => ({
      display: "flex", alignItems: "center", gap: "4px",
      padding: "3px 6px", borderRadius: "4px",
      fontSize: "10px", fontWeight: "600",
      backgroundColor: isShort ? "rgba(245, 158, 11, 0.1)" : "rgba(59, 130, 246, 0.1)",
      color: isShort ? "#fbbf24" : "#60a5fa",
      border: isShort ? "1px solid rgba(245, 158, 11, 0.15)" : "1px solid rgba(59, 130, 246, 0.15)",
    }),
    barContainer: {
      height: "4px", width: "100%", backgroundColor: "#334155",
      borderRadius: "2px", marginTop: "6px", maxWidth: "100px",
      marginLeft: "auto", overflow: "hidden"
    },
    barFill: (pct) => ({
      height: "100%", width: `${pct}%`, backgroundColor: "#6366f1", borderRadius: "2px"
    })
  };

  if (channelStats.length === 0) return null;

  return (
    <div style={s.card}>
      <div style={s.header}>
        <div>
          <div style={s.title}>Channel Leaderboard</div>
          <div style={s.subtitle}>Click a row to filter dashboard by leader</div>
        </div>
      </div>
      
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{...s.th, ...s.thLeft}} onClick={() => handleSort("name")}>
              Leader <SortIcon col="name"/>
            </th>
            <th style={s.th} onClick={() => handleSort("total")}>
              Uploads <SortIcon col="total"/>
            </th>
            <th style={s.th} onClick={() => handleSort("views")}>
              Views <SortIcon col="views"/>
            </th>
            <th style={s.th} onClick={() => handleSort("avgCtr")}>
              Avg CTR <SortIcon col="avgCtr"/>
            </th>
            <th style={s.th} onClick={() => handleSort("avgRet")}>
              Retention <SortIcon col="avgRet"/>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, idx) => {
            const initials = c.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
            const viewPct = Math.max(2, (c.views / maxViews) * 100);
            
            const ctrColor = c.avgCtr > 0.06 ? "#fbbf24" : "#94a3b8"; 
            const retColor = c.avgRet > 0.60 ? "#34d399" : "#94a3b8"; 

            return (
              <tr 
                key={c.name} 
                style={s.tr}
                onClick={() => onSelect && onSelect(c.name)} // ✅ Trigger Filter
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#334155"} 
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <td style={s.tdLeft}>
                  <div style={s.avatar}>{initials}</div>
                  {c.name}
                </td>

                <td style={s.td}>
                  <div style={s.uploadsCell}>
                    <div style={s.totalCount}>{c.total}</div>
                    <div style={s.badgeContainer}>
                      {c.longs > 0 && (
                        <div style={s.badge(false)} title="Long Form">
                          <MonitorPlay size={10} strokeWidth={2.5} /> {c.longs}
                        </div>
                      )}
                      {c.shorts > 0 && (
                        <div style={s.badge(true)} title="Shorts">
                          <Smartphone size={10} strokeWidth={2.5} /> {c.shorts}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                <td style={{...s.td, color:"#f8fafc", fontWeight: 700}}>
                  {fmtInt(c.views)}
                  <div style={s.barContainer}>
                    <div style={s.barFill(viewPct)} />
                  </div>
                </td>

                <td style={{...s.td, color: ctrColor}}>
                  {fmtPct(c.avgCtr, 1)}
                </td>

                <td style={{...s.td, color: retColor}}>
                  {fmtPct(c.avgRet, 1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}