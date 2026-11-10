// BADSHAH AI v2 — Supabase Edge Function: ai-chat
// Proxies chat / image requests to the upstream FT Fusion API.
// Auth is verified manually inside this handler (JWT from the
// Authorization header), so deploy with:
//   supabase functions deploy ai-chat --no-verify-jwt
// and set the upstream key as a secret (never in code):
//   supabase secrets set FT_FUSION_API_KEY=...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Upstream AI API base. No key is ever hard-coded here.
const UPSTREAM_BASE = "https://ft-fusion.shehryarteam8876.workers.dev/ft/api";

// Safety instruction prepended to the prompt for FREE users only,
// and only while the admin's safety filter is ON (admin_settings key
// "safety_filter", {"enabled": true/false}; defaults to ON when the
// setting is missing or unreadable). Pro users' prompts are passed
// through exactly as-is, always.
const FREE_SAFETY_PREFIX =
  "You are a helpful, safe AI assistant. Refuse requests that are illegal, harmful, or disallowed (including weapons, cyberattacks, malware, DDoS, hacking, fraud, or harassment), and explain briefly why. User request: ";

// Model allow-lists. Enforced server-side; never trust the frontend.
// Free FT chat models — none right now (no FT key allows fusion-spark).
const FREE_CHAT_MODELS = new Set<string>([]);
// Groq free chat — served by Groq's OpenAI-compatible API, not FT Fusion.
// App id "groq-gpt-oss-120b" maps to Groq model "openai/gpt-oss-120b",
// falling back to "openai/gpt-oss-20b" when the first fails.
const GROQ_CHAT_MODELS = new Set(["groq-gpt-oss-120b"]);
const GROQ_MODEL_CHAIN = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const FREE_IMAGE_MODELS = new Set(["fusion-uni"]);
const PRO_CHAT_MODELS = new Set([
  "fusion-synth",
  "fusion-vortex",
  "fusion-abyss",
  "fusion-shadow",
  "fusion-reaper",
  "fusion-dread",
  "fusion-void",
]);
const PRO_IMAGE_MODELS = new Set(["fusion-astra"]);

// Removed model — must be rejected explicitly.
const REMOVED_MODELS = new Set(["fusion-pulse"]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Base64-encode raw bytes (chunked so large images don't blow the stack).
function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Extract a text answer from an upstream body that may be plain text
// or JSON. Returns { text } on success or { error } when the upstream
// reported an error in JSON.
function extractText(raw: string): { text?: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Empty response from AI service" };

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.error === "string" && obj.error.trim()) {
          return { error: obj.error.trim() };
        }
        for (
          const field of [
            "result",
            "response",
            "text",
            "reply",
            "answer",
            "message",
            "content",
          ]
        ) {
          const value = obj[field];
          if (typeof value === "string" && value.trim()) {
            return { text: value };
          }
        }
        // JSON object with no usable text field — fall back to raw text.
        return { text: raw };
      }
      // A JSON array has no text field — fall back to raw text.
      return { text: raw };
    } catch {
      // Not valid JSON — fall through and treat the raw body as text.
    }
  }

  return { text: raw };
}

