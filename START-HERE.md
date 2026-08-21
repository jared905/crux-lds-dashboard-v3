# Full View Analytics — hosting handoff

This bundle is the complete, ship-ready application. Three files at the root
of this zip are for you; everything else is the app itself.

- **SHIP-AUDIT.html** — open in a browser. The full readiness review: what
  shipped, bundle weights, code health, and the launch checklist below in
  detail.
- **full-view-migrations-109-116.sql** — the pending database batch. Run
  once in the Supabase SQL editor (paste the whole file → Run). Each block
  self-verifies with a success notice; safe to re-run.
- **.env.example** — the environment variables the deploy needs. No secrets
  ship in this bundle; fill these in on the hosting side.

## Deploy in four steps

1. **Database** — run `full-view-migrations-109-116.sql` in the Supabase
   SQL editor (if it hasn't been run already; re-running is harmless).
2. **Environment variables** — set on the deploy target (Vercel → Project →
   Settings → Environment Variables): the Supabase keys, Google OAuth pair,
   `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `YOUTUBE_API_KEY` (also powers the
   Daily Outliers feed), and `ANTHROPIC_API_KEY` (one server-side key serves
   the whole team — nobody configures keys in their browser).
3. **Deploy** — `npm install && npm run build` passes clean (0 lint errors,
   0 warnings, rules at error severity). Deploying the repo to Vercel picks
   up the serverless functions in `api/` and registers the crons
   (nightly sync + 09:00 audience sync) from `vercel.json` automatically —
   just confirm they appear under Project → Crons.
4. **Sanity pass** — after the first nightly sync, spot-check two or three
   channels against YouTube Studio, and confirm the migration-gated features
   lit up: Viewers page, the Momentum chart's daily line, client networks,
   timeline notes.

## Day one vs. week three

A few features are data-dependent, not code-dependent: thumbnail change
tracking and the launch-velocity curves get richer as nightly snapshots
accumulate, and the Daily Outliers feed only runs on the deployed site
(it needs the server API layer). None of this blocks shipping.
