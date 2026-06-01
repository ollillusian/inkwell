# Deploy Inkwell on Railway

Inkwell is meant to live in **its own Git repository**, not inside a larger monorepo.

## 1. Own repo

```bash
# Example: copy out of a parent repo, then init
cp -r inkwell ~/Documents/inkwell
cd ~/Documents/inkwell
git init
git add .
git commit -m "Initial Inkwell app"
# gh repo create inkwell --private --source=. --push
```

## Do you need Supabase on Railway?

**Yes, for the full app** — but Supabase is **not installed on Railway**. It runs in the cloud (free tier is fine). Railway only hosts the Next.js app; that app connects to your Supabase project over the internet using env vars.

Without Supabase you cannot sign in or save journal entries. Prompt generation only needs `OPENAI_API_KEY` (use `/dev` locally).

## 2. Supabase (production)

1. Create a [Supabase](https://supabase.com) project (same one for local + Railway, or separate dev/prod projects).
2. Run both migrations in the SQL editor:
   - `supabase/migrations/001_inkwell_schema.sql`
   - `supabase/migrations/002_flexible_nudges.sql`
   - `supabase/migrations/003_travel_daily.sql`
   - `supabase/migrations/004_writing_voice_timezone.sql`
3. **Authentication → URL configuration**:
   - Site URL: `https://YOUR_APP.up.railway.app`
   - Redirect URLs: `https://YOUR_APP.up.railway.app/auth/callback`

## 3. Railway service

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** (your `inkwell` repo only).
2. **Settings → Source → Root Directory**: `web` (required).
3. **Variables** (service):

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (`https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Publishable** key (`sb_publishable_...`) from Settings → API Keys |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(optional)* Legacy anon JWT if you don’t have publishable yet |

Use **publishable OR anon**, not the secret key (`sb_secret_...`).
| `OPENAI_API_KEY` | Prompt generation |
| `OPENAI_MODEL` | Optional, default `gpt-4o-mini` |
| `SUPABASE_SERVICE_ROLE_KEY` | Cron nudge push (server only) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push public key (`npx web-push generate-vapid-keys`) |
| `VAPID_PRIVATE_KEY` | Web Push private key |
| `VAPID_SUBJECT` | e.g. `mailto:you@example.com` |
| `CRON_SECRET` | Random string; protects `/api/cron/send-nudges` |

### Nudge cron (push when app is closed)

Add a **Cron** job in Railway (or any scheduler) that calls **every minute**:

```http
GET https://YOUR_APP.up.railway.app/api/cron/send-nudges
Authorization: Bearer YOUR_CRON_SECRET
```

Run migration `web/supabase/migrations/008_push_subscriptions.sql` in Supabase.

Railway sets `PORT` automatically; the Dockerfile listens on it via Next standalone.

4. Deploy. Copy the public URL into Supabase redirect settings if you have not already.

## 4. Build

Uses `web/Dockerfile` (`output: "standalone"`). `NEXT_PUBLIC_*` vars must be present **at build time** for Docker; Railway injects them when using Dockerfile build with args — if the client bundle is empty, add in Railway **Variables** and redeploy, or set **Docker build args** to match variable names in the Dockerfile.

## 5. Local dev (same codebase)

```bash
cd web
cp .env.local.example .env.local
# fill Supabase + OPENAI_API_KEY
npm install
npm run dev
```

Without Supabase configured, open [http://localhost:3001/dev](http://localhost:3001/dev) to test LLM prompts only.

See **[DEPLOY.md](./DEPLOY.md)** for the full Railway + App Store walkthrough.

## iOS

Point `SupabaseConfig.swift` at the same Supabase project. For prompts, call `https://YOUR_APP.up.railway.app/api/prompts/today` with the user session cookie or Supabase JWT.
