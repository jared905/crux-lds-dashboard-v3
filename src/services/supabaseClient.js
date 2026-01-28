/**
 * Supabase Client Configuration
 * Full View Analytics - Crux Media
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables (set in .env.local or Vercel dashboard)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug logging (remove in production later)
console.log('Supabase URL configured:', !!supabaseUrl);
console.log('Supabase Key configured:', !!supabaseAnonKey);

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local or Vercel Environment Variables'
  );
}

// Create Supabase client
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

/**
 * Check if Supabase is configured and connected
 * @returns {Promise<{connected: boolean, error?: string}>}
 */
export async function checkConnection() {
  if (!supabase) {
    return { connected: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase.from('channels').select('id').limit(1);
    if (error) throw error;
    return { connected: true };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

export default supabase;
