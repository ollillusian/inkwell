# Inkwell

Private writing companion (web + iOS). AI-tailored prompts three times a day; **you** write the answers.

> **Own repo:** This folder is a standalone project. It should **not** live inside a monorepo with unrelated code. Copy it out, `git init`, push to GitHub, deploy on Railway — see [RAILWAY.md](./RAILWAY.md).

## Local dev (quick test)

```bash
cd web
cp .env.local.example .env.local
```

Minimum for prompt testing only:

```bash
OPENAI_API_KEY=sk-...
```

```bash
npm install
npm run dev
```

Open **http://localhost:3001/dev** — pick themes, generate a prompt (no Supabase needed).  
(Inkwell uses port **3001** so it does not clash with other apps on 3000.)

Full app (sign-in, journal):

1. Supabase project + run migrations `001` through `004` in `supabase/migrations/`
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) to `.env.local` — or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` if your project still shows JWT keys
3. Supabase auth redirect: `http://localhost:3001/auth/callback`
4. Open **http://localhost:3001**

## Deploy

- **[DEPLOY.md](./DEPLOY.md)** — Railway (web) step-by-step, then App Store / TestFlight / PWA  
- **[RAILWAY.md](./RAILWAY.md)** — Railway env vars reference  

## Layout

```
inkwell/          ← this repo root
  web/            ← Next.js (Railway service root)
  supabase/       ← SQL migration
  shared/         ← prompt fallbacks + types
  ios/            ← SwiftUI (Xcode)
```

## Philosophy

- **AI prompts, human answers** — OpenAI crafts prompts from your onboarding themes
- **Cached daily** — one LLM call per slot per day (`prompt_deliveries`)
- **Private** — Supabase RLS; journal text is not sent to the LLM
