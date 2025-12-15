// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';

// ========== Types ==========
type WordPressConfig = {
  siteUrl: string;
  username: string;
  appPassword: string;
};

type SitemapPage = {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
  loc?: string; // if legacy structure
  id?: string;  // legacy compatibility
};

type LogEntry = {
  ts: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
};

type GodModeResult = {
  url: string;
  success: boolean;
  error?: string;
};

type PostSummary = {
  id: number;
  slug: string;
  title: string;
  link?: string;
};

// ========== Utilities: Local Storage ==========

function useLocalStorageState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);

  return [state, setState] as const;
}

// ========== Utilities: Normalization & Migration ==========

function normalizeWordPressConfig(maybe: any): WordPressConfig {
  const resolved = maybe ?? {};
  // Accept legacy keys and normalize
  const siteUrl =
    (resolved.siteUrl ??
      resolved.url ??
      resolved.wordpressSiteUrl ??
      resolved.wpSiteUrl ??
      '').toString().trim().replace(/\/+$/, '');
  const username =
    (resolved.username ??
      resolved.wordpressUsername ??
      resolved.wpUsername ??
      '').toString().trim();
  const appPassword =
    (resolved.appPassword ??
      resolved.applicationPassword ??
      resolved.wordpressApplicationPassword ??
      resolved.wpAppPassword ??
      '').toString().trim();

  return {
    siteUrl,
    username,
    appPassword,
  };
}

function isWordPressConfigured(cfg?: Partial<WordPressConfig>) {
  if (!cfg) return false;
  const a = (cfg.siteUrl ?? '').trim();
  const b = (cfg.username ?? '').trim();
  const c = (cfg.appPassword ?? '').trim();
  return a.length > 0 && b.length > 0 && c.length > 0;
}

// ========== Utilities: Logging with dedup protection ==========

function useLogs(max = 200, dedupWindowMs = 1500) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const lastLogRef = useRef<LogEntry | null>(null);

  function add(level: LogEntry['level'], message: string) {
    const now = Date.now();
    const last = lastLogRef.current;
    if (last && last.message === message && now - last.ts < dedupWindowMs) {
      return; // collapse spam
    }
    const entry: LogEntry = { ts: now, level, message };
    lastLogRef.current = entry;
    setLogs((prev) => [entry, ...prev].slice(0, max));
  }

  return {
    logs,
    addInfo: (m: string) => add('info', m),
    addWarn: (m: string) => add('warn', m),
    addError: (m: string) => add('error', m),
    addSuccess: (m: string) => add('success', m),
    clear: () => setLogs([]),
  };
}

// ========== Utilities: Networking (with proxy fallbacks) ==========

async function fetchWithFallback(url: string, opts?: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controllers: AbortController[] = [];
  const timeout = (ms: number) =>
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

  const abs = (u: string) => {
    try {
      return new URL(u).toString();
    } catch {
      return u;
    }
  };

  const strategies = [
    () => fetch(abs(url), { ...opts, signal: (controllers[0] = new AbortController()).signal }),
    () =>
      fetch(abs(`https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`), {
        ...opts,
        signal: (controllers[1] = new AbortController()).signal,
      }),
    () =>
      fetch(abs(`https://r.jina.ai/https://${url.replace(/^https?:\/\//, '')}`), {
        ...opts,
        signal: (controllers[2] = new AbortController()).signal,
      }),
    () =>
      fetch(abs(`https://r.jina.ai/http://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`), {
        ...opts,
        signal: (controllers[3] = new AbortController()).signal,
      }),
  ];

  let lastErr: any = null;
  for (const strat of strategies) {
    try {
      const res = (await Promise.race([strat(), timeout(timeoutMs)])) as Response;
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      continue;
    } finally {
      controllers.forEach((c) => c?.abort());
    }
  }
  throw lastErr ?? new Error('All fetch strategies failed');
}

// ========== Utilities: XML/Sitemap parsing (robust) ==========

