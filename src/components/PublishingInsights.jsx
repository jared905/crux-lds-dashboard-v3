import React, { useMemo } from "react";

/**
 * Best Publishing Time Analysis
 * Shows performance by day of week and time of day
 */
export default function PublishingInsights({ rows }) {
  const insights = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    const videosWithDates = rows.filter(r => r.publishDate && r.views != null);
    if (videosWithDates.length < 5) return null; // Need enough data for meaningful insights

    // Use median instead of mean to avoid viral video outliers skewing results
    const getMedian = (arr) => {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    // Day of Week Analysis
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayStats = Array.from({ length: 7 }, () => ({ count: 0, totalViews: 0, videos: [] }));

    // Time of Day Analysis (4 blocks)
    const timeBlocks = [
      { name: 'Night', displayName: 'Night (12am-6am)', start: 0, end: 6, count: 0, totalViews: 0, videos: [] },
      { name: 'Morning', displayName: 'Morning (6am-12pm)', start: 6, end: 12, count: 0, totalViews: 0, videos: [] },
      { name: 'Afternoon', displayName: 'Afternoon (12pm-6pm)', start: 12, end: 18, count: 0, totalViews: 0, videos: [] },
      { name: 'Evening', displayName: 'Evening (6pm-12am)', start: 18, end: 24, count: 0, totalViews: 0, videos: [] }
    ];

    videosWithDates.forEach(video => {
      const date = new Date(video.publishDate);
      const dayOfWeek = date.getDay();
      const hour = date.getHours();

      // Day stats
      dayStats[dayOfWeek].count++;
      dayStats[dayOfWeek].totalViews += video.views;
      dayStats[dayOfWeek].videos.push(video);

      // Time block stats
      const block = timeBlocks.find(b => hour >= b.start && hour < b.end);
      if (block) {
        block.count++;
        block.totalViews += video.views;
        block.videos.push(video);
      }
    });

    // Calculate median views (resistant to viral outliers) and find best
    // Require at least 2 uploads to be considered for "best" to avoid single-video flukes
    const MIN_UPLOADS_FOR_BEST = 2;

    const dayData = dayStats.map((stat, idx) => ({
      day: dayNames[idx],
      dayShort: dayNames[idx].substring(0, 3),
      count: stat.count,
      medianViews: getMedian(stat.videos.map(v => v.views))
    })).filter(d => d.count > 0);

    const timeData = timeBlocks
      .map(block => ({
        ...block,
        medianViews: getMedian(block.videos.map(v => v.views))
      }))
      .filter(t => t.count > 0);

    // Only consider days/times with enough data to be statistically meaningful
    const eligibleDays = dayData.filter(d => d.count >= MIN_UPLOADS_FOR_BEST);
    const eligibleTimes = timeData.filter(t => t.count >= MIN_UPLOADS_FOR_BEST);

    const bestDay = eligibleDays.length > 0
      ? [...eligibleDays].sort((a, b) => b.medianViews - a.medianViews)[0]
      : null;

    const bestTime = eligibleTimes.length > 0
      ? [...eligibleTimes].sort((a, b) => b.medianViews - a.medianViews)[0]
      : null;

    const maxDayViews = Math.max(...dayData.map(d => d.medianViews), 1);
    const maxTimeViews = Math.max(...timeData.map(t => t.medianViews), 1);

    return { dayData, timeData, bestDay, bestTime, maxDayViews, maxTimeViews };
  }, [rows]);

  if (!insights) return null;

  const { dayData, timeData, bestDay, bestTime, maxDayViews, maxTimeViews } = insights;

  const s = {
    container: {
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "20px"
    },
    header: {
      marginBottom: "20px"
    },
    title: {
      fontSize: "20px",
      fontWeight: "700",
      color: "#fff"
    },
    subtitle: {
      fontSize: "13px",
      color: "#888",
      marginTop: "4px"
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "24px"
    },
    section: {
      display: "flex",
      flexDirection: "column",
      gap: "12px"
    },
    sectionTitle: {
      fontSize: "14px",
      fontWeight: "600",
      color: "#fff",
      marginBottom: "4px"
    },
    bestBadge: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      backgroundColor: "#1e3a5f",
      color: "#60a5fa",
      padding: "4px 10px",
      borderRadius: "6px",
      fontSize: "12px",
      fontWeight: "600",
      marginBottom: "12px"
    },
    chart: {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    barWrapper: {
      display: "flex",
      alignItems: "center",
      gap: "12px"
    },
    label: {
      fontSize: "12px",
      color: "#888",
      minWidth: "70px",
      textAlign: "right"
    },
    barTrack: {
      flex: 1,
      height: "32px",
      backgroundColor: "#252525",
      borderRadius: "6px",
      position: "relative",
      overflow: "hidden"
    },
    barFill: (width, isBest) => ({
      height: "100%",
      width: `${width}%`,
      backgroundColor: isBest ? "#2563eb" : "#374151",
      borderRadius: "6px",
      transition: "all 0.3s ease",
      display: "flex",
      alignItems: "center",
      paddingLeft: "10px"
    }),
    barValue: {
      fontSize: "11px",
      fontWeight: "600",
      color: "#fff",
      whiteSpace: "nowrap"
    },
    stats: {
      fontSize: "10px",
      color: "#666",
      marginTop: "2px"
    },
    '@media (max-width: 768px)': {
      grid: {
        gridTemplateColumns: "1fr"
      }
    }
  };

  const formatViews = (views) => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
    return Math.round(views).toString();
  };

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.title}>🕐 Publishing Insights</div>
        <div style={s.subtitle}>Performance by day of week and time of day</div>
      </div>

      <div style={s.grid}>
        {/* Best Day of Week */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Best Day of Week</div>
          {bestDay && (
            <div style={s.bestBadge}>
              ⭐ {bestDay.day} - {formatViews(bestDay.medianViews)} median views
            </div>
          )}

          <div style={s.chart}>
            {dayData.map((day) => {
              const isBest = bestDay && day.day === bestDay.day;
              const width = (day.medianViews / maxDayViews) * 100;

              return (
                <div key={day.day}>
                  <div style={s.barWrapper}>
                    <div style={s.label}>{day.dayShort}</div>
                    <div style={s.barTrack}>
                      <div style={s.barFill(width, isBest)}>
                        {width > 20 && (
                          <span style={s.barValue}>
                            {formatViews(day.medianViews)} median
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={s.stats}>
                    {day.count} upload{day.count !== 1 ? 's' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Best Time of Day */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Best Time of Day</div>
          {bestTime && (
            <div style={s.bestBadge}>
              ⭐ {bestTime.name} - {formatViews(bestTime.medianViews)} median views
            </div>
          )}

          <div style={s.chart}>
            {timeData.map((time) => {
              const isBest = bestTime && time.name === bestTime.name;
              const width = (time.medianViews / maxTimeViews) * 100;

              return (
                <div key={time.name}>
                  <div style={s.barWrapper}>
                    <div style={s.label}>{time.name}</div>
                    <div style={s.barTrack}>
                      <div style={s.barFill(width, isBest)}>
                        {width > 20 && (
                          <span style={s.barValue}>
                            {formatViews(time.medianViews)} median
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={s.stats}>
                    {time.count} upload{time.count !== 1 ? 's' : ''} • {time.displayName}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
