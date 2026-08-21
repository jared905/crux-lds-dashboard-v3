/**
 * navigation.js — Shared navigation structure
 *
 * Single source of truth for sections and tabs.
 * Used by both TopNav (desktop) and Sidebar (mobile).
 */
import { Telescope,
  Home, Layers, Users, MessageSquare, Brain,
  FileText, Activity, Key, Shield, ShieldCheck, Table, ClipboardCheck,
  Palette, Compass, Crosshair, Target, Gauge, Users2, ScrollText,
  BarChart3, Search, FlaskConical, Map, Briefcase, Settings,
  Stethoscope
} from "lucide-react";

/** Main sections shown in the top nav bar.
 *
 * 2026-08-20 plain-language pass: labels renamed for someone who has
 * never seen this product (Install→Client Intake, Gap Detection→Content
 * Gaps, Ideation→Ideas, Intelligence→What Works, Strategic State→
 * Diagnosis, Cohort→Peer Roles, Pre-flight→Pre-Publish Check,
 * Calibration→Track Record, Data Standardizer→Data Cleanup). Ids are
 * routing keys and never change. */
export const MAIN_SECTIONS = [
  {
    id: "operate",
    // 2026-08-20: label renamed Operate → Portfolio ("Operate" described
    // the strategist's job, not what the section shows; Portfolio = all
    // clients wide, Performance = one client deep). The id stays
    // "operate" so sectionForTab callers and stored prefs keep working.
    label: "Portfolio",
    icon: Briefcase,
    // P2 #9 + #10 (2026-06-08): grouped into Daily (the cross-client
    // alerts feed strategist opens to) + Clients (the portfolio +
    // onboarding artifacts that were previously under the gear menu.
    // Brand Context and Audits are client-onboarding artifacts that
    // belong with the client they're for, not in a utility menu.
    tabs: [
      // 2026-06-12: Command Center is the new default landing —
      // cross-portfolio overview. Sits above This Week so the daily
      // sequence is "scan the portfolio → drill into what needs attention."
      { id: "command-center", label: "Command Center", icon: Home, group: "Daily", recommended: true },
      { id: "portfolio", label: "Clients", icon: Users, group: "Clients" },
      // 2026-06-19: Install moved here from Strategy → Diagnose. Install
      // is a one-shot per engagement (the 16-Q Installation Instrument),
      // not a daily-flow strategist surface. It belongs with the other
      // client-management artifacts (Portfolio, Audits, Brand Context),
      // not in the Strategy nav where the strategist works daily.
      { id: "install", label: "Client Intake", icon: ClipboardCheck, group: "Clients" },
      { id: "audits", label: "Audits", icon: ClipboardCheck, group: "Clients" },
      { id: "brand-context", label: "Brand Context", icon: Palette, group: "Clients" },
    ],
  },
  {
    id: "performance",
    label: "Performance",
    icon: BarChart3,
    tabs: [
      { id: "dashboard", label: "Dashboard", icon: Home },
      // 2026-08-20: audience deep-dive — geography, devices, subscriber
      // split, traffic sources, shorts→long handoff.
      { id: "viewer-insights", label: "Viewers", icon: Users2 },
      { id: "series-analysis", label: "Series Analysis", icon: Layers },
      { id: "saved-reports", label: "Reports", icon: FileText },
      { id: "quarterly-report", label: "Quarterly", icon: Activity },
    ],
  },
  {
    id: "research",
    label: "Research",
    icon: Search,
    tabs: [
      { id: "research-v2", label: "Competitors", icon: Users },
      { id: "gap-detection", label: "Content Gaps", icon: Crosshair },
      { id: "comments", label: "Comments", icon: MessageSquare },
    ],
  },
  {
    id: "content-lab",
    label: "Content Lab",
    icon: FlaskConical,
    tabs: [
      { id: "intelligence", label: "Deep Analysis", icon: Brain },
      { id: "outliers", label: "Outliers", icon: Telescope },
    ],
  },
  {
    id: "strategy",
    label: "Strategy",
    icon: Map,
    // 2026-06-19 (Ship 2 of Diagnostic Synthesis build): nav restructured
    // into three phases that mirror the strategist's actual daily-to-weekly
    // flow — UNDERSTAND state → DECIDE next moves → TRACK outcomes.
    // Strategic State is the recommended landing because it's the unifying
    // diagnosis upstream of every Decide artifact.
    //
    // Previously labeled "Act" — renamed "Decide" to match the conversation
    // shape (the brief is a decision artifact, not just an action).
    // Calibration moved from Diagnose → Track because it's a feedback loop
    // on whether prior decisions worked, not a diagnostic of current state.
    // Install moved out entirely to Operate → Clients (one-shot artifact,
    // not daily flow).
    tabs: [
      // ── Diagnose: understand what's true about this client right now ──
      // Strategic State leads — it's the synthesis the other Diagnose
      // surfaces feed into and the strategist references as the read.
      { id: "strategic-state", label: "Diagnosis", icon: Stethoscope, group: "Diagnose", recommended: true },
      // 2026-06-09: Audience workspace — synthesizes structured persona
      // from existing signals; lives on the Spine; inherited by every
      // downstream LLM artifact.
      { id: "audience", label: "Audience", icon: Users, group: "Diagnose" },
      { id: "repositioning", label: "Repositioning", icon: Target, group: "Diagnose" },
      { id: "cohort-roles", label: "Peer Roles", icon: Users2, group: "Diagnose" },
      // ── Decide: produce the recommendations a client sees ──
      { id: "weekly-brief", label: "Brief", icon: ScrollText, group: "Decide" },
      { id: "pre-flight", label: "Pre-Publish Check", icon: Crosshair, group: "Decide" },
      // ── Track: measure whether prior decisions worked ──
      { id: "calibration", label: "Track Record", icon: Gauge, group: "Track" },
      { id: "opportunities", label: "Opportunities", icon: Compass, group: "Track" },
      // P0-rename 2026-06-08: was "Feedback" — ambiguous what kind.
      { id: "actions", label: "Recent Uploads", icon: Activity, group: "Track" },
      // 2026-08-20: "calendar" removed. It had no handler in App.jsx, so
      // clicking it rendered a blank page, and UploadCalendar.jsx was never
      // wired up (deleted with the rest of the unreachable code).
    ],
  },
];