function isLikelyHtml(text: string) {
  const head = text.slice(0, 200).toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
}

function extractLocs(xml: string): string[] {
  // Namespace-agnostic extraction of <loc>...</loc>
  const locs: string[] = [];
  const regex = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const v = m[1].trim();
    if (v.startsWith('http://') || v.startsWith('https://')) locs.push(v);
  }
  return Array.from(new Set(locs));
}

function detectSitemapType(xml: string): 'index' | 'urlset' | 'unknown' {
  const lower = xml.toLowerCase();
  if (lower.includes('<sitemapindex')) return 'index';
  if (lower.includes('<urlset')) return 'urlset';
  return 'unknown';
}

async function crawlSitemapEntry(url: string, limit = 10000): Promise<SitemapPage[]> {
  const res = await fetchWithFallback(url, { method: 'GET' });
  const txt = await res.text();

  if (isLikelyHtml(txt)) {
    throw new Error('Expected XML but got HTML (possible block/proxy page)');
  }

  const locs = extractLocs(txt);
  const type = detectSitemapType(txt);

  if (type === 'index') {
    // Recursively crawl children
    const pages: SitemapPage[] = [];
    for (const child of locs) {
      if (!child.startsWith('http')) continue;
      try {
        const sub = await crawlSitemapEntry(child, limit);
        for (const p of sub) {
          pages.push(p);
          if (pages.length >= limit) return pages;
        }
      } catch {
        // continue
      }
    }
    return pages;
  }

  if (type === 'urlset' || type === 'unknown') {
    // Treat all <loc> as URLs
    const pages: SitemapPage[] = locs.map((u) => ({ url: u }));
    return pages.slice(0, limit);
  }

  return [];
}

function sitemapCandidatesFromInput(input: string): string[] {
  const val = input.trim();
  if (!val) return [];
  const normalized = val.replace(/\/+$/, '');
  const looksLikeFile = /sitemap.*\.xml(\.gz)?$/i.test(normalized);
  if (looksLikeFile) {
    return [normalized];
  }
  // Try common sitemap endpoints
  return [
    `${normalized}/sitemap.xml`,
    `${normalized}/sitemap_index.xml`,
    `${normalized}/wp-sitemap.xml`,
    `${normalized}/sitemap1.xml`,
  ];
}

async function crawlSitemap(input: string, limit = 10000, onProgress?: (m: string) => void): Promise<SitemapPage[]> {
  const candidates = sitemapCandidatesFromInput(input);
  const visited = new Set<string>();
  const pages: SitemapPage[] = [];

  for (const c of candidates) {
    if (visited.has(c)) continue;
    visited.add(c);
    try {
      onProgress?.(`Crawling ${c}`);
      const chunk = await crawlSitemapEntry(c, limit);
      for (const p of chunk) {
        const url = p.url || p.loc || p.id;
        if (!url) continue;
        if (!pages.some((x) => (x.url || x.loc || x.id) === url)) {
          pages.push({ url });
          if (pages.length >= limit) return pages;
        }
      }
      if (pages.length > 0) return pages;
    } catch (e: any) {
      onProgress?.(`Skipped ${c}: ${e?.message || 'error'}`);
      continue;
    }
  }

  // If nothing found and input itself might be a sitemap URL, try it raw:
  if (candidates.length === 0 && (input.startsWith('http://') || input.startsWith('https://'))) {
    try {
      const direct = await crawlSitemapEntry(input, limit);
      return direct;
    } catch {}
  }

  return pages;
}

// ========== Utilities: WP API helpers ==========

function wpApiHeaders(cfg: WordPressConfig) {
  const token = btoa(`${cfg.username}:${cfg.appPassword}`);
  return {
    'Content-Type': 'application/json',
    Authorization: `Basic ${token}`,
  };
}

