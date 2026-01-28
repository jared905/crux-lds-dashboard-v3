# Data Integration Roadmap
**Enhanced Sentiment Change Scoring + Multi-Source Analytics**

Last Updated: 2026-01-14

---

## Executive Summary

This roadmap outlines how to transform the dashboard from measuring *engagement* (views, CTR) to measuring *influence* (sentiment change, conversions, ROI). By integrating multiple data sources with enhanced AI sentiment analysis, we can answer: **"What creative/messaging actually changes hearts and minds?"**

---

## Current State (What We Have)

✅ **YouTube Analytics** - Views, retention, CTR, impressions, subscribers  
✅ **YouTube Comments API** - Up to 1,000 comments per video with threading  
✅ **Claude AI Integration** - Sentiment analysis, theme extraction, executive summaries  
✅ **CSV Import** - Historical video performance data  
✅ **Client-side Storage** - localStorage for ephemeral data  

❌ **NO analytics platform** - Can't track user behavior on website  
❌ **NO backend database** - All data ephemeral (browser-only)  
❌ **NO URL tracking** - Can't connect video → website → conversion  
❌ **NO cross-platform data** - YouTube exists in isolation  
❌ **NO conversion attribution** - Can't prove ROI  

---

## The Vision: What This Unlocks

### Instead of:
> "Video X got 50K views and 8% CTR"

### You'll Know:
> "Video X changed sentiment +0.67 (top 5%), drove 342 website visits, generated 18 missionary requests, and attributed to 3 baptisms. ROI: 1,775%. The 'personal testimony' messaging framework outperforms 'doctrinal explanation' by 3.8x for conversions."

---

## Phase 1: Foundation (Week 1-2)
**Goal:** Start collecting baseline behavioral data

### 1. Google Analytics 4 (GA4)
**What it adds:**
- Track page views, sessions, user engagement
- Understand which dashboard features are used most
- Monitor drop-off points in user flows
- Track conversion goals

**Implementation:**
```javascript
// Track video referral in GA4
gtag('event', 'video_referral', {
  video_id: 'abc123',
  video_title: 'My Faith Journey',
  source: 'youtube',
  utm_campaign: 'faith_series_2024'
});

// Track conversions
gtag('event', 'conversion', {
  referral_video: 'abc123',
  conversion_type: 'email_signup'
});
```

**Resources Needed:**
- [ ] Google Analytics 4 account
- [ ] GA4 tracking ID
- [ ] Access permissions for website
- [ ] Developer to implement tracking code

---

### 2. UTM Parameter Tracking (Video Description Links)
**What it adds:**
- Track which videos drive clicks to specific links
- Measure effectiveness of CTAs in video descriptions
- A/B test different CTA language

**Implementation:**
```
Video Description Example:
"Learn more: https://example.com/faith-journey?utm_source=youtube&utm_medium=video&utm_campaign=faith_series&utm_content=video_abc123&utm_term=personal_testimony"
```

**URL Structure:**
- `utm_source=youtube` - Traffic came from YouTube
- `utm_medium=video` - Specific video content
- `utm_campaign=faith_series` - Campaign grouping
- `utm_content=video_abc123` - Specific video ID
- `utm_term=personal_testimony` - Content theme/topic

**Resources Needed:**
- [ ] UTM naming convention document
- [ ] Process for adding UTMs to all video descriptions
- [ ] Retroactive UTM addition to existing videos
- [ ] GA4 configured to capture UTM parameters

---

### 3. Custom Event Tracking
**What it adds:**
- Feature usage tracking (which AI features are used)
- Error/exception rates
- User interaction patterns
- Time spent in each section

**Events to Track:**
```javascript
// Dashboard feature usage
gtag('event', 'feature_used', {
  feature_name: 'ai_executive_summary',
  video_count: 5,
  focus_area: 'growth'
});

// AI API calls
gtag('event', 'ai_request', {
  feature: 'comment_analysis',
  token_count: 2500,
  cost: 0.045
});

// CSV uploads
gtag('event', 'data_upload', {
  row_count: 150,
  date_range: '90_days'
});

// Error tracking
gtag('event', 'error', {
  error_type: 'youtube_api_limit',
  feature: 'comment_fetch'
});
```

**Resources Needed:**
- [ ] GA4 custom event definitions
- [ ] Developer to implement event tracking
- [ ] Event taxonomy document

---

### 4. Error Tracking (Sentry)
**What it adds:**
- JavaScript error monitoring
- API failure tracking
- Performance monitoring
- User impact assessment

**Resources Needed:**
- [ ] Sentry account (free tier available)
- [ ] Sentry DSN key
- [ ] Developer to implement SDK
- [ ] Alert configuration

**Implementation:**
```javascript
Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  integrations: [new BrowserTracing()],
  tracesSampleRate: 1.0,
});
```

---

## Phase 2: Enhanced Analytics (Week 3-4)
**Goal:** Connect YouTube to website behavior

### 5. Backend Database (Supabase/Firebase)
**What it adds:**
- Persist data across browser sessions
- Historical trend analysis
- Cross-user aggregation
- Real-time data sync

**Database Schema:**
```sql
-- Videos table
CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  title TEXT,
  publish_date TIMESTAMP,
  channel TEXT,
  views INTEGER,
  ctr FLOAT,
  retention FLOAT,
  sentiment_score FLOAT,
  conversion_rate FLOAT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Comments table
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  video_id TEXT REFERENCES videos(id),
  text TEXT,
  author TEXT,
  sentiment_valence FLOAT,
  sentiment_arousal FLOAT,
  faith_strengthening FLOAT,
  created_at TIMESTAMP
);

-- Conversions table
CREATE TABLE conversions (
  id SERIAL PRIMARY KEY,
  video_id TEXT REFERENCES videos(id),
  conversion_type TEXT,
  conversion_date TIMESTAMP,
  utm_source TEXT,
  utm_campaign TEXT,
  value FLOAT
);

-- Analytics events table
CREATE TABLE analytics_events (
  id SERIAL PRIMARY KEY,
  event_name TEXT,
  video_id TEXT,
  user_session TEXT,
  properties JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

**Resources Needed:**
- [ ] Supabase account (free tier: 500MB database, 2GB bandwidth)
- [ ] Database credentials
- [ ] API keys for Supabase client
- [ ] Developer to implement data models
- [ ] Migration strategy for existing localStorage data

**Alternative:** Firebase (similar free tier)

---

### 6. YouTube → GA4 Integration
**What it adds:**
- Automatic tracking of video referrals
- Video engagement correlated with website behavior
- Attribution reporting

**Implementation:**
```javascript
// When user arrives from YouTube
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('utm_source') === 'youtube') {
  const videoId = urlParams.get('utm_content');
  
  // Track in GA4
  gtag('event', 'youtube_referral', {
    video_id: videoId,
    session_start: true
  });
  
  // Store in session for conversion attribution
  sessionStorage.setItem('referral_video', videoId);
}
```

**Resources Needed:**
- [ ] GA4 already configured (from Phase 1)
- [ ] UTM parameters in place (from Phase 1)
- [ ] Developer to implement tracking

---

### 7. Conversion Funnel Tracking
**What it adds:**
- Video → Website → Action tracking
- Drop-off point identification
- Conversion rate by video
- Multi-step funnel visualization

**Funnel Steps:**
```javascript
// Step 1: Video view (YouTube Analytics)
// Step 2: Website visit (GA4)
gtag('event', 'funnel_step', { step: 'website_visit', video_id: 'abc123' });

// Step 3: Engaged with content (30+ seconds on page)
gtag('event', 'funnel_step', { step: 'content_engagement', video_id: 'abc123' });

