/**
 * Audit pack — single markdown document covering all Research v2 sections
 * against the current scope. Designed for copy-paste into presentation
 * decks (Google Slides / Notion / Docs render markdown tables cleanly).
 *
 * Composes existing services:
 *   - researchV2Service.fetchLandscapeChannels  → cohort overview
 *   - patternsService.analyzePatterns           → title patterns + outliers
 *   - whiteSpaceService.analyzeWhiteSpace       → topic clusters, format gaps, cadence, brief
 *   - movementService.loadAlerts                → recent movement
 *   - clientDiagnosticService.compute + briefing → executive briefing (when client pinned)
 */

import { supabase } from './supabaseClient';
import { fetchLandscapeChannels } from './researchV2Service.js';
import { analyzePatterns, resolveScopeToChannelIds } from './patternsService.js';
import { analyzeWhiteSpace } from './whiteSpaceService.js';
import { loadAlerts } from './movementService.js';
import { computeClientDiagnostic, loadOrGenerateBriefing } from './clientDiagnosticService.js';
import { getSpine } from './strategySpineService.js';
import { getActiveDemandSignals } from './demandSignalService.js';
import { getActiveProductionSignalsForChannels } from './productionSignalService.js';

// ──────────────────────────────────────────────────
// Formatters
// ──────────────────────────────────────────────────
function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return Math.round(n).toLocaleString();
}
function fmtPct(v, digits = 0) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

/**
 * Largest-remainder (Hamilton) rounding. Given an array of fractions
 * that should sum to a target (default 100%), returns an array of
 * integer percentages whose sum equals the rounded target. Fixes the
 * "9+5+4+5=23 but should be 24" rounding leak in the format-mix table.
 */
function hamiltonRoundPct(fractions, targetPct = 100) {
  const raw = fractions.map(f => (f || 0) * 100);
  const floored = raw.map(v => Math.floor(v));
  const remainder = targetPct - floored.reduce((s, v) => s + v, 0);
  // Distribute the remainder to the entries with the largest fractional parts.
  const withRemainders = raw.map((v, i) => ({ i, frac: v - floored[i] }));
  withRemainders.sort((a, b) => b.frac - a.frac);
  const result = floored.slice();
  for (let k = 0; k < Math.max(0, Math.min(remainder, result.length)); k++) {
    result[withRemainders[k].i] += 1;
  }
  return result;
}
function fmtLift(lift, confidence) {
  if (lift == null) return 'n/a';
  const pct = Math.round((lift - 1) * 100);
  const base = Math.abs(pct) < 5 ? '— flat' : (pct > 0 ? `+${pct}%` : `${pct}%`);
  // Append "(directional)" so small-sample rows never read as confident
  // headline numbers in the deliverable.
  return confidence === 'directional' ? `${base} _(directional)_` : base;
}
function fmtAge(iso) {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return 'Today';
  if (d === 1) return '1d ago';
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}yr ago`;
}
function escapeMd(s) {
  // Keep pipes and newlines from breaking markdown tables
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

// ──────────────────────────────────────────────────
// Scope label helper (matches the lens components)
// ──────────────────────────────────────────────────
async function buildScopeLabel(scope) {
  const parts = [];
  if (scope.clientId) {
    const { data } = await supabase.from('channels').select('name').eq('id', scope.clientId).maybeSingle();
    if (data?.name) parts.push(`Client: ${data.name}`);
  }
  if (scope.categoryIds?.length) {
    const { data: cats } = await supabase.from('categories').select('name').in('id', scope.categoryIds);
    const names = (cats || []).map(c => c.name).filter(Boolean);
    if (names.length) parts.push(`Category: ${names.join(' + ')}`);
  }
  if (scope.tags?.length) parts.push(`Tags: ${scope.tags.join(', ')}`);
  if (scope.search?.trim()) parts.push(`Search: "${scope.search.trim()}"`);
  if (!parts.length) parts.push('All tracked channels');
  return parts.join(' · ');
}

// ──────────────────────────────────────────────────
// Section builders
// ──────────────────────────────────────────────────
function sectionExecutive(briefing, diagnostic) {
  if (!briefing && !diagnostic) return null;
  const lines = ['## 1. Executive briefing'];

  // Confidence preamble — sets reader expectations about what's
  // statistical vs. directional before they read the rest of the deck.
  // (Inserted before the briefing prose at compose time, below.)
  if (briefing) {
    lines.push('', `**${briefing.headline}**`, '', briefing.body);
  } else if (diagnostic) {
    lines.push('', `_Cohort size_: ${diagnostic.cohort.videoCount} videos analyzed across the competitive set.`);
  }
  return lines.join('\n');
}

// Strategist's authored strategy spine — the interpretive layer alongside
// the analytical sections. Renders only fields that have been authored;
// returns null when the spine is empty so the section disappears cleanly.
// Positioned right after the briefing so a reader frames the rest of the
// pack against the stated stance, not the other way around.
function sectionSpine(spine) {
  if (!spine) return null;
  const has = (s) => typeof s === 'string' && s.trim().length > 0;
  const hasAny = has(spine.positioning_hypothesis)
    || has(spine.audience_read)
    || has(spine.quarterly_stance)
    || has(spine.guardrails)
    || has(spine.competitive_posture)
    || has(spine.editorial_pov)
    || has(spine.voice_tone)
    || has(spine.host_archetype)
    || (Array.isArray(spine.active_plays) && spine.active_plays.length > 0);
  if (!hasAny) return null;

  const lines = ['## 2. Strategic frame'];
  lines.push('', '_The strategist\'s interpretive layer for this client. Read first; everything below is in service of this stance._', '');

  if (has(spine.quarterly_stance)) {
    const label = has(spine.quarterly_stance_label) ? ` · ${spine.quarterly_stance_label}` : '';
    lines.push(`### Strategic stance${label}`);
    lines.push('', spine.quarterly_stance.trim(), '');
  }
  if (has(spine.positioning_hypothesis)) {
    lines.push('### Positioning hypothesis');
    lines.push('', spine.positioning_hypothesis.trim(), '');
  }
  if (has(spine.editorial_pov)) {
    lines.push('### Editorial POV + mission');
    lines.push('', spine.editorial_pov.trim(), '');
  }
  if (has(spine.voice_tone)) {
    lines.push('### Voice + tone');
    lines.push('', spine.voice_tone.trim(), '');
  }
  if (has(spine.host_archetype)) {
    lines.push('### Host archetype');
    lines.push('', spine.host_archetype.trim(), '');
  }
  if (has(spine.audience_read)) {
    lines.push('### Audience read');
    lines.push('', spine.audience_read.trim(), '');
  }
  const plays = Array.isArray(spine.active_plays) ? spine.active_plays : [];
  const inFlight = plays.filter(p => p.status === 'in_flight');
  const concluded = plays.filter(p => p.status === 'concluded_won' || p.status === 'concluded_lost');
  if (inFlight.length || concluded.length) {
    lines.push('### Active plays');
    lines.push('');
    if (inFlight.length) {
      for (const p of inFlight) {
        lines.push(`- **${p.name}** _(in flight${p.started_at ? `, since ${p.started_at}` : ''})_${p.hypothesis ? ` — ${p.hypothesis}` : ''}`);
      }
    }
    if (concluded.length) {
      lines.push('');
      lines.push('_Concluded plays (do not re-recommend without new evidence):_');
      for (const p of concluded) {
        const label = p.status === 'concluded_won' ? 'won' : 'lost';
        lines.push(`- ~~${p.name}~~ — concluded ${label}${p.hypothesis ? `; ${p.hypothesis}` : ''}`);
      }
    }
    lines.push('');
  }
  if (has(spine.guardrails)) {
    lines.push('### Guardrails');
    lines.push('', '> ' + spine.guardrails.trim().replace(/\n/g, '\n> '), '');
  }

  return lines.join('\n');
}

