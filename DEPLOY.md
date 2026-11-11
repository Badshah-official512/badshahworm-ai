# BADSHAH AI v2 — Deploy Guide (Supabase backend)

> v2 mein backend poora Supabase par hai. Cloudflare `_worker.js` ka `/api/chat`
> proxy **khatam** kar diya gaya hai — ab wo sirf static hosting + security
> headers ke liye hai. AI calls Supabase Edge Function `ai-chat` se hoti hain. **API key kahin bhi file mein nahi hai** — wo sirf Supabase Edge Function secrets (`FT_FUSION_API_KEY`, `GROQ_API_KEY`, `OPENWEATHER_API_KEY`) mein set hoti hain.

## 0) Pehle se chahiye

- Supabase project **"Badshah worm ai"** (zainartsstudio@gmail.com account mein,
  us slot mein jo badshah-transport-booking delete karne se khaali hua tha).
- Project ka **URL** aur **anon key** (Project Settings → API).
- Supabase CLI (Edge Function deploy ke liye): `npm i -g supabase` phir
  `supabase login` aur `supabase link --project-ref <ref>`.
- FT Fusion API key (user ne chat mein di thi — **value yahan nahi likhi**;
  wo seedha Supabase dashboard/CLI mein secret ke tor par set hogi).

## 1) Supabase config bharo

`supabase-config.js` kholo aur placeholders replace karo:

```js
window.SUPABASE_URL = "https://<tumhara-project-ref>.supabase.co";
window.SUPABASE_ANON_KEY = "<tumhara-anon-key>";
```

- Sirf **anon key** use karo — kabhi bhi `service_role` key frontend mein mat daalo.
- Jab tak ye placeholders hain, app login splash par "Supabase is not
  configured yet." toast dikhayegi aur aage nahi barhegi (by design).

## 2) Supabase Auth settings (zaroori — warna login kaam nahi karega)

Supabase Dashboard → Authentication → Sign In / Providers → **Email** ON.
Phir **Confirm email OFF** rakho (user ne yehi model manga hai: register karte
hi instant login, no OTP, no email confirmation, no magic link).

## 3) SQL chalao (ek dafa, is order mein)

Supabase Dashboard → SQL Editor → New query → `supabase/schema.sql` ka poora
content paste karo → Run. Ye banata hai:

- Tables: `profiles`, `plans`, `subscriptions`, `payment_orders`,
  `help_messages`, `admin_settings`, `login_history` (sab par RLS ON).
- Trigger: `auth.users` insert par auto `profiles` row.
- Trigger: non-admin `profiles.is_pro / plan_id / pro_expires_at / is_admin`
  change nahi kar sakta.
