/**
 * CategoryBrowser - Hierarchical category navigation for master view
 * Full View Analytics - Crux Media
 *
 * Replaces the Outliers/Intelligence panel when in master view.
 * Shows expandable tree of categories with channel counts.
 */

import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Hash,
  Users,
  Filter,
  X,
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
  },
  categoryRowHover: {
    backgroundColor: '#252525',
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
  },
  selectedCount: {
    backgroundColor: 'rgba(41, 98, 255, 0.3)',
    color: '#60a5fa',
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
};

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
}) {
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

  return (
    <>
      <div
        style={{
          ...styles.categoryRow,
          paddingLeft: 16 + depth * 20,
          ...(isSelected ? styles.categoryRowSelected : {}),
        }}
        onClick={handleClick}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = '#252525';
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
        }}
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
            />
          ))}
        </div>
      )}
    </>
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
}) {
  const [expandedIds, setExpandedIds] = useState(() => {
    // Expand root categories by default
    const initial = new Set();
    categoryTree.forEach(cat => initial.add(cat.id));
    return initial;
  });

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
        </div>
        <div style={styles.emptyState}>
          No categories found. Run database migrations to set up the category hierarchy.
        </div>
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
        {selectedCategoryIds.length > 0 && (
          <button style={styles.clearButton} onClick={handleClearSelection}>
            <X size={12} />
            Clear ({selectedCategoryIds.length})
          </button>
        )}
      </div>

      {/* Tree */}
      <div style={styles.tree}>
        {categoryTree.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            depth={0}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            selectedIds={selectedSet}
            onSelectCategory={handleSelectCategory}
            channelCounts={channelCounts}
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
    </div>
  );
}
