/**
 * ChannelClientAssignment - Assign channels to clients
 * Full View Analytics - Crux Media
 *
 * Allows reassigning channels to different clients or marking as master-only.
 * Can be used inline in channel detail drawer or as a modal for bulk assignment.
 */

import React, { useState } from 'react';
import {
  Users,
  Check,
  X,
  Loader2,
  Building,
  Globe,
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

const styles = {
  container: {
    backgroundColor: '#252525',
    borderRadius: '8px',
    padding: '16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  title: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#E0E0E0',
  },
  description: {
    fontSize: '11px',
    color: '#9E9E9E',
    marginBottom: '12px',
  },
  optionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  optionSelected: {
    borderColor: '#2962FF',
    backgroundColor: 'rgba(41, 98, 255, 0.1)',
  },
  optionHover: {
    borderColor: '#444',
    backgroundColor: '#2a2a2a',
  },
  optionIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    backgroundColor: '#333',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconSelected: {
    backgroundColor: 'rgba(41, 98, 255, 0.2)',
  },
  optionContent: {
    flex: 1,
  },
  optionName: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#E0E0E0',
  },
  optionDescription: {
    fontSize: '11px',
    color: '#9E9E9E',
    marginTop: '2px',
  },
  checkIcon: {
    color: '#2962FF',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #333',
  },
  button: {
    flex: 1,
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.15s',
  },
  buttonPrimary: {
    backgroundColor: '#2962FF',
    border: 'none',
    color: '#fff',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    border: '1px solid #444',
    color: '#9E9E9E',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  spinner: {
    animation: 'spin 1s linear infinite',
  },
  bulkHeader: {
    padding: '12px 16px',
    backgroundColor: '#1a1a1a',
    borderBottom: '1px solid #333',
    borderRadius: '8px 8px 0 0',
  },
  bulkTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#E0E0E0',
  },
  bulkCount: {
    fontSize: '12px',
    color: '#9E9E9E',
    marginTop: '4px',
  },
};

/**
 * Single channel assignment component
 */
