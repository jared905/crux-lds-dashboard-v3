/**
 * GuestOAuthPage — public landing page for invite-backed OAuth grants.
 *
 * Lives at `?tab=guest-oauth&token=<invite-token>` and is routed
 * BEFORE the auth check in App.jsx — anyone with the link can view it
 * without a Crux account.
 *
 * Two states:
 *   1. INVITE LANDING — `?tab=guest-oauth&token=X`
 *      Validates the invite, shows what's being requested + by whom,
 *      and the "Grant access" button. Clicking it calls the init API
 *      and redirects to Google's consent screen.
 *
 *   2. SUCCESS / ERROR — `?tab=guest-oauth&oauth_success=true&channel=X`
 *      Shown after Google redirects back through the callback. Says
 *      "thanks, access granted, you can close this tab."
 *
 * Design principles:
 *   - Looks like a real grant page (channel-owner trust signal), not
 *     like the strategist's analytics dashboard
 *   - Minimal copy, clear what's happening, clear what scopes are being
 *     requested ("Read-only access to your YouTube channel analytics")
 *   - No navigation to the rest of Crux — this user has nothing to do
 *     here after granting access
 */

import React, { useEffect, useState } from 'react';

export default function GuestOAuthPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const successFlag = params.get('oauth_success') === 'true';
  const errorFlag = params.get('oauth_error');
  const grantedChannel = params.get('channel');

  // Success / error state — shown after Google redirects back
  if (successFlag || errorFlag) {
    return <ResultView success={successFlag} error={errorFlag} channel={grantedChannel} />;
  }

  // Invite landing state — must have a token
  if (!token) {
    return <ResultView error="missing_token" />;
  }

  return <InviteLanding token={token} />;
}

// ──────────────────────────────────────────────────
// Invite landing — validate token, show "Grant access"
// ──────────────────────────────────────────────────

