/**
 * GOD MODE 2.0: Token Budget Manager
 * Intelligent token budgeting with 50% cost reduction
 */

export interface PromptTier {
  name: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  temperature: number;
}

export const PROMPT_TIERS: Record<string, PromptTier> = {
  MINIMAL: {
    name: 'MINIMAL',
    maxInputTokens: 2000,
    maxOutputTokens: 4000,
    temperature: 0.7
  },
  STANDARD: {
    name: 'STANDARD',
    maxInputTokens: 4000,
    maxOutputTokens: 8000,
    temperature: 0.75
  },
  PREMIUM: {
    name: 'PREMIUM',
    maxInputTokens: 8000,
    maxOutputTokens: 12000,
    temperature: 0.8
  },
  ULTRA: {
    name: 'ULTRA',
    maxInputTokens: 12000,
    maxOutputTokens: 16000,
    temperature: 0.85
  }
};

export type ContentType = 'cluster' | 'pillar' | 'refresh' | 'surgical' | 'analysis';

export class TokenBudgetManager {
  private tokenUsage: { input: number; output: number } = { input: 0, output: 0 };
  private callCount: number = 0;
  
  /**
   * Select appropriate tier based on content type
   */
  selectTier(contentType: ContentType): PromptTier {
    switch (contentType) {
      case 'pillar':
        return PROMPT_TIERS.ULTRA;
      case 'cluster':
        return PROMPT_TIERS.PREMIUM;
      case 'refresh':
        return PROMPT_TIERS.STANDARD;
      case 'surgical':
        return PROMPT_TIERS.MINIMAL;
      case 'analysis':
        return PROMPT_TIERS.MINIMAL;
      default:
        return PROMPT_TIERS.STANDARD;
    }
  }
  
  /**
   * Estimate tokens in text (rough approximation: 1 token ≈ 4 chars)
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Prune context to fit within budget
   */
  pruneContext(context: PruneableContext, maxTokens: number): PrunedContext {
    const { serpData, competitors, references, paaQuestions, existingContent } = context;
    
    let currentTokens = 0;
    const result: PrunedContext = {
      top3Snippets: [],
      paaQuestions: [],
      keyGaps: [],
      competitorOutlines: [],
      truncatedContent: ''
    };
    
    // Priority 1: PAA Questions (high value, low tokens)
    if (paaQuestions && paaQuestions.length > 0) {
      const paa = paaQuestions.slice(0, 5);
      const paaTokens = this.estimateTokens(paa.join(' '));
      if (currentTokens + paaTokens < maxTokens) {
        result.paaQuestions = paa;
        currentTokens += paaTokens;
      }
    }
    
    // Priority 2: Top 3 SERP snippets
    if (serpData && serpData.organic) {
      const snippets = serpData.organic.slice(0, 3).map((r: any) => ({
        title: r.title?.substring(0, 100) || '',
        snippet: r.snippet?.substring(0, 200) || ''
      }));
      const snippetTokens = this.estimateTokens(JSON.stringify(snippets));
      if (currentTokens + snippetTokens < maxTokens) {
        result.top3Snippets = snippets;
        currentTokens += snippetTokens;
      }
    }
    
    // Priority 3: Key gaps from competitors
    if (competitors && competitors.length > 0) {
      const outlines = competitors.slice(0, 3).map((c: string) => c.substring(0, 500));
      const outlineTokens = this.estimateTokens(outlines.join(' '));
      if (currentTokens + outlineTokens < maxTokens) {
        result.competitorOutlines = outlines;
        currentTokens += outlineTokens;
      }
    }
    
    // Priority 4: Existing content (truncated)
    if (existingContent) {
      const remainingBudget = maxTokens - currentTokens;
      const maxChars = remainingBudget * 4;
      result.truncatedContent = existingContent.substring(0, Math.min(maxChars, 5000));
    }
    
    return result;
  }
  
  /**
   * Compress prompt by removing redundant whitespace and optimizing
   */
  compressPrompt(prompt: string): string {
    return prompt
      .replace(/\n{3,}/g, '\n\n')           // Max 2 newlines
      .replace(/[ \t]+/g, ' ')               // Single spaces
      .replace(/^\s+/gm, '')                 // Remove leading whitespace per line
      .replace(/\s+$/gm, '')                 // Remove trailing whitespace per line
      .trim();
  }
  
  /**
   * Track token usage
   */
  trackUsage(inputTokens: number, outputTokens: number): void {
    this.tokenUsage.input += inputTokens;
    this.tokenUsage.output += outputTokens;
    this.callCount++;
  }
  
  /**
   * Get usage statistics
   */
  getUsageStats(): { totalTokens: number; avgPerCall: number; callCount: number } {
    const totalTokens = this.tokenUsage.input + this.tokenUsage.output;
    return {
      totalTokens,
      avgPerCall: this.callCount > 0 ? Math.round(totalTokens / this.callCount) : 0,
      callCount: this.callCount
    };
  }
  
  /**
   * Reset usage tracking
   */
  resetUsage(): void {
    this.tokenUsage = { input: 0, output: 0 };
    this.callCount = 0;
  }
  
  /**
   * Calculate cost estimate (based on typical pricing)
   */
  estimateCost(): { inputCost: number; outputCost: number; totalCost: number } {
    // Approximate pricing per 1M tokens (varies by model)
    const INPUT_COST_PER_M = 0.5;  // $0.50 per 1M input tokens
    const OUTPUT_COST_PER_M = 1.5; // $1.50 per 1M output tokens
    
    const inputCost = (this.tokenUsage.input / 1_000_000) * INPUT_COST_PER_M;
    const outputCost = (this.tokenUsage.output / 1_000_000) * OUTPUT_COST_PER_M;
    
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost
    };
  }
}

// Types
export interface PruneableContext {
  serpData?: any;
  competitors?: string[];
  references?: any[];
  paaQuestions?: string[];
  existingContent?: string;
}

export interface PrunedContext {
  top3Snippets: { title: string; snippet: string }[];
  paaQuestions: string[];
  keyGaps: string[];
  competitorOutlines: string[];
  truncatedContent: string;
}

// Singleton instance
export const tokenBudgetManager = new TokenBudgetManager();

export default TokenBudgetManager;
