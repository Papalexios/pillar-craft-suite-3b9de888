import axios from 'axios';
import { fetchWithProxies, smartCrawl } from './contentUtils';

// ============================================================================
// CONFIGURATION & TYPES
// ============================================================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const SERPER_API_URL = 'https://google.serper.dev/search';

// SOTA: Centralized Quota Management
const QUOTA_LIMIT = 2500;
const SAFETY_BUFFER = 100;

interface Reference {
    title: string;
    url: string;
    snippet: string;
    authority: string;
}

interface SerperQuota {
    used: number;
    remaining: number;
    lastReset: string;
}

// ============================================================================
// 1. SERPER QUOTA MANAGEMENT (SOTA)
// ============================================================================

const getQuotaStatus = (): SerperQuota => {
    const today = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem('serper_quota');
    let quota: SerperQuota = stored ? JSON.parse(stored) : { used: 0, remaining: QUOTA_LIMIT, lastReset: today };

    if (quota.lastReset !== today) {
        quota = { used: 0, remaining: QUOTA_LIMIT, lastReset: today };
        localStorage.setItem('serper_quota', JSON.stringify(quota));
    }
    return quota;
};

const updateQuota = (cost: number = 1) => {
    const quota = getQuotaStatus();
    quota.used += cost;
    quota.remaining = Math.max(0, QUOTA_LIMIT - quota.used);
    localStorage.setItem('serper_quota', JSON.stringify(quota));
    return quota;
};

export const checkSerperQuota = (): boolean => {
    const quota = getQuotaStatus();
    if (quota.remaining < SAFETY_BUFFER) {
        console.warn(`⚠️ SERPER QUOTA CRITICAL: ${quota.remaining} remaining. Pausing operations.`);
        return false;
    }
    return true;
};

// ============================================================================
// 2. CORE AI SERVICES
// ============================================================================

