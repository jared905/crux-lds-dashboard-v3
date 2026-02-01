/**
 * Audit Database Service
 * CRUD operations for audits, audit_sections, and detected_series tables.
 */

import { supabase } from './supabaseClient';

// Section keys in execution order
const SECTION_KEYS = [
  'ingestion',
  'series_detection',
  'competitor_matching',
  'benchmarking',
  'opportunity_analysis',
  'recommendations',
  'executive_summary',
];

// ============================================
// AUDIT CRUD
// ============================================

export async function createAudit({ channel_id, audit_type, config = {}, created_by = null }) {
  const { data, error } = await supabase
    .from('audits')
    .insert({
      channel_id,
      audit_type,
      config,
      created_by,
      status: 'created',
      progress: { step: 'created', pct: 0 },
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create audit: ${error.message}`);
  return data;
}

export async function getAudit(auditId) {
  const { data, error } = await supabase
    .from('audits')
    .select(`
      *,
      channel:channels(*)
    `)
    .eq('id', auditId)
    .single();

  if (error) throw new Error(`Failed to fetch audit: ${error.message}`);
  return data;
}

export async function listAudits({ channel_id, audit_type, status, limit = 50 } = {}) {
  let query = supabase
    .from('audits')
    .select(`
      *,
      channel:channels(id, name, thumbnail_url, subscriber_count, size_tier)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (channel_id) query = query.eq('channel_id', channel_id);
  if (audit_type) query = query.eq('audit_type', audit_type);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list audits: ${error.message}`);
  return data || [];
}

export async function updateAudit(auditId, updates) {
  const { data, error } = await supabase
    .from('audits')
    .update(updates)
    .eq('id', auditId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update audit: ${error.message}`);
  return data;
}

export async function updateAuditProgress(auditId, progress) {
  const { error } = await supabase
    .from('audits')
    .update({ progress })
    .eq('id', auditId);

  if (error) console.warn('Failed to update audit progress:', error.message);
}

export async function addAuditCost(auditId, { tokens = 0, cost = 0, apiCalls = 0 }) {
  // Use RPC or read-then-write since Supabase doesn't support increment natively
  const { data: audit } = await supabase
    .from('audits')
    .select('total_tokens, total_cost, youtube_api_calls')
    .eq('id', auditId)
    .single();

  if (!audit) return;

  await supabase
    .from('audits')
    .update({
      total_tokens: (audit.total_tokens || 0) + tokens,
      total_cost: parseFloat(audit.total_cost || 0) + cost,
      youtube_api_calls: (audit.youtube_api_calls || 0) + apiCalls,
    })
    .eq('id', auditId);
}

export async function deleteAudit(auditId) {
  const { error } = await supabase
    .from('audits')
    .delete()
    .eq('id', auditId);

  if (error) throw new Error(`Failed to delete audit: ${error.message}`);
}

// ============================================
// AUDIT SECTIONS
// ============================================

export async function initAuditSections(auditId) {
  const rows = SECTION_KEYS.map(key => ({
    audit_id: auditId,
    section_key: key,
    status: 'pending',
  }));

  const { error } = await supabase
    .from('audit_sections')
    .insert(rows);

  if (error) throw new Error(`Failed to init audit sections: ${error.message}`);
}

export async function updateAuditSection(auditId, sectionKey, updates) {
  const { data, error } = await supabase
    .from('audit_sections')
    .update({
      ...updates,
      ...(updates.status === 'running' ? { started_at: new Date().toISOString() } : {}),
      ...(updates.status === 'completed' || updates.status === 'failed'
        ? { completed_at: new Date().toISOString() }
        : {}),
    })
    .eq('audit_id', auditId)
    .eq('section_key', sectionKey)
    .select()
    .single();

  if (error) console.warn(`Failed to update section ${sectionKey}:`, error.message);
  return data;
}

export async function getAuditSections(auditId) {
  const { data, error } = await supabase
    .from('audit_sections')
    .select('*')
    .eq('audit_id', auditId)
    .order('id', { ascending: true });

  if (error) throw new Error(`Failed to fetch audit sections: ${error.message}`);
  return data || [];
}

// ============================================
// DETECTED SERIES
// ============================================

export async function upsertDetectedSeries(seriesList, channelId, auditId) {
  const rows = seriesList.map(s => ({
    channel_id: channelId,
    audit_id: auditId,
    name: s.name,
    detection_method: s.detectionMethod || 'pattern',
    pattern_regex: s.patternRegex || null,
    semantic_cluster: s.semanticCluster || null,
    video_count: s.videoCount || 0,
    total_views: s.totalViews || 0,
    avg_views: s.avgViews || 0,
    avg_engagement_rate: s.avgEngagementRate || 0,
    first_published: s.firstPublished || null,
    last_published: s.lastPublished || null,
    cadence_days: s.cadenceDays || null,
    performance_trend: s.performanceTrend || null,
    ai_notes: s.aiNotes || null,
  }));

  const { data, error } = await supabase
    .from('detected_series')
    .insert(rows)
    .select();

  if (error) throw new Error(`Failed to insert detected series: ${error.message}`);
  return data || [];
}

export async function getDetectedSeries(channelId) {
  const { data, error } = await supabase
    .from('detected_series')
    .select('*')
    .eq('channel_id', channelId)
    .order('total_views', { ascending: false });

  if (error) throw new Error(`Failed to fetch detected series: ${error.message}`);
  return data || [];
}

export async function assignVideosToSeries(seriesId, youtubeVideoIds) {
  if (!youtubeVideoIds || youtubeVideoIds.length === 0) return;

  const { error } = await supabase
    .from('videos')
    .update({ detected_series_id: seriesId })
    .in('youtube_video_id', youtubeVideoIds);

  if (error) console.warn('Failed to assign videos to series:', error.message);
}

export { SECTION_KEYS };
