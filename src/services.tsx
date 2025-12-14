import axios from 'axios';
import { fetchWithProxies, smartCrawl } from './contentUtils';
import { ContentItem, SitemapPage, GeneratedContent, GenerationContext } from './types';

// ============================================================================
// COMPATIBILITY LAYER FOR GOD MODE APP.TSX
// ============================================================================

// 1. callAI (Complex Signature 9 args)
export const callAI = async (
    apiClients: any,
    selectedModel: string,
    geoTargeting: any,
    openrouterModels: string[],
    selectedGroqModel: string,
    promptKey: string,
    args: any[],
    format: 'json' | 'html' = 'json',
    grounding: boolean = false
): Promise<string> => {
    console.log(`[MockCallAI] Model=${selectedModel}, Prompt=${promptKey}, Grounding=${grounding}`);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    if (format === 'json') {
        if (promptKey === 'cluster_planner') {
            return JSON.stringify({
                pillarTitle: args[0] || "Pillar Topic",
                clusterTitles: [
                    { title: (args[0] || "Topic") + " Guide" },
                    { title: (args[0] || "Topic") + " Strategies" },
                    { title: (args[0] || "Topic") + " Examples" }
                ]
            });
        }
        return JSON.stringify({
            search_terms: ["keyword1", "keyword2"],
            title: "Generated Title",
            metaDescription: "Generated Meta",
            slug: "generated-slug",
            content: "<p>Generated content placeholder</p>"
        });
    }

    return "<h2>Generated Article</h2><p>This is a placeholder for actual AI content.</p>";
};

// 2. generateContent (Namespace Object)
export const generateContent = {
    analyzePages: async (
        pages: any[],
        serviceCallAI: any,
        setExistingPages: any,
        onProgress: (p: { current: number, total: number }) => void,
        checkAbort: () => boolean
    ) => {
        console.log("Analyzing pages...", pages.length);
        const total = pages.length;
        for (let i = 0; i < total; i++) {
            if (checkAbort && checkAbort()) break;
            onProgress({ current: i + 1, total });
            await new Promise(r => setTimeout(r, 100)); // Simulate work
            // Update page logic mimicking real analysis
            setExistingPages((prev: any[]) => prev.map(p =>
                p.id === pages[i].id ? { ...p, healthScore: 85, analysis: { topic: "Analyzed" } } : p
            ));
        }
    },

    refreshItem: async (
        item: ContentItem,
        serviceCallAI: any,
        context: GenerationContext,
        aiRepairer: any
    ) => {
        console.log("Refreshing item:", item.id);
        if (context.dispatch) {
            context.dispatch({
                type: 'SET_CONTENT',
                payload: {
                    id: item.id,
                    content: {
                        title: item.title + " (Refreshed)",
                        content: "<p>Refreshed content</p>",
                        metaDescription: "Desc",
                        slug: "slug",
                        wordCount: 1000
                    }
                }
            });
            context.dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'complete', statusText: 'Complete' } });
        }
    },

    generateItems: async (
        items: ContentItem[],
        serviceCallAI: any,
        serviceGenerateImage: any,
        context: any,
        onProgress: any,
        getStopRef: any
    ) => {
        console.log("Generating items:", items.length);
        for (let i = 0; i < items.length; i++) {
            const stopRef = getStopRef();
            if (stopRef && stopRef.current && stopRef.current.has(items[i].id)) continue;

            onProgress({ current: i + 1, total: items.length });
            await new Promise(r => setTimeout(r, 500));

            if (context.dispatch) {
                context.dispatch({
                    type: 'SET_CONTENT',
                    payload: {
                        id: items[i].id,
                        content: {
                            title: items[i].title + " (Generated)",
                            content: "<p>Generated content</p>",
                            metaDescription: "Desc",
                            slug: "slug",
                            wordCount: 1200
                        }
                    }
                });
                context.dispatch({ type: 'UPDATE_STATUS', payload: { id: items[i].id, status: 'complete', statusText: 'Complete' } });
            }
        }
    },

    analyzeContentGaps: async (
        existingPages: any[],
        topic: string,
        serviceCallAI: any,
        context: any
    ) => {
        console.log("Analyzing gaps for:", topic);
        return [
            { keyword: topic + " Gap 1", reason: "Missing coverage" },
            { keyword: topic + " Gap 2", reason: "Low depth" }
        ];
    }
};


// 3. Other Utilities
export const createPillarStructure = async (topic: string, apiKey: string) => {
    return {
        mermaid: "graph TD; A-->B;",
        structure: { h1: topic, sections: [] }
    };
};

export const extractSearchTerms = async (content: string, apiKey: string): Promise<string[]> => {
    return ["term1", "term2"];
};

export const fetchVerifiedReferences = async (keyword: string, count: number = 3) => {
    return [];
};

// 4. Missing Functions found via Lint
export const generateImageWithFallback = async (apiClients: any, prompt: string): Promise<string> => {
    return "https://via.placeholder.com/1024x1024?text=Generated+Image";
};

export const publishItemToWordPress = async (
    item: any,
    password: string,
    status: string,
    fetcher: any,
    config: any
): Promise<{ success: boolean; message?: string }> => {
    return { success: true, message: "Use real WP credentials to publish." };
};

// 5. Maintenance Engine
export class MaintenanceEngine {
    logCallback: (msg: string) => void;
    constructor(logCallback: (msg: string) => void) {
        this.logCallback = logCallback;
    }
    start(context?: any) { console.log("Maintenance Engine Started"); }
    stop() { console.log("Maintenance Engine Stopped"); }
    updateContext(context: any) { }
    setPriorityUrls(urls: string[]) { }
}

export const maintenanceEngine = new MaintenanceEngine((msg) => console.log(msg));
