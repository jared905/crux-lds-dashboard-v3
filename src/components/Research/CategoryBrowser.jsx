/**
 * CategoryBrowser - Hierarchical category navigation for master view
 * Full View Analytics - Crux Media
 *
 * Replaces the Outliers/Intelligence panel when in master view.
 * Shows expandable tree of categories with channel counts.
 * Supports adding and deleting categories.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Plus,
  Trash2,
  X,
  Loader2,
} from 'lucide-react';

const styles = {
  container: {
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #333',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#E0E0E0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  addButton: {
    padding: '4px 10px',
    backgroundColor: 'rgba(41, 98, 255, 0.15)',
    border: '1px solid #2962FF',
    borderRadius: '4px',
    color: '#60a5fa',
    fontSize: '11px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  clearButton: {
    padding: '4px 10px',
    backgroundColor: 'transparent',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#9E9E9E',
    fontSize: '11px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  tree: {
    padding: '8px 0',
    maxHeight: '500px',
    overflowY: 'auto',
  },
  categoryRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    position: 'relative',
  },
  categoryRowSelected: {
    backgroundColor: 'rgba(41, 98, 255, 0.15)',
  },
  expandIcon: {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666',
  },
  colorDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    marginRight: '10px',
    flexShrink: 0,
  },
  categoryName: {
    flex: 1,
    fontSize: '13px',
    color: '#E0E0E0',
  },
  categoryCount: {
    fontSize: '11px',
    color: '#666',
    backgroundColor: '#2a2a2a',
    padding: '2px 8px',
    borderRadius: '10px',
    marginRight: '8px',
  },
  selectedCount: {
    backgroundColor: 'rgba(41, 98, 255, 0.3)',
    color: '#60a5fa',
  },
  rowActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    opacity: 0,
    transition: 'opacity 0.15s',
  },
  rowActionsVisible: {
    opacity: 1,
  },
  iconButton: {
    padding: '4px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: '#666',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childrenContainer: {
    marginLeft: '20px',
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
    color: '#666',
    fontSize: '13px',
  },
  summary: {
    padding: '12px 16px',
    borderTop: '1px solid #333',
    backgroundColor: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryText: {
    fontSize: '12px',
    color: '#9E9E9E',
  },
  summaryCount: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#2962FF',
  },
  // Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    borderRadius: '12px',
    width: '400px',
    overflow: 'hidden',
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #333',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
  },
  modalBody: {
    padding: '20px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    color: '#888',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#252525',
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#252525',
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  colorPicker: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  colorOption: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    cursor: 'pointer',
    border: '2px solid transparent',
  },
  colorOptionSelected: {
    border: '2px solid #fff',
  },
  modalFooter: {
    padding: '16px 20px',
    borderTop: '1px solid #333',
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  button: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    border: '1px solid #444',
    color: '#888',
  },
  buttonPrimary: {
    backgroundColor: '#2962FF',
    border: 'none',
    color: '#fff',
  },
  buttonDanger: {
    backgroundColor: '#ef4444',
    border: 'none',
    color: '#fff',
  },
};

const COLORS = [
  '#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f59e0b', '#6366f1', '#14b8a6',
];

/**
 * CategoryRow - Single category item with expand/collapse
 */
