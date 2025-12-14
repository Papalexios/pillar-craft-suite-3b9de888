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

// SOTA UPGRADE: INTELLIGENT REFERENCE ENGINE WITH CONTENT VALIDATION
const fetchVerifiedReferences = async (keyword: string, serperApiKey: string, wpUrl?: string): Promise<string> => {
    if (!serperApiKey) return "";

    const normalizeUrl = (u: string): string => {
        try {
            const urlObj = new URL(u);
            urlObj.hash = '';
            const trackingParams = new Set(["utm_source","utm_medium","utm_campaign","utm_term","utm_content","fbclid","gclid"]);
            [...urlObj.searchParams.keys()].forEach(k => { if (trackingParams.has(k)) urlObj.searchParams.delete(k); });
            const s = urlObj.toString();
            return s.endsWith('/') ? s.slice(0, -1) : s;
        } catch {
            const t = (u || '').trim();
            return t.endsWith('/') ? t.slice(0, -1) : t;
        }
    };

    const getSerperRemaining = (res: Response): number | null => {
        const keys = ['x-ratelimit-remaining','x-rate-limit-remaining','x-remaining-requests'];
        for (const k of keys) {
            const v = res.headers.get(k);
            if (!v) continue;
            const n = Number(v);
            if (Number.isFinite(n)) return n;
        }
        return null;
    };

    const emitQuota = (remaining: number | null) => {
        if (remaining === null) return;
        try { localStorage.setItem('serper_rate_remaining', String(remaining)); } catch {}
        try { window.dispatchEvent(new CustomEvent('serper:quota', { detail: { remaining } })); } catch {}
        const threshold = 20;
        if (remaining <= threshold) {
            try {
                const key = 'serper_low_quota_alerted';
                if (!sessionStorage.getItem(key)) {
                    sessionStorage.setItem(key, 'true');
                    alert(`⚠️ Serper.dev quota low: ~${remaining} requests remaining.\n\nGod Mode will reduce research calls to avoid exhausting your key.`);
                }
            } catch {}
        }
    };

    const validate200 = async (u: string): Promise<boolean> => {
        const tryHead = async (): Promise<boolean> => {
            const res = await fetchWithProxies(u, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
            return res.status >= 200 && res.status < 300;
        };
        const tryGetRange = async (): Promise<boolean> => {
            const res = await fetchWithProxies(u, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-2048' } });
            return res.status >= 200 && res.status < 300;
        };

        try {
            const headOk = await Promise.race([
                tryHead(),
                new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ]);
            if (headOk) return true;
        } catch {}

        try {
            const getOk = await Promise.race([
                tryGetRange(),
                new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6500))
            ]);
            return Boolean(getOk);
        } catch {
            return false;
        }
    };

    try {
        let userDomain = "";
        if (wpUrl) {
            try { userDomain = new URL(wpUrl).hostname.replace('www.', ''); } catch {}
        }

        const query = [
            keyword,
            String(CURRENT_YEAR),
            '(study OR research OR evidence OR statistics OR systematic review)',
            '-site:youtube.com -site:pinterest.com -site:quora.com -site:reddit.com -site:dokumen.pub -site:pdfcoffee.com',
            '-inurl:product -inurl:shop -inurl:cart -inurl:checkout -inurl:affiliate'
        ].join(' ');

        const response = await fetchWithProxies("https://google.serper.dev/search", {
            method: "POST",
            headers: { "X-API-KEY": serperApiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ q: query, num: 12, type: 'search' }),
        });

        const remaining = getSerperRemaining(response);
        emitQuota(remaining);

        if (response.status === 401 || response.status === 403) {
            alert('❌ Serper.dev key unauthorized/forbidden. Fix the key in Settings.');
            return "";
        }
        if (response.status === 429) {
            alert('❌ Serper.dev quota exhausted (429). God Mode cannot verify references until quota resets.');
            return "";
        }
        if (!response.ok) return "";

        if (remaining !== null && remaining <= 3) return "";

        const data = await response.json();
        const organic = Array.isArray(data.organic) ? data.organic : [];

        const keywordTokens = (keyword || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 4)
            .slice(0, 10);

        const isClearlyIrrelevant = (title: string, snippet: string): boolean => {
            if (keywordTokens.length === 0) return false;
            const blob = `${title || ''} ${snippet || ''}`.toLowerCase();
            const overlap = keywordTokens.filter(t => blob.includes(t)).length;
            const minOverlap = Math.max(1, Math.floor(keywordTokens.length * 0.15));
            return overlap < minOverlap;
        };

        const allowBoostDomains = new Set([
            'mayoclinic.org','nih.gov','ncbi.nlm.nih.gov','pubmed.ncbi.nlm.nih.gov','cdc.gov','who.int','nhs.uk',
            'health.harvard.edu','clevelandclinic.org','heart.org','diabetes.org'
        ]);

        const isBlockedDomain = (domain: string): boolean => {
            const blocked = [
                'linkedin.com','facebook.com','instagram.com','twitter.com','x.com','tiktok.com',
                'dokumen.pub','pdfcoffee.com','pinterest.com','youtube.com',
                'amazon.','ebay.'
            ];
            return blocked.some(b => domain.includes(b));
        };

        const isBlockedUrl = (u: string): boolean => {
            const lower = (u || '').toLowerCase();
            if (lower.endsWith('.pdf')) return true;
            if (lower.includes('/product/') || lower.includes('/shop/') || lower.includes('/cart') || lower.includes('/checkout')) return true;
            return false;
        };

        const ranked = organic
            .map((r: any) => {
                const url = String(r.link || '');
                let domain = '';
                try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
                const boost = [...allowBoostDomains].some(d => domain.endsWith(d)) ? 1 : 0;
                return { ...r, _domain: domain, _boost: boost };
            })
            .sort((a: any, b: any) => b._boost - a._boost);

        const seen = new Set<string>();
        const valid: { title: string; url: string; source: string }[] = [];

        for (const r of ranked) {
            if (valid.length >= 6) break;
            const url = String(r.link || '').trim();
            const title = String(r.title || '').trim();
            const snippet = String(r.snippet || '').trim();
            if (!url) continue;

            const norm = normalizeUrl(url);
            if (seen.has(norm)) continue;
            seen.add(norm);

            let domain = '';
            try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
            if (!domain) continue;

            if (userDomain && domain.includes(userDomain)) continue;
            if (isBlockedDomain(domain)) continue;
            if (isBlockedUrl(url)) continue;
            if (isClearlyIrrelevant(title, snippet)) continue;

            const ok = await validate200(url);
            if (!ok) continue;

            valid.push({ title: title || domain, url, source: domain });
        }

        if (valid.length === 0) return "";

        const listItems = valid.map(ref =>
            `<li class="hover:translate-x-1 transition-transform duration-200">
                <a href="${ref.url}" target="_blank" rel="noopener noreferrer" class="font-medium text-blue-600 hover:text-blue-800 underline decoration-2 decoration-blue-200" title="Verified Source: ${ref.source}">${ref.title}</a>
                <span class="ml-2 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">✅ Verified</span>
            </li>`
        ).join('');

        return `
            <div class="sota-references-section my-12 p-8 bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-100 rounded-2xl shadow-sm">
                <h3 class="text-xl font-bold text-slate-800 mb-6 flex items-center"><span class="mr-2">📚</span> Trusted Research & References</h3>
                <ul class="grid grid-cols-1 md:grid-cols-2 gap-4 list-none pl-0">${listItems}</ul>
            </div>
        `;
    } catch (e) {
        console.error('[fetchVerifiedReferences] Error:', e);
        return "";
    }
};

