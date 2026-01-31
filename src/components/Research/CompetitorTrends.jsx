import React, { useState, useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
} from "recharts";
import { TrendingUp, ArrowUp, ArrowDown, ChevronDown, Check, Loader } from "lucide-react";

// ─── Aggregate snapshots by category (pure transform, no DB) ─────────────────

function aggregateSnapshotsByCategory(bulkSnapshots, channelCategoryMap) {
  const byCatDate = {};
  Object.entries(bulkSnapshots).forEach(([channelId, snapshots]) => {
    const category = channelCategoryMap[channelId] || "unknown";
    if (!byCatDate[category]) byCatDate[category] = {};
    snapshots.forEach((snap) => {
      const date = snap.snapshot_date;
      if (!byCatDate[category][date]) {
        byCatDate[category][date] = { totalSubs: 0, totalViews: 0, count: 0 };
      }
      byCatDate[category][date].totalSubs += snap.subscriber_count || 0;
      byCatDate[category][date].totalViews += snap.total_view_count || 0;
      byCatDate[category][date].count++;
    });
  });
  return byCatDate;
}

// ─── Shared formatting helpers ───────────────────────────────────────────────

const fmtCompact = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "--";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
};

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

const formatDateAxis = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatTooltipDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

// ─── Chart theme ─────────────────────────────────────────────────────────────

const CT = {
  bg: "#1E1E1E",
  cardBorder: "1px solid #333",
  cardRadius: "12px",
  grid: "#333",
  axis: "#9E9E9E",
  tooltipBg: "#1E1E1E",
  tooltipBorder: "#333",
  textPrimary: "#fff",
  textSecondary: "#9E9E9E",
  textMuted: "#666",
  yourColor: "#3b82f6",
  yourWidth: 3,
  compWidth: 1.5,
};

const tooltipStyle = {
  backgroundColor: CT.tooltipBg,
  border: `1px solid ${CT.tooltipBorder}`,
  borderRadius: "8px",
  color: CT.textPrimary,
  fontSize: "12px",
};

// ─── Main component ──────────────────────────────────────────────────────────

