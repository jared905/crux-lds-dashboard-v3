import React, { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { Menu, ChevronDown } from "lucide-react";

// Auth
import { useAuth } from "./contexts/AuthContext.jsx";
import LoginPage from "./components/Auth/LoginPage.jsx";
import SignupPage from "./components/Auth/SignupPage.jsx";

// Services
import { youtubeAPI } from "./services/youtubeAPI.js";
import { getClientsFromSupabase, checkSupabaseConnection, getReportPeriod, setActivePeriod, periodVideoDataToRows } from "./services/clientDataService.js";
import { normalizeData } from "./lib/normalizeData.js";

// Layout
import Sidebar from "./components/Shared/Sidebar.jsx";
import FilterBar from "./components/Shared/FilterBar.jsx";
import PDFExport from "./components/Shared/PDFExport.jsx";
import ClientManager from "./ClientManager.jsx";
import ClientBackground from "./components/Shared/ClientBackground.jsx";

// Tab content
import DashboardPage from "./components/Performance/DashboardPage.jsx";
import DataStandardizer from "./components/Settings/DataStandardizer.jsx";
import UnifiedStrategy from "./components/Strategy/UnifiedStrategy.jsx";
import CompetitorAnalysis from "./components/Research/CompetitorAnalysis.jsx";
import CommentAnalysis from "./components/Research/CommentAnalysis.jsx";
import EnhancedContentIntelligence from "./components/ContentLab/EnhancedContentIntelligence.jsx";
import AIExecutiveSummary from "./components/Performance/AIExecutiveSummary.jsx";
import Atomizer from "./components/ContentLab/Atomizer.jsx";
import VideoIdeaGenerator from "./components/ContentLab/VideoIdeaGenerator.jsx";
import BriefsList from "./components/Strategy/BriefsList.jsx";
import UserManagement from "./components/Admin/UserManagement.jsx";
import APISettings from "./components/Settings/APISettings.jsx";

// Lazy-loaded audit feature
const AuditPage = lazy(() => import("./components/Audit/AuditPage.jsx"));

export default function App() {
  // Auth state
  const { user, loading: authLoading, isAdmin, signOut, canAccessTab, canAccessClient } = useAuth();
  const [authView, setAuthView] = useState("login"); // "login" or "signup"

  // Debug auth state
  console.log('[Auth] State:', { user: user?.email || null, authLoading, isAdmin });

  const [sidebar, setSidebar] = useState(false);
  const [tab, setTab] = useState("dashboard");
  
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
  const [customDateRange, setCustomDateRange] = useState({ start: "", end: "" });
  const [selectedChannel, setSelectedChannel] = useState("all");
  const [query, setQuery] = useState("");
  const [chartMetric, setChartMetric] = useState("views");
  const [showAllActions, setShowAllActions] = useState(false);
  const [channelStats, setChannelStats] = useState(null);
  const [channelStatsLoading, setChannelStatsLoading] = useState(false);
  const [allChannelStats, setAllChannelStats] = useState({});
  const [supabaseLoading, setSupabaseLoading] = useState(true);

  // Load clients from Supabase on startup
  useEffect(() => {
    const loadFromSupabase = async () => {
      console.log('[Supabase] Starting client load...');
      try {
        const { connected, error: connError } = await checkSupabaseConnection();
        console.log('[Supabase] Connection check:', { connected, error: connError });

        if (!connected) {
          console.log('[Supabase] Not connected, using localStorage only');
          setSupabaseLoading(false);
          return;
        }

        const supabaseClients = await getClientsFromSupabase();
        console.log('[Supabase] Fetched clients:', supabaseClients.length);

        if (supabaseClients.length > 0) {
          // Merge Supabase clients with any local-only clients
          const localOnlyClients = clients.filter(
            local => !local.syncedToSupabase && !supabaseClients.some(sb => sb.name === local.name)
          );

          // Carry over channelUrlsMap from localStorage since Supabase doesn't store it
          const supabaseWithLocalData = supabaseClients.map(sb => {
            const localMatch = clients.find(l => l.id === sb.id || l.name === sb.name);
            return localMatch?.channelUrlsMap
              ? { ...sb, channelUrlsMap: localMatch.channelUrlsMap }
              : sb;
          });

          const mergedClients = [...supabaseWithLocalData, ...localOnlyClients];
          setClients(mergedClients);

          // Set active client from Supabase data if available
          const savedId = localStorage.getItem('fullview_active_client');
          const activeFromSupabase = mergedClients.find(c => c.id === savedId) || mergedClients[0];
          if (activeFromSupabase) {
            setActiveClient(activeFromSupabase);
          }

          console.log(`[Supabase] Loaded ${supabaseClients.length} clients`);
        } else {
          console.log('[Supabase] No clients found in database');
        }
      } catch (error) {
        console.error('[Supabase] Error loading:', error);
      } finally {
        setSupabaseLoading(false);
      }
    };

    loadFromSupabase();
  }, []); // Run once on mount

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
      const { rows: clean, channelTotalSubscribers } = normalizeData(activeClient.rows);
      setRows(clean);

      // If subscriberCount wasn't set (for backwards compatibility), use the extracted value
      if (activeClient.subscriberCount === undefined && channelTotalSubscribers > 0) {
        setActiveClient({
          ...activeClient,
          subscriberCount: channelTotalSubscribers
        });

        const updatedClients = clients.map(c =>
          c.id === activeClient.id
            ? { ...c, subscriberCount: channelTotalSubscribers }
            : c
        );
        setClients(updatedClients);
      }
    } else {
      setRows([]);
    }
  }, [activeClient?.id]);

  // Fetch channel stats via server-side proxy (bypasses API key referrer restrictions)
  // Use a ref to track the last successful fetch key so we don't re-fetch for the same data
  const lastFetchKeyRef = React.useRef(null);

  useEffect(() => {
    let cancelled = false;

    const fetchChannelStats = async () => {
      if (!youtubeAPI.apiKey) {
        youtubeAPI.apiKey = youtubeAPI.loadAPIKey();
      }
      if (!youtubeAPI.apiKey || rows.length === 0) {
        // Only clear if we never had data
        if (!channelStats) setChannelStats(null);
        return;
      }

      const uniqueChannels = [...new Set(rows.map(r => r.channel).filter(Boolean))];
      const isMultiChannel = uniqueChannels.length > 1;
      const urlsMap = activeClient?.channelUrlsMap || {};

      // If viewing a single channel, only resolve that one
      const targetChannels = selectedChannel !== "all"
        ? uniqueChannels.filter(c => c === selectedChannel)
        : uniqueChannels;

      // Build a stable key to avoid redundant fetches when deps change by reference only
      const fetchKey = JSON.stringify({ channels: targetChannels, selectedChannel });
      if (lastFetchKeyRef.current === fetchKey && channelStats) {
        console.log('[SubFetch] Skipping redundant fetch, data already loaded for:', fetchKey);
        return;
      }

      // Collect multiple video IDs per channel for resolution (some may be deleted/private)
      const videoIdsByChannel = {};
      for (const chName of targetChannels) {
        const chRows = rows.filter(r => r.channel === chName);
        const ids = [...new Set(chRows.filter(r => r.youtubeVideoId && !r.isTotal).map(r => r.youtubeVideoId))].slice(0, 5);
        if (ids.length > 0) videoIdsByChannel[chName] = ids;
      }

      const allVideoIds = Object.values(videoIdsByChannel).flat().filter(Boolean);

      // Build handles list for channels without video IDs — also as fallback for ALL channels
      const handles = [];
      for (const chName of targetChannels) {
        const url = urlsMap[chName];
        if (url) {
          handles.push({ name: chName, url });
        } else if (!isMultiChannel && activeClient?.youtubeChannelUrl) {
          // Single-channel: fall back to the main channel URL
          handles.push({ name: chName, url: activeClient.youtubeChannelUrl });
        } else if (!videoIdsByChannel[chName]?.length) {
          // No video IDs and no URL: use channel name as search query
          handles.push({ name: chName, url: chName });
        }
      }

      console.log('[SubFetch] handles:', handles.length, 'videoIds:', allVideoIds.length, 'urlsMap keys:', Object.keys(urlsMap).length);

      if (allVideoIds.length === 0 && handles.length === 0) {
        console.log('[SubFetch] No video IDs or handles — skipping proxy call');
        return;
      }

      setChannelStatsLoading(true);
      try {
        // Single server-side proxy call
        const body = { apiKey: youtubeAPI.apiKey };
        if (allVideoIds.length > 0) body.videoIds = allVideoIds;
        if (handles.length > 0) body.handles = handles;

        const response = await fetch('/api/youtube-channel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          console.warn('YouTube channel proxy error:', response.status);
          // Don't clear existing data on error
          return;
        }

        const { videoResults = {}, handleResults = {}, channels = {} } = await response.json();
        console.log('[SubFetch] Proxy response:', {
          handleResults: Object.keys(handleResults).length,
          channels: Object.keys(channels).length,
          channelSubs: Object.fromEntries(Object.values(channels).map(c => [c.title, c.subscriberCount]))
        });
        if (cancelled) return;

        // Map each channel name to its YouTube channel stats (deduplicate by channelId)
        const seenYtIds = new Set();
        const statsMap = {};
        for (const chName of targetChannels) {
          let ytChannelId = null;

          // Try video-based resolution first (check all video IDs for this channel)
          const vids = videoIdsByChannel[chName] || [];
          for (const vid of vids) {
            if (videoResults[vid]) {
              ytChannelId = videoResults[vid].channelId;
              break;
            }
          }
          // Try handle-based resolution
          if (!ytChannelId && handleResults[chName]) {
            ytChannelId = handleResults[chName].channelId;
          }

          if (!ytChannelId || !channels[ytChannelId]) continue;
          if (seenYtIds.has(ytChannelId)) continue;
          seenYtIds.add(ytChannelId);
          statsMap[chName] = channels[ytChannelId];
        }

        if (cancelled) return;

        console.log('[SubFetch] statsMap:', Object.fromEntries(Object.entries(statsMap).map(([name, s]) => [name, s.subscriberCount])));

        // Only update state if we got actual data
        if (Object.keys(statsMap).length > 0) {
          lastFetchKeyRef.current = fetchKey;

          if (selectedChannel !== "all" || !isMultiChannel) {
            const chName = targetChannels[0];
            setChannelStats(statsMap[chName] || null);
            setAllChannelStats({});
          } else {
            setAllChannelStats(statsMap);
            const allStats = Object.values(statsMap);
            const totalSubs = allStats.reduce((sum, s) => sum + (s.subscriberCount || 0), 0);
            const totalViews = allStats.reduce((sum, s) => sum + (s.viewCount || 0), 0);
            const totalVideos = allStats.reduce((sum, s) => sum + (s.videoCount || 0), 0);
            console.log('[SubFetch] Total subscriber sum:', totalSubs);
            setChannelStats({ subscriberCount: totalSubs, viewCount: totalViews, videoCount: totalVideos });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch channel stats:', err);
        // Don't clear existing data on error
      } finally {
        if (!cancelled) setChannelStatsLoading(false);
      }
    };

    fetchChannelStats();
    return () => { cancelled = true; };
  }, [rows, selectedChannel, activeClient?.youtubeChannelUrl, activeClient?.channelUrlsMap]);

  const handleClientsUpdate = (updatedClients) => {
    setClients(updatedClients);
  };
  
  const handleClientChange = (client) => {
    setActiveClient(client);
  };

  const handlePeriodChange = async (periodId) => {
    if (!activeClient || !periodId) return;

    try {
      // Load the period's full data
      const fullPeriod = await getReportPeriod(periodId);
      if (!fullPeriod) return;

      // Update active period in database
      await setActivePeriod(activeClient.id, periodId);

      // Update client with period data
      const updatedClient = {
        ...activeClient,
        rows: periodVideoDataToRows(fullPeriod.video_data || []),
        activePeriod: {
          id: fullPeriod.id,
          name: fullPeriod.name,
          periodType: fullPeriod.period_type,
          startDate: fullPeriod.start_date,
          endDate: fullPeriod.end_date,
          isBaseline: fullPeriod.is_baseline,
        },
        activePeriodId: fullPeriod.id,
      };

      // Update clients list
      const updatedClients = clients.map(c =>
        c.id === activeClient.id ? updatedClient : c
      );

      setClients(updatedClients);
      setActiveClient(updatedClient);

      // Re-normalize the rows
      const { rows: clean } = normalizeData(updatedClient.rows);
      setRows(clean);

      // Reset date filter to show all videos when switching periods
      setDateRange("all");
    } catch (error) {
      console.error('Error switching period:', error);
    }
  };

  const channelOpts = useMemo(() => [...new Set(rows.map(r => r.channel).filter(Boolean))].sort(), [rows]);
  
  const filtered = useMemo(() => {
    // Always filter out Total rows from display data
    let result = rows.filter(r => !r.isTotal && r.views > 0);

    if (dateRange === "custom") {
      if (customDateRange.start) {
        const start = new Date(customDateRange.start);
        result = result.filter(r => r.publishDate && new Date(r.publishDate) >= start);
      }
      if (customDateRange.end) {
        const end = new Date(customDateRange.end);
        end.setHours(23, 59, 59, 999);
        result = result.filter(r => r.publishDate && new Date(r.publishDate) <= end);
      }
    } else if (dateRange !== "all") {
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
  }, [rows, selectedChannel, query, dateRange, customDateRange]);

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
      case 'custom': {
        if (customDateRange.start && customDateRange.end) {
          currentStart = new Date(customDateRange.start);
          const endDate = new Date(customDateRange.end);
          endDate.setHours(23, 59, 59, 999);
          const periodLength = endDate.getTime() - currentStart.getTime();
          previousStart = new Date(currentStart.getTime() - periodLength);
          previousEnd = currentStart;
        } else {
          // Not enough info for comparison, treat like "all"
          currentStart = null;
        }
        break;
      }
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

    return { views, watchHours, subs, avgCtr, avgRet, count: previousFiltered.length, shortsMetrics, longsMetrics, shortsROI, longsROI };
  }, [rows, dateRange, customDateRange, selectedChannel, query]);

  // Combine KPIs with period-over-period changes
  const kpisWithChanges = useMemo(() => {
    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const currentCount = filtered.length;
    const previousCount = previousKpis.count || 0;
    const currentAvgViews = currentCount > 0 ? kpis.views / currentCount : 0;
    const previousAvgViews = previousCount > 0 ? previousKpis.views / previousCount : 0;

    return {
      ...kpis,
      viewsChange: calculateChange(kpis.views, previousKpis.views),
      watchHoursChange: calculateChange(kpis.watchHours, previousKpis.watchHours),
      subsChange: calculateChange(kpis.subs, previousKpis.subs),
      countChange: calculateChange(currentCount, previousCount),
      avgViewsPerVideoChange: calculateChange(currentAvgViews, previousAvgViews),
    };
  }, [kpis, previousKpis, filtered.length]);

  const top = useMemo(() => [...filtered].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10), [filtered]);

  // Filter clients based on permissions
  const accessibleClients = useMemo(() => {
    if (isAdmin) return clients;
    return clients.filter(c => canAccessClient(c.id));
  }, [clients, isAdmin, canAccessClient]);

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#121212", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <img src="/Full_View_Logo.png" alt="Full View Analytics" style={{ height: "80px", marginBottom: "24px" }} />
          <div style={{ color: "#9E9E9E", fontSize: "14px" }}>Loading...</div>
        </div>
      </div>
    );
  }

  // Show login/signup if not authenticated
  if (!user) {
    if (authView === "signup") {
      return <SignupPage onSwitchToLogin={() => setAuthView("login")} />;
    }
    return <LoginPage onSwitchToSignup={() => setAuthView("signup")} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#121212", color: "#E0E0E0", position: "relative" }}>
      {/* Client-specific background image with dissolve effect */}
      <ClientBackground imageUrl={activeClient?.backgroundImageUrl || null} />

      <Sidebar
        open={sidebar}
        onClose={() => setSidebar(false)}
        tab={tab}
        setTab={setTab}
        onUpload={() => {}}
        canAccessTab={canAccessTab}
        isAdmin={isAdmin}
        onSignOut={signOut}
        userEmail={user?.email || ""}
      />
      
      <div style={{ background: "#1E1E1E", borderBottom: "1px solid #333", padding: "16px 24px", display: "flex", alignItems: "center", gap: "16px", position: "sticky", top: 0, zIndex: 100 }}>
        <button onClick={() => setSidebar(true)} style={{ background: "transparent", border: "none", color: "#E0E0E0", cursor: "pointer" }}><Menu size={24} /></button>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <img src="/Full_View_Logo.png" alt="Full View Analytics" style={{ height: "72px", objectFit: "contain" }} />
          <div style={{ fontSize: "11px", color: "#666", fontWeight: "500", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "4px", marginLeft: "40px" }}>
            POWERED BY <a href="https://crux.media/" target="_blank" rel="noopener noreferrer"><img src="/crux-logo.png" alt="CRUX" style={{ height: "18px", objectFit: "contain", opacity: 0.7 }} /></a>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {activeClient && (
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
                {accessibleClients.map(c => (
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
              customDateRange={customDateRange}
              clientName={activeClient?.name}
              selectedChannel={selectedChannel}
              allTimeKpis={allTimeKpis}
              channelStats={channelStats}
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
        {!activeClient && (
          <ClientManager
            clients={clients}
            activeClient={activeClient}
            onClientChange={handleClientChange}
            onClientsUpdate={handleClientsUpdate}
          />
        )}
      </div>

      {/* Sticky Filters Bar */}
      {activeClient && (
        <FilterBar
          dateRange={dateRange}
          setDateRange={setDateRange}
          customDateRange={customDateRange}
          setCustomDateRange={setCustomDateRange}
          selectedChannel={selectedChannel}
          setSelectedChannel={setSelectedChannel}
          channelOpts={channelOpts}
          query={query}
          setQuery={setQuery}
          // Report period props
          activePeriod={activeClient.activePeriod}
          reportPeriods={activeClient.reportPeriods}
          onPeriodChange={handlePeriodChange}
        />
      )}

      {/* Main Content Area */}
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "80px 24px 40px" }}>
        {/* Welcome Screen - No Clients */}
        {!activeClient && (
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

        {tab === "standardizer" && <DataStandardizer />}

        {/* Only show content when client is active */}
        {activeClient && (
          <>
            {tab === "dashboard" && (
              <DashboardPage
                filtered={filtered}
                rows={rows}
                kpis={kpis}
                allTimeKpis={allTimeKpis}
                previousKpis={previousKpis}
                dateRange={dateRange}
                chartMetric={chartMetric}
                setChartMetric={setChartMetric}
                channelStats={channelStats}
              />
            )}

            {tab === "actions" && (
              <UnifiedStrategy
                rows={filtered}
                activeClient={activeClient}
                channelSubscriberCount={
                  channelStats?.subscriberCount
                  ?? activeClient?.subscriberCount
                  ?? 0
                }
                channelSubscriberMap={allChannelStats}
                selectedChannel={selectedChannel}
              />
            )}

            {tab === "competitors" && (
              <CompetitorAnalysis rows={filtered} activeClient={activeClient} />
            )}

            {tab === "ideation" && (
              <VideoIdeaGenerator data={filtered} activeClient={activeClient} />
            )}

            {tab === "intelligence" && (
              <EnhancedContentIntelligence rows={filtered} activeClient={activeClient} />
            )}

            {tab === "atomizer" && (
              <Atomizer activeClient={activeClient} />
            )}

            {tab === "briefs" && (
              <BriefsList activeClient={activeClient} />
            )}

            {tab === "comments" && (
              <CommentAnalysis data={filtered} />
            )}

            {tab === "channel-summary" && (
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

          </>
        )}
        {/* End activeClient wrapper */}

        {/* Audits - works with or without a client */}
        {tab === "audits" && (
          <Suspense fallback={<div style={{ padding: "40px", textAlign: "center", color: "#9E9E9E" }}>Loading Audits...</div>}>
            <AuditPage activeClient={activeClient} />
          </Suspense>
        )}

        {/* API Keys */}
        {tab === "api-keys" && (
          <APISettings />
        )}

        {/* User Management - Admin Only */}
        {tab === "user-management" && isAdmin && (
          <UserManagement clients={clients} />
        )}

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