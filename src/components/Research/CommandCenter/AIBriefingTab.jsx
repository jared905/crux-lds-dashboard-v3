import { useState, useCallback } from 'react';
import { Brain, Loader, RefreshCw, DollarSign, Clock, Send } from 'lucide-react';

const fmtInt = (n) => (!n || isNaN(n)) ? '0' : Math.round(n).toLocaleString();

const QUICK_ACTIONS = [
  { label: 'Focus on threats', prompt: 'Focus more on the biggest competitive threats and what we should be most worried about.' },
  { label: 'More actionable', prompt: 'Make this more actionable with specific content ideas and tactical next steps.' },
  { label: 'Shorter', prompt: 'Make this more concise — keep only the highest-signal insights.' },
  { label: 'Audience focus', prompt: 'Focus more on what competitor activity tells us about our target audience.' },
];

/**
 * AIBriefingTab — On-demand Claude-powered competitive intelligence narrative.
 */
export default function AIBriefingTab({
  competitors, snapshots, outliers, recentVideos,
  activeClient, yourStats,
}) {
  const [briefing, setBriefing] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [cost, setCost] = useState(0);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [refinement, setRefinement] = useState('');
  const [refining, setRefining] = useState(false);

  // Build data summary for Claude prompt
  const buildDataContext = useCallback(() => {
    const lines = [];

    // Competitor summary
    lines.push('## Competitor Landscape');
    const sorted = [...competitors].sort((a, b) => (b.subscriber_count || 0) - (a.subscriber_count || 0));
    sorted.slice(0, 15).forEach((c, i) => {
      const snaps = snapshots[c.supabaseId] || [];
      let delta = '';
      if (snaps.length >= 2) {
        const d = (snaps[snaps.length - 1].subscriber_count || 0) - (snaps[0].subscriber_count || 0);
        delta = ` (30d: ${d > 0 ? '+' : ''}${fmtInt(d)} subs)`;
      }
      const vid = recentVideos[c.supabaseId];
      const vidInfo = vid ? ` | Latest: "${vid.title}" (${fmtInt(vid.view_count)} views)` : '';
      lines.push(`${i + 1}. ${c.name}: ${fmtInt(c.subscriber_count)} subs${delta}${vidInfo}`);
    });

    // Breakout videos
    if (outliers?.length > 0) {
      lines.push('\n## Breakout Videos (outlier performance)');
      outliers.slice(0, 10).forEach(v => {
        lines.push(`- "${v.title}" by ${v.channel?.name || '?'}: ${fmtInt(v.view_count)} views (${v.outlierScore}x channel avg)`);
      });
    }

    // Your position
    if (yourStats) {
      lines.push('\n## Our Channel');
      lines.push(`Subscribers: ${fmtInt(yourStats.subscribers || 0)}`);
      lines.push(`Position: #${sorted.findIndex(c => (c.subscriber_count || 0) <= (yourStats.subscribers || 0)) + 1 || sorted.length + 1} of ${sorted.length + 1}`);
    }

    return lines.join('\n');
  }, [competitors, snapshots, outliers, recentVideos, yourStats]);

  const generateBriefing = useCallback(async (refinementPrompt = null) => {
    if (refinementPrompt) {
      setRefining(true);
    } else {
      setGenerating(true);
    }

    try {
      const { claudeAPI } = await import('../../../services/claudeAPI');
      const { getBrandContextWithSignals } = await import('../../../services/brandContextService');

      const dataContext = buildDataContext();

      // Get brand context
      let brandBlock = '';
      if (activeClient?.youtube_channel_id) {
        try {
          brandBlock = await getBrandContextWithSignals(activeClient.youtube_channel_id, 'competitive_briefing') || '';
        } catch (e) {
          console.warn('[AIBriefing] Brand context failed:', e.message);
        }
      }

      const systemPrompt = `You are a senior competitive intelligence analyst for a YouTube channel strategy team.
Given competitive landscape data, produce a strategic briefing that helps the team understand what's happening and what to do about it.

Write in a direct, editorial tone. Lead with insights, not data. Use specific examples from the data.

Structure your response with these sections (use ## headers):
## Who's Winning & Why
The macro picture — who has momentum, who's growing, who's stalling, and the strategic dynamics at play.

## Key Moves This Month
Specific videos, content shifts, or format changes that signal strategic intent. Focus on the "why" behind the moves.

## Audience Signals
What competitor success patterns tell us about the audience we're all competing for. What resonates, what topics have energy, what formats connect.

## Our White Space
Where the competitive set leaves room for differentiation. Topics under-served, formats under-used, or angles nobody is taking.

## Recommended Actions
3-5 specific, prioritized next steps. Each should be actionable within 2 weeks.

${brandBlock}`;

      let prompt = dataContext;
      if (refinementPrompt && briefing) {
        prompt = `Previous briefing:\n${briefing}\n\nUser request: ${refinementPrompt}\n\nPlease regenerate the briefing incorporating this feedback.`;
      }

      const result = await claudeAPI.call(prompt, systemPrompt, 'competitive_briefing', 3000);

      setBriefing(result.text);
      setCost(prev => prev + (result.cost || 0));
      setGeneratedAt(new Date());
      setRefinement('');
    } catch (e) {
      console.error('[AIBriefing] Generation failed:', e);
      setBriefing(`Error generating briefing: ${e.message}`);
    } finally {
      setGenerating(false);
      setRefining(false);
    }
  }, [buildDataContext, activeClient, briefing]);

  // Render markdown-ish text with basic formatting
  const renderBriefing = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) {
        return (
          <h3 key={i} style={{
            fontSize: '15px', fontWeight: '700', color: 'var(--accent, #3b82f6)',
            marginTop: i > 0 ? '20px' : '0', marginBottom: '8px',
            fontFamily: "'Barlow Condensed', sans-serif",
          }}>
            {line.replace('## ', '')}
          </h3>
        );
      }
      if (line.startsWith('- ')) {
        return (
          <div key={i} style={{
            fontSize: '12px', color: '#ccc', lineHeight: '1.6',
            paddingLeft: '16px', position: 'relative', marginBottom: '4px',
          }}>
            <span style={{ position: 'absolute', left: '4px', color: '#666' }}>&bull;</span>
            {renderInline(line.replace('- ', ''))}
          </div>
        );
      }
      if (line.match(/^\d+\.\s/)) {
        return (
          <div key={i} style={{
            fontSize: '12px', color: '#ccc', lineHeight: '1.6',
            paddingLeft: '16px', marginBottom: '4px',
          }}>
            {renderInline(line)}
          </div>
        );
      }
      if (line.trim() === '') {
        return <div key={i} style={{ height: '8px' }} />;
      }
      return (
        <p key={i} style={{ fontSize: '12px', color: '#ccc', lineHeight: '1.6', margin: '0 0 4px' }}>
          {renderInline(line)}
        </p>
      );
    });
  };

  const renderInline = (text) => {
    // Bold **text**
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: '#fff', fontWeight: '600' }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <div>
      {!briefing && !generating ? (
        /* Pre-generation state */
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          borderRadius: '8px',
        }}>
          <Brain size={32} style={{ color: '#3b82f6', margin: '0 auto 16px', opacity: 0.6 }} />
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>
            Competitive Intelligence Briefing
          </div>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '20px', maxWidth: '400px', margin: '0 auto 20px', lineHeight: '1.5' }}>
            Generate a strategic narrative analyzing who's winning, key moves being made,
            audience signals, and your white space opportunities.
          </div>
          <div style={{
            display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '12px',
          }}>
            <div style={{ fontSize: '10px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <DollarSign size={10} /> ~$0.15–0.30 per generation
            </div>
            <div style={{ fontSize: '10px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={10} /> ~15–30 seconds
            </div>
          </div>
          <button
            onClick={() => generateBriefing()}
            disabled={!competitors.length}
            style={{
              padding: '10px 24px', borderRadius: '8px', fontSize: '13px',
              fontWeight: '600', border: 'none',
              background: 'var(--accent, #3b82f6)', color: '#fff',
              cursor: competitors.length ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              opacity: competitors.length ? 1 : 0.5,
            }}
          >
            <Brain size={16} /> Generate Briefing
          </button>
        </div>
      ) : generating ? (
        /* Generating state */
        <div style={{ textAlign: 'center', padding: '64px 24px', color: '#888' }}>
          <Loader size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '13px', fontWeight: '500' }}>Analyzing {competitors.length} competitors...</div>
          <div style={{ fontSize: '11px', marginTop: '4px' }}>This takes 15–30 seconds</div>
        </div>
      ) : (
        /* Briefing display */
        <div>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #333',
          }}>
            <div>
              <div style={{ fontSize: '10px', color: '#888' }}>
                {generatedAt && `Generated ${generatedAt.toLocaleTimeString()}`}
                {cost > 0 && ` \u00B7 $${cost.toFixed(3)}`}
              </div>
            </div>
            <button
              onClick={() => generateBriefing()}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '11px',
                fontWeight: '600', border: '1px solid #444',
                background: 'transparent', color: '#888', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <RefreshCw size={12} /> Regenerate
            </button>
          </div>

          {/* Briefing content */}
          <div style={{ marginBottom: '20px' }}>
            {renderBriefing(briefing)}
          </div>

          {/* Quick actions */}
          <div style={{
            display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px',
          }}>
            {QUICK_ACTIONS.map(qa => (
              <button
                key={qa.label}
                onClick={() => generateBriefing(qa.prompt)}
                disabled={refining}
                style={{
                  padding: '5px 12px', borderRadius: '6px', fontSize: '10px',
                  fontWeight: '600', border: '1px solid #444',
                  background: 'transparent', color: '#888', cursor: 'pointer',
                }}
              >
                {qa.label}
              </button>
            ))}
          </div>

          {/* Custom refinement */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={refinement}
              onChange={e => setRefinement(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && refinement.trim()) {
                  generateBriefing(refinement.trim());
                }
              }}
              placeholder="Ask a follow-up or request changes..."
              style={{
                flex: 1, padding: '8px 12px', borderRadius: '6px', fontSize: '12px',
                border: '1px solid #444', background: '#252525', color: '#fff',
                outline: 'none',
              }}
            />
            <button
              onClick={() => refinement.trim() && generateBriefing(refinement.trim())}
              disabled={!refinement.trim() || refining}
              style={{
                padding: '8px 16px', borderRadius: '6px', fontSize: '12px',
                fontWeight: '600', border: 'none',
                background: refinement.trim() ? 'var(--accent, #3b82f6)' : '#333',
                color: refinement.trim() ? '#fff' : '#666',
                cursor: refinement.trim() ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              {refining ? (
                <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <Send size={14} />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