// Demand signals — what audience asks for in their own comments and isn't
// getting. Pure anti-echo signal complementing the cohort-pattern data
// elsewhere in the audit. Renders nothing when no signals are mined or
// the extraction was thin.
function sectionDemandSignals(row) {
  if (!row?.signals) return null;
  const s = row.signals;
  const hasUnserved = Array.isArray(s.unserved_requests) && s.unserved_requests.length > 0;
  const hasThemes = Array.isArray(s.recurring_themes) && s.recurring_themes.length > 0;
  const hasPeaks = Array.isArray(s.engagement_peaks) && s.engagement_peaks.length > 0;
  if (!hasUnserved && !hasThemes && !hasPeaks) return null;

  const lines = ['## Audience demand — what they\'re asking for'];
  lines.push('');
  lines.push(`_Mined from ${row.comment_count} comments across the channel's last ${row.video_count} videos. Complementary to cohort-pattern data: those show what works in the category; demand signals show what THIS audience has been requesting and isn't getting._`);
  lines.push('');

  if (hasUnserved) {
    lines.push('### Unserved requests');
    lines.push('');
    s.unserved_requests.slice(0, 6).forEach(r => {
      const mentions = r.mentions ? ` _(${r.mentions} mentions)_` : '';
      const quote = r.sample_quote ? `\n  > "${r.sample_quote}"` : '';
      lines.push(`- **${r.topic}**${mentions}${quote}`);
    });
    lines.push('');
  }
  if (hasThemes) {
    lines.push('### Recurring themes');
    lines.push('');
    s.recurring_themes.slice(0, 6).forEach(t => {
      const count = t.count ? ` _(${t.count} commenters)_` : '';
      lines.push(`- **${t.pattern}**${count}`);
    });
    lines.push('');
  }
  if (hasPeaks) {
    lines.push('### Engagement peaks');
    lines.push('');
    s.engagement_peaks.slice(0, 4).forEach(p => {
      const strength = p.signal_strength ? ` _(${p.signal_strength})_` : '';
      lines.push(`- "${p.quote}"${strength}${p.context ? ` — ${p.context}` : ''}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

function sectionArchetypes(diagnostic) {
  const segments = diagnostic?.archetypeBreakdown?.segments || [];
  const coverage = diagnostic?.archetypeBreakdown?.coverage || {};

  // Surface a visible "needs classifier" note when segmentation can't
  // run — better than a silent missing section. The analyst sees that
  // archetype segmentation didn't happen rather than guessing it did.
  if (segments.length < 2) {
    return [
      '## 3. Cohort by archetype',
      '',
      "_Segmentation by channel archetype (creator-led / brand-owned / network / institutional / legacy-media) is the right grounding for archetype-aware recommendations — but the cohort isn't classified enough yet to segment. " +
        `${coverage.unknownVideos || 0} of ${coverage.totalVideos || 0} cohort videos come from channels without an identity tag. ` +
        "Run **Classify uncategorized** in Landscape to assign identity tags to the cohort, then re-generate this audit pack. Without segmentation, every cohort norm below averages across archetypes that have fundamentally different success math (e.g. brand-owned ~0.5% engagement vs. creator-led ~5%)._",
    ].join('\n');
  }

  const lines = [
    '## 3. Cohort by archetype',
    '',
    "_The cohort doesn't average meaningfully when it mixes channel archetypes — a manufacturer-brand (Blink) and a creator-led reviewer (Smart Home Solver) operate under different success math. Segmenting here so each archetype's norms read separately. The client's own archetype peers, if known, are the right baseline for any recommendation._",
    '',
  ];

  if (diagnostic?.client?.archetypeLabel) {
    lines.push(`**${diagnostic.client.name} is tagged: ${diagnostic.client.archetypeLabel}** — peer benchmarks should come from this archetype's segment below.`, '');
  }

  if ((coverage.unknownRatio || 0) > 0.20) {
    lines.push(
      `> ⚠️ **${Math.round(coverage.unknownRatio * 100)}% of cohort videos come from unclassified channels** — segmentation below excludes them. Run **Classify uncategorized** in Landscape to tighten the read.`,
      '',
    );
  }

  lines.push(
    '| Archetype | Channels | Videos | Median views | Median engagement | Top patterns |',
    '|---|---:|---:|---:|---:|---|',
  );
  for (const a of segments) {
    const patternList = (a.patterns || []).slice(0, 3)
      .map(p => `${p.label} (+${Math.round((p.lift - 1) * 100)}%)`)
      .join(', ') || '—';
    lines.push(
      `| ${a.label} | ${a.channelCount} | ${a.videoCount} | ${fmtNum(a.medianViews)} | ${a.medianEngagement != null ? fmtPct(a.medianEngagement, 1) : '—'} | ${patternList} |`
    );
  }

  // Within-archetype outliers — channels beating their segment median
  // by ≥2×. Surfaces the Ring/ADT-type nuance ("brand-owned but
  // engaging more like creator-led") that informs future strategic
  // recommendations.
  const haveOutliers = segments.some(s => (s.outperformers || []).length > 0);
  if (haveOutliers) {
    lines.push('', '**Within-archetype outliers** (channels beating their segment median by ≥2×):');
    for (const s of segments) {
      if (!s.outperformers?.length) continue;
      const list = s.outperformers
        .map(o => `${escapeMd(o.name)} (${(o.engagement * 100).toFixed(1)}%, ${o.ratio.toFixed(1)}× segment median)`)
        .join(', ');
      lines.push(`- **${s.label}:** ${list}`);
    }
  }
  return lines.join('\n');
}

function sectionCohort(channels) {
  if (!channels?.length) return null;
  const lines = [
    '## 4. Cohort overview',
    '',
    `**${channels.length} channels analyzed.**`,
    '',
    '| Channel | Subs | Δ Subs | View velocity (/day) | Engagement | Cadence | Last upload |',
    '|---|---:|---:|---:|---:|---:|---|',
  ];
  // Sort by viewVelocity desc to lead with most active
  const sorted = [...channels].sort((a, b) => (b.viewVelocity ?? 0) - (a.viewVelocity ?? 0));
  for (const c of sorted) {
    lines.push([
      escapeMd(c.name),
      fmtNum(c.subscriberCount),
      c.deltaSubs == null ? '—' : `${c.deltaSubs > 0 ? '+' : ''}${fmtNum(c.deltaSubs)}`,
      fmtNum(c.viewVelocity),
      c.engagementRate == null ? '—' : fmtPct(c.engagementRate, 1),
      c.uploadsPerWeek > 1 ? `${c.uploadsPerWeek.toFixed(1)}/wk` :
        c.uploadsPerWeek > 0 ? `${(c.uploadsPerWeek * 30 / 7).toFixed(1)}/mo` : '—',
      fmtAge(c.lastUpload),
    ].map(v => ` ${v} `).join('|').replace(/^/, '|').replace(/$/, '|'));
  }
  return lines.join('\n');
}

// Renders one channel's production-signal block: prose summary + structured
// bullets. Suffix is appended to the heading (e.g. " (client)") so the reader
// can spot the client row at a glance.
function renderProductionBlock(channel, row, { headingSuffix = '' } = {}) {
  const lines = [];
  lines.push(`### ${escapeMd(channel.name)}${headingSuffix}`);
  lines.push('');

  if (!row?.signals) {
    lines.push(`_No production signals available — channel has no recent videos with thumbnails in sync. Run a public sync on this channel, then re-refresh production signals._`);
    lines.push('');
    return lines.join('\n');
  }

  const s = row.signals;
  if (s.summary) {
    lines.push(s.summary);
    lines.push('');
  }
  const bullets = [];
  const vt = s.visual_treatment;
  if (vt) {
    const treatment = [];
    if (vt.face_pct != null) treatment.push(`${vt.face_pct}% face-driven`);
    if (vt.text_pct != null) treatment.push(`${vt.text_pct}% with overlaid text`);
    if (vt.scene_pct != null) treatment.push(`${vt.scene_pct}% scene-driven`);
    if (vt.brand_consistency_score != null) treatment.push(`brand consistency ${vt.brand_consistency_score}/100`);
    if (treatment.length) bullets.push(`- **Visual treatment:** ${treatment.join(' · ')}`);
    if (Array.isArray(vt.dominant_palette) && vt.dominant_palette.length) {
      bullets.push(`- **Palette:** ${vt.dominant_palette.join(', ')}`);
    }
  }
  const hf = s.host_framing;
  if (hf) {
    const framing = [];
    if (hf.close_pct != null) framing.push(`${hf.close_pct}% close`);
    if (hf.mid_pct != null) framing.push(`${hf.mid_pct}% mid`);
    if (hf.wide_pct != null) framing.push(`${hf.wide_pct}% wide`);
    if (hf.host_visible_pct != null) framing.push(`host visible ${hf.host_visible_pct}%`);
    if (framing.length) bullets.push(`- **Host framing:** ${framing.join(' · ')}${hf.notes ? ` — ${hf.notes}` : ''}`);
    else if (hf.notes) bullets.push(`- **Host framing:** ${hf.notes}`);
  }
  const ty = s.typography;
  if (ty?.headline_pattern) {
    const tParts = [ty.headline_pattern];
    if (ty.all_caps_pct != null) tParts.push(`${ty.all_caps_pct}% all-caps`);
    bullets.push(`- **Typography:** ${tParts.join(' · ')}`);
  }
  if (s.production_tier) bullets.push(`- **Production tier:** ${s.production_tier}`);
  if (row.thumbnail_count) bullets.push(`- _Based on ${row.thumbnail_count} recent thumbnails · extracted ${fmtAge(row.extracted_at)}_`);
  if (bullets.length) lines.push(bullets.join('\n'));
  lines.push('');
  return lines.join('\n');
}

// Production approach — how the cohort presents itself visually. Reads
// cached rows from channel_production_signals (migration 078) keyed by
// channel id. The client renders first (when present) so the strategist
// sees where the client sits before reading the competitor field. The
// cohort-level tier rollup sits between the client and the competitors.
function sectionProductionApproach(signalsByChannel, channels, clientChannel) {
  if (!signalsByChannel) return null;

  // Competitor list — anything in the landscape cohort that has signals,
  // minus the client (to avoid double-rendering if landscape ever returns
  // the client in the channel set).
  const clientId = clientChannel?.id || null;
  const competitorEnriched = (channels || [])
    .filter(c => c.id !== clientId)
    .map(c => ({ ...c, row: signalsByChannel[c.id] }))
    .filter(c => c.row?.signals);

  const clientRow = clientId ? signalsByChannel[clientId] : null;
  const hasClientBlock = !!(clientChannel && (clientRow || clientChannel.id));
  if (!competitorEnriched.length && !hasClientBlock) return null;

  const lines = ['## Production approach — how the cohort looks'];
  lines.push('');
  lines.push('_Visual extraction from each channel\'s recent thumbnails. Composition, framing, typography, polish — independent of what each channel talks about. Use this to read the cohort\'s aesthetic conventions, then judge where the client should match vs. break pattern._');
  lines.push('');

  // Client block first — strategist's anchor point. Renders even without
  // cached signals so a missing-data state is visible (not invisible).
  if (hasClientBlock) {
    lines.push(renderProductionBlock(clientChannel, clientRow, { headingSuffix: ' _(client)_' }));
  }

  // Cohort-level rollup (competitors only — the client is the comparator,
  // not part of the cohort distribution they're being read against).
  const tiers = { high: 0, medium: 0, low: 0, mixed: 0 };
  for (const c of competitorEnriched) {
    const t = c.row.signals.production_tier;
    if (t && tiers[t] != null) tiers[t]++;
  }
  const tierParts = Object.entries(tiers).filter(([, n]) => n > 0).map(([t, n]) => `**${t}** ${n}`);
  if (tierParts.length) {
    lines.push(`**Cohort production tiers** (${competitorEnriched.length} competitors analyzed): ${tierParts.join(' · ')}`);
    lines.push('');
  }

  for (const c of competitorEnriched) {
    lines.push(renderProductionBlock(c, c.row));
  }

  return lines.join('\n');
}

function sectionTitlePatterns(patterns) {
  if (!patterns?.length) return null;
  // Sort by views lift desc — what works comes first
  const sorted = [...patterns].sort((a, b) => (b.viewsLift ?? -Infinity) - (a.viewsLift ?? -Infinity));
  const lines = [
    '## 5. Title patterns',
    '',
    '_Patterns sorted by views lift — videos using each pattern vs. the cohort median._',
    '',
    '| Pattern | Frequency | Median views | Views lift | Engagement |',
    '|---|---:|---:|---:|---:|',
  ];
  for (const p of sorted) {
    lines.push(`| ${p.label} | ${fmtPct(p.freq)} (n=${p.count}) | ${fmtNum(p.medianViews)} | ${fmtLift(p.viewsLift, p.confidence)} | ${p.avgEngagement == null ? '—' : fmtPct(p.avgEngagement, 1)} |`);
  }
  return lines.join('\n');
}

function sectionFormatMix(formatBreakdown) {
  if (!formatBreakdown) return null;
  // Hamilton-round shorts + buckets together so the displayed percentages
  // sum to exactly 100. Removes the "76 + 9+5+4+5 = 99" leak the audit
  // critique caught.
  const buckets = formatBreakdown.buckets || [];
  const fractions = [formatBreakdown.shortsFreq || 0, ...buckets.map(b => b.freq || 0)];
  const pcts = hamiltonRoundPct(fractions);
  const shortsPct = pcts[0];
  const bucketPcts = pcts.slice(1);
  const longsPct = bucketPcts.reduce((s, v) => s + v, 0);

  const lines = [
    '## 6. Format mix and length sweet spots',
    '',
    `**Format split:** ${shortsPct}% Shorts (${fmtNum(formatBreakdown.shortsMedianViews)} median views) · ${longsPct}% long-form (${fmtNum(formatBreakdown.longsMedianViews)} median views)`,
    '',
    '| Length bucket | Frequency | Median views |',
    '|---|---:|---:|',
  ];
  buckets.forEach((b, i) => {
    lines.push(`| ${b.label} | ${bucketPcts[i]}% | ${fmtNum(b.medianViews)} |`);
  });
  return lines.join('\n');
}

function sectionCadence(cadenceGaps) {
  if (!cadenceGaps?.grid) return null;
  const { grid, liftGrid, medianGrid, confidenceGrid, labels } = cadenceGaps;
  const lines = [
    '## 7. Posting cadence and time-of-day performance',
    '',
    `_Total uploads in window: ${cadenceGaps.total}. Cells show **upload count → median views → lift vs scope median**. Mountain Time._`,
    '',
    '| Time block | Sun | Mon | Tue | Wed | Thu | Fri | Sat |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (let b = 0; b < labels.blocks.length; b++) {
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const count = grid[d][b];
      const med = medianGrid?.[d]?.[b];
      const lift = liftGrid?.[d]?.[b];
      if (count === 0) {
        cells.push('_empty_');
      } else if (lift != null) {
        const conf = confidenceGrid?.[d]?.[b];
        cells.push(`${count} · ${fmtNum(med)} · ${fmtLift(lift, conf)}`);
      } else {
        cells.push(`${count} uploads`);
      }
    }
    lines.push(`| ${labels.blocks[b]} | ${cells.join(' | ')} |`);
  }

  // Surface top performing slots above the table — split statistical
  // (lead) from directional (mentioned but flagged).
  const winners = [];
  for (let d = 0; d < 7; d++) {
    for (let b = 0; b < labels.blocks.length; b++) {
      const lift = liftGrid?.[d]?.[b];
      if (lift != null && lift >= 1.15) {
        winners.push({
          slot: `${labels.days[d]} ${labels.blocks[b]}`,
          lift, count: grid[d][b],
          confidence: confidenceGrid?.[d]?.[b],
        });
      }
    }
  }
  if (winners.length) {
    winners.sort((a, b) => {
      const aStat = a.confidence === 'statistical' ? 1 : 0;
      const bStat = b.confidence === 'statistical' ? 1 : 0;
      if (aStat !== bStat) return bStat - aStat;
      return b.lift - a.lift;
    });
    const top = winners.slice(0, 5);
    lines.splice(2, 0, '**Top performing slots (≥+15% lift):**', '', ...top.map(w => `- ${w.slot} — ${fmtLift(w.lift, w.confidence)} (${w.count} uploads, ${w.confidence})`), '');
  }
  return lines.join('\n');
}

function sectionOutliers(outliers) {
  if (!outliers?.length) return null;
  const healthy = outliers.filter(o => !o.isSuspect);
  const suspect = outliers.filter(o => o.isSuspect);

  const lines = [
    '## 8. Top outliers (reference videos)',
    '',
    '_Videos that significantly out-performed their channel\'s median. The healthy list is what to anchor "this works in the category" claims on. Suspect videos (likely inflated views) are isolated below and **should not be used as reference examples in the deliverable**._',
    '',
  ];

  if (healthy.length) {
    lines.push('### Healthy outliers', '');
    lines.push('| Channel | Title | Multiplier | Views | Engagement | Link |', '|---|---|---:|---:|---:|---|');
    for (const o of healthy) {
      const link = o.youtubeVideoId ? `[Watch](https://youtu.be/${o.youtubeVideoId})` : '—';
      lines.push(
        `| ${escapeMd(o.channel.name)} | ${escapeMd(o.title)} | ${o.multiplier.toFixed(1)}× | ${fmtNum(o.views)} | ${o.engagement == null ? '—' : fmtPct(o.engagement, 1)} | ${link} |`
      );
    }
  }
  if (suspect.length) {
    lines.push('', '### ⚠️ Suspect — do not cite as reference', '');
    lines.push('_Engagement is well below the channel\'s norm. Likely inflated views (paid amplification, bot traffic, or algorithmic anomaly). Listed for transparency only._', '');
    lines.push('| Channel | Title | Multiplier | Views | Engagement | Why suspect |', '|---|---|---:|---:|---:|---|');
    for (const o of suspect) {
      const reason = o.engagement != null && o.engagement < 0.005
        ? 'eng below 0.5% absolute floor'
        : 'eng below 25% of channel norm';
      lines.push(
        `| ${escapeMd(o.channel.name)} | ${escapeMd(o.title)} | ${o.multiplier.toFixed(1)}× | ${fmtNum(o.views)} | ${o.engagement == null ? '—' : fmtPct(o.engagement, 2)} | ${reason} |`
      );
    }
  }
  return lines.join('\n');
}

function sectionTopics(topicCoverage) {
  if (!topicCoverage?.length) return null;
  const lines = [
    '## 9. Topic landscape',
    '',
    '_Themes the cohort covers, labeled by saturation. Gap themes are unclaimed flags._',
    '',
  ];
  const groups = { saturated: [], moderate: [], gap: [] };
  for (const t of topicCoverage) (groups[t.coverage] ||= []).push(t);
  const order = [
    { key: 'saturated', label: '**Saturated**', desc: 'covered heavily' },
    { key: 'moderate', label: '**Moderate**', desc: 'covered some' },
    { key: 'gap', label: '**Gap**', desc: 'unclaimed — opportunity' },
  ];
  for (const o of order) {
    if (!groups[o.key]?.length) continue;
    lines.push(`### ${o.label} (${o.desc})`, '');
    for (const t of groups[o.key]) {
      lines.push(`- **${t.name}** (${t.count} titles)`);
      if (t.exampleTitles?.length) {
        lines.push(`  - Example: "${escapeMd(t.exampleTitles[0])}"`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function sectionOpportunityBrief(brief) {
  if (!brief?.opportunities?.length) return null;
  const lines = [
    '## 2. Opportunity brief',
    '',
    '_AI-synthesized opportunities for a new entrant (or current channel to expand into)._',
    '',
  ];
  brief.opportunities.forEach((o, i) => {
    const tags = (o.tags || []).map(t => `\`${t}\``).join(' ');
    lines.push(`### ${i + 1}. ${o.title} ${tags}`, '', o.body, '');
  });
  return lines.join('\n');
}

// ──────────────────────────────────────────────────
// Active competitive plays — channels stacking ≥3 breakouts using a
// shared title formula in the window. The editorial layer that separates
// a category audit from a stats dump.
// ──────────────────────────────────────────────────
function detectActivePlays(alerts) {
  const breakouts = (alerts || []).filter(a => a.alert_type === 'breakout');
  if (!breakouts.length) return [];

  // Group breakouts by channel
  const byChannel = {};
  for (const a of breakouts) {
    const name = a.payload?.channel_name || 'Unknown';
    if (!byChannel[name]) byChannel[name] = [];
    byChannel[name].push(a);
  }

  // Only channels with ≥3 breakouts are candidates for "stacking a play"
  const candidates = Object.entries(byChannel)
    .filter(([, arr]) => arr.length >= 3)
    .map(([name, arr]) => ({ name, breakouts: arr }));

  // For each candidate, find the longest contiguous phrase that appears
  // in ≥2 of their breakout titles. That's the "formula."
  return candidates.map(c => {
    const titles = c.breakouts.map(b => (b.payload?.video_title || '').toLowerCase());
    const formula = longestCommonPhrase(titles, /*minHits=*/Math.max(2, Math.ceil(titles.length / 2)));
    return {
      channel: c.name,
      hitCount: c.breakouts.length,
      formula,
      examples: c.breakouts.slice(0, 4).map(b => ({
        title: b.payload?.video_title || '(no title)',
        multiplier: b.payload?.multiplier,
        views: b.payload?.views_at_48h,
        youtube_video_id: b.payload?.youtube_video_id,
      })),
    };
  })
  .filter(p => p.formula) // only surface when a shared phrase is found
  .sort((a, b) => b.hitCount - a.hitCount);
}

// Find the longest contiguous word-phrase that appears in at least minHits
// of the given titles. Returns the phrase string or null.
function longestCommonPhrase(titles, minHits = 2) {
  if (!titles?.length) return null;
  const tokenize = (s) => (s || '')
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const tokenized = titles.map(tokenize);

  // Stop words that aren't interesting on their own. We don't reject
  // phrases CONTAINING them — "caught on camera" is fine — but we
  // require the phrase to include at least one non-stopword.
  const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'it', 'this', 'that']);

  // Collect every n-gram (n=4 down to 2) from the first title, find the
  // longest that appears in ≥minHits titles overall.
  let best = null;
  for (let n = 5; n >= 2; n--) {
    for (const tokens of tokenized) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const phrase = tokens.slice(i, i + n).join(' ');
        // Skip purely-stopword phrases
        if (tokens.slice(i, i + n).every(t => STOP.has(t))) continue;
        const hits = tokenized.filter(toks => toks.join(' ').includes(phrase)).length;
        if (hits >= minHits && (!best || best.n < n)) {
          best = { phrase, n, hits };
        }
      }
    }
    if (best && best.n === n) return best.phrase; // longest wins
  }
  return best?.phrase || null;
}

function sectionActivePlays(alerts) {
  const plays = detectActivePlays(alerts);
  if (!plays.length) return null;
  const lines = [
    '## 10. Active competitive plays',
    '',
    "_Channels stacking 3+ breakouts inside 30 days using a shared title framing. These are direct competitors cracking a formula in real time — the most actionable competitive intel in the audit. Window to react before saturation is short._",
    '',
  ];
  plays.forEach((p, i) => {
    lines.push(`### ${i + 1}. ${escapeMd(p.channel)} — "${escapeMd(p.formula)}" formula (${p.hitCount} breakouts)`, '');
    lines.push('| Video | Multiplier | Views | Link |', '|---|---:|---:|---|');
    for (const ex of p.examples) {
      const link = ex.youtube_video_id ? `[Watch](https://youtu.be/${ex.youtube_video_id})` : '—';
      lines.push(`| ${escapeMd(ex.title)} | ${ex.multiplier ? ex.multiplier.toFixed(1) + '×' : '—'} | ${fmtNum(ex.views)} | ${link} |`);
    }
    lines.push('');
  });
  return lines.join('\n');
}

function sectionMovement(alerts) {
  if (!alerts?.length) return null;
  const byType = {};
  for (const a of alerts) (byType[a.alert_type] ||= []).push(a);
  const lines = [
    '## 11. Recent movement (last 30 days)',
    '',
    '_Volatility filter applied: single-video spikes don\'t count as trends. Rank-change events require ≥5 videos per side with the change holding across the trimmed mean._',
    '',
    `_${alerts.length} alerts detected across the cohort._`,
    '',
  ];

  const renderAlert = (a) => {
    const p = a.payload || {};
    const when = new Date(a.generated_at).toISOString().split('T')[0];
    switch (a.alert_type) {
      case 'breakout':
        return `- **${escapeMd(p.channel_name)}** — "${escapeMd(p.video_title)}" hit ${p.multiplier}× channel median (${fmtNum(p.views_at_48h)} views at 48h). _${when}_`;
      case 'format_shift':
        return `- **${escapeMd(p.channel_name)}** — pivoted from ${p.prev_format} (${p.prev_pct}%) to ${p.curr_format} (${p.curr_pct}%). _${when}_`;
      case 'rank_change':
        return `- **${escapeMd(p.channel_name)}** — avg views ${p.direction === 'up' ? 'up' : 'down'} ${Math.abs(p.pct_change)}% (${fmtNum(p.prev_velocity)} → ${fmtNum(p.curr_velocity)}). _${when}_`;
      case 'new_entrant':
        return `- **${escapeMd(p.channel_name)}** — newly added to scope${p.subscriber_count ? ` (${fmtNum(p.subscriber_count)} subs)` : ''}. _${when}_`;
      default:
        return `- ${escapeMd(p.channel_name || a.alert_type)} — ${a.alert_type}. _${when}_`;
    }
  };

  const order = [
    { type: 'breakout', label: 'Breakouts' },
    { type: 'rank_change', label: 'Rank changes' },
    { type: 'format_shift', label: 'Format shifts' },
    { type: 'new_entrant', label: 'New entrants' },
  ];
  for (const { type, label } of order) {
    const list = byType[type];
    if (!list?.length) continue;
    lines.push(`### ${label} (${list.length})`, '');
    list.slice(0, 10).forEach(a => lines.push(renderAlert(a)));
    if (list.length > 10) lines.push(`- _... and ${list.length - 10} more_`);
    lines.push('');
  }
  return lines.join('\n');
}

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────
export async function generateAuditPack(scope, { onProgress } = {}) {
  const tick = (label) => { if (onProgress) onProgress(label); };
  const scopeLabel = await buildScopeLabel(scope);
  const date = new Date().toISOString().split('T')[0];
  const windowDays = scope.windowDays || 30;

  // Resolve the scope to channel ids once — all the analyses need it
  tick('Resolving scope');
  const scopeChannelIds = await resolveScopeToChannelIds(scope);

  // Run all the analyses in parallel where possible. Production signals
  // lookup includes the clientId alongside cohort ids so the client's
  // own cached row gets rendered in the Production Approach section.
  tick('Fetching cohort + patterns');
  const productionLookupIds = scope.clientId && !scopeChannelIds.includes(scope.clientId)
    ? [scope.clientId, ...scopeChannelIds]
    : scopeChannelIds;
  const [channels, patternsResult, whiteSpaceResult, alerts, diagnostic, spine, demandRow, productionSignalsByChannel, clientChannel] = await Promise.all([
    fetchLandscapeChannels(scope).catch(() => []),
    analyzePatterns({ scopeChannelIds, windowDays: 90 }).catch(() => null),
    analyzeWhiteSpace({ scopeChannelIds, windowDays: 90, scopeLabel }).catch(() => null),
    loadAlerts({ scopeChannelIds, windowDays: 30 }).catch(() => []),
    scope.clientId ? computeClientDiagnostic({ clientId: scope.clientId, scopeChannelIds, windowDays: 90 }).catch(() => null) : Promise.resolve(null),
    scope.clientId ? getSpine(scope.clientId).catch(() => null) : Promise.resolve(null),
    scope.clientId ? getActiveDemandSignals(scope.clientId).catch(() => null) : Promise.resolve(null),
    getActiveProductionSignalsForChannels(productionLookupIds).catch(() => ({})),
    scope.clientId
      ? supabase.from('channels').select('id, name').eq('id', scope.clientId).maybeSingle().then(r => r.data || null).catch(() => null)
      : Promise.resolve(null),
  ]);

  tick('Generating briefing');
  const briefing = diagnostic ? await loadOrGenerateBriefing(diagnostic).catch(() => null) : null;

  tick('Composing document');
  // Compose the document
  const header = [
    `# YouTube Category Audit`,
    ``,
    `**Scope:** ${scopeLabel}`,
    `**Window:** last ${windowDays} days · **Generated:** ${date}`,
    `**Source:** Full View Research v2`,
    ``,
    '---',
  ].join('\n');

  // Confidence preamble appears once at the top so every downstream
  // table's "directional" badges are interpretable.
  const preamble = [
    '> **Reading this audit:** Every lift number is tagged with a sample size. Tables show `(directional)` next to lifts computed from small samples (<40 videos for title patterns, <30 uploads for time slots and length buckets) — treat those as early signal worth testing, not as evidence for committing resources. Trimmed medians (top/bottom 10% dropped) are used throughout, AND a drop-top-observation check runs on every lift — if removing the single highest-view video collapses the lift by >25%, the row gets downgraded to directional regardless of sample size. "Lift" always means views relative to the cohort median, never upload frequency.',
  ].join('\n');

  // Order chosen for the deck workflow: briefing → strategic frame (spine) →
  // opportunity brief (the recommendation) → cohort context → supporting
  // analysis → examples → movement. Strategic frame sits high so readers
  // interpret the rest of the pack against the stated stance, not in
  // isolation. Section drops cleanly when the spine is empty.
  const sections = [
    sectionExecutive(briefing, diagnostic),
    sectionSpine(spine),
    sectionOpportunityBrief(whiteSpaceResult?.brief),
    sectionDemandSignals(demandRow),
    sectionArchetypes(diagnostic),
    sectionCohort(channels),
    sectionProductionApproach(productionSignalsByChannel, channels, clientChannel),
    sectionTitlePatterns(patternsResult?.scope?.titlePatterns),
    sectionFormatMix(patternsResult?.scope?.formatBreakdown),
    sectionCadence(whiteSpaceResult?.cadenceGaps),
    sectionOutliers(patternsResult?.scope?.outliers),
    sectionTopics(whiteSpaceResult?.topicCoverage),
    sectionActivePlays(alerts),
    sectionMovement(alerts),
  ].filter(Boolean);

  const footer = [
    '',
    '---',
    '',
    `_Generated by Full View · ${new Date().toISOString()}_`,
  ].join('\n');

  return [header, preamble, ...sections, footer].join('\n\n');
}

// Browser download helper
export function downloadMarkdown(markdown, filename = 'audit-pack.md') {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export default { generateAuditPack, downloadMarkdown };
