/**
 * CategorySelector - Multi-select category picker for channels
 * Full View Analytics - Crux Media
 *
 * Used when adding or editing channel category assignments
 */

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Check, Folder, FolderOpen } from 'lucide-react';
import { getCategoryTree } from '../services/categoryService';
import { supabase } from '../services/supabaseClient';

const s = {
  container: {
    position: 'relative',
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#E0E0E0',
    fontSize: '13px',
    cursor: 'pointer',
    minWidth: '200px',
  },
  triggerDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  placeholder: {
    color: '#666',
  },
  selectedTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    maxWidth: '180px',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '500',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    backgroundColor: '#252525',
    border: '1px solid #333',
    borderRadius: '8px',
    maxHeight: '300px',
    overflowY: 'auto',
    zIndex: 100,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  categoryItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  categoryItemHover: {
    backgroundColor: '#333',
  },
  expandIcon: {
    marginRight: '8px',
    color: '#666',
    cursor: 'pointer',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    border: '2px solid #555',
    marginRight: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#2962FF',
    borderColor: '#2962FF',
  },
  categoryName: {
    flex: 1,
    fontSize: '13px',
    color: '#E0E0E0',
  },
  categoryCount: {
    fontSize: '11px',
    color: '#666',
    marginLeft: '8px',
  },
  colorDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginRight: '8px',
    flexShrink: 0,
  },
  noCategories: {
    padding: '16px',
    textAlign: 'center',
    color: '#666',
    fontSize: '13px',
  },
  loading: {
    padding: '16px',
    textAlign: 'center',
    color: '#666',
    fontSize: '13px',
  },
};

export default function CategorySelector({
  selectedIds = [],
  onChange,
  disabled = false,
  placeholder = "Select categories..."
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [hoveredId, setHoveredId] = useState(null);

  // Load categories on mount
  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const tree = await getCategoryTree();
      setCategories(tree);
      // Expand root categories by default
      setExpandedIds(new Set(tree.map(c => c.id)));
    } catch (err) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id, e) => {
    e.stopPropagation();
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelection = (id) => {
    const newSelection = selectedIds.includes(id)
      ? selectedIds.filter(i => i !== id)
      : [...selectedIds, id];
    onChange(newSelection);
  };

  const getSelectedCategories = () => {
    const flatCategories = flattenCategories(categories);
    return selectedIds
      .map(id => flatCategories.find(c => c.id === id))
      .filter(Boolean);
  };

  const flattenCategories = (cats, depth = 0) => {
    let result = [];
    for (const cat of cats) {
      result.push({ ...cat, depth });
      if (cat.children?.length > 0) {
        result = [...result, ...flattenCategories(cat.children, depth + 1)];
      }
    }
    return result;
  };

  const renderCategory = (category, depth = 0) => {
    const hasChildren = category.children?.length > 0;
    const isExpanded = expandedIds.has(category.id);
    const isSelected = selectedIds.includes(category.id);
    const isHovered = hoveredId === category.id;

    return (
      <div key={category.id}>
        <div
          style={{
            ...s.categoryItem,
            paddingLeft: `${12 + depth * 20}px`,
            ...(isHovered ? s.categoryItemHover : {}),
          }}
          onClick={() => toggleSelection(category.id)}
          onMouseEnter={() => setHoveredId(category.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          {hasChildren ? (
            <div
              style={s.expandIcon}
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
            <span style={s.categoryCount}>{category.channel_count}</span>
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

  const selectedCategories = getSelectedCategories();

  if (!supabase) {
    return null;
  }

  return (
    <div style={s.container}>
      <div
        style={{
          ...s.trigger,
          ...(disabled ? s.triggerDisabled : {}),
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        {selectedCategories.length === 0 ? (
          <span style={s.placeholder}>{placeholder}</span>
        ) : (
          <div style={s.selectedTags}>
            {selectedCategories.slice(0, 3).map(cat => (
              <span
                key={cat.id}
                style={{
                  ...s.tag,
                  backgroundColor: `${cat.color}20`,
                  color: cat.color,
                }}
              >
                {cat.name}
              </span>
            ))}
            {selectedCategories.length > 3 && (
              <span style={{ ...s.tag, backgroundColor: '#333', color: '#999' }}>
                +{selectedCategories.length - 3}
              </span>
            )}
          </div>
        )}
        <ChevronDown size={16} color="#666" />
      </div>

      {isOpen && (
        <div style={s.dropdown}>
          {loading ? (
            <div style={s.loading}>Loading categories...</div>
          ) : categories.length === 0 ? (
            <div style={s.noCategories}>
              No categories found. Add categories in the Category Manager.
            </div>
          ) : (
            categories.map(cat => renderCategory(cat))
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99,
          }}
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
