/**
 * CategoryManager - Admin UI for managing category hierarchy
 * Full View Analytics - Crux Media
 */

import { useState, useEffect } from 'react';
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Check,
  X,
  Loader2,
  AlertCircle,
  Palette,
  Save,
  FolderPlus
} from 'lucide-react';
import {
  getCategoryTree,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../../services/categoryService';
import { supabase } from '../../services/supabaseClient';

// Predefined colors for categories
const COLORS = [
  '#2962FF', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7',
  '#EC4899', '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#84CC16', '#22C55E', '#10B981', '#14B8A6', '#06B6D4',
  '#9CA3AF',
];

// Common icons
const ICONS = [
  'folder', 'church', 'heart', 'star', 'users', 'book-open',
  'dollar-sign', 'trending-up', 'home', 'film', 'gamepad-2',
  'graduation-cap', 'lightbulb', 'globe', 'activity', 'map-pin',
];

const s = {
  container: {
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    borderRadius: '12px',
    padding: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#E0E0E0',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    backgroundColor: '#2962FF',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    border: '1px solid #444',
    color: '#9E9E9E',
  },
  buttonSmall: {
    padding: '4px 8px',
    fontSize: '12px',
  },
  buttonDanger: {
    backgroundColor: 'transparent',
    border: '1px solid #CF6679',
    color: '#CF6679',
  },
  tree: {
    marginTop: '16px',
  },
  categoryItem: {
    marginBottom: '2px',
  },
  categoryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  categoryRowHover: {
    backgroundColor: '#252525',
  },
  categoryRowSelected: {
    backgroundColor: 'rgba(41, 98, 255, 0.15)',
  },
  expandIcon: {
    width: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666',
  },
  colorDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  categoryName: {
    flex: 1,
    fontSize: '14px',
    color: '#E0E0E0',
    fontWeight: '500',
  },
  channelCount: {
    fontSize: '12px',
    color: '#666',
    backgroundColor: '#252525',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  actions: {
    display: 'flex',
    gap: '4px',
    opacity: 0,
    transition: 'opacity 0.15s',
  },
  actionsVisible: {
    opacity: 1,
  },
  actionButton: {
    padding: '4px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: '#666',
    cursor: 'pointer',
  },
  children: {
    marginLeft: '28px',
    borderLeft: '1px solid #333',
    paddingLeft: '12px',
  },
  form: {
    backgroundColor: '#252525',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '16px',
  },
  formTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#E0E0E0',
    marginBottom: '16px',
  },
  formRow: {
    marginBottom: '12px',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#1E1E1E',
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#E0E0E0',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#1E1E1E',
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#E0E0E0',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  colorPicker: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  colorOption: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'border-color 0.15s',
  },
  colorOptionSelected: {
    border: '2px solid #fff',
  },
  formActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
  },
  error: {
    backgroundColor: 'rgba(207, 102, 121, 0.15)',
    border: '1px solid #CF6679',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#CF6679',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
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

// Category tree item component
function CategoryItem({
  category,
  depth = 0,
  expanded,
  onToggle,
  onSelect,
  isSelected,
  onEdit,
  onDelete,
  onAddChild,
}) {
  const [hovered, setHovered] = useState(false);
  const hasChildren = category.children && category.children.length > 0;
  const isExpanded = expanded[category.id];

  return (
    <div style={s.categoryItem}>
      <div
        style={{
          ...s.categoryRow,
          ...(hovered ? s.categoryRowHover : {}),
          ...(isSelected ? s.categoryRowSelected : {}),
          paddingLeft: `${12 + depth * 8}px`,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => onSelect(category)}
      >
        <div
          style={s.expandIcon}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(category.id);
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )
          ) : null}
        </div>

        <div style={{ ...s.colorDot, backgroundColor: category.color }} />

        <span style={s.categoryName}>{category.name}</span>

        {category.channel_count > 0 && (
          <span style={s.channelCount}>{category.channel_count}</span>
        )}

        <div style={{ ...s.actions, ...(hovered ? s.actionsVisible : {}) }}>
          <button
            style={s.actionButton}
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(category);
            }}
            title="Add subcategory"
          >
            <FolderPlus size={14} />
          </button>
          <button
            style={s.actionButton}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(category);
            }}
            title="Edit"
          >
            <Edit2 size={14} />
          </button>
          <button
            style={{ ...s.actionButton, color: '#CF6679' }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(category);
            }}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div style={s.children}>
          {category.children.map((child) => (
            <CategoryItem
              key={child.id}
              category={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              isSelected={isSelected?.id === child.id}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryManager() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [selected, setSelected] = useState(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  const [formData, setFormData] = useState({
    name: '',
    parentId: null,
    color: '#2962FF',
    description: '',
  });
  const [saving, setSaving] = useState(false);

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
      setLoading(true);
      const tree = await getCategoryTree();
      setCategories(tree);

      // Auto-expand root categories
      const expandedState = {};
      tree.forEach((cat) => {
        expandedState[cat.id] = true;
      });
      setExpanded(expandedState);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelect = (category) => {
    setSelected(category);
  };

  const handleAddRoot = () => {
    setFormMode('create');
    setFormData({
      name: '',
      parentId: null,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      description: '',
    });
    setShowForm(true);
  };

  const handleAddChild = (parent) => {
    setFormMode('create');
    setFormData({
      name: '',
      parentId: parent.id,
      color: parent.color,
      description: '',
    });
    setShowForm(true);
  };

  const handleEdit = (category) => {
    setFormMode('edit');
    setFormData({
      id: category.id,
      name: category.name,
      parentId: category.parent_id,
      color: category.color,
      description: category.description || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (category) => {
    const hasChildren = category.children && category.children.length > 0;
    const message = hasChildren
      ? `Delete "${category.name}" and all its subcategories?`
      : `Delete "${category.name}"?`;

    if (!confirm(message)) return;

    try {
      await deleteCategory(category.id);
      await loadCategories();
      if (selected?.id === category.id) {
        setSelected(null);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      if (formMode === 'create') {
        await createCategory({
          name: formData.name,
          parentId: formData.parentId,
          color: formData.color,
          description: formData.description,
        });
      } else {
        await updateCategory(formData.id, {
          name: formData.name,
          color: formData.color,
          description: formData.description,
        });
      }

      await loadCategories();
      setShowForm(false);
      setFormData({ name: '', parentId: null, color: '#2962FF', description: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData({ name: '', parentId: null, color: '#2962FF', description: '' });
    setError(null);
  };

  // Not configured state
  if (!supabase) {
    return (
      <div style={s.container}>
        <div style={s.emptyState}>
          <FolderTree size={48} color="#444" />
          <p style={{ marginTop: '12px' }}>Database not connected</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <style>{spinKeyframes}</style>

      <div style={s.header}>
        <div style={s.title}>
          <FolderTree size={20} />
          Category Manager
        </div>
        <button style={s.button} onClick={handleAddRoot}>
          <Plus size={16} />
          Add Category
        </button>
      </div>

      {error && (
        <div style={s.error}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Loader2 size={24} color="#2962FF" style={s.spinner} />
        </div>
      ) : categories.length === 0 ? (
        <div style={s.emptyState}>
          <FolderTree size={48} color="#444" />
          <p style={{ marginTop: '12px' }}>No categories yet</p>
          <button
            style={{ ...s.button, marginTop: '16px' }}
            onClick={handleAddRoot}
          >
            <Plus size={16} />
            Create your first category
          </button>
        </div>
      ) : (
        <div style={s.tree}>
          {categories.map((category) => (
            <CategoryItem
              key={category.id}
              category={category}
              expanded={expanded}
              onToggle={handleToggle}
              onSelect={handleSelect}
              isSelected={selected?.id === category.id}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAddChild={handleAddChild}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <form style={s.form} onSubmit={handleSubmit}>
          <div style={s.formTitle}>
            {formMode === 'create'
              ? formData.parentId
                ? 'Add Subcategory'
                : 'Add Category'
              : 'Edit Category'}
          </div>

          <div style={s.formRow}>
            <label style={s.label}>Name</label>
            <input
              type="text"
              style={s.input}
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Category name"
              autoFocus
            />
          </div>

          <div style={s.formRow}>
            <label style={s.label}>Color</label>
            <div style={s.colorPicker}>
              {COLORS.map((color) => (
                <div
                  key={color}
                  style={{
                    ...s.colorOption,
                    backgroundColor: color,
                    ...(formData.color === color ? s.colorOptionSelected : {}),
                  }}
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, color }))
                  }
                />
              ))}
            </div>
          </div>

          <div style={s.formRow}>
            <label style={s.label}>Description (optional)</label>
            <input
              type="text"
              style={s.input}
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Brief description"
            />
          </div>

          <div style={s.formActions}>
            <button
              type="submit"
              style={s.button}
              disabled={saving || !formData.name.trim()}
            >
              {saving ? (
                <>
                  <Loader2 size={14} style={s.spinner} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={14} />
                  {formMode === 'create' ? 'Create' : 'Save'}
                </>
              )}
            </button>
            <button
              type="button"
              style={{ ...s.button, ...s.buttonSecondary }}
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
