# BADSHAH AI v2 — Build Report

**Date:** 10 November 2026 (PKT)
**Source (read-only, untouched):** `~/workspace/badshah-ai/`
**Output:** `~/workspace/badshah-ai-v2/` — full upgraded app copy
**Status:** Code complete and statically verified. **NOT live-tested** — no
Supabase project exists yet (project creation is a separate, parent-side
step), so auth / Edge Function / storage / orders could only be
code-verified, not run end-to-end.

## What was built

### 1) Supabase backend — `supabase/schema.sql` (78 statements)
- 7 tables, all RLS-enabled: `profiles`, `plans`, `subscriptions`,
  `payment_orders`, `help_messages`, `admin_settings`, `login_history`.
- Trigger on `auth.users` insert → auto-creates `profiles` row.
- Trigger blocks non-admin changes to `profiles.is_pro / plan_id /
  pro_expires_at / is_admin`.
- 5 admin RPCs (SECURITY DEFINER + internal admin check):
  `approve_payment_order` (activates Pro for plan months, extends existing
  expiry), `reject_payment_order`, `grant_pro`, `revoke_pro`,
  `set_admin_status` (self-demotion blocked).
- Seed: 6 plans (1M Rs 100, 3M Rs 230, 5M Rs 400, 8M Rs 699, 1Y Rs 999,
  Custom) + 5 `admin_settings` rows.
- Private Storage bucket `payment-proofs` + policies (uploads must go to
  `<user-uuid>/<filename>` — the frontend does exactly this).
- Re-runnable (CREATE OR REPLACE / ON CONFLICT DO NOTHING / DROP POLICY IF
  EXISTS).

### 2) Edge Function — `supabase/functions/ai-chat/index.ts` (335 lines)
- Deno.serve, CORS, manual JWT verification (deploy with
  `--no-verify-jwt`).
- Reads `FT_FUSION_API_KEY` **only** from `Deno.env` — no key value in code.
- Pro check from `profiles` (`is_pro` + `pro_expires_at` in future).
- Server-side model gating: Free = chat lexus/spark, image uni; Pro = the
  other 8 models; `fusion-pulse` → 400.
- Free users: safety instruction prepended to prompt. Pro users: prompt
  passed through as-is. No refusal-bypass machinery.
- Returns `{ok:true, kind:"text", text}` or `{ok:true, kind:"image",
  image_url | image_base64, content_type}`; errors `{ok:false, error}`.
- Upstream JSON `error` / empty / "No image returned" failures return HTTP
  502 (body still `{ok:false, error}`).

### 3) Frontend — `index.html`, `styles.css`, `app.js` (1909 → 2431 lines)
- **Auth on the ENTER splash:** login form + register form (name, email,
  password, confirm password) with live password-rule checklist (min 8
  chars, 1 upper, 1 lower, 1 number, 1 special). Supabase Auth,
  email+password, no email confirmation / OTP / magic link — instant login.
  `#enterAppBtn` stays hidden until logged in. Logout in sidebar.
- **Models (11):** free chat lexus/spark, free image uni; pro chat synth,
  vortex, abyss, shadow, reaper, dread, void; pro image astra.
  `fusion-pulse` removed everywhere. Pro models show a PRO badge and are
  locked for free users (tap → toast + Buy Pro modal opens).
- **AI calls:** all three former `/api/chat` call sites now use
  `supabaseClient.functions.invoke('ai-chat', {body:{model, q}})`. The old
  `aiUrl()` and `extractText()` were removed; `fetchResilient` remains
  (unused by AI now, harmless).
