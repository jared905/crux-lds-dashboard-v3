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
  Camera, History, Sparkles,
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
  suggestPositioningOneliner,
  PLAY_STATUS_LABELS,
  POSITIONING_ONELINER_MAX_CHARS,
  HOST_ARCHETYPES,
  HOST_ARCHETYPE_BY_ID,
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

      <PositioningOneLinerSection
        clientId={client.id}
        clientName={client.name}
        value={spine?.positioning_oneliner}
        updatedAt={spine?.positioning_oneliner_updated_at}
        onSave={(v) => handleFieldSave('positioning_oneliner', v)}
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
        title="Editorial POV + mission"
        subtitle="The channel's beliefs and reason for existing. Different from positioning (which is competitive); this is the editorial soul — what the channel argues, what it stands for."
        value={spine?.editorial_pov}
        updatedAt={spine?.editorial_pov_updated_at}
        placeholder="e.g. We believe leadership is a daily discipline lived out in small moments, not a destination. Our mission is to make that practice visible — what it looks like, where it cracks, how it gets repaired — for an audience that already wants to live this way but rarely sees it modeled."
        onSave={(v) => handleFieldSave('editorial_pov', v)}
      />

      <Section
        title="Voice + tone"
        subtitle="Affirmative description of how the channel sounds. Different from Guardrails (which lists what NOT to do); this is the positive pattern producers and AI generation match against."
        value={spine?.voice_tone}
        updatedAt={spine?.voice_tone_updated_at}
        placeholder="e.g. Warm and unhurried. Speaks plainly, never preachily. Uses concrete imagery over abstraction. Lets silence breathe. Calls out tension before resolving it. Confident enough to admit doubt; never performs certainty."
        onSave={(v) => handleFieldSave('voice_tone', v)}
      />

      <HostArchetypeSection
        value={spine?.host_archetype}
        updatedAt={spine?.host_archetype_updated_at}
        onSave={(v) => handleFieldSave('host_archetype', v)}
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

      <SnapshotErrorBoundary onRefresh={handleRefreshSnapshot} busy={snapshotBusy}>
        <ComputedSnapshotInner
          snapshot={spine?.computed_snapshot}
          computedAt={spine?.snapshot_computed_at}
          busy={snapshotBusy}
          onRefresh={handleRefreshSnapshot}
        />
      </SnapshotErrorBoundary>

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
        {fmtField('Channel articulation (one-liner)', snapshot.positioning_oneliner)}
        {fmtField('Positioning hypothesis', snapshot.positioning_hypothesis)}
        {fmtField('Editorial POV + mission', snapshot.editorial_pov)}
        {fmtField('Voice + tone', snapshot.voice_tone)}
        {fmtField('Host archetype', snapshot.host_archetype)}
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
// ────────────────────────────────────────────────────────────
// Positioning one-liner — the headline of the deliverable
// ────────────────────────────────────────────────────────────
// Single sentence ≤120 chars. Char counter visible at all times so the
// strategist trims toward the cap. AI Suggest pulls 3 candidates (each a
// distinct angle) from the rest of the spine — the strategist clicks one
// to drop it into the draft, then edits and saves. No auto-save.
function PositioningOneLinerSection({ clientId, clientName, value, updatedAt, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [suggesting, setSuggesting] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [suggestError, setSuggestError] = useState(null);

  useEffect(() => { setDraft(value || ''); }, [value]);

  const charCount = draft.length;
  const overLimit = charCount > POSITIONING_ONELINER_MAX_CHARS;

  const handleSave = async () => {
    if (overLimit) return;
    await onSave(draft.trim() || null);
    setEditing(false);
    setCandidates(null);
  };

  const handleCancel = () => {
    setDraft(value || '');
    setEditing(false);
    setCandidates(null);
    setSuggestError(null);
  };

  const handleSuggest = async () => {
    if (suggesting) return;
    setSuggesting(true);
    setSuggestError(null);
    setCandidates(null);
    try {
      const r = await suggestPositioningOneliner(clientId, { clientName });
      if (!r.ok) setSuggestError(r.error);
      else setCandidates(r.candidates);
    } catch (e) {
      setSuggestError(e.message || 'Suggestion failed');
    } finally {
      setSuggesting(false);
    }
  };

  const counterColor = overLimit ? '#f87171' : (charCount > POSITIONING_ONELINER_MAX_CHARS * 0.9 ? '#fbbf24' : '#666');

  return (
    <SectionShell
      title="Channel articulation (one-liner)"
      subtitle="The single sentence that names what this channel is. The headline of the Positioning Recommendation section of the client deliverable — strategist-approved, ≤120 chars."
      updatedAt={updatedAt}
      accent="#a78bfa"
      action={editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleSave} disabled={overLimit} style={{ ...primaryBtn, opacity: overLimit ? 0.4 : 1, cursor: overLimit ? 'not-allowed' : 'pointer' }} title={overLimit ? `Over ${POSITIONING_ONELINER_MAX_CHARS}-char limit` : 'Save'}>
            <Check size={12} /> Save
          </button>
          <button onClick={handleCancel} style={ghostBtn} title="Cancel"><XIcon size={12} /></button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} style={ghostBtn} title="Edit">
          <Edit2 size={12} /> Edit
        </button>
      )}
    >
      {editing ? (
        <>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Daily reps for leaders who already know the theory, shot in the moments doctrine usually skips."
            autoFocus
            maxLength={POSITIONING_ONELINER_MAX_CHARS * 2}
            style={{ ...inputStyle, fontSize: 14, padding: '10px 12px' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <button
              onClick={handleSuggest}
              disabled={suggesting}
              style={{ ...ghostBtn, opacity: suggesting ? 0.7 : 1, cursor: suggesting ? 'wait' : 'pointer' }}
              title="Generate 3 candidate one-liners from the rest of the spine"
            >
              {suggesting
                ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Suggesting…</>
                : <><Sparkles size={12} /> AI suggest</>}
            </button>
            <div style={{ fontSize: 11, color: counterColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {charCount}/{POSITIONING_ONELINER_MAX_CHARS}
            </div>
          </div>
          {suggestError && (
            <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>
              {suggestError}
            </div>
          )}
          {candidates && candidates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Click to use, then edit:
              </div>
              {candidates.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setDraft(c.oneliner)}
                  style={{
                    textAlign: 'left',
                    background: '#15151a',
                    border: '1px solid #2a2a30',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    color: '#d4d4d8',
                    cursor: 'pointer',
                    lineHeight: 1.45,
                  }}
                  title={`Insert this candidate (${c.angle} angle) into the draft`}
                >
                  <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.6, marginRight: 8 }}>
                    {c.angle}
                  </span>
                  {c.oneliner}
                </button>
              ))}
            </div>
          )}
        </>
      ) : value ? (
        <div style={{ color: '#e4e4e7', fontSize: 16, lineHeight: 1.5, fontWeight: 600 }}>
          {value}
        </div>
      ) : (
        <div style={{ color: '#555', fontSize: 13, fontStyle: 'italic' }}>
          Not yet written. Click <strong style={{ color: '#888' }}>Edit</strong>, then optionally <strong style={{ color: '#888' }}>AI suggest</strong> to generate 3 candidates from the rest of the spine.
        </div>
      )}
    </SectionShell>
  );
}

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
// Host archetype — catalog picker + optional refinement
// ────────────────────────────────────────────────────────────
// Feeds the talent audition rubric. Strategist picks from the catalog
// (8 personas) and can append a refinement note to capture nuance.
// Stored as plain TEXT so AI suggestion (Phase D) and free-text overrides
// both ride on the same field.
function HostArchetypeSection({ value, updatedAt, onSave }) {
  const [editing, setEditing] = useState(false);
  // Parse value: if it matches a catalog label exactly, the picker is
  // selected; anything else is treated as a free-text "Custom" entry.
  const matchedArchetype = useMemo(() => {
    if (!value) return null;
    return HOST_ARCHETYPES.find(a => value.trim().startsWith(a.label)) || null;
  }, [value]);
  const [pickedId, setPickedId] = useState(matchedArchetype?.id || '');
  const [refinement, setRefinement] = useState(() => {
    if (!value || !matchedArchetype) return value || '';
    const suffix = value.trim().slice(matchedArchetype.label.length).trim();
    return suffix.startsWith('—') ? suffix.slice(1).trim() : suffix;
  });

  useEffect(() => {
    setPickedId(matchedArchetype?.id || '');
    if (!matchedArchetype) setRefinement(value || '');
  }, [matchedArchetype, value]);

  const handleSave = async () => {
    const archetype = HOST_ARCHETYPE_BY_ID[pickedId];
    let composed;
    if (archetype) {
      composed = refinement.trim()
        ? `${archetype.label} — ${refinement.trim()}`
        : archetype.label;
    } else {
      composed = refinement.trim() || null;
    }
    await onSave(composed);
    setEditing(false);
  };

  return (
    <SectionShell
      title="Host archetype"
      subtitle="The on-camera persona the talent audition rubric matches against. Different from cohort archetype (which is structural — how a channel is built); this is who's on screen and how they relate to the viewer."
      updatedAt={updatedAt}
      action={editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleSave} style={primaryBtn}><Check size={12} /> Save</button>
          <button onClick={() => setEditing(false)} style={ghostBtn}><XIcon size={12} /></button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} style={ghostBtn}><Edit2 size={12} /> Edit</button>
      )}
    >
      {editing ? (
        <>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
            Archetype
          </label>
          <select
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0e0e10', color: '#e4e4e7',
              border: '1px solid #2a2a30', borderRadius: 6,
              padding: '8px 10px', fontSize: 13,
              fontFamily: 'inherit', marginBottom: 8,
            }}
          >
            <option value="">— pick one —</option>
            {HOST_ARCHETYPES.map(a => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          {pickedId && (
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8, paddingLeft: 2 }}>
              {HOST_ARCHETYPE_BY_ID[pickedId].description}
            </div>
          )}
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
            Refinement (optional)
          </label>
          <textarea
            value={refinement}
            onChange={(e) => setRefinement(e.target.value)}
            placeholder={pickedId
              ? 'e.g. "with companion overtones in shorts" or "leans Sage on long-form, Storyteller on shorts"'
              : 'Or write a custom archetype description if none of the catalog fits.'}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0e0e10', color: '#e4e4e7',
              border: '1px solid #2a2a30', borderRadius: 6,
              padding: '10px 12px', fontSize: 13, lineHeight: 1.55,
              fontFamily: 'inherit', resize: 'vertical',
            }}
          />
        </>
      ) : value ? (
        <div style={{ color: '#d4d4d8', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {value}
        </div>
      ) : (
        <div style={{ color: '#555', fontSize: 13, fontStyle: 'italic' }}>
          Not set. Pick from the catalog (The Authority, Storyteller, Companion, Showman, Practitioner, Sage, Analyst, Guide) or write your own.
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
// Last-resort guard so a shape mismatch in the cached snapshot can't
// crash the entire spine page. If rendering throws, we surface a calm
// message + a Refresh button instead of a white screen.
class SnapshotErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[ComputedSnapshot] render failed:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <SectionShell title="Computed signal" action={
          <button onClick={this.props.onRefresh} disabled={this.props.busy} style={primaryBtn}>
            {this.props.busy
              ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={12} />}
            {this.props.busy ? 'Refreshing…' : 'Refresh'}
          </button>
        }>
          <div style={{ color: '#fbbf24', fontSize: 13, lineHeight: 1.55 }}>
            Snapshot data couldn't be rendered (likely a shape mismatch in the cached row). Click Refresh above to recompute and replace it.
          </div>
        </SectionShell>
      );
    }
    return this.props.children;
  }
}

