import React from "react";
import { CalendarDays, Activity } from "lucide-react";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";

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
  const { isMobile } = useMediaQuery();
  const hasPeriods = reportPeriods && reportPeriods.length > 0;
  const hasSnapshotData = snapshotDays > 0 && dateRange !== "all";

  return (
    <div style={{ position: "sticky", top: isMobile ? "56px" : "65px", zIndex: 99, paddingTop: isMobile ? "6px" : "8px", paddingBottom: "6px" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: isMobile ? "0 10px" : "0 24px" }}>
        <div style={{ background: "rgba(30, 30, 30, 0.6)", border: "1px solid #333", borderRadius: "8px", padding: isMobile ? "12px" : "20px", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", gap: isMobile ? "8px" : "16px", alignItems: "center", flexWrap: "wrap" }}>

            {/* Report Period Selector - shows when periods exist */}
            {hasPeriods && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", ...(isMobile ? { width: "100%" } : {}) }}>
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
                    minWidth: isMobile ? 0 : "160px",
                    flex: isMobile ? 1 : "none"
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
            {hasPeriods && !isMobile && (
              <div style={{ width: "1px", height: "24px", background: "#333" }} />
            )}

            {/* Period data note - explains that all videos are shown for the period */}
            {activePeriod && !isMobile && (
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
                <div style={{ display: "flex", alignItems: "center", gap: "8px", ...(isMobile ? { width: "100%" } : {}) }}>
                  <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase" }}>
                    Date:
                  </div>
                  <select value={dateRange} onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith('month_')) {
                      const [, y, m] = val.split('_');
                      const year = parseInt(y), month = parseInt(m);
                      const start = `${year}-${String(month).padStart(2, '0')}-01`;
                      const lastDay = new Date(year, month, 0).getDate();
                      const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                      setDateRange('custom');
                      setCustomDateRange({ start, end });
                    } else {
                      setDateRange(val);
                    }
                  }} style={{ border: "1px solid #333", background: "#252525", borderRadius: "8px", padding: "8px 12px", color: "#E0E0E0", fontSize: "13px", cursor: "pointer", flex: isMobile ? 1 : "none" }}>
                    <option value="all">All Time (Lifetime Stats)</option>
                    <option value="ytd">YTD</option>
                    <option value="90d">Last 90 Days</option>
                    <option value="28d">Last 28 Days</option>
                    <option value="7d">Last 7 Days</option>
                    <optgroup label="Monthly">
                      {(() => {
                        const months = [];
                        const now = new Date();
                        for (let i = 0; i < 6; i++) {
                          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                          const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
                          months.push(<option key={i} value={`month_${d.getFullYear()}_${d.getMonth() + 1}`}>{label}</option>);
                        }
                        return months;
                      })()}
                    </optgroup>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>

                {dateRange === "custom" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", ...(isMobile ? { width: "100%" } : {}) }}>
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
                        colorScheme: "dark",
                        flex: isMobile ? 1 : "none"
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
                        colorScheme: "dark",
                        flex: isMobile ? 1 : "none"
                      }}
                    />
                  </div>
                )}

                {/* Snapshot data coverage indicator */}
                {hasSnapshotData && !isMobile && (
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
              <div style={{ display: "flex", alignItems: "center", gap: "8px", ...(isMobile ? { width: "100%" } : {}) }}>
                <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase" }}>Channel:</div>
                <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)} style={{ border: "1px solid #333", background: "#252525", borderRadius: "8px", padding: "8px 12px", color: "#E0E0E0", fontSize: "13px", cursor: "pointer", flex: isMobile ? 1 : "none" }}>
                  <option value="all">All Channels</option>
                  {channelOpts.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                </select>
              </div>
            )}

            {!isMobile && <div style={{ flex: 1 }} />}

            <input type="text" placeholder="Search videos..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: isMobile ? "100%" : "250px", border: "1px solid #333", borderRadius: "8px", padding: "8px 14px", background: "#252525", color: "#E0E0E0", fontSize: "13px" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
