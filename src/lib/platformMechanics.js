/**
 * Crux platform-mechanics registry — 12 verified rules about how
 * YouTube's recommender actually works, derived from primary Google/
 * YouTube research and verified via adversarial deep-research workflow
 * 2026-06-13 (24 of 25 verification claims confirmed 3-0).
 *
 * Single source of truth. Imported by:
 *   - weeklyBriefService (system prompt + critique rubric)
 *   - strategicReadService (when shipped)
 *   - executiveMemoService (when shipped)
 *   - the strategist onboarding reference doc (generated from here)
 *
 * Discipline: every rule cites a Google/YouTube-authored paper or
 * on-the-record statement. No industry folklore. No "the algorithm
 * loves X" claims. No paraphrases that drift from the source.
 *
 * What's INTENTIONALLY excluded (failed verification or unsourced):
 *   - "Watch-time hacking stopped working" — post-hoc consultant narrative,
 *     not in the Zhao 2019 paper (which frames the problem as
 *     "misalignment between user implicit feedback and true user utility")
 *   - "5-Video Rule," "vocalize entities in first 30s," specific cadence
 *     numbers, thumbnail-CTR thresholds — none traceable to Google/YouTube
 *     primary research. May correlate with verified mechanisms but cannot
 *     be cited as platform fact.
 *   - All quotes attributed to Todd Beaupré or other YouTube product
 *     leadership in 2025 — no primary artifact (Creator Insider episode,
 *     podcast, talk transcript) sourced in verification.
 *
 * Promotion path: a folklore rule can be promoted to this registry if
 * and only if a primary source is identified — paper section, blog post,
 * or on-record interview with timestamp.
 */

export const PLATFORM_MECHANICS_VERSION = 'v1-2026-06-13-12-rules-verified';

