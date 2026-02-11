import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Palette, Upload, Loader2, AlertCircle, Check, ChevronDown, ChevronRight,
  Megaphone, Users, Layers, Eye, Globe, Sparkles, Edit2, RotateCcw, Save,
  Plus, X, Clock, Search, ArrowLeft
} from 'lucide-react';
import {
  getCurrentBrandContext,
  saveBrandContext,
  extractBrandContext,
  getBrandContextHistory,
  searchChannels,
} from '../../services/brandContextService';

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: { maxWidth: '960px', margin: '0 auto' },
  card: {
    background: '#1E1E1E',
    border: '1px solid #333',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '16px',
  },
  header: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#E0E0E0',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  subtitle: { fontSize: '14px', color: '#9E9E9E', marginBottom: '24px' },
  label: {
    display: 'block',
    fontSize: '12px',
    color: '#9E9E9E',
    fontWeight: '600',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    width: '100%',
    background: '#252525',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#E0E0E0',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    background: '#252525',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '12px',
    color: '#E0E0E0',
    fontSize: '14px',
    resize: 'vertical',
    minHeight: '120px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  btnPrimary: {
    background: '#2962FF',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 20px',
    fontWeight: '600',
    cursor: 'pointer',
    color: '#fff',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  btnSecondary: {
    background: 'transparent',
    color: '#9E9E9E',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '10px 16px',
    fontWeight: '500',
    fontSize: '13px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  error: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
    color: '#ef4444',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  success: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid #10b981',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
    color: '#10b981',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: 'rgba(41, 98, 255, 0.15)',
    color: '#60a5fa',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '13px',
    fontWeight: '500',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 0',
    cursor: 'pointer',
    borderBottom: '1px solid #333',
    userSelect: 'none',
  },
};

// ─── Tag Input Component ───────────────────────────────────────────────────────

