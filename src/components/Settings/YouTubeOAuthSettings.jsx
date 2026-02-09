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
  ExternalLink,
  Loader2,
  Plus
} from 'lucide-react';
import youtubeOAuthService from '../../services/youtubeOAuthService';
import { supabase } from '../../services/supabaseClient';
import { syncOAuthChannelVideos } from '../../services/clientDataService';

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

export default function YouTubeOAuthSettings({ onNavigateToSecurity, onClientsUpdate }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Add as client prompt state
  const [showAddClientPrompt, setShowAddClientPrompt] = useState(false);
  const [pendingClientInfo, setPendingClientInfo] = useState(null);
  const [addingClient, setAddingClient] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncingConnection, setSyncingConnection] = useState(null);
  const [syncStatus, setSyncStatus] = useState({});
  const [testingAnalytics, setTestingAnalytics] = useState(null);
  const [analyticsTestResult, setAnalyticsTestResult] = useState({});

  useEffect(() => {
    loadConnections();

    // Check URL params for OAuth callback results
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth_success') === 'true') {
      const channel = params.get('channel');
      const linkedClient = params.get('linked_client');

      if (linkedClient) {
        setSuccess(`Connected ${channel} (linked to existing client: ${linkedClient})`);
      } else {
        setSuccess(`Successfully connected ${channel || 'YouTube account'}!`);
      }

      // Check if we should prompt to add as client
      if (params.get('prompt_add_client') === 'true') {
        setPendingClientInfo({
          channelId: params.get('channel_id'),
          channelName: channel,
          thumbnail: params.get('channel_thumbnail')
        });
        setShowAddClientPrompt(true);
      }

      // Clean up URL without refreshing page
      window.history.replaceState({}, '', window.location.pathname + '?tab=api-keys');
    }
    if (params.get('oauth_error')) {
      setError(decodeURIComponent(params.get('oauth_error')));
      window.history.replaceState({}, '', window.location.pathname + '?tab=api-keys');
    }

    // Subscribe to connection changes
    const unsubscribe = youtubeOAuthService.subscribe(setConnections);
    return () => unsubscribe();
  }, []);

  const loadConnections = async () => {
    setLoading(true);
    try {
      await youtubeOAuthService.getConnections();
    } catch (err) {
      console.error('Failed to load connections:', err);
    } finally {
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleAddAsClient = async () => {
    if (!pendingClientInfo || !supabase) return;

    setAddingClient(true);
    setSyncProgress({ stage: 'creating', message: 'Creating client...' });

    try {
      // Create or update the client entry in the channels table
      // Using upsert to handle re-adding previously deleted channels
      const { data: newClient, error: insertError } = await supabase
        .from('channels')
        .upsert({
          youtube_channel_id: pendingClientInfo.channelId,
          name: pendingClientInfo.channelName,
          custom_url: `https://www.youtube.com/channel/${pendingClientInfo.channelId}`,
          is_competitor: false,
          is_client: true,
          client_id: pendingClientInfo.channelId,
          subscriber_count: 0,
          video_count: 0,
          created_via: 'oauth',
          last_synced_at: new Date().toISOString()
        }, { onConflict: 'youtube_channel_id' })
        .select()
        .single();

      if (insertError) throw insertError;

      // Fetch videos for the new client
      setSyncProgress({ stage: 'syncing', message: 'Fetching videos from YouTube...' });

      const syncResult = await syncOAuthChannelVideos(
        pendingClientInfo.channelId,
        newClient.id,
        100, // Fetch up to 100 recent videos
        (progress) => setSyncProgress(progress)
      );

      if (syncResult.success && syncResult.videoCount > 0) {
        setSuccess(`Added "${pendingClientInfo.channelName}" with ${syncResult.videoCount} videos!`);
      } else if (syncResult.success) {
        setSuccess(`Added "${pendingClientInfo.channelName}" as a client. No videos found yet.`);
      } else {
        // Client was created but video sync failed - still show partial success
        setSuccess(`Added "${pendingClientInfo.channelName}" as a client. Video sync failed: ${syncResult.error}`);
      }

      setShowAddClientPrompt(false);
      setPendingClientInfo(null);
      setSyncProgress(null);

      // Notify parent to refresh clients list and select new client
      if (onClientsUpdate) {
        onClientsUpdate(pendingClientInfo.channelName);
      }
    } catch (err) {
      console.error('Failed to add client:', err);
      setError(`Failed to add client: ${err.message}`);
      setSyncProgress(null);
    } finally {
      setAddingClient(false);
    }
  };

  const handleSkipAddClient = () => {
    setShowAddClientPrompt(false);
    setPendingClientInfo(null);
  };

  const handleTestAnalytics = async (connection) => {
    if (!supabase || testingAnalytics) return;

    setTestingAnalytics(connection.id);
    setAnalyticsTestResult(prev => ({ ...prev, [connection.id]: null }));
    setError(null);

    try {
      const token = await youtubeOAuthService.getAuthToken();
      const response = await fetch('/api/youtube-analytics-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ connectionId: connection.id })
      });

      const result = await response.json();
      setAnalyticsTestResult(prev => ({ ...prev, [connection.id]: result }));

      if (result.hasAccess) {
        setSuccess(`Analytics API access confirmed for ${connection.youtube_channel_title}!`);
      } else if (result.needsReauth) {
        setError(`Analytics scope missing. Please disconnect and reconnect your account.`);
      } else {
        setError(result.message || 'No Analytics API access');
      }
    } catch (err) {
      console.error('Analytics test failed:', err);
      setError(`Test failed: ${err.message}`);
      setAnalyticsTestResult(prev => ({ ...prev, [connection.id]: { hasAccess: false, error: err.message } }));
    } finally {
      setTestingAnalytics(null);
    }
  };

  const handleSyncVideos = async (connection) => {
    if (!supabase || syncingConnection) return;

    setSyncingConnection(connection.id);
    setSyncStatus(prev => ({ ...prev, [connection.id]: { stage: 'starting', message: 'Starting sync...' } }));
    setError(null);

    try {
      // First, find or create the client channel in the database
      const { data: existingChannel, error: findError } = await supabase
        .from('channels')
        .select('id')
        .eq('youtube_channel_id', connection.youtube_channel_id)
        .eq('is_client', true)
        .single();

      let channelId;
      if (findError || !existingChannel) {
        // Create or update the client channel
        // Using upsert to handle re-adding previously deleted channels
        const { data: newChannel, error: insertError } = await supabase
          .from('channels')
          .upsert({
            youtube_channel_id: connection.youtube_channel_id,
            name: connection.youtube_channel_title,
            custom_url: `https://www.youtube.com/channel/${connection.youtube_channel_id}`,
            is_competitor: false,
            is_client: true,
            client_id: connection.youtube_channel_id,
            subscriber_count: 0,
            video_count: 0,
            created_via: 'oauth',
            last_synced_at: new Date().toISOString()
          }, { onConflict: 'youtube_channel_id' })
          .select()
          .single();

        if (insertError) throw insertError;
        channelId = newChannel.id;
      } else {
        channelId = existingChannel.id;
      }

      // Sync videos
      const syncResult = await syncOAuthChannelVideos(
        connection.youtube_channel_id,
        channelId,
        100,
        (progress) => setSyncStatus(prev => ({ ...prev, [connection.id]: progress }))
      );

      if (syncResult.success) {
        setSuccess(`Synced ${syncResult.videoCount} videos for ${connection.youtube_channel_title}!`);
        setSyncStatus(prev => ({ ...prev, [connection.id]: { stage: 'complete', message: `${syncResult.videoCount} videos synced` } }));

        // Notify parent to refresh clients list
        if (onClientsUpdate) {
          onClientsUpdate(connection.youtube_channel_title);
        }
      } else {
        throw new Error(syncResult.error || 'Sync failed');
      }

      // Clear status after a delay
      setTimeout(() => {
        setSyncStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[connection.id];
          return newStatus;
        });
      }, 3000);
    } catch (err) {
      console.error('Failed to sync videos:', err);
      setError(`Failed to sync videos: ${err.message}`);
      setSyncStatus(prev => {
        const newStatus = { ...prev };
        delete newStatus[connection.id];
        return newStatus;
      });
    } finally {
      setSyncingConnection(null);
    }
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
            <div key={conn.id} style={{ ...connectionCardStyle, flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", width: "100%" }}>
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
                    {/* Connection status */}
                    {conn.connection_error ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#ef4444" }}>
                        <AlertCircle size={12} />
                        <span>{conn.connection_error}</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#22c55e" }}>
                          <CheckCircle2 size={12} />
                          <span>Connected</span>
                        </div>
                        <span style={{ color: "#666" }}>
                          Since {formatDate(conn.created_at)}
                        </span>
                      </>
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

              {/* Sync Videos Section */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", paddingTop: "12px", borderTop: "1px solid #333"
              }}>
                {syncStatus[conn.id] ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#93c5fd" }}>
                    {syncStatus[conn.id].stage === 'complete' ? (
                      <CheckCircle2 size={14} style={{ color: "#22c55e" }} />
                    ) : (
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                    )}
                    {syncStatus[conn.id].message}
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    Sync videos to see them in your dashboard timeline
                  </div>
                )}
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => handleTestAnalytics(conn)}
                    disabled={testingAnalytics === conn.id || conn.connection_error}
                    style={{
                      ...buttonStyle,
                      opacity: (testingAnalytics === conn.id || conn.connection_error) ? 0.6 : 1,
                      cursor: (testingAnalytics === conn.id || conn.connection_error) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {testingAnalytics === conn.id ? (
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <Shield size={14} />
                    )}
                    {testingAnalytics === conn.id ? "Testing..." : "Test Analytics"}
                  </button>
                  <button
                    onClick={() => handleSyncVideos(conn)}
                    disabled={syncingConnection === conn.id || conn.connection_error}
                    style={{
                      ...buttonStyle,
                      background: syncingConnection === conn.id ? "#333" : "#2962FF",
                      border: "none",
                      color: "#fff",
                      opacity: (syncingConnection === conn.id || conn.connection_error) ? 0.6 : 1,
                      cursor: (syncingConnection === conn.id || conn.connection_error) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {syncingConnection === conn.id ? (
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    {syncingConnection === conn.id ? "Syncing..." : "Sync Videos"}
                  </button>
                </div>
              </div>

              {/* Analytics Test Result */}
              {analyticsTestResult[conn.id] && (
                <div style={{
                  width: "100%", padding: "12px", borderRadius: "6px", fontSize: "12px",
                  background: analyticsTestResult[conn.id].hasAccess ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  border: `1px solid ${analyticsTestResult[conn.id].hasAccess ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                  color: analyticsTestResult[conn.id].hasAccess ? "#22c55e" : "#ef4444"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "600" }}>
                    {analyticsTestResult[conn.id].hasAccess ? (
                      <><CheckCircle2 size={14} /> Analytics Access Confirmed</>
                    ) : (
                      <><AlertCircle size={14} /> No Analytics Access</>
                    )}
                  </div>
                  <div style={{ marginTop: "4px", color: analyticsTestResult[conn.id].hasAccess ? "#86efac" : "#fca5a5" }}>
                    {analyticsTestResult[conn.id].message}
                    {analyticsTestResult[conn.id].needsReauth && (
                      <span style={{ marginLeft: "8px", fontWeight: "500" }}>
                        → Disconnect and reconnect to add Analytics scope
                      </span>
                    )}
                  </div>
                </div>
              )}
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

      {/* Add as Client Prompt Modal */}
      {showAddClientPrompt && pendingClientInfo && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              zIndex: 1000
            }}
            onClick={handleSkipAddClient}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#1E1E1E",
              border: "1px solid #333",
              borderRadius: "12px",
              padding: "32px",
              maxWidth: "420px",
              width: "90%",
              zIndex: 1001
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
              {pendingClientInfo.thumbnail ? (
                <img
                  src={pendingClientInfo.thumbnail}
                  alt={pendingClientInfo.channelName}
                  style={{ width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover" }}
                />
              ) : (
                <div style={{
                  width: "64px", height: "64px", borderRadius: "50%",
                  background: "#333", display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <Youtube size={32} style={{ color: "#ff0000" }} />
                </div>
              )}
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 4px", color: "#fff" }}>
                  Add as Client?
                </h3>
                <p style={{ fontSize: "14px", color: "#9E9E9E", margin: 0 }}>
                  {pendingClientInfo.channelName}
                </p>
              </div>
            </div>

            <p style={{ fontSize: "14px", color: "#9E9E9E", marginBottom: "24px", lineHeight: "1.6" }}>
              Would you like to add <strong style={{ color: "#fff" }}>{pendingClientInfo.channelName}</strong> as
              a client in your dashboard? We'll fetch recent videos automatically.
            </p>

            {/* Sync Progress */}
            {syncProgress && (
              <div style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "12px 16px", background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.2)", borderRadius: "8px",
                marginBottom: "16px", fontSize: "13px", color: "#93c5fd"
              }}>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                {syncProgress.message}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={handleAddAsClient}
                disabled={addingClient}
                style={{
                  flex: 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  padding: "12px 20px",
                  background: addingClient ? "#1e40af" : "#2962FF",
                  border: "none", borderRadius: "8px",
                  color: "#fff", fontWeight: "600", fontSize: "14px",
                  cursor: addingClient ? "not-allowed" : "pointer"
                }}
              >
                {addingClient ? (
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Plus size={16} />
                )}
                {addingClient ? "Adding..." : "Add as Client"}
              </button>
              <button
                onClick={handleSkipAddClient}
                disabled={addingClient}
                style={{
                  padding: "12px 20px",
                  background: "#333",
                  border: "none", borderRadius: "8px",
                  color: "#E0E0E0", fontWeight: "600", fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                Skip
              </button>
            </div>

            <p style={{ fontSize: "12px", color: "#666", marginTop: "16px", textAlign: "center" }}>
              Videos will be fetched from YouTube. You can also upload CSV data for additional metrics.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
