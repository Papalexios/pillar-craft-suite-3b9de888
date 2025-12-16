/**
 * ⚡ PERFORMANCE OPTIMIZATION HOOKS
 * Advanced caching, code splitting, and performance monitoring
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  firstInputDelay: number;
  cumulativeLayoutShift: number;
  timeToInteractive: number;
  totalBlockingTime: number;
}

/**
 * Cache configuration
 */
interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum cache size
}

/**
 * Advanced caching hook with LRU eviction
 */
export function useAdvancedCache<T>(config: CacheConfig = { ttl: 3600000, maxSize: 100 }) {
  const cache = useRef(new Map<string, { data: T; timestamp: number; hits: number }>());
  const [cacheStats, setCacheStats] = useState({ hits: 0, misses: 0, size: 0 });

  const get = useCallback((key: string): T | null => {
    const entry = cache.current.get(key);
    
    if (!entry) {
      setCacheStats(prev => ({ ...prev, misses: prev.misses + 1 }));
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > config.ttl) {
      cache.current.delete(key);
      setCacheStats(prev => ({ ...prev, misses: prev.misses + 1, size: cache.current.size }));
      return null;
    }

    entry.hits++;
    setCacheStats(prev => ({ ...prev, hits: prev.hits + 1 }));
    return entry.data;
  }, [config.ttl]);

  const set = useCallback((key: string, data: T): void => {
    // Evict least recently used if cache is full
    if (cache.current.size >= config.maxSize) {
      const lruKey = Array.from(cache.current.entries())
        .sort((a, b) => a[1].hits - b[1].hits)[0][0];
      cache.current.delete(lruKey);
    }

    cache.current.set(key, { data, timestamp: Date.now(), hits: 0 });
    setCacheStats(prev => ({ ...prev, size: cache.current.size }));
  }, [config.maxSize]);

  const clear = useCallback((): void => {
    cache.current.clear();
    setCacheStats({ hits: 0, misses: 0, size: 0 });
  }, []);

  return { get, set, clear, stats: cacheStats };
}

/**
 * Performance monitoring hook
 */
export function usePerformanceMonitoring() {
  const [metrics, setMetrics] = useState<Partial<PerformanceMetrics>>({});
  const [isOptimized, setIsOptimized] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('performance' in window)) {
      return;
    }

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
          setMetrics(prev => ({ ...prev, firstContentfulPaint: entry.startTime }));
        }
        if (entry.entryType === 'largest-contentful-paint') {
          setMetrics(prev => ({ ...prev, largestContentfulPaint: entry.startTime }));
        }
        if (entry.entryType === 'first-input') {
          setMetrics(prev => ({ ...prev, firstInputDelay: (entry as any).processingStart - entry.startTime }));
        }
        if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
          setMetrics(prev => ({
            ...prev,
            cumulativeLayoutShift: (prev.cumulativeLayoutShift || 0) + (entry as any).value
          }));
        }
      }
    });

    try {
      observer.observe({ entryTypes: ['paint', 'largest-contentful-paint', 'first-input', 'layout-shift'] });
    } catch (e) {
      console.warn('Performance monitoring not fully supported');
    }

    // Check Core Web Vitals thresholds
    const checkOptimization = () => {
      const isGood = 
        (metrics.largestContentfulPaint || 0) < 2500 &&
        (metrics.firstInputDelay || 0) < 100 &&
        (metrics.cumulativeLayoutShift || 0) < 0.1;
      
      setIsOptimized(isGood);
    };

    const timer = setTimeout(checkOptimization, 5000);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [metrics]);

  return { metrics, isOptimized };
}

/**
 * Request deduplication hook
 */
export function useRequestDeduplication() {
  const pendingRequests = useRef(new Map<string, Promise<any>>());

  const dedupedFetch = useCallback(async <T,>(key: string, fetcher: () => Promise<T>): Promise<T> => {
    // Return existing promise if request is already in flight
    if (pendingRequests.current.has(key)) {
      return pendingRequests.current.get(key)!;
    }

    // Create new request
    const promise = fetcher()
      .finally(() => {
        pendingRequests.current.delete(key);
      });

    pendingRequests.current.set(key, promise);
    return promise;
  }, []);

  return { dedupedFetch };
}

/**
 * Image lazy loading optimization
 */
export function useImageOptimization() {
  const [loadedImages, setLoadedImages] = useState(new Set<string>());

  const loadImage = useCallback((src: string): Promise<void> => {
    if (loadedImages.has(src)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        setLoadedImages(prev => new Set(prev).add(src));
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  }, [loadedImages]);

  const preloadImages = useCallback((urls: string[]): Promise<void[]> => {
    return Promise.all(urls.map(loadImage));
  }, [loadImage]);

  return { loadImage, preloadImages, isLoaded: (src: string) => loadedImages.has(src) };
}

/**
 * Debounce hook for performance
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Throttle hook for performance
 */
export function useThrottle<T>(value: T, limit: number = 500): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastRan = useRef(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= limit) {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }
    }, limit - (Date.now() - lastRan.current));

    return () => {
      clearTimeout(handler);
    };
  }, [value, limit]);

  return throttledValue;
}

/**
 * Virtual scrolling hook
 */
export function useVirtualScroll(itemCount: number, itemHeight: number, containerHeight: number) {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleEnd = Math.min(itemCount, Math.ceil((scrollTop + containerHeight) / itemHeight));
  
  const offsetY = visibleStart * itemHeight;
  const visibleItems = Array.from({ length: visibleEnd - visibleStart }, (_, i) => visibleStart + i);

  return {
    visibleItems,
    offsetY,
    totalHeight: itemCount * itemHeight,
    onScroll: (e: React.UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop)
  };
}

/**
 * Code splitting with dynamic imports
 */
export function useDynamicImport<T>(importFunc: () => Promise<{ default: T }>) {
  const [component, setComponent] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    importFunc()
      .then(module => {
        setComponent(module.default);
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, [importFunc]);

  return { component, loading, error };
}

/**
 * Main performance optimization hook
 */
export function usePerformanceOptimization() {
  const { metrics, isOptimized } = usePerformanceMonitoring();
  const cache = useAdvancedCache({ ttl: 3600000, maxSize: 100 });
  const { dedupedFetch } = useRequestDeduplication();
  const imageOptimization = useImageOptimization();

  return {
    metrics,
    isOptimized,
    cache,
    dedupedFetch,
    imageOptimization
  };
}

export default usePerformanceOptimization;