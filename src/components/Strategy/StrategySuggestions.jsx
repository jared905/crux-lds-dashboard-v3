import React, { useMemo } from "react";
import { 
  Search, Timer, CalendarX, ArrowRight, Smartphone, MonitorPlay, 
  Zap, Calendar, TrendingDown, AlertTriangle
} from "lucide-react";

const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;
const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

export default function StrategySuggestions({ rows }) {
  
  const { shortsCards, longCards } = useMemo(() => {
    const shortsList = [];
    const longsList = [];

    if (!rows || rows.length === 0) return { shortsCards: [], longCards: [] };

    // === UPLOAD CADENCE ANALYSIS ===
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
    const last30Days = rows.filter(r => r.publishDate && new Date(r.publishDate) >= thirtyDaysAgo);
    const days3060 = rows.filter(r => r.publishDate && new Date(r.publishDate) >= sixtyDaysAgo && new Date(r.publishDate) < thirtyDaysAgo);
    
    const last30Shorts = last30Days.filter(v => (v.type || "").toLowerCase().includes("short")).length;
    const last30Long = last30Days.filter(v => !(v.type || "").toLowerCase().includes("short")).length;
    const prev30Shorts = days3060.filter(v => (v.type || "").toLowerCase().includes("short")).length;
    const prev30Long = days3060.filter(v => !(v.type || "").toLowerCase().includes("short")).length;
    
    const allVideosWithDates = rows
      .filter(r => r.publishDate)
      .sort((a, b) => new Date(a.publishDate) - new Date(b.publishDate));
    
    const daysBetweenUploads = [];
    for (let i = 1; i < allVideosWithDates.length; i++) {
      const days = (new Date(allVideosWithDates[i].publishDate) - new Date(allVideosWithDates[i-1].publishDate)) / (1000 * 60 * 60 * 24);
      daysBetweenUploads.push(days);
    }
    
    const avgDaysBetween = daysBetweenUploads.length > 0 ? 
      daysBetweenUploads.reduce((a, b) => a + b, 0) / daysBetweenUploads.length : 0;

    // === SHORTS CADENCE ===
    if (last30Shorts === 0 && last30Long > 0) {
      const allShorts = rows.filter(v => (v.type || "").toLowerCase().includes("short"));
      const shortsAvgViews = allShorts.length > 0 ? allShorts.reduce((sum, v) => sum + v.views, 0) / allShorts.length : 0;
      const allLong = rows.filter(v => !(v.type || "").toLowerCase().includes("short"));
      const longAvgViews = allLong.length > 0 ? allLong.reduce((sum, v) => sum + v.views, 0) / allLong.length : 0;
      
      shortsList.push({
        id: "no-shorts",
        priority: "High",
        icon: AlertTriangle,
        theme: "red",
        title: "Zero Shorts This Month",
        desc: `No Shorts in 30 days (${last30Long} long-form uploaded)`,
        action: "Create 3-5 Shorts",
        depth: shortsAvgViews > longAvgViews ? 
          `Historical Shorts averaged ${fmtInt(shortsAvgViews)} views vs ${fmtInt(longAvgViews)} for long-form.` :
          `Shorts drive 2025 algorithm discovery.`,
        metrics: [
          { label: "Last 30d", val: "0", good: false },
          { label: "Target", val: "3-5/mo", good: true }
        ]
      });
    }
    
    const totalVideos30d = last30Days.length;
    const shortsRatio = totalVideos30d > 0 ? last30Shorts / totalVideos30d : 0;
    
    if (last30Shorts > 0 && totalVideos30d >= 5 && shortsRatio < 0.3) {
      shortsList.push({
        id: "low-shorts-freq",
        priority: "Medium",
        icon: Calendar,
        theme: "amber",
        title: "Low Shorts Production",
        desc: `Only ${last30Shorts}/${totalVideos30d} uploads are Shorts`,
        action: "Increase Frequency",
        depth: `Current: ${Math.round(shortsRatio * 100)}%. Target: 40-50% for optimal reach.`,
        metrics: [
          { label: "Ratio", val: `${Math.round(shortsRatio * 100)}%`, good: false },
          { label: "Target", val: "40%+", good: true }
        ]
      });
    }
    
    if (prev30Shorts > 0 && last30Shorts > 0 && last30Shorts < prev30Shorts * 0.6) {
      const dropPct = Math.round((1 - last30Shorts / prev30Shorts) * 100);
      shortsList.push({
        id: "shorts-drop",
        priority: "High",
        icon: TrendingDown,
        theme: "red",
        title: "Shorts Publishing Declined",
        desc: `${last30Shorts} vs ${prev30Shorts} previous month`,
        action: "Restore Cadence",
        depth: `${dropPct}% drop hurts momentum.`,
        metrics: [
          { label: "Drop", val: `${dropPct}%`, good: false },
          { label: "Target", val: `${prev30Shorts}/mo`, good: true }
        ]
      });
    }

    // === LONG-FORM CADENCE ===
    if (last30Long === 0 && last30Shorts > 2) {
      longsList.push({
        id: "no-long",
        priority: "High",
        icon: AlertTriangle,
        theme: "red",
        title: "No Long-Form Content",
        desc: `${last30Shorts} Shorts but zero long-form`,
        action: "Publish Long-Form",
        depth: "Long-form builds deeper connection and monetization.",
        metrics: [
          { label: "Last 30d", val: "0", good: false },
          { label: "Target", val: "2-4/mo", good: true }
        ]
      });
    }
    
    if (prev30Long > 0 && last30Long > 0 && last30Long < prev30Long * 0.6) {
      const dropPct = Math.round((1 - last30Long / prev30Long) * 100);
      longsList.push({
        id: "long-drop",
        priority: "High",
        icon: TrendingDown,
        theme: "red",
        title: "Long-Form Publishing Declined",
        desc: `${last30Long} vs ${prev30Long} previous month`,
        action: "Restore Cadence",
        depth: `${dropPct}% drop hurts algorithm trust.`,
        metrics: [
          { label: "Drop", val: `${dropPct}%`, good: false },
          { label: "Target", val: `${prev30Long}/mo`, good: true }
        ]
      });
    }
    
    const mostRecentVideo = allVideosWithDates[allVideosWithDates.length - 1];
    if (mostRecentVideo && mostRecentVideo.publishDate && avgDaysBetween > 0) {
      const daysSinceLastUpload = (now - new Date(mostRecentVideo.publishDate)) / (1000 * 60 * 60 * 24);
      
      if (daysSinceLastUpload > 14 && avgDaysBetween < 10) {
        const isShort = (mostRecentVideo.type || "").toLowerCase().includes("short");
        const targetList = isShort ? shortsList : longsList;
        
        targetList.push({
          id: "drought",
          priority: "High",
          icon: CalendarX,
          theme: "red",
          title: "Upload Drought",
          desc: `${Math.round(daysSinceLastUpload)} days since last upload`,
          action: "Publish ASAP",
          depth: `Normal gap: ${Math.round(avgDaysBetween)} days.`,
          metrics: [
            { label: "Gap", val: `${Math.round(daysSinceLastUpload)}d`, good: false },
            { label: "Normal", val: `${Math.round(avgDaysBetween)}d`, good: true }
          ]
        });
      }
    }

    // === PERFORMANCE ANALYSIS ===
    const analyzeFormat = (formatRows, listRef) => {
      if (!formatRows || formatRows.length === 0) {
        if (listRef.length === 0) {
          listRef.push({
            id: `no-data`,
            priority: "Info",
            icon: CalendarX,
            theme: "gray",
            title: `No Content Yet`,
            desc: "Upload videos to see insights.",
            action: "Start Publishing",
            depth: "",
            metrics: []
          });
        }
        return;
      }

      const totalViews = formatRows.reduce((a, r) => a + r.views, 0);
      const avgViews = totalViews / formatRows.length;
      const weightedRetSum = formatRows.reduce((a, r) => a + (r.retention || 0) * r.views, 0);
      const avgRet = totalViews > 0 ? weightedRetSum / totalViews : 0.5;
      const validCtrRows = formatRows.filter(r => r.ctr > 0);
      const avgCtr = validCtrRows.length ? validCtrRows.reduce((a, r) => a + r.ctr, 0) / validCtrRows.length : 0.05;

      const topPerformer = [...formatRows].sort((a,b) => b.views - a.views)[0];
      if (topPerformer && topPerformer.views > (avgViews * 1.5) && formatRows.length > 2) {
         listRef.push({
            id: `replicate`,
            priority: "Success",
            icon: Zap,
            theme: "green",
            title: "Viral Outlier",
            desc: topPerformer.title,
            action: "Create Sequel",
            depth: `Outperforming baseline by ${fmtPct((topPerformer.views/avgViews)-1)}.`,
            metrics: [
                { label: "Views", val: fmtInt(topPerformer.views), good: true },
                { label: "Ret", val: fmtPct(topPerformer.retention), good: true }
            ]
         });
      }

      const packagingOpp = formatRows.filter(r => 
        r.retention > (avgRet * 1.1) && r.ctr < (avgCtr * 0.9) && r.views > 50 
      ).sort((a,b) => b.retention - a.retention).slice(0, 1);

      packagingOpp.forEach((video) => {
        listRef.push({
          id: `pkg`,
          priority: "High",
          icon: Search,
          theme: "blue",
          title: "Thumbnail Opportunity",
          desc: video.title,
          action: "Improve CTR",
          depth: `High retention, low CTR. New thumbnail could 2x views.`,
          metrics: [
            { label: "Retention", val: fmtPct(video.retention), good: true },
            { label: "CTR", val: fmtPct(video.ctr), good: false }
          ]
        });
      });

      const hookRisks = formatRows.filter(r => 
        r.ctr > (avgCtr * 1.1) && r.retention < (avgRet * 0.9)
      ).sort((a,b) => b.ctr - a.ctr).slice(0, 1);

      hookRisks.forEach((video) => {
        listRef.push({
          id: `hook`,
          priority: "Medium",
          icon: Timer,
          theme: "amber",
          title: "Hook Not Delivering",
          desc: video.title,
          action: "Fix Intro",
          depth: `Won click but lost viewers early.`,
          metrics: [
            { label: "CTR", val: fmtPct(video.ctr), good: true },
            { label: "Retention", val: fmtPct(video.retention), good: false }
          ]
        });
      });
    };

    const shorts = rows.filter(r => (r.type || "").toLowerCase().includes("short"));
    const longs = rows.filter(r => !(r.type || "").toLowerCase().includes("short"));

    analyzeFormat(shorts, shortsList);
    analyzeFormat(longs, longsList);

    const priorityOrder = { High: 1, Success: 2, Medium: 3, Info: 4 };
    shortsList.sort((a, b) => (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99));
    longsList.sort((a, b) => (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99));

    return { shortsCards: shortsList, longCards: longsList };
  }, [rows]);

  if (!rows || rows.length === 0) {
    return null;
  }

  const Card = ({ card }) => {
    const Icon = card.icon;
    const themeColors = {
      red: { bg: "rgba(239, 68, 68, 0.1)", border: "#ef4444", text: "#ef4444" },
      amber: { bg: "rgba(245, 158, 11, 0.1)", border: "#f59e0b", text: "#f59e0b" },
      blue: { bg: "rgba(59, 130, 246, 0.1)", border: "#3b82f6", text: "#3b82f6" },
      green: { bg: "rgba(34, 197, 94, 0.1)", border: "#10b981", text: "#10b981" },
      gray: { bg: "#252525", border: "#333", text: "#666" }
    };
    const colors = themeColors[card.theme] || themeColors.gray;
    
    return (
      <div style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${colors.border}`,
        borderRadius: "8px",
        padding: "16px"
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
          <div style={{ fontSize: "20px", color: colors.text }}>
            <Icon size={20} strokeWidth={2.5} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
              {card.title}
            </div>
            <div style={{ fontSize: "13px", color: "#E0E0E0", lineHeight: "1.4" }}>
              {card.desc}
            </div>
          </div>
        </div>

        {card.depth && (
          <div style={{ fontSize: "12px", color: "#9E9E9E", lineHeight: "1.5", marginBottom: "12px" }}>
            {card.depth}
          </div>
        )}

        {card.metrics && card.metrics.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            {card.metrics.map((m, i) => (
              <span key={i} style={{
                fontSize: "11px",
                fontWeight: "700",
                padding: "4px 8px",
                borderRadius: "6px",
                backgroundColor: m.good ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                color: m.good ? "#4ade80" : "#f87171",
                border: `1px solid ${m.good ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"}`
              }}>
                {m.val} {m.label}
              </span>
            ))}
          </div>
        )}

        <button style={{
          background: "#1E1E1E",
          color: colors.text,
          padding: "8px 12px",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          border: "none",
          cursor: "pointer"
        }}>
          {card.action} <ArrowRight size={14} />
        </button>
      </div>
    );
  };

  return (
    <div style={{
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "20px",
      position: "relative",
      overflow: "hidden"
    }}>
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "4px",
        background: "linear-gradient(90deg, #ec4899, #8b5cf6, #3b82f6)"
      }} />
      
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        marginBottom: "20px"
      }}>
        <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
          ⚡ Opportunity Feed
        </div>
        <div style={{
          fontSize: "12px",
          color: "#9E9E9E",
          background: "#252525",
          padding: "4px 10px",
          borderRadius: "6px"
        }}>
          Prioritized insights & actions
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
        gap: "24px"
      }}>
        <div>
          <div style={{
            fontSize: "13px",
            fontWeight: "700",
            color: "#E0E0E0",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            paddingBottom: "12px",
            marginBottom: "16px",
            borderBottom: "2px solid #333",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <Smartphone size={16} />
            <span>Shorts</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {shortsCards.map(c => <Card key={c.id} card={c} />)}
          </div>
        </div>

        <div>
          <div style={{
            fontSize: "13px",
            fontWeight: "700",
            color: "#E0E0E0",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            paddingBottom: "12px",
            marginBottom: "16px",
            borderBottom: "2px solid #333",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <MonitorPlay size={16} />
            <span>Long-Form</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {longCards.map(c => <Card key={c.id} card={c} />)}
          </div>
        </div>
      </div>
    </div>
  );
}