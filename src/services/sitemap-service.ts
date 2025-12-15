// 🚀 SITEMAP SERVICE - Unified Crawler Integration
// Integrates sitemap-crawler-fixed.ts with App.tsx

import { crawlSitemap as crawlSitemapCore, CrawlResult, CrawledPage } from '../sitemap-crawler-fixed';

export type { CrawledPage, CrawlResult };

/**
 * Main sitemap crawling service
 */
export async function crawlSitemap(
  input: string,
  onProgress?: (message: string) => void
): Promise<CrawledPage[]> {
  try {
    // Normalize input
    let url = input.trim();
    if (!url) {
      throw new Error('Empty URL provided');
    }

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    onProgress?.(`🔍 Starting crawl for: ${url}`);

    // Use the core crawler
    const result = await crawlSitemapCore(url);

    onProgress?.(`✅ Found ${result.totalFound} pages using ${result.strategy} strategy`);

    return result.pages;
  } catch (error: any) {
    console.error('Sitemap crawl error:', error);
    onProgress?.(`❌ Crawl failed: ${error.message}`);
    throw error;
  }
}

/**
 * Batch crawl multiple sitemaps
 */
export async function crawlMultipleSitemaps(
  urls: string[],
  onProgress?: (message: string) => void
): Promise<CrawledPage[]> {
  const allPages: CrawledPage[] = [];
  const seenUrls = new Set<string>();

  for (const url of urls) {
    try {
      const pages = await crawlSitemap(url, onProgress);
      
      // Deduplicate
      for (const page of pages) {
        if (!seenUrls.has(page.url)) {
          seenUrls.add(page.url);
          allPages.push(page);
        }
      }
    } catch (error) {
      onProgress?.(`⚠️ Skipped ${url}: ${(error as Error).message}`);
    }
  }

  return allPages;
}

/**
 * Get SEO health statistics
 */
export function getSEOHealthStats(pages: CrawledPage[]): {
  excellent: number;
  good: number;
  fair: number;
  poor: number;
  average: number;
} {
  const stats = {
    excellent: 0,
    good: 0,
    fair: 0,
    poor: 0,
    average: 0
  };

  if (pages.length === 0) return stats;

  let totalHealth = 0;

  for (const page of pages) {
    const health = page.seoHealth || 50;
    totalHealth += health;

    if (health >= 90) stats.excellent++;
    else if (health >= 75) stats.good++;
    else if (health >= 60) stats.fair++;
    else stats.poor++;
  }

  stats.average = Math.round(totalHealth / pages.length);

  return stats;
}
