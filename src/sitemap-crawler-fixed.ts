// 🔍 SITEMAP CRAWLER v3.0 - Multi-Strategy Fallback
// Handles XML sitemaps, HTML crawling, and sitemap-less sites

export interface CrawledPage {
  url: string;
  title?: string;
  lastMod?: string;
  changeFreq?: string;
  priority?: number;
  seoHealth?: number;
}

export interface CrawlResult {
  pages: CrawledPage[];
  totalFound: number;
  strategy: 'xml-sitemap' | 'html-crawl' | 'hybrid';
  timestamp: number;
}

/**
 * Strategy 1: Try XML sitemaps (multiple variations)
 */
async function tryXMLSitemaps(domain: string): Promise<CrawledPage[]> {
  const sitemapUrls = [
    `${domain}/sitemap.xml`,
    `${domain}/sitemap_index.xml`,
    `${domain}/wp-sitemap.xml`,
    `${domain}/sitemap-index.xml`,
    `${domain}/post-sitemap.xml`,
    `${domain}/page-sitemap.xml`,
    `${domain}/sitemaps.xml`
  ];
  
  for (const sitemapUrl of sitemapUrls) {
    try {
      const response = await fetch(sitemapUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 SEO-Crawler/3.0' }
      });
      
      if (!response.ok) continue;
      
      const xml = await response.text();
      
      // Check if it's a sitemap index
      if (xml.includes('<sitemapindex')) {
        const sitemapMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
        const childPages: CrawledPage[] = [];
        
        for (const match of sitemapMatches) {
          const childSitemapUrl = match[1];
          try {
            const childResponse = await fetch(childSitemapUrl);
            const childXml = await childResponse.text();
            const childUrls = parseXMLSitemap(childXml);
            childPages.push(...childUrls);
          } catch (e) {
            console.warn('Failed to fetch child sitemap:', childSitemapUrl);
          }
        }
        
        if (childPages.length > 0) return childPages;
      }
      
      // Regular sitemap
      const urls = parseXMLSitemap(xml);
      if (urls.length > 0) return urls;
      
    } catch (error) {
      continue; // Try next sitemap
    }
  }
  
  return [];
}

/**
 * Parse XML sitemap content
 */
