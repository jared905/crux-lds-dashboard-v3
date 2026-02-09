/**
 * YouTube OAuth Settings Component
 * Allows users to connect/disconnect YouTube accounts via OAuth.
 *
 * Features:
 * - Connect YouTube with OAuth (PKCE)
 * - View connected accounts
 * - Refresh expired tokens
 * - Disconnect accounts
 * - Security information for enterprise clients
 */

import { useState, useEffect } from 'react';
import {
  Youtube,
  Link2,
  Unlink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Shield,
  Clock,
  ExternalLink,
  Loader2
} from 'lucide-react';
import youtubeOAuthService from '../../services/youtubeOAuthService';

const cardStyle = {
  background: "#1E1E1E",
  borderRadius: "12px",
  border: "1px solid #333",
  padding: "24px",
  marginBottom: "16px",
};

const connectionCardStyle = {
  display: "flex",
  alignItems: "center",
  gap: "16px",
  padding: "16px",
  background: "#252525",
  borderRadius: "8px",
  marginBottom: "12px",
};

const buttonStyle = {
  padding: "8px 14px",
  background: "#333",
  border: "1px solid #444",
  borderRadius: "6px",
  color: "#E0E0E0",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "13px",
  fontWeight: "500",
};

const dangerButtonStyle = {
  ...buttonStyle,
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  color: "#ef4444",
};

