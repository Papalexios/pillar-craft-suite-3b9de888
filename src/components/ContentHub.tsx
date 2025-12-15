// 📊 CONTENT HUB COMPONENT - Fixed & Working

import React, { useState, useEffect } from 'react';
import { CrawledPage } from '../sitemap-crawler-fixed';
import { getSEOHealthStats } from '../services/sitemap-service';
import { useSitemapCrawler } from '../hooks/useSitemapCrawler';

interface ContentHubProps {
  sitemapUrl: string;
  setSitemapUrl: (url: string) => void;
  onPagesLoaded?: (pages: CrawledPage[]) => void;
}

export function ContentHub({ sitemapUrl, setSitemapUrl, onPagesLoaded }: ContentHubProps) {
  const { pages, isLoading, error, progress, crawl, setPages } = useSitemapCrawler();
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'excellent' | 'good' | 'fair' | 'poor'>('all');

  // Notify parent when pages loaded
  useEffect(() => {
    if (pages.length > 0 && onPagesLoaded) {
      onPagesLoaded(pages);
    }
  }, [pages, onPagesLoaded]);

  const handleCrawl = async () => {
    if (!sitemapUrl.trim()) {
      alert('Please enter a sitemap URL or site root');
      return;
    }

    try {
      await crawl(sitemapUrl);
    } catch (error) {
      console.error('Crawl failed:', error);
    }
  };

  const stats = getSEOHealthStats(pages);

  const filteredPages = pages.filter(page => {
    if (filter === 'all') return true;
    const health = page.seoHealth || 50;
    if (filter === 'excellent') return health >= 90;
    if (filter === 'good') return health >= 75 && health < 90;
    if (filter === 'fair') return health >= 60 && health < 75;
    if (filter === 'poor') return health < 60;
    return true;
  });

  const togglePageSelection = (url: string) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPages(new Set(filteredPages.map(p => p.url)));
  };

  const deselectAll = () => {
    setSelectedPages(new Set());
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Crawler Input */}
      <div style={sectionStyle}>
        <h3 style={headingStyle}>🔍 Sitemap Crawler</h3>
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <input
            type="text"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            placeholder="https://example.com/sitemap.xml or https://example.com"
            style={inputStyle}
            disabled={isLoading}
          />
          <button
            onClick={handleCrawl}
            disabled={isLoading}
            style={isLoading ? disabledButtonStyle : primaryButtonStyle}
          >
            {isLoading ? '🔄 Crawling...' : '🚀 Crawl'}
          </button>
        </div>

        {/* Progress */}
        {progress && (
          <div style={{
            marginTop: 12,
            padding: 12,
            background: 'rgba(45, 92, 255, 0.1)',
            border: '1px solid rgba(45, 92, 255, 0.3)',
            borderRadius: 8,
            fontSize: 13
          }}>
            {progress}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 12,
            padding: 12,
            background: 'rgba(255, 85, 85, 0.1)',
            border: '1px solid rgba(255, 85, 85, 0.3)',
            borderRadius: 8,
            fontSize: 13,
            color: '#ff5555'
          }}>
            ❌ {error}
          </div>
        )}
      </div>

      {/* SEO Health Stats */}
      {pages.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>📊 SEO Health Overview</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 12 }}>
            <StatCard label="Total Pages" value={pages.length} color="#2d5cff" />
            <StatCard label="Average Health" value={`${stats.average}%`} color="#50fa7b" />
            <StatCard label="Excellent (90+)" value={stats.excellent} color="#50fa7b" />
            <StatCard label="Good (75-89)" value={stats.good} color="#8be9fd" />
            <StatCard label="Fair (60-74)" value={stats.fair} color="#ffb86c" />
            <StatCard label="Poor (<60)" value={stats.poor} color="#ff5555" />
          </div>
        </div>
      )}

      {/* Page List */}
      {pages.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={headingStyle}>📄 Crawled Pages ({filteredPages.length})</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                style={selectStyle}
              >
                <option value="all">All Pages</option>
                <option value="excellent">Excellent (90+)</option>
                <option value="good">Good (75-89)</option>
                <option value="fair">Fair (60-74)</option>
                <option value="poor">Poor (&lt;60)</option>
              </select>
              <button onClick={selectAll} style={secondaryButtonStyle}>Select All</button>
              <button onClick={deselectAll} style={secondaryButtonStyle}>Deselect All</button>
            </div>
          </div>

          <div style={{ maxHeight: 500, overflow: 'auto', border: '1px solid rgba(45, 92, 255, 0.2)', borderRadius: 8 }}>
            {filteredPages.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', opacity: 0.6 }}>
                No pages match the current filter.
              </div>
            ) : (
              filteredPages.map((page, index) => (
                <div
                  key={page.url + index}
                  style={{
                    padding: 12,
                    borderBottom: index < filteredPages.length - 1 ? '1px solid rgba(45, 92, 255, 0.1)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: selectedPages.has(page.url) ? 'rgba(45, 92, 255, 0.05)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onClick={() => togglePageSelection(page.url)}
                >
                  <input
                    type="checkbox"
                    checked={selectedPages.has(page.url)}
                    onChange={() => togglePageSelection(page.url)}
                    style={{ width: 16, height: 16 }}
                  />
                  <div style={{ flex: 1, fontSize: 13, wordBreak: 'break-all' }}>{page.url}</div>
                  {page.seoHealth !== undefined && (
                    <div style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: getHealthColor(page.seoHealth).bg,
                      color: getHealthColor(page.seoHealth).text
                    }}>
                      {page.seoHealth}%
                    </div>
                  )}
                  {page.lastMod && (
                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      {new Date(page.lastMod).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {selectedPages.size > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(80, 250, 123, 0.1)', borderRadius: 8 }}>
              <strong>{selectedPages.size}</strong> page(s) selected
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {pages.length === 0 && !isLoading && !error && (
        <div style={{ padding: 60, textAlign: 'center', opacity: 0.6 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🗺️</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Pages Crawled Yet</div>
          <div style={{ fontSize: 14, opacity: 0.8 }}>Enter your sitemap URL above and click "Crawl" to begin</div>
        </div>
      )}
    </div>
  );
}

// Helper Components
function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      padding: 16,
      background: 'rgba(26, 31, 46, 0.6)',
      border: `1px solid ${color}40`,
      borderRadius: 8,
      textAlign: 'center'
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div>
    </div>
  );
}

function getHealthColor(health: number): { bg: string; text: string } {
  if (health >= 90) return { bg: 'rgba(80, 250, 123, 0.2)', text: '#50fa7b' };
  if (health >= 75) return { bg: 'rgba(139, 233, 253, 0.2)', text: '#8be9fd' };
  if (health >= 60) return { bg: 'rgba(255, 184, 108, 0.2)', text: '#ffb86c' };
  return { bg: 'rgba(255, 85, 85, 0.2)', text: '#ff5555' };
}

// Styles
const sectionStyle: React.CSSProperties = {
  background: 'rgba(26, 31, 46, 0.5)',
  border: '1px solid rgba(45, 92, 255, 0.2)',
  borderRadius: 12,
  padding: 20,
  backdropFilter: 'blur(10px)'
};

const headingStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  margin: 0
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 14px',
  background: 'rgba(15, 21, 39, 0.8)',
  border: '1px solid rgba(45, 92, 255, 0.3)',
  borderRadius: 8,
  color: '#e6e6e6',
  fontSize: 14,
  outline: 'none'
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'rgba(15, 21, 39, 0.8)',
  border: '1px solid rgba(45, 92, 255, 0.3)',
  borderRadius: 6,
  color: '#e6e6e6',
  fontSize: 13,
  cursor: 'pointer'
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: 'linear-gradient(135deg, #2d5cff, #1e47e0)',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'rgba(26, 31, 46, 0.8)',
  border: '1px solid rgba(45, 92, 255, 0.3)',
  borderRadius: 6,
  color: '#9aa7d8',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

const disabledButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  opacity: 0.5,
  cursor: 'not-allowed'
};
