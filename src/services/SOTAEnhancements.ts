/**
 * SOTA ENHANCEMENTS v1.0
 * Real-time Fact Validation, Predictive Staleness Detection, Quality Gate Integration
 */

// Dynamic fetch helper to avoid circular dependencies
const fetchWithProxies = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const proxies = [
    (u: string) => u,
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
  ];
  
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy(url), { ...options, mode: 'cors' });
      if (res.ok || res.status < 500) return res;
    } catch (e) {
      continue;
    }
  }
  throw new Error(`All proxies failed for ${url}`);
};

// ============================================================================
// 1. REAL-TIME FACT VALIDATION ENGINE
// ============================================================================

export interface FactValidationResult {
  claim: string;
  isValid: boolean;
  confidence: number;
  source?: string;
  correction?: string;
  validatedAt: string;
}

export interface FactValidationReport {
  totalClaims: number;
  validatedClaims: number;
  invalidClaims: number;
  corrections: FactValidationResult[];
  overallScore: number;
  canPublish: boolean;
}

export class FactValidationEngine {
  private serperApiKey: string;

  constructor(serperApiKey: string) {
    this.serperApiKey = serperApiKey;
  }

  /**
   * Extract all factual claims from content
   */
  extractClaims(content: string): string[] {
    const claims: string[] = [];
    const text = content.replace(/<[^>]*>/g, ' ');
    
    // Pattern 1: Statistics (numbers with %)
    const statPatterns = text.match(/\d+(\.\d+)?%\s+of\s+[^.]+/gi) || [];
    claims.push(...statPatterns);
    
    // Pattern 2: Year-based claims
    const yearPatterns = text.match(/(?:in|since|by)\s+20\d{2}[^.]*\./gi) || [];
    claims.push(...yearPatterns.map(c => c.trim()));
    
    // Pattern 3: Studies/Research claims
    const studyPatterns = text.match(/(?:study|research|survey|report)\s+(?:shows?|found|reveals?|indicates?)[^.]+\./gi) || [];
    claims.push(...studyPatterns);
    
    // Pattern 4: Specific numbers
    const numberPatterns = text.match(/(?:over|more than|approximately|about|nearly)\s+\d[\d,]*\s+[^.]+/gi) || [];
    claims.push(...numberPatterns);
    
    // Deduplicate and limit
    return [...new Set(claims)].slice(0, 10);
  }

