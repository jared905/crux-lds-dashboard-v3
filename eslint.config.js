import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';

/**
 * ESLint flat config.
 *
 * The rules below are not generic boilerplate — each one corresponds to a
 * class of defect actually found in this codebase during the August 2026
 * audit, so the linter earns its place by preventing recurrences rather than
 * by enforcing taste.
 *
 * Run:  npm run lint        (report)
 *       npm run lint:fix    (autofix what's safe)
 *
 * 2026-08-21: the backlog was cleared to zero (colors tokenized, dead code
 * removed, hook deps fixed or documented), so every rule now runs at "error"
 * — new debt fails the lint step instead of accumulating silently.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.vercel/**', 'mcp-server/**', 'mockups/**'],
  },

  // ── Browser code ────────────────────────────────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'react-hooks': reactHooks, react },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // AIExecutiveSummary.jsx read `isMultiChannel` 44 lines before it was
      // declared — a temporal dead zone error that made "Generate Summary"
      // throw every single time.
      //
      // `variables: false` limits the check to same-scope references — the
      // only kind that actually throws at runtime. The house style of
      // components referencing style constants declared later at module
      // level is an upper-scope reference, safe by construction, and was
      // producing ~900 findings the stricter setting could not tell apart
      // from the real defect. Same-scope TDZ bugs still get flagged.
      'no-use-before-define': ['error', { functions: false, classes: true, variables: false }],

      // Stale closures and missing cleanup were the most common hook defect
      // found. Deliberate omissions carry per-line disables with reasons.
      'react-hooks/exhaustive-deps': 'error',

      // Without these two, core ESLint cannot see JSX: components and icons
      // referenced only in markup read as "unused", and a component that was
      // never imported reads as fine until it crashes at render. These were
      // the "known false positives from the JSX linter setup".
      'react/jsx-uses-vars': 'error',
      'react/jsx-no-undef': 'error',

      // 57 files went unreachable without anyone noticing. Unused imports are
      // the first symptom of that drift.
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],

      // `catch {}` and `catch (e) {}` hid real failures — most damagingly,
      // a dead database rendering as a healthy empty state.
      'no-empty': ['error', { allowEmptyCatch: false }],

      // Design tokens live in src/index.css. New hardcoded colours put the
      // codebase back on the road to 222 distinct hex values. (Files where
      // literals are structural — SVG presentation attributes, offscreen
      // document renderers — are exempted in the override block below.)
      'no-restricted-syntax': ['error', {
        // JSXAttribute literals are excluded: SVG presentation attributes
        // (fill/stroke) cannot resolve var(), so those hexes are structural.
        selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]:not(JSXAttribute > Literal)',
        message: 'Use a design token from src/index.css (var(--pos), var(--muted), …) instead of a hardcoded colour.',
      }],

      // These are unambiguous defects, so they stay errors. The first run
      // found: an assignment to a const on a recovery path, a duplicate
      // object key, `scoreColor` called in three places and never defined,
      // and four conditionally-called hooks.
      'no-undef': 'error',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'react-hooks/rules-of-hooks': 'error',

      eqeqeq: ['error', 'smart'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // ── Deliberate-literal files ────────────────────────────────────────────
  // Two classes of file need hex literals and are exempt from the token rule:
  //  · SVG visualisations — var() does not resolve in SVG presentation
  //    attributes (fill/stroke), so chart ramps are hex by necessity.
  //  · Offscreen document renderers — the PDF/report templates are rendered
  //    by html2canvas/jsPDF as standalone documents with their own inlined
  //    palette, deliberately decoupled from the app stylesheet.
  {
    files: [
      'src/components/Performance/Chart.jsx',
      'src/components/Performance/BrandFunnel.jsx',
      'src/components/Performance/VelocityCurves.jsx',
      'src/components/Performance/USStateMap.jsx',
      'src/components/Performance/AudienceMap.jsx',
      'src/components/Performance/CtrImpressionsScatter.jsx',
      'src/components/Shared/PDFExport.jsx',
      'src/components/Reports/QuarterlyReport.jsx',
      'src/components/Performance/ExecutiveSummary.jsx',
      'src/components/Audit/AuditPDFExport.jsx',
      'src/components/Audit/AuditReportBuilder.jsx',
      'src/components/ClientDeliverable/ClientDeliverable.jsx',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // ── Serverless handlers ─────────────────────────────────────────────────
  {
    files: ['api/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-use-before-define': ['warn', { functions: false, variables: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      // Server code legitimately logs; it is the only observability there is.
      'no-console': 'off',
    },
  },
];
