import { fetchWithProxies } from './contentUtils';
import { SitemapPage } from './types';

/**
 * ULTRA SOTA SITEMAP PARSER v2.0
 * Multi-strategy XML fetching with proper parsing
 */

export async function parseSitemapXml(sitemapUrl: string): Promise<SitemapPage[]> {
    try {
        console.log(`[Sitemap Parser] Fetching: ${sitemapUrl}`);
        
        // Use our enhanced fetchWithProxies which has XML-specific strategies
        const response = await fetchWithProxies(sitemapUrl);
        const xmlText = await response.text();
        
        console.log(`[Sitemap Parser] Received ${xmlText.length} bytes`);
        
        // Parse XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // Check for parser errors
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            throw new Error(`XML Parse Error: ${parserError.textContent}`);
        }
        
        // Check if this is a sitemap index (contains other sitemaps)
        const sitemapElements = xmlDoc.getElementsByTagName('sitemap');
        if (sitemapElements.length > 0) {
            console.log(`[Sitemap Parser] Found sitemap index with ${sitemapElements.length} nested sitemaps`);
            return await parseSitemapIndex(xmlDoc, sitemapUrl);
        }
        
        // Regular sitemap with URLs
        return parseUrlSet(xmlDoc);
        
    } catch (error: any) {
        console.error(`[Sitemap Parser] Error:`, error);
        throw new Error(`Failed to parse sitemap: ${error.message}`);
    }
}

async function parseSitemapIndex(xmlDoc: Document, baseUrl: string): Promise<SitemapPage[]> {
    const sitemapElements = Array.from(xmlDoc.getElementsByTagName('sitemap'));
    const allPages: SitemapPage[] = [];
    
    // Limit to first 3 nested sitemaps to avoid overwhelming
    const sitemapsToProcess = sitemapElements.slice(0, 3);
    
    for (const sitemapEl of sitemapsToProcess) {
        const locElement = sitemapEl.getElementsByTagName('loc')[0];
        if (!locElement) continue;
        
        const nestedUrl = locElement.textContent?.trim();
        if (!nestedUrl) continue;
        
        try {
            console.log(`[Sitemap Parser] Processing nested sitemap: ${nestedUrl}`);
            const nestedPages = await parseSitemapXml(nestedUrl);
            allPages.push(...nestedPages);
            
            // Stop if we have enough pages
            if (allPages.length >= 100) break;
        } catch (err) {
            console.warn(`[Sitemap Parser] Failed to parse nested sitemap: ${nestedUrl}`, err);
            // Continue with other sitemaps
        }
    }
    
    return allPages;
}

function parseUrlSet(xmlDoc: Document): SitemapPage[] {
    const urlElements = Array.from(xmlDoc.getElementsByTagName('url'));
    
    if (urlElements.length === 0) {
        console.warn('[Sitemap Parser] No <url> elements found');
        return [];
    }
    
    console.log(`[Sitemap Parser] Found ${urlElements.length} URLs`);
    
    const pages: SitemapPage[] = [];
    
    for (const urlEl of urlElements) {
        const locElement = urlEl.getElementsByTagName('loc')[0];
        if (!locElement) continue;
        
        const url = locElement.textContent?.trim();
        if (!url) continue;
        
        // Extract title from URL (fallback)
        const urlPath = new URL(url).pathname;
        const slug = urlPath.split('/').filter(s => s).pop() || '';
        const title = slug
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim();
        
        // Get last modified date if available
        const lastmodElement = urlEl.getElementsByTagName('lastmod')[0];
        const lastModified = lastmodElement?.textContent?.trim() || undefined;
        
        pages.push({
            id: url,
            url: url,
            title: title || url,
            slug: slug,
            lastModified: lastModified,
            status: 'pending'
        });
    }
    
    return pages;
}

/**
 * Main entry point for sitemap crawling
 * @param sitemapUrl - URL to the sitemap (e.g., https://example.com/sitemap.xml)
 * @returns Array of pages found in the sitemap
 */
export async function crawlSitemap(sitemapUrl: string): Promise<SitemapPage[]> {
    // Validate URL
    if (!sitemapUrl || !sitemapUrl.trim()) {
        throw new Error('Sitemap URL is required');
    }
    
    // Ensure URL has protocol
    let url = sitemapUrl.trim();
    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }
    
    // Try to parse sitemap
    try {
        const pages = await parseSitemapXml(url);
        console.log(`[Sitemap Crawler] Successfully parsed ${pages.length} pages`);
        return pages;
    } catch (error: any) {
        console.error('[Sitemap Crawler] Failed to crawl sitemap:', error);
        
        // Try common sitemap locations if URL doesn't work
        if (!url.includes('sitemap')) {
            const commonPaths = [
                '/sitemap.xml',
                '/sitemap_index.xml',
                '/wp-sitemap.xml',
                '/sitemap-index.xml'
            ];
            
            const baseUrl = new URL(url).origin;
            
            for (const path of commonPaths) {
                try {
                    console.log(`[Sitemap Crawler] Trying: ${baseUrl}${path}`);
                    const pages = await parseSitemapXml(baseUrl + path);
                    if (pages.length > 0) {
                        console.log(`[Sitemap Crawler] Success with ${baseUrl}${path}`);
                        return pages;
                    }
                } catch (err) {
                    // Continue to next path
                }
            }
        }
        
        throw error;
    }
}
