# Platform Mechanics

*Version: `v1-2026-06-13-12-rules-verified`*

> Generated from `src/lib/platformMechanics.js`. **Do not edit by hand** — run `npm run gen:mechanics` after editing the source file.

---

## What this is

Twelve verified rules about how YouTube's recommender actually works, each cited to Google/YouTube-authored primary research. Every rule passed adversarial 3-vote verification in a deep-research workflow before being added.

**Use as:** the craft-knowledge layer for every Crux artifact that makes a recommendation. When a recommendation invokes a mechanic, cite the rule number ("per Mechanic 5"). When industry advice can't map to a mechanic, treat it as folklore — either find a primary source or label as Hypothesis.

**Sources:** Google-authored peer-reviewed papers (RecSys, WSDM, arXiv). No influencer hot takes, no "the algorithm rewards X" claims, no paraphrases that drift from source language.

---

## The 12 mechanics

### Mechanic 1: CTR alone does not maximize ranking — clickbait is explicitly demoted

**Mechanism.** YouTube's ranking objective is watch-time-weighted logistic regression, not CTR. Positive impressions are weighted by observed watch time; negative impressions get unit weight. Click-without-completion is structurally penalized.

**Creator implication.** Thumbnail/title pairs that overpromise relative to delivered content lose ranking signal even when CTR is high. Design for completion rate, not clicks.

**Source.** Covington, Adams, Sargin (2016). *Deep Neural Networks for YouTube Recommendations*. RecSys '16. [Link](https://cseweb.ucsd.edu/classes/fa17/cse291-b/reading/p191-covington.pdf).

> "Ranking by click-through rate often promotes deceptive videos that the user does not complete (clickbait) whereas watch time better captures engagement."

---

### Mechanic 2: Channel-level memory is a first-class ranking feature

**Mechanism.** The ranking model explicitly uses "how many videos has the user watched from this channel" as a feature. The viewer-to-channel relationship is a literal model input, not an emergent property.

**Creator implication.** Building a returning-viewer base raises ranking eligibility for future uploads to those same viewers, independent of per-video CTR. Programming consistency and recurring formats are mechanically rewarded.

**Source.** Covington, Adams, Sargin (2016). *Deep Neural Networks for YouTube Recommendations*. RecSys '16. [Link](https://cseweb.ucsd.edu/classes/fa17/cse291-b/reading/p191-covington.pdf).

> "consider the user's past history with the channel that uploaded the video being scored — how many videos has the user watched from this channel?"

---

### Mechanic 3: Topic-recency is a ranking feature

**Mechanism.** "When was the last time the user watched a video on this topic" is an explicit input to the ranker. The system maintains per-viewer topic-engagement timestamps.

**Creator implication.** Topic-cluster cadence — covering related topics on a regular rhythm — keeps the channel ranking-eligible to viewers who recently engaged with that topic anywhere on YouTube. Supports the topical-authority-through-cluster-cadence thesis.

**Source.** Covington, Adams, Sargin (2016). *Deep Neural Networks for YouTube Recommendations*. RecSys '16. [Link](https://cseweb.ucsd.edu/classes/fa17/cse291-b/reading/p191-covington.pdf).

> "When was the last time the user watched a video on this topic?"

---

### Mechanic 4: Impression churn: an unclicked impression is naturally demoted on next page load

**Mechanism.** The model includes features describing the frequency of past video impressions, explicitly designed to introduce "churn" — if a user was shown a video and didn't click, the same video gets demoted next load.

**Creator implication.** A single weak packaging swing burns impression eligibility for that viewer. Packaging A/B (title/thumbnail) on the first day matters disproportionately because re-presentation is throttled by the system itself.

**Source.** Covington, Adams, Sargin (2016). *Deep Neural Networks for YouTube Recommendations*. RecSys '16. [Link](https://cseweb.ucsd.edu/classes/fa17/cse291-b/reading/p191-covington.pdf).

> "If a user was recently recommended a video but did not watch it then the model will naturally demote this impression on the next page load."

---

### Mechanic 5: Satisfaction signals are first-class objectives, separate from engagement

**Mechanism.** The 2019 multi-task ranking system explicitly groups objectives into engagement (clicks, watch time) AND satisfaction (likes, dismissals, survey ratings) — modeled as separate experts in a Multi-gate Mixture-of-Experts (MMoE) architecture. Live A/B at 1.9B MAU showed satisfaction lift of +3.07% vs. engagement lift of +0.45% — satisfaction weighted ~6.8x larger.

**Creator implication.** Dismissals are negative ranking feedback distinct from non-clicks. Explicit asks for likes feed a separate satisfaction objective, not vanity. Long-but-unsatisfying watches score poorly on the satisfaction experts.

**Source.** Zhao et al. (10 Google authors) (2019). *Recommending What Video to Watch Next: A Multitask Ranking System*. RecSys '19. [Link](https://dl.acm.org/doi/pdf/10.1145/3298689.3346997).

> "engagement behaviors, such as clicks and watches; satisfaction behaviors, such as likes and dismissals."