// Step 4: Conversion action (form submission, purchase, etc.)
gtag('event', 'funnel_step', { step: 'conversion', video_id: 'abc123', type: 'email_signup' });
```

**Resources Needed:**
- [ ] GA4 funnel configuration
- [ ] Conversion goals defined
- [ ] Tracking code on conversion pages
- [ ] Access to thank-you/confirmation pages

---

### 8. API Performance Monitoring
**What it adds:**
- Track API response times
- Identify slow/failing endpoints
- Cost monitoring per feature
- Usage patterns

**Implementation:**
```javascript
// Wrap API calls with performance tracking
async function monitoredAPICall(endpoint, data) {
  const startTime = performance.now();
  
  try {
    const response = await fetch(endpoint, data);
    const duration = performance.now() - startTime;
    
    // Track success
    gtag('event', 'api_call', {
      endpoint: endpoint,
      duration_ms: duration,
      status: 'success'
    });
    
    return response;
  } catch (error) {
    const duration = performance.now() - startTime;
    
    // Track failure
    gtag('event', 'api_call', {
      endpoint: endpoint,
      duration_ms: duration,
      status: 'error',
      error_message: error.message
    });
    
    throw error;
  }
}
```

**Resources Needed:**
- [ ] GA4 custom metrics for API performance
- [ ] Developer to implement monitoring wrapper
- [ ] Alert thresholds defined

---

## Phase 3: Advanced Sentiment + Behavior (Week 5-8)
**Goal:** Combine sentiment analysis with actual behavior

### 9. Enhanced Sentiment Scoring Model
**What it adds:**
- Multi-dimensional sentiment (not just positive/negative)
- Emotion classification (joy, trust, fear, anger, etc.)
- Intent detection (testimony, agreement, criticism, question)
- Domain-specific markers (faith_strengthening, doubt_raising, etc.)

**Enhanced Comment Data Model:**
```javascript
{
  // Existing fields
  id: string,
  videoId: string,
  text: string,
  author: string,
  likeCount: number,
  publishedAt: ISO8601,
  
  // NEW: Multi-dimensional sentiment
  sentimentScore: {
    valence: -1.0 to +1.0,        // negative → positive
    arousal: 0.0 to 1.0,           // calm → excited
    dominance: -1.0 to +1.0,       // passive → confident
    confidence: 0.0 to 1.0         // AI confidence
  },
  
  // NEW: Emotion taxonomy (8 basic emotions)
  emotions: {
    joy: 0.0 to 1.0,
    trust: 0.0 to 1.0,
    fear: 0.0 to 1.0,
    anger: 0.0 to 1.0,
    sadness: 0.0 to 1.0,
    disgust: 0.0 to 1.0,
    surprise: 0.0 to 1.0,
    anticipation: 0.0 to 1.0
  },
  
  // NEW: Intent classification
  intent: "testimony|agreement|question|criticism|support|neutral",
  
  // NEW: Domain-specific markers (configurable per client)
  domainSentiment: {
    // For LDS:
    faith_strengthening: 0.0 to 1.0,
    testimony_sharing: 0.0 to 1.0,
    doubt_raising: 0.0 to 1.0,
    
    // For Gates Foundation:
    // awareness_raising: 0.0 to 1.0,
    // action_intent: 0.0 to 1.0,
    // misconception_corrected: 0.0 to 1.0,
    
    // For Ecommerce:
    // purchase_intent: 0.0 to 1.0,
    // brand_trust: 0.0 to 1.0,
    // recommendation_intent: 0.0 to 1.0
  }
}
```

**Claude Prompt Enhancement:**
```
Analyze these YouTube comments for detailed sentiment and persuasive impact:

For EACH comment, provide:
1. Multi-dimensional sentiment:
   - valence: -1 (very negative) to +1 (very positive)
   - arousal: 0 (calm) to 1 (excited/intense)
   - dominance: -1 (passive/uncertain) to +1 (confident/assertive)
   - confidence: your confidence in this assessment (0-1)

2. Emotion scores (0-1 for each):
   - joy, trust, fear, anger, sadness, disgust, surprise, anticipation

3. Intent classification:
   - Options: testimony, agreement, question, criticism, support, neutral

4. Domain-specific markers (LDS context):
   - faith_strengthening: Does this comment reflect strengthened faith? (0-1)
   - testimony_sharing: Is the commenter sharing personal testimony? (0-1)
   - doubt_raising: Does this express or create doubt? (0-1)

5. Change indicator:
   - is_sentiment_shift: Does this represent a change from typical sentiment? (boolean)
   - shift_direction: "more_positive", "more_negative", or "neutral"

For COMMENT THREADS (parent + replies):
1. Track sentiment progression:
   - Initial sentiment (parent comment)
   - How sentiment evolves through replies
   - Final sentiment state

2. Calculate metrics:
   - sentiment_shift: delta from first to last comment in thread
   - conversation_type: "consensus", "debate", "conversion", "dismissal"
   - persuasion_occurred: boolean - did anyone change their view?

