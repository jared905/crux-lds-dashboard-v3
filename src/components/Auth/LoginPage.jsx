import {useState} from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react';

const LoginPage = ({ onSwitchToSignup }) => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      /* Transparent on purpose: body::before is the Earth-at-night photo,
         and this page used to paint an opaque box over it — the most
         atmospheric brand asset, invisible on the most brandable screen. */
      background: 'transparent',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      {/* App Description — visible to Google crawlers */}
      <div style={{
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center',
        marginBottom: '24px',
      }}>
        {/* The key art. One use in the whole product — this lockup. */}
        <div className="keyart" style={{ '--grain': 0.5, marginBottom: '18px' }}>
          <div className="inner" style={{ padding: '42px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src="/Full_View_Logo.png"
              alt="Full View Studio"
              style={{ height: '64px', objectFit: 'contain' }}
            />
          </div>
        </div>
        <h1 style={{
          color: "var(--text)",
          fontSize: '28px',
          fontWeight: '700',
          marginBottom: '8px',
        }}>
          Full View Studio
        </h1>
        <p style={{
          color: "var(--muted)",
          fontSize: '14px',
          lineHeight: '1.6',
          marginBottom: '0',
        }}>
          See why videos win in your category, and what to make next. Built for creators and agencies by Crux Media.
        </p>
      </div>

      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'rgba(24, 24, 23, 0.86)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderRadius: '8px',
        padding: '40px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)'
      }}>
        {/* Title */}
        <h2 style={{
          color: "var(--text)",
          fontSize: '20px',
          fontWeight: '700',
          textAlign: 'center',
          marginBottom: '8px'
        }}>
          Sign In
        </h2>
        <p style={{
          color: "var(--muted)",
          fontSize: '14px',
          textAlign: 'center',
          marginBottom: '32px'
        }}>
          Access your dashboard
        </p>

        {/* Error Message */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            background: 'rgba(207, 102, 121, 0.15)',
            border: '1px solid rgba(207, 102, 121, 0.3)',
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <AlertCircle size={18} color="#ff8375" />
            <span style={{ color: "var(--neg)", fontSize: '14px' }}>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Email Field */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              color: "var(--muted)",
              fontSize: '14px',
              fontWeight: '500',
              marginBottom: '8px'
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: '8px',
                color: "var(--text)",
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--blue)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border)"}
            />
          </div>

          {/* Password Field */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              color: "var(--muted)",
              fontSize: '14px',
              fontWeight: '500',
              marginBottom: '8px'
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                style={{
                  width: '100%',
                  padding: '12px 48px 12px 16px',
                  background: "var(--bg)",
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: "var(--text)",
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--blue)"}
                onBlur={(e) => e.target.style.borderColor = "var(--border)"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: "var(--muted)",
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? 'var(--blue)' : "var(--blue)",
              border: 'none',
              borderRadius: '16px',
              color: 'var(--on-accent)',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => !loading && (e.target.style.background = 'var(--blue)')}
            onMouseLeave={(e) => !loading && (e.target.style.background = "var(--blue)")}
          >
            {loading ? (
              <span>Signing in...</span>
            ) : (
              <>
                <LogIn size={18} />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        {/* Sign Up Link */}
        <p style={{
          color: "var(--muted)",
          fontSize: '14px',
          textAlign: 'center',
          marginTop: '24px'
        }}>
          Don't have an account?{' '}
          <button
            onClick={onSwitchToSignup}
            style={{
              background: 'transparent',
              border: 'none',
              color: "var(--blue)",
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              textDecoration: 'none'
            }}
            onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
          >
            Sign up
          </button>
        </p>

        {/* Powered By */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          marginTop: '32px',
          paddingTop: '24px',
          borderTop: "1px solid var(--border)"
        }}>
          <span style={{ fontSize: '10px', color: 'var(--faint)', fontWeight: '600', letterSpacing: '0.5px' }}>
            POWERED BY
          </span>
          <img
            src="/crux-logo.png"
            alt="CRUX"
            style={{ height: '12px', objectFit: 'contain', opacity: 0.6 }}
          />
        </div>
      </div>

      {/* Legal links */}
      <div style={{
        marginTop: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        fontSize: '12px',
      }}>
        <a href="/privacy" style={{ color: "var(--muted)", textDecoration: 'none' }}
          onMouseEnter={(e) => e.target.style.color = 'var(--accent-text)'}
          onMouseLeave={(e) => e.target.style.color = "var(--muted)"}
        >
          Privacy Policy
        </a>
        <span style={{ color: 'var(--outline-variant)' }}>|</span>
        <a href="/terms" style={{ color: "var(--muted)", textDecoration: 'none' }}
          onMouseEnter={(e) => e.target.style.color = 'var(--accent-text)'}
          onMouseLeave={(e) => e.target.style.color = "var(--muted)"}
        >
          Terms of Service
        </a>
      </div>
    </div>
  );
};

export default LoginPage;
