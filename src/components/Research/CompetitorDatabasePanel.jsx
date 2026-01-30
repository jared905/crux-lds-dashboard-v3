/**
 * CompetitorDatabasePanel - Database status and sync controls
 * Full View Analytics - Crux Media
 */

import { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  Users,
  Video,
  Loader2,
  CloudOff,
  Settings,
  Upload
} from 'lucide-react';
import { supabase, checkConnection } from '../../services/supabaseClient';
import { getChannels, getSyncLogs, migrateFromLocalStorage } from '../../services/competitorDatabase';
import { syncAllChannels } from '../../services/competitorSync';

const s = {
  panel: {
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#E0E0E0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '500',
  },
  connected: {
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
    color: '#00C853',
  },
  disconnected: {
    backgroundColor: 'rgba(207, 102, 121, 0.15)',
    color: '#CF6679',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
    marginBottom: '16px',
  },
  statCard: {
    backgroundColor: '#252525',
    borderRadius: '8px',
    padding: '12px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#E0E0E0',
  },
  statLabel: {
    fontSize: '11px',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginTop: '4px',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: '#2962FF',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    border: '1px solid #333',
    color: '#9E9E9E',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
  },
  syncLog: {
    backgroundColor: '#252525',
    borderRadius: '8px',
    padding: '12px',
  },
  syncLogTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#9E9E9E',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  syncLogItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #333',
    fontSize: '13px',
  },
  syncStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  progress: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#252525',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  progressText: {
    fontSize: '13px',
    color: '#E0E0E0',
  },
  setupMessage: {
    backgroundColor: '#252525',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'center',
  },
  setupIcon: {
    marginBottom: '12px',
  },
  setupTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#E0E0E0',
    marginBottom: '8px',
  },
  setupText: {
    fontSize: '13px',
    color: '#9E9E9E',
    marginBottom: '16px',
    lineHeight: '1.5',
  },
  spinner: {
    animation: 'spin 1s linear infinite',
  },
};

const spinKeyframes = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