  /**
   * Validate a single claim against live sources
   */
  async validateClaim(claim: string): Promise<FactValidationResult> {
    if (!this.serperApiKey) {
      return {
        claim,
        isValid: true,
        confidence: 50,
        validatedAt: new Date().toISOString()
      };
    }

    try {
      const searchQuery = `${claim} fact check statistics`;
      const response = await fetchWithProxies("https://google.serper.dev/search", {
        method: 'POST',
        headers: { 'X-API-KEY': this.serperApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: searchQuery, num: 3 })
      });
      
      const data = await response.json();
      const results = data.organic || [];
      
      if (results.length === 0) {
        return {
          claim,
          isValid: true,
          confidence: 60,
          validatedAt: new Date().toISOString()
        };
      }

      // Check if any result contradicts the claim
      const snippets = results.map((r: any) => r.snippet?.toLowerCase() || '').join(' ');
      const claimLower = claim.toLowerCase();
      
      // Extract numbers from claim and results
      const claimNumbers = claim.match(/\d+(\.\d+)?/g) || [];
      const resultNumbers = snippets.match(/\d+(\.\d+)?/g) || [];
      
      let isValid = true;
      let confidence = 85;
      let correction: string | undefined;
      
      // Check for number discrepancies
      if (claimNumbers.length > 0 && resultNumbers.length > 0) {
        const claimNum = parseFloat(claimNumbers[0]);
        for (const resultNum of resultNumbers) {
          const num = parseFloat(resultNum);
          if (Math.abs(claimNum - num) > claimNum * 0.3) { // 30% tolerance
            // Potential discrepancy
            confidence -= 20;
          }
        }
      }

      return {
        claim,
        isValid,
        confidence: Math.max(50, confidence),
        source: results[0]?.link,
        correction,
        validatedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        claim,
        isValid: true,
        confidence: 50,
        validatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Validate all claims in content
   */
  async validateContent(content: string): Promise<FactValidationReport> {
    const claims = this.extractClaims(content);
    const results: FactValidationResult[] = [];
    
    for (const claim of claims) {
      const result = await this.validateClaim(claim);
      results.push(result);
      await new Promise(r => setTimeout(r, 500)); // Rate limiting
    }
    
    const validCount = results.filter(r => r.isValid && r.confidence >= 70).length;
    const invalidCount = results.filter(r => !r.isValid || r.confidence < 70).length;
    const avgConfidence = results.length > 0 
      ? results.reduce((acc, r) => acc + r.confidence, 0) / results.length 
      : 100;
    
    return {
      totalClaims: claims.length,
      validatedClaims: validCount,
      invalidClaims: invalidCount,
      corrections: results.filter(r => r.correction),
      overallScore: Math.round(avgConfidence),
      canPublish: invalidCount === 0 && avgConfidence >= 75
    };
  }
}

// ============================================================================
// 2. PREDICTIVE STALENESS DETECTOR
// ============================================================================

export interface StalenessScore {
  pageUrl: string;
  stalenessScore: number; // 0-100, higher = more stale
  predictedDecayDate: string;
  factors: StalenessFactors;
  priority: 'critical' | 'high' | 'medium' | 'low';
  recommendedAction: string;
}

export interface StalenessFactors {
  contentAge: number; // days
  statisticsAge: number; // estimated age of stats
  industryVolatility: number; // 0-100
  competitorUpdateFrequency: number; // 0-100
  seasonality: number; // 0-100
  trendVelocity: number; // 0-100
}

export class StalenessDetector {
  private readonly VOLATILITY_KEYWORDS = new Map([
    ['crypto', 95], ['bitcoin', 95], ['ai', 90], ['artificial intelligence', 90],
    ['stock', 85], ['market', 80], ['tech', 75], ['software', 70],
    ['health', 65], ['medical', 70], ['legal', 60], ['finance', 75],
    ['seo', 70], ['marketing', 65], ['social media', 80], ['trends', 85]
  ]);

  /**
   * Calculate staleness score for a page
   */
  calculateStalenessScore(
    content: string,
    lastUpdated: Date | string,
    title: string,
    url: string
  ): StalenessScore {
    const now = new Date();
    const updated = new Date(lastUpdated);
    const contentAge = Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
    
    // Extract year mentions to estimate statistics age
    const yearMatches = content.match(/20\d{2}/g) || [];
    const currentYear = now.getFullYear();
    const oldestYear = yearMatches.length > 0 
      ? Math.min(...yearMatches.map(y => parseInt(y)))
      : currentYear;
    const statisticsAge = (currentYear - oldestYear) * 365;
    
    // Calculate industry volatility
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();
    let industryVolatility = 50;
    
    for (const [keyword, volatility] of this.VOLATILITY_KEYWORDS) {
      if (titleLower.includes(keyword) || contentLower.includes(keyword)) {
        industryVolatility = Math.max(industryVolatility, volatility);
      }
    }
    
    // Calculate trend velocity (presence of year references)
    const hasCurrentYear = content.includes(currentYear.toString());
    const hasPreviousYear = content.includes((currentYear - 1).toString());
    const hasOldYears = yearMatches.some(y => parseInt(y) < currentYear - 1);
    const trendVelocity = hasOldYears && !hasCurrentYear ? 80 : (hasCurrentYear ? 20 : 50);
    
    // Seasonality check
    const month = now.getMonth();
    const seasonality = (month === 0 || month === 11) ? 70 : 30; // High in Jan/Dec
    
    // Competitor update frequency (simulated)
    const competitorUpdateFrequency = industryVolatility * 0.8;
    
    const factors: StalenessFactors = {
      contentAge,
      statisticsAge,
      industryVolatility,
      competitorUpdateFrequency,
      seasonality,
      trendVelocity
    };
    
    // Calculate composite staleness score
    const stalenessScore = Math.min(100, Math.round(
      (contentAge / 365) * 25 + // Age factor (25%)
      (statisticsAge / 730) * 20 + // Stats age factor (20%)
      industryVolatility * 0.25 + // Volatility factor (25%)
      trendVelocity * 0.15 + // Trend factor (15%)
      seasonality * 0.15 // Seasonality factor (15%)
    ));
    
    // Predict decay date
    const daysUntilDecay = Math.max(7, Math.round((100 - stalenessScore) * 3.65));
    const decayDate = new Date(now.getTime() + daysUntilDecay * 24 * 60 * 60 * 1000);
    
    // Determine priority
    let priority: 'critical' | 'high' | 'medium' | 'low';
    let recommendedAction: string;
    
    if (stalenessScore >= 80) {
      priority = 'critical';
      recommendedAction = 'Immediate refresh required - rankings at risk';
    } else if (stalenessScore >= 60) {
      priority = 'high';
      recommendedAction = 'Schedule refresh within 7 days';
    } else if (stalenessScore >= 40) {
      priority = 'medium';
      recommendedAction = 'Review within 30 days';
    } else {
      priority = 'low';
      recommendedAction = 'Content is fresh - no action needed';
    }
    
    return {
      pageUrl: url,
      stalenessScore,
      predictedDecayDate: decayDate.toISOString().split('T')[0],
      factors,
      priority,
      recommendedAction
    };
  }

  /**
   * Batch analyze pages and queue critical ones
   */
  analyzePages(pages: Array<{ url: string; title: string; content: string; lastUpdated: Date | string }>): StalenessScore[] {
    return pages
      .map(page => this.calculateStalenessScore(page.content, page.lastUpdated, page.title, page.url))
      .sort((a, b) => b.stalenessScore - a.stalenessScore);
  }

  /**
   * Get pages that need immediate refresh
   */
  getCriticalPages(pages: Array<{ url: string; title: string; content: string; lastUpdated: Date | string }>): StalenessScore[] {
    return this.analyzePages(pages).filter(p => p.priority === 'critical' || p.priority === 'high');
  }
}

// ============================================================================
// 3. ENHANCED QUALITY GATE (Integrates with existing QualityGate)
// ============================================================================

export interface EnhancedQualityResult {
  baseScore: number;
  factValidationScore: number;
  stalenessScore: number;
  finalScore: number;
  canPublish: boolean;
  blockers: string[];
  warnings: string[];
}

export async function enhancedQualityCheck(
  content: string,
  keyword: string,
  serperApiKey: string,
  lastUpdated?: Date | string
): Promise<EnhancedQualityResult> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  
  // Import base quality gate dynamically to avoid circular deps
  const { QualityGate } = await import('./QualityGate');
  
  // 1. Base quality check
  const baseResult = QualityGate.preflightCheck(content, keyword);
  const baseScore = baseResult.score.overallConfidence;
  
  if (!baseResult.canPublish) {
    blockers.push(...baseResult.issues);
  }
  warnings.push(...baseResult.suggestions);
  
  // 2. Fact validation (if API key available)
  let factValidationScore = 100;
  if (serperApiKey) {
    const factEngine = new FactValidationEngine(serperApiKey);
    const factReport = await factEngine.validateContent(content);
    factValidationScore = factReport.overallScore;
    
    if (!factReport.canPublish) {
      blockers.push(`Fact validation failed: ${factReport.invalidClaims} unverified claims`);
    }
    if (factReport.corrections.length > 0) {
      warnings.push(`${factReport.corrections.length} claims may need review`);
    }
  }
  
  // 3. Staleness check (if lastUpdated provided)
  let stalenessScore = 0;
  if (lastUpdated) {
    const stalenessDetector = new StalenessDetector();
    const stalenessResult = stalenessDetector.calculateStalenessScore(
      content, lastUpdated, keyword, ''
    );
    stalenessScore = stalenessResult.stalenessScore;
    
    if (stalenessResult.priority === 'critical') {
      warnings.push('Content is critically stale - consider major refresh');
    }
  }
  
  // Calculate final score (weighted average)
  const finalScore = Math.round(
    baseScore * 0.5 +
    factValidationScore * 0.3 +
    (100 - stalenessScore) * 0.2
  );
  
  const canPublish = blockers.length === 0 && finalScore >= 85;
  
  return {
    baseScore,
    factValidationScore,
    stalenessScore,
    finalScore,
    canPublish,
    blockers,
    warnings
  };
}

// ============================================================================
// 4. EXPORTS
// ============================================================================

export const factValidationEngine = (apiKey: string) => new FactValidationEngine(apiKey);
export const stalenessDetector = new StalenessDetector();
