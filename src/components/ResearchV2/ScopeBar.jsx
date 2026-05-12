import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X, ChevronDown } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

/**
 * Sticky scope picker — controls all four lenses.
 *
 * Category model:
 *   - Parent dropdown (single-select, defaults to "All"). Pick a parent
 *     with no sub-categories to scope the lens to that parent + all its
 *     descendants (the resolver expands it).
 *   - Sub-category multi-select (enabled once a parent is chosen) — pick
 *     one or more specific sub-cats. They override the "all-in-parent" mode.
 */
export default function ScopeBar({ scope, onChange }) {
  const [allCategories, setAllCategories] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [showParentMenu, setShowParentMenu] = useState(false);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);

  // Load categories + distinct tags once
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!supabase) return;
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id')
        .order('name', { ascending: true });
      const { data: tagRows } = await supabase.from('channel_tags').select('tag');
      if (cancelled) return;
      setAllCategories(cats || []);
      const distinct = Array.from(new Set((tagRows || []).map(r => r.tag))).sort();
      setAllTags(distinct);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const parentCategories = useMemo(
    () => allCategories.filter(c => !c.parent_id),
    [allCategories]
  );

  // Derive the active parent from the selected ids:
  //   - empty             → "All"
  //   - exactly one id with no parent_id  → that parent (no subs)
  //   - any ids with the same parent_id   → that parent (subs selected)
  const selectedParent = useMemo(() => {
    const ids = scope.categoryIds || [];
    if (!ids.length || !allCategories.length) return null;
    const rows = ids.map(id => allCategories.find(c => c.id === id)).filter(Boolean);
    if (!rows.length) return null;
    if (rows.length === 1 && !rows[0].parent_id) return rows[0];
    const parentIds = new Set(rows.map(r => r.parent_id).filter(Boolean));
    if (parentIds.size === 1) {
      return allCategories.find(c => c.id === [...parentIds][0]) || null;
    }
    return null;
  }, [scope.categoryIds, allCategories]);

  const subCategoriesOfParent = useMemo(() => {
    if (!selectedParent) return [];
    return allCategories.filter(c => c.parent_id === selectedParent.id);
  }, [allCategories, selectedParent]);

  // Selected sub-category ids = categoryIds intersected with the parent's children
  const selectedSubIds = useMemo(() => {
    if (!selectedParent) return [];
    const childIds = new Set(subCategoriesOfParent.map(c => c.id));
    return (scope.categoryIds || []).filter(id => childIds.has(id));
  }, [scope.categoryIds, selectedParent, subCategoriesOfParent]);

  // ── Mutators ──
  const setParent = (parentId) => {
    setShowParentMenu(false);
    if (!parentId) {
      onChange({ ...scope, categoryIds: [] });
    } else {
      onChange({ ...scope, categoryIds: [parentId] });
    }
  };

  const toggleSubCategory = (childId) => {
    if (!selectedParent) return;
    const current = new Set(selectedSubIds);
    if (current.has(childId)) current.delete(childId);
    else current.add(childId);
    const nextSubs = [...current];
    // If subs cleared, fall back to "all in parent" (parent id alone)
    const nextIds = nextSubs.length ? nextSubs : [selectedParent.id];
    onChange({ ...scope, categoryIds: nextIds });
  };

  const removeSubChip = (childId) => toggleSubCategory(childId);

  const removeTag = (t) => onChange({ ...scope, tags: scope.tags.filter(x => x !== t) });
  const addTag = (t) => {
    if (scope.tags.includes(t)) return;
    onChange({ ...scope, tags: [...scope.tags, t] });
    setShowTagPicker(false);
  };

  // ── Render ──
  const parentLabel = selectedParent?.name || 'All categories';
  const subSummary = selectedSubIds.length === 0
    ? `+ Sub-category`
    : selectedSubIds.length === 1
      ? subCategoriesOfParent.find(c => c.id === selectedSubIds[0])?.name || '1 selected'
      : `${selectedSubIds.length} sub-categories`;

  return (
    <div style={{
      background: '#131316',
      border: '1px solid #1f1f24',
      borderRadius: '10px',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flexWrap: 'wrap',
    }}>
      <Label>Scope</Label>

      {/* Parent dropdown */}
      <Label className="left-margin">Category</Label>
      <div style={{ position: 'relative' }}>
        <Select
          active={!!selectedParent}
          onClick={() => setShowParentMenu(v => !v)}
        >
          {parentLabel}
          <ChevronDown size={12} style={{ marginLeft: 2, opacity: 0.7 }} />
        </Select>
        {showParentMenu && (
          <PickerMenu onClose={() => setShowParentMenu(false)}>
            <PickerItem onClick={() => setParent(null)} active={!selectedParent}>
              All categories
            </PickerItem>
            {parentCategories.length === 0 && (
              <PickerItem disabled>No categories yet</PickerItem>
            )}
            {parentCategories.map(p => (
              <PickerItem
                key={p.id}
                onClick={() => setParent(p.id)}
                active={selectedParent?.id === p.id}
              >
                {p.name}
              </PickerItem>
            ))}
          </PickerMenu>
        )}
      </div>

      {/* Sub-category multi-select — only when a parent is picked */}
      {selectedParent && (
        <>
          <Label className="left-margin">Sub-category</Label>
          {selectedSubIds.map(id => {
            const c = subCategoriesOfParent.find(x => x.id === id);
            if (!c) return null;
            return (
              <Pill key={id} active onRemove={() => removeSubChip(id)}>
                {c.name}
              </Pill>
            );
          })}
          <div style={{ position: 'relative' }}>
            <Pill onClick={() => setShowSubMenu(v => !v)} dashed>
              <Plus size={12} /> {selectedSubIds.length ? 'Add sub-category' : subSummary}
            </Pill>
            {showSubMenu && (
              <PickerMenu onClose={() => setShowSubMenu(false)}>
                {subCategoriesOfParent.length === 0 && (
                  <PickerItem disabled>No sub-categories under {selectedParent.name}</PickerItem>
                )}
                {subCategoriesOfParent.map(c => (
                  <PickerItem
                    key={c.id}
                    onClick={() => toggleSubCategory(c.id)}
                    checked={selectedSubIds.includes(c.id)}
                  >
                    {c.name}
                  </PickerItem>
                ))}
              </PickerMenu>
            )}
          </div>
        </>
      )}

      <Label className="left-margin">Tags</Label>
      {scope.tags.map(t => (
        <Pill key={t} active onRemove={() => removeTag(t)}>{t}</Pill>
      ))}
      <div style={{ position: 'relative' }}>
        <Pill onClick={() => setShowTagPicker(v => !v)} dashed><Plus size={12} /> Tag</Pill>
        {showTagPicker && (
          <PickerMenu onClose={() => setShowTagPicker(false)}>
            {allTags.map(t => (
              <PickerItem key={t} onClick={() => addTag(t)}>{t}</PickerItem>
            ))}
            {allTags.length === 0 && <PickerItem disabled>No tags yet</PickerItem>}
          </PickerMenu>
        )}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Label>Window</Label>
        <select
          value={scope.windowDays}
          onChange={e => onChange({ ...scope, windowDays: Number(e.target.value) })}
          style={{
            background: '#18181c', border: '1px solid #232328', color: '#d4d4d8',
            padding: '5px 10px', borderRadius: '6px', fontSize: '12px',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────
// presentational sub-components
// ───────────────────────────────────────────
function Label({ children, className }) {
  return (
    <span style={{
      fontSize: '10px',
      fontWeight: 700,
      letterSpacing: '1.2px',
      color: '#555',
      textTransform: 'uppercase',
      marginRight: '2px',
      marginLeft: className === 'left-margin' ? '8px' : 0,
    }}>{children}</span>
  );
}

function Select({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 11px',
        borderRadius: '6px',
        background: active ? '#1e3a8a' : '#18181c',
        border: `1px solid ${active ? '#2563eb' : '#232328'}`,
        fontSize: '12px',
        color: active ? '#fff' : '#d4d4d8',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function Pill({ children, active, dashed, onClick, onRemove }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 11px',
        borderRadius: '6px',
        background: active ? '#1e3a8a' : '#1c1c20',
        border: dashed ? '1px dashed #2a2a30' : `1px solid ${active ? '#2563eb' : '#2a2a30'}`,
        fontSize: '12px',
        color: active ? '#fff' : '#c0c0c0',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'inherit',
      }}
    >
      {children}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            background: 'transparent', border: 'none', color: '#93b8e0',
            cursor: 'pointer', padding: 0, marginLeft: '2px', display: 'inline-flex',
          }}
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}

function PickerMenu({ children, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
      <div style={{
        position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 91,
        background: '#1c1c20', border: '1px solid #2a2a30', borderRadius: '8px',
        padding: '4px', minWidth: '240px', maxHeight: '320px', overflowY: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}>
        {children}
      </div>
    </>
  );
}

function PickerItem({ children, onClick, disabled, active, checked }) {
  const hasCheckbox = checked !== undefined;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        textAlign: 'left',
        padding: '7px 10px',
        background: active ? '#252528' : 'transparent',
        border: 'none',
        color: disabled ? '#555' : '#d4d4d8',
        fontSize: '12px',
        fontWeight: active ? 600 : 400,
        borderRadius: '5px',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background = '#252528')}
      onMouseLeave={e => !disabled && (e.currentTarget.style.background = active ? '#252528' : 'transparent')}
    >
      {hasCheckbox && (
        <span style={{
          width: 13, height: 13, borderRadius: 3,
          border: `1px solid ${checked ? '#3b82f6' : '#3a3a40'}`,
          background: checked ? '#3b82f6' : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {checked && (
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l2.5 2.5L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      )}
      {children}
    </button>
  );
}
