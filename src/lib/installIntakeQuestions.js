/**
 * Crux Installation Instrument — Part 1 question registry.
 *
 * Single source of truth for the 16 intake questions. Imported by both
 * the strategist-facing install workspace and the public client
 * pre-work page so any wording change propagates atomically.
 *
 * Source doc: "The Crux Installation Instrument v1.4" — INTERNAL.
 * Per the doc: questions are split into client pre-work (factual, can
 * be answered async) and strategist-led discovery (high-judgment,
 * needs conversational dynamics).
 *
 * Split rationale documented per-question. The doc's prohibition —
 * "the client never answers a strategy question" — is preserved by
 * keeping every judgment-shaped question on the strategist side.
 *
 * Each entry:
 *   key:              stable database key (q1_outcome, q9_veto_map, …)
 *                     migration 105's client_install_intake.question_key
 *                     uses these — don't change post-launch without
 *                     a follow-up migration
 *   number:           display order
 *   section:          A–E grouping
 *   text:             the question (client-facing wording when client_facing=true)
 *   strategistText:   alternative wording the strategist hears during
 *                     discovery — preserves the doc's conversational
 *                     framing (e.g. Q1's "do not offer options")
 *   guidance:         parenthetical strategist coaching from the doc
 *   clientFacing:     true → appears on the client pre-work page
 *   answerHint:       placeholder text shown in the form
 *   prePopulatable:   true → the strategist form pre-populates from
 *                     existing Spine/persona data (Pearl 27 already has
 *                     a synthesized persona, business context, etc.)
 */

export const INSTALL_INTAKE_VERSION = 'v1.4';

export const INTAKE_SECTIONS = {
  A: 'Outcome & accountability',
  B: 'Budget & risk posture',
  C: 'Brand constraints',
  D: 'Talent & source material',
  E: 'History & expectations',
};

