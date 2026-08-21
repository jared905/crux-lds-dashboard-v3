import { useState, useEffect, useRef } from 'react';
import { ArrowRight, Play,BarChart3, Users, Zap, Target, FileText, Layers, TrendingUp, Eye, Shield, Youtube} from 'lucide-react';

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
            background: hovered === i ? 'var(--bg)' : 'var(--bg)',
            borderRadius: 10,
            padding: '16px 14px',
            cursor: 'default',
            transition: 'background-color 0.2s ease',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)", transition: 'color 0.2s', ...(hovered === i ? { color: 'var(--blue)' } : {}) }}>
              {m.format(values[i])}
            </div>
            <div style={{
              fontSize: 12, color: "var(--pos)", fontWeight: 500,
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
    description: 'Daily synced performance data: views, watch hours, CTR, retention, and subscriber growth across every video.',
  },
  {
    icon: Users,
    title: 'Competitive Benchmarking',
    description: 'See how you stack up against peers in your category. Side-by-side analysis with 239+ channels tracked.',
  },
  {
    icon: Zap,
    title: 'Channel Audits',
    description: 'One-click channel audits with content gap analysis, series detection, and growth recommendations.',
  },
  {
    icon: Target,
    title: 'Content Strategy',
    description: 'Data-driven show concepts, content gap detection, and pattern analysis that compounds over time.',
  },
  {
    icon: FileText,
    title: 'Client-Ready Reports',
    description: 'PDF exports with AI-generated narratives, quarterly comparisons, and strategic recommendations.',
  },
  {
    icon: Layers,
    title: 'Multi-Channel Management',
    description: 'Manage an entire roster from one dashboard with role-based access and per-client competitor tracking.',
  },
];

const STATS = [
  { value: 'Daily', label: 'Automated Sync' },
  { value: '239+', label: 'Channels Tracked' },
  { value: 'Read-only', label: 'Channel access' },
  { value: '1-Click', label: 'PDF Reports' },
];

