/**
 * AddChannelsModal — single + bulk add of competitor or non-OAuth client
 * channels. Paste URLs, @handles, or UC… IDs (one per line), pick the
 * kind, hit Add. Results show per-input outcome (added / skipped / error).
 *
 * Competitor adds can also assign a category, a client and tags in the
 * same step (pre-filled from the current scope). Assignments apply to the
 * newly added channels AND to inputs skipped as "already in DB", so
 * pasting an existing channel is a quick way to file it too.
 */
import {useEffect, useMemo, useState} from 'react';
import { supabase } from '../../services/supabaseClient';
import { createPortal } from 'react-dom';
import { Briefcase, Loader, Users, X,Check, AlertTriangle} from 'lucide-react';

export default function AddChannelsModal({ onClose, onAdded, scope }) {
  const [kind, setKind] = useState('competitor'); // 'competitor' | 'client'
  const [tier, setTier] = useState('tracked');
  const [text, setText] = useState('');
  const [clientName, setClientName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // ── Assign-on-add (competitor only) ──
  // Defaults come from the scope the user is looking at: filtered to a
  // client → pin to that client; filtered to exactly one category → file
  // under it.
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [tagVocab, setTagVocab] = useState([]);
  const [categoryId, setCategoryId] = useState(
    !scope?.uncategorized && scope?.categoryIds?.length === 1 ? scope.categoryIds[0] : ''
  );
  const [clientId, setClientId] = useState(scope?.clientId || '');
  const [tags, setTags] = useState([]);
  const [assignNote, setAssignNote] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, cl, t] = await Promise.all([
        supabase.from('categories').select('id, name, parent_id').order('name'),
        supabase.from('channels').select('id, name').eq('is_client', true).order('name'),
        supabase.from('tag_vocabulary').select('facet, value').order('facet').order('sort_order'),
      ]);
      if (cancelled) return;
      setCategories(c.data || []);
      setClients(cl.data || []);
      setTagVocab(t.data || []);
    })();
    return () => { cancelled = true; };
  }, []);

  // Parents, each followed by its sub-categories, for a single <select>.
  const categoryOptions = useMemo(() => {
    const parents = categories.filter(c => !c.parent_id);
    return parents.flatMap(p => [
      { id: p.id, label: p.name },
      ...categories.filter(c => c.parent_id === p.id).map(c => ({ id: c.id, label: `\u00A0\u00A0↳ ${c.name}` })),
    ]);
  }, [categories]);

  const tagsByFacet = useMemo(() => {
    const out = {};
    for (const t of tagVocab) (out[t.facet] ||= []).push(t.value);
    return out;
  }, [tagVocab]);

  const toggleTag = (v) => setTags(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  const hasAssignments = kind === 'competitor' && (categoryId || clientId || tags.length > 0);

  // Same writes the drawer / bulk sheet make. Manual category or tag
  // assignment locks classification so the auto-classifier won't undo it.
  const applyAssignments = async (channelIds) => {
    if (!channelIds.length || !hasAssignments) return null;
    const done = [];
    if (categoryId) {
      const { error: e } = await supabase.from('channel_categories').upsert(
        channelIds.map(channel_id => ({ channel_id, category_id: categoryId, assigned_by_classifier: false })),
        { onConflict: 'channel_id,category_id' }
      );
      if (e) throw new Error(`Category: ${e.message}`);
      done.push(categories.find(c => c.id === categoryId)?.name || 'category');
    }
    if (tags.length) {
      const rows = channelIds.flatMap(channel_id =>
        tags.map(tag => ({ channel_id, tag, assigned_by_classifier: false })));
      const { error: e } = await supabase.from('channel_tags').upsert(rows, { onConflict: 'channel_id,tag' });
      if (e) throw new Error(`Tags: ${e.message}`);
      done.push(tags.join(', '));
    }
    if (categoryId || tags.length) {
      await supabase.from('channels').update({ classification_locked: true }).in('id', channelIds);
    }
    if (clientId) {
      const { error: e } = await supabase.from('client_channels').upsert(
        channelIds.map(channel_id => ({ client_id: clientId, channel_id })),
        { onConflict: 'client_id,channel_id' }
      );
      if (e) throw new Error(`Client: ${e.message}`);
      done.push(`pinned to ${clients.find(c => c.id === clientId)?.name || 'client'}`);
    }
    return done;
  };

  const inputs = text.split('\n').map(s => s.trim()).filter(Boolean);
  const canSubmit = kind === 'competitor'
    ? inputs.length > 0
    : (clientName.trim().length > 0 || inputs.length > 0);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const resp = await fetch('/api/add-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs,
          kind,
          tier,
          ...(kind === 'client' ? { name: clientName.trim() } : {}),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setResult(data);
      setAssignNote(null);
      if (kind === 'competitor' && hasAssignments) {
        const ids = [
          ...data.added.map(r => r.id),
          ...data.skipped.map(r => r.channel_id),
        ].filter(Boolean);
        try {
          const done = await applyAssignments([...new Set(ids)]);
          if (done) setAssignNote({ ok: true, message: `${ids.length} channel${ids.length === 1 ? '' : 's'} → ${done.join(' · ')}` });
        } catch (e) {
          setAssignNote({ ok: false, message: `Added, but assigning failed — ${e.message}` });
        }
      }
      if (data.counts.added > 0 || hasAssignments) onAdded?.(data.added);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #1f1f24',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>Add channels</div>
            <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 2 }}>
              Paste YouTube URLs, @handles, or channel IDs — one per line.
            </div>
          </div>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 22px 22px' }}>
          {/* Kind toggle */}
          <SectionLabel>Type</SectionLabel>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <TypeButton
              active={kind === 'competitor'}
              onClick={() => setKind('competitor')}
              icon={<Users size={14} />}
              title="Competitor"
              subtitle="Public data only; counts toward scope"
            />
            <TypeButton
              active={kind === 'client'}
              onClick={() => setKind('client')}
              icon={<Briefcase size={14} />}
              title="Client (no OAuth)"
              subtitle="Public data; usable for client scoping"
            />
          </div>

          {/* Tier (competitor only) */}
          {kind === 'competitor' && (
            <>
              <SectionLabel>Tier</SectionLabel>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {['priority', 'tracked', 'archive'].map(t => (
                  <button
                    key={t}
                    onClick={() => setTier(t)}
                    style={{
                      padding: '5px 11px', borderRadius: 5,
                      background: tier === t ? 'var(--blue)' : 'var(--card)',
                      color: tier === t ? 'var(--ink)' : 'var(--muted)',
                      border: `1px solid ${tier === t ? 'var(--blue)' : 'var(--surface-high)'}`,
                      fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                      textTransform: 'capitalize',
                    }}
                  >{t}</button>
                ))}
              </div>
            </>
          )}

          {/* Client name (client only) */}
          {kind === 'client' && (
            <>
              <SectionLabel>Client name</SectionLabel>
              <input
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Acme Corp"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 6,
                  background: 'var(--bg)', border: '1px solid var(--border)', color: "var(--ink)",
                  fontSize: 13, fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box', marginBottom: 4,
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 14 }}>
                Used as the label in the Client picker and the "Pin to client" action.
              </div>
            </>
          )}

          {/* Inputs */}
          <SectionLabel>
            {kind === 'client' ? "Client's YouTube channel (optional)" : 'Competitor channels'}
          </SectionLabel>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={kind === 'client'
              ? 'Optional — leave blank for a label-only client.\nOr paste:\nhttps://youtube.com/@AcmeCorp'
              : 'https://youtube.com/@channel1\n@channel2\nUCxxxxxxxxxxxxxxxxxxxxx'}
            rows={kind === 'client' ? 3 : 6}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 6,
              background: 'var(--bg)', border: '1px solid var(--border)', color: "var(--ink)",
              fontSize: 13, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
              outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>
            {kind === 'competitor' && (
              <>{inputs.length} input{inputs.length === 1 ? '' : 's'} parsed. Channels are queued for the next sync immediately after add.</>
            )}
            {kind === 'client' && inputs.length === 0 && (
              <>Label-only client — no YouTube data attached. Use the "Pin to client" action in Landscape to assign competitors to it.</>
            )}
            {kind === 'client' && inputs.length > 0 && (
              <>YouTube channel will be fetched and stored alongside the client label. No OAuth required — public data only.</>
            )}
          </div>

          {kind === 'competitor' && (
            <div style={{ marginTop: 16 }}>
              <SectionLabel>Assign on add (optional)</SectionLabel>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={selectStyle}>
                  <option value="">No category</option>
                  {categoryOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <select value={clientId} onChange={e => setClientId(e.target.value)} style={selectStyle}>
                  <option value="">No client</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {Object.entries(tagsByFacet).map(([facet, values]) => (
                <div key={facet} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--faint)', width: 56, textTransform: 'capitalize' }}>{facet}</span>
                  {values.map(v => {
                    const on = tags.includes(v);
                    return (
                      <button key={v} onClick={() => toggleTag(v)} style={{
                        padding: '3px 9px', borderRadius: 999, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                        background: on ? 'rgba(0,209,255,0.12)' : 'var(--card)',
                        color: on ? 'var(--accent-text)' : 'var(--muted)',
                        border: `1px solid ${on ? 'var(--blue)' : 'var(--surface-high)'}`,
                      }}>{v}</button>
                    );
                  })}
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>
                Also applies to pasted channels that are already tracked.
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: '8px 12px', marginTop: 12,
              background: 'rgba(255,85,64,0.10)', border: '1px solid rgba(255,85,64,0.30)',
              borderRadius: 6, color: "var(--neg-text)", fontSize: 12,
            }}>{error}</div>
          )}

          {result && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 7, background: 'var(--bg)', border: '1px solid #232328' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                <strong style={{ color: "var(--pos-text)" }}>✓ {result.counts.added} added</strong>
                {result.counts.skipped > 0 && <> · <strong style={{ color: "var(--warn-text)" }}>{result.counts.skipped} skipped</strong></>}
                {result.counts.errors > 0 && <> · <strong style={{ color: "var(--neg-text)" }}>{result.counts.errors} errors</strong></>}
              </div>
              <ResultList icon={Check} color="#dcff45" label="Added" rows={result.added.map(r => `${r.name} — ${r.youtube_channel_id}`)} />
              <ResultList icon={AlertTriangle} color="#fbbf24" label="Skipped" rows={result.skipped.map(r => `${r.input}: ${r.reason}`)} />
              <ResultList icon={AlertTriangle} color="#ff8375" label="Errors" rows={result.errors.map(r => `${r.input}: ${r.reason}`)} />
              {assignNote && (
                <div style={{ marginTop: 8, fontSize: 12, color: assignNote.ok ? 'var(--pos-text)' : 'var(--neg-text)' }}>
                  {assignNote.ok ? '✓ ' : ''}{assignNote.message}
                </div>
              )}
            </div>
          )}

          {/* Footer actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={onClose} style={secondaryBtn}>Close</button>
            <button onClick={submit} disabled={busy || !canSubmit} style={primaryBtn(busy || !canSubmit)}>
              {busy
                ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite', marginRight: 6, verticalAlign: '-1px' }} />Adding…</>
                : kind === 'client' && inputs.length === 0
                  ? 'Add client'
                  : `Add ${inputs.length || ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TypeButton({ active, onClick, icon, title, subtitle }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 12px', borderRadius: 7,
      background: active ? 'rgba(0,209,255,0.10)' : 'var(--bg)',
      border: `1px solid ${active ? 'var(--blue)' : 'var(--surface-high)'}`,
      cursor: 'pointer', fontFamily: 'inherit',
      textAlign: 'left',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: active ? 'var(--accent-text)' : 'var(--text)',
        fontSize: 13, fontWeight: 600, marginBottom: 2,
      }}>{icon}{title}</div>
      <div style={{ fontSize: 11, color: 'var(--outline)' }}>{subtitle}</div>
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: 'var(--faint)',
      textTransform: 'uppercase', letterSpacing: '0.6px',
      marginBottom: 6, marginTop: 2,
    }}>{children}</div>
  );
}

function ResultList({ icon: Icon, color, label, rows }) {
  if (!rows?.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
        {label} ({rows.length})
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {rows.slice(0, 20).map((r, i) => (
          <li key={i} style={{ fontSize: 11, color: 'var(--text)', padding: '2px 0', display: 'flex', gap: 6 }}>
            <Icon size={11} style={{ color, flexShrink: 0, marginTop: 3 }} /> {r}
          </li>
        ))}
        {rows.length > 20 && (
          <li style={{ fontSize: 11, color: 'var(--faint)', padding: '2px 0' }}>… and {rows.length - 20} more</li>
        )}
      </ul>
    </div>
  );
}

const selectStyle = {
  flex: '1 1 200px', minWidth: 0, padding: '8px 10px', borderRadius: 6,
  background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)',
  fontSize: 13, fontFamily: 'inherit', outline: 'none',
};

const iconBtn = {
  background: 'transparent', border: 'none', color: 'var(--outline)',
  cursor: 'pointer', padding: 4, borderRadius: 4,
};

const primaryBtn = (disabled) => ({
  display: 'inline-flex', alignItems: 'center',
  padding: '7px 14px', borderRadius: 6,
  background: disabled ? 'var(--card)' : 'var(--blue)',
  color: disabled ? 'var(--faint)' : 'var(--ink)',
  border: 'none', cursor: disabled ? 'wait' : 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
});

const secondaryBtn = {
  padding: '7px 14px', borderRadius: 6,
  background: 'var(--card)', color: 'var(--text)',
  border: '1px solid #232328', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
};