function parseXMLSitemap(xml: string): CrawledPage[] {
  const pages: CrawledPage[] = [];
  
  // Match URL entries
  const urlPattern = /<url[^>]*>([\s\S]*?)<\/url>/g;
  const matches = xml.matchAll(urlPattern);
  
  for (const match of matches) {
    const urlBlock = match[1];
    
    const loc = urlBlock.match(/<loc>([^<]+)<\/loc>/)?.[1];
    const lastMod = urlBlock.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    const changeFreq = urlBlock.match(/<changefreq>([^<]+)<\/changefreq>/)?.[1];
    const priority = urlBlock.match(/<priority>([^<]+)<\/priority>/)?.[1];
    
    if (loc) {
      pages.push({
        url: loc,
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
 * Strategy 2: HTML link extraction (fallback)
 */
async function extractHTMLLinks(domain: string): Promise<CrawledPage[]> {
  try {
    const response = await fetch(domain, {
      headers: { 'User-Agent': 'Mozilla/5.0 SEO-Crawler/3.0' }
    });
    
    if (!response.ok) return [];
    
    const html = await response.text();
    const pages: CrawledPage[] = [];
    const seenUrls = new Set<string>();
    
    // Extract from <a href> tags
    const hrefPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let match;
    
    while ((match = hrefPattern.exec(html)) !== null) {
      let url = match[1];
      
      // Skip non-HTTP links
      if (url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('mailto:') || url.startsWith('tel:')) {
        continue;
      }
      
      // Convert relative URLs to absolute
      if (url.startsWith('/')) {
        url = domain + url;
      } else if (!url.startsWith('http')) {
        url = domain + '/' + url;
      }
      
      // Only include same-domain links
      if (url.startsWith(domain) && !seenUrls.has(url)) {
        seenUrls.add(url);
        
        // Try to extract title from link text
        const titleMatch = match[0].match(/>([^<]+)</)?.[1];
        
        pages.push({
          url,
          title: titleMatch?.trim(),
          seoHealth: calculateSEOHealth(url)
        });
      }
    }
    
    // Also extract from src attributes (images, scripts, etc.)
    const srcPattern = /<(?:img|script|link)[^>]+(?:src|href)=["']([^"']+)["'][^>]*>/gi;
    while ((match = srcPattern.exec(html)) !== null) {
      let url = match[1];
      
      if (url.startsWith('/')) {
        url = domain + url;
      }
      
      if (url.startsWith(domain) && !seenUrls.has(url)) {
        seenUrls.add(url);
        pages.push({
          url,
          seoHealth: calculateSEOHealth(url)
        });
      }
    }
    
    return pages;
    
  } catch (error) {
    console.error('HTML extraction failed:', error);
    return [];
  }
}

/**
 * Calculate basic SEO health score
 */
function calculateSEOHealth(url: string, lastMod?: string, priority?: string): number {
  let score = 50; // Base score
  
  // URL structure points
  if (url.split('/').length <= 5) score += 10; // Not too deep
  if (!url.includes('?')) score += 10; // No query params
  if (url.length < 100) score += 10; // Reasonable length
  if (url.match(/[a-z-]+/)) score += 5; // Uses hyphens
  
  // Recency points
  if (lastMod) {
    const modDate = new Date(lastMod);
    const daysSince = (Date.now() - modDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 30) score += 15;
    else if (daysSince < 90) score += 10;
    else if (daysSince < 180) score += 5;
  }
  
  // Priority points
  if (priority) {
    const pri = parseFloat(priority);
    if (pri >= 0.8) score += 10;
    else if (pri >= 0.5) score += 5;
  }
  
  return Math.min(100, score);
}

/**
 * Main crawler function with fallback strategies
 */
export async function crawlSitemap(domain: string): Promise<CrawlResult> {
  // Normalize domain
  domain = domain.replace(/\/$/, ''); // Remove trailing slash
  if (!domain.startsWith('http')) {
    domain = 'https://' + domain;
  }
  
  console.log('🔍 Starting multi-strategy crawl for:', domain);
  
  // Strategy 1: Try XML sitemaps
  console.log('📄 Strategy 1: Attempting XML sitemap discovery...');
  let pages = await tryXMLSitemaps(domain);
  let strategy: CrawlResult['strategy'] = 'xml-sitemap';
  
  // Strategy 2: Fallback to HTML crawling
  if (pages.length === 0) {
    console.log('🕸️ Strategy 2: Falling back to HTML link extraction...');
    pages = await extractHTMLLinks(domain);
    strategy = 'html-crawl';
  }
  
  // Deduplicate and sort by SEO health
  const uniqueUrls = new Map<string, CrawledPage>();
  pages.forEach(page => {
    if (!uniqueUrls.has(page.url)) {
      uniqueUrls.set(page.url, page);
    }
  });
  
  const finalPages = Array.from(uniqueUrls.values())
    .sort((a, b) => (b.seoHealth || 0) - (a.seoHealth || 0));
  
  console.log(`✅ Found ${finalPages.length} pages using ${strategy} strategy`);
  
  return {
    pages: finalPages,
    totalFound: finalPages.length,
    strategy,
    timestamp: Date.now()
  };
}

/**
 * Export crawl results as CSV
 */
export function exportAsCSV(result: CrawlResult): string {
  const headers = ['URL', 'Title', 'Last Modified', 'SEO Health', 'Priority'];
  const rows = result.pages.map(page => [
    page.url,
    page.title || '',
    page.lastMod || '',
    page.seoHealth?.toString() || '',
    page.priority?.toString() || ''
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}
