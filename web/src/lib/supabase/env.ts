/**
 * Supabase API keys (2025+):
 * - Publishable: sb_publishable_... (use in browser / Next.js — preferred)
 * - Legacy anon: eyJ... JWT (still works; being phased out)
 *
 * @see https://supabase.com/docs/guides/getting-started/api-keys
 */
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
}

/** Client-safe key: publishable (new) or anon (legacy). */
export function getSupabasePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    ""
  );
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  return (
    url.length > 0 &&
    key.length > 0 &&
    !url.includes("your-project") &&
    !key.includes("your-anon") &&
    key !== "your-publishable-key"
  );
}
