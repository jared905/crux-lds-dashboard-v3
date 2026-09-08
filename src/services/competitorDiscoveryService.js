/**
 * competitorDiscoveryService — find a brand's BUSINESS competitors and
 * resolve them to real YouTube channels.
 *
 * Why this exists: auto peer discovery (auditBenchmark.findPeerChannels)
 * matches on size tier and category, which finds channels of a similar
 * SIZE in a similar space. That is not the same as a competitor. Young
 * Living is doTERRA's competitor; a random 200K wellness channel is a
 * size peer. Only the first produces the sentence that earns a reply:
 * "Young Living grew 34% while you flatlined."
 *
 * Until now the only way to get real competitors into an audit was to
 * paste up to five URLs by hand, which meant knowing the competitive set
 * and hunting their channels one at a time.
 *
 * ── Division of labour ────────────────────────────────────────────────
 * Claude answers the BUSINESS question: who competes with this brand.
 * That is world knowledge and it is what a model is good at.
 *
 * YouTube answers the IDENTITY question: which channel is that. Models
 * are bad at this — asked for a channel id, one will emit a plausible,
 * well-formed UC… string that belongs to nobody. So the model is never
 * asked for an id, a handle, or a URL. It returns names; the API
 * resolves them; the strategist confirms.
 *
 * Quota: search.list costs 100 units against a 10,000/day default, so
 * five competitors is ~505 units. Results are cached per brand because
 * the nightly sync needs that quota too.
 */

import { claudeAPI } from './claudeAPI';
import { youtubeAPI } from './youtubeAPI';

const CACHE_KEY = 'fv_competitor_discovery_v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — competitive sets move slowly
const MAX_BRANDS = 5;
const CANDIDATES_PER_BRAND = 5;

// ── QC thresholds ─────────────────────────────────────────────────────
// A candidate must clear the title bar before anything else counts; a
// strong subscriber count cannot rescue a channel that is not the brand.
const TITLE_MATCH_FLOOR = 0.45;
// Auto-confirm needs a near-exact name AND corroboration from the handle
// or description. One signal alone is not enough — "Plant Therapy" the
// brand and "Plant Therapy" the houseplant channel both match on title.
const TITLE_CONFIRM_FLOOR = 0.8;
// Peer plausibility. A 2,000-subscriber channel is not a benchmark for a
// 228,000-subscriber brand even when it IS the right company.
const ABSOLUTE_SUB_FLOOR = 1000;
const RELATIVE_SUB_FLOOR = 0.02;
// If the top two candidates score this close, the field is genuinely
// ambiguous and a human picks. Auto-selecting here is how you end up
// benchmarking against a distributor's downline channel.
const AMBIGUITY_MARGIN = 0.12;

// A regional arm is the right company but the wrong channel to benchmark:
// "Young Living Europe" is smaller, narrower, and not what a competitive
// comparison means. Demoted rather than disqualified, so it still appears
// when the parent has no channel.
const REGIONAL_MARKERS = /\b(europe|emea|apac|uk|canada|australia|deutschland|espana|france|brasil|india|japan|mexico|nordic|latam)\b/i;

// Channels that carry the brand name but are not the brand. Deliberately
// narrow — over-matching here silently drops legitimate channels.
const IMPOSTOR_MARKERS = /\b(fan|fans|unofficial|distributor|independent|reseller|tribute|archive|reacts?|reaction|parody)\b/i;

// ── Text helpers ──────────────────────────────────────────────────────

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    // Corporate suffixes carry no identifying signal and drag similarity
    // down: "doTERRA Essential Oils" vs "doTERRA" should score as a match.
    .replace(/\b(inc|llc|ltd|corp|co|company|official|channel|tv|media|group|international|global|usa|worldwide)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Token-overlap similarity with a prefix bonus, 0..1.
 *
 * Deliberately not edit distance: "Young Living" vs "Young Living
 * Essential Oils" is a strong match that edit distance scores poorly
 * because of the length difference, and that shape — brand plus a
 * descriptor — is exactly how brand channels name themselves.
 */
function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = new Set(na.split(' ').filter(Boolean));
  const tb = new Set(nb.split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;

  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;

  // Against the SMALLER set, so a brand name fully contained in a longer
  // channel title scores 1.0 rather than being penalised for the extra
  // words the channel added.
  const containment = shared / Math.min(ta.size, tb.size);
  const prefixBonus = nb.startsWith(na) || na.startsWith(nb) ? 0.1 : 0;
  return Math.min(1, containment + prefixBonus);
}

// ── Cache ─────────────────────────────────────────────────────────────

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function cacheGet(key) {
  const entry = readCache()[key];
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) return null;
  return entry.value;
}