Return structured JSON:
{
  comments: [
    {
      id, text, author, timestamp,
      sentimentScore: { valence, arousal, dominance, confidence },
      emotions: { joy, trust, fear, anger, sadness, disgust, surprise, anticipation },
      intent: string,
      domainSentiment: { faith_strengthening, testimony_sharing, doubt_raising },
      is_sentiment_shift: boolean,
      shift_direction: string
    }
  ],
  
  threads: [
    {
      parentCommentId: string,
      sentimentProgression: [{ commentId, sentiment, timestamp }],
      sentimentShift: number,
      conversationType: string,
      persuasionOccurred: boolean
    }
  ],
  
  videoMetrics: {
    avgSentiment: number,
    polarizationIndex: number,  // 0 = consensus, 1 = highly divided
    conversionRate: number,  // % of threads showing sentiment shift
    dominantEmotion: string,
    avgEmotionalIntensity: number
  }
}
```

**Resources Needed:**
- [ ] Claude API quota increase (if needed)
- [ ] Enhanced prompt testing and refinement
- [ ] Developer to update CommentAnalysis component
- [ ] Database schema updates for new fields
- [ ] UI updates to display new metrics

---

### 10. Video-Level Sentiment Impact Score
**What it adds:**
- Overall persuasiveness score per video
- Conversion rate (% moving from negative → positive sentiment)
- Strengthening rate (% of already-positive getting MORE positive)
- Polarization index (consensus vs. divisive)
- Domain-specific impact scores

**Video Impact Score Model:**
```javascript
{
  videoId: string,
  title: string,
  
  // Baseline stats
  viewCount: number,
  commentCount: number,
  
  // Sentiment distribution
  avgSentiment: number,              // mean valence across all comments
  sentimentStdDev: number,           // diversity of opinion
  polarizationIndex: number,         // 0 = consensus, 1 = bimodal/divided
  
  // Change metrics (THE KEY INNOVATION)
  sentimentChangeScore: number,      // 0-1: overall persuasiveness
    // Calculation: weighted by like count + thread depth
    // Higher = more people shifted sentiment in threads
  
  conversionRate: number,            // % of threads moving negative → positive
  strengtheningRate: number,         // % of positive comments getting more positive
  weakenRate: number,                // % moving away from initial position
  
  // Emotion effectiveness
  dominantEmotion: string,           // most common emotion across comments
  emotionIntensity: number,          // avg arousal level (0-1)
  emotionDiversity: number,          // how many different emotions present
  
  // Domain-specific impact (LDS example)
  faithStrengtheningIndex: number,   // aggregate faith_strengthening scores
  testimonyMomentum: number,         // count of testimony_sharing moments
  doubtRaisingRisk: number,          // aggregate doubt_raising scores
  
  // Comparison to channel baseline
  vs_channelAvg: {
    sentimentChangeScore_diff: number,  // +0.15 = 15% better than average
    emotionIntensity_diff: number,
    faithIndex_diff: number
  },
  
  // Performance correlation
  correlation_with_retention: number,  // Does high sentiment = high retention?
  correlation_with_subs: number,       // Does high sentiment = more subscribers?
  
  // Ranking
  impactRank: number,                 // 1 = most impactful video on channel
  impactPercentile: number            // 95th percentile = top 5% of videos
}
```

**Calculation Logic:**
```javascript
function calculateSentimentChangeScore(threads) {
  let totalWeightedChange = 0;
  let totalWeight = 0;
  
  threads.forEach(thread => {
    const initialSentiment = thread.comments[0].sentimentScore.valence;
    const finalSentiment = thread.comments[thread.comments.length - 1].sentimentScore.valence;
    const change = finalSentiment - initialSentiment;
    
    // Weight by: thread engagement (replies) + like count
    const weight = thread.comments.length * Math.log(thread.totalLikes + 1);
    
    totalWeightedChange += change * weight;
    totalWeight += weight;
  });
  
  // Normalize to 0-1 scale
  const rawScore = totalWeight > 0 ? totalWeightedChange / totalWeight : 0;
  return Math.max(0, Math.min(1, (rawScore + 1) / 2));  // Map -1,+1 to 0,1
}
```

**Resources Needed:**
- [ ] Developer to implement scoring algorithms
- [ ] Database schema for video-level metrics
- [ ] UI component to display impact scores
- [ ] Validation against known high-performing videos

---

### 11. Sentiment × Conversion Correlation Analysis
**What it adds:**
- Prove that sentiment change PREDICTS real conversions
- Identify sentiment score thresholds for action
- Optimize for sentiment that drives behavior (not just positive feelings)

**Analysis Model:**
```javascript
{
  analysis_type: "sentiment_conversion_correlation",
  
  findings: {
    correlation_coefficient: 0.73,  // Strong positive correlation
    
    sentimentThresholds: {
      low_conversion: { sentiment: 0.0 to 0.3, conversion_rate: 0.02 },
      medium_conversion: { sentiment: 0.3 to 0.6, conversion_rate: 0.08 },
      high_conversion: { sentiment: 0.6 to 1.0, conversion_rate: 0.23 }
    },
    
    insights: [
      "Videos with sentiment change score >0.6 drive 11.5x more conversions",
      "Emotion 'trust' correlates most strongly with conversions (r=0.81)",
      "Polarization index >0.5 reduces conversions by 34% despite high engagement"
    ]
  },
  
  recommendations: [
    "Prioritize content that scores >0.6 on sentiment change",
    "Emphasize trust-building messaging over excitement",
    "Avoid divisive topics unless conversion is not the goal"
  ]
}
```

**Dashboard Visualization:**
Scatter plot: X-axis = Sentiment Change Score, Y-axis = Conversion Rate
- Each dot = a video
- Size = view count
- Color = emotion dominance
- Trend line showing correlation

**Resources Needed:**
- [ ] Conversion data from Phase 2
- [ ] Sentiment data from Phase 3
- [ ] Statistical analysis implementation
- [ ] Data visualization library (Chart.js, D3.js)
- [ ] UI component for correlation insights

---

### 12. YouTube Studio Advanced Metrics (API Extension)
**What it adds:**
- Traffic source breakdown (Search, Browse, Suggested, External)
- Second-by-second retention curve
- End screen/card click rates
- Subscriber source attribution
- Unique vs. repeat viewers

**Currently Missing from YouTube API:**
```javascript
{
  videoId: 'abc123',
  
  // Traffic sources (not available via public API - requires manual export)
  trafficSources: {
    youtube_search: { views: 12500, percentage: 35% },
    browse_features: { views: 10000, percentage: 28% },
    suggested_videos: { views: 7850, percentage: 22% },
    external: { views: 5350, percentage: 15% }  // <-- KEY for cross-platform tracking
  },
  
  // Retention curve (not available via API)
  retentionCurve: [
    { second: 0, retention: 100% },
    { second: 30, retention: 68% },     // Drop-off points
    { second: 90, retention: 45% },
    { second: 180, retention: 32% },
    { second: 300, retention: 18% }
  ],
  
  // Engagement elements (limited API access)
  endScreen: {
    impressions: 1850,
    clicks: 234,
    ctr: 0.126,
    elementClicks: {
      video: 180,
      playlist: 32,
      channel: 15,
      link: 7
    }
  },
  
  cards: {
    impressions: 3400,
    clicks: 289,
    ctr: 0.085,
    teaser_impressions: 1200,
    teaser_clicks: 156
  },
  
  // Audience composition (not available via API)
  audienceType: {
    unique_viewers: 8500,
    returning_viewers: 3200,
    subscriber_views: 4100,
    non_subscriber_views: 7600
  },
  
  // Subscriber attribution (not available via API)
  subscriberSource: {
    from_this_video: 145,
    from_channel_page: 23,
    from_other_videos: 67
  }
}
```

**Implementation Approaches:**

**Option A: Manual CSV Export** (Interim solution)
- YouTube Studio → Analytics → Advanced Mode → Export as CSV
- Parse additional fields from CSV
- Manual process, but gets data immediately

**Option B: YouTube Reporting API** (Preferred, requires approval)
- Apply for YouTube Reporting API access
- More comprehensive data than Data API v3
- Automated daily reports
- Requires OAuth 2.0 + API approval process

**Option C: Web Scraping** (Not recommended - against ToS)
- Puppeteer/Playwright to scrape YouTube Studio
- Fragile, against terms of service
- Only as last resort

**Resources Needed:**
- [ ] YouTube Reporting API application (if pursuing Option B)
- [ ] OAuth 2.0 credentials
- [ ] Developer to implement parsing/API integration
- [ ] Database schema updates for new metrics
- [ ] OR: Process for regular manual CSV exports (Option A)

---

### 13. Historical Sentiment Tracking (Time Series)
**What it adds:**
- Track how sentiment changes over time for same video
- Compare early comments vs. late comments
- Long-term audience sentiment trends
- Seasonal/temporal patterns

**Time Series Data Model:**
```javascript
{
  videoId: 'abc123',
  title: 'My Faith Journey',
  
  // Sentiment evolution over video lifetime
  sentimentOverTime: [
    { 
      date: '2024-01-15',  // Launch week
      avgSentiment: +0.28,
      commentCount: 45,
      dominantEmotion: 'surprise',
      avgEmotionalIntensity: 0.62
    },
    { 
      date: '2024-02-15',  // Month 1
      avgSentiment: +0.42,
      commentCount: 89,
      dominantEmotion: 'trust',
      avgEmotionalIntensity: 0.58
    },
    { 
      date: '2024-06-15',  // Month 6
      avgSentiment: +0.51,
      commentCount: 156,
      dominantEmotion: 'joy',
      avgEmotionalIntensity: 0.71
    }
  ],
  
  // Trajectory analysis
  sentimentTrajectory: "strengthening",  // "strengthening", "weakening", "stable", "volatile"
  
  // Early vs. late comparison
  firstWeekComments: {
    avgSentiment: +0.22,
    count: 34,
    dominantIntent: 'question',
    conversionRate: 0.08
  },
  
  subsequentComments: {
    avgSentiment: +0.48,
    count: 122,
    dominantIntent: 'testimony',
    conversionRate: 0.19
  },
  
  // Insight
  maturationPattern: "skeptical_to_positive",
  conclusion: "Early comments skeptical (+0.22) but community discussion shifted positive (+0.48) over 6 months"
}
```

**Use Cases:**
- Identify videos with "long tail" persuasion (keep promoting them!)
- Detect videos that lose impact over time (evergreen vs. timely)
- Track channel-wide sentiment trends
- Measure impact of algorithm changes on sentiment

**Implementation:**
```javascript
// Scheduled job to re-fetch comments periodically
async function trackSentimentOverTime(videoId) {
  const comments = await fetchAllComments(videoId);
  const sentiment = await analyzeSentiment(comments);
  
  // Store snapshot in database
  await db.sentimentSnapshots.insert({
    videoId,
    snapshotDate: new Date(),
    avgSentiment: sentiment.avgSentiment,
    commentCount: comments.length,
    dominantEmotion: sentiment.dominantEmotion,
    // ... other metrics
  });
}

