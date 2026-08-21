/**
 * TaxonomyManager — modal for creating + deleting parent and sub-categories.
 * Opened from the ScopeBar parent dropdown ("Manage categories").
 */
import {useEffect, useState} from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../services/supabaseClient';
import { Loader, Plus, Trash2, X } from 'lucide-react';

function slugify(name) {
  return (name || '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function TaxonomyManager({ onClose, onChanged }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newParentName, setNewParentName] = useState('');
  const [addingSubFor, setAddingSubFor] = useState(null); // parent id
  const [newSubName, setNewSubName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('categories')
      .select('id, name, slug, parent_id, sort_order')
      .order('parent_id', { nullsFirst: true })
      .order('name');
    setCategories(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const parents = categories.filter(c => !c.parent_id);
  const subsOf = (pid) => categories.filter(c => c.parent_id === pid);

  const addParent = async () => {
    if (!newParentName.trim() || busy) return;
    setBusy(true); setError(null);
    const slug = slugify(newParentName);
    if (!slug) { setError('Invalid name'); setBusy(false); return; }
    const { error: insertErr } = await supabase.from('categories').insert({
      name: newParentName.trim(), slug, parent_id: null,
      color: 'var(--blue)', icon: 'folder', sort_order: parents.length + 1,
    });
    setBusy(false);
    if (insertErr) { setError(insertErr.message); return; }
    setNewParentName('');
    await load();
    onChanged?.();
  };

  const addSub = async (parent) => {
    if (!newSubName.trim() || busy) return;
    setBusy(true); setError(null);
    const slug = slugify(`${parent.slug}-${newSubName}`);
    if (!slug) { setError('Invalid name'); setBusy(false); return; }
    const { error: insertErr } = await supabase.from('categories').insert({
      name: newSubName.trim(), slug, parent_id: parent.id,
      color: 'var(--blue-pale)', icon: 'folder', sort_order: subsOf(parent.id).length + 1,
    });
    setBusy(false);
    if (insertErr) { setError(insertErr.message); return; }
    setNewSubName('');
    setAddingSubFor(null);
    await load();
    onChanged?.();
  };

  const remove = async (cat) => {
    const hasSubs = !cat.parent_id && subsOf(cat.id).length > 0;
    const warning = hasSubs
      ? `Delete "${cat.name}" AND its ${subsOf(cat.id).length} sub-categories? All channel assignments under them will be removed.`
      : `Delete "${cat.name}"? All channel assignments will be removed.`;
    if (!confirm(warning)) return;
    setBusy(true); setError(null);
    const { error: delErr } = await supabase.from('categories').delete().eq('id', cat.id);
    setBusy(false);
    if (delErr) { setError(delErr.message); return; }
    await load();
    onChanged?.();
  };

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{
        width: 'min(620px, 100%)', maxHeight: '85vh', overflowY: 'auto',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12,
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #1f1f24',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>Manage taxonomy</div>
            <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 2 }}>
              Create or remove parent categories and their sub-categories. Deleting removes channel assignments.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--outline)',
            cursor: 'pointer', padding: 4, borderRadius: 4,
          }}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px 22px 22px' }}>
          {error && (
            <div style={{
              padding: '8px 12px', marginBottom: 10,
              background: 'rgba(255,85,64,0.10)', border: '1px solid rgba(255,85,64,0.30)',
              borderRadius: 6, color: "var(--neg-text)", fontSize: 12,
            }}>{error}</div>
          )}

          {/* New parent */}
          <div style={{
            display: 'flex', gap: 6, marginBottom: 14,
            padding: 10, background: 'var(--bg)', border: '1px solid #1f1f24', borderRadius: 7,
          }}>
            <input
              value={newParentName}
              onChange={e => setNewParentName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addParent(); }}
              placeholder="New parent category name…"
              style={inputStyle}
            />
            <button onClick={addParent} disabled={busy || !newParentName.trim()} style={primaryBtn(busy)}>
              <Plus size={12} /> Add parent
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--faint)' }}>
              <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : parents.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--faint)', fontSize: 13 }}>
              No categories yet. Add a parent above to start.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {parents.map(p => (
                <div key={p.id} style={{
                  border: '1px solid #1f1f24', borderRadius: 8,
                  background: 'var(--bg)',
                }}>
                  <div style={{
                    padding: '10px 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: subsOf(p.id).length ? '1px solid #1f1f24' : 'none',
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 1 }}>{p.slug}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setAddingSubFor(addingSubFor === p.id ? null : p.id)} style={smallBtn}>
                        <Plus size={11} /> Sub
                      </button>
                      <button onClick={() => remove(p)} style={dangerBtn}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {addingSubFor === p.id && (
                    <div style={{
                      padding: 10, display: 'flex', gap: 6,
                      borderBottom: subsOf(p.id).length ? '1px solid #1f1f24' : 'none',
                      background: 'var(--bg)',
                    }}>
                      <input
                        autoFocus
                        value={newSubName}
                        onChange={e => setNewSubName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addSub(p); }}
                        placeholder={`New sub under ${p.name}…`}
                        style={inputStyle}
                      />
                      <button onClick={() => addSub(p)} disabled={busy || !newSubName.trim()} style={primaryBtn(busy)}>
                        Add
                      </button>
                    </div>
                  )}

                  {subsOf(p.id).map(s => (
                    <div key={s.id} style={{
                      padding: '8px 12px 8px 24px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      borderTop: '1px solid #1f1f24',
                      fontSize: 13, color: 'var(--text)',
                    }}>
                      <div>
                        <div>{s.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 1 }}>{s.slug}</div>
                      </div>
                      <button onClick={() => remove(s)} style={dangerBtn}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

const inputStyle = {
  flex: 1, padding: '6px 10px', borderRadius: 5,
  background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)',
  fontSize: 13, fontFamily: 'inherit', outline: 'none',
};

const primaryBtn = (busy) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 12px', borderRadius: 5,
  background: busy ? 'var(--card)' : 'var(--blue)', color: busy ? 'var(--faint)' : 'var(--ink)',
  border: 'none', cursor: busy ? 'wait' : 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
});

const smallBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 3,
  padding: '4px 8px', borderRadius: 4,
  background: 'var(--card)', color: 'var(--text)',
  border: '1px solid #232328', cursor: 'pointer',
  fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
};

const dangerBtn = {
  padding: 5, borderRadius: 4,
  background: 'transparent', color: 'var(--outline)',
  border: '1px solid #232328', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center',
};
