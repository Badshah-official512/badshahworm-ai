# BADSHAH AI v2 — Deploy Guide (Supabase backend)

> v2 mein backend poora Supabase par hai. Cloudflare `_worker.js` ka `/api/chat`
> proxy **khatam** kar diya gaya hai — ab wo sirf static hosting + security
> headers + APK download headers ke liye hai. AI calls Supabase Edge Function
> `ai-chat` se hoti hain. **API key kahin bhi file mein nahi hai** — wo sirf
> Supabase Edge Function secret `FT_FUSION_API_KEY` mein set hoti hai.

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
- Seed `admin_settings`: maintenance, models, apk_url, payment_accounts,
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
```

- `--no-verify-jwt` sahi hai: JWT function ke andar manually verify hota hai
  (`Authorization: Bearer <user JWT>` header se).
- Secret set karne ke baad function dobara deploy karne ki zaroorat nahi —
  secret turant active hota hai.
- Function kya karti hai: user ka JWT check → `profiles` se Pro status →
  model gating (Free: lexus/spark/uni; Pro: baaki 8) → Free users ke prompt
  par safety instruction lagti hai **sirf jab admin ka safety filter ON ho**
  (`admin_settings` → `safety_filter`; default ON), Pro ka prompt as-is
  jata hai → upstream FT Fusion API call (key sirf env se) → JSON jawab
  `{ok, kind, text | image_url | image_base64}`.

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

- Admin panel ka link sidebar mein tab dikhega jab `is_admin = true` ho.
- Admin panel: `admin.html` (alag page, admin-only guard).

## 6) Frontend deploy karo (Cloudflare Pages)

Poora `badshah-ai-v2` folder deploy karo (pehle jaisa hi project, badshah222):

- Dashboard: Workers & Pages → project → Create deployment → folder upload,
  ya terminal: `npx wrangler pages deploy . --project-name badshah222`
- `_worker.js` ab sirf headers + APK serve karta hai; us mein **koi secret
  set karne ki zaroorat nahi** (purana `BADSHAH_API_KEY` Cloudflare secret
  ab istemal nahi hota — use hata sakte ho).
- Deploy ke baad test karo: register → login → free model se chat → Buy Pro
  flow → admin panel se order approve → Pro model unlock.

## 7) Pro plans aur payment accounts

Plans (PKR): 1 Month **Rs 100**, 3 Months **Rs 230**, 5 Months **Rs 400**,
8 Months **Rs 699**, 1 Year **Rs 999**, Custom (admin price/duration set
karta hai — admin panel → Settings, ya `plans` table ki `plan-custom` row).

Payment (manual — pehle pay, phir order form):
- Easypaisa: **03095413705**
- JazzCash: **03251787969**
- NayaPay: **03251787969**
- Bank of Khyber (BOK), IBAN: **PK57KHYB5085003008639737**

> ⚠️ IBAN check: user ne message mein "BK57KHYB5085003008639737" likha tha.
> Pakistan ka country code **PK** hai, is liye `PK57…` istemal kiya gaya hai.
> Deploy se pehle digits ek dafa user se double-check karwa lo — purane
> record mein IBAN `PK57KHYB508500300862973` (…2973) tha, naye mein `…39737`
> hai. Agar galat ho to `admin_settings` → `payment_accounts` se badal lo
> (admin panel → Settings → Payment accounts).

## 8) Models (11 total — fusion-pulse hataya gaya)

- **Free** (koi bhi registered user): chat `groq-gpt-oss-120b` (Groq GPT-OSS 120B), `gpt-3-5`, `pollinations-text` (free);
  image `fusion-uni`.
- **Pro only**: chat `fusion-synth`, `fusion-vortex`, `fusion-abyss`,
  `fusion-shadow`, `fusion-reaper`, `fusion-dread`, `fusion-void`;
  image `fusion-astra`.
- `fusion-pulse` ab kahin nahi hai (frontend, Edge Function aur admin panel
  se remove; Edge Function use 400 se reject karta hai).
- Note: task brief mein "(12)" likha tha, lekin list mein pulse hata kar
  **11** models bante hain — yehi sahi count hai.

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

## 10) SEO (pehle jaisa — code mein ho chuka)

Title, description, canonical, Open Graph/Twitter, JSON-LD, robots.txt,
sitemap.xml, og-image.png. Google Search Console verification aur sitemap
submission ab bhi user ko khud karni hai (pehle wale steps DEPLOY.md ke
purane version mein the; site URL `https://badshah222.pages.dev`).

## Android App (APK)

- `Badshah222-ai.apk` site ke root mein hai:
  `https://badshah222.pages.dev/Badshah222-ai.apk`
- Nayi APK banayein to wahi file naam se replace karke dobara deploy karein.
- Purani APK ka SHA-256: 24a4e1a66475d2b141bee8936342e63ec71f140dad5244fd8c4edb7e9f87a686