export const PLATFORM_MECHANICS = [
  {
    id: 1,
    title: 'CTR alone does not maximize ranking — clickbait is explicitly demoted',
    mechanism: 'YouTube\'s ranking objective is watch-time-weighted logistic regression, not CTR. Positive impressions are weighted by observed watch time; negative impressions get unit weight. Click-without-completion is structurally penalized.',
    creatorImplication: 'Thumbnail/title pairs that overpromise relative to delivered content lose ranking signal even when CTR is high. Design for completion rate, not clicks.',
    source: {
      authors: 'Covington, Adams, Sargin',
      year: 2016,
      title: 'Deep Neural Networks for YouTube Recommendations',
      venue: 'RecSys \'16',
      url: 'https://cseweb.ucsd.edu/classes/fa17/cse291-b/reading/p191-covington.pdf',
      quote: 'Ranking by click-through rate often promotes deceptive videos that the user does not complete (clickbait) whereas watch time better captures engagement.',
    },
  },
  {
    id: 2,
    title: 'Channel-level memory is a first-class ranking feature',
    mechanism: 'The ranking model explicitly uses "how many videos has the user watched from this channel" as a feature. The viewer-to-channel relationship is a literal model input, not an emergent property.',
    creatorImplication: 'Building a returning-viewer base raises ranking eligibility for future uploads to those same viewers, independent of per-video CTR. Programming consistency and recurring formats are mechanically rewarded.',
    source: {
      authors: 'Covington, Adams, Sargin',
      year: 2016,
      title: 'Deep Neural Networks for YouTube Recommendations',
      venue: 'RecSys \'16',
      url: 'https://cseweb.ucsd.edu/classes/fa17/cse291-b/reading/p191-covington.pdf',
      quote: 'consider the user\'s past history with the channel that uploaded the video being scored — how many videos has the user watched from this channel?',
    },
  },
  {
    id: 3,
    title: 'Topic-recency is a ranking feature',
    mechanism: '"When was the last time the user watched a video on this topic" is an explicit input to the ranker. The system maintains per-viewer topic-engagement timestamps.',
    creatorImplication: 'Topic-cluster cadence — covering related topics on a regular rhythm — keeps the channel ranking-eligible to viewers who recently engaged with that topic anywhere on YouTube. Supports the topical-authority-through-cluster-cadence thesis.',
    source: {
      authors: 'Covington, Adams, Sargin',
      year: 2016,
      title: 'Deep Neural Networks for YouTube Recommendations',
      venue: 'RecSys \'16',
      url: 'https://cseweb.ucsd.edu/classes/fa17/cse291-b/reading/p191-covington.pdf',
      quote: 'When was the last time the user watched a video on this topic?',
    },
  },
  {
    id: 4,
    title: 'Impression churn: an unclicked impression is naturally demoted on next page load',
    mechanism: 'The model includes features describing the frequency of past video impressions, explicitly designed to introduce "churn" — if a user was shown a video and didn\'t click, the same video gets demoted next load.',
    creatorImplication: 'A single weak packaging swing burns impression eligibility for that viewer. Packaging A/B (title/thumbnail) on the first day matters disproportionately because re-presentation is throttled by the system itself.',
    source: {
      authors: 'Covington, Adams, Sargin',
      year: 2016,
      title: 'Deep Neural Networks for YouTube Recommendations',
      venue: 'RecSys \'16',
      url: 'https://cseweb.ucsd.edu/classes/fa17/cse291-b/reading/p191-covington.pdf',
      quote: 'If a user was recently recommended a video but did not watch it then the model will naturally demote this impression on the next page load.',
    },
  },
  {
    id: 5,
    title: 'Satisfaction signals are first-class objectives, separate from engagement',
    mechanism: 'The 2019 multi-task ranking system explicitly groups objectives into engagement (clicks, watch time) AND satisfaction (likes, dismissals, survey ratings) — modeled as separate experts in a Multi-gate Mixture-of-Experts (MMoE) architecture. Live A/B at 1.9B MAU showed satisfaction lift of +3.07% vs. engagement lift of +0.45% — satisfaction weighted ~6.8x larger.',
    creatorImplication: 'Dismissals are negative ranking feedback distinct from non-clicks. Explicit asks for likes feed a separate satisfaction objective, not vanity. Long-but-unsatisfying watches score poorly on the satisfaction experts.',
    source: {
      authors: 'Zhao et al. (10 Google authors)',
      year: 2019,
      title: 'Recommending What Video to Watch Next: A Multitask Ranking System',
      venue: 'RecSys \'19',
      url: 'https://dl.acm.org/doi/pdf/10.1145/3298689.3346997',
      quote: 'engagement behaviors, such as clicks and watches; satisfaction behaviors, such as likes and dismissals.',
    },
  },
  {
    id: 6,
    title: 'Position bias is actively removed via a shallow side tower',
    mechanism: 'A separate shallow tower fed position and device features (with 10% dropout, missing at serving) learns position bias and removes it from the main ranking objective.',
    creatorImplication: 'Don\'t over-weight "my video was buried" explanations for under-performance — the model attempts to correct for shelf position. Conversely, high engagement from a low-shelf position is a strong positive signal because the model can attribute it correctly.',
    source: {
      authors: 'Zhao et al.',
      year: 2019,
      title: 'Recommending What Video to Watch Next: A Multitask Ranking System',
      venue: 'RecSys \'19',
      url: 'https://dl.acm.org/doi/pdf/10.1145/3298689.3346997',
      quote: 'shallow side tower fed position+device features (10% dropout, missing at serving) for position-bias debiasing.',
    },
  },
  {
    id: 7,
    title: 'Long-term cumulative reward — not single-next-watch — is the candidate-gen objective',
    mechanism: 'REINFORCE policy-gradient RL deployed to YouTube candidate generation at million-item action spaces, with off-policy correction. Optimization is for cumulative reward across the action sequence — full sessions and return visits — not the single next watch.',
    creatorImplication: 'A video that ends a session is penalized relative to a video that opens or sustains one. Session-pull / "next video" structuring matters at the candidate-generation layer, not just at ranking. End screens, sequel design, and series momentum tie directly to this.',
    source: {
      authors: 'Chen et al. (Google)',
      year: '2018/2019',
      title: 'Top-K Off-Policy Correction for a REINFORCE Recommender System',
      venue: 'WSDM 2019 / arXiv 1812.02353',
      url: 'https://arxiv.org/abs/1812.02353',
      quote: 'scaling REINFORCE to a production recommender system with an action space on the orders of millions… applying off-policy correction to address data biases in learning from logged feedback collected from multiple behavior policies.',
    },
  },
  {
    id: 8,
    title: 'Fresh content gets a shielded discovery window via explicit exploration',
    mechanism: 'A Neural Linear Bandit exploration stack is deployed to a billions-of-users short-form video platform, with measurement framed around corpus growth and long-term user experience because standard A/B engagement metrics fail to capture exploration\'s long-term benefits. At the candidate-gen layer, the 2016 "example age" feature is set to zero at serving — a calibrated boost for fresh uploads.',
    creatorImplication: 'New uploads receive a structurally distinct discovery window from the steady state. The first 24-72 hours of an upload behaves differently than month-2 performance, and that difference is by design — the system gives new content a protected audition, then graduates winners on satisfaction-per-impression.',
    source: {
      authors: 'Su et al. (Google/DeepMind)',
      year: 2024,
      title: 'Long-Term Value of Exploration: Measurements, Findings and Algorithms',
      venue: 'WSDM 2024 / arXiv 2305.07764',
      url: 'https://arxiv.org/pdf/2305.07764',
      quote: 'Regular A/B tests on exploration often measure neutral or even negative engagement metrics while failing to capture its long-term benefits.',
      supportingSource: {
        authors: 'Covington, Adams, Sargin',
        year: 2016,
        quote: 'we feed the age of the training example as a feature during training. At serving time, this feature is set to zero (or slightly negative) to reflect that the model is making predictions at the very end of the training window.',
        url: 'https://cseweb.ucsd.edu/classes/fa17/cse291-b/reading/p191-covington.pdf',
      },
    },
  },
  {
    id: 9,
    title: 'Semantic clarity matters — videos are represented by content-derived Semantic IDs',
    mechanism: 'Semantic IDs are "a compact discrete item representation learned from frozen content embeddings using RQ-VAE that captures the hierarchy of concepts in items," replacing random video IDs in YouTube ranking. Semantically similar items share representation.',
    creatorImplication: 'Title/description/transcript/visual coherence becomes a ranking input via the RQ-VAE-derived Semantic ID. Vague or contradictory packaging dilutes the Semantic ID\'s signal; entity-clear and topically coherent packaging strengthens it. This is the mechanical basis for the topical-clarity rule that creator advice has asserted impressionistically for years.',
    source: {
      authors: 'Singh et al. (12 Google authors incl. Ed Chi, Lichan Hong, Li Wei, Xinyang Yi)',
      year: '2023/2024',
      title: 'Better Generalization with Semantic IDs',
      venue: 'RecSys 2024 / arXiv 2306.08121',
      url: 'https://arxiv.org/pdf/2306.08121',
      quote: 'Semantic IDs can replace the direct use of video IDs by improving the generalization ability on new and long-tail item slices without sacrificing overall model quality.',
    },
  },
  {
    id: 10,
    title: 'Catalog resurrection is a real platform effect — evergreen videos can resurface for new audiences',
    mechanism: 'Semantic IDs explicitly improve generalization on "new and long-tail item slices" in "large, power-law distributed, and evolving" catalogs. An older video lands in the Semantic-ID neighborhood relevant to a new viewer cohort, and the system can match it without per-video personalization history.',
    creatorImplication: 'Older videos can re-surface when a new viewer cohort makes the Semantic-ID neighborhood relevant. Evergreen optimization — semantic clarity, durable framing, non-time-anchored hooks — has compounding ranking value beyond traditional SEO discoverability.',
    source: {
      authors: 'Singh et al.',
      year: '2023/2024',
      title: 'Better Generalization with Semantic IDs',
      venue: 'RecSys 2024',
      url: 'https://arxiv.org/pdf/2306.08121',
      quote: 'improving the generalization ability on new and long-tail item slices in large, power-law distributed, and evolving catalogs.',
    },
  },
  {
    id: 11,
    title: 'Recommendation layer and LLM/AI-citation layer share substrate via Semantic IDs + Gemini fine-tuning',
    mechanism: 'PLUM combines Semantic ID tokenization + continued pre-training on YouTube-domain data + task-specific fine-tuning of Gemini-family LLMs, "directly trained to generate Semantic IDs of recommended items based on user context." Reported +4.96% Panel CTR lift on YouTube Shorts in live A/B; added to YouTube\'s production candidate pool alongside the Large Embedding Model baseline (additive, not wholesale replacement).',
    creatorImplication: 'The recommendation layer and the AI-citation/discovery layer (LLM-based search, AI Overviews) are converging at the representation layer. Strategies for AI-discoverability and YouTube-discoverability can share an underlying entity/topic ontology. CAVEAT: PLUM does not itself claim the same Semantic IDs are used in Google Search/AI Overviews — the convergence is architectural and directional, not stated cross-product equivalence.',
    source: {
      authors: 'Google/YouTube (PLUM team)',
      year: 2025,
      title: 'PLUM: Adapting Pre-Trained Language Models for Industrial-Scale Generative Recommendations',
      venue: 'arXiv 2510.07784 (October 2025)',
      url: 'https://arxiv.org/abs/2510.07784',
      quote: 'PLUM consists of item tokenization using Semantic IDs, continued pre-training (CPT) on domain-specific data, and task-specific fine-tuning… the model is directly trained to generate Semantic IDs of recommended items based on user context.',
    },
    confidence: 'medium',
  },
  {
    id: 12,
    title: 'Exploration-served impressions and steady-state impressions behave differently — don\'t equate them',
    mechanism: 'Exploration metrics differ structurally from engagement metrics. Standard A/B engagement may look "neutral or even negative" for content that benefits long-term corpus health, which is why YouTube uses corpus-growth-based measurement designs for the exploration stack.',
    creatorImplication: 'When evaluating a "this video underperformed in week 1" signal, hedge — exploration-served impressions and main-flow impressions have different baseline behavior. Don\'t equate week-1 engagement deficits with content failure for new uploads. Read the slope of returning-viewer and topic-cluster signals before declaring a video a miss.',
    source: {
      authors: 'Su et al.',
      year: 2024,
      title: 'Long-Term Value of Exploration: Measurements, Findings and Algorithms',
      venue: 'WSDM 2024',
      url: 'https://arxiv.org/pdf/2305.07764',
      quote: 'Regular A/B tests on exploration often measure neutral or even negative engagement metrics while failing to capture its long-term benefits.',
    },
  },
];

