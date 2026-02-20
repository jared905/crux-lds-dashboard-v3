import React from 'react';
import { Users, Settings } from 'lucide-react';

export default function CompetitorGroupSelector({
  groups,
  selectedGroupId,
  onGroupChange,
  onManageGroups,
  competitorCount,
}) {
  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const activeCount = selectedGroup ? selectedGroup.channelIds.length : competitorCount;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      marginBottom: '12px', padding: '8px 12px',
      background: '#252525', borderRadius: '8px', border: '1px solid #333',
    }}>
      <Users size={13} color="#888" />
      <select
        value={selectedGroupId || ''}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '__manage__') {
            onManageGroups();
            // Reset select so it doesn't stick on "Manage..."
            e.target.value = selectedGroupId || '';
            return;
          }
          onGroupChange(val || null);
        }}
        style={{
          background: 'transparent', border: 'none', color: '#fff',
          fontSize: '12px', fontWeight: '600', cursor: 'pointer',
          outline: 'none', flex: 1, minWidth: 0,
        }}
      >
        <option value="" style={{ background: '#252525' }}>
          All Competitors ({competitorCount})
        </option>
        {groups.map(g => (
          <option key={g.id} value={g.id} style={{ background: '#252525' }}>
            {g.name} ({g.channelIds.length})
          </option>
        ))}
        <option disabled style={{ background: '#252525' }}>───────────</option>
        <option value="__manage__" style={{ background: '#252525' }}>
          Manage Groups...
        </option>
      </select>
      <span style={{ fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>
        {activeCount} channel{activeCount !== 1 ? 's' : ''}
      </span>
      <button
        onClick={onManageGroups}
        title="Manage Groups"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '2px', display: 'flex', alignItems: 'center',
        }}
      >
        <Settings size={13} color="#666" />
      </button>
    </div>
  );
}
