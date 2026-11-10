// BADSHAH AI - frontend settings (no secrets here).
// v2: all AI calls go to the Supabase Edge Function `ai-chat` (called from
// app.js via supabaseClient.functions.invoke). The old /api/chat Cloudflare
// proxy is retired. The API key lives only as a Supabase Edge Function
// secret (FT_FUSION_API_KEY) and never appears in any frontend file.
window.BADSHAH_API_URL = null;
