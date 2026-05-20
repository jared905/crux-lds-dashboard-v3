/**
 * SeriesIdeator — series-level ideation surface.
 *
 * Two-stage workflow:
 *   Stage 1 (browser): cards for each concept with greenlight/shelve/explore actions.
 *     Mixed sources (AI + user-submitted) coequal at the top.
 *   Stage 2 (explore detail): expanded view of one concept with richer
 *     premise, full episode list, rationale, and the option to greenlight.
 *
 * The active concept browser is the default view. Shelved concepts live
 * under a collapsed section at the bottom. Greenlit concepts also surface
 * so the strategist can see what's already running.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Loader2, Plus, RefreshCw, ArrowLeft,
  CheckCircle, Archive, RotateCcw, Trash2, AlertCircle,
  Compass, Flag, ChevronDown, ChevronRight, Edit3, User, Bot,
  MessageSquare,
} from 'lucide-react';
import {
  listConcepts,
  generateConcepts,
  addUserConcept,
  exploreConcept,
  shelveConcept,
  restoreConcept,
  greenlightConcept,
  ungreenlightConcept,
  deleteConcept,
} from '../../services/seriesIdeationService.js';
import {
  getActiveDemandSignals,
  extractAndStoreDemandSignals,
} from '../../services/demandSignalService.js';

export default function SeriesIdeator({ activeClient }) {
  const [buckets, setBuckets] = useState({ active: [], shelved: [], greenlit: [], concluded: [] });
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState(null); // { type, conceptId }
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [openConceptId, setOpenConceptId] = useState(null);
  const [showShelved, setShowShelved] = useState(false);
  const [seedInput, setSeedInput] = useState('');
  const [seeding, setSeeding] = useState(false);

  // Audience demand signals state
  const [demandRow, setDemandRow] = useState(null);
  const [demandRefreshing, setDemandRefreshing] = useState(false);
  const [demandProgress, setDemandProgress] = useState(null);

  const clientId = activeClient?.id;
  const clientName = activeClient?.name;

  useEffect(() => {
    if (!clientId) {
      setBuckets({ active: [], shelved: [], greenlit: [], concluded: [] });
      setDemandRow(null);
      return;
    }
    setLoading(true);
    Promise.all([
      listConcepts(clientId),
      getActiveDemandSignals(clientId),
    ]).then(([b, demand]) => {
      setBuckets(b);
      setDemandRow(demand);
      setLoading(false);
    });
  }, [clientId, refreshTick]);

  const openConcept = useMemo(() => {
    if (!openConceptId) return null;
    return [...buckets.active, ...buckets.shelved, ...buckets.greenlit, ...buckets.concluded]
      .find(c => c.id === openConceptId) || null;
  }, [openConceptId, buckets]);

  // ─── handlers ─────────────────────────────────────
  const handleGenerate = async () => {
    if (!clientId) return;
    setError(null);
    setBusyAction({ type: 'generate' });
    try {
      const r = await generateConcepts(clientId, { clientName, count: 5 });
      if (!r.ok) setError(r.error || 'Generation failed');
      setRefreshTick(t => t + 1);
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddSeed = async () => {
    if (!clientId || !seedInput.trim()) return;
    setSeeding(true);
    setError(null);
    try {
      const r = await addUserConcept(clientId, seedInput, { clientName });
      if (!r.ok) {
        setError(r.error || 'Failed to add concept');
      } else {
        setSeedInput('');
        setRefreshTick(t => t + 1);
      }
    } finally {
      setSeeding(false);
    }
  };

  const handleExplore = async (conceptId) => {
    setBusyAction({ type: 'explore', conceptId });
    setError(null);
    try {
      const r = await exploreConcept(conceptId, { clientName });
      if (!r.ok) setError(r.error || 'Explore failed');
      setRefreshTick(t => t + 1);
      setOpenConceptId(conceptId);
    } finally {
      setBusyAction(null);
    }
  };

  const handleShelve = async (conceptId) => {
    setBusyAction({ type: 'shelve', conceptId });
    await shelveConcept(conceptId);
    setBusyAction(null);
    setRefreshTick(t => t + 1);
  };

  const handleRestore = async (conceptId) => {
    setBusyAction({ type: 'restore', conceptId });
    await restoreConcept(conceptId);
    setBusyAction(null);
    setRefreshTick(t => t + 1);
  };

  const handleGreenlight = async (conceptId) => {
    if (!window.confirm('Greenlight this series? An active play will be created in the client\'s Strategy Spine.')) return;
    setBusyAction({ type: 'greenlight', conceptId });
    const r = await greenlightConcept(conceptId);
    setBusyAction(null);
    if (!r.ok) setError(r.error || 'Greenlight failed');
    setRefreshTick(t => t + 1);
  };

  const handleUngreenlight = async (conceptId) => {
    if (!window.confirm('Move this series back to concept status? The spine active play will be paused, not deleted.')) return;
    setBusyAction({ type: 'ungreenlight', conceptId });
    await ungreenlightConcept(conceptId);
    setBusyAction(null);
    setRefreshTick(t => t + 1);
  };

  const handleRefreshDemand = async () => {
    if (!clientId || demandRefreshing) return;
    if (demandRow) {
      const days = Math.floor((Date.now() - new Date(demandRow.extracted_at).getTime()) / 86400000);
      if (days < 7 && !window.confirm(`Demand signals were refreshed ${days} day${days === 1 ? '' : 's'} ago. Refresh again? (Will pull comments from the client's recent videos and run a Claude pass.)`)) return;
    }
    setError(null);
    setDemandRefreshing(true);
    setDemandProgress({ step: 'starting' });
    try {
      const r = await extractAndStoreDemandSignals(clientId, {
        clientName,
        onProgress: (p) => setDemandProgress(p),
      });
      if (!r.ok) {
        setError(r.error || 'Demand signal refresh failed');
      } else {
        setDemandRow(r.signals);
      }
    } finally {
      setDemandRefreshing(false);
      setDemandProgress(null);
    }
  };

  const handleDelete = async (conceptId) => {
    if (!window.confirm('Delete this concept permanently? This cannot be undone.')) return;
    setBusyAction({ type: 'delete', conceptId });
    await deleteConcept(conceptId);
    setBusyAction(null);
    if (openConceptId === conceptId) setOpenConceptId(null);
    setRefreshTick(t => t + 1);
  };

  // ─── render ───────────────────────────────────────
  if (!clientId) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>
        <Compass size={28} style={{ marginBottom: 8, color: '#444' }} />
        <div style={{ fontSize: 14 }}>Pin a client in the scope bar to ideate series for them.</div>
      </div>
    );
  }

  if (openConcept) {
    return (
      <ExploreDetail
        concept={openConcept}
        busyAction={busyAction}
        onBack={() => setOpenConceptId(null)}
        onExplore={() => handleExplore(openConcept.id)}
        onGreenlight={() => handleGreenlight(openConcept.id)}
        onShelve={() => handleShelve(openConcept.id)}
        onUngreenlight={() => handleUngreenlight(openConcept.id)}
        onDelete={() => handleDelete(openConcept.id)}
      />
    );
  }

  return (
    <div style={{ padding: '20px 4px' }}>
      <Header
        clientName={clientName}
        activeCount={buckets.active.length}
        greenlitCount={buckets.greenlit.length}
        shelvedCount={buckets.shelved.length}
        generating={busyAction?.type === 'generate'}
        onGenerate={handleGenerate}
      />

      <SeedRow
        value={seedInput}
        onChange={setSeedInput}
        onSubmit={handleAddSeed}
        busy={seeding}
      />

      <DemandBanner
        row={demandRow}
        refreshing={demandRefreshing}
        progress={demandProgress}
        onRefresh={handleRefreshDemand}
      />

      {error && (
        <div style={errorBanner}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          {buckets.greenlit.length > 0 && (
            <Section label={`Greenlit · ${buckets.greenlit.length}`} accent="#34d399">
              {buckets.greenlit.map(c => (
                <ConceptCard
                  key={c.id}
                  concept={c}
                  busyAction={busyAction}
                  onOpen={() => setOpenConceptId(c.id)}
                  onUngreenlight={() => handleUngreenlight(c.id)}
                  onDelete={() => handleDelete(c.id)}
                  variant="greenlit"
                />
              ))}
            </Section>
          )}

          <Section label={`Concepts · ${buckets.active.length}`}>
            {buckets.active.length === 0 ? (
              <EmptyState onGenerate={handleGenerate} generating={busyAction?.type === 'generate'} />
            ) : (
              buckets.active.map(c => (
                <ConceptCard
                  key={c.id}
                  concept={c}
                  busyAction={busyAction}
                  onOpen={() => setOpenConceptId(c.id)}
                  onExplore={() => handleExplore(c.id)}
                  onShelve={() => handleShelve(c.id)}
                  onGreenlight={() => handleGreenlight(c.id)}
                  onDelete={() => handleDelete(c.id)}
                  variant="active"
                />
              ))
            )}
          </Section>

          {buckets.shelved.length > 0 && (
            <CollapsibleSection
              label={`Shelved · ${buckets.shelved.length}`}
              expanded={showShelved}
              onToggle={() => setShowShelved(v => !v)}
            >
              {buckets.shelved.map(c => (
                <ConceptCard
                  key={c.id}
                  concept={c}
                  busyAction={busyAction}
                  onOpen={() => setOpenConceptId(c.id)}
                  onRestore={() => handleRestore(c.id)}
                  onDelete={() => handleDelete(c.id)}
                  variant="shelved"
                />
              ))}
            </CollapsibleSection>
          )}
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Header + seed input
// ────────────────────────────────────────────────────────────
function Header({ clientName, activeCount, greenlitCount, shelvedCount, generating, onGenerate }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap', marginBottom: 14,
    }}>
      <div>
        <div style={{ fontSize: 11, color: '#888', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>
          Series Ideation
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>
          {clientName || 'Series concepts'}
          <span style={{ fontSize: 12, color: '#777', marginLeft: 10, fontWeight: 500 }}>
            {activeCount} concepts
            {greenlitCount > 0 && ` · ${greenlitCount} greenlit`}
            {shelvedCount > 0 && ` · ${shelvedCount} shelved`}
          </span>
        </h2>
      </div>
      <button
        onClick={onGenerate}
        disabled={generating}
        style={primaryBtn}
      >
        {generating
          ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
          : <><Sparkles size={13} /> Generate 5 concepts</>}
      </button>
    </div>
  );
}

function SeedRow({ value, onChange, onSubmit, busy }) {
  return (
    <div style={{
      background: '#16161a', border: '1px solid #232328', borderRadius: 10,
      padding: 12, marginBottom: 14,
    }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <User size={12} /> Have your own series idea? Type a sentence — Claude will flesh it into the same shape.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && value.trim()) { e.preventDefault(); onSubmit(); } }}
          placeholder='e.g. "Sunday Setup" — one Sunday-morning decision per episode, 8 episodes, 6-9min long-form'
          style={inputStyle}
          disabled={busy}
        />
        <button
          onClick={onSubmit}
          disabled={busy || !value.trim()}
          style={{ ...primaryBtn, opacity: (busy || !value.trim()) ? 0.5 : 1 }}
        >
          {busy
            ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Adding…</>
            : <><Plus size={13} /> Add concept</>}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Demand signals banner — surfaces audience demand mining status
// ────────────────────────────────────────────────────────────
function DemandBanner({ row, refreshing, progress, onRefresh }) {
  const hasSignals = !!row;
  const days = hasSignals
    ? Math.floor((Date.now() - new Date(row.extracted_at).getTime()) / 86400000)
    : null;

  const stale = days != null && days >= 14;
  const itemCount = hasSignals
    ? ((row.signals?.unserved_requests?.length || 0)
       + (row.signals?.recurring_themes?.length || 0)
       + (row.signals?.engagement_peaks?.length || 0))
    : 0;

  const accent = !hasSignals ? '#71717a' : stale ? '#fbbf24' : '#60a5fa';

  return (
    <div style={{
      background: '#16161a',
      border: `1px solid ${accent}33`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 10, padding: '12px 14px', marginBottom: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <MessageSquare size={15} color={accent} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
            Audience demand signals
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {refreshing ? (
              progress?.step === 'analyzing'
                ? 'Analyzing comments…'
                : progress?.step === 'fetching'
                  ? `Fetching comments (${progress.videoIndex}/${progress.videoCount})…`
                  : 'Starting…'
            ) : !hasSignals ? (
              'Not yet mined. Refresh to pull comments from the client\'s recent videos and extract unserved demand.'
            ) : (
              <>
                {itemCount} {itemCount === 1 ? 'item' : 'items'} from {row.comment_count} comments across {row.video_count} videos · refreshed {days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`}
                {stale && <span style={{ color: '#fbbf24', marginLeft: 6 }}>· stale, consider refreshing</span>}
              </>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        style={{ ...refreshBtnSmall, opacity: refreshing ? 0.7 : 1 }}
      >
        {refreshing
          ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Refreshing…</>
          : <><RefreshCw size={12} /> {hasSignals ? 'Refresh' : 'Mine demand signals'}</>}
      </button>
    </div>
  );
}

const refreshBtnSmall = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 11px', borderRadius: 6,
  background: '#18181c', color: '#d4d4d8',
  border: '1px solid #232328', cursor: 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
};

// ────────────────────────────────────────────────────────────
// Section shells
// ────────────────────────────────────────────────────────────
function Section({ label, accent, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: accent || '#888',
        textTransform: 'uppercase', letterSpacing: 0.7,
        marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function CollapsibleSection({ label, expanded, onToggle, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
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
        {label}
      </button>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
      <div style={{ fontSize: 12, marginTop: 8 }}>Loading concepts…</div>
    </div>
  );
}

function EmptyState({ onGenerate, generating }) {
  return (
    <div style={{
      padding: '32px 20px', background: '#131316', border: '1px dashed #2a2a30',
      borderRadius: 10, textAlign: 'center', color: '#888',
    }}>
      <Compass size={22} color="#555" style={{ marginBottom: 8 }} />
      <div style={{ fontSize: 13 }}>No active concepts yet.</div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 4, marginBottom: 12 }}>
        Generate from the data, or seed your own above.
      </div>
      <button onClick={onGenerate} disabled={generating} style={primaryBtn}>
        {generating
          ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
          : <><Sparkles size={13} /> Generate 5 concepts</>}
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Concept card
// ────────────────────────────────────────────────────────────
function ConceptCard({ concept, busyAction, variant, onOpen, onExplore, onShelve, onGreenlight, onRestore, onUngreenlight, onDelete }) {
  const busyHere = busyAction?.conceptId === concept.id;
  const sourceIcon = concept.source === 'user' ? <User size={11} /> : <Bot size={11} />;
  const sourceLabel = concept.source === 'user' ? 'Your idea' : 'AI generated';
  const accent = variant === 'greenlit' ? '#34d399'
    : variant === 'shelved' ? '#71717a'
    : '#60a5fa';

  return (
    <div style={{
      background: '#131316', border: '1px solid #1f1f24',
      borderLeft: `3px solid ${accent}`,
      borderRadius: 10, padding: '14px 16px',
      opacity: variant === 'shelved' ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <button
          onClick={onOpen}
          style={{
            background: 'transparent', border: 'none', padding: 0, margin: 0,
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            fontSize: 15, fontWeight: 700, color: '#fff',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.textDecorationColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.textUnderlineOffset = '3px'; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
          title="Open detail view"
        >
          {concept.title}
        </button>
        <div style={{
          fontSize: 10, color: '#777', fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 7px', background: '#18181c', borderRadius: 4,
          flexShrink: 0,
        }}>
          {sourceIcon} {sourceLabel}
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#888', marginBottom: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {concept.format && <span>{concept.format}</span>}
        {concept.cadence && <span>· {concept.cadence}</span>}
        {concept.episode_count && <span>· {concept.episode_count} episodes</span>}
      </div>

      {concept.premise && (
        <div style={{ color: '#d4d4d8', fontSize: 13, lineHeight: 1.55, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
          {concept.premise}
        </div>
      )}

      {Array.isArray(concept.episodes) && concept.episodes.length > 0 && (
        <ol style={{
          margin: '0 0 10px', paddingLeft: 18,
          color: '#a1a1aa', fontSize: 12, lineHeight: 1.7,
        }}>
          {concept.episodes.slice(0, 4).map((ep, i) => (
            <li key={i}>{ep.title}{ep.hook ? <span style={{ color: '#71717a' }}> — {ep.hook}</span> : null}</li>
          ))}
          {concept.episodes.length > 4 && (
            <li style={{ color: '#666', listStyle: 'none', marginLeft: -18 }}>
              <button onClick={onOpen} style={linkBtn}>
                + {concept.episodes.length - 4} more episodes
              </button>
            </li>
          )}
        </ol>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {variant === 'active' && (
          <>
            <ActionBtn onClick={onGreenlight} busy={busyHere && busyAction?.type === 'greenlight'} primary>
              <Flag size={12} /> Greenlight
            </ActionBtn>
            <ActionBtn onClick={onExplore} busy={busyHere && busyAction?.type === 'explore'}>
              <Compass size={12} /> Explore
            </ActionBtn>
            <ActionBtn onClick={onShelve} busy={busyHere && busyAction?.type === 'shelve'}>
              <Archive size={12} /> Shelve
            </ActionBtn>
            <ActionBtn onClick={onDelete} busy={busyHere && busyAction?.type === 'delete'} danger>
              <Trash2 size={12} />
            </ActionBtn>
          </>
        )}
        {variant === 'shelved' && (
          <>
            <ActionBtn onClick={onRestore} busy={busyHere && busyAction?.type === 'restore'}>
              <RotateCcw size={12} /> Restore
            </ActionBtn>
            <ActionBtn onClick={onDelete} busy={busyHere && busyAction?.type === 'delete'} danger>
              <Trash2 size={12} />
            </ActionBtn>
          </>
        )}
        {variant === 'greenlit' && (
          <>
            <div style={{
              fontSize: 11, color: '#34d399', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 9px', background: 'rgba(52,211,153,0.1)', borderRadius: 5,
              border: '1px solid rgba(52,211,153,0.3)',
            }}>
              <CheckCircle size={11} /> Greenlit · active play in spine
            </div>
            <ActionBtn onClick={onUngreenlight} busy={busyHere && busyAction?.type === 'ungreenlight'}>
              <RotateCcw size={12} /> Move to concepts
            </ActionBtn>
          </>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Explore detail view
// ────────────────────────────────────────────────────────────
function ExploreDetail({ concept, busyAction, onBack, onExplore, onGreenlight, onShelve, onUngreenlight, onDelete }) {
  return (
    <div style={{ padding: '20px 4px', maxWidth: 900, margin: '0 auto' }}>
      <button onClick={onBack} style={backBtn}>
        <ArrowLeft size={12} /> Concepts
      </button>

      <div style={{ marginTop: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
          Series concept · {concept.source === 'user' ? 'Your idea' : 'AI generated'} · {concept.status}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>
          {concept.title}
        </h1>
        <div style={{ fontSize: 12, color: '#888', marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {concept.format && <span>{concept.format}</span>}
          {concept.cadence && <span>{concept.cadence}</span>}
          {concept.episode_count && <span>{concept.episode_count} episodes</span>}
        </div>
      </div>

      <DetailSection title="Premise">
        <div style={{ color: '#d4d4d8', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {concept.premise || '(no premise yet)'}
        </div>
      </DetailSection>

      <DetailSection title="Rationale — why this for this client">
        <div style={{ color: '#d4d4d8', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {concept.rationale || '(not yet articulated — run Deepen to generate)'}
        </div>
      </DetailSection>

      <DetailSection title={`Episodes (${(concept.episodes || []).length})`}>
        {(concept.episodes || []).length === 0 ? (
          <div style={{ color: '#666', fontSize: 13, fontStyle: 'italic' }}>No episodes yet.</div>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 20, color: '#d4d4d8', fontSize: 13, lineHeight: 1.7 }}>
            {concept.episodes.map((ep, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>{ep.title}</span>
                {ep.hook && (
                  <div style={{ color: '#a1a1aa', fontSize: 12, marginTop: 2, lineHeight: 1.55 }}>
                    {ep.hook}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </DetailSection>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
        {concept.status === 'concept' && (
          <>
            <ActionBtn onClick={onGreenlight} busy={busyAction?.conceptId === concept.id && busyAction?.type === 'greenlight'} primary>
              <Flag size={13} /> Greenlight this series
            </ActionBtn>
            <ActionBtn onClick={onExplore} busy={busyAction?.conceptId === concept.id && busyAction?.type === 'explore'}>
              <Compass size={13} /> Deepen
            </ActionBtn>
            <ActionBtn onClick={onShelve} busy={busyAction?.conceptId === concept.id && busyAction?.type === 'shelve'}>
              <Archive size={13} /> Shelve
            </ActionBtn>
          </>
        )}
        {concept.status === 'greenlit' && (
          <ActionBtn onClick={onUngreenlight}>
            <RotateCcw size={13} /> Move back to concepts
          </ActionBtn>
        )}
        <ActionBtn onClick={onDelete} danger>
          <Trash2 size={13} /> Delete
        </ActionBtn>
      </div>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <div style={{
      background: '#131316', border: '1px solid #1f1f24', borderRadius: 10,
      padding: '14px 16px', marginBottom: 12,
    }}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Shared bits
// ────────────────────────────────────────────────────────────
function ActionBtn({ children, onClick, busy, primary, danger }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '6px 10px', borderRadius: 5,
    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.6 : 1,
  };
  const palette = primary ? {
    background: '#1e3a5f', color: '#dbeafe', border: '1px solid #2a4f7f',
  } : danger ? {
    background: '#18181c', color: '#f87171', border: '1px solid #2a2a30',
  } : {
    background: '#18181c', color: '#d4d4d8', border: '1px solid #232328',
  };
  return (
    <button onClick={onClick} disabled={busy} style={{ ...base, ...palette }}>
      {busy ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : children}
    </button>
  );
}

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 12px', borderRadius: 6,
  background: '#1e3a5f', color: '#dbeafe',
  border: '1px solid #2a4f7f', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
};

const backBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 11px', borderRadius: 5,
  background: '#18181c', color: '#d4d4d8',
  border: '1px solid #232328', cursor: 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
};

const inputStyle = {
  flex: 1,
  background: '#0e0e10', color: '#e4e4e7',
  border: '1px solid #2a2a30', borderRadius: 6,
  padding: '8px 11px', fontSize: 13,
  fontFamily: 'inherit',
};

const errorBanner = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: '#3a1f1f', border: '1px solid #5a2828',
  borderRadius: 6, padding: '8px 11px', marginBottom: 14,
  color: '#fca5a5', fontSize: 12,
};

const linkBtn = {
  background: 'transparent', border: 'none', padding: 0, margin: 0,
  color: '#888', fontSize: 12, fontFamily: 'inherit',
  cursor: 'pointer', textDecoration: 'underline',
};
