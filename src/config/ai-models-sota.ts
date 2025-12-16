/**
 * 🤖 STATE-OF-THE-ART AI MODEL CONFIGURATIONS
 * Latest and most powerful AI models with optimized settings
 */

export interface AIModelConfig {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'meta';
  maxTokens: number;
  contextWindow: number;
  costPer1MTokens: { input: number; output: number };
  capabilities: string[];
  bestFor: string[];
  temperature: number;
  topP: number;
}

/**
 * Latest AI Models - December 2025
 */
export const SOTA_AI_MODELS: Record<string, AIModelConfig> = {
  // OpenAI Models
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    maxTokens: 16384,
    contextWindow: 128000,
    costPer1MTokens: { input: 2.50, output: 10.00 },
    capabilities: ['text', 'vision', 'code', 'reasoning'],
    bestFor: ['complex-analysis', 'creative-writing', 'multimodal'],
    temperature: 0.7,
    topP: 0.9
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    maxTokens: 16384,
    contextWindow: 128000,
    costPer1MTokens: { input: 0.15, output: 0.60 },
    capabilities: ['text', 'vision', 'code'],
    bestFor: ['quick-tasks', 'cost-effective', 'high-volume'],
    temperature: 0.7,
    topP: 0.9
  },
  'o1-preview': {
    id: 'o1-preview',
    name: 'OpenAI o1 Preview',
    provider: 'openai',
    maxTokens: 32768,
    contextWindow: 128000,
    costPer1MTokens: { input: 15.00, output: 60.00 },
    capabilities: ['advanced-reasoning', 'complex-problem-solving'],
    bestFor: ['complex-seo-strategy', 'advanced-analysis'],
    temperature: 1.0,
    topP: 1.0
  },

  // Anthropic Models
  'claude-3-5-sonnet': {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    maxTokens: 8192,
    contextWindow: 200000,
    costPer1MTokens: { input: 3.00, output: 15.00 },
    capabilities: ['text', 'code', 'analysis', 'vision'],
    bestFor: ['seo-content', 'technical-writing', 'long-documents'],
    temperature: 0.7,
    topP: 0.9
  },
  'claude-3-5-haiku': {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    maxTokens: 8192,
    contextWindow: 200000,
    costPer1MTokens: { input: 0.80, output: 4.00 },
    capabilities: ['text', 'code', 'fast-responses'],
    bestFor: ['quick-optimization', 'metadata', 'real-time'],
    temperature: 0.7,
    topP: 0.9
  },

  // Google Models
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    maxTokens: 8192,
    contextWindow: 1048576, // 1M tokens
    costPer1MTokens: { input: 0.00, output: 0.00 }, // Free tier
    capabilities: ['multimodal', 'vision', 'audio', 'video'],
    bestFor: ['large-content', 'multimodal-seo', 'free-tier'],
    temperature: 0.9,
    topP: 0.95
  },
  'gemini-1.5-pro': {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    maxTokens: 8192,
    contextWindow: 2097152, // 2M tokens
    costPer1MTokens: { input: 1.25, output: 5.00 },
    capabilities: ['multimodal', 'vision', 'code', 'reasoning'],
    bestFor: ['massive-content', 'comprehensive-analysis'],
    temperature: 0.9,
    topP: 0.95
  },

  // Meta Models (via third-party API)
  'llama-3.3-70b': {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    provider: 'meta',
    maxTokens: 8192,
    contextWindow: 131072,
    costPer1MTokens: { input: 0.59, output: 0.79 },
    capabilities: ['text', 'code', 'reasoning'],
    bestFor: ['open-source', 'cost-effective', 'privacy'],
    temperature: 0.7,
    topP: 0.9
  }
};

/**
 * Intelligent Model Selection based on task type
 */
export class AIModelManager {
  private static defaultModel = 'gpt-4o-mini';