function CategoryRow({
  category,
  depth = 0,
  expandedIds,
  onToggleExpand,
  selectedIds,
  onSelectCategory,
  channelCounts,
  onAddChild,
  onDelete,
}) {
  const [hovered, setHovered] = useState(false);
  const isExpanded = expandedIds.has(category.id);
  const isSelected = selectedIds.has(category.id);
  const hasChildren = category.children && category.children.length > 0;

  // Count channels in this category and all descendants
  const totalCount = useMemo(() => {
    const countDescendants = (cat) => {
      let count = channelCounts[cat.id] || 0;
      (cat.children || []).forEach(child => {
        count += countDescendants(child);
      });
      return count;
    };
    return countDescendants(category);
  }, [category, channelCounts]);

  const handleClick = (e) => {
    e.stopPropagation();
    onSelectCategory(category.id);
  };

  const handleExpand = (e) => {
    e.stopPropagation();
    onToggleExpand(category.id);
  };

  const handleAddChild = (e) => {
    e.stopPropagation();
    onAddChild(category);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(category);
  };

  return (
    <>
      <div
        style={{
          ...styles.categoryRow,
          paddingLeft: 16 + depth * 20,
          ...(isSelected ? styles.categoryRowSelected : {}),
          backgroundColor: hovered && !isSelected ? '#252525' : (isSelected ? 'rgba(41, 98, 255, 0.15)' : 'transparent'),
        }}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Expand/Collapse Icon */}
        <div style={styles.expandIcon} onClick={hasChildren ? handleExpand : undefined}>
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span style={{ width: 14 }} />
          )}
        </div>

        {/* Color Dot */}
        <div
          style={{
            ...styles.colorDot,
            backgroundColor: category.color || '#666',
          }}
        />

        {/* Category Name */}
        <span style={styles.categoryName}>{category.name}</span>

        {/* Channel Count */}
        {totalCount > 0 && (
          <span
            style={{
              ...styles.categoryCount,
              ...(isSelected ? styles.selectedCount : {}),
            }}
          >
            {totalCount}
          </span>
        )}

        {/* Row Actions (visible on hover) */}
        <div style={{ ...styles.rowActions, ...(hovered ? styles.rowActionsVisible : {}) }}>
          <button
            style={{ ...styles.iconButton, color: '#60a5fa' }}
            onClick={handleAddChild}
            title="Add subcategory"
          >
            <Plus size={14} />
          </button>
          <button
            style={{ ...styles.iconButton, color: '#ef4444' }}
            onClick={handleDelete}
            title="Delete category"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div style={styles.childrenContainer}>
          {category.children.map((child) => (
            <CategoryRow
              key={child.id}
              category={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              selectedIds={selectedIds}
              onSelectCategory={onSelectCategory}
              channelCounts={channelCounts}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Add Category Modal
 */
function AddCategoryModal({ isOpen, onClose, onSave, parentCategory, allCategories, saving }) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(parentCategory?.id || '');
  const [color, setColor] = useState(COLORS[0]);

  // Reset form when parent changes
  React.useEffect(() => {
    setParentId(parentCategory?.id || '');
  }, [parentCategory]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      parentId: parentId || null,
      color,
    });
  };

  // Flatten categories for the parent dropdown
  const flatCategories = useMemo(() => {
    const flat = [];
    const flatten = (cats, depth = 0) => {
      cats.forEach(cat => {
        flat.push({ ...cat, depth });
        if (cat.children) flatten(cat.children, depth + 1);
      });
    };
    flatten(allCategories);
    return flat;
  }, [allCategories]);

  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>
            {parentCategory ? `Add Subcategory to ${parentCategory.name}` : 'Add Category'}
          </span>
          <button style={{ ...styles.iconButton, color: '#888' }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={styles.modalBody}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Name</label>
              <input
                style={styles.input}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Category name"
                autoFocus
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Parent Category</label>
              <select
                style={styles.select}
                value={parentId}
                onChange={e => setParentId(e.target.value)}
              >
                <option value="">None (Top Level)</option>
                {flatCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {'—'.repeat(cat.depth)} {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Color</label>
              <div style={styles.colorPicker}>
                {COLORS.map(c => (
                  <div
                    key={c}
                    style={{
                      ...styles.colorOption,
                      backgroundColor: c,
                      ...(color === c ? styles.colorOptionSelected : {}),
                    }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <div style={styles.modalFooter}>
            <button
              type="button"
              style={{ ...styles.button, ...styles.buttonSecondary }}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{ ...styles.button, ...styles.buttonPrimary, opacity: saving || !name.trim() ? 0.5 : 1 }}
              disabled={saving || !name.trim()}
            >
              {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Add Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Delete Confirmation Modal
 */
function DeleteCategoryModal({ isOpen, onClose, onConfirm, category, saving }) {
  if (!isOpen || !category) return null;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>Delete Category</span>
          <button style={{ ...styles.iconButton, color: '#888' }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <p style={{ color: '#E0E0E0', fontSize: '14px', margin: 0 }}>
            Are you sure you want to delete <strong>{category.name}</strong>?
          </p>
          {category.children?.length > 0 && (
            <p style={{ color: '#f59e0b', fontSize: '12px', marginTop: '12px' }}>
              Warning: This will also delete {category.children.length} subcategories.
            </p>
          )}
        </div>
        <div style={styles.modalFooter}>
          <button
            style={{ ...styles.button, ...styles.buttonSecondary }}
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            style={{ ...styles.button, ...styles.buttonDanger, opacity: saving ? 0.5 : 1 }}
            onClick={() => onConfirm(category)}
            disabled={saving}
          >
            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * CategoryBrowser - Main component
 */
export default function CategoryBrowser({
  categoryTree = [],
  selectedCategoryIds = [],
  onCategorySelect,
  channels = [],
  loading = false,
  onCategoryChange, // Callback to refresh category tree after add/delete
}) {
  // Start with all folders collapsed
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedParent, setSelectedParent] = useState(null);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  // Sort categories alphabetically (recursive)
  const sortedCategoryTree = useMemo(() => {
    const sortTree = (categories) => {
      return [...categories]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(cat => ({
          ...cat,
          children: cat.children ? sortTree(cat.children) : [],
        }));
    };
    return sortTree(categoryTree);
  }, [categoryTree]);

  // Build channel count map from channels data
  const channelCounts = useMemo(() => {
    const counts = {};
    channels.forEach(channel => {
      // Count by flat category field
      if (channel.category) {
        // We need to find the category ID from the tree
        const findCatId = (tree, slug) => {
          for (const cat of tree) {
            if (cat.slug === slug) return cat.id;
            if (cat.children) {
              const found = findCatId(cat.children, slug);
              if (found) return found;
            }
          }
          return null;
        };
        const catId = findCatId(categoryTree, channel.category);
        if (catId) {
          counts[catId] = (counts[catId] || 0) + 1;
        }
      }

      // Also count by categoryIds if available
      (channel.categoryIds || []).forEach(catId => {
        counts[catId] = (counts[catId] || 0) + 1;
      });
    });
    return counts;
  }, [channels, categoryTree]);

  const selectedSet = useMemo(() => new Set(selectedCategoryIds), [selectedCategoryIds]);

  const handleToggleExpand = (categoryId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const handleSelectCategory = (categoryId) => {
    if (onCategorySelect) {
      if (selectedSet.has(categoryId)) {
        // Deselect
        onCategorySelect(selectedCategoryIds.filter((id) => id !== categoryId));
      } else {
        // Select (add to existing)
        onCategorySelect([...selectedCategoryIds, categoryId]);
      }
    }
  };

  const handleClearSelection = () => {
    if (onCategorySelect) {
      onCategorySelect([]);
    }
  };

  // Add category handlers
  const handleAddClick = useCallback(() => {
    setSelectedParent(null);
    setShowAddModal(true);
  }, []);

  const handleAddChild = useCallback((parent) => {
    setSelectedParent(parent);
    setShowAddModal(true);
  }, []);

  const handleSaveCategory = useCallback(async ({ name, parentId, color }) => {
    setSaving(true);
    try {
      const { createCategory } = await import('../../services/categoryService');
      await createCategory({ name, parentId, color });
      setShowAddModal(false);
      if (onCategoryChange) onCategoryChange();
    } catch (err) {
      console.error('Failed to create category:', err);
      alert('Failed to create category: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [onCategoryChange]);

  // Delete category handlers
  const handleDeleteClick = useCallback((category) => {
    setCategoryToDelete(category);
    setShowDeleteModal(true);
  }, []);

  const handleConfirmDelete = useCallback(async (category) => {
    setSaving(true);
    try {
      const { deleteCategory } = await import('../../services/categoryService');
      await deleteCategory(category.id);
      setShowDeleteModal(false);
      setCategoryToDelete(null);
      if (onCategoryChange) onCategoryChange();
    } catch (err) {
      console.error('Failed to delete category:', err);
      alert('Failed to delete category: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [onCategoryChange]);

  // Calculate total selected channels
  const selectedChannelCount = useMemo(() => {
    if (selectedCategoryIds.length === 0) return channels.length;

    // Get all descendant category IDs for selected categories
    const getAllDescendantIds = (cat) => {
      let ids = [cat.id];
      (cat.children || []).forEach(child => {
        ids = ids.concat(getAllDescendantIds(child));
      });
      return ids;
    };

    const findCategory = (tree, id) => {
      for (const cat of tree) {
        if (cat.id === id) return cat;
        if (cat.children) {
          const found = findCategory(cat.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const allSelectedIds = new Set();
    selectedCategoryIds.forEach(id => {
      const cat = findCategory(categoryTree, id);
      if (cat) {
        getAllDescendantIds(cat).forEach(descId => allSelectedIds.add(descId));
      }
    });

    // Count channels that match any selected category
    return channels.filter(ch => {
      // Check flat category
      const catId = categoryTree.reduce((found, cat) => {
        if (found) return found;
        const findCatId = (tree, slug) => {
          for (const c of tree) {
            if (c.slug === slug) return c.id;
            if (c.children) {
              const f = findCatId(c.children, slug);
              if (f) return f;
            }
          }
          return null;
        };
        return findCatId([cat], ch.category);
      }, null);

      if (catId && allSelectedIds.has(catId)) return true;

      // Check categoryIds array
      return (ch.categoryIds || []).some(id => allSelectedIds.has(id));
    }).length;
  }, [selectedCategoryIds, channels, categoryTree]);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.title}>
            <Folder size={16} />
            Category Browser
          </div>
        </div>
        <div style={styles.emptyState}>Loading categories...</div>
      </div>
    );
  }

  if (categoryTree.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.title}>
            <Folder size={16} />
            Category Browser
          </div>
          <button style={styles.addButton} onClick={handleAddClick}>
            <Plus size={12} />
            Add
          </button>
        </div>
        <div style={styles.emptyState}>
          No categories found. Click "Add" to create your first category.
        </div>

        {/* Add Modal */}
        <AddCategoryModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSave={handleSaveCategory}
          parentCategory={selectedParent}
          allCategories={categoryTree}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>
          <Folder size={16} />
          Category Browser
        </div>
        <div style={styles.headerActions}>
          <button style={styles.addButton} onClick={handleAddClick}>
            <Plus size={12} />
            Add
          </button>
          {selectedCategoryIds.length > 0 && (
            <button style={styles.clearButton} onClick={handleClearSelection}>
              <X size={12} />
              Clear ({selectedCategoryIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div style={styles.tree}>
        {sortedCategoryTree.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            depth={0}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            selectedIds={selectedSet}
            onSelectCategory={handleSelectCategory}
            channelCounts={channelCounts}
            onAddChild={handleAddChild}
            onDelete={handleDeleteClick}
          />
        ))}
      </div>

      {/* Summary */}
      <div style={styles.summary}>
        <span style={styles.summaryText}>
          {selectedCategoryIds.length > 0
            ? `${selectedCategoryIds.length} categories selected`
            : 'All categories'}
        </span>
        <span style={styles.summaryCount}>
          {selectedChannelCount} channels
        </span>
      </div>

      {/* Modals */}
      <AddCategoryModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSaveCategory}
        parentCategory={selectedParent}
        allCategories={categoryTree}
        saving={saving}
      />

      <DeleteCategoryModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setCategoryToDelete(null); }}
        onConfirm={handleConfirmDelete}
        category={categoryToDelete}
        saving={saving}
      />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
