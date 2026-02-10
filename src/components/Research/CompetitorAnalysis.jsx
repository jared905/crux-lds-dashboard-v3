import React, { useState, useMemo, useEffect, useCallback, lazy, Suspense } from "react";
import { Plus, Trash2, Search, TrendingUp, Users, Video, Eye, Settings, ChevronDown, ChevronUp, PlaySquare, Calendar, BarChart3, Type, Clock, Tag, Upload, Download, RefreshCw, X, Check, Zap, Loader, MoreVertical, Table2, LayoutGrid, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Crown, Target, Activity, Layers, Folder } from "lucide-react";
import { analyzeTitlePatterns, analyzeUploadSchedule, categorizeContentFormats } from "../../lib/competitorAnalysis";
import { getOutlierVideos, analyzeCompetitorVideo } from '../../services/competitorInsightsService';
import { importCompetitorDatabase } from '../../services/competitorImport';
import CategoryBrowser from './CategoryBrowser';
import { ChannelClientAssignment } from './ChannelClientAssignment';

const CompetitorTrends = lazy(() => import('./CompetitorTrends'));

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;
const fmtDuration = (seconds) => {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Map Lucide icon names to emoji equivalents
const ICON_NAME_TO_EMOJI = {
  'building': '🏛️',
  'church': '🏛️',
  'heart': '🙏',
  'log-out': '🚪',
  'alert-circle': '⛪',
  'mic': '🎤',
  'unlock': '🔓',
  'folder': '📁',
  'shopping-bag': '🛍️',
  'headphones': '🎧',
  'music': '🎵',
  'dollar-sign': '💵',
  'zap': '⚡',
  'flame': '🔥',
  'activity': '🛹',
  'shirt': '👕',
  'gamepad-2': '🎮',
  'mouse': '🖱️',
  'cpu': '💻',
  'tv': '📺',
  'monitor': '🖥️',
  'box': '📦',
};

// Fallback category config - used when dynamic categories fail to load
const CATEGORY_CONFIG_FALLBACK = {
  'lds-official':   { label: 'LDS Official',            color: '#3b82f6', icon: '🏛️',  order: 0, description: 'Institutional church channels' },
  'lds-faithful':   { label: 'LDS Faithful Creators',   color: '#10b981', icon: '🙏',  order: 1, description: 'Apologetics, scholarship, lifestyle' },
  'ex-mormon':      { label: 'Ex-Mormon',               color: '#ef4444', icon: '🚪',  order: 2, description: 'Personal stories, research, expose' },
  'counter-cult':   { label: 'Counter-Cult Evangelical', color: '#f97316', icon: '⛪',   order: 3, description: 'Evangelical critique channels' },
  'megachurch':     { label: 'Megachurch',               color: '#8b5cf6', icon: '🎤',  order: 4, description: 'High-production contemporary churches' },
  'catholic':       { label: 'Catholic',                 color: '#f59e0b', icon: '✝️', order: 5, description: 'Catholic media and apologetics' },
  'muslim':         { label: 'Muslim',                   color: '#06b6d4', icon: '☪️', order: 6, description: 'Islamic dawah and debate' },
  'jewish':         { label: 'Jewish',                   color: '#6366f1', icon: '✡️', order: 7, description: 'Jewish educational content' },
  'deconstruction': { label: 'Deconstruction',           color: '#ec4899', icon: '🔓',  order: 8, description: 'Multi-faith and LDS-specific deconstruction' },
};

// Industry filters for master view
const INDUSTRY_FILTERS = [
  { id: null, label: 'All', color: '#9E9E9E' },
  { id: 'religious', label: 'Religious', color: '#8B5CF6' },
  { id: 'cpg', label: 'CPG', color: '#06b6d4' },
  { id: 'gaming', label: 'Gaming', color: '#8b5cf6' },
  { id: 'tech', label: 'Tech', color: '#10b981' },
];

export default function CompetitorAnalysis({ rows, activeClient }) {
  console.log('[CompetitorAnalysis] MOUNTED — build v2', { activeClientId: activeClient?.id, activeClientName: activeClient?.name });
  const [apiKey, setApiKey] = useState(localStorage.getItem('yt_api_key') || "");
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  // localStorage competitors kept for migration/fallback only
  const [competitors, setCompetitors] = useState(() => {
    const saved = localStorage.getItem('competitors');
    return saved ? JSON.parse(saved) : [];
  });


  const [expandedCategories, setExpandedCategories] = useState({});
  const [refreshingId, setRefreshingId] = useState(null);
  const [refreshError, setRefreshError] = useState({});
  const [newCompetitor, setNewCompetitor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userTimezone, setUserTimezone] = useState(() => {
    const saved = localStorage.getItem('user_timezone');
    return saved || Intl.DateTimeFormat().resolvedOptions().timeZone;
  });


  // Outlier detection state
  const [outliers, setOutliers] = useState([]);
  const [outliersLoading, setOutliersLoading] = useState(false);
  const [outlierDays, setOutlierDays] = useState(90);
  const [outlierMinMultiplier, setOutlierMinMultiplier] = useState(2.5);

  // Insights panel state
  const [selectedOutlier, setSelectedOutlier] = useState(null);
  const [insightData, setInsightData] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);

  // Client-scoped Supabase state
  const [masterView, setMasterView] = useState(false);
  const [supabaseCompetitors, setSupabaseCompetitors] = useState([]);
  const [supabaseLoading, setSupabaseLoading] = useState(false);
  const [allClients, setAllClients] = useState([]); // For client assignment in master view

  // Database import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);

  // CSV import state
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [csvText, setCSVText] = useState('');

  // Restructured UI state
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [drawerTab, setDrawerTab] = useState('overview');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [viewMode, setViewMode] = useState('hubs');
  const [expandedHubCategory, setExpandedHubCategory] = useState(null);
  const [sortCol, setSortCol] = useState('subscriberCount');
  const [sortDir, setSortDir] = useState(true); // true = descending
  const [intelligenceTab, setIntelligenceTab] = useState('outliers');
  const [intelligenceCollapsed, setIntelligenceCollapsed] = useState(false);
  const [showAddPopover, setShowAddPopover] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  // Trends view state
  const [trendsTimeRange, setTrendsTimeRange] = useState(30);
  const [snapshotData, setSnapshotData] = useState({});
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Dynamic category state (loaded from Supabase)
  const [categoryTree, setCategoryTree] = useState([]);
  const [categoryConfig, setCategoryConfig] = useState(CATEGORY_CONFIG_FALLBACK);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);

  // Industry filter for master view
  const [industryFilter, setIndustryFilter] = useState(null);

  // Bulk assignment modal state
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false);

  // YouTube search state for add-competitor
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Sync competitors state to localStorage for enriched data persistence
  useEffect(() => {
    if (competitors.length > 0) {
      localStorage.setItem('competitors', JSON.stringify(competitors));
    }
  }, [competitors]);

  // Load category tree from Supabase (extracted as callback for reuse)
  const loadCategories = useCallback(async () => {
    setCategoryLoading(true);
    try {
      const { getCategoryTree } = await import('../../services/categoryService');
      const tree = await getCategoryTree();
      setCategoryTree(tree || []);

      // Build config object from tree for backwards compatibility
      const config = { ...CATEGORY_CONFIG_FALLBACK };
      const flattenTree = (nodes) => {
        nodes.forEach(node => {
          // Convert Lucide icon name to emoji, or use fallback emoji
          const iconName = node.icon || 'folder';
          const emoji = ICON_NAME_TO_EMOJI[iconName] || CATEGORY_CONFIG_FALLBACK[node.slug]?.icon || '📁';
          config[node.slug] = {
            id: node.id,
            label: node.name,
            color: node.color || '#666',
            icon: emoji,
            order: node.sort_order || 0,
            description: node.description || '',
            parentId: node.parent_id,
          };
          if (node.children) flattenTree(node.children);
        });
      };
      flattenTree(tree || []);
      setCategoryConfig(config);
    } catch (err) {
      console.error('[Categories] Failed to load from Supabase:', err);
      // Keep using fallback config
    } finally {
      setCategoryLoading(false);
    }
  }, []);

  // Load category tree on mount
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Load competitors from Supabase when activeClient or masterView changes
  useEffect(() => {
    console.log('[Competitors] useEffect fired:', { activeClientId: activeClient?.id, masterView });
    // Clear previous data immediately to prevent showing wrong client's competitors
    setSupabaseCompetitors([]);
    setSelectedChannelId(null);

    if (!activeClient?.id && !masterView) {
      console.log('[Competitors] Early return — no activeClient.id and not masterView');
      return;
    }

    const loadFromSupabase = async () => {
      setSupabaseLoading(true);
      try {
        const { getChannels } = await import('../../services/competitorDatabase');
        const queryClientId = masterView ? undefined : activeClient?.id;
        console.log('[Competitors] Loading from Supabase:', { queryClientId, masterView, activeClientId: activeClient?.id, activeClientName: activeClient?.name });
        const channels = await getChannels({
          clientId: queryClientId,
          isCompetitor: true
        });
        console.log('[Competitors] Loaded:', channels?.length, 'channels', channels?.slice(0, 3).map(c => ({ name: c.name, client_id: c.client_id, is_competitor: c.is_competitor })));
        setSupabaseCompetitors(channels || []);
      } catch (err) {
        console.error('[Competitors] Failed to load from Supabase:', err);
      } finally {
        setSupabaseLoading(false);
      }
    };

    loadFromSupabase();
  }, [activeClient?.id, masterView]);

  // Load all clients for assignment feature (master view only)
  useEffect(() => {
    if (!masterView) return;

    const loadClients = async () => {
      try {
        const { getClientsFromSupabase } = await import('../../services/clientDataService');
        const clients = await getClientsFromSupabase();
        setAllClients(clients || []);
      } catch (err) {
        console.error('[Clients] Failed to load:', err);
      }
    };

    loadClients();
  }, [masterView]);

  // Helper to reload Supabase competitors after mutations
  const reloadSupabaseCompetitors = useCallback(async () => {
    try {
      const { getChannels } = await import('../../services/competitorDatabase');
      const channels = await getChannels({
        clientId: masterView ? undefined : activeClient?.id,
        isCompetitor: true
      });
      setSupabaseCompetitors(channels || []);
    } catch (err) {
      console.error('[Competitors] Failed to reload from Supabase:', err);
    }
  }, [activeClient?.id, masterView]);

  // Handle client assignment update - reload competitors to reflect the change
  const handleClientAssignmentUpdate = useCallback(async (channelYoutubeId, newClientId) => {
    // Reload competitors to reflect the updated assignment
    await reloadSupabaseCompetitors();
    // Close the drawer since the channel may no longer be visible in current view
    if (!masterView && newClientId !== activeClient?.id) {
      setSelectedChannelId(null);
    }
  }, [reloadSupabaseCompetitors, masterView, activeClient?.id]);

  // Import competitor database from curated channel list
  const handleImportDatabase = useCallback(async () => {
    if (!activeClient?.id) {
      setError('No active client selected');
      return;
    }
    setImporting(true);
    setImportProgress({ current: 0, total: 44, name: 'Starting...' });
    try {
      const results = await importCompetitorDatabase(activeClient.id, {
        onProgress: (current, total, name) => {
          setImportProgress({ current, total, name });
        },
      });
      setImportProgress(null);
      await reloadSupabaseCompetitors();
      if (results.errors.length > 0) {
        setError(`Imported ${results.imported} channels with ${results.errors.length} errors. Check console for details.`);
      }
    } catch (err) {
      console.error('[Import] Failed:', err);
      setError(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }, [activeClient?.id, reloadSupabaseCompetitors]);

  // Import from CSV data
  const handleCSVImport = useCallback(async () => {
    if (!csvText.trim()) {
      setError('Please paste CSV data');
      return;
    }
    setImporting(true);
    setShowCSVImport(false);
    try {
      const { importFromCSV } = await import('../../services/unifiedCompetitorImport');
      const results = await importFromCSV(csvText, activeClient?.id || null, {
        onProgress: (current, total, name) => {
          setImportProgress({ current, total, name });
        },
      });
      setImportProgress(null);
      setCSVText('');
      await reloadSupabaseCompetitors();
      if (results.errors.length > 0) {
        setError(`Imported ${results.imported} channels with ${results.errors.length} errors. Check console.`);
      }
    } catch (err) {
      console.error('[CSV Import] Failed:', err);
      setError(`CSV Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }, [csvText, activeClient?.id, reloadSupabaseCompetitors]);

  // Category expand/collapse handlers
  const toggleCategory = useCallback((categoryKey) => {
    setExpandedCategories(prev => ({ ...prev, [categoryKey]: !prev[categoryKey] }));
  }, []);

  const toggleAllCategories = useCallback((expand) => {
    const all = {};
    Object.keys(categoryConfig).forEach(key => { all[key] = expand; });
    setExpandedCategories(all);
  }, []);

  // Legacy localStorage migration removed - all competitor data now lives in Supabase.
  // Competitors are assigned per-client via client_id on the channels table.

  // Calculate your channel stats
  const yourStats = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentVideos = rows.filter(r => r.publishDate && new Date(r.publishDate) >= thirtyDaysAgo);

    const shorts = rows.filter(r => r.type === 'short');
    const longs = rows.filter(r => r.type === 'long');

    const totalViews = rows.reduce((s, r) => s + (r.views || 0), 0);
    const totalSubs = rows.reduce((s, r) => s + (r.subscribers || 0), 0);
    const totalImpressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
    const avgCTR = totalImpressions > 0
      ? rows.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / totalImpressions
      : 0;
    const totalVidViews = rows.reduce((s, r) => s + (r.views || 0), 0);
    const avgRetention = totalVidViews > 0
      ? rows.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / totalVidViews
      : 0;

    return {
      totalVideos: rows.length,
      totalViews,
      totalSubscribers: totalSubs,
      avgViewsPerVideo: rows.length > 0 ? totalViews / rows.length : 0,
      avgCTR,
      avgRetention,
      videosLast30Days: recentVideos.length,
      shortsCount: shorts.length,
      longsCount: longs.length,
      uploadFrequency: recentVideos.length > 0 ? 30 / recentVideos.length : 0
    };
  }, [rows]);

  // Fetch outlier videos — accepts optional channel IDs to scope results
  const fetchOutliers = useCallback(async (scopedIds) => {
    setOutliersLoading(true);
    try {
      const data = await getOutlierVideos({ days: outlierDays, minMultiplier: outlierMinMultiplier, channelIds: scopedIds && scopedIds.length > 0 ? scopedIds : undefined });
      setOutliers(data);
    } catch (err) {
      console.error('Failed to fetch outliers:', err);
    } finally {
      setOutliersLoading(false);
    }
  }, [outlierDays, outlierMinMultiplier]);

  // Load insight for selected outlier
  const handleViewInsight = useCallback(async (video) => {
    setSelectedOutlier(video);
    setInsightData(null);
    setInsightLoading(true);
    try {
      const data = await analyzeCompetitorVideo(video);
      setInsightData(data);
    } catch (err) {
      setInsightData({ error: err.message });
    } finally {
      setInsightLoading(false);
    }
  }, []);

  // Save API key
  const saveApiKey = () => {
    localStorage.setItem('yt_api_key', apiKey);
    setShowApiKeyInput(false);
    setError("");
  };

  // Parse ISO 8601 duration format (PT#M#S)
  const parseDuration = (duration) => {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  };

  // Add competitor with enhanced data
  const addCompetitor = async (urlOverride) => {
    if (!apiKey) {
      setError("Please add your YouTube Data API key first");
      setShowApiKeyInput(true);
      return;
    }

    const input = urlOverride || newCompetitor.trim();
    if (!input) {
      setError("Please enter a channel URL or ID");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Extract channel ID from URL or use as-is
      let channelId = input;

      // Handle different YouTube URL formats
      if (channelId.includes('youtube.com/channel/')) {
        channelId = channelId.split('youtube.com/channel/')[1].split(/[?/]/)[0];
      } else if (channelId.includes('youtube.com/@')) {
        const username = channelId.split('youtube.com/@')[1].split(/[?/]/)[0];
        const handleResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent('@' + username)}&key=${apiKey}`
        );
        const handleData = await handleResponse.json();

        if (handleData.error) {
          throw new Error(handleData.error.message || "Failed to resolve channel");
        }

        if (!handleData.items || handleData.items.length === 0) {
          throw new Error("Channel not found");
        }

        channelId = handleData.items[0].snippet.channelId;
      } else if (channelId.includes('youtube.com/c/') || channelId.includes('youtube.com/user/')) {
        const customName = channelId.split(/youtube\.com\/[cu]\//)[1].split(/[?/]/)[0];
        const searchResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(customName)}&key=${apiKey}`
        );
        const searchData = await searchResponse.json();

        if (searchData.error) {
          throw new Error(searchData.error.message || "Failed to find channel");
        }

        if (!searchData.items || searchData.items.length === 0) {
          throw new Error("Channel not found");
        }

        channelId = searchData.items[0].snippet.channelId;
      }

      // Fetch channel details
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${apiKey}`
      );

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || "Failed to fetch channel data");
      }

      if (!data.items || data.items.length === 0) {
        throw new Error("Channel not found. Please check the channel URL or ID.");
      }

      const channel = data.items[0];

      // Fetch recent videos (last 50)
      const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&key=${apiKey}`
      );
      const videosData = await videosResponse.json();

      if (videosData.error) {
        throw new Error(videosData.error.message || "Failed to fetch videos");
      }

      // Get video IDs for detailed stats
      const videoIds = videosData.items.map(item => item.contentDetails.videoId).join(',');
      const videoDetailsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${apiKey}`
      );
      const videoDetailsData = await videoDetailsResponse.json();

      if (videoDetailsData.error) {
        throw new Error(videoDetailsData.error.message || "Failed to fetch video details");
      }

      // Process videos with full details
      const videos = videoDetailsData.items.map(video => {
        const duration = parseDuration(video.contentDetails.duration);
        return {
          id: video.id,
          title: video.snippet.title,
          thumbnail: video.snippet.thumbnails.medium.url,
          publishedAt: video.snippet.publishedAt,
          views: parseInt(video.statistics.viewCount) || 0,
          likes: parseInt(video.statistics.likeCount) || 0,
          comments: parseInt(video.statistics.commentCount) || 0,
          duration: duration,
          type: duration <= 180 ? 'short' : 'long'
        };
      });

      // Calculate upload frequency (last 30, 60, 90 days)
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      const last30Days = videos.filter(v => new Date(v.publishedAt) >= thirtyDaysAgo);
      const last60Days = videos.filter(v => new Date(v.publishedAt) >= sixtyDaysAgo);
      const last90Days = videos.filter(v => new Date(v.publishedAt) >= ninetyDaysAgo);

      // Separate shorts and long-form
      const shorts = videos.filter(v => v.type === 'short');
      const longs = videos.filter(v => v.type === 'long');

      const shorts30d = last30Days.filter(v => v.type === 'short').length;
      const longs30d = last30Days.filter(v => v.type === 'long').length;

      // Detect content series (common title patterns)
      const seriesPatterns = detectContentSeries(videos);

      // Top performing videos (by views)
      const topVideos = [...videos].sort((a, b) => b.views - a.views).slice(0, 5);

      // Calculate engagement rate
      const totalViews = videos.reduce((sum, v) => sum + v.views, 0);
      const totalLikes = videos.reduce((sum, v) => sum + v.likes, 0);
      const totalComments = videos.reduce((sum, v) => sum + v.comments, 0);
      const engagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews) : 0;

      const competitorData = {
        id: channelId,
        name: channel.snippet.title,
        description: channel.snippet.description,
        thumbnail: channel.snippet.thumbnails.default.url,
        subscriberCount: parseInt(channel.statistics.subscriberCount) || 0,
        videoCount: parseInt(channel.statistics.videoCount) || 0,
        viewCount: parseInt(channel.statistics.viewCount) || 0,
        uploadsLast30Days: last30Days.length,
        uploadsLast60Days: last60Days.length,
        uploadsLast90Days: last90Days.length,
        shortsCount: shorts.length,
        longsCount: longs.length,
        shorts30d,
        longs30d,
        avgViewsPerVideo: videos.length > 0 ? totalViews / videos.length : 0,
        avgShortsViews: shorts.length > 0 ? shorts.reduce((s, v) => s + v.views, 0) / shorts.length : 0,
        avgLongsViews: longs.length > 0 ? longs.reduce((s, v) => s + v.views, 0) / longs.length : 0,
        engagementRate,
        uploadFrequency: last30Days.length > 0 ? 30 / last30Days.length : 0,
        topVideos,
        contentSeries: seriesPatterns,
        videos,
        addedAt: new Date().toISOString()
      };

      // Check if already exists for this client (use Supabase as source of truth)
      if (supabaseCompetitors.some(c => c.youtube_channel_id === channelId)) {
        setError("This competitor is already assigned to this client");
        setLoading(false);
        return;
      }

      setNewCompetitor("");
      setError("");

      // Save to Supabase with client_id (primary storage)
      try {
        const { upsertChannel, upsertVideos } = await import('../../services/competitorDatabase');
        const dbChannel = await upsertChannel({
          youtube_channel_id: competitorData.id,
          name: competitorData.name,
          description: competitorData.description,
          thumbnail_url: competitorData.thumbnail,
          subscriber_count: competitorData.subscriberCount,
          total_view_count: competitorData.viewCount,
          video_count: competitorData.videoCount,
          is_competitor: true,
          client_id: activeClient?.id || null,
        });

        if (competitorData.videos?.length && dbChannel?.id) {
          const videosToUpsert = competitorData.videos.map(v => ({
            youtube_video_id: v.id,
            title: v.title,
            thumbnail_url: v.thumbnail,
            published_at: v.publishedAt,
            duration_seconds: v.duration,
            view_count: v.views,
            like_count: v.likes,
            comment_count: v.comments,
          }));
          await upsertVideos(videosToUpsert, dbChannel.id);
        }

        await reloadSupabaseCompetitors();
      } catch (dbErr) {
        console.error('[Competitors] Supabase save failed:', dbErr);
        setError(`Failed to save: ${dbErr.message}`);
      }
    } catch (err) {
      setError(err.message || "Failed to add competitor. Please check the URL and API key.");
    } finally {
      setLoading(false);
    }
  };

  // Detect content series based on title patterns
  const detectContentSeries = (videos) => {
    const patterns = {};

    videos.forEach(video => {
      const title = video.title;

      // Look for patterns like "Series Name #1", "Series Name Ep 1", "Series Name - Part 1"
      const episodePatterns = [
        /^(.+?)\s+#(\d+)/i,
        /^(.+?)\s+ep(?:isode)?\s*(\d+)/i,
        /^(.+?)\s+-\s*part\s*(\d+)/i,
        /^(.+?)\s+\|\s*ep(?:isode)?\s*(\d+)/i,
        /^(.+?)\s+\|\s*#(\d+)/i
      ];

      for (const pattern of episodePatterns) {
        const match = title.match(pattern);
        if (match) {
          const seriesName = match[1].trim();
          if (!patterns[seriesName]) {
            patterns[seriesName] = {
              name: seriesName,
              count: 0,
              totalViews: 0,
              videos: []
            };
          }
          patterns[seriesName].count++;
          patterns[seriesName].totalViews += video.views;
          patterns[seriesName].videos.push(video);
          break;
        }
      }
    });

    // Filter to only series with 3+ episodes
    return Object.values(patterns)
      .filter(series => series.count >= 3)
      .map(series => ({
        ...series,
        avgViews: series.totalViews / series.count
      }))
      .sort((a, b) => b.avgViews - a.avgViews)
      .slice(0, 5);
  };

  // Remove competitor
  const removeCompetitor = async (id) => {
    const updated = competitors.filter(c => c.id !== id);
    setCompetitors(updated);
    if (selectedChannelId === id) {
      setSelectedChannelId(null);
    }

    // Also remove from Supabase
    try {
      const { getChannelByYouTubeId, deleteChannel } = await import('../../services/competitorDatabase');
      const channel = await getChannelByYouTubeId(id);
      if (channel?.id) {
        await deleteChannel(channel.id);
      }
      await reloadSupabaseCompetitors();
    } catch (dbErr) {
      console.warn('[Competitors] Supabase delete failed:', dbErr);
    }
  };

  // Update channel category in Supabase
  const updateChannelCategory = async (channelId, newCategory) => {
    try {
      const { supabase } = await import('../../services/supabaseClient');
      const comp = activeCompetitors.find(c => c.id === channelId);
      if (!comp?.supabaseId) return;
      await supabase
        .from('channels')
        .update({ category: newCategory })
        .eq('id', comp.supabaseId);
      await reloadSupabaseCompetitors();
    } catch (err) {
      console.warn('[Competitors] Category update failed:', err);
    }
  };

  // Refresh competitor data with historical snapshot
  const refreshCompetitor = async (competitorId) => {
    // Look up in activeCompetitors (Supabase-backed), not localStorage
    const competitor = activeCompetitors.find(c => c.id === competitorId);
    if (!competitor) {
      setRefreshError(prev => ({ ...prev, [competitorId]: "Competitor not found" }));
      return;
    }

    if (!apiKey) {
      setError("Please add your YouTube Data API key first");
      setShowApiKeyInput(true);
      return;
    }

    setRefreshingId(competitorId);
    setRefreshError(prev => { const next = { ...prev }; delete next[competitorId]; return next; });

    try {
      let resolvedChannelId = competitorId;

      // Resolve handle_ placeholder IDs to real UC IDs via YouTube Search API
      if (competitorId.startsWith('handle_')) {
        const handle = competitor.tags?.find(t => t.startsWith('custom_url:'))?.split(':')[1]
          || '@' + competitorId.replace('handle_', '');
        const cleanHandle = handle.startsWith('@') ? handle : '@' + handle;

        const searchResp = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(cleanHandle)}&maxResults=1&key=${apiKey}`
        );
        const searchData = await searchResp.json();
        if (searchData.error) throw new Error(searchData.error.message);
        if (!searchData.items?.length) throw new Error(`No channel found for ${cleanHandle}`);

        resolvedChannelId = searchData.items[0].snippet.channelId;

        // Update Supabase with the resolved ID so future refreshes skip this step
        try {
          const { default: supabase } = await import('../../services/supabaseClient');
          if (supabase) {
            await supabase
              .from('channels')
              .update({ youtube_channel_id: resolvedChannelId })
              .eq('id', competitor.supabaseId);
          }
        } catch (e) {
          console.warn('[Refresh] Could not save resolved ID:', e);
        }
      }

      // Fetch channel data
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${resolvedChannelId}&key=${apiKey}`
      );
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || "Failed to fetch channel data");
      if (!data.items || data.items.length === 0) throw new Error("Channel not found");

      const ytChannel = data.items[0];

      // Fetch recent videos
      const uploadsPlaylistId = ytChannel.contentDetails.relatedPlaylists.uploads;
      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&key=${apiKey}`
      );
      const videosData = await videosResponse.json();
      if (videosData.error) throw new Error(videosData.error.message || "Failed to fetch videos");

      const videoIds = (videosData.items || []).map(item => item.contentDetails.videoId).join(',');
      let videos = [];

      if (videoIds) {
        const videoDetailsResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${apiKey}`
        );
        const videoDetailsData = await videoDetailsResponse.json();
        if (videoDetailsData.error) throw new Error(videoDetailsData.error.message || "Failed to fetch video details");

        videos = videoDetailsData.items.map(video => {
          const duration = parseDuration(video.contentDetails.duration);
          return {
            id: video.id,
            title: video.snippet.title,
            thumbnail: video.snippet.thumbnails.medium.url,
            publishedAt: video.snippet.publishedAt,
            views: parseInt(video.statistics.viewCount) || 0,
            likes: parseInt(video.statistics.likeCount) || 0,
            comments: parseInt(video.statistics.commentCount) || 0,
            duration: duration,
            type: duration <= 180 ? 'short' : 'long'
          };
        });
      }

      // Calculate stats
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      const last30Days = videos.filter(v => new Date(v.publishedAt) >= thirtyDaysAgo);
      const last60Days = videos.filter(v => new Date(v.publishedAt) >= sixtyDaysAgo);
      const last90Days = videos.filter(v => new Date(v.publishedAt) >= ninetyDaysAgo);

      const shorts = videos.filter(v => v.type === 'short');
      const longs = videos.filter(v => v.type === 'long');
      const shorts30d = last30Days.filter(v => v.type === 'short').length;
      const longs30d = last30Days.filter(v => v.type === 'long').length;

      const seriesPatterns = detectContentSeries(videos);
      const topVideos = [...videos].sort((a, b) => b.views - a.views).slice(0, 5);

      const totalViews = videos.reduce((sum, v) => sum + v.views, 0);
      const totalLikes = videos.reduce((sum, v) => sum + v.likes, 0);
      const totalComments = videos.reduce((sum, v) => sum + v.comments, 0);
      const engagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews) : 0;

      // Update localStorage-backed competitors state (upsert — insert if not present)
      const enrichedData = {
        id: resolvedChannelId,
        name: ytChannel.snippet.title,
        description: ytChannel.snippet.description,
        thumbnail: ytChannel.snippet.thumbnails.default.url,
        subscriberCount: parseInt(ytChannel.statistics.subscriberCount) || 0,
        videoCount: parseInt(ytChannel.statistics.videoCount) || 0,
        viewCount: parseInt(ytChannel.statistics.viewCount) || 0,
        uploadsLast30Days: last30Days.length,
        uploadsLast60Days: last60Days.length,
        uploadsLast90Days: last90Days.length,
        shortsCount: shorts.length,
        longsCount: longs.length,
        shorts30d,
        longs30d,
        avgViewsPerVideo: videos.length > 0 ? totalViews / videos.length : 0,
        avgShortsViews: shorts.length > 0 ? shorts.reduce((s, v) => s + v.views, 0) / shorts.length : 0,
        avgLongsViews: longs.length > 0 ? longs.reduce((s, v) => s + v.views, 0) / longs.length : 0,
        engagementRate,
        uploadFrequency: last30Days.length > 0 ? 30 / last30Days.length : 0,
        topVideos,
        contentSeries: seriesPatterns,
        videos,
        lastRefreshed: new Date().toISOString(),
      };
      const localMatch = competitors.find(c => c.id === competitorId || c.id === resolvedChannelId);
      if (localMatch) {
        const updated = competitors.map(c =>
          (c.id === competitorId || c.id === resolvedChannelId) ? { ...c, ...enrichedData } : c
        );
        setCompetitors(updated);
      } else {
        // Supabase-only competitor — add to localStorage so enriched stats persist
        setCompetitors(prev => [...prev, { ...competitor, ...enrichedData }]);
      }

      // Save to Supabase
      try {
        const { upsertChannel, upsertVideos } = await import('../../services/competitorDatabase');
        const dbChannel = await upsertChannel({
          youtube_channel_id: resolvedChannelId,
          name: ytChannel.snippet.title,
          description: ytChannel.snippet.description,
          thumbnail_url: ytChannel.snippet.thumbnails.default.url,
          subscriber_count: parseInt(ytChannel.statistics.subscriberCount) || 0,
          total_view_count: parseInt(ytChannel.statistics.viewCount) || 0,
          video_count: parseInt(ytChannel.statistics.videoCount) || 0,
          is_competitor: true,
          client_id: activeClient?.id || null,
          category: competitor.category,
        });

        if (videos.length > 0 && dbChannel?.id) {
          const videosToUpsert = videos.map(v => ({
            youtube_video_id: v.id,
            title: v.title,
            thumbnail_url: v.thumbnail,
            published_at: v.publishedAt,
            duration_seconds: v.duration,
            view_count: v.views,
            like_count: v.likes,
            comment_count: v.comments,
          }));
          await upsertVideos(videosToUpsert, dbChannel.id);
        }

        await reloadSupabaseCompetitors();
      } catch (dbErr) {
        console.warn('[Competitors] Supabase refresh save failed:', dbErr);
      }
    } catch (err) {
      console.error('[Refresh]', competitor.name, err);
      setRefreshError(prev => ({ ...prev, [competitorId]: err.message }));
    } finally {
      setRefreshingId(null);
    }
  };

  // Export competitors as JSON
  const exportCompetitors = () => {
    const dataStr = JSON.stringify(competitors, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `competitors-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import competitors from JSON
  const importCompetitors = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result);
        if (Array.isArray(imported)) {
          setCompetitors(imported);
          localStorage.setItem('competitors', JSON.stringify(imported));
          setError("");
        } else {
          setError("Invalid import file format");
        }
      } catch (err) {
        setError("Failed to parse import file");
      }
    };
    reader.readAsText(file);
  };

  // Derive the active competitor list based on view mode
  // In master view: use Supabase data (all clients). In client view: prefer Supabase, fallback to localStorage
  const activeCompetitors = useMemo(() => {
    let result = [];

    // In client-specific view (not master), only show Supabase competitors
    // that are explicitly assigned to this client. Don't fall back to localStorage.
    if (!masterView && supabaseCompetitors.length === 0) {
      // No competitors assigned to this client - return empty
      return [];
    }

    if (supabaseCompetitors.length > 0) {
      result = supabaseCompetitors.map(ch => {
        // Base defaults for fields not stored in Supabase
        const defaults = {
          uploadsLast30Days: 0,
          uploadsLast60Days: 0,
          uploadsLast90Days: 0,
          shortsCount: 0,
          longsCount: 0,
          shorts30d: 0,
          longs30d: 0,
          avgViewsPerVideo: ch.video_count > 0 ? (ch.total_view_count || 0) / ch.video_count : 0,
          avgShortsViews: 0,
          avgLongsViews: 0,
          engagementRate: 0,
          uploadFrequency: 0,
          topVideos: [],
          contentSeries: [],
          videos: [],
        };
        // Merge: defaults < localStorage enrichment < Supabase identity
        const localMatch = competitors.find(lc => lc.id === ch.youtube_channel_id) || {};
        return {
          ...defaults,
          ...localMatch,
          // Supabase fields always win for identity/metadata
          id: ch.youtube_channel_id,
          name: ch.name,
          description: ch.description,
          thumbnail: ch.thumbnail_url,
          subscriberCount: ch.subscriber_count || 0,
          videoCount: ch.video_count || 0,
          viewCount: ch.total_view_count || 0,
          category: ch.category,
          tags: ch.tags || [],
          tier: ch.tier || (ch.tags || []).find(t => t.startsWith('tier:'))?.split(':')[1] || null,
          subcategory: ch.subcategory || (ch.tags || []).find(t => t.startsWith('subcategory:'))?.split(':')[1] || null,
          notes: ch.notes || null,
          client_id: ch.client_id,
          supabaseId: ch.id,
          industry: ch.industry || null,
        };
      });
    } else if (masterView) {
      // Only use localStorage competitors in master view as fallback
      result = competitors;
    }
    // Note: in client-specific view with no Supabase competitors, result stays empty

    // Apply industry filter in master view
    if (masterView && industryFilter) {
      result = result.filter(c => c.industry === industryFilter);
    }

    // Apply category filter if categories are selected
    if (selectedCategoryIds.length > 0) {
      // Get all category slugs for selected IDs
      const selectedSlugs = new Set();
      const addCategorySlugs = (tree) => {
        tree.forEach(cat => {
          if (selectedCategoryIds.includes(cat.id)) {
            selectedSlugs.add(cat.slug);
            // Also add all children's slugs
            const addChildSlugs = (children) => {
              children.forEach(child => {
                selectedSlugs.add(child.slug);
                if (child.children) addChildSlugs(child.children);
              });
            };
            if (cat.children) addChildSlugs(cat.children);
          }
          if (cat.children) addCategorySlugs(cat.children);
        });
      };
      addCategorySlugs(categoryTree);

      if (selectedSlugs.size > 0) {
        result = result.filter(c => selectedSlugs.has(c.category));
      }
    }

    return result;
  }, [supabaseCompetitors, competitors, masterView, industryFilter, selectedCategoryIds, categoryTree]);

  // Load outliers scoped to current client's competitors
  useEffect(() => {
    const scopedIds = activeCompetitors.map(c => c.supabaseId).filter(Boolean);
    fetchOutliers(scopedIds);
  }, [activeCompetitors, fetchOutliers]);

  // Bulk assign categories to a client
  const handleBulkCategoryAssign = useCallback(async (categorySlugs, targetClientId) => {
    if (!categorySlugs.length) return { success: 0, failed: 0 };

    setBulkAssignLoading(true);
    try {
      const { supabase } = await import('../../services/supabaseClient');

      // Find all competitors matching the selected categories
      const competitorsToUpdate = activeCompetitors.filter(c =>
        categorySlugs.includes(c.category)
      );

      if (competitorsToUpdate.length === 0) {
        return { success: 0, failed: 0 };
      }

      // Get Supabase IDs
      const supabaseIds = competitorsToUpdate
        .map(c => c.supabaseId)
        .filter(Boolean);

      if (supabaseIds.length === 0) {
        return { success: 0, failed: 0 };
      }

      // Update all matching channels
      const { error } = await supabase
        .from('channels')
        .update({ client_id: targetClientId })
        .in('id', supabaseIds);

      if (error) throw error;

      await reloadSupabaseCompetitors();

      return { success: supabaseIds.length, failed: 0 };
    } catch (err) {
      console.error('[Bulk Assign] Failed:', err);
      return { success: 0, failed: 1, error: err.message };
    } finally {
      setBulkAssignLoading(false);
    }
  }, [activeCompetitors, reloadSupabaseCompetitors]);

  // Fetch bulk snapshots when trends view is active
  useEffect(() => {
    if (viewMode !== 'trends') return;
    if (activeCompetitors.length === 0) return;

    const fetchSnapshots = async () => {
      setSnapshotLoading(true);
      try {
        const { getBulkChannelSnapshots } = await import('../../services/competitorDatabase');
        const supabaseIds = activeCompetitors
          .map(c => c.supabaseId)
          .filter(Boolean);
        if (supabaseIds.length === 0) { setSnapshotLoading(false); return; }
        const days = trendsTimeRange === 0 ? 365 : trendsTimeRange;
        const data = await getBulkChannelSnapshots(supabaseIds, { days });
        setSnapshotData(data);
      } catch (err) {
        console.error('[Trends] Failed to load snapshots:', err);
      } finally {
        setSnapshotLoading(false);
      }
    };

    fetchSnapshots();
  }, [viewMode, activeCompetitors, trendsTimeRange]);

  // Group competitors by category for collapsible display
  const groupedCompetitors = useMemo(() => {
    const groups = {};

    // Initialize groups from config
    Object.entries(categoryConfig).forEach(([key, config]) => {
      groups[key] = {
        key,
        config,
        channels: [],
        channelCount: 0,
        totalSubs: 0,
        totalViews: 0,
        totalVideos: 0,
        totalUploads30d: 0,
        totalShorts30d: 0,
        totalLongs30d: 0,
        totalEngagement: 0,
        primaryCount: 0,
        secondaryCount: 0,
        tertiaryCount: 0,
        hasData: false,
      };
    });

    // Assign channels to groups
    activeCompetitors.forEach(comp => {
      const cat = comp.category || 'lds-faithful'; // fallback
      if (!groups[cat]) return;
      const g = groups[cat];
      g.channels.push(comp);
      g.channelCount++;
      g.totalSubs += comp.subscriberCount || 0;
      g.totalViews += comp.viewCount || 0;
      g.totalVideos += comp.videoCount || 0;
      g.totalUploads30d += comp.uploadsLast30Days || 0;
      g.totalShorts30d += comp.shorts30d || 0;
      g.totalLongs30d += comp.longs30d || 0;
      g.totalEngagement += comp.engagementRate || 0;
      if (comp.tier === 'primary') g.primaryCount++;
      else if (comp.tier === 'secondary') g.secondaryCount++;
      else g.tertiaryCount++;
      if (comp.subscriberCount > 0 || comp.viewCount > 0) g.hasData = true;
    });

    // Compute averages, derived metrics, and sort
    return Object.values(groups)
      .filter(g => g.channelCount > 0)
      .map(g => {
        // Top performer by avg views per video
        const topPerformer = g.channels.reduce((best, ch) =>
          (ch.avgViewsPerVideo || 0) > (best?.avgViewsPerVideo || 0) ? ch : best
        , null);

        // Category-level subscriber growth from channel history
        const channelsWithGrowth = g.channels.filter(ch => ch.history && ch.history.length > 0);
        const avgSubGrowthPct = channelsWithGrowth.length > 0
          ? channelsWithGrowth.reduce((sum, ch) => {
              const prev = ch.history[ch.history.length - 1];
              return sum + ((ch.subscriberCount - prev.subscriberCount) / Math.max(prev.subscriberCount, 1)) * 100;
            }, 0) / channelsWithGrowth.length
          : 0;

        // Format distribution
        const totalFormat = g.totalShorts30d + g.totalLongs30d;
        const shortsPct = totalFormat > 0 ? (g.totalShorts30d / totalFormat) * 100 : 0;
        const longsPct = totalFormat > 0 ? (g.totalLongs30d / totalFormat) * 100 : 0;

        // Format variance — high variance = diverse strategies = content gap signal
        const formatVariance = g.channels.length > 1
          ? g.channels.reduce((variance, ch) => {
              const chTotal = (ch.shorts30d || 0) + (ch.longs30d || 0);
              if (chTotal === 0) return variance;
              const chShortsPct = (ch.shorts30d || 0) / chTotal;
              const groupShortsPct = totalFormat > 0 ? g.totalShorts30d / totalFormat : 0;
              return variance + Math.abs(chShortsPct - groupShortsPct);
            }, 0) / g.channels.length
          : 0;

        return {
          ...g,
          avgSubs: g.channelCount > 0 ? g.totalSubs / g.channelCount : 0,
          avgEngagement: g.channelCount > 0 ? g.totalEngagement / g.channelCount : 0,
          avgViews: g.channelCount > 0
            ? g.channels.reduce((s, ch) => s + (ch.avgViewsPerVideo || 0), 0) / g.channelCount
            : 0,
          avgUploads30d: g.channelCount > 0 ? g.totalUploads30d / g.channelCount : 0,
          topPerformer,
          avgSubGrowthPct,
          shortsPct,
          longsPct,
          formatVariance,
        };
      })
      .sort((a, b) => a.config.order - b.config.order);
  }, [activeCompetitors]);

  // Calculate benchmarks
  const benchmarks = useMemo(() => {
    if (activeCompetitors.length === 0 || !yourStats) return null;

    const avgCompetitorSubs = activeCompetitors.reduce((s, c) => s + c.subscriberCount, 0) / activeCompetitors.length;
    const avgCompetitorVideos = activeCompetitors.reduce((s, c) => s + c.videoCount, 0) / activeCompetitors.length;
    const avgCompetitorViews = activeCompetitors.reduce((s, c) => s + c.avgViewsPerVideo, 0) / activeCompetitors.length;
    const avgCompetitorFrequency = activeCompetitors.reduce((s, c) => s + c.uploadsLast30Days, 0) / activeCompetitors.length;
    const avgCompetitorShorts = activeCompetitors.reduce((s, c) => s + c.shorts30d, 0) / activeCompetitors.length;
    const avgCompetitorLongs = activeCompetitors.reduce((s, c) => s + c.longs30d, 0) / activeCompetitors.length;
    const avgCompetitorEngagement = activeCompetitors.reduce((s, c) => s + c.engagementRate, 0) / activeCompetitors.length;

    return {
      subscriberGap: ((yourStats.totalSubscribers - avgCompetitorSubs) / Math.max(avgCompetitorSubs, 1)) * 100,
      videoGap: ((yourStats.totalVideos - avgCompetitorVideos) / Math.max(avgCompetitorVideos, 1)) * 100,
      viewsGap: ((yourStats.avgViewsPerVideo - avgCompetitorViews) / Math.max(avgCompetitorViews, 1)) * 100,
      frequencyGap: ((yourStats.videosLast30Days - avgCompetitorFrequency) / Math.max(avgCompetitorFrequency, 1)) * 100,
      shortsGap: ((yourStats.shortsCount - avgCompetitorShorts) / Math.max(avgCompetitorShorts, 1)) * 100,
      longsGap: ((yourStats.longsCount - avgCompetitorLongs) / Math.max(avgCompetitorLongs, 1)) * 100,
      avgCompetitorSubs,
      avgCompetitorVideos,
      avgCompetitorViews,
      avgCompetitorFrequency,
      avgCompetitorShorts,
      avgCompetitorLongs,
      avgCompetitorEngagement
    };
  }, [activeCompetitors, yourStats]);

  // Strategic insights
  const insights = useMemo(() => {
    if (activeCompetitors.length === 0) return [];

    const allInsights = [];

    // Analyze upload frequency
    const highFreqCompetitors = activeCompetitors.filter(c => c.uploadsLast30Days > 10);
    if (highFreqCompetitors.length > 0 && yourStats && yourStats.videosLast30Days < 10) {
      allInsights.push({
        type: "Upload Velocity",
        insight: `${highFreqCompetitors.length} competitor(s) upload ${fmtInt(highFreqCompetitors.reduce((s, c) => s + c.uploadsLast30Days, 0) / highFreqCompetitors.length)}x per month. You're uploading ${yourStats.videosLast30Days}x. Consider increasing cadence.`,
        severity: "medium",
        icon: "📅"
      });
    }

    // Analyze shorts vs long-form strategy
    const shortsHeavyCompetitors = activeCompetitors.filter(c => c.shorts30d > c.longs30d * 2);
    if (shortsHeavyCompetitors.length >= activeCompetitors.length / 2) {
      allInsights.push({
        type: "Format Strategy",
        insight: `${shortsHeavyCompetitors.length} of ${activeCompetitors.length} competitors heavily favor Shorts (avg ${fmtInt(shortsHeavyCompetitors.reduce((s, c) => s + c.shorts30d, 0) / shortsHeavyCompetitors.length)} shorts vs ${fmtInt(shortsHeavyCompetitors.reduce((s, c) => s + c.longs30d, 0) / shortsHeavyCompetitors.length)} long-form/month).`,
        severity: "info",
        icon: "📱"
      });
    }

    // Analyze content series
    const seriesCompetitors = activeCompetitors.filter(c => c.contentSeries && c.contentSeries.length > 0);
    if (seriesCompetitors.length > 0) {
      const topSeries = seriesCompetitors
        .flatMap(c => c.contentSeries)
        .sort((a, b) => b.avgViews - a.avgViews)[0];

      allInsights.push({
        type: "Content Series",
        insight: `${seriesCompetitors.length} competitor(s) use recurring content series. Top series: "${topSeries.name}" (${topSeries.count} episodes, ${fmtInt(topSeries.avgViews)} avg views).`,
        severity: "high",
        icon: "🎬"
      });
    }

    // Analyze engagement
    if (benchmarks) {
      const highEngagement = activeCompetitors.filter(c => c.engagementRate > benchmarks.avgCompetitorEngagement * 1.2);
      if (highEngagement.length > 0) {
        allInsights.push({
          type: "Engagement",
          insight: `Top performing competitors have ${fmtPct(benchmarks.avgCompetitorEngagement)} engagement rate (likes + comments / views). Study their comment hooks and CTAs.`,
          severity: "medium",
          icon: "💬"
        });
      }
    }

    return allInsights;
  }, [activeCompetitors, yourStats, benchmarks]);

  // Filtered + sorted competitors for table view
  const filteredSortedCompetitors = useMemo(() => {
    let list = activeCompetitors;
    if (selectedCategory) {
      list = list.filter(c => c.category === selectedCategory);
    }
    return [...list].sort((a, b) => {
      const aVal = a[sortCol] || 0;
      const bVal = b[sortCol] || 0;
      if (typeof aVal === 'string') {
        return sortDir ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      return sortDir ? bVal - aVal : aVal - bVal;
    });
  }, [activeCompetitors, selectedCategory, sortCol, sortDir]);

  // Selected channel for the detail drawer
  const selectedChannel = useMemo(() => {
    if (!selectedChannelId) return null;
    return activeCompetitors.find(c => c.id === selectedChannelId) || null;
  }, [selectedChannelId, activeCompetitors]);

  // Handle sort column click
  const handleSort = useCallback((col) => {
    if (sortCol === col) {
      setSortDir(prev => !prev);
    } else {
      setSortCol(col);
      setSortDir(true);
    }
  }, [sortCol]);

  return (
    <div style={{ padding: "0" }}>
      {/* ── SECTION 1: HEADER TOOLBAR ── */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "16px 24px",
        marginBottom: "16px",
      }}>
        {/* Top row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                Competitor Analysis
              </div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                {activeCompetitors.length} channels, {groupedCompetitors.length} categories
                {masterView && " (all clients)"}
              </div>
            </div>
            {supabaseLoading && (
              <Loader size={16} style={{ color: "#888", animation: "spin 1s linear infinite" }} />
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Master/Client toggle */}
            <button
              onClick={() => setMasterView(!masterView)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "6px 12px",
                background: masterView ? "rgba(139, 92, 246, 0.15)" : "#252525",
                border: `1px solid ${masterView ? "#8b5cf6" : "#444"}`,
                borderRadius: "6px",
                color: masterView ? "#a78bfa" : "#9E9E9E",
                fontSize: "12px", fontWeight: "600", cursor: "pointer",
              }}
            >
              <Eye size={14} />
              {masterView ? "Master" : "Client"}
            </button>

            {/* Industry Filter (only in master view) */}
            {masterView && (
              <div style={{ display: "flex", gap: "4px", marginLeft: "8px" }}>
                {INDUSTRY_FILTERS.map(ind => (
                  <button
                    key={ind.id || 'all'}
                    onClick={() => setIndustryFilter(ind.id)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: "500",
                      background: industryFilter === ind.id ? ind.color + '20' : "transparent",
                      border: `1px solid ${industryFilter === ind.id ? ind.color : '#444'}`,
                      color: industryFilter === ind.id ? ind.color : "#888",
                      cursor: "pointer",
                    }}
                  >
                    {ind.label}
                  </button>
                ))}
              </div>
            )}

            {/* Bulk Assign Button (only in master view) */}
            {masterView && allClients.length > 0 && (
              <button
                onClick={() => setShowBulkAssignModal(true)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", marginLeft: "8px",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid #10b981",
                  borderRadius: "6px",
                  color: "#10b981",
                  fontSize: "12px", fontWeight: "600", cursor: "pointer",
                }}
              >
                <Layers size={14} />
                Bulk Assign
              </button>
            )}

            {/* Import Database (only when empty) */}
            {activeClient?.id && activeCompetitors.length === 0 && !importing && (
              <button
                onClick={handleImportDatabase}
                style={{
                  background: "rgba(139, 92, 246, 0.15)", border: "1px solid #8b5cf6",
                  borderRadius: "6px", padding: "6px 12px", color: "#a78bfa",
                  fontSize: "12px", fontWeight: "600", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "6px",
                }}
              >
                <Download size={14} />
                Import Database
              </button>
            )}
            {importing && importProgress && (
              <div style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "6px 12px", background: "rgba(139, 92, 246, 0.1)",
                border: "1px solid #8b5cf630", borderRadius: "6px",
                fontSize: "11px", color: "#a78bfa",
              }}>
                <Loader size={12} style={{ animation: "spin 1s linear infinite" }} />
                {importProgress.current}/{importProgress.total}
              </div>
            )}

            {/* + Add button */}
            {!masterView && (
              <button
                onClick={() => setShowAddPopover(!showAddPopover)}
                style={{
                  background: showAddPopover ? "#2563eb" : "#3b82f6",
                  border: "none", borderRadius: "6px", padding: "6px 12px",
                  color: "#fff", fontSize: "12px", fontWeight: "600",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                }}
              >
                <Plus size={14} />
                Add
              </button>
            )}

            {/* Sync All */}
            {activeCompetitors.length > 0 && (
              <button
                onClick={() => {
                  activeCompetitors.forEach(c => refreshCompetitor(c.id));
                }}
                style={{
                  background: "transparent", border: "1px solid #555",
                  borderRadius: "6px", padding: "6px 12px",
                  color: "#aaa", fontSize: "12px", fontWeight: "600",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                }}
              >
                <RefreshCw size={14} />
                Sync All
              </button>
            )}

            {/* Settings overflow menu */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                style={{
                  background: "transparent", border: "1px solid #444",
                  borderRadius: "6px", padding: "6px 8px",
                  color: "#888", cursor: "pointer", display: "flex", alignItems: "center",
                }}
              >
                <MoreVertical size={16} />
              </button>
              {showSettingsMenu && (
                <div style={{
                  position: "absolute", top: "100%", right: 0, marginTop: "4px",
                  background: "#252525", border: "1px solid #444", borderRadius: "8px",
                  padding: "4px", minWidth: "200px", zIndex: 100,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}>
                  <button
                    onClick={() => { setShowApiKeyInput(!showApiKeyInput); setShowSettingsMenu(false); }}
                    style={{
                      width: "100%", background: "transparent", border: "none",
                      padding: "8px 12px", color: apiKey ? "#10b981" : "#fff",
                      fontSize: "12px", cursor: "pointer", textAlign: "left",
                      borderRadius: "4px", display: "flex", alignItems: "center", gap: "8px",
                    }}
                    onMouseOver={e => e.currentTarget.style.background = "#333"}
                    onMouseOut={e => e.currentTarget.style.background = "transparent"}
                  >
                    <Settings size={14} />
                    {apiKey ? "API Key Set" : "Set API Key"}
                  </button>
                  {masterView && (
                    <button
                      onClick={() => { setShowCSVImport(true); setShowSettingsMenu(false); }}
                      style={{
                        width: "100%", background: "transparent", border: "none",
                        padding: "8px 12px", color: "#a78bfa", fontSize: "12px",
                        cursor: "pointer", textAlign: "left", borderRadius: "4px",
                        display: "flex", alignItems: "center", gap: "8px",
                      }}
                      onMouseOver={e => e.currentTarget.style.background = "#333"}
                      onMouseOut={e => e.currentTarget.style.background = "transparent"}
                    >
                      <Upload size={14} />
                      Import CSV
                    </button>
                  )}
                  <div style={{ padding: "4px 12px" }}>
                    <div style={{ fontSize: "10px", color: "#666", marginBottom: "4px" }}>Timezone</div>
                    <select
                      value={userTimezone}
                      onChange={(e) => { setUserTimezone(e.target.value); localStorage.setItem('user_timezone', e.target.value); }}
                      style={{
                        width: "100%", background: "#1E1E1E", border: "1px solid #444",
                        borderRadius: "4px", padding: "4px 8px", color: "#fff", fontSize: "11px",
                      }}
                    >
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">EST (New York)</option>
                      <option value="America/Chicago">CST (Chicago)</option>
                      <option value="America/Denver">MST (Denver)</option>
                      <option value="America/Los_Angeles">PST (Los Angeles)</option>
                      <option value="Europe/London">GMT (London)</option>
                      <option value="Europe/Paris">CET (Paris)</option>
                      <option value="Asia/Tokyo">JST (Tokyo)</option>
                      <option value="Australia/Sydney">AEST (Sydney)</option>
                    </select>
                  </div>
                  {!masterView && activeCompetitors.length > 0 && (
                    <>
                      <button
                        onClick={() => { exportCompetitors(); setShowSettingsMenu(false); }}
                        style={{
                          width: "100%", background: "transparent", border: "none",
                          padding: "8px 12px", color: "#aaa", fontSize: "12px",
                          cursor: "pointer", textAlign: "left", borderRadius: "4px",
                          display: "flex", alignItems: "center", gap: "8px",
                        }}
                        onMouseOver={e => e.currentTarget.style.background = "#333"}
                        onMouseOut={e => e.currentTarget.style.background = "transparent"}
                      >
                        <Download size={14} />
                        Export JSON
                      </button>
                      <label style={{ display: "block" }}>
                        <input type="file" accept=".json" onChange={(e) => { importCompetitors(e); setShowSettingsMenu(false); }} style={{ display: "none" }} />
                        <div
                          style={{
                            width: "100%", background: "transparent", border: "none",
                            padding: "8px 12px", color: "#aaa", fontSize: "12px",
                            cursor: "pointer", textAlign: "left", borderRadius: "4px",
                            display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box",
                          }}
                          onMouseOver={e => e.currentTarget.style.background = "#333"}
                          onMouseOut={e => e.currentTarget.style.background = "transparent"}
                        >
                          <Upload size={14} />
                          Import JSON
                        </div>
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* API Key Input (collapsible) */}
        {showApiKeyInput && (
          <div style={{ marginTop: "12px", background: "#252525", border: "1px solid #333", borderRadius: "8px", padding: "12px" }}>
            <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
              YouTube Data API v3 Key &mdash; <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa" }}>Get from Google Cloud Console</a>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your YouTube Data API key"
                style={{ flex: 1, background: "#1E1E1E", border: "1px solid #333", borderRadius: "6px", padding: "8px 10px", color: "#fff", fontSize: "12px" }}
              />
              <button onClick={saveApiKey} style={{ background: "#10b981", border: "none", borderRadius: "6px", padding: "8px 16px", color: "#fff", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>
                Save
              </button>
            </div>
          </div>
        )}

        {/* Add Competitor Popover (collapsible) - supports URL paste or keyword search */}
        {showAddPopover && !masterView && (
          <div style={{ marginTop: "12px", background: "#252525", border: "1px solid #333", borderRadius: "8px", padding: "12px", position: "relative" }}>
            <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
              Search YouTube or paste a channel URL
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text" value={newCompetitor}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewCompetitor(val);
                  setSearchResults([]);

                  // If it looks like a search query (not a URL), trigger debounced search
                  const isUrl = val.includes('youtube.com') || val.startsWith('@') || val.startsWith('UC') || val.startsWith('http');
                  if (!isUrl && val.trim().length >= 3 && apiKey) {
                    setSearchLoading(true);
                    clearTimeout(window._searchDebounce);
                    window._searchDebounce = setTimeout(async () => {
                      try {
                        const { youtubeAPI } = await import('../../services/youtubeAPI');
                        const results = await youtubeAPI.searchChannels(val.trim(), 5);
                        setSearchResults(results);
                      } catch (err) {
                        console.warn('[Search]', err.message);
                        setSearchResults([]);
                      } finally {
                        setSearchLoading(false);
                      }
                    }, 500);
                  } else {
                    setSearchLoading(false);
                  }
                }}
                placeholder="e.g. retirement planning or https://youtube.com/@channel"
                style={{ flex: 1, background: "#1E1E1E", border: "1px solid #333", borderRadius: "6px", padding: "8px 10px", color: "#fff", fontSize: "12px" }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearchResults([]);
                    addCompetitor();
                  }
                }}
              />
              <button
                onClick={() => { setSearchResults([]); addCompetitor(); }} disabled={loading}
                style={{
                  background: loading ? "#555" : "#3b82f6", border: "none", borderRadius: "6px",
                  padding: "8px 16px", color: "#fff", fontSize: "12px", fontWeight: "600",
                  cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "4px",
                }}
              >
                {loading ? "Adding..." : <><Plus size={14} /> Add</>}
              </button>
            </div>

            {/* Search Results Dropdown */}
            {searchLoading && (
              <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "6px", color: "#888", fontSize: "11px" }}>
                <Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> Searching YouTube...
              </div>
            )}
            {!searchLoading && searchResults.length > 0 && (
              <div style={{ marginTop: "8px", background: "#1E1E1E", border: "1px solid #333", borderRadius: "8px", overflow: "hidden" }}>
                {searchResults.map((result, idx) => {
                  const alreadyAdded = activeCompetitors.some(c => c.id === result.channelId);
                  return (
                    <div
                      key={result.channelId}
                      onClick={() => {
                        if (alreadyAdded || loading) return;
                        const url = `https://youtube.com/channel/${result.channelId}`;
                        setNewCompetitor(url);
                        setSearchResults([]);
                        addCompetitor(url);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px",
                        cursor: alreadyAdded ? "default" : "pointer",
                        opacity: alreadyAdded ? 0.5 : 1,
                        borderTop: idx > 0 ? "1px solid #333" : "none",
                        transition: "background 0.1s",
                      }}
                      onMouseOver={(e) => !alreadyAdded && (e.currentTarget.style.background = "#2a2a2a")}
                      onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <img
                        src={result.thumbnail} alt=""
                        style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {result.name}
                        </div>
                        <div style={{ fontSize: "10px", color: "#888" }}>
                          {result.subscriberCount > 0 ? `${(result.subscriberCount / 1000).toFixed(result.subscriberCount >= 1000000 ? 0 : 1)}K subs` : 'Subs hidden'}
                          {' · '}{result.videoCount} videos
                        </div>
                      </div>
                      {alreadyAdded ? (
                        <div style={{ fontSize: "10px", color: "#10b981", fontWeight: "600", flexShrink: 0 }}>Added</div>
                      ) : (
                        <Plus size={14} style={{ color: "#3b82f6", flexShrink: 0 }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {error && (
              <div style={{ marginTop: "6px", padding: "6px 10px", background: "#ef444420", border: "1px solid #ef4444", borderRadius: "6px", color: "#ef4444", fontSize: "11px" }}>
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 2: KPI STRIP ── */}
      {activeCompetitors.length > 0 && yourStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
          {/* Rank */}
          <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "10px", padding: "16px", borderTop: "3px solid #3b82f6" }}>
            <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600", marginBottom: "8px" }}>
              Rank
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "#fff" }}>
              #{(() => {
                const allChannels = [
                  { subs: yourStats.totalSubscribers, isYou: true },
                  ...activeCompetitors.map(c => ({ subs: c.subscriberCount, isYou: false }))
                ].sort((a, b) => b.subs - a.subs);
                return allChannels.findIndex(c => c.isYou) + 1;
              })()}
            </div>
            <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
              of {activeCompetitors.length + 1} channels
            </div>
          </div>

          {/* Gap to Leader */}
          <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "10px", padding: "16px", borderTop: "3px solid #f59e0b" }}>
            <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600", marginBottom: "8px" }}>
              Gap to #1
            </div>
            {(() => {
              const leaderSubs = Math.max(...activeCompetitors.map(c => c.subscriberCount));
              const gap = yourStats.totalSubscribers - leaderSubs;
              const isLeader = gap >= 0;
              return (
                <>
                  <div style={{ fontSize: "28px", fontWeight: "700", color: isLeader ? "#10b981" : "#f59e0b" }}>
                    {isLeader ? "Leader" : fmtInt(gap)}
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
                    {isLeader ? "You're #1 by subs" : "subscribers behind"}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Momentum */}
          <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "10px", padding: "16px", borderTop: "3px solid #8b5cf6" }}>
            <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600", marginBottom: "8px" }}>
              Momentum
            </div>
            {(() => {
              const yourUploadFreq = yourStats.videosLast30Days;
              const avgCompetitorFreq = activeCompetitors.reduce((sum, c) => sum + (c.uploadsLast30Days || 0), 0) / activeCompetitors.length;
              const isAhead = yourUploadFreq > avgCompetitorFreq;
              return (
                <>
                  <div style={{ fontSize: "28px", fontWeight: "700", color: isAhead ? "#10b981" : "#f59e0b" }}>
                    {yourUploadFreq}/mo
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
                    {isAhead ? "Above" : "Below"} avg ({avgCompetitorFreq.toFixed(1)}/mo)
                  </div>
                </>
              );
            })()}
          </div>

          {/* Views Performance */}
          <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "10px", padding: "16px", borderTop: "3px solid #10b981" }}>
            <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600", marginBottom: "8px" }}>
              Views vs Avg
            </div>
            {(() => {
              const yourAvgViews = yourStats.avgViewsPerVideo;
              const avgCompetitorViews = activeCompetitors.reduce((sum, c) => sum + (c.avgViewsPerVideo || 0), 0) / activeCompetitors.length;
              const isAhead = yourAvgViews > avgCompetitorViews;
              const diff = avgCompetitorViews > 0 ? ((yourAvgViews / avgCompetitorViews - 1) * 100).toFixed(0) : 0;
              return (
                <>
                  <div style={{ fontSize: "28px", fontWeight: "700", color: isAhead ? "#10b981" : "#f59e0b" }}>
                    {isAhead ? "+" : ""}{diff}%
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
                    vs competitor avg
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── CATEGORY BROWSER (Master View) or COMPETITIVE INTELLIGENCE (Client View) ── */}
      {activeCompetitors.length > 0 && masterView && (
        <div style={{ marginBottom: "16px" }}>
          <CategoryBrowser
            categoryTree={categoryTree}
            selectedCategoryIds={selectedCategoryIds}
            onCategorySelect={setSelectedCategoryIds}
            channels={activeCompetitors}
            loading={categoryLoading}
            onCategoryChange={loadCategories}
          />
        </div>
      )}

      {/* ── COMPETITIVE INTELLIGENCE PANEL (Client View Only) ── */}
      {activeCompetitors.length > 0 && !masterView && (
        <div style={{
          background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px",
          overflow: "hidden", marginBottom: "16px",
        }}>
          {/* Panel header */}
          <button
            onClick={() => setIntelligenceCollapsed(!intelligenceCollapsed)}
            style={{
              width: "100%", background: "transparent", border: "none",
              padding: "16px 20px", cursor: "pointer", textAlign: "left",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
              <BarChart3 size={16} color="#3b82f6" />
              Competitive Intelligence
            </div>
            {intelligenceCollapsed ? <ChevronDown size={16} color="#888" /> : <ChevronUp size={16} color="#888" />}
          </button>

          {!intelligenceCollapsed && (
            <div style={{ padding: "0 20px 20px" }}>
              {/* Tab bar */}
              <div style={{ display: "flex", gap: "0", borderBottom: "1px solid #333", marginBottom: "16px" }}>
                {[
                  { key: 'outliers', label: 'Outliers' },
                  { key: 'benchmarks', label: 'Benchmarks' },
                  { key: 'gaps', label: 'Content Gaps' },
                  { key: 'insights', label: 'Insights' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setIntelligenceTab(tab.key)}
                    style={{
                      padding: "8px 16px", background: "transparent", border: "none",
                      borderBottom: intelligenceTab === tab.key ? "2px solid #3b82f6" : "2px solid transparent",
                      color: intelligenceTab === tab.key ? "#fff" : "#888",
                      fontSize: "12px", fontWeight: "600", cursor: "pointer",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab: Outliers */}
              {intelligenceTab === 'outliers' && (
                <div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
                    <select value={outlierDays} onChange={(e) => setOutlierDays(Number(e.target.value))}
                      style={{ background: "#252525", border: "1px solid #555", borderRadius: "6px", padding: "6px 10px", color: "#fff", fontSize: "12px" }}>
                      <option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option><option value={180}>180 days</option>
                    </select>
                    <select value={outlierMinMultiplier} onChange={(e) => setOutlierMinMultiplier(Number(e.target.value))}
                      style={{ background: "#252525", border: "1px solid #555", borderRadius: "6px", padding: "6px 10px", color: "#fff", fontSize: "12px" }}>
                      <option value={2}>2x+ avg</option><option value={2.5}>2.5x+ avg</option><option value={3}>3x+ avg</option><option value={5}>5x+ avg</option>
                    </select>
                    <button onClick={() => fetchOutliers(activeCompetitors.map(c => c.supabaseId).filter(Boolean))} disabled={outliersLoading}
                      style={{ background: "#3b82f6", border: "none", borderRadius: "6px", padding: "6px 12px", color: "#fff", fontSize: "12px", fontWeight: "600", cursor: outliersLoading ? "not-allowed" : "pointer", opacity: outliersLoading ? 0.6 : 1 }}>
                      {outliersLoading ? "Loading..." : "Refresh"}
                    </button>
                  </div>
                  {outliersLoading && outliers.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px", color: "#888" }}>
                      <Loader size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
                      <div style={{ fontSize: "13px" }}>Detecting outlier videos...</div>
                    </div>
                  ) : outliers.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px", color: "#666", fontSize: "13px" }}>No outlier videos found. Try adjusting filters.</div>
                  ) : (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {outliers.map(video => (
                        <div key={video.id} style={{ background: "#252525", border: "1px solid #333", borderRadius: "8px", padding: "10px", display: "flex", gap: "12px", alignItems: "center" }}>
                          {video.thumbnail_url && <img src={video.thumbnail_url} alt="" style={{ width: "100px", height: "56px", borderRadius: "6px", objectFit: "cover", flexShrink: 0 }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "12px", fontWeight: "600", color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.title}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                              <span style={{ fontSize: "11px", color: "#888" }}>{video.channel?.name || "Unknown"}</span>
                              {(() => {
                                const comp = activeCompetitors.find(c => c.supabaseId === video.channel_id);
                                const cat = comp ? categoryConfig[comp.category] : null;
                                return cat ? (
                                  <span style={{ fontSize: "9px", fontWeight: "600", color: cat.color, background: `${cat.color}15`, padding: "1px 6px", borderRadius: "8px" }}>
                                    {cat.label}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                            <div style={{ display: "flex", gap: "10px", marginTop: "4px", fontSize: "10px", color: "#b0b0b0" }}>
                              <span>{fmtInt(video.view_count)} views</span>
                              <span>Ch avg: {fmtInt(video.channelAvgViews)}</span>
                            </div>
                          </div>
                          <div style={{
                            background: video.outlierScore >= 5 ? "#166534" : video.outlierScore >= 3 ? "#854d0e" : "#1e3a5f",
                            border: `1px solid ${video.outlierScore >= 5 ? "#22c55e" : video.outlierScore >= 3 ? "#f59e0b" : "#3b82f6"}`,
                            borderRadius: "6px", padding: "4px 8px", textAlign: "center", flexShrink: 0,
                          }}>
                            <div style={{ fontSize: "14px", fontWeight: "700", color: video.outlierScore >= 5 ? "#22c55e" : video.outlierScore >= 3 ? "#f59e0b" : "#3b82f6" }}>{video.outlierScore}x</div>
                          </div>
                          <button onClick={() => handleViewInsight(video)}
                            style={{ background: "#374151", border: "1px solid #555", borderRadius: "6px", padding: "6px 10px", color: "#fff", fontSize: "11px", fontWeight: "600", cursor: "pointer", flexShrink: 0 }}>
                            Insights
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Benchmarks */}
              {intelligenceTab === 'benchmarks' && yourStats && benchmarks && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                    <BenchmarkCard label="Subscribers" yourValue={yourStats.totalSubscribers} competitorAvg={benchmarks.avgCompetitorSubs} gap={benchmarks.subscriberGap} />
                    <BenchmarkCard label="Avg Views/Video" yourValue={yourStats.avgViewsPerVideo} competitorAvg={benchmarks.avgCompetitorViews} gap={benchmarks.viewsGap} />
                    <BenchmarkCard label="Uploads (30d)" yourValue={yourStats.videosLast30Days} competitorAvg={benchmarks.avgCompetitorFrequency} gap={benchmarks.frequencyGap} />
                    <BenchmarkCard label="Shorts (30d)" yourValue={yourStats.shortsCount} competitorAvg={benchmarks.avgCompetitorShorts} gap={benchmarks.shortsGap} />
                    <BenchmarkCard label="Long-form (30d)" yourValue={yourStats.longsCount} competitorAvg={benchmarks.avgCompetitorLongs} gap={benchmarks.longsGap} />
                  </div>
                </div>
              )}

              {/* Tab: Content Gaps */}
              {intelligenceTab === 'gaps' && rows && rows.length > 0 && (
                <ContentGapsPanel activeCompetitors={activeCompetitors} rows={rows} />
              )}

              {/* Tab: Insights */}
              {intelligenceTab === 'insights' && insights.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
                  {insights.map((insight, idx) => (
                    <div key={idx} style={{ background: "#252525", border: "1px solid #333", borderRadius: "8px", padding: "14px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                      <div style={{ fontSize: "24px" }}>{insight.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: "4px" }}>{insight.type}</div>
                        <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.5" }}>{insight.insight}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── COMPETITOR ROSTER ── */}

      {/* 3A: Category Filter Bar + View Toggle */}
      {activeCompetitors.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: "12px", gap: "12px",
        }}>
          <div style={{
            display: "flex", gap: "6px", overflowX: "auto", flex: 1,
            paddingBottom: "4px",
          }}>
            <button
              onClick={() => { if (viewMode === 'hubs') { setExpandedHubCategory(null); } else { setSelectedCategory(null); } }}
              style={{
                padding: "5px 12px", borderRadius: "16px", fontSize: "11px", fontWeight: "600",
                border: `1px solid ${(viewMode === 'hubs' ? !expandedHubCategory : !selectedCategory) ? '#3b82f6' : '#444'}`,
                background: (viewMode === 'hubs' ? !expandedHubCategory : !selectedCategory) ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: (viewMode === 'hubs' ? !expandedHubCategory : !selectedCategory) ? '#3b82f6' : '#888',
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              All ({activeCompetitors.length})
            </button>
            {Object.entries(categoryConfig).map(([key, cfg]) => {
              const count = activeCompetitors.filter(c => c.category === key).length;
              if (count === 0) return null;
              const isActive = viewMode === 'hubs' ? expandedHubCategory === key : selectedCategory === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    if (viewMode === 'hubs') {
                      setExpandedHubCategory(expandedHubCategory === key ? null : key);
                    } else {
                      setSelectedCategory(selectedCategory === key ? null : key);
                    }
                  }}
                  style={{
                    padding: "5px 12px", borderRadius: "16px", fontSize: "11px", fontWeight: "600",
                    border: `1px solid ${isActive ? cfg.color : '#444'}`,
                    background: isActive ? `${cfg.color}20` : 'transparent',
                    color: isActive ? cfg.color : '#888',
                    cursor: "pointer", whiteSpace: "nowrap",
                    display: "flex", alignItems: "center", gap: "4px",
                  }}
                >
                  <span style={{ fontSize: "13px" }}>{cfg.icon}</span>
                  {cfg.label.split(' ')[0]} ({count})
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
            <button
              onClick={() => { setViewMode('hubs'); setExpandedHubCategory(null); }}
              style={{
                padding: "6px 8px", borderRadius: "6px 0 0 6px",
                background: viewMode === 'hubs' ? '#333' : 'transparent',
                border: "1px solid #444", color: viewMode === 'hubs' ? '#fff' : '#666',
                cursor: "pointer",
              }}
              title="Category Hubs"
            ><Layers size={14} /></button>
            <button
              onClick={() => setViewMode('trends')}
              style={{
                padding: "6px 8px", borderRadius: "0 6px 6px 0",
                background: viewMode === 'trends' ? '#333' : 'transparent',
                border: "1px solid #444", borderLeft: "none",
                color: viewMode === 'trends' ? '#fff' : '#666', cursor: "pointer",
              }}
              title="Trends view"
            ><TrendingUp size={14} /></button>
          </div>
        </div>
      )}

      {/* 3B: Category Hubs View */}
      {activeCompetitors.length > 0 && viewMode === 'hubs' && (
        <div style={{ marginBottom: "16px" }}>
          {expandedHubCategory && (
            <button
              onClick={() => setExpandedHubCategory(null)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: "transparent", border: "1px solid #444",
                borderRadius: "6px", padding: "6px 12px", marginBottom: "12px",
                color: "#aaa", fontSize: "12px", fontWeight: "600", cursor: "pointer",
              }}
            >
              <ArrowUp size={12} style={{ transform: "rotate(-90deg)" }} /> All Categories
            </button>
          )}

          {!expandedHubCategory ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
              gap: "16px",
            }}>
              {groupedCompetitors.map(group => (
                <CategoryHubCard
                  key={group.key}
                  group={group}
                  onClick={() => setExpandedHubCategory(group.key)}
                />
              ))}
            </div>
          ) : (
            <HubDrilldown
              group={groupedCompetitors.find(g => g.key === expandedHubCategory)}
              onChannelClick={(id) => { setSelectedChannelId(id); setDrawerTab('overview'); }}
              selectedChannelId={selectedChannelId}
              sortCol={sortCol}
              sortDir={sortDir}
              onSort={handleSort}
            />
          )}
        </div>
      )}

      {/* 3C: Trends View */}
      {activeCompetitors.length > 0 && viewMode === 'trends' && (
        <Suspense fallback={
          <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", padding: "64px 24px", textAlign: "center", marginBottom: "16px" }}>
            <Loader size={32} style={{ color: "#555", margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
            <div style={{ fontSize: "14px", color: "#888" }}>Loading trends...</div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        }>
          <CompetitorTrends
            activeCompetitors={activeCompetitors}
            selectedCategory={selectedCategory}
            categoryConfig={categoryConfig}
            timeRange={trendsTimeRange}
            onTimeRangeChange={setTrendsTimeRange}
            snapshotData={snapshotData}
            snapshotLoading={snapshotLoading}
            yourChannelId={activeClient?.youtube_channel_id || null}
          />
        </Suspense>
      )}

      {/* Empty state */}
      {activeCompetitors.length === 0 && (
        <div style={{
          background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px",
          padding: "48px 24px", textAlign: "center", color: "#666", marginBottom: "16px",
        }}>
          <Search size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
          <div style={{ fontSize: "16px", marginBottom: "8px" }}>No competitors added yet</div>
          <div style={{ fontSize: "12px" }}>Add competitor channels to start benchmarking your performance</div>
        </div>
      )}

      {/* ── SECTION 4: CHANNEL DETAIL DRAWER ── */}
      {selectedChannel && (
        <ChannelDetailDrawer
          channel={selectedChannel}
          drawerTab={drawerTab}
          setDrawerTab={setDrawerTab}
          onClose={() => setSelectedChannelId(null)}
          onRefresh={refreshCompetitor}
          onRemove={(id) => { removeCompetitor(id); setSelectedChannelId(null); }}
          onCategoryChange={updateChannelCategory}
          isRefreshing={refreshingId === selectedChannel.id}
          refreshError={refreshError[selectedChannel.id] || null}
          userTimezone={userTimezone}
          clients={allClients}
          masterView={masterView}
          onClientAssignmentUpdate={handleClientAssignmentUpdate}
          categoryConfig={categoryConfig}
        />
      )}

      {/* Outlier Insights Slide-out Panel */}
      {selectedOutlier && (
        <div style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "420px",
          background: "#1a1a1a", borderLeft: "1px solid #333",
          zIndex: 1001, overflowY: "auto", padding: "24px",
          boxShadow: "-4px 0 20px rgba(0,0,0,0.5)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>AI Video Insights</div>
            <button onClick={() => { setSelectedOutlier(null); setInsightData(null); }}
              style={{ background: "transparent", border: "1px solid #555", borderRadius: "6px", padding: "6px 10px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ background: "#252525", borderRadius: "8px", padding: "14px", marginBottom: "20px" }}>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "6px" }}>{selectedOutlier.title}</div>
            <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>{selectedOutlier.channel?.name}</div>
            <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "#b0b0b0" }}>
              <span>{fmtInt(selectedOutlier.view_count)} views</span>
              <span style={{ color: "#f59e0b", fontWeight: "600" }}>{selectedOutlier.outlierScore}x avg</span>
            </div>
          </div>
          {insightLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#888" }}>
              <Loader size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
              <div style={{ fontSize: "13px" }}>Analyzing with Claude...</div>
            </div>
          ) : insightData?.error ? (
            <div style={{ background: "#2d1b1b", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "14px", color: "#fca5a5", fontSize: "13px" }}>{insightData.error}</div>
          ) : insightData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ background: "#252525", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#3b82f6", textTransform: "uppercase", marginBottom: "8px" }}>Hook Analysis</div>
                <div style={{ fontSize: "13px", color: "#e0e0e0", lineHeight: "1.6" }}>{insightData.hookAnalysis}</div>
              </div>
              <div style={{ background: "#252525", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#10b981", textTransform: "uppercase", marginBottom: "8px" }}>Why It Worked</div>
                <div style={{ fontSize: "13px", color: "#e0e0e0", lineHeight: "1.6" }}>{insightData.whyItWorked}</div>
              </div>
              <div style={{ background: "#252525", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#f59e0b", textTransform: "uppercase", marginBottom: "8px" }}>Applicable Tactics</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {(insightData.applicableTactics || []).map((tactic, i) => (
                    <div key={i} style={{ fontSize: "12px", color: "#e0e0e0", padding: "6px 10px", background: "#1a1a1a", borderRadius: "6px", borderLeft: "3px solid #f59e0b" }}>{tactic}</div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1, background: "#252525", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Content Angle</div>
                  <div style={{ fontSize: "13px", color: "#fff", fontWeight: "600", textTransform: "capitalize" }}>{insightData.contentAngle}</div>
                </div>
                <div style={{ flex: 1, background: "#252525", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Replicability</div>
                  <div style={{ fontSize: "13px", fontWeight: "600", textTransform: "capitalize", color: insightData.replicability === 'high' ? '#22c55e' : insightData.replicability === 'medium' ? '#f59e0b' : '#ef4444' }}>{insightData.replicability}</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* CSV Import Modal */}
      {showCSVImport && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.7)", zIndex: 2000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px",
            width: "600px", maxHeight: "80vh", overflow: "hidden",
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>Import CSV</div>
              <button onClick={() => setShowCSVImport(false)} style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: "20px" }}>
              <div style={{ fontSize: "12px", color: "#888", marginBottom: "12px" }}>
                Paste CSV with columns: <code style={{ background: "#333", padding: "2px 6px", borderRadius: "4px" }}>Category, Brand_Name, YouTube_URL, Overlap_Type</code>
              </div>
              <textarea
                value={csvText}
                onChange={(e) => setCSVText(e.target.value)}
                placeholder="Category,Brand_Name,YouTube_URL,Overlap_Type
Direct_Lifestyle_Audio,Beats by Dre,https://www.youtube.com/@beatsbydre,Brand_Aesthetic"
                style={{
                  width: "100%", height: "300px", background: "#252525", border: "1px solid #444",
                  borderRadius: "8px", padding: "12px", color: "#fff", fontSize: "12px",
                  fontFamily: "monospace", resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: "12px", marginTop: "16px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowCSVImport(false)}
                  style={{
                    padding: "8px 16px", background: "transparent", border: "1px solid #444",
                    borderRadius: "6px", color: "#888", fontSize: "13px", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCSVImport}
                  disabled={!csvText.trim()}
                  style={{
                    padding: "8px 20px", background: csvText.trim() ? "#8b5cf6" : "#333",
                    border: "none", borderRadius: "6px", color: "#fff", fontSize: "13px",
                    fontWeight: "600", cursor: csvText.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Assign Categories to Client Modal */}
      {showBulkAssignModal && (
        <BulkAssignModal
          categoryConfig={categoryConfig}
          activeCompetitors={activeCompetitors}
          clients={allClients}
          loading={bulkAssignLoading}
          onAssign={handleBulkCategoryAssign}
          onClose={() => setShowBulkAssignModal(false)}
        />
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════
    EXTRACTED INLINE COMPONENTS
   ═══════════════════════════════════════════════════ */

// Bulk Assign Modal — assign categories to a client
function BulkAssignModal({ categoryConfig, activeCompetitors, clients, loading, onAssign, onClose }) {
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [targetClientId, setTargetClientId] = useState('');
  const [result, setResult] = useState(null);

  // Get unique categories from active competitors
  const availableCategories = useMemo(() => {
    const catCounts = {};
    activeCompetitors.forEach(c => {
      if (c.category) {
        catCounts[c.category] = (catCounts[c.category] || 0) + 1;
      }
    });
    return Object.entries(catCounts).map(([slug, count]) => ({
      slug,
      label: categoryConfig[slug]?.label || slug,
      icon: categoryConfig[slug]?.icon || '📁',
      color: categoryConfig[slug]?.color || '#666',
      count,
    })).sort((a, b) => b.count - a.count);
  }, [activeCompetitors, categoryConfig]);

  // Count competitors that will be affected
  const affectedCount = useMemo(() => {
    return activeCompetitors.filter(c => selectedCategories.includes(c.category)).length;
  }, [activeCompetitors, selectedCategories]);

  const toggleCategory = (slug) => {
    setSelectedCategories(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  const selectAll = () => {
    setSelectedCategories(availableCategories.map(c => c.slug));
  };

  const selectNone = () => {
    setSelectedCategories([]);
  };

  const handleAssign = async () => {
    if (!targetClientId || selectedCategories.length === 0) return;
    const res = await onAssign(selectedCategories, targetClientId);
    setResult(res);
    if (res.success > 0) {
      // Auto-close after short delay on success
      setTimeout(() => onClose(), 1500);
    }
  };

  const targetClient = clients.find(c => c.id === targetClientId);

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.7)", zIndex: 2000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px",
        width: "550px", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>Bulk Assign to Client</div>
            <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>Select categories to assign all their competitors to a client</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "20px", flex: 1, overflowY: "auto" }}>
          {/* Target Client Selector */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "#888", display: "block", marginBottom: "8px" }}>
              Assign to Client
            </label>
            <select
              value={targetClientId}
              onChange={(e) => setTargetClientId(e.target.value)}
              style={{
                width: "100%", padding: "10px 12px", background: "#252525", border: "1px solid #444",
                borderRadius: "6px", color: "#fff", fontSize: "13px", cursor: "pointer",
              }}
            >
              <option value="">Select a client...</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          {/* Category Selection */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "#888" }}>
                Select Categories ({selectedCategories.length} selected)
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={selectAll} style={{ fontSize: "11px", color: "#10b981", background: "transparent", border: "none", cursor: "pointer" }}>
                  Select All
                </button>
                <span style={{ color: "#444" }}>|</span>
                <button onClick={selectNone} style={{ fontSize: "11px", color: "#888", background: "transparent", border: "none", cursor: "pointer" }}>
                  Clear
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "250px", overflowY: "auto" }}>
              {availableCategories.map(cat => (
                <label
                  key={cat.slug}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "10px 12px", background: selectedCategories.includes(cat.slug) ? "rgba(16, 185, 129, 0.1)" : "#252525",
                    border: `1px solid ${selectedCategories.includes(cat.slug) ? "#10b981" : "#333"}`,
                    borderRadius: "8px", cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(cat.slug)}
                    onChange={() => toggleCategory(cat.slug)}
                    style={{ width: "16px", height: "16px", accentColor: "#10b981" }}
                  />
                  <span style={{ fontSize: "16px" }}>{cat.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: "500", color: "#fff" }}>{cat.label}</div>
                    <div style={{ fontSize: "11px", color: "#888" }}>{cat.count} competitor{cat.count !== 1 ? 's' : ''}</div>
                  </div>
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "50%",
                    background: cat.color,
                  }} />
                </label>
              ))}

              {availableCategories.length === 0 && (
                <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
                  No categories with competitors found
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid #333", background: "#1a1a1a" }}>
          {/* Preview */}
          {affectedCount > 0 && targetClientId && (
            <div style={{
              padding: "10px 12px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "6px", marginBottom: "12px", fontSize: "12px", color: "#10b981",
            }}>
              {affectedCount} competitor{affectedCount !== 1 ? 's' : ''} will be assigned to <strong>{targetClient?.name}</strong>
            </div>
          )}

          {/* Result message */}
          {result && (
            <div style={{
              padding: "10px 12px",
              background: result.success > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
              border: `1px solid ${result.success > 0 ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              borderRadius: "6px", marginBottom: "12px", fontSize: "12px",
              color: result.success > 0 ? "#10b981" : "#ef4444",
            }}>
              {result.success > 0 ? `Successfully assigned ${result.success} competitors` : `Failed: ${result.error || 'Unknown error'}`}
            </div>
          )}

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              style={{
                padding: "8px 16px", background: "transparent", border: "1px solid #444",
                borderRadius: "6px", color: "#888", fontSize: "13px", cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={!targetClientId || selectedCategories.length === 0 || loading}
              style={{
                padding: "8px 20px",
                background: (targetClientId && selectedCategories.length > 0 && !loading) ? "#10b981" : "#333",
                border: "none", borderRadius: "6px", color: "#fff", fontSize: "13px",
                fontWeight: "600",
                cursor: (targetClientId && selectedCategories.length > 0 && !loading) ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", gap: "6px",
              }}
            >
              {loading ? (
                <>
                  <Loader size={14} style={{ animation: "spin 1s linear infinite" }} />
                  Assigning...
                </>
              ) : (
                <>
                  <Check size={14} />
                  Assign {affectedCount > 0 ? `${affectedCount} Competitors` : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Channel Detail Drawer — right-side slide-out panel
function ChannelDetailDrawer({ channel, drawerTab, setDrawerTab, onClose, onRefresh, onRemove, onCategoryChange, isRefreshing, refreshError, userTimezone, clients, masterView, onClientAssignmentUpdate, categoryConfig }) {
  const titleAnalysis = useMemo(() => drawerTab === 'content' ? analyzeTitlePatterns(channel.videos) : null, [channel.videos, drawerTab]);
  const scheduleAnalysis = useMemo(() => drawerTab === 'schedule' ? analyzeUploadSchedule(channel.videos, userTimezone) : null, [channel.videos, userTimezone, drawerTab]);
  const formatAnalysis = useMemo(() => drawerTab === 'content' ? categorizeContentFormats(channel.videos) : null, [channel.videos, drawerTab]);

  const catCfg = categoryConfig[channel.category] || categoryConfig['lds-faithful'];

  const growth = useMemo(() => {
    if (!channel.history || channel.history.length === 0) return null;
    const prev = channel.history[channel.history.length - 1];
    return {
      subscriberChange: channel.subscriberCount - prev.subscriberCount,
      subscriberPctChange: ((channel.subscriberCount - prev.subscriberCount) / Math.max(prev.subscriberCount, 1)) * 100,
      viewsChange: (channel.avgViewsPerVideo || 0) - (prev.avgViews || 0),
      viewsPctChange: prev.avgViews > 0 ? (((channel.avgViewsPerVideo || 0) - prev.avgViews) / prev.avgViews) * 100 : 0,
      daysSinceLastRefresh: Math.floor((new Date() - new Date(prev.timestamp)) / (1000 * 60 * 60 * 24)),
      lastRefreshDate: new Date(prev.timestamp).toLocaleDateString(),
    };
  }, [channel]);

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "520px",
      background: "#1a1a1a", borderLeft: "1px solid #333",
      zIndex: 1000, overflowY: "auto",
      boxShadow: "-4px 0 20px rgba(0,0,0,0.5)",
    }}>
      {/* Drawer header */}
      <div style={{ padding: "20px", borderBottom: "1px solid #333" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "12px" }}>
          <img src={channel.thumbnail} alt="" style={{ width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>{channel.name}</div>
            <div style={{ display: "flex", gap: "8px", marginTop: "4px", alignItems: "center" }}>
              <select
                value={channel.category || ''}
                onChange={(e) => onCategoryChange && onCategoryChange(channel.id, e.target.value)}
                style={{
                  fontSize: "10px", fontWeight: "600",
                  color: catCfg.color,
                  background: `${catCfg.color}15`,
                  border: `1px solid ${catCfg.color}40`,
                  padding: "2px 6px", borderRadius: "10px",
                  cursor: "pointer", appearance: "auto",
                }}
              >
                {Object.entries(categoryConfig).map(([key, cfg]) => (
                  <option key={key} value={key} style={{ background: "#1a1a1a", color: "#fff" }}>
                    {cfg.icon} {cfg.label}
                  </option>
                ))}
              </select>
              {channel.tier && (
                <span style={{ fontSize: "10px", color: "#888" }}>{channel.tier}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid #555", borderRadius: "6px", padding: "6px 8px", color: "#888", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
        {/* Action buttons */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => !isRefreshing && onRefresh(channel.id)} disabled={isRefreshing}
            style={{ flex: 1, background: "transparent", border: `1px solid ${isRefreshing ? '#555' : '#3b82f6'}`, borderRadius: "6px", padding: "6px", color: isRefreshing ? '#888' : '#3b82f6', cursor: isRefreshing ? 'wait' : 'pointer', fontSize: "11px", fontWeight: "600", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
            {isRefreshing ? <Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={12} />}
            {isRefreshing ? 'Syncing...' : 'Refresh'}
          </button>
          <a href={`https://www.youtube.com/channel/${channel.id}`} target="_blank" rel="noopener noreferrer"
            style={{ flex: 1, background: "transparent", border: "1px solid #555", borderRadius: "6px", padding: "6px", color: "#888", fontSize: "11px", fontWeight: "600", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
            <ExternalLink size={12} /> YouTube
          </a>
          <button onClick={() => onRemove(channel.id)}
            style={{ flex: 1, background: "transparent", border: "1px solid #ef4444", borderRadius: "6px", padding: "6px 10px", color: "#ef4444", cursor: "pointer", fontSize: "11px", fontWeight: "600", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
            <Trash2 size={12} /> Remove
          </button>
        </div>
        {refreshError && (
          <div style={{ marginTop: "8px", padding: "6px 10px", background: "#ef444415", border: "1px solid #ef444440", borderRadius: "6px", color: "#ef4444", fontSize: "11px" }}>
            Refresh failed: {refreshError}
          </div>
        )}
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", padding: "16px 20px" }}>
        <div style={{ background: "#252525", borderRadius: "6px", padding: "10px" }}>
          <div style={{ fontSize: "9px", color: "#888", textTransform: "uppercase" }}>Subscribers</div>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginTop: "2px" }}>{fmtInt(channel.subscriberCount)}</div>
        </div>
        <div style={{ background: "#252525", borderRadius: "6px", padding: "10px" }}>
          <div style={{ fontSize: "9px", color: "#888", textTransform: "uppercase" }}>Avg Views</div>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginTop: "2px" }}>{fmtInt(channel.avgViewsPerVideo)}</div>
        </div>
        <div style={{ background: "#252525", borderRadius: "6px", padding: "10px" }}>
          <div style={{ fontSize: "9px", color: "#888", textTransform: "uppercase" }}>30d Uploads</div>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginTop: "2px" }}>{channel.uploadsLast30Days}</div>
        </div>
      </div>

      {/* Growth banner */}
      {growth && (growth.subscriberChange !== 0 || growth.viewsChange !== 0) && (
        <div style={{ margin: "0 20px 12px", padding: "8px 12px", background: "#252525", border: "1px solid #333", borderRadius: "6px", display: "flex", gap: "16px", fontSize: "11px" }}>
          <span style={{ color: "#888" }}>Since {growth.lastRefreshDate}:</span>
          {growth.subscriberChange !== 0 && (
            <span style={{ fontWeight: "700", color: growth.subscriberChange > 0 ? "#10b981" : "#ef4444" }}>
              Subs {growth.subscriberChange > 0 ? "+" : ""}{fmtInt(growth.subscriberChange)} ({growth.subscriberPctChange > 0 ? "+" : ""}{growth.subscriberPctChange.toFixed(1)}%)
            </span>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #333", padding: "0 20px" }}>
        {['overview', 'content', 'schedule'].map(tab => (
          <button key={tab} onClick={() => setDrawerTab(tab)}
            style={{
              padding: "10px 16px", background: "transparent", border: "none",
              borderBottom: drawerTab === tab ? "2px solid #3b82f6" : "2px solid transparent",
              color: drawerTab === tab ? "#fff" : "#888",
              fontSize: "12px", fontWeight: "600", cursor: "pointer", textTransform: "capitalize",
            }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: "20px" }}>
        {/* Overview tab */}
        {drawerTab === 'overview' && (
          <>
            {/* Upload Breakdown */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: "10px" }}>Upload Breakdown (30d)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                <div style={{ background: "#252525", border: "1px solid #333", borderRadius: "6px", padding: "10px" }}>
                  <div style={{ fontSize: "9px", color: "#888" }}>TOTAL</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>{channel.uploadsLast30Days}</div>
                </div>
                <div style={{ background: "#252525", border: "1px solid #333", borderRadius: "6px", padding: "10px" }}>
                  <div style={{ fontSize: "9px", color: "#888" }}>SHORTS</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#ec4899" }}>{channel.shorts30d}</div>
                </div>
                <div style={{ background: "#252525", border: "1px solid #333", borderRadius: "6px", padding: "10px" }}>
                  <div style={{ fontSize: "9px", color: "#888" }}>LONG-FORM</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#3b82f6" }}>{channel.longs30d}</div>
                </div>
              </div>
            </div>

            {/* Content Series */}
            {channel.contentSeries && channel.contentSeries.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: "10px" }}>Content Series</div>
                {channel.contentSeries.slice(0, 3).map((series, idx) => (
                  <div key={idx} style={{ background: "#252525", border: "1px solid #333", borderRadius: "6px", padding: "10px", marginBottom: "6px" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "#fff" }}>{series.name}</div>
                    <div style={{ fontSize: "10px", color: "#888", marginTop: "4px" }}>
                      {series.count} episodes &middot; {fmtInt(series.avgViews)} avg views
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Top Videos */}
            {channel.topVideos && channel.topVideos.length > 0 && (
              <div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <PlaySquare size={14} /> Top Videos
                </div>
                {channel.topVideos.map((video, idx) => (
                  <a key={video.id} href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", gap: "10px", padding: "8px", marginBottom: "6px", background: "#252525", borderRadius: "6px", textDecoration: "none", alignItems: "center" }}>
                    <img src={video.thumbnail} alt="" style={{ width: "80px", height: "45px", borderRadius: "4px", objectFit: "cover", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "11px", fontWeight: "600", color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.title}</div>
                      <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>
                        {fmtInt(video.views)} views &middot; {fmtInt(video.likes)} likes &middot; {video.type === 'short' ? 'Short' : 'Long-form'}
                      </div>
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: idx === 0 ? "#fcd34d" : idx === 1 ? "#e5e7eb" : "#666", flexShrink: 0 }}>#{idx + 1}</div>
                  </a>
                ))}
              </div>
            )}

            {/* Client Assignment - only in master view */}
            {masterView && clients && clients.length > 0 && (
              <div style={{ marginTop: "20px" }}>
                <ChannelClientAssignment
                  channel={{ id: channel.supabaseId, client_id: channel.client_id }}
                  clients={clients}
                  onUpdate={(updatedChannel) => {
                    if (onClientAssignmentUpdate) {
                      onClientAssignmentUpdate(channel.id, updatedChannel.client_id);
                    }
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* Content tab */}
        {drawerTab === 'content' && (
          <>
            {titleAnalysis && titleAnalysis.patterns.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: "10px" }}>Title Patterns (Top {titleAnalysis.topVideoCount} Videos)</div>
                {titleAnalysis.patterns.slice(0, 5).map((pattern, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "#252525", borderRadius: "6px", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "18px" }}>{pattern.icon}</span>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: "#fff" }}>{pattern.name}</div>
                        <div style={{ fontSize: "10px", color: "#666" }}>{pattern.insight}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "#3b82f6" }}>{pattern.topPct}%</div>
                      <div style={{ fontSize: "9px", color: "#666" }}>in top vids</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {formatAnalysis && (
              <div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: "10px" }}>Format Breakdown</div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  {formatAnalysis.durationStats.map(format => (
                    <div key={format.name} style={{ flex: 1, background: "#252525", borderRadius: "6px", padding: "10px", borderLeft: `3px solid ${format.color}` }}>
                      <div style={{ fontSize: "9px", color: "#888" }}>{format.name}</div>
                      <div style={{ fontSize: "18px", fontWeight: "700", color: format.color }}>{format.count}</div>
                      <div style={{ fontSize: "9px", color: "#666" }}>{Math.round(format.percentage)}% &middot; {fmtInt(format.avgViews)} avg</div>
                    </div>
                  ))}
                </div>
                {formatAnalysis.typeStats.slice(0, 6).map(type => (
                  <div key={type.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "#252525", borderRadius: "6px", marginBottom: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "16px" }}>{type.icon}</span>
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: "600", color: "#fff" }}>{type.name}</div>
                        <div style={{ fontSize: "9px", color: "#666" }}>{type.count} videos &middot; {fmtInt(type.avgViews)} avg</div>
                      </div>
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: type.color }}>{Math.round(type.percentage)}%</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Schedule tab */}
        {drawerTab === 'schedule' && scheduleAnalysis && (
          <div>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: "12px" }}>Upload Schedule</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
              <div style={{ background: "#252525", borderRadius: "6px", padding: "12px" }}>
                <div style={{ fontSize: "9px", color: "#888", textTransform: "uppercase" }}>Best Day</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff", marginTop: "4px" }}>{scheduleAnalysis.bestDay?.day || 'N/A'}</div>
                <div style={{ fontSize: "10px", color: "#666" }}>{scheduleAnalysis.bestDay?.avgViews ? fmtInt(scheduleAnalysis.bestDay.avgViews) + ' avg views' : ''}</div>
              </div>
              <div style={{ background: "#252525", borderRadius: "6px", padding: "12px" }}>
                <div style={{ fontSize: "9px", color: "#888", textTransform: "uppercase" }}>Best Time</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff", marginTop: "4px" }}>{scheduleAnalysis.bestTime?.hour || 'N/A'}</div>
                <div style={{ fontSize: "10px", color: "#666" }}>{scheduleAnalysis.bestTime?.avgViews ? fmtInt(scheduleAnalysis.bestTime.avgViews) + ' avg views' : ''}</div>
              </div>
            </div>
            {/* Day-of-week chart */}
            {scheduleAnalysis.dayDistribution && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "#888", marginBottom: "8px" }}>Day Distribution</div>
                <div style={{ display: "flex", gap: "4px", alignItems: "flex-end", height: "60px" }}>
                  {scheduleAnalysis.dayDistribution.map(day => (
                    <div key={day.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                      <div style={{
                        width: "100%", background: "#3b82f6",
                        height: `${Math.max(day.count / Math.max(...scheduleAnalysis.dayDistribution.map(d => d.count), 1) * 50, 4)}px`,
                        borderRadius: "2px 2px 0 0",
                      }} />
                      <div style={{ fontSize: "8px", color: "#888" }}>{day.day.substring(0, 2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div style={{ background: "#252525", borderRadius: "6px", padding: "12px" }}>
                <div style={{ fontSize: "9px", color: "#888", textTransform: "uppercase" }}>Cadence</div>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", marginTop: "4px" }}>Every {(30 / Math.max(channel.uploadsLast30Days, 1)).toFixed(1)} days</div>
              </div>
              <div style={{ background: "#252525", borderRadius: "6px", padding: "12px" }}>
                <div style={{ fontSize: "9px", color: "#888", textTransform: "uppercase" }}>Consistency</div>
                <div style={{ fontSize: "14px", fontWeight: "700", color: scheduleAnalysis.consistency > 0.7 ? "#10b981" : scheduleAnalysis.consistency > 0.4 ? "#f59e0b" : "#ef4444", marginTop: "4px" }}>
                  {scheduleAnalysis.consistency > 0.7 ? "High" : scheduleAnalysis.consistency > 0.4 ? "Medium" : "Low"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Content Gaps Panel — extracts content gap analysis logic
function ContentGapsPanel({ activeCompetitors, rows }) {
  const gaps = useMemo(() => {
    const competitorPatterns = {};
    activeCompetitors.forEach(comp => {
      if (!comp.videos) return;
      comp.videos.forEach(video => {
        const title = video.title?.toLowerCase() || '';
        const patterns = [];
        if (title.includes('?')) patterns.push('Question-based hooks');
        if (title.match(/how to|how do/i)) patterns.push('How-to tutorials');
        if (title.match(/\d+\s+(ways|things|tips|reasons|steps)/i)) patterns.push('Numbered lists');
        if (title.match(/beginner|basics|101|introduction|getting started/i)) patterns.push('Beginner content');
        if (title.match(/advanced|pro|expert|master/i)) patterns.push('Advanced content');
        if (title.match(/review|vs|comparison|better than/i)) patterns.push('Reviews & Comparisons');
        if (title.match(/q&a|questions|ask me|ama/i)) patterns.push('Q&A sessions');
        if (title.match(/behind|bts|making of|setup|routine/i)) patterns.push('Behind-the-scenes');
        patterns.forEach(pattern => {
          if (!competitorPatterns[pattern]) competitorPatterns[pattern] = { count: 0, competitors: new Set(), examples: [] };
          competitorPatterns[pattern].count++;
          competitorPatterns[pattern].competitors.add(comp.name);
          if (competitorPatterns[pattern].examples.length < 2) competitorPatterns[pattern].examples.push({ title: video.title, channel: comp.name, views: video.views });
        });
      });
    });
    const yourContent = rows.map(r => r.title?.toLowerCase() || '').join(' ');
    return Object.entries(competitorPatterns)
      .filter(([pattern, data]) => {
        let youUseIt = false;
        if (pattern === 'Question-based hooks') youUseIt = yourContent.includes('?');
        if (pattern === 'How-to tutorials') youUseIt = yourContent.match(/how to|how do/i);
        if (pattern === 'Numbered lists') youUseIt = yourContent.match(/\d+\s+(ways|things|tips|reasons|steps)/i);
        if (pattern === 'Beginner content') youUseIt = yourContent.match(/beginner|basics|101|introduction|getting started/i);
        if (pattern === 'Advanced content') youUseIt = yourContent.match(/advanced|pro|expert|master/i);
        if (pattern === 'Reviews & Comparisons') youUseIt = yourContent.match(/review|vs|comparison|better than/i);
        if (pattern === 'Q&A sessions') youUseIt = yourContent.match(/q&a|questions|ask me|ama/i);
        if (pattern === 'Behind-the-scenes') youUseIt = yourContent.match(/behind|bts|making of|setup|routine/i);
        return !youUseIt && data.competitors.size >= 2;
      })
      .sort((a, b) => b[1].competitors.size - a[1].competitors.size)
      .slice(0, 5);
  }, [activeCompetitors, rows]);

  if (gaps.length === 0) {
    return <div style={{ textAlign: "center", padding: "32px", color: "#666", fontSize: "13px" }}>No major content gaps detected. You're covering similar topics.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {gaps.map(([pattern, data], idx) => (
        <div key={idx} style={{ background: "#252525", border: "1px solid #ef444440", borderLeft: "4px solid #ef4444", borderRadius: "8px", padding: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#fff" }}>{pattern}</div>
              <div style={{ fontSize: "11px", color: "#b0b0b0", marginTop: "2px" }}>
                Used by {data.competitors.size} competitors: {Array.from(data.competitors).join(', ')}
              </div>
            </div>
            <div style={{ fontSize: "9px", fontWeight: "700", textTransform: "uppercase", color: "#ef4444", background: "rgba(239,68,68,0.1)", border: "1px solid #ef4444", padding: "3px 8px", borderRadius: "4px" }}>Gap</div>
          </div>
          {data.examples.length > 0 && (
            <div style={{ borderTop: "1px solid #333", paddingTop: "8px" }}>
              {data.examples.map((ex, i) => (
                <div key={i} style={{ fontSize: "11px", color: "#999", marginBottom: "4px" }}>
                  "{ex.title}" - {ex.channel} ({fmtInt(ex.views)} views)
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// Collapsible Analysis Section Component
function AnalysisSection({ title, icon: Icon, isExpanded, onToggle, children }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          background: "#252525",
          border: "1px solid #333",
          borderRadius: "8px",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          transition: "background 0.2s"
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = "#2a2a2a";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = "#252525";
        }}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "14px",
          fontWeight: "600",
          color: "#fff"
        }}>
          <Icon size={16} />
          {title}
        </div>
        {isExpanded ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
      </button>
      {isExpanded && (
        <div style={{
          marginTop: "12px",
          padding: "16px",
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "8px"
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Benchmark Card Component
function BenchmarkCard({ label, yourValue, competitorAvg, gap }) {
  const isAhead = gap >= 0;
  const gapColor = isAhead ? "#10b981" : "#ef4444";

  return (
    <div style={{
      background: "#252525",
      border: "1px solid #333",
      borderRadius: "8px",
      padding: "16px"
    }}>
      <div style={{ fontSize: "10px", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
        <div>
          <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>You</div>
          <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
            {fmtInt(yourValue)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>Avg Competitor</div>
          <div style={{ fontSize: "16px", fontWeight: "600", color: "#888" }}>
            {fmtInt(competitorAvg)}
          </div>
        </div>
      </div>
      <div style={{
        fontSize: "12px",
        fontWeight: "600",
        color: gapColor,
        display: "flex",
        alignItems: "center",
        gap: "4px"
      }}>
        {isAhead ? "↑" : "↓"} {Math.abs(gap).toFixed(1)}% {isAhead ? "ahead" : "behind"}
      </div>
    </div>
  );
}

// Category Header — collapsible group card with summary stats
function CategoryHeader({ group, isExpanded, onToggle, children }) {
  const { config } = group;
  const tierParts = [];
  if (group.primaryCount > 0) tierParts.push(`${group.primaryCount} primary`);
  if (group.secondaryCount > 0) tierParts.push(`${group.secondaryCount} secondary`);
  if (group.tertiaryCount > 0) tierParts.push(`${group.tertiaryCount} tertiary`);

  return (
    <div style={{
      background: "#1E1E1E",
      border: "1px solid #333",
      borderLeft: `4px solid ${config.color}`,
      borderRadius: "12px",
      overflow: "hidden",
    }}>
      {/* Clickable header */}
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "20px 24px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Top row: icon + label + count + chevron */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: `${config.color}18`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
            }}>
              {config.icon}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>
                  {config.label}
                </span>
                <span style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  color: config.color,
                  background: `${config.color}18`,
                  padding: "2px 8px",
                  borderRadius: "10px",
                }}>
                  {group.channelCount}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "#777", marginTop: "2px" }}>
                {config.description}
              </div>
            </div>
          </div>
          <div style={{ color: "#888", transition: "transform 0.2s" }}>
            {isExpanded
              ? <ChevronUp size={20} />
              : <ChevronDown size={20} />
            }
          </div>
        </div>

        {/* Stats row */}
        {group.hasData ? (
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "10px",
          }}>
            <StatPill label="Subscribers" value={fmtInt(group.totalSubs)} color={config.color} />
            <StatPill label="Views" value={fmtInt(group.totalViews)} color="#9ca3af" />
            <StatPill label="30d Uploads" value={fmtInt(group.totalUploads30d)} color="#9ca3af" />
            <StatPill label="Avg Engagement" value={fmtPct(group.avgEngagement)} color="#9ca3af" />
          </div>
        ) : (
          <div style={{
            fontSize: "12px",
            color: "#555",
            fontStyle: "italic",
            marginBottom: "10px",
          }}>
            Awaiting first sync — stats will appear after nightly data collection
          </div>
        )}

        {/* Format mini-bar + tier breakdown */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Mini format bar */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
            <div style={{
              height: "8px",
              flex: 1,
              maxWidth: "200px",
              borderRadius: "4px",
              overflow: "hidden",
              display: "flex",
              background: "#2a2a2a",
            }}>
              {(group.totalShorts30d + group.totalLongs30d) > 0 ? (
                <>
                  <div style={{
                    width: `${(group.totalShorts30d / (group.totalShorts30d + group.totalLongs30d)) * 100}%`,
                    background: "#f97316",
                  }} />
                  <div style={{
                    flex: 1,
                    background: "#0ea5e9",
                  }} />
                </>
              ) : null}
            </div>
            <div style={{ fontSize: "10px", color: "#666" }}>
              {group.totalShorts30d}S / {group.totalLongs30d}L
            </div>
          </div>

          {/* Tier breakdown */}
          {tierParts.length > 0 && (
            <div style={{ fontSize: "10px", color: "#666" }}>
              {tierParts.join(' · ')}
            </div>
          )}
        </div>
      </button>

      {/* Expanded children (CompetitorCards) */}
      {isExpanded && children && (
        <div style={{
          padding: "0 24px 20px",
          background: `${config.color}06`,
          borderTop: `1px solid ${config.color}22`,
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Stat Pill — inline metric display
function StatPill({ label, value, color }) {
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      background: "#252525",
      border: "1px solid #333",
      borderRadius: "6px",
      padding: "4px 10px",
      fontSize: "11px",
    }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ color: color || "#fff", fontWeight: "600" }}>{value}</span>
    </div>
  );
}

// Focus Badge — format focus indicator for Format Strategy section
function FocusBadge({ isShortsFocused, isLongsFocused, total }) {
  if (total === 0) return null;
  if (isShortsFocused) {
    return (
      <div style={{
        fontSize: "10px",
        fontWeight: "700",
        textTransform: "uppercase",
        color: "#f97316",
        background: "rgba(249, 115, 22, 0.1)",
        border: "1px solid #f97316",
        padding: "3px 8px",
        borderRadius: "4px",
      }}>
        Shorts-Heavy
      </div>
    );
  }
  if (isLongsFocused) {
    return (
      <div style={{
        fontSize: "10px",
        fontWeight: "700",
        textTransform: "uppercase",
        color: "#0ea5e9",
        background: "rgba(14, 165, 233, 0.1)",
        border: "1px solid #0ea5e9",
        padding: "3px 8px",
        borderRadius: "4px",
      }}>
        Long-form Heavy
      </div>
    );
  }
  return (
    <div style={{
      fontSize: "10px",
      fontWeight: "700",
      textTransform: "uppercase",
      color: "#10b981",
      background: "rgba(16, 185, 129, 0.1)",
      border: "1px solid #10b981",
      padding: "3px 8px",
      borderRadius: "4px",
    }}>
      Balanced
    </div>
  );
}

// ─── HubMetric — small metric cell for the 2×3 grid inside hub cards ───
function HubMetric({ label, value, sublabel, valueColor }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "#666", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: "700", color: valueColor || "#fff" }}>{value}</div>
      {sublabel && (
        <div style={{ fontSize: "9px", color: "#555", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

// ─── CategoryHubCard — one card per category in the hubs grid ───
function CategoryHubCard({ group, onClick }) {
  const { config } = group;

  const formatLabel = group.shortsPct > 65 ? 'Shorts-Heavy'
    : group.longsPct > 65 ? 'Long-form Heavy'
    : 'Balanced';
  const formatColor = group.shortsPct > 65 ? '#f97316'
    : group.longsPct > 65 ? '#0ea5e9'
    : '#10b981';

  const growthLabel = group.avgSubGrowthPct > 2 ? 'Growing Fast'
    : group.avgSubGrowthPct > 0 ? 'Steady'
    : group.avgSubGrowthPct < -1 ? 'Declining'
    : 'Flat';
  const growthColor = group.avgSubGrowthPct > 2 ? '#10b981'
    : group.avgSubGrowthPct > 0 ? '#3b82f6'
    : group.avgSubGrowthPct < -1 ? '#ef4444'
    : '#888';

  return (
    <div
      onClick={onClick}
      style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderTop: `3px solid ${config.color}`,
        borderRadius: "12px",
        padding: "20px",
        cursor: "pointer",
        transition: "border-color 0.15s, transform 0.1s",
      }}
      onMouseOver={e => {
        e.currentTarget.style.borderColor = config.color;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseOut={e => {
        e.currentTarget.style.borderColor = "#333";
        e.currentTarget.style.borderTopColor = config.color;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <div style={{
          width: "40px", height: "40px", borderRadius: "10px",
          background: `${config.color}18`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "20px",
        }}>
          {config.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>
            {config.label}
          </div>
          <div style={{ fontSize: "11px", color: "#777" }}>{config.description}</div>
        </div>
        <div style={{
          fontSize: "20px", fontWeight: "700", color: config.color,
          background: `${config.color}15`, padding: "4px 12px", borderRadius: "8px",
        }}>
          {group.channelCount}
        </div>
      </div>

      {/* Metrics grid */}
      {group.hasData ? (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: "12px", marginBottom: "16px",
        }}>
          <HubMetric label="Avg Subscribers" value={fmtInt(group.avgSubs)} sublabel="landscape" />
          <HubMetric label="Avg Uploads/mo" value={fmtInt(group.avgUploads30d)} sublabel="velocity" />
          <HubMetric label="Avg Views" value={fmtInt(group.avgViews)} sublabel="benchmark" />
          <HubMetric label="Engagement" value={fmtPct(group.avgEngagement)} sublabel="quality" />
          <HubMetric label="Channels" value={group.channelCount} sublabel="density" />
          <HubMetric
            label="Growth"
            value={`${group.avgSubGrowthPct > 0 ? '+' : ''}${group.avgSubGrowthPct.toFixed(1)}%`}
            sublabel="momentum"
            valueColor={growthColor}
          />
        </div>
      ) : (
        <div style={{
          fontSize: "12px", color: "#555", fontStyle: "italic",
          marginBottom: "16px", padding: "12px", background: "#252525",
          borderRadius: "8px", textAlign: "center",
        }}>
          Awaiting first sync
        </div>
      )}

      {/* Format mix bar */}
      {group.hasData && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: "6px",
          }}>
            <span style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Format Mix
            </span>
            <span style={{
              fontSize: "10px", fontWeight: "700", color: formatColor,
              background: `${formatColor}15`, padding: "2px 8px", borderRadius: "4px",
            }}>
              {formatLabel}
            </span>
          </div>
          <div style={{
            height: "8px", borderRadius: "4px", overflow: "hidden",
            display: "flex", background: "#2a2a2a",
          }}>
            {(group.totalShorts30d + group.totalLongs30d) > 0 && (
              <>
                <div style={{
                  width: `${group.shortsPct}%`, background: "#f97316",
                  transition: "width 0.3s",
                }} />
                <div style={{ flex: 1, background: "#0ea5e9" }} />
              </>
            )}
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: "10px", color: "#666", marginTop: "4px",
          }}>
            <span>{group.totalShorts30d} Shorts</span>
            <span>{group.totalLongs30d} Long-form</span>
          </div>
        </div>
      )}

      {/* Actionable callout */}
      {group.topPerformer && group.hasData && (
        <div style={{
          background: "#252525", border: "1px solid #333",
          borderRadius: "8px", padding: "12px",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px",
          }}>
            <Crown size={12} color="#f59e0b" />
            <span style={{ fontSize: "11px", color: "#aaa" }}>Top performer:</span>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#fff" }}>
              {group.topPerformer.name}
            </span>
            <span style={{ fontSize: "10px", color: "#888", marginLeft: "auto" }}>
              {fmtInt(group.topPerformer.avgViewsPerVideo)} avg views
            </span>
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            ...(group.formatVariance > 0.25 ? { marginBottom: "8px" } : {}),
          }}>
            <Activity size={12} color={growthColor} />
            <span style={{ fontSize: "11px", color: growthColor, fontWeight: "600" }}>
              {growthLabel}
            </span>
            <span style={{ fontSize: "10px", color: "#666" }}>
              category avg sub growth
            </span>
          </div>

          {group.formatVariance > 0.25 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Target size={12} color="#ec4899" />
              <span style={{ fontSize: "11px", color: "#ec4899", fontWeight: "600" }}>
                Format Gap
              </span>
              <span style={{ fontSize: "10px", color: "#666" }}>
                Mixed strategies — explore underserved format
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer hint */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "4px", marginTop: "12px",
        fontSize: "10px", color: "#555",
      }}>
        Click to explore channels <ChevronDown size={10} />
      </div>
    </div>
  );
}

// ─── HubDrilldown — category detail view with sortable channel table ───
function HubDrilldown({ group, onChannelClick, selectedChannelId, sortCol, sortDir, onSort }) {
  if (!group) return null;
  const { config } = group;

  const sortedChannels = [...group.channels].sort((a, b) => {
    const aVal = a[sortCol] || 0;
    const bVal = b[sortCol] || 0;
    return sortDir ? bVal - aVal : aVal - bVal;
  });

  return (
    <div>
      {/* Category summary banner */}
      <div style={{
        background: "#1E1E1E", border: "1px solid #333",
        borderLeft: `4px solid ${config.color}`, borderRadius: "12px",
        padding: "20px", marginBottom: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "10px",
            background: `${config.color}18`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "24px",
          }}>
            {config.icon}
          </div>
          <div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff" }}>
              {config.label}
            </div>
            <div style={{ fontSize: "12px", color: "#777" }}>
              {group.channelCount} channels — {config.description}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <StatPill label="Avg Subs" value={fmtInt(group.avgSubs)} color={config.color} />
          <StatPill label="Avg Views" value={fmtInt(group.avgViews)} color="#9ca3af" />
          <StatPill label="Avg Uploads/mo" value={fmtInt(group.avgUploads30d)} color="#9ca3af" />
          <StatPill label="Engagement" value={fmtPct(group.avgEngagement)} color="#9ca3af" />
          <StatPill label="Growth" value={`${group.avgSubGrowthPct > 0 ? '+' : ''}${group.avgSubGrowthPct.toFixed(1)}%`} color={group.avgSubGrowthPct > 0 ? '#10b981' : '#ef4444'} />
        </div>
      </div>

      {/* Sortable channel table */}
      <div style={{
        background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px",
        overflow: "hidden",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr 110px 100px 100px 80px",
          gap: "8px", padding: "10px 16px",
          background: "#1a1a1a", borderBottom: "1px solid #333",
          fontSize: "10px", fontWeight: "600", color: "#888",
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          <div />
          <div>Channel</div>
          <div style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }} onClick={() => onSort('subscriberCount')}>
            Subs {sortCol === 'subscriberCount' && (sortDir ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
          </div>
          <div style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }} onClick={() => onSort('avgViewsPerVideo')}>
            Avg Views {sortCol === 'avgViewsPerVideo' && (sortDir ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
          </div>
          <div style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }} onClick={() => onSort('uploadsLast30Days')}>
            30d {sortCol === 'uploadsLast30Days' && (sortDir ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
          </div>
          <div>Engage</div>
        </div>

        {sortedChannels.map(comp => (
          <div
            key={comp.id}
            onClick={() => onChannelClick(comp.id)}
            style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr 110px 100px 100px 80px",
              gap: "8px", padding: "10px 16px",
              borderBottom: "1px solid #2a2a2a",
              cursor: "pointer", alignItems: "center",
              background: selectedChannelId === comp.id ? "#252525" : "transparent",
              transition: "background 0.1s",
            }}
            onMouseOver={e => { if (selectedChannelId !== comp.id) e.currentTarget.style.background = "#1a1a1a"; }}
            onMouseOut={e => { if (selectedChannelId !== comp.id) e.currentTarget.style.background = "transparent"; }}
          >
            <img src={comp.thumbnail} alt="" style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }} />
            <div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>{comp.name}</div>
              <div style={{ fontSize: "10px", color: "#666" }}>{comp.subcategory || comp.tier || ''}</div>
            </div>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>{fmtInt(comp.subscriberCount)}</div>
            <div style={{ fontSize: "13px", color: "#ccc" }}>{fmtInt(comp.avgViewsPerVideo)}</div>
            <div style={{ fontSize: "13px", color: "#ccc" }}>
              {comp.uploadsLast30Days}
              <span style={{ fontSize: "10px", color: "#666", marginLeft: "4px" }}>
                ({comp.shorts30d || 0}S/{comp.longs30d || 0}L)
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "#aaa" }}>{fmtPct(comp.engagementRate)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