const analyzeCompetitors = async (keyword: string, serperApiKey: string): Promise<{ report: string, snippetType: 'LIST' | 'TABLE' | 'PARAGRAPH', topResult: string }> => {
    if (!serperApiKey) return { report: "", snippetType: 'PARAGRAPH', topResult: "" };
    const quota = checkSerperQuota();
    if (!quota.allowed) return { report: "", snippetType: 'PARAGRAPH', topResult: "" };
    
    try {
        incrementSerperCount();
        const response = await fetchWithProxies("https://google.serper.dev/search", {
            method: 'POST',
            headers: { 'X-API-KEY': serperApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: keyword, num: 3 })
        });
        const data = await response.json();
        const competitors = (data.organic || []).slice(0, 3);
        const topResult = competitors[0]?.snippet || "";
        const snippetType = (data.organic?.[0]?.snippet?.includes('steps') || data.organic?.[0]?.title?.includes('How to')) ? 'LIST' : (data.organic?.[0]?.snippet?.includes('vs') ? 'TABLE' : 'PARAGRAPH');
        const reports = competitors.map((comp: any, index: number) => `COMPETITOR ${index + 1} (${comp.title}): ${comp.snippet}`);
        return { report: reports.join('\n'), snippetType, topResult };
    } catch (e) { return { report: "", snippetType: 'PARAGRAPH', topResult: "" }; }
};

const performTrueGapAnalysis = async (
    topic: string,
    serperApiKey: string,
    apiClients: ApiClients,
    selectedModel: string,
    geoTargeting: ExpandedGeoTargeting,
    openrouterModels: string[],
    selectedGroqModel: string
): Promise<string[]> => {
    if (!serperApiKey) return [];
    const quota = checkSerperQuota();
    if (!quota.allowed) return [];

    try {
        incrementSerperCount();
        const serperRes = await fetchWithProxies("https://google.serper.dev/search", {
            method: "POST",
            headers: { "X-API-KEY": serperApiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ q: topic, num: 3 }),
        });
        const data = await serperRes.json();
        const competitors = data.organic?.slice(0, 3) || [];

        const competitorContext = competitors.map((c: any, i: number) => {
            const sitelinks = c.sitelinks?.map((s: any) => s.title).join(", ") || "N/A";
            return `Competitor ${i + 1} (${c.title}): ${c.snippet}\nSections: ${sitelinks}`;
        }).join("\n\n");

        const gapPrompt = `
Analyze these top 3 ranking competitors for "${topic}".
Identify 5 specific sub-topics, entities, or data points they mention that are CRITICAL for ranking but often missed.
Return ONLY a JSON array of strings.

Context:
${competitorContext}

Output format: ["gap 1", "gap 2", "gap 3", "gap 4", "gap 5"]
`;

        try {
            const gapResponse = await memoizedCallAI(
                apiClients,
                selectedModel,
                geoTargeting,
                openrouterModels,
                selectedGroqModel,
                'json_repair',
                [gapPrompt],
                'json'
            );

            const gaps = JSON.parse(gapResponse);
            return Array.isArray(gaps) ? gaps : [];
        } catch (e) {
            console.error('[performTrueGapAnalysis] Error parsing gaps:', e);
            return [];
        }
    } catch (e) {
        console.error('[performTrueGapAnalysis] Error:', e);
        return [];
    }
};

