/**
 * Content Type Palettes — single source of truth for Atomizer beat vocabularies,
 * completeness criteria, scoring weights, and short-form strategy per content type.
 *
 * To add a new content type: add an entry here and update the CHECK constraint
 * in the channels.atomizer_content_type migration.
 */

export const PALETTES = {
  faith: {
    label: 'Faith / Sermon',
    beats: ['hook', 'story', 'scripture', 'doctrine', 'application', 'testimony', 'transition', 'invitation', 'humor', 'context'],
    completeness: {
      required: ['story', 'application'],
      either: [['scripture', 'doctrine'], ['testimony']],
      label: 'well-grounded',
    },
    weights: {
      story: 1.5, testimony: 1.2, application: 1.3, scripture: 1.0,
      doctrine: 1.0, humor: 0.8, invitation: 0.7,
    },
    shortFormStrategy: {
      hook_seconds: 3,
      payoff_seconds: 45,
      max_threads: 1,
      ideal_roles: ['hybrid', 'content'],
      priority: 'Isolate a single testimony or story beat that stands alone emotionally.',
    },
    arcShapes: ['mountain', 'late_peak'],
  },

  brand: {
    label: 'Brand / Marketing',
    beats: ['pattern_interrupt', 'problem', 'solution', 'proof', 'offer', 'cta', 'transition', 'humor'],
    completeness: {
      required: ['problem', 'solution', 'proof'],
      label: 'complete argument',
    },
    weights: {
      proof: 1.5, problem: 1.3, solution: 1.3, pattern_interrupt: 1.2,
      cta: 0.8, offer: 1.0, humor: 0.7,
    },
    shortFormStrategy: {
      hook_seconds: 2,
      payoff_seconds: 20,
      max_threads: 1,
      ideal_roles: ['content'],
      priority: 'Isolate a single proof point or pattern interrupt that creates "wait, really?" reaction.',
    },
    arcShapes: ['mountain', 'rising'],
  },

  thought_leadership: {
    label: 'Thought Leadership',
    beats: ['provocative_opening', 'thesis', 'evidence', 'counterargument', 'synthesis', 'invitation', 'transition'],
    completeness: {
      required: ['thesis', 'evidence', 'synthesis'],
      label: 'rigorous',
    },
    weights: {
      thesis: 1.5, evidence: 1.3, counterargument: 1.4, synthesis: 1.2,
      provocative_opening: 1.1, invitation: 0.7,
    },
    shortFormStrategy: {
      hook_seconds: 3,
      payoff_seconds: 30,
      max_threads: 1,
      ideal_roles: ['content', 'hybrid'],
      priority: 'Isolate a single counterintuitive claim with its most compelling evidence.',
    },
    arcShapes: ['mountain', 'double_peak'],
  },

  documentary: {
    label: 'Documentary / Narrative',
    beats: ['cold_open', 'context', 'inciting_incident', 'rising_action', 'climax', 'resolution', 'epilogue', 'transition'],
    completeness: {
      required: ['context', 'rising_action', 'resolution'],
      label: 'complete narrative',
    },
    weights: {
      climax: 2.0, inciting_incident: 1.5, rising_action: 1.3,
      cold_open: 1.2, resolution: 1.0, context: 0.8,
    },
    shortFormStrategy: {
      hook_seconds: 2,
      payoff_seconds: 30,
      max_threads: 1,
      ideal_roles: ['content'],
      priority: 'Isolate a single dramatic moment — the inciting incident or climax — with minimal setup.',
    },
    arcShapes: ['mountain', 'late_peak'],
  },

  entertainment: {
    label: 'Entertainment / Personality',
    beats: ['cold_open', 'setup', 'escalation', 'payoff', 'callback', 'reaction', 'stakes_raise', 'reveal', 'cliffhanger', 'transition', 'humor'],
    completeness: {
      required: ['setup', 'payoff'],
      label: 'complete bit',
    },
    weights: {
      payoff: 2.0, escalation: 1.5, reaction: 1.3, callback: 1.2,
      stakes_raise: 1.4, reveal: 1.5, cliffhanger: 1.0,
      cold_open: 1.1, humor: 1.0,
    },
    shortFormStrategy: {
      hook_seconds: 1.5,
      payoff_seconds: 15,
      max_threads: 1,
      ideal_roles: ['content'],
      priority: 'Isolate a single payoff or reaction moment. The clip should feel like you walked into the room at exactly the right second.',
    },
    arcShapes: ['escalation_ladder', 'double_peak'],
  },

  kids: {
    label: 'Made for Kids',
    beats: ['greeting', 'setup', 'activity', 'song', 'surprise', 'lesson', 'repetition', 'callback', 'farewell', 'transition'],
    completeness: {
      required: ['activity', 'lesson'],
      either: [['song', 'surprise']],
      label: 'engaging',
    },
    weights: {
      song: 1.5, surprise: 1.4, activity: 1.3, repetition: 1.2,
      lesson: 1.0, greeting: 0.6, farewell: 0.5,
    },
    shortFormStrategy: {
      hook_seconds: 1,
      payoff_seconds: 15,
      max_threads: 1,
      ideal_roles: ['content', 'hybrid'],
      priority: 'Isolate a song hook, surprise moment, or sensory activity. Must work with sound OFF and captions.',
    },
    arcShapes: ['repetition_loop', 'mountain'],
  },

  tutorial: {
    label: 'Tutorial / How-To',
    beats: ['hook', 'overview', 'step', 'demo', 'troubleshoot', 'pro_tip', 'recap', 'cta', 'transition'],
    completeness: {
      required: ['hook', 'step', 'recap'],
      label: 'actionable',
    },
    weights: {
      pro_tip: 1.5, demo: 1.3, step: 1.2, troubleshoot: 1.4,
      hook: 1.1, recap: 0.8, cta: 0.6,
    },
    shortFormStrategy: {
      hook_seconds: 2,
      payoff_seconds: 25,
      max_threads: 1,
      ideal_roles: ['content'],
      priority: 'Isolate a single pro tip or before/after demo. The viewer should learn one useful thing in under 30 seconds.',
    },
    arcShapes: ['rising', 'mountain'],
  },

  interview: {
    label: 'Interview / Podcast',
    beats: ['intro', 'question', 'answer', 'follow_up', 'tangent', 'revelation', 'debate', 'closing', 'transition'],
    completeness: {
      required: ['question', 'answer'],
      either: [['revelation', 'follow_up']],
      label: 'insightful',
    },
    weights: {
      revelation: 2.0, debate: 1.5, follow_up: 1.3, answer: 1.2,
      tangent: 0.8, question: 0.7, closing: 0.5,
    },
    shortFormStrategy: {
      hook_seconds: 2,
      payoff_seconds: 30,
      max_threads: 1,
      ideal_roles: ['content', 'hybrid'],
      priority: 'Isolate a single revelation or heated exchange. The clip should feel like eavesdropping on the best 30 seconds of a 2-hour conversation.',
    },
    arcShapes: ['double_peak', 'late_peak'],
  },
};

