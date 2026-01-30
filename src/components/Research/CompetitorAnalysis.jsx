import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Plus, Trash2, Search, TrendingUp, Users, Video, Eye, Settings, ChevronDown, ChevronUp, PlaySquare, Calendar, BarChart3, Type, Clock, Tag, Upload, Download, RefreshCw, X, Check, Zap, Loader } from "lucide-react";
import { analyzeTitlePatterns, analyzeUploadSchedule, categorizeContentFormats } from "../../lib/competitorAnalysis";
import { getOutlierVideos, analyzeCompetitorVideo } from '../../services/competitorInsightsService';
import { importCompetitorDatabase } from '../../services/competitorImport';

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;
const fmtDuration = (seconds) => {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const CATEGORY_CONFIG = {
  'lds-official':   { label: 'LDS Official',            color: '#3b82f6', icon: '\u{1F3DB}',  order: 0, description: 'Institutional church channels' },
  'lds-faithful':   { label: 'LDS Faithful Creators',   color: '#10b981', icon: '\u{1F64F}',  order: 1, description: 'Apologetics, scholarship, lifestyle' },
  'ex-mormon':      { label: 'Ex-Mormon',               color: '#ef4444', icon: '\u{1F6AA}',  order: 2, description: 'Personal stories, research, expose' },
  'counter-cult':   { label: 'Counter-Cult Evangelical', color: '#f97316', icon: '\u{26EA}',   order: 3, description: 'Evangelical critique channels' },
  'megachurch':     { label: 'Megachurch',               color: '#8b5cf6', icon: '\u{1F3A4}',  order: 4, description: 'High-production contemporary churches' },
  'catholic':       { label: 'Catholic',                 color: '#f59e0b', icon: '\u{271D}\uFE0F', order: 5, description: 'Catholic media and apologetics' },
  'muslim':         { label: 'Muslim',                   color: '#06b6d4', icon: '\u{262A}\uFE0F', order: 6, description: 'Islamic dawah and debate' },
  'jewish':         { label: 'Jewish',                   color: '#6366f1', icon: '\u{2721}\uFE0F', order: 7, description: 'Jewish educational content' },
  'deconstruction': { label: 'Deconstruction',           color: '#ec4899', icon: '\u{1F513}',  order: 8, description: 'Multi-faith and LDS-specific deconstruction' },
};

export default function CompetitorAnalysis({ rows, activeClient }) {
  const [apiKey, setApiKey] = useState(localStorage.getItem('yt_api_key') || "");
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  // localStorage competitors kept for migration/fallback only
  const [competitors, setCompetitors] = useState(() => {
    const saved = localStorage.getItem('competitors');
    return saved ? JSON.parse(saved) : [];
  });

  const [expandedCompetitor, setExpandedCompetitor] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
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

  // Database import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);

  // Load competitors from Supabase when activeClient or masterView changes
  useEffect(() => {
    if (!activeClient?.id && !masterView) return;

    const loadFromSupabase = async () => {
      setSupabaseLoading(true);
      try {
        const { getChannels } = await import('../../services/competitorDatabase');
        const channels = await getChannels({
          clientId: masterView ? undefined : activeClient?.id,
          isCompetitor: true
        });
        setSupabaseCompetitors(channels || []);
      } catch (err) {
        console.error('[Competitors] Failed to load from Supabase:', err);
      } finally {
        setSupabaseLoading(false);
      }
    };

    loadFromSupabase();
  }, [activeClient?.id, masterView]);

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

  // Category expand/collapse handlers
  const toggleCategory = useCallback((categoryKey) => {
    setExpandedCategories(prev => ({ ...prev, [categoryKey]: !prev[categoryKey] }));
  }, []);

  const toggleAllCategories = useCallback((expand) => {
    const all = {};
    Object.keys(CATEGORY_CONFIG).forEach(key => { all[key] = expand; });
    setExpandedCategories(all);
  }, []);

  // One-time migration: localStorage competitors → Supabase with client_id
  useEffect(() => {
    if (!activeClient?.id) return;
    const migrationKey = `competitors_migrated_${activeClient.id}`;
    if (localStorage.getItem(migrationKey)) return;

    const localCompetitors = JSON.parse(localStorage.getItem('competitors') || '[]');
    if (localCompetitors.length === 0) return;

    const migrate = async () => {
      try {
        const { upsertChannel, upsertVideos } = await import('../../services/competitorDatabase');

        for (const comp of localCompetitors) {
          const channel = await upsertChannel({
            youtube_channel_id: comp.id,
            name: comp.name,
            description: comp.description,
            thumbnail_url: comp.thumbnail,
            subscriber_count: comp.subscriberCount,
            total_view_count: comp.viewCount,
            video_count: comp.videoCount,
            is_competitor: true,
            client_id: activeClient.id,
            category: comp.category,
          });

          if (comp.videos?.length && channel?.id) {
            const videosToUpsert = comp.videos.map(v => ({
              youtube_video_id: v.id,
              title: v.title,
              thumbnail_url: v.thumbnail,
              published_at: v.publishedAt,
              duration_seconds: v.duration,
              view_count: v.views,
              like_count: v.likes,
              comment_count: v.comments,
            }));
            await upsertVideos(videosToUpsert, channel.id);
          }
        }

        localStorage.setItem(migrationKey, 'true');
        console.log(`[Migration] Migrated ${localCompetitors.length} competitors for client ${activeClient.name}`);
        await reloadSupabaseCompetitors();
      } catch (err) {
        console.error('[Migration] Failed:', err);
      }
    };

    migrate();
  }, [activeClient?.id, activeClient?.name, reloadSupabaseCompetitors]);

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

  // Fetch outlier videos
  const fetchOutliers = useCallback(async () => {
    setOutliersLoading(true);
    try {
      const data = await getOutlierVideos({ days: outlierDays, minMultiplier: outlierMinMultiplier });
      setOutliers(data);
    } catch (err) {
      console.error('Failed to fetch outliers:', err);
    } finally {
      setOutliersLoading(false);
    }
  }, [outlierDays, outlierMinMultiplier]);

  // Load outliers on mount
  useEffect(() => {
    fetchOutliers();
  }, [fetchOutliers]);

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
  const addCompetitor = async () => {
    if (!apiKey) {
      setError("Please add your YouTube Data API key first");
      setShowApiKeyInput(true);
      return;
    }

    if (!newCompetitor.trim()) {
      setError("Please enter a channel URL or ID");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Extract channel ID from URL or use as-is
      let channelId = newCompetitor.trim();

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
          type: duration <= 60 ? 'short' : 'long' // YouTube Shorts are ≤60 seconds
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

      // Check if already exists
      if (competitors.some(c => c.id === channelId)) {
        setError("This competitor is already in your list");
        setLoading(false);
        return;
      }

      const updated = [...competitors, competitorData];
      setCompetitors(updated);
      setNewCompetitor("");
      setError("");

      // Also save to Supabase with client_id
      try {
        const { upsertChannel, upsertVideos } = await import('../../services/competitorDatabase');
        const channel = await upsertChannel({
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

        if (competitorData.videos?.length && channel?.id) {
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
          await upsertVideos(videosToUpsert, channel.id);
        }

        await reloadSupabaseCompetitors();
      } catch (dbErr) {
        console.warn('[Competitors] Supabase save failed (localStorage still valid):', dbErr);
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
    if (expandedCompetitor === id) {
      setExpandedCompetitor(null);
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

  // Refresh competitor data with historical snapshot
  const refreshCompetitor = async (competitorId) => {
    // Look up in activeCompetitors (Supabase-backed), not localStorage
    const competitor = activeCompetitors.find(c => c.id === competitorId);
    if (!competitor) {
      setError("Competitor not found");
      return;
    }

    if (!apiKey) {
      setError("Please add your YouTube Data API key first");
      setShowApiKeyInput(true);
      return;
    }

    // Cannot refresh handle_ placeholder IDs — they need the nightly cron to resolve first
    if (competitorId.startsWith('handle_')) {
      setError(`${competitor.name} has an unresolved handle ID. It will be resolved by the nightly sync.`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Save current state to history before refreshing
      const historySnapshot = {
        timestamp: new Date().toISOString(),
        subscriberCount: competitor.subscriberCount,
        totalViews: competitor.viewCount,
        videoCount: competitor.videoCount,
        avgViews: competitor.avgViewsPerVideo,
        uploadsLast30Days: competitor.uploadsLast30Days
      };

      // Re-fetch channel data
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${competitorId}&key=${apiKey}`
      );

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || "Failed to fetch channel data");
      }

      if (!data.items || data.items.length === 0) {
        throw new Error("Channel not found");
      }

      const ytChannel = data.items[0];

      // Fetch recent videos
      const uploadsPlaylistId = ytChannel.contentDetails.relatedPlaylists.uploads;
      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&key=${apiKey}`
      );
      const videosData = await videosResponse.json();

      if (videosData.error) {
        throw new Error(videosData.error.message || "Failed to fetch videos");
      }

      const videoIds = videosData.items.map(item => item.contentDetails.videoId).join(',');
      const videoDetailsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${apiKey}`
      );
      const videoDetailsData = await videoDetailsResponse.json();

      if (videoDetailsData.error) {
        throw new Error(videoDetailsData.error.message || "Failed to fetch video details");
      }

      // Process videos
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
          type: duration <= 60 ? 'short' : 'long'
        };
      });

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

      // Update localStorage copy if it exists there
      const localMatch = competitors.find(c => c.id === competitorId);
      if (localMatch) {
        const updatedLocal = {
          ...localMatch,
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
          history: [...(localMatch.history || []), historySnapshot].slice(-100),
        };
        const updated = competitors.map(c => c.id === competitorId ? updatedLocal : c);
        setCompetitors(updated);
      }

      setError("");

      // Save to Supabase
      try {
        const { upsertChannel, upsertVideos } = await import('../../services/competitorDatabase');
        const dbChannel = await upsertChannel({
          youtube_channel_id: competitorId,
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
      setError(err.message || "Failed to refresh competitor data");
    } finally {
      setLoading(false);
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
    if (supabaseCompetitors.length > 0) {
      return supabaseCompetitors.map(ch => {
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
        };
      });
    }
    return competitors;
  }, [supabaseCompetitors, competitors]);

  // Group competitors by category for collapsible display
  const groupedCompetitors = useMemo(() => {
    const groups = {};

    // Initialize groups from config
    Object.entries(CATEGORY_CONFIG).forEach(([key, config]) => {
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

    // Compute averages and sort
    return Object.values(groups)
      .filter(g => g.channelCount > 0)
      .map(g => ({
        ...g,
        avgSubs: g.channelCount > 0 ? g.totalSubs / g.channelCount : 0,
        avgEngagement: g.channelCount > 0 ? g.totalEngagement / g.channelCount : 0,
      }))
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

  return (
    <div style={{ padding: "0" }}>
      {/* Header */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff", marginBottom: "6px" }}>
                Competitor Analysis
              </div>
              <div style={{ fontSize: "12px", color: "#888" }}>
                {masterView
                  ? "Viewing all competitors across all clients"
                  : `Competitors for ${activeClient?.name || 'current client'}`
                }
              </div>
            </div>

            {/* Master View Toggle */}
            <button
              onClick={() => setMasterView(!masterView)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                background: masterView ? "rgba(139, 92, 246, 0.15)" : "#252525",
                border: `1px solid ${masterView ? "#8b5cf6" : "#444"}`,
                borderRadius: "8px",
                color: masterView ? "#a78bfa" : "#9E9E9E",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
              }}
            >
              <Eye size={14} />
              {masterView ? "Master View" : "Client View"}
            </button>
            {supabaseLoading && (
              <Loader size={16} style={{ color: "#888", animation: "spin 1s linear infinite" }} />
            )}
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            {/* Timezone Selector */}
            <div style={{ position: "relative" }}>
              <select
                value={userTimezone}
                onChange={(e) => {
                  setUserTimezone(e.target.value);
                  localStorage.setItem('user_timezone', e.target.value);
                }}
                style={{
                  background: "#252525",
                  border: "1px solid #555",
                  borderRadius: "8px",
                  padding: "10px 32px 10px 12px",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none"
                }}
                title="Select your timezone for upload schedule analysis"
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
              <ChevronDown
                size={14}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  color: "#888"
                }}
              />
            </div>
            {/* Import Database Button */}
            {activeClient?.id && activeCompetitors.length === 0 && !importing && (
              <button
                onClick={handleImportDatabase}
                style={{
                  background: "rgba(139, 92, 246, 0.15)",
                  border: "1px solid #8b5cf6",
                  borderRadius: "8px",
                  padding: "10px 16px",
                  color: "#a78bfa",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  whiteSpace: "nowrap",
                }}
              >
                <Download size={16} />
                Import Database
              </button>
            )}
            {importing && importProgress && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                background: "rgba(139, 92, 246, 0.1)",
                border: "1px solid #8b5cf630",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#a78bfa",
                whiteSpace: "nowrap",
              }}>
                <Loader size={14} style={{ animation: "spin 1s linear infinite" }} />
                Importing {importProgress.current}/{importProgress.total}: {importProgress.name}
              </div>
            )}
            <button
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              style={{
                background: apiKey ? "#10b981" : "#3b82f6",
                border: "none",
                borderRadius: "8px",
                padding: "10px 16px",
                color: "#fff",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <Settings size={16} />
              {apiKey ? "API Key Set" : "Add API Key"}
            </button>
          </div>
        </div>

        {/* API Key Input */}
        {showApiKeyInput && (
          <div style={{
            background: "#252525",
            border: "1px solid #333",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "16px"
          }}>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "8px" }}>
              YouTube Data API v3 Key
            </div>
            <div style={{ fontSize: "11px", color: "#888", marginBottom: "12px", lineHeight: "1.5" }}>
              Get your API key from <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa" }}>Google Cloud Console</a>.
              Enable "YouTube Data API v3" in your project.
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your YouTube Data API key"
                style={{
                  flex: 1,
                  background: "#1E1E1E",
                  border: "1px solid #333",
                  borderRadius: "6px",
                  padding: "10px 12px",
                  color: "#fff",
                  fontSize: "13px"
                }}
              />
              <button
                onClick={saveApiKey}
                style={{
                  background: "#10b981",
                  border: "none",
                  borderRadius: "6px",
                  padding: "10px 20px",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Add Competitor */}
        {!masterView && (
          <div style={{
            background: "#252525",
            border: "1px solid #333",
            borderRadius: "8px",
            padding: "16px"
          }}>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "8px" }}>
              Add Competitor Channel
            </div>
            <div style={{ fontSize: "11px", color: "#888", marginBottom: "12px" }}>
              Enter a YouTube channel URL or channel ID
            </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={newCompetitor}
              onChange={(e) => setNewCompetitor(e.target.value)}
              placeholder="https://youtube.com/@channelname or channel ID"
              style={{
                flex: 1,
                background: "#1E1E1E",
                border: "1px solid #333",
                borderRadius: "6px",
                padding: "10px 12px",
                color: "#fff",
                fontSize: "13px"
              }}
              onKeyPress={(e) => e.key === 'Enter' && addCompetitor()}
            />
            <button
              onClick={addCompetitor}
              disabled={loading}
              style={{
                background: loading ? "#555" : "#3b82f6",
                border: "none",
                borderRadius: "6px",
                padding: "10px 20px",
                color: "#fff",
                fontSize: "13px",
                fontWeight: "600",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              {loading ? (
                "Adding..."
              ) : (
                <>
                  <Plus size={16} />
                  Add
                </>
              )}
            </button>
          </div>
          {error && (
            <div style={{
              marginTop: "8px",
              padding: "8px 12px",
              background: "#ef444420",
              border: "1px solid #ef4444",
              borderRadius: "6px",
              color: "#ef4444",
              fontSize: "11px"
            }}>
              {error}
            </div>
          )}
        </div>
        )}

        {/* Import/Export */}
        {!masterView && activeCompetitors.length > 0 && (
          <div style={{
            display: "flex",
            gap: "8px",
            marginTop: "16px"
          }}>
            <button
              onClick={exportCompetitors}
              style={{
                flex: 1,
                background: "transparent",
                border: "1px solid #555",
                borderRadius: "6px",
                padding: "8px 12px",
                color: "#888",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px"
              }}
            >
              <Download size={14} />
              Export JSON
            </button>
            <label style={{ flex: 1 }}>
              <input
                type="file"
                accept=".json"
                onChange={importCompetitors}
                style={{ display: "none" }}
              />
              <div style={{
                background: "transparent",
                border: "1px solid #555",
                borderRadius: "6px",
                padding: "8px 12px",
                color: "#888",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px"
              }}>
                <Upload size={14} />
                Import JSON
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Executive Summary Card - Competitive Position */}
      {activeCompetitors.length > 0 && yourStats && (
        <div style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)",
          border: "1px solid #3b82f6",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px",
          position: "relative",
          overflow: "hidden"
        }}>
          {/* Decorative gradient overlay */}
          <div style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "300px",
            height: "300px",
            background: "radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%)",
            pointerEvents: "none"
          }} />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <div style={{ fontSize: "28px" }}>🏆</div>
              <div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                  Competitive Position
                </div>
                <div style={{ fontSize: "12px", color: "#93c5fd" }}>
                  Your ranking among tracked competitors
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
              {/* Rank */}
              <div style={{
                background: "rgba(255, 255, 255, 0.1)",
                backdropFilter: "blur(10px)",
                borderRadius: "10px",
                padding: "20px",
                border: "1px solid rgba(255, 255, 255, 0.2)"
              }}>
                <div style={{ fontSize: "11px", color: "#93c5fd", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                  Current Rank
                </div>
                <div style={{ fontSize: "36px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                  #{(() => {
                    const allChannels = [
                      { subs: yourStats.totalSubscribers, isYou: true },
                      ...activeCompetitors.map(c => ({ subs: c.subscriberCount, isYou: false }))
                    ].sort((a, b) => b.subs - a.subs);
                    return allChannels.findIndex(c => c.isYou) + 1;
                  })()}
                </div>
                <div style={{ fontSize: "12px", color: "#bfdbfe" }}>
                  of {activeCompetitors.length + 1} channels
                </div>
              </div>

              {/* Gap to Leader */}
              <div style={{
                background: "rgba(255, 255, 255, 0.1)",
                backdropFilter: "blur(10px)",
                borderRadius: "10px",
                padding: "20px",
                border: "1px solid rgba(255, 255, 255, 0.2)"
              }}>
                <div style={{ fontSize: "11px", color: "#93c5fd", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                  Gap to Leader
                </div>
                {(() => {
                  const leaderSubs = Math.max(...activeCompetitors.map(c => c.subscriberCount));
                  const gap = yourStats.totalSubscribers - leaderSubs;
                  const isLeader = gap >= 0;
                  return (
                    <>
                      <div style={{ fontSize: "28px", fontWeight: "700", color: isLeader ? "#10b981" : "#fbbf24", marginBottom: "4px" }}>
                        {isLeader ? "🎯 Leader" : `${gap > -1000 ? gap : fmtInt(gap)}`}
                      </div>
                      <div style={{ fontSize: "12px", color: "#bfdbfe" }}>
                        {isLeader ? "You're #1!" : "subscribers behind"}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Growth Rate */}
              <div style={{
                background: "rgba(255, 255, 255, 0.1)",
                backdropFilter: "blur(10px)",
                borderRadius: "10px",
                padding: "20px",
                border: "1px solid rgba(255, 255, 255, 0.2)"
              }}>
                <div style={{ fontSize: "11px", color: "#93c5fd", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                  Momentum
                </div>
                {(() => {
                  const yourUploadFreq = yourStats.videosLast30Days;
                  const avgCompetitorFreq = activeCompetitors.reduce((sum, c) => sum + (c.uploadsLast30Days || 0), 0) / activeCompetitors.length;
                  const isAhead = yourUploadFreq > avgCompetitorFreq;
                  return (
                    <>
                      <div style={{ fontSize: "28px", fontWeight: "700", color: isAhead ? "#10b981" : "#fbbf24", marginBottom: "4px" }}>
                        {isAhead ? "↗" : "↘"} {yourUploadFreq}/mo
                      </div>
                      <div style={{ fontSize: "12px", color: "#bfdbfe" }}>
                        {isAhead ? "Above" : "Below"} avg ({avgCompetitorFreq.toFixed(1)}/mo)
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Avg Views Comparison */}
              <div style={{
                background: "rgba(255, 255, 255, 0.1)",
                backdropFilter: "blur(10px)",
                borderRadius: "10px",
                padding: "20px",
                border: "1px solid rgba(255, 255, 255, 0.2)"
              }}>
                <div style={{ fontSize: "11px", color: "#93c5fd", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                  Views Performance
                </div>
                {(() => {
                  const yourAvgViews = yourStats.avgViewsPerVideo;
                  const avgCompetitorViews = activeCompetitors.reduce((sum, c) => sum + (c.avgViewsPerVideo || 0), 0) / activeCompetitors.length;
                  const isAhead = yourAvgViews > avgCompetitorViews;
                  const diff = ((yourAvgViews / avgCompetitorViews - 1) * 100).toFixed(0);
                  return (
                    <>
                      <div style={{ fontSize: "28px", fontWeight: "700", color: isAhead ? "#10b981" : "#fbbf24", marginBottom: "4px" }}>
                        {isAhead ? "+" : ""}{diff}%
                      </div>
                      <div style={{ fontSize: "12px", color: "#bfdbfe" }}>
                        vs competitor avg
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Format Strategy Comparison */}
      {activeCompetitors.length > 0 && yourStats && (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px"
        }}>
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "6px" }}>
              📊 Format Strategy Comparison
            </div>
            <div style={{ fontSize: "13px", color: "#9E9E9E" }}>
              Shorts vs Long-form production mix across all channels
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Your Channel First */}
            <div style={{
              background: "#252525",
              border: "2px solid #3b82f6",
              borderRadius: "10px",
              padding: "20px"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "#3b82f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px"
                  }}>
                    👤
                  </div>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>
                      Your Channel
                    </div>
                    <div style={{ fontSize: "11px", color: "#666" }}>
                      Last 30 days
                    </div>
                  </div>
                </div>
                <div style={{
                  fontSize: "24px",
                  fontWeight: "700",
                  color: "#3b82f6"
                }}>
                  {yourStats.videosLast30Days} videos
                </div>
              </div>

              {/* Format Bar */}
              <div style={{ marginBottom: "12px" }}>
                <div style={{
                  height: "40px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  display: "flex",
                  background: "#1a1a1a"
                }}>
                  <div style={{
                    width: `${(yourStats.shortsCount / (yourStats.shortsCount + yourStats.longsCount)) * 100}%`,
                    background: "linear-gradient(90deg, #f97316, #fb923c)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: "700",
                    minWidth: "60px"
                  }}>
                    {((yourStats.shortsCount / (yourStats.shortsCount + yourStats.longsCount)) * 100).toFixed(0)}%
                  </div>
                  <div style={{
                    flex: 1,
                    background: "linear-gradient(90deg, #0ea5e9, #38bdf8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: "700",
                    minWidth: "60px"
                  }}>
                    {((yourStats.longsCount / (yourStats.shortsCount + yourStats.longsCount)) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: "20px", fontSize: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "2px", background: "#f97316" }} />
                  <span style={{ color: "#888" }}>Shorts:</span>
                  <span style={{ color: "#fff", fontWeight: "600" }}>{yourStats.shortsCount}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "2px", background: "#0ea5e9" }} />
                  <span style={{ color: "#888" }}>Long-form:</span>
                  <span style={{ color: "#fff", fontWeight: "600" }}>{yourStats.longsCount}</span>
                </div>
              </div>
            </div>

            {/* Competitors — Grouped by Category */}
            {groupedCompetitors.map(group => {
              const shortsCount = group.totalShorts30d;
              const longsCount = group.totalLongs30d;
              const total = shortsCount + longsCount;
              const shortsPercent = total > 0 ? (shortsCount / total) * 100 : 0;
              const longsPercent = total > 0 ? (longsCount / total) * 100 : 0;
              const isShortsFocused = shortsPercent > 70;
              const isLongsFocused = longsPercent > 70;

              return (
                <div key={group.key} style={{
                  background: "#252525",
                  border: "1px solid #333",
                  borderLeft: `3px solid ${group.config.color}`,
                  borderRadius: "10px",
                  padding: "20px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: `${group.config.color}22`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "20px"
                      }}>
                        {group.config.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>
                          {group.config.label}
                          <span style={{
                            fontSize: "11px",
                            fontWeight: "500",
                            color: "#888",
                            marginLeft: "8px"
                          }}>
                            {group.channelCount} channel{group.channelCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: "11px", color: "#666" }}>
                          {group.hasData
                            ? `${fmtInt(group.totalSubs)} total subs · ${fmtInt(group.totalUploads30d)} uploads/30d`
                            : 'Awaiting first sync'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <FocusBadge
                        isShortsFocused={isShortsFocused}
                        isLongsFocused={isLongsFocused}
                        total={total}
                      />
                      {total > 0 && (
                        <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>
                          {total} videos
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Format Bar */}
                  {total > 0 ? (
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{
                        height: "40px",
                        borderRadius: "8px",
                        overflow: "hidden",
                        display: "flex",
                        background: "#1a1a1a"
                      }}>
                        {shortsCount > 0 && (
                          <div style={{
                            width: `${shortsPercent}%`,
                            background: "linear-gradient(90deg, #f97316, #fb923c)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontSize: "13px",
                            fontWeight: "700",
                            minWidth: shortsPercent > 15 ? "60px" : "0"
                          }}>
                            {shortsPercent > 15 && `${shortsPercent.toFixed(0)}%`}
                          </div>
                        )}
                        {longsCount > 0 && (
                          <div style={{
                            width: `${longsPercent}%`,
                            background: "linear-gradient(90deg, #0ea5e9, #38bdf8)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontSize: "13px",
                            fontWeight: "700",
                            minWidth: longsPercent > 15 ? "60px" : "0"
                          }}>
                            {longsPercent > 15 && `${longsPercent.toFixed(0)}%`}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      height: "40px",
                      borderRadius: "8px",
                      background: "#1a1a1a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#555",
                      fontSize: "12px",
                      marginBottom: "12px"
                    }}>
                      No format data yet — awaiting sync
                    </div>
                  )}

                  {/* Legend */}
                  <div style={{ display: "flex", gap: "20px", fontSize: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "12px", height: "12px", borderRadius: "2px", background: "#f97316" }} />
                      <span style={{ color: "#888" }}>Shorts:</span>
                      <span style={{ color: "#fff", fontWeight: "600" }}>{shortsCount}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "12px", height: "12px", borderRadius: "2px", background: "#0ea5e9" }} />
                      <span style={{ color: "#888" }}>Long-form:</span>
                      <span style={{ color: "#fff", fontWeight: "600" }}>{longsCount}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Content Gap Analysis */}
      {activeCompetitors.length > 0 && rows && rows.length > 0 && (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px"
        }}>
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "6px" }}>
              🔍 Content Gap Analysis
            </div>
            <div style={{ fontSize: "13px", color: "#9E9E9E" }}>
              Topics and formats competitors are using that you aren't
            </div>
          </div>

          {(() => {
            // Analyze competitor titles for common patterns
            const competitorPatterns = {};
            activeCompetitors.forEach(comp => {
              if (!comp.videos) return;

              comp.videos.forEach(video => {
                const title = video.title?.toLowerCase() || '';

                // Look for specific patterns
                const patterns = [];

                // Question-based
                if (title.includes('?')) patterns.push('Question-based hooks');

                // How-to
                if (title.match(/how to|how do/i)) patterns.push('How-to tutorials');

                // Lists
                if (title.match(/\d+\s+(ways|things|tips|reasons|steps)/i)) patterns.push('Numbered lists');

                // Beginner-focused
                if (title.match(/beginner|basics|101|introduction|getting started/i)) patterns.push('Beginner content');

                // Advanced
                if (title.match(/advanced|pro|expert|master/i)) patterns.push('Advanced content');

                // Reviews
                if (title.match(/review|vs|comparison|better than/i)) patterns.push('Reviews & Comparisons');

                // Q&A
                if (title.match(/q&a|questions|ask me|ama/i)) patterns.push('Q&A sessions');

                // Behind the scenes
                if (title.match(/behind|bts|making of|setup|routine/i)) patterns.push('Behind-the-scenes');

                patterns.forEach(pattern => {
                  if (!competitorPatterns[pattern]) {
                    competitorPatterns[pattern] = {
                      count: 0,
                      competitors: new Set(),
                      examples: []
                    };
                  }
                  competitorPatterns[pattern].count++;
                  competitorPatterns[pattern].competitors.add(comp.name);
                  if (competitorPatterns[pattern].examples.length < 2) {
                    competitorPatterns[pattern].examples.push({
                      title: video.title,
                      channel: comp.name,
                      views: video.views
                    });
                  }
                });
              });
            });

            // Find gaps - patterns used by 2+ competitors that you don't use
            const gaps = Object.entries(competitorPatterns)
              .filter(([pattern, data]) => {
                // Check if YOU use this pattern
                const yourContent = rows.map(r => r.title?.toLowerCase() || '').join(' ');
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

            if (gaps.length === 0) {
              return (
                <div style={{
                  textAlign: "center",
                  padding: "40px",
                  color: "#666"
                }}>
                  <div style={{ fontSize: "32px", marginBottom: "12px" }}>✨</div>
                  <div style={{ fontSize: "14px", marginBottom: "6px", color: "#888" }}>
                    No major content gaps detected
                  </div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    You're covering similar topics to your competitors
                  </div>
                </div>
              );
            }

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {gaps.map(([pattern, data], idx) => (
                  <div key={idx} style={{
                    background: "#252525",
                    border: "1px solid #ef444440",
                    borderLeft: "4px solid #ef4444",
                    borderRadius: "8px",
                    padding: "16px"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                          {pattern}
                        </div>
                        <div style={{ fontSize: "12px", color: "#b0b0b0" }}>
                          Used by {data.competitors.size} competitor{data.competitors.size > 1 ? 's' : ''}: {Array.from(data.competitors).join(', ')}
                        </div>
                      </div>
                      <div style={{
                        fontSize: "10px",
                        fontWeight: "700",
                        textTransform: "uppercase",
                        color: "#ef4444",
                        background: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid #ef4444",
                        padding: "4px 10px",
                        borderRadius: "4px",
                        whiteSpace: "nowrap",
                        marginLeft: "12px"
                      }}>
                        Gap Detected
                      </div>
                    </div>

                    {/* Example videos */}
                    {data.examples.length > 0 && (
                      <div style={{
                        marginTop: "12px",
                        paddingTop: "12px",
                        borderTop: "1px solid #333"
                      }}>
                        <div style={{ fontSize: "11px", color: "#666", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          Examples:
                        </div>
                        {data.examples.map((ex, exIdx) => (
                          <div key={exIdx} style={{
                            fontSize: "12px",
                            color: "#999",
                            marginBottom: "6px",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px"
                          }}>
                            <div style={{ fontSize: "10px" }}>📺</div>
                            <div style={{ flex: 1 }}>
                              "{ex.title}"
                              <span style={{ color: "#666", marginLeft: "8px" }}>
                                - {ex.channel} ({fmtInt(ex.views)} views)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Strategic Insights */}
      {insights.length > 0 && (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px"
        }}>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "16px" }}>
            Strategic Insights
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {insights.map((insight, idx) => (
              <div key={idx} style={{
                background: "#252525",
                border: "1px solid #333",
                borderRadius: "8px",
                padding: "14px",
                display: "flex",
                gap: "12px",
                alignItems: "flex-start"
              }}>
                <div style={{ fontSize: "24px" }}>{insight.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: "4px" }}>
                    {insight.type}
                  </div>
                  <div style={{ fontSize: "12px", color: "#b0b0b0", lineHeight: "1.5" }}>
                    {insight.insight}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outlier Videos */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
              <Zap size={18} color="#f59e0b" />
              Outlier Videos
            </div>
            <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>
              Videos significantly outperforming their channel average
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <select
              value={outlierDays}
              onChange={(e) => setOutlierDays(Number(e.target.value))}
              style={{
                background: "#252525", border: "1px solid #555", borderRadius: "6px",
                padding: "6px 10px", color: "#fff", fontSize: "12px"
              }}
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
            </select>
            <select
              value={outlierMinMultiplier}
              onChange={(e) => setOutlierMinMultiplier(Number(e.target.value))}
              style={{
                background: "#252525", border: "1px solid #555", borderRadius: "6px",
                padding: "6px 10px", color: "#fff", fontSize: "12px"
              }}
            >
              <option value={2}>2x+ avg</option>
              <option value={2.5}>2.5x+ avg</option>
              <option value={3}>3x+ avg</option>
              <option value={5}>5x+ avg</option>
            </select>
            <button
              onClick={fetchOutliers}
              disabled={outliersLoading}
              style={{
                background: "#3b82f6", border: "none", borderRadius: "6px",
                padding: "6px 12px", color: "#fff", fontSize: "12px", fontWeight: "600",
                cursor: outliersLoading ? "not-allowed" : "pointer", opacity: outliersLoading ? 0.6 : 1
              }}
            >
              {outliersLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {outliersLoading && outliers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px", color: "#888" }}>
            <Loader size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
            <div style={{ fontSize: "13px" }}>Detecting outlier videos...</div>
          </div>
        ) : outliers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px", color: "#666", fontSize: "13px" }}>
            No outlier videos found for the selected criteria. Try adjusting the time period or multiplier threshold.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {outliers.map(video => (
              <div key={video.id} style={{
                background: "#252525",
                border: "1px solid #333",
                borderRadius: "8px",
                padding: "12px",
                display: "flex",
                gap: "12px",
                alignItems: "center"
              }}>
                {video.thumbnail_url && (
                  <img
                    src={video.thumbnail_url}
                    alt=""
                    style={{ width: "120px", height: "68px", borderRadius: "6px", objectFit: "cover", flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: "13px", fontWeight: "600", color: "#fff",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                  }}>
                    {video.title}
                  </div>
                  <div style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>
                    {video.channel?.name || "Unknown channel"}
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "6px", fontSize: "11px", color: "#b0b0b0" }}>
                    <span>{fmtInt(video.view_count)} views</span>
                    <span>Ch avg: {fmtInt(video.channelAvgViews)}</span>
                    <span>{video.video_type === 'short' ? 'Short' : 'Long-form'}</span>
                  </div>
                </div>
                <div style={{
                  background: video.outlierScore >= 5 ? "#166534" : video.outlierScore >= 3 ? "#854d0e" : "#1e3a5f",
                  border: `1px solid ${video.outlierScore >= 5 ? "#22c55e" : video.outlierScore >= 3 ? "#f59e0b" : "#3b82f6"}`,
                  borderRadius: "6px",
                  padding: "6px 10px",
                  textAlign: "center",
                  flexShrink: 0
                }}>
                  <div style={{
                    fontSize: "16px", fontWeight: "700",
                    color: video.outlierScore >= 5 ? "#22c55e" : video.outlierScore >= 3 ? "#f59e0b" : "#3b82f6"
                  }}>
                    {video.outlierScore}x
                  </div>
                  <div style={{ fontSize: "9px", color: "#888", marginTop: "2px" }}>avg</div>
                </div>
                <button
                  onClick={() => handleViewInsight(video)}
                  style={{
                    background: "#374151", border: "1px solid #555", borderRadius: "6px",
                    padding: "8px 12px", color: "#fff", fontSize: "11px", fontWeight: "600",
                    cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap"
                  }}
                >
                  View Insights
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Insights Slide-out Panel */}
      {selectedOutlier && (
        <div style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "420px",
          background: "#1a1a1a", borderLeft: "1px solid #333",
          zIndex: 1000, overflowY: "auto", padding: "24px",
          boxShadow: "-4px 0 20px rgba(0,0,0,0.5)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>AI Video Insights</div>
            <button
              onClick={() => { setSelectedOutlier(null); setInsightData(null); }}
              style={{
                background: "transparent", border: "1px solid #555", borderRadius: "6px",
                padding: "6px 10px", color: "#fff", fontSize: "12px", cursor: "pointer"
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{
            background: "#252525", borderRadius: "8px", padding: "14px", marginBottom: "20px"
          }}>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "6px" }}>
              {selectedOutlier.title}
            </div>
            <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
              {selectedOutlier.channel?.name}
            </div>
            <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "#b0b0b0" }}>
              <span>{fmtInt(selectedOutlier.view_count)} views</span>
              <span style={{ color: "#f59e0b", fontWeight: "600" }}>{selectedOutlier.outlierScore}x avg</span>
            </div>
          </div>

          {insightLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#888" }}>
              <Loader size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
              <div style={{ fontSize: "13px" }}>Analyzing with Claude...</div>
              <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>~$0.01 per analysis</div>
            </div>
          ) : insightData?.error ? (
            <div style={{
              background: "#2d1b1b", border: "1px solid #7f1d1d", borderRadius: "8px",
              padding: "14px", color: "#fca5a5", fontSize: "13px"
            }}>
              {insightData.error}
            </div>
          ) : insightData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ background: "#252525", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#3b82f6", textTransform: "uppercase", marginBottom: "8px" }}>
                  Hook Analysis
                </div>
                <div style={{ fontSize: "13px", color: "#e0e0e0", lineHeight: "1.6" }}>
                  {insightData.hookAnalysis}
                </div>
              </div>

              <div style={{ background: "#252525", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#10b981", textTransform: "uppercase", marginBottom: "8px" }}>
                  Why It Worked
                </div>
                <div style={{ fontSize: "13px", color: "#e0e0e0", lineHeight: "1.6" }}>
                  {insightData.whyItWorked}
                </div>
              </div>

              <div style={{ background: "#252525", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#f59e0b", textTransform: "uppercase", marginBottom: "8px" }}>
                  Applicable Tactics
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {(insightData.applicableTactics || []).map((tactic, i) => (
                    <div key={i} style={{
                      fontSize: "12px", color: "#e0e0e0",
                      padding: "6px 10px", background: "#1a1a1a", borderRadius: "6px",
                      borderLeft: "3px solid #f59e0b"
                    }}>
                      {tactic}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{
                  flex: 1, background: "#252525", borderRadius: "8px", padding: "14px"
                }}>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Content Angle</div>
                  <div style={{ fontSize: "13px", color: "#fff", fontWeight: "600", textTransform: "capitalize" }}>
                    {insightData.contentAngle}
                  </div>
                </div>
                <div style={{
                  flex: 1, background: "#252525", borderRadius: "8px", padding: "14px"
                }}>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Replicability</div>
                  <div style={{
                    fontSize: "13px", fontWeight: "600", textTransform: "capitalize",
                    color: insightData.replicability === 'high' ? '#22c55e' : insightData.replicability === 'medium' ? '#f59e0b' : '#ef4444'
                  }}>
                    {insightData.replicability}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Your Stats vs Benchmarks */}
      {yourStats && benchmarks && (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px"
        }}>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "16px" }}>
            Your Channel vs Competitor Average
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <BenchmarkCard
              label="Subscribers"
              yourValue={yourStats.totalSubscribers}
              competitorAvg={benchmarks.avgCompetitorSubs}
              gap={benchmarks.subscriberGap}
            />
            <BenchmarkCard
              label="Avg Views/Video"
              yourValue={yourStats.avgViewsPerVideo}
              competitorAvg={benchmarks.avgCompetitorViews}
              gap={benchmarks.viewsGap}
            />
            <BenchmarkCard
              label="Uploads (30d)"
              yourValue={yourStats.videosLast30Days}
              competitorAvg={benchmarks.avgCompetitorFrequency}
              gap={benchmarks.frequencyGap}
            />
            <BenchmarkCard
              label="Shorts (30d)"
              yourValue={yourStats.shortsCount}
              competitorAvg={benchmarks.avgCompetitorShorts}
              gap={benchmarks.shortsGap}
            />
            <BenchmarkCard
              label="Long-form (30d)"
              yourValue={yourStats.longsCount}
              competitorAvg={benchmarks.avgCompetitorLongs}
              gap={benchmarks.longsGap}
            />
          </div>
        </div>
      )}

      {/* Competitor List — Grouped by Category */}
      {activeCompetitors.length === 0 ? (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "48px 24px",
          textAlign: "center",
          color: "#666"
        }}>
          <Search size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
          <div style={{ fontSize: "16px", marginBottom: "8px" }}>No competitors added yet</div>
          <div style={{ fontSize: "12px" }}>Add competitor channels to start benchmarking your performance</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Section header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "4px"
          }}>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff" }}>
              Tracked Competitors
              <span style={{ fontSize: "13px", fontWeight: "400", color: "#888", marginLeft: "8px" }}>
                {activeCompetitors.length} channels, {groupedCompetitors.length} categories
              </span>
            </div>
            <button
              onClick={() => {
                const anyExpanded = Object.values(expandedCategories).some(Boolean);
                toggleAllCategories(!anyExpanded);
              }}
              style={{
                background: "transparent",
                border: "1px solid #555",
                borderRadius: "6px",
                padding: "4px 12px",
                fontSize: "11px",
                color: "#aaa",
                cursor: "pointer",
              }}
            >
              {Object.values(expandedCategories).some(Boolean) ? "Collapse All" : "Expand All"}
            </button>
          </div>

          {/* Category groups */}
          {groupedCompetitors.map(group => (
            <CategoryHeader
              key={group.key}
              group={group}
              isExpanded={!!expandedCategories[group.key]}
              onToggle={() => toggleCategory(group.key)}
            >
              {expandedCategories[group.key] && (
                <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
                  {group.channels.map(competitor => (
                    <CompetitorCard
                      key={competitor.id}
                      competitor={competitor}
                      isExpanded={expandedCompetitor === competitor.id}
                      onToggle={() => setExpandedCompetitor(expandedCompetitor === competitor.id ? null : competitor.id)}
                      onRemove={() => removeCompetitor(competitor.id)}
                      onRefresh={refreshCompetitor}
                      userTimezone={userTimezone}
                    />
                  ))}
                </div>
              )}
            </CategoryHeader>
          ))}
        </div>
      )}
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

// Competitor Card Component
function CompetitorCard({ competitor, isExpanded, onToggle, onRemove, onRefresh, userTimezone }) {
  // State for collapsible analysis sections
  const [titleSectionExpanded, setTitleSectionExpanded] = useState(false);
  const [scheduleSectionExpanded, setScheduleSectionExpanded] = useState(false);
  const [formatSectionExpanded, setFormatSectionExpanded] = useState(false);

  // Calculate growth indicators from history
  const growth = useMemo(() => {
    if (!competitor.history || competitor.history.length === 0) return null;

    const latest = {
      subscriberCount: competitor.subscriberCount,
      avgViews: competitor.avgViewsPerVideo,
      uploadsLast30Days: competitor.uploadsLast30Days
    };

    const previous = competitor.history[competitor.history.length - 1];

    return {
      subscriberChange: latest.subscriberCount - previous.subscriberCount,
      subscriberPctChange: ((latest.subscriberCount - previous.subscriberCount) / Math.max(previous.subscriberCount, 1)) * 100,
      viewsChange: latest.avgViews - previous.avgViews,
      viewsPctChange: ((latest.avgViews - previous.avgViews) / Math.max(previous.avgViews, 1)) * 100,
      uploadsChange: latest.uploadsLast30Days - previous.uploadsLast30Days,
      daysSinceLastRefresh: Math.floor((new Date() - new Date(previous.timestamp)) / (1000 * 60 * 60 * 24)),
      lastRefreshDate: new Date(previous.timestamp).toLocaleDateString()
    };
  }, [competitor]);

  // Analysis computations (only when expanded)
  const titleAnalysis = useMemo(() =>
    isExpanded ? analyzeTitlePatterns(competitor.videos) : null,
    [competitor.videos, isExpanded]
  );

  const scheduleAnalysis = useMemo(() =>
    isExpanded ? analyzeUploadSchedule(competitor.videos, userTimezone) : null,
    [competitor.videos, userTimezone, isExpanded]
  );

  const formatAnalysis = useMemo(() =>
    isExpanded ? categorizeContentFormats(competitor.videos) : null,
    [competitor.videos, isExpanded]
  );

  return (
    <div style={{
      background: "#252525",
      border: "1px solid #333",
      borderRadius: "8px",
      overflow: "hidden"
    }}>
      {/* Header */}
      <div style={{
        padding: "16px"
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto auto auto",
          gap: "12px",
          alignItems: "center"
        }}>
          <a
            href={`https://www.youtube.com/channel/${competitor.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block" }}
          >
            <img
              src={competitor.thumbnail}
              alt={competitor.name}
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                objectFit: "cover",
                transition: "opacity 0.15s ease"
              }}
              onMouseOver={(e) => e.target.style.opacity = "0.8"}
              onMouseOut={(e) => e.target.style.opacity = "1"}
            />
          </a>
          <div>
            <a
              href={`https://www.youtube.com/channel/${competitor.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "15px", fontWeight: "600", color: "#fff", marginBottom: "8px", display: "block", textDecoration: "none" }}
              onMouseOver={(e) => e.target.style.textDecoration = "underline"}
              onMouseOut={(e) => e.target.style.textDecoration = "none"}
            >
              {competitor.name}
            </a>
            <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "#888", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Users size={14} />
                {fmtInt(competitor.subscriberCount)} subs
                {growth && growth.subscriberChange !== 0 && (
                  <span style={{
                    fontSize: "9px",
                    color: growth.subscriberChange > 0 ? "#10b981" : "#ef4444",
                    fontWeight: "600"
                  }}>
                    {growth.subscriberChange > 0 ? "+" : ""}{fmtInt(growth.subscriberChange)}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Video size={14} />
                {fmtInt(competitor.videoCount)} videos
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Eye size={14} />
                {fmtInt(competitor.avgViewsPerVideo)} avg views
                {growth && growth.viewsChange !== 0 && (
                  <span style={{
                    fontSize: "9px",
                    color: growth.viewsChange > 0 ? "#10b981" : "#ef4444",
                    fontWeight: "600"
                  }}>
                    {growth.viewsPctChange > 0 ? "+" : ""}{growth.viewsPctChange.toFixed(1)}%
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Calendar size={14} />
                {competitor.uploadsLast30Days} uploads/30d
              </div>
            </div>
          </div>
          <button
            onClick={() => onRefresh(competitor.id)}
            style={{
              background: "transparent",
              border: "1px solid #3b82f6",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "#3b82f6",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
              fontWeight: "600"
            }}
            title={growth ? `Last refreshed ${growth.lastRefreshDate} (${growth.daysSinceLastRefresh} days ago)` : "Refresh data and save snapshot"}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={onToggle}
            style={{
              background: "transparent",
              border: "1px solid #555",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "#888",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
              fontWeight: "600"
            }}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {isExpanded ? "Less" : "More"}
          </button>
          <button
            onClick={onRemove}
            style={{
              background: "transparent",
              border: "1px solid #ef4444",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "#ef4444",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
              fontWeight: "600"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#ef444420";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Trash2 size={14} />
            Remove
          </button>
        </div>

        {/* Growth Indicators Banner */}
        {growth && (
          <div style={{
            marginTop: "12px",
            padding: "10px 12px",
            background: "#1E1E1E",
            border: "1px solid #333",
            borderRadius: "6px",
            display: "flex",
            gap: "16px",
            alignItems: "center",
            fontSize: "11px"
          }}>
            <div style={{ color: "#888" }}>
              Since {growth.lastRefreshDate} ({growth.daysSinceLastRefresh}d ago):
            </div>
            {growth.subscriberChange !== 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ color: "#888" }}>Subscribers:</span>
                <span style={{
                  fontWeight: "700",
                  color: growth.subscriberChange > 0 ? "#10b981" : "#ef4444"
                }}>
                  {growth.subscriberChange > 0 ? "+" : ""}{fmtInt(growth.subscriberChange)} ({growth.subscriberPctChange > 0 ? "+" : ""}{growth.subscriberPctChange.toFixed(1)}%)
                </span>
              </div>
            )}
            {growth.viewsChange !== 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ color: "#888" }}>Avg Views:</span>
                <span style={{
                  fontWeight: "700",
                  color: growth.viewsChange > 0 ? "#10b981" : "#ef4444"
                }}>
                  {growth.viewsChange > 0 ? "+" : ""}{fmtInt(growth.viewsChange)} ({growth.viewsPctChange > 0 ? "+" : ""}{growth.viewsPctChange.toFixed(1)}%)
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div style={{ borderTop: "1px solid #333", padding: "16px" }}>
          {/* Upload Breakdown */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "12px" }}>
              Upload Breakdown (Last 30 Days)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
              <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "6px", padding: "12px" }}>
                <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px" }}>TOTAL UPLOADS</div>
                <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff" }}>
                  {competitor.uploadsLast30Days}
                </div>
                <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                  Every {(30 / Math.max(competitor.uploadsLast30Days, 1)).toFixed(1)} days
                </div>
              </div>
              <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "6px", padding: "12px" }}>
                <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px" }}>SHORTS</div>
                <div style={{ fontSize: "22px", fontWeight: "700", color: "#ec4899" }}>
                  {competitor.shorts30d}
                </div>
                <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                  {competitor.uploadsLast30Days > 0 ? Math.round((competitor.shorts30d / competitor.uploadsLast30Days) * 100) : 0}% of uploads
                </div>
              </div>
              <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "6px", padding: "12px" }}>
                <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px" }}>LONG-FORM</div>
                <div style={{ fontSize: "22px", fontWeight: "700", color: "#3b82f6" }}>
                  {competitor.longs30d}
                </div>
                <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                  {competitor.uploadsLast30Days > 0 ? Math.round((competitor.longs30d / competitor.uploadsLast30Days) * 100) : 0}% of uploads
                </div>
              </div>
            </div>
          </div>

          {/* Content Series */}
          {competitor.contentSeries && competitor.contentSeries.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                <BarChart3 size={16} />
                Top Performing Content Series
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {competitor.contentSeries.slice(0, 3).map((series, idx) => (
                  <div key={idx} style={{
                    background: "#1E1E1E",
                    border: "1px solid #333",
                    borderRadius: "6px",
                    padding: "12px"
                  }}>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: "6px" }}>
                      {series.name}
                    </div>
                    <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "#888" }}>
                      <span>{series.count} episodes</span>
                      <span>•</span>
                      <span>{fmtInt(series.avgViews)} avg views</span>
                      <span>•</span>
                      <span>{fmtInt(series.totalViews)} total views</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Title/Thumbnail Pattern Analysis */}
          {titleAnalysis && (
            <AnalysisSection
              title="Title & Thumbnail Patterns"
              icon={Type}
              isExpanded={titleSectionExpanded}
              onToggle={() => setTitleSectionExpanded(!titleSectionExpanded)}
            >
              {titleAnalysis.patterns.length === 0 ? (
                <div style={{ color: "#666", fontSize: "12px" }}>
                  Need at least 10 videos with sufficient pattern data for analysis
                </div>
              ) : (
                <>
                  {/* Pattern Cards */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "12px", color: "#888", marginBottom: "10px" }}>
                      Patterns in Top {titleAnalysis.topVideoCount} Videos
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {titleAnalysis.patterns.slice(0, 5).map((pattern, idx) => (
                        <div key={idx} style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 12px",
                          background: "#252525",
                          borderRadius: "6px"
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                            <span style={{ fontSize: "20px" }}>{pattern.icon}</span>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>
                                {pattern.name}
                              </div>
                              <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                                {pattern.insight}
                              </div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{
                              fontSize: "18px",
                              fontWeight: "700",
                              color: pattern.topFrequency > 0.5 ? "#10b981" : "#3b82f6"
                            }}>
                              {Math.round(pattern.topFrequency * 100)}%
                            </div>
                            <div style={{ fontSize: "9px", color: "#666" }}>
                              {pattern.topCount}/{titleAnalysis.topVideoCount} videos
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top 10 Thumbnail Grid */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "12px", color: "#888", marginBottom: "10px" }}>
                      Top 10 Performing Thumbnails
                    </div>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, 1fr)",
                      gap: "8px"
                    }}>
                      {titleAnalysis.top10Videos.map((video, idx) => {
                        const uploadDate = video.publishedAt
                          ? new Date(video.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'N/A';

                        return (
                          <div key={video.id} style={{ display: "flex", flexDirection: "column" }}>
                            <a
                              href={`https://www.youtube.com/watch?v=${video.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ position: "relative", display: "block" }}
                            >
                              <img
                                src={video.thumbnail}
                                alt={video.title}
                                title={video.title}
                                style={{
                                  width: "100%",
                                  aspectRatio: "16/9",
                                  borderRadius: "4px",
                                  objectFit: "cover",
                                  border: "1px solid #333",
                                  cursor: "pointer",
                                  transition: "opacity 0.15s ease"
                                }}
                                onMouseOver={(e) => e.target.style.opacity = "0.8"}
                                onMouseOut={(e) => e.target.style.opacity = "1"}
                              />
                              <div style={{
                                position: "absolute",
                                bottom: "4px",
                                right: "4px",
                                background: "rgba(0,0,0,0.8)",
                                padding: "2px 6px",
                                borderRadius: "3px",
                                fontSize: "9px",
                                fontWeight: "600",
                                color: "#fff"
                              }}>
                                {fmtInt(video.views)}
                              </div>
                            </a>
                            <div style={{
                              fontSize: "9px",
                              color: "#666",
                              marginTop: "4px",
                              textAlign: "center"
                            }}>
                              {uploadDate}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Title Length Insight */}
                  <div style={{
                    background: "#252525",
                    border: "1px solid #333",
                    borderRadius: "6px",
                    padding: "10px 12px",
                    fontSize: "11px",
                    color: "#888"
                  }}>
                    <strong style={{ color: "#fff" }}>Title Length:</strong> Top videos average{" "}
                    <span style={{ color: "#10b981", fontWeight: "600" }}>
                      {titleAnalysis.avgTopTitleLength} characters
                    </span>
                    {" "}vs channel average of {titleAnalysis.avgAllTitleLength}
                  </div>
                </>
              )}
            </AnalysisSection>
          )}

          {/* Upload Schedule Analysis */}
          {scheduleAnalysis && (
            <AnalysisSection
              title="Upload Schedule Insights"
              icon={Clock}
              isExpanded={scheduleSectionExpanded}
              onToggle={() => setScheduleSectionExpanded(!scheduleSectionExpanded)}
            >
              {/* Best Day/Time Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                {/* Best Day */}
                {scheduleAnalysis.bestDay && (
                  <div style={{
                    background: "#252525",
                    border: "1px solid #333",
                    borderRadius: "6px",
                    padding: "12px"
                  }}>
                    <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px" }}>
                      BEST DAY
                    </div>
                    <div style={{ fontSize: "20px", fontWeight: "700", color: "#10b981", marginBottom: "4px" }}>
                      {scheduleAnalysis.bestDay.day}
                    </div>
                    <div style={{ fontSize: "10px", color: "#666" }}>
                      {fmtInt(scheduleAnalysis.bestDay.avgViews)} avg views
                      {" • "}
                      {scheduleAnalysis.bestDay.count} uploads
                    </div>
                  </div>
                )}

                {/* Best Time */}
                {scheduleAnalysis.bestTime && (
                  <div style={{
                    background: "#252525",
                    border: "1px solid #333",
                    borderRadius: "6px",
                    padding: "12px"
                  }}>
                    <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px" }}>
                      BEST TIME ({scheduleAnalysis.timezone.split('/')[1] || scheduleAnalysis.timezone})
                    </div>
                    <div style={{ fontSize: "20px", fontWeight: "700", color: "#3b82f6", marginBottom: "4px" }}>
                      {scheduleAnalysis.bestTime.name}
                    </div>
                    <div style={{ fontSize: "10px", color: "#666" }}>
                      {fmtInt(scheduleAnalysis.bestTime.avgViews)} avg views
                      {" • "}
                      {scheduleAnalysis.bestTime.count} uploads
                    </div>
                  </div>
                )}
              </div>

              {/* Day of Week Bar Chart */}
              {scheduleAnalysis.dayStats && scheduleAnalysis.dayStats.length > 0 && (
                <div style={{
                  background: "#252525",
                  border: "1px solid #333",
                  borderRadius: "6px",
                  padding: "12px",
                  marginBottom: "16px"
                }}>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "10px" }}>
                    Performance by Day of Week
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {scheduleAnalysis.dayStats
                      .sort((a, b) => a.dayIndex - b.dayIndex)
                      .map(day => {
                        const maxViews = Math.max(...scheduleAnalysis.dayStats.map(d => d.avgViews));
                        const barWidth = (day.avgViews / maxViews) * 100;

                        return (
                          <div key={day.day} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{
                              width: "70px",
                              fontSize: "10px",
                              color: "#888",
                              textAlign: "right"
                            }}>
                              {day.day.substring(0, 3)}
                            </div>
                            <div style={{ flex: 1, background: "#1E1E1E", borderRadius: "4px", height: "20px", position: "relative" }}>
                              <div style={{
                                width: `${barWidth}%`,
                                height: "100%",
                                background: scheduleAnalysis.bestDay && day.day === scheduleAnalysis.bestDay.day
                                  ? "linear-gradient(90deg, #10b981, #059669)"
                                  : "linear-gradient(90deg, #3b82f6, #2563eb)",
                                borderRadius: "4px",
                                transition: "width 0.3s ease"
                              }} />
                            </div>
                            <div style={{
                              width: "70px",
                              fontSize: "10px",
                              color: "#fff",
                              fontWeight: "600"
                            }}>
                              {fmtInt(day.avgViews)}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Cadence & Correlation Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{
                  background: "#252525",
                  border: "1px solid #333",
                  borderRadius: "6px",
                  padding: "12px"
                }}>
                  <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px" }}>
                    CADENCE CONSISTENCY
                  </div>
                  <div style={{
                    fontSize: "20px",
                    fontWeight: "700",
                    color: scheduleAnalysis.consistencyScore >= 70 ? "#10b981" :
                           scheduleAnalysis.consistencyScore >= 50 ? "#f59e0b" : "#ef4444",
                    marginBottom: "4px"
                  }}>
                    {scheduleAnalysis.consistencyScore}%
                  </div>
                  <div style={{ fontSize: "10px", color: "#666" }}>
                    Avg {scheduleAnalysis.avgInterval} days between uploads
                  </div>
                </div>

                <div style={{
                  background: "#252525",
                  border: "1px solid #333",
                  borderRadius: "6px",
                  padding: "12px"
                }}>
                  <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px" }}>
                    FREQUENCY ↔ VIEWS
                  </div>
                  <div style={{
                    fontSize: "20px",
                    fontWeight: "700",
                    color: scheduleAnalysis.correlation > 0.3 ? "#10b981" :
                           scheduleAnalysis.correlation < -0.3 ? "#ef4444" : "#888",
                    marginBottom: "4px"
                  }}>
                    {scheduleAnalysis.correlation > 0 ? '+' : ''}{scheduleAnalysis.correlation}
                  </div>
                  <div style={{ fontSize: "10px", color: "#666" }}>
                    {scheduleAnalysis.correlation > 0.5 ? "Strong positive" :
                     scheduleAnalysis.correlation > 0.3 ? "Moderate positive" :
                     scheduleAnalysis.correlation < -0.3 ? "More = fewer views" :
                     "No clear correlation"}
                  </div>
                </div>
              </div>
            </AnalysisSection>
          )}

          {/* Content Format Categorization */}
          {formatAnalysis && (
            <AnalysisSection
              title="Content Format Breakdown"
              icon={Tag}
              isExpanded={formatSectionExpanded}
              onToggle={() => setFormatSectionExpanded(!formatSectionExpanded)}
            >
              {/* Duration Split */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", color: "#888", marginBottom: "10px" }}>
                  Duration Format
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                  {formatAnalysis.durationStats.map(format => (
                    <div key={format.name} style={{ flex: 1 }}>
                      <div style={{
                        background: "#252525",
                        borderRadius: "6px",
                        padding: "12px",
                        borderLeft: `4px solid ${format.color}`
                      }}>
                        <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px" }}>
                          {format.name}
                        </div>
                        <div style={{ fontSize: "22px", fontWeight: "700", color: format.color, marginBottom: "4px" }}>
                          {format.count}
                        </div>
                        <div style={{ fontSize: "10px", color: "#666", marginBottom: "6px" }}>
                          {Math.round(format.percentage)}% of uploads
                        </div>
                        <div style={{ fontSize: "10px", color: "#888" }}>
                          {fmtInt(format.avgViews)} avg views
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Content Type Distribution */}
              <div>
                <div style={{ fontSize: "12px", color: "#888", marginBottom: "10px" }}>
                  Content Type Distribution
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {formatAnalysis.typeStats.slice(0, 6).map(type => (
                    <div key={type.name} style={{
                      background: "#252525",
                      borderRadius: "6px",
                      padding: "10px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                        <span style={{ fontSize: "18px" }}>{type.icon}</span>
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: "600", color: "#fff" }}>
                            {type.name}
                          </div>
                          <div style={{ fontSize: "10px", color: "#666" }}>
                            {type.count} videos • {fmtInt(type.avgViews)} avg views
                          </div>
                        </div>
                      </div>
                      <div style={{
                        fontSize: "16px",
                        fontWeight: "700",
                        color: type.color
                      }}>
                        {Math.round(type.percentage)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </AnalysisSection>
          )}

          {/* Top Videos */}
          {competitor.topVideos && competitor.topVideos.length > 0 && (
            <div>
              <div style={{ fontSize: "14px", fontWeight: "600", color: "#fff", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                <PlaySquare size={16} />
                Top 5 Performing Videos
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                {competitor.topVideos.map((video, idx) => (
                <div key={video.id} style={{
                  background: "#1E1E1E",
                  border: "1px solid #333",
                  borderRadius: "6px",
                  padding: "10px",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: "12px",
                  alignItems: "center"
                }}>
                  <a
                    href={`https://www.youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      style={{
                        width: "120px",
                        height: "68px",
                        borderRadius: "4px",
                        objectFit: "cover",
                        transition: "opacity 0.15s ease"
                      }}
                      onMouseOver={(e) => e.target.style.opacity = "0.8"}
                      onMouseOut={(e) => e.target.style.opacity = "1"}
                    />
                  </a>
                  <div>
                    <a
                      href={`https://www.youtube.com/watch?v=${video.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "12px", fontWeight: "600", color: "#fff", marginBottom: "6px", lineHeight: "1.4", display: "block", textDecoration: "none" }}
                      onMouseOver={(e) => e.target.style.textDecoration = "underline"}
                      onMouseOut={(e) => e.target.style.textDecoration = "none"}
                    >
                      {video.title}
                    </a>
                    <div style={{ display: "flex", gap: "10px", fontSize: "10px", color: "#888" }}>
                      <span>{fmtInt(video.views)} views</span>
                      <span>•</span>
                      <span>{fmtInt(video.likes)} likes</span>
                      <span>•</span>
                      <span>{fmtDuration(video.duration)}</span>
                      <span>•</span>
                      <span style={{ color: video.type === 'short' ? "#ec4899" : "#3b82f6" }}>
                        {video.type === 'short' ? 'Short' : 'Long-form'}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: idx === 0 ? "#fcd34d" : idx === 1 ? "#e5e7eb" : idx === 2 ? "#d6d3d1" : "#666" }}>
                      #{idx + 1}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </div>
          )}
        </div>
      )}
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
