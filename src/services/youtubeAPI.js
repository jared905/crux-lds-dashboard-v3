/**
 * YouTube Data API Service
 * Handles fetching comments, channel data, videos, and other data from YouTube
 * Includes quota tracking and consolidated fetch methods for audits
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Parse ISO 8601 duration (PT1H2M3S) to seconds
 */
function parseDuration(duration) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1]) || 0) * 3600 +
         (parseInt(match[2]) || 0) * 60 +
         (parseInt(match[3]) || 0);
}

class YouTubeAPIService {
  constructor() {
    this.apiKey = this.loadAPIKey();
    this.quotaUsage = this.loadQuotaUsage();
  }

  // ============================================
  // API Key Management
  // ============================================

  loadAPIKey() {
    // Check both key names for backwards compatibility
    return localStorage.getItem('youtube_api_key')
      || localStorage.getItem('yt_api_key')
      || '';
  }

  saveAPIKey(key) {
    this.apiKey = key;
    localStorage.setItem('youtube_api_key', key);
  }

  // ============================================
  // Quota Tracking (10,000 units/day default)
  // ============================================

  loadQuotaUsage() {
    const saved = localStorage.getItem('youtube_quota_usage');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const today = new Date().toISOString().split('T')[0];
        if (parsed.date === today) return parsed;
      } catch { /* reset below */ }
    }
    return this.resetQuotaUsage();
  }

  resetQuotaUsage() {
    const usage = { date: new Date().toISOString().split('T')[0], units: 0, calls: 0 };
    localStorage.setItem('youtube_quota_usage', JSON.stringify(usage));
    return usage;
  }

  trackQuota(units) {
    const today = new Date().toISOString().split('T')[0];
    if (this.quotaUsage.date !== today) {
      this.quotaUsage = this.resetQuotaUsage();
    }
    this.quotaUsage.units += units;
    this.quotaUsage.calls += 1;
    localStorage.setItem('youtube_quota_usage', JSON.stringify(this.quotaUsage));
  }

  getQuotaUsage() {
    const today = new Date().toISOString().split('T')[0];
    if (this.quotaUsage.date !== today) {
      this.quotaUsage = this.resetQuotaUsage();
    }
    return { ...this.quotaUsage, limit: 10000, remaining: 10000 - this.quotaUsage.units };
  }

  checkQuota(estimatedUnits) {
    const usage = this.getQuotaUsage();
    return usage.remaining >= estimatedUnits;
  }

  // ============================================
  // Channel Resolution & Details
  // ============================================

  /**
   * Resolve a YouTube channel URL, handle, or ID to a UC channel ID.
   * Handles: direct UC IDs, @handles, /channel/ URLs, /c/ URLs, /user/ URLs.
   * Quota: 0 if direct ID, 100 if search is needed.
   */
  async resolveChannelId(input) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured. Please add your API key in settings.');
    }

    let channelId = (input || '').trim();

    // Direct UC channel ID
    if (channelId.match(/^UC[\w-]{22}$/)) {
      return channelId;
    }

    // URL: youtube.com/channel/UC...
    if (channelId.includes('youtube.com/channel/')) {
      return channelId.split('youtube.com/channel/')[1].split(/[?/]/)[0];
    }

    // Handle format: @username or youtube.com/@username
    if (channelId.includes('youtube.com/@') || channelId.startsWith('@')) {
      const handle = channelId.includes('@')
        ? channelId.split('@')[1].split(/[?/]/)[0]
        : channelId;

      return await this._searchForChannel('@' + handle);
    }

    // Custom URL: youtube.com/c/name or youtube.com/user/name
    if (channelId.includes('youtube.com/c/') || channelId.includes('youtube.com/user/')) {
      const customName = channelId.split(/youtube\.com\/(?:c|user)\//)[1].split(/[?/]/)[0];
      return await this._searchForChannel(customName);
    }

    // Bare handle without @ prefix
    if (channelId.length > 2 && !channelId.includes('/') && !channelId.startsWith('UC')) {
      return await this._searchForChannel('@' + channelId);
    }

    return channelId;
  }

  async _searchForChannel(query) {
    const url = new URL(`${YOUTUBE_API_BASE}/search`);
    url.searchParams.append('part', 'snippet');
    url.searchParams.append('type', 'channel');
    url.searchParams.append('q', query);
    url.searchParams.append('maxResults', '1');
    url.searchParams.append('key', this.apiKey);

    const response = await fetch(url);
    const data = await response.json();

    this.trackQuota(100); // search.list costs 100 units

    if (data.error) throw new Error(data.error.message);
    if (!data.items?.length) throw new Error(`No channel found for "${query}"`);

    return data.items[0].snippet.channelId;
  }

  /**
   * Fetch full channel details including uploads playlist ID.
   * Quota: 1 unit (channels.list).
   */
  async fetchChannelDetails(channelId) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured.');
    }

    const url = new URL(`${YOUTUBE_API_BASE}/channels`);
    url.searchParams.append('part', 'snippet,statistics,contentDetails');
    url.searchParams.append('id', channelId);
    url.searchParams.append('key', this.apiKey);

    const response = await fetch(url);
    const data = await response.json();

    this.trackQuota(1);

    if (data.error) throw new Error(data.error.message);
    if (!data.items?.length) throw new Error('Channel not found');

    const channel = data.items[0];

    return {
      youtube_channel_id: channel.id,
      name: channel.snippet.title,
      description: channel.snippet.description,
      thumbnail_url: channel.snippet.thumbnails?.high?.url || channel.snippet.thumbnails?.default?.url,
      custom_url: channel.snippet.customUrl,
      subscriber_count: parseInt(channel.statistics.subscriberCount) || 0,
      total_view_count: parseInt(channel.statistics.viewCount) || 0,
      video_count: parseInt(channel.statistics.videoCount) || 0,
      uploads_playlist_id: channel.contentDetails?.relatedPlaylists?.uploads,
      published_at: channel.snippet.publishedAt,
    };
  }

  /**
   * Fetch videos from a channel's uploads playlist with pagination.
   * Quota: 1 unit per playlistItems page + 1 unit per videos batch.
   */
  async fetchChannelVideos(uploadsPlaylistId, maxResults = 200) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured.');
    }

    if (!uploadsPlaylistId) return [];

    const perPage = 50;
    let allItems = [];
    let pageToken = null;

    // Page through playlist items
    while (allItems.length < maxResults) {
      const url = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
      url.searchParams.append('part', 'snippet,contentDetails');
      url.searchParams.append('playlistId', uploadsPlaylistId);
      url.searchParams.append('maxResults', String(perPage));
      url.searchParams.append('key', this.apiKey);
      if (pageToken) {
        url.searchParams.append('pageToken', pageToken);
      }

      const response = await fetch(url);
      const data = await response.json();

      this.trackQuota(1);

      if (data.error) throw new Error(data.error.message);
      if (!data.items?.length) break;

      allItems = allItems.concat(data.items);
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    // Trim to maxResults
    allItems = allItems.slice(0, maxResults);
    if (!allItems.length) return [];

    // Fetch video details in batches of 50
    const allVideos = [];
    for (let i = 0; i < allItems.length; i += 50) {
      const batch = allItems.slice(i, i + 50);
      const videoIds = batch.map(item => item.contentDetails.videoId).join(',');

      const url = new URL(`${YOUTUBE_API_BASE}/videos`);
      url.searchParams.append('part', 'statistics,contentDetails,snippet');
      url.searchParams.append('id', videoIds);
      url.searchParams.append('key', this.apiKey);

      const response = await fetch(url);
      const data = await response.json();

      this.trackQuota(1);

      if (data.error) throw new Error(data.error.message);

      const mapped = (data.items || []).map(video => ({
        youtube_video_id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnail_url: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
        published_at: video.snippet.publishedAt,
        duration_seconds: parseDuration(video.contentDetails.duration),
        view_count: parseInt(video.statistics.viewCount) || 0,
        like_count: parseInt(video.statistics.likeCount) || 0,
        comment_count: parseInt(video.statistics.commentCount) || 0,
        tags: video.snippet.tags || [],
      }));

      allVideos.push(...mapped);
    }

    return allVideos;
  }

  /**
   * Convenience: resolve channel + fetch details + fetch videos in one call.
   */
  async fetchFullChannelData(input, { maxVideos = 200 } = {}) {
    const channelId = await this.resolveChannelId(input);
    const channel = await this.fetchChannelDetails(channelId);
    const videos = await this.fetchChannelVideos(channel.uploads_playlist_id, maxVideos);
    return { channel, videos };
  }

  // ============================================
  // Comments (existing methods)
  // ============================================

  async getVideoComments(videoId, maxResults = 100) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured. Please add your API key in settings.');
    }

    try {
      const url = new URL(`${YOUTUBE_API_BASE}/commentThreads`);
      url.searchParams.append('part', 'snippet,replies');
      url.searchParams.append('videoId', videoId);
      url.searchParams.append('maxResults', Math.min(maxResults, 100));
      url.searchParams.append('order', 'relevance');
      url.searchParams.append('textFormat', 'plainText');
      url.searchParams.append('key', this.apiKey);

      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `YouTube API request failed: ${response.status}`);
      }

      const data = await response.json();

      this.trackQuota(1);

      return {
        comments: this.parseComments(data.items),
        nextPageToken: data.nextPageToken,
        totalResults: data.pageInfo?.totalResults || 0
      };

    } catch (error) {
      console.error('YouTube API error:', error);
      throw error;
    }
  }

  async getAllVideoComments(videoId, maxComments = 1000, onProgress = null) {
    let allComments = [];
    let nextPageToken = null;
    let fetchedCount = 0;

    while (fetchedCount < maxComments) {
      const batchSize = Math.min(100, maxComments - fetchedCount);
      const result = await this.getVideoCommentsBatch(videoId, batchSize, nextPageToken);

      allComments = allComments.concat(result.comments);
      fetchedCount += result.comments.length;

      if (onProgress) {
        onProgress(fetchedCount, result.totalResults);
      }

      if (!result.nextPageToken || result.comments.length === 0) {
        break;
      }

      nextPageToken = result.nextPageToken;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allComments;
  }

  async getVideoCommentsBatch(videoId, maxResults = 100, pageToken = null) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured.');
    }

    const url = new URL(`${YOUTUBE_API_BASE}/commentThreads`);
    url.searchParams.append('part', 'snippet,replies');
    url.searchParams.append('videoId', videoId);
    url.searchParams.append('maxResults', Math.min(maxResults, 100));
    url.searchParams.append('order', 'relevance');
    url.searchParams.append('textFormat', 'plainText');
    url.searchParams.append('key', this.apiKey);

    if (pageToken) {
      url.searchParams.append('pageToken', pageToken);
    }

    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `YouTube API request failed: ${response.status}`);
    }

    const data = await response.json();

    this.trackQuota(1);

    return {
      comments: this.parseComments(data.items),
      nextPageToken: data.nextPageToken,
      totalResults: data.pageInfo?.totalResults || 0
    };
  }

  async getChannelComments(videoIds, maxCommentsPerVideo = 100, onProgress = null) {
    const allComments = [];
    let processedCount = 0;

    for (const videoId of videoIds) {
      try {
        const comments = await this.getAllVideoComments(videoId, maxCommentsPerVideo);
        allComments.push(...comments);

        processedCount++;
        if (onProgress) {
          onProgress(processedCount, videoIds.length);
        }

        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.warn(`Failed to fetch comments for video ${videoId}:`, error);
      }
    }

    return allComments;
  }

  parseComments(items) {
    const comments = [];

    for (const item of items) {
      const snippet = item.snippet.topLevelComment.snippet;

      comments.push({
        id: item.snippet.topLevelComment.id,
        videoId: snippet.videoId,
        text: snippet.textDisplay,
        author: snippet.authorDisplayName,
        authorChannelId: snippet.authorChannelId?.value,
        likeCount: snippet.likeCount,
        publishedAt: snippet.publishedAt,
        updatedAt: snippet.updatedAt,
        isReply: false
      });

      if (item.replies) {
        for (const reply of item.replies.comments) {
          const replySnippet = reply.snippet;
          comments.push({
            id: reply.id,
            videoId: replySnippet.videoId,
            text: replySnippet.textDisplay,
            author: replySnippet.authorDisplayName,
            authorChannelId: replySnippet.authorChannelId?.value,
            likeCount: replySnippet.likeCount,
            publishedAt: replySnippet.publishedAt,
            updatedAt: replySnippet.updatedAt,
            isReply: true,
            parentCommentId: replySnippet.parentId
          });
        }
      }
    }

    return comments;
  }

  // ============================================
  // Video & Channel Stats (existing methods)
  // ============================================

  extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  async getChannelStats(channelId) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured.');
    }

    const url = new URL(`${YOUTUBE_API_BASE}/channels`);
    url.searchParams.append('part', 'statistics,snippet');
    url.searchParams.append('id', channelId);
    url.searchParams.append('key', this.apiKey);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch channel stats: ${response.status}`);
    }

    const data = await response.json();

    this.trackQuota(1);

    if (!data.items || data.items.length === 0) {
      throw new Error('Channel not found');
    }

    const item = data.items[0];

    return {
      channelId: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      customUrl: item.snippet.customUrl,
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
      subscriberCount: parseInt(item.statistics.subscriberCount) || 0,
      viewCount: parseInt(item.statistics.viewCount) || 0,
      videoCount: parseInt(item.statistics.videoCount) || 0,
      hiddenSubscriberCount: item.statistics.hiddenSubscriberCount || false
    };
  }

  /**
   * Get channel stats directly from a YouTube URL or @handle.
   * Uses forHandle/forUsername/id on channels.list (1 quota unit) instead of search (100 units).
   * Returns the same format as getChannelStats, or null if not found.
   */
  async getChannelStatsByUrl(input) {
    if (!this.apiKey || !input) return null;

    const trimmed = input.trim();

    // --- Direct ID resolution (no forHandle needed) ---
    if (trimmed.match(/^UC[\w-]{22}$/)) {
      return this._fetchChannelStatsById(trimmed);
    }
    if (trimmed.includes('youtube.com/channel/')) {
      const id = trimmed.split('youtube.com/channel/')[1].split(/[?/]/)[0];
      return this._fetchChannelStatsById(id);
    }

    // --- Extract handle from various URL formats ---
    let handle = null;
    if (trimmed.includes('youtube.com/@')) {
      handle = trimmed.split('@')[1].split(/[?/]/)[0];
    } else if (trimmed.startsWith('@')) {
      handle = trimmed.slice(1).split(/[?/]/)[0];
    } else if (trimmed.includes('youtube.com/c/')) {
      handle = trimmed.split('youtube.com/c/')[1].split(/[?/]/)[0];
    } else if (trimmed.includes('youtube.com/user/')) {
      handle = trimmed.split('youtube.com/user/')[1].split(/[?/]/)[0];
    } else if (trimmed.length > 2 && !trimmed.includes('/')) {
      handle = trimmed;
    }

    if (!handle) return null;

    // Try forHandle first (1 quota unit)
    const forHandleUrl = new URL(`${YOUTUBE_API_BASE}/channels`);
    forHandleUrl.searchParams.append('part', 'statistics,snippet');
    forHandleUrl.searchParams.append('key', this.apiKey);
    forHandleUrl.searchParams.append('forHandle', handle);

    try {
      const response = await fetch(forHandleUrl);
      if (response.ok) {
        const data = await response.json();
        this.trackQuota(1);
        if (data.items && data.items.length > 0) {
          return this._parseChannelStatsItem(data.items[0]);
        }
      }
    } catch { /* forHandle failed, try search fallback */ }

    // Fallback: use search.list to resolve handle → channelId, then channels.list
    try {
      const channelId = await this._searchForChannel('@' + handle);
      if (channelId) {
        return this._fetchChannelStatsById(channelId);
      }
    } catch {
      // search also failed
    }

    return null;
  }

  /** Fetch channel stats by a known UC channel ID. */
  async _fetchChannelStatsById(channelId) {
    const url = new URL(`${YOUTUBE_API_BASE}/channels`);
    url.searchParams.append('part', 'statistics,snippet');
    url.searchParams.append('id', channelId);
    url.searchParams.append('key', this.apiKey);

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    this.trackQuota(1);

    if (!data.items || data.items.length === 0) return null;
    return this._parseChannelStatsItem(data.items[0]);
  }

  /** Parse a channels.list response item into our standard stats shape. */
  _parseChannelStatsItem(item) {
    return {
      channelId: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      customUrl: item.snippet.customUrl,
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
      subscriberCount: parseInt(item.statistics.subscriberCount) || 0,
      viewCount: parseInt(item.statistics.viewCount) || 0,
      videoCount: parseInt(item.statistics.videoCount) || 0,
      hiddenSubscriberCount: item.statistics.hiddenSubscriberCount || false
    };
  }

  async getVideoStats(videoId) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured.');
    }

    const url = new URL(`${YOUTUBE_API_BASE}/videos`);
    url.searchParams.append('part', 'statistics,snippet');
    url.searchParams.append('id', videoId);
    url.searchParams.append('key', this.apiKey);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch video stats: ${response.status}`);
    }

    const data = await response.json();

    this.trackQuota(1);

    if (!data.items || data.items.length === 0) {
      throw new Error('Video not found');
    }

    const item = data.items[0];

    return {
      videoId: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      viewCount: parseInt(item.statistics.viewCount) || 0,
      likeCount: parseInt(item.statistics.likeCount) || 0,
      commentCount: parseInt(item.statistics.commentCount) || 0,
      thumbnailUrl: item.snippet.thumbnails.high?.url
    };
  }

  async getMultipleVideoStats(videoIds) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured.');
    }

    if (!videoIds || videoIds.length === 0) {
      return [];
    }

    const results = [];
    const chunks = [];

    for (let i = 0; i < videoIds.length; i += 50) {
      chunks.push(videoIds.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      const url = new URL(`${YOUTUBE_API_BASE}/videos`);
      url.searchParams.append('part', 'statistics,snippet,contentDetails');
      url.searchParams.append('id', chunk.join(','));
      url.searchParams.append('key', this.apiKey);

      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`Failed to fetch video stats batch: ${response.status}`);
        continue;
      }

      const data = await response.json();

      this.trackQuota(1);

      if (data.items) {
        for (const item of data.items) {
          results.push({
            videoId: item.id,
            title: item.snippet.title,
            description: item.snippet.description,
            publishedAt: item.snippet.publishedAt,
            channelId: item.snippet.channelId,
            channelTitle: item.snippet.channelTitle,
            viewCount: parseInt(item.statistics.viewCount) || 0,
            likeCount: parseInt(item.statistics.likeCount) || 0,
            commentCount: parseInt(item.statistics.commentCount) || 0,
            duration: item.contentDetails?.duration,
            thumbnailUrl: item.snippet.thumbnails.high?.url ||
                          item.snippet.thumbnails.medium?.url ||
                          item.snippet.thumbnails.default?.url,
            thumbnails: {
              default: item.snippet.thumbnails.default?.url,
              medium: item.snippet.thumbnails.medium?.url,
              high: item.snippet.thumbnails.high?.url,
              maxres: item.snippet.thumbnails.maxres?.url,
            }
          });
        }
      }

      if (chunks.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  async enrichVideosWithYouTubeData(videos, onProgress = null) {
    const videosWithIds = videos.filter(v => v.youtubeVideoId);

    if (videosWithIds.length === 0) {
      return videos;
    }

    try {
      const videoIds = videosWithIds.map(v => v.youtubeVideoId);
      const ytData = await this.getMultipleVideoStats(videoIds);

      const ytDataMap = {};
      for (const yt of ytData) {
        ytDataMap[yt.videoId] = yt;
      }

      const enrichedVideos = videos.map(video => {
        if (video.youtubeVideoId && ytDataMap[video.youtubeVideoId]) {
          const yt = ytDataMap[video.youtubeVideoId];
          return {
            ...video,
            thumbnailUrl: yt.thumbnailUrl || video.thumbnailUrl,
            thumbnails: yt.thumbnails,
            ytLikeCount: yt.likeCount,
            ytCommentCount: yt.commentCount,
          };
        }
        return video;
      });

      if (onProgress) {
        onProgress(videosWithIds.length, videosWithIds.length);
      }

      return enrichedVideos;

    } catch (error) {
      console.warn('Failed to enrich videos with YouTube data:', error);
      return videos;
    }
  }

  // ============================================
  // Shorts Detection (via server-side proxy)
  // ============================================

  /**
   * Batch-check videos for YouTube Shorts status.
   * Uses /api/check-shorts proxy to avoid CORS issues.
   * Only checks videos with duration <= 180s and real YouTube IDs.
   *
   * @param {Array<{youtube_video_id: string, duration_seconds: number}>} videos
   * @returns {Promise<Map<string, boolean>>} Map of videoId -> isShort
   */
  async checkIfShortBatch(videos) {
    const results = new Map();

    if (!videos || videos.length === 0) return results;

    // Pre-filter: videos over 180s are definitively NOT Shorts
    const candidates = [];
    for (const v of videos) {
      const id = v.youtube_video_id;
      if (!id || id.startsWith('csv_') || id.startsWith('client_')) continue;
      if (v.duration_seconds > 180) {
        results.set(id, false);
        continue;
      }
      candidates.push(id);
    }

    if (candidates.length === 0) return results;

    // Send to proxy in batches of 50
    for (let i = 0; i < candidates.length; i += 50) {
      const batch = candidates.slice(i, i + 50);
      try {
        const response = await fetch('/api/check-shorts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoIds: batch }),
        });

        if (response.ok) {
          const data = await response.json();
          for (const [videoId, isShort] of Object.entries(data.results)) {
            results.set(videoId, isShort);
          }
        }
      } catch (err) {
        console.warn('Shorts detection proxy failed:', err.message);
        // Fallback: leave these IDs out of results (caller handles missing)
      }
    }

    return results;
  }
}

/**
 * Determine video_type from Shorts detection result.
 * @param {boolean|null|undefined} isShort - Result from checkIfShortBatch
 * @param {number} durationSeconds - Video duration
 * @returns {string} 'short' or 'long'
 */
export function determineVideoType(isShort, durationSeconds) {
  if (isShort === true) return 'short';
  if (isShort === false) return 'long';
  // Fallback when detection was not attempted or failed
  return (durationSeconds > 0 && durationSeconds <= 180) ? 'short' : 'long';
}

// Export singleton instance
export const youtubeAPI = new YouTubeAPIService();
export default youtubeAPI;
