/**
 * CreativeBrief Component - Stage 1: Prep/Staging
 * Full View Analytics - YouTube Shorts Ideation Pipeline
 */

import { useState, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  FileText,
  Target,
  Users,
  MessageSquare,
  Calendar,
  Loader2,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Image,
  TrendingUp,
  Zap,
  Copy,
  RefreshCw
} from 'lucide-react';
import { createBrief, createTranscript, validateBriefForGeneration, PERFORMANCE_LEVELS } from '../lib/briefSchema';
import claudeAPI from '../services/claudeAPI';

// Styles matching existing dashboard theme
const s = {
  container: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto'
  },
  header: {
    marginBottom: '24px'
  },
  title: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#E0E0E0',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  subtitle: {
    fontSize: '14px',
    color: '#9E9E9E'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px'
  },
  card: {
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    borderRadius: '12px',
    padding: '24px'
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#E0E0E0',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  label: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#9E9E9E',
    marginBottom: '6px',
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  input: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#252525',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#E0E0E0',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  textarea: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#252525',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#E0E0E0',
    fontSize: '14px',
    outline: 'none',
    resize: 'vertical',
    minHeight: '100px',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  },
  inputGroup: {
    marginBottom: '16px'
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: '#2962FF',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  buttonSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: 'transparent',
    color: '#9E9E9E',
    border: '1px solid #333',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  buttonSmall: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    backgroundColor: '#252525',
    color: '#9E9E9E',
    border: '1px solid #333',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer'
  },
  buttonDanger: {
    backgroundColor: 'transparent',
    color: '#CF6679',
    border: '1px solid #CF6679'
  },
  transcriptItem: {
    backgroundColor: '#252525',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px'
  },
  transcriptHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  transcriptSource: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#E0E0E0'
  },
  transcriptText: {
    fontSize: '13px',
    color: '#9E9E9E',
    lineHeight: '1.5',
    maxHeight: '80px',
    overflow: 'hidden'
  },
  ideaCard: {
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px'
  },
  ideaHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px'
  },
  ideaNumber: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#2962FF',
    backgroundColor: 'rgba(41, 98, 255, 0.15)',
    padding: '4px 8px',
    borderRadius: '4px',
    marginBottom: '8px'
  },
  ideaTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#E0E0E0',
    marginBottom: '8px'
  },
  ideaHook: {
    backgroundColor: '#252525',
    borderLeft: '3px solid #2962FF',
    padding: '12px',
    borderRadius: '0 8px 8px 0',
    marginBottom: '16px'
  },
  ideaHookLabel: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#2962FF',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '6px'
  },
  ideaHookText: {
    fontSize: '14px',
    color: '#E0E0E0',
    fontStyle: 'italic',
    lineHeight: '1.5'
  },
  ideaSection: {
    marginBottom: '16px'
  },
  ideaSectionTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px'
  },
  ideaSectionText: {
    fontSize: '14px',
    color: '#E0E0E0',
    lineHeight: '1.6'
  },
  thumbnailGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  thumbnailItem: {
    backgroundColor: '#252525',
    padding: '10px',
    borderRadius: '6px'
  },
  thumbnailLabel: {
    fontSize: '10px',
    fontWeight: '600',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    marginBottom: '4px'
  },
  thumbnailValue: {
    fontSize: '13px',
    color: '#E0E0E0'
  },
  performanceRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap'
  },
  performanceBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '500'
  },
  error: {
    backgroundColor: 'rgba(207, 102, 121, 0.15)',
    border: '1px solid #CF6679',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px'
  },
  errorText: {
    fontSize: '13px',
    color: '#CF6679'
  },
  success: {
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
    border: '1px solid #00C853',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  successText: {
    fontSize: '13px',
    color: '#00C853'
  },
  loadingOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(18, 18, 18, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  loadingCard: {
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center',
    maxWidth: '400px'
  },
  spinner: {
    animation: 'spin 1s linear infinite'
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px 24px',
    color: '#9E9E9E'
  },
  ideasContainer: {
    marginTop: '24px'
  },
  ideasHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  fullWidth: {
    gridColumn: '1 / -1'
  }
};

// Add keyframes for spinner
const spinKeyframes = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

export default function CreativeBrief({ activeClient }) {
  // Form state
  const [brief, setBrief] = useState(() =>
    createBrief(activeClient?.id || '', activeClient?.name || '')
  );
  const [newTranscriptSource, setNewTranscriptSource] = useState('');
  const [newTranscriptText, setNewTranscriptText] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [expandedIdeas, setExpandedIdeas] = useState({});

  // Update brief when client changes
  useMemo(() => {
    if (activeClient && activeClient.id !== brief.client.id) {
      setBrief(createBrief(activeClient.id, activeClient.name));
    }
  }, [activeClient?.id]);

  // Handle adding transcript
  const handleAddTranscript = () => {
    if (!newTranscriptText.trim()) return;

    const transcript = createTranscript(
      newTranscriptSource || 'Untitled Source',
      newTranscriptText
    );

    setBrief(prev => ({
      ...prev,
      transcripts: [...prev.transcripts, transcript],
      updatedAt: new Date().toISOString()
    }));

    setNewTranscriptSource('');
    setNewTranscriptText('');
  };

  // Handle removing transcript
  const handleRemoveTranscript = (transcriptId) => {
    setBrief(prev => ({
      ...prev,
      transcripts: prev.transcripts.filter(t => t.id !== transcriptId),
      updatedAt: new Date().toISOString()
    }));
  };

  // Handle strategic context updates
  const handleContextChange = (field, value) => {
    setBrief(prev => ({
      ...prev,
      strategicContext: {
        ...prev.strategicContext,
        [field]: value
      },
      updatedAt: new Date().toISOString()
    }));
  };

  // Build the prompt for Claude
  const buildPrompt = () => {
    const transcriptText = brief.transcripts
      .map((t, i) => `--- Transcript ${i + 1}: ${t.source} ---\n${t.text}`)
      .join('\n\n');

    return `You are a YouTube Shorts content strategist for Crux Media, a YouTube growth agency.
Your task is to generate 5 creative short-form video ideas based on the provided transcripts and strategic context.

CLIENT: ${brief.client.name}
TARGET PUBLISH DATE: ${brief.targetPublishDate || 'Flexible'}

STRATEGIC CONTEXT:
- Business Goal: ${brief.strategicContext.goal}
- Target Audience: ${brief.strategicContext.audience}
- Core Message: ${brief.strategicContext.message}
${brief.strategicContext.tone ? `- Desired Tone: ${brief.strategicContext.tone}` : ''}
${brief.strategicContext.cta ? `- Call to Action: ${brief.strategicContext.cta}` : ''}

SOURCE TRANSCRIPTS:
${transcriptText}

Generate exactly 5 short-form video ideas. For each idea, provide:

1. **Title**: A compelling, click-worthy title (max 60 chars)
2. **Hook**: The exact script for the first 3 seconds that will stop scrollers
3. **Description**: A 2-3 sentence description of the full video concept
4. **Duration**: Recommended length (15s, 30s, 45s, or 60s)
5. **Thumbnail Concept**:
   - Visual Focus: What's the main image/scene
   - Text Overlay: What text appears on thumbnail (max 4 words)
   - Color Scheme: Primary colors to use
   - Emotion: What emotion should the viewer feel
6. **Strategic Rationale**: Why this idea aligns with the client's goals
7. **Target Audience**: Which segment of the audience this targets
8. **Estimated Performance**:
   - CTR Potential: low/medium/high
   - Viral Potential: low/medium/high
   - Engagement Potential: low/medium/high
   - Reasoning: Brief explanation of performance estimate

Respond with valid JSON in this exact format:
{
  "ideas": [
    {
      "title": "...",
      "hook": "...",
      "description": "...",
      "duration": "...",
      "thumbnailConcept": {
        "visualFocus": "...",
        "textOverlay": "...",
        "colorScheme": "...",
        "emotion": "..."
      },
      "strategicRationale": "...",
      "targetAudience": "...",
      "estimatedPerformance": {
        "ctrPotential": "high|medium|low",
        "viralPotential": "high|medium|low",
        "engagementPotential": "high|medium|low",
        "reasoning": "..."
      }
    }
  ]
}

Focus on:
- Ideas that can be extracted from the transcript content
- Hooks that create curiosity or pattern interrupts
- Concepts optimized for YouTube Shorts algorithm
- Alignment with the strategic goals provided`;
  };

  // Generate ideas via Claude API
  const handleGenerate = async () => {
    // Validate
    const validation = validateBriefForGeneration(brief);
    if (!validation.valid) {
      setError(validation.errors.join('. '));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const prompt = buildPrompt();
      const systemPrompt = 'You are an expert YouTube content strategist. Always respond with valid JSON only, no additional text or markdown.';

      const response = await claudeAPI.call(prompt, systemPrompt, 'creative_brief', 4096);

      // Parse JSON from response
      let ideas;
      try {
        // Try to extract JSON from the response
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          ideas = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.log('Raw response:', response.text);
        throw new Error('Failed to parse AI response. Please try again.');
      }

      // Update brief with generated ideas
      setBrief(prev => ({
        ...prev,
        status: 'generated',
        generatedIdeas: ideas.ideas.map((idea, idx) => ({
          ideaId: `idea_${Date.now()}_${idx}`,
          createdAt: new Date().toISOString(),
          ...idea,
          feedback: { status: 'pending', notes: '', rating: null }
        })),
        generation: {
          generatedAt: new Date().toISOString(),
          modelUsed: 'claude-sonnet-4-5-20250929',
          tokensUsed: response.usage,
          cost: response.cost
        },
        updatedAt: new Date().toISOString()
      }));

      setSuccess(`Generated ${ideas.ideas.length} ideas! Cost: $${response.cost.toFixed(4)}`);

      // Save to localStorage
      saveBriefToStorage(brief);

    } catch (err) {
      console.error('Generation error:', err);
      setError(err.message || 'Failed to generate ideas. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Save brief to localStorage (will upgrade to JSON file/DB later)
  const saveBriefToStorage = (briefData) => {
    try {
      const existingBriefs = JSON.parse(localStorage.getItem('creative_briefs') || '[]');
      const updatedBriefs = existingBriefs.filter(b => b.briefId !== briefData.briefId);
      updatedBriefs.push(briefData);
      localStorage.setItem('creative_briefs', JSON.stringify(updatedBriefs));
    } catch (err) {
      console.error('Failed to save brief:', err);
    }
  };

  // Toggle idea expansion
  const toggleIdea = (ideaId) => {
    setExpandedIdeas(prev => ({
      ...prev,
      [ideaId]: !prev[ideaId]
    }));
  };

  // Copy idea to clipboard
  const copyIdea = (idea) => {
    const text = `
TITLE: ${idea.title}
HOOK: ${idea.hook}
DESCRIPTION: ${idea.description}
DURATION: ${idea.duration}

THUMBNAIL:
- Visual: ${idea.thumbnailConcept?.visualFocus}
- Text: ${idea.thumbnailConcept?.textOverlay}
- Colors: ${idea.thumbnailConcept?.colorScheme}

RATIONALE: ${idea.strategicRationale}
    `.trim();

    navigator.clipboard.writeText(text);
    setSuccess('Copied idea to clipboard!');
    setTimeout(() => setSuccess(null), 2000);
  };

  // Get performance badge color
  const getPerformanceColor = (level) => {
    return PERFORMANCE_LEVELS[level]?.color || '#9E9E9E';
  };

  // Render performance badge
  const PerformanceBadge = ({ label, level }) => (
    <span style={{
      ...s.performanceBadge,
      backgroundColor: `${getPerformanceColor(level)}20`,
      color: getPerformanceColor(level)
    }}>
      {label}: {level}
    </span>
  );

  return (
    <div style={s.container}>
      {/* Inject keyframes */}
      <style>{spinKeyframes}</style>

      {/* Loading Overlay */}
      {loading && (
        <div style={s.loadingOverlay}>
          <div style={s.loadingCard}>
            <Loader2 size={48} color="#2962FF" style={s.spinner} />
            <p style={{ color: '#E0E0E0', marginTop: '16px', fontSize: '16px' }}>
              Generating creative ideas...
            </p>
            <p style={{ color: '#9E9E9E', marginTop: '8px', fontSize: '13px' }}>
              This may take 10-15 seconds
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>
          <Sparkles size={24} color="#2962FF" />
          Creative Brief & Shorts Ideation
        </h1>
        <p style={s.subtitle}>
          Stage 1: Prep/Staging — Transform long-form content into short-form gold
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div style={s.error}>
          <AlertCircle size={18} color="#CF6679" />
          <span style={s.errorText}>{error}</span>
        </div>
      )}

      {/* Success Display */}
      {success && (
        <div style={s.success}>
          <CheckCircle size={18} color="#00C853" />
          <span style={s.successText}>{success}</span>
        </div>
      )}

      {/* Main Grid */}
      <div style={s.grid}>
        {/* Left Column: Inputs */}
        <div>
          {/* Client & Date Card */}
          <div style={s.card}>
            <h2 style={s.cardTitle}>
              <Target size={18} />
              Project Details
            </h2>

            <div style={s.inputGroup}>
              <label style={s.label}>Client</label>
              <input
                type="text"
                style={s.input}
                value={brief.client.name}
                onChange={(e) => setBrief(prev => ({
                  ...prev,
                  client: { ...prev.client, name: e.target.value }
                }))}
                placeholder="Enter client name"
              />
            </div>

            <div style={s.inputGroup}>
              <label style={s.label}>Target Publish Date</label>
              <input
                type="date"
                style={s.input}
                value={brief.targetPublishDate || ''}
                onChange={(e) => setBrief(prev => ({
                  ...prev,
                  targetPublishDate: e.target.value
                }))}
              />
            </div>
          </div>

          {/* Strategic Context Card */}
          <div style={{ ...s.card, marginTop: '16px' }}>
            <h2 style={s.cardTitle}>
              <MessageSquare size={18} />
              Strategic Context
            </h2>

            <div style={s.inputGroup}>
              <label style={s.label}>Business Goal *</label>
              <input
                type="text"
                style={s.input}
                value={brief.strategicContext.goal}
                onChange={(e) => handleContextChange('goal', e.target.value)}
                placeholder="e.g., Drive newsletter signups, Build brand awareness"
              />
            </div>

            <div style={s.inputGroup}>
              <label style={s.label}>Target Audience *</label>
              <input
                type="text"
                style={s.input}
                value={brief.strategicContext.audience}
                onChange={(e) => handleContextChange('audience', e.target.value)}
                placeholder="e.g., B2B SaaS founders, Ages 25-40"
              />
            </div>

            <div style={s.inputGroup}>
              <label style={s.label}>Core Message</label>
              <textarea
                style={s.textarea}
                value={brief.strategicContext.message}
                onChange={(e) => handleContextChange('message', e.target.value)}
                placeholder="What's the key takeaway viewers should remember?"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={s.inputGroup}>
                <label style={s.label}>Tone/Style</label>
                <input
                  type="text"
                  style={s.input}
                  value={brief.strategicContext.tone}
                  onChange={(e) => handleContextChange('tone', e.target.value)}
                  placeholder="e.g., Professional, Energetic"
                />
              </div>

              <div style={s.inputGroup}>
                <label style={s.label}>Call to Action</label>
                <input
                  type="text"
                  style={s.input}
                  value={brief.strategicContext.cta}
                  onChange={(e) => handleContextChange('cta', e.target.value)}
                  placeholder="e.g., Subscribe, Visit link"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Transcripts */}
        <div>
          <div style={s.card}>
            <h2 style={s.cardTitle}>
              <FileText size={18} />
              Source Transcripts
            </h2>

            {/* Existing Transcripts */}
            {brief.transcripts.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                {brief.transcripts.map((transcript) => (
                  <div key={transcript.id} style={s.transcriptItem}>
                    <div style={s.transcriptHeader}>
                      <span style={s.transcriptSource}>{transcript.source}</span>
                      <button
                        style={{ ...s.buttonSmall, ...s.buttonDanger }}
                        onClick={() => handleRemoveTranscript(transcript.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p style={s.transcriptText}>
                      {transcript.text.substring(0, 200)}
                      {transcript.text.length > 200 && '...'}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Add Transcript Form */}
            <div style={{ backgroundColor: '#252525', padding: '16px', borderRadius: '8px' }}>
              <div style={s.inputGroup}>
                <label style={s.label}>Source Name</label>
                <input
                  type="text"
                  style={s.input}
                  value={newTranscriptSource}
                  onChange={(e) => setNewTranscriptSource(e.target.value)}
                  placeholder="e.g., Episode 42, Client Interview"
                />
              </div>

              <div style={s.inputGroup}>
                <label style={s.label}>Transcript Text *</label>
                <textarea
                  style={{ ...s.textarea, minHeight: '150px' }}
                  value={newTranscriptText}
                  onChange={(e) => setNewTranscriptText(e.target.value)}
                  placeholder="Paste your video transcript here..."
                />
              </div>

              <button
                style={s.buttonSecondary}
                onClick={handleAddTranscript}
                disabled={!newTranscriptText.trim()}
              >
                <Plus size={16} />
                Add Transcript
              </button>
            </div>
          </div>
        </div>

        {/* Generate Button - Full Width */}
        <div style={s.fullWidth}>
          <button
            style={{
              ...s.button,
              width: '100%',
              justifyContent: 'center',
              padding: '16px',
              fontSize: '16px',
              opacity: loading ? 0.7 : 1
            }}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={20} style={s.spinner} />
                Generating Ideas...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                Generate 5 Short-Form Ideas
              </>
            )}
          </button>
        </div>

        {/* Generated Ideas - Full Width */}
        {brief.generatedIdeas.length > 0 && (
          <div style={{ ...s.fullWidth, ...s.ideasContainer }}>
            <div style={s.ideasHeader}>
              <h2 style={s.title}>
                <Zap size={20} color="#00C853" />
                Generated Ideas ({brief.generatedIdeas.length})
              </h2>
              <button
                style={s.buttonSecondary}
                onClick={handleGenerate}
                disabled={loading}
              >
                <RefreshCw size={16} />
                Regenerate
              </button>
            </div>

            {brief.generatedIdeas.map((idea, index) => (
              <div key={idea.ideaId} style={s.ideaCard}>
                <div style={s.ideaHeader}>
                  <div>
                    <span style={s.ideaNumber}>IDEA {index + 1}</span>
                    <h3 style={s.ideaTitle}>{idea.title}</h3>
                    <span style={{ fontSize: '12px', color: '#9E9E9E' }}>
                      {idea.duration}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      style={s.buttonSmall}
                      onClick={() => copyIdea(idea)}
                    >
                      <Copy size={14} />
                      Copy
                    </button>
                    <button
                      style={s.buttonSmall}
                      onClick={() => toggleIdea(idea.ideaId)}
                    >
                      {expandedIdeas[idea.ideaId] ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                      {expandedIdeas[idea.ideaId] ? 'Less' : 'More'}
                    </button>
                  </div>
                </div>

                {/* Hook - Always Visible */}
                <div style={s.ideaHook}>
                  <div style={s.ideaHookLabel}>🎬 First 3 Seconds</div>
                  <p style={s.ideaHookText}>"{idea.hook}"</p>
                </div>

                {/* Description */}
                <div style={s.ideaSection}>
                  <div style={s.ideaSectionTitle}>Description</div>
                  <p style={s.ideaSectionText}>{idea.description}</p>
                </div>

                {/* Performance Estimates */}
                <div style={s.performanceRow}>
                  <PerformanceBadge label="CTR" level={idea.estimatedPerformance?.ctrPotential} />
                  <PerformanceBadge label="Viral" level={idea.estimatedPerformance?.viralPotential} />
                  <PerformanceBadge label="Engagement" level={idea.estimatedPerformance?.engagementPotential} />
                </div>

                {/* Expanded Content */}
                {expandedIdeas[idea.ideaId] && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #333' }}>
                    {/* Thumbnail Concept */}
                    <div style={s.ideaSection}>
                      <div style={{ ...s.ideaSectionTitle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Image size={14} />
                        Thumbnail Concept
                      </div>
                      <div style={s.thumbnailGrid}>
                        <div style={s.thumbnailItem}>
                          <div style={s.thumbnailLabel}>Visual Focus</div>
                          <div style={s.thumbnailValue}>{idea.thumbnailConcept?.visualFocus}</div>
                        </div>
                        <div style={s.thumbnailItem}>
                          <div style={s.thumbnailLabel}>Text Overlay</div>
                          <div style={s.thumbnailValue}>{idea.thumbnailConcept?.textOverlay}</div>
                        </div>
                        <div style={s.thumbnailItem}>
                          <div style={s.thumbnailLabel}>Color Scheme</div>
                          <div style={s.thumbnailValue}>{idea.thumbnailConcept?.colorScheme}</div>
                        </div>
                        <div style={s.thumbnailItem}>
                          <div style={s.thumbnailLabel}>Emotion</div>
                          <div style={s.thumbnailValue}>{idea.thumbnailConcept?.emotion}</div>
                        </div>
                      </div>
                    </div>

                    {/* Strategic Rationale */}
                    <div style={s.ideaSection}>
                      <div style={{ ...s.ideaSectionTitle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Target size={14} />
                        Strategic Rationale
                      </div>
                      <p style={s.ideaSectionText}>{idea.strategicRationale}</p>
                    </div>

                    {/* Target Audience */}
                    <div style={s.ideaSection}>
                      <div style={{ ...s.ideaSectionTitle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Users size={14} />
                        Target Audience
                      </div>
                      <p style={s.ideaSectionText}>{idea.targetAudience}</p>
                    </div>

                    {/* Performance Reasoning */}
                    <div style={s.ideaSection}>
                      <div style={{ ...s.ideaSectionTitle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <TrendingUp size={14} />
                        Performance Reasoning
                      </div>
                      <p style={s.ideaSectionText}>{idea.estimatedPerformance?.reasoning}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {brief.generatedIdeas.length === 0 && !loading && (
          <div style={{ ...s.fullWidth, ...s.emptyState }}>
            <Sparkles size={48} color="#333" />
            <p style={{ marginTop: '16px', fontSize: '16px', color: '#9E9E9E' }}>
              Add transcripts and strategic context, then click "Generate" to create short-form ideas
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
