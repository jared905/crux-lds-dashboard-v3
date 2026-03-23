/**
 * CategoryManager — Modal for creating, renaming, reordering, and nesting categories
 *
 * Accessible from the competitor page settings menu.
 * Supports: rename, change color/icon, create new, reparent (move subcategories),
 * delete, and reorder.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, Plus, Trash2, ChevronRight, ChevronDown,
  Loader, Check, Edit3, ArrowRight,
} from 'lucide-react';

const COLORS = [
  '#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f59e0b', '#6366f1', '#14b8a6',
  '#84cc16', '#a855f7', '#0ea5e9', '#f43f5e', '#22d3ee',
];

const ICONS = [
  { name: 'building', emoji: '🏛️' },
  { name: 'heart', emoji: '🙏' },
  { name: 'log-out', emoji: '🚪' },
  { name: 'alert-circle', emoji: '⛪' },
  { name: 'mic', emoji: '🎤' },
  { name: 'unlock', emoji: '🔓' },
  { name: 'folder', emoji: '📁' },
  { name: 'shopping-bag', emoji: '🛍️' },
  { name: 'headphones', emoji: '🎧' },
  { name: 'music', emoji: '🎵' },
  { name: 'dollar-sign', emoji: '💵' },
  { name: 'zap', emoji: '⚡' },
  { name: 'flame', emoji: '🔥' },
  { name: 'activity', emoji: '🛹' },
  { name: 'gamepad-2', emoji: '🎮' },
  { name: 'cpu', emoji: '💻' },
  { name: 'tv', emoji: '📺' },
  { name: 'box', emoji: '📦' },
];

export default function CategoryManager({ isOpen, onClose, onCategoriesChanged }) {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#3b82f6');
  const [editIcon, setEditIcon] = useState('folder');

  // Create state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState(null);
  const [newColor, setNewColor] = useState('#3b82f6');
  const [newIcon, setNewIcon] = useState('folder');

  // Move state
  const [movingId, setMovingId] = useState(null);

  // Expanded categories
  const [expanded, setExpanded] = useState(new Set());

  // Flat list for parent selectors
  const flatCategories = useMemo(() => {
    const result = [];
    const flatten = (nodes, depth = 0) => {
      nodes.forEach(n => {
        result.push({ ...n, depth });
        if (n.children) flatten(n.children, depth + 1);
      });
    };
    flatten(tree);
    return result;
  }, [tree]);

  // Load categories
  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { getCategoryTree } = await import('../../services/categoryService');
      const data = await getCategoryTree();
      setTree(data || []);
      // Auto-expand all
      const allIds = new Set();
      const collectIds = (nodes) => nodes.forEach(n => { allIds.add(n.id); if (n.children) collectIds(n.children); });
      collectIds(data || []);
      setExpanded(allIds);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadTree();
  }, [isOpen, loadTree]);

  // Create category
  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { createCategory } = await import('../../services/categoryService');
      await createCategory({
        name: newName.trim(),
        parentId: newParentId,
        color: newColor,
        icon: newIcon,
      });
      setNewName('');
      setNewParentId(null);
      setShowCreate(false);
      await loadTree();
      onCategoriesChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Rename / update category
  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const { updateCategory } = await import('../../services/categoryService');
      await updateCategory(id, { name: editName.trim(), color: editColor, icon: editIcon });
      setEditingId(null);
      await loadTree();
      onCategoriesChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Move category (change parent)
  const handleMove = async (categoryId, newParentIdVal) => {
    setSaving(true);
    try {
      const { updateCategory } = await import('../../services/categoryService');
      await updateCategory(categoryId, { parentId: newParentIdVal });
      setMovingId(null);
      await loadTree();
      onCategoriesChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete category
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This will remove the category and unlink any channels from it.`)) return;
    setSaving(true);
    try {
      const { deleteCategory } = await import('../../services/categoryService');
      await deleteCategory(id);
      await loadTree();
      onCategoriesChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (cat) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color || '#3b82f6');
    setEditIcon(cat.icon || 'folder');
  };

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getEmoji = (iconName) => {
    return ICONS.find(i => i.name === iconName)?.emoji || '📁';
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1E1E1E', border: '1px solid #333', borderRadius: '10px',
        width: '640px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #333',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>Category Manager</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
              Create, rename, and organize categories and subcategories
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '6px 12px', background: 'rgba(59,130,246,0.15)',
                border: '1px solid #3b82f6', borderRadius: '6px',
                color: '#60a5fa', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              }}
            >
              <Plus size={14} /> New Category
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: '1px solid #444',
                borderRadius: '6px', padding: '6px 8px', color: '#888', cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '8px 20px', background: '#2d1b1b', color: '#fca5a5', fontSize: '12px' }}>
            {error}
            <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>
              <X size={12} />
            </button>
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #333', background: '#1a1a1a' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#60a5fa', marginBottom: '10px' }}>
              New Category
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Category name"
                autoFocus
                style={{
                  flex: 1, padding: '8px 10px', background: '#252525',
                  border: '1px solid #444', borderRadius: '6px',
                  color: '#fff', fontSize: '13px', outline: 'none',
                }}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <select
                value={newParentId || ''}
                onChange={e => setNewParentId(e.target.value || null)}
                style={{
                  width: '180px', padding: '8px', background: '#252525',
                  border: '1px solid #444', borderRadius: '6px',
                  color: '#fff', fontSize: '12px',
                }}
              >
                <option value="">Top level</option>
                {flatCategories.map(c => (
                  <option key={c.id} value={c.id}>
                    {'  '.repeat(c.depth)}{c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Color + Icon picker */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>Color</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxWidth: '200px' }}>
                  {COLORS.map(c => (
                    <div
                      key={c}
                      onClick={() => setNewColor(c)}
                      style={{
                        width: 22, height: 22, borderRadius: '4px', background: c,
                        cursor: 'pointer',
                        border: newColor === c ? '2px solid #fff' : '2px solid transparent',
                      }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>Icon</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxWidth: '240px' }}>
                  {ICONS.map(ic => (
                    <div
                      key={ic.name}
                      onClick={() => setNewIcon(ic.name)}
                      style={{
                        width: 28, height: 28, borderRadius: '4px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '16px', cursor: 'pointer',
                        background: newIcon === ic.name ? '#333' : 'transparent',
                        border: newIcon === ic.name ? '1px solid #60a5fa' : '1px solid transparent',
                      }}
                    >
                      {ic.emoji}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowCreate(false); setNewName(''); }}
                style={{
                  padding: '6px 14px', background: 'transparent', border: '1px solid #444',
                  borderRadius: '6px', color: '#888', fontSize: '12px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || saving}
                style={{
                  padding: '6px 14px', background: '#3b82f6', border: 'none',
                  borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: '600',
                  cursor: newName.trim() && !saving ? 'pointer' : 'not-allowed',
                  opacity: newName.trim() && !saving ? 1 : 0.5,
                }}
              >
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {/* Category tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
              <Loader size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
              <div style={{ fontSize: '13px' }}>Loading categories...</div>
            </div>
          ) : tree.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
              No categories yet. Create one to get started.
            </div>
          ) : (
            tree.map(cat => (
              <CategoryRow
                key={cat.id}
                category={cat}
                depth={0}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                editingId={editingId}
                editName={editName}
                editColor={editColor}
                editIcon={editIcon}
                onEditNameChange={setEditName}
                onEditColorChange={setEditColor}
                onEditIconChange={setEditIcon}
                onStartEdit={startEdit}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={() => setEditingId(null)}
                movingId={movingId}
                onStartMove={setMovingId}
                onDelete={handleDelete}
                saving={saving}
                getEmoji={getEmoji}
              />
            ))
          )}
        </div>

        {/* Move target picker */}
        {movingId && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid #333',
            background: '#1a1a1a',
          }}>
            <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ArrowRight size={12} />
              Move to:
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleMove(movingId, null)}
                style={{
                  padding: '4px 10px', background: '#252525', border: '1px solid #444',
                  borderRadius: '6px', color: '#ccc', fontSize: '11px', cursor: 'pointer',
                }}
              >
                Top level (root)
              </button>
              {flatCategories
                .filter(c => c.id !== movingId)
                .map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleMove(movingId, c.id)}
                    style={{
                      padding: '4px 10px', background: '#252525', border: '1px solid #444',
                      borderRadius: '6px', color: '#ccc', fontSize: '11px', cursor: 'pointer',
                    }}
                  >
                    {'  '.repeat(c.depth)}{getEmoji(c.icon)} {c.name}
                  </button>
                ))
              }
            </div>
            <button
              onClick={() => setMovingId(null)}
              style={{
                marginTop: '8px', padding: '4px 10px', background: 'transparent',
                border: '1px solid #444', borderRadius: '6px',
                color: '#888', fontSize: '11px', cursor: 'pointer',
              }}
            >
              Cancel move
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CategoryRow ───────────────────────────────────────────────────────
function CategoryRow({
  category, depth, expanded, onToggleExpand,
  editingId, editName, editColor, editIcon,
  onEditNameChange, onEditColorChange, onEditIconChange,
  onStartEdit, onSaveEdit, onCancelEdit,
  movingId, onStartMove, onDelete,
  saving, getEmoji,
}) {
  const isExpanded = expanded.has(category.id);
  const hasChildren = category.children && category.children.length > 0;
  const isEditing = editingId === category.id;
  const isMoving = movingId === category.id;

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 16px', paddingLeft: `${16 + depth * 24}px`,
          background: isEditing ? '#252525' : isMoving ? 'rgba(245,158,11,0.08)' : 'transparent',
          borderLeft: isMoving ? '3px solid #f59e0b' : '3px solid transparent',
          transition: 'background 0.1s',
        }}
        onMouseOver={e => { if (!isEditing) e.currentTarget.style.background = '#222'; }}
        onMouseOut={e => { if (!isEditing) e.currentTarget.style.background = isMoving ? 'rgba(245,158,11,0.08)' : 'transparent'; }}
      >
        {/* Expand toggle */}
        <div
          onClick={() => hasChildren && onToggleExpand(category.id)}
          style={{ width: '16px', cursor: hasChildren ? 'pointer' : 'default', flexShrink: 0 }}
        >
          {hasChildren && (
            isExpanded ? <ChevronDown size={12} style={{ color: '#888' }} /> : <ChevronRight size={12} style={{ color: '#888' }} />
          )}
        </div>

        {/* Color dot */}
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: category.color || '#666', flexShrink: 0,
        }} />

        {/* Icon */}
        <span style={{ fontSize: '14px', flexShrink: 0 }}>{getEmoji(category.icon)}</span>

        {isEditing ? (
          /* Edit mode */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={editName}
                onChange={e => onEditNameChange(e.target.value)}
                autoFocus
                style={{
                  flex: 1, padding: '5px 8px', background: '#1a1a1a',
                  border: '1px solid #555', borderRadius: '4px',
                  color: '#fff', fontSize: '12px', outline: 'none',
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') onSaveEdit(category.id);
                  if (e.key === 'Escape') onCancelEdit();
                }}
              />
              <button
                onClick={() => onSaveEdit(category.id)}
                disabled={saving}
                style={{
                  padding: '4px 8px', background: '#10b981', border: 'none',
                  borderRadius: '4px', color: '#fff', cursor: 'pointer',
                }}
              >
                <Check size={12} />
              </button>
              <button
                onClick={onCancelEdit}
                style={{
                  padding: '4px 8px', background: 'transparent', border: '1px solid #444',
                  borderRadius: '4px', color: '#888', cursor: 'pointer',
                }}
              >
                <X size={12} />
              </button>
            </div>
            {/* Color + icon pickers inline */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '3px' }}>
                {COLORS.map(c => (
                  <div
                    key={c}
                    onClick={() => onEditColorChange(c)}
                    style={{
                      width: 16, height: 16, borderRadius: '3px', background: c,
                      cursor: 'pointer',
                      border: editColor === c ? '2px solid #fff' : '1px solid transparent',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: '2px' }}>
                {ICONS.slice(0, 10).map(ic => (
                  <div
                    key={ic.name}
                    onClick={() => onEditIconChange(ic.name)}
                    style={{
                      width: 20, height: 20, borderRadius: '3px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', cursor: 'pointer',
                      background: editIcon === ic.name ? '#333' : 'transparent',
                    }}
                  >
                    {ic.emoji}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Display mode */
          <>
            <span style={{ flex: 1, fontSize: '13px', color: '#e0e0e0', fontWeight: depth === 0 ? '600' : '400' }}>
              {category.name}
            </span>
            {category.slug && (
              <span style={{ fontSize: '9px', color: '#555', fontFamily: 'monospace' }}>
                {category.slug}
              </span>
            )}
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '2px', opacity: 0.6 }}
              onMouseOver={e => e.currentTarget.style.opacity = '1'}
              onMouseOut={e => e.currentTarget.style.opacity = '0.6'}
            >
              <button
                onClick={() => onStartEdit(category)}
                title="Rename"
                style={{ padding: '3px', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', borderRadius: '3px' }}
              >
                <Edit3 size={12} />
              </button>
              <button
                onClick={() => onStartMove(category.id)}
                title="Move to another category"
                style={{ padding: '3px', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', borderRadius: '3px' }}
              >
                <ArrowRight size={12} />
              </button>
              <button
                onClick={() => onDelete(category.id, category.name)}
                title="Delete"
                style={{ padding: '3px', background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', borderRadius: '3px' }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {category.children.map(child => (
            <CategoryRow
              key={child.id}
              category={child}
              depth={depth + 1}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              editingId={editingId}
              editName={editName}
              editColor={editColor}
              editIcon={editIcon}
              onEditNameChange={onEditNameChange}
              onEditColorChange={onEditColorChange}
              onEditIconChange={onEditIconChange}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              movingId={movingId}
              onStartMove={onStartMove}
              onDelete={onDelete}
              saving={saving}
              getEmoji={getEmoji}
            />
          ))}
        </div>
      )}
    </div>
  );
}
