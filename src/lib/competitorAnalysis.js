/**
 * Competitor Analysis Utility Functions
 *
 * Provides pattern detection, schedule analysis, and format categorization
 * for competitor YouTube channels.
 */

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

/**
 * Analyze title patterns in videos to identify what works
 * @param {Array} videos - Array of video objects with title, views, etc.
 * @returns {Object} Pattern analysis results + top 10 videos for thumbnails
 */
export function analyzeTitlePatterns(videos) {
  if (!videos || videos.length < 10) return null;

  // Sort by views to identify top performers
  const sortedByViews = [...videos].sort((a, b) => b.views - a.views);
  const top20Percent = Math.max(3, Math.ceil(videos.length * 0.2));
  const topVideos = sortedByViews.slice(0, top20Percent);

  // Pattern definitions
  const patterns = [
    {
      name: 'Question Titles',
      regex: /\?/,
      icon: '❓',
      insight: 'Questions create curiosity gaps'
    },
    {
      name: 'Numbers/Lists',
      regex: /\d+/,
      icon: '🔢',
      insight: 'Data-driven titles build credibility'
    },
    {
      name: 'ALL CAPS Words',
      regex: /\b[A-Z]{3,}\b/,
      icon: '📢',
      insight: 'Emphasis creates visual contrast'
    },
    {
      name: 'Parentheses/Brackets',
      regex: /[\(\[\{]/,
      icon: '📎',
      insight: 'Adds context or urgency'
    },
    {
      name: 'First Person (I/My)',
      regex: /\b(I|My|We|Our)\b/i,
      icon: '👤',
      insight: 'Personal connection with audience'
    },
    {
      name: 'Negative Words',
      regex: /\b(never|stop|avoid|worst|fail|bad|terrible|don't)\b/i,
      icon: '⚠️',
      insight: 'Problem-focused content drives clicks'
    },
    {
      name: 'Power Words',
      regex: /\b(secret|ultimate|best|perfect|complete|easy|simple|amazing)\b/i,
      icon: '💪',
      insight: 'High-impact adjectives boost CTR'
    }
  ];

  // Calculate pattern frequency in top videos vs all videos
  const patternResults = patterns.map(pattern => {
    const topMatches = topVideos.filter(v => pattern.regex.test(v.title)).length;
    const allMatches = videos.filter(v => pattern.regex.test(v.title)).length;

    const topFrequency = topMatches / topVideos.length;
    const allFrequency = allMatches / videos.length;

    return {
      ...pattern,
      topFrequency,
      allFrequency,
      topCount: topMatches,
      allCount: allMatches
    };
  });

  // Sort by frequency in top videos
  const sortedPatterns = patternResults
    .filter(p => p.topCount >= 2) // At least 2 examples in top videos
    .sort((a, b) => b.topFrequency - a.topFrequency);

  // Average title length analysis
  const avgTopTitleLength = topVideos.reduce((sum, v) => sum + v.title.length, 0) / topVideos.length;
  const avgAllTitleLength = videos.reduce((sum, v) => sum + v.title.length, 0) / videos.length;

  // Get top 10 videos for thumbnail display
  const top10Videos = sortedByViews.slice(0, 10);

  return {
    patterns: sortedPatterns,
    avgTopTitleLength: Math.round(avgTopTitleLength),
    avgAllTitleLength: Math.round(avgAllTitleLength),
    topVideoCount: topVideos.length,
    totalVideoCount: videos.length,
    top10Videos
  };
}

/**
 * Helper function to convert UTC hour to specified timezone
 * @param {number} utcHour - Hour in UTC (0-23)
 * @param {number} offsetHours - Timezone offset in hours
 * @returns {number} Hour in target timezone (0-23)
 */
export function convertTimeToTimezone(utcHour, offsetHours) {
  let converted = utcHour + offsetHours;
  if (converted < 0) converted += 24;
  if (converted >= 24) converted -= 24;
  return converted;
}

/**
 * Get timezone offset from timezone name
 * @param {string} timezoneName - IANA timezone name (e.g., "America/New_York")
 * @returns {number} Offset in hours from UTC
 */
export function getTimezoneOffset(timezoneName) {
  try {
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezoneName }));
    const offsetMs = tzDate.getTime() - utcDate.getTime();
    return offsetMs / (1000 * 60 * 60); // Convert to hours
  } catch (e) {
    return 0; // Default to UTC if timezone is invalid
  }
}

/**
 * Analyze upload schedule patterns
 * @param {Array} videos - Array of video objects with publishedAt timestamps
 * @param {string} userTimezone - User's timezone (IANA format)
 * @returns {Object} Schedule analysis results
 */
export function analyzeUploadSchedule(videos, userTimezone = 'UTC') {
  if (!videos || videos.length < 5) return null;

  const videosWithDates = videos.filter(v => v.publishedAt);
  if (videosWithDates.length < 5) return null;

  const timezoneOffset = getTimezoneOffset(userTimezone);

  // Parse publish dates
  const enrichedVideos = videosWithDates.map(v => {
    const date = new Date(v.publishedAt);
    const utcHour = date.getUTCHours();
    const localHour = convertTimeToTimezone(utcHour, timezoneOffset);

    return {
      ...v,
      date,
      dayOfWeek: date.getUTCDay(), // 0 = Sunday, 6 = Saturday
      utcHour,
      localHour,
      weekNumber: Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000))
    };
  });

  // 1. Best Day of Week Analysis
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayStats = Array.from({ length: 7 }, (_, dayIndex) => {
    const dayVideos = enrichedVideos.filter(v => v.dayOfWeek === dayIndex);
    if (dayVideos.length === 0) return null;

    const avgViews = dayVideos.reduce((sum, v) => sum + v.views, 0) / dayVideos.length;
    return {
      day: dayNames[dayIndex],
      dayIndex,
      count: dayVideos.length,
      avgViews,
      videos: dayVideos
    };
  }).filter(Boolean);

  const bestDay = dayStats.length > 0
    ? [...dayStats].sort((a, b) => b.avgViews - a.avgViews)[0]
    : null;

  // 2. Best Time of Day Analysis (in 6-hour blocks for user's timezone)
  const timeBlocks = [
    { name: 'Night', displayName: 'Night (12am-6am)', start: 0, end: 6 },
    { name: 'Morning', displayName: 'Morning (6am-12pm)', start: 6, end: 12 },
    { name: 'Afternoon', displayName: 'Afternoon (12pm-6pm)', start: 12, end: 18 },
    { name: 'Evening', displayName: 'Evening (6pm-12am)', start: 18, end: 24 }
  ];

  const timeStats = timeBlocks.map(block => {
    const blockVideos = enrichedVideos.filter(v =>
      v.localHour >= block.start && v.localHour < block.end
    );

    if (blockVideos.length === 0) return null;

    const avgViews = blockVideos.reduce((sum, v) => sum + v.views, 0) / blockVideos.length;
    return {
      ...block,
      count: blockVideos.length,
      avgViews
    };
  }).filter(Boolean);

  const bestTime = timeStats.length > 0
    ? [...timeStats].sort((a, b) => b.avgViews - a.avgViews)[0]
    : null;

  // 3. Upload Cadence Consistency
  const sortedByDate = [...enrichedVideos].sort((a, b) => a.date - b.date);
  const intervals = [];
  for (let i = 1; i < sortedByDate.length; i++) {
    const daysBetween = (sortedByDate[i].date - sortedByDate[i-1].date) / (1000 * 60 * 60 * 24);
    intervals.push(daysBetween);
  }

  const avgInterval = intervals.length > 0
    ? intervals.reduce((sum, i) => sum + i, 0) / intervals.length
    : 0;

  const variance = intervals.length > 0
    ? intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length
    : 0;

  const stdDev = Math.sqrt(variance);
  const consistencyScore = avgInterval > 0
    ? Math.max(0, Math.min(100, 100 - (stdDev / avgInterval * 100)))
    : 0;

  // 4. Frequency vs Performance Correlation
  const weeklyData = {};
  enrichedVideos.forEach(v => {
    if (!weeklyData[v.weekNumber]) {
      weeklyData[v.weekNumber] = { uploads: 0, totalViews: 0, videos: [] };
    }
    weeklyData[v.weekNumber].uploads++;
    weeklyData[v.weekNumber].totalViews += v.views;
    weeklyData[v.weekNumber].videos.push(v);
  });

  const weeklyStats = Object.values(weeklyData).map(week => ({
    uploads: week.uploads,
    avgViews: week.totalViews / week.uploads
  }));

  // Simple correlation calculation
  let correlation = 0;
  if (weeklyStats.length > 3) {
    const avgUploads = weeklyStats.reduce((sum, w) => sum + w.uploads, 0) / weeklyStats.length;
    const avgViewsPerWeek = weeklyStats.reduce((sum, w) => sum + w.avgViews, 0) / weeklyStats.length;

    const covariance = weeklyStats.reduce((sum, w) =>
      sum + (w.uploads - avgUploads) * (w.avgViews - avgViewsPerWeek), 0
    ) / weeklyStats.length;

    const uploadsStdDev = Math.sqrt(
      weeklyStats.reduce((sum, w) => sum + Math.pow(w.uploads - avgUploads, 2), 0) / weeklyStats.length
    );
    const viewsStdDev = Math.sqrt(
      weeklyStats.reduce((sum, w) => sum + Math.pow(w.avgViews - avgViewsPerWeek, 2), 0) / weeklyStats.length
    );

    correlation = uploadsStdDev * viewsStdDev > 0
      ? covariance / (uploadsStdDev * viewsStdDev)
      : 0;
  }

  return {
    dayStats,
    bestDay,
    timeStats,
    bestTime,
    avgInterval: Math.round(avgInterval * 10) / 10,
    consistencyScore: Math.round(consistencyScore),
    correlation: Math.round(correlation * 100) / 100,
    totalVideosAnalyzed: enrichedVideos.length,
    timezone: userTimezone
  };
}

