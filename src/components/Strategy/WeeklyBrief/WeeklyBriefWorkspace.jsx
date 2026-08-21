/**
 * WeeklyBriefWorkspace — Strategy / Brief tab.
 *
 * The translation layer between Crux's analytical surfaces and the
 * strategist's client-facing recommendations. One click: "Generate
 * brief" → reads the latest repositioning audit + calibration + Spine
 * + business context + cohort composition → produces a 4-5 bullet
 * brief the strategist can copy-paste to a client.
 *
 * Mental model:
 *   Pre-flight / Repositioning / Competitor Scan / Calibration → diagnose
 *   Cohort roles                                                → control
 *   Weekly Brief                                                → ACT
 *
 * The brief is the artifact that makes every other surface earn its
 * keep. Without it, the strategist still has to translate "21% Shorts
 * calibration" into "ignore Shorts predictions for now" themselves.
 *
 * UI principles:
 *   - One primary action: "Generate this week's brief"
 *   - The brief renders as markdown; "Copy as markdown" puts it on
 *     clipboard for the strategist to paste into email / Slack / Notion
 *   - History of past briefs lets strategists compare what they
 *     recommended over time vs what changed in the data
 *   - Source-data pinning shows which audit + calibration each brief
 *     was drafted against (so reading an old brief isn't confusing)
 */

import {useEffect, useState} from 'react';
import { generateWeeklyBrief } from '../../../services/weeklyBriefService.js';
import {
  saveBrief, listBriefsForClient, loadBrief, archiveBrief,
} from '../../../services/weeklyBriefsService.js';
import BrandLoader from '../../Shared/Loading.jsx';
import DataFreshnessBadge from '../shared/DataFreshnessBadge.jsx';
import PrelaunchBadge from '../shared/PrelaunchBadge.jsx';

