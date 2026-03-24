/**
 * AuditReportBuilder — External report editor for prospect audits
 *
 * Pre-populated from diagnostic data. Claude generates first-draft narratives.
 * Team member edits variable zones, selects which gaps/competitors/shows to include.
 * Exports to PDF.
 *
 * Only accessible for prospect audits (audit_type === 'prospect').
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Save, FileText, Loader, Sparkles, ChevronDown, ChevronUp,
  Eye, EyeOff, Plus, Trash2, Download,
} from 'lucide-react';

// ─── Section Editor Components ─────────────────────────────────────────

function SectionHeader({ title, subtitle, included, onToggle, color = '#3b82f6' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '14px 20px', borderBottom: '1px solid #333',
      background: included ? 'transparent' : 'rgba(255,255,255,0.02)',
    }}>
      <div style={{
        width: 6, height: '100%', minHeight: 20, borderRadius: 3,
        background: included ? color : '#444', flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: '700', color: included ? '#fff' : '#666' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{subtitle}</div>}
      </div>
      <button
        onClick={onToggle}
        title={included ? 'Exclude from report' : 'Include in report'}
        style={{
          background: 'transparent', border: '1px solid #444', borderRadius: '6px',
          padding: '4px 8px', cursor: 'pointer', color: included ? '#10b981' : '#666',
          display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px',
        }}
      >
        {included ? <Eye size={12} /> : <EyeOff size={12} />}
        {included ? 'Included' : 'Excluded'}
      </button>
    </div>
  );
}

function EditableTextarea({ value, onChange, placeholder, rows = 3, label }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      {label && (
        <label style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
          {label}
        </label>
      )}
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: '100%', padding: '10px 12px', background: '#252525',
          border: '1px solid #444', borderRadius: '6px', color: '#E0E0E0',
          fontSize: '13px', lineHeight: '1.6', resize: 'vertical', outline: 'none',
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

function EditableInput({ value, onChange, placeholder, label }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      {label && (
        <label style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
          {label}
        </label>
      )}
      <input
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '8px 10px', background: '#252525',
          border: '1px solid #444', borderRadius: '6px', color: '#E0E0E0',
          fontSize: '12px', outline: 'none',
        }}
      />
    </div>
  );
}

function ItemToggle({ included, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
        color: included ? '#10b981' : '#555', flexShrink: 0,
      }}
    >
      {included ? <Eye size={14} /> : <EyeOff size={14} />}
    </button>
  );
}

// ─── Main Component ────────────────────────────────────────────────────

export default function AuditReportBuilder({ audit, isOpen, onClose, onSaved }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [expandedSection, setExpandedSection] = useState('brand_moment');

  // Load or create report
  useEffect(() => {
    if (!isOpen || !audit) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        // Check for existing draft
        const { listDrafts, loadDraft } = await import('../../services/reportDraftService');
        const drafts = await listDrafts(audit.channel_snapshot?.channel_id || audit.channel_id);

        // Find a v2 draft for this audit
        const existingDraft = drafts?.find(d => {
          try {
            const data = typeof d.opportunities === 'string' ? JSON.parse(d.opportunities) : d.opportunities;
            return data?.version === '2.0' && data?.audit_id === audit.id;
          } catch { return false; }
        });

        if (existingDraft && !cancelled) {
          const full = await loadDraft(existingDraft.id);
          const data = typeof full.opportunities === 'string' ? JSON.parse(full.opportunities) : full.opportunities;
          setReport(data);
          setDraftId(full.id);
          setDraftName(full.name || '');
        } else if (!cancelled) {
          // Pre-populate from diagnostic
          const { prePopulateReport } = await import('../../services/reportPrePopulator');
          const newReport = prePopulateReport(audit);
          setReport(newReport);
          setDraftName(`${audit.channel_snapshot?.name || 'Channel'} — External Report`);
        }
      } catch (err) {
        console.error('[ReportBuilder] Failed to load:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, audit]);

  // Generate narratives with Claude
  const handleGenerateNarratives = useCallback(async () => {
    if (!report || !audit) return;
    setGenerating(true);
    try {
      const { generateReportNarratives } = await import('../../services/reportPrePopulator');
      const updated = await generateReportNarratives({ ...report }, audit);
      setReport(updated);
    } catch (err) {
      console.error('[ReportBuilder] Narrative generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }, [report, audit]);

  // Save draft
  const handleSave = useCallback(async () => {
    if (!report) return;
    setSaving(true);
    try {
      const { saveDraft } = await import('../../services/reportDraftService');
      report.last_edited_at = new Date().toISOString();
      const saved = await saveDraft({
        id: draftId || undefined,
        clientId: audit.channel_snapshot?.channel_id || audit.channel_id,
        name: draftName || `${report.channel_name} — External Report`,
        opportunities: report, // The v2.0 JSONB goes into the opportunities column
      });
      if (saved?.id) setDraftId(saved.id);
      onSaved?.();
    } catch (err) {
      console.error('[ReportBuilder] Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [report, draftId, draftName, audit, onSaved]);

  // Update a section field
  const updateSection = useCallback((sectionKey, field, value) => {
    setReport(prev => ({
      ...prev,
      sections: {
        ...prev.sections,
        [sectionKey]: {
          ...prev.sections[sectionKey],
          [field]: value,
        },
      },
    }));
  }, []);

  // Update a nested item in a section array
  const updateSectionItem = useCallback((sectionKey, arrayField, index, field, value) => {
    setReport(prev => {
      const section = { ...prev.sections[sectionKey] };
      const arr = [...section[arrayField]];
      arr[index] = { ...arr[index], [field]: value };
      return {
        ...prev,
        sections: { ...prev.sections, [sectionKey]: { ...section, [arrayField]: arr } },
      };
    });
  }, []);

  if (!isOpen) return null;

  if (loading || !report) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.8)', zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center', color: '#888' }}>
          <Loader size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
          <div>Loading report builder...</div>
        </div>
      </div>
    );
  }

  const sections = report.sections;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', zIndex: 2000,
      display: 'flex', justifyContent: 'center',
      overflowY: 'auto',
    }}>
      <div style={{
        width: '800px', maxWidth: '95vw',
        margin: '20px 0', minHeight: 'min-content',
      }}>
        {/* Header bar */}
        <div style={{
          background: '#1E1E1E', border: '1px solid #333', borderRadius: '10px 10px 0 0',
          padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px',
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <FileText size={20} style={{ color: '#3b82f6' }} />
          <div style={{ flex: 1 }}>
            <input
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              placeholder="Report name"
              style={{
                background: 'transparent', border: 'none', color: '#fff',
                fontSize: '16px', fontWeight: '700', outline: 'none', width: '100%',
              }}
            />
            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
              v2.0 · {report.channel_name} · Last edited {new Date(report.last_edited_at).toLocaleString()}
            </div>
          </div>
          <button
            onClick={handleGenerateNarratives}
            disabled={generating}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', background: 'rgba(139,92,246,0.15)',
              border: '1px solid #8b5cf6', borderRadius: '6px',
              color: '#a78bfa', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              opacity: generating ? 0.5 : 1,
            }}
          >
            {generating ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
            {generating ? 'Generating...' : 'Generate Drafts'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', background: '#10b981',
              border: 'none', borderRadius: '6px',
              color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid #444', borderRadius: '6px',
              padding: '8px', color: '#888', cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Section editors */}
        <div style={{
          background: '#1a1a1a', border: '1px solid #333', borderTop: 'none',
          borderRadius: '0 0 10px 10px',
        }}>
          {/* ── 1. Brand Moment ── */}
          <SectionEditor
            title="1. The Brand Moment"
            subtitle="Earn trust — show you understand the brand"
            color="#3b82f6"
            section={sections.brand_moment}
            isExpanded={expandedSection === 'brand_moment'}
            onToggleExpand={() => setExpandedSection(expandedSection === 'brand_moment' ? null : 'brand_moment')}
            onToggleInclude={() => updateSection('brand_moment', 'included', !sections.brand_moment.included)}
          >
            <div style={{ fontSize: '11px', color: '#666', fontStyle: 'italic', marginBottom: '10px' }}>
              {sections.brand_moment.fixed_frame}
            </div>
            <EditableTextarea
              value={sections.brand_moment.variable_narrative}
              onChange={v => updateSection('brand_moment', 'variable_narrative', v)}
              placeholder="4-6 sentence strategic observation about the brand..."
              rows={5}
              label="Narrative"
            />
            <EditableInput
              value={sections.brand_moment.data_point}
              onChange={v => updateSection('brand_moment', 'data_point', v)}
              placeholder="One data point proving audience appetite..."
              label="Supporting data point"
            />
          </SectionEditor>

          {/* ── 2. Channel Reality ── */}
          <SectionEditor
            title="2. Channel Reality"
            subtitle="Show the gap — create tension without blame"
            color="#f59e0b"
            section={sections.channel_reality}
            isExpanded={expandedSection === 'channel_reality'}
            onToggleExpand={() => setExpandedSection(expandedSection === 'channel_reality' ? null : 'channel_reality')}
            onToggleInclude={() => updateSection('channel_reality', 'included', !sections.channel_reality.included)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              {sections.channel_reality.metrics.map((m, i) => (
                <div key={m.key} style={{ background: '#252525', borderRadius: '6px', padding: '10px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>{m.label}</div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>{m.value}</div>
                    {m.benchmark_value && <div style={{ fontSize: '10px', color: '#666' }}>{m.benchmark_value}</div>}
                  </div>
                  <div style={{ flex: 2 }}>
                    <EditableInput
                      value={m.consequence}
                      onChange={v => updateSectionItem('channel_reality', 'metrics', i, 'consequence', v)}
                      placeholder="Business consequence of this metric..."
                    />
                  </div>
                </div>
              ))}
            </div>
            <EditableTextarea
              value={sections.channel_reality.narrative}
              onChange={v => updateSection('channel_reality', 'narrative', v)}
              placeholder="Channel reality narrative..."
              rows={4}
              label="Narrative"
            />
          </SectionEditor>

          {/* ── 3. Alignment ── */}
          <SectionEditor
            title="3. What You're Building + What Your Audience Wants"
            subtitle="Validate intent, show where data supports or redirects"
            color="#10b981"
            section={sections.alignment}
            isExpanded={expandedSection === 'alignment'}
            onToggleExpand={() => setExpandedSection(expandedSection === 'alignment' ? null : 'alignment')}
            onToggleInclude={() => updateSection('alignment', 'included', !sections.alignment.included)}
          >
            <EditableTextarea
              value={sections.alignment.brand_intent_summary}
              onChange={v => updateSection('alignment', 'brand_intent_summary', v)}
              placeholder="What the client says they want YouTube to do..."
              rows={2}
              label="Brand Intent (in their words)"
            />
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
              Alignment: <span style={{
                fontWeight: '700',
                color: sections.alignment.alignment_scenario === 'alignment' ? '#10b981'
                  : sections.alignment.alignment_scenario === 'tension' ? '#ef4444' : '#f59e0b',
              }}>
                {sections.alignment.alignment_scenario === 'alignment' ? 'Aligned'
                  : sections.alignment.alignment_scenario === 'tension' ? 'Tension' : 'Partial Overlap'}
              </span>
            </div>
            {sections.alignment.bridge_narrative && (
              <EditableTextarea
                value={sections.alignment.bridge_narrative}
                onChange={v => updateSection('alignment', 'bridge_narrative', v)}
                placeholder="Bridge narrative — diplomatically address the tension..."
                rows={3}
                label="Bridge Narrative"
              />
            )}
            <div style={{ fontSize: '11px', color: '#888', marginTop: '12px', marginBottom: '6px' }}>Content Gaps (select up to 3 for the report)</div>
            {sections.alignment.gaps.map((gap, i) => (
              <div key={gap.id} style={{
                background: '#252525', borderRadius: '6px', padding: '10px', marginBottom: '6px',
                opacity: gap.included ? 1 : 0.5,
                borderLeft: `3px solid ${gap.included ? '#10b981' : '#444'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <ItemToggle included={gap.included} onToggle={() => updateSectionItem('alignment', 'gaps', i, 'included', !gap.included)} />
                  <div style={{ flex: 1 }}>
                    <EditableInput value={gap.headline} onChange={v => updateSectionItem('alignment', 'gaps', i, 'headline', v)} placeholder="Gap headline (framed as audience desire)..." />
                    <EditableTextarea value={gap.evidence} onChange={v => updateSectionItem('alignment', 'gaps', i, 'evidence', v)} placeholder="Evidence..." rows={2} />
                    <EditableInput value={gap.snowball} onChange={v => updateSectionItem('alignment', 'gaps', i, 'snowball', v)} placeholder="Why this compounds over time..." />
                  </div>
                </div>
              </div>
            ))}
          </SectionEditor>

          {/* ── 4. Competitive Window ── */}
          <SectionEditor
            title="4. The Competitive Window"
            subtitle="Make the opportunity feel finite and real"
            color="#8b5cf6"
            section={sections.competitive_window}
            isExpanded={expandedSection === 'competitive_window'}
            onToggleExpand={() => setExpandedSection(expandedSection === 'competitive_window' ? null : 'competitive_window')}
            onToggleInclude={() => updateSection('competitive_window', 'included', !sections.competitive_window.included)}
          >
            {sections.competitive_window.benchmarks.map((b, i) => (
              <div key={i} style={{
                background: '#252525', borderRadius: '6px', padding: '12px', marginBottom: '8px',
                opacity: b.included ? 1 : 0.5,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <ItemToggle included={b.included} onToggle={() => updateSectionItem('competitive_window', 'benchmarks', i, 'included', !b.included)} />
                  {b.channel_thumbnail_url && <img src={b.channel_thumbnail_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />}
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>{b.channel_name}</span>
                  <span style={{ fontSize: '10px', color: '#888' }}>{(b.subscriber_count || 0).toLocaleString()} subs</span>
                  <select
                    value={b.benchmark_type}
                    onChange={e => updateSectionItem('competitive_window', 'benchmarks', i, 'benchmark_type', e.target.value)}
                    style={{ marginLeft: 'auto', fontSize: '10px', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#ccc', padding: '2px 6px' }}
                  >
                    <option value="direct_competitor">Direct Competitor</option>
                    <option value="aspirational">Aspirational</option>
                    <option value="cautionary">Cautionary</option>
                  </select>
                </div>
                <EditableInput value={b.approach_description} onChange={v => updateSectionItem('competitive_window', 'benchmarks', i, 'approach_description', v)} placeholder="One-line description of their YouTube approach..." />
                <EditableInput value={b.strongest_format} onChange={v => updateSectionItem('competitive_window', 'benchmarks', i, 'strongest_format', v)} placeholder="Strongest format and why it works..." />
                <EditableInput value={b.client_connection} onChange={v => updateSectionItem('competitive_window', 'benchmarks', i, 'client_connection', v)} placeholder="How this connects to the audited channel's opportunity..." />
              </div>
            ))}
            <EditableTextarea
              value={sections.competitive_window.narrative}
              onChange={v => updateSection('competitive_window', 'narrative', v)}
              placeholder="Competitive urgency narrative..."
              rows={3}
              label="Narrative"
            />
          </SectionEditor>

          {/* ── 5. What We Would Build ── */}
          <SectionEditor
            title="5. What We Would Build"
            subtitle="Named show concepts — answer 'what would we be paying you to do?'"
            color="#ec4899"
            section={sections.what_we_build}
            isExpanded={expandedSection === 'what_we_build'}
            onToggleExpand={() => setExpandedSection(expandedSection === 'what_we_build' ? null : 'what_we_build')}
            onToggleInclude={() => updateSection('what_we_build', 'included', !sections.what_we_build.included)}
          >
            {sections.what_we_build.show_concepts.map((show, i) => (
              <div key={i} style={{
                background: '#252525', borderRadius: '8px', padding: '14px', marginBottom: '10px',
                opacity: show.included ? 1 : 0.5,
                borderLeft: `3px solid ${show.included ? '#ec4899' : '#444'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <ItemToggle included={show.included} onToggle={() => updateSectionItem('what_we_build', 'show_concepts', i, 'included', !show.included)} />
                  <EditableInput value={show.show_name} onChange={v => updateSectionItem('what_we_build', 'show_concepts', i, 'show_name', v)} placeholder="Show name..." />
                </div>
                <EditableInput value={show.premise} onChange={v => updateSectionItem('what_we_build', 'show_concepts', i, 'premise', v)} placeholder="One-line premise..." />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <EditableInput value={show.format_length} onChange={v => updateSectionItem('what_we_build', 'show_concepts', i, 'format_length', v)} placeholder="e.g. 8-12 minutes" label="Length" />
                  <EditableInput value={show.cadence} onChange={v => updateSectionItem('what_we_build', 'show_concepts', i, 'cadence', v)} placeholder="e.g. Weekly" label="Cadence" />
                </div>
                <EditableInput value={show.shorts_atomization} onChange={v => updateSectionItem('what_we_build', 'show_concepts', i, 'shorts_atomization', v)} placeholder="Shorts plan..." label="Shorts Atomization" />
                <EditableInput value={show.snowball_logic} onChange={v => updateSectionItem('what_we_build', 'show_concepts', i, 'snowball_logic', v)} placeholder="Why this compounds..." label="Snowball Logic" />
                <EditableInput value={show.brand_fit} onChange={v => updateSectionItem('what_we_build', 'show_concepts', i, 'brand_fit', v)} placeholder="Brand connection..." label="Brand Fit" />
              </div>
            ))}
          </SectionEditor>

          {/* ── 6. Path Forward ── */}
          <SectionEditor
            title="6. The Path Forward"
            subtitle="Close — remove ambiguity"
            color="#f97316"
            section={sections.path_forward}
            isExpanded={expandedSection === 'path_forward'}
            onToggleExpand={() => setExpandedSection(expandedSection === 'path_forward' ? null : 'path_forward')}
            onToggleInclude={() => updateSection('path_forward', 'included', !sections.path_forward.included)}
          >
            <EditableTextarea
              value={sections.path_forward.conviction_statement}
              onChange={v => updateSection('path_forward', 'conviction_statement', v)}
              placeholder="One sentence strategic conviction..."
              rows={2}
              label="Conviction Statement"
            />
            {sections.path_forward.phases.map((phase, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'flex-start' }}>
                <div style={{
                  background: '#f97316', color: '#fff', fontSize: '10px', fontWeight: '700',
                  padding: '4px 8px', borderRadius: '4px', flexShrink: 0, marginTop: '6px',
                }}>
                  {phase.label}
                </div>
                <div style={{ flex: 1 }}>
                  <EditableInput
                    value={phase.description}
                    onChange={v => {
                      setReport(prev => {
                        const phases = [...prev.sections.path_forward.phases];
                        phases[i] = { ...phases[i], description: v };
                        return { ...prev, sections: { ...prev.sections, path_forward: { ...prev.sections.path_forward, phases } } };
                      });
                    }}
                    placeholder="What happens in this phase..."
                  />
                </div>
              </div>
            ))}
            <EditableTextarea
              value={sections.path_forward.cta}
              onChange={v => updateSection('path_forward', 'cta', v)}
              placeholder="Clear call to action..."
              rows={2}
              label="Call to Action"
            />
          </SectionEditor>
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible Section Wrapper ───────────────────────────────────────

function SectionEditor({ title, subtitle, color, section, isExpanded, onToggleExpand, onToggleInclude, children }) {
  return (
    <div style={{ borderBottom: '1px solid #333' }}>
      <div
        onClick={onToggleExpand}
        style={{ cursor: 'pointer' }}
      >
        <SectionHeader title={title} subtitle={subtitle} included={section.included} onToggle={(e) => { e.stopPropagation(); onToggleInclude(); }} color={color} />
      </div>
      {isExpanded && (
        <div style={{ padding: '16px 20px' }}>
          {children}
        </div>
      )}
    </div>
  );
}
