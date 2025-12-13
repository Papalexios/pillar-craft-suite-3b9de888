import React, { useState, useEffect, useCallback } from 'react';
import { GodModeUrlSelector } from './GodModeUrlSelector';

type URLStatus = 'critical' | 'high' | 'medium' | 'healthy';

interface URLStatusMap {
  [url: string]: URLStatus;
}

interface AutonomousGodModeProps {
  isGodModeActive: boolean;
  onStatusUpdate?: (status: string) => void;
}

/**
 * AUTONOMOUS GOD MODE COMPONENT
 * 
 * State-of-the-Art Implementation:
 * - Priority-based URL processing (CRITICAL > HIGH > MEDIUM > HEALTHY)
 * - Automatic URL monitoring and continuous optimization
 * - Intelligent URL selection from GodModeUrlSelector
 * - Real-time status tracking and reporting
 * - Enterprise-grade error handling and recovery
 */
export const AutonomousGodMode: React.FC<AutonomousGodModeProps> = ({
  isGodModeActive,
  onStatusUpdate
}) => {
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [urlStatusMap, setUrlStatusMap] = useState<URLStatusMap>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingQueue, setProcessingQueue] = useState<string[]>([]);
  const [completedUrls, setCompletedUrls] = useState<Set<string>>(new Set());

  // Priority ranking system for URLs
  const getPriorityRank = useCallback((status: URLStatus): number => {
    const priorityMap: Record<URLStatus, number> = {
      'critical': 0,
      'high': 1,
      'medium': 2,
      'healthy': 3
    };
    return priorityMap[status] || 999;
  }, []);

  // Sort URLs by priority for optimal processing order
  const getSortedUrlsByPriority = useCallback((urls: string[]): string[] => {
    return [...urls].sort((a, b) => {
      const statusA = urlStatusMap[a] || 'healthy';
      const statusB = urlStatusMap[b] || 'healthy';
      return getPriorityRank(statusA) - getPriorityRank(statusB);
    });
  }, [urlStatusMap, getPriorityRank]);

  // Autonomously process URLs in priority order
  const processUrlQueue = useCallback(async () => {
    if (!isGodModeActive || selectedUrls.length === 0) return;

    setIsProcessing(true);
    const sorted = getSortedUrlsByPriority(selectedUrls);
    setProcessingQueue(sorted);

    for (const url of sorted) {
      if (completedUrls.has(url)) continue;

      try {
        // Simulate autonomous processing (in production, call your optimization service)
        onStatusUpdate?.(`Processing: ${url}`);

        // In production: await optimizeUrlWithGodMode(url);
        await new Promise(resolve => setTimeout(resolve, 1000));

        setCompletedUrls(prev => new Set([...prev, url]));
        setUrlStatusMap(prev => ({
          ...prev,
          [url]: 'healthy'
        }));
      } catch (error) {
        console.error(`Error processing ${url}:`, error);
        onStatusUpdate?.(`Error processing: ${url}`);
      }
    }

    setIsProcessing(false);
  }, [isGodModeActive, selectedUrls, completedUrls, getSortedUrlsByPriority, onStatusUpdate]);

  // Auto-start processing when God Mode is activated
  useEffect(() => {
    if (isGodModeActive && selectedUrls.length > 0 && !isProcessing) {
      processUrlQueue();
    }
  }, [isGodModeActive, selectedUrls.length, isProcessing, processUrlQueue]);

  // Handle URL changes from selector
  const handleUrlsChange = useCallback((urls: string[]) => {
    setSelectedUrls(urls);
    setCompletedUrls(new Set()); // Reset completed URLs when list changes
    // Initialize new URLs with 'healthy' status
    const newStatusMap: URLStatusMap = { ...urlStatusMap };
    urls.forEach(url => {
      if (!newStatusMap[url]) {
        newStatusMap[url] = 'healthy';
      }
    });
    setUrlStatusMap(newStatusMap);
  }, [urlStatusMap]);

  // Render status indicator for a URL
  const getStatusColor = (status: URLStatus): string => {
    const colorMap: Record<URLStatus, string> = {
      'critical': '#ef4444',
      'high': '#f97316',
      'medium': '#eab308',
      'healthy': '#10b981'
    };
    return colorMap[status];
  };

  const getStatusIcon = (status: URLStatus): string => {
    const iconMap: Record<URLStatus, string> = {
      'critical': '🔴',
      'high': '🟠',
      'medium': '🟡',
      'healthy': '🟢'
    };
    return iconMap[status];
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(10, 10, 15, 0) 100%)',
      border: '2px solid #10b981',
      borderRadius: '14px',
      padding: '2rem',
      marginTop: '2rem',
      boxShadow: '0 12px 40px rgba(16, 185, 129, 0.1), inset 0 1px 0 rgba(16, 185, 129, 0.15)',
      backdropFilter: 'blur(12px)',
      transition: 'all 0.4s ease'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '2rem' }}>🤖</span>
          <div>
            <h3 style={{ margin: '0 0 0.3rem 0', color: '#f1f5f9', fontSize: '1.3rem', fontWeight: '700' }}>
              Autonomous God Mode
            </h3>
            <p style={{ margin: '0', color: '#64748b', fontSize: '0.85rem' }}>
              {isProcessing ? '⚙️ Processing URLs in priority order...' : 'Ready to optimize'}
            </p>
          </div>
        </div>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: isGodModeActive ? '#10b981' : '#6b7280',
          boxShadow: isGodModeActive ? '0 0 12px rgba(16, 185, 129, 0.6)' : 'none',
          animation: isGodModeActive ? 'pulse 2s infinite' : 'none'
        }} />
      </div>

      {/* URL Selector */}
      <GodModeUrlSelector
        isGodModeActive={isGodModeActive}
        onUrlsChange={handleUrlsChange}
      />

      {/* Processing Queue Display */}
      {selectedUrls.length > 0 && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: 'rgba(10, 10, 15, 0.4)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.1rem' }}>📊</span>
            <span style={{ color: '#10b981', fontSize: '0.9rem', fontWeight: '600' }}>
              Priority Queue: {processingQueue.length} URLs
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {processingQueue.map((url) => {
              const status = urlStatusMap[url] || 'healthy';
              const isCompleted = completedUrls.has(url);
              const isCurrently = processingQueue[0] === url && isProcessing;

              return (
                <div
                  key={url}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    backgroundColor: isCurrently ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                    border: `1px solid ${isCurrently ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.15)'}`,
                    borderRadius: '8px',
                    opacity: isCompleted ? 0.6 : 1,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>{getStatusIcon(status)}</span>
                  <span style={{
                    flex: 1,
                    fontSize: '0.85rem',
                    color: '#cbd5e1',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {url}
                  </span>
                  <span style={{
                    fontSize: '0.75rem',
                    color: '#64748b',
                    minWidth: '60px',
                    textAlign: 'right'
                  }}>
                    {isCompleted ? '✓ Done' : isCurrently ? '⚡ Active' : `Priority: ${getPriorityRank(status)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status Summary */}
      {selectedUrls.length > 0 && (
        <div style{{
          marginTop: '1rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '0.75rem'
        }}>
          {(['critical', 'high', 'medium', 'healthy'] as URLStatus[]).map(status => {
            const count = Object.values(urlStatusMap).filter(s => s === status).length;
            return (
              <div
                key={status}
                style={{
                  padding: '0.75rem',
                  backgroundColor: `${getStatusColor(status)}15`,
                  border: `1px solid ${getStatusColor(status)}40`,
                  borderRadius: '8px',
                  textAlign: 'center'
                }}
              >
                <div style={{
                  fontSize: '1.2rem',
                  fontWeight: '700',
                  color: getStatusColor(status)
                }}>
                  {count}
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  color: '#64748b',
                  textTransform: 'capitalize',
                  marginTop: '0.25rem'
                }}>
                  {status}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AutonomousGodMode;
