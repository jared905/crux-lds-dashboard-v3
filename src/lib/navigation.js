/**
 * navigation.js — Shared navigation structure
 *
 * Single source of truth for sections and tabs.
 * Used by both TopNav (desktop) and Sidebar (mobile).
 */
import {
  Home, Layers, Sparkles,
  Users, MessageSquare,
  Lightbulb, Brain, Zap,
  FileText, Activity, Calendar,
  Building, Key, Shield, ShieldCheck, Table,
  ClipboardCheck, Palette,
  Compass, Crosshair, Target, Radar, Gauge, Users2, ScrollText, AlertCircle,
  BarChart3, Search, FlaskConical, Map, Briefcase, Settings, Stethoscope,
} from "lucide-react";

/** Main sections shown in the top nav bar */
export const MAIN_SECTIONS = [
  {
    id: "operate",
    label: "Operate",
    icon: Briefcase,
    // P2 #9 + #10 (2026-06-08): grouped into Daily (the cross-client
    // alerts feed strategist opens to) + Clients (the portfolio +
    // onboarding artifacts that were previously under ⚙ → Onboarding).
    // Brand Context and Audits are client-onboarding artifacts that
    // belong with the client they're for, not in a utility menu.
    tabs: [
      // 2026-06-12: Command Center is the new default landing —
      // cross-portfolio overview. Sits above This Week so the daily
      // sequence is "scan the portfolio → drill into what needs attention."
      { id: "command-center", label: "Command Center", icon: Home, group: "Daily", recommended: true },
      { id: "this-week", label: "This Week", icon: AlertCircle, group: "Daily" },
      { id: "portfolio", label: "Clients", icon: Users, group: "Clients" },
      // 2026-06-19: Install moved here from Strategy → Diagnose. Install
      // is a one-shot per engagement (the 16-Q Installation Instrument),
      // not a daily-flow strategist surface. It belongs with the other
      // client-management artifacts (Portfolio, Audits, Brand Context),
      // not in the Strategy nav where the strategist works daily.
      { id: "install", label: "Install", icon: ClipboardCheck, group: "Clients" },
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
      { id: "series-analysis", label: "Series Analysis", icon: Layers },
      { id: "channel-summary", label: "Channel Summary", icon: Sparkles },
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
      { id: "gap-detection", label: "Gap Detection", icon: Crosshair },
      { id: "comments", label: "Comments", icon: MessageSquare },
    ],
  },
  {
    id: "content-lab",
    label: "Content Lab",
    icon: FlaskConical,
    tabs: [
      { id: "ideation", label: "Ideation", icon: Lightbulb },
      { id: "intelligence", label: "Intelligence", icon: Brain },
      { id: "atomizer", label: "Atomizer", icon: Zap },
      // P0-rename 2026-06-08: was "Briefs" — collided with Strategy → Brief.
      // "Production Briefs" clarifies it's the per-video shoot brief, not
      // the weekly strategist brief.
      { id: "briefs", label: "Production Briefs", icon: FileText },
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
      { id: "strategic-state", label: "Strategic State", icon: Stethoscope, group: "Diagnose", recommended: true },
      // 2026-06-09: Audience workspace — synthesizes structured persona
      // from existing signals; lives on the Spine; inherited by every
      // downstream LLM artifact.
      { id: "audience", label: "Audience", icon: Users, group: "Diagnose" },
      { id: "repositioning", label: "Repositioning", icon: Target, group: "Diagnose" },
      { id: "cohort-roles", label: "Cohort", icon: Users2, group: "Diagnose" },
      { id: "competitor-scan", label: "Competitor Scan", icon: Radar, group: "Diagnose" },
      // ── Decide: produce the recommendations a client sees ──
      { id: "weekly-brief", label: "Brief", icon: ScrollText, group: "Decide" },
      { id: "pre-flight", label: "Pre-flight", icon: Crosshair, group: "Decide" },
      // ── Track: measure whether prior decisions worked ──
      { id: "calibration", label: "Calibration", icon: Gauge, group: "Track" },
      { id: "opportunities", label: "Opportunities", icon: Compass, group: "Track" },
      // P0-rename 2026-06-08: was "Feedback" — ambiguous what kind.
      { id: "actions", label: "Recent Uploads", icon: Activity, group: "Track" },
      { id: "calendar", label: "Calendar", icon: Calendar, group: "Track" },
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
      { id: "standardizer", label: "Data Standardizer", icon: Table },
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
