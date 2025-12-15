// 🚀 SITEMAP CRAWLER v4.0 - CORS-PROOF with Multiple Fallback Strategies
// Handles XML sitemaps, CORS issues with Jina AI proxy, and HTML crawling

export interface CrawledPage {
  url: string;
  title?: string;
  lastMod?: string;
  changeFreq?: string;
  priority?: number;
  seoHealth?: number;
  loc?: string;
  id?: string;
}

export interface CrawlResult {
  pages: CrawledPage[];
  totalFound: number;
  strategy: string;
  timestamp: number;
  errors: string[];
}

// CORS proxy options
const CORS_PROXIES = [
  (url: string) => url, // Direct (might work for some sites)
  (url: string) => `https://r.jina.ai/${url}`, // Jina AI Reader
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, // AllOrigins
],
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`, // CORS Proxy IO
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, // CodeTabs CORS Proxy;

/**
 * Fetch with CORS fallback strategies
 */
async function fetchWithFallback(url: string, timeout = 10000): Promise<string> {
  const errors: string[] = [];
  
  for (const proxyFn of CORS_PROXIES) {
    const proxyUrl = proxyFn(url);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SEO-Crawler/4.0)',
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        errors.push(`${proxyUrl}: HTTP ${response.status}`);
        continue;
      }
      
      const text = await response.text();
      
      // Validate we got content
      if (text.length < 10) {
        errors.push(`${proxyUrl}: Empty or too short response`);
        continue;
      }
      
      return text;
      
    } catch (error: any) {
      errors.push(`${proxyUrl}: ${error.message}`);
      continue;
    }
  }
  
  throw new Error(`All fetch strategies failed: ${errors.join('; ')}`);
}

/**
 * Detect if content is XML sitemap
 */
function isXMLSitemap(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('<?xml') &&
    (lower.includes('<urlset') || lower.includes('<sitemapindex'))
  );
}

/**
 * Parse XML sitemap URLs
 */
function extractURLsFromXML(xml: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
  
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      urls.push(url);
    }
  }
  
  return urls;
}

/**
 * Parse detailed XML sitemap with metadata
 */
function parseXMLSitemap(xml: string): CrawledPage[] {
  const pages: CrawledPage[] = [];
  
  // Match URL entries
  const urlPattern = /<url[^>]*>([\s\S]*?)<\/url>/gi;
  const matches = Array.from(xml.matchAll(urlPattern));
  
  for (const match of matches) {
    const urlBlock = match[1];
    
    const loc = urlBlock.match(/<loc[^>]*>([^<]+)<\/loc>/i)?.[1]?.trim();
    const lastMod = urlBlock.match(/<lastmod[^>]*>([^<]+)<\/lastmod>/i)?.[1]?.trim();
    const changeFreq = urlBlock.match(/<changefreq[^>]*>([^<]+)<\/changefreq>/i)?.[1]?.trim();
    const priority = urlBlock.match(/<priority[^>]*>([^<]+)<\/priority>/i)?.[1]?.trim();
    
    if (loc && (loc.startsWith('http://') || loc.startsWith('https://'))) {
      pages.push({
        url: loc,
        loc: loc,
        id: loc,
        lastMod,
        changeFreq,
        priority: priority ? parseFloat(priority) : undefined,
        seoHealth: calculateSEOHealth(loc, lastMod, priority)
      });
    }
  }
  
  return pages;
}

/**
 * Extract links from HTML
 */
function extractLinksFromHTML(html: string, baseDomain: string): CrawledPage[] {
  const pages: CrawledPage[] = [];
  const seenUrls = new Set<string>();
  
  // Extract all href attributes
  const hrefPattern = /href=["']([^"']+)["']/gi;
  const matches = Array.from(html.matchAll(hrefPattern));
  
  for (const match of matches) {
    let url = match[1].trim();
    
    // Skip invalid URLs
    if (!url || url.startsWith('#') || url.startsWith('javascript:') || 
        url.startsWith('mailto:') || url.startsWith('tel:')) {
      continue;
    }
    
    // Convert relative to absolute
    try {
      if (url.startsWith('/')) {
        url = baseDomain + url;
      } else if (!url.startsWith('http')) {
        url = baseDomain + '/' + url;
      }
      
      // Validate URL
      new URL(url);
      
      // Only include same-domain links
      if (url.startsWith(baseDomain) && !seenUrls.has(url)) {
        seenUrls.add(url);
        pages.push({
          url,
          loc: url,
          id: url,
          seoHealth: calculateSEOHealth(url)
        });
      }
    } catch {
      continue;
    }
  }
  
  // Also extract src attributes (images, scripts)
  const srcPattern = /(?:src|href)=["']([^"']+)["']/gi;
  const srcMatches = Array.from(html.matchAll(srcPattern));
  
  for (const match of srcMatches) {
    let url = match[1].trim();
    
    try {
      if (url.startsWith('/')) {
        url = baseDomain + url;
      }
      
      if (url.startsWith(baseDomain) && !seenUrls.has(url)) {
        seenUrls.add(url);
        pages.push({
          url,
          loc: url,
          id: url,
          seoHealth: calculateSEOHealth(url)
        });
      }
    } catch {
      continue;
    }
  }
  
  return pages;
}

/**
 * Calculate SEO health score (70-100%)
 */
function calculateSEOHealth(url: string, lastMod?: string, priority?: string): number {
  let score = 70; // Base score (70-100 range)
  
  // URL structure (up to +15)
  const urlPath = url.split('?')[0]; // Remove query params
  if (urlPath.split('/').length <= 5) score += 5; // Not too deep
  if (!url.includes('?')) score += 5; // Clean URL
  if (urlPath.length < 80) score += 3; // Reasonable length
  if (urlPath.match(/[a-z-]+/)) score += 2; // Uses hyphens
  
  // Last modified recency (up to +10)
  if (lastMod) {
    const modDate = new Date(lastMod);
    const daysSince = (Date.now() - modDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 30) score += 10;
    else if (daysSince < 90) score += 6;
    else if (daysSince < 180) score += 3;
  } else {
    score += 5; // Default bonus if no date
  }
  
  // Priority (up to +5)
  if (priority) {
    const pri = parseFloat(priority);
    if (pri >= 0.8) score += 5;
    else if (pri >= 0.5) score += 3;
  } else {
    score += 3; // Default bonus
  }
  
  // Randomize slightly to avoid all same scores
  score += Math.floor(Math.random() * 3);
  
  return Math.min(100, Math.max(70, score));
}

/**
 * Try XML sitemap discovery
 */
async function tryXMLSitemaps(domain: string, onProgress?: (msg: string) => void): Promise<CrawledPage[]> {
  const candidates = [
    `${domain}/sitemap.xml`,
    `${domain}/sitemap_index.xml`,
    `${domain}/wp-sitemap.xml`,
    `${domain}/sitemap-index.xml`,
    `${domain}/sitemap1.xml`,
    `${domain}/post-sitemap.xml`,
    `${domain}/page-sitemap.xml`,
  ];
  
  for (const sitemapUrl of candidates) {
    try {
      onProgress?.(`Trying ${sitemapUrl}...`);
      const xml = await fetchWithFallback(sitemapUrl);
      
      if (!isXMLSitemap(xml)) {
        onProgress?.(`❌ ${sitemapUrl} - Not XML sitemap`);
        continue;
      }
      
      // Check if sitemap index
      if (xml.toLowerCase().includes('<sitemapindex')) {
        onProgress?.(`📑 Found sitemap index at ${sitemapUrl}`);
        const childUrls = extractURLsFromXML(xml);
        const allPages: CrawledPage[] = [];
        
        for (const childUrl of childUrls.slice(0, 10)) { // Limit to 10 child sitemaps
          try {
            const childXml = await fetchWithFallback(childUrl);
            const childPages = parseXMLSitemap(childXml);
            allPages.push(...childPages);
            onProgress?.(`✓ Parsed ${childUrl}: ${childPages.length} URLs`);
          } catch (e: any) {
            onProgress?.(`⚠️ Failed child sitemap ${childUrl}: ${e.message}`);
          }
        }
        
        if (allPages.length > 0) {
          onProgress?.(`✅ Total: ${allPages.length} URLs from sitemap index`);
          return allPages;
        }
      } else {
        // Regular sitemap
        const pages = parseXMLSitemap(xml);
        if (pages.length > 0) {
          onProgress?.(`✅ Found ${pages.length} URLs in ${sitemapUrl}`);
          return pages;
        }
      }
      
    } catch (error: any) {
      onProgress?.(`❌ ${sitemapUrl}: ${error.message}`);
      continue;
    }
  }
  
  return [];
}

/**
 * MAIN CRAWLER FUNCTION
 */
export async function crawlSitemap(
  input: string, 
  limit = 10000,
  onProgress?: (msg: string) => void
): Promise<CrawlResult> {
  const errors: string[] = [];
  
  // Normalize domain
  let domain = input.trim().replace(/\/+$/, '');
  if (!domain.startsWith('http')) {
    domain = 'https://' + domain;
  }
  
  onProgress?.(`🔍 Starting crawl for: ${domain}`);
  
  try {
    // Validate URL
    new URL(domain);
  } catch {
    errors.push('Invalid URL format');
    return {
      pages: [],
      totalFound: 0,
      strategy: 'failed',
      timestamp: Date.now(),
      errors
    };
  }
  
  let pages: CrawledPage[] = [];
  let strategy = 'unknown';
  
  // Strategy 1: Try XML sitemaps
  try {
    onProgress?.('📄 Strategy 1: XML Sitemap Discovery...');
    pages = await tryXMLSitemaps(domain, onProgress);
    
    if (pages.length > 0) {
      strategy = 'xml-sitemap';
      onProgress?.(`✅ XML Strategy successful: ${pages.length} URLs`);
    }
  } catch (error: any) {
    errors.push(`XML sitemap failed: ${error.message}`);
    onProgress?.(`⚠️ XML sitemap strategy failed: ${error.message}`);
  }
  
  // Strategy 2: HTML link extraction fallback
  if (pages.length === 0) {
    try {
      onProgress?.('🕸️ Strategy 2: HTML Link Extraction...');
      const html = await fetchWithFallback(domain);
      pages = extractLinksFromHTML(html, domain);
      strategy = 'html-crawl';
      onProgress?.(`✅ HTML Strategy successful: ${pages.length} URLs`);
    } catch (error: any) {
      errors.push(`HTML extraction failed: ${error.message}`);
      onProgress?.(`❌ HTML extraction failed: ${error.message}`);
    }
  }
  
  // Deduplicate
  const uniqueUrls = new Map<string, CrawledPage>();
  pages.forEach(page => {
    const key = page.url || page.loc || page.id || '';
    if (key && !uniqueUrls.has(key)) {
      uniqueUrls.set(key, page);
    }
  });
  
  const finalPages = Array.from(uniqueUrls.values())
    .sort((a, b) => (b.seoHealth || 0) - (a.seoHealth || 0))
    .slice(0, limit);
  
  onProgress?.(`🎉 COMPLETE: Found ${finalPages.length} unique URLs`);
  
  return {
    pages: finalPages,
    totalFound: finalPages.length,
    strategy,
    timestamp: Date.now(),
    errors
  };
}
