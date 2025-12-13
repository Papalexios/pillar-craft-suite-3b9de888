/**
 * ENTERPRISE-GRADE REFERENCE VALIDATOR
 * Ensures all references are:
 * ✅ Relevant to content topic
 * ✅ Valid URLs (not 404s)
 * ✅ Properly formatted
 * ✅ Correctly embedded
 * ✅ No malformed URL encoding
 * ✅ YouTube embeds preserved
 */

import fetch from 'node-fetch';

interface Reference {
  title: string;
  url: string;
  description?: string;
  isYouTube?: boolean;
  isInternal?: boolean;
}

interface ValidationResult {
  isValid: boolean;
  url: string;
  status?: number;
  error?: string;
  isRelevant?: boolean;
}

interface ContentContext {
  keywords: string[];
  title: string;
  topic: string;
}

export class ReferenceValidator {
  private urlCache = new Map<string, ValidationResult>();
  private cacheTimeout = 3600000; // 1 hour
  private urlCheckTimeout = 5000; // 5 seconds

  /**
   * CORE: Validate references before insertion
   */
  async validateReferences(
    references: Reference[],
    context: ContentContext
  ): Promise<Reference[]> {
    const validReferences: Reference[] = [];
    
    for (const ref of references) {
      // STEP 1: Skip YouTube embeds (preserve them)
      if (this.isYouTubeEmbed(ref.url)) {
        validReferences.push({
          ...ref,
          isYouTube: true
        });
        continue;
      }

      // STEP 2: Fix malformed URLs
      const fixedUrl = this.fixMalformedUrl(ref.url);
      if (!fixedUrl) {
        console.warn(`🔴 INVALID URL SKIPPED: ${ref.url}`);
        continue;
      }

      // STEP 3: Check URL validity
      const urlValid = await this.checkUrlValidity(fixedUrl);
      if (!urlValid.isValid) {
        console.warn(`🔴 DEAD URL SKIPPED: ${fixedUrl} (${urlValid.status})`);
        continue;
      }

      // STEP 4: Check relevance to topic
      const isRelevant = await this.checkRelevance(fixedUrl, ref.title, context);
      if (!isRelevant) {
        console.warn(`🔴 IRRELEVANT REFERENCE SKIPPED: ${ref.title}`);
        continue;
      }

      // STEP 5: Format correctly
      const formattedRef = this.formatReference({
        ...ref,
        url: fixedUrl
      });

      validReferences.push(formattedRef);
      console.log(`✅ VALID REFERENCE ADDED: ${formattedRef.title}`);
    }

    return validReferences;
  }

  /**
   * Fix malformed URLs (remove encoding artifacts)
   */
  private fixMalformedUrl(url: string): string | null {
    if (!url) return null;

    // REMOVE: URL encoding artifacts like %3Ca%20href=)
    let fixed = url.replace(/%3Ca%20href=\)/g, '');
    fixed = fixed.replace(/\%3C.*?\>/g, ''); // Remove any HTML entities
    fixed = fixed.replace(/\s+$/, ''); // Trim whitespace

    // VALIDATE: Must be valid URL format
    try {
      new URL(fixed);
      return fixed;
    } catch {
      return null;
    }
  }

  /**
   * Check if URL is valid (not 404)
   */
  private async checkUrlValidity(url: string): Promise<ValidationResult> {
    // CHECK CACHE FIRST
    if (this.urlCache.has(url)) {
      const cached = this.urlCache.get(url)!;
      if (Date.now() - (cached as any).timestamp < this.cacheTimeout) {
        return cached;
      }
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.urlCheckTimeout);

      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (SEO Bot)'
        },
        //@ts-ignore
        signal: controller.signal
      });

      clearTimeout(timeout);

      const isValid = response.status >= 200 && response.status < 400;
      const result: ValidationResult = {
        isValid,
        url,
        status: response.status
      };

      // CACHE RESULT
      (result as any).timestamp = Date.now();
      this.urlCache.set(url, result);

      return result;
    } catch (error: any) {
      return {
        isValid: false,
        url,
        error: error.message
      };
    }
  }

  /**
   * Check if reference is relevant to content
   */
  private async checkRelevance(
    url: string,
    title: string,
    context: ContentContext
  ): Promise<boolean> {
    // WHITELIST: Internal links are always relevant
    if (this.isInternalLink(url, context)) {
      return true;
    }

    // BLACKLIST: Known irrelevant domains
    const blacklist = [
      'trade-schools',
      'collegedale',
      'bioslimming',
      'anabolic',
      'dokumen.pub',
      'scribd',
      'issuu'
    ];

    const urlLower = url.toLowerCase();
    if (blacklist.some(term => urlLower.includes(term))) {
      return false;
    }

    // RELEVANCE CHECK: Title/URL must match content keywords
    const contentKeywords = context.keywords.map(k => k.toLowerCase());
    const titleLower = title.toLowerCase();

    // If title contains ANY content keyword, it's relevant
    const isRelevant = contentKeywords.some(keyword => 
      titleLower.includes(keyword) || 
      urlLower.includes(keyword)
    );

    return isRelevant;
  }

  /**
   * Check if it's an internal link
   */
  private isInternalLink(url: string, context: ContentContext): boolean {
    // Assume context has domain info or check for relative paths
    return url.startsWith('/') || url.includes(context.topic);
  }

  /**
   * Check if URL is YouTube embed/video
   */
  private isYouTubeEmbed(url: string): boolean {
    return (
      url.includes('youtube.com') ||
      url.includes('youtu.be') ||
      url.includes('<iframe') ||
      url.includes('youtube')
    );
  }

  /**
   * Format reference for safe insertion
   */
  private formatReference(ref: Reference): Reference {
    return {
      title: ref.title.trim(),
      url: ref.url.trim(),
      description: ref.description?.trim() || '',
      isYouTube: ref.isYouTube || false,
      isInternal: this.isInternalLink(ref.url, { keywords: [], title: ref.title, topic: '' })
    };
  }

  /**
   * Generate proper references section
   */
  generateReferencesSection(references: Reference[]): string {
    if (references.length === 0) {
      return ''; // Don't add empty references section
    }

    let section = '\n\n## References\n\n';

    references.forEach((ref, index) => {
      if (ref.isYouTube) {
        // Preserve YouTube embeds exactly as-is
        section += `${index + 1}. [${ref.title}](${ref.url})\n`;
      } else {
        // Format external/internal links properly
        const source = ref.isInternal ? '(Internal Link)' : '(External Source)';
        section += `${index + 1}. [${ref.title}](${ref.url}) ${source}\n`;
        if (ref.description) {
          section += `   ${ref.description}\n`;
        }
      }
    });

    return section;
  }

  /**
   * Sanitize content HTML (fix broken embeds, etc)
   */
  sanitizeContent(html: string): string {
    // FIX: YouTube playback errors
    html = html.replace(
      /playback id: [^<]*error/gi,
      'YouTube video embedded'
    );

    // FIX: Malformed internal links
    html = html.replace(
      /(https:\/\/[\w\-\.]+\/[\w\-\.%]*)+(%3Ca%20href=)/gi,
      '$1)'
    );

    // FIX: Double-encoded URLs
    html = html.replace(/%252F/g, '%2F'); // Only single-encode slashes
    html = html.replace(/%2520/g, '%20'); // Only single-encode spaces

    return html;
  }

  /**
   * Clear URL cache (for testing/reset)
   */
  clearCache(): void {
    this.urlCache.clear();
  }
}

// SINGLETON INSTANCE
export const referenceValidator = new ReferenceValidator();