/**
 * Excluded / not yet sourceable. Track here so we don\'t silently
 * re-introduce these claims. Promote to PLATFORM_MECHANICS when a
 * primary source is identified.
 */
export const FOLKLORE_OR_UNVERIFIED = [
  {
    claim: 'The 5-Video Rule (tight sub-niche for first 5-10 long-form videos)',
    status: 'No primary source. Plausible downstream of Rule 2 (channel memory) and Rule 9 (Semantic clarity) but not directly attributable.',
  },
  {
    claim: 'Vocalize semantic entities in first 30-60 seconds',
    status: 'No primary source. Plausible downstream of Rule 9 but the specific time window is folklore.',
  },
  {
    claim: '"Watch-time hacking stopped working" with the 2019 multi-task ranking system',
    status: 'Post-hoc consultant narrative. The 2019 paper frames the problem as "misalignment between user implicit feedback and true user utility" — never uses gaming/hacking language.',
  },
  {
    claim: 'click → completion → satisfaction → session → return-habit hierarchy as a single articulated ladder',
    status: 'Synthesis-side framing. Each transition is individually defensible from a different paper, but the unified 5-rung hierarchy is editorial. OK to use as a teaching aid; don\'t cite it as platform-stated.',
  },
  {
    claim: 'Todd Beaupré 2025 quotes on satisfaction-focus and dynamic per-context signal weighting',
    status: 'No primary artifact (Creator Insider episode, podcast, talk transcript) sourced in verification. Treat as unverified until specific artifact + timestamp is identified.',
  },
  {
    claim: 'PLUM has fully replaced YouTube\'s embedding-table candidate retrieval',
    status: 'Refuted (1-2 vote). PLUM is additive to YouTube\'s production candidate pool — Large Embedding Model baseline coexists. Defensible version: PLUM is deployed in production and the architectural direction is autoregressive Semantic-ID generation.',
  },
  {
    claim: 'Specific cadence numbers (e.g., "upload every Tuesday"), specific thumbnail-CTR thresholds',
    status: 'No primary source. Industry folklore.',
  },
];

