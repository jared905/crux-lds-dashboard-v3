/**
 * annotationService — timeline markers for the Momentum chart
 * (migration 114). "Changed thumbnail style", "new editor", "went
 * weekly" — the events that explain the line's bends.
 *
 * Degrades gracefully while the migration is unapplied: reads return
 * [] and the chart simply has no markers.
 */

import { supabase } from './supabaseClient.js';

export async function listAnnotations(channelIds, startDate, endDate) {
  if (!supabase || !channelIds?.length) return [];
  const { data, error } = await supabase
    .from('channel_annotations')
    .select('id, channel_id, annotation_date, label')
    .in('channel_id', channelIds)
    .gte('annotation_date', startDate)
    .lte('annotation_date', endDate)
    .order('annotation_date', { ascending: true });
  if (error) {
    if (error.code === 'PGRST205' || /channel_annotations/.test(error.message || '')) return [];
    console.warn('[annotations] list failed:', error.message);
    return [];
  }
  return data || [];
}

export async function addAnnotation(channelId, annotationDate, label, createdBy) {
  const { data, error } = await supabase
    .from('channel_annotations')
    .insert({ channel_id: channelId, annotation_date: annotationDate, label, created_by: createdBy || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAnnotation(id) {
  const { error } = await supabase.from('channel_annotations').delete().eq('id', id);
  if (error) throw error;
}
