/**
 * Creative Brief Schema - Data structures for Shorts Ideation Pipeline
 * Stage 1: Prep/Staging - Brief inputs and generated ideas
 */

/**
 * Creates a new empty brief with default structure
 * @param {string} clientId - The client ID
 * @param {string} clientName - The client name
 * @returns {Object} New brief object
 */
export function createBrief(clientId, clientName) {
  return {
    briefId: `brief_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft', // draft | generated | reviewed | approved

    // Client info
    client: {
      id: clientId,
      name: clientName
    },

    // Publishing target
    targetPublishDate: null,

    // Input transcripts
    transcripts: [
      // { id: string, source: string, text: string }
    ],

    // Strategic context
    strategicContext: {
      goal: '',        // What's the business objective?
      audience: '',    // Who are we targeting?
      message: '',     // What's the core message?
      tone: '',        // What tone/style?
      cta: ''          // What action do we want viewers to take?
    },

    // Generated ideas (populated after Claude API call)
    generatedIdeas: [],

    // Generation metadata
    generation: {
      generatedAt: null,
      modelUsed: null,
      tokensUsed: null,
      cost: null
    }
  };
}

/**
 * Creates an idea object structure
 * @param {Object} ideaData - Raw idea data from Claude
 * @returns {Object} Formatted idea object
 */
export function createIdea(ideaData) {
  return {
    ideaId: `idea_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),

    // Core content
    title: ideaData.title || '',
    hook: ideaData.hook || '',           // First 3 seconds script
    description: ideaData.description || '',
    duration: ideaData.duration || '30-60s',

    // Visual concept
    thumbnailConcept: {
      visualFocus: ideaData.thumbnailConcept?.visualFocus || '',
      textOverlay: ideaData.thumbnailConcept?.textOverlay || '',
      colorScheme: ideaData.thumbnailConcept?.colorScheme || '',
      emotion: ideaData.thumbnailConcept?.emotion || ''
    },

    // Strategy alignment
    strategicRationale: ideaData.strategicRationale || '',
    targetAudience: ideaData.targetAudience || '',

    // Performance estimates
    estimatedPerformance: {
      ctrPotential: ideaData.estimatedPerformance?.ctrPotential || 'medium',
      viralPotential: ideaData.estimatedPerformance?.viralPotential || 'medium',
      engagementPotential: ideaData.estimatedPerformance?.engagementPotential || 'medium',
      reasoning: ideaData.estimatedPerformance?.reasoning || ''
    },

    // User feedback (for Stage 2)
    feedback: {
      status: 'pending',  // pending | approved | rejected | revised
      notes: '',
      rating: null        // 1-5
    }
  };
}

/**
 * Creates a transcript entry
 * @param {string} source - Where the transcript came from
 * @param {string} text - The transcript text
 * @returns {Object} Transcript object
 */
export function createTranscript(source, text) {
  return {
    id: `transcript_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    source: source,
    text: text,
    addedAt: new Date().toISOString()
  };
}

/**
 * Validates a brief has minimum required fields for generation
 * @param {Object} brief - The brief to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateBriefForGeneration(brief) {
  const errors = [];

  if (!brief.client?.name) {
    errors.push('Client name is required');
  }

  if (!brief.transcripts || brief.transcripts.length === 0) {
    errors.push('At least one transcript is required');
  }

  if (!brief.strategicContext?.goal) {
    errors.push('Strategic goal is required');
  }

  if (!brief.strategicContext?.audience) {
    errors.push('Target audience is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Brief status labels for UI
 */
export const BRIEF_STATUS_LABELS = {
  draft: 'Draft',
  generated: 'Ideas Generated',
  reviewed: 'Under Review',
  approved: 'Approved'
};

/**
 * Performance potential labels
 */
export const PERFORMANCE_LEVELS = {
  low: { label: 'Low', color: '#CF6679' },
  medium: { label: 'Medium', color: '#FFB74D' },
  high: { label: 'High', color: '#00C853' }
};

export default {
  createBrief,
  createIdea,
  createTranscript,
  validateBriefForGeneration,
  BRIEF_STATUS_LABELS,
  PERFORMANCE_LEVELS
};
