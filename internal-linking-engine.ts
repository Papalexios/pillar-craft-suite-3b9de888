import { SitemapPage } from './types';

export interface LinkOpportunity {
  fromPage: string;
  toPage: string;
  anchorText: string;
  relevanceScore: number;
  contextSnippet: string;
  position: number;
  reason: string;
}

export interface LinkCluster {
  pillarPage: SitemapPage;
  clusterPages: SitemapPage[];
  linkDensity: number;
  topicRelevance: number;
}

export class InternalLinkingEngine {
  private semanticCache: Map<string, string[]> = new Map();

  generateLinkOpportunities(
    targetContent: string,
    existingPages: SitemapPage[],
    maxLinks: number = 15
  ): LinkOpportunity[] {
    const opportunities: LinkOpportunity[] = [];
    const contentLower = targetContent.toLowerCase();
    const sentences = this.extractSentences(targetContent);

    for (const page of existingPages) {
      const keywords = this.extractKeywords(page.title);

      for (const keyword of keywords) {
        const positions = this.findKeywordPositions(contentLower, keyword);

        for (const position of positions) {
          const sentence = this.findSentenceAtPosition(sentences, position);

          if (sentence && !this.hasLinkNearby(targetContent, position)) {
            opportunities.push({
              fromPage: 'current',
              toPage: page.slug,
              anchorText: keyword,
              relevanceScore: this.calculateRelevance(keyword, sentence),
              contextSnippet: sentence.substring(0, 100),
              position,
              reason: `Contextually relevant mention of "${keyword}"`
            });
          }
        }
      }
    }

    const sorted = opportunities
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxLinks);

