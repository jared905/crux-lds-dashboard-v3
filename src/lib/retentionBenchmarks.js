/**
 * Duration-adjusted retention expectations — industry-typical averages
 * by video length. Single source shared by the Impact Funnel and the
 * KPI row so "expected" always means the same thing.
 */
export const getExpectedRetention = (durationSeconds) => {
  const mins = (durationSeconds || 300) / 60;
  if (mins < 1) return 0.70;
  if (mins < 3) return 0.50;
  if (mins < 5) return 0.45;
  if (mins < 10) return 0.375;
  if (mins < 20) return 0.325;
  if (mins < 30) return 0.275;
  if (mins < 60) return 0.225;
  return 0.175;
};

/** View-weighted expected retention for a set of videos ("this mix"). */
export const expectedRetentionForMix = (rows) => {
  let num = 0, den = 0;
  for (const r of rows || []) {
    const w = r.views || 0;
    if (w <= 0) continue;
    num += getExpectedRetention(r.duration || r.durationSeconds) * w;
    den += w;
  }
  return den > 0 ? num / den : null;
};
