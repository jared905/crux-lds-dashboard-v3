# AI Features Setup Guide

## What's Been Added

Your LDS YouTube Analytics Dashboard now includes **Phase 1** and **Phase 2** AI features powered by Claude API and YouTube Data API.

---

## 🚀 New Features

### **Phase 1: Core AI Features**

1. **AI Video Idea Generator** (`/AI Ideas` tab)
   - Analyzes your top 20% videos
   - Generates 10 data-driven video ideas
   - Includes titles, hooks, thumbnail concepts
   - **Cost:** ~$0.20-0.40 per generation

2. **Enhanced Content Intelligence** (`/Intelligence` tab)
   - Toggle between rule-based (free) and AI mode
   - Ask ANY question about your data
   - No pattern-matching limits
   - **Cost:** ~$0.10-0.30 per question

3. **AI Executive Summary** (`/AI Summary` tab)
   - Generates professional narrative reports
   - Stakeholder-ready language
   - Strategic insights and recommendations
   - **Cost:** ~$0.15-0.45 per summary

### **Phase 2: Comment Analysis**

4. **YouTube Comment Analysis** (`/Comments` tab)
   - Fetch comments from any video via YouTube API
   - AI theme extraction and sentiment analysis
   - Content gap identification
   - Audience insights
   - **Cost:** ~$0.50-1.50 per 1000 comments

### **Settings**

5. **API Configuration** (`/API Settings` tab)
   - Manage Claude API and YouTube API keys
   - Set monthly budget limits
   - Track real-time usage and costs
   - View request history

---

## 📋 Setup Instructions

### Step 1: Get Your Claude API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to "API Keys" in settings
4. Create a new API key
5. Copy the key (starts with `sk-ant-...`)

**Important:** This is separate from your Claude.ai subscription. It's pay-as-you-go billing.

### Step 2: Get Your YouTube Data API Key

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable "YouTube Data API v3"
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. Copy the key (starts with `AIza...`)

**Note:** Free tier includes 10,000 units/day (enough for ~10,000 comments)

### Step 3: Configure in Dashboard

1. Launch your dashboard
2. Navigate to **API Settings** tab in the sidebar
3. Paste your Claude API key
4. Paste your YouTube API key
5. Set your monthly budget (recommended: $5-20)
6. Click **Save Settings**

---

## 💰 Cost Management

### Budget Protection Built-In

- **Monthly budget caps** - API calls stop when limit reached
- **Usage warnings** - See estimated cost before each operation
- **Real-time tracking** - Monitor spend in API Settings
- **Cost per request** - Displayed on every action button

### No Subscription Required

- **Pay only for what you use**
- If you don't use a feature, cost is $0
- No monthly minimums
- Usage resets automatically each month

### Typical Monthly Costs

**Light Usage** (~$2-5/month):
- 5-10 video ideas generated
- 20-30 AI questions asked
- 1-2 executive summaries
- Analyze 1-2K comments

**Moderate Usage** (~$10-20/month):
- 20+ video ideas
- 50+ AI questions
- Weekly executive summaries
- Analyze 10K+ comments

**Heavy Usage** (~$50-100/month):
- Daily ideation
- Unlimited Q&A
- Multi-client reporting
- 100K+ comments analyzed

---

## 🎯 How to Use Each Feature

### Video Idea Generator

1. Navigate to **AI Ideas** tab
2. Ensure you have uploaded video data
3. Click **Generate Video Ideas**
4. Review 10 personalized ideas with:
   - Catchy titles
   - Opening hooks
   - Thumbnail concepts
   - Why it will work for your audience

### Enhanced Content Intelligence

1. Go to **Intelligence** tab
2. Click **Enable AI Mode**
3. Type any question about your data:
   - "Why did my views drop in December?"
   - "What topics work best on Sundays?"
   - "Which videos have high CTR but low retention?"
4. Get detailed, contextual answers

### AI Executive Summary

1. Navigate to **AI Summary** tab
2. Click **Generate Summary**
3. Wait 10-15 seconds
4. Copy the professional narrative report
5. Use in presentations, board meetings, or stakeholder updates

### Comment Analysis

1. Go to **Comments** tab
2. Paste a YouTube video URL
3. Set max comments to fetch (100-1000 recommended)
4. Click **Fetch Comments**
5. Click **Analyze Comments**
6. Review themes, sentiment, content gaps, and recommendations

---

## 🔒 Security & Privacy

- **API keys stored locally** in your browser's localStorage
- **No server storage** - keys never leave your machine
- **Direct API calls** - Your data goes directly to Anthropic/Google
- **No third-party access** - Complete privacy

---

## 🐛 Troubleshooting

### "API key not configured"
- Go to API Settings and add your keys
- Make sure to click Save Settings

### "Monthly budget exceeded"
- Increase your budget in API Settings
- Or wait until next month (auto-resets)

### "Failed to fetch comments"
- Check your YouTube API key is correct
- Ensure the video URL is valid
- Some videos have comments disabled

### "Invalid API key"
- Verify the key is copied correctly
- Check it starts with `sk-ant-` (Claude) or `AIza` (YouTube)
- Ensure the key hasn't been revoked

---

## 📊 Files Added

### Services
- `/src/services/claudeAPI.js` - Claude API integration
- `/src/services/youtubeAPI.js` - YouTube Data API integration

### Components
- `/src/components/APISettings.jsx` - API configuration UI
- `/src/components/VideoIdeaGenerator.jsx` - Video ideation
- `/src/components/CommentAnalysis.jsx` - Comment theme extraction
- `/src/components/EnhancedContentIntelligence.jsx` - AI Q&A wrapper
- `/src/components/AIExecutiveSummary.jsx` - Narrative report generator

### Modified Files
- `/src/App.jsx` - Added new tabs and navigation

---

## 🎉 Ready to Use!

Your dashboard is now powered by AI. Start by:

1. Adding your API keys in **API Settings**
2. Generating your first video ideas in **AI Ideas**
3. Asking questions in **Intelligence** (AI Mode)

**Remember:** You only pay for what you use. Try it out risk-free!

---

## 💡 Tips for Best Results

### Video Ideas
- Upload at least 20 videos for best results
- Run after publishing several videos in a new style
- Use ideas as inspiration, not exact scripts

### Q&A
- Be specific: "Why did X happen?" vs "Tell me about views"
- Ask follow-up questions for deeper insights
- Reference specific metrics (CTR, retention, etc.)

### Executive Summary
- Generate monthly for consistent reporting
- Use before board meetings or investor updates
- Customize budget recommendations based on your goals

### Comment Analysis
- Analyze top-performing videos to see what resonates
- Look for patterns across multiple videos
- Use content gaps to plan future videos

---

## 📞 Support

- **Claude API Issues:** [Anthropic Support](https://support.anthropic.com/)
- **YouTube API Issues:** [Google Cloud Support](https://cloud.google.com/support)
- **Dashboard Issues:** Check browser console for errors

---

**Built with ❤️ using Claude API + YouTube Data API**
