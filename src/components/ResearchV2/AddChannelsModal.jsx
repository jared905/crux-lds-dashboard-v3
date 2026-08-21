/**
 * AddChannelsModal — single + bulk add of competitor or non-OAuth client
 * channels. Paste URLs, @handles, or UC… IDs (one per line), pick the
 * kind, hit Add. Results show per-input outcome (added / skipped / error).
 */
import {useState} from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, Loader, Users, X,Check, AlertTriangle} from 'lucide-react';

export default function AddChannelsModal({ onClose, onAdded }) {
  const [kind, setKind] = useState('competitor'); // 'competitor' | 'client'
  const [tier, setTier] = useState('tracked');
  const [text, setText] = useState('');
  const [clientName, setClientName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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
      if (data.counts.added > 0) onAdded?.(data.added);
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