    return this.distributeEvenly(sorted, targetContent.length);
  }

  identifyTopicClusters(pages: SitemapPage[]): LinkCluster[] {
    const clusters: LinkCluster[] = [];
    const processed = new Set<string>();

    for (const page of pages) {
      if (processed.has(page.id)) continue;

      const relatedPages = this.findRelatedPages(page, pages);

      if (relatedPages.length >= 2) {
        clusters.push({
          pillarPage: page,
          clusterPages: relatedPages,
          linkDensity: this.calculateClusterLinkDensity(page, relatedPages),
          topicRelevance: this.calculateTopicRelevance(page, relatedPages)
        });

        processed.add(page.id);
        relatedPages.forEach(p => processed.add(p.id));
      }
    }

    return clusters.sort((a, b) => b.topicRelevance - a.topicRelevance);
  }

  generateSmartLinkingStrategy(clusters: LinkCluster[]): {
    recommendations: string[];
    missingLinks: Array<{ from: string; to: string; priority: number }>;
  } {
    const recommendations: string[] = [];
    const missingLinks: Array<{ from: string; to: string; priority: number }> = [];

    for (const cluster of clusters) {
      const pillarSlug = cluster.pillarPage.slug;

      recommendations.push(
        `Create a pillar page hub for "${cluster.pillarPage.title}" linking to ${cluster.clusterPages.length} related articles`
      );

      for (const clusterPage of cluster.clusterPages) {
        missingLinks.push({
          from: clusterPage.slug,
          to: pillarSlug,
          priority: 90
        });

        missingLinks.push({
          from: pillarSlug,
          to: clusterPage.slug,
          priority: 95
        });

        for (const otherPage of cluster.clusterPages) {
          if (otherPage.id !== clusterPage.id) {
            missingLinks.push({
              from: clusterPage.slug,
              to: otherPage.slug,
              priority: 60
            });
          }
        }
      }
    }

    return {
      recommendations,
      missingLinks: missingLinks
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 50)
    };
  }

  injectContextualLinks(
    content: string,
    opportunities: LinkOpportunity[]
  ): string {
    let modifiedContent = content;
    const injected = new Set<number>();

    for (const opp of opportunities) {
      if (injected.has(opp.position)) continue;

      const beforeLink = modifiedContent.substring(0, opp.position);
      const afterLink = modifiedContent.substring(opp.position);

      const anchorStart = afterLink.indexOf(opp.anchorText);

      if (anchorStart !== -1 && anchorStart < 200) {
        const actualPosition = opp.position + anchorStart;
        const before = modifiedContent.substring(0, actualPosition);
        const after = modifiedContent.substring(actualPosition + opp.anchorText.length);

        const link = `<a href="/${opp.toPage}" class="internal-link">${opp.anchorText}</a>`;
        modifiedContent = before + link + after;

        injected.add(actualPosition);
      }
    }

    return modifiedContent;
  }

  private extractSentences(text: string): Array<{ text: string; start: number; end: number }> {
    const sentences: Array<{ text: string; start: number; end: number }> = [];
    const regex = /[^.!?]+[.!?]+/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      sentences.push({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length
      });
    }

    return sentences;
  }

  private extractKeywords(title: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    const words = title.toLowerCase().split(/\s+/);

    return words.filter(w => !stopWords.has(w) && w.length > 3);
  }

  private findKeywordPositions(content: string, keyword: string): number[] {
    const positions: number[] = [];
    let index = 0;

    while ((index = content.indexOf(keyword.toLowerCase(), index)) !== -1) {
      positions.push(index);
      index += keyword.length;
    }

    return positions;
  }

  private findSentenceAtPosition(
    sentences: Array<{ text: string; start: number; end: number }>,
    position: number
  ): string | null {
    for (const sentence of sentences) {
      if (position >= sentence.start && position <= sentence.end) {
        return sentence.text;
      }
    }
    return null;
  }

  private hasLinkNearby(content: string, position: number, range: number = 100): boolean {
    const before = content.substring(Math.max(0, position - range), position);
    const after = content.substring(position, Math.min(content.length, position + range));

    return before.includes('<a ') || after.includes('<a ');
  }

  private calculateRelevance(keyword: string, sentence: string): number {
    let score = 50;

    const keywordCount = (sentence.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
    score += Math.min(keywordCount * 10, 30);

    if (sentence.length < 150) score += 10;
    if (sentence.includes('learn') || sentence.includes('read') || sentence.includes('guide')) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  private distributeEvenly(opportunities: LinkOpportunity[], contentLength: number): LinkOpportunity[] {
    const minDistance = Math.floor(contentLength / (opportunities.length + 1));
    const distributed: LinkOpportunity[] = [];

    let lastPosition = 0;

    for (const opp of opportunities) {
      if (opp.position - lastPosition >= minDistance || distributed.length === 0) {
        distributed.push(opp);
        lastPosition = opp.position;
      }
    }

    return distributed;
  }

  private findRelatedPages(page: SitemapPage, allPages: SitemapPage[]): SitemapPage[] {
    const pageKeywords = this.extractKeywords(page.title);
    const related: Array<{ page: SitemapPage; score: number }> = [];

    for (const otherPage of allPages) {
      if (otherPage.id === page.id) continue;

      const otherKeywords = this.extractKeywords(otherPage.title);
      const commonKeywords = pageKeywords.filter(k => otherKeywords.includes(k));

      if (commonKeywords.length > 0) {
        related.push({
          page: otherPage,
          score: commonKeywords.length
        });
      }
    }

    return related
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(r => r.page);
  }

  private calculateClusterLinkDensity(pillar: SitemapPage, cluster: SitemapPage[]): number {
    return (cluster.length / Math.max(pillar.wordCount || 1000, 1000)) * 100;
  }

  private calculateTopicRelevance(pillar: SitemapPage, cluster: SitemapPage[]): number {
    const pillarKeywords = this.extractKeywords(pillar.title);
    let totalOverlap = 0;

    for (const page of cluster) {
      const pageKeywords = this.extractKeywords(page.title);
      const overlap = pillarKeywords.filter(k => pageKeywords.includes(k)).length;
      totalOverlap += overlap;
    }

    return (totalOverlap / cluster.length) * 20;
  }

  // SOTA UPGRADE: FUZZY CONTEXTUAL LINKING
  findBestInternalLink(contentSegment: string, pages: SitemapPage[]): SitemapPage | null {
    const words = contentSegment.toLowerCase().split(" ");
    let bestMatch: SitemapPage | null = null;
    let maxScore = 0;

    for (const page of pages) {
      // 1. Create a "Concept Signature" from the page title
      const titleKeywords = page.title.toLowerCase().split(" ").filter(w => w.length > 4); // Filter trivial words

      // 2. Check overlap with content segment
      let score = 0;
      titleKeywords.forEach(kw => {
        if (contentSegment.toLowerCase().includes(kw)) score += 1;
      });

      // 3. Boost score if exact phrase match
      if (contentSegment.toLowerCase().includes(page.title.toLowerCase())) score += 5;

      if (score > maxScore && score >= 2) { // Minimum threshold
        maxScore = score;
        bestMatch = page;
      }
    }

    return bestMatch;
  }

  // SOTA UPGRADE: SMART FUZZY LINK INJECTION
  injectFuzzyContextualLinks(
    content: string,
    availablePages: SitemapPage[],
    maxLinks: number = 12
  ): string {
    let modifiedContent = content;
    const injectedSlugs = new Set<string>();
    const paragraphs = content.split('</p>');

    for (let i = 0; i < paragraphs.length && injectedSlugs.size < maxLinks; i++) {
      const paragraph = paragraphs[i];

      // Skip if already has a link
      if (paragraph.includes('<a ')) continue;
      if (paragraph.length < 100) continue;

      const bestMatch = this.findBestInternalLink(paragraph, availablePages);

      if (bestMatch && !injectedSlugs.has(bestMatch.slug)) {
        // Find the best anchor text (longest matching phrase)
        const titleWords = bestMatch.title.toLowerCase().split(' ');
        let bestAnchor = '';
        let bestAnchorLength = 0;

        for (let len = titleWords.length; len >= 2; len--) {
          for (let start = 0; start <= titleWords.length - len; start++) {
            const phrase = titleWords.slice(start, start + len).join(' ');
            if (paragraph.toLowerCase().includes(phrase) && phrase.length > bestAnchorLength) {
              bestAnchor = phrase;
              bestAnchorLength = phrase.length;
            }
          }
        }

        // Use full title if no phrase match
        if (!bestAnchor) {
          bestAnchor = bestMatch.title;
        }

        // Create regex to find first occurrence of anchor text
        const regex = new RegExp(bestAnchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const match = paragraph.match(regex);

        if (match) {
          paragraphs[i] = paragraph.replace(
            regex,
            `<a href="/${bestMatch.slug}" class="internal-link">${match[0]}</a>`
          );
          injectedSlugs.add(bestMatch.slug);
        }
      }
    }

    modifiedContent = paragraphs.join('</p>');
    console.log(`[Fuzzy Internal Linking] Injected ${injectedSlugs.size} contextual links`);

    return modifiedContent;
  }
}

export const globalLinkingEngine = new InternalLinkingEngine();