export function ChannelClientAssignment({
  channel,
  clients = [],
  onUpdate,
  onCancel,
}) {
  const [selectedClientId, setSelectedClientId] = useState(channel?.client_id || null);
  const [saving, setSaving] = useState(false);

  const hasChanged = selectedClientId !== (channel?.client_id || null);

  const handleSave = async () => {
    if (!channel?.id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('channels')
        .update({ client_id: selectedClientId })
        .eq('id', channel.id);

      if (error) throw error;

      if (onUpdate) {
        onUpdate({ ...channel, client_id: selectedClientId });
      }
    } catch (err) {
      console.error('Failed to update channel client:', err);
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Users size={16} color="#9E9E9E" />
        <span style={styles.title}>Client Assignment</span>
      </div>

      <p style={styles.description}>
        Assign this channel to a specific client or keep it in the master database.
      </p>

      <div style={styles.optionList}>
        {/* Master Only Option */}
        <div
          style={{
            ...styles.option,
            ...(selectedClientId === null ? styles.optionSelected : {}),
          }}
          onClick={() => setSelectedClientId(null)}
        >
          <div
            style={{
              ...styles.optionIcon,
              ...(selectedClientId === null ? styles.optionIconSelected : {}),
            }}
          >
            <Globe size={16} color={selectedClientId === null ? '#2962FF' : '#666'} />
          </div>
          <div style={styles.optionContent}>
            <div style={styles.optionName}>Master Database</div>
            <div style={styles.optionDescription}>
              Available to all clients
            </div>
          </div>
          {selectedClientId === null && (
            <Check size={18} style={styles.checkIcon} />
          )}
        </div>

        {/* Client Options */}
        {clients.map((client) => (
          <div
            key={client.id}
            style={{
              ...styles.option,
              ...(selectedClientId === client.id ? styles.optionSelected : {}),
            }}
            onClick={() => setSelectedClientId(client.id)}
          >
            <div
              style={{
                ...styles.optionIcon,
                ...(selectedClientId === client.id ? styles.optionIconSelected : {}),
              }}
            >
              <Building
                size={16}
                color={selectedClientId === client.id ? '#2962FF' : '#666'}
              />
            </div>
            <div style={styles.optionContent}>
              <div style={styles.optionName}>{client.name}</div>
              {client.organization && (
                <div style={styles.optionDescription}>{client.organization}</div>
              )}
            </div>
            {selectedClientId === client.id && (
              <Check size={18} style={styles.checkIcon} />
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        {onCancel && (
          <button
            style={{ ...styles.button, ...styles.buttonSecondary }}
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        )}
        <button
          style={{
            ...styles.button,
            ...styles.buttonPrimary,
            ...(!hasChanged || saving ? styles.buttonDisabled : {}),
          }}
          onClick={handleSave}
          disabled={!hasChanged || saving}
        >
          {saving ? (
            <>
              <Loader2 size={14} style={styles.spinner} />
              Saving...
            </>
          ) : (
            <>
              <Check size={14} />
              Save
            </>
          )}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/**
 * Bulk channel assignment component
 */
export function BulkChannelClientAssignment({
  channels = [],
  clients = [],
  onUpdate,
  onCancel,
}) {
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (channels.length === 0) return;

    setSaving(true);
    try {
      const channelIds = channels.map((c) => c.id);
      const { error } = await supabase
        .from('channels')
        .update({ client_id: selectedClientId })
        .in('id', channelIds);

      if (error) throw error;

      if (onUpdate) {
        onUpdate(
          channels.map((c) => ({ ...c, client_id: selectedClientId }))
        );
      }
    } catch (err) {
      console.error('Failed to update channels:', err);
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={styles.bulkHeader}>
        <div style={styles.bulkTitle}>Assign {channels.length} Channels</div>
        <div style={styles.bulkCount}>
          Select a client to assign all selected channels
        </div>
      </div>

      <div style={{ ...styles.container, borderRadius: '0 0 8px 8px' }}>
        <div style={styles.optionList}>
          {/* Master Only Option */}
          <div
            style={{
              ...styles.option,
              ...(selectedClientId === null ? styles.optionSelected : {}),
            }}
            onClick={() => setSelectedClientId(null)}
          >
            <div
              style={{
                ...styles.optionIcon,
                ...(selectedClientId === null ? styles.optionIconSelected : {}),
              }}
            >
              <Globe size={16} color={selectedClientId === null ? '#2962FF' : '#666'} />
            </div>
            <div style={styles.optionContent}>
              <div style={styles.optionName}>Master Database</div>
              <div style={styles.optionDescription}>Available to all clients</div>
            </div>
            {selectedClientId === null && (
              <Check size={18} style={styles.checkIcon} />
            )}
          </div>

          {/* Client Options */}
          {clients.map((client) => (
            <div
              key={client.id}
              style={{
                ...styles.option,
                ...(selectedClientId === client.id ? styles.optionSelected : {}),
              }}
              onClick={() => setSelectedClientId(client.id)}
            >
              <div
                style={{
                  ...styles.optionIcon,
                  ...(selectedClientId === client.id ? styles.optionIconSelected : {}),
                }}
              >
                <Building
                  size={16}
                  color={selectedClientId === client.id ? '#2962FF' : '#666'}
                />
              </div>
              <div style={styles.optionContent}>
                <div style={styles.optionName}>{client.name}</div>
              </div>
              {selectedClientId === client.id && (
                <Check size={18} style={styles.checkIcon} />
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          {onCancel && (
            <button
              style={{ ...styles.button, ...styles.buttonSecondary }}
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
          )}
          <button
            style={{
              ...styles.button,
              ...styles.buttonPrimary,
              ...(saving ? styles.buttonDisabled : {}),
            }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 size={14} style={styles.spinner} />
                Saving...
              </>
            ) : (
              <>
                <Check size={14} />
                Assign {channels.length} Channels
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default ChannelClientAssignment;
