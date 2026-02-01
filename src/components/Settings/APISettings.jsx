import { useState, useEffect } from 'react';
import { Key, DollarSign, Activity, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import claudeAPI from '../../services/claudeAPI';
import youtubeAPI from '../../services/youtubeAPI';

const inputStyle = {
  flex: 1,
  padding: "10px 14px",
  background: "#252525",
  border: "1px solid #444",
  borderRadius: "8px",
  color: "#E0E0E0",
  fontSize: "14px",
  outline: "none",
};

const toggleBtnStyle = {
  padding: "10px 16px",
  background: "#333",
  border: "1px solid #444",
  borderRadius: "8px",
  color: "#9E9E9E",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: "500",
};

const cardStyle = {
  background: "#1E1E1E",
  borderRadius: "12px",
  border: "1px solid #333",
  padding: "24px",
  marginBottom: "16px",
};

const statBox = {
  background: "#252525",
  borderRadius: "8px",
  padding: "14px",
  textAlign: "center",
};

export default function APISettings() {
  const [claudeKey, setClaudeKey] = useState('');
  const [youtubeKey, setYoutubeKey] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState(20);
  const [usageStats, setUsageStats] = useState(null);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showYoutubeKey, setShowYoutubeKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
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

  const formatCost = (cost) => `$${cost.toFixed(2)}`;

  const formatTokens = (tokens) => {
    if (tokens > 1000000) return `${(tokens / 1000000).toFixed(2)}M`;
    if (tokens > 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Key size={24} style={{ color: "#60a5fa" }} />
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: "700", margin: 0 }}>API Settings</h2>
            <p style={{ fontSize: "13px", color: "#9E9E9E", margin: "4px 0 0" }}>Configure your API keys and usage limits</p>
          </div>
        </div>
        {saved && (
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "8px 16px", background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "8px",
            color: "#22c55e", fontSize: "13px", fontWeight: "600",
          }}>
            <CheckCircle2 size={16} />
            Saved!
          </div>
        )}
      </div>

      {/* Claude API */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
          <Key size={18} style={{ color: "#a78bfa" }} />
          <h3 style={{ fontSize: "16px", fontWeight: "600", margin: 0 }}>Claude API</h3>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", color: "#9E9E9E", marginBottom: "8px" }}>API Key</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type={showClaudeKey ? 'text' : 'password'}
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
              placeholder="sk-ant-..."
              style={inputStyle}
            />
            <button onClick={() => setShowClaudeKey(!showClaudeKey)} style={toggleBtnStyle}>
              {showClaudeKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#a78bfa", marginTop: "8px", textDecoration: "none" }}
          >
            Get your API key from Anthropic Console
            <ExternalLink size={12} />
          </a>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "13px", color: "#9E9E9E", marginBottom: "8px" }}>Monthly Budget (USD)</label>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <DollarSign size={18} style={{ color: "#666" }} />
            <input
              type="number"
              min="0"
              step="5"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(parseFloat(e.target.value))}
              style={{ ...inputStyle, flex: "none", width: "100px" }}
            />
            <span style={{ fontSize: "12px", color: "#666" }}>API calls will stop if this limit is reached</span>
          </div>
        </div>
      </div>

      {/* YouTube API */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
          <Key size={18} style={{ color: "#f87171" }} />
          <h3 style={{ fontSize: "16px", fontWeight: "600", margin: 0 }}>YouTube Data API</h3>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", color: "#9E9E9E", marginBottom: "8px" }}>API Key</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type={showYoutubeKey ? 'text' : 'password'}
              value={youtubeKey}
              onChange={(e) => setYoutubeKey(e.target.value)}
              placeholder="AIza..."
              style={inputStyle}
            />
            <button onClick={() => setShowYoutubeKey(!showYoutubeKey)} style={toggleBtnStyle}>
              {showYoutubeKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#f87171", marginTop: "8px", textDecoration: "none" }}
          >
            Get your API key from Google Cloud Console
            <ExternalLink size={12} />
          </a>
        </div>

        <div style={{
          display: "flex", gap: "10px", padding: "12px 14px",
          background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.2)",
          borderRadius: "8px",
        }}>
          <AlertCircle size={18} style={{ color: "#60a5fa", flexShrink: 0, marginTop: "2px" }} />
          <div style={{ fontSize: "12px", color: "#93c5fd" }}>
            <div style={{ fontWeight: "600", marginBottom: "4px" }}>YouTube API Quota</div>
            <div>YouTube API has a free tier of 10,000 units/day. Fetching comments uses approximately 1 unit per comment.</div>
          </div>
        </div>
      </div>

      {/* Usage Statistics */}
      {usageStats && (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Activity size={18} style={{ color: "#22c55e" }} />
              <h3 style={{ fontSize: "16px", fontWeight: "600", margin: 0 }}>Usage This Month</h3>
            </div>
            <button
              onClick={refreshUsage}
              style={{ background: "none", border: "none", color: "#9E9E9E", cursor: "pointer", fontSize: "13px" }}
            >
              Refresh
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
            <div style={statBox}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "6px" }}>Total Cost</div>
              <div style={{ fontSize: "20px", fontWeight: "700" }}>{formatCost(usageStats.totalCost)}</div>
            </div>
            <div style={statBox}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "6px" }}>Remaining</div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: "#22c55e" }}>{formatCost(usageStats.remainingBudget)}</div>
            </div>
            <div style={statBox}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "6px" }}>Requests</div>
              <div style={{ fontSize: "20px", fontWeight: "700" }}>{usageStats.requestCount}</div>
            </div>
            <div style={statBox}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "6px" }}>Tokens Used</div>
              <div style={{ fontSize: "20px", fontWeight: "700" }}>{formatTokens(usageStats.inputTokens + usageStats.outputTokens)}</div>
            </div>
          </div>

          {/* Budget bar */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
              <span style={{ color: "#9E9E9E" }}>Budget Usage</span>
              <span style={{ fontWeight: "600" }}>{usageStats.budgetUsedPercent.toFixed(1)}%</span>
            </div>
            <div style={{ height: "8px", background: "#333", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(usageStats.budgetUsedPercent, 100)}%`,
                background: usageStats.budgetUsedPercent > 90 ? "#ef4444"
                  : usageStats.budgetUsedPercent > 70 ? "#f59e0b" : "#22c55e",
                borderRadius: "4px",
                transition: "width 0.3s ease",
              }} />
            </div>
          </div>

          {/* Recent requests */}
          {usageStats.requests.length > 0 && (
            <div>
              <h4 style={{ fontSize: "13px", fontWeight: "600", marginBottom: "10px" }}>Recent Requests</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "240px", overflowY: "auto" }}>
                {usageStats.requests.slice().reverse().slice(0, 10).map((request, index) => (
                  <div key={index} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: "#252525", borderRadius: "8px", fontSize: "12px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontWeight: "600" }}>{request.feature}</span>
                      <span style={{ color: "#666" }}>{formatTokens(request.inputTokens + request.outputTokens)} tokens</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontWeight: "600" }}>{formatCost(request.cost)}</span>
                      <span style={{ color: "#666" }}>{new Date(request.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save Button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <button
          onClick={handleSave}
          style={{
            padding: "10px 28px", background: "#2962FF", border: "none",
            borderRadius: "8px", color: "#fff", cursor: "pointer",
            fontWeight: "600", fontSize: "14px",
          }}
        >
          Save Settings
        </button>
      </div>

      {/* Help Text */}
      <div style={{
        padding: "16px 20px", background: "#1E1E1E", borderRadius: "12px",
        border: "1px solid #333", fontSize: "13px", color: "#9E9E9E",
      }}>
        <h4 style={{ fontWeight: "600", color: "#E0E0E0", marginBottom: "10px", marginTop: 0 }}>Getting Started</h4>
        <ol style={{ margin: 0, paddingLeft: "20px", lineHeight: "2" }}>
          <li>Get your Claude API key from <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", textDecoration: "none" }}>Anthropic Console</a></li>
          <li>Get your YouTube API key from <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#f87171", textDecoration: "none" }}>Google Cloud Console</a></li>
          <li>Set your monthly budget (recommended: $5-20 for typical usage)</li>
          <li>Claude API is pay-as-you-go — you only pay for what you use</li>
          <li>Usage resets automatically each month</li>
        </ol>
      </div>
    </div>
  );
}
