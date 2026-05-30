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
  Camera, History, Sparkles, Printer, ClipboardList, FileText,
  Briefcase, Globe, Layers, ChevronUp,
} from 'lucide-react';
import ClientDeliverable from '../ClientDeliverable/ClientDeliverable.jsx';
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
  suggestEditorialPov,
  suggestVoiceTone,
  PLAY_STATUS_LABELS,
  POSITIONING_ONELINER_MAX_CHARS,
  HOST_ARCHETYPES,
  HOST_ARCHETYPE_BY_ID,
} from '../../services/strategySpineService.js';
import {
  getActiveTalentRubric,
  generateTalentAuditionRubric,
  saveTalentAuditionRubric,
} from '../../services/talentRubricService.js';
import {
  listHosts,
  createHost,
  updateHost,
  deleteHost,
  suggestHostProfile,
} from '../../services/clientHostsService.js';
import {
  listPillars,
  createPillar,
  updatePillar,
  deletePillar,
  activatePillar,
  retirePillar,
  PILLAR_FORMAT_LABELS,
  PILLAR_TALENT_LABELS,
} from '../../services/clientPillarsService.js';
import {
  getActiveBusinessContext,
  getLatestDraft,
  auditWebsite,
  updateBusinessContext,
  confirmBusinessContext,
  discardDraft,
} from '../../services/clientBusinessContextService.js';
import PreflightPanel from './preflight/PreflightPanel.jsx';

export default function StrategySpine({ client, onBack }) {
  const [spine, setSpine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [snapshotCaptureBusy, setSnapshotCaptureBusy] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState(null);
  const [hosts, setHosts] = useState([]);
  const [pillars, setPillars] = useState([]);
  const [businessActive, setBusinessActive] = useState(null);
  const [businessDraft, setBusinessDraft] = useState(null);
  const [deliverableOpen, setDeliverableOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getSpine(client.id),
      listSpineSnapshots(client.id),
      listHosts(client.id),
      listPillars(client.id),
      getActiveBusinessContext(client.id),
      getLatestDraft(client.id),
    ]).then(([row, snaps, hostRows, pillarRows, activeBiz, draftBiz]) => {
      if (!cancelled) {
        setSpine(row);
        setSnapshots(snaps);
        setHosts(hostRows);
        setPillars(pillarRows);
        setBusinessActive(activeBiz);
        setBusinessDraft(draftBiz);
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
        onOpenDeliverable={() => setDeliverableOpen(true)}
      />

      {deliverableOpen && (
        <ClientDeliverable
          clientId={client.id}
          clientName={client.name}
          onClose={() => setDeliverableOpen(false)}
        />
      )}

      <BusinessContextSection
        clientId={client.id}
        active={businessActive}
        draft={businessDraft}
        onChanged={async () => {
          const [a, d] = await Promise.all([
            getActiveBusinessContext(client.id),
            getLatestDraft(client.id),
          ]);
          setBusinessActive(a);
          setBusinessDraft(d);
        }}
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
        onSuggest={() => suggestEditorialPov(client.id, { clientName: client.name })}
      />

      <Section
        title="Voice + tone"
        subtitle="Affirmative description of how the channel sounds. Different from Guardrails (which lists what NOT to do); this is the positive pattern producers and AI generation match against."
        value={spine?.voice_tone}
        updatedAt={spine?.voice_tone_updated_at}
        placeholder="e.g. Warm and unhurried. Speaks plainly, never preachily. Uses concrete imagery over abstraction. Lets silence breathe. Calls out tension before resolving it. Confident enough to admit doubt; never performs certainty."
        onSave={(v) => handleFieldSave('voice_tone', v)}
        onSuggest={() => suggestVoiceTone(client.id, { clientName: client.name })}
      />

      <PillarsPanel
        clientId={client.id}
        clientName={client.name}
        spine={spine}
        pillars={pillars}
        hosts={hosts}
        onPillarsChanged={async () => {
          const refreshed = await listPillars(client.id);
          setPillars(refreshed);
        }}
      />

      <PreflightPanel
        clientId={client.id}
        clientName={client.name}
        pillars={pillars}
      />

      <HostsPanel
        clientId={client.id}
        clientName={client.name}
        spine={spine}
        hosts={hosts}
        onHostsChanged={async () => {
          const refreshed = await listHosts(client.id);
          setHosts(refreshed);
        }}
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
function SpineHeader({ client, onBack, snapshotCount = 0, snapshotBusy = false, onCaptureSnapshot, onOpenDeliverable }) {
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
        {onOpenDeliverable && (
          <button
            onClick={onOpenDeliverable}
            title="Open the client-facing two-part deliverable (01 Category Audit + 02 Positioning Recommendation)"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 6,
              background: '#1e3a5f', color: '#dbeafe',
              border: '1px solid #2a4f7f', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            <FileText size={12} /> Client deliverable
          </button>
        )}
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
// Business context — what the client offers / doesn't offer
// ────────────────────────────────────────────────────────────
// Grounds AI recommendations in client reality. Without this, the
// opportunity-brief generator happily recommends categories the
// client doesn't sell. Lifecycle: strategist runs a website audit →
// Claude extracts → strategist reviews + confirms → flows into all
// downstream AI prompts (spineContextService, whiteSpaceService).
function BusinessContextSection({ clientId, active, draft, onChanged }) {
  const current = draft || active;
  const showingDraft = !!draft && (!active || draft.id !== active.id);

  const [auditUrl, setAuditUrl] = useState(active?.source_url || '');
  const [auditing, setAuditing] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(null);

  const handleAudit = async (e) => {
    e?.preventDefault?.();
    if (auditing || !auditUrl.trim()) return;
    setError(null);
    setAuditing(true);
    try {
      const r = await auditWebsite(clientId, auditUrl.trim());
      if (!r.ok) setError(r.error);
      else await onChanged?.();
    } catch (e) {
      setError(e.message || 'Audit failed');
    } finally {
      setAuditing(false);
    }
  };

  const handleStartEdit = () => {
    if (!current) return;
    setEditDraft({
      one_line_summary: current.one_line_summary || '',
      products_offered: current.products_offered || '',
      products_not_offered: current.products_not_offered || '',
      target_market: current.target_market || '',
    });
    setEditing(true);
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!current?.id || !editDraft) return;
    const r = await updateBusinessContext(current.id, editDraft);
    if (!r.ok) { setError(r.error); return; }
    setEditing(false);
    setEditDraft(null);
    await onChanged?.();
  };

  const handleConfirm = async () => {
    if (!draft?.id) return;
    const r = await confirmBusinessContext(draft.id);
    if (!r.ok) { setError(r.error); return; }
    await onChanged?.();
  };

  const handleDiscard = async () => {
    if (!draft?.id) return;
    if (!window.confirm('Discard this draft? You\'ll need to re-audit or fill in manually.')) return;
    await discardDraft(draft.id);
    await onChanged?.();
  };

  const accent = showingDraft ? '#fbbf24' : (active ? '#34d399' : '#a78bfa');
  const statusBadge = showingDraft
    ? <span style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>Draft · awaiting confirm</span>
    : active
      ? <span style={{ fontSize: 10, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.12)', padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>Confirmed</span>
      : null;

  const action = editing ? (
    <div style={{ display: 'flex', gap: 6 }}>
      <button onClick={handleSaveEdit} style={primaryBtn}><Check size={12} /> Save</button>
      <button onClick={() => { setEditing(false); setEditDraft(null); }} style={ghostBtn}><XIcon size={12} /></button>
    </div>
  ) : showingDraft ? (
    <div style={{ display: 'flex', gap: 6 }}>
      <button onClick={handleConfirm} style={primaryBtn} title="Confirm this draft as the active business context. Once active, it filters AI recommendations."><Check size={12} /> Confirm</button>
      <button onClick={handleStartEdit} style={ghostBtn}><Edit2 size={12} /> Edit</button>
      <button onClick={handleDiscard} style={ghostBtn} title="Discard this draft"><Trash2 size={12} /></button>
    </div>
  ) : current ? (
    <button onClick={handleStartEdit} style={ghostBtn}><Edit2 size={12} /> Edit</button>
  ) : null;

  return (
    <SectionShell
      title={<><Briefcase size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />Business context {statusBadge && <span style={{ marginLeft: 6 }}>{statusBadge}</span>}</>}
      subtitle="What this client offers — and doesn't. Filters AI-generated recommendations so the deliverable stops proposing categories the client can't reproduce. Run a website audit, review the extraction, confirm to activate."
      updatedAt={current?.confirmed_at || current?.updated_at}
      accent={accent}
      action={action}
    >
      {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {!current && !auditing && (
        <form onSubmit={handleAudit}>
          <label style={fieldLabel}>Client website URL</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input
              type="url"
              value={auditUrl}
              onChange={e => setAuditUrl(e.target.value)}
              placeholder="https://safestreets.com"
              style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
              required
            />
            <button type="submit" disabled={!auditUrl.trim() || auditing} style={primaryBtn}>
              <Globe size={12} /> Audit website
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>
            We'll fetch the homepage server-side, run Claude over the content, and draft a structured summary of what this company offers and doesn't. You'll review before it goes active.
          </div>
        </form>
      )}

      {auditing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: '#aaa', fontSize: 13 }}>
          <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
          Fetching site, extracting context… this can take 10–20 seconds.
        </div>
      )}

      {current && !editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {current.source_url && (
            <div style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Globe size={11} /> {current.source_url}
              {current.source_fetched_at && <span style={{ color: '#555' }}>· fetched {formatRelative(current.source_fetched_at)}</span>}
            </div>
          )}
          {current.one_line_summary && (
            <BizField label="Summary" value={current.one_line_summary} />
          )}
          {current.products_offered && (
            <BizField label="Offers" value={current.products_offered} />
          )}
          {current.products_not_offered && (
            <BizField label="Does NOT offer" value={current.products_not_offered} accent="#f87171" />
          )}
          {current.target_market && (
            <BizField label="Target market" value={current.target_market} />
          )}

          {!active && (
            <div style={{ marginTop: 4, padding: '8px 10px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 4, fontSize: 12, color: '#fbbf24', lineHeight: 1.5 }}>
              This is a draft. Click <strong>Confirm</strong> to activate it. AI prompts won't see this context until you do.
            </div>
          )}

          {/* Re-audit affordance when active */}
          {active && !showingDraft && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: '#888' }}>Re-audit with a different URL</summary>
              <form onSubmit={handleAudit} style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <input
                  type="url"
                  value={auditUrl}
                  onChange={e => setAuditUrl(e.target.value)}
                  placeholder="https://..."
                  style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                  required
                />
                <button type="submit" disabled={!auditUrl.trim() || auditing} style={primaryBtn}>
                  <Globe size={12} /> Re-audit
                </button>
              </form>
            </details>
          )}
        </div>
      )}

      {current && editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={fieldLabel}>Summary (one sentence)</label>
          <input
            value={editDraft.one_line_summary}
            onChange={e => setEditDraft({ ...editDraft, one_line_summary: e.target.value })}
            style={inputStyle}
          />
          <label style={fieldLabel}>Offers</label>
          <textarea
            value={editDraft.products_offered}
            onChange={e => setEditDraft({ ...editDraft, products_offered: e.target.value })}
            rows={4}
            style={textareaStyle}
          />
          <label style={fieldLabel}>Does NOT offer (the recommendation filter)</label>
          <textarea
            value={editDraft.products_not_offered}
            onChange={e => setEditDraft({ ...editDraft, products_not_offered: e.target.value })}
            rows={4}
            style={textareaStyle}
          />
          <label style={fieldLabel}>Target market</label>
          <textarea
            value={editDraft.target_market}
            onChange={e => setEditDraft({ ...editDraft, target_market: e.target.value })}
            rows={2}
            style={textareaStyle}
          />
        </div>
      )}
    </SectionShell>
  );
}