const discoverPostIdAndEndpoint = async (url: string): Promise<{ id: number, endpoint: string } | null> => {
    try {
        const response = await fetchWithProxies(url);
        if (!response.ok) return null;
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const apiLink = doc.querySelector('link[rel="https://api.w.org/"]');
        if (apiLink) {
            const href = apiLink.getAttribute('href');
            if (href) {
                const match = href.match(/\/(\d+)$/);
                if (match) return { id: parseInt(match[1]), endpoint: href };
            }
        }

        const bodyClasses = doc.body?.className || '';
        const postIdMatch = bodyClasses.match(/\bpostid-(\d+)\b/);
        if (postIdMatch) {
            const postId = parseInt(postIdMatch[1]);
            console.log(`[discoverPostIdAndEndpoint] Found post ID ${postId} from body classes`);
            return { id: postId, endpoint: '' };
        }

        const article = doc.querySelector('article[id^="post-"]');
        if (article) {
            const articleId = article.getAttribute('id');
            if (articleId) {
                const match = articleId.match(/post-(\d+)/);
                if (match) {
                    const postId = parseInt(match[1]);
                    console.log(`[discoverPostIdAndEndpoint] Found post ID ${postId} from article ID`);
                    return { id: postId, endpoint: '' };
                }
            }
        }

        console.log(`[discoverPostIdAndEndpoint] No post ID found in HTML for ${url}`);
        return null;
    } catch (e) {
        console.log(`[discoverPostIdAndEndpoint] Error: ${e}`);
        return null;
    }
};

const generateAndValidateReferences = async (keyword: string, metaDescription: string, serperApiKey: string, apiClients?: ApiClients, selectedModel?: string) => {
    return { html: await fetchVerifiedReferences(keyword, serperApiKey, undefined, apiClients, selectedModel), data: [] };
};

