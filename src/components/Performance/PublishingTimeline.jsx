import {useMemo} from "react";
import { Activity } from 'lucide-react';

/**
 * Publishing Pattern Timeline
 * Shows uploads per week over time with shorts/longs breakdown
 */
export default function PublishingTimeline({ rows, dateRange = '28d', compact = false }) {
  const timelineData = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    const videosWithDates = rows.filter(r => r.publishDate);
    if (videosWithDates.length === 0) return null;

    // Calculate time period based on dateRange
    const now = new Date();
    let periodDays;
    let numWeeks;

    switch(dateRange) {
      case '7d':
        periodDays = 7;
        numWeeks = 1;
        break;
      case '28d':
        periodDays = 28;
        numWeeks = 4;
        break;
      case '90d':
        periodDays = 90;
        numWeeks = 13;
        break;
      case 'ytd': {
        // Braces scope `startOfYear` to this case. Without them it is hoisted
        // to the whole switch block, so any other branch referencing it would
        // hit a temporal dead zone error.
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        periodDays = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
        numWeeks = Math.ceil(periodDays / 7);
        break;
      }
      case 'all':
      default:
        // For "all", show last 12 weeks
        periodDays = 84;
        numWeeks = 12;
        break;
    }

    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Group by week
    const weeklyData = {};
    videosWithDates.forEach(video => {
      const date = new Date(video.publishDate);
      if (date < periodStart) return;

      // Get week number (starting from periodStart)
      const weekNumber = Math.floor((date - periodStart) / (7 * 24 * 60 * 60 * 1000));

      if (!weeklyData[weekNumber]) {
        weeklyData[weekNumber] = {
          week: weekNumber,
          shorts: 0,
          longs: 0,
          total: 0,
          totalViews: 0,
          videos: []
        };
      }

      if (video.type === 'short') {
        weeklyData[weekNumber].shorts++;
      } else {
        weeklyData[weekNumber].longs++;
      }
      weeklyData[weekNumber].total++;
      weeklyData[weekNumber].totalViews += video.views || 0;
      weeklyData[weekNumber].videos.push(video);
    });

    // Fill in missing weeks with zeros
    const weeks = [];
    for (let i = 0; i < numWeeks; i++) {
      const weekData = weeklyData[i] || { week: i, shorts: 0, longs: 0, total: 0, totalViews: 0, videos: [] };

      // Calculate week start date
      const weekStart = new Date(periodStart);
      weekStart.setDate(weekStart.getDate() + (i * 7));

      weeks.push({
        ...weekData,
        weekStart,
        avgViewsPerUpload: weekData.total > 0 ? weekData.totalViews / weekData.total : 0
      });
    }

    // Calculate averages
    const totalUploads = weeks.reduce((sum, w) => sum + w.total, 0);
    const avgUploadsPerWeek = numWeeks > 0 ? totalUploads / numWeeks : 0;
    const maxUploads = Math.max(...weeks.map(w => w.total), 1);

    return { weeks, avgUploadsPerWeek, maxUploads, numWeeks, periodDays };
  }, [rows, dateRange]);

  if (!timelineData) return null;

  const { weeks, avgUploadsPerWeek, maxUploads, numWeeks } = timelineData;

  // Generate subtitle based on date range
  const getSubtitle = () => {
    if (numWeeks === 1) return 'Daily uploads (last 7 days)';
    if (numWeeks <= 4) return `Uploads per week (last ${numWeeks} weeks)`;
    return `Uploads per week (last ${numWeeks} weeks)`;
  };

  const s = {
    container: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "8px",
      padding: compact ? "16px" : "24px",
      marginBottom: compact ? 0 : "20px",
      height: compact ? "100%" : "auto",
      display: compact ? "flex" : "block",
      flexDirection: "column",
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      // Extra clearance: the first bar's "N total" label sat right under
      // the icon tile and read as a mistake (user, 2026-08-20).
      marginBottom: compact ? "20px" : "30px"
    },
    title: {
      fontSize: compact ? "16px" : "20px",
      fontWeight: "700",
      color: "var(--ink)"
    },
    subtitle: {
      fontSize: compact ? "11px" : "13px",
      color: "var(--outline)",
      marginTop: "4px"
    },
    avg: {
      fontSize: compact ? "11px" : "13px",
      color: "var(--outline)"
    },
    avgValue: {
      color: "var(--ink)",
      fontWeight: "600",
      fontSize: compact ? "14px" : "16px"
    },
    chart: {
      display: "flex",
      alignItems: "flex-end",
      gap: compact ? "4px" : "8px",
      height: compact ? undefined : "200px",
      flex: compact ? 1 : undefined,
      minHeight: compact ? "120px" : undefined,
      padding: compact ? "12px 0" : "20px 0",
      borderBottom: "1px solid var(--border)"
    },
    barWrapper: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
      position: "relative",
      cursor: "pointer",
      transition: "transform 0.2s ease, filter 0.2s ease",
    },
    barStack: {
      width: "100%",
      display: "flex",
      flexDirection: "column-reverse",
      gap: "2px",
      minHeight: "4px"
    },
    bar: (height, color) => ({
      width: "100%",
      height: `${height}px`,
      backgroundColor: color,
      borderRadius: "4px 4px 0 0",
      transition: "background-color 0.2s, border-color 0.2s, color 0.2s, opacity 0.2s",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }),
    weekLabel: {
      fontSize: "10px",
      color: "var(--faint)",
      textAlign: "center"
    },
    count: (hasUploads) => ({
      fontSize: "11px",
      fontWeight: "600",
      color: hasUploads ? "var(--ink)" : "var(--outline-variant)",
      position: "absolute",
      top: "-20px"
    }),
    avgLine: {
      position: "absolute",
      left: 0,
      right: 0,
      borderTop: '1px solid var(--border)',
      pointerEvents: "none"
    },
    avgLabel: {
      position: "absolute",
      right: "-60px",
      top: "-10px",
      fontSize: "10px",
      color: "var(--faint)",
      whiteSpace: "nowrap"
    },
    legend: {
      display: "flex",
      alignItems: "center",
      gap: compact ? "10px" : "16px",
      marginTop: compact ? "10px" : "16px",
      fontSize: compact ? "10px" : "12px",
      color: "var(--outline)",
      paddingTop: compact ? "10px" : "16px",
      borderTop: "1px solid var(--border)",
      flexWrap: compact ? "wrap" : "nowrap",
    },
    legendItem: {
      display: "flex",
      alignItems: "center",
      gap: "6px"
    },
    legendBox: (color) => ({
      width: "14px",
      height: "14px",
      borderRadius: "2px",
      backgroundColor: color
    }),
    tooltip: {
      position: "absolute",
      bottom: "100%",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: "var(--bg)",
      color: "var(--ink)",
      padding: "10px 14px",
      borderRadius: "6px",
      fontSize: "11px",
      whiteSpace: "nowrap",
      marginBottom: "8px",
      zIndex: 1000,
      pointerEvents: "none",
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
    }
  };

  const formatDate = (date) => {
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  const chartHeight = compact ? 120 : 160;
  const avgLinePosition = chartHeight - (avgUploadsPerWeek / maxUploads * chartHeight);

  return (
    <div style={s.container} className="section-card heart-section">
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(255, 85, 64, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Activity size={20} style={{ color: "var(--neg-text)" }} />
          </div>
          <div>
            <div style={s.title}>Publishing Pattern</div>
            <div style={s.subtitle}>{getSubtitle()}</div>
          </div>
        </div>
        <div style={s.avg}>
          <div style={s.avgValue}>{avgUploadsPerWeek.toFixed(1)}</div>
          <div>avg/week</div>
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <div style={s.chart}>
          {/* Average line */}
          {avgUploadsPerWeek > 0 && (
            <div style={{ ...s.avgLine, top: `${avgLinePosition}px` }}>
              <div style={s.avgLabel}>avg</div>
            </div>
          )}

          {weeks.map((week, idx) => (
            <WeekBar
              key={idx}
              week={week}
              maxUploads={maxUploads}
              chartHeight={chartHeight}
              formatDate={formatDate}
              s={s}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={s.legend}>
        <div style={s.legendItem}>
          <div style={s.legendBox("var(--fmt-shorts)")} />
          <span>Shorts</span>
        </div>
        <div style={s.legendItem}>
          <div style={s.legendBox("var(--blue)")} />
          <span>Long-form</span>
        </div>
        <div style={s.legendItem}>
          <span style={{ marginLeft: "8px" }}>•</span>
          <span>Dashed line = Average uploads/week</span>
        </div>
      </div>
    </div>
  );
}

function WeekBar({ week, maxUploads, chartHeight, formatDate, s }) {
  const shortsHeight = maxUploads > 0 ? (week.shorts / maxUploads) * chartHeight : 0;
  const longsHeight = maxUploads > 0 ? (week.longs / maxUploads) * chartHeight : 0;

  return (
    <div
      className="week-bar"
      style={s.barWrapper}
    >
      {week.total > 0 && (
        <div style={s.count(true)}>
          {week.total} <span style={{ fontSize: "9px", color: "var(--faint)", fontWeight: "500" }}>total</span>
        </div>
      )}

      <div style={s.barStack}>
        {week.shorts > 0 && (
          <div style={s.bar(shortsHeight, "var(--fmt-shorts)")}>
            {shortsHeight > 20 && (
              <span style={{
                fontSize: "10px",
                fontWeight: "700",
                color: "var(--bg)",
              }}>
                {week.shorts}
              </span>
            )}
          </div>
        )}
        {week.longs > 0 && (
          <div style={s.bar(longsHeight, "var(--blue)")}>
            {longsHeight > 20 && (
              <span style={{
                fontSize: "10px",
                fontWeight: "700",
                color: "var(--bg)",
              }}>
                {week.longs}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={s.weekLabel}>{formatDate(week.weekStart)}</div>

    </div>
  );
}
