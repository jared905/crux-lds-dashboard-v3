import React, { useMemo, useState } from "react";
import { X, ClipboardCopy, CheckCircle2 } from "lucide-react";

export default function FeedbackDrawer({ open, onClose, context }){
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  const template = useMemo(()=>{
    const { rangeLabel, typeFilter, channelsLabel, kpis, sanityIssues } = context || {};
    return `CRUX Dashboard Feedback

Context
- Range: ${rangeLabel}
- Type: ${typeFilter}
- Channels: ${channelsLabel}

KPI snapshot
- Uploads: ${kpis?.uploads ?? "—"}
- Views: ${kpis?.views ?? "—"}
- Watch hours: ${kpis?.watchHours ?? "—"}
- Avg retention: ${kpis?.avgRetention ?? "—"}
- Avg CTR: ${kpis?.avgCtr ?? "—"}
- Subscribers: ${kpis?.subscribers ?? "—"}

Data integrity notes
${(sanityIssues||[]).map(i=>`- [${i.level}] ${i.text}`).join("\n") || "- none"}

My notes
${note || "<write here>"}
`;
  }, [context, note]);

  const doCopy = async () => {
    try{
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(()=>setCopied(false), 1200);
    }catch(e){
      alert("Copy failed. You can manually select and copy the text.");
    }
  };

  if(!open) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e)=>e.stopPropagation()}>
        <div className="hstack">
          <div className="h2">Client review notes</div>
          <div className="spacer" />
          <button className="btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="small" style={{marginTop:10}}>
          Capture decisions + action items during client review. Copy/paste into email/Notion/Slack.
        </div>

        <div className="mt-14">
          <div className="small" style={{fontWeight:900}}>Your notes</div>
          <textarea className="input" value={note} onChange={(e)=>setNote(e.target.value)} placeholder="What decisions were made? What tests are next? Who owns what?" />
        </div>

        <div className="mt-14">
          <button className="btn primary" onClick={doCopy}>
            {copied ? <CheckCircle2 size={16} style={{marginRight:8}} /> : <ClipboardCopy size={16} style={{marginRight:8}} />}
            {copied ? "Copied" : "Copy review summary"}
          </button>
        </div>

        <div className="mt-14">
          <div className="small" style={{fontWeight:900}}>Preview</div>
          <pre style={{
            marginTop:8,
            padding:12,
            border:"1px solid var(--border)",
            borderRadius:12,
            background:"#fbfcff",
            overflow:"auto",
            whiteSpace:"pre-wrap"
          }}>{template}</pre>
        </div>
      </div>
    </div>
  );
}
