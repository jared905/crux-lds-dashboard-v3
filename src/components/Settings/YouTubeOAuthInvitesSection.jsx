/**
 * YouTubeOAuthInvitesSection — strategist UI for creating and managing
 * guest OAuth invite links.
 *
 * Use case: the strategist needs analytics access to a channel they
 * don't own (e.g., they're only a YouTube Studio Manager). Instead of
 * coaxing the owner to sign up for Full View, they generate a single-
 * use invite link, send it, and the owner grants access in 60 seconds
 * without a Crux account.
 *
 * Lives below the existing YouTubeOAuthSettings in APISettings — same
 * page where you'd expect to find this. Two views:
 *   1. Create form (label, optional client, optional expected email,
 *      optional notes, expiry)
 *   2. Pending + redeemed invites table with copy-link + revoke actions
 */

import React, { useEffect, useState } from 'react';
import {
  Send, Link as LinkIcon, Copy, Check, Trash2, ExternalLink,
  Clock, AlertCircle, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

const STATUS_LABELS = {
  pending:  'Pending',
  redeemed: 'Redeemed',
  expired:  'Expired',
  revoked:  'Revoked',
};
const STATUS_COLORS = {
  pending:  '#E8A82B',
  redeemed: '#3fa66a',
  expired:  '#888',
  revoked:  '#888',
};

export default function YouTubeOAuthInvitesSection() {
  const [loading, setLoading]       = useState(true);
  const [invites, setInvites]       = useState([]);
  const [creating, setCreating]     = useState(false);
  const [error, setError]           = useState(null);
  const [copiedId, setCopiedId]     = useState(null);
  const [clients, setClients]       = useState([]);

  // Form state
  const [formClientId, setFormClientId]               = useState('');
  const [formExpectedEmail, setFormExpectedEmail]     = useState('');
  const [formNotes, setFormNotes]                     = useState('');
  const [formExpiresInDays, setFormExpiresInDays]     = useState(7);

  useEffect(() => {
    void refresh();
    void loadClients();
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const session = (await supabase.auth.getSession())?.data?.session;
      if (!session?.access_token) { setError('Not signed in'); return; }
      const r = await fetch('/api/youtube-oauth-invite?list=mine', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await r.json();
      if (!r.ok) { setError(json?.error || 'Failed to load invites'); return; }
      setInvites(json.invites || []);
    } catch (err) {
      setError(err?.message || 'network error');
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      const { data } = await supabase
        .from('channels')
        .select('id, name')
        .eq('is_competitor', false)
        .order('name');
      setClients(data || []);
    } catch (err) { /* non-fatal */ }
  };

  const handleCreate = async (e) => {
    e?.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const session = (await supabase.auth.getSession())?.data?.session;
      if (!session?.access_token) { setError('Not signed in'); return; }

      const clientLabel = formClientId
        ? clients.find(c => c.id === formClientId)?.name || null
        : null;

      const r = await fetch('/api/youtube-oauth-invite', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          client_id:               formClientId || null,
          client_label:            clientLabel,
          expected_youtube_email:  formExpectedEmail.trim() || null,
          notes:                   formNotes.trim() || null,
          expires_in_days:         Number(formExpiresInDays) || 7,
        }),
      });
      const json = await r.json();
      if (!r.ok) { setError(json?.error || 'Failed to create invite'); return; }

      // Reset form, refresh list
      setFormClientId('');
      setFormExpectedEmail('');
      setFormNotes('');
      setFormExpiresInDays(7);
      await refresh();
    } catch (err) {
      setError(err?.message || 'network error');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (inviteId) => {
    if (!window.confirm('Revoke this invite? The link will stop working immediately.')) return;
    try {
      const session = (await supabase.auth.getSession())?.data?.session;
      await fetch('/api/youtube-oauth-invite?action=revoke', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ invite_id: inviteId }),
      });
      await refresh();
    } catch (err) {
      setError(err?.message || 'network error');
    }
  };

  const handleCopy = async (invite) => {
    const url = buildInviteUrl(invite.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch (err) { /* silent */ }
  };

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Send size={20} style={{ color: '#0A919B' }} />
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#E0E0E0' }}>
              Client OAuth invites
            </h3>
            <p style={{ fontSize: 12, color: '#9E9E9E', margin: '4px 0 0' }}>
              Generate a single-use link for a channel owner who isn't a Full View user. They
              grant access in 60 seconds without creating an account.
            </p>
          </div>
        </div>
        <button onClick={refresh} style={refreshBtnStyle} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {error && (
        <div style={errorBoxStyle}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <form onSubmit={handleCreate} style={formStyle}>
        <div style={formRowStyle}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Client (optional)</span>
            <select
              value={formClientId}
              onChange={e => setFormClientId(e.target.value)}
              style={inputStyle}
            >
              <option value="">— None / for a new channel —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Expected email (optional)</span>
            <input
              type="email"
              value={formExpectedEmail}
              onChange={e => setFormExpectedEmail(e.target.value)}
              placeholder="owner@example.com"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Expires</span>
            <select
              value={formExpiresInDays}
              onChange={e => setFormExpiresInDays(e.target.value)}
              style={inputStyle}
            >
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
        </div>

        <label style={labelStyle}>
          <span style={labelTextStyle}>Notes (shown on the grant page)</span>
          <input
            type="text"
            value={formNotes}
            onChange={e => setFormNotes(e.target.value)}
            placeholder='"Voltage Ad onboarding — granting read-only access for analytics work"'
            style={inputStyle}
          />
        </label>

        <button type="submit" disabled={creating} style={createBtnStyle(creating)}>
          {creating ? 'Creating…' : <><LinkIcon size={14} /> Create invite link</>}
        </button>
      </form>

      {/* Invites table */}
      <div style={{ marginTop: 20 }}>
        <div style={tableHeaderStyle}>
          {invites.length > 0 ? `${invites.length} invite${invites.length === 1 ? '' : 's'}` : 'No invites yet'}
        </div>
        {loading && <div style={{ fontSize: 12, color: '#888' }}>Loading…</div>}
        {!loading && invites.length === 0 && (
          <div style={emptyStateStyle}>
            Create your first invite above. You'll get a link to send the channel owner.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {invites.map(inv => (
            <InviteRow
              key={inv.id}
              invite={inv}
              copied={copiedId === inv.id}
              onCopy={() => handleCopy(inv)}
              onRevoke={() => handleRevoke(inv.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Invite row
// ──────────────────────────────────────────────────

function InviteRow({ invite, copied, onCopy, onRevoke }) {
  const color = STATUS_COLORS[invite.status] || '#888';
  return (
    <div style={rowStyle(color)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={rowTitleStyle}>
          {invite.client_label || invite.expected_youtube_email || 'Untitled invite'}
        </div>
        <div style={rowMetaStyle}>
          <span style={{ color }}>● {STATUS_LABELS[invite.status]}</span>
          {invite.status === 'pending' && (
            <>
              {' · '}<Clock size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
              {' '}expires {new Date(invite.expires_at).toLocaleDateString()}
            </>
          )}
          {invite.status === 'redeemed' && invite.redeemed_youtube_channel_title && (
            <>{' · '}granted by <strong style={{ color: '#cde4d6' }}>{invite.redeemed_youtube_email || invite.redeemed_youtube_channel_title}</strong></>
          )}
          {invite.notes && <>{' · '}{invite.notes}</>}
        </div>
      </div>
      {invite.status === 'pending' && (
        <>
          <button onClick={onCopy} style={smallBtnStyle} title="Copy invite link">
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy link</>}
          </button>
          <button onClick={onRevoke} style={smallBtnStyle} title="Revoke">
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Helper
// ──────────────────────────────────────────────────

function buildInviteUrl(token) {
  const origin = window.location.origin;
  return `${origin}/?tab=guest-oauth&token=${encodeURIComponent(token)}`;
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const cardStyle = {
  background: '#1E1E1E',
  borderRadius: 8,
  border: '1px solid #333',
  padding: 24,
  marginBottom: 16,
};
const headerStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  marginBottom: 16,
};
const refreshBtnStyle = {
  background: '#252525', color: '#9E9E9E',
  border: '1px solid #333', borderRadius: 6,
  padding: 6, cursor: 'pointer',
};
const errorBoxStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: 'rgba(239,107,107,0.08)',
  border: '1px solid rgba(239,107,107,0.30)',
  color: '#ef6b6b',
  borderRadius: 6, padding: '8px 12px',
  fontSize: 12, marginBottom: 12,
};
const formStyle = {
  background: '#252525', borderRadius: 6, padding: 14, marginBottom: 16,
  display: 'flex', flexDirection: 'column', gap: 10,
};
const formRowStyle = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 110px', gap: 10,
};
const labelStyle = {
  display: 'flex', flexDirection: 'column', gap: 4,
};
const labelTextStyle = {
  fontSize: 11, color: '#9E9E9E',
  textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600,
};
const inputStyle = {
  background: '#1a1a1a', color: '#E0E0E0',
  border: '1px solid #333', borderRadius: 5,
  padding: '7px 10px', fontSize: 12,
};
const createBtnStyle = (creating) => ({
  alignSelf: 'flex-start',
  background: creating ? '#252525' : '#0A919B',
  color: creating ? '#666' : '#0a0a0e',
  border: creating ? '1px solid #333' : 'none',
  borderRadius: 5,
  padding: '8px 14px',
  fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
  cursor: creating ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
});
const tableHeaderStyle = {
  fontSize: 11, color: '#9E9E9E',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600,
  marginBottom: 6,
};
const emptyStateStyle = {
  fontSize: 12, color: '#666', padding: 16, textAlign: 'center',
  background: '#252525', borderRadius: 6,
};
const rowStyle = (color) => ({
  display: 'flex', alignItems: 'center', gap: 8,
  background: '#252525',
  border: '1px solid #333', borderLeft: `2px solid ${color}`,
  borderRadius: 5, padding: 10,
});
const rowTitleStyle = {
  fontSize: 13, fontWeight: 600, color: '#E0E0E0',
};
const rowMetaStyle = {
  fontSize: 11, color: '#9E9E9E', marginTop: 2,
};
const smallBtnStyle = {
  background: '#1a1a1a', color: '#9E9E9E',
  border: '1px solid #333', borderRadius: 4,
  padding: '5px 10px', fontSize: 11, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
