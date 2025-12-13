import React, { useState } from 'react';

interface GodModeUrlSelectorProps {
  onUrlsChange: (urls: string[]) => void;
  isGodModeActive: boolean;
}

export const GodModeUrlSelector: React.FC<GodModeUrlSelectorProps> = ({
  onUrlsChange,
  isGodModeActive
}) => {
  const [urlsToMonitor, setUrlsToMonitor] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('godModeUrls') || '[]');
    } catch {
      return [];
    }
  });
  const [newUrl, setNewUrl] = useState('');

  const handleAddUrl = () => {
    if (!newUrl.trim()) return;
    const urlToAdd = newUrl.trim();
    
    // Validate URL format
    try {
      new URL(urlToAdd);
    } catch {
      alert('Invalid URL format. Please enter a valid URL.');
      return;
    }

    if (urlsToMonitor.includes(urlToAdd)) {
      alert('URL already in monitoring list.');
      return;
    }

    const updated = [...urlsToMonitor, urlToAdd];
    setUrlsToMonitor(updated);
    localStorage.setItem('godModeUrls', JSON.stringify(updated));
    onUrlsChange(updated);
    setNewUrl('');
  };

  const handleRemoveUrl = (url: string) => {
    const updated = urlsToMonitor.filter(u => u !== url);
    setUrlsToMonitor(updated);
    localStorage.setItem('godModeUrls', JSON.stringify(updated));
    onUrlsChange(updated);
  };

  const handleClearAll = () => {
    if (window.confirm('Remove all URLs from GOD MODE monitoring?')) {
      setUrlsToMonitor([]);
      localStorage.setItem('godModeUrls', '[]');
      onUrlsChange([]);
    }
  };

  return (
    <div style={{
      background: '#020617',
      padding: '1rem',
      borderRadius: '8px',
      border: '1px solid #1e293b',
      marginTop: '1rem'
    }}>
      <h4 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#f1f5f9' }}>
        🎯 Select Specific URLs to Optimize
      </h4>
      <p style={{ margin: '0 0 1rem 0', color: '#94a3b8', fontSize: '0.85rem' }}>
        Add the specific URLs you want GOD MODE to automatically optimize. Leave empty to process all URLs from your sitemap.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="url"
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleAddUrl()}
          placeholder="https://example.com/article-to-optimize"
          disabled={!isGodModeActive}
          style={{
            flex: 1,
            padding: '0.6rem',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--border-radius-md)',
            fontSize: '0.9rem',
            opacity: isGodModeActive ? 1 : 0.5
          }}
        />
        <button
          onClick={handleAddUrl}
          disabled={!isGodModeActive || !newUrl.trim()}
          style={{
            padding: '0.6rem 1rem',
            backgroundColor: isGodModeActive && newUrl.trim() ? '#10b981' : '#4b5563',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--border-radius-md)',
            cursor: isGodModeActive && newUrl.trim() ? 'pointer' : 'not-allowed',
            fontSize: '0.9rem',
            fontWeight: '500'
          }}
        >
          + Add URL
        </button>
      </div>

      {urlsToMonitor.length > 0 ? (
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem'
          }}>
            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              {urlsToMonitor.length} URL{urlsToMonitor.length !== 1 ? 's' : ''} selected for GOD MODE
            </span>
            <button
              onClick={handleClearAll}
              disabled={!isGodModeActive}
              style={{
                padding: '0.3rem 0.8rem',
                backgroundColor: 'transparent',
                color: '#ef4444',
                border: '1px solid #ef4444',
                borderRadius: '4px',
                cursor: isGodModeActive ? 'pointer' : 'not-allowed',
                fontSize: '0.8rem',
                opacity: isGodModeActive ? 1 : 0.5
              }}
            >
              Clear All
            </button>
          </div>

          <div style={{
            maxHeight: '200px',
            overflowY: 'auto',
            border: '1px solid #1e293b',
            borderRadius: '6px',
            padding: '0.5rem'
          }}>
            {urlsToMonitor.map((url, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem',
                  backgroundColor: '#0f172a',
                  marginBottom: '0.4rem',
                  borderRadius: '4px',
                  fontSize: '0.85rem'
                }}
              >
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#60a5fa',
                    textDecoration: 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    marginRight: '0.5rem'
                  }}
                  title={url}
                >
                  {url}
                </a>
                <button
                  onClick={() => handleRemoveUrl(url)}
                  disabled={!isGodModeActive}
                  style={{
                    padding: '0.2rem 0.6rem',
                    backgroundColor: '#7f1d1d',
                    color: '#fca5a5',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: isGodModeActive ? 'pointer' : 'not-allowed',
                    fontSize: '0.75rem',
                    opacity: isGodModeActive ? 1 : 0.5
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{
          padding: '1rem',
          backgroundColor: '#0f172a',
          borderRadius: '6px',
          color: '#64748b',
          fontSize: '0.9rem',
          textAlign: 'center'
        }}>
          {isGodModeActive ? (
            <>
              <p style={{ margin: 0 }}>No specific URLs selected.</p>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem' }}>
                GOD MODE will process all URLs from your sitemap.
              </p>
            </>
          ) : (
            <p style={{ margin: 0 }}>Enable GOD MODE to add specific URLs for optimization.</p>
          )}
        </div>
      )}

      <p style={{
        margin: '0.75rem 0 0 0',
        fontSize: '0.75rem',
        color: '#64748b'
      }}>
        💡 Tip: Add specific URLs to have GOD MODE focus on those pages. Leave empty to automatically process all URLs in priority order.
      </p>
    </div>
  );
};
