import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { 
  callAI, 
  generateContent, 
  extractSearchTerms, 
  maintenanceEngine, 
  createPillarStructure 
} from './services';
import { fetchWithProxies, smartCrawl } from './contentUtils';
import { listNeuronProjects, NeuronProject } from './neuronwriter';
// @ts-ignore
import mermaid from 'mermaid';
import { GodModeUrlSelector } from './GodModeUrlSelector';
import { AutonomousGodMode } from './AutonomousGodMode';

interface ErrorBoundaryProps {
    children?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: any) {
        return { hasError: true };
    }

    componentDidCatch(error: any, errorInfo: any) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return <h1>Something went wrong.</h1>;
        }
        return this.props.children;
    }
}

const App = () => {
    const [apiKey, setApiKey] = useState(localStorage.getItem('openai_key') || '');
    const [serperKey, setSerperKey] = useState(localStorage.getItem('serper_key') || '');
    const [topic, setTopic] = useState('');
    const [status, setStatus] = useState('');
    const [mermaidChart, setMermaidChart] = useState('');
    const [generatedContent, setGeneratedContent] = useState('');
    const [neuronProjects, setNeuronProjects] = useState<NeuronProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>('');
    const [isGodMode, setIsGodMode] = useState(false);
    const [godModeLogs, setGodModeLogs] = useState<string[]>([]);
    const [optimizedHistory, setOptimizedHistory] = useState<Array<{title: string, url: string, timestamp: string}>>([]);

    useEffect(() => {
        mermaid.initialize({ startOnLoad: true });
        loadNeuronProjects();
    }, []);

    useEffect(() => {
        if (mermaidChart) {
            mermaid.contentLoaded();
        }
    }, [mermaidChart]);

    // SOTA FIX: Type-Safe Logging Callback
    useEffect(() => {
        // @ts-ignore
        maintenanceEngine.logCallback = (msg: string) => {
            console.log(msg);
            if (msg.startsWith('✅ SUCCESS|')) {
                const parts = msg.split('|');
                const title = parts[1] || 'Untitled';
                const url = parts[2] || '';
                
                if (url) {
                    setOptimizedHistory(prev => [
                        { title, url, timestamp: new Date().toLocaleTimeString() }, 
                        ...prev
                    ]);
                }
                setGodModeLogs(prev => [`✅ Optimized: ${title}`, ...prev].slice(0, 50));
            } else {
                setGodModeLogs(prev => [msg, ...prev].slice(0, 50));
            }
        };
    }, []);

    // SOTA FIX: Connect URL Selector to Maintenance Engine
    const handleGodModeUrlsChange = useCallback((urls: string[]) => {
        console.log('[App] God Mode URLs changed:', urls);
        localStorage.setItem('godModeUrls', JSON.stringify(urls));
        // @ts-ignore - Ensure maintenanceEngine exists before calling
        if (maintenanceEngine && typeof maintenanceEngine.setPriorityUrls === 'function') {
            maintenanceEngine.setPriorityUrls(urls);
        }
    }, []);

    const loadNeuronProjects = async () => {
        try {
            const projects = await listNeuronProjects();
            setNeuronProjects(projects);
        } catch (error) {
            console.error('Failed to load NeuronWriter projects');
        }
    };

    const handleSaveKeys = () => {
        localStorage.setItem('openai_key', apiKey);
        localStorage.setItem('serper_key', serperKey);
        alert('Keys saved!');
    };

    const handleGenerate = async () => {
        if (!apiKey) return alert('Please enter OpenAI API Key');
        setStatus('Analyzing topic & generating structure...');
        
        try {
            const structure = await createPillarStructure(topic, apiKey);
            setMermaidChart(structure.mermaid);
            
            setStatus('Drafting content...');
            const content = await generateContent(topic, structure.structure, apiKey);
            setGeneratedContent(content);
            setStatus('Complete!');
        } catch (e: any) {
            setStatus(`Error: ${e.message}`);
        }
    };

    const toggleGodMode = () => {
        const newState = !isGodMode;
        setIsGodMode(newState);
        if (newState) {
            maintenanceEngine.start();
        } else {
            maintenanceEngine.stop();
        }
    };

    return (
        <ErrorBoundary>
            <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-10">
                        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl mb-2">
                            Pillar Craft Suite <span className="text-blue-600">3.0</span>
                        </h1>
                        <p className="text-lg text-gray-500">Autonomous Content & SEO Orchestration</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-8 transition-all hover:shadow-xl">
                        <div className="p-6 sm:p-8 space-y-6">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
                                    <input
                                        type="password"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder="sk-..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Serper API Key</label>
                                    <input
                                        type="password"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        value={serperKey}
                                        onChange={(e) => setSerperKey(e.target.value)}
                                        placeholder="API Key"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={handleSaveKeys}
                                className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition-colors font-medium"
                            >
                                Save Credentials
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-8">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                ⚡ Autonomous God Mode
                            </h2>
                            <button
                                onClick={toggleGodMode}
                                className={`px-6 py-2 rounded-full font-bold transition-all duration-300 transform hover:scale-105 ${
                                    isGodMode 
                                    ? 'bg-red-500 text-white shadow-lg shadow-red-200' 
                                    : 'bg-green-500 text-white shadow-lg shadow-green-200'
                                }`}
                            >
                                {isGodMode ? 'STOP ENGINE' : 'ACTIVATE GOD MODE'}
                            </button>
                        </div>
                        
                        <div className="p-6 bg-gray-50">
                            <GodModeUrlSelector />
                            
                            <AutonomousGodMode 
                                isGodModeActive={isGodMode}
                                onStatusUpdate={(msg) => setGodModeLogs(prev => [msg, ...prev].slice(0, 50))}
                                onTargetUrlsChange={handleGodModeUrlsChange}
                            />

                            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-xs h-64 overflow-y-auto shadow-inner custom-scrollbar">
                                    <div className="sticky top-0 bg-black border-b border-gray-800 pb-2 mb-2 font-bold text-gray-400 uppercase tracking-wider">
                                        System Logs
                                    </div>
                                    {godModeLogs.map((log, i) => (
                                        <div key={i} className="mb-1 border-l-2 border-transparent hover:border-green-500 pl-2 transition-all">
                                            <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                            {log}
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-white p-4 rounded-lg border border-gray-200 h-64 overflow-y-auto shadow-sm">
                                    <h3 className="font-bold text-gray-700 mb-3 sticky top-0 bg-white pb-2 border-b">
                                        Recently Optimized
                                    </h3>
                                    {optimizedHistory.length === 0 ? (
                                        <p className="text-gray-400 text-sm italic text-center mt-10">No pages optimized yet.</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {optimizedHistory.map((item, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm p-2 hover:bg-gray-50 rounded transition-colors group">
                                                    <span className="text-green-500 mt-1">✓</span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-gray-900 truncate" title={item.title}>
                                                            {item.title}
                                                        </div>
                                                        <div className="text-xs text-gray-500 truncate" title={item.url}>
                                                            {item.url}
                                                        </div>
                                                    </div>
                                                    <span className="text-xs text-gray-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {item.timestamp}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-8">
                        <div className="p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">Manual Content Generation</h2>
                            <div className="space-y-4">
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-lg"
                                    placeholder="Enter topic (e.g., 'Future of AI in Healthcare')"
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                />
                                
                                {neuronProjects.length > 0 && (
                                    <select 
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                                        value={selectedProject}
                                        onChange={(e) => setSelectedProject(e.target.value)}
                                    >
                                        <option value="">-- Select NeuronWriter Project (Optional) --</option>
                                        {neuronProjects.map(p => (
                                            <option key={p.id} value={p.id}>{p.query} ({p.domain})</option>
                                        ))}
                                    </select>
                                )}

                                <button
                                    onClick={handleGenerate}
                                    className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-bold text-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                >
                                    Generate Strategy & Content
                                </button>
                            </div>
                            
                            {status && (
                                <div className="mt-6 p-4 bg-blue-50 text-blue-700 rounded-lg border border-blue-100 flex items-center gap-3">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-700"></div>
                                    {status}
                                </div>
                            )}
                        </div>
                    </div>

                    {mermaidChart && (
                        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-8 p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">Strategic Pillar Map</h3>
                            <div className="mermaid overflow-x-auto">
                                {mermaidChart}
                            </div>
                        </div>
                    )}

                    {generatedContent && (
                        <div className="bg-white rounded-xl shadow-lg overflow-hidden p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">Generated Content Draft</h3>
                            <div className="prose max-w-none bg-gray-50 p-6 rounded-lg border border-gray-200">
                                <pre className="whitespace-pre-wrap font-sans text-gray-700">{generatedContent}</pre>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </ErrorBoundary>
    );
};

export default App;
```[[1](https://www.google.com/url?sa=E&q=https%3A%2F%2Fgithub.com%2FPapalexios%2Fpillar-craft-suite-3b9de888)][[2](https://www.google.com/url?sa=E&q=https%3A%2F%2Fgithub.com%2FPapalexios%2Fpillar-craft-suite-3b9de888%2Fblob%2Fmain%2Fsrc%2Fservices.tsx)]
