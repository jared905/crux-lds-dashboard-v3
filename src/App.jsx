import React, {useEffect, useMemo, useState, useCallback, lazy} from "react";

// Auth
import { useAuth } from "./contexts/AuthContext.jsx";

// Services
import { youtubeAPI } from "./services/youtubeAPI.js";
import { getDailyChannelViews, getDailySubscriberSeries, getClientsFromSupabase, checkSupabaseConnection, getReportPeriod, setActivePeriod, periodVideoDataToRows, getVideoSnapshotAggregates } from "./services/clientDataService.js";
import { normalizeData } from "./lib/normalizeData.js";
import { sectionForTab } from "./lib/navigation.js";
import { detectLikelyPromoted, videoKey } from "./lib/organicFilter.js";
import { listOverrides, setOverride, clearOverride } from "./services/organicOverrideService.js";

// Layout
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import { ChevronDown, Menu, Sidebar, Youtube } from 'lucide-react';
import { Suspense } from 'react';
import BrandLoader from './components/Shared/Loading.jsx';
import ClientBackground from './components/Shared/ClientBackground.jsx';
import ContextStrip from './components/Shared/ContextStrip.jsx';
import { DashboardSkeleton } from './components/Shared/Loading.jsx';
import FilterBar from './components/Shared/FilterBar.jsx';
import GuestOAuthPage from './components/GuestOAuth/GuestOAuthPage.jsx';
import HomePage from './components/Public/HomePage.jsx';
import LoginPage from './components/Auth/LoginPage.jsx';
import PrivacyPolicy from './components/Public/PrivacyPolicy.jsx';
import SignupPage from './components/Auth/SignupPage.jsx';
import TermsOfService from './components/Public/TermsOfService.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import TopNav from './components/Shared/TopNav.jsx';
import WelcomeOnboarding from './components/Onboarding/WelcomeOnboarding.jsx';

// Tab content

// Lazy-loaded features.
//
// Every component below renders only behind a `tab === "..."` guard (or a
// path route), and App renders exactly one tab at a time - so shipping all of
// them in the entry chunk meant the login screen downloaded the audit engine,
// the PDF exporter and every workspace before it could paint. Splitting them
// takes the initial bundle from ~3.2 MB to a fraction of it; each tab then
// fetches its own chunk on first visit.
//
// Two edges matter most: UnifiedStrategy is the only path that pulls in
// recharts, and PDFExport/ExecutiveSummary are the two that pull in jspdf.
// Toolbar affordances: conditionally rendered, so splitting them keeps jspdf
// (PDFExport) and papaparse (ClientManager) out of the entry chunk entirely —
// the login screen no longer downloads a PDF renderer.
/**
 * "All Channels" pseudo-client (2026-08-20): the default view aggregates
 * every accessible client. Rides the existing network-client path —
 * isNetwork + networkMembers already drive multi-channel snapshot and
 * daily-views loading. The id is the nil UUID so any per-client query a
 * workspace fires with it returns empty rows instead of a uuid cast
 * error; those workspaces then show their own empty states.
 */
const ALL_CHANNELS_ID = "00000000-0000-0000-0000-000000000000";
/** Tabs whose analysis is per-channel by nature — guarded on the aggregate. */
const AGGREGATE_GUARDED_TABS = new Set([
  "series-analysis", "viewer-insights", "quarterly-report", "saved-reports",
  "intelligence",
  "strategic-state", "audience", "repositioning", "cohort-roles",
  "weekly-brief", "pre-flight", "calibration", "opportunities", "actions",
  "install",
]);
function buildAllChannelsClient(clientList) {
  const real = (clientList || []).filter(c => c && c.id !== ALL_CHANNELS_ID);
  if (real.length === 0) return null;
  return {
    id: ALL_CHANNELS_ID,
    name: "All Channels",
    isAggregate: true,
    isNetwork: true,
    networkMembers: real.map(c => ({ id: c.id, name: c.name })),
    // Dedupe: umbrella/network clients carry copies of member-channel
    // videos, and stale copies disagree with fresh ones (the same video
    // showed 820K in one client's cache and 91K in another — reported
    // 2026-08-20). Key on the video identity, keep the highest view
    // count (views only ever grow, so highest = freshest).
    rows: (() => {
      const seen = new Map();
      for (const r of real.flatMap(c => c.rows || [])) {
        const key = r.videoId || r.youtubeVideoId || `${r.title}|${r.publishDate}`;
        const prev = seen.get(key);
        if (!prev || (r.views || 0) > (prev.views || 0)) seen.set(key, r);
      }
      return [...seen.values()];
    })(),
    subscriberCount: real.reduce((sum, c) => sum + (c.subscriberCount || 0), 0),
  };
}

const PDFExport = lazy(() => import("./components/Shared/PDFExport.jsx"));
const ViewerInsights = lazy(() => import("./components/Performance/ViewerInsights.jsx"));
const ClientManager = lazy(() => import("./ClientManager.jsx"));
const AuditPage = lazy(() => import("./components/Audit/AuditPage.jsx"));
const BrandContext = lazy(() => import("./components/Onboarding/BrandContext.jsx"));
const DashboardPage = lazy(() => import("./components/Performance/DashboardPage.jsx"));
const DataStandardizer = lazy(() => import("./components/Settings/DataStandardizer.jsx"));
const PerformanceFeedback = lazy(() => import("./components/Strategy/PerformanceFeedback.jsx"));
const ResearchV2 = lazy(() => import("./components/ResearchV2/ResearchV2.jsx"));
const PortfolioView = lazy(() => import("./components/Portfolio/PortfolioView.jsx"));
const PreflightWorkspace = lazy(() => import("./components/Strategy/PreflightWorkspace.jsx"));
const RepositioningWorkspace = lazy(() => import("./components/Strategy/Repositioning/RepositioningWorkspace.jsx"));
const CalibrationWorkspace = lazy(() => import("./components/Strategy/Calibration/CalibrationWorkspace.jsx"));
const CohortRolesWorkspace = lazy(() => import("./components/Strategy/CohortRoles/CohortRolesWorkspace.jsx"));
const WeeklyBriefWorkspace = lazy(() => import("./components/Strategy/WeeklyBrief/WeeklyBriefWorkspace.jsx"));
const Outliers = lazy(() => import("./components/ContentLab/Outliers.jsx"));
const AudienceWorkspace = lazy(() => import("./components/Strategy/Audience/AudienceWorkspace.jsx"));
const StrategistInstallWorkspace = lazy(() => import("./components/Strategy/Install/StrategistInstallWorkspace.jsx"));
const DiagnosticSynthesisWorkspace = lazy(() => import("./components/Strategy/DiagnosticSynthesis/DiagnosticSynthesisWorkspace.jsx"));
const ClientIntakePage = lazy(() => import("./components/Intake/ClientIntakePage.jsx"));
const CommandCenter = lazy(() => import("./components/Operate/CommandCenter/CommandCenter.jsx"));
const CommentAnalysis = lazy(() => import("./components/Research/CommentAnalysis.jsx"));
const EnhancedContentIntelligence = lazy(() => import("./components/ContentLab/EnhancedContentIntelligence.jsx"));
const ContentSeriesAnalysis = lazy(() => import("./components/Performance/ContentSeriesAnalysis.jsx"));
const UnifiedStrategy = lazy(() => import("./components/Strategy/UnifiedStrategy.jsx"));
const GapDetection = lazy(() => import("./components/Research/GapDetection.jsx"));
const UserManagement = lazy(() => import("./components/Admin/UserManagement.jsx"));
const APISettings = lazy(() => import("./components/Settings/APISettings.jsx"));
const SecurityDocs = lazy(() => import("./components/Settings/SecurityDocs.jsx"));
const SavedReports = lazy(() => import("./components/Reports/SavedReports.jsx"));
const QuarterlyReport = lazy(() => import("./components/Reports/QuarterlyReport.jsx"));

