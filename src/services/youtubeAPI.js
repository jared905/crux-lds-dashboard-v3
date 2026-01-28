/**
 * YouTube Data API Service
 * Handles fetching comments and other data from YouTube
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

class YouTubeAPIService {
  constructor() {
    this.apiKey = this.loadAPIKey();
  }

  // Load API key from localStorage
  loadAPIKey() {
    return localStorage.getItem('youtube_api_key') || '';
  }

  // Save API key to localStorage
  saveAPIKey(key) {
    this.apiKey = key;
    localStorage.setItem('youtube_api_key', key);
  }

  // Fetch comment threads for a video
  async getVideoComments(videoId, maxResults = 100) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured. Please add your API key in settings.');
    }

    try {
      const url = new URL(`${YOUTUBE_API_BASE}/commentThreads`);
      url.searchParams.append('part', 'snippet,replies');
      url.searchParams.append('videoId', videoId);
      url.searchParams.append('maxResults', Math.min(maxResults, 100));
      url.searchParams.append('order', 'relevance'); // or 'time'
      url.searchParams.append('textFormat', 'plainText');
      url.searchParams.append('key', this.apiKey);

      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `YouTube API request failed: ${response.status}`);
      }

      const data = await response.json();

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

  // Fetch all comments for a video with pagination
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

      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allComments;
  }

  // Fetch a batch of comments with pagination token
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

    return {
      comments: this.parseComments(data.items),
      nextPageToken: data.nextPageToken,
      totalResults: data.pageInfo?.totalResults || 0
    };
  }

  // Fetch comments for multiple videos (channel-wide)
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

        // Rate limiting between videos
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.warn(`Failed to fetch comments for video ${videoId}:`, error);
        // Continue with other videos
      }
    }

    return allComments;
  }

  // Parse comment items from API response
  parseComments(items) {
    const comments = [];

    for (const item of items) {
      const snippet = item.snippet.topLevelComment.snippet;

      // Add top-level comment
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

      // Add replies if any
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

  // Extract video ID from YouTube URL
  extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  // Get channel statistics (subscribers, total views, video count)
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

  // Get video statistics
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

  // Get video statistics for multiple videos in a single API call (max 50 per request)
  async getMultipleVideoStats(videoIds) {
    if (!this.apiKey) {
      throw new Error('YouTube API key not configured.');
    }

    if (!videoIds || videoIds.length === 0) {
      return [];
    }

    // YouTube API allows up to 50 video IDs per request
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

      // Rate limiting between batch requests
      if (chunks.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  // Enrich video rows with YouTube API data (thumbnails, etc.)
  async enrichVideosWithYouTubeData(videos, onProgress = null) {
    // Filter videos that have YouTube video IDs
    const videosWithIds = videos.filter(v => v.youtubeVideoId);

    if (videosWithIds.length === 0) {
      return videos;
    }

    try {
      const videoIds = videosWithIds.map(v => v.youtubeVideoId);
      const ytData = await this.getMultipleVideoStats(videoIds);

      // Create lookup map
      const ytDataMap = {};
      for (const yt of ytData) {
        ytDataMap[yt.videoId] = yt;
      }

      // Enrich original videos
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
}

// Export singleton instance
export const youtubeAPI = new YouTubeAPIService();
export default youtubeAPI;
