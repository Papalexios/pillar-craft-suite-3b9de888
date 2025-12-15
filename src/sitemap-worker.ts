// 🚀 SOTA Sitemap Proxy Worker - Cloudflare Workers
// Fetches sitemaps server-side to bypass CORS
// Deploy: npx wrangler deploy

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const sitemapUrl = url.searchParams.get('url');

    if (!sitemapUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing url parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      // Fetch sitemap from target site (NO CORS issues on server)
      const response = await fetch(sitemapUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `HTTP ${response.status}` }),
          { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const text = await response.text();

      // Parse URLs from XML or HTML
      const urls: string[] = [];
      const regex = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
      let match;

      while ((match = regex.exec(text)) !== null) {
        const url = match[1]?.trim();
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          urls.push(url);
        }
      }

      // Return parsed data
      return new Response(
        JSON.stringify({
          success: true,
          count: urls.length,
          urls: urls.slice(0, 20000),
          raw: text.slice(0, 1000)
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    } catch (error: any) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
};
