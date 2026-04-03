import { useState, useEffect } from 'react';
import { Youtube, BarChart3, Users, Zap, ChevronRight, CheckCircle, Loader, ArrowRight } from 'lucide-react';
import { youtubeOAuthService } from '../../services/youtubeOAuthService';

const STEPS = [
  { label: 'Connect Channel', icon: Youtube },
  { label: 'Sync Data', icon: BarChart3 },
  { label: 'Explore Dashboard', icon: Zap },
];

const VALUE_PROPS = [
  { icon: BarChart3, text: 'Daily performance tracking across all your videos' },
  { icon: Users, text: 'See how you stack up against competitors in your category' },
  { icon: Zap, text: 'AI-powered audits and content strategy recommendations' },
];

export default function WelcomeOnboarding({ onComplete, onSkip, user }) {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [channelName, setChannelName] = useState(null);
  const [error, setError] = useState(null);

  // Check URL params for OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth_success') === 'true') {
      setConnected(true);
      setChannelName(params.get('channel'));
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('oauth_error')) {
      setError(params.get('oauth_error'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await youtubeOAuthService.initiateOAuth();
    } catch (e) {
      setError(e.message || 'Failed to start connection');
      setConnecting(false);
    }
  };

  const currentStep = connected ? 2 : 0;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 560,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/Full_View_Logo.png"
            alt="Full View Analytics"
            style={{ height: 48, objectFit: 'contain', marginBottom: 16 }}
          />
        </div>

        {/* Progress */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 40,
        }}>
          {STEPS.map((step, i) => (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: i <= currentStep ? '#2962FF' : '#1a1a1a',
                border: `2px solid ${i <= currentStep ? '#2962FF' : '#333'}`,
                transition: 'all 0.3s ease',
              }}>
                {i < currentStep
                  ? <CheckCircle size={16} color="#fff" />
                  : <step.icon size={14} color={i <= currentStep ? '#fff' : '#666'} />
                }
              </div>
              <span style={{
                fontSize: 12,
                color: i <= currentStep ? '#fff' : '#666',
                fontWeight: i === currentStep ? 600 : 400,
              }}>
                {step.label}
              </span>
              {i < STEPS.length - 1 && (
                <ChevronRight size={14} color="#333" style={{ margin: '0 4px' }} />
              )}
            </div>
          ))}
        </div>

        {/* Main card */}
        <div style={{
          background: '#111',
          border: '1px solid #222',
          borderRadius: 16,
          padding: '40px 32px',
        }}>
          {!connected ? (
            <>
              <h1 style={{
                fontSize: 24,
                fontWeight: 700,
                color: '#fff',
                marginBottom: 8,
                textAlign: 'center',
              }}>
                Connect your YouTube channel
              </h1>
              <p style={{
                fontSize: 14,
                color: '#888',
                textAlign: 'center',
                marginBottom: 32,
                lineHeight: 1.5,
              }}>
                Link your channel to unlock performance analytics, competitive benchmarks, and AI-powered content strategy.
              </p>

              {/* Value props */}
              <div style={{ marginBottom: 32 }}>
                {VALUE_PROPS.map((prop, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: i < VALUE_PROPS.length - 1 ? '1px solid #1a1a1a' : 'none',
                  }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: '#1a1a1a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <prop.icon size={16} color="#3b82f6" />
                    </div>
                    <span style={{ fontSize: 13, color: '#ccc', lineHeight: 1.4 }}>{prop.text}</span>
                  </div>
                ))}
              </div>

              {/* Connect button */}
              <button
                onClick={handleConnect}
                disabled={connecting}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: connecting ? '#1a1a1a' : '#dc2626',
                  border: 'none',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: connecting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  transition: 'all 0.2s ease',
                  opacity: connecting ? 0.7 : 1,
                }}
              >
                {connecting ? (
                  <>
                    <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Youtube size={18} />
                    Connect with YouTube
                  </>
                )}
              </button>

              {error && (
                <p style={{
                  marginTop: 12,
                  fontSize: 13,
                  color: '#ef4444',
                  textAlign: 'center',
                }}>
                  {error}
                </p>
              )}

              {/* Skip */}
              <button
                onClick={onSkip}
                style={{
                  width: '100%',
                  marginTop: 12,
                  padding: '10px',
                  background: 'transparent',
                  border: 'none',
                  color: '#666',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Skip for now
              </button>

              <p style={{
                fontSize: 11,
                color: '#444',
                textAlign: 'center',
                marginTop: 16,
                lineHeight: 1.4,
              }}>
                Read-only access. We never post, modify, or delete anything on your channel.
              </p>
            </>
          ) : (
            <>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '2px solid #22c55e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}>
                  <CheckCircle size={28} color="#22c55e" />
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                  {channelName || 'Channel'} connected
                </h1>
                <p style={{ fontSize: 14, color: '#888', marginBottom: 32, lineHeight: 1.5 }}>
                  Your data is syncing now. The first full sync takes a few minutes — you can start exploring immediately.
                </p>
                <button
                  onClick={onComplete}
                  style={{
                    padding: '14px 32px',
                    background: '#2962FF',
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  Go to Dashboard
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          marginTop: 24,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 12, color: '#444' }}>Powered by</span>
          <img src="/crux-logo.png" alt="CRUX" style={{ height: 20, objectFit: 'contain', opacity: 0.5 }} />
        </div>
      </div>
    </div>
  );
}