function BizField({ label, value, accent }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: accent || '#888', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  );
}

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

function Section({ title, subtitle, value, updatedAt, placeholder, onSave, onSuggest, accent }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  // AI-suggest state — only active when an onSuggest callback is provided
  const [suggesting, setSuggesting] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [suggestError, setSuggestError] = useState(null);

  useEffect(() => { setDraft(value || ''); }, [value]);

  const handleSave = async () => {
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
    if (!onSuggest || suggesting) return;
    setSuggesting(true);
    setSuggestError(null);
    setCandidates(null);
    try {
      const r = await onSuggest();
      if (!r?.ok) setSuggestError(r?.error || 'Suggestion failed');
      else setCandidates(r.candidates || []);
    } catch (e) {
      setSuggestError(e.message || 'Suggestion failed');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <SectionShell title={title} subtitle={subtitle} updatedAt={updatedAt} accent={accent}
      action={editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleSave} style={primaryBtn} title="Save"><Check size={12} /> Save</button>
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
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            autoFocus
            rows={5}
            style={textareaStyle}
          />
          {onSuggest && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <button
                onClick={handleSuggest}
                disabled={suggesting}
                style={{ ...ghostBtn, opacity: suggesting ? 0.7 : 1, cursor: suggesting ? 'wait' : 'pointer' }}
                title="Generate 3 candidate drafts from the rest of the spine"
              >
                {suggesting
                  ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Suggesting…</>
                  : <><Sparkles size={12} /> AI suggest</>}
              </button>
              {!candidates && !suggesting && (
                <span style={{ fontSize: 11, color: '#666' }}>
                  Generates three candidates from the rest of the spine. You pick + edit.
                </span>
              )}
            </div>
          )}
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
                  onClick={() => setDraft(c.text || c.oneliner || '')}
                  style={{
                    textAlign: 'left',
                    background: '#15151a',
                    border: '1px solid #2a2a30',
                    borderRadius: 6,
                    padding: '10px 12px',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    color: '#d4d4d8',
                    cursor: 'pointer',
                    lineHeight: 1.55,
                  }}
                  title={`Insert this candidate (${c.angle || 'option'}) into the draft`}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
                    {c.angle || `option ${i + 1}`}
                  </div>
                  {c.text || c.oneliner || ''}
                </button>
              ))}
            </div>
          )}
        </>
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
// Pillars panel — Step 21 (content pillars as primary unit)
// ────────────────────────────────────────────────────────────
// Pillars are the primary unit of channel strategy. Each pillar is a
// repeatable creative series (title, format, talent model, audience,
// budget). The strategist drafts pillar candidates here pre-meeting,
// promotes 1-3 to active after greenlight, retires the weakest after
// performance data. Hosts (when applicable) get linked per pillar.
function PillarsPanel({ clientId, clientName, spine, pillars, hosts, onPillarsChanged }) {
  const [adding, setAdding] = useState(false);

  // Group by status so drafts (pitch candidates) lead, then active
  // (in-rotation), then retired (history).
  const drafts = pillars.filter(p => p.status === 'draft');
  const active = pillars.filter(p => p.status === 'active');
  const retired = pillars.filter(p => p.status === 'retired');

  const handleCreate = async (patch) => {
    const r = await createPillar(clientId, patch);
    if (r.ok) {
      setAdding(false);
      await onPillarsChanged?.();
    } else {
      window.alert(`Add pillar failed: ${r.error}`);
    }
  };

  return (
    <SectionShell
      title={<><Layers size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />Content pillars</>}
      subtitle="Repeatable creative series — the unit you pitch in the vision-alignment meeting. Channels typically run 3 pillars in an A/B/C rotation; draft candidates here pre-meeting, promote 1-3 to active after greenlight."
      accent="#34d399"
      action={
        <button onClick={() => setAdding(true)} disabled={adding} style={primaryBtn}>
          <Plus size={12} /> Add pillar
        </button>
      }
    >
      {pillars.length === 0 && !adding && (
        <div style={{ color: '#666', fontSize: 13, fontStyle: 'italic', lineHeight: 1.55 }}>
          No pillars yet. Click <strong style={{ color: '#888' }}>Add pillar</strong> to draft your first candidate. Pillars come from your synthesis (the cohort's strongest opportunity, the client's existing series ideas, an unclaimed format you want to test).
        </div>
      )}

      {drafts.length > 0 && (
        <PillarGroup
          label={`Drafts · ${drafts.length}`}
          subtle="Pitch candidates — pre-meeting. Promote 1–3 to active after client greenlight."
          accent="#fbbf24"
        >
          {drafts.map(p => (
            <PillarCard
              key={p.id}
              pillar={p}
              hosts={hosts}
              clientId={clientId}
              onChanged={onPillarsChanged}
            />
          ))}
        </PillarGroup>
      )}

      {active.length > 0 && (
        <PillarGroup
          label={`Active rotation · ${active.length}`}
          subtle={`Publishing in ${active.length}-pillar rotation. A=${active[0]?.rotation_position ?? 0}, B, C…`}
          accent="#34d399"
        >
          {active.map(p => (
            <PillarCard
              key={p.id}
              pillar={p}
              hosts={hosts}
              clientId={clientId}
              onChanged={onPillarsChanged}
            />
          ))}
        </PillarGroup>
      )}

      {retired.length > 0 && (
        <PillarGroup
          label={`Retired · ${retired.length}`}
          subtle="Pillars dropped from rotation after performance data. Kept for history; never re-recommended without new evidence."
          accent="#666"
          defaultCollapsed
        >
          {retired.map(p => (
            <PillarCard
              key={p.id}
              pillar={p}
              hosts={hosts}
              clientId={clientId}
              onChanged={onPillarsChanged}
            />
          ))}
        </PillarGroup>
      )}

      {adding && (
        <div style={{ marginTop: 14 }}>
          <PillarCard
            pillar={null}
            hosts={hosts}
            clientId={clientId}
            startEditing
            onCreate={handleCreate}
            onCancelCreate={() => setAdding(false)}
            onChanged={onPillarsChanged}
          />
        </div>
      )}
    </SectionShell>
  );
}

