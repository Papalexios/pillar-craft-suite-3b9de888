#!/usr/bin/env python3
"""
NUKES all duplicate getPrioritizedPages methods and replaces with ONE clean version
"""

import re

# Read the file
with open('src/services.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Define the CORRECT method (the one with NO cooldown for targets)
CLEAN_METHOD = '''    private async getPrioritizedPages(context: GenerationContext): Promise<SitemapPage[]> {
        const now = Date.now();
        const userTargets = this.getUserTargetUrls();
        const targetSet = new Set(userTargets.map(u => this.normalizeUrl(u)));

        const isTargetPage = (p: SitemapPage): boolean => targetSet.has(this.normalizeUrl(p.id));

        let candidates = [...context.existingPages];

        // CRITICAL FIX: NO COOLDOWN FOR USER TARGETS
        candidates = candidates.filter(p => {
            if (isTargetPage(p)) return true; // User targets ALWAYS run
            
            const lastProcessed = localStorage.getItem(`sota_last_proc_${p.id}`);
            if (!lastProcessed) return true;
            const hoursSince = (now - parseInt(lastProcessed)) / (1000 * 60 * 60);
            return hoursSince > 24;
        });

        const prioritized: SitemapPage[] = [];
        const used = new Set<string>();

        if (userTargets.length > 0) {
            const byNorm = new Map(candidates.map(p => [this.normalizeUrl(p.id), p] as const));

            for (const url of userTargets) {
                const norm = this.normalizeUrl(url);
                const page = byNorm.get(norm) || {
                    id: url,
                    title: url,
                    slug: extractSlugFromUrl(url),
                    lastMod: null,
                    wordCount: null,
                    crawledContent: null,
                    healthScore: null,
                    updatePriority: 'Critical',
                    justification: 'User-selected target URL (URL Targeting Engine).',
                    daysOld: 999,
                    isStale: true,
                    publishedState: 'none',
                    status: 'idle',
                    analysis: null
                };

                if (!used.has(norm)) {
                    used.add(norm);
                    prioritized.push(page as SitemapPage);
                }
            }
        }

        const rest = candidates
            .filter(p => !used.has(this.normalizeUrl(p.id)))
            .sort((a, b) => (b.daysOld || 0) - (a.daysOld || 0));

        this.logCallback(`🎯 Targets loaded: ${userTargets.length}. Queue size: ${prioritized.length + rest.length}`);
        return [...prioritized, ...rest];
    }
'''

# Find the start of the FIRST getPrioritizedPages method
first_match = re.search(r'private async getPrioritizedPages\(', content)

if not first_match:
    print("❌ Could not find getPrioritizedPages method!")
    exit(1)

start_pos = first_match.start()

# Find where optimizeDOMSurgically starts (this is AFTER all the duplicates)
next_method = re.search(r'\n    private async optimizeDOMSurgically\(', content[start_pos:])

if not next_method:
    print("❌ Could not find optimizeDOMSurgically method!")
    exit(1)

end_pos = start_pos + next_method.start()

# NUKE everything between start and end, replace with clean method
fixed_content = content[:start_pos] + CLEAN_METHOD + content[end_pos:]

# Write back
with open('src/services.tsx', 'w', encoding='utf-8') as f:
    f.write(fixed_content)

print(f"✅ FIXED! Nuked {content[start_pos:end_pos].count('private async getPrioritizedPages')} duplicate methods")
print(f"✅ Inserted 1 clean method with NO cooldown for user targets")
