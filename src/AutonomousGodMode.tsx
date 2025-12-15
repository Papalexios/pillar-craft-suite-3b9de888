import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GodModeUrlSelector } from './GodModeUrlSelector';
import { SitemapPage } from './types';
import { fetchWithProxies } from './contentUtils';
import { WpConfig } from './types';

type URLStatus = 'critical' | 'high' | 'medium' | 'healthy';

interface URLHealthScore {
  score: number;
  status: URLStatus;
  issues: string[];
  lastOptimized?: string;
  wordCount?: number;
  readabilityScore?: number;
  internalLinks?: number;
}

interface OptimizationResult {
  url: string;
  success: boolean;
  changes: string[];
  errors?: string[];
  healthBefore: number;
  healthAfter: number;
  duration: number;
}

interface AutonomousGodModeProps {
  isGodModeActive: boolean;
  wpConfig?: WpConfig;
  sitemapPages?: SitemapPage[];
  onStatusUpdate?: (status: string) => void;
  onOptimizationComplete?: (result: OptimizationResult) => void;
  excludedUrls?: string[];
  excludedCategories?: string[];
}

export const AutonomousGodMode: React.FC<AutonomousGodModeProps> = ({
  isGodModeActive,
  wpConfig,
  sitemapPages = [],
  onStatusUpdate,
  onOptimizationComplete,
  excludedUrls = [],
  excludedCategories = []
}) => {
  const [targetedUrls, setTargetedUrls] = useState<string[]>([]);
  const [urlHealthMap, setUrlHealthMap] = useState<Map<string, URLHealthScore>>(new Map());
  const [processingQueue, setProcessingQueue] = useState<string[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [optimizedUrls, setOptimizedUrls] = useState<OptimizationResult[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [hasShownConfigWarning, setHasShownConfigWarning] = useState(false);
  
  const isRunningRef = useRef(false);

  // Check if WordPress is properly configured
  const isWpConfigured = !!(wpConfig?.siteUrl && wpConfig?.username && wpConfig?.appPassword);

  const addLog = useCallback((message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const log = `[${timestamp}] ${message}`;
    setLogs(prev => [log, ...prev].slice(0, 50));
    onStatusUpdate?.(message);
  }, [onStatusUpdate]);

  const calculateHealthScore = useCallback(async (url: string): Promise<URLHealthScore> => {
    if (!isWpConfigured || !wpConfig) {
      return { score: 0, status: 'critical', issues: ['WordPress not configured'] };
    }

    const issues: string[] = [];
    let score = 100;

    try {
      const wpPost = await fetchWordPressPost(url, wpConfig);
      
      if (!wpPost) {
        return { score: 0, status: 'critical', issues: ['Post not found'] };
      }

      const wordCount = wpPost.content?.rendered ? 
        wpPost.content.rendered.replace(/<[^>]*>/g, '').split(/\s+/).length : 0;
      
      if (wordCount < 800) {
        score -= 20;
        issues.push(`Thin content (${wordCount} words)`);
      } else if (wordCount < 1500) {
        score -= 10;
        issues.push(`Short content (${wordCount} words)`);
      }

      const lastModified = new Date(wpPost.modified || wpPost.date);
      const daysSinceUpdate = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceUpdate > 365) {
        score -= 25;
        issues.push(`Outdated (${Math.floor(daysSinceUpdate)} days old)`);
      } else if (daysSinceUpdate > 180) {
        score -= 15;
        issues.push(`Aging content (${Math.floor(daysSinceUpdate)} days)`);
      }

      if (!wpPost.yoast_meta?.yoast_wpseo_metadesc || wpPost.yoast_meta.yoast_wpseo_metadesc.length < 120) {
        score -= 15;
        issues.push('Missing/short meta description');
      }

      const internalLinkCount = (wpPost.content?.rendered?.match(/<a[^>]+href=["'][^"']*["']/g) || []).length;
      if (internalLinkCount < 3) {
        score -= 15;
        issues.push(`Low internal links (${internalLinkCount})`);
      }

      const images = wpPost.content?.rendered?.match(/<img/g) || [];
      if (images.length === 0) {
        score -= 10;
        issues.push('No images');
      }

      const sentences = wpPost.content?.rendered?.match(/[.!?]+/g) || [];
      const avgWordsPerSentence = wordCount / (sentences.length || 1);
      if (avgWordsPerSentence > 25) {
        score -= 10;
        issues.push('Low readability (long sentences)');
      }

      if (!wpPost.yoast_meta?.schema) {
        score -= 10;
        issues.push('Missing schema markup');
      }

      let status: URLStatus;
      if (score >= 80) status = 'healthy';
      else if (score >= 60) status = 'medium';
      else if (score >= 40) status = 'high';
      else status = 'critical';

      return {
        score: Math.max(0, score),
        status,
        issues,
        lastOptimized: wpPost.modified,
        wordCount,
        internalLinks: internalLinkCount
      };

    } catch (error: any) {
      return { score: 50, status: 'medium', issues: ['Health check error'] };
    }
  }, [wpConfig, isWpConfigured]);

  const optimizeContent = useCallback(async (url: string): Promise<OptimizationResult> => {
    if (!isWpConfigured || !wpConfig) {
      return {
        url,
        success: false,
        changes: [],
        errors: ['WordPress not configured'],
        healthBefore: 0,
        healthAfter: 0,
        duration: 0
      };
    }

    const startTime = Date.now();
    const changes: string[] = [];
    const errors: string[] = [];

    try {
      addLog(`Processing: ${url}`);

      const wpPost = await fetchWordPressPost(url, wpConfig);
      if (!wpPost) {
        throw new Error('Post not found');
      }

      const healthBefore = (await calculateHealthScore(url)).score;
      const currentContent = wpPost.content?.rendered || '';
      const currentTitle = wpPost.title?.rendered || '';
      
      const relatedPosts = await findRelatedPosts(url, sitemapPages, wpConfig);
      
      let updatedContent = currentContent;
      const linkInjections = await injectSmartInternalLinks(currentContent, relatedPosts);
      if (linkInjections.length > 0 && linkInjections[0].linksAdded > 0) {
        updatedContent = linkInjections[0].content;
        changes.push(`Added ${linkInjections[0].linksAdded} internal links`);
      }

      let metaDescription = wpPost.yoast_meta?.yoast_wpseo_metadesc;
      if (!metaDescription || metaDescription.length < 120) {
        metaDescription = await generateMetaDescription(currentTitle, updatedContent);
        changes.push('Enhanced meta description');
      }

      if (changes.length > 0) {
        await updateWordPressPost(wpPost.id, {
          content: updatedContent,
          meta: { _yoast_wpseo_metadesc: metaDescription }
        }, wpConfig);
        
        addLog(`✓ Optimized: ${url} (${changes.length} changes)`, 'success');
      } else {
        addLog(`✓ No changes needed: ${url}`, 'info');
      }

      const healthAfter = (await calculateHealthScore(url)).score;
      const duration = Date.now() - startTime;

      setUrlHealthMap(prev => new Map(prev).set(url, {
        score: healthAfter,
        status: healthAfter >= 80 ? 'healthy' : healthAfter >= 60 ? 'medium' : healthAfter >= 40 ? 'high' : 'critical',
        issues: [],
        wordCount: 0
      }));

      return {
        url,
        success: true,
        changes,
        errors,
        healthBefore,
        healthAfter,
        duration
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      errors.push(error.message);
      addLog(`Failed: ${url} - ${error.message}`, 'error');
      
      return {
        url,
        success: false,
        changes,
        errors,
        healthBefore: 0,
        healthAfter: 0,
        duration
      };
    }
  }, [wpConfig, isWpConfigured, sitemapPages, calculateHealthScore, addLog]);

  const buildPriorityQueue = useCallback(() => {
    if (!isWpConfigured) {
      if (!hasShownConfigWarning) {
        addLog('⚠️ WordPress not configured. Please configure in Setup tab.', 'warning');
        setHasShownConfigWarning(true);
      }
      return [];
    }

    addLog('Building priority queue...');

    let allUrls = sitemapPages
      .map(p => p.url || p.id)
      .filter(Boolean)
      .filter(url => !excludedUrls.some(excluded => url.includes(excluded)));

    const queue: string[] = [];

    targetedUrls.forEach(url => {
      if (allUrls.includes(url) && !queue.includes(url)) {
        queue.push(url);
      }
    });

    allUrls.forEach(url => {
      if (!queue.includes(url)) {
        queue.push(url);
      }
    });

    setProcessingQueue(queue);
    setProgress({ current: 0, total: queue.length });
    addLog(`Queue ready: ${queue.length} URLs (${targetedUrls.length} prioritized)`, 'success');

    return queue;
  }, [sitemapPages, targetedUrls, excludedUrls, isWpConfigured, hasShownConfigWarning, addLog]);

  const runWorker = useCallback(async () => {
    if (!isGodModeActive || isRunningRef.current) return;

    if (!isWpConfigured) {
      if (!hasShownConfigWarning) {
        addLog('⚠️ WordPress not configured. Please configure in Setup tab.', 'warning');
        setHasShownConfigWarning(true);
      }
      return;
    }

    isRunningRef.current = true;
    setIsProcessing(true);
    addLog('🤖 God Mode activated', 'success');

    try {
      const queue = buildPriorityQueue();

      if (queue.length === 0) {
        addLog('No URLs to process', 'warning');
        return;
      }

      for (let i = 0; i < queue.length; i++) {
        if (!isGodModeActive || !isRunningRef.current) {
          addLog('God Mode stopped', 'warning');
          break;
        }

        const url = queue[i];
        setCurrentUrl(url);
        setProgress({ current: i + 1, total: queue.length });

        const result = await optimizeContent(url);
        setOptimizedUrls(prev => [result, ...prev].slice(0, 20));
        onOptimizationComplete?.(result);

        if (i < queue.length - 1) {
          const delay = 5000 + Math.random() * 5000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      addLog('🎉 God Mode cycle complete!', 'success');
    } catch (error: any) {
      addLog(`Error: ${error.message}`, 'error');
    } finally {
      isRunningRef.current = false;
      setIsProcessing(false);
      setCurrentUrl(null);
    }
  }, [isGodModeActive, isWpConfigured, hasShownConfigWarning, buildPriorityQueue, optimizeContent, onOptimizationComplete, addLog]);

  useEffect(() => {
    if (isGodModeActive && !isRunningRef.current) {
      const timer = setTimeout(() => runWorker(), 100);
      return () => clearTimeout(timer);
    } else if (!isGodModeActive && isRunningRef.current) {
      isRunningRef.current = false;
      addLog('God Mode deactivated', 'warning');
    }
  }, [isGodModeActive, runWorker, addLog]);

  const handleTargetedUrlsChange = useCallback((urls: string[]) => {
    setTargetedUrls(urls);
    if (urls.length > 0) {
      addLog(`🎯 ${urls.length} URL${urls.length > 1 ? 's' : ''} prioritized`, 'info');
    }
  }, [addLog]);

  const getStatusColor = (status: URLStatus): string => {
    const colors = {
      critical: '#ef4444',
      high: '#f97316',
      medium: '#eab308',
      healthy: '#10b981'
    };
    return colors[status];
  };

  const statusCounts = {
    critical: Array.from(urlHealthMap.values()).filter(h => h.status === 'critical').length,
    high: Array.from(urlHealthMap.values()).filter(h => h.status === 'high').length,
    medium: Array.from(urlHealthMap.values()).filter(h => h.status === 'medium').length,
    healthy: Array.from(urlHealthMap.values()).filter(h => h.status === 'healthy').length
  };

  // Show setup guide if WP not configured
  if (!isWpConfigured) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(10, 10, 15, 0) 100%)',
        border: '2px solid #ef4444',
        borderRadius: '16px',
        padding: '2rem',
        marginTop: '2rem',
        boxShadow: '0 12px 40px rgba(239, 68, 68, 0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '2.5rem' }}>⚠️</span>
          <div>
            <h3 style={{ margin: '0 0 0.3rem 0', color: '#f1f5f9', fontSize: '1.5rem', fontWeight: '700' }}>
              WordPress Not Configured
            </h3>
            <p style={{ margin: '0', color: '#64748b', fontSize: '0.9rem' }}>
              God Mode requires WordPress connection to function
            </p>
          </div>
        </div>

        <div style={{
          padding: '1.5rem',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          marginBottom: '1.5rem'
        }}>
          <h4 style={{ margin: '0 0 1rem 0', color: '#f1f5f9', fontSize: '1.1rem' }}>Required Configuration:</h4>
          <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#cbd5e1', lineHeight: '1.8' }}>
            <li><strong>WordPress Site URL</strong> - Your site's URL (e.g., https://example.com)</li>
            <li><strong>WordPress Username</strong> - Admin username with post edit permissions</li>
            <li><strong>Application Password</strong> - Generate in WP → Users → Profile → Application Passwords</li>
          </ul>
        </div>

        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
            Go to <strong style={{ color: '#10b981' }}>Setup & Configuration</strong> tab and fill in the WordPress section
          </p>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{
              padding: '0.75rem 2rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}
          >
            ↑ Go to Setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(10, 10, 15, 0) 100%)',
      border: '2px solid #10b981',
      borderRadius: '16px',
      padding: '2rem',
      marginTop: '2rem',
      boxShadow: '0 12px 40px rgba(16, 185, 129, 0.15), inset 0 1px 0 rgba(16, 185, 129, 0.2)',
      backdropFilter: 'blur(12px)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {isProcessing && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: 'linear-gradient(90deg, transparent, #10b981, transparent)',
          animation: 'slide 2s infinite'
        }} />
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '2.5rem' }}>🤖</span>
          <div>
            <h3 style={{ margin: '0 0 0.3rem 0', color: '#f1f5f9', fontSize: '1.5rem', fontWeight: '700' }}>
              Autonomous God Mode
              {isGodModeActive && <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#10b981' }}>⚡ ACTIVE</span>}
            </h3>
            <p style={{ margin: '0', color: '#64748b', fontSize: '0.9rem' }}>
              {isProcessing 
                ? `⚙️ Processing ${progress.current}/${progress.total} URLs...` 
                : isGodModeActive 
                  ? 'Ready to optimize' 
                  : 'Waiting for activation'
              }
            </p>
          </div>
        </div>
        <div style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: isGodModeActive ? '#10b981' : '#6b7280',
          boxShadow: isGodModeActive ? '0 0 16px rgba(16, 185, 129, 0.8)' : 'none',
          animation: isGodModeActive ? 'pulse 2s infinite' : 'none'
        }} />
      </div>

      <GodModeUrlSelector
        isGodModeActive={isGodModeActive}
        onUrlsChange={handleTargetedUrlsChange}
      />

      {processingQueue.length > 0 && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1.25rem',
          backgroundColor: 'rgba(10, 10, 15, 0.5)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.2rem' }}>📊</span>
            <span style={{ color: '#10b981', fontSize: '1rem', fontWeight: '600' }}>
              Priority Queue: {processingQueue.length} URLs
            </span>
          </div>

          {urlHealthMap.size > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.75rem',
              marginBottom: '1rem'
            }}>
              {(['critical', 'high', 'medium', 'healthy'] as URLStatus[]).map(status => (
                <div key={status} style={{
                  padding: '0.75rem',
                  backgroundColor: `${getStatusColor(status)}15`,
                  border: `1px solid ${getStatusColor(status)}40`,
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: getStatusColor(status) }}>
                    {statusCounts[status]}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'capitalize', marginTop: '0.25rem' }}>
                    {status}
                  </div>
                </div>
              ))}
            </div>
          )}

          {currentUrl && (
            <div style={{
              padding: '1rem',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span>⚡</span>
                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#10b981' }}>Currently Processing:</span>
              </div>
              <a href={currentUrl} target="_blank" rel="noopener noreferrer" style={{
                color: '#60a5fa',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                textDecoration: 'none',
                wordBreak: 'break-all'
              }}>
                {currentUrl}
              </a>
            </div>
          )}
        </div>
      )}

      <div style={{
        marginTop: '1.5rem',
        padding: '1rem',
        backgroundColor: 'rgba(10, 10, 15, 0.6)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: '10px',
        maxHeight: '200px',
        overflowY: 'auto'
      }}>
        <div style={{ marginBottom: '0.75rem', fontWeight: '600', color: '#10b981', fontSize: '0.9rem' }}>
          SYSTEM LOGS
        </div>
        {logs.length === 0 ? (
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic' }}>
            No posts optimized in this session yet. Waiting for targets...
          </p>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} style={{
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              color: '#cbd5e1',
              marginBottom: '0.25rem',
              padding: '0.25rem 0'
            }}>
              {log}
            </div>
          ))
        )}
      </div>

      {optimizedUrls.length > 0 && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '10px'
        }}>
          <div style={{ marginBottom: '0.75rem', fontWeight: '600', color: '#10b981', fontSize: '0.9rem' }}>
            ✅ RECENTLY OPTIMIZED ({optimizedUrls.length})
          </div>
          {optimizedUrls.slice(0, 5).map((result, idx) => (
            <div key={idx} style={{
              padding: '0.75rem',
              backgroundColor: result.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${result.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
              borderRadius: '6px',
              marginBottom: '0.5rem'
            }}>
              <a href={result.url} target="_blank" rel="noopener noreferrer" style={{
                color: '#60a5fa',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
                textDecoration: 'none',
                display: 'block',
                marginBottom: '0.25rem',
                wordBreak: 'break-all'
              }}>
                {result.url}
              </a>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {result.changes.length > 0 ? result.changes.join(', ') : 'No changes needed'}
                {result.success && result.healthBefore > 0 && (
                  <span style={{ color: '#10b981', marginLeft: '0.5rem' }}>
                    Health: {result.healthBefore}→{result.healthAfter}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default AutonomousGodMode;

// Helper functions
async function fetchWordPressPost(url: string, wpConfig: WpConfig): Promise<any> {
  try {
    const urlObj = new URL(url);
    const slug = urlObj.pathname.split('/').filter(Boolean).pop();
    const apiUrl = `${wpConfig.siteUrl}/wp-json/wp/v2/posts?slug=${slug}&_embed=1`;
    const response = await fetchWithProxies(apiUrl);
    const posts = await response.json();
    return posts && posts.length > 0 ? posts[0] : null;
  } catch (error) {
    console.error('Failed to fetch WP post:', error);
    return null;
  }
}

async function updateWordPressPost(postId: number, updates: any, wpConfig: WpConfig): Promise<boolean> {
  try {
    const apiUrl = `${wpConfig.siteUrl}/wp-json/wp/v2/posts/${postId}`;
    const credentials = btoa(`${wpConfig.username}:${wpConfig.appPassword}`);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`
      },
      body: JSON.stringify(updates)
    });
    return response.ok;
  } catch (error) {
    console.error('Failed to update WP post:', error);
    return false;
  }
}

async function findRelatedPosts(url: string, allPages: SitemapPage[], wpConfig: WpConfig): Promise<SitemapPage[]> {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  const keywords = pathParts.map(p => p.replace(/-/g, ' ').toLowerCase());
  return allPages
    .filter(page => {
      const pageUrl = page.url || page.id;
      return pageUrl !== url && keywords.some(kw => pageUrl.toLowerCase().includes(kw));
    })
    .slice(0, 10);
}

async function injectSmartInternalLinks(content: string, relatedPosts: SitemapPage[]): Promise<Array<{content: string, linksAdded: number}>> {
  if (relatedPosts.length === 0) return [];
  let updatedContent = content;
  let linksAdded = 0;
  for (const post of relatedPosts.slice(0, 3)) {
    const anchorText = post.title || post.slug || '';
    if (!anchorText || updatedContent.includes(`href="${post.url}"`)) continue;
    const keywords = anchorText.toLowerCase().split(' ').filter(k => k.length > 3);
    for (const keyword of keywords.slice(0, 2)) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(updatedContent) && !updatedContent.includes(`>${keyword}</a>`)) {
        updatedContent = updatedContent.replace(regex, `<a href="${post.url}">${keyword}</a>`);
        linksAdded++;
        break;
      }
    }
  }
  return [{ content: updatedContent, linksAdded }];
}

async function generateMetaDescription(title: string, content: string): Promise<string> {
  const textOnly = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = textOnly.match(/[^.!?]+[.!?]+/g) || [];
  let description = sentences[0] || textOnly.substring(0, 150);
  if (description.length > 155) {
    description = description.substring(0, 152) + '...';
  }
  return description;
}