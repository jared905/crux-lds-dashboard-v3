/**
 * Google RISC (Cross-Account Protection) event receiver.
 * Receives Security Event Tokens (SETs) when a user's Google account
 * is compromised, disabled, or has credentials changed.
 *
 * Required for Google OAuth app verification.
 * See: https://developers.google.com/identity/protocols/risc
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = req.body;
    console.log('[RISC] Security event received:', JSON.stringify(token));

    // Google sends a JWT Security Event Token (SET)
    // The payload contains events like account disabled, credentials changed, etc.
    // For now, log the event and revoke any matching OAuth connections
    if (token?.events) {
      for (const [eventType, eventData] of Object.entries(token.events)) {
        const subject = eventData?.subject || token?.sub;
        console.log(`[RISC] Event: ${eventType}, Subject: ${JSON.stringify(subject)}`);

        // If account is compromised or disabled, deactivate their OAuth connections
        if (eventType.includes('account-disabled') ||
            eventType.includes('account-credential-change-required') ||
            eventType.includes('sessions-revoked')) {

          const email = subject?.email || subject?.iss;
          if (email) {
            const { data, error } = await supabase
              .from('youtube_oauth_connections')
              .update({
                is_active: false,
                connection_error: `Google security event: ${eventType}`,
                updated_at: new Date().toISOString()
              })
              .eq('youtube_email', email);

            console.log(`[RISC] Deactivated connections for ${email}:`, data?.length || 0, error?.message || '');
          }
        }
      }
    }

    return res.status(202).json({ status: 'accepted' });
  } catch (err) {
    console.error('[RISC] Error processing security event:', err);
    return res.status(202).json({ status: 'accepted' });
  }
}