// Run weekly for active videos
cron.schedule('0 0 * * 0', async () => {
  const activeVideos = await db.videos.where('publishDate > 6_months_ago');
  for (const video of activeVideos) {
    await trackSentimentOverTime(video.id);
  }
});
```

**Resources Needed:**
- [ ] Scheduled job runner (cron, Vercel Cron, Supabase Functions)
- [ ] Database schema for time-series snapshots
- [ ] Time-series visualization component
- [ ] Alert system for significant sentiment shifts

---

### 14. Demographic Layering (Age, Gender, Location, Device)
**What it adds:**
- Sentiment by audience segment
- Device-specific engagement patterns
- Geographic sentiment variations
- Age-based messaging effectiveness

**Demographic Sentiment Model:**
```javascript
{
  videoId: 'abc123',
  
  // Audience demographics (from YouTube Analytics)
  audienceDemographics: {
    age: {
      '18-24': { percentage: 15%, avgSentiment: +0.31, conversionRate: 0.06 },
      '25-34': { percentage: 38%, avgSentiment: +0.45, conversionRate: 0.12 },
      '35-44': { percentage: 28%, avgSentiment: +0.52, conversionRate: 0.15 },
      '45-54': { percentage: 14%, avgSentiment: +0.58, conversionRate: 0.18 },
      '55+': { percentage: 5%, avgSentiment: +0.64, conversionRate: 0.21 }
    },
    
    gender: {
      male: { percentage: 58%, avgSentiment: +0.42, conversionRate: 0.11 },
      female: { percentage: 42%, avgSentiment: +0.51, conversionRate: 0.14 }
    },
    
    location: {
      'US': { percentage: 72%, avgSentiment: +0.48, conversionRate: 0.13 },
      'Canada': { percentage: 8%, avgSentiment: +0.45, conversionRate: 0.11 },
      'UK': { percentage: 7%, avgSentiment: +0.39, conversionRate: 0.09 },
      'Other': { percentage: 13%, avgSentiment: +0.52, conversionRate: 0.15 }
    }
  },
  
  // Device type (from YouTube Analytics)
  deviceType: {
    mobile: { percentage: 68%, avgSentiment: +0.35, avgRetention: 0.42, conversionRate: 0.08 },
    desktop: { percentage: 22%, avgSentiment: +0.49, avgRetention: 0.58, conversionRate: 0.16 },
    tablet: { percentage: 8%, avgSentiment: +0.46, avgRetention: 0.51, conversionRate: 0.13 },
    tv: { percentage: 2%, avgSentiment: +0.44, avgRetention: 0.72, conversionRate: 0.05 }
  },
  
  // Viewer type
  viewerType: {
    new: { percentage: 45%, avgSentiment: +0.38, conversionRate: 0.09 },
    returning: { percentage: 35%, avgSentiment: +0.52, conversionRate: 0.14 },
    subscribed: { percentage: 20%, avgSentiment: +0.61, conversionRate: 0.19 }
  },
  
  // Key insights
  insights: [
    "18-24 year-olds have 46% lower sentiment change (+0.31 vs +0.58 for 45+)",
    "Mobile viewers (68% of audience) have 37% lower conversion rate than desktop",
    "Female viewers show 21% higher sentiment scores despite lower view percentage",
    "Returning viewers convert at 1.6x rate of new viewers"
  ],
  
  recommendations: [
    "Create mobile-optimized content for 18-34 demographic (shorter, faster pacing)",
    "Desktop viewers are high-intent - drive CTAs toward desktop experience",
    "Female-focused messaging shows higher sentiment impact - expand this content",
    "Retargeting strategy for returning viewers (already primed for conversion)"
  ]
}
```

**Data Sources:**
1. **YouTube Analytics** - Demographics available in Studio
2. **Comment author matching** - If possible, match commenters to demographic data
3. **GA4** - Track website visitor demographics
4. **Survey data** - Ask users for demographic info (optional)

**Resources Needed:**
- [ ] YouTube Analytics demographic data export
- [ ] Database schema for demographic segments
- [ ] Statistical significance testing (avoid small sample bias)
- [ ] Visualization components for segment comparison
- [ ] Privacy compliance review (demographic data handling)

---

## Phase 4: Multi-Platform + External Data (Week 9-12)
**Goal:** Complete picture of audience journey across all touchpoints

### 15. Cross-Platform Social Media Sentiment
**What it adds:**
- Sentiment from Facebook, Instagram, Twitter/X, TikTok
- Platform-specific audience insights
- Virality tracking (shares, mentions)
- Conversation spillover analysis

**Multi-Platform Sentiment Model:**
```javascript
{
  videoId: 'abc123',
  title: 'My Faith Journey',
  
  // Sentiment by platform
  platformSentiment: {
    youtube: {
      avgSentiment: +0.42,
      commentCount: 450,
      dominantEmotion: 'trust',
      conversionRate: 0.15,
      audienceType: 'skeptics, seekers',
      avgAge: 32
    },
    
    facebook: {
      avgSentiment: +0.67,     // More positive!
      commentCount: 1200,
      reactionCounts: { like: 890, love: 340, care: 120, haha: 45 },
      shareCount: 234,
      dominantEmotion: 'joy',
      conversionRate: 0.08,    // Lower conversion (already converted)
      audienceType: 'existing believers, community',
      avgAge: 45
    },
    
    instagram: {
      avgSentiment: +0.51,
      commentCount: 234,
      likeCount: 3400,
      saveCount: 156,
      shareCount: 89,
      dominantEmotion: 'anticipation',
      conversionRate: 0.11,
      audienceType: 'younger believers, visual learners',
      avgAge: 28
    },
    
    twitter: {
      avgSentiment: -0.15,     // More critical/skeptical
      mentionCount: 89,
      retweetCount: 34,
      likeCount: 156,
      dominantEmotion: 'anger',
      conversionRate: 0.03,
      audienceType: 'critics, debaters, ex-members',
      avgAge: 35
    },
    
    tiktok: {
      avgSentiment: +0.38,
      commentCount: 567,
      likeCount: 8900,
      shareCount: 234,
      dominantEmotion: 'surprise',
      conversionRate: 0.09,
      audienceType: 'very young, viral seekers',
      avgAge: 22
    }
  },
  
  // Cross-platform insights
  totalReach: 45000,           // Sum across platforms
  viralityScore: 8.3,          // Based on shares/mentions/engagement
  platformDiversity: 0.72,     // How widely distributed across platforms
  
  // Audience segmentation
  funnelAnalysis: {
    awareness: ['tiktok', 'twitter'],      // Top of funnel
    consideration: ['youtube', 'instagram'], // Middle of funnel
    conversion: ['facebook', 'youtube'],    // Bottom of funnel (community)
  },
  
  // Strategic insights
  insights: [
    "YouTube audience leans skeptical (+0.42) - use for top-of-funnel persuasion",
    "Facebook audience highly positive (+0.67) - already converted believers, focus on community/retention",
    "Twitter audience critical (-0.15) - expect pushback, engage thoughtfully or avoid",
    "TikTok drives viral reach but lower sentiment depth - use for awareness only"
  ],
  
  recommendations: [
    "YouTube = persuasion engine (invest in high-quality apologetics)",
    "Facebook = community nurture (behind-the-scenes, testimony sharing)",
    "Instagram = visual storytelling (infographics, quote cards)",
    "Twitter = selective engagement (only respond to good-faith questions)",
    "TikTok = viral clips (hook-first, short form, trending sounds)"
  ]
}
```

**API Integrations Needed:**

| Platform | API | Data Available | Cost |
|----------|-----|----------------|------|
| **Facebook** | Graph API | Posts, comments, reactions, shares | Free (with limits) |
| **Instagram** | Graph API | Posts, comments, likes, saves | Free (with limits) |
| **Twitter/X** | API v2 | Tweets, replies, likes, retweets | Free tier: 1,500 tweets/month |
| **TikTok** | Research API | Videos, comments, likes, shares | Requires application |
| **Reddit** | API | Posts, comments, upvotes | Free |

**Resources Needed:**
- [ ] Facebook/Instagram Business Account + API access
- [ ] Twitter/X API credentials (Basic tier or higher)
- [ ] TikTok Research API application (if applicable)
- [ ] Reddit API credentials
- [ ] Developer to implement multi-platform data fetching
- [ ] Database schema for cross-platform data
- [ ] Rate limiting and quota management
- [ ] Platform-specific sentiment analysis (emojis, slang, platform culture)

**Implementation Challenges:**
- Different comment formats per platform
- Rate limits vary widely
- Some platforms (Twitter) have expensive API tiers
- Privacy/permissions complexity
- Platform-specific sentiment nuances (Reddit sarcasm, TikTok slang)

---

### 16. Competitor Benchmarking
**What it adds:**
- How your sentiment scores compare to competitors
- Identify content gaps where competitors are winning
- Industry benchmark averages
- Best-in-class examples to learn from

**Competitor Analysis Model:**
```javascript
{
  analysis_date: '2024-06-15',
  
  yourChannel: {
    channelName: 'LDS Faith Channel',
    avgSentimentChange: +0.42,
    avgConversionRate: 0.15,
    avgViews: 15000,
    avgEngagement: 0.08,
    subscriberGrowthRate: 0.05,
    topThemes: ['personal testimony', 'scripture explanation', 'faith crisis']
  },
  
  competitors: [
    {
      channelName: 'Competitor A',
      avgSentimentChange: +0.28,    // Lower sentiment impact
      avgConversionRate: 0.12,
      avgViews: 25000,              // Higher views but lower impact
      avgEngagement: 0.06,
      subscriberGrowthRate: 0.04,
      topThemes: ['doctrinal teaching', 'church history', 'apologetics'],
      strengthsVsYou: ['higher reach', 'more frequent uploads'],
      weaknessesVsYou: ['lower sentiment change', 'less community engagement']
    },
    {
      channelName: 'Competitor B',
      avgSentimentChange: +0.51,    // BETTER sentiment impact
      avgConversionRate: 0.19,
      avgViews: 8000,               // Lower views but higher impact
      avgEngagement: 0.12,
      subscriberGrowthRate: 0.07,
      topThemes: ['personal stories', 'vulnerable testimony', 'modern application'],
      strengthsVsYou: ['higher sentiment change', 'stronger conversions', 'more authentic'],
      weaknessesVsYou: ['lower reach', 'less polished production']
    },
    {
      channelName: 'Competitor C',
      avgSentimentChange: +0.35,
      avgConversionRate: 0.14,
      avgViews: 18000,
      avgEngagement: 0.07,
      subscriberGrowthRate: 0.06,
      topThemes: ['inspirational', 'family-focused', 'lifestyle'],
      strengthsVsYou: ['broader appeal', 'family demographic'],
      weaknessesVsYou: ['less depth', 'lower theological engagement']
    }
  ],
  
  industryBenchmarks: {
    avgSentimentChange: +0.35,
    avgConversionRate: 0.13,
    topPerformer: +0.63,           // Best-in-class
    bottomQuartile: +0.18
  },
  
  yourPositioning: {
    sentimentRank: "2nd of 4",      // Beat Competitor A & C, behind B
    conversionRank: "2nd of 4",
    reachRank: "3rd of 4",
    overallRank: "Above average but not best-in-class"
  },
  
  gapAnalysis: [
    {
      gap: "Authentic vulnerability",
      leader: "Competitor B",
      theirScore: +0.51,
      yourScore: +0.42,
      opportunity: "+21% sentiment improvement",
      recommendation: "Increase personal story content from 42% to 68% (like Competitor B)"
    },
    {
      gap: "Reach/distribution",
      leader: "Competitor A",
      theirViews: 25000,
      yourViews: 15000,
      opportunity: "+67% reach growth",
      recommendation: "Improve SEO, thumbnails, and upload frequency"
    }
  ],
  
  strategicRecommendations: [
    "Your sentiment change (+0.42) beats industry average (+0.35) - this is a strength",
    "Learn from Competitor B: more vulnerable, authentic storytelling drives +21% higher sentiment",
    "You have opportunity to combine Competitor B's authenticity with Competitor A's reach",
    "Consider: personal testimony series with higher production value and SEO optimization"
  ]
}
```

**Data Sources:**
1. **Manual competitor list** - Identify 3-5 key competitors
2. **YouTube Data API** - Pull their public video stats
3. **Comment scraping** - Fetch their comments for sentiment analysis
4. **Social Blade** - Subscriber growth tracking
5. **VidIQ or TubeBuddy** - Additional competitor metrics

**Resources Needed:**
- [ ] Competitor list defined
- [ ] YouTube API quota for competitor data
- [ ] Sentiment analysis applied to competitor comments
- [ ] Visualization: competitor comparison matrix
- [ ] Privacy/ethical review (scraping competitor data)
- [ ] Scheduled updates (monthly competitor reports)

---

### 17. Email Marketing Integration
**What it adds:**
- Track which videos drive email list signups
- Measure email engagement by video referral source
- Calculate lifetime value attribution to videos
- Email open/click rates for video-referred subscribers

**Email Attribution Model:**
```javascript
{
  videoId: 'abc123',
  title: 'My Faith Journey',
  
  // Email acquisition
  emailSignups: {
    total: 42,
    signupRate: 0.08,           // 8% of website visitors who came from this video
    signupSource: 'video_description_cta',
    avgTimeToSignup: '3.5 days'  // Days between video view and signup
  },
  
  // Email engagement (for subscribers acquired via this video)
  emailPerformance: {
    avgOpenRate: 0.34,           // 34% open rate (compare to channel avg)
    avgClickRate: 0.12,          // 12% click-through rate
    unsubscribeRate: 0.02,       // 2% unsubscribe rate
    forwardRate: 0.05,           // 5% forward/share rate
    
    vs_channelAvg: {
      openRate_diff: +0.08,      // 8% higher than average subscriber
      clickRate_diff: +0.04,     // 4% higher than average
      unsubRate_diff: -0.01      // 1% lower unsubscribe rate (good!)
    }
  },
  
  // Lifetime value
  lifetimeValue: {
    avgDonationPerSubscriber: '$45',
    totalAttributedRevenue: '$1,890',
    avgLifetimeEngagement: '14 months',
    
    retentionCohort: [
      { month: 1, activeRate: 0.95 },
      { month: 3, activeRate: 0.82 },
      { month: 6, activeRate: 0.71 },
      { month: 12, activeRate: 0.58 }
    ]
  },
  
  // ROI calculation
  roi: {
    productionCost: '$500',
    totalAttributedValue: '$1,890',
    roi_percentage: '278%',
    paybackPeriod: '2.3 months'
  },
  
  // Insights
  insights: [
    "Video-referred subscribers have 31% higher engagement than channel average",
    "This video's acquisition cost per subscriber: $11.90 (vs. $23 channel avg)",
    "High-sentiment videos (+0.6) drive subscribers with 2.1x higher LTV",
    "Subscribers from 'testimony' videos retain 18% longer than 'doctrinal' videos"
  ],
  
  recommendations: [
    "This video format (personal testimony) drives highest-value subscribers",
    "Promote this video in email campaigns to drive more signups",
    "Create lookalike content to replicate high-LTV subscriber acquisition"
  ]
}
```

**Email Platform Integrations:**

| Platform | API | Data Available | Cost |
|----------|-----|----------------|------|
| **Mailchimp** | Marketing API | Lists, campaigns, opens, clicks, subscribers | Free tier available |
| **ConvertKit** | API v3 | Subscribers, tags, broadcasts, automations | Free tier available |
| **Constant Contact** | API v3 | Contacts, campaigns, tracking | Paid plans only |
| **SendGrid** | API v3 | Contacts, campaigns, stats, webhooks | Free tier: 100 emails/day |
| **ActiveCampaign** | API v3 | Contacts, campaigns, automations, deals | Paid plans only |

**Implementation:**
```javascript
// Track video referral in email signup
async function handleEmailSignup(email, referralSource) {
  const videoId = sessionStorage.getItem('referral_video');
  
  // Add to email platform
  await mailchimp.lists.addListMember(LIST_ID, {
    email_address: email,
    status: 'subscribed',
    merge_fields: {
      REFERRAL: videoId,
      REF_SOURCE: 'youtube_video',
      SENTIMENT: sessionStorage.getItem('video_sentiment')
    },
    tags: [`video_${videoId}`, 'youtube_acquisition']
  });
  
  // Track in database
  await db.emailSignups.insert({
    email,
    videoId,
    signupDate: new Date(),
    referralSentiment: sessionStorage.getItem('video_sentiment')
  });
  
  // Track in GA4
  gtag('event', 'email_signup', {
    video_id: videoId,
    acquisition_source: 'youtube_video'
  });
}
```

**Resources Needed:**
- [ ] Email marketing platform API credentials
- [ ] UTM parameters to track video → website → email signup
- [ ] Custom fields in email platform for video attribution
- [ ] Webhook setup for real-time email events
- [ ] Database schema for email attribution
- [ ] Developer to implement integration
- [ ] LTV calculation methodology
- [ ] Privacy compliance (email data handling)

---

### 18. CRM Integration (Ultimate Conversion Attribution)
**What it adds:**
- Track video viewers through entire customer journey
- Attribute donations/purchases/baptisms/leads back to specific videos
- Calculate true ROI per video
- Identify highest-value content for business/mission goals

**CRM Attribution Model:**
```javascript
{
  videoId: 'abc123',
  title: 'My Faith Journey',
  publishDate: '2024-01-15',
  
  // Ultimate conversions (domain-specific)
  conversions: {
    // For LDS:
    missionary_discussion_requests: 18,
    temple_recommend_interviews: 5,
    baptisms_attributed: 3,
    reactivations: 7,
    
    // For Philanthropy:
    // petition_signatures: 234,
    // donation_pledges: 45,
    // volunteer_signups: 67,
    
    // For Ecommerce:
    // product_page_visits: 892,
    // cart_additions: 234,
    // purchases: 67,
    // repeat_purchases: 23
  },
  
  // Conversion funnel
  funnel: {
    video_views: 15000,
    website_visits: 342,         // 2.3% click-through
    email_signups: 42,            // 12.3% of website visitors
    discussion_requests: 18,      // 42.9% of email signups
    baptisms: 3,                  // 16.7% of discussion requests
    
    overall_conversion_rate: 0.02%  // 3 baptisms / 15,000 views
  },
  
  // Time to conversion
  conversionTimeline: {
    avgDaysToWebsite: 0.5,       // Same day or next day
    avgDaysToEmail: 3.5,          // 3.5 days after video view
    avgDaysToDiscussion: 87,      // 87 days after first touchpoint
    avgDaysToBaptism: 156,        // 156 days (5+ months)
    
    fastest_conversion: 12,       // 12 days from video to baptism
    slowest_conversion: 248       // 248 days
  },
  
  // Multi-touch attribution
  touchpointAnalysis: {
    video_as_first_touch: 3,      // Video was first touchpoint for 3 baptisms
    video_as_assist: 7,            // Video assisted but wasn't first/last touch
    video_as_last_touch: 1,        // Video was final touchpoint before conversion
    
    typical_journey: [
      'YouTube video view',
      'Website visit (blog article)',
      'Email signup',
      'Email nurture sequence (3-4 emails)',
      'Missionary discussion request',
      'Discussion 1-3',
      'Baptism'
    ]
  },
  
  // Value attribution
  conversionValue: {
    // For LDS (estimated values):
    per_discussion: '$25',        // Missionary time value
    per_baptism: '$5,000',        // Estimated lifetime member value
    per_reactivation: '$3,000',
    
    total_attributed_value: '$15,075',  // 3 baptisms × $5k + other conversions
    
    // For Philanthropy:
    // per_signature: '$0',        // Awareness value only
    // per_donation: '$125',       // Avg donation amount
    // total_donations: '$5,625',  // 45 donations × $125
    
    // For Ecommerce:
    // per_purchase: '$42',        // Avg order value
    // total_revenue: '$2,814',    // 67 purchases × $42
    // customer_LTV: '$156',       // Repeat purchase value
    // total_LTV: '$10,452'        // 67 customers × $156 LTV
  },
  
  // ROI calculation
  roi: {
    production_cost: '$800',      // Video production
    promotion_cost: '$200',       // Paid ads, if any
    total_cost: '$1,000',
    
    total_value: '$15,075',
    net_value: '$14,075',
    roi_percentage: '1407%',      // (Net value / Cost) × 100
    
    payback_period: '45 days',    // Time to break even
    
    cost_per_conversion: {
      per_website_visit: '$2.92',
      per_email_signup: '$23.81',
      per_discussion: '$55.56',
      per_baptism: '$333.33'      // Still incredible ROI!
    }
  },
  
  // Sentiment × Conversion correlation
  sentimentImpact: {
    video_sentiment_score: +0.67,
    
    analysis: "Videos with sentiment scores >0.6 drive 3.2x more baptism conversions",
    
    predictive_model: {
      sentiment_0_to_0_3: { baptism_rate: 0.005% },
      sentiment_0_3_to_0_6: { baptism_rate: 0.015% },
      sentiment_0_6_to_1_0: { baptism_rate: 0.048% }  // <-- This video's range
    }
  },
  
  // Insights
  insights: [
    "This video is your #1 ROI performer (1407% return)",
    "Personal testimony format drives 4.3x more baptisms than doctrinal content",
    "Average time to conversion: 5+ months - long nurture required",
    "High sentiment score (+0.67) correctly predicted high conversion rate",
    "Video assists 7 other conversions where it wasn't primary touchpoint"
  ],
  
  recommendations: [
    "Create more content like this (personal testimony format)",
    "Promote this video with paid ads ($200 spend → $15k value proven)",
    "Use this video as first touchpoint in missionary referral funnels",
    "Build email nurture sequence specifically for this video's viewers",
    "Track viewers through 6+ month journey (long sales cycle)"
  ]
}
```

**CRM Platform Integrations:**

| Platform | API | Use Case | Cost |
|----------|-----|----------|------|
| **Salesforce** | REST/SOAP API | Enterprise, complex sales | Paid |
| **HubSpot** | API v3 | Marketing/sales/service | Free tier available |
| **Pipedrive** | API v1 | Sales pipeline | Paid |
| **Zoho CRM** | API v2 | Small/medium business | Free tier available |
| **Airtable** | API | Flexible, custom CRM | Free tier available |
| **Custom** | Your own DB | Full control | Development cost |

**Implementation:**
```javascript
// When user converts (e.g., requests missionary discussion)
async function trackConversion(conversionData) {
  const videoId = await getAttributionVideoId(conversionData.userId);
  
  // Create conversion record in CRM
  await hubspot.deals.create({
    properties: {
      dealname: `Missionary Discussion - ${conversionData.name}`,
      amount: 5000,  // Estimated LTV
      pipeline: 'missionary_pipeline',
      dealstage: 'discussion_requested',
      
      // Custom fields for video attribution
      source_video_id: videoId,
      source_video_sentiment: conversionData.sentiment,
      first_touchpoint: 'youtube_video',
      days_to_conversion: calculateDaysSinceFirstTouch(conversionData.userId)
    }
  });
  
  // Track in database
  await db.conversions.insert({
    videoId,
    conversionType: 'missionary_discussion',
    conversionDate: new Date(),
    userId: conversionData.userId,
    estimatedValue: 5000
  });
  
  // Track in GA4
  gtag('event', 'conversion', {
    video_id: videoId,
    conversion_type: 'missionary_discussion',
    value: 5000
  });
}

