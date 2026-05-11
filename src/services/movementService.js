/**
 * Movement service — reads + summarizes the competitor_alerts feed.
 *
 * Alerts are generated server-side by /api/generate-competitor-alerts.
 * This service only reads, dismisses, and synthesizes — never writes new alerts.
 */

import { supabase } from './supabaseClient';
import { resolveScopeToChannelIds } from './patternsService.js';

const TAKEAWAY_CACHE_HOURS = 24;

const ALERT_TYPE_META = {
  breakout:     { label: 'Breakout',      color: '#10b981' },
  format_shift: { label: 'Format shift',  color: '#3b82f6' },
  rank_change:  { label: 'Rank change',   color: '#a78bfa' },
  new_entrant:  { label: 'New entrant',   color: '#f59e0b' },
  trend:        { label: 'Trend',         color: '#94a3b8' },
};

export { ALERT_TYPE_META, resolveScopeToChannelIds };

// ──────────────────────────────────────────────────
// Read alerts
// ──────────────────────────────────────────────────
export async function loadAlerts({ scopeChannelIds, windowDays = 30, includeDismissed = false }) {
  if (!scopeChannelIds?.length) return [];

  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
  let q = supabase
    .from('competitor_alerts')
    .select('id, channel_id, video_id, alert_type, payload, generated_at, dismissed_at')
    .in('channel_id', scopeChannelIds)
    .gte('generated_at', cutoff)
    .order('generated_at', { ascending: false })
    .limit(500);

  if (!includeDismissed) q = q.is('dismissed_at', null);

  const { data, error } = await q;
  if (error) {
    console.warn('[movement] loadAlerts error:', error);
    return [];
  }
  return data || [];
}

export async function countActiveAlerts({ scopeChannelIds, windowDays = 14 }) {
  if (!scopeChannelIds?.length) return 0;
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
  const { count } = await supabase
    .from('competitor_alerts')
    .select('id', { count: 'exact', head: true })
    .in('channel_id', scopeChannelIds)
    .gte('generated_at', cutoff)
    .is('dismissed_at', null);
  return count || 0;
}

export async function dismissAlert(id) {
  if (!id) return;
  await supabase
    .from('competitor_alerts')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id);
}

export async function dismissAllInScope({ scopeChannelIds, windowDays = 30 }) {
  if (!scopeChannelIds?.length) return;
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
  await supabase
    .from('competitor_alerts')
    .update({ dismissed_at: new Date().toISOString() })
    .in('channel_id', scopeChannelIds)
    .gte('generated_at', cutoff)
    .is('dismissed_at', null);
}

// ──────────────────────────────────────────────────
// Generate alerts (triggers server endpoint)
// ──────────────────────────────────────────────────
export async function triggerAlertGeneration() {
  try {
    const resp = await fetch('/api/generate-competitor-alerts?manual=true', { method: 'POST' });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${t.slice(0, 200)}`);
    }
    return await resp.json();
  } catch (err) {
    console.warn('[movement] alert generation failed:', err);
    return { success: false, error: err.message };
  }
}

// ──────────────────────────────────────────────────
// Group alerts by day for the feed
// ──────────────────────────────────────────────────
export function groupAlertsByDay(alerts) {
  const groups = new Map();
  for (const a of alerts) {
    const d = new Date(a.generated_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  return [...groups.entries()].map(([day, items]) => ({ day, items }));
}

// ──────────────────────────────────────────────────
// AI takeaway — weekly synthesis
// ──────────────────────────────────────────────────
export async function loadOrGenerateTakeaway({ scopeChannelIds, scopeLabel, alerts }) {
  if (!alerts?.length) return null;

  const cacheKey = `movement_takeaway:${hashIds(scopeChannelIds)}:${alerts.length}:${alerts[0]?.id || ''}`;
  const cached = await loadCache(cacheKey);
  if (cached) return cached;

  try {
    const claudeAPI = (await import('./claudeAPI')).default;

    const summary = summarizeAlertsForPrompt(alerts);
    const prompt = `Synthesize a weekly "what's moving" takeaway for the "${scopeLabel}" competitive set.

Activity from the last 30 days (${alerts.length} alerts):
${summary}

Write a 3-5 sentence narrative. Lead with the most important pattern. Then call out 1-2 specific channels or videos that matter. End with the "so what" for a creator/CMO in this category.
- Cite specific numbers (multipliers, percentages, channel names).
- No platitudes. If activity is mostly quiet, say so plainly.
- Skip the bulleted list — write it as prose.

Return ONLY valid JSON: { "headline": "5-8 word title", "body": "3-5 sentence narrative" }`;

    const systemPrompt = `You're an analyst writing a weekly competitive briefing. One paragraph, one clear insight. Concrete > comprehensive. Return ONLY valid JSON.`;

    const result = await claudeAPI.call(prompt, systemPrompt, 'movement_takeaway', 800);
    const { parseClaudeJSON } = await import('../lib/parseClaudeJSON');
    const parsed = parseClaudeJSON(result.text, { headline: '', body: '' });
    const takeaway = {
      headline: parsed.headline || 'This week in motion',
      body: parsed.body || '',
      generatedAt: new Date().toISOString(),
      alertCount: alerts.length,
    };
    await saveCache(cacheKey, takeaway);
    return takeaway;
  } catch (err) {
    console.warn('[movement] takeaway failed:', err);
    return null;
  }
}