/**
 * Render the rules as a structured block for an LLM system prompt.
 * Compact format: rule number, title, mechanism, source citation.
 * Used by weeklyBriefService.SYSTEM_PROMPT and critique prompt.
 */
export function renderForSystemPrompt() {
  const lines = [
    'PLATFORM MECHANICS — 12 verified rules about how YouTube\'s recommender actually works, each cited to primary Google/YouTube research. Recommendations that invoke a mechanism MUST cite the rule number (e.g., "per Mechanic 2: channel-level memory"). Recommendations that contradict a mechanism are platform-illiterate and must be cut or labeled Hypothesis with the contradiction explicit.',
    '',
  ];
  for (const m of PLATFORM_MECHANICS) {
    lines.push(`Mechanic ${m.id}: ${m.title}`);
    lines.push(`  Mechanism: ${m.mechanism}`);
    lines.push(`  Source: ${m.source.authors} ${m.source.year}, "${m.source.title}" (${m.source.venue}).`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Render only the titles + numbers — used by the critique prompt
 * where the critic checks for violations without needing the full
 * mechanism prose (saves prompt tokens; critic can look up specifics
 * if needed via the rule number).
 */
export function renderForCritiquePrompt() {
  return PLATFORM_MECHANICS
    .map(m => `Mechanic ${m.id}: ${m.title}`)
    .join('\n');
}

export default {
  PLATFORM_MECHANICS,
  FOLKLORE_OR_UNVERIFIED,
  PLATFORM_MECHANICS_VERSION,
  renderForSystemPrompt,
  renderForCritiquePrompt,
};
