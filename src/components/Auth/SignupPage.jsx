import {useState} from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AlertCircle, CheckCircle, Eye, EyeOff, UserPlus } from 'lucide-react';

const SignupPage = ({ onSwitchToLogin }) => {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await signUp(email, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // Success state
  if (success) {
    return (
      <div style={{
        minHeight: '100vh',
        background: "var(--bg)",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '400px',
          background: "var(--card)",
          borderRadius: "24px",
          padding: '40px',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'rgba(0, 200, 83, 0.15)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px'
          }}>
            <CheckCircle size={32} color="#CDF200" />
          </div>
          <h2 style={{ color: "var(--text)", fontSize: '20px', marginBottom: '12px' }}>
            Account Created!
          </h2>
          <p style={{ color: "var(--muted)", fontSize: '14px', marginBottom: '24px' }}>
            Your account is ready. You can now sign in.
          </p>
          <button
            onClick={onSwitchToLogin}
            style={{
              width: '100%',
              padding: '14px',
              background: "var(--blue)",
              border: 'none',
              borderRadius: '8px',
              color: "var(--ink)",
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: "var(--bg)",
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: "var(--card)",
        borderRadius: "24px",
        padding: '40px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)'
      }}>
        {/* Logo */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '32px'
        }}>
          <img
            src="/Full_View_Logo.png"
            alt="Full View Analytics"
            style={{
              height: '80px',
              objectFit: 'contain'
            }}
          />
        </div>

        {/* Title */}
        <h1 style={{
          color: "var(--text)",
          fontSize: '28px',
          fontWeight: '700',
          textAlign: 'center',
          marginBottom: '8px'
        }}>
          Create Account
        </h1>
        <p style={{
          color: "var(--muted)",
          fontSize: '14px',
          textAlign: 'center',
          marginBottom: '32px'
        }}>
          Sign up to get started with Full View
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
          <div style={{ marginBottom: '20px' }}>
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
                placeholder="At least 6 characters"
                required
                style={{
                  width: '100%',
                  padding: '12px 48px 12px 16px',
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

          {/* Confirm Password Field */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              color: "var(--muted)",
              fontSize: '14px',
              fontWeight: '500',
              marginBottom: '8px'
            }}>
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
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

          {/*
            Terms + Privacy assent. Signup previously created an account with
            no reference to either document anywhere on this page, leaving the
            ToS's "by using this you agree" clause as the only basis — a
            browsewrap theory, which is far weaker than showing the terms at
            the point of assent. This sits directly above the button so the
            act of creating the account is the act of accepting.
          */}
          <p style={{
            color: "var(--muted)",
            fontSize: '13px',
            lineHeight: 1.5,
            marginBottom: '16px',
            textAlign: 'center',
          }}>
            By creating an account you agree to our{' '}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--blue)", textDecoration: 'underline' }}
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--blue)", textDecoration: 'underline' }}
            >
              Privacy Policy
            </a>
            .
          </p>

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
              <span>Creating account...</span>
            ) : (
              <>
                <UserPlus size={18} />
                <span>Create Account</span>
              </>
            )}
          </button>
        </form>

        {/* Sign In Link */}
        <p style={{
          color: "var(--muted)",
          fontSize: '14px',
          textAlign: 'center',
          marginTop: '24px'
        }}>
          Already have an account?{' '}
          <button
            onClick={onSwitchToLogin}
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
            Sign in
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
          borderTop: '1px solid var(--border)'
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
    </div>
  );
};

export default SignupPage;
