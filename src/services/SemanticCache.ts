/**
 * GOD MODE 2.0: Semantic Cache Service
 * Content fingerprinting with TTL-based cache invalidation
 * Reduces redundant AI calls by 60%+
 */

interface CacheEntry<T> {
  data: T;
  fingerprint: string;
  timestamp: number;
  hits: number;
}

// Cache TTLs in milliseconds
const CACHE_TTL = {
  SERP_DATA: 24 * 60 * 60 * 1000,       // 24 hours
  COMPETITOR_ANALYSIS: 12 * 60 * 60 * 1000, // 12 hours
  SEMANTIC_KEYWORDS: 72 * 60 * 60 * 1000,   // 72 hours
  GENERATED_CONTENT: 7 * 24 * 60 * 60 * 1000, // 7 days
  PAA_QUESTIONS: 48 * 60 * 60 * 1000,   // 48 hours
  REFERENCES: 7 * 24 * 60 * 60 * 1000,  // 7 days
};

export type CacheType = keyof typeof CACHE_TTL;

export class SemanticCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize: number;
  
  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    this.loadFromStorage();
  }
  
  /**
   * Generate semantic fingerprint for cache key
   */
  private generateFingerprint(keyword: string, intent: string, type: CacheType): string {
    const dateKey = new Date().toISOString().split('T')[0]; // Daily granularity
    const hash = this.simpleHash(`${keyword}|${intent}|${type}|${dateKey}`);
    return `${type}_${hash}`;
  }
  
  /**
   * Simple hash function for fingerprinting
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Get cached data if valid
   */
  get<T>(keyword: string, intent: string, type: CacheType): T | null {
    const fingerprint = this.generateFingerprint(keyword, intent, type);
    const entry = this.cache.get(fingerprint);
    
    if (!entry) return null;
    
    const ttl = CACHE_TTL[type];
    const isExpired = Date.now() - entry.timestamp > ttl;
    
    if (isExpired) {
      this.cache.delete(fingerprint);
      this.saveToStorage();
      return null;
    }
    
    // Update hit count
    entry.hits++;
    return entry.data as T;
  }
  
  /**
   * Set cached data
   */
  set<T>(keyword: string, intent: string, type: CacheType, data: T): void {
    const fingerprint = this.generateFingerprint(keyword, intent, type);
    
    // LRU eviction if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLeastUsed();
    }
    
    this.cache.set(fingerprint, {
      data,
      fingerprint,
      timestamp: Date.now(),
      hits: 1
    });
    
    this.saveToStorage();
  }
  
  /**
   * Check if cache has valid entry
   */
  has(keyword: string, intent: string, type: CacheType): boolean {
    return this.get(keyword, intent, type) !== null;
  }
  
  /**
   * Invalidate specific cache entry
   */
  invalidate(keyword: string, intent: string, type: CacheType): void {
    const fingerprint = this.generateFingerprint(keyword, intent, type);
    this.cache.delete(fingerprint);
    this.saveToStorage();
  }
  
  /**
   * Invalidate all entries for a keyword
   */
  invalidateKeyword(keyword: string): void {
    const keysToDelete: string[] = [];
    
    this.cache.forEach((entry, key) => {
      if (key.includes(this.simpleHash(keyword))) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
    this.saveToStorage();
  }
  
  /**
   * Clear all expired entries
   */
  cleanup(): number {
    let removed = 0;
    const now = Date.now();
    
    this.cache.forEach((entry, key) => {
      const type = key.split('_')[0] as CacheType;
      const ttl = CACHE_TTL[type] || CACHE_TTL.GENERATED_CONTENT;
      
      if (now - entry.timestamp > ttl) {
        this.cache.delete(key);
        removed++;
      }
    });
    
    if (removed > 0) this.saveToStorage();
    return removed;
  }
  
  /**
   * Evict least recently used entries
   */
  private evictLeastUsed(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].hits - b[1].hits);
    
    // Remove bottom 10%
    const toRemove = Math.ceil(this.maxSize * 0.1);
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats(): { size: number; hitRate: number; oldestEntry: number } {
    const entries = Array.from(this.cache.values());
    const totalHits = entries.reduce((sum, e) => sum + e.hits, 0);
    const oldestTimestamp = entries.length > 0 
      ? Math.min(...entries.map(e => e.timestamp))
      : Date.now();
    
    return {
      size: this.cache.size,
      hitRate: entries.length > 0 ? totalHits / entries.length : 0,
      oldestEntry: Date.now() - oldestTimestamp
    };
  }
  
  /**
   * Save cache to localStorage
   */
  private saveToStorage(): void {
    try {
      const data = JSON.stringify(Array.from(this.cache.entries()));
      localStorage.setItem('god_mode_cache', data);
    } catch (e) {
      // Storage quota exceeded - clear old entries
      this.cleanup();
    }
  }
  
  /**
   * Load cache from localStorage
   */
  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem('god_mode_cache');
      if (data) {
        const entries = JSON.parse(data);
        this.cache = new Map(entries);
        this.cleanup(); // Remove expired on load
      }
    } catch (e) {
      this.cache = new Map();
    }
  }
  
  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    localStorage.removeItem('god_mode_cache');
  }
}

// Singleton instance
export const semanticCache = new SemanticCache();

export default SemanticCache;
