/**
 * Brand configuration for client-facing artifacts (deliverable, rubric
 * scorecard, etc).
 *
 * Edit this file to apply CRUX's brand identity globally. The defaults
 * are intentionally neutral — clean off-white + deep navy accent — so
 * the deliverable looks professional and deck-friendly out of the box.
 * Override any field below to match the brand you want to apply.
 *
 * To wire up a real brand:
 *   1. Set `name` to your studio/agency name (appears in footer + cover).
 *   2. Set `productLabel` to your deliverable's product line name.
 *   3. Replace the colors with your brand palette.
 *   4. (Optional) Set `logoUrl` to an inline-imported PNG/SVG or a
 *      hosted URL. Keep it under 60KB so print export is fast.
 *   5. (Optional) Override `fontStack` if your brand uses a custom
 *      font that's loaded elsewhere in the app.
 *
 * When you're ready to make this editable from the dashboard instead of
 * via this file, ask for the brand-settings UI — it'll write to
 * localStorage and override these defaults at runtime.
 */

export const brand = {
  // Identity strings — appear on cover + footer of the deliverable.
  name: 'Full View',
  studio: 'CRUX Media',
  productLabel: 'YouTube Audit + Positioning Recommendation',

  // Logo. Set to a URL (https://...) or imported asset path. Leave null
  // to render the studio name as a wordmark instead.
  logoUrl: null,

  // Color palette. All client-facing rendering pulls from these so a
  // palette change is one file edit, not a hunt-and-replace.
  colors: {
    ink:          '#111111',  // primary text on light backgrounds
    inkSoft:      '#1f2937',  // headings (slightly softer than pure black)
    muted:        '#5b6470',  // secondary text, labels, captions
    background:   '#ffffff',  // page background (clean white default)
    surface:      '#f7f4ec',  // subtle warm panel — section cards, callouts
    surfaceDeep:  '#ede4cf',  // deeper panel for emphasis (e.g. one-liner panel)
    accent:       '#1e3a8a',  // primary accent — section numbers, accents
    accentSoft:   '#e8edf7',  // very light accent tint — rationale callouts
    border:       '#e8e2d0',  // dividers + table borders
    danger:       '#b91c1c',  // guardrails / disqualifier accents
  },

  // Typography. Defaults to the system UI sans stack — readable, broad
  // platform coverage, no extra network load. Override with a string
  // like '"GT America", system-ui, sans-serif' if you've loaded a brand font.
  fontStack: 'ui-sans-serif, system-ui, -apple-system, "Inter", sans-serif',

  // Optional copy strings the deliverable surfaces. Keep them short.
  footerNote: 'Prepared by Full View · CRUX Media',
};

export default brand;