const _internalCallAI = async (
    apiClients: ApiClients, selectedModel: string, geoTargeting: ExpandedGeoTargeting, openrouterModels: string[],
    selectedGroqModel: string, promptKey: keyof typeof PROMPT_TEMPLATES, promptArgs: any[],
    responseFormat: 'json' | 'html' | 'text' = 'json', useGrounding: boolean = false
): Promise<string> => {
    if (!apiClients) throw new SotaAIError('INVALID_PARAMS', 'API clients object is undefined.');
    const client = apiClients[selectedModel as keyof typeof apiClients];
    if (!client) throw new SotaAIError('AUTH_FAILED', `API Client for '${selectedModel}' not initialized.`);

    const cacheKey = `${String(promptKey)}-${JSON.stringify(promptArgs)}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return Promise.resolve(cached);
    
    const template = PROMPT_TEMPLATES[promptKey];
    // @ts-ignore
    const systemInstruction = (promptKey === 'cluster_planner' && typeof template.systemInstruction === 'string') 
        ? template.systemInstruction.replace('{{GEO_TARGET_INSTRUCTIONS}}', (geoTargeting.enabled && geoTargeting.location) ? `All titles must be geo-targeted for "${geoTargeting.location}".` : '')
        : template.systemInstruction;
    // @ts-ignore
    const userPrompt = template.userPrompt(...promptArgs);
    
    let responseText: string | null = '';

    switch (selectedModel) {
        case 'gemini':
             const geminiConfig: { systemInstruction: string; responseMimeType?: string; tools?: any[] } = { systemInstruction };
            if (responseFormat === 'json') geminiConfig.responseMimeType = "application/json";
             if (useGrounding) {
                geminiConfig.tools = [{googleSearch: {}}];
                if (geminiConfig.responseMimeType) delete geminiConfig.responseMimeType;
            }
            const geminiResponse = await callAiWithRetry(() => (client as GoogleGenAI).models.generateContent({
                model: AI_MODELS.GEMINI_FLASH,
                contents: userPrompt,
                config: geminiConfig,
            }));
            responseText = geminiResponse.text;
            break;
        case 'openai':
            const openaiResponse = await callAiWithRetry(() => (client as unknown as OpenAI).chat.completions.create({
                model: AI_MODELS.OPENAI_GPT4_TURBO,
                messages: [{ role: "system", content: systemInstruction }, { role: "user", content: userPrompt }],
                ...(responseFormat === 'json' && { response_format: { type: "json_object" } })
            }));
            responseText = openaiResponse.choices[0].message.content;
            break;
        case 'openrouter':
            for (const modelName of openrouterModels) {
                try {
                    const response = await callAiWithRetry(() => (client as unknown as OpenAI).chat.completions.create({
                        model: modelName,
                        messages: [{ role: "system", content: systemInstruction }, { role: "user", content: userPrompt }],
                         ...(responseFormat === 'json' && { response_format: { type: "json_object" } })
                    }));
                    responseText = response.choices[0].message.content;
                    break;
                } catch (error) { console.error(error); }
            }
            break;
        case 'groq':
             const groqResponse = await callAiWithRetry(() => (client as unknown as OpenAI).chat.completions.create({
                model: selectedGroqModel,
                messages: [{ role: "system", content: systemInstruction }, { role: "user", content: userPrompt }],
                ...(responseFormat === 'json' && { response_format: { type: "json_object" } })
            }));
            responseText = groqResponse.choices[0].message.content;
            break;
        case 'anthropic':
            const anthropicResponse = await callAiWithRetry(() => (client as unknown as Anthropic).messages.create({
                model: AI_MODELS.ANTHROPIC_OPUS,
                max_tokens: 4096,
                system: systemInstruction,
                messages: [{ role: "user", content: userPrompt }],
            }));
            responseText = anthropicResponse.content?.map(c => c.text).join("") || "";
            break;
    }

    if (!responseText) throw new Error(`AI returned empty response.`);
    apiCache.set(cacheKey, responseText);
    return responseText;
};

export const callAI = async (...args: Parameters<typeof _internalCallAI>): Promise<string> => {
    const [apiClients, selectedModel] = args;
    let client = apiClients[selectedModel as keyof typeof apiClients];
    if (!client) {
        const fallbackOrder: (keyof ApiClients)[] = ['gemini', 'openai', 'openrouter', 'anthropic', 'groq'];
        for (const fallback of fallbackOrder) {
            if (apiClients[fallback]) {
                args[1] = fallback as any; 
                break;
            }
        }
    }
    return await _internalCallAI(...args);
};

export const memoizedCallAI = async (
    apiClients: ApiClients, selectedModel: string, geoTargeting: ExpandedGeoTargeting, openrouterModels: string[],
    selectedGroqModel: string, promptKey: keyof typeof PROMPT_TEMPLATES, promptArgs: any[],
    responseFormat: 'json' | 'html' | 'text' = 'json',
    useGrounding: boolean = false
): Promise<string> => {
    const cacheKey = `ai_${String(promptKey)}_${JSON.stringify(promptArgs)}`;
    if (apiCache.get(cacheKey)) return apiCache.get(cacheKey)!;
    const res = await callAI(apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel, promptKey, promptArgs, responseFormat, useGrounding);
    apiCache.set(cacheKey, res);
    return res;
};

export const generateImageWithFallback = async (apiClients: ApiClients, prompt: string): Promise<string | null> => {
    if (!prompt) return null;
    if (apiClients.gemini) {
        try {
             const geminiImgResponse = await callAiWithRetry(() => apiClients.gemini!.models.generateImages({ model: AI_MODELS.GEMINI_IMAGEN, prompt: prompt, config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '16:9' } }));
             return `data:image/jpeg;base64,${String(geminiImgResponse.generatedImages[0].image.imageBytes)}`;
        } catch (error) {
             try {
                const flashImageResponse = await callAiWithRetry(() => apiClients.gemini!.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: [{ text: prompt }] },
                    config: { responseModalities: ['IMAGE'] },
                }));
                return `data:image/png;base64,${String(flashImageResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data)}`;
             } catch (e) { console.error(e); }
        }
    }
    return null;
};

async function attemptDirectWordPressUpload(image: any, wpConfig: WpConfig, password: string): Promise<{ url: string, id: number } | null> {
    try {
        if (!image.base64Data || typeof image.base64Data !== 'string') {
            console.error('[Image Upload] Invalid base64Data: not a string');
            return null;
        }

        let base64Content: string;
        if (image.base64Data.includes(',')) {
            const parts = image.base64Data.split(',');
            if (parts.length < 2 || !parts[1]) {
                console.error('[Image Upload] Invalid base64Data format: comma found but no data after it');
                return null;
            }
            base64Content = parts[1];
        } else {
            base64Content = image.base64Data;
        }

        if (!base64Content || base64Content.trim().length === 0) {
            console.error('[Image Upload] Base64 content is empty');
            return null;
        }

        const response = await fetchWordPressWithRetry(
            `${wpConfig.url}/wp-json/wp/v2/media`,
            {
                method: 'POST',
                headers: new Headers({
                    'Authorization': `Basic ${btoa(`${wpConfig.username}:${password}`)}`,
                    'Content-Type': 'image/jpeg',
                    'Content-Disposition': `attachment; filename="${image.title || 'image'}.jpg"`
                }),
                body: Buffer.from(base64Content, 'base64')
            }
        );

        if (response.ok) {
            const data = await response.json();
            if (!data.source_url) {
                console.error('[Image Upload] WordPress returned success but no source_url');
                return null;
            }
            console.log(`[Image Upload] Success: ${data.source_url}`);
            return { url: data.source_url, id: data.id };
        } else {
            const errorText = await response.text();
            console.error(`[Image Upload] WordPress API error (${response.status}): ${errorText}`);
            return null;
        }
    } catch (error: any) {
        console.error('[Image Upload] Exception:', error.message || String(error));
        return null;
    }
}

const processImageLayer = async (image: any, wpConfig: WpConfig, password: string): Promise<{url: string, id: number | null} | null> => {
    const directUpload = await attemptDirectWordPressUpload(image, wpConfig, password);
    if (directUpload) return directUpload;
    return null;
};

async function criticLoop(html: string, callAI: Function, context: GenerationContext): Promise<string> {
    let currentHtml = html;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
        try {
            const critiqueJson = await memoizedCallAI(context.apiClients, context.selectedModel, context.geoTargeting, context.openrouterModels, context.selectedGroqModel, 'content_grader', [currentHtml], 'json');
            const aiRepairer = (brokenText: string) => callAI(context.apiClients, 'gemini', { enabled: false, location: '', region: '', country: '', postalCode: '' }, [], '', 'json_repair', [brokenText], 'json');
            const critique = await parseJsonWithAiRepair(critiqueJson, aiRepairer);

            if (critique.score >= 90) {
                console.log(`[Critic Loop] Content passed with score ${critique.score} on attempt ${attempts + 1}`);
                break;
            }

            console.log(`[Critic Loop] Attempt ${attempts + 1}/${MAX_ATTEMPTS}: Score ${critique.score}, repairing...`);

            const repairedHtml = await memoizedCallAI(context.apiClients, context.selectedModel, context.geoTargeting, context.openrouterModels, context.selectedGroqModel, 'content_repair_agent', [currentHtml, critique.issues], 'html');
            const sanitizedRepair = surgicalSanitizer(repairedHtml);

            if (sanitizedRepair.length > currentHtml.length * 0.5) {
                currentHtml = sanitizedRepair;
                console.log(`[Critic Loop] Repair accepted (${sanitizedRepair.length} chars)`);
            } else {
                console.log(`[Critic Loop] Repair rejected (too short: ${sanitizedRepair.length} chars)`);
                break;
            }

            attempts++;
        } catch (e: any) {
            console.error(`[Critic Loop] Error on attempt ${attempts + 1}:`, e.message);
            break;
        }
    }

    console.log(`[Critic Loop] Final content (${currentHtml.length} chars) after ${attempts} attempts`);
    return currentHtml;
}

export const publishItemToWordPress = async (
    itemToPublish: ContentItem,
    currentWpPassword: string,
    status: 'publish' | 'draft',
    fetcher: typeof fetchWordPressWithRetry,
    wpConfig: WpConfig,
): Promise<{ success: boolean; message: React.ReactNode; link?: string }> => {
    try {
        const { generatedContent } = itemToPublish;
        if (!generatedContent) return { success: false, message: 'No content generated.' };

        const headers = new Headers({ 
            'Authorization': `Basic ${btoa(`${wpConfig.username}:${currentWpPassword}`)}`,
            'Content-Type': 'application/json'
        });

        let contentToPublish = generatedContent.content;
        let featuredImageId: number | null = null;
        let existingPostId: number | null = null;
        let method = 'POST';
        let apiUrl = `${wpConfig.url.replace(/\/+$/, '')}/wp-json/wp/v2/posts`;

        let finalTitle = generatedContent.title;
        const isUrlTitle = finalTitle.startsWith('http') || finalTitle.includes('www.');

        if (itemToPublish.type === 'refresh') {
            if (generatedContent.isFullSurgicalRewrite) {
                contentToPublish = generatedContent.content;
            } else if (generatedContent.surgicalSnippets) {
                contentToPublish = performSurgicalUpdate(itemToPublish.crawledContent || '', generatedContent.surgicalSnippets);
            } else {
                 return { success: false, message: 'Refresh Failed: Missing content.' };
            }

            let discovered = null;
            if (itemToPublish.originalUrl) {
                discovered = await discoverPostIdAndEndpoint(itemToPublish.originalUrl);
            }

            if (discovered) {
                existingPostId = discovered.id;
                if (discovered.endpoint) apiUrl = discovered.endpoint;
                else apiUrl = `${wpConfig.url.replace(/\/+$/, '')}/wp-json/wp/v2/posts/${existingPostId}`;
            }

            if (!existingPostId && generatedContent.slug) {
                 const searchRes = await fetcher(`${wpConfig.url}/wp-json/wp/v2/posts?slug=${generatedContent.slug}&_fields=id&status=any`, { method: 'GET', headers });
                 const searchData = await searchRes.json();
                 if (Array.isArray(searchData) && searchData.length > 0) {
                     existingPostId = searchData[0].id;
                     apiUrl = `${wpConfig.url.replace(/\/+$/, '')}/wp-json/wp/v2/posts/${existingPostId}`;
                 }
            }

            if (!existingPostId) {
                 return { success: false, message: `Could not find original post.` };
            }
        } else {
            if (generatedContent.slug) {
                const searchRes = await fetcher(`${wpConfig.url}/wp-json/wp/v2/posts?slug=${generatedContent.slug}&_fields=id&status=any`, { method: 'GET', headers });
                const searchData = await searchRes.json();
                if (Array.isArray(searchData) && searchData.length > 0) {
                    existingPostId = searchData[0].id;
                    apiUrl = `${wpConfig.url.replace(/\/+$/, '')}/wp-json/wp/v2/posts/${existingPostId}`;
                }
            }
        }

        contentToPublish = surgicalSanitizer(contentToPublish);

        if (contentToPublish) {
             const base64ImageRegex = /<img[^>]+src="(data:image\/(?:jpeg|png|webp);base64,([^"]+))"[^>]*>/g;
             const imagesToUpload = [...contentToPublish.matchAll(base64ImageRegex)].map((match, index) => {
                return { fullImgTag: match[0], base64Data: match[1], altText: generatedContent.title, title: `${generatedContent.slug}-${index}`, index };
            });
            for (const image of imagesToUpload) {
                const uploadResult = await processImageLayer(image, wpConfig, currentWpPassword);
                if (uploadResult && uploadResult.url) {
                    contentToPublish = contentToPublish.replace(image.fullImgTag, image.fullImgTag.replace(/src="[^"]+"/, `src="${uploadResult.url}"`));
                    if (image.index === 0 && !existingPostId) featuredImageId = uploadResult.id;
                }
            }
        }

        const postData: any = {
            content: (contentToPublish || '') + generateSchemaMarkup(generatedContent.jsonLdSchema ?? {}),
            status: status, 
            meta: {
                _yoast_wpseo_metadesc: generatedContent.metaDescription ?? '',
            }
        };

        if (!isUrlTitle) {
            postData.title = finalTitle;
            postData.meta._yoast_wpseo_title = finalTitle;
        }
        
        if (itemToPublish.type !== 'refresh') {
            postData.slug = generatedContent.slug;
        }

        if (featuredImageId) postData.featured_media = featuredImageId;

        const postResponse = await fetcher(apiUrl, { method, headers, body: JSON.stringify(postData) });
        const responseData = await postResponse.json();
        
        if (!postResponse.ok) throw new Error(responseData.message || 'WP API Error');
        return { success: true, message: 'Published!', link: responseData.link };
    } catch (error: any) {
        return { success: false, message: `Error: ${error.message}` };
    }
};

// ============================================================================
// SOTA MAINTENANCE ENGINE: USER URL PRIORITIZATION + SMART SKIP
// ============================================================================

export class MaintenanceEngine {
    private isRunning: boolean = false;
    public logCallback: (msg: string) => void;
    private currentContext: GenerationContext | null = null;
    private priorityUrls: string[] = []; // SOTA: User-selected target URLs

    constructor(logCallback: (msg: string) => void) {
        this.logCallback = logCallback;
    }

    updateContext(context: GenerationContext) {
        this.currentContext = context;
    }

    // SOTA: Set priority URLs from user selection
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

        // CRITICAL: Validate API clients before starting
        if (!context.apiClients || !context.apiClients[context.selectedModel as keyof typeof context.apiClients]) {
            this.logCallback("❌ CRITICAL ERROR: AI API Client not initialized!");
            this.logCallback(`🔧 REQUIRED: Configure ${context.selectedModel.toUpperCase()} API key in Settings`);
            this.logCallback("🛑 STOPPING: God Mode requires a valid AI API client");
            this.isRunning = false;
            return;
        }

        // Check Serper quota
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
                
                // SOTA SMART SKIP: Check if Last Modified Date is older than our last optimization
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

    // SOTA: TRUE URL PRIORITIZATION
    private async getPrioritizedPages(context: GenerationContext): Promise<SitemapPage[]> {
        const now = Date.now();
        const userTargets = this.getUserTargetUrls();
        const targetSet = new Set(userTargets.map(u => this.normalizeUrl(u)));

        const isTargetPage = (p: SitemapPage): boolean => targetSet.has(this.normalizeUrl(p.id));

        const targetCooldownHours = 2;
        const sitemapCooldownHours = 24;

        let candidates = [...context.existingPages];

        // CRITICAL FIX: NO COOLDOWN FOR USER TARGETS
        candidates = candidates.filter(p => {
            if (isTargetPage(p)) return true; // User targets ALWAYS run
            
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

        return [...prioritized, ...rest];
    }`);
            if (!lastProcessed) return true;
            const hoursSince = (now - parseInt(lastProcessed)) / (1000 * 60 * 60);
            return hoursSince > (isTargetPage(p) ? targetCooldownHours : sitemapCooldownHours);
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

        return [...prioritized, ...rest];
    }`);
            if (!lastProcessed) return true;
            const hoursSince = (Date.now() - parseInt(lastProcessed)) / (1000 * 60 * 60);
            return hoursSince > 24; 
        });

        // SOTA FIX: PRIORITIZE USER-SELECTED URLS FIRST!
        if (this.priorityUrls.length > 0) {
            const priorityPages = candidates.filter(p => this.priorityUrls.includes(p.id));
            const otherPages = candidates.filter(p => !this.priorityUrls.includes(p.id));
            
            // Sort priority pages by user's order
            priorityPages.sort((a, b) => {
                const indexA = this.priorityUrls.indexOf(a.id);
                const indexB = this.priorityUrls.indexOf(b.id);
                return indexA - indexB;
            });
            
            // Sort other pages by age
            otherPages.sort((a, b) => (b.daysOld || 0) - (a.daysOld || 0));
            
            return [...priorityPages, ...otherPages];
        }

        // Fallback: Sort by age if no priority URLs
        return candidates.sort((a, b) => (b.daysOld || 0) - (a.daysOld || 0)); 
    }

    private async optimizeDOMSurgically(page: SitemapPage, context: GenerationContext) {
        const { wpConfig, apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel } = context;
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
        let schemaInjected = false;
        if (!hasSchema) {
            this.logCallback("🔍 No Schema detected. Injecting High-Performance Schema...");
            schemaInjected = true;
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

            if (publishResult.success) {
                this.logCallback(`✅ SUCCESS|${page.title}|${publishResult.link || page.id}`);
                localStorage.setItem(`sota_last_proc_${page.id}`, Date.now().toString());
            } else {
                this.logCallback(`❌ Update Failed: ${publishResult.message}`);
            }
        } else {
            this.logCallback("⚠️ No optimization applied (0 changes, no schema). NOT marking as complete.");
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

export const maintenanceEngine = new MaintenanceEngine((msg) => console.log(msg));

export const generateContent = {
    analyzePages: async (pages: any[], callAI: any, setPages: any, onProgress: any, shouldStop: any) => {
       const aiRepairer = (brokenText: string) => callAI('json_repair', [brokenText], 'json');
       await processConcurrently(pages, async (page) => {
            if (shouldStop()) return;
            try {
                setPages((prev: any) => prev.map((p: any) => p.id === page.id ? { ...p, status: 'analyzing' } : p));
                let content = page.crawledContent;
                if (!content || content.length < 200) content = await smartCrawl(page.id);
                const analysisResponse = await callAI('batch_content_analyzer', [page.title, content], 'json');
                const analysisData = await parseJsonWithAiRepair(analysisResponse, aiRepairer);
                setPages((prev: any) => prev.map((p: any) => p.id === page.id ? { ...p, status: 'analyzed', analysis: analysisData.analysis, healthScore: analysisData.healthScore, updatePriority: analysisData.updatePriority } : p));
            } catch (error: any) { setPages((prev: any) => prev.map((p: any) => p.id === page.id ? { ...p, status: 'error', justification: error.message } : p)); }
       }, 1, (c, t) => onProgress({current: c, total: t}), shouldStop);
    },
    
    analyzeContentGaps: async (existingPages: SitemapPage[], topic: string, callAI: Function, context: GenerationContext): Promise<GapAnalysisSuggestion[]> => {
        const titles = existingPages.map(p => p.title).filter(t => t && t.length > 5);
        const responseText = await memoizedCallAI(context.apiClients, context.selectedModel, context.geoTargeting, context.openrouterModels, context.selectedGroqModel, 'content_gap_analyzer', [titles, topic], 'json', true);
        const aiRepairer = (brokenText: string) => callAI('json_repair', [brokenText], 'json');
        const parsed = await parseJsonWithAiRepair(responseText, aiRepairer);
        return parsed.suggestions || [];
    },

    refreshItem: async (item: ContentItem, callAI: Function, context: GenerationContext, aiRepairer: any) => {
        const { dispatch, serperApiKey } = context;
        let sourceContent = item.crawledContent;
        if (!sourceContent) {
             sourceContent = await smartCrawl(item.originalUrl || item.id);
             dispatch({ type: 'SET_CRAWLED_CONTENT', payload: { id: item.id, content: sourceContent } });
        }
        dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'generating', statusText: 'Fetching Real-time Data...' } });
        const [paaQuestions, semanticKeywordsResponse, verifiedReferencesHtml] = await Promise.all([
            fetchPAA(item.title, serperApiKey),
            memoizedCallAI(context.apiClients, context.selectedModel, context.geoTargeting, context.openrouterModels, context.selectedGroqModel, 'semantic_keyword_generator', [item.title, context.geoTargeting.enabled ? context.geoTargeting.location : null], 'json'),
            fetchVerifiedReferences(item.title, serperApiKey, context.wpConfig.url, context.apiClients, context.selectedModel)
        ]);
        const semanticKeywordsRaw = await parseJsonWithAiRepair(semanticKeywordsResponse, aiRepairer);
        const semanticKeywords = semanticKeywordsRaw?.semanticKeywords?.map((k: any) => typeof k === 'object' ? k.keyword : k) || [];

        dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'generating', statusText: 'Generating SOTA Updates...' } });
        const responseText = await memoizedCallAI(context.apiClients, context.selectedModel, context.geoTargeting, context.openrouterModels, context.selectedGroqModel, 'content_refresher', [sourceContent, item.title, item.title, paaQuestions, semanticKeywords], 'json', true);
        const parsedSnippets = await parseJsonWithAiRepair(responseText, aiRepairer);
        parsedSnippets.referencesHtml = verifiedReferencesHtml;

        const generated = normalizeGeneratedContent({}, item.title);
        generated.title = parsedSnippets.seoTitle || item.title;
        generated.metaDescription = parsedSnippets.metaDescription || '';
        generated.content = `
            <div class="sota-update-preview">
                <h3>🔥 New Intro</h3>${parsedSnippets.introHtml}<hr>
                <h3>💡 Key Takeaways</h3>${parsedSnippets.keyTakeawaysHtml}<hr>
                <h3>📊 Comparison Table</h3>${parsedSnippets.comparisonTableHtml}<hr>
                <h3>❓ FAQs</h3>${parsedSnippets.faqHtml}<hr>
                ${parsedSnippets.referencesHtml}
            </div>`;
        generated.surgicalSnippets = parsedSnippets;
        dispatch({ type: 'SET_CONTENT', payload: { id: item.id, content: generated } });
        dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'done', statusText: 'Refreshed' } });
    },

    generateItems: async (
        itemsToGenerate: ContentItem[],
        callAI: Function,
        generateImage: Function,
        context: GenerationContext,
        onProgress: (progress: { current: number; total: number }) => void,
        shouldStop: () => React.MutableRefObject<Set<string>>
    ) => {
        const { dispatch, existingPages, siteInfo, wpConfig, geoTargeting, serperApiKey, neuronConfig } = context;
        const aiRepairer = (brokenText: string) => callAI('json_repair', [brokenText], 'json');

        await processConcurrently(itemsToGenerate, async (item) => {
            if (shouldStop().current.has(item.id)) return;
            try {
                if (item.type === 'refresh') {
                    await generateContent.refreshItem(item, callAI, context, aiRepairer);
                    return;
                }

                let neuronDataString = '';
                let neuronAnalysisRaw: any = null;
                if (neuronConfig.enabled) {
                     try {
                         dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'generating', statusText: 'NeuronWriter Analysis...' } });
                         neuronAnalysisRaw = await getNeuronWriterAnalysis(item.title, neuronConfig);
                         neuronDataString = formatNeuronDataForPrompt(neuronAnalysisRaw);
                     } catch (e) { console.error(e); }
                }

                let auditDataString = '';
                if (item.analysis) {
                    auditDataString = `
                    **CRITICAL AUDIT & IMPROVEMENT MANDATE:**
                    This is a REWRITE of an underperforming article. You MUST fix the following issues identified by our SEO Auditor:
                    **Critique:** ${item.analysis.critique || 'N/A'}
                    **Missing Content Gaps (MUST ADD):**
                    ${(item.analysis as any).contentGaps ? (item.analysis as any).contentGaps.map((g:string) => `- ${g}`).join('\n') : 'N/A'}
                    **Improvement Plan:** ${(item.analysis as any).improvementPlan || 'N/A'}
                    **YOUR JOB IS TO EXECUTE THIS PLAN PERFECTLY.**
                    `;
                }

                dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'generating', statusText: 'Checking News...' } });
                const recentNews = await fetchRecentNews(item.title, serperApiKey);

                dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'generating', statusText: 'Analyzing Competitors...' } });
                const competitorData = await analyzeCompetitors(item.title, serperApiKey);

                dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'generating', statusText: 'Identifying Content Gaps...' } });
                const competitorGaps = await performTrueGapAnalysis(
                    item.title,
                    serperApiKey,
                    context.apiClients,
                    context.selectedModel,
                    geoTargeting,
                    context.openrouterModels,
                    context.selectedGroqModel
                );

                dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'generating', statusText: 'Generating...' } });
                const serpData: any[] = [];

                const [semanticKeywordsResponse, outlineResponse] = await Promise.all([
                    memoizedCallAI(context.apiClients, context.selectedModel, geoTargeting, context.openrouterModels, context.selectedGroqModel, 'semantic_keyword_generator', [item.title, geoTargeting.enabled ? geoTargeting.location : null], 'json'),
                    memoizedCallAI(context.apiClients, context.selectedModel, geoTargeting, context.openrouterModels, context.selectedGroqModel, 'content_meta_and_outline', [item.title, null, serpData, null, existingPages, item.crawledContent, item.analysis, neuronDataString, competitorData], 'json')
                ]);
                
                const semanticKeywordsRaw = await parseJsonWithAiRepair(semanticKeywordsResponse, aiRepairer);
                const semanticKeywords = Array.isArray(semanticKeywordsRaw?.semanticKeywords)
                    ? semanticKeywordsRaw.semanticKeywords.map((k: any) => (typeof k === 'object' ? k.keyword : k))
                    : [];

                let articlePlan = await parseJsonWithAiRepair(outlineResponse, aiRepairer);
                let generated = normalizeGeneratedContent(articlePlan, item.title);
                generated.semanticKeywords = semanticKeywords;
                if (neuronAnalysisRaw) generated.neuronAnalysis = neuronAnalysisRaw;

                dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'generating', statusText: 'Writing assets...' } });
                const { html: referencesHtml, data: referencesData } = await generateAndValidateReferences(generated.primaryKeyword, generated.metaDescription, serperApiKey, context.apiClients, context.selectedModel);
                generated.references = referencesData;

                const availableLinkData = existingPages
                    .filter(p => p.slug && p.title && p.status !== 'error')
                    .slice(0, 100)
                    .map(p => `- Title: "${p.title}", Slug: "${p.slug}"`)
                    .join('\n');

                const competitorGapsString = competitorGaps.length > 0
                    ? `**🔍 COMPETITOR GAPS TO EXPLOIT:**\n${competitorGaps.map((gap, i) => `${i + 1}. ${gap}`).join('\n')}`
                    : '';

                const enhancedAuditData = auditDataString + '\n\n' + competitorGapsString;

                const [fullHtml, images, youtubeVideos] = await Promise.all([
                    memoizedCallAI(context.apiClients, context.selectedModel, geoTargeting, context.openrouterModels, context.selectedGroqModel, 'ultra_sota_article_writer', [generated, existingPages, referencesHtml, neuronDataString, availableLinkData, recentNews, enhancedAuditData], 'html'),
                    Promise.all(generated.imageDetails.map(detail => generateImage(detail.prompt))),
                    getGuaranteedYoutubeVideos(item.title, serperApiKey, semanticKeywords)
                ]);

                dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'generating', statusText: 'AI Critic Reviewing...' } });
                
                const healedHtml = await criticLoop(fullHtml, (key: any, args: any[], fmt: any) => callAI(context.apiClients, context.selectedModel, context.geoTargeting, context.openrouterModels, context.selectedGroqModel, key, args, fmt), context);

                try { enforceWordCount(healedHtml, TARGET_MIN_WORDS, TARGET_MAX_WORDS); } catch (e) { }

                let finalContent = postProcessGeneratedHtml(healedHtml, generated, youtubeVideos, siteInfo, false) + referencesHtml;
                finalContent = surgicalSanitizer(finalContent);
                
                generated.content = processInternalLinks(finalContent, existingPages);
                images.forEach((img, i) => { if (img) generated.imageDetails[i].generatedImageSrc = img; });
                
                const schemaGenerator = lazySchemaGeneration(generated, wpConfig, siteInfo, geoTargeting);
                const schemaMarkup = schemaGenerator();
                const scriptMatch = schemaMarkup.match(/<script.*?>([\s\S]*)<\/script>/);
                if (scriptMatch) generated.jsonLdSchema = JSON.parse(scriptMatch[1]);
                
                dispatch({ type: 'SET_CONTENT', payload: { id: item.id, content: generated } });
                dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'done', statusText: 'Completed' } });

            } catch (error: any) {
                dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'error', statusText: error.message } });
            }
        }, 1, (c, t) => onProgress({ current: c, total: t }), () => shouldStop().current.size > 0);
    }
};

);
    
    const byNorm = new Map(candidates.map(p => [this.normalizeUrl(p.id), p] as const));
    const prioritized: SitemapPage[] = [];
    const used = new Set<string>();
    
    for (const url of targetUrls) {
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
    
    const rest = candidates
        .filter(p => !used.has(this.normalizeUrl(p.id)))
        .sort((a, b) => (b.daysOld || 0) - (a.daysOld || 0));
    
    this.logCallback(`🎯 Targets loaded: ${targetUrls.length}. Queue size: ${prioritized.length + rest.length}`);
    return [...prioritized, ...rest];
}
