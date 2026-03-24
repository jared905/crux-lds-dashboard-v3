import React, { useState, useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
} from "recharts";
import { TrendingUp, ArrowUp, ArrowDown, ChevronDown } from "lucide-react";
import CategoryComparisonSelector, { buildCategoryHierarchy, buildParentLanes } from './CategoryComparisonSelector';

// ─── Theme ──────────────────────────────────────────────────────────────────────

const CT = {
  bg: "#1E1E1E",
  cardBorder: "1px solid #333",
  cardRadius: "12px",
  axis: "#9E9E9E",
  tooltipBg: "#1E1E1E",
  tooltipBorder: "#333",
  textPrimary: "#fff",
  yourColor: "#3b82f6",
  defaultBar: "#4B5563",
};

const tooltipStyle = {
  backgroundColor: CT.tooltipBg,
  border: `1px solid ${CT.tooltipBorder}`,
  borderRadius: "8px",
  color: CT.textPrimary,
  fontSize: "12px",
};

// ─── Formatting helpers ─────────────────────────────────────────────────────────

const fmtCompact = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "--";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
};

const fmtInt = (n) =>
  !n || isNaN(n) ? "0" : Math.round(n).toLocaleString();

const fmtPct = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "--";
  return `${(n * 100).toFixed(1)}%`;
};

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function CompetitorLeaderboard({
  activeCompetitors,
  groupedCompetitors,
  yourChannelId,
  yourStats,
  CATEGORY_CONFIG,
  onChannelClick,
}) {
  const [showAll, setShowAll] = useState({});
  const [selectedParent, setSelectedParent] = useState(null);
  const [selectedSub, setSelectedSub] = useState(null);
  const MAX_VISIBLE = 15;

  const hierarchy = useMemo(() => buildCategoryHierarchy(CATEGORY_CONFIG), [CATEGORY_CONFIG]);

  const parentLanes = useMemo(
    () => groupedCompetitors ? buildParentLanes(groupedCompetitors, CATEGORY_CONFIG) : [],
    [groupedCompetitors, CATEGORY_CONFIG]
  );

  const handleFilterChange = useCallback(({ parentSlug, subSlug }) => {
    setSelectedParent(parentSlug);
    setSelectedSub(subSlug);
  }, []);

  const filteredCompetitors = useMemo(() => {
    if (selectedSub) return activeCompetitors.filter(c => c.category === selectedSub);
    if (selectedParent) {
      const children = hierarchy.childrenByParent[selectedParent] || [];
      const slugs = new Set([selectedParent, ...children]);
      return activeCompetitors.filter(c => slugs.has(c.category));
    }
    return activeCompetitors;
  }, [activeCompetitors, selectedParent, selectedSub, hierarchy]);

  // ─── Build leaderboard datasets ─────────────────────────────────────────────

  const leaderboards = useMemo(() => {
    const yourEntry = yourStats
      ? {
          name: "Your Channel",
          isYours: true,
          subscriberCount: yourStats.totalSubscribers || 0,
          viewCount: yourStats.totalViews || 0,
          avgViewsPerVideo: yourStats.avgViewsPerVideo || 0,
          engagementRate: yourStats.avgCTR || 0,
          videosLast30Days: yourStats.videosLast30Days || 0,
          category: null,
        }
      : null;

    const allChannels = [
      ...(yourEntry ? [yourEntry] : []),
      ...filteredCompetitors.map((c) => ({
        name: c.name,
        channelId: c.id,
        isYours: c.id === yourChannelId,
        subscriberCount: c.subscriberCount || 0,
        viewCount: c.viewCount || 0,
        avgViewsPerVideo: c.avgViewsPerVideo || 0,
        engagementRate: c.engagementRate || 0,
        videosLast30Days: c.uploadsLast30Days || 0,
        category: c.category,
      })),
    ];

    const boards = [
      {
        key: "subscribers",
        title: "Subscribers",
        subtitle: "Total subscriber count",
        dataKey: "value",
        color: "#3b82f6",
        data: allChannels
          .map((c) => ({ ...c, value: c.subscriberCount }))
          .sort((a, b) => b.value - a.value),
        fmt: fmtCompact,
      },
      {
        key: "views",
        title: "Total Views",
        subtitle: "Lifetime view count",
        dataKey: "value",
        color: "#f59e0b",
        data: allChannels
          .map((c) => ({ ...c, value: c.viewCount }))
          .sort((a, b) => b.value - a.value),
        fmt: fmtCompact,
      },
      {
        key: "avgViews",
        title: "Avg Views per Video",
        subtitle: "Average views across all videos",
        dataKey: "value",
        color: "#10b981",
        data: allChannels
          .map((c) => ({ ...c, value: c.avgViewsPerVideo }))
          .sort((a, b) => b.value - a.value),
        fmt: fmtCompact,
      },
      {
        key: "uploadFrequency",
        title: "Upload Frequency (Last 30 Days)",
        subtitle: "Videos published in the last 30 days",
        dataKey: "value",
        color: "#8b5cf6",
        data: allChannels
          .map((c) => ({ ...c, value: c.videosLast30Days }))
          .sort((a, b) => b.value - a.value),
        fmt: (v) => fmtInt(v),
      },
      {
        key: "engagement",
        title: "Engagement Rate",
        subtitle: "(Likes + Comments) / Views",
        dataKey: "value",
        color: "#ec4899",
        data: allChannels
          .map((c) => ({ ...c, value: c.engagementRate }))
          .filter((c) => c.value > 0)
          .sort((a, b) => b.value - a.value),
        fmt: fmtPct,
      },
    ];

    return boards;
  }, [filteredCompetitors, yourChannelId, yourStats]);

  // ─── Executive Summary ──────────────────────────────────────────────────────

  const executiveSummary = useMemo(() => {
    if (!yourStats) return null;

    const results = leaderboards.map((board) => {
      const rank =
        board.data.findIndex((d) => d.isYours) + 1 || board.data.length + 1;
      return { title: board.title, rank, total: board.data.length };
    });

    return results;
  }, [leaderboards, yourStats]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        marginBottom: "16px",
      }}
    >
      {/* Category Comparison Selector */}
      {parentLanes.length > 0 && (
        <CategoryComparisonSelector
          lanes={parentLanes}
          onFilterChange={handleFilterChange}
          onChannelClick={onChannelClick}
        />
      )}

      {/* Executive Summary Strip */}
      {executiveSummary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${executiveSummary.length}, 1fr)`,
            gap: "12px",
          }}
        >
          {executiveSummary.map((item) => {
            const board = leaderboards.find((b) => b.title === item.title);
            const isTop3 = item.rank <= 3;
            const isBottom = item.rank > item.total * 0.66;
            const color = isTop3 ? "#10b981" : isBottom ? "#ef4444" : "#f59e0b";
            return (
              <div
                key={item.title}
                style={{
                  background: CT.bg,
                  border: CT.cardBorder,
                  borderRadius: CT.cardRadius,
                  padding: "16px",
                  borderTop: `3px solid ${board?.color || "#3b82f6"}`,
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    color: "#888",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    fontWeight: "600",
                    marginBottom: "8px",
                  }}
                >
                  {item.title}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <div
                    style={{
                      fontSize: "28px",
                      fontWeight: "700",
                      color,
                      fontFamily: "'Barlow Condensed', sans-serif",
                    }}
                  >
                    #{item.rank}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    of {item.total}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Leaderboard Charts */}
      {leaderboards.map((board) => {
        const isExpanded = showAll[board.key];
        const visibleData = isExpanded
          ? board.data
          : board.data.slice(0, MAX_VISIBLE);
        const hasMore = board.data.length > MAX_VISIBLE;

        // Dynamic height based on bar count
        const barHeight = 36;
        const chartHeight = Math.max(visibleData.length * barHeight + 40, 120);

        return (
          <div
            key={board.key}
            style={{
              background: CT.bg,
              border: CT.cardBorder,
              borderRadius: CT.cardRadius,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{ padding: "16px 20px 0" }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "#fff",
                  marginBottom: "2px",
                }}
              >
                {board.title}
              </div>
              <div style={{ fontSize: "11px", color: "#666", marginBottom: "12px" }}>
                {board.subtitle}
              </div>
            </div>

            {/* Chart */}
            <div style={{ padding: "0 8px 8px" }}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart
                  layout="vertical"
                  data={visibleData}
                  margin={{ top: 4, right: 80, left: 8, bottom: 4 }}
                  barCategoryGap="20%"
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={160}
                    tick={({ x, y, payload }) => {
                      const entry = visibleData.find(
                        (d) => d.name === payload.value
                      );
                      const rank =
                        board.data.findIndex(
                          (d) => d.name === payload.value
                        ) + 1;
                      const isYours = entry?.isYours;
                      return (
                        <g
                          transform={`translate(${x},${y})`}
                          style={{ cursor: entry?.channelId ? 'pointer' : 'default' }}
                          onClick={() => { if (entry?.channelId && onChannelClick) onChannelClick(entry.channelId); }}
                        >
                          <text
                            x={-8}
                            y={0}
                            dy={4}
                            textAnchor="end"
                            fill={isYours ? CT.yourColor : "#ccc"}
                            fontSize={12}
                            fontWeight={isYours ? 700 : 400}
                          >
                            {payload.value?.length > 20
                              ? payload.value.slice(0, 20) + "…"
                              : payload.value}
                          </text>
                          <text
                            x={-164}
                            y={0}
                            dy={4}
                            textAnchor="start"
                            fill={isYours ? CT.yourColor : "#666"}
                            fontSize={11}
                            fontWeight={isYours ? 700 : 400}
                          >
                            #{rank}
                          </text>
                        </g>
                      );
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [board.fmt(value), board.title]}
                    labelFormatter={(label) => label}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={28}
                    onClick={(data) => {
                      if (data?.channelId && onChannelClick) onChannelClick(data.channelId);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {visibleData.map((entry, i) => {
                      const catCfg = CATEGORY_CONFIG[entry.category] || {};
                      return (
                        <Cell
                          key={i}
                          fill={
                            entry.isYours
                              ? CT.yourColor
                              : catCfg.color || CT.defaultBar
                          }
                          fillOpacity={entry.isYours ? 1 : 0.7}
                        />
                      );
                    })}
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={board.fmt}
                      style={{
                        fill: "#ccc",
                        fontSize: "12px",
                        fontWeight: 600,
                        fontFamily: "'Barlow Condensed', sans-serif",
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Show All / Show Less */}
            {hasMore && (
              <div style={{ padding: "0 20px 12px", textAlign: "center" }}>
                <button
                  onClick={() =>
                    setShowAll((prev) => ({
                      ...prev,
                      [board.key]: !prev[board.key],
                    }))
                  }
                  style={{
                    background: "transparent",
                    border: "1px solid #444",
                    borderRadius: "6px",
                    padding: "6px 16px",
                    color: "#888",
                    fontSize: "11px",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  {isExpanded
                    ? "Show Top 15"
                    : `Show All (${board.data.length})`}
                  <ChevronDown
                    size={12}
                    style={{
                      transform: isExpanded ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s",
                    }}
                  />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