function ComputedSnapshotInner({ snapshot, computedAt, busy, onRefresh }) {
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
                {typeof snapshot.archetype_mix.client_archetype === 'string' && (
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>
                    This client tagged as <strong style={{ color: '#d4d4d8' }}>{snapshot.archetype_mix.client_archetype}</strong>
                  </div>
                )}
                <ul style={snapshotList}>
                  {(snapshot.archetype_mix.segments || []).map((s, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>
                      <strong>{typeof s.label === 'string' ? s.label : (typeof s.archetype === 'string' ? s.archetype : '?')}</strong>
                      {typeof s.channel_count === 'number' && <> — {s.channel_count} channels</>}
                      {typeof s.video_count === 'number' && <>, {s.video_count} videos</>}
                      {typeof s.median_engagement === 'number' && <>, {(s.median_engagement * 100).toFixed(1)}% engagement</>}
                      {Array.isArray(s.top_patterns) && s.top_patterns.length > 0 && (
                        <span style={{ color: '#777' }}>; top: {
                          s.top_patterns
                            .filter(p => p && typeof p.label === 'string')
                            .map(p => `${p.label}${typeof p.lift === 'number' ? ` (+${Math.round((p.lift - 1) * 100)}%)` : ''}`)
                            .join(', ')
                        }</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SnapshotPanel>

          <SnapshotPanel title="Format mix — shorts vs long + length bands" empty={!snapshot.format_mix}>
            {snapshot.format_mix && (
              <>
                {(snapshot.format_mix.shorts_freq != null || snapshot.format_mix.longs_freq != null) && (
                  <div style={{ fontSize: 12, color: '#d4d4d8', marginBottom: 8 }}>
                    Cohort split: <strong>{Math.round((snapshot.format_mix.shorts_freq || 0) * 100)}% Shorts</strong> · <strong>{Math.round((snapshot.format_mix.longs_freq || 0) * 100)}% long-form</strong>
                  </div>
                )}
                {(snapshot.format_mix.working_buckets || []).length > 0 && (
                  <ul style={snapshotList}>
                    {snapshot.format_mix.working_buckets.map((b, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        <strong>{typeof b.label === 'string' ? b.label : '?'}</strong>
                        {typeof b.freq === 'number' && <> · {(b.freq * 100).toFixed(0)}% of cohort</>}
                        {typeof b.lift === 'number' && <>, +{Math.round((b.lift - 1) * 100)}% views</>}
                        {b.count != null && <> (n={b.count})</>}
                        {b.confidence && <em style={{ color: '#777' }}> [{b.confidence}]</em>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </SnapshotPanel>

          <SnapshotPanel title="Cadence — recommended upload windows (Mountain Time)" empty={!snapshot.cadence}>
            {snapshot.cadence && (
              <>
                {/* Per-format recommendation lists. Combined-format slot
                    pooling produced misleading "release-slot" lifts (major-
                    content dominated). Per-format gives "where to upload
                    your next long-form" vs "where to upload your next short". */}
                <CadenceFormatList
                  title="Long-form (videos >3 min)"
                  slots={snapshot.cadence.long_form}
                  legacySlots={snapshot.cadence.slots}
                />
                <CadenceFormatList
                  title="Shorts (videos ≤3 min)"
                  slots={snapshot.cadence.shorts}
                />
                <CadenceCaveatList slots={snapshot.cadence} />
              </>
            )}
          </SnapshotPanel>

          <SnapshotPanel title="Cohort outliers — recent breakouts" empty={!snapshot.outliers?.length}>
            {snapshot.outliers && (
              <ul style={snapshotList}>
                {snapshot.outliers.slice(0, 6).map((o, i) => {
                  // Defensive: tolerate both v2 shape (channel_name, multiplier)
                  // and the v1 buggy shape (channel object, outlier_score
                  // undefined) — never let a render crash the page.
                  const channelLabel = typeof o.channel === 'string'
                    ? o.channel
                    : (o.channel_name || o.channel?.name || null);
                  const score = typeof o.multiplier === 'number' ? o.multiplier
                    : typeof o.outlier_score === 'number' ? o.outlier_score
                    : null;
                  const titleStr = typeof o.title === 'string' ? o.title : '';
                  return (
                    <li key={i} style={{ marginBottom: 4 }}>
                      <strong>{titleStr.slice(0, 80)}{titleStr.length > 80 ? '…' : ''}</strong>
                      {channelLabel && <span style={{ color: '#888' }}> · {channelLabel}</span>}
                      {score != null && <span style={{ color: '#777' }}> · {score.toFixed(1)}x median</span>}
                      {o.suspect && <span style={{ color: '#fbbf24', marginLeft: 6, fontSize: 10 }}>suspect</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </SnapshotPanel>

          <SnapshotPanel title="Opportunity briefs" empty={!snapshot.opportunity_briefs?.opportunities?.length}>
            {snapshot.opportunity_briefs?.opportunities?.length > 0 && (
              <div>
                {snapshot.opportunity_briefs.opportunities.map((o, i) => (
                  <div key={i} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: i < snapshot.opportunity_briefs.opportunities.length - 1 ? '1px solid #1c1c20' : 'none' }}>
                    <div style={{ fontWeight: 600, color: '#fff', fontSize: 13, marginBottom: 4 }}>
                      {typeof o.title === 'string' ? o.title : '(untitled)'}
                    </div>
                    {Array.isArray(o.tags) && o.tags.length > 0 && (
                      <div style={{ fontSize: 10, color: '#888', marginBottom: 5 }}>
                        {o.tags.filter(t => typeof t === 'string').map(t => `#${t}`).join(' ')}
                      </div>
                    )}
                    {typeof o.body === 'string' && o.body.trim() && (
                      <div style={{ color: '#d4d4d8', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                        {o.body}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SnapshotPanel>
        </>
      )}
    </SectionShell>
  );
}

// Render a per-format cadence recommendation list. Filters out
// release-slot caveat entries (those are surfaced separately below).
// Falls back to legacy `slots` (combined view) only when the new
// per-format keys are absent — so old snapshots still render.
function CadenceFormatList({ title, slots, legacySlots }) {
  let usable = Array.isArray(slots) ? slots.filter(s => s && !s.release_slot_caveat) : null;
  let degraded = false;
  if (!usable && Array.isArray(legacySlots)) {
    usable = legacySlots.filter(s => s && !s.release_slot_caveat);
    degraded = true;
  }
  if (!usable || !usable.length) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={cadenceFormatHeader}>{title}</div>
        <div style={{ color: '#666', fontSize: 12, fontStyle: 'italic', paddingLeft: 4 }}>
          No actionable slots — too thin in this format or all candidates were release-slot dominated.
        </div>
      </div>
    );
  }
  // Numbered list with primary slot + lift + confidence
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={cadenceFormatHeader}>{title}</div>
      <ol style={{ ...snapshotList, paddingLeft: 22, marginTop: 4 }}>
        {usable.slice(0, 3).map((s, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            <strong>{typeof s.slot === 'string' ? s.slot : `${s.day || ''} ${s.block || ''}`}</strong>
            {typeof s.lift === 'number' && <> — +{Math.round((s.lift - 1) * 100)}% views</>}
            {typeof s.count === 'number' && <> (n={s.count})</>}
            {s.confidence && <em style={{ color: '#777' }}> [{s.confidence}]</em>}
          </li>
        ))}
      </ol>
      {degraded && (
        <div style={{ color: '#fbbf24', fontSize: 11, paddingLeft: 4, marginTop: 4 }}>
          Showing legacy combined-format data. Click Refresh to regenerate with per-format split.
        </div>
      )}
    </div>
  );
}

// Footer note when any slot was excluded as release-slot dominated.
function CadenceCaveatList({ slots }) {
  const lf = (slots?.long_form || []).filter(s => s?.release_slot_caveat);
  const sh = (slots?.shorts || []).filter(s => s?.release_slot_caveat);
  const all = [...lf, ...sh];
  if (!all.length) return null;
  return (
    <div style={{
      marginTop: 8, padding: '8px 10px',
      background: '#1a1410', border: '1px solid #3a2a1f', borderRadius: 6,
      fontSize: 11, color: '#fbbf24', lineHeight: 1.5,
    }}>
      <strong>Excluded as likely release-slot:</strong>{' '}
      {all.slice(0, 4).map(s => s.slot).filter(Boolean).join(', ')}
      {all.length > 4 && ` +${all.length - 4} more`}.
      These slots had extreme lifts (&gt;300%) which typically marks when the cohort releases major content, not when the audience is most receptive.
    </div>
  );
}

const cadenceFormatHeader = {
  fontSize: 11, color: '#a1a1aa', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.5,
  marginBottom: 2,
};

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
