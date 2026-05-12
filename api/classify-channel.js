/**
 * /api/classify-channel — Claude-powered channel classifier for Research v2.
 *
 * For each channel (or all uncategorized channels): pull channel + top videos
 * + YouTube topic URLs, send to Claude with the taxonomy + tag vocabulary,
 * parse the structured JSON response, and write category + tag assignments.
 *
 * Body:
 *   { channel_ids: [...] }   classify specific channels
 *   { all_uncategorized: true, limit: 25 }   sweep channels with no categories
 *   { apiKey: '...' }        Anthropic API key (forwarded from UI localStorage)
 *
 * Skips: channels with classification_locked=true, or classified <30d ago.
 * Concurrency: serial within a single invocation; caller loops for batches.
 * Time guard: 270s budget; returns `remaining` for chaining from the UI.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const RECLASSIFY_AFTER_DAYS = 30;

// ──────────────────────────────────────────────────
// YouTube topic fetch — small extra signal for Claude
// ──────────────────────────────────────────────────
async function fetchYoutubeTopics(youtubeChannelId, apiKey) {
  if (!youtubeChannelId || !apiKey) return [];
  try {
    const resp = await fetch(
      `${YOUTUBE_API_BASE}/channels?part=topicDetails&id=${youtubeChannelId}&key=${apiKey}`
    );
    const json = await resp.json();
    const urls = json?.items?.[0]?.topicDetails?.topicCategories || [];
    // Strip the Wikipedia URL to just the topic name
    return urls.map(u => decodeURIComponent(u.split('/').pop().replace(/_/g, ' ')));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────
// Load taxonomy + vocabulary
// ──────────────────────────────────────────────────
async function loadTaxonomy() {
  const [{ data: cats }, { data: tags }] = await Promise.all([
    supabase.from('categories').select('id, name, slug, parent_id'),
    supabase.from('tag_vocabulary').select('facet, value, description').order('facet').order('sort_order'),
  ]);
  return { categories: cats || [], tags: tags || [] };
}

function buildTaxonomyForPrompt({ categories, tags }) {
  const parents = categories.filter(c => !c.parent_id);
  const subBy = {};
  for (const c of categories) {
    if (c.parent_id) {
      if (!subBy[c.parent_id]) subBy[c.parent_id] = [];
      subBy[c.parent_id].push(c);
    }
  }

  const catLines = parents.map(p => {
    const subs = subBy[p.id] || [];
    const subList = subs.map(s => `${s.slug} (${s.name})`).join(', ') || 'no sub-categories';
    return `- ${p.slug} (${p.name}): ${subList}`;
  }).join('\n');

  const tagFacets = {};
  for (const t of tags) {
    if (!tagFacets[t.facet]) tagFacets[t.facet] = [];
    tagFacets[t.facet].push(t);
  }
  const tagLines = Object.entries(tagFacets).map(([facet, vs]) =>
    `- ${facet}: ${vs.map(t => `${t.value} (${t.description})`).join('; ')}`
  ).join('\n');

  return { catLines, tagLines };
}

// ──────────────────────────────────────────────────
// Claude call
// ──────────────────────────────────────────────────
async function callClaude({ apiKey, prompt, system, maxTokens = 1200 }) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`Claude API ${resp.status}: ${err.slice(0, 300)}`);
  }
  const json = await resp.json();
  return json?.content?.[0]?.text || '';
}

function parseClaudeJSON(text) {
  if (!text) return null;
  // Strip code fences if present
  let s = text.trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  // Find the first { and last } — Claude sometimes wraps with prose
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────
// Classify one channel
// ──────────────────────────────────────────────────
async function classifyChannel(channel, taxonomy, prompt, apiKey, youtubeKey) {
  // Pull top videos
  const { data: vids } = await supabase
    .from('videos')
    .select('title, view_count, duration_seconds, published_at')
    .eq('channel_id', channel.id)
    .order('view_count', { ascending: false })
    .limit(20);

  const topics = await fetchYoutubeTopics(channel.youtube_channel_id, youtubeKey);

  const videoLines = (vids || []).slice(0, 20).map((v, i) =>
    `${i + 1}. "${v.title}" — ${v.view_count?.toLocaleString() || 0} views, ${v.duration_seconds || 0}s`
  ).join('\n') || '(no videos)';

  const userPrompt = `${prompt.intro}

CHANNEL TO CLASSIFY
Name: ${channel.name}
Handle: ${channel.custom_url || '(none)'}
Subscribers: ${channel.subscriber_count?.toLocaleString() || '?'}
Description: ${(channel.description || '').slice(0, 800)}
YouTube algorithmic topics: ${topics.length ? topics.join(', ') : '(none returned)'}

TOP 20 VIDEOS BY VIEWS
${videoLines}

TAXONOMY
${prompt.catLines}

TAG VOCABULARY
${prompt.tagLines}

${prompt.instructions}`;

  const text = await callClaude({
    apiKey,
    prompt: userPrompt,
    system: prompt.system,
    maxTokens: 1200,
  });

  const parsed = parseClaudeJSON(text);
  if (!parsed) throw new Error('Claude returned unparseable JSON');

  return parsed; // { parent_slug, sub_slug, tags: [...], reasoning }
}

// ──────────────────────────────────────────────────
// Apply classification result to DB
// ──────────────────────────────────────────────────
async function applyClassification(channel, result, taxonomy) {
  const catBySlug = new Map(taxonomy.categories.map(c => [c.slug, c]));
  const wantCats = [];
  if (result.parent_slug && catBySlug.has(result.parent_slug)) wantCats.push(catBySlug.get(result.parent_slug).id);
  if (result.sub_slug && catBySlug.has(result.sub_slug)) wantCats.push(catBySlug.get(result.sub_slug).id);

  // Delete prior classifier-assigned rows, keep manual ones
  await supabase.from('channel_categories')
    .delete()
    .eq('channel_id', channel.id)
    .eq('assigned_by_classifier', true);
  await supabase.from('channel_tags')
    .delete()
    .eq('channel_id', channel.id)
    .eq('assigned_by_classifier', true);

  // Upsert new
  for (const cid of wantCats) {
    await supabase.from('channel_categories')
      .upsert({ channel_id: channel.id, category_id: cid, assigned_by_classifier: true },
              { onConflict: 'channel_id,category_id' });
  }
  const tagSet = new Set((taxonomy.tags || []).map(t => t.value));
  for (const tag of (result.tags || [])) {
    if (!tagSet.has(tag)) continue; // ignore tags not in vocab
    await supabase.from('channel_tags')
      .upsert({ channel_id: channel.id, tag, assigned_by_classifier: true },
              { onConflict: 'channel_id,tag' });
  }

  await supabase.from('channels')
    .update({
      last_classified_at: new Date().toISOString(),
      classification_reasoning: (result.reasoning || '').slice(0, 1000),
    })
    .eq('id', channel.id);
}

// ──────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();
  const TIME_BUDGET_MS = 270_000;

  try {
    const body = req.body || {};
    const apiKey = body.apiKey || process.env.ANTHROPIC_API_KEY;
    const youtubeKey = body.youtubeKey || process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
    const force = !!body.force;
    const limit = Number(body.limit || 25);

    if (!apiKey) return res.status(400).json({ error: 'Anthropic API key required' });

    // Resolve the target channel list
    let channels = [];
    if (Array.isArray(body.channel_ids) && body.channel_ids.length) {
      const { data } = await supabase
        .from('channels')
        .select('id, name, custom_url, description, subscriber_count, youtube_channel_id, last_classified_at, classification_locked')
        .in('id', body.channel_ids);
      channels = data || [];
    } else if (body.all_uncategorized) {
      // Find channels with NO category assignments (left join via NOT IN)
      const { data: assigned } = await supabase.from('channel_categories').select('channel_id');
      const assignedIds = new Set((assigned || []).map(r => r.channel_id));
      const { data: all } = await supabase
        .from('channels')
        .select('id, name, custom_url, description, subscriber_count, youtube_channel_id, last_classified_at, classification_locked')
        .eq('is_competitor', true)
        .neq('tier', 'archive')
        .limit(500);
      channels = (all || []).filter(c => !assignedIds.has(c.id)).slice(0, limit);
    } else {
      return res.status(400).json({ error: 'Provide channel_ids[] or all_uncategorized=true' });
    }

    if (!channels.length) {
      return res.status(200).json({ success: true, processed: 0, remaining: 0 });
    }

    // Pre-filter: skip locked + recently classified (unless force)
    const cutoff = Date.now() - RECLASSIFY_AFTER_DAYS * 86400000;
    const queue = channels.filter(ch => {
      if (ch.classification_locked) return false;
      if (!force && ch.last_classified_at && new Date(ch.last_classified_at).getTime() > cutoff) return false;
      return true;
    });

    const taxonomy = await loadTaxonomy();
    const { catLines, tagLines } = buildTaxonomyForPrompt(taxonomy);

    const prompt = {
      system: 'You are an analyst categorizing YouTube channels. Output ONLY valid JSON, no prose, no code fences. Use slugs exactly as provided.',
      intro: 'Classify the YouTube channel below into the provided taxonomy and tag vocabulary.',
      catLines, tagLines,
      instructions: `Choose:
- ONE parent slug from the taxonomy that best fits the channel
- ZERO or ONE sub-category slug under that parent (skip if no sub-cat fits well)
- 2 to 5 tag values total, drawn from across the facets. Pick the values that are MOST DESCRIPTIVE — don't try to cover every facet
- A one-sentence reasoning explaining your call

Constraints:
- Only use slugs that appear in the taxonomy above
- Only use tag values that appear in the vocabulary above
- If the channel doesn't fit any parent well, set parent_slug to null and explain why

Return ONLY this JSON shape (no markdown):
{ "parent_slug": "finance" | null, "sub_slug": "finance-investing" | null, "tags": ["creator-led","long-form","weekly","educational"], "reasoning": "..." }`,
    };

    const processed = [];
    const errors = [];
    let i = 0;
    for (; i < queue.length; i++) {
      if (Date.now() - startTime > TIME_BUDGET_MS) break;
      const ch = queue[i];
      try {
        const result = await classifyChannel(ch, taxonomy, prompt, apiKey, youtubeKey);
        await applyClassification(ch, result, taxonomy);
        processed.push({
          channel_id: ch.id,
          name: ch.name,
          parent: result.parent_slug,
          sub: result.sub_slug,
          tags: result.tags || [],
        });
      } catch (err) {
        errors.push({ channel_id: ch.id, name: ch.name, error: err.message });
      }
    }

    // Global remaining = uncategorized channels in the entire DB,
    // not just the slice we processed in this invocation. This lets the
    // UI accurately chain calls until the whole queue is drained.
    let globalRemaining = Math.max(0, queue.length - i);
    if (body.all_uncategorized) {
      const { data: stillAssigned } = await supabase.from('channel_categories').select('channel_id');
      const stillAssignedIds = new Set((stillAssigned || []).map(r => r.channel_id));
      const { count: totalChannels } = await supabase
        .from('channels')
        .select('id', { count: 'exact', head: true })
        .eq('is_competitor', true)
        .neq('tier', 'archive');
      // approximation: all - assigned. Doesn't subtract locked/recent — fine for the UI badge.
      globalRemaining = Math.max(0, (totalChannels || 0) - stillAssignedIds.size);
    }

    return res.status(200).json({
      success: true,
      processed: processed.length,
      total_queue: queue.length,
      remaining: globalRemaining,
      batch_remaining: Math.max(0, queue.length - i),
      timed_out: i < queue.length,
      duration_ms: Date.now() - startTime,
      results: processed,
      errors,
    });
  } catch (err) {
    console.error('[classify-channel] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
