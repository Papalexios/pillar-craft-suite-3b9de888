/**
 * EMERGENCY HOTFIX: God Mode URL Targeting
 * 
 * PROBLEM: God Mode ignores user-selected target URLs from UI
 * ROOT CAUSE: getUserTargetUrls() returns stale data
 * 
 * SOLUTION: Force reload from localStorage on every queue build
 * 
 * USAGE: Import and call before starting God Mode
 */

export const forceReloadGodModeUrls = (): string[] => {
    try {
        const raw = localStorage.getItem('godModeUrls');
        console.log('[GOD MODE FIX] Raw localStorage value:', raw);
        
        if (!raw) {
            console.log('[GOD MODE FIX] No URLs found in localStorage');
            return [];
        }
        
        const urls = JSON.parse(raw);
        
        if (!Array.isArray(urls)) {
            console.error('[GOD MODE FIX] Invalid format - not an array:', urls);
            return [];
        }
        
        const validUrls = urls
            .map((u: any) => String(u || '').trim())
            .filter(Boolean)
            .filter((u: string) => {
                try {
                    new URL(u);
                    return true;
                } catch {
                    console.warn('[GOD MODE FIX] Invalid URL skipped:', u);
                    return false;
                }
            });
        
        console.log('[GOD MODE FIX] ✅ Loaded', validUrls.length, 'valid URLs:', validUrls);
        return validUrls;
    } catch (e) {
        console.error('[GOD MODE FIX] Error loading URLs:', e);
        return [];
    }
};

/**
 * DEBUG: Check if URLs are saved correctly
 */
export const debugGodModeStorage = () => {
    console.log('=== GOD MODE URL STORAGE DEBUG ===');
    console.log('localStorage.godModeUrls:', localStorage.getItem('godModeUrls'));
    console.log('Parsed:', forceReloadGodModeUrls());
    console.log('==================================');
};

// Auto-run debug on import in development
if (typeof window !== 'undefined' && import.meta.env.DEV) {
    setTimeout(debugGodModeStorage, 1000);
}
