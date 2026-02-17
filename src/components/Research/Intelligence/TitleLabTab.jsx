import React, { useState } from 'react';
import { Loader, Zap, Copy, Check, FileText, RefreshCw } from 'lucide-react';

const FORMAT_OPTIONS = [
  { id: 'tutorial', label: 'Tutorial / How-To' },
  { id: 'listicle', label: 'Listicle / Top N' },
  { id: 'question', label: 'Question Hook' },
  { id: 'comparison', label: 'Comparison / VS' },
  { id: 'story', label: 'Story / Personal' },
  { id: 'reaction', label: 'Reaction / Review' },
  { id: 'challenge', label: 'Challenge' },
];

const HOOK_COLORS = {
  'curiosity gap': '#8b5cf6',
  'number': '#3b82f6',
  'controversy': '#ef4444',
  'authority': '#10b981',
  'urgency': '#f59e0b',
  'personal': '#ec4899',
};

const CTR_COLORS = {
  high: '#10b981',
  medium: '#f59e0b',
};

export default function TitleLabTab({ channelIds, clientId, rows, initialTopic }) {
  const [topics, setTopics] = useState(initialTopic ? [initialTopic] : []);
  const [topicInput, setTopicInput] = useState('');
  const [selectedFormats, setSelectedFormats] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [sentToBrief, setSentToBrief] = useState({});

  const addTopic = () => {
    const t = topicInput.trim();
    if (t && !topics.includes(t) && topics.length < 3) {
      setTopics([...topics, t]);
      setTopicInput('');
    }
  };

  const removeTopic = (idx) => {
    setTopics(topics.filter((_, i) => i !== idx));
  };

  const toggleFormat = (id) => {
    setSelectedFormats(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const handleGenerate = async (forceRefresh = false) => {
    setLoading(true);
    setError('');
    try {
      const { generateTitleSuggestions } = await import('../../../services/competitorIntelligenceService');
      const data = await generateTitleSuggestions(channelIds, clientId, {
        topics,
        formats: selectedFormats,
        count: 10,
        forceRefresh,
      });
      setResults(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyTitle = async (title, idx) => {
    try {
      await navigator.clipboard.writeText(title);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // Fallback
    }
  };

  const sendToBrief = async (titleObj, idx) => {
    try {
      const { supabase } = await import('../../../services/supabaseClient');
      if (!supabase) throw new Error('Supabase not configured');
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('briefs').insert({
        client_id: clientId || null,
        title: titleObj.title,
        status: 'draft',
        source_type: 'title_lab',
        brief_data: {
          format: titleObj.format,
          hookType: titleObj.hookType,
          inspiredBy: titleObj.inspiredBy,
          rationale: titleObj.rationale,
          topicArea: titleObj.topicArea,
          estimatedCTR: titleObj.estimatedCTR,
        },
        created_by: user?.id || null,
      });
      setSentToBrief(prev => ({ ...prev, [idx]: true }));
    } catch (e) {
      console.error('[title-lab] Send to brief failed:', e.message);
    }
  };

  return (
    <div>
      {/* Topic Input */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Topics (optional — focus title suggestions on specific themes)</div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          {topics.map((t, i) => (
            <span key={i} style={{
              background: '#3b82f620', color: '#60a5fa', border: '1px solid #3b82f640',
              padding: '4px 10px', borderRadius: '16px', fontSize: '11px', fontWeight: '600',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              {t}
              <button onClick={() => removeTopic(i)} style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: 0, fontSize: '14px', lineHeight: 1 }}>×</button>
            </span>
          ))}
          {topics.length < 3 && (
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTopic()}
                placeholder="Add topic..."
                style={{
                  background: '#252525', border: '1px solid #555', borderRadius: '6px',
                  padding: '5px 10px', color: '#fff', fontSize: '11px', width: '140px',
                }}
              />
              <button onClick={addTopic}
                style={{ background: '#374151', border: '1px solid #555', borderRadius: '6px', padding: '5px 8px', color: '#fff', fontSize: '11px', cursor: 'pointer' }}>
                +
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Format Filter */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Format preference (optional)</div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {FORMAT_OPTIONS.map(f => {
            const active = selectedFormats.includes(f.id);
            return (
              <button key={f.id} onClick={() => toggleFormat(f.id)}
                style={{
                  padding: '4px 10px', borderRadius: '16px', fontSize: '10px', fontWeight: '600',
                  border: `1px solid ${active ? '#3b82f6' : '#444'}`,
                  background: active ? '#3b82f620' : 'transparent',
                  color: active ? '#3b82f6' : '#888', cursor: 'pointer',
                }}>
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Generate Button */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => handleGenerate(true)} disabled={loading}
          style={{
            background: '#3b82f6', border: 'none', borderRadius: '8px', padding: '10px 20px',
            color: '#fff', fontSize: '13px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px',
          }}>
          {loading
            ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</>
            : <><Zap size={14} /> Generate Titles</>
          }
        </button>
        {results && (
          <button onClick={() => handleGenerate(true)} disabled={loading}
            style={{
              background: 'transparent', border: '1px solid #555', borderRadius: '8px',
              padding: '10px 16px', color: '#888', fontSize: '12px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
            <RefreshCw size={12} /> More Ideas
          </button>
        )}
      </div>

      {error && <div style={{ fontSize: '11px', color: '#ef4444', marginBottom: '12px' }}>{error}</div>}

      {/* Results */}
      {results && results.titles && (
        <div style={{ display: 'grid', gap: '10px' }}>
          {results.titles.map((t, idx) => {
            const hookColor = HOOK_COLORS[t.hookType] || '#888';
            const ctrColor = CTR_COLORS[t.estimatedCTR] || '#888';
            return (
              <div key={idx} style={{
                background: '#252525', border: '1px solid #333', borderRadius: '8px',
                padding: '12px', position: 'relative',
              }}>
                {/* Title */}
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '8px', lineHeight: '1.3', paddingRight: '60px' }}>
                  {t.title}
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {t.hookType && (
                    <span style={{
                      fontSize: '9px', fontWeight: '600', color: hookColor,
                      background: `${hookColor}15`, padding: '2px 8px', borderRadius: '8px',
                      border: `1px solid ${hookColor}40`,
                    }}>
                      {t.hookType}
                    </span>
                  )}
                  {t.format && (
                    <span style={{
                      fontSize: '9px', fontWeight: '600', color: '#888',
                      background: '#88888815', padding: '2px 8px', borderRadius: '8px',
                      border: '1px solid #88888840',
                    }}>
                      {t.format}
                    </span>
                  )}
                  {t.estimatedCTR && (
                    <span style={{
                      fontSize: '9px', fontWeight: '600', color: ctrColor,
                      background: `${ctrColor}15`, padding: '2px 8px', borderRadius: '8px',
                      border: `1px solid ${ctrColor}40`,
                    }}>
                      {t.estimatedCTR} CTR
                    </span>
                  )}
                </div>

                {/* Inspired by + Rationale */}
                {t.inspiredBy && (
                  <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>
                    Inspired by: "{t.inspiredBy}"
                  </div>
                )}
                {t.rationale && (
                  <div style={{ fontSize: '11px', color: '#b0b0b0', lineHeight: '1.4' }}>
                    {t.rationale}
                  </div>
                )}

                {/* Actions */}
                <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '4px' }}>
                  <button onClick={() => copyTitle(t.title, idx)}
                    style={{
                      background: '#374151', border: '1px solid #555', borderRadius: '4px',
                      padding: '4px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    }}>
                    {copiedIdx === idx ? <Check size={12} color="#10b981" /> : <Copy size={12} color="#888" />}
                  </button>
                  <button onClick={() => sendToBrief(t, idx)} disabled={sentToBrief[idx]}
                    style={{
                      background: sentToBrief[idx] ? '#16453420' : '#374151',
                      border: `1px solid ${sentToBrief[idx] ? '#10b981' : '#555'}`,
                      borderRadius: '4px', padding: '4px 6px', cursor: sentToBrief[idx] ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center',
                    }}>
                    {sentToBrief[idx] ? <Check size={12} color="#10b981" /> : <FileText size={12} color="#888" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