/**
 * Weighted mean of a metric over the rows that actually report it.
 *
 * The previous inline form was:
 *   rows.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / totalViews
 * where `totalViews` counted EVERY row. A video with no retention data
 * contributed 0 to the numerator but its full view count to the denominator,
 * so each unsynced video dragged the average toward zero. On a 366-video
 * channel where only the recent ones carry Analytics data, that rendered
 * "0.9% all-time avg retention" next to a period figure of 80.5%.
 *
 * Rows missing the metric are excluded from both sides instead — "we don't
 * know" is not the same as "zero".
 */
function weightedMean(rows, metricKey, weightKey) {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const m = Number(r?.[metricKey]);
    const w = r?.[weightKey] || 0;
    // Skip non-positive rates as well as nulls. normalizeData coerces a
    // missing rate to 0 (its `num()` helper returns 0 for null), so a null
    // check alone never fires — every unsynced video looks like a genuine
    // 0% and still drags the mean down. For a video with views or
    // impressions, an exactly-zero retention or CTR is missing data, not a
    // measurement.
    if (!Number.isFinite(m) || m <= 0 || w <= 0) continue;
    num += m * w;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

export default function App() {
  // Auth state
  const { user, loading: authLoading, isAdmin, signOut, canAccessTab, canAccessClient } = useAuth();
  const [authView, setAuthView] = useState("home"); // "home", "login", or "signup"

  // Debug auth state

  const { isMobile } = useMediaQuery();
  const [sidebar, setSidebar] = useState(false);
  const [tab, setTab] = useState(() => {
    // Check path-based public routes first (e.g. /privacy)
    const PUBLIC_ROUTES = { '/privacy': 'privacy', '/terms': 'terms' };
    const pathRoute = PUBLIC_ROUTES[window.location.pathname];
    if (pathRoute) return pathRoute;

    // Check URL params for tab (used by OAuth callback redirect)
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get('tab');
    // Clear the tab param from URL so refreshes always return to dashboard
    if (urlTab) {
      params.delete('tab');
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
    // 2026-08-20: default landing is the Performance dashboard again —
    // now opening on the "All Channels" aggregate, so the first screen is
    // the whole business. Command Center stays one click away (logo goes
    // to the dashboard; Portfolio section holds the ops views).
    return urlTab || 'dashboard';
  });
  
  // Draft loading state (for Saved Reports → PDFExport handoff)
  const [pendingDraftToLoad, setPendingDraftToLoad] = useState(null);

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
      // No saved choice (or the saved choice IS the aggregate) → default
      // to All Channels; the Supabase load applies the same rule again
      // with the full client list.
      if (savedId && savedId !== ALL_CHANNELS_ID && clients.length > 0) {
        return clients.find(c => c.id === savedId) || buildAllChannelsClient(clients) || clients[0];
      }
      return buildAllChannelsClient(clients) || clients[0] || null;
    } catch {
      return buildAllChannelsClient(clients) || clients[0] || null;
    }
  });
  
  const [rows, setRows] = useState([]);
  const [loading] = useState(false);
  const [error] = useState(null);
  const [onboardingSkipped, setOnboardingSkipped] = useState(() => {
    try { return localStorage.getItem("fv_onboarding_skipped") === "1"; } catch { return false; }
  });
  // Default window 90d (2026-08-20): several channels upload
  // irregularly, and regular ones read growth better at a quarter.
  const [dateRange, setDateRange] = useState("90d");
  const [customDateRange, setCustomDateRange] = useState({ start: "", end: "" });
  const [selectedChannel, setSelectedChannel] = useState("all");
  const [query, setQuery] = useState("");
  const [chartMetric, setChartMetric] = useState("views");
  const [channelStats, setChannelStats] = useState(null);
  const [, setChannelStatsLoading] = useState(false);
  const [allChannelStats, setAllChannelStats] = useState({});
  const [supabaseLoading, setSupabaseLoading] = useState(true);
  const [snapshotRows, setSnapshotRows] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotDays, setSnapshotDays] = useState(0);
  const [dailyViews, setDailyViews] = useState(null);
  const [organicOnly, setOrganicOnly] = useState(false);
  // Human corrections to the media-buy heuristic (migration 116):
  // video_key → is_promoted. An override beats the heuristic both ways.
  const [organicOverrides, setOrganicOverrides] = useState({});
  const [overridesTick, setOverridesTick] = useState(0);
  const [subSeries, setSubSeries] = useState(null);
  const [lifetimeSnapshotKpis, setLifetimeSnapshotKpis] = useState(null);
  const [lifetimeAnalytics, setLifetimeAnalytics] = useState(null);
  const [previousSnapshotRows, setPreviousSnapshotRows] = useState(null);

  // Load clients from Supabase on startup.
  //
  // This effect keys on `isAdmin`, which flips false -> true once the profile
  // resolves, so it runs twice on a cold load. Both runs clear state and then
  // fetch asynchronously, and whichever fetch RESOLVES last wins — not
  // whichever started last. When the first (isAdmin === false) run landed
  // second, its `allowed` list was filtered by a canAccessClient that still
  // saw a non-admin with no explicit grants, so it set activeClient to null
  // and the app fell back to the "add your first client" screen despite 22
  // clients being loaded.
  //
  // `cancelled` makes the superseded run a no-op instead of a clobber.
  useEffect(() => {
    let cancelled = false;
    setClients([]);
    setActiveClient(null);
    const loadFromSupabase = async () => {
      try {
        const { connected } = await checkSupabaseConnection();

        if (!connected) {
          setSupabaseLoading(false);
          return;
        }

        const supabaseClients = await getClientsFromSupabase();
        if (cancelled) return;

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
          if (cancelled) return;
          setClients(mergedClients);

          // Set active client — respect permissions for non-admin viewers
          const savedId = localStorage.getItem('fullview_active_client');
          const allowed = isAdmin
            ? mergedClients
            : mergedClients.filter(c => canAccessClient(c.id));
          const activeFromSupabase = savedId && savedId !== ALL_CHANNELS_ID
            ? (allowed.find(c => c.id === savedId) || buildAllChannelsClient(allowed) || allowed[0] || null)
            : (buildAllChannelsClient(allowed) || allowed[0] || null);
          setActiveClient(activeFromSupabase);

        }
      } catch (error) {
        if (!cancelled) console.error('[Supabase] Error loading:', error);
      } finally {
        if (!cancelled) setSupabaseLoading(false);
      }
    };

    loadFromSupabase();
    return () => { cancelled = true; };
  // Initial load keyed on auth settling; clients/canAccessClient are what this effect populates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]); // Re-run when auth state settles (isAdmin changes from false to true)

  // Save clients to localStorage whenever they change.
  //
  // `clients[].rows` holds every video row for every client. At roughly 450
  // bytes per normalised row, ten clients with a thousand videos each is
  // 4-9 MB against a ~5 MB origin quota — so this threw QuotaExceededError,
  // the old catch logged it and moved on, and the cache silently stopped
  // updating. Nothing surfaced; the app just quietly went stale.
  //
  // Try the full payload (it's a genuine fast-boot win when it fits), and
  // fall back to metadata without `rows` rather than persisting nothing.
  // Supabase remains the source of truth either way.
  useEffect(() => {
    const slim = () => clients.map(({ rows: _rows, ...rest }) => rest);
    try {
      localStorage.setItem('fullview_clients', JSON.stringify(clients));
    } catch {
      try {
        localStorage.setItem('fullview_clients', JSON.stringify(slim()));
        console.warn(
          '[App] Client cache too large for localStorage; stored metadata only. ' +
          'Video rows will be re-fetched from Supabase on next load.'
        );
      } catch (e2) {
        // Even the slim payload failed — clear the key so a stale, partial
        // cache can't be read back as if it were current.
        try { localStorage.removeItem('fullview_clients'); } catch { /* ignore */ }
        console.error('[App] Could not cache clients locally:', e2);
      }
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
  // Keyed on the client id/rows; the full objects churn identity on every snapshot merge.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClient?.id, activeClient?.rows]);

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


      if (allVideoIds.length === 0 && handles.length === 0) {
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
  // This effect writes channelStats; depending on it would loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Compute start/end dates from the dateRange for snapshot queries
  const dateRangeDates = useMemo(() => {
    if (dateRange === "all") return null;
    const now = new Date();
    let startDate, endDate = now.toISOString().split('T')[0];
    if (dateRange === "custom") {
      if (customDateRange.start && customDateRange.end) {
        return { startDate: customDateRange.start, endDate: customDateRange.end };
      }
      return null;
    } else if (dateRange === "ytd") {
      startDate = `${now.getFullYear()}-01-01`;
    } else if (dateRange === "7d") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else if (dateRange === "28d") {
      startDate = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else if (dateRange === "90d") {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }
    return startDate ? { startDate, endDate } : null;
  }, [dateRange, customDateRange]);

  // Compute matching previous period dates for apples-to-apples comparison
  const previousDateRangeDates = useMemo(() => {
    if (!dateRangeDates) return null;
    const start = new Date(dateRangeDates.startDate + 'T00:00:00');
    const end = new Date(dateRangeDates.endDate + 'T00:00:00');
    const periodMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1); // day before current start
    const prevStart = new Date(prevEnd.getTime() - periodMs);
    return {
      startDate: prevStart.toISOString().split('T')[0],
      endDate: prevEnd.toISOString().split('T')[0],
    };
  }, [dateRangeDates]);

  // Fetch snapshot-aggregated data when date range changes (for OAuth-synced channels)
  useEffect(() => {
    if (!activeClient || !dateRangeDates) {
      setSnapshotRows(null);
      setSnapshotDays(0);
      setDailyViews(null);
      setSubSeries(null);
      return;
    }

    let cancelled = false;

    const fetchSnapshots = async () => {
      // Build channel IDs array (handles network clients with multiple channels)
      const channelIds = activeClient.isNetwork && activeClient.networkMembers
        ? activeClient.networkMembers.map(m => m.id)
        : [activeClient.id];

      setSnapshotLoading(true);
      try {
        const result = await getVideoSnapshotAggregates(
          channelIds,
          dateRangeDates.startDate,
          dateRangeDates.endDate
        );

        if (cancelled) return;

        // Real daily series for the Momentum chart — same channels,
        // same window. Falls back to null (publish-day bucketing).
        getDailyChannelViews(channelIds, dateRangeDates.startDate, dateRangeDates.endDate)
          .then(series => { if (!cancelled) setDailyViews(series); })
          .catch(() => { if (!cancelled) setDailyViews(null); });
        getDailySubscriberSeries(channelIds, dateRangeDates.startDate, dateRangeDates.endDate)
          .then(series => { if (!cancelled) setSubSeries(series); })
          .catch(() => { if (!cancelled) setSubSeries(null); });

        if (result) {
          setSnapshotRows(result.rows);
          setSnapshotDays(result.snapshotDays);
        } else {
          setSnapshotRows(null);
          setSnapshotDays(0);
        }

        // Fetch previous period snapshots for accurate period-over-period comparison
        if (previousDateRangeDates) {
          const prevResult = await getVideoSnapshotAggregates(
            channelIds,
            previousDateRangeDates.startDate,
            previousDateRangeDates.endDate
          );
          if (!cancelled) {
            setPreviousSnapshotRows(prevResult?.rows || null);
          }
        } else if (!cancelled) {
          setPreviousSnapshotRows(null);
        }

        // Also fetch all-time snapshot aggregates for accurate lifetime KPIs
        const lifetimeResult = await getVideoSnapshotAggregates(
          channelIds,
          '2015-01-01',
          new Date().toISOString().split('T')[0]
        );
        if (!cancelled && lifetimeResult) {
          const ltRows = lifetimeResult.rows;
          setLifetimeSnapshotKpis({
            views: ltRows.reduce((s, r) => s + (r.views || 0), 0),
            watchHours: ltRows.reduce((s, r) => s + (r.watchHours || 0), 0),
            subs: ltRows.reduce((s, r) => s + (r.subscribers || 0), 0),
          });
        }
      } catch (err) {
        console.error('[Snapshots] Fetch error:', err);
        if (!cancelled) {
          setSnapshotRows(null);
          setSnapshotDays(0);
        }
      } finally {
        if (!cancelled) setSnapshotLoading(false);
      }
    };

    fetchSnapshots();
    return () => { cancelled = true; };
  // Keyed on client id + date window; the client object itself churns per merge.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClient?.id, dateRangeDates, previousDateRangeDates]);

  // Fetch lifetime watch hours from YouTube Analytics API (authoritative source)
  useEffect(() => {
    if (!activeClient) {
      setLifetimeAnalytics(null);
      return;
    }

    let cancelled = false;

    const fetchLifetimeStats = async () => {
      const channelIds = activeClient.isNetwork && activeClient.networkMembers
        ? activeClient.networkMembers.map(m => m.id)
        : [activeClient.id];

      try {
        const response = await fetch('/api/youtube-channel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'lifetime', channelIds }),
        });

        if (!response.ok) return;

        const data = await response.json();
        if (!cancelled && data.totalWatchHours != null) {
          setLifetimeAnalytics(data);
        }
      } catch (err) {
        console.warn('[LifetimeStats] Fetch error:', err);
      }
    };

    fetchLifetimeStats();
    return () => { cancelled = true; };
  // Lifetime stats reload only when the client changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClient?.id]);

  const filteredBase = useMemo(() => {
    // When snapshot data is available AND has meaningful view data, use it
    const snapshotTotalViews = snapshotRows?.reduce((s, r) => s + (r.views || 0), 0) || 0;
    if (snapshotRows && snapshotRows.length > 0 && snapshotTotalViews > 0) {
      let result = snapshotRows;

      if (selectedChannel !== "all") {
        result = result.filter(r => r.channel === selectedChannel);
      }

      if (query) {
        result = result.filter(r => r.title?.toLowerCase().includes(query.toLowerCase()));
      }

      return result;
    }

    // Fallback: filter lifetime rows by publish date (original behavior)
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
  }, [rows, snapshotRows, selectedChannel, query, dateRange, customDateRange]);

  // Likely-promoted detection + the "Organic only" switch. Layered on
  // top of the base filter so every consumer — KPIs, charts, Top
  // Videos, exports — sees organic-only numbers when the switch is on.
  const heuristicFlags = useMemo(() => detectLikelyPromoted(filteredBase), [filteredBase]);
  const promotedFlags = useMemo(() => {
    const flags = new Map(heuristicFlags);
    for (const [key, isPromoted] of Object.entries(organicOverrides)) {
      if (isPromoted) flags.set(key, 'marked promoted by your team');
      else flags.delete(key);
    }
    return flags;
  }, [heuristicFlags, organicOverrides]);

  // Load overrides for every channel the current view can contain.
  useEffect(() => {
    let cancelled = false;
    setOrganicOverrides({});
    if (!activeClient?.id) return;
    const ids = activeClient.isAggregate
      ? (clients || []).filter(c => !c.isAggregate).map(c => c.id)
      : activeClient.isNetwork && activeClient.networkMembers
        ? activeClient.networkMembers.map(m => m.id)
        : [activeClient.id];
    listOverrides(ids).then(map => { if (!cancelled) setOrganicOverrides(map); });
    return () => { cancelled = true; };
    // Keyed on client id; the client/clients objects churn identity per merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClient?.id, overridesTick]);

  // Flip a video's organic/promoted status. Stored as an override only
  // when it disagrees with the heuristic, so rows return to automatic
  // judgement when toggled back.
  const handleOrganicOverride = useCallback(async (row) => {
    if (!activeClient?.id || activeClient.isAggregate && !row?.channel && false) return;
    if (!activeClient?.id) return;
    const key = videoKey(row);
    const nextPromoted = !promotedFlags.has(key);
    let channelId = activeClient.id;
    if ((activeClient.isAggregate || activeClient.isNetwork) && row.channel) {
      const owner = (clients || []).find(c => c.name === row.channel)
        || activeClient.networkMembers?.find(m => m.name === row.channel);
      if (owner?.id) channelId = owner.id;
    }
    try {
      if (nextPromoted === heuristicFlags.has(key)) await clearOverride(channelId, key);
      else await setOverride(channelId, key, nextPromoted);
      setOverridesTick(t => t + 1);
    } catch (e) {
      console.warn('[organicOverrides] save failed:', e?.message);
      alert('Could not save that change — the overrides table arrives with migration 116.');
    }
    // promotedFlags/heuristicFlags are derived maps; clients churns identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClient?.id, activeClient?.isAggregate, activeClient?.isNetwork, promotedFlags, heuristicFlags]);
  const filtered = useMemo(
    () => organicOnly && promotedFlags.size > 0
      ? filteredBase.filter(r => !promotedFlags.has(videoKey(r)))
      : filteredBase,
    [filteredBase, organicOnly, promotedFlags]
  );


  const kpis = useMemo(() => {
    const views = filtered.reduce((s, r) => s + (r.views || 0), 0);
    const watchHours = filtered.reduce((s, r) => s + (r.watchHours || 0), 0);
    const subs = filtered.reduce((s, r) => s + (r.subscribers || 0), 0);
    const avgCtr = weightedMean(filtered, 'ctr', 'impressions');
    // Use weighted average for retention (matching funnel calculation)
    const avgRet = weightedMean(filtered, 'retention', 'views');

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
      ? weightedMean(shorts, 'ctr', 'impressions')
      : 0;
    shortsMetrics.avgRet = shortsMetrics.views > 0
      ? weightedMean(shorts, 'retention', 'views')
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
      ? weightedMean(longs, 'ctr', 'impressions')
      : 0;
    longsMetrics.avgRet = longsMetrics.views > 0
      ? weightedMean(longs, 'retention', 'views')
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

    let views = allRows.reduce((s, r) => s + (r.views || 0), 0);
    let subs = allRows.reduce((s, r) => s + (r.subscribers || 0), 0);
    const avgCtr = weightedMean(allRows, 'ctr', 'impressions');
    const avgRet = weightedMean(allRows, 'retention', 'views');

    // Compute lifetime watch hours from cumulative view counts × duration × retention.
    // The videos table watch_hours field is unreliable (overwritten with daily values),
    // but view_count is the accurate cumulative lifetime total from YouTube Data API.
    let watchHours = allRows.reduce((s, r) => {
      const duration = r.duration || 0;
      const retention = r.retention || r.avgViewPct || 0;
      const rowViews = r.views || 0;
      if (duration > 0 && retention > 0) {
        // views × (duration_seconds × avg_pct_viewed) / 3600 = watch hours
        return s + (rowViews * duration * retention / 3600);
      }
      // Fallback to stored watch_hours if we lack duration/retention
      return s + (r.watchHours || 0);
    }, 0);

    // Use lifetime snapshot sum as a floor (covers period since tracking started)
    if (lifetimeSnapshotKpis) {
      views = Math.max(views, lifetimeSnapshotKpis.views || 0);
      watchHours = Math.max(watchHours, lifetimeSnapshotKpis.watchHours || 0);
      subs = Math.max(subs, lifetimeSnapshotKpis.subs || 0);
    }

    // Use YouTube Data API channel-level view count when available (authoritative)
    if (channelStats?.viewCount) {
      views = Math.max(views, channelStats.viewCount);
    }

    // Use YouTube Analytics API lifetime watch hours when available (authoritative)
    if (lifetimeAnalytics?.totalWatchHours) {
      watchHours = lifetimeAnalytics.totalWatchHours;
    }

    // Lifetime must be >= current period
    if (kpis) {
      views = Math.max(views, kpis.views || 0);
      watchHours = Math.max(watchHours, kpis.watchHours || 0);
      subs = Math.max(subs, kpis.subs || 0);
    }

    return {
      count: allRows.length,
      views,
      watchHours,
      subs,
      avgCtr,
      avgRet
    };
  }, [rows, selectedChannel, kpis, lifetimeSnapshotKpis, channelStats, lifetimeAnalytics]);

  // Calculate previous period KPIs for delta indicators
  const previousKpis = useMemo(() => {
    const emptyKpis = {
      views: 0, watchHours: 0, subs: 0, avgCtr: 0, avgRet: 0, count: 0,
      shortsMetrics: { count: 0, views: 0, subs: 0, watchHours: 0, imps: 0, productionHours: 0, avgCtr: 0, avgRet: 0 },
      longsMetrics: { count: 0, views: 0, subs: 0, watchHours: 0, imps: 0, productionHours: 0, avgCtr: 0, avgRet: 0 },
      shortsROI: { viewsPerHour: 0, subsPerHour: 0, watchHoursPerHour: 0 },
      longsROI: { viewsPerHour: 0, subsPerHour: 0, watchHoursPerHour: 0 }
    };

    // When previous period snapshot data is available, use it (actual period performance)
    const prevSnapshotViews = previousSnapshotRows?.reduce((s, r) => s + (r.views || 0), 0) || 0;
    if (previousSnapshotRows && previousSnapshotRows.length > 0 && prevSnapshotViews > 0) {
      let previousFiltered = previousSnapshotRows;
      if (selectedChannel !== 'all') {
        previousFiltered = previousFiltered.filter(r => r.channel === selectedChannel);
      }
      if (query) {
        previousFiltered = previousFiltered.filter(r => r.title?.toLowerCase().includes(query.toLowerCase()));
      }

      const views = previousFiltered.reduce((s, r) => s + (r.views || 0), 0);
      const watchHours = previousFiltered.reduce((s, r) => s + (r.watchHours || 0), 0);
      const subs = previousFiltered.reduce((s, r) => s + (r.subscribers || 0), 0);
      const avgCtr = weightedMean(previousFiltered, 'ctr', 'impressions');
      const avgRet = weightedMean(previousFiltered, 'retention', 'views');

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
      shortsMetrics.avgCtr = weightedMean(shorts, 'ctr', 'impressions');
      shortsMetrics.avgRet = weightedMean(shorts, 'retention', 'views');

      const longsMetrics = {
        count: longs.length,
        views: longs.reduce((s, r) => s + (r.views || 0), 0),
        subs: longs.reduce((s, r) => s + (r.subscribers || 0), 0),
        watchHours: longs.reduce((s, r) => s + (r.watchHours || 0), 0),
        imps: longs.reduce((s, r) => s + (r.impressions || 0), 0),
        productionHours: longs.length * 8
      };
      longsMetrics.avgCtr = longsMetrics.imps > 0 ? longs.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / longsMetrics.imps : 0;
      longsMetrics.avgRet = longsMetrics.views > 0 ? longs.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / longsMetrics.views : 0;

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
    }

    // Fallback: filter rows by publish date (original behavior for non-OAuth channels)
    if (!rows.length) return emptyKpis;

    const now = new Date();
    let previousStart, previousEnd;

    switch(dateRange) {
      case 'custom': {
        if (customDateRange.start && customDateRange.end) {
          const currentStart = new Date(customDateRange.start);
          const endDate = new Date(customDateRange.end);
          endDate.setHours(23, 59, 59, 999);
          const periodLength = endDate.getTime() - currentStart.getTime();
          previousStart = new Date(currentStart.getTime() - periodLength);
          previousEnd = currentStart;
        } else {
          return emptyKpis;
        }
        break;
      }
      case '7d':
        previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        previousEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '28d':
        previousStart = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);
        previousEnd = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        previousStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        previousEnd = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'ytd':
        previousStart = new Date(now.getFullYear() - 1, 0, 1);
        previousEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default: {
        const allDates = rows.map(r => r.publishDate).filter(Boolean).sort();
        if (!allDates.length) return emptyKpis;
        const midpoint = new Date((new Date(allDates[0]).getTime() + new Date(allDates[allDates.length - 1]).getTime()) / 2);
        previousStart = new Date(allDates[0]);
        previousEnd = midpoint;
      }
    }

    const previousFiltered = rows.filter(r => {
      if (!r.publishDate) return false;
      const pubDate = new Date(r.publishDate);
      if (selectedChannel !== 'all' && r.channel !== selectedChannel) return false;
      if (query && !r.title.toLowerCase().includes(query.toLowerCase())) return false;
      return pubDate >= previousStart && pubDate < previousEnd;
    });

    const views = previousFiltered.reduce((s, r) => s + (r.views || 0), 0);
    const watchHours = previousFiltered.reduce((s, r) => s + (r.watchHours || 0), 0);
    const subs = previousFiltered.reduce((s, r) => s + (r.subscribers || 0), 0);
    const imps = previousFiltered.reduce((s, r) => s + (r.impressions || 0), 0);
    const avgCtr = imps > 0 ? previousFiltered.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / imps : 0;
    const avgRet = views > 0 ? previousFiltered.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / views : 0;

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
    shortsMetrics.avgCtr = shortsMetrics.imps > 0 ? shorts.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / shortsMetrics.imps : 0;
    shortsMetrics.avgRet = shortsMetrics.views > 0 ? shorts.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / shortsMetrics.views : 0;

    const longsMetrics = {
      count: longs.length,
      views: longs.reduce((s, r) => s + (r.views || 0), 0),
      subs: longs.reduce((s, r) => s + (r.subscribers || 0), 0),
      watchHours: longs.reduce((s, r) => s + (r.watchHours || 0), 0),
      imps: longs.reduce((s, r) => s + (r.impressions || 0), 0),
      productionHours: longs.length * 8
    };
    longsMetrics.avgCtr = longsMetrics.imps > 0 ? longs.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / longsMetrics.imps : 0;
    longsMetrics.avgRet = longsMetrics.views > 0 ? longs.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / longsMetrics.views : 0;

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
  }, [rows, dateRange, customDateRange, selectedChannel, query, previousSnapshotRows]);

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

  // Validate activeClient against permissions — reset if not accessible
  useEffect(() => {
    if (isAdmin || !activeClient || activeClient.isAggregate || accessibleClients.length === 0) return;
    if (!canAccessClient(activeClient.id)) {
      setActiveClient(accessibleClients[0]);
    }
  }, [activeClient, accessibleClients, canAccessClient, isAdmin]);

  // Public routes — accessible without authentication (supports both /privacy and ?tab=privacy)
  const pathname = window.location.pathname;
  if (tab === "privacy" || pathname === "/privacy") return <PrivacyPolicy />;
  if (tab === "terms" || pathname === "/terms") return <TermsOfService />;
  // Guest OAuth invite landing — the channel owner clicks a link from
  // the strategist and lands here WITHOUT a Crux account. Public route.
  if (tab === "guest-oauth" || pathname === "/grant-youtube-access") return <GuestOAuthPage />;
  // Crux Installation pre-work — client receives a tokenized URL from
  // the strategist (/intake/<token>) and lands here. Public route;
  // token IS the auth.
  if (pathname.startsWith("/intake/")) return (
    <Suspense fallback={<BrandLoader label="Loading your intake…" />}>
      <ClientIntakePage />
    </Suspense>
  );

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div role="status" aria-live="polite" style={{ textAlign: "center" }}>
          <img className="brand-loader" src="/Full_View_Logo.png" alt="Full View Analytics" style={{ height: "80px", marginBottom: "24px" }} />
          <div style={{ color: "var(--muted)", fontSize: "13px" }}>Checking you in…</div>
        </div>
      </div>
    );
  }

  // Show public pages if not authenticated
  if (!user) {
    if (authView === "login") {
      return <LoginPage onSwitchToSignup={() => setAuthView("signup")} />;
    }
    if (authView === "signup") {
      return <SignupPage onSwitchToLogin={() => setAuthView("login")} />;
    }
    // Default: public homepage (not behind login)
    return <HomePage onSignIn={() => setAuthView("login")} />;
  }

  // New user onboarding — no channels connected yet.
  // Wait for supabaseLoading to finish so we don't flash cached data from
  // another account. Skippable: strategists manage channels that are
  // already linked, so this screen must never be a wall — once skipped it
  // stays skipped and they land in the normal app chrome.
  if (user && !supabaseLoading && clients.length === 0 && !onboardingSkipped) {
    return (
      <WelcomeOnboarding
        user={user}
        onComplete={() => window.location.reload()}
        onSkip={() => {
          try { localStorage.setItem("fv_onboarding_skipped", "1"); } catch { /* private mode */ }
          setOnboardingSkipped(true);
        }}
      />
    );
  }

  return (
    <ThemeProvider activeClient={activeClient}>
    <div style={{ minHeight: "100vh", color: "var(--text)", position: "relative" }}>
      {/* Ambient page-top field, tinted by the client's accent */}
      <ClientBackground />

      {/* Mobile sidebar (hidden on desktop) */}
      {isMobile && (
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
      )}

      {/* Header bar */}
      <div style={{
        background: "rgba(30, 30, 30, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
        padding: isMobile ? "10px 12px" : "12px 20px",
        display: "flex",
        flexWrap: isMobile ? "wrap" : "nowrap",
        alignItems: "center",
        gap: isMobile ? "8px" : "12px",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        {/* Mobile: hamburger */}
        {isMobile && (
          <button onClick={() => setSidebar(true)} style={{ background: "transparent", border: "none", color: "var(--text)", cursor: "pointer" }}>
            <Menu size={24} />
          </button>
        )}

        {/* Logo — takes you home (the cross-portfolio Command Center) */}
        <button
          onClick={() => setTab("dashboard")}
          title="Home — Performance Dashboard"
          aria-label="Home — Performance Dashboard"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center" }}
        >
          <img
            src="/Full_View_Logo.png"
            alt="Full View Analytics"
            style={{ height: isMobile ? "32px" : "40px", objectFit: "contain", display: "block" }}
          />
        </button>

        {/* Desktop: Top navigation */}
        {!isMobile && (
          <TopNav
            tab={tab}
            setTab={setTab}
            canAccessTab={canAccessTab}
            isAdmin={isAdmin}
            onSignOut={signOut}
            userEmail={user?.email || ""}
          />
        )}

        {/* Mobile: spacer + client selector */}
        {isMobile && <div style={{ flex: 1 }} />}

        {/* Client Selector */}
        {activeClient && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...(isMobile ? { width: "100%", order: 10 } : {}) }}>
            <div style={{ position: "relative", ...(isMobile ? { flex: 1 } : {}) }}>
              <select
                id="client-select"
                value={activeClient?.id || ""}
                onChange={(e) => {
                  if (e.target.value === ALL_CHANNELS_ID) {
                    const agg = buildAllChannelsClient(accessibleClients);
                    if (agg) handleClientChange(agg);
                    return;
                  }
                  const client = clients.find(c => c.id === e.target.value);
                  if (client) handleClientChange(client);
                }}
                style={{
                  minWidth: isMobile ? 0 : "200px",
                  width: isMobile ? "100%" : "auto",
                  border: activeClient?.is_prelaunch
                    ? "1px solid var(--tert-border)"
                    : "1px solid var(--accent-border)",
                  borderRadius: "8px",
                  padding: isMobile ? "10px 36px 10px 12px" : "8px 32px 8px 12px",
                  background: activeClient?.is_prelaunch ? "var(--tert-bg)" : "var(--input-bg)",
                  color: "var(--text)",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  appearance: "none",
                }}
              >
                <option value={ALL_CHANNELS_ID}>
                  All Channels ({accessibleClients.reduce((n, c) => n + (c.rows?.length || 0), 0)} videos)
                </option>
                {accessibleClients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.is_prelaunch
                      ? `${c.name} · pre-launch`
                      : `${c.name} (${c.rows.length} videos)`}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
            </div>
            {/* P0 #4 (2026-06-08): inline pre-launch tag on the picker so the
                strategist knows mid-session which clients have a channel and
                which are placeholders. */}
            {activeClient?.is_prelaunch && (
              <span style={{
                background: 'var(--tert-bg)',
                color: 'var(--tert)',
                border: '1px solid var(--tert-border)',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                whiteSpace: 'nowrap',
              }}>
                Pre-launch
              </span>
            )}
          </div>
        )}

        {/* Client Manager (desktop only, tucked into nav area).
            Export PDF used to live here too — a bare button in the chrome
            gave no clue WHAT it exported. It now has its own explained
            section at the foot of every Performance page. */}
        {!isMobile && activeClient && (
          <Suspense fallback={null}>
            <ClientManager
              clients={clients}
              activeClient={activeClient}
              onClientChange={handleClientChange}
              onClientsUpdate={handleClientsUpdate}
            />
          </Suspense>
        )}
        {!activeClient && isAdmin && (
          <Suspense fallback={null}>
            <ClientManager
              clients={clients}
              activeClient={activeClient}
              onClientChange={handleClientChange}
              onClientsUpdate={handleClientsUpdate}
            />
          </Suspense>
        )}
      </div>

      {/* P2 #11 (2026-06-08): persistent context strip — "you are here"
          breadcrumb that stays visible across tab changes so the
          strategist never wonders which client/surface they're on. */}
      <ContextStrip
        tab={tab}
        setTab={setTab}
        canAccessTab={canAccessTab}
        activeClient={activeClient}
        onPickClient={() => {
          // Focus (and where supported, open) the actual client dropdown.
          // The old version queried 'select[value]' — an attribute selector
          // that matches nothing, since React sets value as a property —
          // so this button silently did nothing.
          const sel = document.getElementById('client-select');
          if (!sel) return;
          sel.scrollIntoView({ block: 'nearest' });
          sel.focus();
          if (typeof sel.showPicker === 'function') {
            try { sel.showPicker(); } catch { /* needs a user gesture in some browsers; focus is the fallback */ }
          }
        }}
      />

      {/* Sticky Filters Bar — only on sections that look backward.
          Content Lab is a creative space and Strategy/Operate are
          workflow surfaces; a date-range scrubber over those implied
          an analytical view they don't have. */}
      {activeClient && ["performance", "research"].includes(sectionForTab(tab)) && (
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
          // Snapshot data coverage
          snapshotDays={snapshotDays}
          snapshotLoading={snapshotLoading}
          organicOnly={organicOnly}
          setOrganicOnly={setOrganicOnly}
          promotedCount={promotedFlags.size}
        />
      )}

      {/* Main Content Area */}
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: isMobile ? "20px 10px 24px" : "80px 24px 40px" }}>
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
                filter: "drop-shadow(0 8px 24px var(--accent-glow))"
              }}
            />
            {isAdmin ? (
              <>
                <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--ink)", marginBottom: "16px" }}>
                  Welcome to Full View Analytics
                </div>
                <div style={{ fontSize: "18px", color: "var(--muted)", marginBottom: "48px", lineHeight: "1.6", maxWidth: "500px", margin: "0 auto 48px" }}>
                  Get started by adding your first client. Upload a CSV export from YouTube Studio to begin analyzing performance.
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Suspense fallback={null}>
                    <ClientManager
                      clients={clients}
                      activeClient={activeClient}
                      onClientChange={handleClientChange}
                      onClientsUpdate={handleClientsUpdate}
                    />
                  </Suspense>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--ink)", marginBottom: "16px" }}>
                  Welcome to Full View Studio
                </div>
                <div style={{ fontSize: "16px", color: "var(--muted)", marginBottom: "40px", lineHeight: "1.7", maxWidth: "460px", margin: "0 auto 40px" }}>
                  Connect your YouTube channel to get started with analytics, content strategy, and performance insights.
                </div>
                <button
                  onClick={async () => {
                    try {
                      const { youtubeOAuthService } = await import("./services/youtubeOAuthService.js");
                      await youtubeOAuthService.initiateOAuth();
                    } catch (e) {
                      console.error("OAuth error:", e);
                      alert(e.message || "Failed to connect. Please try again.");
                    }
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "14px 32px",
                    background: "var(--neg-deep)",
                    border: "none",
                    borderRadius: "10px",
                    color: "var(--ink)",
                    fontSize: "16px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => e.target.style.background = "var(--neg-deep)"}
                  onMouseLeave={(e) => e.target.style.background = "var(--neg-deep)"}
                >
                  <Youtube size={20} />
                  Connect with YouTube
                </button>
                <div style={{ fontSize: "13px", color: "var(--faint)", marginTop: "20px" }}>
                  Read-only access. We never post, modify, or delete anything on your channel.
                </div>
              </>
            )}
          </div>
        )}

        {loading && (
          <DashboardSkeleton label={`Pulling in ${activeClient?.name || "this client"}’s channel data…`} />
        )}
        {error && (
          <div style={{ background: "rgba(207, 102, 121, 0.1)", border: "1px solid var(--neg-border)", padding: "18px 20px", borderRadius: "12px" }}>
            <div style={{ color: "var(--neg-text)", fontSize: "14px", fontWeight: 600, marginBottom: 6 }}>
              We hit a problem loading this data.
            </div>
            <div style={{ color: "var(--muted)", fontSize: "13px", marginBottom: 12 }}>{error}</div>
            <button
              onClick={() => window.location.reload()}
              style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "7px 14px", fontSize: 13, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        )}

        {/* One boundary for every lazily-loaded tab below. */}
        <Suspense fallback={<BrandLoader label="Opening this workspace…" />}>
        {tab === "standardizer" && <DataStandardizer />}

        {/* Command Center — cross-portfolio landing. Default first-page
            experience (2026-06-12). Click any client card → drills into
            that client's single-client dashboard via onClientChange + setTab. */}
        {tab === "command-center" && (
          <CommandCenter
            clients={clients}
            onClientChange={handleClientChange}
            onNavigate={setTab}
          />
        )}

        {/* Channel-scoped workspaces don't compute honestly on the
            "All Channels" aggregate: series detection would merge series
            across unrelated channels, briefs/diagnoses would generate
            against a client that doesn't exist, and per-client queries
            return nothing. One clear notice beats sixteen different
            broken pages. */}
        {activeClient?.isAggregate && AGGREGATE_GUARDED_TABS.has(tab) && (
          <div className="section-card" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "24px", padding: "32px", maxWidth: 720, margin: "40px auto" }}>
            <div style={{ fontFamily: "var(--font-label)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>
              One channel at a time
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>
              This workspace reads a single channel
            </div>
            <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.7, maxWidth: "60ch" }}>
              You're on the All Channels view, and this page's analysis only makes sense for one
              channel's own data. Pick a client from the dropdown in the top bar and it fills in —
              the portfolio-wide story lives on the Dashboard and in Command Center.
            </div>
          </div>
        )}

        {/* Only show content when client is active */}
        {activeClient && !(activeClient.isAggregate && AGGREGATE_GUARDED_TABS.has(tab)) && (
          <>
            {tab === "dashboard" && (
              <DashboardPage
                filtered={filtered}
                rows={rows}
                dailyViews={dailyViews}
                subSeries={subSeries}
                kpis={kpis}
                allTimeKpis={allTimeKpis}
                previousKpis={previousKpis}
                dateRange={dateRange}
                customDateRange={customDateRange}
                chartMetric={chartMetric}
                setChartMetric={setChartMetric}
                channelStats={channelStats}
                activeClient={activeClient}
                selectedChannel={selectedChannel}
                setTab={setTab}
                promotedFlags={promotedFlags}
                organicOverrides={organicOverrides}
                onOrganicOverride={handleOrganicOverride}
              />
            )}

            {tab === "viewer-insights" && (
              <ViewerInsights activeClient={activeClient} rows={rows} />
            )}

            {tab === "actions" && (
              <PerformanceFeedback
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

            {tab === "research-v2" && (
              <ResearchV2 />
            )}

            {tab === "portfolio" && (
              <PortfolioView onNavigate={setTab} />
            )}

            {tab === "pre-flight" && (
              <PreflightWorkspace activeClient={activeClient} />
            )}

            {tab === "repositioning" && (
              <RepositioningWorkspace activeClient={activeClient} onNavigate={setTab} />
            )}

            {tab === "calibration" && (
              <CalibrationWorkspace activeClient={activeClient} onNavigate={setTab} />
            )}

            {tab === "strategic-state" && (
              <DiagnosticSynthesisWorkspace activeClient={activeClient} onNavigate={setTab} />
            )}

            {tab === "install" && (
              <StrategistInstallWorkspace activeClient={activeClient} onNavigate={setTab} />
            )}

            {tab === "cohort-roles" && (
              <CohortRolesWorkspace activeClient={activeClient} onNavigate={setTab} />
            )}

            {tab === "audience" && (
              <AudienceWorkspace activeClient={activeClient} onNavigate={setTab} />
            )}

            {tab === "weekly-brief" && (
              <WeeklyBriefWorkspace activeClient={activeClient} onNavigate={setTab} />
            )}

            {tab === "gap-detection" && (
              <GapDetection rows={filtered} activeClient={activeClient} />
            )}

            {tab === "intelligence" && (
              <EnhancedContentIntelligence rows={filtered} activeClient={activeClient} />
            )}

            {tab === "opportunities" && (
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

            {tab === "outliers" && (
              <Outliers />
            )}

            {tab === "comments" && (
              <CommentAnalysis data={filtered} />
            )}

            {tab === "series-analysis" && (
              <ContentSeriesAnalysis rows={filtered} activeClient={activeClient} />
            )}

            {tab === "saved-reports" && (
              <SavedReports
                activeClient={activeClient}
                setPendingDraftToLoad={setPendingDraftToLoad}
                setTab={setTab}
              />
            )}

            {tab === "quarterly-report" && (
              <QuarterlyReport
                activeClient={activeClient}
                selectedChannel={selectedChannel}
              />
            )}

          </>
        )}
        {/* End activeClient wrapper */}

        {/* Audits - works with or without a client */}
        {tab === "audits" && (
          <Suspense fallback={<div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Loading Audits...</div>}>
            <AuditPage activeClient={activeClient} />
          </Suspense>
        )}

        {/* Brand Context */}
        {tab === "brand-context" && (
          <Suspense fallback={<div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Loading Brand Context...</div>}>
            <BrandContext activeClient={activeClient} />
          </Suspense>
        )}

        {/* API Keys */}
        {tab === "api-keys" && (
          <APISettings
            onNavigateToSecurity={() => setTab("security")}
            onClientsUpdate={async (newClientName) => {
              // Refresh clients from Supabase after OAuth adds a new client
              const supabaseClients = await getClientsFromSupabase();
              if (supabaseClients.length > 0) {
                setClients(supabaseClients);
                // If a specific client was just added, select it
                if (newClientName) {
                  const newClient = supabaseClients.find(c => c.name === newClientName);
                  if (newClient) {
                    setActiveClient(newClient);
                    return;
                  }
                }
                // Otherwise, if no active client, set the first one
                if (!activeClient && supabaseClients.length > 0) {
                  setActiveClient(supabaseClients[0]);
                }
              }
            }}
          />
        )}

        {/* Security Documentation */}
        {tab === "security" && (
          <SecurityDocs />
        )}

        {/* User Management - Admin Only */}
        {tab === "user-management" && isAdmin && (
          <UserManagement clients={clients} />
        )}

        </Suspense>

        {/* Export — its own section, not a mystery button in the chrome.
            Lives on every Performance page since that's what it exports. */}
        {!isMobile && activeClient && !activeClient.isAggregate && sectionForTab(tab) === "performance" && (
          <div className="section-card" style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "24px",
            padding: "24px",
            marginTop: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "24px",
            flexWrap: "wrap",
          }}>
            <div style={{ maxWidth: "62ch" }}>
              <div style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "var(--track-label)", fontFamily: "var(--font-label)", color: "var(--muted)", marginBottom: "4px" }}>Reports</div>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--ink)", marginBottom: "6px" }}>Client PDF report</div>
              <div style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1.6 }}>
                Packages this Performance view for {activeClient?.name} — KPIs, format breakdown,
                top videos, and the executive summary for the date range selected above — into a
                branded PDF you can send. You review and edit every recommendation before it renders.
              </div>
            </div>
            <Suspense fallback={null}>
              <PDFExport
                kpis={kpisWithChanges}
                top={top}
                filtered={filtered}
                rows={rows}
                dateRange={dateRange}
                customDateRange={customDateRange}
                clientName={activeClient?.name}
                selectedChannel={selectedChannel}
                allTimeKpis={allTimeKpis}
                channelStats={channelStats}
                activeClient={activeClient}
                pendingDraftToLoad={pendingDraftToLoad}
                setPendingDraftToLoad={setPendingDraftToLoad}
              />
            </Suspense>
          </div>
        )}

        {/* Footer — info left, brand right. The old centered stack hid
            "Powered by CRUX" behind a dark-on-dark logo image (invisible,
            user-reported 2026-08-20) — CRUX is text now, always legible. */}
        <div style={{ marginTop: "60px", paddingTop: "28px", borderTop: "1px solid var(--border)", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px", flexWrap: "wrap", paddingBottom: "36px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <div style={{ fontSize: "13px", color: "var(--muted)", fontWeight: "600" }}>
                Powered by{" "}
                <a href="https://crux.media/" target="_blank" rel="noopener noreferrer"
                  style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "none", letterSpacing: "0.04em" }}>
                  CRUX
                </a>
              </div>
              <div style={{ fontSize: "12px", color: "var(--faint)", fontStyle: "italic" }}>
                Strategic YouTube Insights
              </div>
              <div style={{ fontSize: "11px", color: "var(--faint)", marginTop: "4px" }}>
                {new Date().getFullYear()} CRUX Analytics. All rights reserved.
              </div>
            </div>
            <img src="/Full_View_Logo.png" alt="Full View Analytics" style={{ height: "44px", objectFit: "contain", flexShrink: 0 }} />
          </div>
        </div>
      </div>
    </div>
    </ThemeProvider>
  );
}