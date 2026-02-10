/**
 * YouTube OAuth Service
 * Frontend service for managing YouTube OAuth connections.
 *
 * Features:
 * - Initiate OAuth flow
 * - Check connection status
 * - Refresh tokens
 * - Disconnect accounts
 * - Auto-refresh expiring tokens
 */

import { supabase } from './supabaseClient';

class YouTubeOAuthService {
  constructor() {
    this.connections = [];
    this.listeners = new Set();
    this.refreshTimer = null;
    this.refreshingIds = new Set(); // Track connections currently being refreshed
    this.lastRefreshAttempt = {}; // Track last refresh attempt time per connection
  }

  /**
   * Get current auth token for API calls
   * Refreshes the session if needed
   * @returns {Promise<string|null>}
   */
  async getAuthToken() {
    if (!supabase) return null;

    // First try to get existing session
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.warn('Error getting session:', error);
      return null;
    }

    // If no session, user needs to log in
    if (!session) {
      return null;
    }

    // Check if token is about to expire (within 5 minutes)
    const expiresAt = session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = expiresAt - now;

    if (expiresIn < 300) {
      // Token expires soon, try to refresh
      console.log('[YouTubeOAuth] Session expiring soon, refreshing...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError) {
        console.warn('Failed to refresh session:', refreshError);
        return null;
      }

      return refreshData?.session?.access_token || null;
    }

    return session.access_token;
  }

  /**
   * Initiate YouTube OAuth flow
   * Redirects user to Google OAuth consent screen
   */
  async initiateOAuth() {
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error('Your session has expired. Please refresh the page and log in again.');
    }

    const response = await fetch('/api/youtube-oauth-init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      // Provide more helpful error message for auth issues
      if (response.status === 401) {
        throw new Error('Your session has expired. Please refresh the page and log in again.');
      }
      throw new Error(error.error || 'Failed to initiate OAuth flow');
    }

    const { authUrl } = await response.json();

    // Redirect to Google OAuth
    window.location.href = authUrl;
  }

  /**
   * Get all OAuth connections for current user
   * @returns {Promise<Array>}
   */
  async getConnections() {
    const token = await this.getAuthToken();
    if (!token) {
      this.connections = [];
      this.notifyListeners();
      return [];
    }

    try {
      const response = await fetch('/api/youtube-oauth-status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.warn('Failed to fetch OAuth connections:', response.status);
        return this.connections;
      }

      const data = await response.json();
      this.connections = data.connections || [];
      this.notifyListeners();

      // Schedule auto-refresh for expiring tokens
      this.scheduleAutoRefresh();

      return this.connections;
    } catch (error) {
      console.error('Error fetching OAuth connections:', error);
      return this.connections;
    }
  }

  /**
   * Refresh a specific connection's token
   * @param {string} connectionId
   * @returns {Promise<boolean>}
   */
  async refreshToken(connectionId) {
    const token = await this.getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch('/api/youtube-token-refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ connectionId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.details || 'Token refresh failed');
    }

    // Refresh connection list
    await this.getConnections();
    return true;
  }

  /**
   * Disconnect a YouTube account
   * @param {string} connectionId
   * @returns {Promise<boolean>}
   */
  async disconnect(connectionId) {
    const token = await this.getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`/api/youtube-oauth-status?connectionId=${encodeURIComponent(connectionId)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Disconnect failed');
    }

    // Refresh connection list
    await this.getConnections();
    return true;
  }

  /**
   * Subscribe to connection changes
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    // Immediately call with current state
    callback(this.connections);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of connection changes
   */
  notifyListeners() {
    this.listeners.forEach(cb => {
      try {
        cb(this.connections);
      } catch (err) {
        console.warn('Listener error:', err);
      }
    });
  }

  /**
   * Schedule auto-refresh for tokens expiring soon
   * Tokens that expire within 10 minutes will be refreshed
   */
  scheduleAutoRefresh() {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Find connections that need refresh soon (excluding those recently attempted)
    const now = Date.now();
    const MIN_REFRESH_INTERVAL = 60000;

    const connectionsNeedingRefresh = this.connections.filter(conn => {
      // Skip if recently attempted refresh
      const lastAttempt = this.lastRefreshAttempt[conn.id] || 0;
      if (now - lastAttempt < MIN_REFRESH_INTERVAL) return false;

      return conn.is_active &&
        !conn.connection_error &&
        conn.expiresInSeconds > 0 &&
        conn.expiresInSeconds < 600; // Less than 10 minutes
    });

    if (connectionsNeedingRefresh.length === 0) {
      // Check again in 5 minutes
      this.refreshTimer = setTimeout(() => this.checkAndRefreshExpiring(), 5 * 60 * 1000);
      return;
    }

    // Find the soonest expiring token
    const soonestExpiry = Math.min(...connectionsNeedingRefresh.map(c => c.expiresInSeconds));

    // Refresh 1 minute before expiry, minimum 5 seconds from now to prevent tight loops
    const refreshIn = Math.max(5000, (soonestExpiry - 60) * 1000);

    console.log(`[YouTubeOAuth] Scheduling auto-refresh in ${Math.round(refreshIn/1000)}s`);
    this.refreshTimer = setTimeout(() => this.checkAndRefreshExpiring(), refreshIn);
  }

  /**
   * Check all connections and refresh those expiring soon
   */
  async checkAndRefreshExpiring() {
    // Use cached connections to avoid triggering another fetch cycle
    const connections = this.connections;
    const now = Date.now();
    const MIN_REFRESH_INTERVAL = 60000; // Don't retry refresh for 60 seconds

    for (const conn of connections) {
      // Skip if already refreshing or recently attempted
      if (this.refreshingIds.has(conn.id)) {
        console.log(`[YouTubeOAuth] Skipping ${conn.youtube_channel_title} - refresh in progress`);
        continue;
      }

      const lastAttempt = this.lastRefreshAttempt[conn.id] || 0;
      if (now - lastAttempt < MIN_REFRESH_INTERVAL) {
        console.log(`[YouTubeOAuth] Skipping ${conn.youtube_channel_title} - recently attempted`);
        continue;
      }

      // Refresh if expiring in less than 5 minutes and no existing error
      if (conn.needsRefresh && !conn.connection_error && conn.is_active) {
        try {
          this.refreshingIds.add(conn.id);
          this.lastRefreshAttempt[conn.id] = now;
          console.log(`[YouTubeOAuth] Auto-refreshing token for ${conn.youtube_channel_title}`);
          await this.refreshToken(conn.id);
        } catch (error) {
          console.warn(`[YouTubeOAuth] Auto-refresh failed for ${conn.youtube_channel_title}:`, error.message);
        } finally {
          this.refreshingIds.delete(conn.id);
        }
      }
    }
  }

  /**
   * Check if user has any active YouTube connections
   * @returns {boolean}
   */
  hasActiveConnection() {
    return this.connections.some(c => c.is_active && !c.connection_error);
  }

  /**
   * Get the first active connection (for simple single-account use cases)
   * @returns {Object|null}
   */
  getActiveConnection() {
    return this.connections.find(c => c.is_active && !c.connection_error) || null;
  }

  /**
   * Clean up (call on logout)
   */
  cleanup() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.connections = [];
    this.listeners.clear();
  }
}

// Export singleton instance
export const youtubeOAuthService = new YouTubeOAuthService();
export default youtubeOAuthService;