// Multi-touch attribution helper
async function getAttributionVideoId(userId) {
  const touchpoints = await db.touchpoints
    .where({ userId })
    .orderBy('timestamp', 'asc');
  
  // First-touch attribution (or could use last-touch, linear, time-decay, etc.)
  return touchpoints[0]?.videoId;
}
```

**Resources Needed:**
- [ ] CRM platform selection and setup
- [ ] CRM API credentials
- [ ] User identification system (match video viewers to CRM contacts)
- [ ] Conversion event definitions
- [ ] Value estimation methodology (per conversion type)
- [ ] Multi-touch attribution model decision
- [ ] Database schema for conversion tracking
- [ ] Developer to implement CRM integration
- [ ] Privacy compliance (PII handling, GDPR/CCPA)
- [ ] Reporting dashboard for ROI metrics

**Attribution Model Options:**
1. **First-touch**: Credit to first video viewer watched
2. **Last-touch**: Credit to last video before conversion
3. **Linear**: Equal credit across all touchpoint videos
4. **Time-decay**: More credit to recent touchpoints
5. **Position-based**: 40% first, 40% last, 20% middle touchpoints

---

### 19. A/B Test Framework
**What it adds:**
- Systematically test different content approaches
- Measure which variations drive higher sentiment/conversions
- Experiment with thumbnails, titles, video structure, messaging
- Data-driven content optimization

**A/B Test Structure:**
```javascript
{
  experimentId: 'thumbnail_test_001',
  experimentName: 'Thumbnail Test: Personal Photo vs Text Overlay',
  hypothesis: 'Personal photos drive higher sentiment change than text overlays',
  
  startDate: '2024-06-01',
  endDate: '2024-06-30',
  status: 'completed',
  
  // Test variants
  variants: [
    {
      variant: 'A',
      description: 'Personal photo thumbnail',
      videoId: 'abc123',
      thumbnail: 'personal_photo.jpg',
      
      // Performance metrics
      views: 15000,
      ctr: 0.08,
      avgRetention: 0.58,
      comments: 450,
      
      // Sentiment metrics (THE KEY DIFFERENCE)
      sentimentChangeScore: +0.42,
      conversionRate: 0.15,
      emotionIntensity: 0.68,
      faithStrengtheningIndex: 0.71,
      
      // Business metrics
      website_clicks: 342,
      email_signups: 42,
      discussion_requests: 18,
      
      cost_per_conversion: '$55.56'
    },
    {
      variant: 'B',
      description: 'Text overlay thumbnail',
      videoId: 'def456',
      thumbnail: 'text_overlay.jpg',
      
      views: 18000,            // Higher views!
      ctr: 0.11,               // Higher CTR!
      avgRetention: 0.44,      // But lower retention...
      comments: 380,
      
      // Sentiment metrics (LOWER IMPACT)
      sentimentChangeScore: +0.31,      // 26% lower sentiment change
      conversionRate: 0.11,              // 27% lower conversion
      emotionIntensity: 0.52,            // Less emotional engagement
      faithStrengtheningIndex: 0.58,     // Lower faith impact
      
      website_clicks: 298,
      email_signups: 31,
      discussion_requests: 12,
      
      cost_per_conversion: '$83.33'
    }
  ],
  
  // Statistical analysis
  results: {
    winner: 'Variant A',
    confidence: 0.95,          // 95% statistical confidence
    
    keyFindings: [
      "Variant A drives 35% higher sentiment change despite 27% lower CTR",
      "Personal thumbnails create deeper emotional connection (68 vs 52 intensity)",
      "Text thumbnails drive clicks but not engagement or conversion",
      "Cost per conversion: A ($55.56) vs B ($83.33) - A is 33% more efficient"
    ],
    
    paradox: "Higher CTR doesn't mean higher impact - Variant B got more clicks but less conversion",
    
    explanation: "Text overlays attract curiosity-driven clicks (low intent) while personal photos attract mission-aligned viewers (high intent)"
  },
  
  // Decision
  decision: 'Adopt Variant A (personal photo thumbnails) for future testimony videos',
  
  expectedImpact: {
    if_applied_to_all_videos: {
      sentiment_improvement: '+35%',
      conversion_improvement: '+36%',
      cost_savings: '$27.77 per conversion',
      annual_value: '$45,000+'     // Across 100 videos/year
    }
  },
  
  // Follow-up tests
  nextExperiments: [
    'Test close-up vs medium shot personal photos',
    'Test smiling vs serious expression',
    'Test with/without text overlay on personal photo (hybrid approach)'
  ]
}
```

**Test Types to Run:**

1. **Thumbnail variations**
   - Personal photo vs text vs screenshot
   - Close-up vs wide shot
   - Smiling vs serious
   - High contrast vs natural lighting

2. **Title variations**
   - Question vs statement
   - Curiosity gap vs direct
   - Emotional vs informational
   - Length (short vs long)

3. **Video structure**
   - Hook-first vs context-first
   - Testimony at beginning vs end
   - Fast-paced vs slow-paced
   - With/without B-roll

4. **Messaging framework**
   - Problem → solution vs story → application
   - Data-driven vs emotion-driven
   - Challenge-focused vs hope-focused
   - Doctrinal vs practical

5. **Call-to-action**
   - Link placement (description vs pinned comment)
   - CTA language (strong vs soft)
   - Single CTA vs multiple CTAs
   - Video CTA vs description CTA

**Implementation:**
```javascript
// A/B test tracking system
const abTests = {
  async createTest(testConfig) {
    return await db.abTests.insert({
      ...testConfig,
      status: 'active',
      createdAt: new Date()
    });
  },
  
  async recordVariantPerformance(videoId, metrics) {
    const test = await db.abTests.findByVideoId(videoId);
    
    await db.abTestResults.insert({
      testId: test.id,
      videoId,
      views: metrics.views,
      ctr: metrics.ctr,
      retention: metrics.retention,
      sentimentScore: metrics.sentimentScore,
      conversionRate: metrics.conversionRate,
      timestamp: new Date()
    });
  },
  
  async analyzeTest(testId) {
    const variants = await db.abTestResults.where({ testId });
    
    // Statistical significance test (t-test or chi-square)
    const significance = calculateSignificance(variants);
    
    // Determine winner
    const winner = variants.reduce((best, current) => 
      current.sentimentScore > best.sentimentScore ? current : best
    );
    
    return {
      winner,
      confidence: significance.pValue < 0.05 ? 0.95 : significance.pValue,
      recommendation: generateRecommendation(variants, winner)
    };
  }
};
```

**Resources Needed:**
- [ ] A/B test planning framework
- [ ] Database schema for experiments
- [ ] Statistical significance calculator
- [ ] Test duration calculator (sample size needed)
- [ ] Automated test monitoring
- [ ] Results visualization dashboard
- [ ] Process for implementing winning variants

---

## Domain-Specific Configuration System

To make this system work across different client types (LDS, Philanthropy, Ecommerce), implement a **configuration-based approach**:

### Configuration File: `/src/config/sentimentProfiles.js`

```javascript
export const SENTIMENT_PROFILES = {
  lds_faith: {
    name: "LDS Faith & Religion",
    
    customDimensions: {
      faith_strengthening: {
        label: "Faith Strengthening",
        description: "Does this comment reflect strengthened faith?",
        scale: [0, 1],
        icon: "🙏"
      },
      testimony_sharing: {
        label: "Testimony Sharing",
        description: "Is the commenter sharing personal testimony?",
        scale: [0, 1],
        icon: "💬"
      },
      doubt_raising: {
        label: "Doubt Risk",
        description: "Does this express or create doubt?",
        scale: [0, 1],
        icon: "⚠️",
        isRisk: true
      }
    },
    
    intents: [
      "testimony",
      "agreement",
      "question",
      "criticism",
      "support",
      "neutral"
    ],
    
    conversions: [
      { type: "missionary_discussion", label: "Discussion Request", value: 25 },
      { type: "baptism", label: "Baptism", value: 5000 },
      { type: "reactivation", label: "Reactivation", value: 3000 },
      { type: "temple_recommend", label: "Temple Recommend", value: 4000 }
    ],
    
    primaryMetric: "faithStrengtheningIndex",
    riskMetric: "doubt_raising",
    
    promptContext: `
      This is content for The Church of Jesus Christ of Latter-day Saints.
      Focus on spiritual/religious sentiment markers:
      - Faith strengthening vs doubt raising
      - Personal testimony sharing
      - Doctrinal questions vs challenges
      - Spiritual growth indicators
    `
  },
  
  philanthropy: {
    name: "Philanthropy & Advocacy",
    
    customDimensions: {
      awareness_raising: {
        label: "Awareness Impact",
        description: "Did this increase awareness of the issue?",
        scale: [0, 1],
        icon: "💡"
      },
      action_intent: {
        label: "Action Intent",
        description: "Does commenter show intent to act/donate/advocate?",
        scale: [0, 1],
        icon: "✊"
      },
      misconception_corrected: {
        label: "Misconception Correction",
        description: "Was misinformation corrected?",
        scale: [0, 1],
        icon: "✓"
      },
      empathy_evoked: {
        label: "Empathy Shift",
        description: "Does this show increased empathy for the cause?",
        scale: [0, 1],
        icon: "❤️"
      }
    },
    
    intents: [
      "support",
      "skepticism",
      "pledge",
      "question",
      "advocacy",
      "dismissal"
    ],
    
    conversions: [
      { type: "petition_signature", label: "Petition Signature", value: 0 },
      { type: "donation", label: "Donation", value: 125 },
      { type: "volunteer_signup", label: "Volunteer Signup", value: 50 },
      { type: "share_advocacy", label: "Share/Advocate", value: 10 }
    ],
    
    primaryMetric: "actionIntentRate",
    riskMetric: "misinformation_spread",
    
    promptContext: `
      This is advocacy/philanthropy content (e.g., Gates Foundation, nonprofits).
      Focus on persuasion and action markers:
      - Awareness raised (did they learn something?)
      - Action intent (will they donate, sign, volunteer, advocate?)
      - Misconceptions corrected
      - Empathy evoked
    `
  },
  
  ecommerce: {
    name: "Ecommerce & Product Marketing",
    
    customDimensions: {
      purchase_intent: {
        label: "Purchase Intent",
        description: "Does comment signal intent to buy?",
        scale: [0, 1],
        icon: "🛒"
      },
      brand_trust: {
        label: "Brand Trust",
        description: "Does this reflect trust in the brand?",
        scale: [0, 1],
        icon: "✨"
      },
      product_consideration: {
        label: "Product Consideration",
        description: "Is commenter actively considering this product?",
        scale: [0, 1],
        icon: "🤔"
      },
      recommendation_intent: {
        label: "Word-of-Mouth",
        description: "Will they recommend to others?",
        scale: [0, 1],
        icon: "📣"
      }
    },
    
    intents: [
      "inquiry",
      "complaint",
      "recommendation",
      "purchase_signal",
      "comparison",
      "testimonial"
    ],
    
    conversions: [
      { type: "product_page_visit", label: "Product Page Visit", value: 0.5 },
      { type: "cart_addition", label: "Add to Cart", value: 5 },
      { type: "purchase", label: "Purchase", value: 42 },
      { type: "repeat_purchase", label: "Repeat Purchase", value: 85 }
    ],
    
    primaryMetric: "purchaseIntentRate",
    riskMetric: "complaint_escalation",
    
    promptContext: `
      This is ecommerce/product marketing content.
      Focus on purchase funnel markers:
      - Purchase intent signals ("buying this", "adding to cart")
      - Brand trust ("I trust this brand", "quality product")
      - Product consideration (comparing, researching features)
      - Recommendation intent ("telling my friends", "must-have")
    `
  },
  
  // Add more as needed
  education: { /* ... */ },
  political: { /* ... */ },
  entertainment: { /* ... */ }
};

