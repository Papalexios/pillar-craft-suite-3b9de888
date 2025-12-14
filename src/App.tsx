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
import { 
    SitemapPage, ContentItem, GeneratedContent, SiteInfo, ExpandedGeoTargeting, ApiClients, WpConfig, NeuronConfig, GapAnalysisSuggestion, GenerationContext
} from './types';
import { callAiWithRetry, debounce, fetchWordPressWithRetry, sanitizeTitle, extractSlugFromUrl, parseJsonWithAiRepair, isNullish, isValidSortKey, processConcurrently } from './utils';
import { fetchWithProxies, smartCrawl } from './contentUtils';
import { listNeuronProjects, NeuronProject } from './neuronwriter';
// @ts-ignore
import mermaid from 'mermaid';
import { AutonomousGodMode } from './AutonomousGodMode';

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
    const [activeView, setActiveView] = useState('setup');
    const [apiKeys, setApiKeys] = useState(() => {
        const saved = localStorage.getItem('apiKeys');
        const defaults = { geminiApiKey: '', openaiApiKey: '', anthropicApiKey: '', openrouterApiKey: '', serperApiKey: '', groqApiKey: '' };
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
    const [gapSuggestions, setGapSuggestions] = useState<GapAnalysisSuggestion[]>([]);
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
    const [optimizedHistory, setOptimizedHistory] = useState<OptimizedLog[]>([]);
    
    // Pagination State for Hub Table
    const [hubPage, setHubPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

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
        if (apiKeys.geminiApiKey) {
            validateApiKey('gemini', apiKeys.geminiApiKey);
        }
    }, [apiKeys.geminiApiKey]);

    useEffect(() => {
        // @ts-ignore
        maintenanceEngine.logCallback = (msg: string) => {
            console.log(msg);
            if (msg.startsWith('✅ SUCCESS|')) {
                const parts = msg.split('|');
                const title = parts[1] || 'Untitled';
                const url = parts[2] || '';
                if (url) {
                    setOptimizedHistory(prev => [{ title, url, timestamp: new Date().toLocaleTimeString() }, ...prev]);
                }
                setGodModeLogs(prev => [`✅ Optimized: ${title}`, ...prev].slice(0, 50));
            } else {
                setGodModeLogs(prev => [msg, ...prev].slice(0, 50));
            }
        };
    }, []);

    useEffect(() => {
        localStorage.setItem('sota_god_mode', String(isGodMode));
        if (isGodMode) {
            const context: GenerationContext = { dispatch, existingPages, siteInfo, wpConfig, geoTargeting, serperApiKey: apiKeys.serperApiKey, apiKeyStatus, apiClients, selectedModel, openrouterModels, selectedGroqModel, neuronConfig };
            maintenanceEngine.start(context);
        } else { maintenanceEngine.stop(); }
        if (isGodMode && existingPages.length > 0) {
             const context: GenerationContext = { dispatch, existingPages, siteInfo, wpConfig, geoTargeting, serperApiKey: apiKeys.serperApiKey, apiKeyStatus, apiClients, selectedModel, openrouterModels, selectedGroqModel, neuronConfig };
            maintenanceEngine.updateContext(context);
        }
    }, [isGodMode, existingPages, apiClients, isCrawling]); 

    // CRITICAL FIX: Connect God Mode URL targeting to MaintenanceEngine
    const handleGodModeUrlsChange = useCallback((urls: string[]) => {
        console.log('[App] God Mode URLs changed:', urls);
        try {
            localStorage.setItem('godModeUrls', JSON.stringify(urls));
        } catch (e) {
            console.error('[App] Failed to save godModeUrls:', e);
        }
        // CRITICAL: Notify MaintenanceEngine of priority URL changes
        maintenanceEngine.setPriorityUrls(urls);
    }, []);

    const validateApiKey = useCallback(debounce(async (provider: string, key: string) => {
        if (!key) { setApiKeyStatus(prev => ({ ...prev, [provider]: 'idle' })); setApiClients(prev => ({ ...prev, [provider]: null })); return; }
        setApiKeyStatus(prev => ({ ...prev, [provider]: 'validating' }));
        try {
            let client;
            let isValid = false;
            switch (provider) {
                case 'gemini': client = new GoogleGenAI({ apiKey: key }); await callAiWithRetry(() => client.models.generateContent({ model: AI_MODELS.GEMINI_FLASH, contents: 'test' })); isValid = true; break;
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

    // PAGINATION LOGIC
    const paginatedHubPages = useMemo(() => {
        const start = (hubPage - 1) * ITEMS_PER_PAGE;
        return filteredAndSortedHubPages.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredAndSortedHubPages, hubPage]);

    const totalPages = Math.ceil(filteredAndSortedHubPages.length / ITEMS_PER_PAGE);

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
    const handleCrawlSitemap = async () => { 
        if (!sitemapUrl) { setCrawlMessage('Enter URL.'); return; } 
        setIsCrawling(true); setCrawlMessage(''); 
        const onCrawlProgress = (message: string) => setCrawlMessage(message); 
        try { 
            const sitemapsToCrawl = [sitemapUrl]; 
            const crawledSitemapUrls = new Set<string>(); 
            const pageDataMap = new Map<string, { lastmod: string | null }>(); 
            while (sitemapsToCrawl.length > 0) { 
                if (crawledSitemapUrls.size >= 100) break; 
                const currentSitemapUrl = sitemapsToCrawl.shift(); 
                if (!currentSitemapUrl || crawledSitemapUrls.has(currentSitemapUrl)) continue; 
                crawledSitemapUrls.add(currentSitemapUrl); 
                onCrawlProgress(`Crawling: ${currentSitemapUrl}...`); 
                const response = await fetchWithProxies(currentSitemapUrl, {}, onCrawlProgress); 
                const text = await response.text(); 
                const parser = new DOMParser(); 
                const doc = parser.parseFromString(text, "application/xml"); 
                const sitemapNodes = doc.getElementsByTagName('sitemap'); 
                for (let i = 0; i < sitemapNodes.length; i++) { 
                    const loc = sitemapNodes[i].getElementsByTagName('loc')[0]?.textContent; 
                    if (loc && !crawledSitemapUrls.has(loc)) sitemapsToCrawl.push(loc.trim()); 
                } 
                const urlNodes = doc.getElementsByTagName('url'); 
                for (let i = 0; i < urlNodes.length; i++) { 
                    const loc = urlNodes[i].getElementsByTagName('loc')[0]?.textContent; 
                    const lastmod = urlNodes[i].getElementsByTagName('lastmod')[0]?.textContent; 
                    if (loc) pageDataMap.set(loc.trim(), { lastmod: lastmod ? lastmod.trim() : null }); 
                } 
            } 
            
            const discoveredPages: SitemapPage[] = Array.from(pageDataMap.entries()).map(([url, data]) => { 
                const currentDate = new Date(); 
                let daysOld = null; 
                let isStale = false; 
                if (data.lastmod) { 
                    const lastModDate = new Date(data.lastmod); 
                    if (!isNaN(lastModDate.getTime())) { 
                        daysOld = Math.round((currentDate.getTime() - lastModDate.getTime()) / (1000 * 3600 * 24)); 
                        if (daysOld > 365) isStale = true; 
                    } 
                } 
                return { id: url, title: url, slug: extractSlugFromUrl(url), lastMod: data.lastmod, wordCount: null, crawledContent: null, healthScore: null, updatePriority: null, justification: null, daysOld: daysOld, isStale: isStale, publishedState: 'none', status: 'idle', analysis: null }; 
            }); 
            
            setExistingPages(prev => {
                const existingMap = new Map(prev.map(p => [p.id, p]));
                return discoveredPages.map(newPage => {
                    const existing = existingMap.get(newPage.id);
                    if (existing && existing.status === 'analyzed') {
                        return { ...newPage, status: 'analyzed', analysis: existing.analysis, healthScore: existing.healthScore, updatePriority: existing.updatePriority };
                    }
                    return newPage;
                });
            });
            onCrawlProgress(`Found ${discoveredPages.length} pages.`); 
        } catch (error: any) { onCrawlProgress(`Error: ${error.message}`); } finally { setIsCrawling(false); } 
    };
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

    return (
        <div className="app-container">
            {/* Keep ALL JSX exactly as original */}
            {/* ... (truncated for length - use exact copy from your current App.tsx) */}
            {/* CRITICAL CHANGE: In God Mode panel, replace the standalone GodModeUrlSelector with: */}
            {contentMode === 'gapAnalysis' && isGodMode && (
                <AutonomousGodMode 
                    isGodModeActive={isGodMode}
                    onTargetUrlsChange={handleGodModeUrlsChange}
                />
            )}
        </div>
    );
};

export default App;