function summarizeAlertsForPrompt(alerts) {
  const byType = {};
  for (const a of alerts) {
    (byType[a.alert_type] ||= []).push(a);
  }
  const lines = [];
  for (const [type, items] of Object.entries(byType)) {
    const meta = ALERT_TYPE_META[type] || { label: type };
    lines.push(`\n${meta.label} (${items.length}):`);
    for (const a of items.slice(0, 8)) {
      const p = a.payload || {};
      if (type === 'breakout') {
        lines.push(`- ${p.channel_name}: "${p.video_title}" hit ${p.views_at_48h?.toLocaleString()} views (${p.multiplier}× channel median)`);
      } else if (type === 'format_shift') {
        lines.push(`- ${p.channel_name}: shifted from ${p.prev_format} (${p.prev_pct}%) to ${p.curr_format} (${p.curr_pct}%)`);
      } else if (type === 'rank_change') {
        lines.push(`- ${p.channel_name}: avg views ${p.direction === 'up' ? 'up' : 'down'} ${Math.abs(p.pct_change)}% (${p.prev_velocity?.toLocaleString()} → ${p.curr_velocity?.toLocaleString()})`);
      } else if (type === 'new_entrant') {
        lines.push(`- ${p.channel_name} added to scope${p.subscriber_count ? ` (${p.subscriber_count.toLocaleString()} subs)` : ''}`);
      }
    }
  }
  return lines.join('\n');
}

// ──────────────────────────────────────────────────
// Cache helpers (shared with whiteSpaceService via same table)
// ──────────────────────────────────────────────────
async function loadCache(key) {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from('competitor_intelligence_cache')
      .select('payload, updated_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (!data) return null;
    const ageHours = (Date.now() - new Date(data.updated_at).getTime()) / 3600000;
    if (ageHours > TAKEAWAY_CACHE_HOURS) return null;
    return data.payload;
  } catch {
    return null;
  }
}

async function saveCache(key, payload) {
  if (!supabase) return;
  try {
    await supabase
      .from('competitor_intelligence_cache')
      .upsert({ cache_key: key, payload, updated_at: new Date().toISOString() }, { onConflict: 'cache_key' });
  } catch (err) {
    console.warn('[movement] cache save failed:', err);
  }
}

function hashIds(ids) {
  return [...(ids || [])].sort().slice(0, 50).join(',').slice(0, 200);
}

export default {
  loadAlerts,
  countActiveAlerts,
  dismissAlert,
  dismissAllInScope,
  triggerAlertGeneration,
  groupAlertsByDay,
  loadOrGenerateTakeaway,
  ALERT_TYPE_META,
  resolveScopeToChannelIds,
};
