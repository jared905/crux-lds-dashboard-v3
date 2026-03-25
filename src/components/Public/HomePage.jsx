/**
 * HomePage — Public landing page (no authentication required)
 *
 * Required for Google OAuth verification.
 * Explains the purpose of Full View Analytics without requiring sign-in.
 */
import React, { useState, useEffect } from 'react';
import { BarChart3, Users, Zap, Target, FileText, Layers, ArrowRight, Play, TrendingUp, Eye } from 'lucide-react';

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Channel Analytics',
    description: 'Track subscriber growth, view performance, upload frequency, and engagement metrics with daily automated syncing.',
    color: '#3b82f6',
    gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  },
  {
    icon: Users,
    title: 'Competitive Benchmarking',
    description: 'Monitor competitors across categories. Compare strategies with side-by-side analysis and category-level breakdowns.',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  },
  {
    icon: Zap,
    title: 'AI-Powered Audits',
    description: 'Generate comprehensive channel audits with content gap analysis, named show concepts, and competitive positioning.',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
  },
  {
    icon: Target,
    title: 'Content Strategy',
    description: 'Identify content gaps, detect series patterns, and get data-driven show concepts that compound over time.',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
  },
  {
    icon: FileText,
    title: 'Client Reporting',
    description: 'Build client-facing reports with AI-generated narratives, structured templates, and PDF export designed for C-suite.',
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, #ec4899, #db2777)',
  },
  {
    icon: Layers,
    title: 'Multi-Client Management',
    description: 'Manage multiple accounts with role-based access, per-client competitor tracking, and branded exports.',
    color: '#06b6d4',
    gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
  },
];

const STATS = [
  { value: '3B+', label: 'Views Managed' },
  { value: '15+', label: 'Years Experience' },
  { value: '239+', label: 'Channels Tracked' },
  { value: '24/7', label: 'Automated Sync' },
];

