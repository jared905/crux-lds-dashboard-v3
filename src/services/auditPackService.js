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

function sectionCohort(channels) {
  if (!channels?.length) return null;
  const lines = [
    '## 3. Cohort overview',
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

function sectionTitlePatterns(patterns) {
  if (!patterns?.length) return null;
  // Sort by views lift desc — what works comes first
  const sorted = [...patterns].sort((a, b) => (b.viewsLift ?? -Infinity) - (a.viewsLift ?? -Infinity));
  const lines = [
    '## 4. Title patterns',
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
    '## 5. Format mix and length sweet spots',
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
    '## 6. Posting cadence and time-of-day performance',
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
    '## 7. Top outliers (reference videos)',
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
    '## 8. Topic landscape',
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

function sectionMovement(alerts) {
  if (!alerts?.length) return null;
  const byType = {};
  for (const a of alerts) (byType[a.alert_type] ||= []).push(a);
  const lines = [
    '## 9. Recent movement (last 30 days)',
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

  // Run all the analyses in parallel where possible
  tick('Fetching cohort + patterns');
  const [channels, patternsResult, whiteSpaceResult, alerts, diagnostic] = await Promise.all([
    fetchLandscapeChannels(scope).catch(() => []),
    analyzePatterns({ scopeChannelIds, windowDays: 90 }).catch(() => null),
    analyzeWhiteSpace({ scopeChannelIds, windowDays: 90, scopeLabel }).catch(() => null),
    loadAlerts({ scopeChannelIds, windowDays: 30 }).catch(() => []),
    scope.clientId ? computeClientDiagnostic({ clientId: scope.clientId, scopeChannelIds, windowDays: 90 }).catch(() => null) : Promise.resolve(null),
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
    '> **Reading this audit:** Every lift number is tagged with a sample size. Tables show `(directional)` next to lifts computed from small samples (<20 videos for patterns, <8 uploads for time slots) — treat those as early signal, not as evidence for a decision. Trimmed medians (top/bottom 10% dropped) are used throughout so a single inflated-view outlier can\'t skew the headline.',
  ].join('\n');

  // Order chosen for the deck workflow: lead with the briefing → opportunity
  // brief (the recommendation) → cohort context → supporting analysis →
  // examples → movement. Critique-driven reorder; brief was buried at #8.
  const sections = [
    sectionExecutive(briefing, diagnostic),
    sectionOpportunityBrief(whiteSpaceResult?.brief),
    sectionCohort(channels),
    sectionTitlePatterns(patternsResult?.scope?.titlePatterns),
    sectionFormatMix(patternsResult?.scope?.formatBreakdown),
    sectionCadence(whiteSpaceResult?.cadenceGaps),
    sectionOutliers(patternsResult?.scope?.outliers),
    sectionTopics(whiteSpaceResult?.topicCoverage),
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
