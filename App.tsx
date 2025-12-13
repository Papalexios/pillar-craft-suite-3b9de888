import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import React, { useState, useMemo, useEffect, useCallback, useReducer, useRef, Component, ErrorInfo } from 'react';
import { generateFullSchema, generateSchemaMarkup } from './schema-generator';
import { PROMPT_TEMPLATES } from './prompts';
import { AI_MODELS } from './constants';
import { itemsReducer } from './state';
import { callAI, generateContent, generateImageWithFallback, publishItemToWordPress, maintenanceEngine } from './services';
import {
    AppFooter, AnalysisModal, BulkPublishModal, ReviewModal, SidebarNav, SkeletonLoader, ApiKeyInput, CheckIcon, XIcon, WordPressEndpointInstructions
} from './components';
import { LandingPage } from './LandingPage';
import {
    SitemapPage, ContentItem, GeneratedContent, SiteInfo, ExpandedGeoTargeting, ApiClients, WpConfig, NeuronConfig, GapAnalysisSuggestion, GenerationContext
} from './types';
import { callAiWithRetry, debounce, fetchWordPressWithRetry, sanitizeTitle, extractSlugFromUrl, parseJsonWithAiRepair, isNullish, isValidSortKey, processConcurrently } from './utils';
import { fetchWithProxies, smartCrawl } from './contentUtils';
import { listNeuronProjects, NeuronProject } from './neuronwriter';
// @ts-ignore
import mermaid from 'mermaid';
import { AutonomousGodMode } from './src/AutonomousGodMode';

console.log("🚀 SOTA ENGINE V2.6 - BULK PLANNER RESTORED");

