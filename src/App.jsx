import BrandFunnel from "./components/BrandFunnel.jsx";
import DataStandardizer from "./components/DataStandardizer.jsx";
import ContentIntelligence from "./components/ContentIntelligence.jsx";
import TopVideos from "./components/TopVideos.jsx";
import ClientManager from "./ClientManager.jsx";
import UnifiedStrategy from "./components/UnifiedStrategy.jsx";
import CompetitorAnalysis from "./components/CompetitorAnalysis.jsx";
import PublishingTimeline from "./components/PublishingTimeline.jsx";
import PDFExport from "./components/PDFExport.jsx";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Menu, X, Upload, Home, Database, Eye, Clock, Users, Target, BarChart3, Settings, TrendingUp, TrendingDown, ChevronDown, TrendingUpDown, MessageSquare, Video, PlaySquare, Activity, Sparkles, Lightbulb, Key } from "lucide-react";

// AI-Powered Components (v2.0.2)
import APISettings from "./components/APISettings.jsx";
import VideoIdeaGenerator from "./components/VideoIdeaGenerator.jsx";
import CommentAnalysis from "./components/CommentAnalysis.jsx";
import EnhancedContentIntelligence from "./components/EnhancedContentIntelligence.jsx";
import AIExecutiveSummary from "./components/AIExecutiveSummary.jsx";

import { extractYouTubeVideoId, getYouTubeThumbnailUrl, getYouTubeVideoUrl } from "./lib/schema.js";
import { youtubeAPI } from "./services/youtubeAPI.js";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

const normalizeData = (rawData) => {
  if (!Array.isArray(rawData)) return [];

  // PRESERVE the Total row but mark it specially
  // We'll need it later to extract current subscriber count
  const filteredData = rawData.filter(r => {
    const title = r['Video title'] || r.title || "";

    // Remove rows with no title or empty title
    if (!title || title.trim() === "") return false;

    return true;
  });

  const processedRows = filteredData.map(r => {
    const num = (val) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      return Number(String(val).replace(/[^0-9.-]/g, "")) || 0;
    };

    // Map YouTube Studio column names to our format
    const title = r['Video title'] || r.title || "Untitled";
    const publishDate = r['Video publish time'] || r.publishDate;
    const views = num(r['Views'] || r.views);
    const impressions = num(r['Impressions'] || r.impressions);
    const subscribers = num(r['Subscribers gained'] || r['Subscribers'] || r.subscribers);
    const duration = num(r['Duration'] || r.duration);

    // Handle retention (comes as percentage in YouTube exports)
    let retention = num(r['Average percentage viewed (%)'] || r.retention);
    if (retention > 1.0) retention = retention / 100;

    // Handle CTR (comes as percentage in YouTube exports)
    let ctr = num(r['Impressions click-through rate (%)'] || r.ctr);
    if (ctr > 1.0) ctr = ctr / 100;

    // Calculate watch hours from Average view duration if not provided
    let watchHours = num(r.watchHours);
    if (!watchHours && r['Average view duration']) {
      // Parse "0:04:45" format to hours
      const duration = r['Average view duration'];
      const parts = String(duration).split(':');
      if (parts.length === 3) {
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const seconds = parseInt(parts[2]) || 0;
        const totalHours = hours + (minutes / 60) + (seconds / 3600);
        watchHours = totalHours * views; // Total watch hours
      }
    }

    // Determine video type based on duration (Shorts are < 180 seconds / 3 minutes)
    let type = r.type || "long";
    if (duration > 0 && duration < 180) {
      type = "short";
    }

    // Extract channel from Content column if available, otherwise use default
    const channel = r['Content'] || r.channel || "Main Channel";

    // Check if this is the Total row
    const titleLower = title.toLowerCase().trim();
    const isTotal = titleLower === "total";

    // Extract YouTube video ID from Content column (standard YouTube export)
    const rawVideoId = r['Content'] || r.videoId || r['Video ID'] || r['YouTube URL'] || r['URL'];
    const youtubeVideoId = extractYouTubeVideoId(rawVideoId);
    const thumbnailUrl = getYouTubeThumbnailUrl(youtubeVideoId);
    const youtubeUrl = getYouTubeVideoUrl(youtubeVideoId);

    return {
      channel: String(channel).trim(),
      title: title,
      duration: duration,
      views: views,
      watchHours: watchHours,
      subscribers: subscribers,
      impressions: impressions,
      ctr,
      retention,
      avgViewPct: retention,
      type: type.toLowerCase(),
      publishDate: publishDate ? new Date(publishDate).toISOString() : null,
      video_id: rawVideoId || `vid-${Date.now()}-${Math.random()}`,
      youtubeVideoId,
      thumbnailUrl,
      youtubeUrl,
      isTotal: isTotal  // Mark the Total row so we can filter it later
    };
  });

  // Keep Total rows for subscriber count extraction, but filter them out from final data
  // Also filter out videos with 0 views for display purposes
  return processedRows;
};

const Sidebar = ({ open, onClose, tab, setTab, onUpload }) => (
  <>
    {open && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 998 }} onClick={onClose} />}
    <div style={{ position: "fixed", left: open ? 0 : "-280px", top: 0, width: "280px", height: "100vh", background: "#1E1E1E", borderRight: "1px solid #333", transition: "left 0.3s", zIndex: 999, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "24px", borderBottom: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <img src="/Full_View_Logo.png" alt="Full View Analytics" style={{ height: "75px", objectFit: "contain" }} />
          <div style={{ fontSize: "9px", color: "#666", fontWeight: "600", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "4px" }}>
            POWERED BY <img src="/crux-logo.png" alt="CRUX" style={{ height: "10px", objectFit: "contain", opacity: 0.6 }} />
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#9E9E9E", cursor: "pointer" }}><X size={20} /></button>
      </div>
      <div style={{ flex: 1, padding: "16px" }}>
        {[
          { id: "Dashboard", icon: Home },
          { id: "Channel Summary", icon: Sparkles },
          { id: "Strategy", icon: Target },
          { id: "Competitors", icon: Users },
          { id: "Intelligence", icon: MessageSquare },
          { id: "Video Ideation", icon: Lightbulb },
          { id: "Comments", icon: MessageSquare },
          { id: "Data", icon: Database },
          { id: "API Settings", icon: Key },
          { id: "Standardizer", icon: Settings }
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => { setTab(t.id); onClose(); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", marginBottom: "4px", background: tab === t.id ? "rgba(41, 98, 255, 0.15)" : "transparent", border: "none", borderRadius: "8px", color: tab === t.id ? "#60a5fa" : "#9E9E9E", cursor: "pointer", fontWeight: "600", fontSize: "14px", textAlign: "left" }}>
              <Icon size={18} />{t.id}
            </button>
          );
        })}
        <button onClick={() => { onUpload(); onClose(); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "10px 16px", background: "#1E1E1E", border: "1px solid #333", borderRadius: "8px", color: "#E0E0E0", cursor: "pointer", fontWeight: "600", marginTop: "24px" }}>
          <Upload size={16} />Upload CSV
        </button>
      </div>
    </div>
  </>
);

