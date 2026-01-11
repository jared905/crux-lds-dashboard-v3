import { channelSummary, percentile } from "./metrics.js";

export function generateInsights(rows){
  const bullets = [];
  if(!rows.length){
    return { bullets:[{level:"info", title:"No data in this filter", text:"Try widening the date range or clearing filters."}], focus:null };
  }

  const channels = channelSummary(rows);
  const views = channels.map(c=>c.views).filter(Boolean);
  const p25 = percentile(views, 0.25);

  const top = channels[0];
  if(top){
    bullets.push({ level:"good", title:"Primary driver", text:`${top.channel} is the biggest driver (${top.views.toLocaleString()} views in this selection).` });
  }

  const lowCadence = channels.filter(c => c.uploads <= 3 && c.views >= (p25 || 0)).slice(0,2);
  if(lowCadence.length){
    bullets.push({ level:"warn", title:"Low cadence channels", text:`Decent demand but low volume: ${lowCadence.map(c=>c.channel).join(", ")}. Increase cadence or batch edits.` });
  }

  const focus = channels
    .filter(c => c.avgRetention !== null && c.avgRetention !== undefined)
    .sort((a,b)=>{
      const scoreA = (a.avgRetention||0) * (1 / Math.max(1,a.uploads));
      const scoreB = (b.avgRetention||0) * (1 / Math.max(1,b.uploads));
      return scoreB - scoreA;
    })[0];

  bullets.push({ level:"info", title:"Format mix", text:`Selection includes ${rows.filter(r=>r.type==="long").length} long + ${rows.filter(r=>r.type==="short").length} short.` });

  return { bullets, focus: focus ? { channel: focus.channel, why:"High retention per upload—scales well with higher cadence." } : null };
}