/**
 * Categorize videos by content format
 * @param {Array} videos - Array of video objects
 * @returns {Object} Format categorization results
 */
export function categorizeContentFormats(videos) {
  if (!videos || videos.length === 0) return null;

  // Content type patterns
  const contentTypes = [
    {
      name: 'Tutorial/How-To',
      regex: /\b(tutorial|how to|guide|learn|teach|step by step|tips|tricks)\b/i,
      color: '#3b82f6',
      icon: '📚'
    },
    {
      name: 'Review/Reaction',
      regex: /\b(review|reaction|reacts?|responds?|first time|listening to|watching)\b/i,
      color: '#ec4899',
      icon: '💬'
    },
    {
      name: 'Vlog/Behind-the-Scenes',
      regex: /\b(vlog|behind|day in|life|personal|story|journey|update)\b/i,
      color: '#f59e0b',
      icon: '🎬'
    },
    {
      name: 'Comparison/VS',
      regex: /\b(vs\.?|versus|compare|comparison|battle)\b/i,
      color: '#10b981',
      icon: '⚔️'
    },
    {
      name: 'Listicle/Top X',
      regex: /\b(top \d+|best|worst|\d+ (things|ways|tips|reasons))\b/i,
      color: '#8b5cf6',
      icon: '🔢'
    },
    {
      name: 'Challenge',
      regex: /\b(challenge|try|attempt|test|experiment)\b/i,
      color: '#ef4444',
      icon: '🎯'
    }
  ];

  // Categorize each video (first match wins)
  const categorizedVideos = videos.map(video => {
    const matchedType = contentTypes.find(type => type.regex.test(video.title));

    return {
      ...video,
      contentType: matchedType ? matchedType.name : 'Other',
      contentTypeColor: matchedType ? matchedType.color : '#666',
      contentTypeIcon: matchedType ? matchedType.icon : '📹'
    };
  });

  // Calculate stats per content type
  const typeStats = contentTypes.map(type => {
    const typeVideos = categorizedVideos.filter(v => v.contentType === type.name);
    if (typeVideos.length === 0) return null;

    const avgViews = typeVideos.reduce((sum, v) => sum + v.views, 0) / typeVideos.length;
    const totalViews = typeVideos.reduce((sum, v) => sum + v.views, 0);

    return {
      ...type,
      count: typeVideos.length,
      avgViews,
      totalViews,
      percentage: (typeVideos.length / videos.length) * 100,
      topVideo: [...typeVideos].sort((a, b) => b.views - a.views)[0]
    };
  }).filter(Boolean).sort((a, b) => b.count - a.count);

  // "Other" category
  const otherVideos = categorizedVideos.filter(v => v.contentType === 'Other');
  if (otherVideos.length > 0) {
    typeStats.push({
      name: 'Other',
      color: '#666',
      icon: '📹',
      count: otherVideos.length,
      avgViews: otherVideos.reduce((sum, v) => sum + v.views, 0) / otherVideos.length,
      totalViews: otherVideos.reduce((sum, v) => sum + v.views, 0),
      percentage: (otherVideos.length / videos.length) * 100
    });
  }

  // Duration breakdown
  const shorts = videos.filter(v => v.type === 'short');
  const longs = videos.filter(v => v.type === 'long');

  const durationStats = [
    {
      name: 'Short Form (<60s)',
      count: shorts.length,
      avgViews: shorts.length > 0 ? shorts.reduce((sum, v) => sum + v.views, 0) / shorts.length : 0,
      totalViews: shorts.reduce((sum, v) => sum + v.views, 0),
      percentage: (shorts.length / videos.length) * 100,
      color: '#ec4899'
    },
    {
      name: 'Long Form (≥60s)',
      count: longs.length,
      avgViews: longs.length > 0 ? longs.reduce((sum, v) => sum + v.views, 0) / longs.length : 0,
      totalViews: longs.reduce((sum, v) => sum + v.views, 0),
      percentage: (longs.length / videos.length) * 100,
      color: '#3b82f6'
    }
  ];

  return {
    typeStats,
    durationStats,
    totalVideos: videos.length
  };
}
