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
import { FileText, Network, Trash2,
  Youtube,
  Link2,
  Unlink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Shield,
  ExternalLink,
  Loader2,
  Plus,
  BarChart3,
} from 'lucide-react';
import youtubeOAuthService from '../../services/youtubeOAuthService';
import { supabase } from '../../services/supabaseClient';
import { syncOAuthChannelVideos } from '../../services/clientDataService';

const cardStyle = {
  background: "var(--card)",
  borderRadius: "8px",
  border: "1px solid var(--border)",
  padding: "24px",
  marginBottom: "16px",
};

const connectionCardStyle = {
  display: "flex",
  alignItems: "center",
  gap: "16px",
  padding: "16px",
  background: "var(--surface-high)",
  borderRadius: "8px",
  marginBottom: "12px",
};

const buttonStyle = {
  padding: "8px 14px",
  background: "var(--outline-variant)",
  border: "1px solid #444",
  borderRadius: "6px",
  color: "var(--text)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "13px",
  fontWeight: "500",
};

const dangerButtonStyle = {
  ...buttonStyle,
  background: "rgba(255, 85, 64, 0.1)",
  border: "1px solid rgba(255, 85, 64, 0.3)",
  color: "var(--neg)",
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
  const [syncStatus, setSyncStatus] = useState({});
  const [lastSynced, setLastSynced] = useState({});
  const [syncing, setSyncing] = useState(null);
  const [settingUpReporting, setSettingUpReporting] = useState(null);
  const [syncingImpressions, setSyncingImpressions] = useState(null);
  const [backfillingData, setBackfillingData] = useState(null);
  const [reportingStatus, setReportingStatus] = useState({});

  // Network management state
  const [networkConfig, setNetworkConfig] = useState(null); // { parentId, parentName, networkName, memberIds }
  const [networkLoading, setNetworkLoading] = useState(true);
  const [showNetworkSetup, setShowNetworkSetup] = useState(false);
  const [networkName, setNetworkName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState(new Set());
  const [primaryChannelYtId, setPrimaryChannelYtId] = useState(null);
  const [savingNetwork, setSavingNetwork] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState(null); // { current, total, channelName }

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

  // Load existing network configuration
  useEffect(() => {
    if (!supabase) return;
    loadNetworkConfig();
  }, []);

  const loadNetworkConfig = async () => {
    setNetworkLoading(true);
    try {
      // Find any channel that IS a network parent (has network_name set, or has members pointing to it)
      const { data: members } = await supabase
        .from('channels')
        .select('id, name, youtube_channel_id, network_id')
        .eq('is_client', true)
        .not('network_id', 'is', null);

      if (members && members.length > 0) {
        const parentId = members[0].network_id;
        const { data: parent } = await supabase
          .from('channels')
          .select('id, name, network_name, youtube_channel_id')
          .eq('id', parentId)
          .single();

        if (parent) {
          setNetworkConfig({
            parentId: parent.id,
            parentYtId: parent.youtube_channel_id,
            parentName: parent.name,
            networkName: parent.network_name || parent.name,
            memberYtIds: new Set(members.map(m => m.youtube_channel_id)),
          });
          setNetworkName(parent.network_name || parent.name);
          setSelectedMembers(new Set([parent.youtube_channel_id, ...members.map(m => m.youtube_channel_id)]));
          setPrimaryChannelYtId(parent.youtube_channel_id);
        }
      }
    } catch (err) {
      console.error('Failed to load network config:', err);
    } finally {
      setNetworkLoading(false);
    }
  };

  const handleSaveNetwork = async () => {
    if (!supabase) return;
    if (!networkName.trim()) { setError('Enter a network name.'); return; }
    if (selectedMembers.size < 2) { setError('Select at least 2 channels.'); return; }
    if (!primaryChannelYtId) { setError('Select a primary channel.'); return; }
    setSavingNetwork(true);
    setError(null);

    try {
      // Find the primary channel's UUID
      const { data: parent, error: parentErr } = await supabase
        .from('channels')
        .select('id')
        .eq('youtube_channel_id', primaryChannelYtId)
        .eq('is_client', true)
        .single();

      if (parentErr || !parent) throw new Error('Primary channel not found in database. Make sure it has been synced as a client first.');

      // Set network_name on the parent
      await supabase
        .from('channels')
        .update({ network_name: networkName.trim(), network_id: null })
        .eq('id', parent.id);

      // Clear any old network_id references (in case editing)
      await supabase
        .from('channels')
        .update({ network_id: null })
        .eq('is_client', true)
        .not('network_id', 'is', null);

      // Set network_id on all member channels (excluding the parent itself)
      const memberYtIds = [...selectedMembers].filter(id => id !== primaryChannelYtId);
      if (memberYtIds.length > 0) {
        await supabase
          .from('channels')
          .update({ network_id: parent.id })
          .eq('is_client', true)
          .in('youtube_channel_id', memberYtIds);
      }

      setSuccess(`Network "${networkName.trim()}" saved with ${selectedMembers.size} channels!`);
      setTimeout(() => setSuccess(null), 3000);
      setShowNetworkSetup(false);
      await loadNetworkConfig();

      if (onClientsUpdate) onClientsUpdate(networkName.trim());
    } catch (err) {
      setError(`Failed to save network: ${err.message}`);
    } finally {
      setSavingNetwork(false);
    }
  };

  const handleDissolveNetwork = async () => {
    if (!confirm('Dissolve this network? All channels will become standalone clients again.')) return;
    if (!supabase) return;
    setSavingNetwork(true);

    try {
      // Clear all network_id references
      await supabase
        .from('channels')
        .update({ network_id: null })
        .eq('is_client', true)
        .not('network_id', 'is', null);

      // Clear network_name on the parent
      if (networkConfig?.parentId) {
        await supabase
          .from('channels')
          .update({ network_name: null })
          .eq('id', networkConfig.parentId);
      }

      setNetworkConfig(null);
      setNetworkName('');
      setSelectedMembers(new Set());
      setPrimaryChannelYtId(null);
      setShowNetworkSetup(false);
      setSuccess('Network dissolved. Channels are now standalone.');
      setTimeout(() => setSuccess(null), 3000);

      if (onClientsUpdate) onClientsUpdate();
    } catch (err) {
      setError(`Failed to dissolve network: ${err.message}`);
    } finally {
      setSavingNetwork(false);
    }
  };

  const handleSyncAll = async () => {
    if (syncingAll || !networkConfig) return;
    setSyncingAll(true);
    setError(null);

    // Find connections that belong to the network
    const networkYtIds = new Set([networkConfig.parentYtId, ...(networkConfig.memberYtIds || [])]);
    const networkConnections = connections.filter(c => networkYtIds.has(c.youtube_channel_id));

    try {
      for (let i = 0; i < networkConnections.length; i++) {
        const conn = networkConnections[i];
        setSyncAllProgress({ current: i + 1, total: networkConnections.length, channelName: conn.youtube_channel_title });
        await handleSync(conn, { skipGuard: true });
      }
      setSuccess(`Synced all ${networkConnections.length} network channels!`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(`Network sync failed: ${err.message}`);
    } finally {
      setSyncingAll(false);
      setSyncAllProgress(null);
    }
  };

  const toggleMember = (ytChannelId) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(ytChannelId)) {
        next.delete(ytChannelId);
        if (primaryChannelYtId === ytChannelId) setPrimaryChannelYtId(null);
      } else {
        next.add(ytChannelId);
      }
      return next;
    });
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

  // Combined sync function - syncs videos first, then analytics if access confirmed
  // When called from handleSyncAll, pass skipGuard=true to bypass the syncing state check
  const handleSync = async (connection, { skipGuard = false } = {}) => {
    if (!supabase || (!skipGuard && syncing)) return;

    setSyncing(connection.id);
    setSyncStatus(prev => ({ ...prev, [connection.id]: { stage: 'videos', message: 'Syncing videos...' } }));
    setError(null);

    try {
      // Step 1: Find or create the client channel
      const { data: existingChannel, error: findError } = await supabase
        .from('channels')
        .select('id')
        .eq('youtube_channel_id', connection.youtube_channel_id)
        .eq('is_client', true)
        .single();

      let channelId;
      if (findError || !existingChannel) {
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
            last_synced_at: new Date().toISOString()
          }, { onConflict: 'youtube_channel_id' })
          .select()
          .single();

        if (insertError) throw insertError;
        channelId = newChannel.id;
      } else {
        channelId = existingChannel.id;
      }

      // Step 2: Sync videos from Data API
      const syncResult = await syncOAuthChannelVideos(
        connection.youtube_channel_id,
        channelId,
        100,
        (progress) => setSyncStatus(prev => ({
          ...prev,
          [connection.id]: { stage: 'videos', message: progress.message }
        }))
      );

      if (!syncResult.success) {
        throw new Error(syncResult.error || 'Video sync failed');
      }

      let summaryParts = [`${syncResult.videoCount} videos`];

      // Step 3: Always attempt analytics sync (will fail gracefully if no access)
      setSyncStatus(prev => ({
        ...prev,
        [connection.id]: { stage: 'analytics', message: 'Syncing analytics...' }
      }));

      try {
        const token = await youtubeOAuthService.getAuthToken();
        const analyticsResponse = await fetch('/api/youtube-analytics-fetch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ connectionId: connection.id, discoverCollabs: true })
        });

        const analyticsResult = await analyticsResponse.json();

        if (analyticsResult.success) {
          // Show matching stats: how many videos matched by direct ID vs thumbnail fallback
          const matched = analyticsResult.matchedCount || 0;
          const thumbMatched = analyticsResult.thumbnailMatchCount || 0;
          const updated = analyticsResult.updatedCount || 0;
          const totalAnalytics = analyticsResult.videoCount || 0;
          if (updated > 0) {
            summaryParts.push(`${updated}/${matched} matched analytics (${thumbMatched} via thumbnail)`);
          } else if (totalAnalytics > 0) {
            summaryParts.push(`${totalAnalytics} from API but ${matched} matched in DB`);
          }
          // Log impressions diagnostic info (from Reporting API)
          if (analyticsResult.impressionsDiag) {
            const diag = analyticsResult.impressionsDiag;
            if (diag.success) {
              if (diag.videosWithData > 0) {
                summaryParts.push(`${diag.videosWithData} with impressions`);
              } else {
                summaryParts.push('0 impressions (reports had no matching videos)');
              }
            } else {
              const errMsg = diag.error || 'Unknown error';
              summaryParts.push(`impressions: ${errMsg}`);
              console.warn('[Sync] Impressions not available:', errMsg);
            }
          }
          // Collab discovery results (merged into analytics endpoint)
          if (analyticsResult.collabResult) {
            const cr = analyticsResult.collabResult;
            const totalCollabs = (cr.guestCollabs || 0) + (cr.hostCollabs || 0);
            if (totalCollabs > 0) {
              const parts = [];
              if (cr.guestCollabs > 0) parts.push(`${cr.guestCollabs} guest`);
              if (cr.hostCollabs > 0) parts.push(`${cr.hostCollabs} hosted`);
              summaryParts.push(`${parts.join(' + ')} collab${totalCollabs !== 1 ? 's' : ''}`);
            }
          }
        }
      } catch (analyticsError) {
        // Analytics sync failed, but video sync succeeded - don't fail the whole operation
        console.warn('[Sync] Analytics sync failed:', analyticsError.message);
      }

      // Success!
      const now = new Date();
      setLastSynced(prev => ({ ...prev, [connection.id]: now }));
      setSuccess(`Synced ${summaryParts.join(', ')} for ${connection.youtube_channel_title}!`);
      setSyncStatus(prev => ({
        ...prev,
        [connection.id]: { stage: 'complete', message: `Done! ${summaryParts.join(', ')}` }
      }));

      // Notify parent to refresh
      if (onClientsUpdate) {
        onClientsUpdate(connection.youtube_channel_title);
      }

      // Clear status after delay
      setTimeout(() => {
        setSyncStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[connection.id];
          return newStatus;
        });
      }, 3000);

    } catch (err) {
      console.error('Sync failed:', err);
      setError(`Sync failed: ${err.message}`);
      setSyncStatus(prev => {
        const newStatus = { ...prev };
        delete newStatus[connection.id];
        return newStatus;
      });
    } finally {
      setSyncing(null);
    }
  };

  // Setup YouTube Reporting job for impressions/CTR data
  const handleSetupReporting = async (connection) => {
    if (!supabase || settingUpReporting) return;

    setSettingUpReporting(connection.id);
    setReportingStatus(prev => ({ ...prev, [connection.id]: { stage: 'setup', message: 'Setting up reporting job...' } }));
    setError(null);

    try {
      const token = await youtubeOAuthService.getAuthToken();
      const response = await fetch('/api/youtube-reporting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ connectionId: connection.id, action: 'setup' })
      });

      const result = await response.json();

      if (result.success) {
        setReportingStatus(prev => ({
          ...prev,
          [connection.id]: { stage: 'complete', message: result.message, jobId: result.jobId }
        }));
        setSuccess(`Reporting job created for ${connection.youtube_channel_title}. First report available in ~24 hours.`);
        // Reload connections to get updated reporting_job_id
        await loadConnections();
      } else {
        const errorMsg = result.details || result.error || 'Failed to setup reporting';
        throw new Error(errorMsg);
      }
    } catch (err) {
      console.error('Reporting setup failed:', err);
      setError(`Reporting setup failed: ${err.message}`);
      setReportingStatus(prev => {
        const newStatus = { ...prev };
        delete newStatus[connection.id];
        return newStatus;
      });
    } finally {
      setSettingUpReporting(null);
    }
  };

  // Sync impressions/CTR from YouTube Reporting API
  const handleSyncImpressions = async (connection) => {
    if (!supabase || syncingImpressions) return;

    setSyncingImpressions(connection.id);
    setReportingStatus(prev => ({ ...prev, [connection.id]: { stage: 'syncing', message: 'Downloading impressions data...' } }));
    setError(null);

    try {
      const token = await youtubeOAuthService.getAuthToken();
      const response = await fetch('/api/youtube-reporting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ connectionId: connection.id, action: 'fetch' })
      });

      const result = await response.json();

      if (result.success) {
        if (result.updatedCount > 0) {
          setSuccess(`Updated impressions/CTR for ${result.updatedCount} videos from ${connection.youtube_channel_title}!`);
        } else if (result.reportsAvailable === 0) {
          setSuccess(result.message || 'No reports available yet. Check back in 24 hours.');
        } else {
          setSuccess(`Report downloaded. ${result.matchedCount} videos matched, ${result.updatedCount} updated.`);
        }
        setReportingStatus(prev => ({
          ...prev,
          [connection.id]: {
            stage: 'complete',
            message: `${result.updatedCount || 0} videos updated`,
            lastReport: result.reportDate
          }
        }));

        // Notify parent to refresh data
        if (onClientsUpdate) {
          onClientsUpdate(connection.youtube_channel_title);
        }
      } else {
        throw new Error(result.error || 'Failed to sync impressions');
      }

      // Clear status after delay
      setTimeout(() => {
        setReportingStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[connection.id];
          return newStatus;
        });
      }, 5000);
    } catch (err) {
      console.error('Impressions sync failed:', err);
      setError(`Impressions sync failed: ${err.message}`);
      setReportingStatus(prev => {
        const newStatus = { ...prev };
        delete newStatus[connection.id];
        return newStatus;
      });
    } finally {
      setSyncingImpressions(null);
    }
  };

  // Backfill all historical data from YouTube Reporting API
  const handleBackfillData = async (connection) => {
    if (!supabase || backfillingData) return;

    setBackfillingData(connection.id);
    setReportingStatus(prev => ({ ...prev, [connection.id]: { stage: 'backfilling', message: 'Downloading all historical reports...' } }));
    setError(null);

    try {
      const token = await youtubeOAuthService.getAuthToken();
      const response = await fetch('/api/youtube-reporting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ connectionId: connection.id, action: 'backfill' })
      });

      const result = await response.json();

      if (result.success) {
        if (result.snapshotsCreated > 0) {
          setSuccess(`Backfilled ${result.snapshotsCreated} data points from ${result.reportsProcessed} reports!`);
        } else if (result.reportsAvailable === 0) {
          setSuccess(result.message || 'No reports available yet. Check back in 24 hours.');
        } else {
          setSuccess(`Processed ${result.reportsProcessed} reports. ${result.snapshotsCreated} snapshots created.`);
        }
        setReportingStatus(prev => ({
          ...prev,
          [connection.id]: {
            stage: 'complete',
            message: `${result.snapshotsCreated} snapshots from ${result.reportsProcessed} reports`
          }
        }));

        if (onClientsUpdate) {
          onClientsUpdate(connection.youtube_channel_title);
        }
      } else {
        throw new Error(result.error || 'Failed to backfill data');
      }

      setTimeout(() => {
        setReportingStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[connection.id];
          return newStatus;
        });
      }, 5000);
    } catch (err) {
      console.error('Backfill failed:', err);
      setError(`Backfill failed: ${err.message}`);
      setReportingStatus(prev => {
        const newStatus = { ...prev };
        delete newStatus[connection.id];
        return newStatus;
      });
    } finally {
      setBackfillingData(null);
    }
  };

  // Helper to format last synced time
  const formatLastSynced = (date) => {
    if (!date) return null;
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Youtube size={22} style={{ color: "var(--yt-red)" }} />
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: "600", margin: 0 }}>YouTube OAuth</h3>
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: "4px 0 0" }}>
              Securely connect your YouTube account
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Shield size={14} style={{ color: "var(--pos)" }} />
          <span style={{ fontSize: "11px", color: "var(--pos)", fontWeight: "500" }}>Enterprise Security</span>
        </div>
      </div>

      {/* Success Message */}
      {success && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "12px 16px", background: "rgba(205, 242, 0, 0.1)",
          border: "1px solid rgba(205, 242, 0, 0.3)", borderRadius: "8px",
          marginBottom: "16px", color: "var(--pos)", fontSize: "13px"
        }}>
          <CheckCircle2 size={16} />
          <span style={{ flex: 1 }}>{success}</span>
          <button
            onClick={() => setSuccess(null)}
            style={{ background: "none", border: "none", color: "var(--pos)", cursor: "pointer", fontSize: "18px" }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "12px 16px", background: "rgba(255, 85, 64, 0.1)",
          border: "1px solid rgba(255, 85, 64, 0.3)", borderRadius: "8px",
          marginBottom: "16px", color: "var(--neg)", fontSize: "13px"
        }}>
          <AlertCircle size={16} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "none", border: "none", color: "var(--neg)", cursor: "pointer", fontSize: "18px" }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Connections List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
          <p style={{ marginTop: "12px" }}>Loading connections...</p>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : connections.length > 0 ? (
        <div style={{ marginBottom: "20px" }}>
          <h4 style={{ fontSize: "13px", fontWeight: "600", marginBottom: "12px", color: "var(--muted)" }}>
            Connected Accounts
          </h4>
          {connections.map(conn => (
            <div key={conn.id} style={{ ...connectionCardStyle, flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", width: "100%" }}>
                {/* Thumbnail */}
                <img
                  src={conn.youtube_channel_thumbnail || 'https://www.youtube.com/img/desktop/yt_1200.png'}
                  alt={conn.youtube_channel_title}
                  style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--outline-variant)", objectFit: "cover" }}
                />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: "600", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {conn.youtube_channel_title}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "6px" }}>
                    {conn.youtube_email}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px" }}>
                    {/* Connection status */}
                    {conn.connection_error ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--neg)" }}>
                        <AlertCircle size={12} />
                        <span>{conn.connection_error}</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--pos)" }}>
                          <CheckCircle2 size={12} />
                          <span>Connected</span>
                        </div>
                        <span style={{ color: "var(--faint)" }}>
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
                width: "100%", paddingTop: "12px", borderTop: "1px solid var(--border)"
              }}>
                {syncStatus[conn.id] ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--blue-pale)" }}>
                    {syncStatus[conn.id].stage === 'complete' ? (
                      <CheckCircle2 size={14} style={{ color: "var(--pos)" }} />
                    ) : (
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                    )}
                    {syncStatus[conn.id].message}
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "var(--faint)" }}>
                    Sync videos to see them in your dashboard timeline
                  </div>
                )}
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {/* Combined Sync button */}
                  <button
                    onClick={() => handleSync(conn)}
                    disabled={syncing === conn.id || conn.connection_error}
                    style={{
                      ...buttonStyle,
                      background: syncing === conn.id ? "var(--outline-variant)" : "var(--blue)",
                      border: "none",
                      color: "var(--ink)",
                      opacity: (syncing === conn.id || conn.connection_error) ? 0.6 : 1,
                      cursor: (syncing === conn.id || conn.connection_error) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {syncing === conn.id ? (
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    {syncing === conn.id ? (syncStatus[conn.id]?.message || "Syncing...") : "Sync"}
                  </button>
                  {/* Last synced indicator */}
                  {lastSynced[conn.id] && !syncing && (
                    <span style={{ fontSize: "11px", color: "var(--faint)" }}>
                      {formatLastSynced(lastSynced[conn.id])}
                    </span>
                  )}
                </div>
              </div>

              {/* Impressions/CTR Reporting Section */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", paddingTop: "12px", borderTop: "1px solid var(--border)"
              }}>
                {reportingStatus[conn.id] ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--blue-pale)" }}>
                    {reportingStatus[conn.id].stage === 'complete' ? (
                      <CheckCircle2 size={14} style={{ color: "var(--pos)" }} />
                    ) : (
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                    )}
                    {reportingStatus[conn.id].message}
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "var(--faint)" }}>
                    {conn.reporting_job_id ? (
                      conn.reporting_job_type?.includes('channel_reach_') ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <FileText size={12} style={{ color: "var(--pos)" }} />
                          Reporting job active - sync for impressions/CTR
                        </span>
                      ) : (
                        <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--warn)" }}>
                          <FileText size={12} style={{ color: "var(--warn)" }} />
                          Wrong report type ({conn.reporting_job_type}) — click "Fix Now" below
                        </span>
                      )
                    ) : (
                      "Setup reporting to get impressions & CTR data"
                    )}
                  </div>
                )}
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {/* Setup Reporting or Sync Impressions based on job status */}
                  {!conn.reporting_job_id ? (
                    <button
                      onClick={() => handleSetupReporting(conn)}
                      disabled={settingUpReporting === conn.id || conn.connection_error}
                      style={{
                        ...buttonStyle,
                        background: settingUpReporting === conn.id ? "var(--outline-variant)" : "rgba(0, 209, 255, 0.2)",
                        border: "1px solid rgba(0, 209, 255, 0.4)",
                        color: "var(--accent-text)",
                        opacity: (settingUpReporting === conn.id || conn.connection_error) ? 0.6 : 1,
                        cursor: (settingUpReporting === conn.id || conn.connection_error) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {settingUpReporting === conn.id ? (
                        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <BarChart3 size={14} />
                      )}
                      {settingUpReporting === conn.id ? "Setting up..." : "Setup Reporting"}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleSyncImpressions(conn)}
                        disabled={syncingImpressions === conn.id || backfillingData === conn.id || conn.connection_error}
                        style={{
                          ...buttonStyle,
                          background: syncingImpressions === conn.id ? "var(--outline-variant)" : "rgba(0, 209, 255, 0.2)",
                          border: "1px solid rgba(0, 209, 255, 0.4)",
                          color: "var(--accent-text)",
                          opacity: (syncingImpressions === conn.id || backfillingData === conn.id || conn.connection_error) ? 0.6 : 1,
                          cursor: (syncingImpressions === conn.id || backfillingData === conn.id || conn.connection_error) ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {syncingImpressions === conn.id ? (
                          <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                        ) : (
                          <BarChart3 size={14} />
                        )}
                        {syncingImpressions === conn.id ? "Syncing..." : "Sync Latest"}
                      </button>
                      <button
                        onClick={() => handleBackfillData(conn)}
                        disabled={backfillingData === conn.id || syncingImpressions === conn.id || conn.connection_error}
                        title="Download all available historical reports (up to 180 days)"
                        style={{
                          ...buttonStyle,
                          background: backfillingData === conn.id ? "var(--outline-variant)" : "rgba(205, 242, 0, 0.2)",
                          border: "1px solid rgba(205, 242, 0, 0.4)",
                          color: "var(--pos)",
                          opacity: (backfillingData === conn.id || syncingImpressions === conn.id || conn.connection_error) ? 0.6 : 1,
                          cursor: (backfillingData === conn.id || syncingImpressions === conn.id || conn.connection_error) ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {backfillingData === conn.id ? (
                          <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                        ) : (
                          <FileText size={14} />
                        )}
                        {backfillingData === conn.id ? "Backfilling..." : "Backfill All"}
                      </button>
                    </>
                  )}
                  {/* Reporting job indicator + re-setup option */}
                  {conn.reporting_job_id && (
                    <span style={{ fontSize: "11px", color: conn.reporting_job_type?.includes('channel_reach_') ? "var(--accent-text)" : "var(--warn)", display: "flex", alignItems: "center", gap: "4px" }}>
                      <FileText size={12} />
                      {conn.reporting_job_type?.includes('channel_reach_') ? (
                        "Reach Report Active"
                      ) : (
                        <>
                          Wrong type: {conn.reporting_job_type || "unknown"}
                          <button
                            onClick={() => handleSetupReporting(conn)}
                            disabled={settingUpReporting === conn.id}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--warn)",
                              cursor: settingUpReporting === conn.id ? "not-allowed" : "pointer",
                              textDecoration: "underline",
                              fontSize: "11px",
                              padding: 0,
                              marginLeft: "4px"
                            }}
                          >
                            {settingUpReporting === conn.id ? "Setting up..." : "Fix Now"}
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>

                          </div>
          ))}
        </div>
      ) : (
        <div style={{
          textAlign: "center", padding: "40px",
          background: "var(--input-bg)", borderRadius: "8px", marginBottom: "20px"
        }}>
          <Youtube size={48} style={{ color: "var(--faint)", marginBottom: "16px" }} />
          <p style={{ color: "var(--muted)", marginBottom: "8px", margin: "0 0 8px" }}>No YouTube accounts connected</p>
          <p style={{ color: "var(--faint)", fontSize: "13px", margin: 0 }}>
            Connect your YouTube account to access channel analytics
          </p>
        </div>
      )}

      {/* Network Management Section */}
      {!loading && connections.length >= 2 && !networkLoading && (
        <div style={{
          marginBottom: "20px",
          padding: "20px",
          background: "rgba(0, 209, 255, 0.06)",
          border: "1px solid rgba(0, 209, 255, 0.2)",
          borderRadius: "8px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Network size={18} style={{ color: "var(--accent-text)" }} />
              <h4 style={{ fontSize: "14px", fontWeight: "600", margin: 0, color: "var(--accent-text)" }}>
                Channel Network
              </h4>
            </div>
            {networkConfig && !showNetworkSetup && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleSyncAll}
                  disabled={syncingAll}
                  style={{
                    ...buttonStyle,
                    background: syncingAll ? "var(--outline-variant)" : "var(--blue)",
                    border: "none",
                    color: "var(--ink)",
                    opacity: syncingAll ? 0.7 : 1,
                    cursor: syncingAll ? "not-allowed" : "pointer",
                  }}
                >
                  {syncingAll ? (
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  {syncingAll
                    ? `Syncing ${syncAllProgress?.current || 0}/${syncAllProgress?.total || 0}`
                    : "Sync All Channels"
                  }
                </button>
                <button
                  onClick={() => setShowNetworkSetup(true)}
                  style={buttonStyle}
                >
                  Edit
                </button>
              </div>
            )}
          </div>

          {/* Sync All progress bar */}
          {syncingAll && syncAllProgress && (
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 14px", background: "rgba(0, 209, 255, 0.1)",
              border: "1px solid rgba(0, 209, 255, 0.2)", borderRadius: "8px",
              marginBottom: "16px", fontSize: "13px", color: "var(--blue-pale)"
            }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              Syncing {syncAllProgress.current}/{syncAllProgress.total} — {syncAllProgress.channelName}
            </div>
          )}

          {networkConfig && !showNetworkSetup ? (
            /* Network summary view */
            <div>
              <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "8px" }}>
                <strong>{networkConfig.networkName}</strong>
                <span style={{ color: "var(--muted)", marginLeft: "8px" }}>
                  {(networkConfig.memberYtIds?.size || 0) + 1} channels
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {connections
                  .filter(c => c.youtube_channel_id === networkConfig.parentYtId || networkConfig.memberYtIds?.has(c.youtube_channel_id))
                  .map(c => (
                    <span key={c.id} style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      padding: "4px 10px", background: "var(--outline-variant)", borderRadius: "14px",
                      fontSize: "12px", color: "var(--text)",
                    }}>
                      <img
                        src={c.youtube_channel_thumbnail || ''}
                        alt=""
                        style={{ width: "16px", height: "16px", borderRadius: "50%", background: "var(--outline-variant)" }}
                      />
                      {c.youtube_channel_title}
                      {c.youtube_channel_id === networkConfig.parentYtId && (
                        <span style={{ fontSize: "10px", color: "var(--accent-text)" }}>primary</span>
                      )}
                    </span>
                  ))
                }
              </div>
            </div>
          ) : (
            /* Network setup/edit form */
            <div>
              {!showNetworkSetup && !networkConfig && (
                <div style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 12px" }}>
                    Group your connected channels into a network to view aggregate metrics and switch between channels.
                  </p>
                  <button
                    onClick={() => {
                      setShowNetworkSetup(true);
                      // Pre-select all connections
                      setSelectedMembers(new Set(connections.map(c => c.youtube_channel_id)));
                      if (!primaryChannelYtId && connections.length > 0) {
                        setPrimaryChannelYtId(connections[0].youtube_channel_id);
                      }
                    }}
                    style={{
                      ...buttonStyle,
                      background: "rgba(0, 209, 255, 0.15)",
                      border: "1px solid rgba(0, 209, 255, 0.3)",
                      color: "var(--accent-text)",
                    }}
                  >
                    <Network size={14} />
                    Create Network
                  </button>
                </div>
              )}

              {showNetworkSetup && (
                <div>
                  {/* Network name input */}
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", fontWeight: "600", marginBottom: "6px" }}>
                      Network Name
                    </label>
                    <input
                      type="text"
                      value={networkName}
                      onChange={(e) => setNetworkName(e.target.value)}
                      placeholder="e.g., LDS Church Network"
                      style={{
                        width: "100%", padding: "10px 14px",
                        background: "var(--input-bg)", border: "1px solid #444",
                        borderRadius: "8px", color: "var(--text)", fontSize: "14px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  {/* Channel selection */}
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", fontWeight: "600", marginBottom: "8px" }}>
                      Channels ({selectedMembers.size} selected)
                    </label>
                    <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                      {connections.map(conn => (
                        <div key={conn.id} style={{
                          display: "flex", alignItems: "center", gap: "12px",
                          padding: "10px 12px", background: selectedMembers.has(conn.youtube_channel_id) ? "rgba(0, 209, 255, 0.1)" : "var(--card)",
                          border: selectedMembers.has(conn.youtube_channel_id) ? "1px solid rgba(0, 209, 255, 0.3)" : "1px solid var(--border)",
                          borderRadius: "24px", marginBottom: "6px", cursor: "pointer",
                        }} onClick={() => toggleMember(conn.youtube_channel_id)}>
                          <input
                            type="checkbox"
                            checked={selectedMembers.has(conn.youtube_channel_id)}
                            readOnly
                            style={{ accentColor: "var(--accent-text)", pointerEvents: "none" }}
                          />
                          <img
                            src={conn.youtube_channel_thumbnail || ''}
                            alt=""
                            style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--outline-variant)" }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {conn.youtube_channel_title}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--faint)" }}>{conn.youtube_email}</div>
                          </div>
                          {selectedMembers.has(conn.youtube_channel_id) && (
                            <label style={{
                              display: "flex", alignItems: "center", gap: "4px",
                              fontSize: "11px", color: primaryChannelYtId === conn.youtube_channel_id ? "var(--accent-text)" : "var(--faint)",
                              cursor: "pointer", whiteSpace: "nowrap",
                            }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="radio"
                                name="primaryChannel"
                                checked={primaryChannelYtId === conn.youtube_channel_id}
                                onChange={() => setPrimaryChannelYtId(conn.youtube_channel_id)}
                                style={{ accentColor: "var(--accent-text)" }}
                              />
                              Primary
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={handleSaveNetwork}
                      disabled={savingNetwork}
                      style={{
                        ...buttonStyle,
                        background: savingNetwork ? "var(--outline-variant)" : "var(--blue)",
                        border: "none",
                        color: "var(--ink)",
                        opacity: savingNetwork ? 0.7 : 1,
                        cursor: savingNetwork ? "not-allowed" : "pointer",
                      }}
                    >
                      {savingNetwork ? (
                        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      {savingNetwork ? "Saving..." : (networkConfig ? "Update Network" : "Create Network")}
                    </button>
                    <button
                      onClick={() => {
                        setShowNetworkSetup(false);
                        // Reset to existing config if canceling
                        if (networkConfig) {
                          setNetworkName(networkConfig.networkName);
                          setSelectedMembers(new Set([networkConfig.parentYtId, ...(networkConfig.memberYtIds || [])]));
                          setPrimaryChannelYtId(networkConfig.parentYtId);
                        }
                      }}
                      style={buttonStyle}
                    >
                      Cancel
                    </button>
                    {networkConfig && (
                      <button
                        onClick={handleDissolveNetwork}
                        disabled={savingNetwork}
                        style={dangerButtonStyle}
                      >
                        <Trash2 size={14} />
                        Dissolve
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Connect Button */}
      <button
        onClick={handleConnect}
        disabled={connecting}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
          width: "100%", padding: "14px 20px",
          background: connecting ? "var(--outline-variant)" : "var(--yt-red)",
          border: "none", borderRadius: "8px",
          color: "var(--ink)", fontWeight: "600", fontSize: "14px",
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
        background: "rgba(0, 209, 255, 0.08)",
        border: "1px solid rgba(0, 209, 255, 0.2)",
        borderRadius: "8px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <Shield size={16} style={{ color: "var(--accent-text)" }} />
          <span style={{ fontWeight: "600", color: "var(--accent-text)", fontSize: "13px" }}>
            Enterprise-Grade Security
          </span>
        </div>
        <ul style={{ margin: 0, paddingLeft: "18px", color: "var(--blue-pale)", fontSize: "12px", lineHeight: "1.9" }}>
          <li>Tokens encrypted with AES-256-GCM before storage</li>
          <li>PKCE flow prevents authorization code interception</li>
          <li>Server-side token exchange (secrets never in browser)</li>
          <li>Read-only access scopes (youtube.readonly + yt-analytics-monetary.readonly)</li>
          <li>Comprehensive audit logging for compliance</li>
        </ul>
        {onNavigateToSecurity && (
          <button
            onClick={onNavigateToSecurity}
            style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              marginTop: "12px", padding: "8px 14px",
              background: "rgba(0, 209, 255, 0.15)",
              border: "1px solid rgba(0, 209, 255, 0.3)",
              borderRadius: "6px", color: "var(--accent-text)", fontSize: "12px",
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
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "24px",
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
                  background: "var(--outline-variant)", display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <Youtube size={32} style={{ color: "var(--yt-red)" }} />
                </div>
              )}
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 4px", color: "var(--ink)" }}>
                  Add as Client?
                </h3>
                <p style={{ fontSize: "14px", color: "var(--muted)", margin: 0 }}>
                  {pendingClientInfo.channelName}
                </p>
              </div>
            </div>

            <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "24px", lineHeight: "1.6" }}>
              Would you like to add <strong style={{ color: "var(--ink)" }}>{pendingClientInfo.channelName}</strong> as
              a client in your dashboard? We'll fetch recent videos automatically.
            </p>

            {/* Sync Progress */}
            {syncProgress && (
              <div style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "12px 16px", background: "rgba(0, 209, 255, 0.1)",
                border: "1px solid rgba(0, 209, 255, 0.2)", borderRadius: "8px",
                marginBottom: "16px", fontSize: "13px", color: "var(--blue-pale)"
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
                  background: addingClient ? "var(--blue-deep)" : "var(--blue)",
                  border: "none", borderRadius: "8px",
                  color: "var(--ink)", fontWeight: "600", fontSize: "14px",
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
                  background: "var(--outline-variant)",
                  border: "none", borderRadius: "8px",
                  color: "var(--text)", fontWeight: "600", fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                Skip
              </button>
            </div>

            <p style={{ fontSize: "12px", color: "var(--faint)", marginTop: "16px", textAlign: "center" }}>
              Videos will be fetched from YouTube. You can also upload CSV data for additional metrics.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
