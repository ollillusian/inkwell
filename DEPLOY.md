# Deploy Inkwell: Railway (web) then App Store (iOS)

Order: **Railway first** (live API + web app) → **iOS app** points at that URL.

---

## Part 1 — Railway (web app)

### Prerequisites

- [GitHub](https://github.com) account  
- [Railway](https://railway.app) account  
- [Supabase](https://supabase.com) project with migrations **001–004** run  
- [OpenAI](https://platform.openai.com) API key  

### Step 1: Push code to GitHub

From `~/Documents/inkwell` (your standalone repo):

```bash
cd ~/Documents/inkwell
git add .
git commit -m "Inkwell: web app, Supabase schema, iOS scaffold"
gh repo create inkwell --private --source=. --remote=origin --push
```

(Or create an empty repo on GitHub, then `git remote add origin …` and `git push -u origin main`.)

### Step 2: Supabase (production URLs)

In Supabase → **Authentication → URL configuration**, you will set (after Railway gives you a URL):

| Field | Value |
|--------|--------|
| Site URL | `https://YOUR-SERVICE.up.railway.app` |
| Redirect URLs | `https://YOUR-SERVICE.up.railway.app/auth/callback` |

Run all SQL files in **SQL Editor** (once):

- `supabase/migrations/001_inkwell_schema.sql`
- `supabase/migrations/002_flexible_nudges.sql`
- `supabase/migrations/003_travel_daily.sql`
- `supabase/migrations/004_writing_voice_timezone.sql`

### Step 3: Create Railway project

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**  
2. Select your **inkwell** repo (not a monorepo with other projects).  
3. Open the service → **Settings → Source**  
4. Set **Root Directory** to: `web`  
5. **Settings → Build** — should detect `web/Dockerfile` (or `railway.toml`).

### Step 4: Environment variables

Service → **Variables** → add:

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` *(or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`)* |
| `OPENAI_API_KEY` | `sk-...` |
| `OPENAI_MODEL` | `gpt-4o-mini` *(optional)* |

Do **not** add database password or `sb_secret_...` here.

Railway injects `PORT` automatically.

### Step 5: Deploy and get URL

1. **Deploy** (or push to `main` to trigger deploy).  
2. **Settings → Networking → Generate domain** → e.g. `inkwell-production.up.railway.app`  
3. Put that URL in Supabase auth settings (Step 2).  
4. Redeploy once if the first build ran before variables were set.

### Step 6: Smoke test

- Open `https://YOUR-DOMAIN.up.railway.app`  
- Sign up → onboarding → write an entry  
- `/dev` is disabled in production (by design)

### Troubleshooting Railway

| Issue | Fix |
|--------|-----|
| Build fails | Root directory must be `web`; check deploy logs |
| Blank / auth broken | `NEXT_PUBLIC_*` must be set before build; redeploy after adding vars |
| Redirect loop | Supabase redirect URL must match Railway domain exactly |
| Prompts fail | Check `OPENAI_API_KEY` and Railway logs |

---

## Part 2 — App Store (iOS)

Inkwell’s **web app** can be used on iPhone today via Safari → **Add to Home Screen** (no review, uses your Railway URL).

A **native App Store app** is a separate path. Current `ios/Inkwell/` is source code, not a complete Xcode project — you need to finish the app before submission.

### What Apple requires

- **Apple Developer Program** — [developer.apple.com](https://developer.apple.com) — **$99/year**  
- **Mac with Xcode** (latest stable)  
- App **privacy policy URL** (can be a simple page on your Railway site)  
- **App icons**, screenshots (6.7", 6.5", etc.)  
- Compliance: data collection disclosure (account, journal text, OpenAI for prompts)

### Recommended path

```text
Railway live URL
    → Finish iOS app in Xcode (Supabase Swift + your API)
    → TestFlight (internal testing)
    → App Store Connect → Submit for Review
```

### Step A — Finish the native app (before App Store)

1. Xcode → **File → New → Project → App** → name `Inkwell`, bundle ID e.g. `com.yourname.inkwell`  
2. Add Swift files from `ios/Inkwell/`  
3. **File → Add Package Dependencies** → `https://github.com/supabase/supabase-swift`  
4. Wire auth + database like the web app (`SupabaseConfig.swift`)  
5. Point API base URL to `https://YOUR-SERVICE.up.railway.app` for prompts (`/api/prompts/today`)  
6. **Signing & Capabilities**: your Team, **Push Notifications** (for nudges later)  
7. Test on a real device via **Product → Run**

### Step B — TestFlight (beta)

1. [App Store Connect](https://appstoreconnect.apple.com) → **My Apps** → **+** → New App  
2. Match bundle ID, name, category (e.g. Health & Fitness or Lifestyle)  
3. Xcode → **Product → Archive** → **Distribute App** → **App Store Connect**  
4. In App Store Connect → **TestFlight** → add internal testers → install on your phone  

### Step C — App Store release

1. Fill **App Privacy** (account info, user content, possibly “other data” for prompts via OpenAI)  
2. **Screenshots** + description emphasizing: private journal, AI prompts only, you write the answers  
3. **Review notes**: explain sign-in, that journal text is not used to train models, OpenAI used only for prompt text  
4. Submit for review (often 24–48 hours, sometimes longer)

### Faster alternative: PWA on iPhone (no App Store)

1. Deploy on Railway (Part 1)  
2. iPhone Safari → your Railway URL  
3. **Share → Add to Home Screen**  
4. Allow notifications when prompted (works while installed; limited vs native push)

Good for personal use; App Store is for distributing to others.

---

## Checklist

**Railway**

- [ ] GitHub repo pushed  
- [ ] Railway root directory = `web`  
- [ ] Env vars set  
- [ ] Supabase migrations 001–004  
- [ ] Supabase redirect URLs = Railway domain  
- [ ] Sign up + write works on live URL  

**App Store (when ready)**

- [ ] Apple Developer account  
- [ ] Xcode project + Supabase Swift  
- [ ] Privacy policy URL  
- [ ] TestFlight tested  
- [ ] App Store Connect listing + submit  

---

## Custom domain (optional)

Railway → **Settings → Networking → Custom Domain** → add e.g. `inkwell.yourdomain.com` → update DNS → update Supabase redirect URLs to match.