export const CONTENT_TYPES = Object.keys(PALETTES);

export function getPalette(type) {
  return PALETTES[type] || PALETTES.faith;
}

export function getBeats(type) {
  return getPalette(type).beats;
}

export function getCompleteness(type) {
  return getPalette(type).completeness;
}

export function getWeights(type) {
  return getPalette(type).weights;
}

export function getShortFormStrategy(type) {
  return getPalette(type).shortFormStrategy;
}

/**
 * Build the vocabulary section for the SEGMENT_BEATS_PROMPT.
 * Returns a formatted string listing all content types and their beat palettes.
 */
export function buildVocabularyBlock() {
  return CONTENT_TYPES.map(type => {
    const p = PALETTES[type];
    return `- ${type}: ${p.beats.join(', ')}`;
  }).join('\n');
}

/**
 * Build completeness criteria block for the ANALYZE_THREADS_PROMPT.
 */
export function buildCompletenessBlock() {
  return CONTENT_TYPES.map(type => {
    const c = PALETTES[type].completeness;
    const parts = [`required: [${c.required.join(', ')}]`];
    if (c.either) parts.push(`either one of: ${c.either.map(g => `[${g.join(' or ')}]`).join(', ')}`);
    parts.push(`label: "${c.label}"`);
    return `- ${type}: ${parts.join('; ')}`;
  }).join('\n');
}
