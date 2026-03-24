import React, { useState, useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
} from "recharts";
import { TrendingUp, ChevronDown, Check, Loader } from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// Chart theme
const CT = {
  bg: "#1E1E1E",
  cardBorder: "1px solid #333",
  cardRadius: "12px",
  grid: "#333",
  axis: "#9E9E9E",
  tooltipBg: "#1E1E1E",
  tooltipBorder: "#333",
  textPrimary: "#fff",
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

// Cycling colors for categories without one set
const CHART_COLORS = [
  '#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f59e0b', '#6366f1', '#14b8a6',
  '#84cc16', '#a855f7', '#0ea5e9', '#f43f5e', '#22d3ee',
];

// ─── Build parent category hierarchy ────────────────────────────────────────

function buildCategoryHierarchy(categoryConfig) {
  const idToSlug = {};
  Object.entries(categoryConfig).forEach(([slug, cfg]) => {
    if (cfg.id) idToSlug[cfg.id] = slug;
  });

  const parentSlugs = new Set();
  const childToParent = {};

  Object.entries(categoryConfig).forEach(([slug, cfg]) => {
    if (cfg.parentId) {
      const parentSlug = idToSlug[cfg.parentId];
      if (parentSlug && parentSlug !== slug) {
        childToParent[slug] = parentSlug;
        parentSlugs.add(parentSlug);
      }
    }
  });

  // Parent categories = slugs that have children OR slugs with no parentId and no parent
  const parents = [];
  const childrenByParent = {};

  Object.entries(categoryConfig).forEach(([slug, cfg]) => {
    if (childToParent[slug]) {
      const ps = childToParent[slug];
      if (!childrenByParent[ps]) childrenByParent[ps] = [];
      childrenByParent[ps].push(slug);
    } else {
      parents.push(slug);
    }
  });

  return { parents, childrenByParent, childToParent };
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function CompetitorTrends({
  activeCompetitors,
  selectedCategory: _externalCategory, // kept for compat, we manage our own
  categoryConfig,
  timeRange,
  onTimeRangeChange,
  snapshotData,
  snapshotLoading,
  yourChannelId,
}) {
  // Category zoom state
  const [selectedParent, setSelectedParent] = useState(null);
  const [selectedSub, setSelectedSub] = useState(null);

  // Chart state
  const [hiddenLines, setHiddenLines] = useState({});
  const [headToHeadSelection, setHeadToHeadSelection] = useState([]);
  const [activeChartTab, setActiveChartTab] = useState("subscribers");
  const [h2hDropdownOpen, setH2hDropdownOpen] = useState(false);

  // Build hierarchy
  const hierarchy = useMemo(() => buildCategoryHierarchy(categoryConfig), [categoryConfig]);

  // Parent categories with channel counts
  const parentCategories = useMemo(() => {
    const counts = {};
    activeCompetitors.forEach(c => {
      const cat = c.category;
      const parent = hierarchy.childToParent[cat] || cat;
      counts[parent] = (counts[parent] || 0) + 1;
    });
    return hierarchy.parents
      .filter(slug => (counts[slug] || 0) > 0)
      .sort((a, b) => {
        const oa = categoryConfig[a]?.order ?? 999;
        const ob = categoryConfig[b]?.order ?? 999;
        return oa - ob;
      });
  }, [activeCompetitors, hierarchy, categoryConfig]);

  // Subcategories for selected parent
  const subcategories = useMemo(() => {
    if (!selectedParent) return [];
    const children = hierarchy.childrenByParent[selectedParent] || [];
    // Include parent itself if channels are directly assigned to it
    const slugs = [selectedParent, ...children];
    const counts = {};
    activeCompetitors.forEach(c => {
      if (slugs.includes(c.category)) {
        counts[c.category] = (counts[c.category] || 0) + 1;
      }
    });
    return slugs.filter(s => (counts[s] || 0) > 0);
  }, [selectedParent, hierarchy, activeCompetitors]);

  // Determine zoom level and filtered competitors
  const { zoomLevel, filteredCompetitors, chartLabel } = useMemo(() => {
    if (selectedSub) {
      // Level 3: individual channels in a subcategory
      const filtered = activeCompetitors.filter(c => c.category === selectedSub);
      const cfg = categoryConfig[selectedSub];
      return { zoomLevel: 'channels', filteredCompetitors: filtered, chartLabel: cfg?.label || selectedSub };
    }
    if (selectedParent) {
      // Level 2: subcategories within a parent
      const children = hierarchy.childrenByParent[selectedParent] || [];
      const slugs = new Set([selectedParent, ...children]);
      const filtered = activeCompetitors.filter(c => slugs.has(c.category));
      const cfg = categoryConfig[selectedParent];
      return { zoomLevel: 'subcategories', filteredCompetitors: filtered, chartLabel: cfg?.label || selectedParent };
    }
    // Level 1: all channels, aggregated by parent category
    return { zoomLevel: 'categories', filteredCompetitors: activeCompetitors, chartLabel: 'All Categories' };
  }, [selectedParent, selectedSub, activeCompetitors, categoryConfig, hierarchy]);

  // Map supabaseId → competitor
  const compBySupabaseId = useMemo(() => {
    const map = {};
    activeCompetitors.forEach(c => { if (c.supabaseId) map[c.supabaseId] = c; });
    return map;
  }, [activeCompetitors]);

  // Name map
  const nameMap = useMemo(() => {
    const map = {};
    activeCompetitors.forEach(c => {
      map[c.supabaseId] = c.name;
      map[c.id] = c.name;
    });
    // Add category names for aggregated mode
    Object.entries(categoryConfig).forEach(([slug, cfg]) => {
      map[slug] = cfg.label || slug;
    });
    return map;
  }, [activeCompetitors, categoryConfig]);

  // All dates
  const allDates = useMemo(() => {
    const dates = new Set();
    Object.values(snapshotData).forEach(snaps => snaps.forEach(s => dates.add(s.snapshot_date)));
    return [...dates].sort();
  }, [snapshotData]);

  // ─── Chart data by zoom level ─────────────────────────────────────────────

  const subscriberChartData = useMemo(() => {
    if (allDates.length === 0) return [];

    if (zoomLevel === 'categories') {
      // Aggregate by parent category
      return allDates.map(date => {
        const point = { date };
        parentCategories.forEach(parentSlug => {
          const children = hierarchy.childrenByParent[parentSlug] || [];
          const slugs = new Set([parentSlug, ...children]);
          let total = 0;
          activeCompetitors.forEach(c => {
            if (slugs.has(c.category) && c.supabaseId && snapshotData[c.supabaseId]) {
              const snap = snapshotData[c.supabaseId].find(s => s.snapshot_date === date);
              if (snap) total += snap.subscriber_count || 0;
            }
          });
          if (total > 0) point[parentSlug] = total;
        });
        return point;
      });
    }

    if (zoomLevel === 'subcategories') {
      // Aggregate by subcategory
      return allDates.map(date => {
        const point = { date };
        subcategories.forEach(subSlug => {
          let total = 0;
          activeCompetitors.forEach(c => {
            if (c.category === subSlug && c.supabaseId && snapshotData[c.supabaseId]) {
              const snap = snapshotData[c.supabaseId].find(s => s.snapshot_date === date);
              if (snap) total += snap.subscriber_count || 0;
            }
          });
          if (total > 0) point[subSlug] = total;
        });
        return point;
      });
    }

    // Channel level
    return allDates.map(date => {
      const point = { date };
      filteredCompetitors.forEach(comp => {
        const snaps = snapshotData[comp.supabaseId] || [];
        const snap = snaps.find(s => s.snapshot_date === date);
        if (snap) point[comp.supabaseId] = snap.subscriber_count;
      });
      return point;
    });
  }, [zoomLevel, allDates, snapshotData, parentCategories, subcategories, filteredCompetitors, activeCompetitors, hierarchy]);

  // Lines to render
  const chartLines = useMemo(() => {
    if (zoomLevel === 'categories') {
      return parentCategories.map((slug, i) => ({
        key: slug,
        color: categoryConfig[slug]?.color || CHART_COLORS[i % CHART_COLORS.length],
        width: 2,
        isYours: false,
      }));
    }
    if (zoomLevel === 'subcategories') {
      return subcategories.map((slug, i) => ({
        key: slug,
        color: categoryConfig[slug]?.color || CHART_COLORS[i % CHART_COLORS.length],
        width: 2,
        isYours: false,
      }));
    }
    // Channel level
    return filteredCompetitors
      .filter(c => c.supabaseId)
      .map(comp => {
        const isYours = comp.id === yourChannelId;
        const catCfg = categoryConfig[comp.category] || {};
        return {
          key: comp.supabaseId,
          color: isYours ? CT.yourColor : catCfg.color || '#666',
          width: isYours ? CT.yourWidth : CT.compWidth,
          isYours,
        };
      });
  }, [zoomLevel, parentCategories, subcategories, filteredCompetitors, categoryConfig, yourChannelId]);

  // Engagement data (channel level only, or aggregated)
  const engagementChartData = useMemo(() => {
    if (allDates.length === 0) return [];
    const comps = filteredCompetitors.filter(c => c.supabaseId && snapshotData[c.supabaseId]);
    return allDates.map(date => {
      const point = { date };
      comps.forEach(comp => {
        const snaps = snapshotData[comp.supabaseId] || [];
        const snap = snaps.find(s => s.snapshot_date === date);
        if (snap?.avg_engagement_rate != null) point[comp.supabaseId] = snap.avg_engagement_rate;
      });
      return point;
    });
  }, [snapshotData, filteredCompetitors, allDates]);

  const engagementBand = useMemo(() => {
    const allRates = [];
    engagementChartData.forEach(point => {
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

  // H2H data
  const h2hChartData = useMemo(() => {
    if (headToHeadSelection.length < 2 || allDates.length === 0) return [];
    const selected = headToHeadSelection.map(id => activeCompetitors.find(c => c.supabaseId === id)).filter(Boolean);
    return allDates.map(date => {
      const point = { date };
      selected.forEach(comp => {
        const snaps = snapshotData[comp.supabaseId] || [];
        const snap = snaps.find(s => s.snapshot_date === date);
        if (snap) {
          point[comp.supabaseId + "_subs"] = snap.subscriber_count;
          point[comp.supabaseId + "_views"] = snap.total_view_count;
          point[comp.supabaseId + "_vids"] = snap.video_count;
        }
      });
      return point;
    });
  }, [headToHeadSelection, snapshotData, activeCompetitors, allDates]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const toggleLine = useCallback((key) => {
    setHiddenLines(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleH2hSelection = useCallback((supabaseId) => {
    setHeadToHeadSelection(prev => {
      if (prev.includes(supabaseId)) return prev.filter(id => id !== supabaseId);
      if (prev.length >= 4) return prev;
      return [...prev, supabaseId];
    });
  }, []);

  const handleParentSelect = (slug) => {
    if (selectedParent === slug) {
      setSelectedParent(null);
      setSelectedSub(null);
    } else {
      setSelectedParent(slug);
      setSelectedSub(null);
    }
    setHiddenLines({});
  };

  const handleSubSelect = (slug) => {
    if (selectedSub === slug) {
      setSelectedSub(null);
    } else {
      setSelectedSub(slug);
    }
    setHiddenLines({});
  };

  // ─── Loading ──────────────────────────────────────────────────────────────

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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "16px" }}>

      {/* Header with time range */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>
          Competitor Trends
          <span style={{ fontSize: "12px", fontWeight: "400", color: "#888", marginLeft: "8px" }}>
            {filteredCompetitors.length} channels · {chartLabel}
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
                padding: "5px 12px", fontSize: "11px", fontWeight: "600",
                border: `1px solid ${timeRange === opt.value ? "#3b82f6" : "#444"}`,
                borderLeft: i > 0 ? "none" : undefined,
                borderRadius: i === 0 ? "6px 0 0 6px" : i === arr.length - 1 ? "0 6px 6px 0" : "0",
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

      {/* ─── Category Zoom Selector ──────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {/* Parent category pills */}
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button
            onClick={() => { setSelectedParent(null); setSelectedSub(null); setHiddenLines({}); }}
            style={{
              padding: "5px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: "600",
              border: `1px solid ${!selectedParent ? '#3b82f6' : '#444'}`,
              background: !selectedParent ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: !selectedParent ? '#3b82f6' : '#888',
              cursor: "pointer",
            }}
          >
            All ({activeCompetitors.length})
          </button>
          {parentCategories.map(slug => {
            const cfg = categoryConfig[slug] || {};
            const children = hierarchy.childrenByParent[slug] || [];
            const slugs = new Set([slug, ...children]);
            const count = activeCompetitors.filter(c => slugs.has(c.category)).length;
            const isActive = selectedParent === slug;
            return (
              <button
                key={slug}
                onClick={() => handleParentSelect(slug)}
                style={{
                  padding: "5px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: "600",
                  border: `1px solid ${isActive ? cfg.color || '#3b82f6' : '#444'}`,
                  background: isActive ? `${cfg.color || '#3b82f6'}20` : 'transparent',
                  color: isActive ? cfg.color || '#3b82f6' : '#888',
                  cursor: "pointer", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: "4px",
                }}
              >
                {cfg.icon && <span style={{ fontSize: "12px" }}>{cfg.icon}</span>}
                {cfg.label || slug} ({count})
              </button>
            );
          })}
        </div>

        {/* Subcategory pills (when parent is selected) */}
        {selectedParent && subcategories.length > 1 && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", paddingLeft: "8px" }}>
            <button
              onClick={() => { setSelectedSub(null); setHiddenLines({}); }}
              style={{
                padding: "4px 10px", borderRadius: "6px", fontSize: "10px", fontWeight: "600",
                border: `1px solid ${!selectedSub ? '#3b82f6' : '#444'}`,
                background: !selectedSub ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: !selectedSub ? '#60a5fa' : '#888',
                cursor: "pointer",
              }}
            >
              All in {categoryConfig[selectedParent]?.label || selectedParent}
            </button>
            {subcategories.map(slug => {
              const cfg = categoryConfig[slug] || {};
              const count = activeCompetitors.filter(c => c.category === slug).length;
              const isActive = selectedSub === slug;
              return (
                <button
                  key={slug}
                  onClick={() => handleSubSelect(slug)}
                  style={{
                    padding: "4px 10px", borderRadius: "6px", fontSize: "10px", fontWeight: "600",
                    border: `1px solid ${isActive ? cfg.color || '#3b82f6' : '#444'}`,
                    background: isActive ? `${cfg.color || '#3b82f6'}20` : 'transparent',
                    color: isActive ? cfg.color || '#3b82f6' : '#888',
                    cursor: "pointer", whiteSpace: "nowrap",
                    display: "flex", alignItems: "center", gap: "4px",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color || '#666' }} />
                  {cfg.label || slug} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Subscriber Growth Chart ─────────────────────────────────────────── */}
      <ChartCard title="Subscriber Growth" subtitle={
        zoomLevel === 'categories' ? 'Aggregated by parent category' :
        zoomLevel === 'subcategories' ? 'Aggregated by subcategory' :
        'Individual channels'
      } hasData={hasData}>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={subscriberChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CT.grid} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: CT.axis }} axisLine={false} tickLine={false} tickFormatter={formatDateAxis} />
            <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: CT.axis }} axisLine={false} tickLine={false} width={55} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [fmtCompact(value), nameMap[name] || name]}
              labelFormatter={formatTooltipDate}
            />
            <Legend
              onClick={(e) => toggleLine(e.dataKey)}
              wrapperStyle={{ cursor: "pointer", fontSize: "11px", paddingTop: "8px" }}
              formatter={(value, entry) => (
                <span style={{
                  color: hiddenLines[entry.dataKey] ? "#555" : entry.color,
                  textDecoration: hiddenLines[entry.dataKey] ? "line-through" : "none",
                }}>
                  {nameMap[entry.dataKey] || value}
                </span>
              )}
            />
            {chartLines.map(line => (
              <Line
                key={line.key}
                dataKey={line.key}
                name={line.key}
                stroke={line.color}
                strokeWidth={line.width}
                dot={false}
                connectNulls
                hide={hiddenLines[line.key]}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ─── Engagement Trend (channel level only) ───────────────────────────── */}
      {zoomLevel === 'channels' && (
        <ChartCard title="Engagement Trend" subtitle="Top 5 by engagement" hasData={hasData}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={engagementChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CT.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: CT.axis }} axisLine={false} tickLine={false} tickFormatter={formatDateAxis} />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} tick={{ fontSize: 11, fill: CT.axis }} axisLine={false} tickLine={false} width={50} />
              {engagementBand.p25 !== engagementBand.p75 && (
                <ReferenceArea y1={engagementBand.p25} y2={engagementBand.p75} fill="#10b981" fillOpacity={0.08}
                  label={{ value: "Healthy range", fill: "#10b981", fontSize: 10, position: "insideTopRight" }}
                />
              )}
              <Tooltip contentStyle={tooltipStyle}
                formatter={(value, name) => [`${(value * 100).toFixed(2)}%`, nameMap[name] || name]}
                labelFormatter={formatTooltipDate}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} formatter={(value) => nameMap[value] || value} />
              {(() => {
                const withEng = filteredCompetitors.filter(c => c.supabaseId && c.engagementRate > 0)
                  .sort((a, b) => (b.engagementRate || 0) - (a.engagementRate || 0));
                const yours = filteredCompetitors.find(c => c.id === yourChannelId);
                const top5 = withEng.slice(0, 5);
                const toShow = yours && !top5.find(c => c.id === yours.id) ? [...top5, yours] : top5;
                return toShow.filter(c => c.supabaseId).map(comp => {
                  const isYours = comp.id === yourChannelId;
                  const catCfg = categoryConfig[comp.category] || {};
                  return (
                    <Line key={comp.supabaseId} dataKey={comp.supabaseId} name={comp.supabaseId}
                      stroke={isYours ? CT.yourColor : catCfg.color || "#666"}
                      strokeWidth={isYours ? CT.yourWidth : CT.compWidth}
                      dot={false} connectNulls
                    />
                  );
                });
              })()}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ─── Head-to-Head Comparison ─────────────────────────────────────────── */}
      <ChartCard title="Head-to-Head Comparison" hasData={true} noPad>
        <div style={{ padding: "16px 20px 0" }}>
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
              {headToHeadSelection.length === 0 ? "Select 2-4 competitors..." : `${headToHeadSelection.length} selected`}
              <ChevronDown size={12} style={{ marginLeft: "auto" }} />
            </button>
            {h2hDropdownOpen && (
              <div style={{
                position: "absolute", top: "100%", left: 0, zIndex: 50,
                background: "#252525", border: "1px solid #444", borderRadius: "8px",
                marginTop: "4px", maxHeight: "240px", overflowY: "auto", minWidth: "280px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              }}>
                {filteredCompetitors.filter(c => c.supabaseId).map(comp => {
                  const selected = headToHeadSelection.includes(comp.supabaseId);
                  const catCfg = categoryConfig[comp.category] || {};
                  return (
                    <div key={comp.supabaseId}
                      onClick={() => toggleH2hSelection(comp.supabaseId)}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "8px 12px", cursor: "pointer",
                        background: selected ? "rgba(59,130,246,0.1)" : "transparent",
                      }}
                      onMouseOver={e => e.currentTarget.style.background = selected ? "rgba(59,130,246,0.15)" : "#2a2a2a"}
                      onMouseOut={e => e.currentTarget.style.background = selected ? "rgba(59,130,246,0.1)" : "transparent"}
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
            <div style={{ display: "flex", borderBottom: "1px solid #333", padding: "0 20px" }}>
              {[
                { key: "subscribers", label: "Subscribers" },
                { key: "views", label: "Total Views" },
                { key: "videos", label: "Video Count" },
                { key: "contentMix", label: "Content Mix" },
              ].map(tab => (
                <button key={tab.key}
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

            {activeChartTab === "contentMix" && (
              <div style={{ padding: "16px 20px" }}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={headToHeadSelection.map(id => activeCompetitors.find(c => c.supabaseId === id)).filter(Boolean).map(comp => {
                      const snaps = snapshotData[comp.supabaseId] || [];
                      const latest = snaps[snaps.length - 1];
                      return {
                        name: comp.name?.length > 15 ? comp.name.slice(0, 15) + "…" : comp.name,
                        fullName: comp.name,
                        shorts: latest?.shorts_count || 0,
                        longs: latest?.longs_count || 0,
                      };
                    })}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CT.grid} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: CT.axis }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: CT.axis }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [fmtInt(value), name]}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="shorts" stackId="a" fill="#818cf8" name="Shorts" />
                    <Bar dataKey="longs" stackId="a" fill="#4f46e5" name="Long-form" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {activeChartTab !== "contentMix" && (
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
                    {headToHeadSelection.map(supabaseId => {
                      const comp = compBySupabaseId[supabaseId];
                      const catCfg = comp ? categoryConfig[comp.category] || {} : {};
                      const suffix = activeChartTab === "subscribers" ? "_subs" : activeChartTab === "views" ? "_views" : "_vids";
                      return (
                        <Line key={supabaseId} dataKey={supabaseId + suffix} name={supabaseId + suffix}
                          stroke={catCfg.color || "#666"} strokeWidth={2} dot={false} connectNulls
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </ChartCard>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, hasData, noPad, children }) {
  if (!hasData) {
    return (
      <div style={{ background: CT.bg, border: CT.cardBorder, borderRadius: CT.cardRadius, padding: "48px 24px", textAlign: "center" }}>
        <TrendingUp size={32} style={{ color: "#333", margin: "0 auto 12px" }} />
        <div style={{ fontSize: "14px", color: "#888", marginBottom: "6px" }}>{title}</div>
        <div style={{ fontSize: "12px", color: "#666" }}>
          Not enough snapshot data yet. Trends appear after at least 2 syncs on different days.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: CT.bg, border: CT.cardBorder, borderRadius: CT.cardRadius, overflow: "hidden" }}>
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
