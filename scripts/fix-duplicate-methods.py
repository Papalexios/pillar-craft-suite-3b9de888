#!/usr/bin/env python3
"""
Fixes duplicate getPrioritizedPages methods in services.tsx
Keeps only the FIRST occurrence (the correct one)
"""

import re

# Read the file
with open('src/services.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find all occurrences of the method
pattern = r'(private async getPrioritizedPages\(context: GenerationContext\): Promise<SitemapPage\[\]> \{[\s\S]*?^    \})'
matches = list(re.finditer(pattern, content, re.MULTILINE))

print(f"Found {len(matches)} getPrioritizedPages method(s)")

if len(matches) > 1:
    # Keep only the first match, remove others
    # Work backwards to preserve indices
    for match in reversed(matches[1:]):
        start, end = match.span()
        print(f"Removing duplicate at position {start}-{end}")
        content = content[:start] + content[end:]
    
    # Write back
    with open('src/services.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("✅ Fixed! Removed", len(matches) - 1, "duplicate method(s)")
else:
    print("✅ No duplicates found")
