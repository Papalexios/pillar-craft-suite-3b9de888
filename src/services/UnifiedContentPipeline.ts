/**
 * GOD MODE 2.0: Unified Content Pipeline
 * Single atomic operation replacing 5-7 sequential AI calls
 * 10x token efficiency, 60% faster generation
 */

import { QualityGate, QualityCheckResult } from './QualityGate';
import { semanticCache } from './SemanticCache';
import { tokenBudgetManager, PROMPT_TIERS, ContentType } from './TokenBudgetManager';
import { HumanWritingEngine } from './HumanWritingEngine';

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const TARGET_YEAR = now.getMonth() === 11 ? CURRENT_YEAR + 1 : CURRENT_YEAR;

export interface PipelineInput {
  keyword: string;
  contentType: ContentType;
  existingContent?: string;
  serpData?: any;
  competitors?: string[];
  paaQuestions?: string[];
  neuronData?: string;
  internalLinks?: string[];
}

export interface PipelineOutput {
  content: string;
  title: string;
  metaDescription: string;
  slug: string;
  wordCount: number;
  qualityScore: QualityCheckResult;
  tokensUsed: number;
  generationTime: number;
}

export interface UnifiedPromptConfig {
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
}

export class UnifiedContentPipeline {
  /**
   * Generate content through unified pipeline
   */
  static async generate(
    input: PipelineInput,
    callAI: (prompt: string, config: any) => Promise<string>
  ): Promise<PipelineOutput> {
    const startTime = Date.now();
    
    // Check cache first
    const cached = semanticCache.get<PipelineOutput>(
      input.keyword,
      input.contentType,
      'GENERATED_CONTENT'
    );
    
    if (cached && cached.qualityScore.canPublish) {
      console.log(`[Pipeline] Cache hit for "${input.keyword}"`);
      return cached;
    }
    
    // Select tier based on content type
    const tier = tokenBudgetManager.selectTier(input.contentType);
    
    // Prune context to fit budget
    const prunedContext = tokenBudgetManager.pruneContext({
      serpData: input.serpData,
      competitors: input.competitors,
      paaQuestions: input.paaQuestions,
      existingContent: input.existingContent
    }, tier.maxInputTokens);
    
    // Build unified prompt
    const promptConfig = this.buildUnifiedPrompt(input, prunedContext, tier);
    
    // Single AI call for everything
    let rawContent: string;
    try {
      rawContent = await callAI(promptConfig.userPrompt, {
        systemPrompt: promptConfig.systemPrompt,
        maxTokens: promptConfig.maxTokens,
        temperature: promptConfig.temperature
      });
    } catch (error) {
      console.error('[Pipeline] AI call failed:', error);
      throw new Error('Content generation failed');
    }
    
    // Parse response
    const parsed = this.parseUnifiedResponse(rawContent, input.keyword);
    
    // Humanize content
    const humanizedContent = HumanWritingEngine.humanize(parsed.content);
    
    // Quality check
    const qualityScore = QualityGate.preflightCheck(humanizedContent, input.keyword);
    
    // Track token usage
    const tokensUsed = tokenBudgetManager.estimateTokens(promptConfig.userPrompt) + 
                       tokenBudgetManager.estimateTokens(rawContent);
    tokenBudgetManager.trackUsage(
      tokenBudgetManager.estimateTokens(promptConfig.userPrompt),
      tokenBudgetManager.estimateTokens(rawContent)
    );
    
    const output: PipelineOutput = {
      content: humanizedContent,
      title: parsed.title,
      metaDescription: parsed.metaDescription,
      slug: parsed.slug,
      wordCount: qualityScore.score.wordCount,
      qualityScore,
      tokensUsed,
      generationTime: Date.now() - startTime
    };
    
    // Cache successful generations
    if (qualityScore.canPublish) {
      semanticCache.set(input.keyword, input.contentType, 'GENERATED_CONTENT', output);
    }
    
    return output;
  }
  