export default function WeeklyBriefWorkspace({ activeClient }) {
  const clientId = activeClient?.id;

  const [bootLoading, setBootLoading]     = useState(true);
  const [bootError, setBootError]         = useState(null);
  const [briefs, setBriefs]               = useState([]);
  const [selectedBrief, setSelectedBrief] = useState(null);
  const [generating, setGenerating]       = useState(false);
  const [genError, setGenError]           = useState(null);
  const [copied, setCopied]               = useState(false);

  useEffect(() => {
    if (!clientId) { setBootLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setBootLoading(true);
      setBootError(null);
      try {
        const res = await listBriefsForClient(clientId, { limit: 12 });
        if (cancelled) return;
        setBriefs(res?.briefs || []);
      } catch (err) {
        if (!cancelled) setBootError(err?.message || 'Couldn’t load past briefs. Check your connection and try again.');
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (!clientId) {
    return (
      <div style={emptyShellStyle}>
        <div style={emptyHeaderStyle}>Weekly brief</div>
        <div style={emptyBodyStyle}>
          Pick a client from <strong style={{ color: 'var(--text)' }}>Portfolio → Clients</strong> first.
          The brief generator reads the latest repositioning audit + calibration + Strategy Spine
          for the active client.
        </div>
      </div>
    );
  }

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const result = await generateWeeklyBrief({
        clientId,
        clientName: activeClient?.name,
      });
      if (result.error) { setGenError(result.error); return; }

      const saved = await saveBrief({
        clientId,
        sourceAuditId:         result.sourceAuditId,
        sourceCalibrationRunId: result.sourceCalibrationRunId,
        briefMarkdown:         result.text,
        promptVersion:         result.promptVersion,
        model:                 result.model,
        // v6 (2026-06-12): persist draft + critique for diagnostics.
        draftMarkdown:         result.draftText || null,
        critiqueMarkdown:      result.critiqueText || null,
        revisionApplied:       result.revisionApplied ?? null,
      });

      if (saved?.ok) {
        const refreshed = await listBriefsForClient(clientId, { limit: 12 });
        setBriefs(refreshed?.briefs || []);
        setSelectedBrief({
          id:                         saved.id,
          created_at:                 saved.createdAt,
          source_audit_id:            result.sourceAuditId,
          source_calibration_run_id:  result.sourceCalibrationRunId,
          brief_markdown:             result.text,
          prompt_version:             result.promptVersion,
          model:                      result.model,
        });
      } else {
        // 2026-06-12: previously this branch did nothing, so a save
        // failure (e.g. missing migration) looked like "brief didn't
        // generate." Surface the error and the generated brief in
        // memory so the strategist can at least copy the text.
        setGenError(saved?.error
          ? `Brief generated but save failed: ${saved.error}`
          : 'Your brief is ready, but it didn’t save. Copy it now so you don’t lose it.');
        setSelectedBrief({
          id:                         null,
          created_at:                 new Date().toISOString(),
          source_audit_id:            result.sourceAuditId,
          source_calibration_run_id:  result.sourceCalibrationRunId,
          brief_markdown:             result.text,
          prompt_version:             result.promptVersion,
          model:                      result.model,
        });
      }
    } catch (err) {
      setGenError(err?.message || 'generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleLoad = async (briefId) => {
    const res = await loadBrief(briefId);
    if (res.ok) setSelectedBrief(res.brief);
  };

  const handleArchive = async (briefId) => {
    // Confirmation is the two-step armed button in the row — no dialog.
    await archiveBrief(briefId);
    const list = await listBriefsForClient(clientId, { limit: 12 });
    setBriefs(list?.briefs || []);
    if (selectedBrief?.id === briefId) setSelectedBrief(null);
  };

  const handleCopy = async () => {
    if (!selectedBrief?.brief_markdown) return;
    try {
      await navigator.clipboard.writeText(selectedBrief.brief_markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {/* silent — clipboard always works in HTTPS contexts */}
  };

  return (
    <div style={workspaceShellStyle}>
      <div style={workspaceHeaderStyle}>
        <div style={kickerStyle}>Strategy · Weekly brief</div>
        <h1 style={titleStyle}>
          {activeClient.name}
          <span style={{ marginLeft: 12, display: 'inline-block', verticalAlign: 'middle' }}>
            <PrelaunchBadge client={activeClient} />
          </span>
        </h1>
        <div style={subtitleStyle}>
          Translates the analytical state (repositioning audit + calibration + Strategy Spine + cohort
          composition) into a 4-5 bullet client-facing brief. Action-led, evidence-cited,
          calibration-honest. The artifact you'd actually send the client — not the analytics
          beneath it.
        </div>
        <div style={{ marginTop: 10 }}>
          <DataFreshnessBadge clientId={clientId} />
        </div>
      </div>

      {bootLoading && <BrandLoader size={32} label="Loading past briefs…" style={{ padding: "28px 20px" }} />}
      {bootError && <Note tone="error">{bootError}</Note>}

      {!bootLoading && (
        <>
          <GenerateBar
            generating={generating}
            onGenerate={handleGenerate}
            briefsCount={briefs.length}
          />
          {genError && <Note tone="error">{genError}</Note>}

          <BriefsList
            briefs={briefs}
            selectedId={selectedBrief?.id}
            onLoad={handleLoad}
            onArchive={handleArchive}
          />

          {selectedBrief && (
            <BriefDetail
              brief={selectedBrief}
              copied={copied}
              onCopy={handleCopy}
            />
          )}
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Generate bar
// ──────────────────────────────────────────────────

function GenerateBar({ generating, onGenerate, briefsCount }) {
  return (
    <div style={generateBarStyle}>
      <div style={{ flex: 1 }}>
        <div style={kickerSmallStyle}>{briefsCount > 0 ? 'Generate a new brief' : 'Start here'}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
          Generates a fresh brief from the latest repositioning audit + latest calibration run +
          current Strategy Spine + cohort composition. Honors brand register, cites calibration
          accuracy, names specific videos when relevant. Takes ~5-10 seconds.
        </div>
      </div>
      <button onClick={onGenerate} disabled={generating} style={generateBtnStyle(generating)}>
        {generating ? 'Drafting…' : 'Generate brief'}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Briefs list
// ──────────────────────────────────────────────────

function BriefsList({ briefs, selectedId, onLoad, onArchive }) {
  // Two-step inline confirm: first click arms ("Sure?"), second executes,
  // 4s or any other row disarms. Replaces window.confirm.
  const [armedId, setArmedId] = useState(null);
  if (!briefs?.length) return null;
  const askArchive = (id) => {
    if (armedId !== id) {
      setArmedId(id);
      setTimeout(() => setArmedId(a => (a === id ? null : a)), 4000);
      return;
    }
    setArmedId(null);
    onArchive(id);
  };
  return (
    <div style={{ marginTop: 18 }}>
      <div style={kickerSmallStyle}>Past briefs</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {briefs.map(b => (
          <div key={b.id} style={listRowStyle(b.id === selectedId)}>
            <div style={{ flex: 1 }}>
              <div style={listRowDateStyle}>
                {b.title || `Brief · ${new Date(b.created_at).toLocaleString()}`}
              </div>
              <div style={listRowMetaStyle}>
                {!b.title && b.prompt_version && `prompt ${b.prompt_version}`}
                {b.model && ` · ${b.model}`}
              </div>
            </div>
            <button onClick={() => onLoad(b.id)} style={smallBtnStyle}>Open</button>
            <button
              onClick={() => askArchive(b.id)}
              style={{ ...smallBtnStyle, ...(armedId === b.id ? { background: 'var(--warn)', color: 'var(--bg)', fontWeight: 700 } : {}) }}
              title={armedId === b.id ? 'Click again to archive' : 'Archive this brief'}
            >{armedId === b.id ? 'Sure?' : 'Archive'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Brief detail (the artifact itself)
// ──────────────────────────────────────────────────

function BriefDetail({ brief, copied, onCopy }) {
  return (
    <div style={detailShellStyle}>
      <div style={detailHeaderStyle}>
        <div>
          <div style={kickerStyle}>
            {brief.title || `Brief · ${new Date(brief.created_at).toLocaleString()}`}
          </div>
          <div style={detailMetaStyle}>
            Generated {new Date(brief.created_at).toLocaleString()}
            {brief.prompt_version && ` · prompt ${brief.prompt_version}`}
            {brief.model && ` · ${brief.model}`}
          </div>
        </div>
        <button onClick={onCopy} style={copyBtnStyle}>
          {copied ? '✓ Copied' : 'Copy markdown'}
        </button>
      </div>

      <div style={briefBodyStyle}>
        {renderMarkdown(brief.brief_markdown)}
      </div>
    </div>
  );
}

// Minimal markdown renderer — same approach as ExecutiveMemoSection.
// Handles numbered lists, bullet lists, bold/italic, paragraphs, section
// headers. Heavier markdown libraries pull in too much bundle weight
// for the narrow use case.
function renderMarkdown(md) {
  if (!md) return null;
  const lines = md.split('\n');
  const nodes = [];
  let listBuf = [];
  let listType = null;     // 'ol' | 'ul'
  let paraBuf = [];

  const flushList = () => {
    if (listBuf.length) {
      const Tag = listType === 'ol' ? 'ol' : 'ul';
      nodes.push(
        <Tag key={`list-${nodes.length}`} style={{ margin: '4px 0 14px 0', paddingLeft: 26 }}>
          {listBuf.map((item, i) => (
            <li key={i} style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, marginBottom: 10 }}>
              {renderInline(item)}
            </li>
          ))}
        </Tag>
      );
      listBuf = [];
      listType = null;
    }
  };
  const flushPara = () => {
    if (paraBuf.length) {
      nodes.push(
        <p key={`p-${nodes.length}`} style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, margin: '4px 0 12px 0' }}>
          {renderInline(paraBuf.join(' '))}
        </p>
      );
      paraBuf = [];
    }
  };

  const olMatch = /^\d+\.\s+(.*)$/;
  const ulMatch = /^[-*]\s+(.*)$/;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); flushPara(); continue; }
    if (line.startsWith('## ')) {
      flushList(); flushPara();
      nodes.push(
        <h3 key={`h-${nodes.length}`} style={{ fontSize: 13, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, margin: '16px 0 8px 0' }}>
          {line.slice(3)}
        </h3>
      );
      continue;
    }
    let m;
    if ((m = line.match(olMatch))) {
      flushPara();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listBuf.push(m[1]);
      continue;
    }
    if ((m = line.match(ulMatch))) {
      flushPara();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listBuf.push(m[1]);
      continue;
    }
    flushList();
    paraBuf.push(line);
  }
  flushList(); flushPara();
  return nodes;
}

function renderInline(text) {
  const parts = [];
  let i = 0; let key = 0;
  while (i < text.length) {
    const bold = text.indexOf('**', i);
    const italic = text.indexOf('*', i);
    const isBoldFirst = bold !== -1 && (italic === -1 || bold <= italic);
    if (isBoldFirst) {
      const end = text.indexOf('**', bold + 2);
      if (end === -1) { parts.push(text.slice(i)); break; }
      if (bold > i) parts.push(text.slice(i, bold));
      parts.push(<strong key={key++} style={{ color: 'var(--text)' }}>{text.slice(bold + 2, end)}</strong>);
      i = end + 2;
    } else if (italic !== -1) {
      const end = text.indexOf('*', italic + 1);
      if (end === -1) { parts.push(text.slice(i)); break; }
      if (italic > i) parts.push(text.slice(i, italic));
      parts.push(<em key={key++} style={{ color: 'var(--muted)' }}>{text.slice(italic + 1, end)}</em>);
      i = end + 1;
    } else {
      parts.push(text.slice(i));
      break;
    }
  }
  return parts;
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

function Note({ tone, children }) {
  const palette = {
    info:  { bg: 'rgba(10,145,155,0.08)',  border: 'rgba(10,145,155,0.25)',  fg: 'var(--accent-text)' },
    warn:  { bg: 'rgba(232,168,43,0.08)',  border: 'rgba(232,168,43,0.30)',  fg: 'var(--warn)' },
    error: { bg: 'rgba(239,107,107,0.08)', border: 'rgba(239,107,107,0.30)', fg: 'var(--neg-text)' },
  }[tone] || { bg: 'var(--input-bg)', border: 'var(--outline-variant)', fg: 'var(--muted)' };
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6,
      background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg,
      fontSize: 13, margin: '14px 0',
    }}>{children}</div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const workspaceShellStyle = { padding: '20px 24px 60px', maxWidth: 1280, margin: '0 auto' };
const workspaceHeaderStyle = { marginBottom: 18 };
const kickerStyle = {
  fontSize: 11, color: 'var(--accent-text)',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 4,
};
const kickerSmallStyle = {
  fontSize: 10, color: 'var(--outline)',
  textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6,
};
const titleStyle = { fontSize: 24, fontWeight: 700, color: 'var(--ink)', margin: 0 };
const subtitleStyle = { fontSize: 13, color: 'var(--outline)', marginTop: 6, lineHeight: 1.5, maxWidth: 800 };

const emptyShellStyle = { padding: '60px 24px', maxWidth: 720, margin: '0 auto', textAlign: 'center' };
const emptyHeaderStyle = {
  fontSize: 14, color: 'var(--accent-text)',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 14,
};
const emptyBodyStyle = { fontSize: 14, color: 'var(--outline)', lineHeight: 1.6 };

const generateBarStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderLeft: '2px solid var(--border)',
  borderRadius: 6, padding: 14,
  display: 'flex', alignItems: 'center', gap: 16,
  marginTop: 14,
};
const generateBtnStyle = (generating) => ({
  background: generating ? 'var(--input-bg)' : 'var(--accent-text)',
  color: generating ? 'var(--faint)' : 'var(--bg)',
  border: generating ? '1px solid var(--border)' : 'none',
  padding: '10px 18px', borderRadius: 5,
  fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
  cursor: generating ? 'not-allowed' : 'pointer',
  whiteSpace: 'nowrap', flexShrink: 0,
});

const listRowStyle = (selected) => ({
  display: 'flex', alignItems: 'center', gap: 10,
  background: selected ? 'rgba(10,145,155,0.10)' : 'var(--card)',
  border: `1px solid ${selected ? 'rgba(10,145,155,0.40)' : 'var(--outline-variant)'}`,
  borderRadius: 5, padding: 10,
});
const listRowDateStyle = { fontSize: 13, fontWeight: 600, color: 'var(--text)' };
const listRowMetaStyle = { fontSize: 11, color: 'var(--faint)', marginTop: 2 };
const smallBtnStyle = {
  background: 'var(--input-bg)', color: 'var(--outline)',
  border: '1px solid var(--border)', borderRadius: 4,
  padding: '4px 10px', fontSize: 11, cursor: 'pointer',
};

const detailShellStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 6, padding: 22, marginTop: 18,
};
const detailHeaderStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
  borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 14,
};
const detailMetaStyle = { fontSize: 12, color: 'var(--faint)', marginTop: 4 };
const copyBtnStyle = {
  background: 'var(--input-bg)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 5,
  padding: '6px 14px', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', letterSpacing: 0.3, flexShrink: 0,
};
const briefBodyStyle = { paddingTop: 4 };