// Extract an image URL from an upstream text body: either a JSON field
// (image / image_url / url / src) or a bare URL ending in an image
// extension.
function extractImageUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        for (const field of ["image", "image_url", "url", "src"]) {
          const value = obj[field];
          if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
            return value.trim();
          }
        }
      }
    } catch {
      // Not valid JSON — fall through to the regex below.
    }
  }

  const match = raw.match(
    /https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>]*)?/i,
  );
  return match ? match[0] : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("ai-chat: SUPABASE_URL or SUPABASE_ANON_KEY is not set");
    return jsonResponse({ ok: false, error: "Server misconfigured" }, 500);
  }

  // --- Auth: require a Bearer JWT and resolve the caller. ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ ok: false, error: "Not authenticated" }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.warn("ai-chat: auth.getUser failed");
    return jsonResponse({ ok: false, error: "Not authenticated" }, 401);
  }

  // --- Pro status: profiles.is_pro AND pro_expires_at in the future. ---
  // A missing profile row is treated as free.
  let isPro = false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_pro, pro_expires_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    const expiresAt = profile.pro_expires_at
      ? new Date(profile.pro_expires_at as string)
      : null;
    isPro = profile.is_pro === true &&
      expiresAt !== null &&
      !Number.isNaN(expiresAt.getTime()) &&
      expiresAt.getTime() > Date.now();
  }

  // --- Free-plan safety filter: admin can turn it off from the panel. ---
  // The admin_settings table is readable by any authenticated user (RLS),
  // so this read uses the same user-scoped client. Defaults to ON when
  // the setting is missing or the read fails.
  let safetyFilterOn = true;
  try {
    const { data: safetyRow } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "safety_filter")
      .maybeSingle();
    if (
      safetyRow && safetyRow.value && typeof safetyRow.value === "object"
    ) {
      const enabled = (safetyRow.value as Record<string, unknown>).enabled;
      if (typeof enabled === "boolean") safetyFilterOn = enabled;
    }
  } catch {
    safetyFilterOn = true;
  }

  // --- Parse and validate the request body. ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ ok: false, error: "Invalid request body" }, 400);
  }

  const { model, q } = body as Record<string, unknown>;

  if (typeof model !== "string" || !model.trim()) {
    return jsonResponse({ ok: false, error: "model is required" }, 400);
  }
  if (typeof q !== "string" || !q.trim()) {
    return jsonResponse({ ok: false, error: "q is required" }, 400);
  }
  if (q.length > 8000) {
    return jsonResponse(
      { ok: false, error: "q must be at most 8000 characters" },
      400,
    );
  }

  const modelName = model.trim();

  // --- Model rules. ---
  if (REMOVED_MODELS.has(modelName)) {
    console.log(`ai-chat: user=${user.id} model=${modelName} rejected=removed`);
    return jsonResponse(
      { ok: false, error: "This model is no longer available" },
      400,
    );
  }

  const isGroqChat = GROQ_CHAT_MODELS.has(modelName);
  const isFreeChat = FREE_CHAT_MODELS.has(modelName) || isGroqChat;
  const isFreeImage = FREE_IMAGE_MODELS.has(modelName);
  const isProChat = PRO_CHAT_MODELS.has(modelName);
  const isProImage = PRO_IMAGE_MODELS.has(modelName);

  if (!isFreeChat && !isFreeImage && !isProChat && !isProImage) {
    console.log(`ai-chat: user=${user.id} model=${modelName} rejected=unknown`);
    return jsonResponse({ ok: false, error: "Unknown model" }, 400);
  }

  const isImageModel = isFreeImage || isProImage;

  if ((isProChat || isProImage) && !isPro) {
    console.log(`ai-chat: user=${user.id} model=${modelName} rejected=pro-only`);
    return jsonResponse(
      { ok: false, error: "This model needs Pro. Upgrade from the app." },
      403,
    );
  }

  // --- Build the upstream request. ---
  // Free users get the safety prefix while the admin safety filter is ON;
  // Pro users' prompt goes as-is, and so does a free user's prompt when
  // the admin turned the filter OFF.
  const upstreamPrompt = isPro || !safetyFilterOn
    ? q
    : FREE_SAFETY_PREFIX + q;

  // --- Groq free chat (OpenAI-compatible API, gpt-oss-120b then 20b). ---
  if (isGroqChat) {
    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) {
      console.error("ai-chat: GROQ_API_KEY is not set");
      return jsonResponse({ ok: false, error: "Server misconfigured" }, 500);
    }
    let lastError = "AI service unavailable";
    for (const groqModel of GROQ_MODEL_CHAIN) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);
      try {
        const res = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [{ role: "user", content: upstreamPrompt }],
            temperature: 0.7,
            max_tokens: 2048,
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => null) as Record<
          string,
          unknown
        > | null;
        const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
        const msg = choice && typeof choice === "object"
          ? (choice as Record<string, unknown>).message
          : null;
        const text = msg && typeof msg === "object" &&
            typeof (msg as Record<string, unknown>).content === "string"
          ? ((msg as Record<string, unknown>).content as string).trim()
          : "";
        if (res.ok && text) {
          console.log(
            `ai-chat: user=${user.id} model=${modelName} ok=groq:${groqModel}`,
          );
          return jsonResponse({ ok: true, kind: "text", text });
        }
        const errObj = data && typeof data.error === "object" && data.error !== null
          ? data.error as Record<string, unknown>
          : null;
        lastError = errObj && typeof errObj.message === "string"
          ? errObj.message as string
          : `Groq ${groqModel} failed`;
        console.log(
          `ai-chat: user=${user.id} model=${modelName} groq:${groqModel} failed, trying next`,
        );
      } catch (err) {
        lastError = err instanceof Error ? err.name : "AI service unavailable";
        console.log(
          `ai-chat: user=${user.id} model=${modelName} groq:${groqModel} fetch failed`,
        );
      } finally {
        clearTimeout(timeoutId);
      }
    }
    return jsonResponse({ ok: false, error: lastError }, 502);
  }

  // --- FT Fusion (all other models). ---
  const apiKey = Deno.env.get("FT_FUSION_API_KEY");
  if (!apiKey) {
    console.error("ai-chat: FT_FUSION_API_KEY is not set");
    return jsonResponse({ ok: false, error: "Server misconfigured" }, 500);
  }

  const upstreamUrl = new URL(UPSTREAM_BASE);
  upstreamUrl.search = new URLSearchParams({
    model: modelName,
    q: upstreamPrompt,
    key: apiKey,
  }).toString();

  // --- Call upstream with a 60s timeout. ---
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      signal: controller.signal,
    });
  } catch (err) {
    console.error(
      `ai-chat: user=${user.id} model=${modelName} upstream fetch failed`,
      err instanceof Error ? err.name : "unknown error",
    );
    return jsonResponse({ ok: false, error: "AI service unavailable" }, 502);
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = upstream.headers.get("content-type") ?? "";

  // --- Image models. ---
  if (isImageModel) {
    if (contentType.startsWith("image/")) {
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      const imageBase64 = encodeBase64(bytes);
      console.log(`ai-chat: user=${user.id} model=${modelName} ok=image-bytes`);
      return jsonResponse({
        ok: true,
        kind: "image",
        image_base64: imageBase64,
        content_type: contentType.split(";")[0].trim(),
      });
    }

    // Not raw bytes — try to extract an image URL from the text body.
    const textBody = await upstream.text();
    const imageUrl = extractImageUrl(textBody);
    if (imageUrl) {
      console.log(`ai-chat: user=${user.id} model=${modelName} ok=image-url`);
      return jsonResponse({ ok: true, kind: "image", image_url: imageUrl });
    }

    console.log(`ai-chat: user=${user.id} model=${modelName} failed=no-image`);
    return jsonResponse({ ok: false, error: "No image returned" }, 502);
  }

  // --- Chat models. ---
  // An image content-type on a chat model is treated as an image.
  if (contentType.startsWith("image/")) {
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    const imageBase64 = encodeBase64(bytes);
    console.log(`ai-chat: user=${user.id} model=${modelName} ok=image-bytes`);
    return jsonResponse({
      ok: true,
      kind: "image",
      image_base64: imageBase64,
      content_type: contentType.split(";")[0].trim(),
    });
  }

  const rawText = await upstream.text();
  const extracted = extractText(rawText);
  if (extracted.error) {
    console.log(
      `ai-chat: user=${user.id} model=${modelName} failed=upstream-error`,
    );
    return jsonResponse({ ok: false, error: extracted.error }, 502);
  }

  console.log(`ai-chat: user=${user.id} model=${modelName} ok=text`);
  return jsonResponse({ ok: true, kind: "text", text: extracted.text ?? "" });
});
