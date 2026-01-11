export function fmtInt(n){
  if(n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function fmtFloat(n, digits=1){
  if(n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(n);
}

export function fmtPct(n, digits=1){
  if(n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${fmtFloat(n*100, digits)}%`;
}

export function clamp(n, min, max){
  return Math.max(min, Math.min(max, n));
}

/**
 * More forgiving date parser.
 * Handles:
 * - JS-parsable strings (ISO, RFC, "Sep 5, 2025", timestamps with time, etc.)
 * - "MM/DD/YYYY" or "M/D/YYYY"
 * - "MM-DD-YYYY" or "M-D-YYYY"
 * - "YYYY-MM-DD"
 */
export function parseDateSafe(v){
  if(v === null || v === undefined) return null;

  const s = String(v).trim();
  if(!s || s === "-" || s === "—") return null;

  // 1) Let JS parse common formats (ISO, "Sep 5, 2025", etc.)
  const d1 = new Date(s);
  if(!Number.isNaN(d1.getTime())) return d1;

  // 2) "MM/DD/YYYY" or "MM-DD-YYYY"
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m){
    const mm = Number(m[1]), dd = Number(m[2]), yy = Number(m[3]);
    const d2 = new Date(Date.UTC(yy, mm - 1, dd));
    if(!Number.isNaN(d2.getTime())) return d2;
  }

  // 3) "YYYY-MM-DD"
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m){
    const yy = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
    const d3 = new Date(Date.UTC(yy, mm - 1, dd));
    if(!Number.isNaN(d3.getTime())) return d3;
  }

  return null;
}

export function safeNum(v){
  if(v === null || v === undefined) return null;
  if(typeof v === "number") return Number.isFinite(v) ? v : null;

  const s0 = String(v).trim();
  if(!s0) return null;

  // remove commas and percent sign
  const s = s0.replace(/,/g,"").replace(/%/g,"");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function safeStr(v){
  if(v === null || v === undefined) return "";
  return String(v).trim();
}

export function toLowerKeyed(row){
  const out = {};
  for(const k of Object.keys(row||{})){
    out[String(k).trim().toLowerCase()] = row[k];
  }
  return out;
}

export function pickFirst(rowLower, aliases){
  for(const a of aliases){
    const key = a.toLowerCase();
    if(key in rowLower) return rowLower[key];
  }
  return undefined;
}
