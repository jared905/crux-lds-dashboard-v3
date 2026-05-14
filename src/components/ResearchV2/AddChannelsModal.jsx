/**
 * AddChannelsModal — single + bulk add of competitor or non-OAuth client
 * channels. Paste URLs, @handles, or UC… IDs (one per line), pick the
 * kind, hit Add. Results show per-input outcome (added / skipped / error).
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader, Users, Briefcase, Check, AlertTriangle } from 'lucide-react';

export default function AddChannelsModal({ onClose, onAdded }) {
  const [kind, setKind] = useState('competitor'); // 'competitor' | 'client'
  const [tier, setTier] = useState('tracked');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const inputs = text.split('\n').map(s => s.trim()).filter(Boolean);

  const submit = async () => {
    if (!inputs.length || busy) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const resp = await fetch('/api/add-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs, kind, tier }),
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
        background: '#131316', border: '1px solid #2a2a30', borderRadius: 12,
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #1f1f24',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: '#131316', zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Add channels</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
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
                      background: tier === t ? '#2563eb' : '#18181c',
                      color: tier === t ? '#fff' : '#a1a1aa',
                      border: `1px solid ${tier === t ? '#2563eb' : '#232328'}`,
                      fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                      textTransform: 'capitalize',
                    }}
                  >{t}</button>
                ))}
              </div>
            </>
          )}

          {/* Inputs */}
          <SectionLabel>{kind === 'client' ? 'Client channel' : 'Competitor channels'}</SectionLabel>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={kind === 'client'
              ? 'https://youtube.com/@AcmeCorp\n(client-side: just one line, but bulk works too)'
              : 'https://youtube.com/@channel1\n@channel2\nUCxxxxxxxxxxxxxxxxxxxxx'}
            rows={6}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 6,
              background: '#0e0e12', border: '1px solid #2a2a30', color: '#fff',
              fontSize: 13, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
              outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
            {inputs.length} input{inputs.length === 1 ? '' : 's'} parsed.
            {kind === 'competitor' && ' Channels are queued for the next sync immediately after add.'}
            {kind === 'client' && ' No OAuth required; public data only (no CTR / retention / watch hours).'}
          </div>

          {error && (
            <div style={{
              padding: '8px 12px', marginTop: 12,
              background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)',
              borderRadius: 6, color: '#f87171', fontSize: 12,
            }}>{error}</div>
          )}

          {result && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 7, background: '#15151a', border: '1px solid #232328' }}>
              <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 8 }}>
                <strong style={{ color: '#34d399' }}>✓ {result.counts.added} added</strong>
                {result.counts.skipped > 0 && <> · <strong style={{ color: '#fbbf24' }}>{result.counts.skipped} skipped</strong></>}
                {result.counts.errors > 0 && <> · <strong style={{ color: '#f87171' }}>{result.counts.errors} errors</strong></>}
              </div>
              <ResultList icon={Check} color="#34d399" label="Added" rows={result.added.map(r => `${r.name} — ${r.youtube_channel_id}`)} />
              <ResultList icon={AlertTriangle} color="#fbbf24" label="Skipped" rows={result.skipped.map(r => `${r.input}: ${r.reason}`)} />
              <ResultList icon={AlertTriangle} color="#f87171" label="Errors" rows={result.errors.map(r => `${r.input}: ${r.reason}`)} />
            </div>
          )}

          {/* Footer actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={onClose} style={secondaryBtn}>Close</button>
            <button onClick={submit} disabled={busy || !inputs.length} style={primaryBtn(busy || !inputs.length)}>
              {busy
                ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite', marginRight: 6, verticalAlign: '-1px' }} />Adding…</>
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
      background: active ? 'rgba(59,130,246,0.10)' : '#15151a',
      border: `1px solid ${active ? '#2563eb' : '#232328'}`,
      cursor: 'pointer', fontFamily: 'inherit',
      textAlign: 'left',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: active ? '#60a5fa' : '#d4d4d8',
        fontSize: 13, fontWeight: 600, marginBottom: 2,
      }}>{icon}{title}</div>
      <div style={{ fontSize: 11, color: '#888' }}>{subtitle}</div>
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: '#666',
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
          <li key={i} style={{ fontSize: 11, color: '#d4d4d8', padding: '2px 0', display: 'flex', gap: 6 }}>
            <Icon size={11} style={{ color, flexShrink: 0, marginTop: 3 }} /> {r}
          </li>
        ))}
        {rows.length > 20 && (
          <li style={{ fontSize: 11, color: '#666', padding: '2px 0' }}>… and {rows.length - 20} more</li>
        )}
      </ul>
    </div>
  );
}

const iconBtn = {
  background: 'transparent', border: 'none', color: '#888',
  cursor: 'pointer', padding: 4, borderRadius: 4,
};

const primaryBtn = (disabled) => ({
  display: 'inline-flex', alignItems: 'center',
  padding: '7px 14px', borderRadius: 6,
  background: disabled ? '#1c1c20' : '#2563eb',
  color: disabled ? '#666' : '#fff',
  border: 'none', cursor: disabled ? 'wait' : 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
});

const secondaryBtn = {
  padding: '7px 14px', borderRadius: 6,
  background: '#18181c', color: '#d4d4d8',
  border: '1px solid #232328', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
};