// Helper to get current profile
export function getCurrentProfile() {
  const profileType = localStorage.getItem('sentiment_profile') || 'lds_faith';
  return SENTIMENT_PROFILES[profileType];
}

// Generate Claude prompt based on profile
export function generateSentimentPrompt(comments, profile) {
  const dimensions = Object.entries(profile.customDimensions)
    .map(([key, config]) => `  - ${key}: ${config.description} (${config.scale[0]}-${config.scale[1]})`)
    .join('\n');
  
  return `
${profile.promptContext}

Analyze these YouTube comments for multi-dimensional sentiment:

Universal dimensions (always include):
- valence: -1 (negative) to +1 (positive)
- arousal: 0 (calm) to 1 (excited)
- dominance: -1 (passive) to +1 (confident)
- 8 emotions (joy, trust, fear, anger, sadness, disgust, surprise, anticipation): each 0-1

Domain-specific dimensions for ${profile.name}:
${dimensions}

Intent classification options: ${profile.intents.join(', ')}

Return structured JSON with detailed sentiment analysis for each comment and thread-level insights.

Comments to analyze:
${JSON.stringify(comments, null, 2)}
  `.trim();
}
```

---

## Resources & Permissions Checklist

### Phase 1: Foundation
- [ ] **Google Analytics 4**
  - [ ] GA4 account created
  - [ ] GA4 tracking ID obtained
  - [ ] Website access for code implementation
  - [ ] GA4 admin permissions
  
- [ ] **UTM Tracking**
  - [ ] UTM naming convention documented
  - [ ] Process for adding UTMs to video descriptions
  - [ ] Access to YouTube channel settings
  
- [ ] **Sentry (Error Tracking)**
  - [ ] Sentry account created
  - [ ] DSN key obtained
  
### Phase 2: Enhanced Analytics
- [ ] **Backend Database (Supabase)**
  - [ ] Supabase account created
  - [ ] Database credentials
  - [ ] API keys
  - [ ] Database schema designed
  
- [ ] **YouTube Data API**
  - [ ] YouTube Data API v3 enabled
  - [ ] API quota sufficient (default: 10,000 units/day)
  - [ ] Consider applying for quota increase if needed
  
### Phase 3: Advanced Sentiment
- [ ] **Claude API**
  - [ ] API key with sufficient quota
  - [ ] Budget monitoring in place
  - [ ] Enhanced prompts tested
  
- [ ] **YouTube Studio Analytics**
  - [ ] Access to YouTube Studio
  - [ ] Process for exporting advanced metrics (CSV)
  - [ ] OR: YouTube Reporting API application submitted
  
### Phase 4: Multi-Platform
- [ ] **Facebook/Instagram**
  - [ ] Facebook Business account
  - [ ] Instagram Business account
  - [ ] Facebook Graph API credentials
  - [ ] Pages/accounts to monitor identified
  
- [ ] **Twitter/X**
  - [ ] Twitter Developer account
  - [ ] API credentials (Basic tier minimum)
  - [ ] Bearer token
  
- [ ] **TikTok** (if applicable)
  - [ ] TikTok Business account
  - [ ] Research API application (if needed)
  
- [ ] **Email Platform**
  - [ ] Email platform selected (Mailchimp, ConvertKit, etc.)
  - [ ] API credentials
  - [ ] Custom fields created for video attribution
  
- [ ] **CRM Platform**
  - [ ] CRM platform selected
  - [ ] API credentials
  - [ ] Custom fields/properties configured
  - [ ] User identification strategy defined

---

## Estimated Costs

### Free Tier Possible:
- Google Analytics 4: **Free**
- Supabase: **Free** (500MB database, 2GB bandwidth)
- Sentry: **Free** (5K errors/month)
- YouTube Data API: **Free** (default quota)
- Facebook/Instagram API: **Free** (with rate limits)
- Mailchimp: **Free** (up to 500 contacts)

### Paid Tiers (if needed):
- Claude API: ~$5-20/month (current usage)
- Twitter API Basic: **$100/month** (if needed)
- Supabase Pro: **$25/month** (if exceeding free tier)
- Email platform: $10-50/month (depends on subscriber count)
- CRM: $15-100/month (depends on platform/features)

**Total estimated: $50-200/month** for full stack

---

## Implementation Timeline

### Phase 1 (Week 1-2): Foundation
- Days 1-3: GA4 setup, UTM implementation
- Days 4-7: Custom event tracking, Sentry setup
- Days 8-10: Testing and validation
- **Deliverable:** Basic behavioral data flowing

### Phase 2 (Week 3-4): Enhanced Analytics
- Days 11-14: Supabase setup, schema design
- Days 15-18: YouTube → GA4 integration
- Days 19-21: Conversion funnel tracking
- **Deliverable:** Attribution from video to conversion

### Phase 3 (Week 5-8): Advanced Sentiment
- Days 22-28: Enhanced sentiment model implementation
- Days 29-35: Video-level impact scoring
- Days 36-42: Sentiment × conversion correlation
- Days 43-49: YouTube advanced metrics, demographic layering
- **Deliverable:** Sentiment change scoring system operational

### Phase 4 (Week 9-12): Multi-Platform
- Days 50-56: Cross-platform API integrations
- Days 57-63: Email platform integration
- Days 64-70: CRM integration
- Days 71-77: A/B test framework
- Days 78-84: Competitor benchmarking, final polish
- **Deliverable:** Full-stack sentiment + behavior system

---

## Success Metrics

### Phase 1 Success:
- ✅ GA4 tracking 100% of website visits
- ✅ UTM parameters on 100% of new videos
- ✅ Custom events firing correctly
- ✅ Error tracking operational

### Phase 2 Success:
- ✅ Database storing all analytics data
- ✅ Video → website conversion tracking working
- ✅ Attribution reports showing video impact

### Phase 3 Success:
- ✅ Multi-dimensional sentiment scores for all comments
- ✅ Video impact scores calculated
- ✅ Sentiment × conversion correlation proven
- ✅ Dashboard showing sentiment insights

### Phase 4 Success:
- ✅ Cross-platform sentiment aggregated
- ✅ Email/CRM attribution operational
- ✅ ROI calculated per video
- ✅ A/B test framework producing insights

---

## Key Stakeholders & Roles

| Role | Responsibilities | Time Commitment |
|------|-----------------|-----------------|
| **Product Owner** | Requirements, priorities, stakeholder management | 5-10 hrs/week |
| **Developer** | Implementation, API integrations, database | 30-40 hrs/week |
| **Data Analyst** | Metric definitions, validation, insights | 10-15 hrs/week |
| **Content Creator** | UTM tagging, A/B test content creation | 5 hrs/week |
| **Marketing Lead** | Email/CRM coordination, conversion tracking | 5-10 hrs/week |

---

## Risk Mitigation

### Technical Risks:
- **API rate limits**: Implement caching, respect quotas
- **Data quality**: Validation, sanity checks, manual review
- **Integration failures**: Error handling, fallback mechanisms
- **Performance**: Optimize queries, use CDN, lazy loading

### Business Risks:
- **Privacy compliance**: GDPR/CCPA review, data minimization
- **Cost overruns**: Budget monitoring, usage alerts
- **Scope creep**: Phased approach, clear deliverables
- **Stakeholder misalignment**: Regular demos, feedback loops

---

## Next Steps

1. **Review this roadmap** with stakeholders
2. **Prioritize phases** based on business needs
3. **Acquire resources** (accounts, API keys, permissions)
4. **Assign roles** and responsibilities
5. **Kick off Phase 1** with GA4 + UTM tracking

---

## Questions? Contact Info

**Document Owner:** [Your Name]  
**Last Updated:** 2026-01-14  
**Version:** 1.0

For questions or to begin implementation, reach out to the development team.
