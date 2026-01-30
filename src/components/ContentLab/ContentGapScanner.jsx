import React, { useMemo, useState, useEffect } from "react";
import { Calendar, RefreshCw, Check, X, Edit2, Plus, Trash2 } from "lucide-react";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

export default function ContentCalendar({ rows }) {
  const [calendarData, setCalendarData] = useState(null);
  const [editingDay, setEditingDay] = useState(null);
  const [customIdea, setCustomIdea] = useState("");

  // Load calendar from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('contentCalendar');
      if (saved) {
        setCalendarData(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading calendar:', e);
    }
  }, []);

  // Save calendar to localStorage
  useEffect(() => {
    if (calendarData) {
      try {
        localStorage.setItem('contentCalendar', JSON.stringify(calendarData));
      } catch (e) {
        console.error('Error saving calendar:', e);
      }
    }
  }, [calendarData]);

  const generateCalendar = useMemo(() => {
    return () => {
      if (!rows || rows.length === 0) return null;

      const avgViews = rows.reduce((sum, r) => sum + r.views, 0) / rows.length;
      const now = new Date();
      const calendar = [];

      // Analyze data for recommendations
      const seriesMap = {};
      const formatPatterns = [
        { pattern: /^first time/i, name: "First Time Reaction", frequency: "weekly" },
        { pattern: /^never heard/i, name: "Never Heard Of", frequency: "weekly" },
        { pattern: /wife|husband|partner/i, name: "Partner Collaboration", frequency: "monthly" },
        { pattern: /live performance/i, name: "Live Performance Analysis", frequency: "bi-weekly" },
        { pattern: /vs\.|versus/i, name: "Comparison Video", frequency: "monthly" },
      ];

      // Detect successful series
      rows.forEach(r => {
        if (!r.title) return;
        for (const pattern of formatPatterns) {
          if (pattern.pattern.test(r.title)) {
            if (!seriesMap[pattern.name]) {
              seriesMap[pattern.name] = { 
                ...pattern, 
                videos: [],
                avgViews: 0
              };
            }
            seriesMap[pattern.name].videos.push(r);
          }
        }
      });

      // Calculate series performance
      Object.values(seriesMap).forEach(series => {
        series.avgViews = series.videos.reduce((sum, v) => sum + v.views, 0) / series.videos.length;
        series.outperforms = series.avgViews > avgViews * 1.1;
      });

      // Find abandoned topics
      const phraseMap = {};
      rows.forEach(r => {
        if (!r.title || !r.publishDate) return;
        const words = r.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        for (let i = 0; i < words.length - 1; i++) {
          const phrase = `${words[i]} ${words[i + 1]}`;
          if (!phraseMap[phrase]) {
            phraseMap[phrase] = { phrase, videos: [], lastUsed: null, avgViews: 0 };
          }
          phraseMap[phrase].videos.push(r);
          const publishDate = new Date(r.publishDate);
          if (!phraseMap[phrase].lastUsed || publishDate > phraseMap[phrase].lastUsed) {
            phraseMap[phrase].lastUsed = publishDate;
          }
        }
      });

      const abandonedTopics = Object.values(phraseMap)
        .filter(t => {
          if (t.videos.length < 3) return false;
          const daysSinceLastUse = (now - t.lastUsed) / (1000 * 60 * 60 * 24);
          t.avgViews = t.videos.reduce((sum, v) => sum + v.views, 0) / t.videos.length;
          return daysSinceLastUse > 60 && t.avgViews > avgViews * 1.2;
        })
        .sort((a, b) => b.avgViews - a.avgViews)
        .slice(0, 3);

      // Generate 30-day calendar
      const successfulSeries = Object.values(seriesMap)
        .filter(s => s.outperforms && s.videos.length >= 3)
        .sort((a, b) => b.avgViews - a.avgViews);

      for (let i = 0; i < 30; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() + i);
        const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.

        const dayData = {
          date: date.toISOString().split('T')[0],
          dayName: date.toLocaleDateString('en-US', { weekday: 'long' }),
          suggestions: [],
          status: 'planned' // 'planned' | 'published' | 'skipped'
        };

        // Tuesday/Thursday: Main series (First Time Reactions, etc.)
        if (dayOfWeek === 2 || dayOfWeek === 4) {
          if (successfulSeries.length > 0) {
            const series = successfulSeries[0];
            dayData.suggestions.push({
              type: 'series',
              title: series.name,
              reasoning: `Publishes consistently, averaging ${fmtInt(series.avgViews)} views (+${Math.round((series.avgViews / avgViews - 1) * 100)}%)`,
              confidence: 'high'
            });
          }
        }

        // Monday: Revive abandoned topic
        if (dayOfWeek === 1 && abandonedTopics.length > 0 && i < 8) {
          const topic = abandonedTopics[Math.floor(i / 7) % abandonedTopics.length];
          dayData.suggestions.push({
            type: 'revival',
            title: `Revive "${topic.phrase}" content`,
            reasoning: `Averaged ${fmtInt(topic.avgViews)} views but unused for ${Math.round((now - topic.lastUsed) / (1000 * 60 * 60 * 24))} days`,
            confidence: 'medium'
          });
        }

        // Wednesday: Secondary series or format experiment
        if (dayOfWeek === 3 && successfulSeries.length > 1) {
          const series = successfulSeries[1];
          dayData.suggestions.push({
            type: 'series',
            title: series.name,
            reasoning: `Performs well with ${series.videos.length} episodes averaging ${fmtInt(series.avgViews)} views`,
            confidence: 'high'
          });
        }

        // Friday: Special format (partner collab, live performance, etc.)
        if (dayOfWeek === 5) {
          const specialFormats = successfulSeries.filter(s => 
            s.name.includes('Partner') || s.name.includes('Live') || s.name.includes('Comparison')
          );
          if (specialFormats.length > 0) {
            const format = specialFormats[Math.floor(i / 7) % specialFormats.length];
            dayData.suggestions.push({
              type: 'special',
              title: format.name,
              reasoning: `Special format that averages ${fmtInt(format.avgViews)} views`,
              confidence: 'medium'
            });
          }
        }

        // Sunday: Rest day or experimental content
        if (dayOfWeek === 0) {
          dayData.suggestions.push({
            type: 'rest',
            title: 'Rest Day / Buffer',
            reasoning: 'Maintain work-life balance or use for experimental content',
            confidence: 'low'
          });
        }

        calendar.push(dayData);
      }

      return {
        generated: new Date().toISOString(),
        days: calendar
      };
    };
  }, [rows]);

  const handleRefresh = () => {
    const newCalendar = generateCalendar();
    setCalendarData(newCalendar);
  };

  const handleStatusChange = (dayIndex, newStatus) => {
    const updated = { ...calendarData };
    updated.days[dayIndex].status = newStatus;
    setCalendarData(updated);
  };

  const handleAddCustomIdea = (dayIndex) => {
    if (!customIdea.trim()) return;
    
    const updated = { ...calendarData };
    updated.days[dayIndex].suggestions.push({
      type: 'custom',
      title: customIdea,
      reasoning: 'Custom idea',
      confidence: 'custom',
      isCustom: true
    });
    setCalendarData(updated);
    setCustomIdea("");
    setEditingDay(null);
  };

  const handleRemoveSuggestion = (dayIndex, suggestionIndex) => {
    const updated = { ...calendarData };
    updated.days[dayIndex].suggestions.splice(suggestionIndex, 1);
    setCalendarData(updated);
  };

  // Initial generation
  useEffect(() => {
    if (!calendarData && rows && rows.length > 0) {
      handleRefresh();
    }
  }, [rows]);

  if (!rows || rows.length === 0) {
    return (
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "40px",
        marginBottom: "20px",
        textAlign: "center",
        color: "#9E9E9E"
      }}>
        <div style={{ fontSize: "16px", fontWeight: "600" }}>No data available</div>
        <div style={{ fontSize: "13px", marginTop: "8px" }}>Upload client data to generate calendar</div>
      </div>
    );
  }

  if (!calendarData) {
    return (
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "40px",
        marginBottom: "20px",
        textAlign: "center"
      }}>
        <div style={{ fontSize: "16px", fontWeight: "600", color: "#fff", marginBottom: "16px" }}>
          Generate Your 30-Day Content Calendar
        </div>
        <button
          onClick={handleRefresh}
          style={{
            background: "#2962FF",
            color: "#fff",
            border: "none",
            padding: "12px 24px",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <Calendar size={18} />
          Generate Calendar
        </button>
      </div>
    );
  }

  const s = {
    section: {
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "20px",
      position: "relative",
      overflow: "hidden"
    },
    gradientBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "4px",
      background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)"
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "24px"
    },
    title: { fontSize: "20px", fontWeight: "700", color: "#fff" },
    subtitle: {
      fontSize: "12px",
      color: "#9E9E9E"
    },
    refreshBtn: {
      background: "#252525",
      border: "1px solid #333",
      color: "#E0E0E0",
      padding: "8px 16px",
      borderRadius: "8px",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    weekGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: "12px",
      marginBottom: "24px"
    },
    dayCard: (status) => {
      const colors = {
        planned: { bg: "#252525", border: "#333" },
        published: { bg: "rgba(34, 197, 94, 0.1)", border: "#10b981" },
        skipped: { bg: "rgba(107, 114, 128, 0.1)", border: "#6b7280" }
      };
      const c = colors[status] || colors.planned;
      return {
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: "8px",
        padding: "12px",
        minHeight: "200px",
        display: "flex",
        flexDirection: "column"
      };
    },
    dayHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "8px",
      paddingBottom: "8px",
      borderBottom: "1px solid #333"
    },
    dayName: {
      fontSize: "11px",
      fontWeight: "700",
      color: "#9E9E9E",
      textTransform: "uppercase"
    },
    dayDate: {
      fontSize: "13px",
      fontWeight: "700",
      color: "#E0E0E0"
    },
    suggestion: {
      fontSize: "12px",
      color: "#E0E0E0",
      lineHeight: "1.4",
      marginBottom: "8px",
      padding: "8px",
      background: "#1E1E1E",
      borderRadius: "6px",
      position: "relative"
    },
    suggestionTitle: {
      fontWeight: "700",
      marginBottom: "4px",
      color: "#fff"
    },
    suggestionReason: {
      fontSize: "11px",
      color: "#9E9E9E"
    },
    confidenceBadge: (level) => {
      const colors = {
        high: { bg: "rgba(34, 197, 94, 0.15)", text: "#10b981" },
        medium: { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6" },
        low: { bg: "rgba(107, 114, 128, 0.15)", text: "#9E9E9E" },
        custom: { bg: "rgba(139, 92, 246, 0.15)", text: "#8b5cf6" }
      };
      const c = colors[level] || colors.medium;
      return {
        fontSize: "9px",
        fontWeight: "700",
        textTransform: "uppercase",
        padding: "2px 6px",
        borderRadius: "4px",
        background: c.bg,
        color: c.text,
        display: "inline-block",
        marginTop: "4px"
      };
    },
    actionButtons: {
      display: "flex",
      gap: "4px",
      marginTop: "auto",
      paddingTop: "8px"
    },
    actionBtn: (color) => ({
      flex: 1,
      padding: "6px",
      borderRadius: "6px",
      border: "none",
      background: color,
      color: "#fff",
      fontSize: "11px",
      fontWeight: "600",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "4px"
    }),
    removeBtn: {
      position: "absolute",
      top: "4px",
      right: "4px",
      background: "rgba(239, 68, 68, 0.2)",
      border: "none",
      color: "#ef4444",
      padding: "2px 4px",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "10px"
    },
    customInput: {
      width: "100%",
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "6px",
      padding: "8px",
      color: "#E0E0E0",
      fontSize: "12px",
      marginBottom: "8px"
    }
  };

  return (
    <div style={s.section}>
      <div style={s.gradientBar} />
      
      <div style={s.header}>
        <div>
          <div style={s.title}>📅 30-Day Content Calendar</div>
          <div style={s.subtitle}>
            AI-generated publishing plan based on your data
          </div>
        </div>
        <button onClick={handleRefresh} style={s.refreshBtn}>
          <RefreshCw size={16} />
          Refresh Plan
        </button>
      </div>

      <div style={s.weekGrid}>
        {calendarData.days.map((day, dayIndex) => {
          const date = new Date(day.date);
          const isToday = new Date().toDateString() === date.toDateString();
          
          return (
            <div key={dayIndex} style={s.dayCard(day.status)}>
              <div style={s.dayHeader}>
                <div>
                  <div style={s.dayName}>{day.dayName.slice(0, 3)}</div>
                  <div style={s.dayDate}>
                    {date.getDate()}
                    {isToday && <span style={{ marginLeft: "4px", fontSize: "10px", color: "#3b82f6" }}>•</span>}
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: "auto" }}>
                {day.suggestions.map((suggestion, suggestionIndex) => (
                  <div key={suggestionIndex} style={s.suggestion}>
                    {suggestion.isCustom && (
                      <button
                        onClick={() => handleRemoveSuggestion(dayIndex, suggestionIndex)}
                        style={s.removeBtn}
                      >
                        <X size={10} />
                      </button>
                    )}
                    <div style={s.suggestionTitle}>{suggestion.title}</div>
                    <div style={s.suggestionReason}>{suggestion.reasoning}</div>
                    <div style={s.confidenceBadge(suggestion.confidence)}>
                      {suggestion.confidence}
                    </div>
                  </div>
                ))}

                {editingDay === dayIndex ? (
                  <>
                    <input
                      type="text"
                      value={customIdea}
                      onChange={(e) => setCustomIdea(e.target.value)}
                      placeholder="Enter custom idea..."
                      style={s.customInput}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddCustomIdea(dayIndex)}
                    />
                    <button
                      onClick={() => handleAddCustomIdea(dayIndex)}
                      style={s.actionBtn("#8b5cf6")}
                    >
                      <Check size={12} />
                      Add
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditingDay(dayIndex)}
                    style={{ ...s.actionBtn("#333"), marginTop: "8px" }}
                  >
                    <Plus size={12} />
                    Custom
                  </button>
                )}
              </div>

              <div style={s.actionButtons}>
                <button
                  onClick={() => handleStatusChange(dayIndex, 'published')}
                  style={s.actionBtn(day.status === 'published' ? "#10b981" : "#333")}
                  disabled={day.status === 'published'}
                >
                  <Check size={12} />
                  Done
                </button>
                <button
                  onClick={() => handleStatusChange(dayIndex, 'skipped')}
                  style={s.actionBtn(day.status === 'skipped' ? "#6b7280" : "#333")}
                  disabled={day.status === 'skipped'}
                >
                  <X size={12} />
                  Skip
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}