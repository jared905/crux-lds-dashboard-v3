/**
 * ChannelCategoryManager - Assign categories to channels
 * Full View Analytics - Crux Media
 *
 * Panel that shows all channels from Supabase and allows
 * bulk category assignment
 */

import { useState, useEffect } from 'react';
import {
  Users,
  Tag,
  Search,
  Check,
  X,
  Loader2,
  Save,
  ChevronDown,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import {
  getAllCategories,
  getChannelCategories,
  setChannelCategories
} from '../services/categoryService';

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
  subtitle: {
    fontSize: '12px',
    color: '#9E9E9E',
    marginTop: '4px',
  },
  searchContainer: {
    position: 'relative',
    marginBottom: '16px',
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 36px',
    backgroundColor: '#252525',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#E0E0E0',
    fontSize: '13px',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#666',
  },
  channelList: {
    maxHeight: '400px',
    overflowY: 'auto',
  },
  channelRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#252525',
    borderRadius: '8px',
    marginBottom: '8px',
    gap: '12px',
  },
  channelThumbnail: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  channelInfo: {
    flex: 1,
    minWidth: 0,
  },
  channelName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#E0E0E0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  channelStats: {
    fontSize: '11px',
    color: '#9E9E9E',
  },
  categoryTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    maxWidth: '300px',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  tagSelected: {
    backgroundColor: '#2962FF20',
    color: '#2962FF',
  },
  tagUnselected: {
    backgroundColor: '#333',
    color: '#666',
  },
  editButton: {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#9E9E9E',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  saveButton: {
    padding: '6px 12px',
    backgroundColor: '#2962FF',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  cancelButton: {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#9E9E9E',
    fontSize: '12px',
    cursor: 'pointer',
  },
  categorySelector: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    padding: '12px',
    backgroundColor: '#1E1E1E',
    borderRadius: '8px',
    marginTop: '8px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#9E9E9E',
  },
  empty: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  emptyIcon: {
    marginBottom: '12px',
    opacity: 0.5,
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

export default function ChannelCategoryManager() {
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [channelCategories, setChannelCategoriesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingChannelId, setEditingChannelId] = useState(null);
  const [pendingCategories, setPendingCategories] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      // Load channels
      const { data: channelData, error: channelError } = await supabase
        .from('channels')
        .select('*')
        .order('name');

      if (channelError) throw channelError;
      setChannels(channelData || []);

      // Load categories
      const categoryData = await getAllCategories();
      setCategories(categoryData || []);

      // Load channel-category mappings
      const { data: mappings, error: mappingError } = await supabase
        .from('channel_categories')
        .select('channel_id, category_id');

      if (mappingError) throw mappingError;

      // Build mapping object
      const map = {};
      (mappings || []).forEach(m => {
        if (!map[m.channel_id]) {
          map[m.channel_id] = [];
        }
        map[m.channel_id].push(m.category_id);
      });
      setChannelCategoriesMap(map);

    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (channelId) => {
    setEditingChannelId(channelId);
    setPendingCategories(channelCategories[channelId] || []);
  };

  const cancelEditing = () => {
    setEditingChannelId(null);
    setPendingCategories([]);
  };

  const toggleCategory = (categoryId) => {
    setPendingCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const saveCategories = async () => {
    if (!editingChannelId) return;

    setSaving(true);
    try {
      await setChannelCategories(editingChannelId, pendingCategories);

      // Update local state
      setChannelCategoriesMap(prev => ({
        ...prev,
        [editingChannelId]: pendingCategories,
      }));

      setEditingChannelId(null);
      setPendingCategories([]);
    } catch (err) {
      console.error('Failed to save categories:', err);
      alert('Failed to save categories: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredChannels = channels.filter(channel =>
    channel.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    channel.youtube_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCategoryById = (id) => categories.find(c => c.id === id);

  const formatNumber = (num) => {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  if (!supabase) {
    return (
      <div style={s.panel}>
        <div style={s.empty}>
          <AlertCircle size={48} style={s.emptyIcon} />
          <div>Supabase not configured</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={s.panel}>
        <style>{spinKeyframes}</style>
        <div style={s.loading}>
          <Loader2 size={24} style={s.spinner} />
          <p style={{ marginTop: '12px' }}>Loading channels...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.panel}>
      <style>{spinKeyframes}</style>

      <div style={s.header}>
        <div>
          <div style={s.title}>
            <Tag size={18} />
            Channel Categories
          </div>
          <div style={s.subtitle}>
            Assign categories to channels for organized analysis
          </div>
        </div>
      </div>

      {channels.length === 0 ? (
        <div style={s.empty}>
          <Users size={48} style={s.emptyIcon} />
          <div style={{ fontSize: '14px', marginBottom: '8px' }}>
            No channels in database
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Add competitor channels first, then assign categories here
          </div>
        </div>
      ) : (
        <>
          <div style={s.searchContainer}>
            <Search size={16} style={s.searchIcon} />
            <input
              type="text"
              placeholder="Search channels..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={s.searchInput}
            />
          </div>

          <div style={s.channelList}>
            {filteredChannels.map(channel => {
              const isEditing = editingChannelId === channel.id;
              const assignedCategories = channelCategories[channel.id] || [];

              return (
                <div key={channel.id}>
                  <div style={s.channelRow}>
                    {channel.thumbnail_url && (
                      <img
                        src={channel.thumbnail_url}
                        alt={channel.name}
                        style={s.channelThumbnail}
                      />
                    )}

                    <div style={s.channelInfo}>
                      <div style={s.channelName}>{channel.name}</div>
                      <div style={s.channelStats}>
                        {formatNumber(channel.subscriber_count)} subscribers
                        {channel.video_count && ` • ${formatNumber(channel.video_count)} videos`}
                      </div>
                    </div>

                    <div style={s.categoryTags}>
                      {assignedCategories.length === 0 ? (
                        <span style={{ ...s.tag, ...s.tagUnselected }}>
                          No categories
                        </span>
                      ) : (
                        assignedCategories.slice(0, 3).map(catId => {
                          const cat = getCategoryById(catId);
                          return cat ? (
                            <span
                              key={catId}
                              style={{
                                ...s.tag,
                                backgroundColor: `${cat.color}20`,
                                color: cat.color,
                              }}
                            >
                              {cat.name}
                            </span>
                          ) : null;
                        })
                      )}
                      {assignedCategories.length > 3 && (
                        <span style={{ ...s.tag, ...s.tagUnselected }}>
                          +{assignedCategories.length - 3}
                        </span>
                      )}
                    </div>

                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          style={s.saveButton}
                          onClick={saveCategories}
                          disabled={saving}
                        >
                          {saving ? (
                            <Loader2 size={14} style={s.spinner} />
                          ) : (
                            <Save size={14} />
                          )}
                          Save
                        </button>
                        <button
                          style={s.cancelButton}
                          onClick={cancelEditing}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        style={s.editButton}
                        onClick={() => startEditing(channel.id)}
                      >
                        <Tag size={14} />
                        Edit
                      </button>
                    )}
                  </div>

                  {isEditing && (
                    <div style={s.categorySelector}>
                      {categories.map(cat => {
                        const isSelected = pendingCategories.includes(cat.id);
                        return (
                          <span
                            key={cat.id}
                            style={{
                              ...s.tag,
                              backgroundColor: isSelected ? `${cat.color}30` : '#333',
                              color: isSelected ? cat.color : '#888',
                              border: isSelected ? `1px solid ${cat.color}50` : '1px solid transparent',
                              cursor: 'pointer',
                            }}
                            onClick={() => toggleCategory(cat.id)}
                          >
                            {isSelected && <Check size={12} style={{ marginRight: '4px' }} />}
                            {cat.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filteredChannels.length === 0 && searchTerm && (
            <div style={s.empty}>
              No channels match "{searchTerm}"
            </div>
          )}
        </>
      )}
    </div>
  );
}
