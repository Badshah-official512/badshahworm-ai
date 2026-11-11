# BADSHAH AI — BadshahWorm AI

![BADSHAH AI](logo.png)

**BADSHAH AI** is a ChatGPT-style AI web app — chat with powerful AI models and generate images, free and Pro, in English and Urdu. Built for everyone: students, creators, freelancers and businesses in Pakistan and around the world.

> **Live app:** coming soon on Cloudflare Pages
> **Android APK:** [Badshah222-ai.apk](Badshah222-ai.apk)

---

## Who made it

**Badshah (Zain Shah)** — also known as **Badshah222** — a web developer and creator from **Swabi, Pakistan**. He builds AI apps, websites and tools, and teaches AI + website making in Urdu on YouTube.

- 🌐 Portfolio: [badshah222.pages.dev](https://badshah222.pages.dev)
- 📱 WhatsApp: [+92 325 1787969](https://wa.me/923251787969)
- ▶️ YouTube (AI + Website Making, Urdu): [@BadshahAIWebsites](https://www.youtube.com/@BadshahAIWebsites)
- ▶️ YouTube (main): [@Badshahofficial-222](https://www.youtube.com/@Badshahofficial-222)
- 🎵 TikTok: [@zain_ff45](https://www.tiktok.com/@zain_ff45)
- 📘 Facebook: [Badshah](https://www.facebook.com/share/1Jgyv3r7vG/)
- 📸 Instagram: [@badshahofficial222](https://www.instagram.com/badshahofficial222)
- ✉️ Email: shahzain1751@gmail.com

## Why it was made

Most AI apps are expensive, English-only, or need a credit card. BADSHAH AI was made so that **anyone in Pakistan can use modern AI easily** — no card, no complicated setup. Just sign up with an email and start chatting. Pay with Easypaisa, JazzCash or bank transfer if you want Pro.

## How it was made

- **Frontend:** a fast single-page app in plain HTML, CSS and JavaScript (no heavy framework) — sidebar chats, chat + image modes, prompt library, voice read-aloud, file upload.
- **Backend:** [Supabase](https://supabase.com) — PostgreSQL database with Row Level Security, email + password login (no OTP), and an Edge Function (Deno) that talks to the AI API.
- **AI models:** FT Fusion API — 12 models (see below). The API key lives only as a server secret; it is never in the frontend code.
- **Admin panel:** a professional dashboard (`admin.html`) — users, Pro grants, payment orders, help-center replies, plans, safety filter and site settings.
- **Hosting:** Cloudflare Pages (deployment guide: [DEPLOY.md](DEPLOY.md)).

## AI models

**Free (every registered user):**

| Mode | Models |
| --- | --- |
| Chat | groq-gpt-oss-120b (Groq GPT-OSS 120B), gpt-3-5, pollinations-text |
| Image | pollinations-image, stable-diffusion |

**Pro:**

| Mode | Models |
| --- | --- |
| Chat | fusion-synth, fusion-vortex, fusion-abyss, fusion-shadow, fusion-reaper, fusion-dread, fusion-void |
| Image | fusion-astra |

Free plan has a safety filter on. Pro has no extra filter. Pro access is checked on the server — never in the browser.

## Pro plans (PKR)

| Plan | Price |
| --- | --- |
| 1 month | Rs 100 |
| 3 months | Rs 230 |
| 5 months | Rs 400 |
| 8 months | Rs 699 |
| 1 year | Rs 999 |
| Custom | on request |

**How to get Pro:** pay first (Easypaisa, JazzCash, NayaPay or bank transfer), then fill the in-app order form with your name and payment screenshot. The admin activates Pro from the admin panel. The admin can also grant Pro for any custom duration.

## Project structure

```text
index.html / app.js / styles.css   – the app (chat, image, library, voice)
admin.html / admin.js              – admin panel
supabase/schema.sql                – database: profiles, plans, subscriptions,
                                     payment_orders, help_messages, admin_settings,
                                     login_history (+ RLS + RPCs)
supabase/functions/ai-chat/        – Edge Function: auth, free/Pro gating, safety filter
policies/                          – Privacy Policy, Payment Privacy Policy, Terms
assets/                            – app images
Badshah222-ai.apk                  – Android app
```

## Setup (developers)

1. Create a Supabase project and run `supabase/schema.sql` in the SQL Editor.
2. Turn **Confirm email OFF** in Auth settings (email + password login, no OTP).
3. Deploy the Edge Function and set the secret:
   `supabase secrets set FT_FUSION_API_KEY=<your key>`
4. Copy `supabase-config.js` values (project URL + anon key).
5. Create the admin user in Auth and set `is_admin = true` on its profile row.
6. Deploy the folder to Cloudflare Pages (see [DEPLOY.md](DEPLOY.md)).

Full build notes: [BUILD-REPORT.md](BUILD-REPORT.md)

## Privacy

- No passwords or API keys are stored in this repository.
- Login IP and device are logged (shown in the admin panel) for account safety.
- See [Privacy Policy](policies/privacy-policy.html), [Payment Privacy Policy](policies/payment-privacy-policy.html) and [Terms & Conditions](policies/terms-conditions.html).

---

Made with ❤️ by **Badshah (Zain Shah)** — Swabi, Pakistan.
