import React, { useState } from 'react';
import './index.css';

interface LandingPageProps {
  onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const [email, setEmail] = useState('');

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      alert(`Thanks for your interest! We'll contact you at ${email}`);
      setEmail('');
    }
  };

  return (
    <div style={styles.container}>
      {/* Background gradient */}
      <div style={styles.bgOverlay}>
        <div style={styles.bgCircle1} />
        <div style={styles.bgCircle2} />
        <div style={styles.bgCircle3} />
      </div>

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.logo}>
            <span style={{ fontSize: 32 }}>🚀</span>
            <span style={styles.logoText}>Pillar Craft</span>
          </div>
          <nav style={styles.nav}>
            <a href="#features" style={styles.navLink}>Features</a>
            <a href="#pricing" style={styles.navLink}>Pricing</a>
            <a href="#testimonials" style={styles.navLink}>Testimonials</a>
            <button onClick={onGetStarted} style={styles.loginBtn}>Launch App →</button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section style={styles.hero}>
        <div style={styles.heroContent}>
          <div style={styles.badge}>
            🎉 New: AI-Powered SEO Engine
          </div>
          <h1 style={styles.heroTitle}>
            <span style={styles.heroTitleGradient}>Transform Your Content</span>
            <br />Into an Organic Traffic Machine
          </h1>
          <p style={styles.heroSubtitle}>
            State-of-the-art AI platform that analyzes, optimizes, and publishes
            SEO-ready content directly to WordPress. Built for growth-focused creators.
          </p>
          <div style={styles.heroActions}>
            <button onClick={onGetStarted} style={styles.primaryCta}>
              🚀 Start Optimizing
            </button>
            <button style={styles.secondaryCta}>
              🎥 Watch 2-min Demo
            </button>
          </div>
          <div style={styles.stats}>
            <div style={styles.stat}>
              <div style={styles.statNumber}>2.5M+</div>
              <div style={styles.statLabel}>Articles Optimized</div>
            </div>
            <div style={styles.stat}>
              <div style={styles.statNumber}>450%</div>
              <div style={styles.statLabel}>Avg Traffic Lift</div>
            </div>
            <div style={styles.stat}>
              <div style={styles.statNumber}>98/100</div>
              <div style={styles.statLabel}>Typical SEO Score</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={styles.features}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Powerful Features</h2>
          <p style={styles.sectionSubtitle}>Everything you need to dominate search results</p>
        </div>
        <div style={styles.featureGrid}>
          {features.map((feature, i) => (
            <div key={i} style={styles.featureCard}>
              <div style={styles.featureIcon}>{feature.icon}</div>
              <h3 style={styles.featureTitle}>{feature.title}</h3>
              <p style={styles.featureDesc}>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={styles.pricing}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Simple, Transparent Pricing</h2>
          <p style={styles.sectionSubtitle}>Choose the plan that fits your growth stage</p>
        </div>
        <div style={styles.pricingGrid}>
          {pricingPlans.map((plan, i) => (
            <div key={i} style={{
              ...styles.pricingCard,
              ...(plan.popular ? styles.popularCard : {})
            }}>
              {plan.popular && <div style={styles.popularBadge}>Most Popular</div>}
              <h3 style={styles.planName}>{plan.name}</h3>
              <div style={styles.planPrice}>
                <span style={styles.priceAmount}>${plan.price}</span>
                <span style={styles.pricePeriod}>/month</span>
              </div>
              <ul style={styles.featureList}>
                {plan.features.map((feat, j) => (
                  <li key={j} style={styles.featureItem}>
                    <span style={styles.checkIcon}>✔</span> {feat}
                  </li>
                ))}
              </ul>
              <button onClick={onGetStarted} style={plan.popular ? styles.popularPlanBtn : styles.planBtn}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" style={styles.testimonials}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Loved by Content Teams</h2>
          <p style={styles.sectionSubtitle}>What real users say</p>
        </div>
        <div style={styles.testimonialGrid}>
          {testimonials.map((test, i) => (
            <div key={i} style={styles.testimonialCard}>
              <div style={styles.testimonialQuote}>"{test.quote}"</div>
              <div style={styles.testimonialAuthor}>
                <div style={styles.authorAvatar}>{test.avatar}</div>
                <div>
                  <div style={styles.authorName}>{test.name}</div>
                  <div style={styles.authorRole}>{test.role}</div>
                </div>
              </div>
              <div style={styles.testimonialStars}>★★★★★</div>
            </div>
          ))}
        </div>
      </section>

      {/* Email CTA */}
      <section style={styles.cta}>
        <div style={styles.ctaCard}>
          <h2 style={styles.ctaTitle}>Ready to 10x Your Organic Traffic?</h2>
          <p style={styles.ctaSubtitle}>Join creators who turned their sites into lead magnets</p>
          <form onSubmit={handleSignup} style={styles.ctaForm}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your best email"
              style={styles.ctaInput}
              required
            />
            <button type="submit" style={styles.ctaButton}>
              Get Started Free
            </button>
          </form>
          <p style={styles.ctaNote}>No credit card required. Free tier included.</p>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <div style={styles.footerLogo}>
            <span style={{ fontSize: 22 }}>🚀</span>
            <span style={styles.footerLogoText}>Pillar Craft Suite</span>
          </div>
          <div style={styles.footerLinks}>
            <a href="#" style={styles.footerLink}>Privacy</a>
            <a href="#" style={styles.footerLink}>Terms</a>
            <a href="#" style={styles.footerLink}>Support</a>
            <a href="#" style={styles.footerLink}>Docs</a>
          </div>
          <div style={styles.copy}>
            © 2025 Pillar Craft Suite. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

const features = [
  {
    icon: '🤖',
    title: 'AI Content Engine',
    description: 'Use GPT-4o, Claude, Gemini and more to generate SEO-ready content in minutes.'
  },
  {
    icon: '🎯',
    title: 'Smart SEO Analysis',
    description: 'Track 15+ on-page metrics including readability, topical depth and E-E-A-T signals.'
  },
  {
    icon: '⚡',
    title: 'God Mode Automation',
    description: 'Autonomously scans and optimizes your entire site. Set it once, then let it run.'
  },
  {
    icon: '📊',
    title: 'Live Performance',
    description: 'Monitor ranking signals and content health in a single unified dashboard.'
  },
  {
    icon: '🌍',
    title: 'Geo & Local SEO',
    description: 'Boost local visibility with geo-targeted variants and location-aware content.'
  },
  {
    icon: '🔊',
    title: 'Voice Search Ready',
    description: 'Structure content for AEO so assistants and answer engines can surface your pages.'
  }
];

const pricingPlans = [
  {
    name: 'Starter',
    price: 0,
    features: ['10 articles/month', 'Basic SEO checks', 'WordPress publishing', 'Email support'],
    cta: 'Start Free',
    popular: false
  },
  {
    name: 'Pro',
    price: 49,
    features: ['Unlimited articles', 'Advanced SEO analysis', 'God Mode automation', 'Image generation', 'Priority support'],
    cta: 'Get Pro',
    popular: true
  },
  {
    name: 'Enterprise',
    price: 199,
    features: ['All Pro features', 'White-label', 'Custom AI models', 'Dedicated CSM', 'Custom integrations'],
    cta: 'Talk to Sales',
    popular: false
  }
];

const testimonials = [
  {
    quote: 'We grew organic traffic by 320% in 90 days. This replaced three separate tools for us.',
    name: 'Sarah Johnson',
    role: 'Head of Content, GrowthLabs',
    avatar: '👩'
  },
  {
    quote: 'God Mode saved our team 20+ hours every week. It just keeps improving old articles.',
    name: 'Michael Chen',
    role: 'Founder, SaaSPlaybook',
    avatar: '👨'
  },
  {
    quote: 'The pillar cluster planning alone is worth the price. Finally a tool built for serious SEO.',
    name: 'Emily Rodriguez',
    role: 'SEO Lead, LifestyleMag',
    avatar: '👩'
  }
];

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: 'relative',
    minHeight: '100vh',
    color: '#e5e7eb',
    overflowX: 'hidden',
    background: 'radial-gradient(circle at top, rgba(129, 140, 248, 0.3), transparent 55%), radial-gradient(circle at bottom, rgba(236, 72, 153, 0.2), transparent 55%), #020617'
  },
  bgOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: -1
  },
  bgCircle1: {
    position: 'absolute',
    top: '-10%',
    right: '-10%',
    width: 500,
    height: 500,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(129, 140, 248, 0.25), transparent)',
    filter: 'blur(80px)'
  },
  bgCircle2: {
    position: 'absolute',
    bottom: '-10%',
    left: '-10%',
    width: 480,
    height: 480,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(236, 72, 153, 0.25), transparent)',
    filter: 'blur(80px)'
  },
  bgCircle3: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 640,
    height: 640,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(15, 23, 42, 0.9), transparent)',
    filter: 'blur(40px)'
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    backdropFilter: 'blur(24px)',
    background: 'rgba(15, 23, 42, 0.8)',
    borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
    padding: '14px 24px'
  },
  headerContent: {
    maxWidth: 1200,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontWeight: 700,
    fontSize: 20
  },
  logoText: {
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 24
  },
  navLink: {
    fontSize: 14,
    color: '#9ca3af',
    textDecoration: 'none',
    cursor: 'pointer'
  },
  loginBtn: {
    padding: '8px 18px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    boxShadow: '0 10px 30px rgba(79, 70, 229, 0.5)'
  },
  hero: {
    padding: '80px 24px 60px',
    maxWidth: 1100,
    margin: '0 auto',
    textAlign: 'center'
  },
  heroContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20
  },
  badge: {
    padding: '6px 16px',
    borderRadius: 999,
    border: '1px solid rgba(129, 140, 248, 0.7)',
    background: 'rgba(15, 23, 42, 0.9)',
    fontSize: 13,
    color: '#c7d2fe'
  },
  heroTitle: {
    fontSize: 52,
    fontWeight: 900,
    lineHeight: 1.1,
    letterSpacing: '-0.04em',
    margin: 0
  },
  heroTitleGradient: {
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  heroSubtitle: {
    maxWidth: 640,
    fontSize: 17,
    color: '#9ca3af'
  },
  heroActions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8
  },
  primaryCta: {
    padding: '14px 28px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    boxShadow: '0 18px 45px rgba(79, 70, 229, 0.55)'
  },
  secondaryCta: {
    padding: '14px 24px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.6)',
    cursor: 'pointer',
    background: 'rgba(15, 23, 42, 0.85)',
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: 600
  },
  stats: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 32,
    marginTop: 32,
    paddingTop: 24,
    borderTop: '1px solid rgba(51, 65, 85, 0.8)'
  },
  stat: {
    textAlign: 'center'
  },
  statNumber: {
    fontSize: 34,
    fontWeight: 800,
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  statLabel: {
    fontSize: 13,
    color: '#9ca3af'
  },
  features: {
    padding: '70px 24px 40px',
    maxWidth: 1200,
    margin: '0 auto'
  },
  sectionHeader: {
    textAlign: 'center',
    marginBottom: 48
  },
  sectionTitle: {
    fontSize: 32,
    fontWeight: 800,
    marginBottom: 8,
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  sectionSubtitle: {
    fontSize: 15,
    color: '#9ca3af'
  },
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 20
  },
  featureCard: {
    padding: 24,
    borderRadius: 20,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'radial-gradient(circle at top left, rgba(148, 163, 184, 0.18), rgba(15, 23, 42, 0.95))',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.9)'
  },
  featureIcon: {
    fontSize: 30,
    marginBottom: 12
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 8
  },
  featureDesc: {
    fontSize: 14,
    color: '#9ca3af'
  },
  pricing: {
    padding: '70px 24px 40px',
    maxWidth: 1100,
    margin: '0 auto'
  },
  pricingGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 20
  },
  pricingCard: {
    position: 'relative',
    padding: 32,
    borderRadius: 20,
    border: '1px solid rgba(148, 163, 184, 0.45)',
    background: 'radial-gradient(circle at top left, rgba(148, 163, 184, 0.22), rgba(15, 23, 42, 0.96))'
  },
  popularCard: {
    border: '1px solid rgba(129, 140, 248, 0.9)',
    boxShadow: '0 22px 60px rgba(79, 70, 229, 0.65)'
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '4px 14px',
    borderRadius: 999,
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    color: '#f9fafb',
    fontSize: 11,
    fontWeight: 700
  },
  planName: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 12
  },
  planPrice: {
    marginBottom: 24
  },
  priceAmount: {
    fontSize: 40,
    fontWeight: 800,
    marginRight: 4,
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  pricePeriod: {
    fontSize: 15,
    color: '#9ca3af'
  },
  featureList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 22px'
  },
  featureItem: {
    fontSize: 14,
    color: '#e5e7eb',
    padding: '7px 0',
    borderBottom: '1px solid rgba(51, 65, 85, 0.7)'
  },
  checkIcon: {
    marginRight: 8,
    color: '#4ade80'
  },
  planBtn: {
    width: '100%',
    padding: '10px 0',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.7)',
    background: 'rgba(15, 23, 42, 0.9)',
    color: '#e5e7eb',
    cursor: 'pointer',
    fontWeight: 600
  },
  popularPlanBtn: {
    width: '100%',
    padding: '10px 0',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    color: '#f9fafb',
    cursor: 'pointer',
    fontWeight: 700,
    boxShadow: '0 16px 40px rgba(79, 70, 229, 0.7)'
  },
  testimonials: {
    padding: '70px 24px 40px',
    maxWidth: 1100,
    margin: '0 auto'
  },
  testimonialGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 20
  },
  testimonialCard: {
    padding: 24,
    borderRadius: 20,
    border: '1px solid rgba(148, 163, 184, 0.45)',
    background: 'radial-gradient(circle at top left, rgba(148, 163, 184, 0.18), rgba(15, 23, 42, 0.95))'
  },
  testimonialQuote: {
    fontSize: 14,
    color: '#e5e7eb',
    marginBottom: 16,
    fontStyle: 'italic'
  },
  testimonialAuthor: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8
  },
  authorAvatar: {
    fontSize: 28
  },
  authorName: {
    fontSize: 15,
    fontWeight: 600
  },
  authorRole: {
    fontSize: 12,
    color: '#9ca3af'
  },
  testimonialStars: {
    fontSize: 13,
    color: '#facc15'
  },
  cta: {
    padding: '70px 24px 40px',
    maxWidth: 900,
    margin: '0 auto'
  },
  ctaCard: {
    padding: 40,
    borderRadius: 24,
    border: '1px solid rgba(148, 163, 184, 0.45)',
    background: 'radial-gradient(circle at top left, rgba(129, 140, 248, 0.3), rgba(15, 23, 42, 0.96))',
    textAlign: 'center'
  },
  ctaTitle: {
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 10,
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  ctaSubtitle: {
    fontSize: 15,
    color: '#cbd5f5',
    marginBottom: 24
  },
  ctaForm: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 10
  },
  ctaInput: {
    flex: '1 1 220px',
    padding: '12px 16px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.7)',
    background: 'rgba(15, 23, 42, 0.95)',
    color: '#e5e7eb',
    fontSize: 14
  },
  ctaButton: {
    padding: '12px 22px',
    borderRadius: 999,
    border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    color: '#f9fafb',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 14px 40px rgba(79, 70, 229, 0.7)'
  },
  ctaNote: {
    fontSize: 12,
    color: '#9ca3af'
  },
  footer: {
    padding: '40px 24px',
    borderTop: '1px solid rgba(31, 41, 55, 0.9)',
    marginTop: 40
  },
  footerContent: {
    maxWidth: 1100,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16
  },
  footerLogo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  footerLogoText: {
    fontSize: 16,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  footerLinks: {
    display: 'flex',
    gap: 16
  },
  footerLink: {
    fontSize: 13,
    color: '#9ca3af',
    textDecoration: 'none'
  },
  copy: {
    fontSize: 12,
    color: '#6b7280'
  }
};

export default LandingPage;
