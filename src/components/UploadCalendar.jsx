import React, { useMemo } from "react";

/**
 * Upload Calendar Heatmap
 * GitHub-style contribution calendar showing upload patterns
 */
export default function UploadCalendar({ rows }) {
  const calendarData = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    // Get videos with publish dates
    const videosWithDates = rows.filter(r => r.publishDate);
    if (videosWithDates.length === 0) return null;

    // Find date range (last 12 weeks)
    const now = new Date();
    const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);

    // Group uploads by date
    const uploadsByDate = {};
    videosWithDates.forEach(video => {
      const date = new Date(video.publishDate);
      if (date < twelveWeeksAgo) return; // Only show last 12 weeks

      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      if (!uploadsByDate[dateKey]) {
        uploadsByDate[dateKey] = { shorts: 0, longs: 0, total: 0, videos: [] };
      }

      if (video.type === 'short') {
        uploadsByDate[dateKey].shorts++;
      } else {
        uploadsByDate[dateKey].longs++;
      }
      uploadsByDate[dateKey].total++;
      uploadsByDate[dateKey].videos.push(video);
    });

    // Build 12 weeks of calendar data
    const weeks = [];
    const startDate = new Date(twelveWeeksAgo);
    // Start from the most recent Sunday
    startDate.setDate(startDate.getDate() - startDate.getDay());

    for (let week = 0; week < 12; week++) {
      const days = [];
      for (let day = 0; day < 7; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + (week * 7) + day);

        const dateKey = currentDate.toISOString().split('T')[0];
        const dayData = uploadsByDate[dateKey] || { shorts: 0, longs: 0, total: 0, videos: [] };

        days.push({
          date: currentDate,
          dateKey,
          ...dayData,
          isFuture: currentDate > now
        });
      }
      weeks.push(days);
    }

    // Calculate stats
    const totalUploads = Object.values(uploadsByDate).reduce((sum, d) => sum + d.total, 0);
    const daysWithUploads = Object.keys(uploadsByDate).length;
    const avgUploadsPerDay = daysWithUploads > 0 ? totalUploads / daysWithUploads : 0;

    return { weeks, totalUploads, daysWithUploads, avgUploadsPerDay };
  }, [rows]);

  if (!calendarData) return null;

  const { weeks, totalUploads, daysWithUploads } = calendarData;

  // Styles
  const s = {
    container: {
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "20px"
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "20px"
    },
    title: {
      fontSize: "20px",
      fontWeight: "700",
      color: "#fff"
    },
    stats: {
      display: "flex",
      gap: "16px",
      fontSize: "13px",
      color: "#888"
    },
    stat: {
      display: "flex",
      alignItems: "center",
      gap: "6px"
    },
    statValue: {
      color: "#fff",
      fontWeight: "600"
    },
    calendarWrapper: {
      overflowX: "auto",
      paddingBottom: "12px"
    },
    calendar: {
      display: "flex",
      gap: "4px",
      minWidth: "fit-content"
    },
    week: {
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    },
    day: (uploads, isFuture) => ({
      width: "18px",
      height: "18px",
      borderRadius: "3px",
      border: "1px solid #2a2a2a",
      backgroundColor: isFuture ? "#1a1a1a" :
        uploads === 0 ? "#252525" :
        uploads === 1 ? "#1e3a5f" :
        uploads === 2 ? "#2563eb" :
        uploads >= 3 ? "#3b82f6" : "#252525",
      cursor: uploads > 0 ? "pointer" : "default",
      position: "relative",
      transition: "all 0.2s"
    }),
    dayLabels: {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      marginRight: "8px",
      fontSize: "10px",
      color: "#666",
      paddingTop: "2px"
    },
    dayLabel: {
      height: "18px",
      display: "flex",
      alignItems: "center"
    },
    legend: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      marginTop: "16px",
      fontSize: "12px",
      color: "#888",
      paddingTop: "16px",
      borderTop: "1px solid #333"
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
      backgroundColor: color,
      border: "1px solid #2a2a2a"
    }),
    tooltip: {
      position: "absolute",
      bottom: "100%",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: "#000",
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "6px",
      fontSize: "11px",
      whiteSpace: "nowrap",
      marginBottom: "8px",
      zIndex: 1000,
      pointerEvents: "none",
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
    }
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.title}>📅 Upload Calendar</div>
        <div style={s.stats}>
          <div style={s.stat}>
            <span>{totalUploads}</span>
            <span>uploads in 12 weeks</span>
          </div>
          <div style={s.stat}>
            <span style={s.statValue}>{daysWithUploads}</span>
            <span>active days</span>
          </div>
        </div>
      </div>

      <div style={s.calendarWrapper}>
        <div style={{ display: "flex" }}>
          {/* Day labels */}
          <div style={s.dayLabels}>
            {dayNames.map((day, i) => (
              <div key={i} style={s.dayLabel}>
                {i % 2 === 1 ? day : ''}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={s.calendar}>
            {weeks.map((week, weekIdx) => (
              <div key={weekIdx} style={s.week}>
                {week.map((day, dayIdx) => (
                  <DayCell key={`${weekIdx}-${dayIdx}`} day={day} s={s} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={s.legend}>
        <span>Less</span>
        <div style={s.legendItem}>
          <div style={s.legendBox("#252525")} />
          <span>0</span>
        </div>
        <div style={s.legendItem}>
          <div style={s.legendBox("#1e3a5f")} />
          <span>1</span>
        </div>
        <div style={s.legendItem}>
          <div style={s.legendBox("#2563eb")} />
          <span>2</span>
        </div>
        <div style={s.legendItem}>
          <div style={s.legendBox("#3b82f6")} />
          <span>3+</span>
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

// Separate component for day cell with hover state
function DayCell({ day, s }) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  if (day.isFuture) {
    return <div style={s.day(0, true)} />;
  }

  const formatDate = (date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  return (
    <div
      style={s.day(day.total, false)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {showTooltip && day.total > 0 && (
        <div style={s.tooltip}>
          <div style={{ fontWeight: "600", marginBottom: "4px" }}>
            {formatDate(day.date)}
          </div>
          <div>
            {day.total} upload{day.total !== 1 ? 's' : ''}
            {day.shorts > 0 && day.longs > 0 ? ` (${day.shorts} short, ${day.longs} long)` :
             day.shorts > 0 ? ` (${day.shorts} short${day.shorts !== 1 ? 's' : ''})` :
             ` (${day.longs} long)`}
          </div>
        </div>
      )}
    </div>
  );
}
