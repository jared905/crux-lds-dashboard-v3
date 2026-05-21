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
  RefreshCw, Calendar, ExternalLink, ChevronDown, ChevronRight,
  Camera, History,
} from 'lucide-react';
import {
  getSpine,
  updateSpineField,
  updateQuarterlyStance,
  addActivePlay,
  updateActivePlay,
  removeActivePlay,
  refreshSnapshot,
  captureSpineSnapshot,
  listSpineSnapshots,
  getSpineSnapshot,
  deleteSpineSnapshot,
  PLAY_STATUS_LABELS,
} from '../../services/strategySpineService.js';

export default function StrategySpine({ client, onBack }) {
  const [spine, setSpine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [snapshotCaptureBusy, setSnapshotCaptureBusy] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getSpine(client.id), listSpineSnapshots(client.id)]).then(([row, snaps]) => {
      if (!cancelled) {
        setSpine(row);
        setSnapshots(snaps);
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

  const handleCaptureSnapshot = async () => {
    const defaultLabel = spine?.quarterly_stance_label
      ? `${spine.quarterly_stance_label} close`
      : '';
    const label = window.prompt(
      'Snapshot label (e.g. "Q2 2026 close", "post-rebrand pivot"). Leave blank for unlabeled.',
      defaultLabel,
    );
    if (label === null) return;  // cancel
    setSnapshotCaptureBusy(true);
    try {
      const r = await captureSpineSnapshot(client.id, { label });
      if (!r.ok) window.alert(`Snapshot failed: ${r.error || 'unknown'}`);
      setRefreshTick(t => t + 1);
      setShowHistory(true);
    } finally {
      setSnapshotCaptureBusy(false);
    }
  };

  const handleViewSnapshot = async (snapshotId) => {
    const snap = await getSpineSnapshot(snapshotId);
    if (snap) setViewingSnapshot(snap);
  };

  const handleDeleteSnapshot = async (snapshotId) => {
    if (!window.confirm('Delete this snapshot? This cannot be undone.')) return;
    await deleteSpineSnapshot(snapshotId);
    setRefreshTick(t => t + 1);
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
      <SpineHeader
        client={client}
        onBack={onBack}
        snapshotCount={snapshots.length}
        snapshotBusy={snapshotCaptureBusy}
        onCaptureSnapshot={handleCaptureSnapshot}
      />

      <Section
        title="Guardrails — do not recommend"
        subtitle="Sensitive topics, vetoed formats, off-limits framings, and recommendations already tried and rejected. Read at the top because it's load-bearing — every AI generation for this client respects these as hard constraints."
        accent="#f87171"
        value={spine?.guardrails}
        updatedAt={spine?.guardrails_updated_at}
        placeholder="e.g. Do not recommend doctrine commentary. Do not suggest political topics. Avoid clickbait framing — client has explicitly vetoed it. Skip 'X vs Y' format — tested in Q1, low retention. Don't propose collaborations with creators outside the faith space."
        onSave={(v) => handleFieldSave('guardrails', v)}
      />

      <QuarterlyStance
        text={spine?.quarterly_stance}
        label={spine?.quarterly_stance_label}
        updatedAt={spine?.quarterly_stance_updated_at}
        onSave={handleStanceSave}
      />

      <Section
        title="Competitive posture"
        subtitle="One-line interpretation of how this client is differentiating from the competitive set. Displays as a banner inside Research v2 whenever this client's cohort is loaded — so the cohort data is never read without interpretation."
        accent="#60a5fa"
        value={spine?.competitive_posture}
        updatedAt={spine?.competitive_posture_updated_at}
        placeholder="e.g. We compete on narrative warmth in a cohort that's flooded with utility-first content — when a competitor leans tactical, we lean story; when they lean shorts-heavy, we lean longer-form testimony."
        onSave={(v) => handleFieldSave('competitive_posture', v)}
      />

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

      <SnapshotHistory
        snapshots={snapshots}
        expanded={showHistory}
        onToggle={() => setShowHistory(v => !v)}
        onView={handleViewSnapshot}
        onDelete={handleDeleteSnapshot}
      />

      {viewingSnapshot && (
        <SnapshotViewer
          snapshot={viewingSnapshot}
          onClose={() => setViewingSnapshot(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Header
// ────────────────────────────────────────────────────────────
function SpineHeader({ client, onBack, snapshotCount = 0, snapshotBusy = false, onCaptureSnapshot }) {
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
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>
            {client.name}
          </h1>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            Strategy spine
            {client.stageLabel && <> · <span style={{ color: '#aaa' }}>{client.stageLabel}</span></>}
            {client.customUrl && <> · {client.customUrl}</>}
            {snapshotCount > 0 && <> · <span style={{ color: '#aaa' }}>{snapshotCount} snapshot{snapshotCount === 1 ? '' : 's'}</span></>}
          </div>
        </div>
        {onCaptureSnapshot && (
          <button
            onClick={onCaptureSnapshot}
            disabled={snapshotBusy}
            title="Capture the current spine state as a snapshot (for evolved-across-quarters history)"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 6,
              background: '#18181c', color: '#d4d4d8',
              border: '1px solid #232328', cursor: snapshotBusy ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              opacity: snapshotBusy ? 0.6 : 1,
            }}
          >
            {snapshotBusy
              ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Capturing…</>
              : <><Camera size={12} /> Snapshot now</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Snapshot history list + viewer
// ────────────────────────────────────────────────────────────
function SnapshotHistory({ snapshots, expanded, onToggle, onView, onDelete }) {
  if (!snapshots?.length) return null;
  return (
    <div style={{ marginTop: 18, marginBottom: 14 }}>
      <button
        onClick={onToggle}
        style={{
          background: 'transparent', border: 'none', padding: '4px 0',
          color: '#888', fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 0.7,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <History size={12} />
        History · {snapshots.length} snapshot{snapshots.length === 1 ? '' : 's'}
      </button>
      {expanded && (
        <div style={{
          background: '#131316', border: '1px solid #1f1f24', borderRadius: 10,
          padding: 12, marginTop: 8,
        }}>
          {snapshots.map(s => {
            const days = Math.floor((Date.now() - new Date(s.captured_at).getTime()) / 86400000);
            const when = days === 0 ? 'today' : days === 1 ? '1 day ago' : days < 30 ? `${days} days ago` : days < 365 ? `${Math.floor(days/30)} months ago` : `${Math.floor(days/365)} years ago`;
            return (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, padding: '8px 4px', borderBottom: '1px solid #1c1c20',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#d4d4d8', fontWeight: 600 }}>
                    {s.label || <span style={{ color: '#666', fontWeight: 400 }}>(unlabeled)</span>}
                    {s.quarterly_stance_label && s.label !== s.quarterly_stance_label && (
                      <span style={{ color: '#666', fontWeight: 400, marginLeft: 8 }}>· stance was "{s.quarterly_stance_label}"</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
                    Captured {when} · {new Date(s.captured_at).toISOString().slice(0, 10)}
                  </div>
                </div>
                <button onClick={() => onView(s.id)} style={ghostBtnSmall} title="View snapshot">View</button>
                <button onClick={() => onDelete(s.id)} style={{ ...ghostBtnSmall, color: '#f87171' }} title="Delete snapshot">
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SnapshotViewer({ snapshot, onClose }) {
  if (!snapshot) return null;
  const fmtField = (label, value) => value?.trim() ? (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ color: '#d4d4d8', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  ) : null;

  const plays = Array.isArray(snapshot.active_plays) ? snapshot.active_plays : [];

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{
        width: 'min(720px, 100%)', maxHeight: '85vh', overflowY: 'auto',
        background: '#131316', border: '1px solid #2a2a30', borderRadius: 12,
        padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: 4 }}>
              Snapshot · {new Date(snapshot.captured_at).toISOString().slice(0, 10)}
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>
              {snapshot.label || 'Unlabeled snapshot'}
            </h2>
            {snapshot.notes && (
              <div style={{ fontSize: 12, color: '#888', marginTop: 6, lineHeight: 1.5 }}>{snapshot.notes}</div>
            )}
          </div>
          <button onClick={onClose} style={ghostBtnSmall} title="Close"><XIcon size={14} /></button>
        </div>

        {fmtField(`Strategic stance${snapshot.quarterly_stance_label ? ` · ${snapshot.quarterly_stance_label}` : ''}`, snapshot.quarterly_stance)}
        {fmtField('Competitive posture', snapshot.competitive_posture)}
        {fmtField('Positioning hypothesis', snapshot.positioning_hypothesis)}
        {fmtField('Audience read', snapshot.audience_read)}
        {fmtField('Guardrails', snapshot.guardrails)}

        {plays.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, fontWeight: 700 }}>
              Active plays at capture ({plays.length})
            </div>
            {plays.map(p => (
              <div key={p.id} style={{
                background: '#16161a', border: '1px solid #1f1f24', borderRadius: 6,
                padding: '8px 10px', marginBottom: 6, fontSize: 12, color: '#d4d4d8',
              }}>
                <strong>{p.name}</strong> <span style={{ color: '#888' }}>· {PLAY_STATUS_LABELS[p.status] || p.status}</span>
                {p.hypothesis && <div style={{ color: '#a1a1aa', marginTop: 3 }}>{p.hypothesis}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Editable text section (positioning, audience)
// ────────────────────────────────────────────────────────────
function Section({ title, subtitle, value, updatedAt, placeholder, onSave, accent }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  useEffect(() => { setDraft(value || ''); }, [value]);

  const handleSave = async () => {
    await onSave(draft.trim() || null);
    setEditing(false);
  };

  return (
    <SectionShell title={title} subtitle={subtitle} updatedAt={updatedAt} accent={accent}
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
      subtitle="Cached analytical snapshot — cohort summary, archetype mix, format mix, cadence, outliers, opportunity briefs. Heavy compute; refresh when the data has materially shifted."
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
          Snapshot not yet computed. Click <strong style={{ color: '#888' }}>Compute</strong> to run the full pipeline (diagnostic + patterns + white space).
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 10 }}>
            Last refreshed {computedAt ? formatRelative(computedAt) : '—'}
            {snapshot.cohort?.videos_analyzed && <> · {snapshot.cohort.videos_analyzed} cohort videos analyzed</>}
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

          <SnapshotPanel title="Archetype mix" empty={!snapshot.archetype_mix}>
            {snapshot.archetype_mix && (
              <>
                {snapshot.archetype_mix.client_archetype && (
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>
                    This client tagged as <strong style={{ color: '#d4d4d8' }}>{snapshot.archetype_mix.client_archetype}</strong>
                  </div>
                )}
                <ul style={snapshotList}>
                  {(snapshot.archetype_mix.segments || []).map(s => (
                    <li key={s.archetype} style={{ marginBottom: 4 }}>
                      <strong>{s.label}</strong> — {s.channel_count} channels, {s.video_count} videos
                      {s.median_engagement != null && <>, {(s.median_engagement * 100).toFixed(1)}% engagement</>}
                      {s.top_patterns?.length > 0 && (
                        <span style={{ color: '#777' }}>; top: {s.top_patterns.map(p => `${p.label} (+${Math.round((p.lift - 1) * 100)}%)`).join(', ')}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SnapshotPanel>

          <SnapshotPanel title="Format mix — length bands that work" empty={!snapshot.format_mix}>
            {snapshot.format_mix && (
              <ul style={snapshotList}>
                {(snapshot.format_mix.working_buckets || []).map((b, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <strong>{b.label}</strong> · {(b.freq * 100).toFixed(0)}% of cohort, +{Math.round((b.lift - 1) * 100)}% views (n={b.count}) <em style={{ color: '#777' }}>[{b.confidence}]</em>
                  </li>
                ))}
              </ul>
            )}
          </SnapshotPanel>

          <SnapshotPanel title="Cadence — upload slots that work" empty={!snapshot.cadence}>
            {snapshot.cadence && (
              <ul style={snapshotList}>
                {(snapshot.cadence.slots || []).map((s, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <strong>{s.slot}</strong> — +{Math.round((s.lift - 1) * 100)}% views (n={s.count}) <em style={{ color: '#777' }}>[{s.confidence}]</em>
                  </li>
                ))}
              </ul>
            )}
          </SnapshotPanel>

          <SnapshotPanel title="Cohort outliers — recent breakouts" empty={!snapshot.outliers?.length}>
            {snapshot.outliers && (
              <ul style={snapshotList}>
                {snapshot.outliers.slice(0, 6).map((o, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <strong>{o.title?.slice(0, 80)}{o.title?.length > 80 ? '…' : ''}</strong>
                    {o.channel && <span style={{ color: '#888' }}> · {o.channel}</span>}
                    {o.outlier_score && <span style={{ color: '#777' }}> · {o.outlier_score.toFixed(1)}x median</span>}
                    {o.suspect && <span style={{ color: '#fbbf24', marginLeft: 6, fontSize: 10 }}>suspect</span>}
                  </li>
                ))}
              </ul>
            )}
          </SnapshotPanel>

          <SnapshotPanel title="Opportunity brief" empty={!snapshot.opportunity_briefs}>
            {snapshot.opportunity_briefs && (
              <>
                {snapshot.opportunity_briefs.headline && (
                  <div style={{ fontWeight: 600, color: '#fff', marginBottom: 6, fontSize: 13 }}>
                    {snapshot.opportunity_briefs.headline}
                  </div>
                )}
                {snapshot.opportunity_briefs.body && (
                  <div style={{ color: '#d4d4d8', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {snapshot.opportunity_briefs.body}
                  </div>
                )}
              </>
            )}
          </SnapshotPanel>
        </>
      )}
    </SectionShell>
  );
}

function SnapshotPanel({ title, empty, children }) {
  return (
    <div style={{
      background: '#16161a', border: '1px solid #1f1f24', borderRadius: 8,
      padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: 6 }}>
        {title}
      </div>
      {empty ? (
        <div style={{ color: '#555', fontSize: 12, fontStyle: 'italic' }}>
          Not yet populated — needs a Refresh, or the cohort is too thin for this signal.
        </div>
      ) : children}
    </div>
  );
}

const snapshotList = {
  margin: 0, paddingLeft: 18,
  color: '#d4d4d8', fontSize: 12, lineHeight: 1.55,
};

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
function SectionShell({ title, subtitle, updatedAt, action, accent, children }) {
  return (
    <div style={{
      background: '#131316',
      border: `1px solid ${accent || '#1f1f24'}`,
      borderLeft: accent ? `3px solid ${accent}` : '1px solid #1f1f24',
      borderRadius: 10,
      padding: '18px 20px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: accent || '#fff', margin: 0, letterSpacing: 0.2, textTransform: 'uppercase' }}>
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