export const INTAKE_QUESTIONS = [
  // ── Section A: Outcome & accountability ──
  {
    key: 'q1_outcome_12mo',
    number: 1,
    section: 'A',
    text: "Twelve months from now, what business outcome makes this channel an unqualified win?",
    guidance: "Open answer — do not offer options. Their first sentence reveals whether they think in audience or revenue terms.",
    clientFacing: false,  // First-sentence reveal is lost in a form
    answerHint: "Open answer — capture the first sentence verbatim",
    prePopulatable: false,
  },
  {
    key: 'q2_judge_and_metric',
    number: 2,
    section: 'A',
    text: "Who inside your organization judges that outcome, and what single number do they look at today?",
    guidance: "Follow-up if they can't name one: 'List every metric your stakeholders look at — we'll identify the one that pays the bill.' Institutional clients often answer with ten KPIs or 'we'll know it when we see it'; the follow-up converts that into raw material for Gate 0 instead of a dead end.",
    clientFacing: false,  // Needs follow-up dynamic
    answerHint: "Name (role) + the one number",
    prePopulatable: false,
  },
  {
    key: 'q3_hard_date',
    number: 3,
    section: 'A',
    text: "Is there a hard date this must work by (launch, season, fiscal event), or is this a steady build?",
    guidance: "Drives Layer 2 allocation — hard dates push toward 80/15/5 reliability allocation.",
    clientFacing: true,
    answerHint: "Hard date (with the date), steady build, or both",
    prePopulatable: false,
  },

  // ── Section B: Budget & risk posture ──
  {
    key: 'q4_monthly_budget',
    number: 4,
    section: 'B',
    text: "What is the monthly content budget (production + any media spend), and how firm is that number quarter to quarter?",
    guidance: "Drives Layer 2 ticket-class definitions in dollars.",
    clientFacing: true,
    answerHint: "$ per month + firmness (locked, flexible ±X%, etc.)",
    prePopulatable: false,
  },
  {
    key: 'q5_reserve_comfort',
    number: 5,
    section: 'B',
    text: "We hold 10–15% of budget in reserve — unscheduled, deployed only when a video breaks out. Are you comfortable with budget that isn't pre-assigned to deliverables?",
    guidance: "A 'no' here is a real answer — it means the Breakout Protocol needs a pre-approved playbook instead of a discretionary reserve.",
    clientFacing: false,  // Yes/no but real conversation behind it
    answerHint: "Yes / No, and the real reason if no",
    prePopulatable: false,
  },
  {
    key: 'q6_worst_public_outcome',
    number: 6,
    section: 'B',
    text: "Roughly 10% of what we make is experimental and some of it will miss. What is the worst public outcome you could tolerate from an experiment?",
    guidance: "Calibrates the 10% bucket. 'A video that gets low views' vs. 'nothing that could embarrass the CEO' are very different ceilings.",
    clientFacing: false,  // Calibration conversation
    answerHint: "The ceiling — describe the worst tolerable outcome",
    prePopulatable: false,
  },

  // ── Section C: Brand constraints ──
  {
    key: 'q7_off_limits',
    number: 7,
    section: 'C',
    text: "What topics, tones, or formats are categorically off-limits — including anything previously tried and killed, and why?",
    guidance: "Seeds the Spine's Guardrails section. Needs probing for unstated constraints.",
    clientFacing: false,  // Needs probing for unstated
    answerHint: "List + why for each",
    prePopulatable: true,  // Spine.guardrails often has the explicit ones
  },
  {
    key: 'q8_approval_workflow',
    number: 8,
    section: 'C',
    text: "Walk us through approval: who signs off on a video, and what is the realistic clock time from 'ready' to 'approved'?",
    guidance: "Gates the entire Breakout Protocol. If approval takes two weeks, the 72-hour reserve deploy requires pre-approved templates negotiated at install — find out now, not during the first breakout.",
    clientFacing: false,  // Needs walking through, not bullet-listed
    answerHint: "Each approver in sequence + clock time per stage",
    prePopulatable: false,
  },
  {
    key: 'q9_veto_map',
    number: 9,
    section: 'C',
    text: "Separate from who judges success (Q2) and who approves a video (Q8): who can STOP a video from publishing — for any reason? Legal, comms, IR, brand, executive sponsor, anyone.",
    guidance: "Three distinct sets: Q2 = judges, Q8 = approvers, Q9 = veto holders. Institutional clients try to give one name for all three — don't let them. The veto map, not Q8's happy-path approval clock, determines whether the 72-hour reserve deploy is operationally real. Every name added either gets a pre-clearance role in breakout templates or becomes a documented latency risk.",
    clientFacing: false,  // TRUST required — clients won't write the real list
    answerHint: "Every name + their domain (legal / comms / brand / etc.)",
    prePopulatable: false,
  },
  {
    key: 'q10_legal_compliance',
    number: 10,
    section: 'C',
    text: "Any legal or compliance constraints we must design around — claims substantiation, music licensing, talent releases, regulated-industry rules?",
    guidance: "Hard constraints. Goes into the Guardrails section.",
    clientFacing: true,
    answerHint: "List each constraint with source (regulation / policy / contract)",
    prePopulatable: true,  // Spine.guardrails often touches these
  },

  // ── Section D: Talent & source material ──
  {
    key: 'q11_on_camera',
    number: 11,
    section: 'D',
    text: "Who can be on camera, how often realistically, and how do they feel about it?",
    guidance: "Appetite matters more than availability — a reluctant founder reads on camera.",
    clientFacing: true,  // Availability fact, BUT strategist probes appetite in conversation
    answerHint: "Each person: name, role, available cadence, willingness",
    prePopulatable: false,
  },
  {
    key: 'q12_existing_ip',
    number: 12,
    section: 'D',
    text: "What existing content, footage, archives, or IP do we have rights to adapt or curate?",
    guidance: "Feeds the source-model decision: originate / adapt / curate. Rich archive + thin budget = adapt-primary.",
    clientFacing: true,
    answerHint: "Inventory: type, volume, rights status",
    prePopulatable: false,
  },
  {
    key: 'q13_in_house_capability',
    number: 13,
    section: 'D',
    text: "What production capability exists in-house, and what should Crux assume it's carrying?",
    guidance: "Defines the production scope Crux is owning.",
    clientFacing: true,
    answerHint: "What's in-house: editing, motion graphics, audio, etc. What Crux owns",
    prePopulatable: false,
  },

  // ── Section E: History & expectations ──
  {
    key: 'q14_past_attempts',
    number: 14,
    section: 'E',
    text: "What has been tried on YouTube (or video generally) before — what worked, what failed, and what does your team believe about why?",
    guidance: "Their theory of past failure is data, even when it's wrong.",
    clientFacing: true,
    answerHint: "Past attempts: what / outcome / their explanation",
    prePopulatable: false,
  },
  {
    key: 'q15_audience_assets',
    number: 15,
    section: 'E',
    text: "What audience assets exist outside YouTube — email list, social followings, communities, partnerships — that we can borrow momentum from?",
    guidance: "Available cold-start fuel.",
    clientFacing: true,
    answerHint: "Each asset: type, size, engagement level, access to it",
    prePopulatable: true,  // business_context sometimes has hints
  },
  {
    key: 'q16_fire_trigger',
    number: 16,
    section: 'E',
    text: "Be blunt: what would make you fire us at month six?",
    guidance: "Captures the real scorecard, which is sometimes different from the answer to Q1. Clients soften this in writing — strategist must ask verbally.",
    clientFacing: false,  // Only honest in conversation
    answerHint: "The real fire-trigger, in their words",
    prePopulatable: false,
  },
];

export const CLIENT_FACING_QUESTIONS = INTAKE_QUESTIONS.filter(q => q.clientFacing);
export const STRATEGIST_QUESTIONS    = INTAKE_QUESTIONS;  // Strategist sees ALL questions; client-pre-work answers pre-populate the client-facing ones

export function getQuestionByKey(key) {
  return INTAKE_QUESTIONS.find(q => q.key === key) || null;
}

export function questionsBySection(questions = INTAKE_QUESTIONS) {
  const grouped = {};
  for (const q of questions) {
    if (!grouped[q.section]) grouped[q.section] = [];
    grouped[q.section].push(q);
  }
  return grouped;
}

export default {
  INSTALL_INTAKE_VERSION,
  INTAKE_SECTIONS,
  INTAKE_QUESTIONS,
  CLIENT_FACING_QUESTIONS,
  STRATEGIST_QUESTIONS,
  getQuestionByKey,
  questionsBySection,
};
