import { useState, useEffect } from 'react';
import { Settings, Key, DollarSign, Activity, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import claudeAPI from '../services/claudeAPI';
import youtubeAPI from '../services/youtubeAPI';

export default function APISettings() {
  const [claudeKey, setClaudeKey] = useState('');
  const [youtubeKey, setYoutubeKey] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState(20);
  const [usageStats, setUsageStats] = useState(null);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showYoutubeKey, setShowYoutubeKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Load current settings
    setClaudeKey(claudeAPI.loadAPIKey());
    setYoutubeKey(youtubeAPI.loadAPIKey());
    setMonthlyBudget(claudeAPI.loadMonthlyBudget());
    setUsageStats(claudeAPI.getUsageStats());
  }, []);

  const handleSave = () => {
    claudeAPI.saveAPIKey(claudeKey);
    youtubeAPI.saveAPIKey(youtubeKey);
    claudeAPI.saveMonthlyBudget(monthlyBudget);

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const refreshUsage = () => {
    setUsageStats(claudeAPI.getUsageStats());
  };

  const formatCost = (cost) => {
    return `$${cost.toFixed(2)}`;
  };

  const formatTokens = (tokens) => {
    if (tokens > 1000000) return `${(tokens / 1000000).toFixed(2)}M`;
    if (tokens > 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-blue-500" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">API Settings</h2>
            <p className="text-sm text-gray-600">Configure your API keys and usage limits</p>
          </div>
        </div>
        {saved && (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">Saved!</span>
          </div>
        )}
      </div>

      {/* Claude API Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-5 h-5 text-purple-500" />
          <h3 className="text-lg font-semibold text-gray-900">Claude API</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type={showClaudeKey ? 'text' : 'password'}
                value={claudeKey}
                onChange={(e) => setClaudeKey(e.target.value)}
                placeholder="sk-ant-..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <button
                onClick={() => setShowClaudeKey(!showClaudeKey)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
              >
                {showClaudeKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 mt-2"
            >
              Get your API key from Anthropic Console
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Monthly Budget (USD)
            </label>
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-gray-400" />
              <input
                type="number"
                min="0"
                step="5"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(parseFloat(e.target.value))}
                className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <span className="text-sm text-gray-600">
                API calls will stop if this limit is reached
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* YouTube API Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-5 h-5 text-red-500" />
          <h3 className="text-lg font-semibold text-gray-900">YouTube Data API</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type={showYoutubeKey ? 'text' : 'password'}
                value={youtubeKey}
                onChange={(e) => setYoutubeKey(e.target.value)}
                placeholder="AIza..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              <button
                onClick={() => setShowYoutubeKey(!showYoutubeKey)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
              >
                {showYoutubeKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 mt-2"
            >
              Get your API key from Google Cloud Console
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">YouTube API Quota</p>
                <p>YouTube API has a free tier of 10,000 units/day. Fetching comments uses approximately 1 unit per comment.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Statistics */}
      {usageStats && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-semibold text-gray-900">Usage This Month</h3>
            </div>
            <button
              onClick={refreshUsage}
              className="text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Total Cost</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatCost(usageStats.totalCost)}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Remaining Budget</div>
              <div className="text-2xl font-bold text-green-600">
                {formatCost(usageStats.remainingBudget)}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Requests</div>
              <div className="text-2xl font-bold text-gray-900">
                {usageStats.requestCount}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Tokens Used</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatTokens(usageStats.inputTokens + usageStats.outputTokens)}
              </div>
            </div>
          </div>

          {/* Budget progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Budget Usage</span>
              <span className="font-medium text-gray-900">
                {usageStats.budgetUsedPercent.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  usageStats.budgetUsedPercent > 90
                    ? 'bg-red-500'
                    : usageStats.budgetUsedPercent > 70
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(usageStats.budgetUsedPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Recent requests */}
          {usageStats.requests.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Requests</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {usageStats.requests.slice().reverse().slice(0, 10).map((request, index) => (
                  <div key={index} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">{request.feature}</span>
                      <span className="text-gray-500">
                        {formatTokens(request.inputTokens + request.outputTokens)} tokens
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">{formatCost(request.cost)}</span>
                      <span className="text-gray-500">
                        {new Date(request.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          Save Settings
        </button>
      </div>

      {/* Help Text */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-2">Getting Started</h4>
        <ul className="space-y-2 text-sm text-gray-600">
          <li>1. Get your Claude API key from <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">Anthropic Console</a></li>
          <li>2. Get your YouTube API key from <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">Google Cloud Console</a></li>
          <li>3. Set your monthly budget (recommended: $5-20 for typical usage)</li>
          <li>4. Claude API is pay-as-you-go - you only pay for what you use</li>
          <li>5. Usage resets automatically each month</li>
        </ul>
      </div>
    </div>
  );
}