function InviteLanding({ token }) {
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/youtube-oauth-invite?token=${encodeURIComponent(token)}`);
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(json?.error || 'This invite is no longer available.');
        } else {
          setInvite(json);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load this invite.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleGrant = async () => {
    setGranting(true);
    setGrantError(null);
    try {
      const r = await fetch(`/api/youtube-oauth-invite?action=init&token=${encodeURIComponent(token)}`, {
        method: 'POST',
      });
      const json = await r.json();
      if (!r.ok || !json.authUrl) {
        setGrantError(json?.error || 'Could not start the OAuth flow.');
        setGranting(false);
        return;
      }
      // Redirect to Google's consent screen
      window.location.href = json.authUrl;
    } catch (err) {
      setGrantError(err?.message || 'Network error.');
      setGranting(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div style={{ color: '#888', fontSize: 14 }}>Loading invite…</div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <h1 style={titleStyle}>Invite unavailable</h1>
        <p style={bodyStyle}>{error}</p>
        <p style={subBodyStyle}>
          If you believe this is wrong, contact the person who sent you the link.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={kickerStyle}>Full View Analytics</div>
      <h1 style={titleStyle}>YouTube access request</h1>

      <p style={bodyStyle}>
        <strong style={{ color: '#e8e2d0' }}>{invite.requesterEmail || 'A Full View user'}</strong>
        {' '}is requesting read-only access to your YouTube analytics
        {invite.clientLabel && (
          <> for <strong style={{ color: '#e8e2d0' }}>{invite.clientLabel}</strong></>
        )}.
      </p>

      {invite.notes && (
        <div style={notesStyle}>
          <strong>Note from sender:</strong> {invite.notes}
        </div>
      )}

      <div style={scopesBoxStyle}>
        <div style={scopesHeaderStyle}>You'll be granting:</div>
        <ul style={scopesListStyle}>
          <li>Read-only access to your YouTube channel data (videos, views, metadata)</li>
          <li>Read-only access to your YouTube Analytics (traffic sources, audience, retention)</li>
          <li>Your Google account email (so the connection shows the right channel)</li>
        </ul>
        <div style={scopesNoteStyle}>
          Full View will NOT be able to post, edit, delete, or change anything on your channel.
          You can revoke this access anytime at{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: '#0A919B' }}>
            myaccount.google.com/permissions
          </a>.
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <button onClick={handleGrant} disabled={granting} style={primaryBtnStyle(granting)}>
          {granting ? 'Opening Google sign-in…' : 'Grant access'}
        </button>
        {grantError && (
          <div style={errorBoxStyle}>{grantError}</div>
        )}
      </div>

      <div style={fineprintStyle}>
        Clicking <strong>Grant access</strong> will redirect you to Google's standard OAuth
        consent screen. You'll sign into your YouTube account there. Full View never sees
        your password.
      </div>

      {invite.expiresAt && (
        <div style={expiryStyle}>
          This invite expires {new Date(invite.expiresAt).toLocaleDateString(undefined, {
            month: 'long', day: 'numeric', year: 'numeric',
          })}.
        </div>
      )}
    </Shell>
  );
}

// ──────────────────────────────────────────────────
// Result view — after callback redirects back
// ──────────────────────────────────────────────────

function ResultView({ success, error, channel }) {
  if (success) {
    return (
      <Shell>
        <div style={{ ...kickerStyle, color: '#3fa66a' }}>✓ Access granted</div>
        <h1 style={titleStyle}>You're all set</h1>
        <p style={bodyStyle}>
          Full View now has read-only analytics access
          {channel && <> to <strong style={{ color: '#e8e2d0' }}>{channel}</strong></>}.
          You can close this tab.
        </p>
        <p style={subBodyStyle}>
          To revoke this access later: go to{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: '#0A919B' }}>
            myaccount.google.com/permissions
          </a>
          , find Full View Analytics, and remove.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ ...kickerStyle, color: '#ef6b6b' }}>Couldn't complete the grant</div>
      <h1 style={titleStyle}>Something went wrong</h1>
      <p style={bodyStyle}>
        We weren't able to complete the OAuth grant
        {error === 'missing_token' && ': the link doesn\'t include a valid invite token.'}
        {error === 'storage_failed' && ': there was a problem saving the connection. Try the link again, or contact the sender for a fresh one.'}
        {error === 'invalid_state' && ': the session expired before you completed the consent screen. Try the link again.'}
        {error === 'token_exchange_failed' && ': Google declined to issue tokens. This usually means consent was canceled. Try again or contact the sender.'}
        {error === 'missing_params' && ': the callback URL was missing parameters. Try the link again.'}
        {error && !['missing_token','storage_failed','invalid_state','token_exchange_failed','missing_params'].includes(error) && `: ${error}`}
        .
      </p>
      <p style={subBodyStyle}>
        Contact the person who sent you the link if the problem persists.
      </p>
    </Shell>
  );
}

// ──────────────────────────────────────────────────
// Shell
// ──────────────────────────────────────────────────

function Shell({ children }) {
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {children}
      </div>
      <div style={footerStyle}>
        Full View Analytics · <a href="/privacy" style={{ color: '#666' }}>Privacy</a> · <a href="/terms" style={{ color: '#666' }}>Terms</a>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const pageStyle = {
  minHeight: '100vh',
  background: '#0a0a0e',
  color: '#e8e2d0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};
const cardStyle = {
  maxWidth: 560,
  width: '100%',
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 10,
  padding: '32px 36px',
};
const kickerStyle = {
  fontSize: 11, color: '#0A919B',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 8,
};
const titleStyle = {
  fontSize: 26, fontWeight: 700, color: '#e8e2d0', margin: '0 0 18px 0', lineHeight: 1.2,
};
const bodyStyle = {
  fontSize: 15, color: '#cde4d6', lineHeight: 1.6, margin: '0 0 14px 0',
};
const subBodyStyle = {
  fontSize: 13, color: '#888', lineHeight: 1.6, margin: '0 0 14px 0',
};
const notesStyle = {
  background: 'rgba(232,168,43,0.06)',
  border: '1px solid rgba(232,168,43,0.25)',
  borderRadius: 6, padding: 12,
  fontSize: 13, color: '#e8e2d0', lineHeight: 1.5,
  marginBottom: 16,
};
const scopesBoxStyle = {
  background: '#1a1a1f',
  border: '1px solid #2a2a30',
  borderRadius: 6, padding: 14,
};
const scopesHeaderStyle = {
  fontSize: 11, color: '#888',
  textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700,
  marginBottom: 8,
};
const scopesListStyle = {
  margin: 0, paddingLeft: 22,
  fontSize: 13, color: '#cde4d6', lineHeight: 1.6,
};
const scopesNoteStyle = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: '1px dashed #2a2a30',
  fontSize: 12, color: '#888', lineHeight: 1.5,
};
const primaryBtnStyle = (disabled) => ({
  background: disabled ? '#1a1a1f' : '#0A919B',
  color: disabled ? '#666' : '#0a0a0e',
  border: disabled ? '1px solid #2a2a30' : 'none',
  borderRadius: 6,
  padding: '12px 24px',
  fontSize: 14, fontWeight: 700, letterSpacing: 0.3,
  cursor: disabled ? 'not-allowed' : 'pointer',
  width: '100%',
});
const errorBoxStyle = {
  marginTop: 12,
  background: 'rgba(239,107,107,0.08)',
  border: '1px solid rgba(239,107,107,0.30)',
  color: '#ef6b6b',
  borderRadius: 6, padding: '10px 14px',
  fontSize: 13,
};
const fineprintStyle = {
  marginTop: 16,
  fontSize: 12, color: '#666', lineHeight: 1.5,
};
const expiryStyle = {
  marginTop: 14,
  paddingTop: 14,
  borderTop: '1px solid #2a2a30',
  fontSize: 11, color: '#666',
};
const footerStyle = {
  marginTop: 18,
  fontSize: 11, color: '#666',
};