---

### Mechanic 6: Position bias is actively removed via a shallow side tower

**Mechanism.** A separate shallow tower fed position and device features (with 10% dropout, missing at serving) learns position bias and removes it from the main ranking objective.

**Creator implication.** Don't over-weight "my video was buried" explanations for under-performance — the model attempts to correct for shelf position. Conversely, high engagement from a low-shelf position is a strong positive signal because the model can attribute it correctly.

**Source.** Zhao et al. (2019). *Recommending What Video to Watch Next: A Multitask Ranking System*. RecSys '19. [Link](https://dl.acm.org/doi/pdf/10.1145/3298689.3346997).

> "shallow side tower fed position+device features (10% dropout, missing at serving) for position-bias debiasing."

---

### Mechanic 7: Long-term cumulative reward — not single-next-watch — is the candidate-gen objective

**Mechanism.** REINFORCE policy-gradient RL deployed to YouTube candidate generation at million-item action spaces, with off-policy correction. Optimization is for cumulative reward across the action sequence — full sessions and return visits — not the single next watch.

**Creator implication.** A video that ends a session is penalized relative to a video that opens or sustains one. Session-pull / "next video" structuring matters at the candidate-generation layer, not just at ranking. End screens, sequel design, and series momentum tie directly to this.

**Source.** Chen et al. (Google) (2018/2019). *Top-K Off-Policy Correction for a REINFORCE Recommender System*. WSDM 2019 / arXiv 1812.02353. [Link](https://arxiv.org/abs/1812.02353).

> "scaling REINFORCE to a production recommender system with an action space on the orders of millions… applying off-policy correction to address data biases in learning from logged feedback collected from multiple behavior policies."

---

### Mechanic 8: Fresh content gets a shielded discovery window via explicit exploration

**Mechanism.** A Neural Linear Bandit exploration stack is deployed to a billions-of-users short-form video platform, with measurement framed around corpus growth and long-term user experience because standard A/B engagement metrics fail to capture exploration's long-term benefits. At the candidate-gen layer, the 2016 "example age" feature is set to zero at serving — a calibrated boost for fresh uploads.

**Creator implication.** New uploads receive a structurally distinct discovery window from the steady state. The first 24-72 hours of an upload behaves differently than month-2 performance, and that difference is by design — the system gives new content a protected audition, then graduates winners on satisfaction-per-impression.

**Source.** Su et al. (Google/DeepMind) (2024). *Long-Term Value of Exploration: Measurements, Findings and Algorithms*. WSDM 2024 / arXiv 2305.07764. [Link](https://arxiv.org/pdf/2305.07764).

> "Regular A/B tests on exploration often measure neutral or even negative engagement metrics while failing to capture its long-term benefits."

**Supporting source.** Covington, Adams, Sargin (2016). [Link](https://cseweb.ucsd.edu/classes/fa17/cse291-b/reading/p191-covington.pdf).

> "we feed the age of the training example as a feature during training. At serving time, this feature is set to zero (or slightly negative) to reflect that the model is making predictions at the very end of the training window."

---

### Mechanic 9: Semantic clarity matters — videos are represented by content-derived Semantic IDs

**Mechanism.** Semantic IDs are "a compact discrete item representation learned from frozen content embeddings using RQ-VAE that captures the hierarchy of concepts in items," replacing random video IDs in YouTube ranking. Semantically similar items share representation.

**Creator implication.** Title/description/transcript/visual coherence becomes a ranking input via the RQ-VAE-derived Semantic ID. Vague or contradictory packaging dilutes the Semantic ID's signal; entity-clear and topically coherent packaging strengthens it. This is the mechanical basis for the topical-clarity rule that creator advice has asserted impressionistically for years.

**Source.** Singh et al. (12 Google authors incl. Ed Chi, Lichan Hong, Li Wei, Xinyang Yi) (2023/2024). *Better Generalization with Semantic IDs*. RecSys 2024 / arXiv 2306.08121. [Link](https://arxiv.org/pdf/2306.08121).

> "Semantic IDs can replace the direct use of video IDs by improving the generalization ability on new and long-tail item slices without sacrificing overall model quality."

---

### Mechanic 10: Catalog resurrection is a real platform effect — evergreen videos can resurface for new audiences

**Mechanism.** Semantic IDs explicitly improve generalization on "new and long-tail item slices" in "large, power-law distributed, and evolving" catalogs. An older video lands in the Semantic-ID neighborhood relevant to a new viewer cohort, and the system can match it without per-video personalization history.

**Creator implication.** Older videos can re-surface when a new viewer cohort makes the Semantic-ID neighborhood relevant. Evergreen optimization — semantic clarity, durable framing, non-time-anchored hooks — has compounding ranking value beyond traditional SEO discoverability.

**Source.** Singh et al. (2023/2024). *Better Generalization with Semantic IDs*. RecSys 2024. [Link](https://arxiv.org/pdf/2306.08121).

> "improving the generalization ability on new and long-tail item slices in large, power-law distributed, and evolving catalogs."

---

### Mechanic 11: Recommendation layer and LLM/AI-citation layer share substrate via Semantic IDs + Gemini fine-tuning

*Confidence: medium*

**Mechanism.** PLUM combines Semantic ID tokenization + continued pre-training on YouTube-domain data + task-specific fine-tuning of Gemini-family LLMs, "directly trained to generate Semantic IDs of recommended items based on user context." Reported +4.96% Panel CTR lift on YouTube Shorts in live A/B; added to YouTube's production candidate pool alongside the Large Embedding Model baseline (additive, not wholesale replacement).

**Creator implication.** The recommendation layer and the AI-citation/discovery layer (LLM-based search, AI Overviews) are converging at the representation layer. Strategies for AI-discoverability and YouTube-discoverability can share an underlying entity/topic ontology. CAVEAT: PLUM does not itself claim the same Semantic IDs are used in Google Search/AI Overviews — the convergence is architectural and directional, not stated cross-product equivalence.

**Source.** Google/YouTube (PLUM team) (2025). *PLUM: Adapting Pre-Trained Language Models for Industrial-Scale Generative Recommendations*. arXiv 2510.07784 (October 2025). [Link](https://arxiv.org/abs/2510.07784).

> "PLUM consists of item tokenization using Semantic IDs, continued pre-training (CPT) on domain-specific data, and task-specific fine-tuning… the model is directly trained to generate Semantic IDs of recommended items based on user context."

---

### Mechanic 12: Exploration-served impressions and steady-state impressions behave differently — don't equate them

**Mechanism.** Exploration metrics differ structurally from engagement metrics. Standard A/B engagement may look "neutral or even negative" for content that benefits long-term corpus health, which is why YouTube uses corpus-growth-based measurement designs for the exploration stack.

**Creator implication.** When evaluating a "this video underperformed in week 1" signal, hedge — exploration-served impressions and main-flow impressions have different baseline behavior. Don't equate week-1 engagement deficits with content failure for new uploads. Read the slope of returning-viewer and topic-cluster signals before declaring a video a miss.

**Source.** Su et al. (2024). *Long-Term Value of Exploration: Measurements, Findings and Algorithms*. WSDM 2024. [Link](https://arxiv.org/pdf/2305.07764).

> "Regular A/B tests on exploration often measure neutral or even negative engagement metrics while failing to capture its long-term benefits."

---

## Excluded — folklore or unverified

Claims we explicitly **do not** cite as platform fact. Tracked here so we don't silently re-introduce them. A claim can be promoted to the verified list if a primary source is identified.

- **The 5-Video Rule (tight sub-niche for first 5-10 long-form videos)** — No primary source. Plausible downstream of Rule 2 (channel memory) and Rule 9 (Semantic clarity) but not directly attributable.
- **Vocalize semantic entities in first 30-60 seconds** — No primary source. Plausible downstream of Rule 9 but the specific time window is folklore.
- **"Watch-time hacking stopped working" with the 2019 multi-task ranking system** — Post-hoc consultant narrative. The 2019 paper frames the problem as "misalignment between user implicit feedback and true user utility" — never uses gaming/hacking language.
- **click → completion → satisfaction → session → return-habit hierarchy as a single articulated ladder** — Synthesis-side framing. Each transition is individually defensible from a different paper, but the unified 5-rung hierarchy is editorial. OK to use as a teaching aid; don't cite it as platform-stated.
- **Todd Beaupré 2025 quotes on satisfaction-focus and dynamic per-context signal weighting** — No primary artifact (Creator Insider episode, podcast, talk transcript) sourced in verification. Treat as unverified until specific artifact + timestamp is identified.
- **PLUM has fully replaced YouTube's embedding-table candidate retrieval** — Refuted (1-2 vote). PLUM is additive to YouTube's production candidate pool — Large Embedding Model baseline coexists. Defensible version: PLUM is deployed in production and the architectural direction is autoregressive Semantic-ID generation.
- **Specific cadence numbers (e.g., "upload every Tuesday"), specific thumbnail-CTR thresholds** — No primary source. Industry folklore.

---

## Where these rules are wired

Imported from `src/lib/platformMechanics.js` by:

- `src/services/weeklyBriefService.js` — system prompt + critique rubric (v7+)
- `src/services/alternativeTitlesService.js` — title generation prompt
- `src/services/conceptSeedsService.js` — concept seed generation prompt

When the JS source updates, every consumer gets the change on next build. Re-run `npm run gen:mechanics` to regenerate this doc.

## Promotion path

A folklore claim becomes a verified mechanic when:

1. A primary source is identified (Google-authored paper, on-record YouTube product leadership statement with timestamp, or peer-reviewed deployed-at-scale claim).
2. Verbatim quote can be cited.
3. The smallest defensible creator-side implication that follows is articulated.

Add it to `PLATFORM_MECHANICS` in `src/lib/platformMechanics.js`, remove from `FOLKLORE_OR_UNVERIFIED`, run `npm run gen:mechanics`, ship.
