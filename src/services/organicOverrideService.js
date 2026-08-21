/**
 * organicOverrideService — human corrections to the media-buy heuristic
 * (migration 116). An override always beats the heuristic; deleting it
 * returns the video to heuristic judgement.
 *
 * Degrades gracefully while the migration is unapplied: reads return {}
 * and the organic filter simply runs pure-heuristic.
 */

import { supabase } from './supabaseClient.js';

/** Map of video_key → boolean (true = promoted, false = organic). */
export async function listOverrides(channelIds) {
  if (!supabase || !channelIds?.length) return {};
  const { data, error } = await supabase
    .from('video_organic_overrides')
    .select('video_key, is_promoted')
    .in('channel_id', channelIds);
  if (error) {
    if (error.code === 'PGRST205' || /video_organic_overrides/.test(error.message || '')) return {};
    console.warn('[organicOverrides] list failed:', error.message);
    return {};
  }
  const map = {};
  for (const row of data || []) map[row.video_key] = row.is_promoted;
  return map;
}

export async function setOverride(channelId, videoKey, isPromoted, createdBy) {
  const { error } = await supabase
    .from('video_organic_overrides')
    .upsert(
      { channel_id: channelId, video_key: videoKey, is_promoted: isPromoted, created_by: createdBy || null },
      { onConflict: 'channel_id,video_key' }
    );
  if (error) throw error;
}

export async function clearOverride(channelId, videoKey) {
  const { error } = await supabase
    .from('video_organic_overrides')
    .delete()
    .eq('channel_id', channelId)
    .eq('video_key', videoKey);
  if (error) throw error;
}
