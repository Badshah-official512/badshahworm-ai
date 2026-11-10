// BADSHAH AI - Cloudflare Pages "advanced mode" worker (v2).
//
// v2 CHANGE: the old /api/chat proxy is REMOVED. All AI calls now go through the
// Supabase Edge Function `ai-chat` (JWT-checked, free/pro gated server-side).
// This worker is kept ONLY for static hosting: security headers + correct
// APK download headers. No API key lives here anymore — the FT Fusion key is
// a Supabase Edge Function secret (FT_FUSION_API_KEY), set in the Supabase
// dashboard. Do NOT add any API key to this file.

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), geolocation=(), payment=()'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // /api/chat no longer exists here — the Supabase Edge Function handles AI.
    if (url.pathname === '/api/chat') {
      return new Response(JSON.stringify({ error: 'Moved. AI calls now go through the Supabase Edge Function.' }), {
        status: 410,
        headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS }
      });
    }
    // Block direct access to server files
    if (url.pathname === '/_worker.js' || url.pathname.startsWith('/functions/')) {
      return new Response('Not found', { status: 404 });
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    if (url.pathname.toLowerCase().endsWith('.apk')) {
      out.headers.set('content-type', 'application/vnd.android.package-archive');
      out.headers.set('content-disposition', 'attachment; filename="Badshah222-ai.apk"');
      out.headers.set('cache-control', 'public, max-age=300');
    }
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
    return out;
  }
};
