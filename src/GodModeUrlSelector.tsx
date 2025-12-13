import React, { useState, useEffect } from 'react';

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
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAddUrl = () => {
    if (!newUrl.trim()) return;
    const urlToAdd = newUrl.trim();
    
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
      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(10, 10, 15, 0) 100%)',
      border: '1.5px solid #10b981',
      borderRadius: '12px',
      padding: '1.5rem',
      marginTop: '1.5rem',
      boxShadow: '0 8px 32px rgba(16, 185, 129, 0.08), inset 0 1px 0 rgba(16, 185, 129, 0.1)',
      backdropFilter: 'blur(10px)',
      transition: 'all 0.3s ease'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🎯</span>
          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', color: '#f1f5f9', fontSize: '1.1rem', fontWeight: '600' }}>
              URL Targeting Engine
            </h4>
            <p style={{ margin: '0', color: '#64748b', fontSize: '0.8rem' }}>
              {urlsToMonitor.length === 0 
                ? 'Auto-process all URLs from sitemap' 
                : `Focused optimization: ${urlsToMonitor.length} URL${urlsToMonitor.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10b981',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: '500',
            transition: 'all 0.2s ease',
            opacity: isGodModeActive ? 1 : 0.5
          }}
          disabled={!isGodModeActive}
        >
          {isExpanded ? '−' : '+'} {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {isExpanded && (
        <>
          <div style={{
            background: 'rgba(10, 10, 15, 0.4)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '10px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: '500' }}>
              Add URL to optimize
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                type="url"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleAddUrl()}
                placeholder="https://example.com/article"
                disabled={!isGodModeActive}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: 'rgba(30, 41, 59, 0.6)',
                  color: '#f1f5f9',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  opacity: isGodModeActive ? 1 : 0.5,
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  fontFamily: 'monospace'
                }}
              />
              <button
                onClick={handleAddUrl}
                disabled={!isGodModeActive || !newUrl.trim()}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: isGodModeActive && newUrl.trim() ? '#10b981' : '#475569',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isGodModeActive && newUrl.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  boxShadow: isGodModeActive && newUrl.trim() ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none'
                }}
              >
                + Add
              </button>
            </div>
          </div>

          {urlsToMonitor.length > 0 ? (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
                paddingBottom: '0.75rem',
                borderBottom: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: '600' }}>
                  🎯 {urlsToMonitor.length} URL{urlsToMonitor.length !== 1 ? 's' : ''} targeted for optimization
                </span>
                <button
                  onClick={handleClearAll}
                  disabled={!isGodModeActive}
                  style={{
                    padding: '0.4rem 0.9rem',
                    backgroundColor: 'transparent',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: '6px',
                    cursor: isGodModeActive ? 'pointer' : 'not-allowed',
                    fontSize: '0.8rem',
                    fontWeight: '500',
                    opacity: isGodModeActive ? 1 : 0.5,
                    transition: 'all 0.2s ease'
                  }}
                >
                  🗑️ Clear All
                </button>
              </div>

              <div style={{
                display: 'grid',
                gap: '0.6rem',
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                {urlsToMonitor.map((url, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem',
                      backgroundColor: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                      borderRadius: '8px',
                      transition: 'all 0.2s ease',
                      hover: {
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      }
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
                        marginRight: '0.75rem',
                        fontSize: '0.85rem',
                        fontFamily: 'monospace',
                        transition: 'color 0.2s ease'
                      }}
                      title={url}
                    >
                      🔗 {url}
                    </a>
                    <button
                      onClick={() => handleRemoveUrl(url)}
                      disabled={!isGodModeActive}
                      style={{
                        padding: '0.4rem 0.7rem',
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: '#fca5a5',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        cursor: isGodModeActive ? 'pointer' : 'not-allowed',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        opacity: isGodModeActive ? 1 : 0.5,
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      ✕ Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              padding: '1.5rem',
              backgroundColor: 'rgba(10, 10, 15, 0.5)',
              borderRadius: '8px',
              color: '#64748b',
              fontSize: '0.9rem',
              textAlign: 'center',
              marginBottom: '1rem',
              border: '1px dashed rgba(16, 185, 129, 0.2)'
            }}>
              {isGodModeActive ? (
                <>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>🌍</p>
                  <p style={{ margin: '0 0 0.3rem 0', fontWeight: '500' }}>No specific URLs selected</p>
                  <p style={{ margin: '0', fontSize: '0.8rem' }}>
                    GOD MODE will process all URLs from your sitemap in priority order
                  </p>
                </>
              ) : (
                <p style={{ margin: '0' }}>Enable GOD MODE to add and manage target URLs</p>
              )}
            </div>
          )}
        </>
      )}

      {!isExpanded && urlsToMonitor.length === 0 && isGodModeActive && (
        <p style={{
          margin: '0.5rem 0 0 0',
          fontSize: '0.8rem',
          color: '#64748b',
          fontStyle: 'italic'
        }}>
          💡 Expand to add specific URLs, or leave empty to optimize all URLs
        </p>
      )}
    </div>
  );
}
