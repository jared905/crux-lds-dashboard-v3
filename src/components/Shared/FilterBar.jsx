import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { Activity, CalendarDays } from 'lucide-react';

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
  snapshotLoading,
  // Organic-only switch (likely-promoted detection)
  organicOnly = false,
  setOrganicOnly,
  promotedCount = 0,
}) {
  const { isMobile } = useMediaQuery();
  const hasPeriods = reportPeriods && reportPeriods.length > 0;
  const hasSnapshotData = snapshotDays > 0 && dateRange !== "all";

  return (
    <div style={{
      // Pinned on desktop; static on mobile — a phone can't spare the
      // real estate, and the sticky offset clipped the organic switch
      // under the header (user, 2026-08-21).
      position: isMobile ? "static" : "sticky",
      top: isMobile ? undefined : "65px",
      zIndex: 99, paddingTop: isMobile ? "6px" : "8px", paddingBottom: "6px",
    }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: isMobile ? "0 10px" : "0 24px" }}>
        <div style={{ background: "rgba(30, 30, 30, 0.6)", border: "1px solid var(--border)", borderRadius: "8px", padding: isMobile ? "12px" : "20px", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", gap: isMobile ? "8px" : "16px", alignItems: "center", flexWrap: "wrap" }}>

            {/* Organic-only switch — strips videos our heuristic flags as
                likely promoted (huge views, near-zero engagement). Always
                visible so it's discoverable (hiding it at zero flags read
                as "the switch disappeared" — user, 2026-08-21); at zero
                it reports "nothing flagged" and does nothing. */}
            {setOrganicOnly && (
              <button
                onClick={() => setOrganicOnly(v => !v)}
                title={promotedCount > 0
                  ? `${promotedCount} video${promotedCount === 1 ? "" : "s"} flagged as likely promoted (high views with almost no comments, likes, or subscriptions). Heuristic — always double-check before telling a client.`
                  : "Nothing in this view looks like bought traffic. Detection needs engagement data (comments/likes), which some channels' syncs don't carry yet."}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: organicOnly ? "rgba(205, 242, 0, 0.12)" : "var(--input-bg)",
                  border: `1px solid ${organicOnly ? "var(--pos-border)" : "var(--border)"}`,
                  borderRadius: 999, padding: "6px 14px",
                  fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                  color: organicOnly ? "var(--pos)" : "var(--muted)",
                  cursor: "pointer",
                  transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                }}
              >
                <span aria-hidden="true" style={{
                  width: 26, height: 14, borderRadius: 999, position: "relative", flexShrink: 0,
                  background: organicOnly ? "var(--pos)" : "var(--surface-highest)",
                  transition: "background-color 0.15s ease",
                }}>
                  <span style={{
                    position: "absolute", top: 2, left: organicOnly ? 14 : 2,
                    width: 10, height: 10, borderRadius: "50%", background: "var(--bg)",
                    transition: "left 0.15s ease",
                  }} />
                </span>
                Organic only
                <span style={{ fontVariantNumeric: "tabular-nums", color: organicOnly ? "var(--pos)" : "var(--faint)" }}>
                  {promotedCount === 0 ? "nothing flagged" : organicOnly ? `${promotedCount} hidden` : `${promotedCount} flagged`}
                </span>
              </button>
            )}

            {/* Report Period Selector - shows when periods exist */}
            {hasPeriods && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", ...(isMobile ? { width: "100%" } : {}) }}>
                <div style={{ fontSize: "11px", color: "var(--pos)", fontWeight: "600", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "4px" }}>
                  <CalendarDays size={12} />
                  Period:
                </div>
                <select
                  value={activePeriod?.id || ""}
                  onChange={(e) => onPeriodChange && onPeriodChange(e.target.value)}
                  style={{
                    border: "1px solid var(--pos)",
                    background: "rgba(205, 242, 0, 0.08)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    color: "var(--pos)",
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
                background: "rgba(205, 242, 0, 0.08)",
                border: "1px solid #CDF20040",
                borderRadius: "8px",
                fontSize: "12px",
                color: "var(--pos)",
                fontWeight: "600"
              }}>
                <CalendarDays size={12} />
                {activePeriod.name}
                {activePeriod.startDate && activePeriod.endDate && (
                  <span style={{ color: "rgba(205, 242, 0, 0.5)", fontWeight: "400" }}>
                    ({new Date(activePeriod.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(activePeriod.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                  </span>
                )}
              </div>
            )}

            {/* Separator when periods exist */}
            {hasPeriods && !isMobile && (
              <div style={{ width: "1px", height: "24px", background: "var(--outline-variant)" }} />
            )}

            {/* Period data note - explains that all videos are shown for the period */}
            {activePeriod && !isMobile && (
              <div style={{
                fontSize: "11px",
                color: "var(--muted)",
                fontStyle: "italic",
                padding: "6px 10px",
                background: "var(--input-bg)",
                borderRadius: "6px",
                border: "1px solid var(--border)"
              }}>
                Showing stats for all videos active during {activePeriod.name}
              </div>
            )}

            {/* Date filter - only show when NOT viewing period data */}
            {!activePeriod && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", ...(isMobile ? { width: "100%" } : {}) }}>
                  <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "600", textTransform: "uppercase" }}>
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
                  }} style={{ border: "1px solid var(--border)", background: "var(--input-bg)", borderRadius: "8px", padding: "8px 12px", color: "var(--text)", fontSize: "13px", cursor: "pointer", flex: isMobile ? 1 : "none" }}>
                    <option value="all">All time</option>
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
                        border: "1px solid var(--border)",
                        background: "var(--input-bg)",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        color: "var(--text)",
                        fontSize: "13px",
                        cursor: "pointer",
                        colorScheme: "dark",
                        flex: isMobile ? 1 : "none"
                      }}
                    />
                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>to</div>
                    <input
                      type="date"
                      value={customDateRange.end}
                      onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--input-bg)",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        color: "var(--text)",
                        fontSize: "13px",
                        cursor: "pointer",
                        colorScheme: "dark",
                        flex: isMobile ? 1 : "none"
                      }}
                    />
                  </div>
                )}

                {/* Data source indicator */}
                {dateRange !== "all" && !snapshotLoading && !isMobile && (
                  hasSnapshotData ? (
                    <div style={{
                      display: "flex", alignItems: "center", gap: "5px",
                      padding: "5px 10px", background: "rgba(0, 209, 255, 0.06)",
                      border: "1px solid #00D1FF30", borderRadius: "6px",
                      fontSize: "11px", color: "var(--accent-text)", fontWeight: "500",
                    }}>
                      <Activity size={11} />
                      {snapshotDays} {snapshotDays === 1 ? 'day' : 'days'} of synced data
                    </div>
                  ) : (
                    <div style={{
                      display: "flex", alignItems: "center", gap: "5px",
                      padding: "5px 10px", background: "rgba(245, 158, 11, 0.06)",
                      border: "1px solid #f59e0b30", borderRadius: "6px",
                      fontSize: "11px", color: "var(--warn)", fontWeight: "500",
                      cursor: "help",
                    }} title="No daily snapshots for this date range. Showing lifetime totals on videos published in the period.">
                      <Activity size={11} />
                      Showing lifetime totals — daily history hasn’t synced for these dates yet
                    </div>
                  )
                )}
                {snapshotLoading && dateRange !== "all" && (
                  <div style={{ fontSize: "11px", color: "var(--muted)", fontStyle: "italic" }}>
                    Loading performance data...
                  </div>
                )}
              </>
            )}

            {channelOpts.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", ...(isMobile ? { width: "100%" } : {}) }}>
                <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "600", textTransform: "uppercase" }}>Channel:</div>
                <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)} style={{ border: "1px solid var(--border)", background: "var(--input-bg)", borderRadius: "8px", padding: "8px 12px", color: "var(--text)", fontSize: "13px", cursor: "pointer", flex: isMobile ? 1 : "none" }}>
                  <option value="all">All Channels</option>
                  {channelOpts.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                </select>
              </div>
            )}

            {!isMobile && <div style={{ flex: 1 }} />}

            <input type="text" placeholder="Search videos..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: isMobile ? "100%" : "250px", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 14px", background: "var(--input-bg)", color: "var(--text)", fontSize: "13px" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
