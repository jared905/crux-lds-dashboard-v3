# NEXT.md — durable backlog

What's parked, why, and when it earns its build slot.

**Read this before suggesting "what should I build next" in a fresh conversation.** Items here have been considered and intentionally deferred — they're not forgotten; they're waiting on a trigger.

Last updated: 2026-06-11

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

### 5. ~~Competitor-comment sweep (Path A v1)~~ — SHIPPED 2026-06-11
**Status:** Done. Built per 2026-06-10 deep-research synthesis. On-demand sweep tool, not a systematic pipeline: strategist picks one competitor channel → fetches recent uploads + top-relevance comments → regex-classifies into question / content_request / general → surfaces actionable signals as Strategy Spine *input candidates* (no auto-merge, per the participation-inequality finding). Migration 103, `api/youtube-comment-sweep.js`, `commentSweepService`, `CompetitorCommentsSection` embedded in AudienceWorkspace.

**v1.1 deferred (build when sweep yield validates):**
- **LLM theme clustering** — group recurring question themes across signals. Defer until we see real sweep data and know whether regex grouping is sufficient.
- **Multi-channel batch** — sweep all cohort channels in one click, dedupe themes across them. Defer until single-channel sweep proves useful.
- **Spine-merge action wiring** — currently `status='merged_to_spine'` is a flag; the actual prefill into persona / pillars / concept seeds is manual. Wire only after the strategist's actual workflow surfaces (don't pre-design).
- **Sweep freshness** — when does a sweep go stale? Surface a "last swept" timestamp on the channel. Build after first repeat-sweep happens.

---

## Audit / Spine ingestion extensions

### 6. ~~Sitemap multi-page crawl~~ — SHIPPED 2026-06-10
**Status:** Done. `api/audit-website.js` now supports opt-in `multiPage: true` mode. Sitemap.xml discovery first (with relevance ranking — boosts /about, /team, /mission etc., penalizes /blog/ and pagination), common-path probing as fallback, up to 8 pages with 35K-char total budget and `## PAGE: <url>` section headers. `spineAutoFillService` uses multi-page by default; UI surfaces the page count + discovery source + per-page sizes.

### 7. ~~PDF / deck upload for Spine extraction~~ — SHIPPED 2026-06-11
**Status:** Done. New `api/spine-pdf-extract.js` accepts base64 PDF (≤4.3MB), parses with `pdfjs-dist` legacy ESM in synchronous in-process mode, returns concatenated text with `## PAGE N` headers (60-page parse cap, 35K total char cap). `spineAutoFillService.extractSpineFromPdf` reuses the same Claude extraction pipeline; prompt v2-spine-autofill-multipage now routes by `sourceKind` ('website' vs 'pdf') with PDF-specific guidance (fragment-tolerant synthesis, early-page positioning anchor). UI: dual-mode tabs (Website / PDF) in SpineAutoFillSection with size-validated file picker and shared CrawlSummary for the post-extract diagnostic.

---

## OAuth / connection workflow

### 8. Token-share team workflow polish · ~half day
**Status:** Team-OAuth model shipped (commit `db1fa57`); tokens are usable across users. Two small polish items remain:
**Context:**
  - Bulk OAuth invite for multi-channel networks (one link, multiple channel grants)
  - Automated reminder emails for pending invites near expiry (cron'd from existing infra)
**Trigger:** First time the friction shows up. Single-channel onboarding is fine today.

---

## Prospect report (external audit document)

### 9. Visual lift on the prospect one-pager · deferred 2026-09-08
**Status:** Structure approved, design explicitly deferred. The four-part
format — problem / opportunity / how we fix / offer, with a one-line opener
before them — is settled and mocked
(artifact `c1c93bd2-7e3e-4eb5-ac68-cd7a4b6566a4`, working files in `design/`).
Jared: "I like the format, but the design needs a lift."

**Trigger:** pick this up before the next prospect send, or alongside the
strategist-input build below — not on its own. Two known specifics: the mock
uses Barlow Condensed + Inter to match `Shared/PDFExport.jsx`, while the brand
direction is Gotham Ultra/Book (already self-hosted in `public/fonts`, unused
by any renderer); and both export paths still render through
jsPDF + html2canvas at A4 `scale: 2`, so the output is image-only and heavy
whichever document you send.

### 10. Strategist input, so the report is a collaboration · not started
**Status:** Not built. `AuditReportBuilder` lets a strategist edit and toggle
sections AFTER synthesis, but nothing lets them feed context in BEFORE it —
so the model has already framed the document and the human is rewriting, not
collaborating. Build order, cheapest first:

1. Recipient fields (name, title) — nothing captures them today, so
   "Prepared for" cannot be rendered at all.
2. Per-metric `consequence` prompts — the fields already exist on every
   metric in `reportPrePopulator` and ship empty. A number is a dashboard; a
   number plus its consequence is an argument.
3. A strategist context box at audit creation ("what do you know that the
   data does not?") feeding the synthesis prompt.
4. A proof-point table (client, category, tier, before/after metric,
   permission-to-name) so "what Crux has done before" is SELECTED, never
   generated.

**Why 4 matters most:** there is no store of Crux results anywhere in the
codebase, which is why an audit shipped the sentence "CRUX has scaled
essential oils and wellness channels from exactly this position." Until that
table exists, the proof block stays a human-filled slot and the synthesis
prompt must forbid first-party claims outright.

## Audit coverage and MCP

### 11. No client has a baseline audit · surfaced 2026-09-08
**Status:** Not started. `list_audits` returned 17 completed audits and every
one is `audit_type: 'prospect'`. Zero `client_baseline` rows exist. The
apostle channels, SafeStreets, Lindsey's and The Men Who Love God — the
paying clients — have no audit at all. So the channels we know most about
are the only ones with no baseline in the system.

**Trigger:** this blocks the before/after case-study post, which needs a
starting point to measure against. Roughly an afternoon: run a
`client_baseline` audit per client channel. Worth doing before the next
round of prospect outreach, since a real before/after is the proof material
the prospect report's section 3 has no source for today (see item 10).

### 12. `client_id` is a channels UUID in disguise · not urgent
**Status:** Not started. Every MCP tool takes `client_id`, and it is passed
straight to `.eq('channel_id', ...)` — there is no client id concept in the
schema at all; `audits` has no `client_id` column. The name is a landmine
the day a real client-id concept appears.

**Trigger:** rename the parameter to `channel_id` and keep `client_id` as a
deprecated alias accepted by every tool, before any work introduces a
genuine client identifier. Not urgent while the two are the same value.

### 13. Hosted HTTP/SSE MCP endpoint · deliberately deferred 2026-09-08
**Status:** Not building. The MCP server is a local stdio process
(`StdioServerTransport`, launched by Claude Desktop from
`claude_desktop_config.json`). That is the right shape for a one-seat tool:
no hosting, no auth surface, no service key leaving the machine.

**Trigger:** build it when FVA needs to be reachable by someone who is not
Jared at his desk — a strategist on the team, Pearl 27, or Jared from
mobile. That means an HTTP/SSE transport, a hosted deployment, and real
auth, because the server currently runs with the Supabase service key and
no per-user authorization of any kind. Until then the local process is
strictly less to secure.

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
