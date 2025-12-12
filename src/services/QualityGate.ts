/**
 * GOD MODE 2.0: Quality Gate Service
 * Confidence-gated publishing - NEVER publish low-confidence content
 */

export interface QualityScore {
  wordCount: number;
  keywordDensity: number;
  readability: number;
  uniquePhrases: number;
  internalLinks: number;
  externalRefs: number;
  humanScore: number;
  overallConfidence: number;
}

export interface QualityCheckResult {
  canPublish: boolean;
  score: QualityScore;
  issues: string[];
  suggestions: string[];
}

// Thresholds
const PUBLISH_THRESHOLD = 85;
const MIN_WORD_COUNT = 2500;
const MAX_WORD_COUNT = 3200;
const MIN_KEYWORD_DENSITY = 0.8;
const MAX_KEYWORD_DENSITY = 2.5;
const MAX_READABILITY_GRADE = 8;
const MIN_INTERNAL_LINKS = 6;
const MIN_EXTERNAL_REFS = 2;

// AI Detection - Banned phrases that scream "AI wrote this"
const BANNED_AI_PHRASES = new Set([
  'delve', 'tapestry', 'landscape', 'realm', 'leverage', 'robust', 'holistic',
  'paradigm', 'synergy', 'unlock', 'empower', 'harness', 'navigate', 'foster',
  'utilize', 'facilitate', 'streamline', 'cutting-edge', 'game-changer',
  'comprehensive guide', "in today's world", "it's worth noting", 'in conclusion',
  'to summarize', 'as we can see', 'it is important to note', 'furthermore',
  'moreover', 'additionally', 'firstly', 'secondly', 'thirdly', 'here is a guide',
  'in this article', 'revolutionize', 'unprecedented', 'seamlessly', 'pivotal',
  'multifaceted', 'intricate', 'embark', 'journey', 'discover', 'uncover',
  'dive deep', 'deep dive', 'explore the world', 'ultimate guide', 'everything you need'
]);

