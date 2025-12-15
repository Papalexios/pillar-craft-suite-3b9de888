// 🎣 CUSTOM HOOK: Sitemap Crawler State Management

import { useState, useCallback } from 'react';
import { crawlSitemap, CrawledPage } from '../services/sitemap-service';

export function useSitemapCrawler() {
  const [pages, setPages] = useState<CrawledPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  const crawl = useCallback(async (sitemapUrl: string) => {
    setIsLoading(true);
    setError(null);
    setProgress('Initializing crawler...');

    try {
      const result = await crawlSitemap(sitemapUrl, (message) => {
        setProgress(message);
      });

      setPages(result);
      setProgress(`Successfully crawled ${result.length} pages`);
      return result;
    } catch (err: any) {
      const errorMessage = err?.message || 'Unknown error occurred';
      setError(errorMessage);
      setProgress(`Error: ${errorMessage}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setPages([]);
    setError(null);
    setProgress('');
  }, []);

  return {
    pages,
    isLoading,
    error,
    progress,
    crawl,
    reset,
    setPages
  };
}