// Collapsible group of pillar cards. Drafts / Active / Retired each
// render as a group so the strategist sees the lifecycle at a glance.
function PillarGroup({ label, subtle, accent, children, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div style={{ marginTop: 14 }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', padding: '6px 0', cursor: 'pointer', color: '#aaa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'inherit', width: '100%', textAlign: 'left' }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <span style={{ color: accent }}>{label}</span>
        {subtle && <span style={{ color: '#666', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· {subtle}</span>}
      </button>
      {!collapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>{children}</div>}
    </div>
  );
}

// Single pillar card. Compact summary when collapsed; full editor when
// in edit mode. Inline status controls (activate / retire) on hover.
function PillarCard({ pillar, hosts, clientId, startEditing = false, onCreate, onCancelCreate, onChanged }) {
  const isNew = !pillar;
  const [editing, setEditing] = useState(startEditing);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    title: pillar?.title || '',
    creative_description: pillar?.creative_description || '',
    intended_audience: pillar?.intended_audience || '',
    format_type: pillar?.format_type || '',
    talent_model: pillar?.talent_model || '',
    host_id: pillar?.host_id || '',
    budget_per_video_low: pillar?.budget_per_video_low ?? '',
    budget_per_video_high: pillar?.budget_per_video_high ?? '',
    source: pillar?.source || '',
    example_concept: pillar?.example_concept || '',
    notes: pillar?.notes || '',
  });

  const handleSave = async () => {
    setBusy(true);
    const patch = {
      title: draft.title.trim(),
      creative_description: draft.creative_description.trim() || null,
      intended_audience: draft.intended_audience.trim() || null,
      format_type: draft.format_type || null,
      talent_model: draft.talent_model || null,
      host_id: draft.host_id || null,
      budget_per_video_low: draft.budget_per_video_low === '' ? null : Number(draft.budget_per_video_low),
      budget_per_video_high: draft.budget_per_video_high === '' ? null : Number(draft.budget_per_video_high),
      source: draft.source || null,
      example_concept: draft.example_concept.trim() || null,
      notes: draft.notes.trim() || null,
    };
    try {
      if (isNew) {
        await onCreate?.(patch);
      } else {
        const r = await updatePillar(pillar.id, patch);
        if (!r.ok) window.alert(`Save failed: ${r.error}`);
        else {
          setEditing(false);
          await onChanged?.();
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!pillar?.id) return;
    if (!window.confirm(`Delete pillar "${pillar.title}"? This can't be undone.`)) return;
    await deletePillar(pillar.id);
    await onChanged?.();
  };

  const handleActivate = async () => {
    if (!pillar?.id) return;
    await activatePillar(pillar.id);
    await onChanged?.();
  };

  const handleRetire = async () => {
    if (!pillar?.id) return;
    if (!window.confirm(`Retire "${pillar.title}" from the rotation? It stays in history but stops publishing.`)) return;
    await retirePillar(pillar.id);
    await onChanged?.();
  };

  const linkedHost = pillar?.host_id ? hosts.find(h => h.id === pillar.host_id) : null;
  const accent = pillar?.status === 'active' ? '#34d399'
    : pillar?.status === 'retired' ? '#666'
    : '#fbbf24';

  return (
    <div style={{ background: '#15151a', border: '1px solid #232328', borderLeft: `3px solid ${accent}`, borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
            {pillar?.title || draft.title || <span style={{ color: '#666', fontStyle: 'italic' }}>Untitled pillar</span>}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {pillar?.format_type && <span>{PILLAR_FORMAT_LABELS[pillar.format_type]}</span>}
            {pillar?.talent_model && <span>· {PILLAR_TALENT_LABELS[pillar.talent_model]}</span>}
            {linkedHost && <span>· Host: {linkedHost.name || linkedHost.archetype || 'unnamed'}</span>}
            {(pillar?.budget_per_video_low || pillar?.budget_per_video_high) && (
              <span>· ${pillar.budget_per_video_low ?? '?'}–${pillar.budget_per_video_high ?? '?'}/video</span>
            )}
            {pillar?.status === 'active' && pillar.rotation_position != null && (
              <span style={{ color: '#34d399', fontWeight: 700 }}>· Slot {String.fromCharCode(65 + pillar.rotation_position)}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {editing ? (
            <>
              <button onClick={handleSave} disabled={busy || !draft.title.trim()} style={{ ...primaryBtn, opacity: !draft.title.trim() ? 0.5 : 1, cursor: !draft.title.trim() ? 'not-allowed' : 'pointer' }}>
                {busy ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
                {busy ? 'Saving…' : (isNew ? 'Add' : 'Save')}
              </button>
              <button onClick={() => { isNew ? onCancelCreate?.() : setEditing(false); }} style={ghostBtn}><XIcon size={12} /></button>
            </>
          ) : (
            <>
              {pillar?.status === 'draft' && (
                <button onClick={handleActivate} style={primaryBtn} title="Promote to active rotation">
                  <Check size={12} /> Activate
                </button>
              )}
              {pillar?.status === 'active' && (
                <button onClick={handleRetire} style={ghostBtn} title="Retire from rotation">
                  <ChevronDown size={12} /> Retire
                </button>
              )}
              <button onClick={() => setEditing(true)} style={ghostBtn}><Edit2 size={12} /> Edit</button>
              {!isNew && (
                <button onClick={handleDelete} style={ghostBtnSmall} title="Delete pillar"><Trash2 size={13} /></button>
              )}
            </>
          )}
        </div>
      </div>

      {!editing && pillar?.creative_description && (
        <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 1.55, marginTop: 6 }}>{pillar.creative_description}</div>
      )}
      {!editing && pillar?.intended_audience && (
        <div style={{ fontSize: 11, color: '#888', marginTop: 4, fontStyle: 'italic' }}>Audience: {pillar.intended_audience}</div>
      )}

      {editing && (
        <div style={{ marginTop: 6 }}>
          <label style={fieldLabel}>Title</label>
          <input
            value={draft.title}
            onChange={e => setDraft({ ...draft, title: e.target.value })}
            placeholder='e.g. "Daily Q&A", "Installation Diaries", "Caught on Camera"'
            style={inputStyle}
            autoFocus
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={fieldLabel}>Format</label>
              <select value={draft.format_type} onChange={e => setDraft({ ...draft, format_type: e.target.value })} style={inputStyle}>
                <option value="">— Pick —</option>
                {Object.entries(PILLAR_FORMAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={fieldLabel}>Talent model</label>
              <select value={draft.talent_model} onChange={e => setDraft({ ...draft, talent_model: e.target.value })} style={inputStyle}>
                <option value="">— Pick —</option>
                {Object.entries(PILLAR_TALENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {draft.talent_model === 'host' && hosts.length > 0 && (
            <>
              <label style={fieldLabel}>Linked host (optional)</label>
              <select value={draft.host_id} onChange={e => setDraft({ ...draft, host_id: e.target.value })} style={inputStyle}>
                <option value="">— Cast TBD —</option>
                {hosts.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.name || h.archetype || 'unnamed host'}{h.series_label ? ` (${h.series_label})` : ''}
                  </option>
                ))}
              </select>
            </>
          )}

          <label style={fieldLabel}>Creative description (what the series IS, how it's defined, POV, topics covered)</label>
          <textarea
            value={draft.creative_description}
            onChange={e => setDraft({ ...draft, creative_description: e.target.value })}
            placeholder="e.g. Single-camera installer-POV documentary clips. Each episode shows one real install from doorbell to system check, narrated by the installer doing the work. No b-roll, no host explainers."
            rows={3}
            style={textareaStyle}
          />

          <label style={fieldLabel}>Intended audience (with interest-axis position — entertainment ↔ thought leadership)</label>
          <textarea
            value={draft.intended_audience}
            onChange={e => setDraft({ ...draft, intended_audience: e.target.value })}
            placeholder="e.g. Existing customers + considering-purchase homeowners. Interest axis: practitioner-curiosity (closer to thought leadership than entertainment)."
            rows={2}
            style={textareaStyle}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={fieldLabel}>Budget per video — low ($)</label>
              <input
                type="number" min="0" step="100"
                value={draft.budget_per_video_low}
                onChange={e => setDraft({ ...draft, budget_per_video_low: e.target.value })}
                placeholder="e.g. 1500"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabel}>Budget per video — high ($)</label>
              <input
                type="number" min="0" step="100"
                value={draft.budget_per_video_high}
                onChange={e => setDraft({ ...draft, budget_per_video_high: e.target.value })}
                placeholder="e.g. 4000"
                style={inputStyle}
              />
            </div>
          </div>

          <label style={fieldLabel}>Source</label>
          <select value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value })} style={inputStyle}>
            <option value="">— Pick —</option>
            <option value="strategist">Strategist synthesis</option>
            <option value="client_idea">Client idea</option>
            <option value="existing_channel_pillar">Existing channel pillar</option>
          </select>

          <label style={fieldLabel}>Example concept (sample title or in-channel episode idea)</label>
          <input
            value={draft.example_concept}
            onChange={e => setDraft({ ...draft, example_concept: e.target.value })}
            placeholder='e.g. "Why this 30-year SafeStreets installer always checks the meter box first"'
            style={inputStyle}
          />

          <label style={fieldLabel}>Notes</label>
          <textarea
            value={draft.notes}
            onChange={e => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Strategist notes — anything off-template, status, references."
            rows={2}
            style={textareaStyle}
          />
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Multi-host panel — Step 7 (replaces single Host Archetype + Rubric)
// ────────────────────────────────────────────────────────────
// A client can have multiple host profiles, one per series. Each host
// has its own archetype, voice refinement, and audition rubric. The
// previous single-host model auto-migrates to a "Primary host" row in
// client_hosts (handled in clientHostsService.listHosts).
function HostsPanel({ clientId, clientName, spine, hosts, onHostsChanged }) {
  const [adding, setAdding] = useState(false);

  const handleCreate = async (patch) => {
    const r = await createHost(clientId, patch);
    if (r.ok) {
      setAdding(false);
      await onHostsChanged?.();
    } else {
      window.alert(`Add host failed: ${r.error}`);
    }
  };

  return (
    <SectionShell
      title={<><ClipboardList size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />Hosts</>}
      subtitle="One profile per on-camera host. Each host has its own archetype, voice refinement, and audition rubric. Channels with multiple series typically run multiple hosts."
      accent="#a78bfa"
      action={
        <button onClick={() => setAdding(true)} disabled={adding} style={primaryBtn}>
          <Plus size={12} /> Add host
        </button>
      }
    >
      {hosts.length === 0 && !adding && (
        <div style={{ color: '#666', fontSize: 13, fontStyle: 'italic', lineHeight: 1.55 }}>
          No hosts yet. Click <strong style={{ color: '#888' }}>Add host</strong> to define the first on-camera persona. If you've already authored a host archetype on the spine, it'll show up here automatically.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {hosts.map(h => (
          <HostCard
            key={h.id}
            clientId={clientId}
            clientName={clientName}
            spine={spine}
            host={h}
            onChanged={onHostsChanged}
          />
        ))}
        {adding && (
          <HostCard
            clientId={clientId}
            clientName={clientName}
            spine={spine}
            host={null}
            startEditing
            onCreate={handleCreate}
            onCancelCreate={() => setAdding(false)}
            onChanged={onHostsChanged}
          />
        )}
      </div>
    </SectionShell>
  );
}

// Single host card. Inline editor for the host's fields + an embedded
// per-host rubric editor (reuses RubricView / RubricEditor / print
// modal from the Step 3 work). Each card owns its own rubric state.
function HostCard({ clientId, clientName, spine, host, startEditing, onCreate, onCancelCreate, onChanged }) {
  const isNew = !host;
  const [editing, setEditing] = useState(!!startEditing);
  const [draft, setDraft] = useState({
    name: host?.name || '',
    archetypeId: matchArchetypeId(host?.archetype),
    archetypeRefinement: extractArchetypeRefinement(host?.archetype),
    voice_tone_refinement: host?.voice_tone_refinement || '',
    series_label: host?.series_label || '',
    notes: host?.notes || '',
  });
  const [busy, setBusy] = useState(false);

  // AI suggest state — only used in edit mode for archetype/refinement picks
  const [suggesting, setSuggesting] = useState(false);
  const [hostCandidates, setHostCandidates] = useState(null);
  const [suggestError, setSuggestError] = useState(null);

  // Rubric state — per-host
  const [rubric, setRubric] = useState(null);
  const [rubricLoaded, setRubricLoaded] = useState(false);
  const [rubricDraft, setRubricDraft] = useState(null);
  const [rubricGenerating, setRubricGenerating] = useState(false);
  const [rubricSaving, setRubricSaving] = useState(false);
  const [rubricError, setRubricError] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);
  const rubricEditing = !!rubricDraft;

  useEffect(() => {
    if (isNew || !host?.id) { setRubricLoaded(true); return; }
    let cancelled = false;
    getActiveTalentRubric(clientId, host.id).then(r => {
      if (cancelled) return;
      setRubric(r);
      setRubricLoaded(true);
    });
    return () => { cancelled = true; };
  }, [clientId, host?.id, isNew]);

  const composedArchetype = (() => {
    const cat = HOST_ARCHETYPE_BY_ID[draft.archetypeId];
    if (cat) {
      return draft.archetypeRefinement.trim()
        ? `${cat.label} — ${draft.archetypeRefinement.trim()}`
        : cat.label;
    }
    return draft.archetypeRefinement.trim() || null;
  })();

  const handleSave = async () => {
    setBusy(true);
    const patch = {
      name: draft.name.trim() || null,
      archetype: composedArchetype,
      voice_tone_refinement: draft.voice_tone_refinement.trim() || null,
      series_label: draft.series_label.trim() || null,
      notes: draft.notes.trim() || null,
    };
    try {
      if (isNew) {
        await onCreate?.(patch);
      } else {
        const r = await updateHost(host.id, patch);
        if (!r.ok) window.alert(`Save failed: ${r.error}`);
        else {
          setEditing(false);
          await onChanged?.();
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!host?.id) return;
    if (!window.confirm(`Delete host "${host.name || 'Untitled'}"? This also deletes the host's saved rubric. Cannot be undone.`)) return;
    await deleteHost(host.id);
    await onChanged?.();
  };

  // Rubric handlers — scoped per-host
  const handleGenerateRubric = async () => {
    if (!host?.id) return;
    setRubricGenerating(true);
    setRubricError(null);
    try {
      const r = await generateTalentAuditionRubric(clientId, { clientName, host });
      if (!r.ok) setRubricError(r.error);
      else setRubricDraft({ criteria: r.criteria, introNote: r.introNote || '', sourceSpineFingerprint: r.sourceSpineFingerprint });
    } catch (e) {
      setRubricError(e.message || 'Generation failed');
    } finally {
      setRubricGenerating(false);
    }
  };

  const handleSaveRubric = async () => {
    if (!rubricDraft || !host?.id || rubricSaving) return;
    setRubricSaving(true);
    setRubricError(null);
    try {
      const r = await saveTalentAuditionRubric(clientId, { ...rubricDraft, hostId: host.id });
      if (!r.ok) setRubricError(r.error);
      else {
        setRubric(r.rubric);
        setRubricDraft(null);
      }
    } finally {
      setRubricSaving(false);
    }
  };

  const handleEditRubric = () => {
    if (!rubric) return;
    setRubricDraft({
      criteria: rubric.criteria || [],
      introNote: rubric.intro_note || '',
      sourceSpineFingerprint: rubric.source_spine_fingerprint || null,
    });
  };

  const accent = '#a78bfa';

  return (
    <div style={{ background: '#15151a', border: `1px solid #232328`, borderLeft: `3px solid ${accent}`, borderRadius: 8, padding: '14px 16px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
            {host?.name || draft.name || <span style={{ color: '#666', fontStyle: 'italic' }}>Untitled host</span>}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
            {(host?.archetype || composedArchetype) && <span>{host?.archetype || composedArchetype}</span>}
            {host?.series_label && <span> · <span style={{ color: '#a8a8b0' }}>{host.series_label}</span></span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {editing ? (
            <>
              <button onClick={handleSave} disabled={busy} style={primaryBtn}>
                {busy ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
                {busy ? 'Saving…' : (isNew ? 'Add' : 'Save')}
              </button>
              <button onClick={() => { isNew ? onCancelCreate?.() : setEditing(false); }} style={ghostBtn}>
                <XIcon size={12} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} style={ghostBtn} title="Edit host profile">
                <Edit2 size={12} /> Edit
              </button>
              {!isNew && (
                <button onClick={handleDelete} style={ghostBtnSmall} title="Delete host">
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {editing && (
        <div style={{ marginTop: 6 }}>
          <HostSuggestPanel
            clientId={clientId}
            clientName={clientName}
            seriesLabelHint={draft.series_label}
            suggesting={suggesting}
            setSuggesting={setSuggesting}
            candidates={hostCandidates}
            setCandidates={setHostCandidates}
            error={suggestError}
            setError={setSuggestError}
            onPickCandidate={(c) => {
              setDraft(d => ({
                ...d,
                archetypeId: c.archetypeId || '',
                archetypeRefinement: c.refinement || '',
                voice_tone_refinement: c.voice_tone_refinement || d.voice_tone_refinement,
              }));
              setHostCandidates(null);
            }}
          />

          <label style={fieldLabel}>Name (or "TBD" if pre-casting)</label>
          <input
            value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Sarah Lin, TBD, Casting in progress"
            style={inputStyle}
          />

          <label style={fieldLabel}>Series this host fronts</label>
          <input
            value={draft.series_label}
            onChange={e => setDraft({ ...draft, series_label: e.target.value })}
            placeholder='e.g. "Doctrine deep-dives", "Daily Q&A", "Field reports"'
            style={inputStyle}
          />

          <label style={fieldLabel}>Archetype</label>
          <select
            value={draft.archetypeId}
            onChange={e => setDraft({ ...draft, archetypeId: e.target.value })}
            style={{ ...inputStyle, marginBottom: 6 }}
          >
            <option value="">— Pick from catalog —</option>
            {HOST_ARCHETYPES.map(a => (
              <option key={a.id} value={a.id}>{a.label} — {a.description}</option>
            ))}
          </select>
          <input
            value={draft.archetypeRefinement}
            onChange={e => setDraft({ ...draft, archetypeRefinement: e.target.value })}
            placeholder={draft.archetypeId ? "Optional: refinement note appended to the archetype label" : "Or describe a custom archetype here"}
            style={inputStyle}
          />

          <label style={fieldLabel}>Voice + tone refinement (overlay on channel voice)</label>
          <textarea
            value={draft.voice_tone_refinement}
            onChange={e => setDraft({ ...draft, voice_tone_refinement: e.target.value })}
            placeholder="What this specific host's voice does that the channel default doesn't — pace, register, signature moves."
            rows={3}
            style={textareaStyle}
          />

          <label style={fieldLabel}>Notes</label>
          <textarea
            value={draft.notes}
            onChange={e => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Casting status, audition outcomes, anything off-template."
            rows={2}
            style={textareaStyle}
          />
        </div>
      )}

      {/* Rubric block — only for existing hosts (need host.id to scope rubric) */}
      {!editing && !isNew && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid #232328` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Audition rubric
              {rubric && <span style={{ color: '#666', fontWeight: 500, textTransform: 'none', marginLeft: 6 }}>· {(rubric.criteria || []).length} criteria · saved {formatRelative(rubric.generated_at)}</span>}
              {!rubric && rubricLoaded && <span style={{ color: '#666', fontWeight: 500, textTransform: 'none', marginLeft: 6 }}>· not generated</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {rubricEditing ? (
                <>
                  <button onClick={handleSaveRubric} disabled={rubricSaving} style={primaryBtn}>
                    {rubricSaving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
                    {rubricSaving ? 'Saving…' : 'Save rubric'}
                  </button>
                  <button onClick={() => { setRubricDraft(null); setRubricError(null); }} style={ghostBtn}><XIcon size={12} /></button>
                </>
              ) : rubric ? (
                <>
                  <button onClick={() => setPrintOpen(true)} style={primaryBtn} title="Open the printable scorecard for this host">
                    <Printer size={12} /> Scorecard
                  </button>
                  <button onClick={handleEditRubric} style={ghostBtn} title="Edit criteria"><Edit2 size={12} /> Edit</button>
                  <button onClick={handleGenerateRubric} disabled={rubricGenerating} style={ghostBtn} title="Regenerate from current spine + this host's profile">
                    {rubricGenerating
                      ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> …</>
                      : <><Sparkles size={12} /> Regen</>}
                  </button>
                </>
              ) : (
                <button onClick={handleGenerateRubric} disabled={rubricGenerating} style={primaryBtn}>
                  {rubricGenerating
                    ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                    : <><Sparkles size={12} /> Generate rubric</>}
                </button>
              )}
            </div>
          </div>

          {rubricError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{rubricError}</div>}

          {rubricEditing ? (
            <RubricEditor
              criteria={rubricDraft.criteria}
              introNote={rubricDraft.introNote}
              onUpdateCriterion={(i, patch) => setRubricDraft(d => ({ ...d, criteria: d.criteria.map((c, idx) => idx === i ? { ...c, ...patch } : c) }))}
              onRemoveCriterion={(i) => setRubricDraft(d => ({ ...d, criteria: d.criteria.filter((_, idx) => idx !== i) }))}
              onAddCriterion={() => setRubricDraft(d => ({
                ...d,
                criteria: [...d.criteria, { name: '', what_excellence_looks_like: '', disqualifier: '', scoring_anchors: { 1: '', 3: '', 5: '' }, weight: 'medium' }],
              }))}
              onChangeIntro={(v) => setRubricDraft(d => ({ ...d, introNote: v }))}
            />
          ) : rubric ? (
            <RubricView rubric={rubric} />
          ) : null}
        </div>
      )}

      {printOpen && rubric && (
        <TalentRubricPrintModal
          rubric={rubric}
          clientName={`${clientName}${host?.series_label ? ` · ${host.series_label}` : ''}${host?.name ? ` · ${host.name}` : ''}`}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  );
}

// AI-suggest panel for HostCard. Renders the "AI suggest" button +
// the candidate cards below. Sits at the top of the host edit panel
// so a strategist can populate the archetype + refinement + voice
// refinement from spine context before manually editing other fields.
function HostSuggestPanel({ clientId, clientName, seriesLabelHint, suggesting, setSuggesting, candidates, setCandidates, error, setError, onPickCandidate }) {
  const handleSuggest = async () => {
    if (suggesting) return;
    setSuggesting(true);
    setError(null);
    setCandidates(null);
    try {
      // Read sibling hosts so the suggester avoids proposing the same
      // archetype twice (for multi-series channels).
      const others = (await listHosts(clientId)).map(h => h.archetype).filter(Boolean);
      const r = await suggestHostProfile(clientId, {
        clientName,
        seriesLabel: seriesLabelHint || null,
        existingArchetypes: others,
      });
      if (!r.ok) setError(r.error);
      else setCandidates(r.candidates || []);
    } catch (e) {
      setError(e.message || 'Suggestion failed');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div style={{ marginBottom: 12, padding: 10, background: '#0e0e10', border: '1px dashed #2a2a30', borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#888' }}>
          Generate three candidate host profiles from the spine. Pick one to pre-fill archetype, refinement, and voice refinement.
        </div>
        <button onClick={handleSuggest} disabled={suggesting} style={{ ...ghostBtn, flexShrink: 0 }}>
          {suggesting
            ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Suggesting…</>
            : <><Sparkles size={12} /> AI suggest</>}
        </button>
      </div>
      {error && (
        <div style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>{error}</div>
      )}
      {candidates && candidates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Click to use:
          </div>
          {candidates.map((c, i) => (
            <button
              key={i}
              onClick={() => onPickCandidate(c)}
              style={{
                textAlign: 'left',
                background: '#15151a',
                border: '1px solid #2a2a30',
                borderRadius: 6,
                padding: '10px 12px',
                fontFamily: 'inherit',
                fontSize: 13,
                color: '#d4d4d8',
                cursor: 'pointer',
                lineHeight: 1.5,
              }}
              title="Insert this archetype + refinement + voice refinement into the form"
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                {c.archetypeLabel}{c.refinement ? ` — ${c.refinement}` : ''}
              </div>
              {c.voice_tone_refinement && (
                <div style={{ fontSize: 12, color: '#a8a8b0', marginBottom: 4 }}>
                  <span style={{ color: '#a78bfa', fontWeight: 600 }}>Voice:</span> {c.voice_tone_refinement}
                </div>
              )}
              {c.rationale && (
                <div style={{ fontSize: 11, color: '#666', fontStyle: 'italic' }}>
                  {c.rationale}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function matchArchetypeId(value) {
  if (!value) return '';
  const match = HOST_ARCHETYPES.find(a => value.trim().startsWith(a.label));
  return match?.id || '';
}
function extractArchetypeRefinement(value) {
  if (!value) return '';
  const match = HOST_ARCHETYPES.find(a => value.trim().startsWith(a.label));
  if (!match) return value;
  const suffix = value.trim().slice(match.label.length).trim();
  return suffix.startsWith('—') ? suffix.slice(1).trim() : suffix;
}
function RubricView({ rubric }) {
  const weightTone = { high: '#f87171', medium: '#a78bfa', low: '#666' };
  return (
    <div>
      {rubric.intro_note && (
        <div style={{ color: '#d4d4d8', fontSize: 13, lineHeight: 1.55, marginBottom: 14, paddingLeft: 10, borderLeft: '2px solid #2a2a30', fontStyle: 'italic' }}>
          {rubric.intro_note}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(rubric.criteria || []).map((c, i) => (
          <div key={i} style={{ background: '#15151a', border: '1px solid #232328', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e4e4e7' }}>{i + 1}. {c.name}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: weightTone[c.weight] || '#666', textTransform: 'uppercase', letterSpacing: 0.6 }}>{c.weight || 'medium'}</div>
            </div>
            {c.what_excellence_looks_like && (
              <div style={{ fontSize: 12, color: '#a8a8b0', lineHeight: 1.5, marginBottom: 4 }}>
                <strong style={{ color: '#888' }}>5/5:</strong> {c.what_excellence_looks_like}
              </div>
            )}
            {c.disqualifier && (
              <div style={{ fontSize: 12, color: '#a8a8b0', lineHeight: 1.5 }}>
                <strong style={{ color: '#f87171' }}>Disqualifier:</strong> {c.disqualifier}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RubricEditor({ criteria, introNote, onUpdateCriterion, onRemoveCriterion, onAddCriterion, onChangeIntro }) {
  return (
    <div>
      <label style={fieldLabel}>Intro for the hiring panel</label>
      <textarea
        value={introNote}
        onChange={(e) => onChangeIntro(e.target.value)}
        placeholder="Optional 1–2 sentences the panel reads before scoring."
        rows={2}
        style={textareaStyle}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        {criteria.map((c, i) => (
          <CriterionEditor
            key={i}
            index={i}
            criterion={c}
            onChange={(patch) => onUpdateCriterion(i, patch)}
            onRemove={() => onRemoveCriterion(i)}
          />
        ))}
      </div>
      <button onClick={onAddCriterion} style={{ ...ghostBtn, marginTop: 10 }}>
        <Plus size={12} /> Add criterion
      </button>
    </div>
  );
}

function CriterionEditor({ index, criterion, onChange, onRemove }) {
  return (
    <div style={{ background: '#15151a', border: '1px solid #2a2a30', borderRadius: 6, padding: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#666', minWidth: 18 }}>#{index + 1}</span>
        <input
          value={criterion.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Criterion name (e.g. Editorial Voice Fit)"
          style={{ ...inputStyle, fontWeight: 700, marginBottom: 0, flex: 1 }}
        />
        <select
          value={criterion.weight || 'medium'}
          onChange={(e) => onChange({ weight: e.target.value })}
          style={{ ...inputStyle, marginBottom: 0, width: 110 }}
        >
          <option value="high">high weight</option>
          <option value="medium">medium weight</option>
          <option value="low">low weight</option>
        </select>
        <button onClick={onRemove} style={ghostBtnSmall} title="Remove criterion"><Trash2 size={13} /></button>
      </div>
      <label style={fieldLabel}>What 5/5 looks like (for THIS channel)</label>
      <textarea
        value={criterion.what_excellence_looks_like || ''}
        onChange={(e) => onChange({ what_excellence_looks_like: e.target.value })}
        rows={2}
        style={textareaStyle}
      />
      <label style={fieldLabel}>Disqualifier</label>
      <textarea
        value={criterion.disqualifier || ''}
        onChange={(e) => onChange({ disqualifier: e.target.value })}
        rows={2}
        style={textareaStyle}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[1, 3, 5].map(score => (
          <div key={score}>
            <label style={fieldLabel}>Anchor {score}/5</label>
            <textarea
              value={criterion.scoring_anchors?.[score] || ''}
              onChange={(e) => onChange({
                scoring_anchors: { ...(criterion.scoring_anchors || {}), [score]: e.target.value },
              })}
              rows={3}
              style={textareaStyle}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Print modal — full-screen overlay rendering the rubric as a printable
// scorecard. @media print hides everything outside the modal so the
// browser's Print dialog produces only the rubric pages.
function TalentRubricPrintModal({ rubric, clientName, onClose }) {
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const totalWeight = (rubric.criteria || []).reduce((acc, c) => acc + (c.weight === 'high' ? 3 : c.weight === 'low' ? 1 : 2), 0);

  return (
    <div className="rubric-print-overlay" role="dialog" aria-modal="true">
      <style>{`
        @media screen {
          .rubric-print-overlay {
            position: fixed; inset: 0; z-index: 1000;
            background: rgba(8, 8, 10, 0.92);
            overflow: auto;
            padding: 32px;
          }
          .rubric-print-toolbar {
            position: sticky; top: 0; display: flex; gap: 8px; justify-content: flex-end;
            padding-bottom: 12px;
          }
          .rubric-print-page {
            background: #ffffff; color: #1a1a1a;
            max-width: 820px; margin: 0 auto;
            padding: 56px 64px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            border-radius: 4px;
            font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
            line-height: 1.5;
          }
        }
        @media print {
          body * { visibility: hidden !important; }
          .rubric-print-overlay, .rubric-print-overlay * { visibility: visible !important; }
          .rubric-print-overlay {
            position: absolute; inset: 0; background: white; padding: 0;
          }
          .rubric-print-toolbar { display: none !important; }
          .rubric-print-page {
            box-shadow: none !important; max-width: none !important; margin: 0 !important;
            padding: 0.6in 0.7in !important; border-radius: 0 !important;
            color: #000 !important;
          }
          .rubric-print-criterion { break-inside: avoid; }
        }
        .rubric-print-page h1 { font-size: 22px; margin: 0 0 4px; font-weight: 800; letter-spacing: -0.3px; }
        .rubric-print-page .rubric-sub { font-size: 12px; color: #666; margin-bottom: 18px; }
        .rubric-print-page .rubric-intro { font-size: 13px; line-height: 1.55; border-left: 3px solid #1a1a1a; padding-left: 12px; margin: 12px 0 22px; }
        .rubric-print-page .rubric-meta-row { display: flex; gap: 24px; font-size: 12px; color: #1a1a1a; margin-bottom: 22px; padding-bottom: 12px; border-bottom: 1px solid #ccc; }
        .rubric-print-page .rubric-meta-row .label { color: #666; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; }
        .rubric-print-criterion { margin-bottom: 22px; padding: 14px 16px; border: 1px solid #c8c8c8; border-radius: 4px; }
        .rubric-print-criterion .crit-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
        .rubric-print-criterion .crit-name { font-size: 14px; font-weight: 700; }
        .rubric-print-criterion .crit-weight { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; }
        .rubric-print-criterion .crit-detail { font-size: 12px; line-height: 1.5; margin-bottom: 6px; }
        .rubric-print-criterion .crit-anchors { font-size: 11px; margin-top: 8px; }
        .rubric-print-criterion .crit-anchors td { padding: 3px 8px 3px 0; vertical-align: top; }
        .rubric-print-criterion .crit-anchors .score { font-weight: 700; width: 38px; }
        .rubric-print-criterion .crit-scale {
          display: flex; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #ccc;
        }
        .rubric-print-criterion .crit-scale .pill {
          width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid #1a1a1a;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700;
        }
        .rubric-print-criterion .crit-notes {
          margin-top: 10px; min-height: 36px; border-bottom: 1px solid #ccc; font-size: 10px; color: #888;
        }
        .rubric-footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 28px; padding-top: 16px; border-top: 1px solid #ccc; font-size: 11px; }
        .rubric-footer .sig-line { border-bottom: 1px solid #1a1a1a; min-width: 200px; margin-top: 22px; }
      `}</style>

      <div className="rubric-print-toolbar">
        <button onClick={() => window.print()} style={primaryBtn}><Printer size={12} /> Print</button>
        <button onClick={onClose} style={ghostBtn}><XIcon size={12} /> Close</button>
      </div>

      <div className="rubric-print-page">
        <h1>Talent Audition Rubric</h1>
        <div className="rubric-sub">{clientName || 'Channel'} · Generated {dateStr}</div>

        <div className="rubric-meta-row">
          <div><div className="label">Candidate</div><div style={{ borderBottom: '1px solid #1a1a1a', minWidth: 180, marginTop: 4 }}>&nbsp;</div></div>
          <div><div className="label">Audition date</div><div style={{ borderBottom: '1px solid #1a1a1a', minWidth: 120, marginTop: 4 }}>&nbsp;</div></div>
          <div><div className="label">Reviewer</div><div style={{ borderBottom: '1px solid #1a1a1a', minWidth: 140, marginTop: 4 }}>&nbsp;</div></div>
        </div>

        {rubric.intro_note && (
          <div className="rubric-intro">{rubric.intro_note}</div>
        )}

        {(rubric.criteria || []).map((c, i) => (
          <div key={i} className="rubric-print-criterion">
            <div className="crit-head">
              <div className="crit-name">{i + 1}. {c.name}</div>
              <div className="crit-weight">{c.weight || 'medium'} weight</div>
            </div>
            {c.what_excellence_looks_like && (
              <div className="crit-detail"><strong>5/5 looks like:</strong> {c.what_excellence_looks_like}</div>
            )}
            {c.disqualifier && (
              <div className="crit-detail"><strong>Disqualifier:</strong> {c.disqualifier}</div>
            )}
            {(c.scoring_anchors?.[1] || c.scoring_anchors?.[3] || c.scoring_anchors?.[5]) && (
              <table className="crit-anchors">
                <tbody>
                  {[1, 3, 5].map(s => c.scoring_anchors?.[s] && (
                    <tr key={s}><td className="score">{s}/5</td><td>{c.scoring_anchors[s]}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="crit-scale">
              {[1, 2, 3, 4, 5].map(s => <span key={s} className="pill">{s}</span>)}
            </div>
            <div className="crit-notes">Notes</div>
          </div>
        ))}

        <div className="rubric-footer">
          <div>
            <div style={{ color: '#666', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total weight units</div>
            <div style={{ fontSize: 13 }}>{totalWeight} (high=3, medium=2, low=1)</div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Reviewer signature</div>
            <div className="sig-line">&nbsp;</div>
          </div>
        </div>
      </div>
    </div>
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
