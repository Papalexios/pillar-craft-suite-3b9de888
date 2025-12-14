import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import React from 'react';
import { PROMPT_TEMPLATES } from './prompts';
import { AI_MODELS, TARGET_MIN_WORDS, TARGET_MAX_WORDS } from './constants';
import {
    ApiClients, ContentItem, ExpandedGeoTargeting, GeneratedContent, GenerationContext, SiteInfo, SitemapPage, WpConfig, GapAnalysisSuggestion
} from './types';
import {
    apiCache,
    callAiWithRetry,
    extractSlugFromUrl,
    fetchWordPressWithRetry,
    processConcurrently,
    parseJsonWithAiRepair,
    lazySchemaGeneration,
    validateAndFixUrl,
    serverGuard
} from './utils';
import { getNeuronWriterAnalysis, formatNeuronDataForPrompt } from "./neuronwriter";
import { getGuaranteedYoutubeVideos, enforceWordCount, normalizeGeneratedContent, postProcessGeneratedHtml, performSurgicalUpdate, processInternalLinks, fetchWithProxies, smartCrawl, escapeRegExp } from "./contentUtils";
import { Buffer } from 'buffer';
import { generateFullSchema, generateSchemaMarkup } from "./schema-generator";

const CURRENT_YEAR = 2026;

// SOTA: Serper API Quota Tracker
let SERPER_CALLS_TODAY = 0;
const MAX_DAILY_SERPER_CALLS = 2400; // Safety buffer (2500 limit)
const SERPER_QUOTA_KEY = 'serper_quota_date';
const SERPER_COUNT_KEY = 'serper_calls_count';

const checkSerperQuota = (): { allowed: boolean; remaining: number; warning: string } => {
    const today = new Date().toDateString();
    const lastDate = localStorage.getItem(SERPER_QUOTA_KEY);
    
    if (lastDate !== today) {
        localStorage.setItem(SERPER_QUOTA_KEY, today);
        localStorage.setItem(SERPER_COUNT_KEY, '0');
        SERPER_CALLS_TODAY = 0;
    } else {
        SERPER_CALLS_TODAY = parseInt(localStorage.getItem(SERPER_COUNT_KEY) || '0');
    }
    
    const remaining = MAX_DAILY_SERPER_CALLS - SERPER_CALLS_TODAY;
    let warning = '';
    
    if (remaining < 100) {
        warning = `⚠️ SERPER API CRITICAL: Only ${remaining} calls left today!`;
    } else if (remaining < 500) {
        warning = `⚠️ SERPER API WARNING: ${remaining} calls remaining today`;
    }
    
    return {
        allowed: SERPER_CALLS_TODAY < MAX_DAILY_SERPER_CALLS,
        remaining,
        warning
    };
};

const incrementSerperCount = () => {
    SERPER_CALLS_TODAY++;
    localStorage.setItem(SERPER_COUNT_KEY, SERPER_CALLS_TODAY.toString());
};

class SotaAIError extends Error {
    constructor(
        public code: 'INVALID_PARAMS' | 'EMPTY_RESPONSE' | 'RATE_LIMIT' | 'AUTH_FAILED',
        message: string
    ) {
        super(message);
        this.name = 'SotaAIError';
    }
}

const surgicalSanitizer = (html: string): string => {
    if (!html) return "";
    let cleanHtml = html
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
    cleanHtml = cleanHtml.replace(/^\s*<h1.*?>.*?<\/h1>/i, ''); 
    cleanHtml = cleanHtml.replace(/^\s*\[.*?\]\(.*?\)/, ''); 
    cleanHtml = cleanHtml.replace(/Protocol Active: v\d+\.\d+/gi, '');
    cleanHtml = cleanHtml.replace(/REF: GUTF-Protocol-[a-z0-9]+/gi, '');
    cleanHtml = cleanHtml.replace(/Lead Data Scientist[\s\S]*?Latest Data Audit.*?(<\/p>|<br>|\n)/gi, '');
    cleanHtml = cleanHtml.replace(/Verification Fact-Checked/gi, '');
    return cleanHtml.trim();
};

