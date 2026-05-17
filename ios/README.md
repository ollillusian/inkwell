# Inkwell iOS

## Setup in Xcode

1. **File → New → Project → App** (or open these sources in a new App target named `Inkwell`).
2. Drag all `.swift` files from `Inkwell/` into the target.
3. **File → Add Package Dependencies** → `https://github.com/supabase/supabase-swift`
4. Update `SupabaseConfig.swift` with your project URL and anon key (same as web).
5. Replace the placeholder `SessionStore.signIn` with `supabase.auth.signIn`.
6. **Signing & Capabilities** → add **Push Notifications** when you wire APNs for true background buzzes.

## Local notifications

Request permission on onboarding completion, then schedule `UNCalendarNotificationTrigger` for morning/midday/evening using profile times from Supabase — mirror `web/src/lib/notifications.ts`.

## Design

Matches web: warm cream background (`Theme.swift`), serif headlines, clay accent. Fetch prompts from `GET /api/prompts/today` on your deployed web app (authenticated).