/** Utility sections behind the gear icon */
// P2 #10 (2026-06-08): Onboarding section removed. Audits + Brand Context
// migrated into Operate → Clients group because they're client-onboarding
// artifacts that belong with the client they're for, not a utility menu.
export const UTILITY_SECTIONS = [
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    tabs: [
      // P0 2026-06-08: removed Settings → Clients link — it pointed at
      // tab="clients" which had no handler in App.jsx (dead route).
      // Client management lives at Operate → Clients (Portfolio).
      { id: "api-keys", label: "API Keys", icon: Key },
      { id: "security", label: "Security", icon: ShieldCheck },
      { id: "standardizer", label: "Data Cleanup", icon: Table },
      { id: "user-management", label: "User Management", icon: Shield, adminOnly: true },
    ],
  },
];

/** All sections combined (for Sidebar / mobile menu) */
export const ALL_SECTIONS = [...MAIN_SECTIONS, ...UTILITY_SECTIONS];

/**
 * Returns the section id that contains the given tab id, or null.
 */
export function sectionForTab(tabId) {
  for (const section of ALL_SECTIONS) {
    if (section.tabs.some((t) => t.id === tabId)) {
      return section.id;
    }
  }
  return null;
}

/**
 * Every tab id in the product, derived from the nav itself.
 *
 * AuthContext used to keep its own hardcoded ALL_TABS list, which drifted to
 * 16 entries while the nav grew to 33 — so 24 live tabs, including the
 * default landing page, were absent from the permission registry entirely.
 * Deriving it here means the two can never disagree again.
 */
export const ALL_TAB_IDS = ALL_SECTIONS.flatMap((s) => s.tabs.map((t) => t.id));

/** Human-readable label for every tab id. */
export const TAB_LABELS = Object.fromEntries(
  ALL_SECTIONS.flatMap((s) => s.tabs.map((t) => [t.id, t.label]))
);