- RPCs: `approve_payment_order`, `reject_payment_order`, `grant_pro`
  (plan preset / custom days / custom months / exact end date + extend
  flag), `revoke_pro`, `set_admin_status`, `set_pro_expiry` (set or clear
  a user's Pro expiry directly; sab SECURITY DEFINER + admin check).
- Seed plans: 1 Month Rs 100, 3 Months Rs 230, 5 Months Rs 400,
  8 Months Rs 699, 1 Year Rs 999, Custom (price 0, admin set karega).
- Seed `admin_settings`: maintenance, models, payment_accounts,
  safety_filter (Free-plan safety on/off), site_name, support_contact.
- Private Storage bucket `payment-proofs` + policies (user apni file
  `<user-uuid>/<filename>` path par upload karta hai; admin sab dekh sakta hai).

Script dobara chalana safe hai (CREATE OR REPLACE / ON CONFLICT DO NOTHING /
DROP POLICY IF EXISTS).

## 4) Edge Function deploy karo

```bash
cd badshah-ai-v2
supabase functions deploy ai-chat --no-verify-jwt
supabase secrets set FT_FUSION_API_KEY=<tumhari-key-yahan>
supabase secrets set GROQ_API_KEY=<tumhari-groq-key-yahan>
supabase secrets set OPENWEATHER_API_KEY=<tumhari-openweather-key-yahan>
```

- `--no-verify-jwt` sahi hai: JWT function ke andar manually verify hota hai
  (`Authorization: Bearer <user JWT>` header se).
- Secret set karne ke baad function dobara deploy karne ki zaroorat nahi —
  secret turant active hota hai.
- Function kya karti hai: user ka JWT check → `profiles` se Pro status →
  model gating (Free: Groq GPT-OSS 120B / Qwen / Allam 2 7B, gpt-3-5,
  pollinations-text, fusion-spark, fusion-lexus; free image: pollinations-image / stable-diffusion /
  fusion-uni;
  Pro: fusion-synth, vortex, abyss, shadow, reaper, dread, void + image
  fusion-astra) → Free users ke prompt par safety instruction lagti hai
  **sirf jab admin ka safety filter ON ho** (`admin_settings` →
  `safety_filter`; default ON), Pro ka prompt as-is jata hai → upstream
  API call (key sirf env se) → JSON jawab
  `{ok, kind, text | image_url | image_base64}`. Groq calls mein 5xx par
  ek retry hoti hai; rate limit (429) par saaf "Rate limited" error aur
  baaki upstream failures par "service down" error milta hai.

## 5) Admin user banao

1. App kholo → **Create account** se `shahzain1751@gmail.com` par register
   karo (password: user ne chat mein diya tha — **value yahan nahi likhi**;
   password rules: min 8 chars, 1 UPPERCASE, 1 lowercase, 1 number,
   1 special character).
2. Supabase Dashboard → SQL Editor mein ye chalao (pehle user id nikalo):

```sql
-- user ka id dekho:
SELECT id, email FROM auth.users WHERE email = 'shahzain1751@gmail.com';
-- phir admin banao (id replace karo):
UPDATE public.profiles SET is_admin = true WHERE id = '<user-id>';
```

- Admin panel ka **koi link main page par nahi hai** — panel sirf
  `adminpanal.html` par khulta hai (`https://badshah222-wormai.pages.dev/adminpanal`).
  Admin login kare to wo seedha admin panel par redirect ho jata hai (sirf
  login button se; wapas "Back to app" se aa sakta hai). Admin panel: `adminpanal.html`
  (alag page, admin-only guard, search engines se `noindex`).

## 6) Frontend deploy karo (Cloudflare Pages)

Poora `badshah-ai-v2` folder deploy karo — Cloudflare Pages project
**badshah222-wormai** (https://badshah222-wormai.pages.dev), GitHub repo
`Badshah-official512/badshahworm-ai` (branch main) se connected hai, is
liye GitHub push karte hi auto-deploy hota hai. Framework preset None,
build command khaali, output directory root (/).

- `_worker.js` ab sirf headers serve karta hai; us mein **koi secret
  set karne ki zaroorat nahi** (purana `BADSHAH_API_KEY` Cloudflare secret
  ab istemal nahi hota — use hata sakte ho).
- Deploy ke baad test karo: register → login → free model se chat → Buy Pro
  flow → admin panel (`/adminpanal`) se order approve → Pro model unlock.

## 7) Pro plans aur payment accounts

Plans (PKR): 1 Month **Rs 100**, 3 Months **Rs 230**, 5 Months **Rs 400**,
8 Months **Rs 699**, 1 Year **Rs 999**, Custom (admin price/duration set
karta hai — admin panel → Settings, ya `plans` table ki `plan-custom` row).

Payment (manual — pehle pay, phir order form):
- Easypaisa: **03095413705**
- JazzCash: **03251787969**
- NayaPay: **03251787969**
- Bank of Khyber (BOK), IBAN: **PK57KHYB5085003008629737**

> ✅ IBAN confirmed by the user on 2026-11-11: `PK57KHYB5085003008629737` is correct.
> (The earlier value `…39737` was wrong by one digit and has been corrected
> everywhere — code, policies, admin default, DB seed, and the live
> `admin_settings` → `payment_accounts` row.)

## 8) Models (18 total — fusion-pulse hataya gaya)

- **Free** (koi bhi registered user): chat `groq-gpt-oss-120b` (Groq GPT-OSS 120B, fallback gpt-oss-20b), `groq-qwen` (Groq Qwen 3 27B), `groq-allam` (Groq Allam 2 7B), `gpt-3-5`, `pollinations-text`, `fusion-spark`, `fusion-lexus` (free);
  image `pollinations-image` (Pollinations), `stable-diffusion` and `fusion-uni`.
- **Read aloud (TTS):** every AI message has a 🔊 button. The Edge Function
  (`mode: "tts"`) turns the reply into MP3 parts via
  `texttospeech.alphaapi.workers.dev` — StreamElements voices (default Brian)
  for Latin text, Google TTS `lang=ur` for Urdu script. Long replies are
  chunked (~170 chars per part). Voice is picked in Settings → Read aloud
  voice. The all-voices catalog (`all-voices.faizankhichi.me/voices`) is a
  voice list only (no synthesis endpoint), so it is not wired to playback.
- **Tools (sidebar → Tools):** Weather (OpenWeatherMap, secret
  `OPENWEATHER_API_KEY`), Temp Mail (mail.tm — new address, inbox, read;
  address + token in localStorage `bw_tempmail_v1`), Facebook Video
  Downloader (siputzx FB endpoint — HD/SD links). All run through the Edge
  Function (`mode: "tool"`), free for every registered user.
- **Pro only**: chat `fusion-synth`, `fusion-vortex`, `fusion-abyss`,
  `fusion-shadow`, `fusion-reaper`, `fusion-dread`, `fusion-void`;
  image `fusion-astra`.
- `fusion-pulse` ab kahin nahi hai (frontend, Edge Function aur admin panel
  se remove; Edge Function use 400 se reject karta hai).
- Free chat models ab 7 hain (3 Groq + 2 free providers + 2 FT Fusion); kul 18 models hain
  (14 chat + 4 image).

## 9) Policies, voice, aur baaki features

- Policies About section mein hain: `policies/privacy-policy.html`,
  `policies/payment-privacy-policy.html`, `policies/terms-conditions.html`.
- Voice: har AI text jawab par 🔊 button — device ki default TTS voice se
  parh kar sunata hai (dobara tap = stop). Muse ki apni voice web app mein
  embed nahi ho sakti, is liye device voice istemal hoti hai.
- Login par user ki IP + device `login_history` mein record hoti hai aur
  admin panel → Users mein dikhti hai. IP "assign" nahi ki jati — jo request
  se aati hai wohi log hoti hai.
- Maintenance mode aur model on/off admin panel → Settings se control hote
  hain (`admin_settings` table).

## 10) SEO (v2.2 — mukammal)

Title: "Badshah222 official worm ai | worm ai by badshah 222 (badshah worm ai 222 / worm ai by badshah / badshahworm / Mr Zain worm ai)" — description, keywords, Open Graph/Twitter, JSON-LD (WebApplication), canonical `https://badshah222-wormai.pages.dev/`, robots.txt, sitemap.xml (main page + 3 policy pages; admin panel list nahi hota). Google Search Console verification meta tag `index.html` aur teeno policy pages mein hai. Admin panel (`/adminpanal`) par `noindex, nofollow` hai. GSC mein sitemap submit karna aur verification confirm karna ab bhi user ko khud karna hai.

## Android App (APK) — HATA DIYA GAYA (v2.2)

- APK (`Badshah222-ai.apk`) v2.2 mein remove kar diya gaya hai — file delete,
  download bar/links aur install guide se hata diye gaye. User naya APK
  banayega to baad mein add hoga.
- Ab install sirf **Add to Home Screen** (PWA) se hota hai: Android Chrome
  mein browser menu → "Add to Home screen", iPhone Safari mein Share →
  "Add to Home Screen". PWA icons (`icon.png`, `icon-192.png`,
  `icon-512.png`) waise hi maujood hain.