async function wpGet<T = any>(cfg: WordPressConfig, path: string, qs?: Record<string, string | number | boolean>) {
  const base = cfg.siteUrl.replace(/\/+$/, '');
  const url = new URL(`${base}${path.startsWith('/') ? '' : '/'}${path}`);
  if (qs) {
    for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { headers: wpApiHeaders(cfg) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function wpPost<T = any>(cfg: WordPressConfig, path: string, body: any) {
  const base = cfg.siteUrl.replace(/\/+$/, '');
  const url = new URL(`${base}${path.startsWith('/') ? '' : '/'}${path}`);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: wpApiHeaders(cfg),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function slugFromUrl(fullUrl: string) {
  try {
    const u = new URL(fullUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    // Prefer last non-empty segment
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

async function fetchWordPressPostBySlug(cfg: WordPressConfig, slug: string): Promise<any | null> {
  const posts = await wpGet<any[]>(cfg, '/wp-json/wp/v2/posts', { slug, _embed: 1 });
  return Array.isArray(posts) && posts.length > 0 ? posts[0] : null;
}

async function updateWordPressPostContent(cfg: WordPressConfig, id: number, content: string): Promise<any> {
  return wpPost<any>(cfg, `/wp-json/wp/v2/posts/${id}`, { content });
}

// ========== God Mode (autonomous queue) ==========

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function prioritizeQueue(targeted: string[], sitemap: SitemapPage[], excludeUrls: string[], excludeCats: string[]) {
  const set = new Set<string>();
  const push = (u: string) => {
    const url = u.trim();
    if (!url) return;
    if (excludeUrls.includes(url)) return;
    if (!set.has(url)) set.add(url);
  };

  // Targeted URLs first
  targeted.forEach(push);

  // Then sitemap
  sitemap.forEach((p) => push(p.url || p.loc || p.id || ''));

  return Array.from(set);
}

async function runGodMode(params: {
  cfg: WordPressConfig;
  queue: string[];
  onLog: (m: string, level?: LogEntry['level']) => void;
  onResult: (r: GodModeResult) => void;
  stopRef: React.MutableRefObject<boolean>;
}) {
  const { cfg, queue, onLog, onResult, stopRef } = params;

  for (let i = 0; i < queue.length; i++) {
    if (stopRef.current) {
      onLog('God Mode stopped by user', 'warn');
      break;
    }
    const url = queue[i];
    onLog(`Processing (${i + 1}/${queue.length}): ${url}`);

    try {
      const slug = slugFromUrl(url);
      if (!slug) {
        onLog(`Skipped: could not derive slug from URL`, 'warn');
        onResult({ url, success: false, error: 'no-slug' });
        continue;
      }

      const post = await fetchWordPressPostBySlug(cfg, slug);
      if (!post) {
        onLog(`Skipped: no WP post found for slug "${slug}"`, 'warn');
        onResult({ url, success: false, error: 'not-found' });
        continue;
      }

      // Lazy "health" check placeholder (extend with real scoring if needed; done on-demand)
      // Example: ensure content not empty and add small internal references if missing
      const currentHtml = (post?.content?.rendered || '').toString();
      let nextHtml = currentHtml;

      // Inject a "References" section if not present (minimal, safe)
      if (!/References:/i.test(currentHtml)) {
        nextHtml += `
<hr />
<p><strong>References:</strong></p>
<ul>
<li><a href="${cfg.siteUrl}">Source 1</a></li>
<li><a href="${cfg.siteUrl}">Source 2</a></li>
</ul>`;
      }

      if (nextHtml !== currentHtml) {
        await updateWordPressPostContent(cfg, post.id, nextHtml);
        onLog(`Updated post ID ${post.id} (${slug})`, 'success');
      } else {
        onLog(`No changes needed for post ID ${post.id} (${slug})`, 'info');
      }

      onResult({ url, success: true });
      // Respect rate limiting
      await sleep(3000);
    } catch (e: any) {
      onLog(`Error: ${e?.message || 'update failed'}`, 'error');
      onResult({ url, success: false, error: e?.message || 'error' });
      await sleep(1500);
      continue;
    }
  }
}

// ========== Error Boundary ==========

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any) {
    console.error('App error:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Something went wrong.</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error || '')}</pre>
        </div>
      );
    }
    return this.props.children as any;
  }
}

// ========== Main App ==========

export default function App() {
  // Tabs
  const [tab, setTab] = useLocalStorageState<string>('ui.tab', 'setup');

  // WordPress Config (single source of truth)
  const [rawWpConfig, setRawWpConfig] = useLocalStorageState<any>('wpConfig', {
    siteUrl: '',
    username: '',
    appPassword: '',
  });
  const wpConfig = useMemo(() => normalizeWordPressConfig(rawWpConfig), [rawWpConfig]);
  const wpConnectedPill = isWordPressConfigured(wpConfig);

  // API keys (stored but God Mode doesn’t strictly need them)
  const [aiKeys, setAiKeys] = useLocalStorageState<any>('aiKeys', {
    gemini: '',
    serper: '',
    openai: '',
    anthropic: '',
    openrouter: '',
    groq: '',
  });

  // Sitemap + Content hub state
  const [sitemapInput, setSitemapInput] = useLocalStorageState<string>('sitemap.input', '');
  const [existingPages, setExistingPages] = useLocalStorageState<SitemapPage[]>('existingPages', []);
  const [crawlBusy, setCrawlBusy] = useState(false);

  // URL Targeting & Exclusions
  const [targetUrlsText, setTargetUrlsText] = useLocalStorageState<string>('god.targetUrls', '');
  const [excludedUrlsText, setExcludedUrlsText] = useLocalStorageState<string>('god.excludedUrls', '');
  const [excludedCategoriesText, setExcludedCategoriesText] = useLocalStorageState<string>('god.excludedCats', '');

  const targetedUrls = useMemo(
    () =>
      targetUrlsText
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    [targetUrlsText]
  );
  const excludedUrls = useMemo(
    () =>
      excludedUrlsText
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    [excludedUrlsText]
  );
  const excludedCategories = useMemo(
    () =>
      excludedCategoriesText
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    [excludedCategoriesText]
  );

  // Logs
  const { logs, addInfo, addWarn, addError, addSuccess, clear } = useLogs();

  // Diagnostics (live snapshot)
  const [postTypes, setPostTypes] = useState<any[]>([]);
  const [recentPosts, setRecentPosts] = useState<PostSummary[]>([]);
  const [diagBusy, setDiagBusy] = useState(false);

  // God Mode
  const [godActive, setGodActive] = useState(false);
  const stopRef = useRef(false);
  const [recentOptimized, setRecentOptimized] = useState<{ title: string; url: string; at: string }[]>([]);
  const queue = useMemo(() => {
    return prioritizeQueue(targetedUrls, existingPages, excludedUrls, excludedCategories);
  }, [targetedUrls, existingPages, excludedUrls, excludedCategories]);

  // Fetch Diagnostics (on demand)
  async function runDiagnostics() {
    if (!isWordPressConfigured(wpConfig)) {
      addWarn('WordPress not configured. Fill in Setup.');
      return;
    }
    setDiagBusy(true);
    try {
      // Post types
      const typesObj = await wpGet<Record<string, any>>(wpConfig, '/wp-json/wp/v2/types');
      const typesArr = Object.values(typesObj ?? {});
      setPostTypes(typesArr);

      // Recent posts
      const posts = await wpGet<any[]>(wpConfig, '/wp-json/wp/v2/posts', { per_page: 20, _embed: 1 });
      const mapped: PostSummary[] = posts.map((p) => ({
        id: p?.id,
        slug: p?.slug,
        title: p?.title?.rendered?.replace(/<[^>]+>/g, '') ?? `ID ${p?.id}`,
        link: p?.link,
      }));
      setRecentPosts(mapped);
      addSuccess('Diagnostics OK: connected to WordPress.');
    } catch (e: any) {
      addError(`Diagnostics failed: ${e?.message || 'error'}`);
    } finally {
      setDiagBusy(false);
    }
  }

  // Crawl Sitemap
  async function handleCrawlSitemap() {
    const input = sitemapInput.trim() || wpConfig.siteUrl;
    if (!input) {
      addWarn('Enter a sitemap URL or set your Site URL in Setup.');
      return;
    }
    setCrawlBusy(true);
    try {
      const pages = await crawlSitemap(input, 20000, (m) => addInfo(m));
      setExistingPages(pages);
      addSuccess(`Crawl complete: found ${pages.length} pages.`);
    } catch (e: any) {
      addError(`Crawl failed: ${e?.message || 'error'}`);
    } finally {
      setCrawlBusy(false);
    }
  }

  // God Mode start/stop
  async function startGodMode() {
    if (!isWordPressConfigured(wpConfig)) {
      addWarn('WordPress not configured. Fill in Setup.');
      return;
    }
    if (queue.length === 0) {
      addWarn('No targets. Add URLs or crawl sitemap.');
      return;
    }
    stopRef.current = false;
    setGodActive(true);
    addInfo(`Starting God Mode with ${queue.length} URLs.`);

    await runGodMode({
      cfg: wpConfig,
      queue,
      onLog: (m, level = 'info') => {
        if (level === 'info') addInfo(m);
        else if (level === 'warn') addWarn(m);
        else if (level === 'error') addError(m);
        else addSuccess(m);
      },
      onResult: (r) => {
        if (r.success) {
          setRecentOptimized((prev) => [
            { title: slugFromUrl(r.url) || r.url, url: r.url, at: new Date().toLocaleTimeString() },
            ...prev,
          ].slice(0, 20));
        }
      },
      stopRef,
    });

    addSuccess('God Mode cycle finished.');
    setGodActive(false);
  }

  function stopGodMode() {
    stopRef.current = true;
  }

  // UX: Prevent blank page on runtime errors
  useEffect(() => {
    // Basic check to avoid blank: ensure React rendered something
    document.body.style.background = '#0b0f19';
  }, []);

  // Header
  const connectionPill = (
    <span
      title={wpConfig.siteUrl || 'Not configured'}
      style={{
        padding: '6px 10px',
        borderRadius: 999,
        fontSize: 12,
        marginLeft: 12,
        background: wpConnectedPill ? '#153f2a' : '#402525',
        color: wpConnectedPill ? '#50fa7b' : '#ff6b6b',
        border: `1px solid ${wpConnectedPill ? '#2ea043' : '#5c2d2d'}`,
      }}
    >
      WP: {wpConnectedPill ? 'Connected' : 'Not Connected'}
    </span>
  );

  // Tabs
  const tabs: { key: string; label: string }[] = [
    { key: 'setup', label: 'Setup & Configuration' },
    { key: 'hub', label: 'Content Hub' },
    { key: 'gap', label: 'Gap Analysis (God Mode)' },
    { key: 'diag', label: 'Diagnostics' },
  ];

  return (
    <ErrorBoundary>
      <div style={{ color: '#e6e6e6', minHeight: '100vh', fontFamily: 'Inter, system-ui, -apple-system', background: '#0b0f19' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #1b2236', position: 'sticky', top: 0, background: '#0b0f19', zIndex: 50 }}>
          <div style={{ fontWeight: 700, letterSpacing: 0.3 }}>Pillar Craft Suite — SOTA</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            {connectionPill}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 20px', borderBottom: '1px solid #12182a' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #202948',
                background: tab === t.key ? '#14203b' : 'transparent',
                color: '#e6e6e6',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: 20, display: tab === 'setup' ? 'block' : 'none' }}>
          <h2 style={{ margin: '8px 0 16px' }}>Setup & Configuration</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ border: '1px solid #1b2236', borderRadius: 12, padding: 16 }}>
              <h3>WordPress Connection</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                <label>
                  <div>Site URL</div>
                  <input
                    value={rawWpConfig.siteUrl ?? rawWpConfig.url ?? ''}
                    onChange={(e) => setRawWpConfig((s: any) => ({ ...s, siteUrl: e.target.value }))}
                    placeholder="https://your-site.com"
                    style={inputStyle}
                  />
                </label>
                <label>
                  <div>Username</div>
                  <input
                    value={rawWpConfig.username ?? ''}
                    onChange={(e) => setRawWpConfig((s: any) => ({ ...s, username: e.target.value }))}
                    placeholder="admin"
                    style={inputStyle}
                  />
                </label>
                <label>
                  <div>Application Password</div>
                  <input
                    value={rawWpConfig.appPassword ?? rawWpConfig.applicationPassword ?? ''}
                    onChange={(e) => setRawWpConfig((s: any) => ({ ...s, appPassword: e.target.value }))}
                    placeholder="xxxx xxxx xxxx xxxx"
                    style={inputStyle}
                  />
                </label>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    const normalized = normalizeWordPressConfig(rawWpConfig);
                    setRawWpConfig(normalized);
                  }}
                  style={primaryBtn}
                >
                  Save
                </button>
                <button
                  onClick={() => runDiagnostics()}
                  style={secondaryBtn}
                >
                  Test Connection
                </button>
              </div>
            </div>

            <div style={{ border: '1px solid #1b2236', borderRadius: 12, padding: 16 }}>
              <h3>AI Keys (Optional)</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                <label>
                  <div>Google Gemini</div>
                  <input
                    value={aiKeys.gemini ?? ''}
                    onChange={(e) => setAiKeys((s: any) => ({ ...s, gemini: e.target.value }))}
                    placeholder="..."
                    style={inputStyle}
                  />
                </label>
                <label>
                  <div>Serper</div>
                  <input
                    value={aiKeys.serper ?? ''}
                    onChange={(e) => setAiKeys((s: any) => ({ ...s, serper: e.target.value }))}
                    placeholder="..."
                    style={inputStyle}
                  />
                </label>
                <label>
                  <div>OpenAI</div>
                  <input
                    value={aiKeys.openai ?? ''}
                    onChange={(e) => setAiKeys((s: any) => ({ ...s, openai: e.target.value }))}
                    placeholder="..."
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 20, display: tab === 'hub' ? 'block' : 'none' }}>
          <h2 style={{ margin: '8px 0 16px' }}>Content Hub & Rewrite Assistant</h2>
          <div style={{ border: '1px solid #1b2236', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={sitemapInput}
                onChange={(e) => setSitemapInput(e.target.value)}
                placeholder="Enter sitemap URL or site root (e.g. https://example.com or https://example.com/sitemap.xml)"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={handleCrawlSitemap} disabled={crawlBusy} style={primaryBtn}>
                {crawlBusy ? 'Crawling...' : 'Crawl Sitemap'}
              </button>
            </div>
            <div style={{ marginTop: 10, opacity: 0.85 }}>
              Found <strong>{existingPages.length}</strong> pages.
            </div>
            <div style={{ marginTop: 12, maxHeight: 240, overflow: 'auto', borderTop: '1px solid #1b2236', paddingTop: 12 }}>
              {existingPages.slice(0, 200).map((p, i) => (
                <div key={i} style={{ fontSize: 12, opacity: 0.9 }}>
                  {p.url || p.loc || p.id}
                </div>
              ))}
              {existingPages.length > 200 && <div style={{ opacity: 0.7, fontSize: 12 }}>… and more</div>}
            </div>
          </div>
        </div>

        <div style={{ padding: 20, display: tab === 'gap' ? 'block' : 'none' }}>
          <h2 style={{ margin: '8px 0 16px' }}>Blue Ocean Gap Analysis — GOD MODE</h2>

          {!isWordPressConfigured(wpConfig) ? (
            <div style={warningCard}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>WordPress Not Configured</div>
              <div>Fill in Site URL, Username, Application Password in Setup tab.</div>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16 }}>
            {/* Left: Controls & Queue */}
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ border: '1px solid #1b2236', borderRadius: 12, padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>URL Targeting Engine</h3>
                <textarea
                  value={targetUrlsText}
                  onChange={(e) => setTargetUrlsText(e.target.value)}
                  placeholder="One URL per line. These are processed first."
                  rows={6}
                  style={textareaStyle}
                />
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
                  Priority Queue: <strong>{queue.length}</strong> URLs
                </div>
              </div>

              <div style={{ border: '1px solid #1b2236', borderRadius: 12, padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>Exclusion Controls</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  <label>
                    <div>Exclude URLs (one per line)</div>
                    <textarea
                      value={excludedUrlsText}
                      onChange={(e) => setExcludedUrlsText(e.target.value)}
                      rows={4}
                      style={textareaStyle}
                    />
                  </label>
                  <label>
                    <div>Exclude Categories (one per line)</div>
                    <textarea
                      value={excludedCategoriesText}
                      onChange={(e) => setExcludedCategoriesText(e.target.value)}
                      rows={3}
                      style={textareaStyle}
                    />
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {!godActive ? (
                  <button onClick={startGodMode} style={primaryBtn} disabled={!isWordPressConfigured(wpConfig)}>
                    ⚡ Start God Mode
                  </button>
                ) : (
                  <button onClick={stopGodMode} style={dangerBtn}>
                    ■ Stop
                  </button>
                )}
                <button onClick={() => clear()} style={secondaryBtn}>
                  Clear Logs
                </button>
              </div>

              <div style={{ border: '1px solid #1b2236', borderRadius: 12, padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>System Logs</h3>
                <div style={{ maxHeight: 260, overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular', fontSize: 12 }}>
                  {logs.length === 0 && <div style={{ opacity: 0.7 }}>No logs yet.</div>}
                  {logs.map((l, i) => (
                    <div key={i} style={{ padding: '4px 0', whiteSpace: 'pre-wrap' }}>
                      <span style={{ opacity: 0.5, marginRight: 6 }}>
                        [{new Date(l.ts).toLocaleTimeString()}]
                      </span>
                      <span style={{ color: levelColor(l.level), marginRight: 6 }}>
                        {levelGlyph(l.level)}
                      </span>
                      <span>{l.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Diagnostics & History */}
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ border: '1px solid #1b2236', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0 }}>WordPress API Diagnostics</h3>
                  <button onClick={() => runDiagnostics()} disabled={diagBusy} style={secondaryBtnSm}>
                    {diagBusy ? 'Checking…' : 'Run'}
                  </button>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Post Types</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {postTypes.map((t: any) => (
                      <span key={t?.slug} style={chip}>
                        {t?.name ?? t?.slug ?? 'type'}
                      </span>
                    ))}
                    {postTypes.length === 0 && <div style={{ opacity: 0.7 }}>—</div>}
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Recent Posts (20)</div>
                  <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #131a2c', borderRadius: 8 }}>
                    {recentPosts.map((p) => (
                      <div key={p.id} style={{ padding: '6px 10px', borderBottom: '1px solid #11182b' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.title}</div>
                        <div style={{ opacity: 0.7, fontSize: 12 }}>{p.slug}</div>
                      </div>
                    ))}
                    {recentPosts.length === 0 && <div style={{ padding: 10, opacity: 0.7 }}>—</div>}
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid #1b2236', borderRadius: 12, padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>Recently Optimized</h3>
                <div style={{ maxHeight: 240, overflow: 'auto' }}>
                  {recentOptimized.length === 0 && <div style={{ opacity: 0.7 }}>No posts optimized yet.</div>}
                  {recentOptimized.map((r, i) => (
                    <div key={i} style={{ fontSize: 12, borderBottom: '1px solid #131a2c', padding: '6px 2px' }}>
                      <div style={{ fontWeight: 600 }}>{r.title}</div>
                      <div style={{ opacity: 0.7 }}>{r.url}</div>
                      <div style={{ opacity: 0.6 }}>{r.at}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 20, display: tab === 'diag' ? 'block' : 'none' }}>
          <h2 style={{ margin: '8px 0 16px' }}>Diagnostics</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={() => runDiagnostics()} disabled={diagBusy} style={primaryBtn}>
              {diagBusy ? 'Checking…' : 'Run Diagnostics'}
            </button>
            <button onClick={() => clear()} style={secondaryBtn}>
              Clear Logs
            </button>
          </div>
          <div style={{ border: '1px solid #1b2236', borderRadius: 12, padding: 16 }}>
            <h3>Connection</h3>
            <div>Status: {wpConnectedPill ? 'Connected' : 'Not Connected'}</div>
            <div>Site: {wpConfig.siteUrl || '—'}</div>
            <div>User: {wpConfig.username || '—'}</div>
          </div>
          <div style={{ border: '1px solid #1b2236', borderRadius: 12, padding: 16, marginTop: 12 }}>
            <h3>Logs</h3>
            <div style={{ maxHeight: 320, overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular', fontSize: 12 }}>
              {logs.map((l, i) => (
                <div key={i} style={{ padding: '4px 0', whiteSpace: 'pre-wrap' }}>
                  <span style={{ opacity: 0.5, marginRight: 6 }}>
                    [{new Date(l.ts).toLocaleTimeString()}]
                  </span>
                  <span style={{ color: levelColor(l.level), marginRight: 6 }}>
                    {levelGlyph(l.level)}
                  </span>
                  <span>{l.message}</span>
                </div>
              ))}
              {logs.length === 0 && <div style={{ opacity: 0.7 }}>No logs yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

// ========== Styles ==========
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0f1527',
  border: '1px solid #202948',
  color: '#e6e6e6',
  padding: '10px 12px',
  borderRadius: 8,
  outline: 'none',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: '#0f1527',
  border: '1px solid #202948',
  color: '#e6e6e6',
  padding: '10px 12px',
  borderRadius: 8,
  outline: 'none',
  fontFamily: 'ui-monospace, SFMono-Regular',
};

const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(180deg, #2d5cff, #1a47f8)',
  border: '1px solid #2a46b8',
  color: '#fff',
  padding: '10px 14px',
  borderRadius: 10,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  background: '#10172a',
  border: '1px solid #202948',
  color: '#d7dcff',
  padding: '10px 14px',
  borderRadius: 10,
  cursor: 'pointer',
};

const secondaryBtnSm: React.CSSProperties = {
  ...secondaryBtn,
  padding: '6px 10px',
  borderRadius: 8,
};

const dangerBtn: React.CSSProperties = {
  background: 'linear-gradient(180deg, #ff4d4d, #cc2e2e)',
  border: '1px solid #7a1f1f',
  color: '#fff',
  padding: '10px 14px',
  borderRadius: 10,
  cursor: 'pointer',
};

const warningCard: React.CSSProperties = {
  background: '#2b1f1f',
  border: '1px solid #5a2a2a',
  padding: 16,
  borderRadius: 12,
  marginBottom: 12,
};

const chip: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 12,
  borderRadius: 999,
  border: '1px solid #1b2236',
  background: '#0f1527',
};

// ========== Helpers ==========
function levelGlyph(level: LogEntry['level']) {
  switch (level) {
    case 'info':
      return 'ℹ️';
    case 'warn':
      return '⚠️';
    case 'error':
      return '❌';
    case 'success':
      return '✅';
    default:
      return '•';
  }
}
function levelColor(level: LogEntry['level']) {
  switch (level) {
    case 'info':
      return '#9aa7d8';
    case 'warn':
      return '#ffd166';
    case 'error':
      return '#ff6b6b';
    case 'success':
      return '#50fa7b';
    default:
      return '#9aa7d8';
  }
}