  /**
   * Select the best model for a specific task
   */
  static selectModel(taskType: string, priority: 'quality' | 'speed' | 'cost' = 'quality'): AIModelConfig {
    const taskModelMap: Record<string, string[]> = {
      'seo-analysis': ['claude-3-5-sonnet', 'gpt-4o', 'gemini-2.0-flash'],
      'content-generation': ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro'],
      'meta-tags': ['claude-3-5-haiku', 'gpt-4o-mini', 'gemini-2.0-flash'],
      'schema-markup': ['gpt-4o-mini', 'claude-3-5-haiku', 'gemini-2.0-flash'],
      'keyword-research': ['claude-3-5-sonnet', 'o1-preview', 'gemini-1.5-pro'],
      'competitor-analysis': ['o1-preview', 'claude-3-5-sonnet', 'gpt-4o'],
      'large-document': ['gemini-1.5-pro', 'claude-3-5-sonnet', 'gemini-2.0-flash'],
      'quick-optimization': ['gemini-2.0-flash', 'claude-3-5-haiku', 'gpt-4o-mini'],
      'multimodal': ['gemini-2.0-flash', 'gpt-4o', 'claude-3-5-sonnet']
    };

    const recommendedModels = taskModelMap[taskType] || [this.defaultModel];
    
    // Apply priority filter
    const modelId = this.applyPriorityFilter(recommendedModels, priority);
    
    return SOTA_AI_MODELS[modelId] || SOTA_AI_MODELS[this.defaultModel];
  }

  /**
   * Filter models based on priority
   */
  private static applyPriorityFilter(models: string[], priority: string): string {
    if (priority === 'cost') {
      // Prefer free or low-cost models
      const costOrder = ['gemini-2.0-flash', 'gpt-4o-mini', 'claude-3-5-haiku'];
      for (const model of costOrder) {
        if (models.includes(model)) return model;
      }
    } else if (priority === 'speed') {
      // Prefer fast models
      const speedOrder = ['gemini-2.0-flash', 'claude-3-5-haiku', 'gpt-4o-mini'];
      for (const model of speedOrder) {
        if (models.includes(model)) return model;
      }
    }
    // Default to quality (first recommended)
    return models[0];
  }

  /**
   * Get model with fallback chain
   */
  static getModelWithFallback(preferredModel: string): string[] {
    const fallbackChains: Record<string, string[]> = {
      'gpt-4o': ['gpt-4o', 'claude-3-5-sonnet', 'gemini-2.0-flash'],
      'claude-3-5-sonnet': ['claude-3-5-sonnet', 'gpt-4o', 'gemini-2.0-flash'],
      'gemini-2.0-flash': ['gemini-2.0-flash', 'gpt-4o-mini', 'claude-3-5-haiku']
    };

    return fallbackChains[preferredModel] || [preferredModel, this.defaultModel];
  }

  /**
   * Calculate estimated cost for a request
   */
  static estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const model = SOTA_AI_MODELS[modelId];
    if (!model) return 0;

    const inputCost = (inputTokens / 1000000) * model.costPer1MTokens.input;
    const outputCost = (outputTokens / 1000000) * model.costPer1MTokens.output;
    
    return inputCost + outputCost;
  }

  /**
   * Get all available models sorted by capability
   */
  static getModelsByCapability(capability: string): AIModelConfig[] {
    return Object.values(SOTA_AI_MODELS)
      .filter(model => model.capabilities.includes(capability))
      .sort((a, b) => a.costPer1MTokens.input - b.costPer1MTokens.input);
  }
}

/**
 * API Configuration Helper
 */
export class APIConfigManager {
  /**
   * Get API configuration for a specific provider
   */
  static getConfig(provider: string): any {
    const configs = {
      openai: {
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        baseURL: 'https://api.openai.com/v1',
        defaultHeaders: {
          'Content-Type': 'application/json'
        }
      },
      anthropic: {
        apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
        baseURL: 'https://api.anthropic.com/v1',
        defaultHeaders: {
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      },
      google: {
        apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        defaultHeaders: {
          'Content-Type': 'application/json'
        }
      }
    };

    return configs[provider];
  }
}

export default AIModelManager;