/**
 * LandscapeBulkSheet — bottom drawer that appears when channels are selected
 * via the row checkboxes. Hosts bulk actions: change category, change tier,
 * add tag, delete, clear selection.
 *
 * Mounted at the bottom of the viewport via fixed positioning. Slides up
 * on mount. Mutations write directly through supabase; caller passes
 * onChanged() to refresh the table data after each action.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Folder, Trash2, Tag as TagIcon, Layers, ChevronDown, Loader,
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

const TIER_OPTIONS = [
  { id: 'priority', label: 'Priority' },
  { id: 'tracked',  label: 'Tracked' },
  { id: 'archive',  label: 'Archive' },
];

export default function LandscapeBulkSheet({ selectedIds, channels, onClear, onChanged }) {
  const [openMenu, setOpenMenu] = useState(null); // 'category' | 'tier' | 'tag' | null
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [categories, setCategories] = useState([]);
  const [tagVocab, setTagVocab] = useState([]);
  const [pickerParent, setPickerParent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, t] = await Promise.all([
        supabase.from('categories').select('id, name, slug, parent_id').order('name'),
        supabase.from('tag_vocabulary').select('facet, value, description').order('facet').order('sort_order'),
      ]);
      if (!cancelled) {
        setCategories(c.data || []);
        setTagVocab(t.data || []);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const parents = useMemo(() => categories.filter(c => !c.parent_id), [categories]);
  const subsOf = (pid) => categories.filter(c => c.parent_id === pid);
  const ids = useMemo(() => [...selectedIds], [selectedIds]);
  const count = ids.length;

  const flash = (ok, message) => {
    setStatus({ ok, message });
    setTimeout(() => setStatus(null), 5000);
  };

  // ── Actions ──
  const assignCategory = async (cat) => {
    if (busy) return;
    setBusy(true);
    try {
      const rows = ids.map(channel_id => ({
        channel_id, category_id: cat.id, assigned_by_classifier: false,
      }));
      const { error } = await supabase
        .from('channel_categories')
        .upsert(rows, { onConflict: 'channel_id,category_id' });
      if (error) throw error;
      // Lock these channels so the classifier doesn't overwrite
      await supabase
        .from('channels')
        .update({ classification_locked: true })
        .in('id', ids);
      flash(true, `${count} channel${count === 1 ? '' : 's'} → ${cat.name}`);
      setOpenMenu(null); setPickerParent(null);
      onChanged?.();
    } catch (err) {
      flash(false, err.message);
    } finally { setBusy(false); }
  };

  const setTier = async (tier) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('channels').update({ tier }).in('id', ids);
      if (error) throw error;
      flash(true, `${count} channel${count === 1 ? '' : 's'} → ${tier}`);
      setOpenMenu(null);
      onChanged?.();
    } catch (err) {
      flash(false, err.message);
    } finally { setBusy(false); }
  };

  const addTag = async (tagValue) => {
    if (busy) return;
    setBusy(true);
    try {
      const rows = ids.map(channel_id => ({
        channel_id, tag: tagValue, assigned_by_classifier: false,
      }));
      const { error } = await supabase
        .from('channel_tags')
        .upsert(rows, { onConflict: 'channel_id,tag' });
      if (error) throw error;
      await supabase.from('channels').update({ classification_locked: true }).in('id', ids);
      flash(true, `Tagged ${count} channel${count === 1 ? '' : 's'} · ${tagValue}`);
      setOpenMenu(null);
      onChanged?.();
    } catch (err) {
      flash(false, err.message);
    } finally { setBusy(false); }
  };

  const deleteChannels = async () => {
    if (busy) return;
    const sample = ids.slice(0, 3).map(id => channels.find(c => c.id === id)?.name).filter(Boolean).join(', ');
    const more = count > 3 ? ` and ${count - 3} more` : '';
    if (!confirm(`Permanently delete ${count} channel${count === 1 ? '' : 's'} (${sample}${more})?\n\nAll videos, snapshots, alerts, and category assignments will cascade-delete. This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from('channels').delete().in('id', ids);
      if (error) throw error;
      flash(true, `Deleted ${count} channel${count === 1 ? '' : 's'}`);
      onClear();
      onChanged?.();
    } catch (err) {
      flash(false, err.message);
    } finally { setBusy(false); }
  };

  if (count === 0) return null;

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0,
      zIndex: 90,
      animation: 'slideUp 220ms ease-out',
    }}>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div style={{
        margin: '0 auto', maxWidth: 1500,
        padding: '14px 28px',
        background: 'linear-gradient(180deg, #15151b, #0e0e12)',
        borderTop: '1px solid #2a2a30',
        borderRadius: '14px 14px 0 0',
        boxShadow: '0 -10px 32px rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
          <span style={{
            padding: '4px 10px', borderRadius: 20,
            background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)',
            color: '#60a5fa', fontSize: 12, fontWeight: 700,
          }}>{count} selected</span>
          <button onClick={onClear} style={iconBtn} title="Clear selection">
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          {/* Category */}
          <div style={{ position: 'relative' }}>
            <ActionButton onClick={() => { setOpenMenu(openMenu === 'category' ? null : 'category'); setPickerParent(null); }} active={openMenu === 'category'}>
              <Folder size={13} /> Assign category <ChevronDown size={11} style={{ opacity: 0.7 }} />
            </ActionButton>
            {openMenu === 'category' && (
              <Popover onClose={() => { setOpenMenu(null); setPickerParent(null); }}>
                {!pickerParent ? (
                  <>
                    <PopHeader>Pick a parent</PopHeader>
                    {parents.map(p => (
                      <PopRow key={p.id} onClick={() => setPickerParent(p)}>
                        {p.name}
                        <ChevronDown size={10} style={{ transform: 'rotate(-90deg)', opacity: 0.6 }} />
                      </PopRow>
                    ))}
                  </>
                ) : (
                  <>
                    <PopHeader>
                      <button onClick={() => setPickerParent(null)} style={linkBtn}>← Back</button> {pickerParent.name}
                    </PopHeader>
                    <PopRow onClick={() => assignCategory(pickerParent)}>
                      <span style={{ color: '#a78bfa' }}>+ Parent only ({pickerParent.name})</span>
                    </PopRow>
                    {subsOf(pickerParent.id).length === 0 && (
                      <PopRow disabled>No sub-categories</PopRow>
                    )}
                    {subsOf(pickerParent.id).map(s => (
                      <PopRow key={s.id} onClick={() => assignCategory(s)}>{s.name}</PopRow>
                    ))}
                  </>
                )}
              </Popover>
            )}
          </div>

          {/* Tier */}
          <div style={{ position: 'relative' }}>
            <ActionButton onClick={() => setOpenMenu(openMenu === 'tier' ? null : 'tier')} active={openMenu === 'tier'}>
              <Layers size={13} /> Set tier <ChevronDown size={11} style={{ opacity: 0.7 }} />
            </ActionButton>
            {openMenu === 'tier' && (
              <Popover onClose={() => setOpenMenu(null)}>
                <PopHeader>Set tier on {count} channel{count === 1 ? '' : 's'}</PopHeader>
                {TIER_OPTIONS.map(t => (
                  <PopRow key={t.id} onClick={() => setTier(t.id)}>{t.label}</PopRow>
                ))}
              </Popover>
            )}
          </div>

          {/* Tag */}
          <div style={{ position: 'relative' }}>
            <ActionButton onClick={() => setOpenMenu(openMenu === 'tag' ? null : 'tag')} active={openMenu === 'tag'}>
              <TagIcon size={13} /> Add tag <ChevronDown size={11} style={{ opacity: 0.7 }} />
            </ActionButton>
            {openMenu === 'tag' && (
              <Popover onClose={() => setOpenMenu(null)}>
                {['identity','format','cadence','style'].map(facet => {
                  const vals = tagVocab.filter(t => t.facet === facet);
                  if (!vals.length) return null;
                  return (
                    <React.Fragment key={facet}>
                      <PopHeader>{facet}</PopHeader>
                      {vals.map(t => (
                        <PopRow key={t.value} onClick={() => addTag(t.value)}>
                          <div>
                            <div>{t.value}</div>
                            {t.description && <div style={{ fontSize: 10, color: '#666' }}>{t.description}</div>}
                          </div>
                        </PopRow>
                      ))}
                    </React.Fragment>
                  );
                })}
              </Popover>
            )}
          </div>

          {/* Delete */}
          <ActionButton onClick={deleteChannels} danger>
            <Trash2 size={13} /> Delete
          </ActionButton>
        </div>

        <div style={{ minWidth: 200, textAlign: 'right' }}>
          {busy && <Loader size={14} style={{ animation: 'spin 1s linear infinite', color: '#888' }} />}
          {status && !busy && (
            <span style={{
              fontSize: 12, fontWeight: 500,
              color: status.ok ? '#34d399' : '#f87171',
            }}>
              {status.ok ? '✓ ' : '✕ '}{status.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── presentational ───
function ActionButton({ children, onClick, active, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 12px', borderRadius: 7,
        background: active
          ? '#252528'
          : danger
            ? 'rgba(239,68,68,0.08)'
            : '#18181c',
        color: danger ? '#fca5a5' : '#d4d4d8',
        border: `1px solid ${active ? '#3a3a40' : danger ? 'rgba(239,68,68,0.30)' : '#232328'}`,
        fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >{children}</button>
  );
}

function Popover({ children, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 91 }} />
      <div style={{
        position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 92,
        background: '#1c1c20', border: '1px solid #2a2a30', borderRadius: 8,
        padding: 4, minWidth: 240, maxHeight: 360, overflowY: 'auto',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
      }}>{children}</div>
    </>
  );
}

function PopHeader({ children }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: '#666',
      textTransform: 'uppercase', letterSpacing: '0.6px',
      padding: '8px 10px 4px',
    }}>{children}</div>
  );
}

function PopRow({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', textAlign: 'left',
        padding: '8px 10px', background: 'transparent', border: 'none',
        color: disabled ? '#555' : '#d4d4d8', fontSize: 12,
        borderRadius: 5, cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit', gap: 8,
      }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background = '#252528')}
      onMouseLeave={e => !disabled && (e.currentTarget.style.background = 'transparent')}
    >{children}</button>
  );
}

const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 4, borderRadius: 4,
  background: 'transparent', border: '1px solid #232328',
  color: '#888', cursor: 'pointer',
};

const linkBtn = {
  background: 'transparent', border: 'none', color: '#60a5fa',
  cursor: 'pointer', fontSize: 11, padding: 0, marginRight: 6,
  fontFamily: 'inherit',
};