export default function CompetitorDatabasePanel() {
  const [connectionStatus, setConnectionStatus] = useState({ connected: null, error: null });
  const [stats, setStats] = useState({ channels: 0, videos: 0, snapshots: 0 });
  const [syncLogs, setSyncLogs] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [migrating, setMigrating] = useState(false);

  // Check connection on mount
  useEffect(() => {
    checkDatabaseConnection();
  }, []);

  const checkDatabaseConnection = async () => {
    const status = await checkConnection();
    setConnectionStatus(status);

    if (status.connected) {
      loadStats();
      loadSyncLogs();
    }
  };

  const loadStats = async () => {
    try {
      const channels = await getChannels();

      // Get video count
      const { count: videoCount } = await supabase
        .from('videos')
        .select('*', { count: 'exact', head: true });

      // Get snapshot count
      const { count: snapshotCount } = await supabase
        .from('channel_snapshots')
        .select('*', { count: 'exact', head: true });

      setStats({
        channels: channels.length,
        videos: videoCount || 0,
        snapshots: snapshotCount || 0,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadSyncLogs = async () => {
    try {
      const logs = await getSyncLogs({ limit: 5 });
      setSyncLogs(logs);
    } catch (err) {
      console.error('Failed to load sync logs:', err);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress({ current: 0, total: stats.channels, channel: 'Starting...' });

    try {
      await syncAllChannels({
        onProgress: (progress) => setSyncProgress(progress),
      });

      await loadStats();
      await loadSyncLogs();
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      const result = await migrateFromLocalStorage();
      alert(`Migration complete! Migrated ${result.migrated} competitors.${
        result.errors.length ? `\n\nErrors:\n${result.errors.map(e => e.competitor + ': ' + e.error).join('\n')}` : ''
      }`);
      await loadStats();
    } catch (err) {
      alert('Migration failed: ' + err.message);
    } finally {
      setMigrating(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Not configured state
  if (!supabase) {
    return (
      <div style={s.panel}>
        <style>{spinKeyframes}</style>
        <div style={s.setupMessage}>
          <div style={s.setupIcon}>
            <CloudOff size={48} color="#666" />
          </div>
          <div style={s.setupTitle}>Database Not Configured</div>
          <div style={s.setupText}>
            Set up Supabase to enable persistent competitor tracking, historical snapshots,
            and cross-channel insights.
          </div>
          <a
            href="https://supabase.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...s.button, textDecoration: 'none' }}
          >
            <Settings size={16} />
            Set Up Supabase
          </a>
        </div>
      </div>
    );
  }

  // Checking connection state
  if (connectionStatus.connected === null) {
    return (
      <div style={s.panel}>
        <style>{spinKeyframes}</style>
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Loader2 size={24} color="#2962FF" style={s.spinner} />
          <p style={{ color: '#9E9E9E', marginTop: '12px' }}>Connecting to database...</p>
        </div>
      </div>
    );
  }

  // Connection error state
  if (!connectionStatus.connected) {
    return (
      <div style={s.panel}>
        <div style={s.header}>
          <div style={s.title}>
            <Database size={18} />
            Competitor Database
          </div>
          <span style={{ ...s.statusBadge, ...s.disconnected }}>
            <AlertCircle size={14} />
            Disconnected
          </span>
        </div>
        <div style={s.setupMessage}>
          <div style={s.setupTitle}>Connection Error</div>
          <div style={s.setupText}>{connectionStatus.error}</div>
          <button style={s.button} onClick={checkDatabaseConnection}>
            <RefreshCw size={16} />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Connected state
  return (
    <div style={s.panel}>
      <style>{spinKeyframes}</style>

      <div style={s.header}>
        <div style={s.title}>
          <Database size={18} />
          Competitor Database
        </div>
        <span style={{ ...s.statusBadge, ...s.connected }}>
          <CheckCircle size={14} />
          Connected
        </span>
      </div>

      {/* Stats */}
      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={s.statValue}>{stats.channels}</div>
          <div style={s.statLabel}>Channels</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue}>{stats.videos.toLocaleString()}</div>
          <div style={s.statLabel}>Videos</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue}>{stats.snapshots.toLocaleString()}</div>
          <div style={s.statLabel}>Snapshots</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue}>Daily</div>
          <div style={s.statLabel}>Auto-Sync</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={s.buttonRow}>
        <button
          style={s.button}
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? (
            <>
              <Loader2 size={16} style={s.spinner} />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw size={16} />
              Sync All Now
            </>
          )}
        </button>

        <button
          style={{ ...s.button, ...s.buttonSecondary }}
          onClick={handleMigrate}
          disabled={migrating}
        >
          {migrating ? (
            <>
              <Loader2 size={16} style={s.spinner} />
              Migrating...
            </>
          ) : (
            <>
              <Upload size={16} />
              Migrate from Local
            </>
          )}
        </button>
      </div>

      {/* Sync Progress */}
      {syncProgress && (
        <div style={s.progress}>
          <Loader2 size={20} color="#2962FF" style={s.spinner} />
          <div style={s.progressText}>
            Syncing {syncProgress.current} of {syncProgress.total}: <strong>{syncProgress.channel}</strong>
          </div>
        </div>
      )}

      {/* Recent Sync Logs */}
      {syncLogs.length > 0 && (
        <div style={s.syncLog}>
          <div style={s.syncLogTitle}>Recent Syncs</div>
          {syncLogs.map((log) => (
            <div key={log.id} style={s.syncLogItem}>
              <div style={s.syncStatus}>
                {log.status === 'completed' ? (
                  <CheckCircle size={14} color="#00C853" />
                ) : log.status === 'failed' ? (
                  <AlertCircle size={14} color="#CF6679" />
                ) : (
                  <Loader2 size={14} color="#2962FF" style={s.spinner} />
                )}
                <span style={{ color: '#E0E0E0' }}>
                  {log.sync_type === 'scheduled' ? 'Scheduled' : 'Manual'}
                </span>
              </div>
              <div style={{ color: '#9E9E9E', fontSize: '12px' }}>
                {log.channels_synced} channels, {log.videos_synced} videos
              </div>
              <div style={{ color: '#666', fontSize: '12px' }}>
                {formatDate(log.started_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
