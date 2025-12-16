import React, { Component, useState } from 'react';
import LandingPage from './LandingPage';
import './index.css';

// Error Boundary for production safety
export class SotaErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444', marginBottom: 16 }}>⚠️ Something went wrong</h2>
          <pre style={{ 
            background: 'rgba(15, 23, 42, 0.95)', 
            padding: 20, 
            borderRadius: 12, 
            color: '#e5e7eb',
            textAlign: 'left',
            overflow: 'auto'
          }}>
            {String(this.state.error || 'Unknown error')}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            style={{ 
              marginTop: 20, 
              padding: '12px 24px', 
              borderRadius: 999, 
              background: 'linear-gradient(135deg, #6366f1, #a855f7)', 
              color: '#fff', 
              border: 'none', 
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [showApp, setShowApp] = useState(false);

  if (!showApp) {
    return <LandingPage onGetStarted={() => setShowApp(true)} />;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f2e 100%)', color: '#e6e6e6', padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(20px)', borderRadius: 16, padding: 24, marginBottom: 24, border: '1px solid rgba(99, 102, 241, 0.35)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 30 }}>🚀</span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, background: 'linear-gradient(135deg, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Pillar Craft Suite
                </div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>State-of-the-art content orchestration for WordPress</div>
              </div>
            </div>
            <button
              onClick={() => setShowApp(false)}
              style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid rgba(148, 163, 184, 0.7)', background: 'rgba(15, 23, 42, 0.9)', color: '#e5e7eb', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              ← Back to Landing
            </button>
          </div>
        </div>

        {/* Placeholder dashboard shell (so the app is scrollable & distinct) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ padding: 24, borderRadius: 20, border: '1px solid rgba(148, 163, 184, 0.35)', background: 'radial-gradient(circle at top left, rgba(148, 163, 184, 0.2), rgba(15, 23, 42, 0.96))' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Next steps</h2>
            <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 18 }}>
              Connect your WordPress site, plug in your API keys, and start generating content.
            </p>
            <ol style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.8, color: '#e5e7eb' }}>
              <li>Connect WordPress REST API with an Application Password.</li>
              <li>Add your AI provider keys (Gemini, OpenAI, Claude, Groq, etc.).</li>
              <li>Define your pillar pages and clusters.</li>
              <li>Run bulk generation or God Mode optimization.</li>
            </ol>
          </div>

          <div style={{ padding: 24, borderRadius: 20, border: '1px solid rgba(148, 163, 184, 0.35)', background: 'radial-gradient(circle at top right, rgba(129, 140, 248, 0.25), rgba(15, 23, 42, 0.96))' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Status Overview</h3>
            <ul style={{ listStyle: 'none', padding: 0, fontSize: 14, color: '#e5e7eb', lineHeight: 1.8 }}>
              <li>⚙ WordPress: <span style={{ color: '#f97316' }}>Pending setup</span></li>
              <li>🤖 AI Providers: <span style={{ color: '#f97316' }}>Keys not configured</span></li>
              <li>📚 Content Queue: <span style={{ color: '#22c55e' }}>Ready to create</span></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