function TagInput({ tags = [], onChange, placeholder = 'Add item...' }) {
  const [inputValue, setInputValue] = useState('');

  const addTag = () => {
    const val = inputValue.trim();
    if (val && !tags.includes(val)) {
      onChange([...tags, val]);
      setInputValue('');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: tags.length ? '8px' : '0' }}>
        {tags.map((tag, i) => (
          <span key={i} style={styles.tag}>
            {tag}
            <button
              onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
              style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '0', lineHeight: 1 }}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder={placeholder}
          style={{ ...styles.input, flex: 1 }}
        />
        <button onClick={addTag} style={{ ...styles.btnSecondary, padding: '8px 12px' }}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── List Editor (for arrays of { key: value } objects) ────────────────────────

function ListEditor({ items = [], fields, onChange, addLabel = 'Add item' }) {
  const addItem = () => {
    const empty = {};
    fields.forEach(f => { empty[f.key] = ''; });
    onChange([...items, empty]);
  };

  const updateItem = (index, key, value) => {
    const updated = items.map((item, i) => i === index ? { ...item, [key]: value } : item);
    onChange(updated);
  };

  const removeItem = (index) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ background: '#252525', borderRadius: '8px', padding: '12px', marginBottom: '8px', position: 'relative' }}>
          <button
            onClick={() => removeItem(i)}
            style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: fields.length > 2 ? '1fr 1fr' : '1fr', gap: '8px', paddingRight: '24px' }}>
            {fields.map(f => (
              <div key={f.key}>
                <label style={{ ...styles.label, fontSize: '11px', marginBottom: '4px' }}>{f.label}</label>
                {f.type === 'select' ? (
                  <select
                    value={item[f.key] || f.options?.[0] || ''}
                    onChange={e => updateItem(i, f.key, e.target.value)}
                    style={{ ...styles.input, cursor: 'pointer' }}
                  >
                    {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={item[f.key] || ''}
                    onChange={e => updateItem(i, f.key, e.target.value)}
                    placeholder={f.placeholder || ''}
                    style={styles.input}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <button onClick={addItem} style={{ ...styles.btnSecondary, fontSize: '12px', padding: '8px 12px' }}>
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  );
}

// ─── Section Panel ─────────────────────────────────────────────────────────────

function SectionPanel({ icon: Icon, title, filled, expanded, onToggle, children }) {
  return (
    <div style={{ marginBottom: '2px' }}>
      <div onClick={onToggle} style={styles.sectionHeader}>
        <Icon size={18} color={filled ? '#2962FF' : '#666'} />
        <span style={{ flex: 1, fontSize: '15px', fontWeight: '600', color: filled ? '#E0E0E0' : '#9E9E9E' }}>
          {title}
        </span>
        {filled && (
          <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '500' }}>Filled</span>
        )}
        {expanded ? <ChevronDown size={16} color="#666" /> : <ChevronRight size={16} color="#666" />}
      </div>
      {expanded && (
        <div style={{ padding: '16px 0 8px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Review Section (read-only display) ────────────────────────────────────────

function ReviewSection({ icon: Icon, title, data }) {
  const [expanded, setExpanded] = useState(true);
  if (!data || Object.keys(data).length === 0) return null;

  return (
    <div style={{ marginBottom: '2px' }}>
      <div onClick={() => setExpanded(!expanded)} style={styles.sectionHeader}>
        <Icon size={18} color="#2962FF" />
        <span style={{ flex: 1, fontSize: '15px', fontWeight: '600', color: '#E0E0E0' }}>{title}</span>
        {expanded ? <ChevronDown size={16} color="#666" /> : <ChevronRight size={16} color="#666" />}
      </div>
      {expanded && (
        <div style={{ padding: '12px 0 8px', fontSize: '13px', color: '#ccc', lineHeight: '1.6' }}>
          {renderReviewData(title, data)}
        </div>
      )}
    </div>
  );
}

function renderReviewData(sectionTitle, data) {
  if (sectionTitle === 'Brand Voice') {
    return (
      <div>
        {data.primary_attributes?.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={styles.label}>Attributes</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {data.primary_attributes.map((a, i) => <span key={i} style={styles.tag}>{a}</span>)}
            </div>
          </div>
        )}
        {data.tone_descriptors?.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={styles.label}>Tone</div>
            {data.tone_descriptors.map((t, i) => <div key={i} style={{ marginBottom: '4px' }}>- {t}</div>)}
          </div>
        )}
        {data.voice_summary && (
          <div>
            <div style={styles.label}>Summary</div>
            <div style={{ color: '#aaa' }}>{data.voice_summary}</div>
          </div>
        )}
      </div>
    );
  }

  if (sectionTitle === 'Messaging Priorities') {
    return (
      <div>
        {data.current_campaigns?.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={styles.label}>Active Campaigns</div>
            {data.current_campaigns.map((c, i) => (
              <div key={i} style={{ background: '#252525', borderRadius: '8px', padding: '10px 12px', marginBottom: '6px' }}>
                <div style={{ fontWeight: '600', color: '#E0E0E0', marginBottom: '2px' }}>
                  {c.name} <span style={{ fontSize: '11px', color: c.priority_signal === 'high' ? '#10b981' : '#9E9E9E' }}>({c.status}, {c.priority_signal})</span>
                </div>
                {c.description && <div style={{ fontSize: '12px', color: '#aaa' }}>{c.description}</div>}
              </div>
            ))}
          </div>
        )}
        {data.strategic_themes?.length > 0 && (
          <div>
            <div style={styles.label}>Strategic Themes</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {data.strategic_themes.map((t, i) => <span key={i} style={styles.tag}>{t}</span>)}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (sectionTitle === 'Audience Signals') {
    return (
      <div>
        {data.high_engagement_formats?.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={styles.label}>High-Engagement Formats</div>
            {data.high_engagement_formats.map((f, i) => (
              <div key={i} style={{ marginBottom: '6px' }}>
                - <strong>{f.format}</strong> ({f.platform}, {f.signal_strength}){f.notes ? ` — ${f.notes}` : ''}
              </div>
            ))}
          </div>
        )}
        {data.content_gaps?.length > 0 && (
          <div>
            <div style={styles.label}>Content Gaps (YouTube Opportunities)</div>
            {data.content_gaps.map((g, i) => (
              <div key={i} style={{ background: '#252525', borderRadius: '8px', padding: '10px 12px', marginBottom: '6px' }}>
                <div>{g.observation}</div>
                {g.youtube_opportunity && (
                  <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>YouTube opportunity: {g.youtube_opportunity}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (sectionTitle === 'Content Themes') {
    return (
      <div>
        {data.themes?.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={styles.label}>Recurring Themes</div>
            {data.themes.map((t, i) => (
              <div key={i} style={{ marginBottom: '6px' }}>
                - <strong>{t.theme}</strong> ({t.frequency} frequency)
                {t.sub_topics?.length > 0 && <span style={{ color: '#9E9E9E' }}> — {t.sub_topics.join(', ')}</span>}
              </div>
            ))}
          </div>
        )}
        {data.seasonal_patterns?.length > 0 && (
          <div>
            <div style={styles.label}>Seasonal Patterns</div>
            {data.seasonal_patterns.map((s, i) => (
              <div key={i} style={{ marginBottom: '4px' }}>- <strong>{s.period}:</strong> {s.themes?.join(', ')}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (sectionTitle === 'Visual Identity') {
    return (
      <div>
        {data.color_palette?.primary?.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={styles.label}>Brand Colors</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {data.color_palette.primary.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: c, border: '1px solid #555' }} />
                  <span style={{ fontSize: '12px', color: '#9E9E9E' }}>{c}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.photography_style?.dominant_approach && (
          <div style={{ marginBottom: '12px' }}>
            <div style={styles.label}>Photography Style</div>
            <div>{data.photography_style.dominant_approach}</div>
          </div>
        )}
        {data.thumbnail_implications?.length > 0 && (
          <div>
            <div style={styles.label}>Thumbnail Guidance</div>
            {data.thumbnail_implications.map((t, i) => <div key={i} style={{ marginBottom: '4px' }}>- {t}</div>)}
          </div>
        )}
      </div>
    );
  }

  if (sectionTitle === 'Platform Presence') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {Object.entries(data).map(([platform, info]) => (
          info && typeof info === 'object' ? (
            <div key={platform} style={{ background: '#252525', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontWeight: '600', color: '#E0E0E0', marginBottom: '4px', textTransform: 'capitalize' }}>{platform}</div>
              {info.handle && <div style={{ fontSize: '12px', color: '#9E9E9E' }}>{info.handle}</div>}
              {info.follower_count && <div style={{ fontSize: '12px', color: '#9E9E9E' }}>{info.follower_count.toLocaleString()} followers</div>}
              {info.posting_frequency && <div style={{ fontSize: '12px', color: '#9E9E9E' }}>{info.posting_frequency}</div>}
              {info.notes && <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>{info.notes}</div>}
            </div>
          ) : null
        ))}
      </div>
    );
  }

  // Fallback
  return <pre style={{ fontSize: '12px', color: '#9E9E9E', whiteSpace: 'pre-wrap' }}>{JSON.stringify(data, null, 2)}</pre>;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function BrandContext({ activeClient }) {
  const [mode, setMode] = useState('loading'); // loading | extract | edit | review
  const [brandContext, setBrandContext] = useState(null);
  const [formData, setFormData] = useState(null);
  const [pasteContent, setPasteContent] = useState('');
  const [brandName, setBrandName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [extractionCost, setExtractionCost] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [history, setHistory] = useState([]);

  // Channel search state (used when no activeClient)
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef(null);

  // Effective channel: sidebar client takes priority, otherwise use searched channel
  const effectiveChannel = activeClient || selectedChannel;

  // Debounced channel search
  useEffect(() => {
    if (activeClient) return; // Don't search when client is selected via sidebar
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchChannels(searchQuery.trim());
        setSearchResults(results);
      } catch (err) {
        console.error('[BrandContext] Search error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, activeClient]);

  // Reset selected channel when activeClient changes
  useEffect(() => {
    if (activeClient) {
      setSelectedChannel(null);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [activeClient?.id]);

  // Load brand context when effective channel changes
  useEffect(() => {
    if (!effectiveChannel?.id) {
      setMode('extract');
      setBrandContext(null);
      setFormData(null);
      return;
    }

    setBrandName(effectiveChannel.name || '');
    setError(null);
    setSuccessMsg(null);

    const load = async () => {
      setMode('loading');
      try {
        const ctx = await getCurrentBrandContext(effectiveChannel.id);
        if (ctx) {
          setBrandContext(ctx);
          setMode('review');
        } else {
          setBrandContext(null);
          setMode('extract');
        }
      } catch (err) {
        console.error('[BrandContext] Load error:', err);
        setMode('extract');
      }
    };
    load();
  }, [effectiveChannel?.id]);

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isSectionFilled = (data) => data && typeof data === 'object' && Object.keys(data).length > 0;

  // ── Extract ────────────────────────────────────────────────────────────────

  const handleExtract = useCallback(async () => {
    if (!pasteContent.trim()) {
      setError('Please paste some content to extract from.');
      return;
    }
    setLoading(true);
    setError(null);
    setExtractionCost(null);

    try {
      const result = await extractBrandContext(pasteContent, brandName || effectiveChannel?.name || 'Unknown');
      const { raw_extraction, extraction_model, usage, cost, ...contextFields } = result;

      setFormData({
        ...contextFields,
        raw_extraction,
        extraction_model,
      });
      setExtractionCost(cost);

      // Expand all sections
      const expanded = {};
      ['brand_voice', 'messaging_priorities', 'audience_signals', 'content_themes', 'visual_identity', 'platform_presence'].forEach(k => {
        expanded[k] = true;
      });
      setExpandedSections(expanded);

      setMode('edit');
    } catch (err) {
      console.error('[BrandContext] Extraction error:', err);
      setError(err.message || 'Extraction failed. Check your Claude API key and try again.');
    } finally {
      setLoading(false);
    }
  }, [pasteContent, brandName, effectiveChannel?.name]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!effectiveChannel?.id || !formData) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const saved = await saveBrandContext(effectiveChannel.id, formData);
      setBrandContext(saved);
      setMode('review');
      setSuccessMsg('Brand context saved successfully.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('[BrandContext] Save error:', err);
      setError(err.message || 'Failed to save brand context.');
    } finally {
      setSaving(false);
    }
  }, [effectiveChannel?.id, formData]);

  // ── Edit existing context ──────────────────────────────────────────────────

  const handleStartEdit = () => {
    setFormData({
      brand_voice: brandContext?.brand_voice || {},
      messaging_priorities: brandContext?.messaging_priorities || {},
      audience_signals: brandContext?.audience_signals || {},
      content_themes: brandContext?.content_themes || {},
      visual_identity: brandContext?.visual_identity || {},
      platform_presence: brandContext?.platform_presence || {},
      source_urls: brandContext?.source_urls || {},
      raw_extraction: brandContext?.raw_extraction || null,
      extraction_model: brandContext?.extraction_model || null,
    });
    const expanded = {};
    ['brand_voice', 'messaging_priorities', 'audience_signals', 'content_themes', 'visual_identity', 'platform_presence'].forEach(k => {
      expanded[k] = isSectionFilled(brandContext?.[k]);
    });
    setExpandedSections(expanded);
    setMode('edit');
  };

  const handleViewHistory = async () => {
    if (!effectiveChannel?.id) return;
    const h = await getBrandContextHistory(effectiveChannel.id);
    setHistory(h);
  };

  // ── Form field updaters ────────────────────────────────────────────────────

  const updateField = (section, path, value) => {
    setFormData(prev => {
      const sectionData = { ...(prev[section] || {}) };
      if (path.includes('.')) {
        const [parent, child] = path.split('.');
        sectionData[parent] = { ...(sectionData[parent] || {}), [child]: value };
      } else {
        sectionData[path] = value;
      }
      return { ...prev, [section]: sectionData };
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!effectiveChannel) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.header}>
            <Palette size={24} color="#2962FF" />
            Brand Context
          </div>
          <div style={{ color: '#9E9E9E', fontSize: '14px', marginBottom: '20px' }}>
            {activeClient === undefined || activeClient === null
              ? 'Search for a channel to manage its brand context, or select a client from the sidebar.'
              : 'Select a client to manage their brand context.'}
          </div>

          {/* Channel search */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Search size={16} style={{ color: '#666', flexShrink: 0 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search channels by name..."
                style={{ ...styles.input, flex: 1 }}
              />
            </div>
          </div>

          {/* Search results */}
          {searching && (
            <div style={{ textAlign: 'center', padding: '16px', color: '#9E9E9E', fontSize: '13px' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', marginBottom: '4px' }} />
              <div>Searching...</div>
            </div>
          )}

          {!searching && searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {searchResults.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => {
                    setSelectedChannel({ id: ch.id, name: ch.name, thumbnail_url: ch.thumbnail_url });
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    background: '#252525', border: '1px solid #333', borderRadius: '8px',
                    padding: '12px', cursor: 'pointer', textAlign: 'left', width: '100%',
                  }}
                >
                  {ch.thumbnail_url && (
                    <img src={ch.thumbnail_url} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#E0E0E0' }}>{ch.name}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {(ch.subscriber_count || 0).toLocaleString()} subscribers
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {ch.is_client && <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 6px', borderRadius: '4px' }}>Client</span>}
                    {ch.is_competitor && <span style={{ fontSize: '10px', background: 'rgba(41, 98, 255, 0.15)', color: '#60a5fa', padding: '2px 6px', borderRadius: '4px' }}>Competitor</span>}
                    {!ch.is_client && !ch.is_competitor && <span style={{ fontSize: '10px', background: '#333', color: '#9E9E9E', padding: '2px 6px', borderRadius: '4px' }}>Audit</span>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px', color: '#666', fontSize: '13px' }}>
              No channels found matching &ldquo;{searchQuery}&rdquo;
            </div>
          )}
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (mode === 'loading') {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, textAlign: 'center', padding: '60px' }}>
          <Loader2 size={32} color="#2962FF" style={{ animation: 'spin 1s linear infinite' }} />
          <div style={{ color: '#9E9E9E', marginTop: '12px' }}>Loading brand context...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        {selectedChannel && !activeClient && (
          <button
            onClick={() => { setSelectedChannel(null); setMode('loading'); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'none', border: 'none', color: '#60a5fa',
              cursor: 'pointer', padding: '0 0 8px', fontSize: '13px',
            }}
          >
            <ArrowLeft size={14} /> Change channel
          </button>
        )}
        <div style={styles.header}>
          <Palette size={24} color="#2962FF" />
          Brand Context — {effectiveChannel.name}
        </div>
        <div style={styles.subtitle}>
          {mode === 'extract' && 'Paste website content, about pages, or social media posts to extract brand intelligence.'}
          {mode === 'edit' && 'Review and edit the extracted brand context before saving.'}
          {mode === 'review' && 'Brand context is active and will be injected into all AI-generated outputs for this channel.'}
        </div>
      </div>

      {error && (
        <div style={styles.error}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div style={styles.success}>
          <Check size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ─── EXTRACT MODE ─────────────────────────────────────────────────── */}
      {mode === 'extract' && (
        <div style={styles.card}>
          <div style={{ marginBottom: '16px' }}>
            <label style={styles.label}>Brand Name</label>
            <input
              type="text"
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              placeholder="e.g. Cotopaxi"
              style={styles.input}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={styles.label}>Paste Content</label>
            <textarea
              value={pasteContent}
              onChange={e => setPasteContent(e.target.value)}
              placeholder={"Paste website homepage copy, about page text, recent social media posts, campaign descriptions, product pages...\n\nThe more content you provide, the richer the extraction. Include content from multiple platforms if available."}
              style={{ ...styles.textarea, minHeight: '240px' }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {pasteContent.length > 0 ? `${pasteContent.length.toLocaleString()} characters` : 'Tip: Copy and paste text from the brand\'s website, Instagram captions, LinkedIn posts, etc.'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={handleExtract}
              disabled={loading || !pasteContent.trim()}
              style={{
                ...styles.btnPrimary,
                opacity: loading || !pasteContent.trim() ? 0.5 : 1,
                cursor: loading || !pasteContent.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={16} />}
              {loading ? 'Extracting...' : 'Extract Brand Context'}
            </button>
            {extractionCost !== null && (
              <span style={{ fontSize: '12px', color: '#9E9E9E' }}>
                Estimated cost: ${extractionCost.toFixed(4)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ─── EDIT MODE ────────────────────────────────────────────────────── */}
      {mode === 'edit' && formData && (
        <>
          <div style={styles.card}>
            {/* Brand Voice */}
            <SectionPanel
              icon={Megaphone}
              title="Brand Voice"
              filled={isSectionFilled(formData.brand_voice)}
              expanded={expandedSections.brand_voice}
              onToggle={() => toggleSection('brand_voice')}
            >
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>Primary Attributes</label>
                <TagInput
                  tags={formData.brand_voice?.primary_attributes || []}
                  onChange={v => updateField('brand_voice', 'primary_attributes', v)}
                  placeholder="e.g. playful, mission-driven..."
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>Voice Summary</label>
                <textarea
                  value={formData.brand_voice?.voice_summary || ''}
                  onChange={e => updateField('brand_voice', 'voice_summary', e.target.value)}
                  placeholder="How does this brand communicate? Describe their voice in 2-3 sentences."
                  style={{ ...styles.textarea, minHeight: '80px' }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>Tone Descriptors</label>
                <TagInput
                  tags={formData.brand_voice?.tone_descriptors || []}
                  onChange={v => updateField('brand_voice', 'tone_descriptors', v)}
                  placeholder="e.g. Casual but purposeful"
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>Frequently Used Phrases</label>
                <TagInput
                  tags={formData.brand_voice?.language_patterns?.frequently_used_phrases || []}
                  onChange={v => updateField('brand_voice', 'language_patterns', { ...(formData.brand_voice?.language_patterns || {}), frequently_used_phrases: v })}
                  placeholder="e.g. gear for good"
                />
              </div>
              <div>
                <label style={styles.label}>Avoided Language</label>
                <TagInput
                  tags={formData.brand_voice?.language_patterns?.avoided_language || []}
                  onChange={v => updateField('brand_voice', 'language_patterns', { ...(formData.brand_voice?.language_patterns || {}), avoided_language: v })}
                  placeholder="e.g. luxury, premium"
                />
              </div>
            </SectionPanel>

            {/* Messaging Priorities */}
            <SectionPanel
              icon={Layers}
              title="Messaging Priorities"
              filled={isSectionFilled(formData.messaging_priorities)}
              expanded={expandedSections.messaging_priorities}
              onToggle={() => toggleSection('messaging_priorities')}
            >
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>Current Campaigns</label>
                <ListEditor
                  items={formData.messaging_priorities?.current_campaigns || []}
                  fields={[
                    { key: 'name', label: 'Campaign Name', placeholder: 'e.g. Spring Collection' },
                    { key: 'status', label: 'Status', type: 'select', options: ['active', 'upcoming', 'completed'] },
                    { key: 'description', label: 'Description', placeholder: 'Brief description...' },
                    { key: 'priority_signal', label: 'Priority', type: 'select', options: ['high', 'medium', 'low'] },
                  ]}
                  onChange={v => updateField('messaging_priorities', 'current_campaigns', v)}
                  addLabel="Add campaign"
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>Strategic Themes</label>
                <TagInput
                  tags={formData.messaging_priorities?.strategic_themes || []}
                  onChange={v => updateField('messaging_priorities', 'strategic_themes', v)}
                  placeholder="e.g. Sustainability, Community events"
                />
              </div>
              <div>
                <label style={styles.label}>Primary CTAs</label>
                <ListEditor
                  items={formData.messaging_priorities?.primary_ctas || []}
                  fields={[
                    { key: 'action', label: 'CTA Text', placeholder: 'e.g. Shop Now' },
                    { key: 'url', label: 'URL', placeholder: 'https://...' },
                  ]}
                  onChange={v => updateField('messaging_priorities', 'primary_ctas', v)}
                  addLabel="Add CTA"
                />
              </div>
            </SectionPanel>

            {/* Audience Signals */}
            <SectionPanel
              icon={Users}
              title="Audience Signals"
              filled={isSectionFilled(formData.audience_signals)}
              expanded={expandedSections.audience_signals}
              onToggle={() => toggleSection('audience_signals')}
            >
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>High-Engagement Formats</label>
                <ListEditor
                  items={formData.audience_signals?.high_engagement_formats || []}
                  fields={[
                    { key: 'format', label: 'Format', placeholder: 'e.g. Behind-the-scenes content' },
                    { key: 'platform', label: 'Platform', placeholder: 'e.g. instagram' },
                    { key: 'signal_strength', label: 'Strength', type: 'select', options: ['strong', 'moderate', 'weak'] },
                    { key: 'notes', label: 'Notes', placeholder: 'Why it works...' },
                  ]}
                  onChange={v => updateField('audience_signals', 'high_engagement_formats', v)}
                  addLabel="Add format"
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>Audience Interests</label>
                <TagInput
                  tags={formData.audience_signals?.audience_demographics_observed?.interest_clusters || []}
                  onChange={v => updateField('audience_signals', 'audience_demographics_observed', {
                    ...(formData.audience_signals?.audience_demographics_observed || {}),
                    interest_clusters: v,
                  })}
                  placeholder="e.g. outdoor recreation, sustainability"
                />
              </div>
              <div>
                <label style={styles.label}>Content Gaps / YouTube Opportunities</label>
                <ListEditor
                  items={formData.audience_signals?.content_gaps || []}
                  fields={[
                    { key: 'observation', label: 'Gap Observed', placeholder: 'What audiences want but aren\'t getting...' },
                    { key: 'youtube_opportunity', label: 'YouTube Opportunity', placeholder: 'How this could become YouTube content...' },
                  ]}
                  onChange={v => updateField('audience_signals', 'content_gaps', v)}
                  addLabel="Add content gap"
                />
              </div>
            </SectionPanel>

            {/* Content Themes */}
            <SectionPanel
              icon={Layers}
              title="Content Themes"
              filled={isSectionFilled(formData.content_themes)}
              expanded={expandedSections.content_themes}
              onToggle={() => toggleSection('content_themes')}
            >
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>Recurring Themes</label>
                <ListEditor
                  items={formData.content_themes?.themes || []}
                  fields={[
                    { key: 'theme', label: 'Theme', placeholder: 'e.g. Sustainability' },
                    { key: 'frequency', label: 'Frequency', type: 'select', options: ['high', 'medium', 'low'] },
                  ]}
                  onChange={v => updateField('content_themes', 'themes', v)}
                  addLabel="Add theme"
                />
              </div>
              <div>
                <label style={styles.label}>Seasonal Patterns</label>
                <ListEditor
                  items={formData.content_themes?.seasonal_patterns || []}
                  fields={[
                    { key: 'period', label: 'Period', placeholder: 'e.g. spring, holiday' },
                    { key: 'themes', label: 'Themes (comma-separated)', placeholder: 'e.g. gift guides, year in review' },
                  ]}
                  onChange={v => {
                    // Convert comma-separated string back to array for themes
                    const normalized = v.map(item => ({
                      ...item,
                      themes: typeof item.themes === 'string' ? item.themes.split(',').map(s => s.trim()).filter(Boolean) : item.themes,
                    }));
                    updateField('content_themes', 'seasonal_patterns', normalized);
                  }}
                  addLabel="Add seasonal pattern"
                />
              </div>
            </SectionPanel>

            {/* Visual Identity */}
            <SectionPanel
              icon={Eye}
              title="Visual Identity"
              filled={isSectionFilled(formData.visual_identity)}
              expanded={expandedSections.visual_identity}
              onToggle={() => toggleSection('visual_identity')}
            >
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>Brand Colors (hex codes)</label>
                <TagInput
                  tags={formData.visual_identity?.color_palette?.primary || []}
                  onChange={v => updateField('visual_identity', 'color_palette', {
                    ...(formData.visual_identity?.color_palette || {}),
                    primary: v,
                  })}
                  placeholder="e.g. #FF6B35"
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>Photography Style</label>
                <textarea
                  value={formData.visual_identity?.photography_style?.dominant_approach || ''}
                  onChange={e => updateField('visual_identity', 'photography_style', {
                    ...(formData.visual_identity?.photography_style || {}),
                    dominant_approach: e.target.value,
                  })}
                  placeholder="Describe the brand's visual style..."
                  style={{ ...styles.textarea, minHeight: '60px' }}
                />
              </div>
              <div>
                <label style={styles.label}>Thumbnail Implications</label>
                <TagInput
                  tags={formData.visual_identity?.thumbnail_implications || []}
                  onChange={v => updateField('visual_identity', 'thumbnail_implications', v)}
                  placeholder="e.g. Feature people in action, not isolated products"
                />
              </div>
            </SectionPanel>

            {/* Platform Presence */}
            <SectionPanel
              icon={Globe}
              title="Platform Presence"
              filled={isSectionFilled(formData.platform_presence)}
              expanded={expandedSections.platform_presence}
              onToggle={() => toggleSection('platform_presence')}
            >
              {['instagram', 'tiktok', 'x', 'linkedin', 'facebook'].map(platform => {
                const pData = formData.platform_presence?.[platform] || {};
                return (
                  <div key={platform} style={{ background: '#252525', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                    <div style={{ fontWeight: '600', color: '#E0E0E0', marginBottom: '8px', textTransform: 'capitalize' }}>{platform}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ ...styles.label, fontSize: '11px' }}>Handle</label>
                        <input
                          type="text"
                          value={pData.handle || ''}
                          onChange={e => {
                            const updated = { ...(formData.platform_presence || {}), [platform]: { ...pData, handle: e.target.value } };
                            setFormData(prev => ({ ...prev, platform_presence: updated }));
                          }}
                          placeholder={`@${platform}handle`}
                          style={styles.input}
                        />
                      </div>
                      <div>
                        <label style={{ ...styles.label, fontSize: '11px' }}>Followers</label>
                        <input
                          type="text"
                          value={pData.follower_count || ''}
                          onChange={e => {
                            const updated = { ...(formData.platform_presence || {}), [platform]: { ...pData, follower_count: e.target.value } };
                            setFormData(prev => ({ ...prev, platform_presence: updated }));
                          }}
                          placeholder="e.g. 50000"
                          style={styles.input}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <label style={{ ...styles.label, fontSize: '11px' }}>Notes</label>
                      <input
                        type="text"
                        value={pData.notes || ''}
                        onChange={e => {
                          const updated = { ...(formData.platform_presence || {}), [platform]: { ...pData, notes: e.target.value } };
                          setFormData(prev => ({ ...prev, platform_presence: updated }));
                        }}
                        placeholder="Key observations..."
                        style={styles.input}
                      />
                    </div>
                  </div>
                );
              })}
            </SectionPanel>
          </div>

          {/* Save / Cancel Bar */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginBottom: '24px' }}>
            <button
              onClick={() => {
                if (brandContext) {
                  setMode('review');
                } else {
                  setMode('extract');
                }
              }}
              style={styles.btnSecondary}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...styles.btnPrimary,
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
              {saving ? 'Saving...' : 'Save Brand Context'}
            </button>
          </div>
        </>
      )}

      {/* ─── REVIEW MODE ──────────────────────────────────────────────────── */}
      {mode === 'review' && brandContext && (
        <>
          {/* Status Bar */}
          <div style={{
            ...styles.card,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            background: 'rgba(41, 98, 255, 0.05)',
            borderColor: 'rgba(41, 98, 255, 0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Check size={18} color="#10b981" />
              <span style={{ color: '#E0E0E0', fontWeight: '600', fontSize: '14px' }}>Brand context active</span>
              <span style={{ color: '#9E9E9E', fontSize: '12px' }}>
                Last updated {new Date(brandContext.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {brandContext.extraction_model && ` via ${brandContext.extraction_model}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleStartEdit} style={styles.btnSecondary}>
                <Edit2 size={14} /> Edit
              </button>
              <button onClick={() => { setPasteContent(''); setMode('extract'); }} style={styles.btnSecondary}>
                <RotateCcw size={14} /> Re-extract
              </button>
              <button onClick={handleViewHistory} style={styles.btnSecondary}>
                <Clock size={14} /> History
              </button>
            </div>
          </div>

          {/* History Panel */}
          {history.length > 0 && (
            <div style={{ ...styles.card, padding: '16px' }}>
              <div style={{ ...styles.label, marginBottom: '8px' }}>Snapshot History</div>
              {history.map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid #333' }}>
                  <span style={{ fontSize: '13px', color: h.is_current ? '#10b981' : '#9E9E9E' }}>
                    {new Date(h.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {h.is_current && <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600' }}>CURRENT</span>}
                  {h.extraction_model && <span style={{ fontSize: '11px', color: '#666' }}>{h.extraction_model}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Context Sections */}
          <div style={styles.card}>
            <ReviewSection icon={Megaphone} title="Brand Voice" data={brandContext.brand_voice} />
            <ReviewSection icon={Layers} title="Messaging Priorities" data={brandContext.messaging_priorities} />
            <ReviewSection icon={Users} title="Audience Signals" data={brandContext.audience_signals} />
            <ReviewSection icon={Layers} title="Content Themes" data={brandContext.content_themes} />
            <ReviewSection icon={Eye} title="Visual Identity" data={brandContext.visual_identity} />
            <ReviewSection icon={Globe} title="Platform Presence" data={brandContext.platform_presence} />
          </div>
        </>
      )}

      {/* CSS for spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
