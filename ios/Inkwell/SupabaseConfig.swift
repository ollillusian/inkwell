import Foundation

enum SupabaseConfig {
    /// Match your web `.env.local` values.
    static let url = URL(string: "https://YOUR_PROJECT.supabase.co")!
    static let anonKey = "YOUR_ANON_KEY"
}
