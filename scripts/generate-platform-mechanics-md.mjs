#!/usr/bin/env node
/**
 * Generates PLATFORM_MECHANICS.md from src/lib/platformMechanics.js.
 *
 * Run with: npm run gen:mechanics
 *
 * The platformMechanics.js module is the single source of truth.
 * This script renders it into a strategist-facing markdown doc that
 * lives at the repo root, citable and shareable. Whenever the JS file
 * changes, re-run this script to keep the markdown in sync.
 *
 * Generated artifact has a "Generated from … do not edit by hand"
 * banner so nobody hand-edits and gets surprised on the next regen.
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  PLATFORM_MECHANICS,
  FOLKLORE_OR_UNVERIFIED,
  PLATFORM_MECHANICS_VERSION,
} from '../src/lib/platformMechanics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const outPath = join(repoRoot, 'PLATFORM_MECHANICS.md');

const lines = [];

lines.push('# Platform Mechanics');
lines.push('');
lines.push(`*Version: \`${PLATFORM_MECHANICS_VERSION}\`*`);
lines.push('');
lines.push('> Generated from `src/lib/platformMechanics.js`. **Do not edit by hand** — run `npm run gen:mechanics` after editing the source file.');
lines.push('');
lines.push('---');
lines.push('');
lines.push('## What this is');
lines.push('');
lines.push('Twelve verified rules about how YouTube\'s recommender actually works, each cited to Google/YouTube-authored primary research. Every rule passed adversarial 3-vote verification in a deep-research workflow before being added.');
lines.push('');
lines.push('**Use as:** the craft-knowledge layer for every Crux artifact that makes a recommendation. When a recommendation invokes a mechanic, cite the rule number ("per Mechanic 5"). When industry advice can\'t map to a mechanic, treat it as folklore — either find a primary source or label as Hypothesis.');
lines.push('');
lines.push('**Sources:** Google-authored peer-reviewed papers (RecSys, WSDM, arXiv). No influencer hot takes, no "the algorithm rewards X" claims, no paraphrases that drift from source language.');
lines.push('');
lines.push('---');
lines.push('');
lines.push('## The 12 mechanics');
lines.push('');

for (const m of PLATFORM_MECHANICS) {
  lines.push(`### Mechanic ${m.id}: ${m.title}`);
  lines.push('');
  if (m.confidence) {
    lines.push(`*Confidence: ${m.confidence}*`);
    lines.push('');
  }
  lines.push(`**Mechanism.** ${m.mechanism}`);
  lines.push('');
  lines.push(`**Creator implication.** ${m.creatorImplication}`);
  lines.push('');
  lines.push(`**Source.** ${m.source.authors} (${m.source.year}). *${m.source.title}*. ${m.source.venue}. [Link](${m.source.url}).`);
  lines.push('');
  lines.push(`> "${m.source.quote}"`);
  lines.push('');
  if (m.source.supportingSource) {
    lines.push(`**Supporting source.** ${m.source.supportingSource.authors} (${m.source.supportingSource.year}). [Link](${m.source.supportingSource.url}).`);
    lines.push('');
    lines.push(`> "${m.source.supportingSource.quote}"`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
}

lines.push('## Excluded — folklore or unverified');
lines.push('');
lines.push('Claims we explicitly **do not** cite as platform fact. Tracked here so we don\'t silently re-introduce them. A claim can be promoted to the verified list if a primary source is identified.');
lines.push('');

for (const f of FOLKLORE_OR_UNVERIFIED) {
  lines.push(`- **${f.claim}** — ${f.status}`);
}

lines.push('');
lines.push('---');
lines.push('');
lines.push('## Where these rules are wired');
lines.push('');
lines.push('Imported from `src/lib/platformMechanics.js` by:');
lines.push('');
lines.push('- `src/services/weeklyBriefService.js` — system prompt + critique rubric (v7+)');
lines.push('- `src/services/alternativeTitlesService.js` — title generation prompt');
lines.push('- `src/services/conceptSeedsService.js` — concept seed generation prompt');
lines.push('');
lines.push('When the JS source updates, every consumer gets the change on next build. Re-run `npm run gen:mechanics` to regenerate this doc.');
lines.push('');
lines.push('## Promotion path');
lines.push('');
lines.push('A folklore claim becomes a verified mechanic when:');
lines.push('');
lines.push('1. A primary source is identified (Google-authored paper, on-record YouTube product leadership statement with timestamp, or peer-reviewed deployed-at-scale claim).');
lines.push('2. Verbatim quote can be cited.');
lines.push('3. The smallest defensible creator-side implication that follows is articulated.');
lines.push('');
lines.push('Add it to `PLATFORM_MECHANICS` in `src/lib/platformMechanics.js`, remove from `FOLKLORE_OR_UNVERIFIED`, run `npm run gen:mechanics`, ship.');
lines.push('');

const content = lines.join('\n');
writeFileSync(outPath, content, 'utf8');
console.log(`Generated ${outPath} (${content.length} chars)`);
