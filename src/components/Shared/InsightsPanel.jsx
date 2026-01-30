import React from "react";

export default function InsightsPanel({ insights }){
  const { bullets, focus } = insights;

  return (
    <div className="card p-18 mt-14">
      <div className="hstack">
        <div className="h2">Strategic insights</div>
        <div className="spacer" />
        {focus ? <span className="badge">Focus: {focus.channel}</span> : null}
      </div>

      <div style={{marginTop:12, display:"grid", gap:10}}>
        {bullets.map((b, idx)=>(
          <div key={idx} className="card" style={{
            boxShadow:"none",
            borderColor: b.level==="warn" ? "rgba(217,119,6,.35)" : b.level==="good" ? "rgba(31,157,98,.35)" : "var(--border)",
            padding:"12px 12px"
          }}>
            <div style={{fontWeight:1000}}>{b.title}</div>
            <div className="small" style={{marginTop:4, color:"#2a3447"}}>{b.text}</div>
          </div>
        ))}
      </div>

      {focus ? (
        <div className="small" style={{marginTop:12}}>
          Recommended focus: <b>{focus.channel}</b> — {focus.why}
        </div>
      ) : null}
    </div>
  );
}