const fetchRecentNews = async (keyword: string, serperApiKey: string) => {
    if (!serperApiKey) return null;
    const quota = checkSerperQuota();
    if (!quota.allowed) return null;
    
    try {
        incrementSerperCount();
        const response = await fetchWithProxies("https://google.serper.dev/news", {
            method: 'POST',
            headers: { 'X-API-KEY': serperApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: keyword, tbs: "qdr:m", num: 3 })
        });
        const data = await response.json();
        if (data.news && data.news.length > 0) {
            return data.news.map((n: any) => `- ${n.title} (${n.source}) - ${n.date}`).join('\n');
        }
        return null;
    } catch (e) { return null; }
};

const fetchPAA = async (keyword: string, serperApiKey: string) => {
    if (!serperApiKey) return null;
    const quota = checkSerperQuota();
    if (!quota.allowed) return null;
    
    try {
        incrementSerperCount();
        const response = await fetchWithProxies("https://google.serper.dev/search", {
            method: 'POST',
            headers: { 'X-API-KEY': serperApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: keyword, type: 'search' }) 
        });
        const data = await response.json();
        if (data.peopleAlsoAsk && Array.isArray(data.peopleAlsoAsk)) {
            return data.peopleAlsoAsk.map((item: any) => item.question).slice(0, 6);
        }
        return null;
    } catch (e) { return null; }
};

// ... (keeping all the existing helper functions exactly as they are)
// ... (fetchVerifiedReferences, analyzeCompetitors, etc. - all remain unchanged)
// ... (continuing from line 100+, keeping all functions identical)

// ============================================================================
// SOTA MAINTENANCE ENGINE: USER URL PRIORITIZATION + SMART SKIP + REFERENCES
// ============================================================================

export class MaintenanceEngine {
    private isRunning: boolean = false;
    public logCallback: (msg: string) => void;
    private currentContext: GenerationContext | null = null;
    private priorityUrls: string[] = [];

    constructor(logCallback: (msg: string) => void) {
        this.logCallback = logCallback;
    }

    updateContext(context: GenerationContext) {
        this.currentContext = context;
    }

    setPriorityUrls(urls: string[]) {
        this.priorityUrls = urls;
        this.logCallback(`🎯 Priority URLs Updated: ${urls.length} targets set`);
    }

    stop() {
        this.isRunning = false;
        this.logCallback("🛑 God Mode Stopping... Finishing current task.");
    }