interface ErrorBoundaryProps {
    children?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class SotaErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;
  public declare props: Readonly<ErrorBoundaryProps>;
  constructor(props: ErrorBoundaryProps) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { console.error('SOTA_ERROR_BOUNDARY:', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="sota-error-fallback" style={{ padding: '2rem', textAlign: 'center', color: '#EAEBF2', backgroundColor: '#0A0A0F', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#F87171' }}>System Critical Error</h1>
          <p style={{ color: '#A0A8C2', marginBottom: '2rem', maxWidth: '600px' }}>The application encountered an unexpected state. Please reload.</p>
          <button className="btn" onClick={() => { localStorage.removeItem('items'); window.location.reload(); }}>Reset Application</button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface OptimizedLog { title: string; url: string; timestamp: string; }

const App = () => {
    const [showLanding, setShowLanding] = useState(() => {
        const hasSeenLanding = localStorage.getItem('hasSeenLanding');
        return hasSeenLanding !== 'true';
    });
    const [activeView, setActiveView] = useState('setup');
    const [apiKeys, setApiKeys] = useState(() => {
        const saved = localStorage.getItem('apiKeys');
        const defaults = { openaiApiKey: '', anthropicApiKey: '', openrouterApiKey: '', serperApiKey: '', groqApiKey: '' };
        try { return saved ? JSON.parse(saved) : defaults; } catch { return defaults; }
    });
    const [apiKeyStatus, setApiKeyStatus] = useState({ gemini: 'idle', openai: 'idle', anthropic: 'idle', openrouter: 'idle', serper: 'idle', groq: 'idle' } as Record<string, 'idle' | 'validating' | 'valid' | 'invalid'>);
    const [editingApiKey, setEditingApiKey] = useState<string | null>(null);
    const [apiClients, setApiClients] = useState<ApiClients>({ gemini: null, openai: null, anthropic: null, openrouter: null, groq: null });
    const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('selectedModel') || 'gemini');
    const [selectedGroqModel, setSelectedGroqModel] = useState(() => localStorage.getItem('selectedGroqModel') || AI_MODELS.GROQ_MODELS[0]);
    const [openrouterModels, setOpenrouterModels] = useState<string[]>(AI_MODELS.OPENROUTER_DEFAULT);
    const [geoTargeting, setGeoTargeting] = useState<ExpandedGeoTargeting>(() => {
        try { return JSON.parse(localStorage.getItem('geoTargeting') || '{"enabled":false,"location":"","region":"","country":"","postalCode":""}'); } catch { return { enabled: false, location: '', region: '', country: '', postalCode: '' }; }
    });
    const [useGoogleSearch, setUseGoogleSearch] = useState(false);
    const [neuronConfig, setNeuronConfig] = useState<NeuronConfig>(() => {
        try { return JSON.parse(localStorage.getItem('neuronConfig') || '{"apiKey":"","projectId":"","enabled":false}'); } catch { return { apiKey: '', projectId: '', enabled: false }; }
    });
    const [neuronProjects, setNeuronProjects] = useState<NeuronProject[]>([]);
    const [isFetchingNeuronProjects, setIsFetchingNeuronProjects] = useState(false);
    const [neuronFetchError, setNeuronFetchError] = useState('');
    const [contentMode, setContentMode] = useState('bulk');
    const [refreshMode, setRefreshMode] = useState<'single' | 'bulk'>('single');
    const [topic, setTopic] = useState('');
    const [primaryKeywords, setPrimaryKeywords] = useState('');
    const [sitemapUrl, setSitemapUrl] = useState('');
    const [refreshUrl, setRefreshUrl] = useState('');
    const [isCrawling, setIsCrawling] = useState(false);
    const [crawlMessage, setCrawlMessage] = useState('');
    const [crawlProgress, setCrawlProgress] = useState({ current: 0, total: 0 });
    const [existingPages, setExistingPages] = useState<SitemapPage[]>([]);
    const [wpConfig, setWpConfig] = useState<WpConfig>(() => {
        try { return JSON.parse(localStorage.getItem('wpConfig') || '{"url":"","username":""}'); } catch { return { url: '', username: '' }; }
    });
    const [wpPassword, setWpPassword] = useState(() => localStorage.getItem('wpPassword') || '');
    const [wpEndpointStatus, setWpEndpointStatus] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle');
    const [isEndpointModalOpen, setIsEndpointModalOpen] = useState(false);
    const [siteInfo, setSiteInfo] = useState<SiteInfo>(() => {
        try { return JSON.parse(localStorage.getItem('siteInfo') || '{"orgName":"","orgUrl":"","logoUrl":"","orgSameAs":[],"authorName":"","authorUrl":"","authorSameAs":[]}'); } catch { return { orgName: '', orgUrl: '', logoUrl: '', orgSameAs: [], authorName: '', authorUrl: '', authorSameAs: [] }; }
    });
    const [imagePrompt, setImagePrompt] = useState('');
    const [numImages, setNumImages] = useState(1);
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [isGeneratingImages, setIsGeneratingImages] = useState(false);
    const [generatedImages, setGeneratedImages] = useState<{ src: string, prompt: string }[]>([]);
    const [imageGenerationError, setImageGenerationError] = useState('');
    const [gapSuggestions, setGapSuggestions] = useState<550
        Suggestion[]>([]);
    const [isAnalyzingGaps, setIsAnalyzingGaps] = useState(false);
    const [items, dispatch] = useReducer(itemsReducer, []);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
    const [selectedItems, setSelectedItems] = useState(new Set<string>());
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'title', direction: 'asc' });
    const [selectedItemForReview, setSelectedItemForReview] = useState<ContentItem | null>(null);
    const [isBulkPublishModalOpen, setIsBulkPublishModalOpen] = useState(false);
    const stopGenerationRef = useRef(new Set<string>());
    const [hubSearchFilter, setHubSearchFilter] = useState('');
    const [hubStatusFilter, setHubStatusFilter] = useState('All');
    const [hubSortConfig, setHubSortConfig] = useState<{key: string, direction: 'asc' | 'desc'}>({ key: 'default', direction: 'desc' });
    const [isAnalyzingHealth, setIsAnalyzingHealth] = useState(false);
    const [healthAnalysisProgress, setHealthAnalysisProgress] = useState({ current: 0, total: 0 });
    const [selectedHubPages, setSelectedHubPages] = useState(new Set<string>());
    const [viewingAnalysis, setViewingAnalysis] = useState<SitemapPage | null>(null);
    const [isBulkAutoPublishing, setIsBulkAutoPublishing] = useState(false);
    const [bulkAutoPublishProgress, setBulkAutoPublishProgress] = useState({ current: 0, total: 0 });
    const [bulkPublishLogs, setBulkPublishLogs] = useState<string[]>([]);
    const [isGodMode, setIsGodMode] = useState(() => localStorage.getItem('sota_god_mode') === 'true');
    const [godModeLogs, setGodModeLogs] = useState<string[]>([]);
    const [excludedUrls, setExcludedUrls] = useState<string[]>(() => JSON.parse(localStorage.getItem('excludedUrls') || '[]'));
    const [excludedCategories, setExcludedCategories] = useState<string[]>(() => JSON.parse(localStorage.getItem('excludedCategories') || '[]'));
    const [optimizedHistory, setOptimizedHistory] = useState<OptimizedLog[]>([]);
    const [wpDiagnostics, setWpDiagnostics] = useState<any>(null);
    const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);

    useEffect(() => { mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose', fontFamily: 'Inter' }); }, []);
    useEffect(() => { if (selectedItemForReview?.generatedContent) setTimeout(() => { mermaid.run({ nodes: document.querySelectorAll('.mermaid') as any }); }, 500); }, [selectedItemForReview]);
    useEffect(() => { localStorage.setItem('apiKeys', JSON.stringify(apiKeys)); }, [apiKeys]);
    useEffect(() => { localStorage.setItem('selectedModel', selectedModel); }, [selectedModel]);
    useEffect(() => { localStorage.setItem('selectedGroqModel', selectedGroqModel); }, [selectedGroqModel]);
    useEffect(() => { localStorage.setItem('wpConfig', JSON.stringify(wpConfig)); }, [wpConfig]);
    useEffect(() => { localStorage.setItem('wpPassword', wpPassword); }, [wpPassword]);
    useEffect(() => { localStorage.setItem('geoTargeting', JSON.stringify(geoTargeting)); }, [geoTargeting]);
    useEffect(() => { localStorage.setItem('siteInfo', JSON.stringify(siteInfo)); }, [siteInfo]);
    useEffect(() => { localStorage.setItem('neuronConfig', JSON.stringify(neuronConfig)); }, [neuronConfig]);
    useEffect(() => { localStorage.setItem('excludedUrls', JSON.stringify(excludedUrls)); }, [excludedUrls]);
    useEffect(() => { localStorage.setItem('excludedCategories', JSON.stringify(excludedCategories)); }, [excludedCategories]);

    const fetchProjectsRef = useRef<string>('');
    const fetchProjects = useCallback(async (key: string) => {
        if (!key || key.trim().length < 10) { setNeuronProjects([]); setNeuronFetchError(''); return; }
        if (fetchProjectsRef.current === key && (neuronProjects.length > 0 || neuronFetchError)) return;
        setIsFetchingNeuronProjects(true); setNeuronFetchError(''); fetchProjectsRef.current = key;
        try {
            const projects = await listNeuronProjects(key);
            setNeuronProjects(projects);
            if (projects.length > 0 && !neuronConfig.projectId) setNeuronConfig(prev => ({ ...prev, projectId: projects[0].project }));
        } catch (err: any) { setNeuronFetchError(err.message || 'Failed to fetch projects'); setNeuronProjects([]); } finally { setIsFetchingNeuronProjects(false); }
    }, [neuronConfig.projectId, neuronProjects.length, neuronFetchError]);

    useEffect(() => { if (neuronConfig.enabled && neuronConfig.apiKey) { const timer = setTimeout(() => { fetchProjects(neuronConfig.apiKey); }, 800); return () => clearTimeout(timer); } }, [neuronConfig.enabled, neuronConfig.apiKey, fetchProjects]);

    const bootstrapApp = () => {
        const criticalKeys = ['apiKeys', 'wpConfig', 'siteInfo'];
        criticalKeys.forEach(key => { try { const data = localStorage.getItem(key); if (data) JSON.parse(data); } catch { localStorage.removeItem(key); } });
    };
    useEffect(() => { bootstrapApp(); }, []);

    useEffect(() => {
        (async () => {
            if (process.env.API_KEY) {
                try {
                    setApiKeyStatus(prev => ({...prev, gemini: 'validating' }));
                    const geminiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
                    await callAiWithRetry(() => geminiClient.models.generateContent({ model: AI_MODELS.GEMINI_FLASH, contents: 'test' }));
                    setApiClients(prev => ({ ...prev, gemini: geminiClient }));
                    setApiKeyStatus(prev => ({...prev, gemini: 'valid' }));
                } catch (e) { setApiClients(prev => ({ ...prev, gemini: null })); setApiKeyStatus(prev => ({...prev, gemini: 'invalid' })); }
            } else { setApiClients(prev => ({ ...prev, gemini: null })); setApiKeyStatus(prev => ({...prev, gemini: 'invalid' })); }
        })();
    }, []);

    useEffect(() => {
        // @ts-ignore
        maintenanceEngine.logCallback = (msg: string) => {
            console.log(msg);
            if (msg.startsWith('✅ GOD MODE SUCCESS|') || msg.startsWith('✅ SUCCESS|')) {
                const parts = msg.split('|');
                if (parts.length >= 3) {
                    setOptimizedHistory(prev => [{ title: parts[1], url: parts[2], timestamp: new Date().toLocaleTimeString() }, ...prev]);
                }
                setGodModeLogs(prev => [`✅ Optimized: ${parts[1]}`, ...prev].slice(0, 100));
            } else { setGodModeLogs(prev => [msg, ...prev].slice(0, 100)); }
        };
    }, []);

    useEffect(() => {
        localStorage.setItem('sota_god_mode', String(isGodMode));
        if (isGodMode) {
            const context: GenerationContext = { dispatch, existingPages, siteInfo, wpConfig, geoTargeting, serperApiKey: apiKeys.serperApiKey, apiKeyStatus, apiClients, selectedModel, openrouterModels, selectedGroqModel, neuronConfig, excludedUrls, excludedCategories };
            maintenanceEngine.start(context);
        } else { maintenanceEngine.stop(); }
        if (isGodMode && existingPages.length > 0) {
             const context: GenerationContext = { dispatch, existingPages, siteInfo, wpConfig, geoTargeting, serperApiKey: apiKeys.serperApiKey, apiKeyStatus, apiClients, selectedModel, openrouterModels, selectedGroqModel, neuronConfig, excludedUrls, excludedCategories };
            maintenanceEngine.updateContext(context);
        }
    }, [isGodMode, existingPages, apiClients, isCrawling, excludedUrls, excludedCategories]); 

    const validateApiKey = useCallback(debounce(async (provider: string, key: string) => {
        if (!key) { setApiKeyStatus(prev => ({ ...prev, [provider]: 'idle' })); setApiClients(prev => ({ ...prev, [provider]: null })); return; }
        setApiKeyStatus(prev => ({ ...prev, [provider]: 'validating' }));
        try {
            let client;
            let isValid = false;
            switch (provider) {
                case 'openai': client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true }); await callAiWithRetry(() => client.models.list()); isValid = true; break;
                case 'anthropic': client = new Anthropic({ apiKey: key }); await callAiWithRetry(() => client.messages.create({ model: AI_MODELS.ANTHROPIC_HAIKU, max_tokens: 1, messages: [{ role: "user", content: "test" }], })); isValid = true; break;
                case 'openrouter': client = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: key, dangerouslyAllowBrowser: true, defaultHeaders: { 'HTTP-Referer': window.location.href, 'X-Title': 'WP Content Optimizer Pro', } }); await callAiWithRetry(() => client.chat.completions.create({ model: 'google/gemini-2.5-flash', messages: [{ role: "user", content: "test" }], max_tokens: 1 })); isValid = true; break;
                case 'groq': client = new OpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey: key, dangerouslyAllowBrowser: true, }); await callAiWithRetry(() => client.chat.completions.create({ model: selectedGroqModel, messages: [{ role: "user", content: "test" }], max_tokens: 1 })); isValid = true; break;
                case 'serper': const serperResponse = await fetch("https://google.serper.dev/search", { method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'test' }) }); if (serperResponse.ok) isValid = true; break;
            }
            if (isValid) { setApiKeyStatus(prev => ({ ...prev, [provider]: 'valid' })); if (client) setApiClients(prev => ({ ...prev, [provider]: client as any })); setEditingApiKey(null); } else { throw new Error("Validation check failed."); }
        } catch (error: any) { setApiKeyStatus(prev => ({ ...prev, [provider]: 'invalid' })); setApiClients(prev => ({ ...prev, [provider]: null })); }
    }, 500), [selectedGroqModel]);
    
    useEffect(() => { Object.entries(apiKeys).forEach(([key, value]) => { if (value) validateApiKey(key.replace('ApiKey', ''), value as string); }); }, []);

    const handleApiKeyChange = (e: any) => { const { name, value } = e.target; const provider = name.replace('ApiKey', ''); setApiKeys(prev => ({ ...prev, [name]: value })); validateApiKey(provider, value); };
    const handleOpenrouterModelsChange = (e: any) => setOpenrouterModels(e.target.value.split('\n').map((m:any) => m.trim()).filter(Boolean));
    const handleHubSort = (key: any) => { setHubSortConfig({ key, direction: (hubSortConfig.key === key && hubSortConfig.direction === 'asc') ? 'desc' : 'asc' }); };
    
    const filteredAndSortedHubPages = useMemo(() => {
        let filtered = [...existingPages];
        if (hubStatusFilter !== 'All') filtered = filtered.filter(page => page.updatePriority === hubStatusFilter);
        if (hubSearchFilter) filtered = filtered.filter(page => page.title.toLowerCase().includes(hubSearchFilter.toLowerCase()) || page.id.toLowerCase().includes(hubSearchFilter.toLowerCase()));
        return filtered;
    }, [existingPages, hubSearchFilter, hubStatusFilter, hubSortConfig]);

    const runWordPressDiagnostics = useCallback(async () => {
        if (!wpConfig.url || !wpConfig.username || !wpPassword) {
            alert('Please configure WordPress credentials first');
            return;
        }

        setIsRunningDiagnostics(true);
        setWpDiagnostics({ status: 'running', posts: [], postTypes: [], error: null });

        try {
            const authHeader = `Basic ${btoa(`${wpConfig.username}:${wpPassword}`)}`;
            const baseUrl = wpConfig.url.replace(/\/+$/, '');

            const results: any = {
                status: 'success',
                posts: [],
                postTypes: [],
                customPostTypes: [],
                error: null
            };

            console.log('[WP Diagnostics] Testing REST API access...');

            const headers = new Headers();
            headers.set('Authorization', authHeader);

            try {
                const postsRes = await fetchWordPressWithRetry(`${baseUrl}/wp-json/wp/v2/posts?per_page=20&status=any&_fields=id,slug,title,status`, {
                    method: 'GET',
                    headers: headers
                });
                const postsData = await postsRes.json();
                results.posts = Array.isArray(postsData) ? postsData : [];
                console.log('[WP Diagnostics] Posts found:', results.posts.length);
            } catch (e: any) {
                console.error('[WP Diagnostics] Failed to fetch posts:', e);
                results.error = `Failed to fetch posts: ${e.message}`;
            }

            try {
                const typesRes = await fetchWordPressWithRetry(`${baseUrl}/wp-json/wp/v2/types`, {
                    method: 'GET',
                    headers: headers
                });
                const typesData = await typesRes.json();
                results.postTypes = Object.keys(typesData || {});
                results.customPostTypes = Object.entries(typesData || {})
                    .filter(([key, value]: any) => !['post', 'page', 'attachment'].includes(key))
                    .map(([key, value]: any) => ({ slug: key, name: value.name, rest_base: value.rest_base }));
                console.log('[WP Diagnostics] Post types found:', results.postTypes);
            } catch (e: any) {
                console.error('[WP Diagnostics] Failed to fetch post types:', e);
            }

            setWpDiagnostics(results);
        } catch (error: any) {
            console.error('[WP Diagnostics] Error:', error);
            setWpDiagnostics({
                status: 'error',
                posts: [],
                postTypes: [],
                error: error.message
            });
        } finally {
            setIsRunningDiagnostics(false);
        }
    }, [wpConfig, wpPassword]);

    const filteredAndSortedItems = useMemo(() => {
        let sorted = items.filter(Boolean);
        if (filter) sorted = sorted.filter(item => item && item.title && item.title.toLowerCase().includes(filter.toLowerCase()));
        return sorted;
    }, [items, filter, sortConfig]);

    const handleAnalyzeSelectedPages = async () => {
        const pagesToAnalyze = existingPages.filter(p => selectedHubPages.has(p.id));
        if (pagesToAnalyze.length === 0) { alert("No pages selected to analyze."); return; }
        if (!apiClients[selectedModel as keyof typeof apiClients]) { const fallback = Object.keys(apiClients).find(k => apiClients[k as keyof typeof apiClients]); if (!fallback) { alert("No AI provider connected."); return; } if (!confirm(`Use ${fallback}?`)) return; }
        setIsAnalyzingHealth(true); setHealthAnalysisProgress({ current: 0, total: pagesToAnalyze.length });
        const serviceCallAI = (promptKey: any, args: any[], format: 'json' | 'html' = 'json', grounding = false) => callAI(apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel, promptKey, args, format, grounding);
        await generateContent.analyzePages(pagesToAnalyze, serviceCallAI, setExistingPages, (progress) => setHealthAnalysisProgress(progress), () => false);
        setIsAnalyzingHealth(false);
    };

    const handlePlanRewrite = (page: SitemapPage) => { const newItem: ContentItem = { id: page.id, title: sanitizeTitle(page.title, page.slug), type: 'standard', originalUrl: page.id, status: 'idle', statusText: 'Ready to Rewrite', generatedContent: null, crawledContent: page.crawledContent, analysis: page.analysis }; dispatch({ type: 'SET_ITEMS', payload: [newItem] }); setActiveView('review'); };
    const handleToggleHubPageSelect = (pageId: string) => { setSelectedHubPages(prev => { const newSet = new Set(prev); if (newSet.has(pageId)) newSet.delete(pageId); else newSet.add(pageId); return newSet; }); };
    const handleToggleHubPageSelectAll = () => { if (selectedHubPages.size === filteredAndSortedHubPages.length) setSelectedHubPages(new Set()); else setSelectedHubPages(new Set(filteredAndSortedHubPages.map(p => p.id))); };
    const handleRewriteSelected = () => { const selectedPages = existingPages.filter(p => selectedHubPages.has(p.id) && p.analysis); if (selectedPages.length === 0) { alert("Select analyzed pages."); return; } const newItems: ContentItem[] = selectedPages.map(page => ({ id: page.id, title: sanitizeTitle(page.title, page.slug), type: 'standard', originalUrl: page.id, status: 'idle', statusText: 'Ready to Rewrite', generatedContent: null, crawledContent: page.crawledContent, analysis: page.analysis })); dispatch({ type: 'SET_ITEMS', payload: newItems }); setSelectedHubPages(new Set()); setActiveView('review'); };
    const handleRefreshContent = async () => { if (!refreshUrl) { alert("Enter URL."); return; } setIsGenerating(true); const newItem: ContentItem = { id: refreshUrl, title: 'Refreshing...', type: 'refresh', originalUrl: refreshUrl, status: 'generating', statusText: 'Crawling...', generatedContent: null, crawledContent: null }; dispatch({ type: 'SET_ITEMS', payload: [newItem] }); setActiveView('review'); try { const crawledContent = await smartCrawl(refreshUrl); dispatch({ type: 'SET_CRAWLED_CONTENT', payload: { id: refreshUrl, content: crawledContent } }); dispatch({ type: 'UPDATE_STATUS', payload: { id: refreshUrl, status: 'generating', statusText: 'Validating...' } }); const serviceCallAI = (promptKey: any, args: any[], format: 'json' | 'html' = 'json', grounding = false) => callAI(apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel, promptKey, args, format, grounding); const aiRepairer = (brokenText: string) => callAI(apiClients, 'gemini', { enabled: false, location: '', region: '', country: '', postalCode: '' }, [], '', 'json_repair', [brokenText], 'json'); await generateContent.refreshItem({...newItem, crawledContent}, serviceCallAI, { dispatch, existingPages, siteInfo, wpConfig, geoTargeting, serperApiKey: apiKeys.serperApiKey, apiKeyStatus, apiClients, selectedModel, openrouterModels, selectedGroqModel, neuronConfig }, aiRepairer); } catch (error: any) { dispatch({ type: 'UPDATE_STATUS', payload: { id: refreshUrl, status: 'error', statusText: error.message } }); } finally { setIsGenerating(false); } };
    const handleAnalyzeGaps = async () => { if (existingPages.length === 0 && !sitemapUrl) { alert("Crawl sitemap first."); return; } setIsAnalyzingGaps(true); try { const suggestions = await generateContent.analyzeContentGaps(existingPages, topic, (promptKey: any, args: any[], format: 'json' | 'html' = 'json', grounding = false) => callAI(apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel, promptKey, args, format, grounding), { dispatch, existingPages, siteInfo, wpConfig, geoTargeting, serperApiKey: apiKeys.serperApiKey, apiKeyStatus, apiClients, selectedModel, openrouterModels, selectedGroqModel, neuronConfig }); setGapSuggestions(suggestions); } catch (e: any) { alert(`Gap Analysis failed: ${e.message}`); } finally { setIsAnalyzingGaps(false); } };
    const handleGenerateGapArticle = (suggestion: GapAnalysisSuggestion) => { const newItem: Partial<ContentItem> = { id: suggestion.keyword, title: suggestion.keyword, type: 'standard' }; dispatch({ type: 'SET_ITEMS', payload: [newItem] }); setActiveView('review'); };
    const handleBulkRefreshAndPublish = async () => { const selectedPages = existingPages.filter(p => selectedHubPages.has(p.id)); if (selectedPages.length === 0) { alert("Select pages."); return; } if (!wpConfig.url || !wpConfig.username || !wpPassword) { alert("WP creds missing."); return; } setIsBulkAutoPublishing(true); setBulkAutoPublishProgress({ current: 0, total: selectedPages.length }); setBulkPublishLogs(prev => [`[${new Date().toLocaleTimeString()}] Starting batch...`]); const addLog = (msg: string) => setBulkPublishLogs(prev => [ ...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-50)); const processItem = async (page: SitemapPage) => { addLog(`Processing: ${page.title}...`); const item: ContentItem = { id: page.id, title: page.title || 'Untitled', type: 'refresh', originalUrl: page.id, status: 'generating', statusText: 'Initializing...', generatedContent: null, crawledContent: page.crawledContent }; try { const serviceCallAI = (promptKey: any, args: any[], format: 'json' | 'html' = 'json', grounding = false) => callAI(apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel, promptKey, args, format, grounding); const aiRepairer = (brokenText: string) => callAI(apiClients, 'gemini', { enabled: false, location: '', region: '', country: '', postalCode: '' }, [], '', 'json_repair', [brokenText], 'json'); let generatedResult: GeneratedContent | null = null; const localDispatch = (action: any) => { if (action.type === 'SET_CONTENT') generatedResult = action.payload.content; }; await generateContent.refreshItem(item, serviceCallAI, { dispatch: localDispatch, existingPages, siteInfo, wpConfig, geoTargeting, serperApiKey: apiKeys.serperApiKey, apiKeyStatus, apiClients, selectedModel, openrouterModels, selectedGroqModel, neuronConfig }, aiRepairer); if (!generatedResult) throw new Error("AI failed."); addLog(`Generated. Publishing...`); const itemToPublish = { ...item, generatedContent: generatedResult }; const result = await publishItemToWordPress(itemToPublish, wpPassword, 'publish', fetchWordPressWithRetry, wpConfig); if (result.success) addLog(`✅ SUCCESS: ${page.title}`); else throw new Error(result.message as string); } catch (error: any) { addLog(`❌ FAILED: ${page.title} - ${error.message}`); } }; await processConcurrently(selectedPages, processItem, 1, (c, t) => setBulkAutoPublishProgress({ current: c, total: t }), () => false); setIsBulkAutoPublishing(false); addLog("🏁 Batch Complete."); };
    const handleAddToRefreshQueue = () => { const selected = existingPages.filter(p => selectedHubPages.has(p.id)); if (selected.length === 0) { alert("Select pages."); return; } const newItems: ContentItem[] = selected.map(p => ({ id: p.id, title: p.title || 'Untitled', type: 'refresh', originalUrl: p.id, status: 'idle', statusText: 'Queued', generatedContent: null, crawledContent: p.crawledContent })); dispatch({ type: 'SET_ITEMS', payload: newItems }); setActiveView('review'); };
    const handleCrawlSitemap = async () => { if (!sitemapUrl) { setCrawlMessage('Enter URL.'); return; } setIsCrawling(true); setCrawlMessage(''); setExistingPages([]); const onCrawlProgress = (message: string) => setCrawlMessage(message); try { const sitemapsToCrawl = [sitemapUrl]; const crawledSitemapUrls = new Set<string>(); const pageDataMap = new Map<string, { lastmod: string | null }>(); while (sitemapsToCrawl.length > 0) { if (crawledSitemapUrls.size >= 100) break; const currentSitemapUrl = sitemapsToCrawl.shift(); if (!currentSitemapUrl || crawledSitemapUrls.has(currentSitemapUrl)) continue; crawledSitemapUrls.add(currentSitemapUrl); onCrawlProgress(`Crawling: ${currentSitemapUrl}...`); const response = await fetchWithProxies(currentSitemapUrl, {}, onCrawlProgress); const text = await response.text(); const parser = new DOMParser(); const doc = parser.parseFromString(text, "application/xml"); const sitemapNodes = doc.getElementsByTagName('sitemap'); for (let i = 0; i < sitemapNodes.length; i++) { const loc = sitemapNodes[i].getElementsByTagName('loc')[0]?.textContent; if (loc && !crawledSitemapUrls.has(loc)) sitemapsToCrawl.push(loc.trim()); } const urlNodes = doc.getElementsByTagName('url'); for (let i = 0; i < urlNodes.length; i++) { const loc = urlNodes[i].getElementsByTagName('loc')[0]?.textContent; const lastmod = urlNodes[i].getElementsByTagName('lastmod')[0]?.textContent; if (loc) pageDataMap.set(loc.trim(), { lastmod: lastmod ? lastmod.trim() : null }); } } const discoveredPages: SitemapPage[] = Array.from(pageDataMap.entries()).map(([url, data]) => { const currentDate = new Date(); let daysOld = null; let isStale = false; if (data.lastmod) { const lastModDate = new Date(data.lastmod); if (!isNaN(lastModDate.getTime())) { daysOld = Math.round((currentDate.getTime() - lastModDate.getTime()) / (1000 * 3600 * 24)); if (daysOld > 365) isStale = true; } } return { id: url, title: url, slug: extractSlugFromUrl(url), lastMod: data.lastmod, wordCount: null, crawledContent: null, healthScore: null, updatePriority: null, justification: null, daysOld: daysOld, isStale: isStale, publishedState: 'none', status: 'idle', analysis: null }; }); setExistingPages(discoveredPages); onCrawlProgress(`Found ${discoveredPages.length} pages.`); } catch (error: any) { onCrawlProgress(`Error: ${error.message}`); } finally { setIsCrawling(false); } };
    const verifyWpEndpoint = useCallback(async () => { if (!wpConfig.url) { alert("Enter WP URL."); return; } setWpEndpointStatus('verifying'); try { const response = await fetch(`${wpConfig.url.replace(/\/+$/, '')}/wp-json/`, { method: 'GET' }); if (response.ok) setWpEndpointStatus('valid'); else setWpEndpointStatus('invalid'); } catch (error) { setWpEndpointStatus('invalid'); } }, [wpConfig.url]);
    const handleGenerateClusterPlan = async () => { setIsGenerating(true); dispatch({ type: 'SET_ITEMS', payload: [] }); try { const responseText = await callAI(apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel, 'cluster_planner', [topic, null, null], 'json'); const aiRepairer = (brokenText: string) => callAI(apiClients, 'gemini', { enabled: false, location: '', region: '', country: '', postalCode: '' }, [], '', 'json_repair', [brokenText], 'json'); const parsedJson = await parseJsonWithAiRepair(responseText, aiRepairer); const newItems: Partial<ContentItem>[] = [ { id: parsedJson.pillarTitle, title: parsedJson.pillarTitle, type: 'pillar' }, ...parsedJson.clusterTitles.map((cluster: { title: string }) => ({ id: cluster.title, title: cluster.title, type: 'cluster' })) ]; dispatch({ type: 'SET_ITEMS', payload: newItems }); setActiveView('review'); } catch (error: any) { console.error("Error", error); } finally { setIsGenerating(false); } };
    const handleGenerateMultipleFromKeywords = () => { const keywords = primaryKeywords.split('\n').map(k => k.trim()).filter(Boolean); if (keywords.length === 0) return; const newItems: Partial<ContentItem>[] = keywords.map(keyword => ({ id: keyword, title: keyword, type: 'standard' })); dispatch({ type: 'SET_ITEMS', payload: newItems }); setActiveView('review'); };
    const handleGenerateImages = async () => { if (!apiClients.gemini && !apiClients.openai) { setImageGenerationError('Enter API key.'); return; } setIsGeneratingImages(true); setGeneratedImages([]); setImageGenerationError(''); try { const imageService = async (prompt: string) => { const src = await generateImageWithFallback(apiClients, prompt); if (!src) throw new Error("Failed."); return src; }; const imagePromises = Array.from({ length: numImages }).map(() => imageService(imagePrompt)); const results = await Promise.all(imagePromises); setGeneratedImages(results.map(src => ({ src, prompt: imagePrompt }))); } catch (error: any) { setImageGenerationError(error.message); } finally { setIsGeneratingImages(false); } };
    const handleDownloadImage = (base64Data: string, prompt: string) => { const link = document.createElement('a'); link.href = base64Data; link.download = `image-${Date.now()}.png`; document.body.appendChild(link); link.click(); document.body.removeChild(link); };
    const handleCopyText = (text: string) => { navigator.clipboard.writeText(text); };
    const handleToggleSelect = (itemId: string) => { setSelectedItems(prev => { const newSet = new Set(prev); if (newSet.has(itemId)) newSet.delete(itemId); else newSet.add(itemId); return newSet; }); };
    const handleToggleSelectAll = () => { if (selectedItems.size === filteredAndSortedItems.length) setSelectedItems(new Set()); else setSelectedItems(new Set(filteredAndSortedItems.map(item => item.id))); };
    const handleSort = (key: string) => { setSortConfig({ key, direction: (sortConfig.key === key && sortConfig.direction === 'asc') ? 'desc' : 'asc' }); };
    const startGeneration = async (itemsToGenerate: ContentItem[]) => { setIsGenerating(true); setGenerationProgress({ current: 0, total: itemsToGenerate.length }); const serviceCallAI = (promptKey: any, args: any[], format: 'json' | 'html' = 'json', grounding = false) => callAI(apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel, promptKey, args, format, grounding); const serviceGenerateImage = (prompt: string) => generateImageWithFallback(apiClients, prompt); await generateContent.generateItems(itemsToGenerate, serviceCallAI, serviceGenerateImage, { dispatch, existingPages, siteInfo, wpConfig, geoTargeting, serperApiKey: apiKeys.serperApiKey, apiKeyStatus, apiClients, selectedModel, openrouterModels, selectedGroqModel, neuronConfig }, (progress) => setGenerationProgress(progress), () => stopGenerationRef); setIsGenerating(false); };
    const handleGenerateSingle = (item: ContentItem) => { stopGenerationRef.current.delete(item.id); startGeneration([item]); };
    const handleGenerateSelected = () => { stopGenerationRef.current.clear(); const itemsToGenerate = items.filter(item => selectedItems.has(item.id)); if (itemsToGenerate.length > 0) startGeneration(itemsToGenerate); };
    const handleStopGeneration = (itemId: string | null = null) => { if (itemId) { stopGenerationRef.current.add(itemId); dispatch({ type: 'UPDATE_STATUS', payload: { id: itemId, status: 'idle', statusText: 'Stopped' } }); } else { items.forEach(item => { if (item.status === 'generating') { stopGenerationRef.current.add(item.id); dispatch({ type: 'UPDATE_STATUS', payload: { id: item.id, status: 'idle', statusText: 'Stopped' } }); } }); setIsGenerating(false); } };
    const analyzableForRewrite = useMemo(() => existingPages.filter(p => selectedHubPages.has(p.id) && p.analysis).length, [selectedHubPages, existingPages]);

    const handleEnterApp = () => {
        localStorage.setItem('hasSeenLanding', 'true');
        setShowLanding(false);
    };

    if (showLanding) {
        return <LandingPage onEnterApp={handleEnterApp} />;
    }

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="app-header-content">
                    <div className="header-left">
                        <img src="https://affiliatemarketingforsuccess.com/wp-content/uploads/2023/03/cropped-Affiliate-Marketing-for-Success-Logo-Edited.png?lm=6666FEE0" alt="WP Content Optimizer Pro Logo" className="header-logo" />
                        <div className="header-separator"></div>
                        <div className="header-title-group">
                            <h1>WP Content <span>Optimizer Pro</span></h1>
                            <span className="version-badge">v12.0 (SOTA Agent)</span>
                        </div>
                    </div>
                </div>
            </header>
            <div className="main-layout">
                <aside className="sidebar">
                    <SidebarNav activeView={activeView} onNavClick={setActiveView} />
                </aside>
                <main className="main-content">
                    {activeView === 'setup' && (
                        <div className="setup-view">
                            <div className="page-header">
                                <h2 className="gradient-headline">1. Setup & Configuration</h2>
                                <p>Connect your AI services. SOTA Agent requires Gemini for embeddings and Serper for adversarial research.</p>
                            </div>
                            <div className="setup-grid">
                                <div className="setup-card">
                                    <h3>API Keys</h3>
                                    <div className="form-group">
                                        <label>Google Gemini API Key (For Image Generation & Content)</label>
                                        <ApiKeyInput provider="gemini" value={apiKeys.geminiApiKey} onChange={handleApiKeyChange} status={apiKeyStatus.gemini} isEditing={editingApiKey === 'gemini'} onEdit={() => setEditingApiKey('gemini')} />
                                    </div>
                                    <div className="form-group">
                                        <label>Serper API Key (Required for SOTA Research)</label>
                                        <ApiKeyInput provider="serper" value={apiKeys.serperApiKey} onChange={handleApiKeyChange} status={apiKeyStatus.serper} isEditing={editingApiKey === 'serper'} onEdit={() => setEditingApiKey('serper')} />
                                    </div>
                                    <div className="form-group">
                                        <label>OpenAI API Key</label>
                                        <ApiKeyInput provider="openai" value={apiKeys.openaiApiKey} onChange={handleApiKeyChange} status={apiKeyStatus.openai} isEditing={editingApiKey === 'openai'} onEdit={() => setEditingApiKey('openai')} />
                                    </div>
                                    <div className="form-group">
                                        <label>Anthropic API Key</label>
                                        <ApiKeyInput provider="anthropic" value={apiKeys.anthropicApiKey} onChange={handleApiKeyChange} status={apiKeyStatus.anthropic} isEditing={editingApiKey === 'anthropic'} onEdit={() => setEditingApiKey('anthropic')} />
                                    </div>
                                     <div className="form-group">
                                        <label>OpenRouter API Key</label>
                                        <ApiKeyInput provider="openrouter" value={apiKeys.openrouterApiKey} onChange={handleApiKeyChange} status={apiKeyStatus.openrouter} isEditing={editingApiKey === 'openrouter'} onEdit={() => setEditingApiKey('openrouter')} />
                                    </div>
                                     <div className="form-group">
                                        <label>Groq API Key</label>
                                        <ApiKeyInput provider="groq" value={apiKeys.groqApiKey} onChange={handleApiKeyChange} status={apiKeyStatus.groq} isEditing={editingApiKey === 'groq'} onEdit={() => setEditingApiKey('groq')} />
                                    </div>
                                </div>
                                <div className="setup-card">
                                    <h3>AI Model Configuration</h3>
                                    <div className="form-group">
                                        <label htmlFor="model-select">Primary Generation Model</label>
                                        <select id="model-select" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                                            <option value="gemini">Google Gemini 2.5 Flash</option>
                                            <option value="openai">OpenAI GPT-4o</option>
                                            <option value="anthropic">Anthropic Claude 3</option>
                                            <option value="openrouter">OpenRouter (Auto-Fallback)</option>
                                            <option value="groq">Groq (High-Speed)</option>
                                        </select>
                                    </div>
                                    {selectedModel === 'openrouter' && (
                                        <div className="form-group">
                                            <label>OpenRouter Model Fallback Chain (one per line)</label>
                                            <textarea value={openrouterModels.join('\n')} onChange={handleOpenrouterModelsChange} rows={5}></textarea>
                                        </div>
                                    )}
                                     {selectedModel === 'groq' && (
                                        <div className="form-group">
                                            <label htmlFor="groq-model-select">Groq Model</label>
                                            <input type="text" id="groq-model-select" value={selectedGroqModel} onChange={e => setSelectedGroqModel(e.target.value)} placeholder="e.g., llama3-70b-8192" />
                                            <p className="help-text">Enter any model name compatible with the Groq API.</p>
                                        </div>
                                    )}
                                     <div className="form-group checkbox-group">
                                        <input type="checkbox" id="useGoogleSearch" checked={useGoogleSearch} onChange={e => setUseGoogleSearch(e.target.checked)} />
                                        <label htmlFor="useGoogleSearch">Enable Google Search Grounding</label>
                                    </div>
                                    <p className="help-text">Grounding provides the AI with real-time search results for more accurate, up-to-date content. Recommended for time-sensitive topics.</p>
                                </div>

                                <div className="setup-card full-width">
                                    <h3>WordPress & Site Information</h3>
                                    <div className="schema-settings-grid">
                                        <div className="form-group">
                                            <label htmlFor="wpUrl">WordPress Site URL</label>
                                            <input type="url" id="wpUrl" value={wpConfig.url} onChange={e => setWpConfig(p => ({...p, url: e.target.value}))} placeholder="https://example.com" />
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="wpUsername">WordPress Username</label>
                                            <input type="text" id="wpUsername" value={wpConfig.username} onChange={e => setWpConfig(p => ({...p, username: e.target.value}))} placeholder="your_username" />
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="wpPassword">WordPress Application Password</label>
                                            <input type="password" id="wpPassword" value={wpPassword} onChange={e => setWpPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx xxxx" />
                                        </div>
                                         <div className="form-group">
                                            <label htmlFor="orgName">Organization Name</label>
                                            <input type="text" id="orgName" value={siteInfo.orgName} onChange={e => setSiteInfo(p => ({...p, orgName: e.target.value}))} placeholder="My Awesome Blog" />
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="logoUrl">Logo URL</label>
                                            <input type="url" id="logoUrl" value={siteInfo.logoUrl} onChange={e => setSiteInfo(p => ({...p, logoUrl: e.target.value}))} placeholder="https://example.com/logo.png" />
                                        </div>
                                         <div className="form-group">
                                            <label htmlFor="authorName">Author Name</label>
                                            <input type="text" id="authorName" value={siteInfo.authorName} onChange={e => setSiteInfo(p => ({...p, authorName: e.target.value}))} placeholder="John Doe" />
                                        </div>
                                         <div className="form-group">
                                            <label htmlFor="authorUrl">Author Page URL</label>
                                            <input type="url" id="authorUrl" value={siteInfo.authorUrl} onChange={e => setSiteInfo(p => ({...p, authorUrl: e.target.value}))} placeholder="https://example.com/about-me" />
                                        </div>
                                    </div>
                                </div>
                                <div className="setup-card full-width">
                                    <h3>SOTA Image Publishing (Required for WordPress)</h3>
                                    <p className="help-text">This app uses a multi-layer fallback system for image uploads, ensuring they always succeed without requiring any manual PHP configuration on your server.</p>
                                    <div className="endpoint-status-container">
                                        <button className="btn-secondary" onClick={() => setIsEndpointModalOpen(true)}>Learn More</button>
                                        <button className="btn" onClick={verifyWpEndpoint} disabled={wpEndpointStatus === 'verifying'}>
                                            {wpEndpointStatus === 'verifying' ? 'Verifying...' : '✅ Auto-Detect Upload Method'}
                                        </button>
                                        <div className="key-status-icon">
                                            {wpEndpointStatus === 'verifying' && <div className="key-status-spinner"></div>}
                                            {wpEndpointStatus === 'valid' && <span className="success" title="REST API active!"><CheckIcon /> Active</span>}
                                            {wpEndpointStatus === 'invalid' && <span className="error" title="REST API not found or not working."><XIcon /> Inactive</span>}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="setup-card full-width">
                                    <h3>Advanced SEO Integrations (Neuro-Semantic)</h3>
                                    <p className="help-text">Connect NeuronWriter to fetch high-impact NLP terms. The AI will naturally weave these into the content to boost Content Scores.</p>
                                    
                                    <div className="form-group checkbox-group">
                                        <input 
                                            type="checkbox" 
                                            id="neuron-enabled" 
                                            checked={neuronConfig.enabled} 
                                            onChange={(e) => setNeuronConfig(p => ({...p, enabled: e.target.checked}))} 
                                        />
                                        <label htmlFor="neuron-enabled">Enable NeuronWriter Integration</label>
                                    </div>

                                    {neuronConfig.enabled && (
                                        <div className="schema-settings-grid">
                                            <div className="form-group">
                                                <label htmlFor="neuronApiKey">NeuronWriter API Key</label>
                                                <div className="api-key-group">
                                                    <input 
                                                        type="password" 
                                                        id="neuronApiKey" 
                                                        value={neuronConfig.apiKey} 
                                                        onChange={e => setNeuronConfig(p => ({...p, apiKey: e.target.value}))} 
                                                        placeholder="e.g., n-abc123..." 
                                                    />
                                                    {isFetchingNeuronProjects && <div className="key-status-spinner"></div>}
                                                    {neuronProjects.length > 0 && <span className="success" title="Projects loaded"><CheckIcon /></span>}
                                                    <button className="btn btn-small btn-secondary" onClick={() => fetchProjects(neuronConfig.apiKey)} disabled={isFetchingNeuronProjects}>
                                                        {isFetchingNeuronProjects ? 'Loading...' : 'Refresh'}
                                                    </button>
                                                </div>
                                                {neuronFetchError && <p className="error help-text" style={{color: 'var(--error)'}}>{neuronFetchError}</p>}
                                            </div>

                                            <div className="form-group">
                                                <label htmlFor="neuronProjectId">Project</label>
                                                {neuronProjects.length > 0 ? (
                                                    <select
                                                        id="neuronProjectId"
                                                        value={neuronConfig.projectId}
                                                        onChange={e => setNeuronConfig(p => ({...p, projectId: e.target.value}))}
                                                        style={{width: '100%', padding: '0.7rem', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--border-radius-md)'}}
                                                    >
                                                        <option value="">Select a project...</option>
                                                        {neuronProjects.map(p => (
                                                            <option key={p.project} value={p.project}>
                                                                {p.name} ({p.engine} - {p.language})
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input 
                                                        type="text" 
                                                        id="neuronProjectId" 
                                                        value={neuronConfig.projectId} 
                                                        onChange={e => setNeuronConfig(p => ({...p, projectId: e.target.value}))} 
                                                        placeholder={isFetchingNeuronProjects ? "Loading projects..." : "Enter API Key to load projects, or type ID manually"} 
                                                        disabled={isFetchingNeuronProjects}
                                                    />
                                                )}
                                                <p className="help-text">Projects are automatically fetched when you enter a valid API Key.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="setup-card full-width">
                                    <h3>Advanced Geo-Targeting</h3>
                                    <div className="form-group checkbox-group">
                                        <input type="checkbox" id="geo-enabled" checked={geoTargeting.enabled} onChange={(e) => setGeoTargeting(p => ({...p, enabled: e.target.checked}))} />
                                        <label htmlFor="geo-enabled">Enable Geo-Targeting for Content</label>
                                    </div>
                                    {geoTargeting.enabled && (
                                        <div className="schema-settings-grid">
                                            <input type="text" value={geoTargeting.location} onChange={e => setGeoTargeting(p => ({...p, location: e.target.value}))} placeholder="City (e.g., Austin)" />
                                            <input type="text" value={geoTargeting.region} onChange={e => setGeoTargeting(p => ({...p, region: e.target.value}))} placeholder="State/Region (e.g., TX)" />
                                            <input type="text" value={geoTargeting.country} onChange={e => setGeoTargeting(p => ({...p, country: e.target.value}))} placeholder="Country Code (e.g., US)" />
                                            <input type="text" value={geoTargeting.postalCode} onChange={e => setGeoTargeting(p => ({...p, postalCode: e.target.value}))} placeholder="Postal Code (e.g., 78701)" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {activeView === 'strategy' && (
                        <div className="content-strategy-view">
                             <div className="page-header">
                                <h2 className="gradient-headline">2. Content Strategy & Planning</h2>
                            </div>
                            <div className="tabs-container">
                                <div className="tabs" role="tablist">
                                    <button className={`tab-btn ${contentMode === 'bulk' ? 'active' : ''}`} onClick={() => setContentMode('bulk')} role="tab">Bulk Content Planner</button>
                                    <button className={`tab-btn ${contentMode === 'single' ? 'active' : ''}`} onClick={() => setContentMode('single')} role="tab">Single Article</button>
                                    <button className={`tab-btn ${contentMode === 'gapAnalysis' ? 'active' : ''}`} onClick={() => setContentMode('740
                                                                                                                                                 620
                                    610
                                    ')} role="tab">Gap Analysis (God Mode)</button>
                                    <button className={`tab-btn ${contentMode === 'refresh' ? 'active' : ''}`} onClick={() => setContentMode('refresh')} role="tab">Quick Refresh & Validate</button>
                                    <button className={`tab-btn ${contentMode === 'hub' ? 'active' : ''}`} onClick={() => setContentMode('hub')} role="tab">Content Hub</button>
                                    <button className={`tab-btn ${contentMode === 'imageGenerator' ? 'active' : ''}`} onClick={() => setContentMode('imageGenerator')} role="tab">Image Generator</button>
                                </div>
                            </div>
                            
                            {contentMode === 'single' && (
                                <div className="tab-panel">
                                    <h3>Single Article</h3>
                                     <div className="form-group">
                                        <label htmlFor="primaryKeywords">Primary Keywords</label>
                                        <textarea id="primaryKeywords" value={primaryKeywords} onChange={e => setPrimaryKeywords(e.target.value)} rows={5}></textarea>
                                    </div>
                                    <button className="btn" onClick={handleGenerateMultipleFromKeywords} disabled={!primaryKeywords.trim()}>Go to Review &rarr;</button>
                                </div>
                            )}

                            {contentMode === 'gapAnalysis' && (
                                <div className="tab-panel">
                                    <h3 style={{background: 'linear-gradient(to right, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '1.8rem', marginBottom: '0.5rem'}}>Blue Ocean Gap Analysis</h3>
                                    
                                    <div className="god-mode-panel" style={{
                                        background: isGodMode ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 78, 59, 0.3))' : 'rgba(255,255,255,0.02)',
                                        border: isGodMode ? '1px solid #10B981' : '1px solid var(--border-subtle)',
                                        padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem', transition: 'all 0.3s ease'
                                    }}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                                            <div>
                                                <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: isGodMode ? '#10B981' : 'white'}}>
                                                    {isGodMode ? '⚡ GOD MODE ACTIVE' : '💤 God Mode (Autonomous Maintenance)'}
                                                </h3>
                                                <p style={{fontSize: '0.85rem', color: '#94A3B8', margin: '0.5rem 0 0 0'}}>
                                                    Automatically scans your sitemap, prioritizes critical pages, and performs surgical SEO/Fact updates forever.
                                                </p>
                                            </div>
                                            <label className="switch" style={{position: 'relative', display: 'inline-block', width: '60px', height: '34px'}}>
                                                <input type="checkbox" checked={isGodMode} onChange={e => setIsGodMode(e.target.checked)} style={{opacity: 0, width: 0, height: 0}} />
                                                <span className="slider round" style={{
                                                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, 
                                                    backgroundColor: isGodMode ? '#10B981' : '#334155', transition: '.4s', borderRadius: '34px'
                                                }}>
                                                    <span style={{
                                                        position: 'absolute', content: "", height: '26px', width: '26px', left: '4px', bottom: '4px', 
                                                        backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                                                        transform: isGodMode ? 'translateX(26px)' : 'translateX(0)'
                                                    }}></span>
                                                </span>
                                            </label>
                                        </div>

                                        {isGodMode && (
                                            <>
                                                <div style={{marginBottom: '1rem', display: 'flex', gap: '0.5rem'}}>
                                                    <button
                                                        onClick={runWordPressDiagnostics}
                                                        disabled={isRunningDiagnostics}
                                                        style={{
                                                            padding: '0.5rem 1rem',
                                                            background: '#1e293b',
                                                            color: '#10B981',
                                                            border: '1px solid #334155',
                                                            borderRadius: '6px',
                                                            cursor: isRunningDiagnostics ? 'not-allowed' : 'pointer',
                                                            fontSize: '0.85rem',
                                                            fontWeight: 500
                                                        }}
                                                    >
                                                        {isRunningDiagnostics ? '🔄 Running...' : '🔍 Debug WordPress API'}
                                                    </button>
                                                    {wpDiagnostics && (
                                                        <button
                                                            onClick={() => setWpDiagnostics(null)}
                                                            style={{
                                                                padding: '0.5rem 1rem',
                                                                background: '#1e293b',
                                                                color: '#64748B',
                                                                border: '1px solid #334155',
                                                                borderRadius: '6px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.85rem'
                                                            }}
                                                        >
                                                            ✕ Close Diagnostics
                                                        </button>
                                                    )}
                                                </div>
                                                      <AutonomousGodMode isGodModeActive={isGodMode} onStatusUpdate={(msg) => setGodModeLogs(prev => [msg, ...prev].slice(0, 50))} />

                                                {wpDiagnostics && (
                                                    <div style={{
                                                        background: '#020617',
                                                        padding: '1rem',
                                                        borderRadius: '8px',
                                                        border: '1px solid #1e293b',
                                                        marginBottom: '1rem',
                                                        maxHeight: '400px',
                                                        overflowY: 'auto'
                                                    }}>
                                                        <div style={{color: '#10B981', fontWeight: 'bold', marginBottom: '1rem'}}>
                                                            🔍 WordPress API Diagnostics
                                                        </div>

                                                        {wpDiagnostics.error && (
                                                            <div style={{background: '#DC2626', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', color: 'white'}}>
                                                                <strong>Error:</strong> {wpDiagnostics.error}
                                                            </div>
                                                        )}

                                                        <div style={{marginBottom: '1rem'}}>
                                                            <div style={{color: '#94A3B8', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600}}>
                                                                POST TYPES AVAILABLE:
                                                            </div>
                                                            <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
                                                                {wpDiagnostics.postTypes?.map((type: string) => (
                                                                    <span key={type} style={{
                                                                        background: '#1e293b',
                                                                        padding: '0.25rem 0.5rem',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.75rem',
                                                                        color: '#10B981'
                                                                    }}>
                                                                        {type}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {wpDiagnostics.customPostTypes?.length > 0 && (
                                                            <div style={{marginBottom: '1rem'}}>
                                                                <div style={{color: '#F59E0B', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600}}>
                                                                    CUSTOM POST TYPES:
                                                                </div>
                                                                {wpDiagnostics.customPostTypes.map((cpt: any) => (
                                                                    <div key={cpt.slug} style={{
                                                                        background: '#1e293b',
                                                                        padding: '0.5rem',
                                                                        borderRadius: '4px',
                                                                        marginBottom: '0.5rem',
                                                                        fontSize: '0.75rem'
                                                                    }}>
                                                                        <strong style={{color: '#F59E0B'}}>{cpt.name}</strong>
                                                                        <span style={{color: '#64748B'}}> (slug: {cpt.slug}, REST: {cpt.rest_base})</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <div>
                                                            <div style={{color: '#94A3B8', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600}}>
                                                                RECENT POSTS (Last 20):
                                                            </div>
                                                            {wpDiagnostics.posts?.length === 0 ? (
                                                                <div style={{color: '#DC2626', fontSize: '0.85rem', padding: '0.5rem', fontStyle: 'italic'}}>
                                                                    No posts found. Check REST API permissions.
                                                                </div>
                                                            ) : (
                                                                <div style={{fontSize: '0.75rem', fontFamily: 'monospace'}}>
                                                                    {wpDiagnostics.posts?.map((post: any) => (
                                                                        <div key={post.id} style={{
                                                                            background: '#1e293b',
                                                                            padding: '0.5rem',
                                                                            borderRadius: '4px',
                                                                            marginBottom: '0.5rem',
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between'
                                                                        }}>
                                                                            <div style={{flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                                                                <span style={{color: '#10B981'}}>ID:{post.id}</span>
                                                                                <span style={{color: '#64748B', margin: '0 0.5rem'}}>|</span>
                                                                                <span style={{color: '#E2E8F0'}}>{post.title?.rendered || post.title}</span>
                                                                            </div>
                                                                            <div style={{marginLeft: '1rem', whiteSpace: 'nowrap'}}>
                                                                                <span style={{color: '#60A5FA'}}>slug: {post.slug}</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                <div style={{
                                                    background: '#020617',
                                                    padding: '1rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #1e293b',
                                                    marginBottom: '1rem'
                                                }}>
                                                    <div style={{color: '#F59E0B', fontWeight: 'bold', marginBottom: '1rem', fontSize: '0.9rem'}}>
                                                        🚫 Exclusion Controls
                                                    </div>

                                                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
                                                        <div>
                                                            <label style={{display: 'block', color: '#94A3B8', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600}}>
                                                                Exclude URLs (one per line)
                                                            </label>
                                                            <textarea
                                                                value={excludedUrls.join('\n')}
                                                                onChange={e => setExcludedUrls(e.target.value.split('\n').map(url => url.trim()).filter(Boolean))}
                                                                placeholder="https://example.com/page1&#10;https://example.com/page2"
                                                                style={{
                                                                    width: '100%',
                                                                    minHeight: '80px',
                                                                    background: '#1e293b',
                                                                    border: '1px solid #334155',
                                                                    borderRadius: '6px',
                                                                    padding: '0.5rem',
                                                                    color: '#E2E8F0',
                                                                    fontSize: '0.75rem',
                                                                    fontFamily: 'monospace',
                                                                    resize: 'vertical'
                                                                }}
                                                            />
                                                            {excludedUrls.length > 0 && (
                                                                <div style={{marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748B'}}>
                                                                    {excludedUrls.length} URL{excludedUrls.length !== 1 ? 's' : ''} excluded
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div>
                                                            <label style={{display: 'block', color: '#94A3B8', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600}}>
                                                                Exclude Categories (one per line)
                                                            </label>
                                                            <textarea
                                                                value={excludedCategories.join('\n')}
                                                                onChange={e => setExcludedCategories(e.target.value.split('\n').map(cat => cat.trim()).filter(Boolean))}
                                                                placeholder="category-slug-1&#10;category-slug-2"
                                                                style={{
                                                                    width: '100%',
                                                                    minHeight: '80px',
                                                                    background: '#1e293b',
                                                                    border: '1px solid #334155',
                                                                    borderRadius: '6px',
                                                                    padding: '0.5rem',
                                                                    color: '#E2E8F0',
                                                                    fontSize: '0.75rem',
                                                                    fontFamily: 'monospace',
                                                                    resize: 'vertical'
                                                                }}
                                                            />
                                                            {excludedCategories.length > 0 && (
                                                                <div style={{marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748B'}}>
                                                                    {excludedCategories.length} categor{excludedCategories.length !== 1 ? 'ies' : 'y'} excluded
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div style={{marginTop: '0.75rem', padding: '0.75rem', background: '#1e293b', borderRadius: '6px', fontSize: '0.75rem', color: '#94A3B8'}}>
                                                        ℹ️ GOD MODE will skip optimizing these URLs and categories. Changes take effect immediately.
                                                    </div>
                                                </div>

                                                <div className="god-mode-dashboard" style={{display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1rem'}}>
                                                    <div className="god-mode-logs" style={{
                                                        background: '#020617', padding: '1rem', borderRadius: '8px',
                                                        fontFamily: 'monospace', fontSize: '0.8rem', height: '200px', overflowY: 'auto',
                                                        border: '1px solid #1e293b', boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,0.5)'
                                                    }}>
                                                        <div style={{color: '#64748B', borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem', marginBottom: '0.5rem'}}>SYSTEM LOGS</div>
                                                        {godModeLogs.map((log, i) => (
                                                            <div key={i} style={{marginBottom: '4px', color: log.includes('Error') ? '#EF4444' : log.includes('✅') ? '#10B981' : '#94A3B8'}}>
                                                                <span style={{opacity: 0.5}}>[{new Date().toLocaleTimeString()}]</span> {log}
                                                            </div>
                                                        ))}
                                                        {godModeLogs.length === 0 && <div style={{color: '#64748B'}}>Initializing engine... waiting for tasks...</div>}
                                                    </div>

                                                <div className="optimized-list" style={{
                                                    background: '#020617', padding: '1rem', borderRadius: '8px', 
                                                    height: '200px', overflowY: 'auto', border: '1px solid #1e293b'
                                                }}>
                                                    <div style={{color: '#10B981', borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem', marginBottom: '0.5rem', fontWeight: 'bold'}}>
                                                        ✅ RECENTLY OPTIMIZED ({optimizedHistory.length})
                                                    </div>
                                                    {optimizedHistory.length === 0 ? (
                                                        <div style={{color: '#64748B', fontSize: '0.85rem', fontStyle: 'italic', padding: '1rem', textAlign: 'center'}}>
                                                            No posts optimized in this session yet. Waiting for targets...
                                                        </div>
                                                    ) : (
                                                        optimizedHistory.map((item, i) => (
                                                            <div key={i} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', borderBottom: '1px solid #1e293b'}}>
                                                                <div style={{overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginRight: '1rem'}}>
                                                                    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{color: '#E2E8F0', textDecoration: 'none', fontWeight: 500, fontSize: '0.9rem'}}>
                                                                        {item.title}
                                                                    </a>
                                                                </div>
                                                                <div style={{color: '#64748B', fontSize: '0.75rem', whiteSpace: 'nowrap'}}>{item.timestamp}</div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {existingPages.length === 0 && !sitemapUrl ? (
                                        <div className="sitemap-warning" style={{padding: '1.5rem', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid var(--error)', borderRadius: '12px', color: '#FCA5A5', display: 'flex', alignItems: 'center', gap: '1rem'}}>
                                            <XIcon />
                                            <div>
                                                <strong>Sitemap Required:</strong> Please crawl your sitemap in the "Quick Refresh" tab first. The AI needs to know your existing content to find the gaps.
                                            </div>
                                        </div>
                                    ) : (
                                        <button className="btn" onClick={handleAnalyzeGaps} disabled={isAnalyzingGaps} style={{width: '100%', padding: '1rem', fontSize: '1rem'}}>
                                            {isAnalyzingGaps ? 'Scanning...' : '🚀 Run Deep Gap Analysis'}
                                        </button>
                                    )}
                                </div>
                            )}
                            {contentMode === 'refresh' && (
                                <div className="tab-panel">
                                    <h3>Quick Refresh & Validate</h3>
                                    <p className="help-text">Seamlessly update existing posts. Crawl your sitemap to update hundreds of URLs or enter a single URL for a quick fix.</p>
                                    
                                    <div className="tabs" style={{marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)'}}>
                                        <button 
                                            className={`tab-btn ${refreshMode === 'single' ? 'active' : ''}`} 
                                            onClick={() => setRefreshMode('single')} 
                                            style={{fontSize: '0.85rem'}}
                                        >
                                            Single URL
                                        </button>
                                        <button 
                                            className={`tab-btn ${refreshMode === 'bulk' ? 'active' : ''}`} 
                                            onClick={() => setRefreshMode('bulk')}
                                            style={{fontSize: '0.85rem'}}
                                        >
                                            Bulk via Sitemap
                                        </button>
                                    </div>

                                    {refreshMode === 'single' && (
                                        <>
                                            <div className="form-group">
                                                <label htmlFor="refreshUrl">Post URL to Refresh</label>
                                                <input type="url" id="refreshUrl" value={refreshUrl} onChange={e => setRefreshUrl(e.target.value)} placeholder="https://example.com/my-old-post" />
                                            </div>
                                            <button className="btn" onClick={handleRefreshContent} disabled={isGenerating || !refreshUrl}>
                                                {isGenerating ? 'Refreshing...' : 'Refresh & Validate'}
                                            </button>
                                        </>
                                    )}

                                    {refreshMode === 'bulk' && (
                                        <div className="sitemap-crawler-form">
                                            <div className="form-group">
                                                 <label htmlFor="sitemapUrl">Sitemap URL</label>
                                                 <input type="url" id="sitemapUrl" value={sitemapUrl} onChange={e => setSitemapUrl(e.target.value)} placeholder="https://example.com/sitemap_index.xml" />
                                            </div>
                                            <button className="btn" onClick={handleCrawlSitemap} disabled={isCrawling}>
                                                {isCrawling ? 'Crawling...' : 'Crawl Sitemap'}
                                            </button>
                                            
                                            {crawlMessage && <div className="crawl-status">{crawlMessage}</div>}

                                            {existingPages.length > 0 && (
                                                <div className="content-hub-table-container" style={{marginTop: '1.5rem'}}>
                                                    <div className="table-controls" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                                        <input type="search" placeholder="Search pages..." className="filter-input" value={hubSearchFilter} onChange={e => setHubSearchFilter(e.target.value)} />
                                                        <div className="table-actions">
                                                            <button className="btn btn-secondary" onClick={handleAddToRefreshQueue} disabled={selectedHubPages.size === 0}>
                                                                Add Selected to Review ({selectedHubPages.size})
                                                            </button>
                                                            <button 
                                                                className="btn" 
                                                                style={{backgroundColor: 'var(--accent-success)'}}
                                                                onClick={handleBulkRefreshAndPublish} 
                                                                disabled={selectedHubPages.size === 0 || isBulkAutoPublishing}
                                                            >
                                                                {isBulkAutoPublishing ? 'Processing...' : `Bulk Refresh & Auto-Publish (${selectedHubPages.size})`}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {isBulkAutoPublishing && (
                                                        <div className="bulk-progress-container" style={{margin: '1rem 0', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px'}}>
                                                            <div style={{marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between'}}>
                                                                <span>Processing... {bulkAutoPublishProgress.current}/{bulkAutoPublishProgress.total}</span>
                                                                <span className="spinner" style={{width: '15px', height: '15px'}}></span>
                                                            </div>
                                                            <div style={{width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden'}}>
                                                                <div style={{width: `${(bulkAutoPublishProgress.current / Math.max(1, bulkAutoPublishProgress.total)) * 100}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.3s ease'}}></div>
                                                            </div>
                                                            <div className="bulk-logs" style={{marginTop: '1rem', maxHeight: '150px', overflowY: 'auto', fontSize: '0.8rem', fontFamily: 'monospace', color: '#94A3B8'}}>
                                                                {bulkPublishLogs.map((log, i) => <div key={i}>{log}</div>)}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <table className="content-hub-table">
                                                        <thead>
                                                            <tr>
                                                                <th style={{width: '40px'}}><input type="checkbox" onChange={handleToggleHubPageSelectAll} checked={selectedHubPages.size > 0 && selectedHubPages.size === filteredAndSortedHubPages.length} /></th>
                                                                <th onClick={() => handleHubSort('title')}>Title & URL</th>
                                                                <th onClick={() => handleHubSort('daysOld')}>Age</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                        {isCrawling ? <SkeletonLoader rows={5} columns={3} /> : filteredAndSortedHubPages.map(page => (
                                                                <tr key={page.id}>
                                                                    <td><input type="checkbox" checked={selectedHubPages.has(page.id)} onChange={() => handleToggleHubPageSelect(page.id)} /></td>
                                                                    <td className="hub-title-cell">
                                                                        <a href={page.id} target="_blank" rel="noopener noreferrer">{sanitizeTitle(page.title, page.slug)}</a>
                                                                        <div className="slug">{page.id}</div>
                                                                    </td>
                                                                    <td>{page.daysOld !== null ? `${page.daysOld} days` : 'N/A'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            {contentMode === 'hub' && (
                                 <div className="tab-panel">
                                    <h3>Content Hub & Rewrite Assistant</h3>
                                    <p className="help-text">Enter your sitemap URL to crawl your existing content. Analyze posts for SEO health and generate strategic rewrite plans.</p>
                                    <div className="sitemap-crawler-form">
                                        <div className="form-group">
                                             <label htmlFor="sitemapUrl">Sitemap URL</label>
                                             <input type="url" id="sitemapUrl" value={sitemapUrl} onChange={e => setSitemapUrl(e.target.value)} placeholder="https://example.com/sitemap_index.xml" />
                                        </div>
                                        <button className="btn" onClick={handleCrawlSitemap} disabled={isCrawling}>
                                            {isCrawling ? 'Crawling...' : 'Crawl Sitemap'}
                                        </button>
                                    </div>
                                    {crawlMessage && <div className="crawl-status">{crawlMessage}</div>}
                                    {existingPages.length > 0 && (
                                        <div className="content-hub-table-container">
                                            <div className="table-controls">
                                                <input type="search" placeholder="Search pages..." className="filter-input" value={hubSearchFilter} onChange={e => setHubSearchFilter(e.target.value)} />
                                                 <select value={hubStatusFilter} onChange={e => setHubStatusFilter(e.target.value)}>
                                                    <option value="All">All Statuses</option>
                                                    <option value="Critical">Critical</option>
                                                    <option value="High">High</option>
                                                    <option value="Medium">Medium</option>
                                                    <option value="Healthy">Healthy</option>
                                                </select>
                                                <div className="table-actions">
                                                    <button className="btn btn-secondary" onClick={handleAnalyzeSelectedPages} disabled={isAnalyzingHealth || selectedHubPages.size === 0}>
                                                        {isAnalyzingHealth ? `Analyzing... (${healthAnalysisProgress.current}/${healthAnalysisProgress.total})` : `Analyze Selected (${selectedHubPages.size})`}
                                                    </button>
                                                    <button className="btn" onClick={handleRewriteSelected} disabled={analyzableForRewrite === 0}>Rewrite Selected ({analyzableForRewrite})</button>
                                                </div>
                                            </div>
                                            <table className="content-hub-table">
                                                <thead>
                                                    <tr>
                                                        <th><input type="checkbox" onChange={handleToggleHubPageSelectAll} checked={selectedHubPages.size > 0 && selectedHubPages.size === filteredAndSortedHubPages.length} /></th>
                                                        <th onClick={() => handleHubSort('title')}>Title & Slug</th>
                                                        <th onClick={() => handleHubSort('daysOld')}>Age</th>
                                                        <th onClick={() => handleHubSort('updatePriority')}>Status</th>
                                                         <th>Analysis & Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                {isCrawling ? <SkeletonLoader rows={10} columns={5} /> : filteredAndSortedHubPages.map(page => (
                                                        <tr key={page.id}>
                                                            <td><input type="checkbox" checked={selectedHubPages.has(page.id)} onChange={() => handleToggleHubPageSelect(page.id)} /></td>
                                                            <td className="hub-title-cell">
                                                                <a href={page.id} target="_blank" rel="noopener noreferrer">{sanitizeTitle(page.title, page.slug)}</a>
                                                                <div className="slug">{page.id}</div>
                                                            </td>
                                                            <td>{page.daysOld !== null ? `${page.daysOld} days` : 'N/A'}</td>
                                                            <td><div className="status-cell">{page.updatePriority ? <span className={`priority-${page.updatePriority}`}>{page.updatePriority}</span> : 'Not Analyzed'}</div></td>
                                                            <td>
                                                               {page.status === 'analyzing' && <div className="status-cell"><div className="status-indicator analyzing"></div>Analyzing...</div>}
                                                               {/* SOTA FIX: Improved Error Display */}
                                                               {page.status === 'error' && (
                                                                    <div className="status-cell error" title={page.justification || "Unknown Error"}>
                                                                        <XIcon /> {page.justification ? (page.justification.length > 20 ? page.justification.substring(0,18) + '...' : page.justification) : 'Error'}
                                                                    </div>
                                                                )}
                                                                {page.status === 'analyzed' && page.analysis && (
                                                                    <button className="btn btn-small" onClick={() => setViewingAnalysis(page)}>View Rewrite Plan</button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                             {contentMode === 'imageGenerator' && (
                                <div className="tab-panel">
                                    <h3>SOTA Image Generator</h3>
                                    <p className="help-text">Generate high-quality images for your content using DALL-E 3 or Gemini Imagen. Describe the image you want in detail.</p>
                                    <div className="form-group">
                                        <label htmlFor="imagePrompt">Image Prompt</label>
                                        <textarea id="imagePrompt" value={imagePrompt} onChange={e => setImagePrompt(e.target.value)} rows={4} placeholder="e.g., A photorealistic image of a golden retriever puppy playing in a field of flowers, cinematic lighting, 16:9 aspect ratio." />
                                    </div>
                                    <div className="form-group-row">
                                        <div className="form-group">
                                            <label htmlFor="numImages">Number of Images</label>
                                            <select id="numImages" value={numImages} onChange={e => setNumImages(Number(e.target.value))}>
                                                {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                                            </select>
                                        </div>
                                         <div className="form-group">
                                            <label htmlFor="aspectRatio">Aspect Ratio</label>
                                            <select id="aspectRatio" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}>
                                                <option value="1:1">1:1 (Square)</option>
                                                <option value="16:9">16:9 (Widescreen)</option>
                                                <option value="9:16">9:16 (Vertical)</option>
                                                <option value="4:3">4:3 (Landscape)</option>
                                                <option value="3:4">3:4 (Portrait)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <button className="btn" onClick={handleGenerateImages} disabled={isGeneratingImages || !imagePrompt}>
                                        {isGeneratingImages ? <><div className="spinner"></div> Generating...</> : 'Generate Images'}
                                    </button>
                                    {imageGenerationError && <p className="error" style={{marginTop: '1rem'}}>{imageGenerationError}</p>}
                                    {generatedImages.length > 0 && (
                                        <div className="image-assets-grid" style={{marginTop: '2rem'}}>
                                            {generatedImages.map((image, index) => (
                                                <div key={index} className="image-asset-card">
                                                    <img src={image.src} alt={image.prompt} loading="lazy" />
                                                    <div className="image-asset-details">
                                                        <button className="btn btn-small" onClick={() => handleDownloadImage(image.src, image.prompt)}>Download</button>
                                                        <button className="btn btn-small btn-secondary" onClick={() => handleCopyText(image.prompt)}>Copy Prompt</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            {contentMode === 'bulk' && (
                                <div className="tab-panel">
                                    <h3>Bulk Content Planner</h3>
                                    <p className="help-text">Enter a broad topic (e.g., "digital marketing") to generate a complete pillar page and cluster content plan, optimized for topical authority.</p>
                                    <div className="form-group">
                                        <label htmlFor="topic">Broad Topic</label>
                                        <input type="text" id="topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g., Landscape Photography" />
                                    </div>
                                    <button className="btn" onClick={handleGenerateClusterPlan} disabled={isGenerating || !topic}>
                                        {isGenerating ? 'Generating...' : 'Generate Content Plan'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    {/* ... Review View ... */}
                    {activeView === 'review' && (
                        <div className="review-export-view">
                            <div className="page-header">
                                <h2 className="gradient-headline">3. Review & Export</h2>
                                <p>Review your generated content, check SEO scores, edit as needed, and publish directly to WordPress.</p>
                            </div>
                             <div className="table-controls">
                                <input type="search" placeholder="Filter content..." className="filter-input" value={filter} onChange={e => setFilter(e.target.value)} />
                                <div className="table-actions">
                                    <button className="btn" onClick={handleGenerateSelected} disabled={isGenerating || selectedItems.size === 0}>
                                        {isGenerating ? `Generating... (${generationProgress.current}/${generationProgress.total})` : `Generate Selected (${selectedItems.size})`}
                                    </button>
                                    {isGenerating && <button className="btn btn-secondary" onClick={() => handleStopGeneration()}>Stop All</button>}
                                    <button className="btn btn-secondary" onClick={() => setIsBulkPublishModalOpen(true)} disabled={selectedItems.size === 0}>
                                        Bulk Publish ({selectedItems.size})
                                    </button>
                                </div>
                            </div>
                            <div className="review-table-container">
                                <table className="review-table">
                                    <thead>
                                        <tr>
                                            <th><input type="checkbox" onChange={handleToggleSelectAll} checked={selectedItems.size > 0 && selectedItems.size === filteredAndSortedItems.length} /></th>
                                            <th onClick={() => handleSort('title')}>Title</th>
                                            <th onClick={() => handleSort('type')}>Type</th>
                                            <th onClick={() => handleSort('status')}>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredAndSortedItems.length === 0 ? (
                                             <tr>
                                                <td colSpan={5} style={{textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)'}}>
                                                    No content items yet. Go to "Content Strategy" to plan some articles.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredAndSortedItems.map(item => (
                                                <tr key={item.id}>
                                                    <td><input type="checkbox" checked={selectedItems.has(item.id)} onChange={() => handleToggleSelect(item.id)} /></td>
                                                    <td>{item.title}</td>
                                                    <td><span className={`badge ${item.type}`}>{item.type}</span></td>
                                                    <td>
                                                        <div className="status-cell">
                                                            {/* SOTA FIX: Visually distinguish 'warning' errors (like word count) from hard errors */}
                                                            <div 
                                                                className={`status-indicator ${item.status}`} 
                                                                style={(item.status === 'error' && item.statusText.includes('TOO SHORT')) ? { backgroundColor: 'var(--warning)' } : {}}
                                                            ></div>
                                                            {item.statusText}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {item.status === 'idle' && <button className="btn btn-small" onClick={() => handleGenerateSingle(item)}>Generate</button>}
                                                        {item.status === 'generating' && <button className="btn btn-small btn-secondary" onClick={() => handleStopGeneration(item.id)}>Stop</button>}
                                                        
                                                        {/* SOTA FIX: Allow reviewing content even if marked as error (e.g., word count fail), as long as content exists */}
                                                        {(item.status === 'done' || (item.status === 'error' && item.generatedContent)) && (
                                                            <button className="btn btn-small" onClick={() => setSelectedItemForReview(item)}>Review</button>
                                                        )}
                                                        
                                                        {item.status === 'error' && (
                                                            <button 
                                                                className="btn btn-small btn-secondary" 
                                                                onClick={() => handleGenerateSingle(item)}
                                                                style={item.generatedContent ? { marginLeft: '0.5rem' } : {}}
                                                            >
                                                                Retry
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </main>
            </div>
            <AppFooter />
            
            {/* Modals */}
            {isEndpointModalOpen && (
                <WordPressEndpointInstructions onClose={() => setIsEndpointModalOpen(false)} />
            )}
            {selectedItemForReview && (
                <ReviewModal 
                    item={selectedItemForReview} 
                    onClose={() => setSelectedItemForReview(null)}
                    onSaveChanges={(itemId, updatedSeo, updatedContent) => {
                        dispatch({
                            type: 'SET_CONTENT',
                            payload: { 
                                id: itemId, 
                                content: { 
                                    ...selectedItemForReview.generatedContent!, 
                                    title: updatedSeo.title, 
                                    metaDescription: updatedSeo.metaDescription, 
                                    slug: extractSlugFromUrl(updatedSeo.slug),
                                    content: updatedContent 
                                } 
                            } 
                        });
                        // Update the list title as well for consistency
                        const updatedItem = items.find(i => i.id === itemId);
                        if(updatedItem && updatedItem.title !== updatedSeo.title){
                             // We need a way to update the item title in the list, 
                             // dispatch SET_ITEMS effectively overwrites, which isn't ideal for a single update.
                             // For now, we rely on the content being updated.
                        }
                        alert('Changes saved locally!');
                    }}
                    wpConfig={wpConfig}
                    wpPassword={wpPassword}
                    onPublishSuccess={(originalUrl) => {
                         // If it was an update, maybe refresh the status or similar
                         console.log(`Successfully updated: ${originalUrl}`);
                    }}
                    publishItem={(item, pwd, status) => publishItemToWordPress(item, pwd, status, fetchWordPressWithRetry, wpConfig)}
                    callAI={(key, args, fmt, g) => callAI(apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel, key, args, fmt, g)}
                    geoTargeting={geoTargeting}
                    neuronConfig={neuronConfig} // SOTA FIX: Pass NeuronConfig to modal for UI visibility
                />
            )}
            {isBulkPublishModalOpen && (
                <BulkPublishModal 
                    items={items.filter(i => selectedItems.has(i.id) && i.status === 'done')}
                    onClose={() => setIsBulkPublishModalOpen(false)}
                    publishItem={(item, pwd, status) => publishItemToWordPress(item, pwd, status, fetchWordPressWithRetry, wpConfig)}
                    wpConfig={wpConfig}
                    wpPassword={wpPassword}
                    onPublishSuccess={(url) => console.log(`Published ${url}`)}
                />
            )}
             {viewingAnalysis && (
                <AnalysisModal 
                    page={viewingAnalysis} 
                    onClose={() => setViewingAnalysis(null)} 
                    onPlanRewrite={handlePlanRewrite} 
                />
            )}
        </div>
    );
};

export default App;
