/**
 * AnalysisSelector - Select channels/categories for analysis with presets
 * Full View Analytics - Crux Media
 *
 * Allows users to:
 * - Select categories or individual channels for analysis
 * - Save selections as presets for quick access
 * - Load and manage saved presets
 */

import { useState, useEffect } from 'react';
import {
  Filter,
  Save,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Loader2,
  Star,
  Trash2,
  Plus,
  Users,
  Tag,
  Settings,
  Play
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import {
  getCategoryTree,
  getChannelsInCategory,
  getPresets,
  createPreset,
  deletePreset,
  recordPresetUsage,
  getChannelsForPreset
} from '../services/categoryService';

const s = {
  container: {
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
  tabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '16px',
    backgroundColor: '#252525',
    padding: '4px',
    borderRadius: '8px',
  },
  tab: {
    flex: 1,
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: '#9E9E9E',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.15s',
  },
  tabActive: {
    backgroundColor: '#333',
    color: '#E0E0E0',
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  categoryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '250px',
    overflowY: 'auto',
  },
  categoryItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#252525',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  categoryItemSelected: {
    backgroundColor: '#2962FF20',
    border: '1px solid #2962FF40',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    border: '2px solid #555',
    marginRight: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#2962FF',
    borderColor: '#2962FF',
  },
  colorDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginRight: '8px',
  },
  categoryName: {
    flex: 1,
    fontSize: '13px',
    color: '#E0E0E0',
  },
  categoryCount: {
    fontSize: '11px',
    color: '#666',
  },
  presetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  presetCard: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#252525',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    gap: '12px',
  },
  presetCardHover: {
    backgroundColor: '#333',
  },
  presetInfo: {
    flex: 1,
  },
  presetName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#E0E0E0',
    marginBottom: '4px',
  },
  presetMeta: {
    fontSize: '11px',
    color: '#666',
  },
  presetActions: {
    display: 'flex',
    gap: '8px',
  },
  iconButton: {
    padding: '6px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: '#666',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDanger: {
    color: '#CF6679',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 16px',
    backgroundColor: '#2962FF',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    border: '1px solid #444',
    color: '#9E9E9E',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
  },
  selectedSummary: {
    padding: '12px',
    backgroundColor: '#252525',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  summaryText: {
    fontSize: '13px',
    color: '#E0E0E0',
  },
  summaryTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '8px',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '500',
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: '12px',
    padding: '24px',
    width: '400px',
    maxWidth: '90vw',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#E0E0E0',
    marginBottom: '16px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#252525',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#E0E0E0',
    fontSize: '14px',
    marginBottom: '12px',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#252525',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#E0E0E0',
    fontSize: '14px',
    marginBottom: '16px',
    minHeight: '80px',
    resize: 'vertical',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#9E9E9E',
  },
  empty: {
    textAlign: 'center',
    padding: '24px',
    color: '#666',
    fontSize: '13px',
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

export default function AnalysisSelector({ onSelectionChange }) {
  const [activeTab, setActiveTab] = useState('categories');
  const [categories, setCategories] = useState([]);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDescription, setNewPresetDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [hoveredPreset, setHoveredPreset] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Notify parent of selection changes
    if (onSelectionChange) {
      onSelectionChange({
        categoryIds: selectedCategoryIds,
        // Could add channelIds if we implement individual channel selection
      });
    }
  }, [selectedCategoryIds, onSelectionChange]);

  const loadData = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const [categoryTree, presetData] = await Promise.all([
        getCategoryTree(),
        getPresets()
      ]);

      setCategories(categoryTree || []);
      setPresets(presetData || []);

      // Expand root categories by default
      setExpandedCategories(new Set(categoryTree?.map(c => c.id) || []));
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (id) => {
    setSelectedCategoryIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const toggleExpand = (id, e) => {
    e.stopPropagation();
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const loadPreset = async (preset) => {
    // Set the selected categories from the preset
    setSelectedCategoryIds(preset.selected_category_ids || []);

    // Record usage
    try {
      await recordPresetUsage(preset.id);
    } catch (err) {
      console.error('Failed to record preset usage:', err);
    }

    // Switch to categories tab to show selection
    setActiveTab('categories');
  };

  const saveAsPreset = async () => {
    if (!newPresetName.trim()) return;

    setSaving(true);
    try {
      const newPreset = await createPreset({
        name: newPresetName.trim(),
        description: newPresetDescription.trim(),
        selectedCategoryIds: selectedCategoryIds,
        selectedChannelIds: [],
        excludedChannelIds: [],
        includeSubcategories: true,
        isShared: true,
      });

      setPresets(prev => [...prev, newPreset]);
      setShowSaveModal(false);
      setNewPresetName('');
      setNewPresetDescription('');
    } catch (err) {
      console.error('Failed to save preset:', err);
      alert('Failed to save preset: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePreset = async (presetId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this preset?')) return;

    try {
      await deletePreset(presetId);
      setPresets(prev => prev.filter(p => p.id !== presetId));
    } catch (err) {
      console.error('Failed to delete preset:', err);
      alert('Failed to delete preset: ' + err.message);
    }
  };

  const clearSelection = () => {
    setSelectedCategoryIds([]);
  };

  const getSelectedCategoriesFlat = () => {
    const flattenCategories = (cats) => {
      let result = [];
      for (const cat of cats) {
        result.push(cat);
        if (cat.children?.length > 0) {
          result = [...result, ...flattenCategories(cat.children)];
        }
      }
      return result;
    };

    const allCategories = flattenCategories(categories);
    return selectedCategoryIds
      .map(id => allCategories.find(c => c.id === id))
      .filter(Boolean);
  };

  const renderCategory = (category, depth = 0) => {
    const hasChildren = category.children?.length > 0;
    const isExpanded = expandedCategories.has(category.id);
    const isSelected = selectedCategoryIds.includes(category.id);

    return (
      <div key={category.id}>
        <div
          style={{
            ...s.categoryItem,
            paddingLeft: `${12 + depth * 20}px`,
            ...(isSelected ? s.categoryItemSelected : {}),
          }}
          onClick={() => toggleCategory(category.id)}
        >
          {hasChildren ? (
            <div
              style={{ marginRight: '8px', color: '#666', cursor: 'pointer' }}
              onClick={(e) => toggleExpand(category.id, e)}
            >
              {isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </div>
          ) : (
            <div style={{ width: '22px' }} />
          )}

          <div
            style={{
              ...s.checkbox,
              ...(isSelected ? s.checkboxChecked : {}),
            }}
          >
            {isSelected && <Check size={12} color="#fff" />}
          </div>

          <div style={{ ...s.colorDot, backgroundColor: category.color }} />

          <span style={s.categoryName}>{category.name}</span>

          {category.channel_count > 0 && (
            <span style={s.categoryCount}>{category.channel_count} channels</span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {category.children.map(child => renderCategory(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const selectedCategories = getSelectedCategoriesFlat();

  if (!supabase) {
    return null;
  }

  if (loading) {
    return (
      <div style={s.container}>
        <style>{spinKeyframes}</style>
        <div style={s.loading}>
          <Loader2 size={24} style={s.spinner} />
          <p style={{ marginTop: '12px' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <style>{spinKeyframes}</style>

      <div style={s.header}>
        <div>
          <div style={s.title}>
            <Filter size={18} />
            Analysis Selector
          </div>
          <div style={s.subtitle}>
            Choose categories to include in your analysis
          </div>
        </div>
      </div>

      {/* Selected Summary */}
      {selectedCategories.length > 0 && (
        <div style={s.selectedSummary}>
          <div style={s.summaryText}>
            {selectedCategories.length} {selectedCategories.length === 1 ? 'category' : 'categories'} selected
          </div>
          <div style={s.summaryTags}>
            {selectedCategories.slice(0, 5).map(cat => (
              <span
                key={cat.id}
                style={{
                  ...s.tag,
                  backgroundColor: `${cat.color}20`,
                  color: cat.color,
                }}
              >
                {cat.name}
                <X
                  size={12}
                  style={{ marginLeft: '4px', cursor: 'pointer' }}
                  onClick={() => toggleCategory(cat.id)}
                />
              </span>
            ))}
            {selectedCategories.length > 5 && (
              <span style={{ ...s.tag, backgroundColor: '#333', color: '#999' }}>
                +{selectedCategories.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={s.tabs}>
        <button
          style={{ ...s.tab, ...(activeTab === 'categories' ? s.tabActive : {}) }}
          onClick={() => setActiveTab('categories')}
        >
          <Tag size={14} />
          Categories
        </button>
        <button
          style={{ ...s.tab, ...(activeTab === 'presets' ? s.tabActive : {}) }}
          onClick={() => setActiveTab('presets')}
        >
          <Star size={14} />
          Saved Presets
        </button>
      </div>

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div>
          {categories.length === 0 ? (
            <div style={s.empty}>
              No categories found. Create categories in the Category Manager above.
            </div>
          ) : (
            <div style={s.categoryList}>
              {categories.map(cat => renderCategory(cat))}
            </div>
          )}

          <div style={s.buttonRow}>
            {selectedCategories.length > 0 && (
              <>
                <button
                  style={s.button}
                  onClick={() => setShowSaveModal(true)}
                >
                  <Save size={14} />
                  Save as Preset
                </button>
                <button
                  style={{ ...s.button, ...s.buttonSecondary }}
                  onClick={clearSelection}
                >
                  <X size={14} />
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Presets Tab */}
      {activeTab === 'presets' && (
        <div>
          {presets.length === 0 ? (
            <div style={s.empty}>
              No saved presets yet. Select categories and save them as a preset for quick access.
            </div>
          ) : (
            <div style={s.presetList}>
              {presets.map(preset => (
                <div
                  key={preset.id}
                  style={{
                    ...s.presetCard,
                    ...(hoveredPreset === preset.id ? s.presetCardHover : {}),
                  }}
                  onClick={() => loadPreset(preset)}
                  onMouseEnter={() => setHoveredPreset(preset.id)}
                  onMouseLeave={() => setHoveredPreset(null)}
                >
                  <Star size={16} color="#F59E0B" />

                  <div style={s.presetInfo}>
                    <div style={s.presetName}>{preset.name}</div>
                    <div style={s.presetMeta}>
                      {preset.selected_category_ids?.length || 0} categories
                      {preset.description && ` • ${preset.description}`}
                    </div>
                  </div>

                  <div style={s.presetActions}>
                    <button
                      style={{ ...s.iconButton, color: '#2962FF' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        loadPreset(preset);
                      }}
                      title="Load preset"
                    >
                      <Play size={16} />
                    </button>
                    <button
                      style={{ ...s.iconButton, ...s.iconButtonDanger }}
                      onClick={(e) => handleDeletePreset(preset.id, e)}
                      title="Delete preset"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save Preset Modal */}
      {showSaveModal && (
        <div style={s.modal} onClick={() => setShowSaveModal(false)}>
          <div style={s.modalContent} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Save as Preset</div>

            <input
              type="text"
              placeholder="Preset name"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              style={s.input}
              autoFocus
            />

            <textarea
              placeholder="Description (optional)"
              value={newPresetDescription}
              onChange={(e) => setNewPresetDescription(e.target.value)}
              style={s.textarea}
            />

            <div style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
              This preset will include {selectedCategories.length} selected {selectedCategories.length === 1 ? 'category' : 'categories'}
            </div>

            <div style={s.buttonRow}>
              <button
                style={s.button}
                onClick={saveAsPreset}
                disabled={saving || !newPresetName.trim()}
              >
                {saving ? (
                  <Loader2 size={14} style={s.spinner} />
                ) : (
                  <Save size={14} />
                )}
                Save Preset
              </button>
              <button
                style={{ ...s.button, ...s.buttonSecondary }}
                onClick={() => setShowSaveModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
