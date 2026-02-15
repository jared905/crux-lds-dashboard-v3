import React from "react";
import { CalendarDays, Activity } from "lucide-react";

export default function FilterBar({
  dateRange,
  setDateRange,
  customDateRange,
  setCustomDateRange,
  selectedChannel,
  setSelectedChannel,
  channelOpts,
  query,
  setQuery,
  // New period props
  activePeriod,
  reportPeriods,
  onPeriodChange,
  // Snapshot data coverage
  snapshotDays,
  snapshotLoading
}) {
  const hasPeriods = reportPeriods && reportPeriods.length > 0;
  const hasSnapshotData = snapshotDays > 0 && dateRange !== "all";

  return (
    <div style={{ position: "sticky", top: "110px", zIndex: 99, background: "rgba(18, 18, 18, 0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", paddingTop: "20px", paddingBottom: "10px" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 24px" }}>
        <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", padding: "20px" }}>
          <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>

            {/* Report Period Selector - shows when periods exist */}
            {hasPeriods && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ fontSize: "11px", color: "#10b981", fontWeight: "600", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "4px" }}>
                  <CalendarDays size={12} />
                  Period:
                </div>
                <select
                  value={activePeriod?.id || ""}
                  onChange={(e) => onPeriodChange && onPeriodChange(e.target.value)}
                  style={{
                    border: "1px solid #10b981",
                    background: "#10b98115",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    color: "#10b981",
                    fontSize: "13px",
                    cursor: "pointer",
                    fontWeight: "600",
                    minWidth: "160px"
                  }}
                >
                  {reportPeriods.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.video_count} videos)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Active Period Info Badge - when viewing period-specific data */}
            {activePeriod && !hasPeriods && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                background: "#10b98115",
                border: "1px solid #10b98140",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#10b981",
                fontWeight: "600"
              }}>
                <CalendarDays size={12} />
                {activePeriod.name}
                {activePeriod.startDate && activePeriod.endDate && (
                  <span style={{ color: "#10b98180", fontWeight: "400" }}>
                    ({new Date(activePeriod.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(activePeriod.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                  </span>
                )}
              </div>
            )}

            {/* Separator when periods exist */}
            {hasPeriods && (
              <div style={{ width: "1px", height: "24px", background: "#333" }} />
            )}

            {/* Period data note - explains that all videos are shown for the period */}
            {activePeriod && (
              <div style={{
                fontSize: "11px",
                color: "#9E9E9E",
                fontStyle: "italic",
                padding: "6px 10px",
                background: "#1a1a1a",
                borderRadius: "6px",
                border: "1px solid #333"
              }}>
                Showing stats for all videos active during {activePeriod.name}
              </div>
            )}

            {/* Date filter - only show when NOT viewing period data */}
            {!activePeriod && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase" }}>
                    Date:
                  </div>
                  <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} style={{ border: "1px solid #333", background: "#252525", borderRadius: "8px", padding: "8px 12px", color: "#E0E0E0", fontSize: "13px", cursor: "pointer" }}>
                    <option value="all">All Time (Lifetime Stats)</option>
                    <option value="ytd">YTD</option>
                    <option value="90d">Last 90 Days</option>
                    <option value="28d">Last 28 Days</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>

                {dateRange === "custom" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="date"
                      value={customDateRange.start}
                      onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                      style={{
                        border: "1px solid #333",
                        background: "#252525",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        color: "#E0E0E0",
                        fontSize: "13px",
                        cursor: "pointer",
                        colorScheme: "dark"
                      }}
                    />
                    <div style={{ fontSize: "12px", color: "#9E9E9E" }}>to</div>
                    <input
                      type="date"
                      value={customDateRange.end}
                      onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                      style={{
                        border: "1px solid #333",
                        background: "#252525",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        color: "#E0E0E0",
                        fontSize: "13px",
                        cursor: "pointer",
                        colorScheme: "dark"
                      }}
                    />
                  </div>
                )}

                {/* Snapshot data coverage indicator */}
                {hasSnapshotData && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "5px 10px",
                    background: "#3b82f610",
                    border: "1px solid #3b82f630",
                    borderRadius: "6px",
                    fontSize: "11px",
                    color: "#60a5fa",
                    fontWeight: "500"
                  }}>
                    <Activity size={11} />
                    {snapshotDays} {snapshotDays === 1 ? 'day' : 'days'} of synced data
                  </div>
                )}
                {snapshotLoading && dateRange !== "all" && (
                  <div style={{
                    fontSize: "11px",
                    color: "#9E9E9E",
                    fontStyle: "italic"
                  }}>
                    Loading performance data...
                  </div>
                )}
              </>
            )}

            {channelOpts.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase" }}>Channel:</div>
                <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)} style={{ border: "1px solid #333", background: "#252525", borderRadius: "8px", padding: "8px 12px", color: "#E0E0E0", fontSize: "13px", cursor: "pointer" }}>
                  <option value="all">All Channels</option>
                  {channelOpts.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                </select>
              </div>
            )}

            <div style={{ flex: 1 }} />

            <input type="text" placeholder="Search videos..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: "250px", border: "1px solid #333", borderRadius: "8px", padding: "8px 14px", background: "#252525", color: "#E0E0E0", fontSize: "13px" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