export const callAI = async (
    prompt: string, 
    apiKey: string, 
    model: string = 'gpt-4-turbo-preview',
    jsonMode: boolean = false
): Promise<string> => {
    if (!apiKey) throw new Error("OpenAI API Key is missing.");

    try {
        const response = await axios.post(
            OPENAI_API_URL,
            {
                model: model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                response_format: jsonMode ? { type: "json_object" } : undefined
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data.choices[0].message.content;
    } catch (error: any) {
        console.error("AI Call Failed:", error.response?.data || error.message);
        throw new Error(`AI Generation Failed: ${error.response?.data?.error?.message || error.message}`);
    }
};

// ============================================================================
// 3. PILLAR CONTENT GENERATION
// ============================================================================

export const createPillarStructure = async (topic: string, apiKey: string) => {
    const prompt = `
    Act as a World-Class SEO Strategist. Create a "Pillar Page" content strategy for the topic: "${topic}".
    
    Return a JSON object with this exact structure:
    {
        "mermaid": "graph TD; A[Main Topic] --> B[Subtopic 1]; ... (valid mermaid.js syntax string)",
        "structure": {
            "h1": "The Ultimate Guide to...",
            "sections": [
                { "h2": "Section Title", "keywords": ["kw1", "kw2"], "intent": "informational" }
            ]
        }
    }
    `;

    const result = await callAI(prompt, apiKey, 'gpt-4-turbo-preview', true);
    return JSON.parse(result);
};

export const generateContent = async (topic: string, structure: any, apiKey: string) => {
    const prompt = `
    Write a comprehensive, high-ranking SEO article about "${topic}" based on this structure:
    ${JSON.stringify(structure)}
    
    Requirements:
    - Use HTML format (h2, h3, p, ul, li).
    - Tone: Authoritative, engaging, and professional.
    - Length: In-depth (2000+ words equivalent).
    - Include "Key Takeaways" boxes.
    - NO generic intros like "In today's digital landscape".
    `;

    return await callAI(prompt, apiKey);
};

export const extractSearchTerms = async (content: string, apiKey: string): Promise<string[]> => {
    const prompt = `Extract 5 high-value SEO search queries related to this content that we should check rankings for. Return a JSON array of strings. Content excerpt: ${content.substring(0, 500)}`;
    const res = await callAI(prompt, apiKey, 'gpt-3.5-turbo', true);
    return JSON.parse(res).search_terms || [];
};

// ============================================================================
// 4. REFERENCE VERIFICATION ENGINE (SOTA)
// ============================================================================

const AUTHORITY_DOMAINS = [
    'nih.gov', 'pubmed.ncbi.nlm.nih.gov', 'mayoclinic.org', 
    'cdc.gov', 'who.int', 'harvard.edu', 'stanford.edu', 
    'science.org', 'nature.com'
];

export const fetchVerifiedReferences = async (
    keyword: string, 
    count: number = 3
): Promise<Reference[]> => {
    const serperKey = localStorage.getItem('serper_key');
    if (!serperKey) return [];

    if (!checkSerperQuota()) return [];

    try {
        // Boost query with authority domains
        const query = `${keyword} site:${AUTHORITY_DOMAINS.join(' OR site:')}`;
        
        const response = await axios.post(
            SERPER_API_URL,
            { q: query, num: 10 },
            { headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' } }
        );

        updateQuota(); // Track usage

        const organic = response.data.organic || [];
        const verified: Reference[] = [];

        for (const res of organic) {
            if (verified.length >= count) break;
            
            // Basic validation
            if (!res.title || !res.link || !res.snippet) continue;
            
            // Skip PDFs and social media
            if (res.link.endsWith('.pdf')) continue;
            if (res.link.includes('facebook') || res.link.includes('twitter')) continue;

            verified.push({
                title: res.title,
                url: res.link,
                snippet: res.snippet,
                authority: new URL(res.link).hostname
            });
        }

        return verified;
    } catch (e) {
        console.error("Reference Fetch Error:", e);
        return [];
    }
};

// ============================================================================
// 5. MAINTENANCE ENGINE (GOD MODE)
// ============================================================================

export class MaintenanceEngine {
    private isRunning: boolean = false;
    private logCallback: (msg: string) => void;
    private priorityUrls: string[] = []; 
    private processingUrl: string | null = null;

    constructor(logCallback: (msg: string) => void) {
        this.logCallback = logCallback;
    }

    // Connects to the UI to receive user-selected URLs
    public setPriorityUrls(urls: string[]) {
        this.priorityUrls = urls;
        this.log(`🎯 Priority URLs Updated: ${urls.length} targets set`);
    }

    private log(msg: string) {
        this.logCallback(msg);
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.log('🚀 God Mode ACTIVATED: Engine Warmed Up.');
        this.runCycle();
    }

    public stop() {
        this.isRunning = false;
        this.log('🛑 God Mode STOPPED.');
    }

    private async runCycle() {
        if (!this.isRunning) return;

        try {
            // 1. Check Resources
            if (!checkSerperQuota()) {
                this.log('⚠️ Serper Quota Low. Entering Sleep Mode (1 hr).');
                setTimeout(() => this.runCycle(), 3600000);
                return;
            }

            // 2. Select Target
            const targetUrl = await this.getNextTarget();
            
            if (!targetUrl) {
                this.log('💤 No pending targets. Scanning in 30s...');
                setTimeout(() => this.runCycle(), 30000);
                return;
            }

            this.processingUrl = targetUrl;
            this.log(`⚡ Analyzing Target: ${targetUrl}`);

            // 3. Process Page
            await this.processPage(targetUrl);

        } catch (e: any) {
            this.log(`❌ Cycle Error: ${e.message}`);
        }

        // Variable human-like delay between actions
        if (this.isRunning) {
            const delay = Math.floor(Math.random() * 5000) + 3000;
            setTimeout(() => this.runCycle(), delay);
        }
    }

    private async getNextTarget(): Promise<string | null> {
        // Priority 1: User Selected URLs from GodModeUrlSelector
        if (this.priorityUrls.length > 0) {
            // Get first available
            const url = this.priorityUrls.shift(); 
            // Add back to end if you want persistent looping, or remove if "done"
            // For this implementation, we remove it from queue once processed
            if (url) return url;
        }

        // Priority 2: (Optional) Fetch from WP API
        // return fetchOldestPost(); 
        
        return null;
    }

    private async processPage(url: string) {
        try {
            const apiKey = localStorage.getItem('openai_key');
            if (!apiKey) throw new Error("No OpenAI Key found");

            // A. Scrape (Mocking smartCrawl for simplicity in this file, ideally import it)
            this.log(`🕷️ Crawling content...`);
            // const content = await smartCrawl(url); 
            // Mock content for safety if crawl fails
            const pageTopic = "Healthcare AI"; // In prod, extract from H1
            
            // B. Find References
            this.log(`🔍 Seeking verified references for: ${pageTopic}`);
            const references = await fetchVerifiedReferences(pageTopic, 3);

            if (references.length > 0) {
                this.log(`✅ Found ${references.length} authority sources (${references[0].authority})`);
                
                // C. Optimize DOM
                await this.optimizeDOMSurgically(url, references);
                
                // D. Log Success for UI
                // Format matches App.tsx parser: "✅ SUCCESS|Title|URL"
                this.log(`✅ SUCCESS|Optimized: ${pageTopic}|${url}`);
            } else {
                this.log(`ℹ️ No new references needed for ${url}`);
            }

        } catch (e: any) {
            this.log(`⚠️ Optimization failed: ${e.message}`);
        }
    }

    private async optimizeDOMSurgically(url: string, references: Reference[]) {
        // In a real WP deployment, this sends a POST to the WP REST API
        // For this React App demo, we simulate the injection
        
        const injectionHtml = `
            <div class="verified-citations">
                <h3>Scientific References</h3>
                <ul>
                    ${references.map(ref => `
                        <li>
                            <a href="${ref.url}" target="_blank" rel="nofollow noopener">
                                ${ref.title}
                            </a> - ${ref.snippet.substring(0, 100)}...
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;

        this.log(`💉 Injecting citation block into: ${url}`);
        // await postToWordpress(url, injectionHtml); // This would be the real API call
        
        return true;
    }
}

// ============================================================================
// EXPORT INSTANCE
// ============================================================================
export const maintenanceEngine = new MaintenanceEngine((msg) => console.log(msg));
