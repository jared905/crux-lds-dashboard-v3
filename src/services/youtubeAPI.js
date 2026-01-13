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
}

// Export singleton instance
export const youtubeAPI = new YouTubeAPIService();
export default youtubeAPI;
