/**
 * 📊 ANALYTICS DASHBOARD PRO
 * Real-time SEO analytics with predictive insights
 */

import React, { useState, useEffect } from 'react';
import '../styles/modern-design-system.css';

interface AnalyticsData {
  seoScore: number;
  organicTraffic: number;
  keywordRankings: { keyword: string; position: number; change: number }[];
  contentQuality: number;
  technicalScore: number;
  userEngagement: number;
  conversionRate: number;
  pageSpeed: number;
  mobileScore: number;
}

interface Metric {
  label: string;
  value: number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  icon: string;
}

const AnalyticsDashboardPro: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    seoScore: 87,
    organicTraffic: 12547,
    keywordRankings: [
      { keyword: 'seo optimization', position: 3, change: 2 },
      { keyword: 'content marketing', position: 7, change: -1 },
      { keyword: 'digital strategy', position: 12, change: 5 }
    ],
    contentQuality: 92,
    technicalScore: 88,
    userEngagement: 78,
    conversionRate: 3.4,
    pageSpeed: 91,
    mobileScore: 95
  });

  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [isLoading, setIsLoading] = useState(false);

  const metrics: Metric[] = [
    {
      label: 'SEO Score',
      value: analytics.seoScore,
      change: 5.2,
      trend: 'up',
      icon: '🎯'
    },
    {
      label: 'Organic Traffic',
      value: analytics.organicTraffic,
      change: 12.8,
      trend: 'up',
      icon: '📈'
    },
    {
      label: 'Content Quality',
      value: analytics.contentQuality,
      change: 3.5,
      trend: 'up',
      icon: '✨'
    },
    {
      label: 'Page Speed',
      value: analytics.pageSpeed,
      change: -2.1,
      trend: 'down',
      icon: '⚡'
    }
  ];

  const getTrendColor = (trend: 'up' | 'down' | 'stable'): string => {
    return trend === 'up' ? 'var(--color-success)' : 
           trend === 'down' ? 'var(--color-error)' : 
           'var(--color-gray-500)';
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable'): string => {
    return trend === 'up' ? '↑' : 
           trend === 'down' ? '↓' : 
           '→';
  };

  return (
    <div className="analytics-dashboard" style={styles.dashboard}>
      {/* Header */}
      <div className="glass-card" style={styles.header}>
        <div style={styles.headerContent}>
          <div>
            <h1 className="gradient-text" style={styles.title}>
              Analytics Dashboard Pro
            </h1>
            <p style={styles.subtitle}>
              Real-time SEO performance tracking & insights
            </p>
          </div>
          <div style={styles.timeRangeSelector}>
            {(['7d', '30d', '90d'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`btn ${timeRange === range ? 'btn-primary' : 'btn-ghost'}`}
                style={styles.timeButton}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={styles.metricsGrid}>
        {metrics.map((metric, index) => (
          <div 
            key={index} 
            className="glass-card animate-fade-in"
            style={{
              ...styles.metricCard,
              animationDelay: `${index * 100}ms`
            }}
          >
            <div style={styles.metricHeader}>
              <span style={styles.metricIcon}>{metric.icon}</span>
              <span style={styles.metricLabel}>{metric.label}</span>
            </div>
            <div style={styles.metricValue}>
              {typeof metric.value === 'number' && metric.value > 100 
                ? metric.value.toLocaleString()
                : metric.value}
            </div>
            <div style={styles.metricChange}>
              <span style={{ color: getTrendColor(metric.trend) }}>
                {getTrendIcon(metric.trend)} {Math.abs(metric.change)}%
              </span>
              <span style={styles.changeLabel}>vs last period</span>
            </div>
          </div>
        ))}
      </div>

      {/* Keyword Rankings */}
      <div className="glass-card" style={styles.keywordSection}>
        <h2 style={styles.sectionTitle}>Top Keyword Rankings</h2>
        <div style={styles.keywordTable}>
          {analytics.keywordRankings.map((item, index) => (
            <div key={index} style={styles.keywordRow}>
              <div style={styles.keywordName}>
                <span style={styles.rankBadge}>#{item.position}</span>
                {item.keyword}
              </div>
              <div style={{
                ...styles.keywordChange,
                color: item.change > 0 ? 'var(--color-success)' : 'var(--color-error)'
              }}>
                {item.change > 0 ? '+' : ''}{item.change} positions
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Technical Scores */}
      <div style={styles.technicalGrid}>
        <div className="glass-card" style={styles.scoreCard}>
          <h3 style={styles.scoreTitle}>Technical SEO</h3>
          <div style={styles.scoreCircle}>
            <div style={styles.scoreValue}>{analytics.technicalScore}</div>
            <div style={styles.scoreLabel}>Score</div>
          </div>
        </div>
        <div className="glass-card" style={styles.scoreCard}>
          <h3 style={styles.scoreTitle}>Mobile Optimization</h3>
          <div style={styles.scoreCircle}>
            <div style={styles.scoreValue}>{analytics.mobileScore}</div>
            <div style={styles.scoreLabel}>Score</div>
          </div>
        </div>
        <div className="glass-card" style={styles.scoreCard}>
          <h3 style={styles.scoreTitle}>User Engagement</h3>
          <div style={styles.scoreCircle}>
            <div style={styles.scoreValue}>{analytics.userEngagement}</div>
            <div style={styles.scoreLabel}>Score</div>
          </div>
        </div>
      </div>

      {/* Action Items */}
      <div className="glass-card" style={styles.actionItems}>
        <h2 style={styles.sectionTitle}>🚀 Action Items</h2>
        <ul style={styles.actionList}>
          <li style={styles.actionItem}>
            <span style={styles.actionIcon}>⚡</span>
            Optimize page speed for mobile - Target: {'<'}2s load time
          </li>
          <li style={styles.actionItem}>
            <span style={styles.actionIcon}>🎯</span>
            Improve keyword density for "content marketing"
          </li>
          <li style={styles.actionItem}>
            <span style={styles.actionIcon}>🔗</span>
            Add 5 more internal links to pillar pages
          </li>
          <li style={styles.actionItem}>
            <span style={styles.actionIcon}>📊</span>
            Update meta descriptions for top 10 pages
          </li>
        </ul>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  dashboard: {
    padding: 'var(--space-6)',
    display: 'grid',
    gap: 'var(--space-6)',
    maxWidth: '1400px',
    margin: '0 auto'
  },
  header: {
    padding: 'var(--space-8)'
  },
  headerContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 'var(--space-4)'
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 700,
    margin: 0
  },
  subtitle: {
    color: 'var(--color-text-secondary)',
    marginTop: 'var(--space-2)'
  },
  timeRangeSelector: {
    display: 'flex',
    gap: 'var(--space-2)'
  },
  timeButton: {
    padding: 'var(--space-2) var(--space-4)'
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: 'var(--space-4)'
  },
  metricCard: {
    padding: 'var(--space-6)'
  },
  metricHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-4)'
  },
  metricIcon: {
    fontSize: '1.5rem'
  },
  metricLabel: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.875rem',
    fontWeight: 600
  },
  metricValue: {
    fontSize: '2.5rem',
    fontWeight: 700,
    background: 'var(--gradient-primary)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: 'var(--space-2)'
  },
  metricChange: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: '0.875rem'
  },
  changeLabel: {
    color: 'var(--color-text-secondary)'
  },
  keywordSection: {
    padding: 'var(--space-8)'
  },
  sectionTitle: {
    fontSize: '1.5rem',
    fontWeight: 700,
    marginBottom: 'var(--space-6)'
  },
  keywordTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)'
  },
  keywordRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-4)',
    background: 'var(--glass-bg)',
    borderRadius: 'var(--radius-lg)',
    transition: 'all var(--transition-base)'
  },
  keywordName: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    fontWeight: 600
  },
  rankBadge: {
    background: 'var(--gradient-primary)',
    color: 'white',
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: '0.875rem',
    fontWeight: 700
  },
  keywordChange: {
    fontWeight: 600
  },
  technicalGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 'var(--space-4)'
  },
  scoreCard: {
    padding: 'var(--space-6)',
    textAlign: 'center'
  },
  scoreTitle: {
    fontSize: '1rem',
    marginBottom: 'var(--space-4)',
    color: 'var(--color-text-secondary)'
  },
  scoreCircle: {
    width: '120px',
    height: '120px',
    margin: '0 auto',
    borderRadius: '50%',
    background: 'var(--gradient-primary)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'var(--shadow-glow)'
  },
  scoreValue: {
    fontSize: '2.5rem',
    fontWeight: 700,
    color: 'white'
  },
  scoreLabel: {
    fontSize: '0.875rem',
    color: 'rgba(255, 255, 255, 0.8)'
  },
  actionItems: {
    padding: 'var(--space-8)'
  },
  actionList: {
    listStyle: 'none',
    padding: 0,
    margin: 0
  },
  actionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    background: 'var(--glass-bg)',
    borderRadius: 'var(--radius-lg)',
    marginBottom: 'var(--space-3)',
    transition: 'all var(--transition-base)'
  },
  actionIcon: {
    fontSize: '1.5rem'
  }
};

export default AnalyticsDashboardPro;