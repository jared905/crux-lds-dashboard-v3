export const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
export const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;