- **Voice:** 🔊 button on every AI text response — browser Web Speech API
  (`speechSynthesis`), device default voice, tap again to stop, one message
  at a time. (Muse's own voice cannot be embedded in a web app.)
- **Buy Pro flow:** plans from Supabase (hardcoded fallback) → payment
  method → account details shown → payer name + screenshot upload to
  `payment-proofs/<user-id>/<timestamp>-<file>` → `payment_orders` row
  (Custom plan: amount 0, "admin will confirm price").
- **Help Center:** send message, see own threads + admin replies.
- **Policies modal:** loads `policies/*.html` fragments; links in About +
  on the auth splash.
- **Profile/plan:** token badge shows `Free` or `Pro until <date>`;
  maintenance mode + admin-disabled models read from `admin_settings`
  (graceful fallback to Free if tables are missing).
- **Login history:** public IP via ipify (best-effort, 3s timeout) +
  user-agent → `login_history` insert + `profiles.last_ip/last_device`
  update. Never blocks login.
- **Copy cleanup:** all "no login needed" / "Free & Unlimited" claims
  removed (meta, OG, JSON-LD — offers now PKR 100 — splash, install bar,
  About). "Free & Pro Plans" wording now.
- `supabase-config.js` (new): placeholders only
  (`https://YOUR-PROJECT-REF.supabase.co` / `YOUR-ANON-KEY`).
- `config.js`: `BADSHAH_API_URL` retired (now `null` + explanatory comment).
- `_worker.js`: **old `/api/chat` proxy removed** — the file now only serves
  static assets with security headers + APK download headers; `/api/chat`
  returns HTTP 410. No secret needed on Cloudflare anymore.

### 4) Admin panel — `admin.html` + `admin.js`
- Standalone page, noir/gold theme, admin-only guard (redirects to login
  if no session / not admin). CSS lives inside `admin.html`.
- **Dashboard:** total users, pro users, pending orders, revenue (approved
  orders sum), recent logins.
- **Users:** searchable table (name, email, plan, pro expiry, last IP,
  last device, last login); Grant Pro (plan select), Revoke Pro, Make /
  Remove Admin (self-demotion blocked), Edit Pro expiry (date validation).
- **Orders:** All/Pending/Approved/Rejected filters; plan, amount, method,
  payer name, screenshot preview (signed URL, 1h); Approve (activates Pro
  via RPC) / Reject with note.
- **Help:** incoming messages + reply box (reply saved, user sees it in-app).
- **Settings:** maintenance toggle, 12-model toggles (stored as
  `models.disabled` list), APK URL, payment account details, custom plan
  price/months (updates both `admin_settings` and the `plan-custom` row),
  support contact.
- All actions go through Supabase RPCs / RLS-checked updates.

### 5) Policies — `policies/` (3 HTML fragments, no html/head/body wrapper)
- `privacy-policy.html` (894 words), `payment-privacy-policy.html`
  (788 words), `terms-conditions.html` (995 words). ChatGPT-style, adapted
  to this app: real PKR prices, real payment accounts, Supabase backend,
  free vs pro safety rules, manual-payment refunds, Pakistan law.
  Each starts with an `<h2>`, "Last updated: 10 November 2026", and a
  one-line Roman Urdu "Mukhtasar:" summary.

## File list (new / changed in v2)

| File | Change |
|---|---|
| `index.html` | Auth forms, modals, sidebar account/logout/admin, copy cleanup |
| `styles.css` | Auth/plan/method/policy/help/speak styles + coordinator alias fix |
| `app.js` | Supabase auth, 11 models, Edge calls, voice, Buy Pro, Help, policies |
| `supabase-config.js` | NEW — placeholders only |
| `config.js` | `BADSHAH_API_URL` retired |
| `_worker.js` | `/api/chat` proxy removed; headers + APK only |
| `admin.html`, `admin.js` | NEW — admin panel |
| `supabase/schema.sql` | NEW — tables, RLS, triggers, RPCs, seeds, bucket |
| `supabase/functions/ai-chat/index.ts` | NEW — Edge Function |
| `policies/*.html` (×3) | NEW — Privacy, Payment Privacy, Terms |
| `DEPLOY.md` | Rewritten for Supabase deploy |
| `BUILD-REPORT.md` | This file |

Unchanged from source: `library.js`, `manifest.json`, `robots.txt`,
`sitemap.xml`, icons, `assets/`, `Badshah222-ai.apk`, logo/og images.

## Verification done

- `node --check`: `app.js` ✓, `admin.js` ✓, `supabase-config.js` ✓,
  `library.js` ✓, `_worker.js` ✓ (as `.mjs`).
- `tsc --noEmit` (TypeScript 5.6.3) on the Edge Function: **zero syntax or
  logic errors** — only the two expected environment errors (esm.sh URL
  import + `Deno` global, both normal for Deno Edge Functions; `deno check`
  itself was unavailable — no Deno binary in this environment).
- `pglast` (real Postgres parser) on `schema.sql`: **78 statements parse
  clean** (re-run after the coordinator's seed edit).
- Secret scan over the whole v2 tree (key pattern, password literals):
  **CLEAN** — no FT Fusion key value, no password value anywhere. The only
  credentials-adjacent strings are the user's *public* payment accounts
  (Easypaisa/JazzCash/NayaPay numbers + BOK IBAN), which are meant to be
  displayed to buyers.
- ID cross-check: all 57 contract IDs exist exactly once in `index.html`;
  all 124 `$('#…')` references in `app.js` resolve except 4 known-safe ones
  (`planDisplay` guarded-optional, `skeletonMsg`/`thinkingText` created
  dynamically by `showSkeleton`, `appDownloadBtn` pre-existing + guarded).
- CSS class mismatch found at assembly and fixed: app.js used
  `.buy-plan-card` / `.buy-method-btn` / `.help-item` / `.pro-badge` /
  `.is-pro-locked`, styles.css had `.plan-card` / `.method-btn` /
  `.help-thread` — aliases appended to `styles.css` (both class sets now
  styled; `.speak-btn.speaking` already existed).
- `support_contact` shape mismatch fixed: schema seed now
  `{"value": "...", "whatsapp": "..."}` and admin.js reads
  `value || whatsapp || contact || text`.
- Schema ↔ app.js column check: `plans.price_pkr/name/sort_order`,
  `help_messages.reply`, `admin_settings.key/value` all match; app.js
  fallbacks are belt-and-braces only.
- Local static serve (`python3 -m http.server`): index.html, admin.html,
  app.js, supabase-config.js, policies all return **200**; index.html loads
  the Supabase CDN script + `supabase-config.js` before app.js.

## Verification gaps (honest — needs the parent / live project)

1. **No end-to-end test possible.** No Supabase project exists yet, so
   auth, profile creation, Edge Function calls, storage upload, order
   insert, and admin RPCs are code-verified only. First live run must test:
   register → login → free chat → Buy Pro submit → admin approve → Pro
   model unlocks.
2. **No `deno check` / live Edge Function test** (no Deno binary here).
   Deploy + invoke once with a real key to confirm.
3. **No browser render test** of the new splash/modals/admin page (no live
   browser in this environment). Markup + CSS were statically checked only.
4. `reject_payment_order` enforces pending-only (same as approve) — the
   brief didn't explicitly require it; loosen if the admin should be able
   to reject already-approved orders.

## Refinement pass — 10 November 2026 (evening, v2.1)

User's three refinements, applied on top of the build above. Same status:
code-complete and statically verified, **still not live-tested** (no Supabase
project yet).

### 1) Admin grants Pro for ANY selected time
- `supabase/schema.sql` — `grant_pro` rewritten: new signature
  `grant_pro(p_user_id, p_plan_id DEFAULT NULL, p_days DEFAULT NULL,
  p_months DEFAULT NULL, p_expires_at DEFAULT NULL, p_extend DEFAULT true)`.
  Duration is now freely selectable: a **plan preset** (plan months), a
  **custom duration** in days (1–3650) or months (1–120), or an **exact end
  date** (wins over the others). `p_extend=true` (default) adds the new
  time on top of a still-running Pro expiry; otherwise it starts from now.
  Plan recorded falls back to the user's current plan, then `plan-custom`.
- New RPC `set_pro_expiry(p_user_id, p_expires_at DEFAULT NULL)`: sets a
  user's Pro expiry directly (NULL clears Pro entirely; a past date turns
  Pro off and cancels active subscriptions). Used by "Edit Expiry".
- `approve_payment_order` is **unchanged**: approving a payment order still
  activates Pro for the FULL plan duration automatically.
- `admin.html` + `admin.js` — the per-row plan dropdown is replaced by a
  **Grant Pro modal**: three duration modes (Plan preset / Custom duration /
  Specific end date) as radio cards, an "add on top of current Pro" checkbox,
  and a live preview line ("Pro will be active until …"). "Edit Expiry"
  opens the same modal in expiry mode (end-date only + Clear Pro button).
  The old `window.prompt` date entry is gone.

### 2) Admin has ALL system controls
- New Settings cards in the admin panel (all stored in `admin_settings` or
  the `plans` table — nothing hard-coded that the admin cannot change):
  - **Plans editor** — every plan's name, months, price (Rs) and token
    limit editable in one table; saving updates the `plans` rows and keeps
    the `custom_plan` setting in sync. (The old custom-plan-only card stays
    as a shortcut; both write the same source of truth.)
  - **Free-plan safety filter** — ON/OFF toggle (`safety_filter` setting).
    The Edge Function now reads this setting on every request: OFF removes
    the safety prefix for Free users too (Pro was never filtered).
  - **Site display name** — (`site_name` setting) applied by the main app
    to the sidebar brand, About heading, install bar, intro line and
    `document.title`.
- Fixed a gap found during this audit: the **APK URL** admin setting was
  stored but never applied by the frontend (`FB.cfg.apkUrl` was never
  populated). `loadAdminSettings()` in `app.js` now applies `apk_url` to
  every APK download link, and `payment_accounts` now overwrites the
  hard-coded Buy Pro account details at startup (they were hard-coded
  constants before; they are now defaults only).
- Everything else was already editable: maintenance, model toggles, payment
  accounts, custom plan, support contact. The panel now covers: plans,
  safety filter, site name, payment accounts, models, maintenance, APK URL,
  support contact.

### 3) Professional new-version design polish
- **Login / Register** (`styles.css`): the auth box is now a floating
  glass card (surface bg, border, radius 26, shadow); password rules are
  pill chips in a 2-column grid (green when satisfied); errors render as a
  soft red banner; submit buttons and focus rings tightened.
- **Buy Pro** (`index.html` + `styles.css`): step hint line under the
  heading (1 plan · 2 method · 3 pay & submit proof); plan cards in a
  2-column grid with a ✓ badge on the selected card; payment methods as a
  segmented pill group; payment-details panel with a gold left accent and
  mono account numbers; full-width submit button.
- **Policy / Help modals**: gold top accent bar on the modal, accent-bar
  section headings, roomier line-height.
- **Admin panel** (`admin.html` inline CSS): gradient gold header title +
  underline, stat cards with a gold top accent and hover lift, table row
  hover, active-tab glow, focus-visible gold rings, Grant Pro modal styling
  (radio cards, live preview banner, responsive).
- No JS-facing id/class was renamed; the chat UI's core behaviour is
  untouched.

### Verification done (this pass)
- `node --check`: `app.js` ✓, `admin.js` ✓ (re-run after all edits).
- `pglast` (real Postgres parser) on the rewritten `schema.sql`: parses
  clean (re-run after the `grant_pro` rewrite + `set_pro_expiry`).
- Secret scan over the v2 tree: **CLEAN** — no FT Fusion key value, no
  password value anywhere.
- Local static serve smoke check: `index.html`, `admin.html`, `app.js`,
  `admin.js`, `styles.css`, `policies/*` all return **200**.

### Still missing / honest gaps (unchanged from the first build)
- No end-to-end test: no Supabase project, no Deno binary, no browser
  render test. First live run must test the new grant modal (preset /
  custom / end-date), the plans editor, the safety toggle, and the site
  name applying in the app.
- `set_pro_expiry` with a past date turns Pro off; the admin panel's
  "Edit Expiry" preview says so explicitly.

## Notes / decisions for the parent

- **Model count is 11, not 12.** The brief said "(12)" but the list minus
  removed `fusion-pulse` is 11 (9 chat + 2 image). All three code surfaces
  (app.js, Edge Function, admin.js) and the policies use 11 consistently.
- **IBAN flag:** user wrote "BK57KHYB5085003008639737" — `PK57…` is used
  (PK = Pakistan country code). Digits differ from the older recorded IBAN
  (`…300862973`). Ask the user to double-check before go-live; the value is
  editable from admin panel → Settings → Payment accounts.
- **Admin user is NOT created in code.** Create it via the app's register
  form, then flip `is_admin` in SQL (see DEPLOY.md §5). Never write the
  admin password anywhere.
- **No service_role key anywhere** in the frontend; RLS + RPCs enforce
  everything. The Edge Function uses the anon key + the user's JWT.
- **Unlimited members:** no cap coded anywhere; Supabase Auth handles scale.
- `config.js` still ships (harmless, `BADSHAH_API_URL = null`).
- Old Cloudflare secret `BADSHAH_API_KEY` is no longer used — it can be
  removed from the Cloudflare project after the Supabase secret is set.
