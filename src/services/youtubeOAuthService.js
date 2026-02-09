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
  }

  /**
   * Get current auth token for API calls
   * @returns {Promise<string|null>}
   */
  async getAuthToken() {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  /**
   * Initiate YouTube OAuth flow
   * Redirects user to Google OAuth consent screen
   */
  async initiateOAuth() {
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error('You must be logged in to connect YouTube');
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
    console.log('[YouTubeOAuth] getConnections - token exists:', !!token);

    if (!token) {
      console.log('[YouTubeOAuth] No auth token, returning empty connections');
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

      console.log('[YouTubeOAuth] Status response:', response.status, response.statusText);

      if (!response.ok) {
        console.warn('[YouTubeOAuth] Failed to fetch OAuth connections:', response.status);
        return this.connections;
      }

      const data = await response.json();
      console.log('[YouTubeOAuth] Response data:', data);

      const connections = data.connections;
      this.connections = connections || [];
      console.log('[YouTubeOAuth] Connections loaded:', this.connections.length);
      this.notifyListeners();

      // Schedule auto-refresh for expiring tokens
      this.scheduleAutoRefresh();

      return this.connections;
    } catch (error) {
      console.error('[YouTubeOAuth] Error fetching OAuth connections:', error);
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

    const response = await fetch('/api/youtube-oauth-disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ connectionId })
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

    // Find connections that need refresh soon
    const TEN_MINUTES = 10 * 60 * 1000;
    const connectionsNeedingRefresh = this.connections.filter(conn =>
      conn.is_active &&
      !conn.connection_error &&
      conn.expiresInSeconds > 0 &&
      conn.expiresInSeconds < 600 // Less than 10 minutes
    );

    if (connectionsNeedingRefresh.length === 0) {
      // Check again in 5 minutes
      this.refreshTimer = setTimeout(() => this.checkAndRefreshExpiring(), 5 * 60 * 1000);
      return;
    }

    // Find the soonest expiring token
    const soonestExpiry = Math.min(...connectionsNeedingRefresh.map(c => c.expiresInSeconds));

    // Refresh 1 minute before expiry, or immediately if less than 1 minute
    const refreshIn = Math.max(0, (soonestExpiry - 60) * 1000);

    this.refreshTimer = setTimeout(() => this.checkAndRefreshExpiring(), refreshIn);
  }

  /**
   * Check all connections and refresh those expiring soon
   */
  async checkAndRefreshExpiring() {
    const connections = await this.getConnections();

    for (const conn of connections) {
      // Refresh if expiring in less than 5 minutes and no existing error
      if (conn.needsRefresh && !conn.connection_error && conn.is_active) {
        try {
          console.log(`Auto-refreshing token for ${conn.youtube_channel_title}`);
          await this.refreshToken(conn.id);
        } catch (error) {
          console.warn(`Auto-refresh failed for ${conn.youtube_channel_title}:`, error.message);
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
