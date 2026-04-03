import { useState, useEffect, useRef } from 'react';
import { BarChart3, Users, Zap, Target, FileText, Layers, ArrowRight, Play, TrendingUp, Eye, Shield, Youtube } from 'lucide-react';

const METRICS = [
  { label: 'Total Views', end: 2400000, format: v => v >= 1e6 ? (v/1e6).toFixed(1) + 'M' : Math.round(v).toLocaleString(), change: '+18.3%' },
  { label: 'Watch Hours', end: 142000, format: v => v >= 1e3 ? Math.round(v/1e3) + 'K' : Math.round(v).toLocaleString(), change: '+12.1%' },
  { label: 'Subscribers', end: 89200, format: v => v >= 1e3 ? (v/1e3).toFixed(1) + 'K' : Math.round(v).toLocaleString(), change: '+2,340' },
  { label: 'Avg CTR', end: 6.8, format: v => v.toFixed(1) + '%', change: '+0.9%' },
];

function DashboardMetrics() {
  const [values, setValues] = useState(METRICS.map(() => 0));
  const [started, setStarted] = useState(false);
  const [hovered, setHovered] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) setStarted(true);
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const duration = 1200;
    const steps = 40;
    const interval = duration / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const t = Math.min(step / steps, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setValues(METRICS.map(m => m.end * ease));
      if (step >= steps) clearInterval(timer);
    }, interval);
    return () => clearInterval(timer);
  }, [started]);

  return (
    <div ref={ref} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
      {METRICS.map((m, i) => (
        <div
          key={i}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          style={{
            background: hovered === i ? '#111' : '#0a0a0a',
            borderRadius: 10,
            padding: '16px 14px',
            cursor: 'default',
            transition: 'all 0.2s ease',
            transform: hovered === i ? 'translateY(-2px)' : 'none',
            boxShadow: hovered === i ? '0 8px 24px rgba(0,0,0,0.3)' : 'none',
          }}
        >
          <div style={{ fontSize: 11, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', transition: 'color 0.2s', ...(hovered === i ? { color: '#3b82f6' } : {}) }}>
              {m.format(values[i])}
            </div>
            <div style={{
              fontSize: 12, color: '#22c55e', fontWeight: 500,
              opacity: hovered === i ? 1 : 0.7,
              transition: 'opacity 0.2s',
            }}>
              {m.change}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Channel Analytics',
    description: 'Daily synced performance data — views, watch hours, CTR, retention, and subscriber growth across every video.',
    color: '#3b82f6',
    gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  },
  {
    icon: Users,
    title: 'Competitive Benchmarking',
    description: 'See how you stack up against peers in your category. Side-by-side analysis with 239+ channels tracked.',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  },
  {
    icon: Zap,
    title: 'AI-Powered Audits',
    description: 'One-click channel audits with content gap analysis, series detection, and growth recommendations.',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
  },
  {
    icon: Target,
    title: 'Content Strategy',
    description: 'Data-driven show concepts, content gap detection, and pattern analysis that compounds over time.',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
  },
  {
    icon: FileText,
    title: 'Client-Ready Reports',
    description: 'PDF exports with AI-generated narratives, quarterly comparisons, and strategic recommendations.',
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, #ec4899, #db2777)',
  },
  {
    icon: Layers,
    title: 'Multi-Channel Management',
    description: 'Manage an entire roster from one dashboard with role-based access and per-client competitor tracking.',
    color: '#06b6d4',
    gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
  },
];

const STATS = [
  { value: 'Daily', label: 'Automated Sync' },
  { value: '239+', label: 'Channels Tracked' },
  { value: 'AI', label: 'Powered Audits' },
  { value: '1-Click', label: 'PDF Reports' },
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

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 40px', maxWidth: '1200px', margin: '0 auto',
        position: 'relative', zIndex: 10,
        opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease',
      }}>
        <img src="/Full_View_Logo.png" alt="Full View Analytics" style={{ height: '48px', objectFit: 'contain' }} />
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <a href="/privacy" className="nav-link" style={{ color: '#666', fontSize: '13px', textDecoration: 'none' }}>Privacy</a>
          <a href="/terms" className="nav-link" style={{ color: '#666', fontSize: '13px', textDecoration: 'none' }}>Terms</a>
          <button
            onClick={onSignIn}
            className="cta-btn"
            style={{
              padding: '10px 24px', background: 'transparent', border: '1px solid #444',
              borderRadius: '8px', color: '#fff', fontSize: '14px',
              fontWeight: '600', cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{
        maxWidth: '1000px', margin: '0 auto', padding: '100px 40px 40px',
        textAlign: 'center', position: 'relative', zIndex: 5,
      }}>
        <h1 style={{
          fontSize: '60px', fontWeight: '800', color: '#fff',
          lineHeight: '1.1', marginBottom: '24px', letterSpacing: '-2px',
          animation: visible ? 'fadeInUp 0.8s ease forwards' : 'none',
          opacity: 0, animationDelay: '0.1s', animationFillMode: 'forwards',
        }}>
          See what's actually<br />
          <span style={{
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundSize: '200% auto',
            animation: 'shimmer 3s linear infinite',
          }}>
            working on YouTube
          </span>
        </h1>

        <p style={{
          fontSize: '19px', color: '#888', lineHeight: '1.7',
          maxWidth: '560px', margin: '0 auto 40px',
          animation: visible ? 'fadeInUp 0.8s ease forwards' : 'none',
          opacity: 0, animationDelay: '0.25s', animationFillMode: 'forwards',
        }}>
          Analytics, competitive benchmarking, and AI-powered strategy for YouTube channels and the agencies that manage them.
        </p>

        <div style={{
          display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap',
          animation: visible ? 'fadeInUp 0.8s ease forwards' : 'none',
          opacity: 0, animationDelay: '0.4s', animationFillMode: 'forwards',
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
            Get Started Free <ArrowRight size={18} />
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

      {/* Dashboard preview */}
      <div style={{
        maxWidth: '1000px', margin: '60px auto 0', padding: '0 40px',
        animation: visible ? 'fadeInUp 0.8s ease forwards' : 'none',
        opacity: 0, animationDelay: '0.55s', animationFillMode: 'forwards',
      }}>
        <div style={{
          background: '#111',
          border: '1px solid #222',
          borderRadius: '16px',
          padding: '24px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Fake dashboard chrome */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#333' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#333' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#333' }} />
          </div>
          {/* Metric cards with count-up animation */}
          <DashboardMetrics />
          {/* Chart — before/after story */}
          <div style={{
            background: '#0a0a0a', borderRadius: 10, padding: '16px 16px 12px', height: 170,
            position: 'relative', overflow: 'hidden',
          }}>
            {/* "Before" / "After" labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
              <span style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Before Full View</span>
              <span style={{ fontSize: 10, color: '#2962FF', textTransform: 'uppercase', letterSpacing: 1 }}>After Full View</span>
            </div>
            <svg width="100%" height="calc(100% - 24px)" viewBox="0 0 400 110" preserveAspectRatio="none" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="afterFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2962FF" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#2962FF" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="beforeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#666" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#666" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Divider line at midpoint */}
              <line x1="200" y1="0" x2="200" y2="110" stroke="#222" strokeWidth="1" strokeDasharray="4,4" />
              {/* Before: flat/declining (left half) */}
              <path
                d="M0,55 C15,56 30,58 50,57 C70,56 90,60 110,62 C130,61 150,64 170,63 C180,63 190,62 200,62"
                fill="none" stroke="#444" strokeWidth="1.5"
              />
              <path
                d="M0,55 C15,56 30,58 50,57 C70,56 90,60 110,62 C130,61 150,64 170,63 C180,63 190,62 200,62 L200,110 L0,110 Z"
                fill="url(#beforeFill)"
              />
              {/* After: accelerating growth (right half) */}
              <path
                d="M200,62 C215,58 225,52 240,46 C255,40 265,36 280,30 C295,24 305,20 320,16 C335,13 350,10 370,7 C385,5 395,4 400,3"
                fill="none" stroke="#2962FF" strokeWidth="2"
              />
              <path
                d="M200,62 C215,58 225,52 240,46 C255,40 265,36 280,30 C295,24 305,20 320,16 C335,13 350,10 370,7 C385,5 395,4 400,3 L400,110 L200,110 Z"
                fill="url(#afterFill)"
              />
              {/* Inflection point dot */}
              <circle cx="200" cy="62" r="4" fill="#0a0a0a" stroke="#2962FF" strokeWidth="2" />
            </svg>
          </div>
          {/* Gradient fade at bottom */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
            background: 'linear-gradient(transparent, #111)',
            borderRadius: '0 0 16px 16px',
          }} />
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        maxWidth: '900px', margin: '60px auto 0', padding: '0 40px',
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px',
        animation: visible ? 'fadeInUp 0.8s ease forwards' : 'none',
        opacity: 0, animationDelay: '0.7s', animationFillMode: 'forwards',
      }}>
        {STATS.map((stat, i) => (
          <div key={i} className="stat-card" style={{
            textAlign: 'center', padding: '24px 16px',
            background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
            border: '1px solid #1a1a1a',
          }}>
            <div style={{ fontSize: '32px', fontWeight: '800', color: '#fff', marginBottom: '4px' }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '1px' }}>
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
              Connected and analyzing in under 60 seconds.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { icon: Youtube, step: '01', title: 'Connect Your Channel', text: 'One-click OAuth — read-only access, nothing is ever posted or modified on your account.' },
              { icon: TrendingUp, step: '02', title: 'Data Syncs Automatically', text: 'Views, watch hours, CTR, retention, and subscriber growth tracked daily across every video.' },
              { icon: Eye, step: '03', title: 'See What\'s Working', text: 'Competitive benchmarks, content gap analysis, and AI-generated strategy recommendations.' },
              { icon: FileText, step: '04', title: 'Export and Share', text: 'Client-ready PDF reports with performance data, strategic recommendations, and quarterly comparisons.' },
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

      {/* Trust signals */}
      <div style={{
        maxWidth: '700px', margin: '0 auto', padding: '40px 40px 0',
        display: 'flex', justifyContent: 'center', gap: '40px', flexWrap: 'wrap',
      }}>
        {[
          { icon: Shield, text: 'Read-only access — we never post or modify your channel' },
          { icon: Youtube, text: 'Works with any YouTube channel, any size' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <item.icon size={16} color="#666" />
            <span style={{ fontSize: 13, color: '#666' }}>{item.text}</span>
          </div>
        ))}
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
            Connect your channel and start analyzing in under a minute.
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
        flexWrap: 'wrap', gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/crux-logo.png" alt="Crux Media" style={{ height: '20px', opacity: 0.4 }} />
          <span style={{ fontSize: '12px', color: '#444' }}>
            A product of Crux Media
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
