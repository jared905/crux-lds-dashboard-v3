import React from "react";

export default function FilterBar({ dateRange, setDateRange, customDateRange, setCustomDateRange, selectedChannel, setSelectedChannel, channelOpts, query, setQuery }) {
  return (
    <div style={{ position: "sticky", top: "110px", zIndex: 99, background: "#121212", paddingTop: "20px", paddingBottom: "10px" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 24px" }}>
        <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", padding: "20px" }}>
          <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase" }}>Date:</div>
              <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} style={{ border: "1px solid #333", background: "#252525", borderRadius: "8px", padding: "8px 12px", color: "#E0E0E0", fontSize: "13px", cursor: "pointer" }}>
                <option value="all">All Time</option>
                <option value="ytd">YTD</option>
                <option value="90d">90 Days</option>
                <option value="28d">28 Days</option>
                <option value="7d">7 Days</option>
                <option value="custom">Custom</option>
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
