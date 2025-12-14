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
import { executeGodModeUltraPipeline, performGodModeUltraAnalysis, generateGodModeUltraContent, GodModeUltraEngine, GOD_MODE_ULTRA_PROMPTS } from './god-mode-ultra-services';

class SotaAIError extends Error {
    constructor(
        public code: 'INVALID_PARAMS' | 'EMPTY_RESPONSE' | 'RATE_LIMIT' | 'AUTH_FAILED',
        message: string
    ) {
        super(message);
        this.name = 'SotaAIError';
    }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// 0. SURGICAL SANITIZER
// ============================================================================
const surgicalSanitizer = (html: string): string => {
    if (!html) return "";
    
    let cleanHtml = html
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
    
    // Remove duplicate H1s or Title Injections
    cleanHtml = cleanHtml.replace(/^\s*<h1.*?>.*?<\/h1>/i, ''); 
    cleanHtml = cleanHtml.replace(/^\s*Title:.*?(\n|<br>)/i, '');
    
    // Remove Signatures / Meta garbage
    cleanHtml = cleanHtml.replace(/Protocol Active: v\d+\.\d+/gi, '');
    cleanHtml = cleanHtml.replace(/REF: GUTF-Protocol-[a-z0-9]+/gi, '');
    cleanHtml = cleanHtml.replace(/Lead Data Scientist[\s\S]*?Latest Data Audit.*?(<\/p>|<br>|\n)/gi, '');
    cleanHtml = cleanHtml.replace(/Verification Fact-Checked/gi, '');
    cleanHtml = cleanHtml.replace(/Methodology Peer-Reviewed/gi, '');
    
    return cleanHtml.trim();
};

// Continue with the rest of the exact file content...
// [Due to length limits, I'll provide the key changes only]

// ... [ALL THE SAME CODE UNTIL LINE 1269] ...

export class MaintenanceEngine {
    private config: any;

    constructor(logCallback: (msg: string) => void) {
        this.logCallback = logCallback;
        this.config = {};
    }

    // ... [keep all existing methods] ...

    /**
     * 🔥 CRITICAL FIX: Fetch user-selected target URLs from WordPress REST API
     */
    private async getUserTargetUrls(): Promise<string[]> {
        try {
            const wpUrl = this.currentContext?.wpConfig?.url;
            if (!wpUrl) return [];

            const response = await fetchWordPressWithRetry(
                `${wpUrl}/wp-json/custom/v1/god-mode-targets`,
                { method: 'GET' }
            );

            if (!response.ok) return [];

            const data = await response.json();
            return Array.isArray(data.targets) ? data.targets : [];
        } catch (error) {
            console.error('[God Mode] Failed to fetch target URLs:', error);
            return [];
        }
    }

    /**
     * 🎯 ULTRA FIX: PRIORITY 1 = User Targets | FALLBACK = Age-based sorting
     */
    private async getPrioritizedPages(context: GenerationContext): Promise<SitemapPage[]> {
        // 🔥 PRIORITY 1: Check for user-selected target URLs
        const targetUrls = await this.getUserTargetUrls();
        
        if (targetUrls && targetUrls.length > 0) {
            this.logCallback(`🎯 Targets loaded: ${targetUrls.length}`);
            
            // Convert URLs to SitemapPage objects
            const targetPages: SitemapPage[] = [];
            
            for (const url of targetUrls) {
                // Find matching page in existingPages
                const matchingPage = context.existingPages.find(p => 
                    p.url === url || p.id === url || (p.url && url.includes(p.slug || ''))
                );
                
                if (matchingPage) {
                    targetPages.push(matchingPage);
                    this.logCallback(`🎯 TARGET: ${matchingPage.title || url}`);
                } else {
                    // Create a minimal page object if not found
                    targetPages.push({
                        url,
                        id: url,
                        title: url.split('/').filter(Boolean).pop() || url,
                        modified: new Date().toISOString(),
                        daysOld: 0
                    });
                    this.logCallback(`🎯 TARGET: ${url}`);
                }
            }
            
            return targetPages;
        }
        
        // 🔄 FALLBACK: Age-based sorting when no targets selected
        this.logCallback(`📊 No user targets - using age-based sorting`);
        
        let candidates = [...context.existingPages];

        const excludedUrls = context.excludedUrls || [];
        const excludedCategories = context.excludedCategories || [];

        if (excludedUrls.length > 0 || excludedCategories.length > 0) {
            const initialCount = candidates.length;
            candidates = candidates.filter(p => {
                if (!p.url && !p.id) {
                    this.logCallback(`⚠️ SKIP: Page missing URL and ID (title: "${p.title || 'Unknown'}")`);
                    return false;
                }

                const pageUrl = p.url || p.id || '';

                for (const excludedUrl of excludedUrls) {
                    if (!excludedUrl) continue;
                    if (pageUrl === excludedUrl || pageUrl.startsWith(excludedUrl)) {
                        this.logCallback(`🚫 Excluded (URL Match): ${p.title || 'Unknown'} (matches: ${excludedUrl})`);
                        return false;
                    }
                }

                for (const excludedPattern of excludedCategories) {
                    if (!excludedPattern) continue;

                    if (pageUrl.startsWith(excludedPattern)) {
                        this.logCallback(`🚫 Excluded (Category URL Match): ${p.title || 'Unknown'} (matches: ${excludedPattern})`);
                        return false;
                    }

                    if (p.categories) {
                        const pageCategories = Array.isArray(p.categories) ? p.categories : [];
                        const hasExcludedCategory = pageCategories.some(cat => {
                            const catSlug = typeof cat === 'object' ? (cat as any).slug : cat;
                            return catSlug === excludedPattern || excludedPattern.includes(catSlug);
                        });
                        if (hasExcludedCategory) {
                            this.logCallback(`🚫 Excluded (Category Slug Match): ${p.title || 'Unknown'} (matches: ${excludedPattern})`);
                            return false;
                        }
                    }
                }

                return true;
            });

            const excludedCount = initialCount - candidates.length;
            if (excludedCount > 0) {
                this.logCallback(`✅ Applied exclusions: ${excludedCount} page(s) filtered out`);
            }
        }

        candidates = candidates.filter(p => {
            const lastProcessed = localStorage.getItem(`sota_last_proc_${p.id}`);
            if (!lastProcessed) return true;
            const hoursSince = (Date.now() - parseInt(lastProcessed)) / (1000 * 60 * 60);
            return hoursSince > 24;
        });
        
        return candidates.sort((a, b) => (b.daysOld || 0) - (a.daysOld || 0));
    }

    // ... [REST OF THE FILE STAYS THE SAME] ...
}

// ... [ALL REMAINING CODE STAYS EXACTLY THE SAME] ...