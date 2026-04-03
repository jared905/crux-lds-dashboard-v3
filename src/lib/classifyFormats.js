const FORMATS = [
  { name: 'tutorial', regex: /\b(tutorial|how to|guide|learn|teach|step by step|tips|tricks)\b/i },
  { name: 'review', regex: /\b(review|reaction|reacts?|responds?|first time|listening to|watching)\b/i },
  { name: 'vlog', regex: /\b(vlog|behind|day in|life|personal|story|journey|update)\b/i },
  { name: 'comparison', regex: /\b(vs\.?|versus|compare|comparison|battle)\b/i },
  { name: 'listicle', regex: /\b(top \d+|best|worst|\d+ (things|ways|tips|reasons))\b/i },
  { name: 'challenge', regex: /\b(challenge|try|attempt|test|experiment)\b/i },
];

export function classifyTitle(title) {
  if (!title) return null;
  return FORMATS.find(f => f.regex.test(title))?.name ?? null;
}

/**
 * Returns { [formatName]: { count, pct } } for a set of videos.
 * Expects objects with a `title` property.
 */
export function classifyVideos(videos) {
  const counts = Object.fromEntries(FORMATS.map(f => [f.name, 0]));
  for (const v of videos) {
    const fmt = classifyTitle(v.title);
    if (fmt) counts[fmt]++;
  }
  const total = videos.length || 1;
  return Object.fromEntries(
    Object.entries(counts).map(([name, count]) => [name, { count, pct: Math.round((count / total) * 100) }])
  );
}

export { FORMATS };