export default function YouTubeOAuthSettings({ onNavigateToSecurity }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    loadConnections();

    // Check URL params for OAuth callback results
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth_success') === 'true') {
      const channel = params.get('channel');
      setSuccess(`Successfully connected ${channel || 'YouTube account'}!`);
      // Clean up URL without refreshing page
      window.history.replaceState({}, '', window.location.pathname + '?tab=api-keys');
    }
    if (params.get('oauth_error')) {
      setError(decodeURIComponent(params.get('oauth_error')));
      window.history.replaceState({}, '', window.location.pathname + '?tab=api-keys');
    }

    // Subscribe to connection changes
    const unsubscribe = youtubeOAuthService.subscribe((conns) => {
      console.log('[YouTubeOAuthSettings] Received connections update:', conns);
      setConnections(conns);
    });
    return () => unsubscribe();
  }, []);

  const loadConnections = async () => {
    console.log('[YouTubeOAuthSettings] loadConnections starting');
    setLoading(true);
    try {
      const result = await youtubeOAuthService.getConnections();
      console.log('[YouTubeOAuthSettings] loadConnections result:', result);
    } catch (err) {
      console.error('[YouTubeOAuthSettings] Failed to load connections:', err);
    } finally {
      console.log('[YouTubeOAuthSettings] loadConnections done, setting loading=false');
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await youtubeOAuthService.initiateOAuth();
      // Note: This will redirect, so we won't reach here
    } catch (err) {
      setError(err.message);
      setConnecting(false);
    }
  };

  const handleRefresh = async (connectionId) => {
    setRefreshing(connectionId);
    setError(null);
    try {
      await youtubeOAuthService.refreshToken(connectionId);
      setSuccess('Token refreshed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(null);
    }
  };

  const handleDisconnect = async (connectionId, channelTitle) => {
    if (!confirm(`Are you sure you want to disconnect ${channelTitle}?\n\nThis will revoke access and remove the connection.`)) {
      return;
    }

    setError(null);
    try {
      await youtubeOAuthService.disconnect(connectionId);
      setSuccess('Disconnected successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const formatExpiresAt = (expiresInSeconds) => {
    if (expiresInSeconds < 0) return 'Expired';
    if (expiresInSeconds < 60) return 'Expires in < 1 min';
    if (expiresInSeconds < 3600) return `Expires in ${Math.floor(expiresInSeconds / 60)} min`;
    return `Expires in ${Math.floor(expiresInSeconds / 3600)} hours`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Youtube size={22} style={{ color: "#ff0000" }} />
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: "600", margin: 0 }}>YouTube OAuth</h3>
            <p style={{ fontSize: "12px", color: "#9E9E9E", margin: "4px 0 0" }}>
              Securely connect your YouTube account
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Shield size={14} style={{ color: "#22c55e" }} />
          <span style={{ fontSize: "11px", color: "#22c55e", fontWeight: "500" }}>Enterprise Security</span>
        </div>
      </div>

      {/* Success Message */}
      {success && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "12px 16px", background: "rgba(34, 197, 94, 0.1)",
          border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "8px",
          marginBottom: "16px", color: "#22c55e", fontSize: "13px"
        }}>
          <CheckCircle2 size={16} />
          <span style={{ flex: 1 }}>{success}</span>
          <button
            onClick={() => setSuccess(null)}
            style={{ background: "none", border: "none", color: "#22c55e", cursor: "pointer", fontSize: "18px" }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "12px 16px", background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px",
          marginBottom: "16px", color: "#ef4444", fontSize: "13px"
        }}>
          <AlertCircle size={16} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "18px" }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Connections List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#9E9E9E" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
          <p style={{ marginTop: "12px" }}>Loading connections...</p>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : connections.length > 0 ? (
        <div style={{ marginBottom: "20px" }}>
          <h4 style={{ fontSize: "13px", fontWeight: "600", marginBottom: "12px", color: "#9E9E9E" }}>
            Connected Accounts
          </h4>
          {connections.map(conn => (
            <div key={conn.id} style={connectionCardStyle}>
              {/* Thumbnail */}
              <img
                src={conn.youtube_channel_thumbnail || 'https://www.youtube.com/img/desktop/yt_1200.png'}
                alt={conn.youtube_channel_title}
                style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#333", objectFit: "cover" }}
              />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: "600", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {conn.youtube_channel_title}
                </div>
                <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "6px" }}>
                  {conn.youtube_email}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px" }}>
                  {/* Expiration status */}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={12} style={{ color: conn.isExpired ? "#ef4444" : conn.needsRefresh ? "#f59e0b" : "#9E9E9E" }} />
                    <span style={{ color: conn.isExpired ? "#ef4444" : conn.needsRefresh ? "#f59e0b" : "#9E9E9E" }}>
                      {formatExpiresAt(conn.expiresInSeconds)}
                    </span>
                  </div>

                  {/* Connection error */}
                  {conn.connection_error && (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#ef4444" }}>
                      <AlertCircle size={12} />
                      <span>{conn.connection_error}</span>
                    </div>
                  )}

                  {/* Connected date */}
                  {!conn.connection_error && (
                    <span style={{ color: "#666" }}>
                      Connected {formatDate(conn.created_at)}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                <button
                  onClick={() => handleRefresh(conn.id)}
                  disabled={refreshing === conn.id}
                  style={{
                    ...buttonStyle,
                    opacity: refreshing === conn.id ? 0.7 : 1,
                    cursor: refreshing === conn.id ? 'not-allowed' : 'pointer'
                  }}
                >
                  <RefreshCw
                    size={14}
                    style={{ animation: refreshing === conn.id ? 'spin 1s linear infinite' : 'none' }}
                  />
                  Refresh
                </button>
                <button
                  onClick={() => handleDisconnect(conn.id, conn.youtube_channel_title)}
                  style={dangerButtonStyle}
                >
                  <Unlink size={14} />
                  Disconnect
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          textAlign: "center", padding: "40px",
          background: "#252525", borderRadius: "8px", marginBottom: "20px"
        }}>
          <Youtube size={48} style={{ color: "#666", marginBottom: "16px" }} />
          <p style={{ color: "#9E9E9E", marginBottom: "8px", margin: "0 0 8px" }}>No YouTube accounts connected</p>
          <p style={{ color: "#666", fontSize: "13px", margin: 0 }}>
            Connect your YouTube account to access channel analytics
          </p>
        </div>
      )}

      {/* Connect Button */}
      <button
        onClick={handleConnect}
        disabled={connecting}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
          width: "100%", padding: "14px 20px",
          background: connecting ? "#333" : "#ff0000",
          border: "none", borderRadius: "8px",
          color: "#fff", fontWeight: "600", fontSize: "14px",
          cursor: connecting ? "not-allowed" : "pointer",
          opacity: connecting ? 0.7 : 1,
          transition: "background 0.2s, opacity 0.2s"
        }}
      >
        {connecting ? (
          <>
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
            Connecting...
          </>
        ) : (
          <>
            <Link2 size={18} />
            Connect YouTube Account
          </>
        )}
      </button>

      {/* Security Info */}
      <div style={{
        marginTop: "20px", padding: "16px",
        background: "rgba(59, 130, 246, 0.08)",
        border: "1px solid rgba(59, 130, 246, 0.2)",
        borderRadius: "8px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <Shield size={16} style={{ color: "#60a5fa" }} />
          <span style={{ fontWeight: "600", color: "#60a5fa", fontSize: "13px" }}>
            Enterprise-Grade Security
          </span>
        </div>
        <ul style={{ margin: 0, paddingLeft: "18px", color: "#93c5fd", fontSize: "12px", lineHeight: "1.9" }}>
          <li>Tokens encrypted with AES-256-GCM before storage</li>
          <li>PKCE flow prevents authorization code interception</li>
          <li>Server-side token exchange (secrets never in browser)</li>
          <li>Read-only access scope (youtube.readonly)</li>
          <li>Comprehensive audit logging for compliance</li>
        </ul>
        {onNavigateToSecurity && (
          <button
            onClick={onNavigateToSecurity}
            style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              marginTop: "12px", padding: "8px 14px",
              background: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "6px", color: "#60a5fa", fontSize: "12px",
              fontWeight: "500", cursor: "pointer"
            }}
          >
            View Security Documentation <ExternalLink size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
