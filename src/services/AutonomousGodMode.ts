import React, { useState, useEffect, useCallback } from 'react';

type URLStatus = 'critical' | 'high' | 'medium' | 'healthy';

interface AutonomousGodModeProps {
  isGodModeActive: boolean;
  onStatusUpdate?: (status: string) => void;
  onTargetUrlsChange?: (urls: string[]) => void;
}

export const AutonomousGodMode: React.FC<AutonomousGodModeProps> = ({
  isGodModeActive,
  onStatusUpdate,
  onTargetUrlsChange
}) => {
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [urlStatusMap, setUrlStatusMap] = useState<Record<string, URLStatus>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingQueue, setProcessingQueue] = useState<string[]>([]);
  const [completedUrls, setCompletedUrls] = useState<Set<string>>(new Set());
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  // Priority ranking system
  const getPriorityRank = useCallback((status: URLStatus): number => {
    switch (status) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'healthy': return 1;
      default: return 0;
    }
  }, []);

  const getSortedUrlsByPriority = useCallback((urls: string[]) => {
    return [...urls].sort((a, b) => {
      const rankA = getPriorityRank(urlStatusMap[a] || 'healthy');
      const rankB = getPriorityRank(urlStatusMap[b] || 'healthy');
      return rankB - rankA;
    });
  }, [urlStatusMap, getPriorityRank]);

  // Main Processing Loop
  useEffect(() => {
    if (!isGodModeActive || selectedUrls.length === 0) {
        setIsProcessing(false);
        setCurrentUrl(null);
        return;
    }

    setIsProcessing(true);
    const sorted = getSortedUrlsByPriority(selectedUrls);
    setProcessingQueue(sorted);

    // Find the next URL that isn't completed
    const nextUrl = sorted.find(url => !completedUrls.has(url));

    if (nextUrl) {
      setCurrentUrl(nextUrl);
      onStatusUpdate?.(`Processing: ${nextUrl}`);
      
      // Simulate processing time (Real logic is handled by MaintenanceEngine in background)
      const timer = setTimeout(() => {
        setCompletedUrls(prev => {
            const newSet = new Set(prev);
            newSet.add(nextUrl);
            return newSet;
        });
        setCurrentUrl(null);
      }, 5000); // UI update delay only

      return () => clearTimeout(timer);
    } else {
      setIsProcessing(false);
      setCurrentUrl(null);
      onStatusUpdate?.('All targets optimized. Standing by.');
    }
  }, [isGodModeActive, selectedUrls, completedUrls, getSortedUrlsByPriority, onStatusUpdate]);

  // Load saved URLs on mount
  useEffect(() => {
    try {
      const storedUrls = localStorage.getItem('godModeUrls');
      if (storedUrls) {
        const urls = JSON.parse(storedUrls);
        if (Array.isArray(urls) && urls.length > 0) {
          setSelectedUrls(urls);
          // Initialize status map for new URLs
          setUrlStatusMap(prev => {
            const next = { ...prev };
            urls.forEach(u => { if (!next[u]) next[u] = 'healthy'; });
            return next;
          });
          // Notify parent immediately
          if (onTargetUrlsChange) {
              onTargetUrlsChange(urls);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load godModeUrls:', e);
    }
  }, []);

  // Sync changes to parent and storage
  useEffect(() => {
    localStorage.setItem('godModeUrls', JSON.stringify(selectedUrls));
    if (onTargetUrlsChange) {
        onTargetUrlsChange(selectedUrls);
    }
  }, [selectedUrls, onTargetUrlsChange]);

  const getStatusColor = (status: URLStatus) => {
    switch (status) {
      case 'critical': return 'text-red-500 bg-red-50 border-red-200';
      case 'high': return 'text-orange-500 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-500 bg-yellow-50 border-yellow-200';
      case 'healthy': return 'text-green-500 bg-green-50 border-green-200';
    }
  };

  return (
    <div className={`mt-6 p-6 rounded-xl border-2 transition-all duration-500 ${
      isGodModeActive ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.2)]' : 'border-gray-200'
    }`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isGodModeActive ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Autonomous God Mode</h3>
            <p className="text-sm text-gray-500">
              {isGodModeActive ? 'AI Agent Active & Processing' : 'System Standby'}
            </p>
          </div>
        </div>
        
        {isGodModeActive && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
            </span>
            <span className="text-sm font-medium text-purple-600">LIVE</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {selectedUrls.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <p className="text-gray-500">No target URLs configured.</p>
            <p className="text-sm text-gray-400 mt-1">Add URLs above to start autonomous optimization.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between text-sm text-gray-500 px-1">
              <span>Optimization Queue</span>
              <span>{completedUrls.size} / {selectedUrls.length} Completed</span>
            </div>
            
            {processingQueue.map((url) => {
              const status = urlStatusMap[url] || 'healthy';
              const isCompleted = completedUrls.has(url);
              const isActive = currentUrl === url && isGodModeActive;

              return (
                <div 
                  key={url}
                  className={`relative p-3 rounded-lg border flex items-center justify-between group overflow-hidden ${
                    isActive ? 'border-purple-500 bg-purple-50' : 
                    isCompleted ? 'border-green-200 bg-green-50 opacity-75' : 'border-gray-200 bg-white'
                  }`}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-purple-100/50 animate-pulse pointer-events-none" />
                  )}
                  
                  <div className="flex items-center gap-3 relative z-10 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      isActive ? 'bg-purple-500' :
                      isCompleted ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                    <span className="text-sm font-medium text-gray-700 truncate">{url}</span>
                  </div>

                  <div className="flex items-center gap-3 relative z-10 shrink-0">
                    {isActive ? (
                      <span className="text-xs font-bold text-purple-600 flex items-center gap-1">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        OPTIMIZING
                      </span>
                    ) : isCompleted ? (
                      <span className="text-xs font-bold text-green-600">COMPLETED</span>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(status)} uppercase`}>
                        {status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
