# NEXT.md — durable backlog

What's parked, why, and when it earns its build slot.

**Read this before suggesting "what should I build next" in a fresh conversation.** Items here have been considered and intentionally deferred — they're not forgotten; they're waiting on a trigger.

Last updated: 2026-06-10

---

## Likely next (build when trigger fires)

### 1. Upgrade pre-launch → real channel UI · ~2 hours
**Status:** Service ready, UI missing.
**Context:** `prelaunchClientService.upgradeToRealChannel({ clientId, youtubeChannelId, channelMetadata })` exists and is tested. It swaps the placeholder `youtube_channel_id` for a real one, clears `is_prelaunch`, preserves all the strategic work (Spine, business context, cohort, role tags, calibration history). Just needs a button + modal: "This client launched → enter the YouTube channel handle."
**Trigger:** Any pre-launch client actually launches a channel. (Voltage Ad case is the test bed.)
**Files:** `src/services/prelaunchClientService.js`, `src/components/Portfolio/AddPrelaunchClientModal.jsx` (reuse the modal pattern).
**Ship plan:** Form takes YouTube handle/URL → resolves to channel ID via existing `/api/youtube-channel.js` → calls upgrade → success view links to Strategy → Repositioning (now that there's video data).

### 2. Calibration-driven cohort suggestions · ~1 day
**Status:** Data available, surface not built.
**Context:** Calibration runs store `mismatched_videos` JSONB. We can group by which cohort channels contribute most to the false-negative pile and surface "Andrei Jikh accounts for 40% of your high-traffic mismatches — consider re-tagging him aspirational." That closes the feedback loop: calibration → cohort refinement → fresh audit → better calibration.
**Trigger:** Soon — but only after running calibration on 2+ clients to confirm the pattern generalizes. Right now we only have Kendall data.
**Files:** `src/services/calibrationService.js` (extract per-cohort-channel mismatch attribution), `src/components/Strategy/CohortRoles/CohortRolesWorkspace.jsx` (surface the suggestions inline).
**Why this matters:** Today the strategist has to read the mismatch list and infer cohort issues. Closes the loop into a click.

---

## Deferred (build only with concrete signal)

### 3. Composite re-weighting per format · ~1-2 days
**Status:** Brief compensates at the language layer; honest about Shorts unreliability.
**Context:** Kendall calibration showed 21% Shorts exact (below 25% random) vs 33% long-form. We could re-weight composite per format — drop slot weight on Shorts, upweight title_patterns + topic_authority. Would move Shorts accuracy maybe 21% → 28%.
**Trigger:** Build when a *second* client confirms the same Shorts pattern. One data point isn't enough to redesign the composite.
**Files:** `src/services/conceptScorerService.js` (composeRating function).
**Honest caveat:** Even with re-weighting, Shorts have a structural ceiling on predictability — algorithmic feed dynamics dominate creator-side signals. Realistic ceiling: ~30-35% exact. Don't oversell.

### 4. Calibration Phase B: pluggable pipeline-metric strategy · ~2-3 days
**Status:** Schema ready (migration 092 has `baseline_strategy` column), strategies not implemented beyond `percentile_rank`.
**Context:** For B2B / advisor / nonprofit clients with measurable conversions (consultations, demo requests, donor signups), view-rank quartile is the wrong actual-tier baseline. Pipeline outcomes are. Service strategy registry needs to grow to accept e.g. `consultation_bookings` and pull from a per-client outcomes table.
**Trigger:** First client who can actually provide outcome data. Kendall doesn't have a CRM integration; until someone does, Phase A is enough.
**Files:** `src/services/calibrationService.js` (add new strategies to `deriveActualTiers`); needs a new `client_outcomes` table.

### 5. Phase 2.75: audience-adjacency via comments mining · ~3-5 days
**Status:** Speculative; nobody's asked for it concretely.
**Context:** Titles + viewing patterns don't capture what an audience cares about — comments do. Mining competitor comments for repeated themes could surface "this audience cares about X, your titles don't mention X" type insights.
**Trigger:** A strategist explicitly hits a "I don't know what this audience actually wants" wall. Don't build speculatively.
**Files:** Would need YouTube Data API comments scope, a `client_comment_signals` table, an analysis service.

---

## Audit / Spine ingestion extensions

### 6. ~~Sitemap multi-page crawl~~ — SHIPPED 2026-06-10
**Status:** Done. `api/audit-website.js` now supports opt-in `multiPage: true` mode. Sitemap.xml discovery first (with relevance ranking — boosts /about, /team, /mission etc., penalizes /blog/ and pagination), common-path probing as fallback, up to 8 pages with 35K-char total budget and `## PAGE: <url>` section headers. `spineAutoFillService` uses multi-page by default; UI surfaces the page count + discovery source + per-page sizes.

### 7. PDF / deck upload for Spine extraction · ~1-2 days
**Status:** No file upload infrastructure exists.
**Context:** Pitch decks and brand books contain canonical positioning that's clearer and more deliberate than website copy. New endpoint with `pdf-parse` (or pdfjs) + Claude extraction. Same draft→confirm pattern as website scrub.
**Trigger:** Onboarding an institutional brand client that has a brand book / pitch deck but a thin marketing website.
**Files:** new `api/spine-pdf-extract.js`, extend `src/services/spineAutoFillService.js`.

---

## OAuth / connection workflow

### 8. Token-share team workflow polish · ~half day
**Status:** Team-OAuth model shipped (commit `db1fa57`); tokens are usable across users. Two small polish items remain:
**Context:**
  - Bulk OAuth invite for multi-channel networks (one link, multiple channel grants)
  - Automated reminder emails for pending invites near expiry (cron'd from existing infra)
**Trigger:** First time the friction shows up. Single-channel onboarding is fine today.

---

## Killed / probably won't do

### Phase 1 fixture-based tests against SafeStreets numbers
**Original intent:** Validate the scorer against a known-correct reference dataset.
**Why killed:** Calibration with real Kendall data validates the scorer more honestly than fixtures could. Calibration accuracy is the real ground truth; fixtures would just encode our assumptions. Time invested in fixtures would be better spent improving calibration tooling.

### Executive justification memo as default surface
**Original intent:** Auto-generate stakeholder-approval memo on every scorecard.
**Why demoted (not killed):** Feedback from Kendall test — "I don't see a need to send a memo for a YouTube title" (commit `ff62b19`). Memo is still in the codebase, just collapsed to a single-line disclosure. Earns its keep only on institutional brand clients with real Director→VP approval workflows. See `feedback_executive_memo_audience.md` in memory.

---

## Process notes

**When to defer vs. build:** the audit-driven UX shipped 2026-06-08 reorganized 9 Strategy tabs into 3 groups, surfaced cross-client alerts, and scaffolded next-step pointers. The next-build signal from real usage almost always beats upfront prioritization. Default: spend a week using the new flows before adding more.

**When to add items here:** when a build is explicitly deferred (not just "we could do this someday"), add it with the trigger condition. When a build is killed, add it to "Killed" with the lesson learned — saves the next conversation from re-proposing it.

**When to remove items:** when a trigger fires and the item ships, remove it. When the trigger conditions become permanently obsolete (e.g., we move off YouTube), remove it.
