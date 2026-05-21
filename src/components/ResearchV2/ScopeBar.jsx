import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X, ChevronDown, Settings2, Search, Briefcase } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import TaxonomyManager from './TaxonomyManager.jsx';

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
  const [tagOptions, setTagOptions] = useState([]); // [{ facet, value, description }]
  const [allClients, setAllClients] = useState([]);
  const [showParentMenu, setShowParentMenu] = useState(false);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showClientMenu, setShowClientMenu] = useState(false);
  const [showTaxonomyManager, setShowTaxonomyManager] = useState(false);
  const [taxonomyVersion, setTaxonomyVersion] = useState(0);

  // Load categories + tag vocabulary + any custom tags actually in use
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!supabase) return;
      const [catsRes, vocabRes, usedRes, clientsRes] = await Promise.all([
        supabase.from('categories').select('id, name, slug, parent_id').order('name', { ascending: true }),
        supabase.from('tag_vocabulary').select('facet, value, description').order('facet').order('sort_order'),
        supabase.from('channel_tags').select('tag'),
        supabase.from('channels').select('id, name, thumbnail_url').eq('is_client', true).order('name'),
      ]);
      if (cancelled) return;
      setAllCategories(catsRes.data || []);
      setAllClients(clientsRes.data || []);

      const vocab = vocabRes.data || [];
      const known = new Set(vocab.map(v => v.value));
      const extras = Array.from(new Set((usedRes.data || []).map(r => r.tag)))
        .filter(t => !known.has(t))
        .sort()
        .map(t => ({ facet: 'custom', value: t, description: null }));
      setTagOptions([...vocab, ...extras]);
    };
    load();
    return () => { cancelled = true; };
  }, [taxonomyVersion]);

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
  // Picking any parent clears the uncategorized flag and vice versa —
  // the two are mutually exclusive (uncategorized means "no category",
  // a parent means "in this category subtree").
  const setParent = (parentId) => {
    setShowParentMenu(false);
    if (!parentId) {
      onChange({ ...scope, categoryIds: [], uncategorized: false });
    } else {
      onChange({ ...scope, categoryIds: [parentId], uncategorized: false });
    }
  };

  const setUncategorized = () => {
    setShowParentMenu(false);
    onChange({ ...scope, categoryIds: [], uncategorized: true });
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
    // Toggle, multi-select. Keep the menu open so user can stack tags.
    const next = scope.tags.includes(t)
      ? scope.tags.filter(x => x !== t)
      : [...scope.tags, t];
    onChange({ ...scope, tags: next });
  };

  const setClient = (clientId) => {
    onChange({ ...scope, clientId });
    setShowClientMenu(false);
  };
  const selectedClient = scope.clientId ? allClients.find(c => c.id === scope.clientId) : null;

  // ── Render ──
  const isUncategorized = !!scope.uncategorized && !selectedParent;
  const parentLabel = isUncategorized
    ? 'Uncategorized'
    : (selectedParent?.name || 'All categories');
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

      {/* Client picker — scopes lenses to channels in client_channels for this client */}
      <Label className="left-margin">Client</Label>
      <div style={{ position: 'relative' }}>
        <Select
          active={!!selectedClient}
          onClick={() => setShowClientMenu(v => !v)}
        >
          <Briefcase size={11} style={{ opacity: 0.7, marginRight: 2 }} />
          {selectedClient?.name || 'All clients'}
          <ChevronDown size={12} style={{ marginLeft: 2, opacity: 0.7 }} />
        </Select>
        {showClientMenu && (
          <PickerMenu onClose={() => setShowClientMenu(false)}>
            <PickerItem onClick={() => setClient(null)} active={!selectedClient}>
              All clients
            </PickerItem>
            {allClients.length === 0 && (
              <PickerItem disabled>No clients yet</PickerItem>
            )}
            {allClients.map(c => (
              <PickerItem
                key={c.id}
                onClick={() => setClient(c.id)}
                active={selectedClient?.id === c.id}
              >
                {c.name}
              </PickerItem>
            ))}
          </PickerMenu>
        )}
      </div>

      {/* Parent dropdown */}
      <Label className="left-margin">Category</Label>
      <div style={{ position: 'relative' }}>
        <Select
          active={!!selectedParent || isUncategorized}
          onClick={() => setShowParentMenu(v => !v)}
        >
          {parentLabel}
          <ChevronDown size={12} style={{ marginLeft: 2, opacity: 0.7 }} />
        </Select>
        {showParentMenu && (
          <PickerMenu onClose={() => setShowParentMenu(false)}>
            <PickerItem onClick={() => setParent(null)} active={!selectedParent && !isUncategorized}>
              All categories
            </PickerItem>
            <PickerItem onClick={setUncategorized} active={isUncategorized}>
              <span style={{ color: '#fbbf24' }}>Uncategorized</span>
              <span style={{ color: '#666', fontSize: 11, marginLeft: 6 }}>— channels with no category</span>
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
            <div style={{ borderTop: '1px solid #232328', marginTop: 4, paddingTop: 4 }}>
              <PickerItem onClick={() => { setShowParentMenu(false); setShowTaxonomyManager(true); }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#60a5fa' }}>
                  <Settings2 size={11} /> Manage categories…
                </span>
              </PickerItem>
            </div>
          </PickerMenu>
        )}
      </div>

      {/* Sub-category multi-select — only when a parent is picked (not for Uncategorized) */}
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
            {tagOptions.length === 0 && <PickerItem disabled>No tags yet</PickerItem>}
            {(() => {
              // Group tag options by facet, with a small header per facet
              const groups = {};
              for (const t of tagOptions) (groups[t.facet] ||= []).push(t);
              const facetOrder = ['identity', 'format', 'cadence', 'style', 'custom'];
              return facetOrder
                .filter(f => groups[f]?.length)
                .map(facet => (
                  <React.Fragment key={facet}>
                    <div style={{
                      fontSize: 9, fontWeight: 700, color: '#555',
                      textTransform: 'uppercase', letterSpacing: '0.6px',
                      padding: '6px 10px 2px',
                    }}>{facet}</div>
                    {groups[facet].map(t => (
                      <PickerItem
                        key={t.value}
                        onClick={() => addTag(t.value)}
                        checked={scope.tags.includes(t.value)}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>{t.value}</span>
                          {t.description && (
                            <span style={{ fontSize: 10, color: '#666', marginTop: 1 }}>{t.description}</span>
                          )}
                        </div>
                      </PickerItem>
                    ))}
                  </React.Fragment>
                ));
            })()}
          </PickerMenu>
        )}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 6,
          background: '#18181c', border: '1px solid #232328',
        }}>
          <Search size={11} style={{ color: '#666' }} />
          <input
            value={scope.search || ''}
            onChange={e => onChange({ ...scope, search: e.target.value })}
            placeholder="Search channels…"
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: '#d4d4d8', fontSize: 12, width: 160, fontFamily: 'inherit',
            }}
          />
          {scope.search && (
            <button
              onClick={() => onChange({ ...scope, search: '' })}
              style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
              title="Clear search"
            >
              <X size={11} />
            </button>
          )}
        </div>
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

      {showTaxonomyManager && (
        <TaxonomyManager
          onClose={() => setShowTaxonomyManager(false)}
          onChanged={() => setTaxonomyVersion(v => v + 1)}
        />
      )}
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
