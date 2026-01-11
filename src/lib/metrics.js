import { clamp } from "./utils.js";

export function filterRows(rows, { range, channels, typeFilter, query }){
  const now = new Date();
  const startEnd = (() => {
    if(!range || range.kind === "all") return { start: null, end: null };
    if(range.kind === "last7") return { start: new Date(now.getTime() - 7*24*3600*1000), end: now };
    if(range.kind === "last30") return { start: new Date(now.getTime() - 30*24*3600*1000), end: now };
    if(range.kind === "last90") return { start: new Date(now.getTime() - 90*24*3600*1000), end: now };
    if(range.kind === "ytd") return { start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), end: now };
    if(range.kind === "custom") return { start: range.start ?? null, end: range.end ?? null };
    return { start: null, end: null };
  })();

  const q = (query || "").trim().toLowerCase();

  return rows.filter(r => {
    if(channels?.length && !channels.includes(r.channel)) return false;
    if(typeFilter && typeFilter !== "all" && r.type !== typeFilter) return false;

    if(startEnd.start && r.publishDate){
      if(r.publishDate < startEnd.start) return false;
    }
    if(startEnd.end && r.publishDate){
      if(r.publishDate > startEnd.end) return false;
    }
    if(q){
      const hay = `${r.title} ${r.channel}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

export function weightedAvg(rows, valueFn, weightFn){
  let num = 0;
  let den = 0;
  for(const r of rows){
    const v = valueFn(r);
    if(v === null || v === undefined || Number.isNaN(v)) continue;
    const w = Math.max(1, weightFn(r) || 1);
    num += v * w;
    den += w;
  }
  if(!den) return null;
  return num / den;
}

export function computeKpis(rows){
  const uploads = rows.length;
  const views = rows.reduce((a,r)=>a+(r.views||0),0);

  const watchHoursKnown = rows.filter(r => r.watchHours !== null && r.watchHours !== undefined);
  const watchHours = watchHoursKnown.length ? watchHoursKnown.reduce((a,r)=>a+(r.watchHours||0),0) : null;

  const weight = (r) => (r.impressions ?? r.views ?? 1) || 1;
  const avgRetention = weightedAvg(rows, r => r.avgViewPct, weight);
  const avgCtr = weightedAvg(rows, r => r.ctr, weight);

  const shorts = rows.filter(r => r.type === "short").length;
  const longs = rows.filter(r => r.type === "long").length;

  const subsKnown = rows.filter(r => r.subscribers !== null && r.subscribers !== undefined);
  const subscribers = subsKnown.length ? subsKnown.reduce((a,r)=>a+(r.subscribers||0),0) : null;

  return { uploads, views, watchHours, avgRetention, avgCtr, shorts, longs, subscribers };
}

export function groupBy(rows, keyFn){
  const m = new Map();
  for(const r of rows){
    const k = keyFn(r);
    if(!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

export function rollupByDay(rows){
  const m = new Map();
  for(const r of rows){
    if(!r.publishDate) continue;
    const key = new Date(r.publishDate).toISOString().slice(0,10);
    const cur = m.get(key) || { date:key, views:0, uploads:0 };
    cur.views += (r.views||0);
    cur.uploads += 1;
    m.set(key, cur);
  }
  return Array.from(m.values()).sort((a,b)=> a.date.localeCompare(b.date));
}

export function topVideos(rows, n=8){
  return [...rows].sort((a,b)=> (b.views||0) - (a.views||0)).slice(0,n);
}

export function channelSummary(rows){
  const by = groupBy(rows, r=>r.channel);
  const out = [];
  for(const [channel, items] of by.entries()){
    const k = computeKpis(items);
    out.push({ channel, ...k });
  }
  out.sort((a,b)=> b.views - a.views);
  return out;
}

export function sanityChecks(rows){
  const issues = [];
  const missingDates = rows.filter(r=>!r.publishDate).length;
  const missingChannel = rows.filter(r=>!r.channel || r.channel==="Unknown").length;
  const missingWatch = rows.filter(r=>r.watchHours===null || r.watchHours===undefined).length;

  if(missingDates) issues.push({ level:"warn", text:`${missingDates} row(s) missing publish date.`});
  if(missingChannel) issues.push({ level:"warn", text:`${missingChannel} row(s) missing channel/leader.`});
  if(missingWatch) issues.push({ level:"info", text:`${missingWatch} row(s) missing watch-hours.`});

  const suspicious = rows.filter(r=>{
    if(r.watchHours===null || r.watchHours===undefined) return false;
    if(!r.views) return false;
    const avgMinutes = (r.watchHours*60) / r.views;
    return avgMinutes > 120;
  }).slice(0,3);

  if(suspicious.length){
    issues.push({ level:"warn", text:`Potential watch-time unit mismatch: some videos imply >120 min average view duration.`});
  }

  return issues;
}

export function percentile(values, p){
  if(!values.length) return null;
  const v = [...values].sort((a,b)=>a-b);
  const idx = clamp((v.length-1)*p, 0, v.length-1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if(lo === hi) return v[lo];
  const t = idx - lo;
  return v[lo]*(1-t) + v[hi]*t;
}