export default function HomePage({ onSignIn }) {
  const [hoveredFeature, setHoveredFeature] = useState(null);
  const [visible, setVisible] = useState(false);

  // The old scroll listener drove parallax on gradient orbs that no longer
  // exist. A raw scroll listener writing React state re-renders the whole
  // page every frame, so with no consumer left it was pure cost.
  useEffect(() => {
    setVisible(true);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: "var(--text)",
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflowX: 'hidden',
    }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        /* Hovers report interest with colour, not flight. The old set lifted
           cards 6px under a blue glow — motion the eye pays for on every
           pass. One accent (var(--blue)) across the whole page. */
        .feature-card { transition: border-color 0.2s ease, background-color 0.2s ease; }
        .cta-btn { transition: background-color 0.2s ease, transform 0.12s ease; }
        .cta-btn:active { transform: scale(0.96); }
        .step-card { transition: border-color 0.3s ease, background-color 0.3s ease; }
        .step-card:hover { border-color: var(--blue) !important; background: #141414 !important; }
        .nav-link { transition: color 0.2s ease; }
        .nav-link:hover { color: var(--ink) !important; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>


      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 40px', maxWidth: '1200px', margin: '0 auto',
        position: 'relative', zIndex: 10,
        opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease',
      }}>
        <img src="/Full_View_Logo.png" alt="Full View Analytics" style={{ height: '48px', objectFit: 'contain' }} />
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <a href="/privacy" className="nav-link" style={{ color: 'var(--faint)', fontSize: '13px', textDecoration: 'none' }}>Privacy</a>
          <a href="/terms" className="nav-link" style={{ color: 'var(--faint)', fontSize: '13px', textDecoration: 'none' }}>Terms</a>
          <button
            onClick={onSignIn}
            className="cta-btn"
            style={{
              padding: '10px 24px', background: 'transparent', border: '1px solid #444',
              borderRadius: '8px', color: "var(--ink)", fontSize: '14px',
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
          textWrap: 'balance',
          fontSize: '60px', fontWeight: '800', color: "var(--ink)",
          lineHeight: '1.1', marginBottom: '24px', letterSpacing: '-2px',
          animationName: visible ? 'fadeInUp' : 'none',
          animationDuration: '0.8s',
          animationTimingFunction: 'ease',
          animationFillMode: 'forwards',
          animationDelay: '0.1s',
          opacity: 0,
        }}>
          {/* Static, warm white, one accent word. The animated
              blue-purple-pink shimmer here was the single most recognisable
              AI-landing-page artifact in the product. */}
          See what's actually{' '}
          <span style={{ color: 'var(--blue)' }}>working</span> on YouTube
        </h1>

        <p style={{
          fontSize: '19px', color: 'var(--outline)', lineHeight: '1.7',
          maxWidth: '560px', margin: '0 auto 40px',
          animationName: visible ? 'fadeInUp' : 'none',
          animationDuration: '0.8s',
          animationTimingFunction: 'ease',
          animationFillMode: 'forwards',
          animationDelay: '0.25s',
          opacity: 0,
        }}>
          See why videos win in your category, and what to make next. Built for the agencies that manage YouTube channels.
        </p>

        <div style={{
          display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap',
          animationName: visible ? 'fadeInUp' : 'none',
          animationDuration: '0.8s',
          animationTimingFunction: 'ease',
          animationFillMode: 'forwards',
          animationDelay: '0.4s',
          opacity: 0,
        }}>
          <button
            onClick={onSignIn}
            className="cta-btn"
            style={{
              padding: '16px 36px',
              background: "linear-gradient(135deg, var(--blue), #0090c8)",
              border: 'none', borderRadius: '12px', color: "var(--on-accent)",
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
              border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text)',
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
        animationName: visible ? 'fadeInUp' : 'none',
        animationDuration: '0.8s',
        animationTimingFunction: 'ease',
        animationFillMode: 'forwards',
        animationDelay: '0.55s',
        opacity: 0,
      }}>
        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Metric cards with count-up animation */}
          <DashboardMetrics />
          {/* Chart — before/after with realistic peaks and valleys */}
          <div style={{
            background: 'var(--bg)', borderRadius: 10, padding: '16px 16px 12px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
              <span style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: 1 }}>Before Full View</span>
              <span style={{ fontSize: 10, color: "var(--blue)", textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>After Full View</span>
            </div>
            <svg width="100%" viewBox="0 0 600 140" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="afterFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00D1FF" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#00D1FF" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="beforeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#67747b" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#67747b" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Subtle grid lines */}
              {[35, 65, 95].map(y => (
                <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#1a1a1a" strokeWidth="0.5" />
              ))}
              {/* Divider */}
              <line x1="300" y1="8" x2="300" y2="132" stroke="#333" strokeWidth="1" strokeDasharray="3,3" />
              {/* Before: flat with realistic variation — upload spikes then decay */}
              <path
                d="M0,78 L15,75 L25,68 L35,72 L50,80 L60,77 L70,74 L85,70 L95,76 L110,82 L120,78 L130,72 L140,68 L150,74 L165,80 L175,83 L190,78 L200,73 L210,69 L225,75 L235,80 L250,84 L260,79 L275,76 L285,72 L295,78 L300,76"
                fill="none" stroke="#556067" strokeWidth="1.5" strokeLinejoin="round"
              />
              <path
                d="M0,78 L15,75 L25,68 L35,72 L50,80 L60,77 L70,74 L85,70 L95,76 L110,82 L120,78 L130,72 L140,68 L150,74 L165,80 L175,83 L190,78 L200,73 L210,69 L225,75 L235,80 L250,84 L260,79 L275,76 L285,72 L295,78 L300,76 L300,132 L0,132 Z"
                fill="url(#beforeFill)"
              />
              {/* After: peaks and valleys but trending upward */}
              <path
                d="M300,76 L310,72 L320,64 L330,58 L340,62 L350,55 L360,48 L370,52 L380,44 L390,38 L400,42 L410,34 L420,28 L430,32 L440,26 L450,20 L460,24 L470,30 L480,22 L490,16 L500,20 L510,14 L520,18 L530,12 L540,8 L555,14 L565,10 L580,6 L590,10 L600,4"
                fill="none" stroke="#00D1FF" strokeWidth="2" strokeLinejoin="round"
              />
              <path
                d="M300,76 L310,72 L320,64 L330,58 L340,62 L350,55 L360,48 L370,52 L380,44 L390,38 L400,42 L410,34 L420,28 L430,32 L440,26 L450,20 L460,24 L470,30 L480,22 L490,16 L500,20 L510,14 L520,18 L530,12 L540,8 L555,14 L565,10 L580,6 L590,10 L600,4 L600,132 L300,132 Z"
                fill="url(#afterFill)"
              />
              {/* Inflection dot */}
              <circle cx="300" cy="76" r="4" fill="#0a0a0a" stroke="#00D1FF" strokeWidth="2" />
            </svg>
          </div>
          {/* Gradient fade at bottom */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
            background: 'linear-gradient(transparent, #111)',
            borderRadius: '0 0 16px 16px',
          }} />
        </div>

        {/*
          Required disclosure. Every number in the mock above — the four
          metric counters and both chart paths — is hardcoded illustration,
          not customer data. Shown without qualification, a "Before/After
          Full View" chart reads as a performance claim about what the
          product does for a customer, which would need substantiation.
          Keep this visible and adjacent; do not move it behind a link,
          shrink it below legibility, or let the gradient fade cover it.
        */}
        <p style={{
          margin: '14px 4px 0',
          fontSize: '12px',
          lineHeight: 1.5,
          color: 'var(--faint)',
          textAlign: 'center',
        }}>
          Illustrative product preview. Sample data shown for demonstration, not
          actual customer results. Full View does not guarantee any particular
          outcome; results depend on your content, audience and market.
        </p>
      </div>

      {/* Stats bar */}
      <div style={{
        maxWidth: '900px', margin: '60px auto 0', padding: '0 40px',
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px',
        animationName: visible ? 'fadeInUp' : 'none',
        animationDuration: '0.8s',
        animationTimingFunction: 'ease',
        animationFillMode: 'forwards',
        animationDelay: '0.7s',
        opacity: 0,
      }}>
        {STATS.map((stat, i) => (
          <div key={i} className="stat-card" style={{
            textAlign: 'center', padding: '24px 16px',
            background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
            border: '1px solid #1a1a1a',
          }}>
            <div style={{ fontSize: '32px', fontWeight: '800', color: "var(--ink)", marginBottom: '4px' }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '1px' }}>
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
          <h2 style={{ fontSize: '36px', fontWeight: '800', color: "var(--ink)", marginBottom: '12px' }}>
            Everything You Need
          </h2>
          <p style={{ fontSize: '16px', color: 'var(--faint)', maxWidth: '500px', margin: '0 auto' }}>
            One platform for YouTube analytics, strategy, and client delivery.
          </p>
        </div>

        {/* Six identical cards in six arbitrary hues was colour-by-array-
            index — decoration encoding nothing. One accent; the lead
            feature earns double width so the grid has a hierarchy. */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px',
        }}>
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            const isHovered = hoveredFeature === i;
            const lead = i === 0;
            return (
              <div
                key={i}
                className="feature-card"
                onMouseEnter={() => setHoveredFeature(i)}
                onMouseLeave={() => setHoveredFeature(null)}
                style={{
                  gridColumn: lead ? 'span 2' : 'auto',
                  background: isHovered ? 'var(--card)' : 'var(--bg)',
                  border: `1px solid ${isHovered ? 'rgba(0, 209, 255, 0.35)' : 'var(--card)'}`,
                  borderRadius: '14px', padding: lead ? '32px' : '24px',
                  cursor: 'default', position: 'relative', overflow: 'hidden',
                  transition: 'border-color 0.2s ease, background 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <Icon size={lead ? 22 : 18} style={{ color: isHovered ? 'var(--blue)' : 'var(--outline)', transition: 'color 0.2s ease' }} />
                  <h3 style={{ fontSize: lead ? '19px' : '15px', fontWeight: '600', color: 'var(--ink, #f2efe6)', margin: 0 }}>
                    {feature.title}
                  </h3>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--outline)', lineHeight: '1.7', margin: 0, maxWidth: lead ? '52ch' : 'none' }}>
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
            <h2 style={{ fontSize: '36px', fontWeight: '800', color: "var(--ink)", marginBottom: '12px' }}>
              How It Works
            </h2>
            <p style={{ fontSize: '16px', color: 'var(--faint)' }}>
              Connected and analyzing in under 60 seconds.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { icon: Youtube, step: '01', title: 'Connect Your Channel', text: 'One-click OAuth with read-only access. Nothing is ever posted or modified on your account.' },
              { icon: TrendingUp, step: '02', title: 'Data Syncs Automatically', text: 'Views, watch hours, CTR, retention, and subscriber growth tracked daily across every video.' },
              { icon: Eye, step: '03', title: 'See What\'s Working', text: 'Competitive benchmarks, content gap analysis, and AI-generated strategy recommendations.' },
              { icon: FileText, step: '04', title: 'Export and Share', text: 'Client-ready PDF reports with performance data, strategic recommendations, and quarterly comparisons.' },
            ].map((item, i) => {
              return (
                <div key={i} className="step-card" style={{
                  display: 'flex', alignItems: 'center', gap: '20px',
                  background: 'var(--bg)', border: "1px solid var(--card)",
                  borderRadius: '14px', padding: '24px 28px',
                }}>
                  <div style={{
                    fontSize: '28px', fontWeight: '800', color: "var(--blue)",
                    opacity: 0.6, minWidth: '40px',
                  }}>
                    {item.step}
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: "var(--ink)", marginBottom: '4px' }}>
                      {item.title}
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--outline)', lineHeight: '1.6', margin: 0 }}>
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
            <item.icon size={16} color="#67747b" />
            <span style={{ fontSize: 13, color: 'var(--faint)' }}>{item.text}</span>
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
          border: '1px solid rgba(0, 209, 255, 0.2)',
          borderRadius: '20px', padding: '60px 40px',
          position: 'relative', overflow: 'hidden',
        }}>
          <h2 style={{ fontSize: '32px', fontWeight: '800', color: "var(--ink)", marginBottom: '12px', position: 'relative' }}>
            Ready to See the Full View?
          </h2>
          <p style={{ fontSize: '15px', color: 'var(--outline)', marginBottom: '32px', position: 'relative' }}>
            Connect your channel and start analyzing in under a minute.
          </p>
          <button
            onClick={onSignIn}
            className="cta-btn"
            style={{
              padding: '16px 40px',
              background: "linear-gradient(135deg, var(--blue), #0090c8)",
              border: 'none', borderRadius: '12px', color: "var(--on-accent)",
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
          <span style={{ fontSize: '12px', color: 'var(--outline-variant)' }}>
            A product of Crux Media
          </span>
        </div>
        <div style={{ display: 'flex', gap: '20px' }}>
          <a href="/privacy" className="nav-link" style={{ color: 'var(--faint)', fontSize: '12px', textDecoration: 'none' }}>Privacy Policy</a>
          <a href="/terms" className="nav-link" style={{ color: 'var(--faint)', fontSize: '12px', textDecoration: 'none' }}>Terms of Service</a>
        </div>
      </footer>
    </div>
  );
}