    async start(context: GenerationContext) {
        this.currentContext = context;
        if (this.isRunning) return;

        this.isRunning = true;
        this.logCallback("🚀 God Mode Activated: Engine Cold Start...");

        if (!context.apiClients || !context.apiClients[context.selectedModel as keyof typeof context.apiClients]) {
            this.logCallback("❌ CRITICAL ERROR: AI API Client not initialized!");
            this.logCallback(`🔧 REQUIRED: Configure ${context.selectedModel.toUpperCase()} API key in Settings`);
            this.logCallback("🛑 STOPPING: God Mode requires a valid AI API client");
            this.isRunning = false;
            return;
        }

        const quota = checkSerperQuota();
        if (quota.warning) {
            this.logCallback(quota.warning);
        }

        const userTargets = this.getUserTargetUrls();

        if (this.currentContext.existingPages.length === 0 && userTargets.length === 0) {
            if (this.currentContext.wpConfig.url) {
                 this.logCallback("⚠️ NO CONTENT: God Mode requires either a sitemap crawl or user-specified target URLs.");
                 this.logCallback("🛑 STOPPING: Crawl sitemap or add URLs in the URL Targeting Engine.");
                 this.isRunning = false;
                 return;
             }
        }

        if (userTargets.length > 0) {
            this.logCallback(`🎯 URL Targeting Engine ACTIVE: ${userTargets.length} user-selected URL(s) will be processed FIRST.`);
        }

        while (this.isRunning) {
            if (!this.currentContext) break;
            try {
                const pages = await this.getPrioritizedPages(this.currentContext);
                if (pages.length === 0) {
                     this.logCallback(`💤 All pages up to date. Sleeping 60s...`);
                    await this.sleep(60000);
                    continue;
                }
                const targetPage = pages[0];
                
                const lastOptimization = localStorage.getItem(`sota_last_proc_${targetPage.id}`);
                const sitemapDate = targetPage.lastMod ? new Date(targetPage.lastMod).getTime() : 0;
                const lastOptDate = lastOptimization ? parseInt(lastOptimization) : 0;

                if (sitemapDate > 0 && lastOptDate > sitemapDate) {
                    this.logCallback(`⏭️ Skipping "${targetPage.title}" - Content unchanged since last optimization.`);
                    localStorage.setItem(`sota_last_proc_${targetPage.id}`, Date.now().toString());
                    continue;
                }

                this.logCallback(`🎯 Target Acquired: "${targetPage.title}"`);
                try {
                    await this.optimizeDOMSurgically(targetPage, this.currentContext);
                    this.logCallback("💤 Cooling down for 15 seconds...");
                    await this.sleep(15000);
                } catch (optimizeError: any) {
                    this.logCallback(`❌ Optimization failed for "${targetPage.title}": ${optimizeError.message}`);
                    this.logCallback(`📋 Error stack: ${optimizeError.stack?.substring(0, 200)}`);
                    await this.sleep(5000);
                }
            } catch (e: any) {
                this.logCallback(`❌ Fatal Error: ${e.message}`);
                this.logCallback(`🔄 Restarting in 10 seconds...`);
                await this.sleep(10000);
            }
        }
    }

    
    private getUserTargetUrls(): string[] {
        try {
            const raw = localStorage.getItem('godModeUrls');
            const arr = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(arr)) return [];
            const cleaned = arr
                .map((u: any) => String(u || '').trim())
                .filter(Boolean)
                .filter((u: string) => { try { new URL(u); return true; } catch { return false; } });
            const seen = new Set<string>();
            const out: string[] = [];
            for (const u of cleaned) {
                const norm = this.normalizeUrl(u);
                if (seen.has(norm)) continue;
                seen.add(norm);
                out.push(u);
            }
            return out;
        } catch {
            return [];
        }
    }

    private normalizeUrl(u: string): string {
        try {
            const urlObj = new URL(u);
            urlObj.hash = '';
            const s = urlObj.toString();
            return s.endsWith('/') ? s.slice(0, -1) : s;
        } catch {
            const t = (u || '').trim();
            return t.endsWith('/') ? t.slice(0, -1) : t;
        }
    }

    private async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async getPrioritizedPages(context: GenerationContext): Promise<SitemapPage[]> {
        const now = Date.now();
        const userTargets = this.getUserTargetUrls();
        const targetSet = new Set(userTargets.map(u => this.normalizeUrl(u)));

        const isTargetPage = (p: SitemapPage): boolean => targetSet.has(this.normalizeUrl(p.id));

        let candidates = [...context.existingPages];

        candidates = candidates.filter(p => {
            if (isTargetPage(p)) return true;
            
            const lastProcessed = localStorage.getItem(`sota_last_proc_${p.id}`);
            if (!lastProcessed) return true;
            const hoursSince = (now - parseInt(lastProcessed)) / (1000 * 60 * 60);
            return hoursSince > 24;
        });

        const prioritized: SitemapPage[] = [];
        const used = new Set<string>();

        if (userTargets.length > 0) {
            const byNorm = new Map(candidates.map(p => [this.normalizeUrl(p.id), p] as const));

            for (const url of userTargets) {
                const norm = this.normalizeUrl(url);
                const page = byNorm.get(norm) || {
                    id: url,
                    title: url,
                    slug: extractSlugFromUrl(url),
                    lastMod: null,
                    wordCount: null,
                    crawledContent: null,
                    healthScore: null,
                    updatePriority: 'Critical',
                    justification: 'User-selected target URL (URL Targeting Engine).',
                    daysOld: 999,
                    isStale: true,
                    publishedState: 'none',
                    status: 'idle',
                    analysis: null
                };

                if (!used.has(norm)) {
                    used.add(norm);
                    prioritized.push(page as SitemapPage);
                }
            }
        }

        const rest = candidates
            .filter(p => !used.has(this.normalizeUrl(p.id)))
            .sort((a, b) => (b.daysOld || 0) - (a.daysOld || 0));

        this.logCallback(`🎯 Targets loaded: ${userTargets.length}. Queue size: ${prioritized.length + rest.length}`);
        return [...prioritized, ...rest];
    }

    private async optimizeDOMSurgically(page: SitemapPage, context: GenerationContext) {
        const { wpConfig, apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel, serperApiKey } = context;
        this.logCallback(`📥 Fetching LIVE content for: ${page.title}...`);

        let rawContent = await this.fetchRawContent(page, wpConfig);
        if (!rawContent || rawContent.length < 500) {
            this.logCallback("❌ Content too short/empty. Skipping (will retry later).");
            return;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(rawContent, 'text/html');
        const body = doc.body;

        const hasSchema = rawContent.includes('application/ld+json');
        const hasReferences = rawContent.includes('sota-references-section');
        let schemaInjected = false;
        let referencesHtml = '';

        if (!hasSchema) {
            this.logCallback("🔍 No Schema detected. Injecting High-Performance Schema...");
            schemaInjected = true;
        }

        if (!hasReferences) {
            this.logCallback("📚 Fetching verified references from Serper API...");
            referencesHtml = await fetchVerifiedReferences(page.title, serperApiKey, wpConfig.url);
            if (referencesHtml) {
                this.logCallback("✅ References validated and ready to inject.");
            } else {
                this.logCallback("⚠️ No valid references found (may be quota exhausted or no relevant sources).");
            }
        }

        const textNodes = Array.from(body.querySelectorAll('p, li'));
        const safeNodes = textNodes.filter(node => {
            if (node.closest('figure')) return false;
            if (node.closest('table')) return false;
            if (node.closest('.wp-block-code')) return false;
            if (node.closest('.amazon-box')) return false;
            if (node.closest('.product-box')) return false;
            if (node.closest('.sota-references-section')) return false;
            if (node.querySelector('img, iframe, video, table, a[href*="amazon"]')) return false;
            if (node.querySelector('a')) {
                const links = node.querySelectorAll('a');
                if (links.length > 2) return false;
            }
            if (node.className.includes('wp-block-image')) return false;
            if (node.className.includes('key-takeaways')) return false;
            const textContent = node.textContent?.trim() || '';
            if (textContent.length === 0) return false;
            if (textContent.length < 50) return false;
            if (textContent.includes('$') || textContent.includes('Buy Now') || textContent.includes('Price')) return false;
            return true;
        });

        const BATCH_SIZE = 2;
        let changesMade = 0;
        let consecutiveErrors = 0;
        const MAX_BATCHES = 8;
        const MAX_CONSECUTIVE_ERRORS = 3;

        this.logCallback(`⚡ Found ${safeNodes.length} safe text nodes. Processing top ${MAX_BATCHES * BATCH_SIZE}...`);

        for (let i = 0; i < Math.min(safeNodes.length, MAX_BATCHES * BATCH_SIZE); i += BATCH_SIZE) {
            const batch = safeNodes.slice(i, i + BATCH_SIZE);

            for (const node of batch) {
                try {
                    const originalText = node.textContent || '';
                    const originalHTML = node.innerHTML;

                    if (originalText.length < 60) continue;

                    this.logCallback(`⚡ Polishing: "${originalText.substring(0, 60)}..."`);

                    const improvedText = await memoizedCallAI(
                        apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel,
                        'dom_content_polisher',
                        [originalHTML, page.title],
                        'html'
                    );

                    const sanitized = surgicalSanitizer(improvedText);

                    if (sanitized.length > originalHTML.length * 0.6 && sanitized !== originalHTML) {
                        node.innerHTML = sanitized;
                        changesMade++;
                        consecutiveErrors = 0;
                        this.logCallback(`✅ Updated (${changesMade} changes total)`);
                    } else {
                        this.logCallback(`⏭️ Skipped (no improvement)`);
                    }

                } catch (error: any) {
                    consecutiveErrors++;
                    this.logCallback(`❌ Polish error: ${error.message}`);
                    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                        this.logCallback("🛑 Too many consecutive errors. Stopping polish loop.");
                        break;
                    }
                }
            }

            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
        }

        this.logCallback(`✅ DOM Polish Complete: ${changesMade} improvements made.`);

        if (changesMade > 0 || schemaInjected || referencesHtml) {
            let finalHtml = body.innerHTML;

            if (referencesHtml && !hasReferences) {
                finalHtml += referencesHtml;
                this.logCallback("📚 References section injected into content.");
            }

            if (schemaInjected) {
                const schemaGenerator = lazySchemaGeneration(
                    { title: page.title, slug: page.slug || '' } as any,
                    wpConfig,
                    context.siteInfo,
                    geoTargeting
                );
                const schemaMarkup = schemaGenerator();
                finalHtml += schemaMarkup;
                this.logCallback("🔍 Schema.org markup injected.");
            }

            this.logCallback("📤 Posting optimized content to WordPress...");

            const password = localStorage.getItem('wpPassword') || '';
            const publishResult = await publishItemToWordPress(
                {
                    id: page.id,
                    title: page.title,
                    type: 'refresh',
                    originalUrl: page.id,
                    crawledContent: rawContent,
                    generatedContent: {
                        title: page.title,
                        content: finalHtml,
                        metaDescription: page.title,
                        slug: page.slug || extractSlugFromUrl(page.id),
                        isFullSurgicalRewrite: true
                    } as any
                } as ContentItem,
                password,
                'publish',
                fetchWordPressWithRetry,
                wpConfig
            );

            if (publishResult.success) {
                this.logCallback(`✅ SUCCESS|${page.title}|${publishResult.link || page.id}`);
                localStorage.setItem(`sota_last_proc_${page.id}`, Date.now().toString());
            } else {
                this.logCallback(`❌ Update Failed: ${publishResult.message}`);
            }
        } else {
            this.logCallback("⚠️ No optimization applied (0 changes, no schema, no references). NOT marking as complete.");
            this.logCallback("💡 This page will be retried on next cycle.");
        }
    }

    private async fetchRawContent(page: SitemapPage, wpConfig: WpConfig): Promise<string | null> {
        try {
            if (page.slug) {
                let res = await fetchWordPressWithRetry(`${wpConfig.url}/wp-json/wp/v2/posts?slug=${page.slug}&context=edit`, { 
                    method: 'GET',
                    headers: { 'Authorization': `Basic ${btoa(`${wpConfig.username}:${localStorage.getItem('wpPassword')}`)}` }
                });
                let data = await res.json();
                if (data && data.length > 0) return data[0].content.raw || data[0].content.rendered;
            }
            return await smartCrawl(page.id); 
        } catch (e) {
            return await smartCrawl(page.id);
        }
    }
}

// CRITICAL: Export singleton instance
export const maintenanceEngine = new MaintenanceEngine((msg) => console.log(msg));

// ... (rest of services.tsx content - keep all existing code identical)
// ... (continuing with all the helper functions and generateContent export)