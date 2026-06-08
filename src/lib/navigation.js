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
  BarChart3, Search, FlaskConical, Map, Briefcase, Settings,
} from "lucide-react";

/** Main sections shown in the top nav bar */
export const MAIN_SECTIONS = [
  {
    id: "operate",
    label: "Operate",
    icon: Briefcase,
    tabs: [
      // P1 #8 (2026-06-08): cross-client alerts feed — "what should I do
      // right now?". First tab so it's the strategist's natural landing.
      { id: "this-week", label: "This Week", icon: AlertCircle, recommended: true },
      { id: "portfolio", label: "Clients", icon: Users },
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
    tabs: [
      // P0 2026-06-08: Brief is marked recommended — first tab a strategist
      // opens in Strategy section. TopNav surfaces a small dot indicator.
      { id: "weekly-brief", label: "Brief", icon: ScrollText, recommended: true },
      { id: "opportunities", label: "Opportunities", icon: Compass },
      { id: "pre-flight", label: "Pre-flight", icon: Crosshair },
      { id: "repositioning", label: "Repositioning", icon: Target },
      { id: "competitor-scan", label: "Competitor Scan", icon: Radar },
      { id: "calibration", label: "Calibration", icon: Gauge },
      { id: "cohort-roles", label: "Cohort", icon: Users2 },
      // P0-rename 2026-06-08: was "Feedback" — ambiguous what kind.
      // "Recent Uploads" names what this tab actually shows.
      { id: "actions", label: "Recent Uploads", icon: Activity },
      { id: "calendar", label: "Calendar", icon: Calendar },
    ],
  },
];

/** Utility sections behind the gear icon */
export const UTILITY_SECTIONS = [
  {
    id: "onboarding",
    label: "Onboarding",
    icon: Briefcase,
    tabs: [
      { id: "audits", label: "Audits", icon: ClipboardCheck },
      { id: "brand-context", label: "Brand Context", icon: Palette },
    ],
  },
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