// Hormozi-approved patterns
const HUMAN_PATTERNS = [
  /\b(Look\.|Here's the thing\.|Most people|The truth\?|But here's|And that's)/gi,
  /\b(don't|won't|can't|you're|it's|that's|there's|I've|we've|you've)\b/gi,
  /\b(actually|honestly|basically|seriously|literally)\b/gi,
];

export class QualityGate {
  /**
   * Pre-flight validation before publishing
   */
  static preflightCheck(content: string, keyword: string): QualityCheckResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    // Calculate all metrics
    const wordCount = this.countWords(content);
    const keywordDensity = this.calculateKeywordDensity(content, keyword);
    const readability = this.calculateReadability(content);
    const uniquePhrases = this.countUniquePhrases(content);
    const internalLinks = this.countInternalLinks(content);
    const externalRefs = this.countExternalRefs(content);
    const humanScore = this.calculateHumanScore(content);
    
    // Word count validation
    if (wordCount < MIN_WORD_COUNT) {
      issues.push(`Word count ${wordCount} below minimum ${MIN_WORD_COUNT}`);
      suggestions.push(`Add ${MIN_WORD_COUNT - wordCount} more words with value-packed content`);
    }
    if (wordCount > MAX_WORD_COUNT) {
      issues.push(`Word count ${wordCount} exceeds maximum ${MAX_WORD_COUNT}`);
      suggestions.push('Trim fluff and redundant sections');
    }
    
    // Keyword density
    if (keywordDensity < MIN_KEYWORD_DENSITY) {
      issues.push(`Keyword density ${keywordDensity.toFixed(2)}% too low`);
      suggestions.push(`Naturally include "${keyword}" more often`);
    }
    if (keywordDensity > MAX_KEYWORD_DENSITY) {
      issues.push(`Keyword density ${keywordDensity.toFixed(2)}% too high (keyword stuffing)`);
      suggestions.push('Use semantic variations instead of repeating exact keyword');
    }
    
    // Readability
    if (readability > MAX_READABILITY_GRADE) {
      issues.push(`Readability grade ${readability} too complex (max: ${MAX_READABILITY_GRADE})`);
      suggestions.push('Use shorter sentences and simpler words');
    }
    
    // Internal links
    if (internalLinks < MIN_INTERNAL_LINKS) {
      issues.push(`Only ${internalLinks} internal links (min: ${MIN_INTERNAL_LINKS})`);
      suggestions.push('Add more internal links for topic clustering');
    }
    
    // External references
    if (externalRefs < MIN_EXTERNAL_REFS) {
      issues.push(`Only ${externalRefs} external references (min: ${MIN_EXTERNAL_REFS})`);
      suggestions.push('Add authoritative external references for E-E-A-T');
    }
    
    // Human score (AI detection)
    if (humanScore < 70) {
      issues.push(`Human writing score ${humanScore}% - AI patterns detected`);
      suggestions.push('Add contractions, rhetorical questions, and natural sentence variety');
    }
    
    // Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence({
      wordCount,
      keywordDensity,
      readability,
      uniquePhrases,
      internalLinks,
      externalRefs,
      humanScore,
      overallConfidence: 0
    });
    
    const score: QualityScore = {
      wordCount,
      keywordDensity,
      readability,
      uniquePhrases,
      internalLinks,
      externalRefs,
      humanScore,
      overallConfidence
    };
    
    return {
      canPublish: overallConfidence >= PUBLISH_THRESHOLD && issues.length === 0,
      score,
      issues,
      suggestions
    };
  }
  
  /**
   * Count words in content (strips HTML)
   */
  private static countWords(content: string): number {
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }
  
  /**
   * Calculate keyword density as percentage
   */
  private static calculateKeywordDensity(content: string, keyword: string): number {
    const text = content.replace(/<[^>]*>/g, ' ').toLowerCase();
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const keywordLower = keyword.toLowerCase();
    const keywordCount = words.filter(w => w.includes(keywordLower)).length;
    return (keywordCount / words.length) * 100;
  }
  
  /**
   * Calculate Flesch-Kincaid grade level
   */
  private static calculateReadability(content: string): number {
    const text = content.replace(/<[^>]*>/g, ' ');
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllables = words.reduce((acc, word) => acc + this.countSyllables(word), 0);
    
    if (sentences.length === 0 || words.length === 0) return 0;
    
    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;
    
    // Flesch-Kincaid Grade Level
    return 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
  }
  
  /**
   * Count syllables in a word (approximation)
   */
  private static countSyllables(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;
    
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }
  
  /**
   * Count unique phrases (non-AI patterns)
   */
  private static countUniquePhrases(content: string): number {
    let bannedCount = 0;
    const textLower = content.toLowerCase();
    
    BANNED_AI_PHRASES.forEach(phrase => {
      if (textLower.includes(phrase.toLowerCase())) {
        bannedCount++;
      }
    });
    
    return Math.max(0, 100 - bannedCount * 10);
  }
  
  /**
   * Count internal links
   */
  private static countInternalLinks(content: string): number {
    const linkMatches = content.match(/<a[^>]+href=["'][^"']+["'][^>]*>/gi) || [];
    const internalLinks = linkMatches.filter(link => {
      return !link.includes('http://') && !link.includes('https://') || 
             link.includes('rel="noopener"') || link.includes('[LINK_CANDIDATE');
    });
    
    // Also count link candidates
    const linkCandidates = (content.match(/\[LINK_CANDIDATE:[^\]]+\]/g) || []).length;
    
    return internalLinks.length + linkCandidates;
  }
  
  /**
   * Count external references
   */
  private static countExternalRefs(content: string): number {
    const externalLinks = (content.match(/<a[^>]+href=["']https?:\/\/[^"']+["'][^>]*>/gi) || []).length;
    const citationBoxes = (content.match(/sota-references-section/gi) || []).length;
    return externalLinks + citationBoxes;
  }
  
  /**
   * Calculate human writing score (0-100)
   */
  private static calculateHumanScore(content: string): number {
    let score = 100;
    const textLower = content.toLowerCase();
    
    // Penalize banned AI phrases
    BANNED_AI_PHRASES.forEach(phrase => {
      if (textLower.includes(phrase.toLowerCase())) {
        score -= 5;
      }
    });
    
    // Reward human patterns
    let humanPatternCount = 0;
    HUMAN_PATTERNS.forEach(pattern => {
      const matches = content.match(pattern) || [];
      humanPatternCount += matches.length;
    });
    
    // Add points for contractions and natural language
    score += Math.min(15, humanPatternCount * 2);
    
    // Check sentence variety
    const sentences = content.replace(/<[^>]*>/g, '').split(/[.!?]+/);
    const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).length).filter(l => l > 0);
    
    if (sentenceLengths.length > 5) {
      const variance = this.calculateVariance(sentenceLengths);
      if (variance > 20) score += 5; // Good variety
      if (variance < 5) score -= 10; // Too uniform (robotic)
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Calculate variance of an array
   */
  private static calculateVariance(arr: number[]): number {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const squareDiffs = arr.map(value => Math.pow(value - mean, 2));
    return squareDiffs.reduce((a, b) => a + b, 0) / arr.length;
  }
  
  /**
   * Calculate overall confidence score (0-100)
   */
  private static calculateOverallConfidence(score: QualityScore): number {
    const weights = {
      wordCount: 25,
      keywordDensity: 15,
      readability: 15,
      uniquePhrases: 10,
      internalLinks: 10,
      externalRefs: 10,
      humanScore: 15
    };
    
    let confidence = 0;
    
    // Word count (0-25 points)
    if (score.wordCount >= MIN_WORD_COUNT && score.wordCount <= MAX_WORD_COUNT) {
      confidence += weights.wordCount;
    } else {
      const diff = Math.abs(score.wordCount - (MIN_WORD_COUNT + MAX_WORD_COUNT) / 2);
      confidence += Math.max(0, weights.wordCount - diff / 50);
    }
    
    // Keyword density (0-15 points)
    if (score.keywordDensity >= MIN_KEYWORD_DENSITY && score.keywordDensity <= MAX_KEYWORD_DENSITY) {
      confidence += weights.keywordDensity;
    } else {
      confidence += weights.keywordDensity * 0.5;
    }
    
    // Readability (0-15 points)
    if (score.readability <= MAX_READABILITY_GRADE) {
      confidence += weights.readability;
    } else {
      confidence += Math.max(0, weights.readability - (score.readability - MAX_READABILITY_GRADE) * 2);
    }
    
    // Unique phrases (0-10 points)
    confidence += (score.uniquePhrases / 100) * weights.uniquePhrases;
    
    // Internal links (0-10 points)
    confidence += Math.min(1, score.internalLinks / MIN_INTERNAL_LINKS) * weights.internalLinks;
    
    // External refs (0-10 points)
    confidence += Math.min(1, score.externalRefs / MIN_EXTERNAL_REFS) * weights.externalRefs;
    
    // Human score (0-15 points)
    confidence += (score.humanScore / 100) * weights.humanScore;
    
    return Math.round(confidence);
  }
  
  /**
   * Quick check if content passes minimum thresholds
   */
  static quickCheck(content: string, keyword: string): boolean {
    const wordCount = this.countWords(content);
    const humanScore = this.calculateHumanScore(content);
    return wordCount >= MIN_WORD_COUNT && humanScore >= 60;
  }
}

export default QualityGate;
