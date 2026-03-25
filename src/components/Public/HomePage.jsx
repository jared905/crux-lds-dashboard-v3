/**
 * HomePage — Public landing page (no authentication required)
 *
 * Required for Google OAuth verification.
 * Explains the purpose of Full View Analytics without requiring sign-in.
 */
import React from 'react';

export default function HomePage({ onSignIn }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#181817',
      color: '#E0E0E0',
      fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px', maxWidth: '1200px', margin: '0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/Full_View_Logo.png" alt="Full View Studio" style={{ height: '40px', objectFit: 'contain' }} />
          <span style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>Full View Studio</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <a href="/privacy" style={{ color: '#888', fontSize: '13px', textDecoration: 'none' }}>Privacy</a>
          <a href="/terms" style={{ color: '#888', fontSize: '13px', textDecoration: 'none' }}>Terms</a>
          <button
            onClick={onSignIn}
            style={{
              padding: '8px 20px', background: '#2962FF', border: 'none',
              borderRadius: '6px', color: '#fff', fontSize: '13px',
              fontWeight: '600', cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{
        maxWidth: '900px', margin: '0 auto', padding: '80px 32px 60px',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '48px', fontWeight: '800', color: '#fff',
          lineHeight: '1.2', marginBottom: '20px',
        }}>
          YouTube Analytics &<br />Content Strategy Platform
        </h1>
        <p style={{
          fontSize: '18px', color: '#9E9E9E', lineHeight: '1.7',
          maxWidth: '650px', margin: '0 auto 32px',
        }}>
          Full View Studio by Crux Media provides enterprise YouTube analytics, competitive benchmarking,
          AI-powered channel audits, and content strategy tools for brands and agencies.
        </p>
        <button
          onClick={onSignIn}
          style={{
            padding: '14px 32px', background: '#2962FF', border: 'none',
            borderRadius: '8px', color: '#fff', fontSize: '16px',
            fontWeight: '700', cursor: 'pointer',
          }}
        >
          Get Started
        </button>
      </div>

      {/* Features */}
      <div style={{
        maxWidth: '1100px', margin: '0 auto', padding: '40px 32px 80px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px',
      }}>
        {[
          {
            title: 'Channel Analytics',
            description: 'Track subscriber growth, view performance, upload frequency, and engagement metrics across your YouTube channels with daily automated syncing.',
          },
          {
            title: 'Competitive Benchmarking',
            description: 'Monitor competitor channels across categories. Compare subscriber counts, content strategies, and upload patterns with side-by-side analysis.',
          },
          {
            title: 'AI-Powered Audits',
            description: 'Generate comprehensive channel audits with content gap analysis, strategic recommendations, named show concepts, and competitive positioning.',
          },
          {
            title: 'Content Strategy',
            description: 'Identify content gaps, detect series patterns, and receive data-driven recommendations for new show concepts that compound over time.',
          },
          {
            title: 'Client Reporting',
            description: 'Build client-facing reports with pre-populated data, Claude-generated narratives, and structured templates designed for C-suite audiences.',
          },
          {
            title: 'Multi-Client Management',
            description: 'Manage multiple client accounts with role-based access, per-client competitor tracking, and branded report exports.',
          },
        ].map((feature, i) => (
          <div key={i} style={{
            background: '#1E1E1E', border: '1px solid #333',
            borderRadius: '10px', padding: '28px',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>
              {feature.title}
            </h3>
            <p style={{ fontSize: '13px', color: '#9E9E9E', lineHeight: '1.7', margin: 0 }}>
              {feature.description}
            </p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{
        maxWidth: '900px', margin: '0 auto', padding: '40px 32px 80px',
      }}>
        <h2 style={{ fontSize: '28px', fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: '32px' }}>
          How It Works
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            { step: '1', text: 'Connect your YouTube channel via OAuth or add competitor channels by URL' },
            { step: '2', text: 'Full View syncs channel data daily and tracks performance over time' },
            { step: '3', text: 'Run AI-powered audits to identify content gaps and growth opportunities' },
            { step: '4', text: 'Generate client-ready reports with strategic recommendations' },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '16px',
              background: '#1E1E1E', border: '1px solid #333',
              borderRadius: '8px', padding: '20px',
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: '#2962FF', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: '700', flexShrink: 0,
              }}>
                {item.step}
              </div>
              <p style={{ fontSize: '14px', color: '#ccc', lineHeight: '1.6', margin: 0 }}>
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #333', padding: '24px 32px',
        maxWidth: '1200px', margin: '0 auto',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: '12px', color: '#666' }}>
          © {new Date().getFullYear()} Crux Media. All rights reserved.
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <a href="/privacy" style={{ color: '#888', fontSize: '12px', textDecoration: 'none' }}>Privacy Policy</a>
          <a href="/terms" style={{ color: '#888', fontSize: '12px', textDecoration: 'none' }}>Terms of Service</a>
        </div>
      </footer>
    </div>
  );
}
