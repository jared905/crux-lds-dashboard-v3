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

// CRUX brand applied 2026-05-27 — replaces the prior "intentionally
// neutral" Anthropic-style cream-and-navy palette. Brand inputs
// supplied directly by Jared: 7-color palette, Gotham typography,
// crux-logo.png on cover + footer.
export const brand = {
  // Identity strings — appear on cover + footer of the deliverable.
  name: 'Full View',
  studio: 'CRUX Media',
  productLabel: 'YouTube Audit + Positioning Recommendation',

  // Logo. Renders on the cover hero and in the print footer. Image
  // file lives in /public so it's served as-is at /crux-logo.png.
  logoUrl: '/crux-logo.png',

  // Color palette. CRUX brand — editorial-magazine warmth (#FFFAF1
  // cream surface, #060707 ink) with #015661 deep teal as the primary
  // accent. The pink (#EA73AC), brighter teal (#0A919B), and amber
  // (#E8A82B) are reserved as occasional emphasis hits — they shouldn't
  // be loaded everywhere or the system stops feeling editorial.
  colors: {
    ink:          '#060707',  // primary text — near-black for editorial contrast
    inkSoft:      '#1a1c1c',  // headings + secondary ink (slight lift from full black)
    muted:        '#5e6262',  // secondary text, labels, captions
    background:   '#FFFAF1',  // page background — Crux warm cream
    surface:      '#FFFAF1',  // section cards + callouts share the page cream
    surfaceDeep:  '#DEE3D4',  // pale sage — used for elevated panels (one-liner, callouts)
    accent:       '#015661',  // primary accent — deep teal (section numbers, anchors)
    accentSoft:   '#e6eef0',  // very light accent tint — rationale callouts
    accentBright: '#0A919B',  // mid teal — secondary accent when the deep teal is too heavy
    accentWarm:   '#E8A82B',  // mustard amber — occasional warmth / kicker emphasis
    accentVivid:  '#EA73AC',  // pink — reserved for rare emphasis (movement, highlights)
    border:       '#e8e2d0',  // dividers + table borders (subtle warm hairline)
    danger:       '#b91c1c',  // guardrails / disqualifier accents (kept distinct)
  },

  // Typography. CRUX uses Gotham Ultra for headers + Gotham Book for
  // body. Gotham is commercial — the actual font files must be loaded
  // separately (Adobe Fonts, Cloud.typography, or self-hosted with
  // license). These stacks specify Gotham first and degrade through
  // close-cousins (Montserrat / Proxima Nova) to system sans.
  fontStack:      '"Gotham Book", "Gotham", "Proxima Nova", "Montserrat", ui-sans-serif, system-ui, -apple-system, sans-serif',
  fontHeadStack:  '"Gotham Ultra", "Gotham Black", "Gotham", "Proxima Nova", "Montserrat", ui-sans-serif, system-ui, -apple-system, sans-serif',
  // Accent stack — handwritten zine voice. Used SPARINGLY (Why / In
  // practice / So what tag labels, and the cover one-liner mark) so
  // the doc gets editorial-magazine warmth without losing analytical
  // seriousness. Don't apply to body, titles, or data labels.
  fontAccentStack: '"VTG Move Zine", "Caveat", "Indie Flower", cursive',

  // Optional copy strings the deliverable surfaces. Keep them short.
  footerNote: 'Prepared by CRUX Media',
};

export default brand;