const Chart = ({ rows, metric = "views" }) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  
  const data = useMemo(() => {
    if (!rows.length) return [];
    const byDate = {};
    rows.forEach(r => {
      if (r.publishDate) {
        const date = r.publishDate.split('T')[0];
        const value = metric === "views" ? (r.views || 0) : (r.watchHours || 0);
        byDate[date] = (byDate[date] || 0) + value;
      }
    });
    return Object.entries(byDate).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, metric]);

  if (!data.length) return <div style={{ padding: "60px", textAlign: "center", color: "#9E9E9E" }}>No chart data available</div>;

  const max = Math.max(...data.map(d => d.value), 1);
  const metricLabel = metric === "views" ? "Views" : "Watch Hours";
  const metricColor = metric === "views" ? "#3b82f6" : "#8b5cf6";
  const height = 320;
  const paddingLeft = 20;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  
  return (
    <div style={{ padding: "28px" }}>
      <div style={{ display: "flex", gap: "24px" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: "16px", borderRight: "2px solid #333", fontSize: "12px", color: "#9E9E9E", fontWeight: "600", height: `${height}px` }}>
          <div>{fmtInt(max)}</div><div>{fmtInt(max / 2)}</div><div>0</div>
        </div>
        <div style={{ flex: 1, position: "relative", height: `${height}px` }}>
          {/* Tooltip */}
          {hoveredPoint !== null && (
            <div style={{
              position: "absolute",
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
              transform: "translate(-50%, -100%)",
              background: "#1E1E1E",
              border: `2px solid ${metricColor}`,
              borderRadius: "8px",
              padding: "12px 16px",
              pointerEvents: "none",
              zIndex: 1000,
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              marginTop: "-10px"
            }}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", marginBottom: "4px" }}>
                {new Date(data[hoveredPoint].date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: metricColor }}>
                {fmtInt(data[hoveredPoint].value)}
              </div>
              <div style={{ fontSize: "11px", color: "#9E9E9E", marginTop: "2px" }}>
                {metricLabel}
              </div>
            </div>
          )}
          
          <svg width="100%" height={height} style={{ display: "block" }} viewBox="0 0 1000 320" preserveAspectRatio="none">
            <defs>
              <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: metricColor, stopOpacity: 0.4 }} />
                <stop offset="100%" style={{ stopColor: metricColor, stopOpacity: 0.05 }} />
              </linearGradient>
              <filter id="chartGlow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            
            {/* Grid lines */}
            <line x1={paddingLeft} y1={paddingTop + (height - paddingTop - paddingBottom) * 0} x2={1000 - paddingRight} y2={paddingTop + (height - paddingTop - paddingBottom) * 0} stroke="#333" strokeWidth="1" strokeDasharray="5,5" opacity="0.3" />
            <line x1={paddingLeft} y1={paddingTop + (height - paddingTop - paddingBottom) * 0.5} x2={1000 - paddingRight} y2={paddingTop + (height - paddingTop - paddingBottom) * 0.5} stroke="#333" strokeWidth="1" strokeDasharray="5,5" opacity="0.3" />
            <line x1={paddingLeft} y1={paddingTop + (height - paddingTop - paddingBottom) * 1} x2={1000 - paddingRight} y2={paddingTop + (height - paddingTop - paddingBottom) * 1} stroke="#333" strokeWidth="1" strokeDasharray="5,5" opacity="0.3" />
            
            {(() => {
              const width = 1000;
              const chartWidth = width - paddingLeft - paddingRight;
              const chartHeight = height - paddingTop - paddingBottom;
              
              const points = data.map((d, i) => {
                const x = paddingLeft + (i / Math.max(data.length - 1, 1)) * chartWidth;
                const y = paddingTop + chartHeight - ((d.value / max) * chartHeight);
                return `${x},${y}`;
              }).join(' ');
              
              const areaPoints = `${paddingLeft},${height - paddingBottom} ${points} ${paddingLeft + chartWidth},${height - paddingBottom}`;
              
              return (
                <>
                  {/* Area fill */}
                  <polygon points={areaPoints} fill="url(#areaGradient)" vectorEffect="non-scaling-stroke" />
                  
                  {/* Line */}
                  <polyline points={points} fill="none" stroke={metricColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" filter="url(#chartGlow)" />
                  
                  {/* Data points */}
                  {data.map((d, i) => {
                    const x = paddingLeft + (i / Math.max(data.length - 1, 1)) * chartWidth;
                    const y = paddingTop + chartHeight - ((d.value / max) * chartHeight);
                    const isFirstOrLast = i === 0 || i === data.length - 1;
                    const isHigh = d.value > max * 0.7;
                    const isHovered = hoveredPoint === i;
                    
                    return (
                      <g key={i}>
                        <circle 
                          cx={x} 
                          cy={y} 
                          r={isHovered ? "10" : isFirstOrLast ? "7" : "6"} 
                          fill={isHigh ? "#10b981" : metricColor} 
                          stroke="#1E1E1E"
                          strokeWidth="2"
                          style={{ cursor: "pointer", transition: "all 0.2s" }}
                          vectorEffect="non-scaling-stroke"
                          filter={isHovered ? "url(#chartGlow)" : "none"}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                            const svgX = (x / 1000) * rect.width;
                            setHoveredPoint(i);
                            setTooltipPos({ x: svgX, y: (y / 320) * rect.height });
                          }}
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                        
                        {/* Show date label for first, last, and every ~10th point */}
                        {(isFirstOrLast || i % Math.max(Math.floor(data.length / 8), 1) === 0) && (
                          <text 
                            x={x} 
                            y={height - paddingBottom + 18} 
                            textAnchor="middle" 
                            fill="#9E9E9E" 
                            fontSize="10" 
                            fontWeight="600"
                          >
                            {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </>
              );
            })()}
          </svg>
          
          {/* Summary stats below chart */}
          <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            <div style={{ background: "#252525", padding: "12px", borderRadius: "8px", borderLeft: `3px solid ${metricColor}` }}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", marginBottom: "4px" }}>TOTAL</div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: metricColor }}>{fmtInt(data.reduce((sum, d) => sum + d.value, 0))}</div>
            </div>
            <div style={{ background: "#252525", padding: "12px", borderRadius: "8px", borderLeft: "3px solid #10b981" }}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", marginBottom: "4px" }}>PEAK</div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: "#10b981" }}>{fmtInt(max)}</div>
            </div>
            <div style={{ background: "#252525", padding: "12px", borderRadius: "8px", borderLeft: "3px solid #ec4899" }}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", marginBottom: "4px" }}>AVERAGE</div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: "#ec4899" }}>{fmtInt(data.reduce((sum, d) => sum + d.value, 0) / data.length)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [sidebar, setSidebar] = useState(false);
  const [tab, setTab] = useState("Dashboard");
  
  // Multi-client state with localStorage persistence
  const [clients, setClients] = useState(() => {
    try {
      const saved = localStorage.getItem('fullview_clients');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Error loading clients from localStorage:', e);
      return [];
    }
  });
  
  const [activeClient, setActiveClient] = useState(() => {
    try {
      const savedId = localStorage.getItem('fullview_active_client');
      if (savedId && clients.length > 0) {
        return clients.find(c => c.id === savedId) || clients[0];
      }
      return clients[0] || null;
    } catch (e) {
      return clients[0] || null;
    }
  });
  
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState("28d");
  const [selectedChannel, setSelectedChannel] = useState("all");
  const [query, setQuery] = useState("");
  const [chartMetric, setChartMetric] = useState("views");
  const [showAllActions, setShowAllActions] = useState(false);
  const [channelStats, setChannelStats] = useState(null);
  const [channelStatsLoading, setChannelStatsLoading] = useState(false);
  
  // Save clients to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('fullview_clients', JSON.stringify(clients));
    } catch (e) {
      console.error('Error saving clients to localStorage:', e);
    }
  }, [clients]);
  
  // Save active client to localStorage
  useEffect(() => {
    if (activeClient) {
      try {
        localStorage.setItem('fullview_active_client', activeClient.id);
      } catch (e) {
        console.error('Error saving active client to localStorage:', e);
      }
    }
  }, [activeClient]);
  
  // Load active client's data
  useEffect(() => {
    if (activeClient && activeClient.rows) {
      const clean = normalizeData(activeClient.rows);
      setRows(clean);

      // If subscriberCount wasn't set (for backwards compatibility), calculate it now
      if (!activeClient.subscriberCount && activeClient.rows) {
        const totalRow = activeClient.rows.find(r => {
          const title = r['Video title'] || r.title || "";
          return title.toLowerCase().trim() === 'total';
        });

        let channelTotalSubscribers = 0;

        if (totalRow) {
          // Extract from Total row
          channelTotalSubscribers = Number(String(totalRow['Subscribers'] || totalRow['Subscribers gained'] || totalRow.subscribers || 0).replace(/[^0-9.-]/g, "")) || 0;
          console.log('Found Total row with subscribers:', channelTotalSubscribers);
        } else {
          // Fallback: If no Total row exists, sum up all subscribers gained from all videos
          // This represents total subscribers gained from the videos in the export
          channelTotalSubscribers = activeClient.rows.reduce((sum, r) => {
            if (r['Video title']?.toLowerCase()?.trim() === 'total') return sum;
            const subs = Number(String(r['Subscribers'] || r['Subscribers gained'] || r.subscribers || 0).replace(/[^0-9.-]/g, "")) || 0;
            return sum + subs;
          }, 0);
          console.log('No Total row found. Sum of subscribers from videos:', channelTotalSubscribers);
        }

        console.log('Active client before update:', activeClient.subscriberCount);
        console.log('Calculated channel subscribers:', channelTotalSubscribers);

        if (channelTotalSubscribers >= 0) {
          // Update the active client with the subscriber count
          setActiveClient({
            ...activeClient,
            subscriberCount: channelTotalSubscribers
          });

          // Also update in the clients array
          const updatedClients = clients.map(c =>
            c.id === activeClient.id
              ? { ...c, subscriberCount: channelTotalSubscribers }
              : c
          );
          setClients(updatedClients);
        }
      }
    } else {
      setRows([]);
    }
  }, [activeClient]);

  // Fetch channel stats from YouTube API when we have video data with channel IDs
  useEffect(() => {
    const fetchChannelStats = async () => {
      // Find a video with a channel ID from the rows
      const videoWithChannel = rows.find(r => r.youtubeVideoId && !r.isTotal);
      if (!videoWithChannel || !youtubeAPI.apiKey) {
        setChannelStats(null);
        return;
      }

      setChannelStatsLoading(true);
      try {
        // First get channel ID from a video
        const videoStats = await youtubeAPI.getVideoStats(videoWithChannel.youtubeVideoId);
        if (videoStats.channelId) {
          const stats = await youtubeAPI.getChannelStats(videoStats.channelId);
          setChannelStats(stats);
        }
      } catch (err) {
        console.warn('Failed to fetch channel stats:', err);
        setChannelStats(null);
      } finally {
        setChannelStatsLoading(false);
      }
    };

    fetchChannelStats();
  }, [rows]);

  const handleClientsUpdate = (updatedClients) => {
    setClients(updatedClients);
  };
  
  const handleClientChange = (client) => {
    setActiveClient(client);
  };

  const channelOpts = useMemo(() => [...new Set(rows.map(r => r.channel).filter(Boolean))].sort(), [rows]);
  
  const filtered = useMemo(() => {
    // Always filter out Total rows from display data
    let result = rows.filter(r => !r.isTotal && r.views > 0);

    if (dateRange !== "all") {
      const now = new Date();
      let startDate;
      if (dateRange === "ytd") {
        startDate = new Date(now.getFullYear(), 0, 1);
      } else if (dateRange === "7d") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (dateRange === "28d") {
        startDate = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      } else if (dateRange === "90d") {
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      }
      if (startDate) {
        result = result.filter(r => r.publishDate && new Date(r.publishDate) >= startDate);
      }
    }

    if (selectedChannel !== "all") {
      result = result.filter(r => r.channel === selectedChannel);
    }

    if (query) {
      result = result.filter(r => r.title.toLowerCase().includes(query.toLowerCase()));
    }

    return result;
  }, [rows, selectedChannel, query, dateRange]);

  const kpis = useMemo(() => {
    const views = filtered.reduce((s, r) => s + (r.views || 0), 0);
    const watchHours = filtered.reduce((s, r) => s + (r.watchHours || 0), 0);
    const subs = filtered.reduce((s, r) => s + (r.subscribers || 0), 0);
    const imps = filtered.reduce((s, r) => s + (r.impressions || 0), 0);
    const avgCtr = imps > 0 ? filtered.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / imps : 0;
    // Use weighted average for retention (matching funnel calculation)
    const avgRet = views > 0 ? filtered.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / views : 0;

    // Calculate Content ROI by format: returns per estimated production hour
    // Estimate: Shorts = 2 hours, Long-form = 8 hours production time
    const shorts = filtered.filter(r => r.type === 'short');
    const longs = filtered.filter(r => r.type !== 'short');

    const shortsMetrics = {
      count: shorts.length,
      views: shorts.reduce((s, r) => s + (r.views || 0), 0),
      subs: shorts.reduce((s, r) => s + (r.subscribers || 0), 0),
      watchHours: shorts.reduce((s, r) => s + (r.watchHours || 0), 0),
      imps: shorts.reduce((s, r) => s + (r.impressions || 0), 0),
      productionHours: shorts.length * 2
    };
    shortsMetrics.avgCtr = shortsMetrics.imps > 0
      ? shorts.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / shortsMetrics.imps
      : 0;
    shortsMetrics.avgRet = shortsMetrics.views > 0
      ? shorts.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / shortsMetrics.views
      : 0;

    const longsMetrics = {
      count: longs.length,
      views: longs.reduce((s, r) => s + (r.views || 0), 0),
      subs: longs.reduce((s, r) => s + (r.subscribers || 0), 0),
      watchHours: longs.reduce((s, r) => s + (r.watchHours || 0), 0),
      imps: longs.reduce((s, r) => s + (r.impressions || 0), 0),
      productionHours: longs.length * 8
    };
    longsMetrics.avgCtr = longsMetrics.imps > 0
      ? longs.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / longsMetrics.imps
      : 0;
    longsMetrics.avgRet = longsMetrics.views > 0
      ? longs.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / longsMetrics.views
      : 0;

    // ROI metrics: returns per production hour
    const shortsROI = {
      viewsPerHour: shortsMetrics.productionHours > 0 ? shortsMetrics.views / shortsMetrics.productionHours : 0,
      subsPerHour: shortsMetrics.productionHours > 0 ? shortsMetrics.subs / shortsMetrics.productionHours : 0,
      watchHoursPerHour: shortsMetrics.productionHours > 0 ? shortsMetrics.watchHours / shortsMetrics.productionHours : 0
    };

    const longsROI = {
      viewsPerHour: longsMetrics.productionHours > 0 ? longsMetrics.views / longsMetrics.productionHours : 0,
      subsPerHour: longsMetrics.productionHours > 0 ? longsMetrics.subs / longsMetrics.productionHours : 0,
      watchHoursPerHour: longsMetrics.productionHours > 0 ? longsMetrics.watchHours / longsMetrics.productionHours : 0
    };

    // Calculate period-over-period changes (will be populated after previousKpis is calculated)
    return {
      views,
      watchHours,
      subs,
      avgCtr,
      avgRet,
      shortsMetrics,
      longsMetrics,
      shortsROI,
      longsROI,
      // Changes will be added by kpisWithChanges memo below
    };
  }, [filtered]);

  // Calculate all-time KPIs (unfiltered by date, but respects channel filter)
  const allTimeKpis = useMemo(() => {
    // Filter out Total rows, but include all videos regardless of date
    let allRows = rows.filter(r => !r.isTotal && r.views > 0);

    // Still respect channel filter if set
    if (selectedChannel !== "all") {
      allRows = allRows.filter(r => r.channel === selectedChannel);
    }

    const views = allRows.reduce((s, r) => s + (r.views || 0), 0);
    const watchHours = allRows.reduce((s, r) => s + (r.watchHours || 0), 0);
    const subs = allRows.reduce((s, r) => s + (r.subscribers || 0), 0);
    const imps = allRows.reduce((s, r) => s + (r.impressions || 0), 0);
    const avgCtr = imps > 0 ? allRows.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / imps : 0;
    const avgRet = views > 0 ? allRows.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / views : 0;

    return {
      count: allRows.length,
      views,
      watchHours,
      subs,
      avgCtr,
      avgRet
    };
  }, [rows, selectedChannel]);

  // Calculate previous period KPIs for delta indicators
  const previousKpis = useMemo(() => {
    if (!rows.length) return {
      views: 0,
      watchHours: 0,
      subs: 0,
      avgCtr: 0,
      avgRet: 0,
      shortsMetrics: { count: 0, views: 0, subs: 0, watchHours: 0, imps: 0, productionHours: 0, avgCtr: 0, avgRet: 0 },
      longsMetrics: { count: 0, views: 0, subs: 0, watchHours: 0, imps: 0, productionHours: 0, avgCtr: 0, avgRet: 0 },
      shortsROI: { viewsPerHour: 0, subsPerHour: 0, watchHoursPerHour: 0 },
      longsROI: { viewsPerHour: 0, subsPerHour: 0, watchHoursPerHour: 0 }
    };

    const now = new Date();
    let currentStart, previousStart, previousEnd;

    // Define current and previous periods based on dateRange filter
    switch(dateRange) {
      case '7d':
        currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        previousEnd = currentStart;
        break;
      case '28d':
        currentStart = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);
        previousEnd = currentStart;
        break;
      case '90d':
        currentStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        previousEnd = currentStart;
        break;
      case 'ytd':
        currentStart = new Date(now.getFullYear(), 0, 1);
        previousStart = new Date(now.getFullYear() - 1, 0, 1);
        previousEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default: // 'all'
        // For "all time", compare first half vs second half of data
        const allDates = rows.map(r => r.publishDate).filter(Boolean).sort();
        if (!allDates.length) return {
          views: 0,
          watchHours: 0,
          subs: 0,
          avgCtr: 0,
          avgRet: 0,
          shortsMetrics: { count: 0, views: 0, subs: 0, watchHours: 0, imps: 0, productionHours: 0, avgCtr: 0, avgRet: 0 },
          longsMetrics: { count: 0, views: 0, subs: 0, watchHours: 0, imps: 0, productionHours: 0, avgCtr: 0, avgRet: 0 },
          shortsROI: { viewsPerHour: 0, subsPerHour: 0, watchHoursPerHour: 0 },
          longsROI: { viewsPerHour: 0, subsPerHour: 0, watchHoursPerHour: 0 }
        };
        const midpoint = new Date((new Date(allDates[0]).getTime() + new Date(allDates[allDates.length - 1]).getTime()) / 2);
        currentStart = midpoint;
        previousStart = new Date(allDates[0]);
        previousEnd = midpoint;
    }

    // Filter data for previous period
    const previousFiltered = rows.filter(r => {
      if (!r.publishDate) return false;
      const pubDate = new Date(r.publishDate);

      // Apply same channel and query filters
      if (selectedChannel !== 'all' && r.channel !== selectedChannel) return false;
      if (query && !r.title.toLowerCase().includes(query.toLowerCase())) return false;

      return pubDate >= previousStart && pubDate < previousEnd;
    });

    // Calculate previous period metrics
    const views = previousFiltered.reduce((s, r) => s + (r.views || 0), 0);
    const watchHours = previousFiltered.reduce((s, r) => s + (r.watchHours || 0), 0);
    const subs = previousFiltered.reduce((s, r) => s + (r.subscribers || 0), 0);
    const imps = previousFiltered.reduce((s, r) => s + (r.impressions || 0), 0);
    const avgCtr = imps > 0 ? previousFiltered.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / imps : 0;
    const avgRet = views > 0 ? previousFiltered.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / views : 0;

    // Calculate Content ROI by format for previous period
    const shorts = previousFiltered.filter(r => r.type === 'short');
    const longs = previousFiltered.filter(r => r.type !== 'short');

    const shortsMetrics = {
      count: shorts.length,
      views: shorts.reduce((s, r) => s + (r.views || 0), 0),
      subs: shorts.reduce((s, r) => s + (r.subscribers || 0), 0),
      watchHours: shorts.reduce((s, r) => s + (r.watchHours || 0), 0),
      imps: shorts.reduce((s, r) => s + (r.impressions || 0), 0),
      productionHours: shorts.length * 2
    };
    shortsMetrics.avgCtr = shortsMetrics.imps > 0
      ? shorts.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / shortsMetrics.imps
      : 0;
    shortsMetrics.avgRet = shortsMetrics.views > 0
      ? shorts.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / shortsMetrics.views
      : 0;

    const longsMetrics = {
      count: longs.length,
      views: longs.reduce((s, r) => s + (r.views || 0), 0),
      subs: longs.reduce((s, r) => s + (r.subscribers || 0), 0),
      watchHours: longs.reduce((s, r) => s + (r.watchHours || 0), 0),
      imps: longs.reduce((s, r) => s + (r.impressions || 0), 0),
      productionHours: longs.length * 8
    };
    longsMetrics.avgCtr = longsMetrics.imps > 0
      ? longs.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / longsMetrics.imps
      : 0;
    longsMetrics.avgRet = longsMetrics.views > 0
      ? longs.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / longsMetrics.views
      : 0;

    const shortsROI = {
      viewsPerHour: shortsMetrics.productionHours > 0 ? shortsMetrics.views / shortsMetrics.productionHours : 0,
      subsPerHour: shortsMetrics.productionHours > 0 ? shortsMetrics.subs / shortsMetrics.productionHours : 0,
      watchHoursPerHour: shortsMetrics.productionHours > 0 ? shortsMetrics.watchHours / shortsMetrics.productionHours : 0
    };

    const longsROI = {
      viewsPerHour: longsMetrics.productionHours > 0 ? longsMetrics.views / longsMetrics.productionHours : 0,
      subsPerHour: longsMetrics.productionHours > 0 ? longsMetrics.subs / longsMetrics.productionHours : 0,
      watchHoursPerHour: longsMetrics.productionHours > 0 ? longsMetrics.watchHours / longsMetrics.productionHours : 0
    };

    return { views, watchHours, subs, avgCtr, avgRet, shortsMetrics, longsMetrics, shortsROI, longsROI };
  }, [rows, dateRange, selectedChannel, query]);

  // Combine KPIs with period-over-period changes
  const kpisWithChanges = useMemo(() => {
    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      ...kpis,
      viewsChange: calculateChange(kpis.views, previousKpis.views),
      watchHoursChange: calculateChange(kpis.watchHours, previousKpis.watchHours),
      subsChange: calculateChange(kpis.subs, previousKpis.subs),
    };
  }, [kpis, previousKpis]);

  const top = useMemo(() => [...filtered].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10), [filtered]);

  return (
    <div style={{ minHeight: "100vh", background: "#121212", color: "#E0E0E0" }}>
      <Sidebar open={sidebar} onClose={() => setSidebar(false)} tab={tab} setTab={setTab} onUpload={() => {}} />
      
      <div style={{ background: "#1E1E1E", borderBottom: "1px solid #333", padding: "16px 24px", display: "flex", alignItems: "center", gap: "16px", position: "sticky", top: 0, zIndex: 100 }}>
        <button onClick={() => setSidebar(true)} style={{ background: "transparent", border: "none", color: "#E0E0E0", cursor: "pointer" }}><Menu size={24} /></button>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <img src="/Full_View_Logo.png" alt="Full View Analytics" style={{ height: "72px", objectFit: "contain" }} />
          <div style={{ fontSize: "11px", color: "#666", fontWeight: "500", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "4px", marginLeft: "40px" }}>
            POWERED BY <a href="https://crux.media/" target="_blank" rel="noopener noreferrer"><img src="/crux-logo.png" alt="CRUX" style={{ height: "18px", objectFit: "contain", opacity: 0.7 }} /></a>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {tab !== "Standardizer" && activeClient && (
          <>
            {/* Client Selector Dropdown */}
            <div style={{ position: "relative" }}>
              <select 
                value={activeClient?.id || ""} 
                onChange={(e) => {
                  const client = clients.find(c => c.id === e.target.value);
                  if (client) handleClientChange(client);
                }}
                style={{ 
                  minWidth: "250px", 
                  border: "1px solid #2962FF", 
                  borderRadius: "8px", 
                  padding: "12px 40px 12px 14px", 
                  background: "#252525", 
                  color: "#E0E0E0",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  appearance: "none"
                }}
              >
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.rows.length} videos)
                  </option>
                ))}
              </select>
              <ChevronDown size={18} style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "#9E9E9E", pointerEvents: "none" }} />
            </div>
            
            {/* Last Updated */}
            {activeClient && (
              <div style={{ fontSize: "12px", color: "#666", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>Updated:</span>
                <span style={{ color: "#9E9E9E", fontWeight: "600" }}>
                  {new Date(activeClient.uploadDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            )}

            {/* PDF Export Button */}
            <PDFExport
              kpis={kpisWithChanges}
              top={top}
              filtered={filtered}
              dateRange={dateRange}
            />
            
            {/* Client Manager Button */}
            <ClientManager 
              clients={clients}
              activeClient={activeClient}
              onClientChange={handleClientChange}
              onClientsUpdate={handleClientsUpdate}
            />
          </>
        )}
        {tab !== "Standardizer" && !activeClient && (
          <ClientManager 
            clients={clients}
            activeClient={activeClient}
            onClientChange={handleClientChange}
            onClientsUpdate={handleClientsUpdate}
          />
        )}
      </div>

      {/* Sticky Filters Bar */}
      {tab !== "Standardizer" && activeClient && (
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
                </select>
              </div>

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
      )}

      {/* Main Content Area */}
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "20px 24px 40px" }}>
        {/* Welcome Screen - No Clients */}
        {!activeClient && tab !== "Standardizer" && (
          <div style={{
            textAlign: "center",
            maxWidth: "800px",
            margin: "80px auto",
            padding: "80px 40px"
          }}>
            <img 
              src="/FullView_Logo.png" 
              alt="Full View Analytics" 
              style={{ 
                width: "400px", 
                height: "auto", 
                marginBottom: "48px",
                filter: "drop-shadow(0 8px 24px rgba(41, 98, 255, 0.2))"
              }} 
            />
            <div style={{ fontSize: "32px", fontWeight: "700", color: "#fff", marginBottom: "16px" }}>
              Welcome to Full View Analytics
            </div>
            <div style={{ fontSize: "18px", color: "#9E9E9E", marginBottom: "48px", lineHeight: "1.6", maxWidth: "500px", margin: "0 auto 48px" }}>
              Get started by adding your first client. Upload a CSV export from YouTube Studio to begin analyzing performance.
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ClientManager 
                clients={clients}
                activeClient={activeClient}
                onClientChange={handleClientChange}
                onClientsUpdate={handleClientsUpdate}
              />
            </div>
          </div>
        )}

        {loading && <div style={{ background: "#1E1E1E", padding: "20px", borderRadius: "12px", textAlign: "center" }}>Loading...</div>}
        {error && <div style={{ background: "rgba(207, 102, 121, 0.1)", padding: "20px", borderRadius: "12px", color: "#CF6679" }}>{error}</div>}

        {tab === "Standardizer" && <DataStandardizer />}

        {/* Only show content when client is active */}
        {activeClient && (
          <>
            {tab === "Dashboard" && (
              <>
                {/* Channel Stats Section Title */}
                <div style={{
                  fontSize: "20px",
                  fontWeight: "700",
                  color: "#fff",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px"
                }}>
                  <BarChart3 size={22} style={{ color: "#818cf8" }} />
                  Channel Stats
                </div>

                {/* Top Level KPIs - Period + All Time */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "16px",
                  marginBottom: "24px"
                }}>
                  {/* Videos */}
                  <div style={{
                    background: "#1E1E1E",
                    border: "1px solid #333",
                    borderRadius: "12px",
                    padding: "20px",
                    position: "relative",
                    overflow: "hidden"
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "#94a3b8" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(148, 163, 184, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Video size={16} style={{ color: "#94a3b8" }} />
                      </div>
                      <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Videos</div>
                    </div>
                    <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                      {fmtInt(filtered.length)}
                    </div>
                    <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
                      <span style={{ color: "#aaa" }}>{fmtInt(allTimeKpis.count)}</span> total
                    </div>
                  </div>

                  {/* Views */}
                  <div style={{
                    background: "#1E1E1E",
                    border: "1px solid #333",
                    borderRadius: "12px",
                    padding: "20px",
                    position: "relative",
                    overflow: "hidden"
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "#818cf8" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(129, 140, 248, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Eye size={16} style={{ color: "#818cf8" }} />
                      </div>
                      <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Views</div>
                    </div>
                    <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                      {fmtInt(kpis.views)}
                    </div>
                    <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
                      <span style={{ color: "#aaa" }}>{fmtInt(allTimeKpis.views)}</span> total
                    </div>
                  </div>

                  {/* Watch Hours */}
                  <div style={{
                    background: "#1E1E1E",
                    border: "1px solid #333",
                    borderRadius: "12px",
                    padding: "20px",
                    position: "relative",
                    overflow: "hidden"
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "#a78bfa" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(167, 139, 250, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Clock size={16} style={{ color: "#a78bfa" }} />
                      </div>
                      <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Watch Hours</div>
                    </div>
                    <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                      {fmtInt(kpis.watchHours)}
                    </div>
                    <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
                      <span style={{ color: "#aaa" }}>{fmtInt(allTimeKpis.watchHours)}</span> total
                    </div>
                  </div>

                  {/* Subscribers Gained */}
                  <div style={{
                    background: "#1E1E1E",
                    border: "1px solid #333",
                    borderRadius: "12px",
                    padding: "20px",
                    position: "relative",
                    overflow: "hidden"
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "#f472b6" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(244, 114, 182, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Users size={16} style={{ color: "#f472b6" }} />
                      </div>
                      <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Subscribers</div>
                    </div>
                    <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                      {kpis.subs >= 0 ? '+' : ''}{fmtInt(kpis.subs)}
                    </div>
                    <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
                      <span style={{ color: "#aaa" }}>{allTimeKpis.subs >= 0 ? '+' : ''}{fmtInt(allTimeKpis.subs)}</span> total
                    </div>
                  </div>

                  {/* Avg Retention */}
                  <div style={{
                    background: "#1E1E1E",
                    border: "1px solid #333",
                    borderRadius: "12px",
                    padding: "20px",
                    position: "relative",
                    overflow: "hidden"
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "#34d399" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(52, 211, 153, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <BarChart3 size={16} style={{ color: "#34d399" }} />
                      </div>
                      <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Avg Retention</div>
                    </div>
                    <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                      {fmtPct(kpis.avgRet)}
                    </div>
                    <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
                      <span style={{ color: "#aaa" }}>{fmtPct(allTimeKpis.avgRet)}</span> all-time avg
                    </div>
                  </div>

                  {/* Avg CTR */}
                  <div style={{
                    background: "#1E1E1E",
                    border: "1px solid #333",
                    borderRadius: "12px",
                    padding: "20px",
                    position: "relative",
                    overflow: "hidden"
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "#fbbf24" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(251, 191, 36, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Target size={16} style={{ color: "#fbbf24" }} />
                      </div>
                      <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>Avg CTR</div>
                    </div>
                    <div style={{ fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                      {fmtPct(kpis.avgCtr)}
                    </div>
                    <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
                      <span style={{ color: "#aaa" }}>{fmtPct(allTimeKpis.avgCtr)}</span> all-time avg
                    </div>
                  </div>
                </div>

                {/* KPI Cards - Shorts vs Long-form Side by Side */}
                <div style={{
                  background: "#1E1E1E",
                  border: "1px solid #333",
                  borderRadius: "12px",
                  padding: "24px",
                  marginBottom: "24px",
                  position: "relative",
                  overflow: "hidden"
                }}>
                  {/* Gradient top border */}
                  <div style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "4px",
                    background: "linear-gradient(90deg, #f97316 0%, #0ea5e9 100%)"
                  }} />

                  {/* Header */}
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                      Shorts & Long-Form Breakdown
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                    {/* Shorts Column */}
                    <div style={{
                      background: "#252525",
                      border: "1px solid #f9731640",
                      borderRadius: "12px",
                      padding: "0",
                      position: "relative",
                      overflow: "hidden"
                    }}>
                      {/* Header */}
                      <div style={{
                        background: "linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(249, 115, 22, 0.05))",
                        padding: "16px 20px",
                        borderBottom: "1px solid #f9731640"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                          <Activity size={20} style={{ color: "#f97316" }} />
                          <div style={{ fontSize: "18px", fontWeight: "700", color: "#f97316" }}>
                            Shorts
                          </div>
                        </div>
                        <div style={{ fontSize: "11px", color: "#888" }}>
                          {kpis.shortsMetrics.count} videos in period
                        </div>
                      </div>

                      {/* Metrics */}
                      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                        {(() => {
                          // Calculate days in current period for upload frequency
                          const now = new Date();
                          let daysInPeriod = 30;
                          if (dateRange === '7d') daysInPeriod = 7;
                          else if (dateRange === '28d') daysInPeriod = 28;
                          else if (dateRange === '90d') daysInPeriod = 90;
                          else if (dateRange === 'ytd') {
                            const startOfYear = new Date(now.getFullYear(), 0, 1);
                            daysInPeriod = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
                          } else if (dateRange === 'all') {
                            const dates = filtered.filter(r => r.publishDate).map(r => new Date(r.publishDate));
                            if (dates.length > 0) {
                              daysInPeriod = Math.floor((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24)) || 30;
                            }
                          }
                          const monthsInPeriod = daysInPeriod / 30;
                          const uploadsPerMonth = monthsInPeriod > 0 ? kpis.shortsMetrics.count / monthsInPeriod : 0;

                          const metrics = [
                            {
                              icon: Activity,
                              label: "Total Uploads",
                              value: kpis.shortsMetrics.count,
                              prevValue: previousKpis.shortsMetrics.count,
                              color: "#f97316",
                              format: fmtInt,
                              subtext: `${uploadsPerMonth.toFixed(1)} per month`
                            },
                            {
                              icon: Eye,
                              label: "Views",
                              value: kpis.shortsMetrics.views,
                              prevValue: previousKpis.shortsMetrics.views,
                              color: "#3b82f6",
                              format: fmtInt
                            },
                            {
                              icon: Clock,
                              label: "Watch Hours",
                              value: kpis.shortsMetrics.watchHours,
                              prevValue: previousKpis.shortsMetrics.watchHours,
                              color: "#8b5cf6",
                              format: fmtInt
                            },
                            {
                              icon: Users,
                              label: "Subscribers",
                              value: kpis.shortsMetrics.subs,
                              prevValue: previousKpis.shortsMetrics.subs,
                              color: "#10b981",
                              format: fmtInt
                            },
                            {
                              icon: Target,
                              label: "Avg Retention",
                              value: kpis.shortsMetrics.avgRet,
                              prevValue: previousKpis.shortsMetrics.avgRet,
                              color: "#f59e0b",
                              format: fmtPct,
                              benchmark: 0.45
                            },
                            {
                              icon: BarChart3,
                              label: "Avg CTR",
                              value: kpis.shortsMetrics.avgCtr,
                              prevValue: previousKpis.shortsMetrics.avgCtr,
                              color: "#ec4899",
                              format: fmtPct,
                              benchmark: 0.05
                            }
                          ];

                          return metrics.map((metric, idx) => {
                            const Icon = metric.icon;
                            const delta = metric.prevValue > 0 ? ((metric.value - metric.prevValue) / metric.prevValue) * 100 : 0;
                            const isPositive = delta > 0;
                            const isNeutral = Math.abs(delta) < 0.5;
                            const Arrow = isNeutral ? null : isPositive ? TrendingUp : TrendingDown;
                            const deltaColor = isNeutral ? "#9E9E9E" : isPositive ? "#10b981" : "#ef4444";

                            return (
                              <div key={idx} style={{
                                background: "#1E1E1E",
                                border: "1px solid #333",
                                borderRadius: "8px",
                                padding: "12px"
                              }}>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                                    <Icon size={16} style={{ color: metric.color }} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                        {metric.label}
                                      </div>
                                      <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                                        {metric.format(metric.value)}
                                      </div>
                                      {/* Subtext: comparison or custom text */}
                                      {metric.subtext ? (
                                        <div style={{ fontSize: "11px", color: "#666", fontStyle: "italic" }}>
                                          {metric.subtext}
                                        </div>
                                      ) : metric.prevValue > 0 && (
                                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                          {Arrow && <Arrow size={12} style={{ color: deltaColor }} />}
                                          <div style={{ fontSize: "11px", fontWeight: "600", color: deltaColor }}>
                                            {isNeutral ? "No change" : `${isPositive ? "+" : ""}${delta.toFixed(1)}%`} vs previous
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {metric.benchmark !== undefined && (
                                    <div style={{
                                      fontSize: "16px",
                                      marginLeft: "8px",
                                      color: metric.value >= metric.benchmark ? "#10b981" : "#ef4444"
                                    }}>
                                      {metric.value >= metric.benchmark ? "✓" : "✗"}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Long-form Column */}
                    <div style={{
                      background: "#252525",
                      border: "1px solid #0ea5e940",
                      borderRadius: "12px",
                      padding: "0",
                      position: "relative",
                      overflow: "hidden"
                    }}>
                      {/* Header */}
                      <div style={{
                        background: "linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(14, 165, 233, 0.05))",
                        padding: "16px 20px",
                        borderBottom: "1px solid #0ea5e940"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                          <PlaySquare size={20} style={{ color: "#0ea5e9" }} />
                          <div style={{ fontSize: "18px", fontWeight: "700", color: "#0ea5e9" }}>
                            Long-form
                          </div>
                        </div>
                        <div style={{ fontSize: "11px", color: "#888" }}>
                          {kpis.longsMetrics.count} videos in period
                        </div>
                      </div>

                      {/* Metrics */}
                      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                        {(() => {
                          // Calculate days in current period for upload frequency
                          const now = new Date();
                          let daysInPeriod = 30;
                          if (dateRange === '7d') daysInPeriod = 7;
                          else if (dateRange === '28d') daysInPeriod = 28;
                          else if (dateRange === '90d') daysInPeriod = 90;
                          else if (dateRange === 'ytd') {
                            const startOfYear = new Date(now.getFullYear(), 0, 1);
                            daysInPeriod = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
                          } else if (dateRange === 'all') {
                            const dates = filtered.filter(r => r.publishDate).map(r => new Date(r.publishDate));
                            if (dates.length > 0) {
                              daysInPeriod = Math.floor((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24)) || 30;
                            }
                          }
                          const monthsInPeriod = daysInPeriod / 30;
                          const uploadsPerMonth = monthsInPeriod > 0 ? kpis.longsMetrics.count / monthsInPeriod : 0;

                          const metrics = [
                            {
                              icon: PlaySquare,
                              label: "Total Uploads",
                              value: kpis.longsMetrics.count,
                              prevValue: previousKpis.longsMetrics.count,
                              color: "#0ea5e9",
                              format: fmtInt,
                              subtext: `${uploadsPerMonth.toFixed(1)} per month`
                            },
                            {
                              icon: Eye,
                              label: "Views",
                              value: kpis.longsMetrics.views,
                              prevValue: previousKpis.longsMetrics.views,
                              color: "#3b82f6",
                              format: fmtInt
                            },
                            {
                              icon: Clock,
                              label: "Watch Hours",
                              value: kpis.longsMetrics.watchHours,
                              prevValue: previousKpis.longsMetrics.watchHours,
                              color: "#8b5cf6",
                              format: fmtInt
                            },
                            {
                              icon: Users,
                              label: "Subscribers",
                              value: kpis.longsMetrics.subs,
                              prevValue: previousKpis.longsMetrics.subs,
                              color: "#10b981",
                              format: fmtInt
                            },
                            {
                              icon: Target,
                              label: "Avg Retention",
                              value: kpis.longsMetrics.avgRet,
                              prevValue: previousKpis.longsMetrics.avgRet,
                              color: "#f59e0b",
                              format: fmtPct,
                              benchmark: 0.45
                            },
                            {
                              icon: BarChart3,
                              label: "Avg CTR",
                              value: kpis.longsMetrics.avgCtr,
                              prevValue: previousKpis.longsMetrics.avgCtr,
                              color: "#ec4899",
                              format: fmtPct,
                              benchmark: 0.05
                            }
                          ];

                          return metrics.map((metric, idx) => {
                            const Icon = metric.icon;
                            const delta = metric.prevValue > 0 ? ((metric.value - metric.prevValue) / metric.prevValue) * 100 : 0;
                            const isPositive = delta > 0;
                            const isNeutral = Math.abs(delta) < 0.5;
                            const Arrow = isNeutral ? null : isPositive ? TrendingUp : TrendingDown;
                            const deltaColor = isNeutral ? "#9E9E9E" : isPositive ? "#10b981" : "#ef4444";

                            return (
                              <div key={idx} style={{
                                background: "#1E1E1E",
                                border: "1px solid #333",
                                borderRadius: "8px",
                                padding: "12px"
                              }}>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                                    <Icon size={16} style={{ color: metric.color }} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                        {metric.label}
                                      </div>
                                      <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                                        {metric.format(metric.value)}
                                      </div>
                                      {/* Subtext: comparison or custom text */}
                                      {metric.subtext ? (
                                        <div style={{ fontSize: "11px", color: "#666", fontStyle: "italic" }}>
                                          {metric.subtext}
                                        </div>
                                      ) : metric.prevValue > 0 && (
                                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                          {Arrow && <Arrow size={12} style={{ color: deltaColor }} />}
                                          <div style={{ fontSize: "11px", fontWeight: "600", color: deltaColor }}>
                                            {isNeutral ? "No change" : `${isPositive ? "+" : ""}${delta.toFixed(1)}%`} vs previous
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {metric.benchmark !== undefined && (
                                    <div style={{
                                      fontSize: "16px",
                                      marginLeft: "8px",
                                      color: metric.value >= metric.benchmark ? "#10b981" : "#ef4444"
                                    }}>
                                      {metric.value >= metric.benchmark ? "✓" : "✗"}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dataset Info Note */}
                {rows.length > 0 && (
                  <div style={{
                    textAlign: "right",
                    fontSize: "12px",
                    color: "#666",
                    marginBottom: "20px",
                    fontStyle: "italic"
                  }}>
                    Analyzing top {rows.length} channel videos from dataset
                  </div>
                )}

                {/* Visual Separator */}
                <div style={{ height: "32px", display: "flex", alignItems: "center", marginBottom: "20px" }}>
                  <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, transparent, #333, transparent)" }}></div>
                </div>


                {/* Top Videos */}
                <TopVideos rows={filtered} n={8} />

                {/* Upload Cadence Visualization */}
                <PublishingTimeline rows={filtered} dateRange={dateRange} />

                {/* Brand Funnel - Conversion Funnel Analysis */}
                <BrandFunnel rows={filtered} dateRange={dateRange} />

                {/* Performance Timeline - MOVED UP */}
                <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", marginBottom: "20px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)" }} />
                  <div style={{ padding: "20px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <TrendingUp size={20} style={{ color: "#3b82f6" }} />
                      <div style={{ fontSize: "18px", fontWeight: "700" }}>Performance Timeline</div>
                    </div>
                    <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value)} style={{ border: "1px solid #3b82f6", background: "#252525", borderRadius: "8px", padding: "8px 12px", color: "#E0E0E0", fontSize: "13px", cursor: "pointer", fontWeight: "600" }}>
                      <option value="views">📈 Views</option>
                      <option value="watchHours">⏱️ Watch Hours</option>
                    </select>
                  </div>
                  <Chart rows={filtered} metric={chartMetric} />
                </div>

                {/* Format Performance Comparison - MOVED TO BOTTOM */}
                <div style={{
                  background: "#1E1E1E",
                  border: "1px solid #333",
                  borderRadius: "12px",
                  padding: "24px",
                  marginBottom: "20px",
                  position: "relative",
                  overflow: "hidden"
                }}>
                  {/* Gradient top border */}
                  <div style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "4px",
                    background: "linear-gradient(90deg, #f97316 0%, #0ea5e9 100%)"
                  }} />

                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "6px" }}>
                      Format Performance Comparison
                    </div>
                    <div style={{ fontSize: "13px", color: "#9E9E9E" }}>
                      Individual metrics and channel contribution by format
                    </div>
                  </div>

                  {/* Individual Format Metrics (Apples-to-Apples) */}
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "12px" }}>
                      Individual Format Metrics
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                      {/* Shorts Individual Metrics */}
                      <div style={{
                        background: "#252525",
                        border: "2px solid #f9731640",
                        borderRadius: "10px",
                        padding: "20px"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                          <div style={{ fontSize: "16px", fontWeight: "700", color: "#f97316" }}>Shorts</div>
                          <div style={{ fontSize: "11px", color: "#666", background: "#1a1a1a", padding: "3px 8px", borderRadius: "4px" }}>
                            {kpis.shortsMetrics.count} videos
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                          <div>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Views per Video</div>
                            <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                              {fmtInt(kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.views / kpis.shortsMetrics.count : 0)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Subs per Video</div>
                            <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                              {fmtInt(kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.subs / kpis.shortsMetrics.count : 0)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Watch Time per Video</div>
                            <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                              {(kpis.shortsMetrics.count > 0 ? (kpis.shortsMetrics.watchHours / kpis.shortsMetrics.count) * 60 : 0).toFixed(1)} min
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Impressions per Video</div>
                            <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                              {fmtInt(kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.imps / kpis.shortsMetrics.count : 0)}
                            </div>
                          </div>
                          <div style={{ borderTop: "1px solid #333", paddingTop: "12px", marginTop: "4px" }}>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg CTR</div>
                            <div style={{ fontSize: "16px", fontWeight: "600", color: "#fff" }}>
                              {fmtPct(kpis.shortsMetrics.avgCtr)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Retention</div>
                            <div style={{ fontSize: "16px", fontWeight: "600", color: "#fff" }}>
                              {fmtPct(kpis.shortsMetrics.avgRet)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Long-form Individual Metrics */}
                      <div style={{
                        background: "#252525",
                        border: "2px solid #0ea5e940",
                        borderRadius: "10px",
                        padding: "20px"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                          <div style={{ fontSize: "16px", fontWeight: "700", color: "#0ea5e9" }}>Long-form</div>
                          <div style={{ fontSize: "11px", color: "#666", background: "#1a1a1a", padding: "3px 8px", borderRadius: "4px" }}>
                            {kpis.longsMetrics.count} videos
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                          <div>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Views per Video</div>
                            <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                              {fmtInt(kpis.longsMetrics.count > 0 ? kpis.longsMetrics.views / kpis.longsMetrics.count : 0)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Subs per Video</div>
                            <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                              {fmtInt(kpis.longsMetrics.count > 0 ? kpis.longsMetrics.subs / kpis.longsMetrics.count : 0)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Watch Time per Video</div>
                            <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                              {(kpis.longsMetrics.count > 0 ? (kpis.longsMetrics.watchHours / kpis.longsMetrics.count) * 60 : 0).toFixed(1)} min
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Impressions per Video</div>
                            <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                              {fmtInt(kpis.longsMetrics.count > 0 ? kpis.longsMetrics.imps / kpis.longsMetrics.count : 0)}
                            </div>
                          </div>
                          <div style={{ borderTop: "1px solid #333", paddingTop: "12px", marginTop: "4px" }}>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg CTR</div>
                            <div style={{ fontSize: "16px", fontWeight: "600", color: "#fff" }}>
                              {fmtPct(kpis.longsMetrics.avgCtr)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Avg Retention</div>
                            <div style={{ fontSize: "16px", fontWeight: "600", color: "#fff" }}>
                              {fmtPct(kpis.longsMetrics.avgRet)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Channel Contribution Stats */}
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "12px" }}>
                      Channel Contribution
                    </div>
                    <div style={{
                      background: "#252525",
                      border: "1px solid #333",
                      borderRadius: "10px",
                      padding: "24px"
                    }}>

                      {/* Top Row: Production Mix + 3 Donut Charts */}
                      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr 1fr", gap: "24px", marginBottom: "24px" }}>

                        {/* Production Mix - Color Outlined Box */}
                        <div style={{
                          background: "#1a1a1a",
                          border: "2px solid",
                          borderImage: "linear-gradient(135deg, #f97316 0%, #0ea5e9 100%) 1",
                          borderRadius: "8px",
                          padding: "20px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center"
                        }}>
                          <div style={{ fontSize: "13px", color: "#888", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                            Production Mix
                          </div>
                          <div style={{ fontSize: "42px", fontWeight: "700", color: "#fff", marginBottom: "8px", lineHeight: "1" }}>
                            {kpis.longsMetrics.count > 0
                              ? (kpis.shortsMetrics.count / kpis.longsMetrics.count).toFixed(1)
                              : "0"
                            }:1
                          </div>
                          <div style={{ fontSize: "11px", color: "#666", textAlign: "center", lineHeight: "1.3" }}>
                            Shorts per<br />Long-form
                          </div>
                        </div>

                        {/* Total Views Distribution - Donut Chart */}
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "flex-start"
                        }}>
                          <div style={{ fontSize: "13px", color: "#fff", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                            Total Views
                          </div>

                          {/* Donut Chart */}
                          <svg width="140" height="140" viewBox="0 0 100 100" style={{ marginBottom: "12px" }}>
                            <circle cx="50" cy="50" r="35" fill="none" stroke="#1a1a1a" strokeWidth="18" />
                            <circle
                              cx="50"
                              cy="50"
                              r="35"
                              fill="none"
                              stroke="#f97316"
                              strokeWidth="18"
                              strokeDasharray={`${((kpis.shortsMetrics.views + kpis.longsMetrics.views) > 0 ? (kpis.shortsMetrics.views / (kpis.shortsMetrics.views + kpis.longsMetrics.views)) : 0.5) * 219.8} 219.8`}
                              transform="rotate(-90 50 50)"
                              strokeLinecap="round"
                            />
                            <circle
                              cx="50"
                              cy="50"
                              r="35"
                              fill="none"
                              stroke="#0ea5e9"
                              strokeWidth="18"
                              strokeDasharray={`${((kpis.shortsMetrics.views + kpis.longsMetrics.views) > 0 ? (kpis.longsMetrics.views / (kpis.shortsMetrics.views + kpis.longsMetrics.views)) : 0.5) * 219.8} 219.8`}
                              transform={`rotate(${((kpis.shortsMetrics.views + kpis.longsMetrics.views) > 0 ? (kpis.shortsMetrics.views / (kpis.shortsMetrics.views + kpis.longsMetrics.views)) : 0.5) * 360 - 90} 50 50)`}
                              strokeLinecap="round"
                            />
                          </svg>

                          {/* Legend */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#f97316" }} />
                                  <span style={{ fontSize: "12px", color: "#f97316", fontWeight: "600" }}>Shorts</span>
                                </div>
                                <div style={{ fontSize: "10px", color: "#666", marginLeft: "16px" }}>
                                  {fmtInt(kpis.shortsMetrics.views)}
                                </div>
                              </div>
                              <div style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>
                                {fmtPct(kpis.shortsMetrics.views / (kpis.shortsMetrics.views + kpis.longsMetrics.views))}
                              </div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#0ea5e9" }} />
                                  <span style={{ fontSize: "12px", color: "#0ea5e9", fontWeight: "600" }}>Long-form</span>
                                </div>
                                <div style={{ fontSize: "10px", color: "#666", marginLeft: "16px" }}>
                                  {fmtInt(kpis.longsMetrics.views)}
                                </div>
                              </div>
                              <div style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>
                                {fmtPct(kpis.longsMetrics.views / (kpis.shortsMetrics.views + kpis.longsMetrics.views))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Total Subscribers Distribution - Donut Chart */}
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "flex-start"
                        }}>
                          <div style={{ fontSize: "13px", color: "#fff", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                            Total Subscribers
                          </div>

                          {/* Donut Chart */}
                          <svg width="140" height="140" viewBox="0 0 100 100" style={{ marginBottom: "12px" }}>
                            <circle cx="50" cy="50" r="35" fill="none" stroke="#1a1a1a" strokeWidth="18" />
                            <circle
                              cx="50"
                              cy="50"
                              r="35"
                              fill="none"
                              stroke="#f97316"
                              strokeWidth="18"
                              strokeDasharray={`${((kpis.shortsMetrics.subs + kpis.longsMetrics.subs) > 0 ? (kpis.shortsMetrics.subs / (kpis.shortsMetrics.subs + kpis.longsMetrics.subs)) : 0.5) * 219.8} 219.8`}
                              transform="rotate(-90 50 50)"
                              strokeLinecap="round"
                            />
                            <circle
                              cx="50"
                              cy="50"
                              r="35"
                              fill="none"
                              stroke="#0ea5e9"
                              strokeWidth="18"
                              strokeDasharray={`${((kpis.shortsMetrics.subs + kpis.longsMetrics.subs) > 0 ? (kpis.longsMetrics.subs / (kpis.shortsMetrics.subs + kpis.longsMetrics.subs)) : 0.5) * 219.8} 219.8`}
                              transform={`rotate(${((kpis.shortsMetrics.subs + kpis.longsMetrics.subs) > 0 ? (kpis.shortsMetrics.subs / (kpis.shortsMetrics.subs + kpis.longsMetrics.subs)) : 0.5) * 360 - 90} 50 50)`}
                              strokeLinecap="round"
                            />
                          </svg>

                          {/* Legend */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#f97316" }} />
                                  <span style={{ fontSize: "12px", color: "#f97316", fontWeight: "600" }}>Shorts</span>
                                </div>
                                <div style={{ fontSize: "10px", color: "#666", marginLeft: "16px" }}>
                                  {fmtInt(kpis.shortsMetrics.subs)}
                                </div>
                              </div>
                              <div style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>
                                {fmtPct(kpis.shortsMetrics.subs / (kpis.shortsMetrics.subs + kpis.longsMetrics.subs))}
                              </div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#0ea5e9" }} />
                                  <span style={{ fontSize: "12px", color: "#0ea5e9", fontWeight: "600" }}>Long-form</span>
                                </div>
                                <div style={{ fontSize: "10px", color: "#666", marginLeft: "16px" }}>
                                  {fmtInt(kpis.longsMetrics.subs)}
                                </div>
                              </div>
                              <div style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>
                                {fmtPct(kpis.longsMetrics.subs / (kpis.shortsMetrics.subs + kpis.longsMetrics.subs))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Total Reach Distribution - Donut Chart */}
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "flex-start"
                        }}>
                          <div style={{ fontSize: "13px", color: "#fff", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                            Total Reach
                          </div>

                          {/* Donut Chart */}
                          <svg width="140" height="140" viewBox="0 0 100 100" style={{ marginBottom: "12px" }}>
                            <circle cx="50" cy="50" r="35" fill="none" stroke="#1a1a1a" strokeWidth="18" />
                            <circle
                              cx="50"
                              cy="50"
                              r="35"
                              fill="none"
                              stroke="#f97316"
                              strokeWidth="18"
                              strokeDasharray={`${((kpis.shortsMetrics.imps + kpis.longsMetrics.imps) > 0 ? (kpis.shortsMetrics.imps / (kpis.shortsMetrics.imps + kpis.longsMetrics.imps)) : 0.5) * 219.8} 219.8`}
                              transform="rotate(-90 50 50)"
                              strokeLinecap="round"
                            />
                            <circle
                              cx="50"
                              cy="50"
                              r="35"
                              fill="none"
                              stroke="#0ea5e9"
                              strokeWidth="18"
                              strokeDasharray={`${((kpis.shortsMetrics.imps + kpis.longsMetrics.imps) > 0 ? (kpis.longsMetrics.imps / (kpis.shortsMetrics.imps + kpis.longsMetrics.imps)) : 0.5) * 219.8} 219.8`}
                              transform={`rotate(${((kpis.shortsMetrics.imps + kpis.longsMetrics.imps) > 0 ? (kpis.shortsMetrics.imps / (kpis.shortsMetrics.imps + kpis.longsMetrics.imps)) : 0.5) * 360 - 90} 50 50)`}
                              strokeLinecap="round"
                            />
                          </svg>

                          {/* Legend */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#f97316" }} />
                                  <span style={{ fontSize: "12px", color: "#f97316", fontWeight: "600" }}>Shorts</span>
                                </div>
                                <div style={{ fontSize: "10px", color: "#666", marginLeft: "16px" }}>
                                  {fmtInt(kpis.shortsMetrics.imps)}
                                </div>
                              </div>
                              <div style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>
                                {fmtPct(kpis.shortsMetrics.imps / (kpis.shortsMetrics.imps + kpis.longsMetrics.imps))}
                              </div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#0ea5e9" }}  />
                                  <span style={{ fontSize: "12px", color: "#0ea5e9", fontWeight: "600" }}>Long-form</span>
                                </div>
                                <div style={{ fontSize: "10px", color: "#666", marginLeft: "16px" }}>
                                  {fmtInt(kpis.longsMetrics.imps)}
                                </div>
                              </div>
                              <div style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>
                                {fmtPct(kpis.longsMetrics.imps / (kpis.shortsMetrics.imps + kpis.longsMetrics.imps))}
                              </div>
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* Bottom Row: Insights */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr 1fr",
                        gap: "16px",
                        paddingTop: "16px",
                        borderTop: "1px solid #333"
                      }}>

                        {/* Discovery Advantage */}
                        <div style={{
                          background: "#1a1a1a",
                          padding: "20px",
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between"
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                              Discovery Advantage
                            </div>
                            {(() => {
                              const shortsImpsPerVideo = kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.imps / kpis.shortsMetrics.count : 0;
                              const longsImpsPerVideo = kpis.longsMetrics.count > 0 ? kpis.longsMetrics.imps / kpis.longsMetrics.count : 0;
                              const advantage = shortsImpsPerVideo > longsImpsPerVideo ? "Shorts" : "Long-form";
                              const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";

                              return (
                                <div style={{ fontSize: "13px", color: "#b0b0b0", lineHeight: "1.5" }}>
                                  <span style={{ color: advantageColor, fontWeight: "600" }}>{advantage}</span> impressions per video
                                </div>
                              );
                            })()}
                          </div>
                          {(() => {
                            const shortsImpsPerVideo = kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.imps / kpis.shortsMetrics.count : 0;
                            const longsImpsPerVideo = kpis.longsMetrics.count > 0 ? kpis.longsMetrics.imps / kpis.longsMetrics.count : 0;
                            const advantage = shortsImpsPerVideo > longsImpsPerVideo ? "Shorts" : "Long-form";
                            const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";
                            const multiplier = Math.max(shortsImpsPerVideo, longsImpsPerVideo) / Math.min(shortsImpsPerVideo, longsImpsPerVideo);

                            return (
                              <div style={{
                                fontSize: "32px",
                                fontWeight: "700",
                                color: advantageColor,
                                marginLeft: "16px",
                                flexShrink: 0
                              }}>
                                {multiplier.toFixed(1)}x
                              </div>
                            );
                          })()}
                        </div>

                        {/* Subscriber Efficiency */}
                        <div style={{
                          background: "#1a1a1a",
                          padding: "20px",
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between"
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                              Subscriber Efficiency
                            </div>
                            {(() => {
                              const shortsSubsPerVideo = kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.subs / kpis.shortsMetrics.count : 0;
                              const longsSubsPerVideo = kpis.longsMetrics.count > 0 ? kpis.longsMetrics.subs / kpis.longsMetrics.count : 0;
                              const advantage = shortsSubsPerVideo > longsSubsPerVideo ? "Shorts" : "Long-form";
                              const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";

                              return (
                                <div style={{ fontSize: "13px", color: "#b0b0b0", lineHeight: "1.5" }}>
                                  <span style={{ color: advantageColor, fontWeight: "600" }}>{advantage}</span> subs per video
                                </div>
                              );
                            })()}
                          </div>
                          {(() => {
                            const shortsSubsPerVideo = kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.subs / kpis.shortsMetrics.count : 0;
                            const longsSubsPerVideo = kpis.longsMetrics.count > 0 ? kpis.longsMetrics.subs / kpis.longsMetrics.count : 0;
                            const advantage = shortsSubsPerVideo > longsSubsPerVideo ? "Shorts" : "Long-form";
                            const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";
                            const multiplier = Math.max(shortsSubsPerVideo, longsSubsPerVideo) / Math.min(shortsSubsPerVideo, longsSubsPerVideo);

                            return (
                              <div style={{
                                fontSize: "32px",
                                fontWeight: "700",
                                color: advantageColor,
                                marginLeft: "16px",
                                flexShrink: 0
                              }}>
                                {multiplier.toFixed(1)}x
                              </div>
                            );
                          })()}
                        </div>

                        {/* Engagement Rate */}
                        <div style={{
                          background: "#1a1a1a",
                          padding: "20px",
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between"
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                              Engagement Rate
                            </div>
                            {(() => {
                              const shortsEngagement = kpis.shortsMetrics.imps > 0 ? kpis.shortsMetrics.views / kpis.shortsMetrics.imps : 0;
                              const longsEngagement = kpis.longsMetrics.imps > 0 ? kpis.longsMetrics.views / kpis.longsMetrics.imps : 0;
                              const advantage = shortsEngagement > longsEngagement ? "Shorts" : "Long-form";
                              const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";

                              return (
                                <div style={{ fontSize: "13px", color: "#b0b0b0", lineHeight: "1.5" }}>
                                  <span style={{ color: advantageColor, fontWeight: "600" }}>{advantage}</span> views per impression
                                </div>
                              );
                            })()}
                          </div>
                          {(() => {
                            const shortsEngagement = kpis.shortsMetrics.imps > 0 ? kpis.shortsMetrics.views / kpis.shortsMetrics.imps : 0;
                            const longsEngagement = kpis.longsMetrics.imps > 0 ? kpis.longsMetrics.views / kpis.longsMetrics.imps : 0;
                            const advantage = shortsEngagement > longsEngagement ? "Shorts" : "Long-form";
                            const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";
                            const multiplier = Math.max(shortsEngagement, longsEngagement) / Math.min(shortsEngagement, longsEngagement);

                            return (
                              <div style={{
                                fontSize: "32px",
                                fontWeight: "700",
                                color: advantageColor,
                                marginLeft: "16px",
                                flexShrink: 0
                              }}>
                                {multiplier.toFixed(1)}x
                              </div>
                            );
                          })()}
                        </div>

                        {/* Watch Time Efficiency */}
                        <div style={{
                          background: "#1a1a1a",
                          padding: "20px",
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between"
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                              Watch Time Efficiency
                            </div>
                            {(() => {
                              const shortsWatchPerVideo = kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.watchHours / kpis.shortsMetrics.count : 0;
                              const longsWatchPerVideo = kpis.longsMetrics.count > 0 ? kpis.longsMetrics.watchHours / kpis.longsMetrics.count : 0;
                              const advantage = shortsWatchPerVideo > longsWatchPerVideo ? "Shorts" : "Long-form";
                              const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";

                              return (
                                <div style={{ fontSize: "13px", color: "#b0b0b0", lineHeight: "1.5" }}>
                                  <span style={{ color: advantageColor, fontWeight: "600" }}>{advantage}</span> watch hours per video
                                </div>
                              );
                            })()}
                          </div>
                          {(() => {
                            const shortsWatchPerVideo = kpis.shortsMetrics.count > 0 ? kpis.shortsMetrics.watchHours / kpis.shortsMetrics.count : 0;
                            const longsWatchPerVideo = kpis.longsMetrics.count > 0 ? kpis.longsMetrics.watchHours / kpis.longsMetrics.count : 0;
                            const advantage = shortsWatchPerVideo > longsWatchPerVideo ? "Shorts" : "Long-form";
                            const advantageColor = advantage === "Shorts" ? "#f97316" : "#0ea5e9";
                            const multiplier = Math.max(shortsWatchPerVideo, longsWatchPerVideo) / Math.min(shortsWatchPerVideo, longsWatchPerVideo);

                            return (
                              <div style={{
                                fontSize: "32px",
                                fontWeight: "700",
                                color: advantageColor,
                                marginLeft: "16px",
                                flexShrink: 0
                              }}>
                                {multiplier.toFixed(1)}x
                              </div>
                            );
                          })()}
                        </div>

                      </div>

                    </div>
                  </div>
                </div>
              </>
            )}

            {tab === "Strategy" && (
              <UnifiedStrategy
                rows={filtered}
                channelSubscriberCount={(() => {
                  // Calculate subscriber count from the Total row in the data
                  if (!activeClient?.rows) return 0;

                  // Get all rows for the selected channel(s)
                  let relevantRows = activeClient.rows;
                  if (selectedChannel !== "all") {
                    relevantRows = relevantRows.filter(r =>
                      r.channel === selectedChannel
                    );
                  }

                  // Find the Total row (marked with isTotal flag)
                  const totalRow = relevantRows.find(r => r.isTotal === true);

                  if (totalRow) {
                    const count = totalRow.subscribers || 0;
                    console.log(`Found Total row for channel "${selectedChannel}":`, count);
                    return count;
                  }

                  // WARNING: No Total row found
                  // Summing "subscribers gained" is INACCURATE because:
                  // - It includes historical gains but not losses (unsubscribes)
                  // - Result is cumulative history, not current total
                  // For now, return 0 to indicate missing data
                  console.warn(`No Total row found for channel "${selectedChannel}". Cannot determine accurate subscriber count.`);
                  console.warn('To fix: Export data from YouTube Studio with "Total" row included (usually at the bottom of the CSV).');

                  // Return 0 instead of inaccurate sum
                  return 0;
                })()}
              />
            )}

            {tab === "Competitors" && (
              <CompetitorAnalysis rows={filtered} />
            )}

            {tab === "Intelligence" && (
              <EnhancedContentIntelligence rows={filtered} activeClient={activeClient} />
            )}

            {tab === "Video Ideation" && (
              <VideoIdeaGenerator data={filtered} activeClient={activeClient} />
            )}

            {tab === "Comments" && (
              <CommentAnalysis data={filtered} />
            )}

            {tab === "Channel Summary" && (
              <AIExecutiveSummary
                rows={rows}
                analysis={(() => {
                  // Pass the same analysis data that ExecutiveSummary uses
                  const now = new Date();
                  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                  const currentMonth = rows.filter(r => r.publishDate && new Date(r.publishDate) >= thirtyDaysAgo);
                  return { currentMonth };
                })()}
                activeClient={activeClient}
              />
            )}

            {tab === "API Settings" && (
              <APISettings />
            )}

            {tab === "OldStrategist_TO_DELETE" && (
              <>
                {/* TEMPORARY - WILL DELETE - Week-over-Week Performance Card */}
                <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", padding: "24px", marginBottom: "20px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #10b981, #3b82f6, #8b5cf6)" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                    <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>📈 This Week's Performance</div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E", background: "#252525", padding: "4px 10px", borderRadius: "6px" }}>
                      Last 7 Days vs Previous 7 Days
                    </div>
                  </div>

                  {(() => {
                    const now = new Date();
                    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

                    // This week's data (last 7 days)
                    const thisWeek = rows.filter(r => {
                      if (!r.publishDate) return false;
                      const pubDate = new Date(r.publishDate);
                      return pubDate >= sevenDaysAgo && pubDate <= now;
                    });

                    // Last week's data (8-14 days ago)
                    const lastWeek = rows.filter(r => {
                      if (!r.publishDate) return false;
                      const pubDate = new Date(r.publishDate);
                      return pubDate >= fourteenDaysAgo && pubDate < sevenDaysAgo;
                    });

                    // Calculate metrics for both periods
                    const calcMetrics = (data) => {
                      const views = data.reduce((s, r) => s + (r.views || 0), 0);
                      const watchHours = data.reduce((s, r) => s + (r.watchHours || 0), 0);
                      const subs = data.reduce((s, r) => s + (r.subscribers || 0), 0);
                      const imps = data.reduce((s, r) => s + (r.impressions || 0), 0);
                      const avgCtr = imps > 0 ? data.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / imps : 0;
                      const avgRet = data.length > 0 ? data.reduce((s, r) => s + (r.retention || 0), 0) / data.length : 0;
                      return { views, watchHours, subs, avgCtr, avgRet, count: data.length };
                    };

                    const thisWeekMetrics = calcMetrics(thisWeek);
                    const lastWeekMetrics = calcMetrics(lastWeek);

                    // Calculate changes
                    const calcChange = (current, previous) => {
                      if (previous === 0) return current > 0 ? 100 : 0;
                      return ((current - previous) / previous) * 100;
                    };

                    const changes = {
                      views: calcChange(thisWeekMetrics.views, lastWeekMetrics.views),
                      watchHours: calcChange(thisWeekMetrics.watchHours, lastWeekMetrics.watchHours),
                      subs: calcChange(thisWeekMetrics.subs, lastWeekMetrics.subs),
                      ctr: calcChange(thisWeekMetrics.avgCtr, lastWeekMetrics.avgCtr),
                      retention: calcChange(thisWeekMetrics.avgRet, lastWeekMetrics.avgRet),
                      videos: thisWeekMetrics.count - lastWeekMetrics.count
                    };

                    const MetricCard = ({ label, current, change, color, isPercentage = false, icon: Icon }) => {
                      const isPositive = change > 0;
                      const isNeutral = change === 0;
                      const changeColor = isNeutral ? "#9E9E9E" : isPositive ? "#10b981" : "#ef4444";
                      
                      return (
                        <div style={{ 
                          background: "#252525", 
                          border: "1px solid #333", 
                          borderRadius: "8px", 
                          padding: "16px",
                          position: "relative",
                          overflow: "hidden"
                        }}>
                          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: color }} />
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                            <Icon size={12} style={{ color }} />
                            <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", textTransform: "uppercase" }}>
                              {label}
                            </div>
                          </div>
                          <div style={{ fontSize: "24px", fontWeight: "700", color, marginBottom: "4px" }}>
                            {isPercentage ? fmtPct(current) : fmtInt(current)}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                            <span style={{ color: changeColor, fontWeight: "600" }}>
                              {isNeutral ? "—" : isPositive ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
                            </span>
                            <span style={{ color: "#666", fontSize: "11px" }}>vs last week</span>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <>
                        {/* KPI Comparison Grid */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "24px" }}>
                          <MetricCard 
                            label="Views" 
                            current={thisWeekMetrics.views} 
                            change={changes.views} 
                            color="#3b82f6"
                            icon={Eye}
                          />
                          <MetricCard 
                            label="Watch Hours" 
                            current={thisWeekMetrics.watchHours} 
                            change={changes.watchHours} 
                            color="#8b5cf6"
                            icon={Clock}
                          />
                          <MetricCard 
                            label="Subscribers" 
                            current={thisWeekMetrics.subs} 
                            change={changes.subs} 
                            color="#10b981"
                            icon={Users}
                          />
                          <MetricCard 
                            label="Avg Retention" 
                            current={thisWeekMetrics.avgRet} 
                            change={changes.retention} 
                            color="#f59e0b"
                            isPercentage={true}
                            icon={Target}
                          />
                          <MetricCard 
                            label="Avg CTR" 
                            current={thisWeekMetrics.avgCtr} 
                            change={changes.ctr} 
                            color="#ec4899"
                            isPercentage={true}
                            icon={BarChart3}
                          />
                        </div>

                        {/* Publishing Activity */}
                        <div style={{ background: "#252525", border: "1px solid #333", borderRadius: "8px", padding: "16px" }}>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            📅 Publishing This Week: {thisWeekMetrics.count} video{thisWeekMetrics.count !== 1 ? 's' : ''}
                            {changes.videos !== 0 && (
                              <span style={{ 
                                fontSize: "12px", 
                                color: changes.videos > 0 ? "#10b981" : "#ef4444",
                                background: changes.videos > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontWeight: "600"
                              }}>
                                {changes.videos > 0 ? "+" : ""}{changes.videos} vs last week
                              </span>
                            )}
                          </div>

                          {thisWeek.length === 0 ? (
                            <div style={{ color: "#9E9E9E", fontSize: "13px", fontStyle: "italic", padding: "12px 0" }}>
                              No videos published in the last 7 days
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                              {thisWeek
                                .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate))
                                .map((video, idx) => (
                                  <div key={idx} style={{ 
                                    display: "flex", 
                                    alignItems: "center", 
                                    gap: "12px",
                                    padding: "10px",
                                    background: "#1E1E1E",
                                    borderRadius: "6px",
                                    borderLeft: "3px solid #2962FF"
                                  }}>
                                    <div style={{ 
                                      fontSize: "10px", 
                                      color: "#9E9E9E",
                                      minWidth: "50px"
                                    }}>
                                      {new Date(video.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: "13px", color: "#E0E0E0", fontWeight: "600", marginBottom: "2px" }}>
                                        {video.title}
                                      </div>
                                      <div style={{ fontSize: "11px", color: "#666" }}>
                                        {video.channel}
                                      </div>
                                    </div>
                                    <div>
                                      <span style={{ 
                                        padding: "4px 8px", 
                                        borderRadius: "4px", 
                                        fontSize: "10px", 
                                        fontWeight: "600",
                                        background: video.type === "short" ? "rgba(255, 171, 0, 0.15)" : "rgba(41, 98, 255, 0.15)",
                                        color: video.type === "short" ? "#FFAB00" : "#60a5fa"
                                      }}>
                                        {video.type === "short" ? "Short" : "Long"}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: "12px", color: "#9E9E9E", minWidth: "60px", textAlign: "right" }}>
                                      {fmtInt(video.views)} views
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}

                          {/* Publishing Consistency Note */}
                          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #333", fontSize: "12px" }}>
                            {thisWeekMetrics.count >= lastWeekMetrics.count ? (
                              <div style={{ color: "#10b981", display: "flex", alignItems: "center", gap: "6px" }}>
                                ✓ <strong>Consistent publishing:</strong> Maintained or increased output vs last week
                              </div>
                            ) : lastWeekMetrics.count === 0 ? (
                              <div style={{ color: "#9E9E9E", display: "flex", alignItems: "center", gap: "6px" }}>
                                ℹ️ First week of publishing tracked
                              </div>
                            ) : (
                              <div style={{ color: "#f59e0b", display: "flex", alignItems: "center", gap: "6px" }}>
                                ⚠️ <strong>Publishing decreased:</strong> {lastWeekMetrics.count - thisWeekMetrics.count} fewer video{(lastWeekMetrics.count - thisWeekMetrics.count) !== 1 ? 's' : ''} than last week
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Executive Summary Card */}
                <div style={{ background: "linear-gradient(135deg, #1E1E1E 0%, #2A2A2A 100%)", border: "2px solid #2962FF", borderRadius: "12px", padding: "24px", marginBottom: "20px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #2962FF, #60a5fa)" }} />
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                    <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>📊 Executive Summary</div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px" }}>
                    {(() => {
                      const videoCount = filtered.length;
                      const totalViews = kpis.views;
                      const totalSubs = kpis.subs;
                      const topVideo = top[0];
                      
                      // Calculate average views per video
                      const avgViews = videoCount > 0 ? Math.round(totalViews / videoCount) : 0;
                      
                      const bulletStyle = {
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                        padding: "12px",
                        background: "#252525",
                        borderRadius: "8px",
                        borderLeft: "3px solid #2962FF"
                      };
                      
                      const bulletPoint = { 
                        color: "#2962FF", 
                        fontSize: "20px", 
                        lineHeight: "1",
                        fontWeight: "700",
                        minWidth: "8px"
                      };
                      
                      const bulletText = {
                        fontSize: "15px",
                        lineHeight: "1.5",
                        color: "#E0E0E0",
                        flex: 1
                      };

                      return (
                        <>
                          <div style={bulletStyle}>
                            <div style={bulletPoint}>•</div>
                            <div style={bulletText}>
                              <strong style={{ color: "#60a5fa" }}>{videoCount}</strong> videos published, generating{" "}
                              <strong style={{ color: "#60a5fa" }}>{fmtInt(totalViews)}</strong> total views 
                              {videoCount > 0 && <span> (avg <strong style={{ color: "#60a5fa" }}>{fmtInt(avgViews)}</strong> views per video)</span>}
                            </div>
                          </div>

                          {totalSubs > 0 && (
                            <div style={bulletStyle}>
                              <div style={bulletPoint}>•</div>
                              <div style={bulletText}>
                                Gained <strong style={{ color: "#10b981" }}>{fmtInt(totalSubs)}</strong> subscribers
                                {totalViews > 0 && (
                                  <span> — <strong>{Math.round((totalSubs / totalViews) * 1000)}</strong> subs per 1,000 views</span>
                                )}
                              </div>
                            </div>
                          )}

                          {topVideo && (
                            <div style={bulletStyle}>
                              <div style={bulletPoint}>•</div>
                              <div style={bulletText}>
                                Top performer: <strong style={{ color: "#f59e0b" }}>"{topVideo.title}"</strong> with{" "}
                                <strong style={{ color: "#f59e0b" }}>{fmtInt(topVideo.views)}</strong> views
                                {topVideo.retention > 0 && (
                                  <span> and <strong style={{ color: "#f59e0b" }}>{fmtPct(topVideo.retention)}</strong> retention</span>
                                )}
                              </div>
                            </div>
                          )}

                          {kpis.avgCtr > 0 && kpis.avgRet > 0 && (
                            <div style={bulletStyle}>
                              <div style={bulletPoint}>•</div>
                              <div style={bulletText}>
                                Average performance: <strong style={{ color: "#ec4899" }}>{fmtPct(kpis.avgCtr)}</strong> CTR and{" "}
                                <strong style={{ color: "#ec4899" }}>{fmtPct(kpis.avgRet)}</strong> retention
                                {kpis.avgCtr >= 0.06 && kpis.avgRet >= 0.5 ? 
                                  <span style={{ color: "#10b981", marginLeft: "8px" }}>✓ Above YouTube benchmarks</span> :
                                  <span style={{ color: "#9E9E9E", marginLeft: "8px" }}>— Room for improvement</span>
                                }
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #333", fontSize: "12px", color: "#9E9E9E", fontStyle: "italic" }}>
                    💡 Tip: Screenshot this summary for your weekly report
                  </div>
                </div>

                {/* Performance Timeline */}
                <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", marginBottom: "20px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)" }} />
                  <div style={{ padding: "20px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <TrendingUp size={20} style={{ color: "#3b82f6" }} />
                      <div style={{ fontSize: "18px", fontWeight: "700" }}>Performance Timeline</div>
                    </div>
                    <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value)} style={{ border: "1px solid #3b82f6", background: "#252525", borderRadius: "8px", padding: "8px 12px", color: "#E0E0E0", fontSize: "13px", cursor: "pointer", fontWeight: "600" }}>
                      <option value="views">📈 Views</option>
                      <option value="watchHours">⏱️ Watch Hours</option>
                    </select>
                  </div>
                  <Chart rows={filtered} metric={chartMetric} />
                </div>


                {/* Top Videos Table */}
                <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", padding: "20px", marginBottom: "20px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #ec4899, #8b5cf6, #3b82f6)" }} />
                  <div style={{ fontSize: "18px", fontWeight: "600", marginBottom: "20px" }}>Top Videos</div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Title", "Type", "Length", "Views", "Retention", "CTR"].map(h => (
                          <th key={h} style={{ padding: "12px", borderBottom: "1px solid #333", textAlign: "left", color: "#9E9E9E", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", background: "#252525" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {top.map((r, i) => (
                        <tr key={i}>
                          <td style={{ padding: "12px", borderBottom: "1px solid #333" }}>
                            <div style={{ fontWeight: "600", fontSize: "14px" }}>{r.title}</div>
                            <div style={{ fontSize: "12px", color: "#666" }}>{r.channel}</div>
                          </td>
                          <td style={{ padding: "12px", borderBottom: "1px solid #333" }}>
                            <span style={{ padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "600", background: r.type === "short" ? "rgba(255, 171, 0, 0.15)" : "rgba(41, 98, 255, 0.15)", color: r.type === "short" ? "#FFAB00" : "#60a5fa" }}>
                              {r.type === "short" ? "Short" : "Long"}
                            </span>
                          </td>
                          <td style={{ padding: "12px", borderBottom: "1px solid #333", fontSize: "13px", color: "#9E9E9E" }}>
                            {Math.floor(r.duration / 60)}:{String(Math.floor(r.duration % 60)).padStart(2, '0')}
                          </td>
                          <td style={{ padding: "12px", borderBottom: "1px solid #333", fontSize: "14px" }}>{fmtInt(r.views)}</td>
                          <td style={{ padding: "12px", borderBottom: "1px solid #333", fontSize: "14px", color: r.retention > 0.4 ? "#00C853" : r.retention > 0.25 ? "#FFAB00" : "#CF6679" }}>{fmtPct(r.retention)}</td>
                          <td style={{ padding: "12px", borderBottom: "1px solid #333", fontSize: "14px" }}>{fmtPct(r.ctr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Brand Funnel - Deep Strategic Analysis */}
                <BrandFunnel rows={filtered} dateRange={dateRange} />
              </>
            )}

            {tab === "Data" && (
              <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", padding: "40px" }}>
                <h2 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "16px" }}>Data Overview</h2>
                <p style={{ color: "#9E9E9E", marginBottom: "24px" }}>Currently loaded: <strong style={{ color: "#fff" }}>{rows.length}</strong> videos from <strong style={{ color: "#fff" }}>{channelOpts.length}</strong> channels</p>
                <p style={{ color: "#9E9E9E", fontSize: "14px" }}>Upload CSVs to add more data. Files are stored in browser memory during your session.</p>
              </div>
            )}
          </>
        )}
        {/* End activeClient wrapper */}

        {/* Footer */}
        <div style={{ marginTop: "60px", paddingTop: "32px", borderTop: "1px solid #333", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "linear-gradient(90deg, #ec4899, #8b5cf6, #6366f1, #3b82f6)" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", paddingBottom: "40px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <img src="/Full_View_Logo.png" alt="Full View Analytics" style={{ height: "56px", objectFit: "contain" }} />
              <div style={{ fontSize: "12px", color: "#9E9E9E", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                Powered by <a href="https://crux.media/" target="_blank" rel="noopener noreferrer"><img src="/crux-logo.png" alt="CRUX" style={{ height: "18px", objectFit: "contain", opacity: 0.7 }} /></a>
              </div>
            </div>
            <div style={{ fontSize: "12px", color: "#666", fontStyle: "italic" }}>
              Strategic YouTube Insights
            </div>
            <div style={{ fontSize: "11px", color: "#555", marginTop: "8px" }}>
              {new Date().getFullYear()} CRUX Analytics. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}