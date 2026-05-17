"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      setLoading(false);
      if (error) setMessage(error.message);
      else setMessage("Check your email to confirm your account.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setMessage(error.message);
    else window.location.href = "/app";
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
      <div>
        <label htmlFor="email" className="block text-sm text-ink-muted mb-1.5">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-ink-border bg-ink-surface px-4 py-3 text-ink-fg placeholder:text-ink-muted/50 focus:outline-none focus:ring-2 focus:ring-ink-accent/40"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm text-ink-muted mb-1.5">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-ink-border bg-ink-surface px-4 py-3 text-ink-fg placeholder:text-ink-muted/50 focus:outline-none focus:ring-2 focus:ring-ink-accent/40"
          placeholder="••••••••"
        />
      </div>
      {message && (
        <p className="text-sm text-ink-accent" role="alert">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-ink-fg text-ink-bg py-3.5 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      <button
        type="button"
        className="w-full text-sm text-ink-muted hover:text-ink-fg"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin"
          ? "New here? Create an account"
          : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