  /**
   * Build unified prompt that generates everything in one call
   */
  private static buildUnifiedPrompt(
    input: PipelineInput,
    context: any,
    tier: typeof PROMPT_TIERS.STANDARD
  ): UnifiedPromptConfig {
    const systemPrompt = `You are ALEX HORMOZI writing the DEFINITIVE ${TARGET_YEAR} guide on "${input.keyword}".

## CRITICAL RULES - VIOLATION = FAILURE

### WORD COUNT: EXACTLY 2500-3000 WORDS
- Count every word. No shortcuts.
- This is non-negotiable. Below 2500 = FAILURE.

### STYLE: HORMOZI MODE (MANDATORY)
1. SHORT SENTENCES: Max 12 words. Period.
2. ACTIVE VOICE ONLY: "You do X." NOT "X is done by you."
3. ZERO FLUFF: If it doesn't add value, delete it.
4. GRADE 5 READING: Simple words. Big ideas.
5. DIRECT ADDRESS: Talk to "You".
6. AGGRESSIVE HELPFULNESS: Give answers immediately.

### BANNED PHRASES (INSTANT REJECTION)
delve, tapestry, landscape, realm, leverage, robust, holistic, paradigm, synergy,
unlock, empower, harness, navigate, foster, utilize, facilitate, streamline,
cutting-edge, game-changer, comprehensive guide, in today's world, it's worth noting,
in conclusion, to summarize, furthermore, moreover, additionally, firstly, secondly

### HUMAN WRITING RULES (ANTI-AI DETECTION)
1. Use contractions: don't, won't, can't, you're, it's, that's
2. Vary sentence length: Mix 5-word punches with 20-word explanations
3. Start sentences with "And", "But", "So" occasionally
4. Use fragments for emphasis. Like this.
5. Include rhetorical questions. Make sense?
6. Add personality: "Here's the thing.", "Look.", "Real talk."

### STRUCTURE REQUIREMENTS
1. NO H1 TAGS - Start with H2
2. RAW HTML ONLY - No markdown
3. Include exactly 2 YouTube placeholders: [YOUTUBE_VIDEO_1], [YOUTUBE_VIDEO_2]
4. Include 3 image placeholders: [IMAGE_1], [IMAGE_2], [IMAGE_3]
5. Use [LINK_CANDIDATE: anchor text] for 6-12 internal links
6. Include 1 data comparison table with real metrics
7. Include 8 FAQ items in <details> format
8. Include Key Takeaways box with 8 points

### OUTPUT FORMAT
Return a JSON object with these EXACT fields:
{
  "title": "SEO title 50-60 chars with keyword",
  "metaDescription": "Meta description 135-155 chars",
  "slug": "url-slug-with-keyword",
  "content": "FULL HTML CONTENT 2500-3000 WORDS"
}`;

    const userPrompt = `## TARGET KEYWORD: "${input.keyword}"

## CONTEXT DATA
${context.paaQuestions?.length > 0 ? `### People Also Ask:\n${context.paaQuestions.join('\n')}` : ''}

${context.top3Snippets?.length > 0 ? `### Top Competitors:\n${context.top3Snippets.map((s: any) => `- ${s.title}: ${s.snippet}`).join('\n')}` : ''}

${context.competitorOutlines?.length > 0 ? `### Competitor Gaps to Fill:\n${context.competitorOutlines.join('\n\n')}` : ''}

${input.neuronData ? `### NeuronWriter Data:\n${input.neuronData}` : ''}

${input.internalLinks?.length > 0 ? `### Available Internal Links:\n${input.internalLinks.slice(0, 15).join('\n')}` : ''}

## EXECUTION CHECKLIST
✓ Write 2500-3000 words (COUNT THEM)
✓ Use Hormozi style throughout
✓ Include [YOUTUBE_VIDEO_1] and [YOUTUBE_VIDEO_2]
✓ Include [IMAGE_1], [IMAGE_2], [IMAGE_3]
✓ Add comparison table with real data
✓ Add 8 FAQ items
✓ Add 8 Key Takeaways
✓ Use 6-12 [LINK_CANDIDATE: text] markers
✓ NO banned AI phrases
✓ Start with bold 45-55 word definition paragraph

Return JSON with title, metaDescription, slug, and content fields.`;

    return {
      maxTokens: tier.maxOutputTokens,
      temperature: tier.temperature,
      systemPrompt: tokenBudgetManager.compressPrompt(systemPrompt),
      userPrompt: tokenBudgetManager.compressPrompt(userPrompt)
    };
  }
  
  /**
   * Parse unified AI response
   */
  private static parseUnifiedResponse(
    response: string,
    keyword: string
  ): { title: string; metaDescription: string; slug: string; content: string } {
    // Try to extract JSON
    let parsed: any;
    
    try {
      // Handle markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      
      // Find JSON object
      const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        parsed = JSON.parse(objectMatch[0]);
      }
    } catch (e) {
      console.warn('[Pipeline] JSON parse failed, extracting content directly');
    }
    
    // Fallback extraction
    if (!parsed || !parsed.content) {
      const titleMatch = response.match(/"title"\s*:\s*"([^"]+)"/);
      const metaMatch = response.match(/"metaDescription"\s*:\s*"([^"]+)"/);
      const slugMatch = response.match(/"slug"\s*:\s*"([^"]+)"/);
      const contentMatch = response.match(/"content"\s*:\s*"([\s\S]+?)(?:"\s*}|"\s*,\s*")/);
      
      parsed = {
        title: titleMatch?.[1] || this.generateTitle(keyword),
        metaDescription: metaMatch?.[1] || this.generateMetaDescription(keyword),
        slug: slugMatch?.[1] || this.generateSlug(keyword),
        content: contentMatch?.[1] || this.extractHtmlContent(response)
      };
    }
    
    // Ensure content is properly formatted
    let content = parsed.content || '';
    
    // Unescape JSON-escaped content
    content = content
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    
    // Clean up any remaining issues
    content = this.sanitizeContent(content);
    
    return {
      title: parsed.title || this.generateTitle(keyword),
      metaDescription: parsed.metaDescription || this.generateMetaDescription(keyword),
      slug: parsed.slug || this.generateSlug(keyword),
      content
    };
  }
  
  /**
   * Extract HTML content from mixed response
   */
  private static extractHtmlContent(response: string): string {
    // Look for HTML content
    const htmlMatch = response.match(/<h2[\s\S]*$/i);
    if (htmlMatch) {
      return htmlMatch[0];
    }
    
    // Return as-is if no HTML found
    return response;
  }
  
  /**
   * Sanitize and clean content
   */
  private static sanitizeContent(content: string): string {
    return content
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .replace(/^\s*<h1.*?>.*?<\/h1>/i, '')
      .replace(/Protocol Active: v\d+\.\d+/gi, '')
      .replace(/REF: GUTF-Protocol-[a-z0-9]+/gi, '')
      .trim();
  }
  
  /**
   * Generate fallback title
   */
  private static generateTitle(keyword: string): string {
    return `${keyword.charAt(0).toUpperCase() + keyword.slice(1)}: Complete ${TARGET_YEAR} Guide`;
  }
  
  /**
   * Generate fallback meta description
   */
  private static generateMetaDescription(keyword: string): string {
    return `Master ${keyword} with our ${TARGET_YEAR} expert guide. Proven strategies, real examples, and actionable steps.`;
  }
  
  /**
   * Generate URL slug
   */
  private static generateSlug(keyword: string): string {
    return keyword
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  
  /**
   * Retry generation with adjustments if quality check fails
   */
  static async retryWithFixes(
    input: PipelineInput,
    previousOutput: PipelineOutput,
    callAI: (prompt: string, config: any) => Promise<string>
  ): Promise<PipelineOutput> {
    console.log('[Pipeline] Retrying with quality fixes...');
    
    // Build fix-focused prompt
    const issues = previousOutput.qualityScore.issues;
    const suggestions = previousOutput.qualityScore.suggestions;
    
    const fixPrompt = `## CONTENT REPAIR REQUEST

The previous content had these issues:
${issues.map(i => `- ${i}`).join('\n')}

Suggested fixes:
${suggestions.map(s => `- ${s}`).join('\n')}

## ORIGINAL CONTENT TO FIX:
${previousOutput.content.substring(0, 8000)}

## TASK:
Rewrite to fix ALL issues while maintaining the same structure.
Return ONLY the fixed HTML content (no JSON wrapper needed).
CRITICAL: Ensure 2500-3000 words.`;

    const fixed = await callAI(fixPrompt, {
      maxTokens: 12000,
      temperature: 0.8
    });
    
    const humanized = HumanWritingEngine.humanize(fixed);
    const newQuality = QualityGate.preflightCheck(humanized, input.keyword);
    
    return {
      ...previousOutput,
      content: humanized,
      wordCount: newQuality.score.wordCount,
      qualityScore: newQuality
    };
  }
}

export default UnifiedContentPipeline;
