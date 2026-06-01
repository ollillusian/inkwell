# Inkwell nudges (Web Push)

Nudges need three pieces: **browser permission**, **server push**, and a **minute cron**.

## 1. Supabase

Run in SQL editor:

- `supabase/migrations/008_push_subscriptions.sql`

## 2. VAPID keys (one-time)

From `web/`:

```bash
npm run vapid:keys
```

Copy into `web/.env.local` and Railway variables:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
SUPABASE_SERVICE_ROLE_KEY=...   # Supabase → Settings → API → service_role
CRON_SECRET=...                 # any long random string
```

Restart `npm run dev` after changing env.

## 3. Cron (every minute)

Production (Railway or similar) must call:

```http
GET https://YOUR_APP_URL/api/cron/send-nudges
Authorization: Bearer YOUR_CRON_SECRET
```

### Railway

1. Same service as the web app, or a separate **Cron** service.
2. Schedule: `* * * * *` (every minute).
3. Command / HTTP:
   - Method: GET
   - URL: `https://$RAILWAY_PUBLIC_DOMAIN/api/cron/send-nudges`
   - Header: `Authorization: Bearer ${{CRON_SECRET}}`

### Local test

With dev server on port 3001:

```bash
npm run cron:nudges
```

Expect JSON like `{ "ok": true, "checked": 0, "sent": 0 }` (non-zero only when a nudge fires this minute).

## 4. On your phone

1. Log in → **Settings** → enable **Reminders** → **Save**.
2. Allow notifications when prompted.
3. **Install the app**:
   - **iPhone (iOS 16.4+)**: Safari → Share → **Add to Home Screen**. Open from home screen, not a regular Safari tab.
   - **Android**: Chrome menu → **Install app** / Add to Home screen.
4. Open the installed app once so push subscription saves.

## 5. Verify

1. Settings should show: “Push enabled…”
2. Supabase **Table Editor** → `push_subscriptions` should have a row for your user.
3. At your nudge time (profile timezone), you should get a notification even if the app is closed.

### Still only works when the app is open?

- VAPID keys or `CRON_SECRET` missing on the server
- Cron not running
- Migration `008` not applied
- iOS: not using the **home screen** PWA (Safari tabs do not get background push)

### Fallback

While Inkwell is open in a tab, local reminders still fire (improved). Push is what makes it work when closed.