export default function CompetitorTrends({
  activeCompetitors,
  selectedCategory,
  CATEGORY_CONFIG,
  timeRange,
  onTimeRangeChange,
  snapshotData,
  snapshotLoading,
  yourChannelId,
}) {
  const [hiddenLines, setHiddenLines] = useState({});
  const [headToHeadSelection, setHeadToHeadSelection] = useState([]);
  const [activeChartTab, setActiveChartTab] = useState("subscribers");
  const [h2hDropdownOpen, setH2hDropdownOpen] = useState(false);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const filteredCompetitors = useMemo(() => {
    if (!selectedCategory) return activeCompetitors;
    return activeCompetitors.filter((c) => c.category === selectedCategory);
  }, [activeCompetitors, selectedCategory]);

  // Map supabaseId → competitor for lookup
  const compBySupabaseId = useMemo(() => {
    const map = {};
    activeCompetitors.forEach((c) => {
      if (c.supabaseId) map[c.supabaseId] = c;
    });
    return map;
  }, [activeCompetitors]);

  // Name map for tooltips
  const nameMap = useMemo(() => {
    const map = {};
    activeCompetitors.forEach((c) => {
      map[c.supabaseId] = c.name;
      map[c.id] = c.name;
    });
    return map;
  }, [activeCompetitors]);

  // Channel category map for aggregation
  const channelCategoryMap = useMemo(() => {
    const map = {};
    activeCompetitors.forEach((c) => {
      if (c.supabaseId) map[c.supabaseId] = c.category;
    });
    return map;
  }, [activeCompetitors]);

  // ─── Chart data transforms ─────────────────────────────────────────────────

  // All unique sorted dates across all snapshots
  const allDates = useMemo(() => {
    const dates = new Set();
    Object.values(snapshotData).forEach((snaps) =>
      snaps.forEach((s) => dates.add(s.snapshot_date))
    );
    return [...dates].sort();
  }, [snapshotData]);

  // Subscriber growth chart data
  const subscriberChartData = useMemo(() => {
    const filtered = filteredCompetitors.filter((c) => c.supabaseId && snapshotData[c.supabaseId]);
    if (filtered.length === 0 || allDates.length === 0) return [];

    return allDates.map((date) => {
      const point = { date };
      filtered.forEach((comp) => {
        const snaps = snapshotData[comp.supabaseId] || [];
        const snap = snaps.find((s) => s.snapshot_date === date);
        if (snap) point[comp.supabaseId] = snap.subscriber_count;
      });
      return point;
    });
  }, [snapshotData, filteredCompetitors, allDates]);

  // Engagement trend chart data
  const engagementChartData = useMemo(() => {
    const filtered = filteredCompetitors.filter((c) => c.supabaseId && snapshotData[c.supabaseId]);
    if (filtered.length === 0 || allDates.length === 0) return [];

    return allDates.map((date) => {
      const point = { date };
      filtered.forEach((comp) => {
        const snaps = snapshotData[comp.supabaseId] || [];
        const snap = snaps.find((s) => s.snapshot_date === date);
        if (snap && snap.avg_engagement_rate != null) {
          point[comp.supabaseId] = snap.avg_engagement_rate;
        }
      });
      return point;
    });
  }, [snapshotData, filteredCompetitors, allDates]);

  // Engagement percentile band
  const engagementBand = useMemo(() => {
    const allRates = [];
    engagementChartData.forEach((point) => {
      Object.entries(point).forEach(([key, val]) => {
        if (key !== "date" && val != null) allRates.push(val);
      });
    });
    if (allRates.length === 0) return { p25: 0, p75: 0 };
    allRates.sort((a, b) => a - b);
    return {
      p25: allRates[Math.floor(allRates.length * 0.25)] || 0,
      p75: allRates[Math.floor(allRates.length * 0.75)] || 0,
    };
  }, [engagementChartData]);

  // Content volume data (latest snapshot per competitor)
  const contentVolumeData = useMemo(() => {
    return filteredCompetitors
      .filter((c) => c.supabaseId && snapshotData[c.supabaseId])
      .map((comp) => {
        const snaps = snapshotData[comp.supabaseId] || [];
        const latest = snaps[snaps.length - 1];
        return {
          name: comp.name?.length > 15 ? comp.name.slice(0, 15) + "…" : comp.name,
          fullName: comp.name,
          shorts: latest?.shorts_count || 0,
          longs: latest?.longs_count || 0,
          total: (latest?.shorts_count || 0) + (latest?.longs_count || 0),
          category: comp.category,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [filteredCompetitors, snapshotData]);

  // KPI sparkline data
  const kpiData = useMemo(() => {
    // Aggregate across all filtered competitors
    if (allDates.length === 0) return { subs: [], views: [], engagement: [], volume: [] };

    const subs = [];
    const views = [];
    const engagement = [];
    const volume = [];

    allDates.forEach((date) => {
      let totalSubs = 0, totalViews = 0, engSum = 0, engCount = 0, totalVids = 0;
      filteredCompetitors.forEach((comp) => {
        const snaps = snapshotData[comp.supabaseId] || [];
        const snap = snaps.find((s) => s.snapshot_date === date);
        if (snap) {
          totalSubs += snap.subscriber_count || 0;
          totalViews += snap.total_view_count || 0;
          totalVids += snap.video_count || 0;
          if (snap.avg_engagement_rate != null) {
            engSum += snap.avg_engagement_rate;
            engCount++;
          }
        }
      });
      subs.push({ date, value: totalSubs });
      views.push({ date, value: totalViews });
      engagement.push({ date, value: engCount > 0 ? engSum / engCount : 0 });
      volume.push({ date, value: totalVids });
    });

    return { subs, views, engagement, volume };
  }, [filteredCompetitors, snapshotData, allDates]);

  // Category trends data
  const categoryTrendData = useMemo(() => {
    if (Object.keys(snapshotData).length === 0) return [];
    const aggregated = aggregateSnapshotsByCategory(snapshotData, channelCategoryMap);

    const catDates = new Set();
    Object.values(aggregated).forEach((catData) => {
      Object.keys(catData).forEach((d) => catDates.add(d));
    });
    const sortedDates = [...catDates].sort();

    return sortedDates.map((date) => {
      const point = { date };
      Object.entries(aggregated).forEach(([cat, catData]) => {
        if (catData[date]) point[cat] = catData[date].totalSubs;
      });
      return point;
    });
  }, [snapshotData, channelCategoryMap]);

  // Head-to-head data
  const h2hChartData = useMemo(() => {
    if (headToHeadSelection.length < 2 || allDates.length === 0) return [];
    const selected = headToHeadSelection
      .map((id) => activeCompetitors.find((c) => c.supabaseId === id))
      .filter(Boolean);

    return allDates.map((date) => {
      const point = { date };
      selected.forEach((comp) => {
        const snaps = snapshotData[comp.supabaseId] || [];
        const snap = snaps.find((s) => s.snapshot_date === date);
        if (snap) {
          point[comp.supabaseId + "_subs"] = snap.subscriber_count;
          point[comp.supabaseId + "_views"] = snap.total_view_count;
          point[comp.supabaseId + "_vids"] = snap.video_count;
        }
      });
      return point;
    });
  }, [headToHeadSelection, snapshotData, activeCompetitors, allDates]);

  // Radar chart data (normalized 0-100)
  const radarData = useMemo(() => {
    if (headToHeadSelection.length < 2) return [];
    const selected = headToHeadSelection
      .map((id) => activeCompetitors.find((c) => c.supabaseId === id))
      .filter(Boolean);

    // Get latest snapshot for each
    const latestSnaps = {};
    selected.forEach((comp) => {
      const snaps = snapshotData[comp.supabaseId] || [];
      if (snaps.length > 0) latestSnaps[comp.supabaseId] = snaps[snaps.length - 1];
    });

    // Calculate growth rate from first to last snapshot
    const growthRates = {};
    selected.forEach((comp) => {
      const snaps = snapshotData[comp.supabaseId] || [];
      if (snaps.length >= 2) {
        const first = snaps[0].subscriber_count || 1;
        const last = snaps[snaps.length - 1].subscriber_count || 0;
        growthRates[comp.supabaseId] = ((last - first) / first) * 100;
      } else {
        growthRates[comp.supabaseId] = 0;
      }
    });

    const metrics = [
      { key: "Subscribers", getter: (s) => s?.subscriber_count || 0 },
      { key: "Engagement", getter: (s) => (s?.avg_engagement_rate || 0) * 100 },
      { key: "Frequency", getter: (s) => s?.video_count || 0 },
      { key: "Content Mix", getter: (s) => {
        const total = (s?.shorts_count || 0) + (s?.longs_count || 0);
        return total > 0 ? ((s?.shorts_count || 0) / total) * 100 : 50;
      }},
      { key: "Growth", getter: (_, id) => growthRates[id] || 0 },
    ];

    return metrics.map((m) => {
      const row = { metric: m.key };
      const values = selected.map((c) => m.getter(latestSnaps[c.supabaseId], c.supabaseId));
      const maxVal = Math.max(...values, 1);
      selected.forEach((comp, i) => {
        row[comp.supabaseId] = Math.round((values[i] / maxVal) * 100);
      });
      return row;
    });
  }, [headToHeadSelection, snapshotData, activeCompetitors]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const toggleLine = useCallback((key) => {
    setHiddenLines((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleH2hSelection = useCallback((supabaseId) => {
    setHeadToHeadSelection((prev) => {
      if (prev.includes(supabaseId)) return prev.filter((id) => id !== supabaseId);
      if (prev.length >= 4) return prev;
      return [...prev, supabaseId];
    });
  }, []);

  // ─── Helper: trend percent ─────────────────────────────────────────────────

  const trendPercent = (arr) => {
    if (!arr || arr.length < 2) return null;
    const first = arr[0]?.value;
    const last = arr[arr.length - 1]?.value;
    if (!first || first === 0) return null;
    return ((last - first) / first) * 100;
  };

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (snapshotLoading) {
    return (
      <div style={{ background: CT.bg, border: CT.cardBorder, borderRadius: CT.cardRadius, padding: "64px 24px", textAlign: "center", marginBottom: "16px" }}>
        <Loader size={32} style={{ color: "#555", margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
        <div style={{ fontSize: "14px", color: "#888" }}>Loading trend data...</div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const hasData = allDates.length >= 2;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "16px" }}>

      {/* Time Range Selector */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>
          Competitor Trends
          <span style={{ fontSize: "12px", fontWeight: "400", color: "#888", marginLeft: "8px" }}>
            {filteredCompetitors.length} channels
          </span>
        </div>
        <div style={{ display: "flex", gap: "2px" }}>
          {[
            { label: "7d", value: 7 },
            { label: "30d", value: 30 },
            { label: "90d", value: 90 },
            { label: "All", value: 0 },
          ].map((opt, i, arr) => (
            <button
              key={opt.value}
              onClick={() => onTimeRangeChange(opt.value)}
              style={{
                padding: "5px 12px",
                fontSize: "11px",
                fontWeight: "600",
                border: `1px solid ${timeRange === opt.value ? "#3b82f6" : "#444"}`,
                borderLeft: i > 0 ? "none" : undefined,
                borderRadius:
                  i === 0 ? "6px 0 0 6px" : i === arr.length - 1 ? "0 6px 6px 0" : "0",
                background: timeRange === opt.value ? "rgba(59,130,246,0.15)" : "transparent",
                color: timeRange === opt.value ? "#3b82f6" : "#888",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── ROW 1: KPI Sparkline Cards ─────────────────────────────────────── */}
      <KPISparklineStrip kpiData={kpiData} hasData={hasData} trendPercent={trendPercent} />

      {/* ─── ROW 2: Subscriber Growth Chart ─────────────────────────────────── */}
      <ChartCard title="Subscriber Growth" hasData={hasData}>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={subscriberChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CT.grid} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: CT.axis }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatDateAxis}
            />
            <YAxis
              tickFormatter={fmtCompact}
              tick={{ fontSize: 11, fill: CT.axis }}
              axisLine={false}
              tickLine={false}
              width={55}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [fmtCompact(value), nameMap[name] || name]}
              labelFormatter={formatTooltipDate}
            />
            <Legend
              onClick={(e) => toggleLine(e.dataKey)}
              wrapperStyle={{ cursor: "pointer", fontSize: "11px", paddingTop: "8px" }}
              formatter={(value, entry) => (
                <span style={{ color: hiddenLines[entry.dataKey] ? "#555" : entry.color, textDecoration: hiddenLines[entry.dataKey] ? "line-through" : "none" }}>
                  {nameMap[entry.dataKey] || value}
                </span>
              )}
            />
            {filteredCompetitors
              .filter((c) => c.supabaseId)
              .map((comp) => {
                const catCfg = CATEGORY_CONFIG[comp.category] || {};
                const isYours = comp.id === yourChannelId;
                return (
                  <Line
                    key={comp.supabaseId}
                    dataKey={comp.supabaseId}
                    name={comp.supabaseId}
                    stroke={isYours ? CT.yourColor : catCfg.color || "#666"}
                    strokeWidth={isYours ? CT.yourWidth : CT.compWidth}
                    dot={false}
                    connectNulls
                    hide={hiddenLines[comp.supabaseId]}
                  />
                );
              })}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ─── ROW 3: Content Volume + Engagement Trend ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {/* Content Volume */}
        <ChartCard title="Content Volume" hasData={contentVolumeData.length > 0}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={contentVolumeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CT.grid} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: CT.axis }}
                axisLine={false}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 11, fill: CT.axis }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [fmtInt(value), name]}
                labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="shorts" stackId="a" fill="#818cf8" name="Shorts" />
              <Bar dataKey="longs" stackId="a" fill="#4f46e5" name="Long-form" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Engagement Trend */}
        <ChartCard title="Engagement Trend" hasData={hasData}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={engagementChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CT.grid} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: CT.axis }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatDateAxis}
              />
              <YAxis
                tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                tick={{ fontSize: 11, fill: CT.axis }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              {engagementBand.p25 !== engagementBand.p75 && (
                <ReferenceArea
                  y1={engagementBand.p25}
                  y2={engagementBand.p75}
                  fill="#10b981"
                  fillOpacity={0.08}
                  label={{ value: "Healthy range", fill: "#10b981", fontSize: 10, position: "insideTopRight" }}
                />
              )}
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [`${(value * 100).toFixed(2)}%`, nameMap[name] || name]}
                labelFormatter={formatTooltipDate}
              />
              {filteredCompetitors
                .filter((c) => c.supabaseId)
                .map((comp) => {
                  const catCfg = CATEGORY_CONFIG[comp.category] || {};
                  return (
                    <Line
                      key={comp.supabaseId}
                      dataKey={comp.supabaseId}
                      stroke={catCfg.color || "#666"}
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                    />
                  );
                })}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ─── ROW 4: Head-to-Head Comparison ─────────────────────────────────── */}
      <ChartCard title="Head-to-Head Comparison" hasData={true} noPad>
        <div style={{ padding: "16px 20px 0" }}>
          {/* Multi-select dropdown */}
          <div style={{ position: "relative", marginBottom: "16px" }}>
            <button
              onClick={() => setH2hDropdownOpen(!h2hDropdownOpen)}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "8px 14px", background: "#252525", border: "1px solid #444",
                borderRadius: "8px", color: "#fff", fontSize: "12px", cursor: "pointer",
                minWidth: "220px",
              }}
            >
              {headToHeadSelection.length === 0
                ? "Select 2-4 competitors..."
                : `${headToHeadSelection.length} selected`}
              <ChevronDown size={12} style={{ marginLeft: "auto" }} />
            </button>
            {h2hDropdownOpen && (
              <div style={{
                position: "absolute", top: "100%", left: 0, zIndex: 50,
                background: "#252525", border: "1px solid #444", borderRadius: "8px",
                marginTop: "4px", maxHeight: "240px", overflowY: "auto", minWidth: "280px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              }}>
                {filteredCompetitors.filter(c => c.supabaseId).map((comp) => {
                  const selected = headToHeadSelection.includes(comp.supabaseId);
                  const catCfg = CATEGORY_CONFIG[comp.category] || {};
                  return (
                    <div
                      key={comp.supabaseId}
                      onClick={() => toggleH2hSelection(comp.supabaseId)}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "8px 12px", cursor: "pointer",
                        background: selected ? "rgba(59,130,246,0.1)" : "transparent",
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = selected ? "rgba(59,130,246,0.15)" : "#2a2a2a")}
                      onMouseOut={(e) => (e.currentTarget.style.background = selected ? "rgba(59,130,246,0.1)" : "transparent")}
                    >
                      <div style={{
                        width: "16px", height: "16px", borderRadius: "4px",
                        border: `1px solid ${selected ? "#3b82f6" : "#555"}`,
                        background: selected ? "#3b82f6" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {selected && <Check size={10} color="#fff" />}
                      </div>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: catCfg.color || "#666", flexShrink: 0 }} />
                      <span style={{ fontSize: "12px", color: "#fff" }}>{comp.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {headToHeadSelection.length < 2 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#666", fontSize: "13px" }}>
              Select at least 2 competitors to compare
            </div>
          )}
        </div>

        {headToHeadSelection.length >= 2 && (
          <div>
            {/* Metric tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #333", padding: "0 20px" }}>
              {[
                { key: "subscribers", label: "Subscribers" },
                { key: "views", label: "Total Views" },
                { key: "videos", label: "Video Count" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveChartTab(tab.key)}
                  style={{
                    padding: "10px 16px", background: "transparent", border: "none",
                    borderBottom: activeChartTab === tab.key ? "2px solid #3b82f6" : "2px solid transparent",
                    color: activeChartTab === tab.key ? "#fff" : "#888",
                    fontSize: "12px", fontWeight: "600", cursor: "pointer",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Overlaid line chart */}
            <div style={{ padding: "16px 20px" }}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={h2hChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CT.grid} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: CT.axis }} axisLine={false} tickLine={false} tickFormatter={formatDateAxis} />
                  <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: CT.axis }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={formatTooltipDate}
                    formatter={(value, name) => {
                      const id = name.replace(/_subs$|_views$|_vids$/, "");
                      return [fmtCompact(value), nameMap[id] || name];
                    }}
                  />
                  <Legend formatter={(value) => {
                    const id = value.replace(/_subs$|_views$|_vids$/, "");
                    return nameMap[id] || value;
                  }} />
                  {headToHeadSelection.map((supabaseId) => {
                    const comp = compBySupabaseId[supabaseId];
                    const catCfg = comp ? CATEGORY_CONFIG[comp.category] || {} : {};
                    const suffix = activeChartTab === "subscribers" ? "_subs" : activeChartTab === "views" ? "_views" : "_vids";
                    return (
                      <Line
                        key={supabaseId}
                        dataKey={supabaseId + suffix}
                        name={supabaseId + suffix}
                        stroke={catCfg.color || "#666"}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Radar chart */}
            {radarData.length > 0 && (
              <div style={{ padding: "0 20px 20px" }}>
                <div style={{ fontSize: "12px", fontWeight: "600", color: "#999", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Relative Strengths
                </div>
                <ResponsiveContainer width="100%" height={350}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#333" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: CT.axis }} />
                    <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                    {headToHeadSelection.map((supabaseId) => {
                      const comp = compBySupabaseId[supabaseId];
                      const catCfg = comp ? CATEGORY_CONFIG[comp.category] || {} : {};
                      return (
                        <Radar
                          key={supabaseId}
                          name={comp?.name || supabaseId}
                          dataKey={supabaseId}
                          stroke={catCfg.color || "#666"}
                          fill={catCfg.color || "#666"}
                          fillOpacity={0.12}
                        />
                      );
                    })}
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </ChartCard>

      {/* ─── ROW 5: Category Trends ─────────────────────────────────────────── */}
      <ChartCard title="Category Trends" subtitle="Aggregated subscriber totals by category" hasData={categoryTrendData.length >= 2}>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={categoryTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CT.grid} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: CT.axis }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatDateAxis}
            />
            <YAxis
              tickFormatter={fmtCompact}
              tick={{ fontSize: 11, fill: CT.axis }}
              axisLine={false}
              tickLine={false}
              width={55}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [fmtCompact(value), CATEGORY_CONFIG[name]?.label || name]}
              labelFormatter={formatTooltipDate}
            />
            <Legend
              formatter={(value) => CATEGORY_CONFIG[value]?.label || value}
              wrapperStyle={{ fontSize: "11px" }}
            />
            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
              <Line
                key={key}
                dataKey={key}
                name={key}
                stroke={cfg.color}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, hasData, noPad, children }) {
  if (!hasData) {
    return (
      <div style={{
        background: CT.bg, border: CT.cardBorder, borderRadius: CT.cardRadius,
        padding: "48px 24px", textAlign: "center",
      }}>
        <TrendingUp size={32} style={{ color: "#333", margin: "0 auto 12px" }} />
        <div style={{ fontSize: "14px", color: "#888", marginBottom: "6px" }}>{title}</div>
        <div style={{ fontSize: "12px", color: "#666" }}>
          Not enough snapshot data yet. Trends appear after at least 2 syncs on different days.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: CT.bg, border: CT.cardBorder, borderRadius: CT.cardRadius,
      overflow: "hidden",
    }}>
      <div style={{ padding: noPad ? "16px 20px 0" : "16px 20px" }}>
        <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: subtitle ? "2px" : "12px" }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: "11px", color: "#666", marginBottom: "12px" }}>{subtitle}</div>
        )}
      </div>
      <div style={{ padding: noPad ? "0" : "0 20px 16px" }}>
        {children}
      </div>
    </div>
  );
}

function KPISparklineStrip({ kpiData, hasData, trendPercent }) {
  const cards = [
    { label: "Total Subscribers", data: kpiData.subs, color: "#3b82f6", fmt: fmtCompact },
    { label: "Total Views", data: kpiData.views, color: "#f59e0b", fmt: fmtCompact },
    { label: "Avg Engagement", data: kpiData.engagement, color: "#10b981", fmt: (v) => `${(v * 100).toFixed(2)}%` },
    { label: "Total Videos", data: kpiData.volume, color: "#8b5cf6", fmt: fmtCompact },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
      {cards.map((card) => {
        const latest = card.data?.[card.data.length - 1]?.value;
        const pct = trendPercent(card.data);

        return (
          <div
            key={card.label}
            style={{
              background: "#1E1E1E",
              border: "1px solid #333",
              borderRadius: "10px",
              padding: "16px",
              borderTop: `3px solid ${card.color}`,
            }}
          >
            <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600", marginBottom: "8px" }}>
              {card.label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#fff" }}>
                {latest != null ? card.fmt(latest) : "--"}
              </div>
              {pct != null && (
                <span style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "12px", fontWeight: "600", color: pct >= 0 ? "#10b981" : "#ef4444" }}>
                  {pct >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                  {Math.abs(pct).toFixed(1)}%
                </span>
              )}
            </div>
            {hasData && card.data?.length >= 2 && (
              <div style={{ height: 32, marginTop: 8 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={card.data}>
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={card.color}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
