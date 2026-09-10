/**
 * ChannelIssuesModal — lists channels in trouble so you can act on them.
 *
 * view === 'failing'      → channels with last_sync_error populated
 * view === 'handles'      → channels with youtube_channel_id LIKE 'handle_%'
 * view === 'quarantined'  → channels the sync switched off after repeated
 *                           hard failures (migration 117), or an operator
 *                           archived. Nothing here is deleted; Retry puts a
 *                           channel back in the queue with a clean slate.
 *
 * When `clientId` is provided, the 'failing' view scopes to that client's
 * pinned competitor cohort instead of the whole pipeline. Used from the
 * Portfolio "Resolve N sync errors" chip so the operator drills into one
 * client's broken competitors, not the system-wide failure list.
 *
 * For each row: name + reason + actions:
 *   - failing: "Archive" (sets tier='archive' so it stops polluting the queue)
 *   - handles: just shows the synthetic id, the Resolve handles button on
 *              the Landscape header runs the bulk YouTube lookup.
 */
import {useEffect, useState} from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../services/supabaseClient';
import { AlertTriangle, Archive, ExternalLink, Loader, RotateCcw, Wand2, X } from 'lucide-react';

export default function ChannelIssuesModal({ view, clientId, clientName, onClose, onChanged }) {
  const [rows, setRows] = useState(null); // null = loading, [] = empty, [...] = list
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // For client-scoped failing view, first pull the cohort of pinned
      // competitor ids. Keeps the modal narrow: this client's pain only.
      let cohortIds = null;
      if (view === 'failing' && clientId) {
        const { data: junc } = await supabase
          .from('client_channels')
          .select('channel_id')
          .eq('client_id', clientId);
        cohortIds = (junc || []).map(r => r.channel_id);
        if (!cohortIds.length) {
          if (!cancelled) setRows([]);
          return;
        }
      }

      let q;
      if (view === 'failing') {
        // Only channels the sync is still trying. Quarantined ones have
        // their own view — mixing them here is how a list of 13 "failures"
        // hides the one that actually needs a human today.
        q = supabase.from('channels')
          .select('id, name, custom_url, youtube_channel_id, thumbnail_url, last_sync_error, last_sync_attempt_at, tier, consecutive_sync_failures')
          .not('last_sync_error', 'is', null)
          .eq('sync_enabled', true)
          .order('last_sync_attempt_at', { ascending: false });
        if (cohortIds) q = q.in('id', cohortIds);
      } else if (view === 'quarantined') {
        q = supabase.from('channels')
          .select('id, name, custom_url, youtube_channel_id, thumbnail_url, last_sync_error, last_sync_attempt_at, tier, consecutive_sync_failures, sync_disabled_at, sync_disabled_reason')
          .eq('sync_enabled', false)
          .not('sync_disabled_at', 'is', null)
          .order('sync_disabled_at', { ascending: false });
        if (cohortIds) q = q.in('id', cohortIds);
      } else {
        q = supabase.from('channels')
          .select('id, name, custom_url, youtube_channel_id, thumbnail_url, tracked_since, tier')
          .like('youtube_channel_id', 'handle_%')
          .order('tracked_since', { ascending: false });
      }
      let { data, error } = await q;
      if (error && /consecutive_sync_failures|sync_disabled/.test(error.message || '')) {
        // Migration 117 not applied yet — fall back to the columns that exist.
        if (view === 'quarantined') { data = []; }
        else if (view === 'failing') {
          let fq = supabase.from('channels')
            .select('id, name, custom_url, youtube_channel_id, thumbnail_url, last_sync_error, last_sync_attempt_at, tier')
            .not('last_sync_error', 'is', null)
            .order('last_sync_attempt_at', { ascending: false });
          if (cohortIds) fq = fq.in('id', cohortIds);
          ({ data } = await fq);
        }
      }
      if (!cancelled) setRows(data || []);
    })();
    return () => { cancelled = true; };
  }, [view, clientId]);

  // Writes that touch migration-117 columns fall back to the pre-117 shape
  // if the database doesn't have them yet, so the button never dead-ends.
  const updateTolerant = async (id, patch) => {
    let { error } = await supabase.from('channels').update(patch).eq('id', id);
    if (error && /consecutive_sync_failures|sync_disabled|sync_enabled/.test(error.message || '')) {
      const fb = { ...patch };
      for (const k of ['consecutive_sync_failures', 'sync_disabled_at', 'sync_disabled_reason', 'sync_enabled']) delete fb[k];
      if (Object.keys(fb).length) ({ error } = await supabase.from('channels').update(fb).eq('id', id));
    }
    return error;
  };

  const archive = async (id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      // tier alone never stopped the sync — archived channels were still
      // retried every night with backoff. Archiving now also switches the
      // sync off and records why, so the channel shows under Quarantined
      // rather than silently consuming attempts.
      await updateTolerant(id, {
        tier: 'archive',
        sync_enabled: false,
        sync_disabled_at: new Date().toISOString(),
        sync_disabled_reason: 'Archived by operator',
      });
      setRows(prev => prev.filter(r => r.id !== id));
      onChanged?.();
    } finally { setBusyId(null); }
  };

  const retry = async (id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await updateTolerant(id, {
        sync_enabled: true,
        consecutive_sync_failures: 0,
        sync_disabled_at: null,
        sync_disabled_reason: null,
        last_sync_error: null,
      });
      setRows(prev => prev.filter(r => r.id !== id));
      onChanged?.();
    } finally { setBusyId(null); }
  };

  const scopedToClient = (view === 'failing' || view === 'quarantined') && clientId;
  const title = view === 'failing'
    ? (scopedToClient ? `Failing sync · ${clientName || 'Client cohort'}` : 'Failing sync')
    : view === 'quarantined'
      ? (scopedToClient ? `Quarantined · ${clientName || 'Client cohort'}` : 'Quarantined')
      : 'Unresolved handles';
  const subtitle = view === 'failing'
    ? (scopedToClient
        ? `Pinned competitor channels in this client's cohort whose last YouTube fetch failed. Sync retries automatically every 2h; after 7 hard failures in a row a channel is quarantined.`
        : "Channels where the last YouTube fetch failed. Sync retries automatically every 2h — after 7 hard failures in a row (channel not found, handle unresolvable) the channel is quarantined and stops being tried.")
    : view === 'quarantined'
      ? "Channels the sync has switched off — after repeated hard failures, or archived by an operator. Nothing here is deleted. Fix the id or handle on YouTube, then Retry to put it back in the queue with a clean slate."
      : "Channels imported by @handle but never resolved to a real YouTube channel id. The 'Resolve handles' button on the Landscape header does a bulk lookup.";

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
        width: 'min(720px, 100%)', maxHeight: '85vh', overflowY: 'auto',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12,
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #1f1f24',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {view === 'failing' ? <AlertTriangle size={16} color="#ff8375" /> : <Wand2 size={16} color="#fbbf24" />}
              {title}
              {rows && <span style={{ color: 'var(--outline)', fontWeight: 400, fontSize: 14 }}>· {rows.length}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 4 }}>{subtitle}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--outline)',
            cursor: 'pointer', padding: 4, borderRadius: 4,
          }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: rows === null ? 30 : '4px 12px 16px' }}>
          {rows === null ? (
            <div style={{ textAlign: 'center', color: 'var(--faint)' }}>
              <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--faint)', fontSize: 13 }}>
              Nothing here — pipeline is healthy on this dimension.
            </div>
          ) : rows.map(r => (
            <div key={r.id} style={{
              padding: '10px 12px', borderBottom: '1px solid #1c1c20',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              {r.thumbnail_url ? (
                <img src={r.thumbnail_url} alt="" loading="lazy"
                  style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--card)', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", display: 'flex', alignItems: 'center', gap: 6 }}>
                  {r.name}
                  {r.custom_url && (
                    <span style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 400 }}>· {r.custom_url}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: view === 'handles' ? "var(--warn-text)" : "var(--neg-text)", marginTop: 3, wordBreak: 'break-word' }}>
                  {view === 'failing'
                    ? r.last_sync_error || '(no error message)'
                    : view === 'quarantined'
                      ? (r.sync_disabled_reason || r.last_sync_error || '(no reason recorded)')
                      : `Stored as ${r.youtube_channel_id} — not yet resolved`}
                </div>
                {view === 'failing' && (r.consecutive_sync_failures || 0) > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 2 }}>
                    {r.consecutive_sync_failures} of 7 hard failures before quarantine
                  </div>
                )}
                {view === 'quarantined' && r.sync_disabled_at && (
                  <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 2 }}>
                    Since {new Date(r.sync_disabled_at).toLocaleDateString()}
                  </div>
                )}
              </div>
              {view === 'quarantined' && (
                <>
                  {r.youtube_channel_id?.startsWith('UC') && (
                    <a href={`https://youtube.com/channel/${r.youtube_channel_id}`} target="_blank" rel="noreferrer"
                       title="Open on YouTube — check the id still points somewhere" style={iconLink}>
                      <ExternalLink size={13} />
                    </a>
                  )}
                  <button
                    onClick={() => retry(r.id)}
                    disabled={busyId === r.id}
                    title="Put this channel back in the sync queue with the failure count reset"
                    style={archiveBtn}
                  >
                    {busyId === r.id ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={11} />}
                    Retry
                  </button>
                </>
              )}
              {view === 'failing' && (
                <>
                  {r.youtube_channel_id?.startsWith('UC') && (
                    <a href={`https://youtube.com/channel/${r.youtube_channel_id}`} target="_blank" rel="noreferrer"
                       title="Open on YouTube" style={iconLink}>
                      <ExternalLink size={13} />
                    </a>
                  )}
                  <button
                    onClick={() => archive(r.id)}
                    disabled={busyId === r.id}
                    title="Move to archive tier so the sync stops polling this channel"
                    style={archiveBtn}
                  >
                    {busyId === r.id ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Archive size={11} />}
                    Archive
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

const iconLink = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 6, borderRadius: 5, color: 'var(--outline)',
  background: 'var(--card)', border: '1px solid #232328',
  cursor: 'pointer', textDecoration: 'none',
};

const archiveBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '5px 9px', borderRadius: 5,
  background: 'var(--card)', color: 'var(--text)',
  border: '1px solid #232328', cursor: 'pointer',
  fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
};
