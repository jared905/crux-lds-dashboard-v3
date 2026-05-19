/**
 * StrategySpine — per-client evolving doc.
 *
 * Hybrid: strategist-authored fields (positioning, audience, stance,
 * active plays) + computed snapshot panel.
 *
 * Mounted inline within PortfolioView via master/detail. The Portfolio
 * list passes a clientId + name + handle and we own everything else.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Loader, Edit2, Check, X as XIcon, Plus, Trash2,
  RefreshCw, Calendar, ExternalLink, ChevronDown,
} from 'lucide-react';
import {
  getSpine,
  updateSpineField,
  updateQuarterlyStance,
  addActivePlay,
  updateActivePlay,
  removeActivePlay,
  refreshSnapshot,
  PLAY_STATUS_LABELS,
} from '../../services/strategySpineService.js';

export default function StrategySpine({ client, onBack }) {
  const [spine, setSpine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSpine(client.id).then(row => {
      if (!cancelled) {
        setSpine(row);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [client.id, refreshTick]);

  const handleFieldSave = async (field, value) => {
    await updateSpineField(client.id, field, value);
    setRefreshTick(t => t + 1);
  };

  const handleStanceSave = async ({ text, label }) => {
    await updateQuarterlyStance(client.id, { text, label });
    setRefreshTick(t => t + 1);
  };

  const handleAddPlay = async (play) => {
    await addActivePlay(client.id, play);
    setRefreshTick(t => t + 1);
  };

  const handleUpdatePlay = async (playId, patch) => {
    await updateActivePlay(client.id, playId, patch);
    setRefreshTick(t => t + 1);
  };

  const handleRemovePlay = async (playId) => {
    if (!window.confirm('Remove this play from the spine?')) return;
    await removeActivePlay(client.id, playId);
    setRefreshTick(t => t + 1);
  };

  const handleRefreshSnapshot = async () => {
    setSnapshotBusy(true);
    try {
      await refreshSnapshot(client.id);
      setRefreshTick(t => t + 1);
    } finally {
      setSnapshotBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>
        <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ marginTop: 8, fontSize: 12 }}>Loading strategy spine…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <SpineHeader client={client} onBack={onBack} />

      <Section
        title="Positioning hypothesis"
        subtitle="Long-arc thesis — what this channel competes on, what audience it serves, what voice it owns. Typically reviewed quarterly."
        value={spine?.positioning_hypothesis}
        updatedAt={spine?.positioning_updated_at}
        placeholder="e.g. We position [client] as the human, story-led voice in a category that's flooded with utility-first content. Our audience comes for narrative warmth and stays for the practical takeaway folded into it."
        onSave={(v) => handleFieldSave('positioning_hypothesis', v)}
      />

      <Section
        title="Audience read"
        subtitle="Who the channel's real audience is — informed by client conversation, comments mining, retention patterns. Updates when you learn something new."
        value={spine?.audience_read}
        updatedAt={spine?.audience_updated_at}
        placeholder="e.g. Core audience is leaders in their 30s–50s who feel professionally capable but spiritually stuck. They came for tactical content but the highest-retention videos are the ones that name a pain they're already feeling."
        onSave={(v) => handleFieldSave('audience_read', v)}
      />

      <QuarterlyStance
        text={spine?.quarterly_stance}
        label={spine?.quarterly_stance_label}
        updatedAt={spine?.quarterly_stance_updated_at}
        onSave={handleStanceSave}
      />

      <ActivePlays
        plays={spine?.active_plays || []}
        onAdd={handleAddPlay}
        onUpdate={handleUpdatePlay}
        onRemove={handleRemovePlay}
      />

      <ComputedSnapshot
        snapshot={spine?.computed_snapshot}
        computedAt={spine?.snapshot_computed_at}
        busy={snapshotBusy}
        onRefresh={handleRefreshSnapshot}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Header
// ────────────────────────────────────────────────────────────
function SpineHeader({ client, onBack }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <button onClick={onBack} style={backBtn} title="Back to Clients">
        <ArrowLeft size={13} /> Clients
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
        {client.thumbnail ? (
          <img src={client.thumbnail} alt="" loading="lazy"
            style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#18181c' }} />
        )}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>
            {client.name}
          </h1>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            Strategy spine
            {client.stageLabel && <> · <span style={{ color: '#aaa' }}>{client.stageLabel}</span></>}
            {client.customUrl && <> · {client.customUrl}</>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Editable text section (positioning, audience)
// ────────────────────────────────────────────────────────────
function Section({ title, subtitle, value, updatedAt, placeholder, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  useEffect(() => { setDraft(value || ''); }, [value]);

  const handleSave = async () => {
    await onSave(draft.trim() || null);
    setEditing(false);
  };

  return (
    <SectionShell title={title} subtitle={subtitle} updatedAt={updatedAt}
      action={editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleSave} style={primaryBtn} title="Save"><Check size={12} /> Save</button>
          <button onClick={() => { setDraft(value || ''); setEditing(false); }} style={ghostBtn} title="Cancel"><XIcon size={12} /></button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} style={ghostBtn} title="Edit">
          <Edit2 size={12} /> Edit
        </button>
      )}
    >
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          autoFocus
          rows={5}
          style={textareaStyle}
        />
      ) : value ? (
        <div style={{ color: '#d4d4d8', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {value}
        </div>
      ) : (
        <div style={{ color: '#555', fontSize: 13, fontStyle: 'italic' }}>
          {placeholder}
        </div>
      )}
    </SectionShell>
  );
}

// ────────────────────────────────────────────────────────────
// Quarterly stance (text + label)
// ────────────────────────────────────────────────────────────
function defaultQuarterLabel() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

function QuarterlyStance({ text, label, updatedAt, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(text || '');
  const [draftLabel, setDraftLabel] = useState(label || defaultQuarterLabel());

  useEffect(() => {
    setDraftText(text || '');
    setDraftLabel(label || defaultQuarterLabel());
  }, [text, label]);

  const handleSave = async () => {
    await onSave({ text: draftText.trim() || null, label: draftLabel.trim() || null });
    setEditing(false);
  };

  const displayLabel = label || '—';

  return (
    <SectionShell
      title={`Strategic stance · ${displayLabel}`}
      subtitle="What we're testing or doubling down on this quarter. Different from positioning — this is the active call, refreshed each quarter."
      updatedAt={updatedAt}
      action={editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleSave} style={primaryBtn}><Check size={12} /> Save</button>
          <button onClick={() => {
            setDraftText(text || '');
            setDraftLabel(label || defaultQuarterLabel());
            setEditing(false);
          }} style={ghostBtn}><XIcon size={12} /></button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} style={ghostBtn}>
          <Edit2 size={12} /> Edit
        </button>
      )}
    >
      {editing ? (
        <>
          <div style={{ marginBottom: 8 }}>
            <label style={fieldLabel}>Quarter label</label>
            <input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="Q2 2026"
              style={inputStyle}
            />
          </div>
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="e.g. Doubling down on series-anchored shorts. Testing whether a 3-part vertical series can drive longform views above our current 4% click-through baseline."
            autoFocus
            rows={5}
            style={textareaStyle}
          />
        </>
      ) : text ? (
        <div style={{ color: '#d4d4d8', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {text}
        </div>
      ) : (
        <div style={{ color: '#555', fontSize: 13, fontStyle: 'italic' }}>
          Not yet set. The stance is the "what call are we making this quarter" — the field every artifact should anchor to.
        </div>
      )}
    </SectionShell>
  );
}

// ────────────────────────────────────────────────────────────
// Active plays
// ────────────────────────────────────────────────────────────
function ActivePlays({ plays, onAdd, onUpdate, onRemove }) {
  const [adding, setAdding] = useState(false);

  return (
    <SectionShell
      title={`Active plays${plays.length ? ` · ${plays.length}` : ''}`}
      subtitle="Experiments and initiatives in flight or recently concluded. Each play has a hypothesis, status, and evidence — so wins and losses both become institutional memory."
      action={
        <button onClick={() => setAdding(v => !v)} style={primaryBtn}>
          {adding ? <><XIcon size={12} /> Cancel</> : <><Plus size={12} /> Add play</>}
        </button>
      }
    >
      {adding && (
        <PlayEditor
          play={null}
          onCancel={() => setAdding(false)}
          onSave={async (p) => { await onAdd(p); setAdding(false); }}
        />
      )}
      {plays.length === 0 && !adding && (
        <div style={{ color: '#555', fontSize: 13, fontStyle: 'italic' }}>
          No plays logged yet. Add the first experiment you're running.
        </div>
      )}
      {plays.map(p => (
        <PlayCard
          key={p.id}
          play={p}
          onUpdate={(patch) => onUpdate(p.id, patch)}
          onRemove={() => onRemove(p.id)}
        />
      ))}
    </SectionShell>
  );
}

function PlayCard({ play, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <PlayEditor
        play={play}
        onCancel={() => setEditing(false)}
        onSave={async (patch) => { await onUpdate(patch); setEditing(false); }}
      />
    );
  }
  const statusColor = play.status === 'in_flight' ? '#60a5fa'
    : play.status === 'concluded_won' ? '#34d399'
    : play.status === 'concluded_lost' ? '#f87171'
    : '#a1a1aa';
  return (
    <div style={{
      background: '#16161a', border: '1px solid #1f1f24', borderRadius: 8,
      padding: '12px 14px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{
          display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
          background: statusColor,
        }} />
        <div style={{ fontWeight: 600, color: '#fff', fontSize: 14, flex: 1 }}>{play.name}</div>
        <span style={{ fontSize: 11, color: statusColor }}>{PLAY_STATUS_LABELS[play.status]}</span>
        <button onClick={() => setEditing(true)} style={ghostBtnSmall} title="Edit">
          <Edit2 size={11} />
        </button>
        <button onClick={onRemove} style={{ ...ghostBtnSmall, color: '#f87171' }} title="Remove">
          <Trash2 size={11} />
        </button>
      </div>
      {play.hypothesis && (
        <div style={{ color: '#d4d4d8', fontSize: 13, lineHeight: 1.55, marginBottom: 6, whiteSpace: 'pre-wrap' }}>
          {play.hypothesis}
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#777' }}>
        {play.started_at && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={10} /> {play.started_at}
          </span>
        )}
        {play.evidence && (
          <span style={{ color: '#aaa', wordBreak: 'break-all' }}>Evidence: {play.evidence}</span>
        )}
      </div>
      {play.notes && (
        <div style={{ color: '#888', fontSize: 12, marginTop: 8, whiteSpace: 'pre-wrap' }}>
          {play.notes}
        </div>
      )}
    </div>
  );
}

function PlayEditor({ play, onSave, onCancel }) {
  const [name, setName] = useState(play?.name || '');
  const [hypothesis, setHypothesis] = useState(play?.hypothesis || '');
  const [startedAt, setStartedAt] = useState(play?.started_at || new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState(play?.status || 'in_flight');
  const [evidence, setEvidence] = useState(play?.evidence || '');
  const [notes, setNotes] = useState(play?.notes || '');

  return (
    <div style={{
      background: '#16161a', border: '1px solid #2a2a30', borderRadius: 8,
      padding: 14, marginBottom: 10,
    }}>
      <label style={fieldLabel}>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Series-anchored shorts" style={inputStyle} autoFocus />

      <label style={fieldLabel}>Hypothesis</label>
      <textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} rows={3}
        placeholder="What you expect to happen and why."
        style={textareaStyle} />

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Started</label>
          <input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            {Object.entries(PLAY_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <label style={fieldLabel}>Evidence</label>
      <input value={evidence} onChange={(e) => setEvidence(e.target.value)}
        placeholder="Link, video IDs, or short note pointing to the proof"
        style={inputStyle} />

      <label style={fieldLabel}>Notes</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
        placeholder="Anything else worth remembering."
        style={textareaStyle} />

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          onClick={() => onSave({ name: name.trim(), hypothesis, started_at: startedAt, status, evidence, notes })}
          disabled={!name.trim()}
          style={{ ...primaryBtn, opacity: name.trim() ? 1 : 0.5 }}
        >
          <Check size={12} /> Save play
        </button>
        <button onClick={onCancel} style={ghostBtn}><XIcon size={12} /> Cancel</button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Computed snapshot
// ────────────────────────────────────────────────────────────
function ComputedSnapshot({ snapshot, computedAt, busy, onRefresh }) {
  const cohort = snapshot?.cohort;
  return (
    <SectionShell
      title="Computed signal"
      subtitle="Cached analytical snapshot the artifacts render alongside your strategist fields. Regenerable on demand."
      action={
        <button onClick={onRefresh} disabled={busy} style={primaryBtn}>
          {busy
            ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
            : <RefreshCw size={12} />}
          {busy ? 'Refreshing…' : (computedAt ? 'Refresh' : 'Compute')}
        </button>
      }
    >
      {!snapshot ? (
        <div style={{ color: '#555', fontSize: 13, fontStyle: 'italic' }}>
          Snapshot not yet computed. Click <strong style={{ color: '#888' }}>Compute</strong> to populate the cohort summary.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 10 }}>
            Last refreshed {computedAt ? formatRelative(computedAt) : '—'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
            <SnapshotStat label="Pinned competitors" value={cohort?.pinned_count ?? 0} />
            <SnapshotStat
              label="Classifier coverage"
              value={`${Math.round((cohort?.coverage || 0) * 100)}%`}
              tone={cohort?.coverage >= 0.8 ? 'good' : cohort?.coverage >= 0.5 ? 'warn' : 'bad'}
            />
            <SnapshotStat
              label="Cohort sync errors"
              value={cohort?.errored_count ?? 0}
              tone={(cohort?.errored_count ?? 0) > 2 ? 'bad' : 'normal'}
            />
            <SnapshotStat label="Lifecycle" value={snapshot?.client?.lifecycle_stage || '—'} />
          </div>
          <div style={{ color: '#666', fontSize: 12, lineHeight: 1.55 }}>
            Slots reserved for the audit pack refactor:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#555' }}>
              <li>Archetype mix — {snapshot.archetype_mix ? 'populated' : 'pending'}</li>
              <li>Format mix — {snapshot.format_mix ? 'populated' : 'pending'}</li>
              <li>Cadence — {snapshot.cadence ? 'populated' : 'pending'}</li>
              <li>Outliers — {snapshot.outliers ? 'populated' : 'pending'}</li>
              <li>Opportunity briefs — {snapshot.opportunity_briefs ? 'populated' : 'pending'}</li>
            </ul>
          </div>
        </>
      )}
    </SectionShell>
  );
}

function SnapshotStat({ label, value, tone = 'normal' }) {
  const color = tone === 'good' ? '#34d399'
    : tone === 'warn' ? '#fbbf24'
    : tone === 'bad' ? '#f87171'
    : '#d4d4d8';
  return (
    <div style={{ background: '#16161a', border: '1px solid #1f1f24', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Shared section shell
// ────────────────────────────────────────────────────────────
function SectionShell({ title, subtitle, updatedAt, action, children }) {
  return (
    <div style={{
      background: '#131316', border: '1px solid #1f1f24', borderRadius: 10,
      padding: '18px 20px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: 0.2, textTransform: 'uppercase' }}>
              {title}
            </h2>
            {updatedAt && (
              <span style={{ fontSize: 11, color: '#666' }}>
                Updated {formatRelative(updatedAt)}
              </span>
            )}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: '#888', marginTop: 4, lineHeight: 1.5 }}>{subtitle}</div>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────
const backBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 11px', borderRadius: 5,
  background: '#18181c', color: '#d4d4d8',
  border: '1px solid #232328', cursor: 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 11px', borderRadius: 5,
  background: '#1e3a5f', color: '#dbeafe',
  border: '1px solid #2a4f7f', cursor: 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
};

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 11px', borderRadius: 5,
  background: '#18181c', color: '#d4d4d8',
  border: '1px solid #232328', cursor: 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
};

const ghostBtnSmall = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 5, borderRadius: 4, color: '#888',
  background: 'transparent', border: '1px solid transparent',
  cursor: 'pointer',
};

const textareaStyle = {
  width: '100%', boxSizing: 'border-box',
  background: '#0e0e10', color: '#e4e4e7',
  border: '1px solid #2a2a30', borderRadius: 6,
  padding: '10px 12px', fontSize: 13, lineHeight: 1.55,
  fontFamily: 'inherit', resize: 'vertical',
  marginBottom: 8,
};

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: '#0e0e10', color: '#e4e4e7',
  border: '1px solid #2a2a30', borderRadius: 6,
  padding: '8px 10px', fontSize: 13,
  fontFamily: 'inherit', marginBottom: 8,
};

const fieldLabel = {
  display: 'block', fontSize: 10, fontWeight: 700,
  color: '#888', textTransform: 'uppercase', letterSpacing: 0.6,
  marginBottom: 4, marginTop: 6,
};

function formatRelative(iso) {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return '1 day ago';
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)} years ago`;
}
