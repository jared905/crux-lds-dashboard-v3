/**
 * Honorifics Service
 *
 * Returns proper titles (President, Elder, Sister) for public figures
 * referenced in AI-generated reports. Backed by the honorifics table so
 * callings can be updated without a code deploy.
 */

import { supabase } from './supabaseClient';

/**
 * Fetch all active honorifics. Returns an empty array on any failure so
 * reports continue generating even if the table is missing/unavailable.
 */
export async function fetchActiveHonorifics() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('honorifics')
      .select('full_name, title, role, youtube_channel_id, channel_name_aliases, notes, sort_order')
      .eq('calling_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      console.warn('[Honorifics] Fetch failed:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[Honorifics] Fetch exception:', err);
    return [];
  }
}

/**
 * Match a channel to an honorifics row.
 * Returns null when no match found (caller should use raw channel name
 * and flag for manual review rather than guessing).
 */
export function matchChannelToHonorific(channel, honorifics) {
  if (!channel || !honorifics?.length) return null;
  const ytId = channel.youtube_channel_id || channel.youtubeChannelId;
  const name = (channel.name || '').trim();
  if (!name && !ytId) return null;

  // 1. Direct YouTube ID match (most reliable)
  if (ytId) {
    const byId = honorifics.find(h => h.youtube_channel_id === ytId);
    if (byId) return byId;
  }

  // 2. Exact name match
  const nameLower = name.toLowerCase();
  const exact = honorifics.find(h => h.full_name.toLowerCase() === nameLower);
  if (exact) return exact;

  // 3. Alias match
  const aliased = honorifics.find(h =>
    h.channel_name_aliases?.some(a => a.toLowerCase() === nameLower)
  );
  if (aliased) return aliased;

  // 4. Last-name contains — only if there's exactly one candidate
  // (prevents "Elder Smith" matching two different Smiths)
  const tokens = nameLower.split(/\s+/).filter(Boolean);
  const lastName = tokens[tokens.length - 1];
  if (lastName && lastName.length >= 4) {
    const candidates = honorifics.filter(h => {
      const hLast = h.full_name.toLowerCase().split(/\s+/).pop();
      return hLast === lastName;
    });
    if (candidates.length === 1) return candidates[0];
  }

  return null;
}

/**
 * Build a formatted honorifics block for injection into the prompt's
 * AUDIENCE section. Includes the active roster plus the rules for
 * first/subsequent references and unmatched names.
 */
export function formatHonorificsBlock(honorifics) {
  if (!honorifics?.length) {
    return '  (No honorifics configured — use channel names as shown in the data.)';
  }

  const firstPresidency = honorifics.filter(h => h.role?.includes('First Presidency') || h.role?.includes('President of the Church'));
  const twelve = honorifics.filter(h => h.role?.includes('Twelve'));
  const other = honorifics.filter(h => !firstPresidency.includes(h) && !twelve.includes(h));

  const lines = [];
  if (firstPresidency.length) {
    lines.push('  First Presidency:');
    firstPresidency.forEach(h => {
      lines.push(`    - ${h.title} ${h.full_name}${h.role ? ` (${h.role})` : ''}`);
    });
  }
  if (twelve.length) {
    lines.push('  Quorum of the Twelve Apostles:');
    twelve.forEach(h => {
      lines.push(`    - ${h.title} ${h.full_name}${h.role && !h.role.includes('Quorum of the Twelve Apostles') ? ` (${h.role})` : ''}`);
    });
  }
  if (other.length) {
    lines.push('  Other:');
    other.forEach(h => {
      lines.push(`    - ${h.title} ${h.full_name}${h.role ? ` (${h.role})` : ''}`);
    });
  }

  // Include notes that carry cross-cutting rules
  const notesWithRules = honorifics.filter(h => h.notes).map(h => `  NOTE on ${h.full_name}: ${h.notes}`);
  if (notesWithRules.length) {
    lines.push('');
    lines.push(...notesWithRules);
  }

  return lines.join('\n');
}

/**
 * Given the channels involved in a report, identify any that don't match
 * an honorifics row. Returns an array of channel names that need manual review.
 */
export function findUnmatchedChannels(channels, honorifics) {
  if (!channels?.length || !honorifics?.length) return [];
  return channels
    .filter(ch => !matchChannelToHonorific(ch, honorifics))
    .map(ch => ch.name || ch.youtube_channel_id || '(unknown)');
}

export default {
  fetchActiveHonorifics,
  matchChannelToHonorific,
  formatHonorificsBlock,
  findUnmatchedChannels,
};