export default function HomePage({ onSignIn }) {
  const [scrollY, setScrollY] = useState(0);
  const [hoveredFeature, setHoveredFeature] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#E0E0E0',
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflowX: 'hidden',
    }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        .hero-glow { position: absolute; border-radius: 50%; filter: blur(120px); pointer-events: none; }
        .feature-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .feature-card:hover { transform: translateY(-6px); border-color: var(--accent) !important; box-shadow: 0 20px 60px var(--glow) !important; }
        .cta-btn { transition: all 0.2s ease; }
        .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(41, 98, 255, 0.4); }
        .stat-card { transition: transform 0.3s ease; }
        .stat-card:hover { transform: scale(1.05); }
        .step-card { transition: all 0.3s ease; }
        .step-card:hover { border-color: #3b82f6 !important; background: #141414 !important; }
        .nav-link { transition: color 0.2s ease; }
        .nav-link:hover { color: #fff !important; }
      `}</style>

      {/* Background gradient orbs */}
      <div className="hero-glow" style={{
        width: '600px', height: '600px', background: 'rgba(41, 98, 255, 0.08)',
        top: '-200px', left: '50%', transform: `translateX(-50%) translateY(${scrollY * 0.1}px)`,
      }} />
      <div className="hero-glow" style={{
        width: '400px', height: '400px', background: 'rgba(139, 92, 246, 0.06)',
        top: '100px', right: '-100px', transform: `translateY(${scrollY * 0.15}px)`,
      }} />
      <div className="hero-glow" style={{
        width: '300px', height: '300px', background: 'rgba(16, 185, 129, 0.05)',
        top: '400px', left: '-50px', transform: `translateY(${scrollY * 0.12}px)`,
      }} />

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 40px', maxWidth: '1200px', margin: '0 auto',
        position: 'relative', zIndex: 10,
        opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/Full_View_Logo.png" alt="Full View Studio" style={{ height: '36px', objectFit: 'contain' }} />
        </div>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <a href="/privacy" className="nav-link" style={{ color: '#666', fontSize: '13px', textDecoration: 'none' }}>Privacy</a>
          <a href="/terms" className="nav-link" style={{ color: '#666', fontSize: '13px', textDecoration: 'none' }}>Terms</a>
          <button
            onClick={onSignIn}
            className="cta-btn"
            style={{
              padding: '8px 20px', background: 'transparent', border: '1px solid #444',
              borderRadius: '8px', color: '#fff', fontSize: '13px',
              fontWeight: '600', cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{
        maxWidth: '1000px', margin: '0 auto', padding: '80px 40px 40px',
        textAlign: 'center', position: 'relative', zIndex: 5,
      }}>
        {/* Large centered logo */}
        <div style={{
          animation: visible ? 'fadeInUp 0.8s ease forwards' : 'none',
          opacity: 0,
          animationDelay: '0.1s',
          animationFillMode: 'forwards',
        }}>
          <img
            src="/Full_View_Logo.png"
            alt="Full View Studio"
            style={{
              height: '120px', objectFit: 'contain', marginBottom: '32px',
              filter: 'drop-shadow(0 0 40px rgba(41, 98, 255, 0.3))',
            }}
          />
        </div>

        <h1 style={{
          fontSize: '56px', fontWeight: '800', color: '#fff',
          lineHeight: '1.15', marginBottom: '24px', letterSpacing: '-1px',
          animation: visible ? 'fadeInUp 0.8s ease forwards' : 'none',
          opacity: 0, animationDelay: '0.2s', animationFillMode: 'forwards',
        }}>
          YouTube Intelligence<br />
          <span style={{
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundSize: '200% auto',
            animation: 'shimmer 3s linear infinite',
          }}>
            for Enterprise Brands
          </span>
        </h1>

        <p style={{
          fontSize: '19px', color: '#888', lineHeight: '1.7',
          maxWidth: '600px', margin: '0 auto 40px',
          animation: visible ? 'fadeInUp 0.8s ease forwards' : 'none',
          opacity: 0, animationDelay: '0.35s', animationFillMode: 'forwards',
        }}>
          Analytics, competitive benchmarking, AI-powered audits, and content strategy —
          built for agencies and brands by Crux Media.
        </p>

        <div style={{
          display: 'flex', gap: '16px', justifyContent: 'center',
          animation: visible ? 'fadeInUp 0.8s ease forwards' : 'none',
          opacity: 0, animationDelay: '0.5s', animationFillMode: 'forwards',
        }}>
          <button
            onClick={onSignIn}
            className="cta-btn"
            style={{
              padding: '16px 36px',
              background: 'linear-gradient(135deg, #2962FF, #1d4ed8)',
              border: 'none', borderRadius: '12px', color: '#fff',
              fontSize: '16px', fontWeight: '700', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
          >
            Get Started <ArrowRight size={18} />
          </button>
          <button
            onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            className="cta-btn"
            style={{
              padding: '16px 36px',
              background: 'transparent',
              border: '1px solid #333', borderRadius: '12px', color: '#ccc',
              fontSize: '16px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
          >
            <Play size={16} /> See How It Works
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        maxWidth: '900px', margin: '60px auto 0', padding: '0 40px',
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px',
        animation: visible ? 'fadeInUp 0.8s ease forwards' : 'none',
        opacity: 0, animationDelay: '0.65s', animationFillMode: 'forwards',
      }}>
        {STATS.map((stat, i) => (
          <div key={i} className="stat-card" style={{
            textAlign: 'center', padding: '24px 16px',
            background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
            border: '1px solid #1a1a1a',
          }}>
            <div style={{
              fontSize: '32px', fontWeight: '800', color: '#fff',
              fontFamily: "'Barlow Condensed', sans-serif",
              marginBottom: '4px',
            }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div style={{
        maxWidth: '1100px', margin: '0 auto', padding: '100px 40px 80px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '36px', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>
            Everything You Need
          </h2>
          <p style={{ fontSize: '16px', color: '#666', maxWidth: '500px', margin: '0 auto' }}>
            One platform for YouTube analytics, strategy, and client delivery.
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px',
        }}>
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            const isHovered = hoveredFeature === i;
            return (
              <div
                key={i}
                className="feature-card"
                onMouseEnter={() => setHoveredFeature(i)}
                onMouseLeave={() => setHoveredFeature(null)}
                style={{
                  '--accent': feature.color,
                  '--glow': `${feature.color}20`,
                  background: isHovered ? '#141414' : '#111',
                  border: `1px solid ${isHovered ? feature.color + '44' : '#1e1e1e'}`,
                  borderRadius: '16px', padding: '32px',
                  cursor: 'default', position: 'relative', overflow: 'hidden',
                }}
              >
                {/* Subtle gradient overlay on hover */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                  background: isHovered ? feature.gradient : 'transparent',
                  transition: 'background 0.3s ease',
                }} />

                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  background: `${feature.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '16px',
                  transition: 'all 0.3s ease',
                  transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                }}>
                  <Icon size={24} style={{ color: feature.color }} />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>
                  {feature.title}
                </h3>
                <p style={{ fontSize: '13px', color: '#888', lineHeight: '1.7', margin: 0 }}>
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* How it works */}
      <div id="how-it-works" style={{
        background: 'linear-gradient(180deg, transparent, rgba(41,98,255,0.03), transparent)',
        padding: '80px 0',
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{ fontSize: '36px', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>
              How It Works
            </h2>
            <p style={{ fontSize: '16px', color: '#666' }}>
              From channel connection to client-ready reports in four steps.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { icon: Play, step: '01', title: 'Connect', text: 'Link your YouTube channel via OAuth or add competitor channels by URL. Import entire competitor databases from CSV.' },
              { icon: TrendingUp, step: '02', title: 'Track', text: 'Full View syncs all channel data daily. Subscriber growth, view trends, upload patterns — tracked automatically over time.' },
              { icon: Eye, step: '03', title: 'Analyze', text: 'Run AI-powered audits that identify content gaps, detect series patterns, and surface growth opportunities with data-backed evidence.' },
              { icon: FileText, step: '04', title: 'Deliver', text: 'Generate client-ready reports with named show concepts, competitive positioning, and strategic recommendations that close retainers.' },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="step-card" style={{
                  display: 'flex', alignItems: 'center', gap: '20px',
                  background: '#111', border: '1px solid #1e1e1e',
                  borderRadius: '14px', padding: '24px 28px',
                }}>
                  <div style={{
                    fontSize: '28px', fontWeight: '800', color: '#2962FF',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    opacity: 0.6, minWidth: '40px',
                  }}>
                    {item.step}
                  </div>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '10px',
                    background: 'rgba(41,98,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={20} style={{ color: '#3b82f6' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '4px' }}>
                      {item.title}
                    </div>
                    <p style={{ fontSize: '13px', color: '#888', lineHeight: '1.6', margin: 0 }}>
                      {item.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div style={{
        maxWidth: '800px', margin: '0 auto', padding: '60px 40px 100px',
        textAlign: 'center',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #111, #161625)',
          border: '1px solid #2962FF33',
          borderRadius: '20px', padding: '60px 40px',
          position: 'relative', overflow: 'hidden',
        }}>
          <div className="hero-glow" style={{
            width: '300px', height: '300px', background: 'rgba(41, 98, 255, 0.08)',
            top: '-100px', left: '50%', transform: 'translateX(-50%)',
          }} />
          <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#fff', marginBottom: '12px', position: 'relative' }}>
            Ready to See the Full View?
          </h2>
          <p style={{ fontSize: '15px', color: '#888', marginBottom: '32px', position: 'relative' }}>
            Start analyzing your YouTube presence today.
          </p>
          <button
            onClick={onSignIn}
            className="cta-btn"
            style={{
              padding: '16px 40px',
              background: 'linear-gradient(135deg, #2962FF, #1d4ed8)',
              border: 'none', borderRadius: '12px', color: '#fff',
              fontSize: '16px', fontWeight: '700', cursor: 'pointer',
              position: 'relative',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
            }}
          >
            Get Started Free <ArrowRight size={18} />
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #1a1a1a', padding: '32px 40px',
        maxWidth: '1200px', margin: '0 auto',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/Full_View_Logo.png" alt="" style={{ height: '24px', opacity: 0.5 }} />
          <span style={{ fontSize: '12px', color: '#444' }}>
            © {new Date().getFullYear()} Crux Media. All rights reserved.
          </span>
        </div>
        <div style={{ display: 'flex', gap: '20px' }}>
          <a href="/privacy" className="nav-link" style={{ color: '#555', fontSize: '12px', textDecoration: 'none' }}>Privacy Policy</a>
          <a href="/terms" className="nav-link" style={{ color: '#555', fontSize: '12px', textDecoration: 'none' }}>Terms of Service</a>
        </div>
      </footer>
    </div>
  );
}
