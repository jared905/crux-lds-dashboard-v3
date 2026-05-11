import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

/**
 * Sticky scope picker — controls all four lenses.
 * Renders filter chips for categories, tags, tiers, and an inline window selector.
 */
export default function ScopeBar({ scope, onChange }) {
  const [allCategories, setAllCategories] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);

  // Load categories + distinct tags once
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!supabase) return;
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id')
        .order('parent_id', { nullsFirst: true })
        .order('sort_order', { ascending: true });
      const { data: tagRows } = await supabase.from('channel_tags').select('tag');
      if (cancelled) return;
      setAllCategories(cats || []);
      const distinct = Array.from(new Set((tagRows || []).map(r => r.tag))).sort();
      setAllTags(distinct);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const selectedCats = allCategories.filter(c => scope.categoryIds?.includes(c.id));

  const removeCategory = (id) => onChange({ ...scope, categoryIds: scope.categoryIds.filter(x => x !== id) });
  const removeTag = (t) => onChange({ ...scope, tags: scope.tags.filter(x => x !== t) });
  const addCategory = (id) => {
    if (scope.categoryIds.includes(id)) return;
    onChange({ ...scope, categoryIds: [...scope.categoryIds, id] });
    setShowCategoryPicker(false);
  };
  const addTag = (t) => {
    if (scope.tags.includes(t)) return;
    onChange({ ...scope, tags: [...scope.tags, t] });
    setShowTagPicker(false);
  };

  const labelByCategory = (cat) => {
    if (!cat.parent_id) return cat.name;
    const parent = allCategories.find(c => c.id === cat.parent_id);
    return parent ? `${parent.name} → ${cat.name}` : cat.name;
  };

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

      <Label className="left-margin">Category</Label>
      {selectedCats.map(cat => (
        <Pill key={cat.id} active onRemove={() => removeCategory(cat.id)}>
          {labelByCategory(cat)}
        </Pill>
      ))}
      <div style={{ position: 'relative' }}>
        <Pill onClick={() => setShowCategoryPicker(v => !v)} dashed><Plus size={12} /> Category</Pill>
        {showCategoryPicker && (
          <PickerMenu onClose={() => setShowCategoryPicker(false)}>
            {allCategories.map(c => (
              <PickerItem key={c.id} onClick={() => addCategory(c.id)}>
                {labelByCategory(c)}
              </PickerItem>
            ))}
            {allCategories.length === 0 && <PickerItem disabled>No categories yet</PickerItem>}
          </PickerMenu>
        )}
      </div>

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
        padding: '4px', minWidth: '220px', maxHeight: '320px', overflowY: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}>
        {children}
      </div>
    </>
  );
}

function PickerItem({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '7px 10px', background: 'transparent', border: 'none',
        color: disabled ? '#555' : '#d4d4d8', fontSize: '12px',
        borderRadius: '5px', cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background = '#252528')}
      onMouseLeave={e => !disabled && (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}
