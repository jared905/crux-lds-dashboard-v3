import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Loader, X, Trash2, Plus, Check } from 'lucide-react';
import BenchmarkSummaryBar from './BenchmarkSummaryBar';
import CompetitorGroupSelector from './CompetitorGroupSelector';

const BreakoutsTab = lazy(() => import('./BreakoutsTab'));
const AudienceIntelTab = lazy(() => import('./AudienceIntelTab'));
const ThumbnailAnalysisTab = lazy(() => import('./ThumbnailAnalysisTab'));
const TitleLabTab = lazy(() => import('./TitleLabTab'));
const SeriesIdeasTab = lazy(() => import('./SeriesIdeasTab'));

const TABS = [
  { key: 'outliers', label: 'Breakouts', icon: '🔥' },
  { key: 'audience', label: 'Audience Intel', icon: '👥' },
  { key: 'thumbnails', label: 'Thumbnails', icon: '🖼️' },
  { key: 'titles', label: 'Title Lab', icon: '✍️' },
  { key: 'series', label: 'Series Ideas', icon: '🎬' },
];

const GROUP_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

function LoadingFallback() {
  return (
    <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>
      <Loader size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
      <div style={{ fontSize: '12px' }}>Loading...</div>
    </div>
  );
}

export default function IntelligencePanel({
  activeCompetitors, rows, activeClient, yourStats, benchmarks,
  categoryConfig,
  outliers, outliersLoading, outlierDays, setOutlierDays,
  outlierMinMultiplier, setOutlierMinMultiplier,
  fetchOutliers, handleViewInsight,
}) {
  const [activeTab, setActiveTab] = useState('outliers');
  const [collapsed, setCollapsed] = useState(false);
  const [titleLabTopic, setTitleLabTopic] = useState('');

  // --- Competitor Groups ---
  const [groups, setGroups] = useState([]);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [tabGroupSelections, setTabGroupSelections] = useState(() => {
    try {
      const saved = localStorage.getItem(`intel_tab_groups_${activeClient?.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Load groups from Supabase
  useEffect(() => {
    if (!activeClient?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { getCompetitorGroups } = await import('../../../services/competitorDatabase');
        const data = await getCompetitorGroups(activeClient.id);
        if (!cancelled) setGroups(data);
      } catch (e) {
        console.warn('[groups] Load failed:', e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [activeClient?.id]);

  // Persist tab-group selections
  useEffect(() => {
    if (activeClient?.id) {
      localStorage.setItem(`intel_tab_groups_${activeClient.id}`, JSON.stringify(tabGroupSelections));
    }
  }, [tabGroupSelections, activeClient?.id]);

  // Reset selections when client changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`intel_tab_groups_${activeClient?.id}`);
      setTabGroupSelections(saved ? JSON.parse(saved) : {});
    } catch { setTabGroupSelections({}); }
  }, [activeClient?.id]);

  // Derive filtered channel IDs for a tab
  const getChannelIdsForTab = useCallback((tabKey) => {
    const allIds = activeCompetitors.map(c => c.supabaseId).filter(Boolean);
    const groupId = tabGroupSelections[tabKey];
    if (!groupId) return allIds;
    const group = groups.find(g => g.id === groupId);
    if (!group) return allIds;
    const activeSet = new Set(allIds);
    return group.channelIds.filter(id => activeSet.has(id));
  }, [tabGroupSelections, groups, activeCompetitors]);

  // Derive filtered competitor objects for a tab (BreakoutsTab needs full objects)
  const getCompetitorsForTab = useCallback((tabKey) => {
    const groupId = tabGroupSelections[tabKey];
    if (!groupId) return activeCompetitors;
    const group = groups.find(g => g.id === groupId);
    if (!group) return activeCompetitors;
    const memberSet = new Set(group.channelIds);
    return activeCompetitors.filter(c => c.supabaseId && memberSet.has(c.supabaseId));
  }, [tabGroupSelections, groups, activeCompetitors]);

  const handleNavigateToTitleLab = (topic) => {
    setTitleLabTopic(topic || '');
    setActiveTab('titles');
  };

  const handleGroupsChange = (updatedGroups) => {
    setGroups(updatedGroups);
  };

  return (
    <div style={{
      background: '#1E1E1E', border: '1px solid #333', borderRadius: '12px',
      overflow: 'hidden', marginBottom: '16px',
    }}>
      {/* Panel header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '16px 20px', cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={16} color="#3b82f6" />
          Competitive Intelligence
        </div>
        {collapsed ? <ChevronDown size={16} color="#888" /> : <ChevronUp size={16} color="#888" />}
      </button>

      {!collapsed && (
        <div style={{ padding: '0 20px 20px' }}>
          <BenchmarkSummaryBar yourStats={yourStats} benchmarks={benchmarks} />

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #333', marginBottom: '12px', overflowX: 'auto' }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 14px', background: 'transparent', border: 'none',
                  borderBottom: activeTab === tab.key ? '2px solid #3b82f6' : '2px solid transparent',
                  color: activeTab === tab.key ? '#fff' : '#888',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: '12px' }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Group selector */}
          <CompetitorGroupSelector
            groups={groups}
            selectedGroupId={tabGroupSelections[activeTab] || null}
            onGroupChange={(gid) => setTabGroupSelections(prev => ({ ...prev, [activeTab]: gid }))}
            onManageGroups={() => setShowGroupManager(true)}
            competitorCount={activeCompetitors.length}
          />

          {/* Tab content */}
          <Suspense fallback={<LoadingFallback />}>
            {activeTab === 'outliers' && (
              <BreakoutsTab
                outliers={outliers}
                outliersLoading={outliersLoading}
                outlierDays={outlierDays}
                setOutlierDays={setOutlierDays}
                outlierMinMultiplier={outlierMinMultiplier}
                setOutlierMinMultiplier={setOutlierMinMultiplier}
                fetchOutliers={fetchOutliers}
                activeCompetitors={getCompetitorsForTab('outliers')}
                categoryConfig={categoryConfig}
                handleViewInsight={handleViewInsight}
                onNavigateToTitleLab={handleNavigateToTitleLab}
              />
            )}
            {activeTab === 'audience' && (
              <AudienceIntelTab
                channelIds={getChannelIdsForTab('audience')}
                clientId={activeClient?.id}
                activeCompetitors={getCompetitorsForTab('audience')}
                onNavigateToTitleLab={handleNavigateToTitleLab}
              />
            )}
            {activeTab === 'thumbnails' && (
              <ThumbnailAnalysisTab
                channelIds={getChannelIdsForTab('thumbnails')}
                clientId={activeClient?.id}
                rows={rows}
              />
            )}
            {activeTab === 'titles' && (
              <TitleLabTab
                channelIds={getChannelIdsForTab('titles')}
                clientId={activeClient?.id}
                rows={rows}
                initialTopic={titleLabTopic}
              />
            )}
            {activeTab === 'series' && (
              <SeriesIdeasTab
                channelIds={getChannelIdsForTab('series')}
                clientId={activeClient?.id}
                rows={rows}
              />
            )}
          </Suspense>
        </div>
      )}

      {/* Group Manager Modal */}
      {showGroupManager && (
        <CompetitorGroupManager
          clientId={activeClient?.id}
          groups={groups}
          activeCompetitors={activeCompetitors}
          onGroupsChange={handleGroupsChange}
          onClose={() => setShowGroupManager(false)}
        />
      )}
    </div>
  );
}

// ============================================
// Group Manager Modal (inline, follows BulkAssignModal pattern)
// ============================================
function CompetitorGroupManager({ clientId, groups, activeCompetitors, onGroupsChange, onClose }) {
  const [editingGroup, setEditingGroup] = useState(null); // group object being edited
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [selectedMembers, setSelectedMembers] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  // When editing a group, populate its current members
  useEffect(() => {
    if (editingGroup) {
      setSelectedMembers(new Set(editingGroup.channelIds || []));
    }
  }, [editingGroup]);

  const handleCreate = async () => {
    if (!newName.trim() || !clientId) return;
    setCreating(true);
    try {
      const { createCompetitorGroup } = await import('../../../services/competitorDatabase');
      const created = await createCompetitorGroup({ clientId, name: newName.trim(), color: newColor });
      onGroupsChange([...groups, created]);
      setNewName('');
      setNewColor('#3b82f6');
    } catch (e) {
      alert('Failed to create group: ' + e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (groupId) => {
    if (!confirm('Delete this group? Competitors will not be removed.')) return;
    try {
      const { deleteCompetitorGroup } = await import('../../../services/competitorDatabase');
      await deleteCompetitorGroup(groupId);
      onGroupsChange(groups.filter(g => g.id !== groupId));
      if (editingGroup?.id === groupId) setEditingGroup(null);
    } catch (e) {
      alert('Failed to delete: ' + e.message);
    }
  };

  const handleSaveMembers = async () => {
    if (!editingGroup) return;
    setSaving(true);
    try {
      const { setCompetitorGroupMembers } = await import('../../../services/competitorDatabase');
      const ids = Array.from(selectedMembers);
      await setCompetitorGroupMembers(editingGroup.id, ids);
      onGroupsChange(groups.map(g =>
        g.id === editingGroup.id ? { ...g, channelIds: ids } : g
      ));
      setEditingGroup(null);
    } catch (e) {
      alert('Failed to save members: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleMember = (channelId) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#1E1E1E', border: '1px solid #333', borderRadius: '12px',
        width: '540px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #333',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>
            {editingGroup ? `Edit: ${editingGroup.name}` : 'Manage Competitor Groups'}
          </div>
          <button onClick={editingGroup ? () => setEditingGroup(null) : onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px',
          }}>
            <X size={16} color="#888" />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {!editingGroup ? (
            <>
              {/* Existing groups */}
              {groups.length === 0 && (
                <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                  No groups yet. Create one below.
                </div>
              )}
              {groups.map(g => (
                <div key={g.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', borderRadius: '8px', marginBottom: '6px',
                  background: '#252525', border: '1px solid #333',
                }}>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: g.color || '#3b82f6', flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>{g.name}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>
                      {g.channelIds.length} channel{g.channelIds.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button onClick={() => setEditingGroup(g)} style={{
                    background: '#333', border: 'none', borderRadius: '6px',
                    padding: '4px 10px', color: '#ccc', fontSize: '11px',
                    cursor: 'pointer', fontWeight: '600',
                  }}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(g.id)} style={{
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px',
                  }}>
                    <Trash2 size={13} color="#666" />
                  </button>
                </div>
              ))}

              {/* Create new group */}
              <div style={{
                marginTop: '16px', padding: '12px',
                background: '#252525', borderRadius: '8px', border: '1px solid #333',
              }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#aaa', marginBottom: '8px' }}>
                  New Group
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                    placeholder="Group name..."
                    style={{
                      flex: 1, background: '#1a1a1a', border: '1px solid #444',
                      borderRadius: '6px', padding: '6px 10px', color: '#fff',
                      fontSize: '13px', outline: 'none',
                    }}
                  />
                  {/* Color swatches */}
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {GROUP_COLORS.map(c => (
                      <button key={c} onClick={() => setNewColor(c)} style={{
                        width: '16px', height: '16px', borderRadius: '50%', background: c,
                        border: newColor === c ? '2px solid #fff' : '2px solid transparent',
                        cursor: 'pointer', padding: 0,
                      }} />
                    ))}
                  </div>
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || creating}
                    style={{
                      background: '#3b82f6', border: 'none', borderRadius: '6px',
                      padding: '6px 12px', color: '#fff', fontSize: '12px',
                      fontWeight: '600', cursor: 'pointer',
                      opacity: (!newName.trim() || creating) ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}
                  >
                    <Plus size={12} /> Create
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Editing members */
            <>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
                Select which competitors belong to "{editingGroup.name}":
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {activeCompetitors.map(comp => {
                  const id = comp.supabaseId;
                  if (!id) return null;
                  const isSelected = selectedMembers.has(id);
                  return (
                    <button
                      key={id}
                      onClick={() => toggleMember(id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 12px', borderRadius: '6px',
                        background: isSelected ? '#1e3a5f' : '#252525',
                        border: isSelected ? '1px solid #3b82f6' : '1px solid #333',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '4px',
                        border: isSelected ? 'none' : '1px solid #555',
                        background: isSelected ? '#3b82f6' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {isSelected && <Check size={12} color="#fff" />}
                      </div>
                      {comp.thumbnail && (
                        <img src={comp.thumbnail} alt="" style={{
                          width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                        }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '500' }}>
                          {comp.name}
                        </div>
                        {comp.subscriberCount && (
                          <div style={{ fontSize: '11px', color: '#888' }}>
                            {Number(comp.subscriberCount).toLocaleString()} subs
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {editingGroup && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid #333',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '12px', color: '#888' }}>
              {selectedMembers.size} selected
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setEditingGroup(null)} style={{
                background: '#333', border: 'none', borderRadius: '6px',
                padding: '6px 14px', color: '#ccc', fontSize: '12px',
                fontWeight: '600', cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button onClick={handleSaveMembers} disabled={saving} style={{
                background: '#3b82f6', border: 'none', borderRadius: '6px',
                padding: '6px 14px', color: '#fff', fontSize: '12px',
                fontWeight: '600', cursor: 'pointer',
                opacity: saving ? 0.5 : 1,
              }}>
                {saving ? 'Saving...' : 'Save Members'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