function cacheSet(key, value) {
  try {
    const all = readCache();
    all[key] = { at: Date.now(), value };
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    // A full or unavailable localStorage costs quota, not correctness.
  }
}

// ── Step 1: who competes with this brand ──────────────────────────────

const SYSTEM_PROMPT = `You identify a brand's direct business competitors.

Return ONLY companies that sell a competing product or service to the same
buyer. Not "companies in the same broad industry" — direct substitutes, the
ones a customer would actually choose between.

HARD CONSTRAINTS
- Return company/brand NAMES only. Never a YouTube channel ID, handle, URL
  or subscriber count. You cannot know those and a guess is worse than an
  omission — the caller resolves names against the YouTube API.
- Never include the audited brand itself, or a subsidiary/regional arm of it.
- If you are not confident a company is a direct competitor, leave it out.
  Four solid names beat eight padded ones.
- If you do not recognise the brand, return an empty array rather than
  inventing plausible-sounding companies.

Respond with JSON only:
{"competitors":[{"name":"Company","reason":"one clause on why they compete"}]}`;

async function proposeCompetitorBrands({ brandName, description, category }) {
  const cacheKey = `brands:${normalize(brandName)}:${normalize(category || '')}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { brands: cached, fromCache: true };

  const prompt = `Brand: ${brandName}
${category ? `Category: ${category}` : ''}
${description ? `What they do: ${String(description).slice(0, 600)}` : ''}

List up to ${MAX_BRANDS} direct business competitors.`;

  const result = await claudeAPI.call(prompt, SYSTEM_PROMPT, 'competitor_discovery', 1000);
  const text = typeof result === 'string' ? result : result?.text || result?.content || '';

  let parsed;
  try {
    const json = text.match(/\{[\s\S]*\}/);
    parsed = json ? JSON.parse(json[0]) : null;
  } catch {
    parsed = null;
  }

  const brands = (parsed?.competitors || [])
    .filter(c => c?.name && similarity(c.name, brandName) < 0.9) // never the brand itself
    .slice(0, MAX_BRANDS)
    .map(c => ({ name: String(c.name).trim(), reason: String(c.reason || '').trim() }));

  if (brands.length) cacheSet(cacheKey, brands);
  return { brands, fromCache: false };
}

// ── Step 2: which channel is that ─────────────────────────────────────

/**
 * Score one search result against the brand we were looking for.
 * Returns the signals as well as the score — the UI shows them, because
 * "trust this, it scored 0.82" is not something a strategist can check.
 */
export function scoreCandidate(candidate, brandName, auditedSubscriberCount = 0) {
  const titleScore = similarity(candidate.name, brandName);
  const nb = normalize(brandName);

  // Anchored, not substring: an official handle STARTS with the brand.
  // "@houseplanttherapy" contains "planttherapy" and belongs to a
  // different company entirely — treating that as corroboration is how a
  // houseplant channel gets benchmarked against an essential-oils brand.
  const handleNorm = candidate.customUrl ? normalize(candidate.customUrl).replace(/\s/g, '') : '';
  const brandNorm = nb.replace(/\s/g, '');
  const handleMatch = Boolean(handleNorm && brandNorm && handleNorm.startsWith(brandNorm));
  const descMatch = candidate.description
    ? normalize(candidate.description).includes(nb)
    : false;

  const impostor = IMPOSTOR_MARKERS.test(candidate.name || '');
  const subFloor = Math.max(
    ABSOLUTE_SUB_FLOOR,
    Math.round((auditedSubscriberCount || 0) * RELATIVE_SUB_FLOOR),
  );
  const tooSmall = (candidate.subscriberCount || 0) < subFloor;

  // Corroboration is what separates "the title matches" from "this is
  // them". Weighted so neither handle nor description alone can carry a
  // weak title over the line.
  const regional = REGIONAL_MARKERS.test(candidate.name || '');

  let score = titleScore * 0.7;
  if (handleMatch) score += 0.2;
  if (descMatch) score += 0.1;
  if (regional) score -= 0.15;
  if (impostor) score -= 0.5;
  if (tooSmall) score -= 0.25;
  score = Math.max(0, Math.min(1, score));

  const disqualifiers = [];
  if (impostor) disqualifiers.push('Name suggests a fan, reseller or reaction channel, not the brand');
  if (tooSmall) disqualifiers.push(`Only ${(candidate.subscriberCount || 0).toLocaleString()} subscribers — below the ${subFloor.toLocaleString()} floor for a useful peer`);
  if (titleScore < TITLE_MATCH_FLOOR) disqualifiers.push('Channel name does not match the brand');

  return {
    ...candidate,
    score,
    signals: { titleScore: Number(titleScore.toFixed(2)), handleMatch, descMatch, regional },
    disqualifiers,
  };
}

/**
 * Resolve one brand name to ranked, QC'd channel candidates.
 *
 * verdict:
 *   'confirmed' — near-exact name, corroborated, clearly ahead of the
 *                 runner-up. Safe to pre-tick; a human still sees it.
 *   'review'    — plausible but ambiguous, or corroborated by only one
 *                 signal. Needs a person.
 *   'none'      — nothing cleared the floor.
 */
export async function resolveBrandToChannel(brandName, { auditedSubscriberCount = 0, excludeChannelIds = [] } = {}) {
  const cacheKey = `channel:${normalize(brandName)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  let raw = [];
  try {
    raw = await youtubeAPI.searchChannels(brandName, CANDIDATES_PER_BRAND);
  } catch (err) {
    return { brand: brandName, verdict: 'none', candidates: [], best: null, error: err.message, fromCache: false };
  }

  const scored = raw
    .filter(c => !excludeChannelIds.includes(c.channelId))
    .map(c => scoreCandidate(c, brandName, auditedSubscriberCount))
    .sort((a, b) => b.score - a.score);

  const viable = scored.filter(c => c.disqualifiers.length === 0);
  const best = viable[0] || null;
  const runnerUp = viable[1] || null;
  const ambiguous = Boolean(best && runnerUp && best.score - runnerUp.score < AMBIGUITY_MARGIN);

  let verdict = 'none';
  if (best) {
    const corroborated = best.signals.handleMatch || best.signals.descMatch;
    verdict = best.signals.titleScore >= TITLE_CONFIRM_FLOOR && corroborated && !ambiguous
      ? 'confirmed'
      : 'review';
  }

  const value = { brand: brandName, verdict, ambiguous, candidates: scored, best };
  cacheSet(cacheKey, value);
  return { ...value, fromCache: false };
}

// ── Public entry ──────────────────────────────────────────────────────

/**
 * Full discovery for one audited channel.
 *
 * Nothing here writes to the database or assigns anything. It returns
 * proposals; the strategist confirms. That is deliberate — every
 * proposal rests on a model's recall of who competes with whom, and on a
 * name match against a search endpoint that happily returns fan
 * channels.
 */
export async function discoverCompetitors({
  brandName,
  description = '',
  category = '',
  auditedSubscriberCount = 0,
  excludeChannelIds = [],
}) {
  if (!brandName?.trim()) {
    return { ok: false, error: 'A brand name is required to find competitors.', proposals: [] };
  }

  const { brands, fromCache } = await proposeCompetitorBrands({ brandName, description, category });
  if (!brands.length) {
    return {
      ok: true,
      proposals: [],
      note: `No competitors identified for "${brandName}". The brand may be too niche to recognise — add competitors by hand.`,
      quotaSpent: 0,
      brandsFromCache: fromCache,
    };
  }

  const proposals = [];
  let searches = 0;
  for (const b of brands) {
    const resolved = await resolveBrandToChannel(b.name, { auditedSubscriberCount, excludeChannelIds });
    if (!resolved.fromCache) searches += 1;
    proposals.push({ ...resolved, reason: b.reason });
  }

  return {
    ok: true,
    proposals,
    // Surfaced so the cost of a re-run is visible rather than a surprise
    // when the nightly sync finds the quota gone.
    quotaSpent: searches * 101,
    brandsFromCache: fromCache,
  };
}

export function clearDiscoveryCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* nothing to clear */ }
}

export default { discoverCompetitors, resolveBrandToChannel, scoreCandidate, clearDiscoveryCache };
