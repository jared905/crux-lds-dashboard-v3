/**
 * Claude API Service - v2.0.1
 * Handles all interactions with Anthropic's Claude API via backend proxy
 * Includes rate limiting, error handling, cost tracking, and budget management
 * Cache buster: 2026-01-14
 */

// Use our Vercel serverless function to proxy requests (fixes CORS)
// In development, call Anthropic directly (CORS doesn't apply to localhost)
// In production, use our proxy to avoid CORS issues
const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const CLAUDE_API_URL = IS_DEV
  ? 'https://api.anthropic.com/v1/messages'  // Direct API in dev (no CORS issue)
  : '/api/claude';  // Proxy in production

const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';
const MAX_TOKENS = 4096;
const API_VERSION = '2.0.1'; // Force bundle refresh

// Pricing per million tokens (as of Jan 2025)
const PRICING = {
  input: 3.00,   // $3 per million input tokens
  output: 15.00  // $15 per million output tokens
};

class ClaudeAPIService {
  constructor() {
    this.apiKey = this.loadAPIKey();
    this.usageStats = this.loadUsageStats();
    this.monthlyBudget = this.loadMonthlyBudget();
  }

  // Load API key from localStorage
  loadAPIKey() {
    return localStorage.getItem('claude_api_key') || '';
  }

  // Save API key to localStorage
  saveAPIKey(key) {
    this.apiKey = key;
    localStorage.setItem('claude_api_key', key);
  }

  // Load usage statistics from localStorage
  loadUsageStats() {
    const stats = localStorage.getItem('claude_usage_stats');
    if (stats) {
      const parsed = JSON.parse(stats);
      // Reset if it's a new month
      const lastUpdate = new Date(parsed.lastUpdate);
      const now = new Date();
      if (lastUpdate.getMonth() !== now.getMonth() || lastUpdate.getFullYear() !== now.getFullYear()) {
        return this.resetUsageStats();
      }
      return parsed;
    }
    return this.resetUsageStats();
  }

  // Reset usage stats for new month
  resetUsageStats() {
    const stats = {
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
      requestCount: 0,
      lastUpdate: new Date().toISOString(),
      requests: []
    };
    localStorage.setItem('claude_usage_stats', JSON.stringify(stats));
    return stats;
  }

  // Load monthly budget limit
  loadMonthlyBudget() {
    const budget = localStorage.getItem('claude_monthly_budget');
    return budget ? parseFloat(budget) : 20.00; // Default $20/month
  }

  // Save monthly budget
  saveMonthlyBudget(budget) {
    this.monthlyBudget = budget;
    localStorage.setItem('claude_monthly_budget', budget.toString());
  }

  // Calculate cost for tokens
  calculateCost(inputTokens, outputTokens) {
    const inputCost = (inputTokens / 1000000) * PRICING.input;
    const outputCost = (outputTokens / 1000000) * PRICING.output;
    return inputCost + outputCost;
  }

  // Update usage statistics
  updateUsageStats(inputTokens, outputTokens, feature) {
    const cost = this.calculateCost(inputTokens, outputTokens);

    this.usageStats.inputTokens += inputTokens;
    this.usageStats.outputTokens += outputTokens;
    this.usageStats.totalCost += cost;
    this.usageStats.requestCount += 1;
    this.usageStats.lastUpdate = new Date().toISOString();
    this.usageStats.requests.push({
      timestamp: new Date().toISOString(),
      feature,
      inputTokens,
      outputTokens,
      cost
    });

    // Keep only last 100 requests to avoid storage bloat
    if (this.usageStats.requests.length > 100) {
      this.usageStats.requests = this.usageStats.requests.slice(-100);
    }

    localStorage.setItem('claude_usage_stats', JSON.stringify(this.usageStats));
  }

  // Check if request would exceed budget
  checkBudget(estimatedTokens = 10000) {
    const estimatedCost = this.calculateCost(estimatedTokens / 2, estimatedTokens / 2);
    return (this.usageStats.totalCost + estimatedCost) <= this.monthlyBudget;
  }

  // Get current usage stats
  getUsageStats() {
    return {
      ...this.usageStats,
      monthlyBudget: this.monthlyBudget,
      remainingBudget: this.monthlyBudget - this.usageStats.totalCost,
      budgetUsedPercent: (this.usageStats.totalCost / this.monthlyBudget) * 100
    };
  }

  // Estimate tokens for text (rough approximation: 1 token ≈ 4 characters)
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  // Main API call method
  async call(prompt, systemPrompt = '', feature = 'general', maxTokens = MAX_TOKENS) {
    // Validate API key
    if (!this.apiKey) {
      throw new Error('Claude API key not configured. Please add your API key in settings.');
    }

    // Check budget
    const estimatedInputTokens = this.estimateTokens(systemPrompt + prompt);
    if (!this.checkBudget(estimatedInputTokens + maxTokens)) {
      throw new Error(`Monthly budget of $${this.monthlyBudget} would be exceeded. Current usage: $${this.usageStats.totalCost.toFixed(2)}`);
    }

    try {
      // Prepare request based on environment
      const requestBody = IS_DEV ? {
        // Direct API call in development
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt || undefined,
        messages: [{ role: 'user', content: prompt }]
      } : {
        // Proxy call in production
        apiKey: this.apiKey,
        maxTokens: maxTokens,
        system: systemPrompt || undefined,
        messages: [{ role: 'user', content: prompt }],
        stream: false
      };

      const requestHeaders = IS_DEV ? {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      } : {
        'Content-Type': 'application/json'
      };

      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API request failed: ${response.status}`);
      }

      const data = await response.json();

      // Update usage stats
      const inputTokens = data.usage.input_tokens;
      const outputTokens = data.usage.output_tokens;
      this.updateUsageStats(inputTokens, outputTokens, feature);

      return {
        text: data.content[0].text,
        usage: data.usage,
        cost: this.calculateCost(inputTokens, outputTokens)
      };

    } catch (error) {
      console.error('Claude API error:', error);
      throw error;
    }
  }

  // Streaming API call (for real-time responses)
  async streamCall(prompt, systemPrompt = '', feature = 'general', onChunk, maxTokens = MAX_TOKENS) {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured. Please add your API key in settings.');
    }

    const estimatedInputTokens = this.estimateTokens(systemPrompt + prompt);
    if (!this.checkBudget(estimatedInputTokens + maxTokens)) {
      throw new Error(`Monthly budget of $${this.monthlyBudget} would be exceeded.`);
    }

    try {
      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey: this.apiKey,  // Pass API key in body to proxy
          maxTokens: maxTokens,
          system: systemPrompt || undefined,
          messages: [{ role: 'user', content: prompt }],
          stream: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

        for (const line of lines) {
          const data = line.replace('data:', '').trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'content_block_delta') {
              const text = parsed.delta.text;
              fullText += text;
              onChunk(text);
            }

            if (parsed.type === 'message_start') {
              inputTokens = parsed.message.usage.input_tokens;
            }

            if (parsed.type === 'message_delta') {
              outputTokens = parsed.usage.output_tokens;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }

      // Update usage stats
      this.updateUsageStats(inputTokens, outputTokens, feature);

      return {
        text: fullText,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        cost: this.calculateCost(inputTokens, outputTokens)
      };

    } catch (error) {
      console.error('Claude API streaming error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const claudeAPI = new ClaudeAPIService();
export default claudeAPI;
