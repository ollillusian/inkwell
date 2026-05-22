"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const nav = [
  { href: "/app", label: "Today" },
  { href: "/app/journal", label: "Journal" },
  { href: "/app/settings", label: "Settings" },
];

function mainMaxWidth(pathname: string): string {
  if (pathname.startsWith("/app/journal")) {
    return "max-w-2xl";
  }
  return "max-w-lg";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const mainWidth = mainMaxWidth(pathname);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-full flex flex-col bg-ink-bg text-ink-fg">
      <header className="sticky top-0 z-10 border-b border-ink-border/50 bg-ink-bg/90 backdrop-blur-md">
        <div
          className={`mx-auto flex w-full min-w-0 ${mainWidth} items-center justify-between px-4 sm:px-5 py-4`}
        >
          <Link href="/app" className="font-serif text-xl tracking-tight">
            Inkwell
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="text-sm text-ink-muted hover:text-ink-fg transition-colors"
          >
            Sign out
          </button>
        </div>
        <nav
          className={`mx-auto flex w-full min-w-0 ${mainWidth} gap-1 px-4 sm:px-5 pb-3`}
        >
          {nav.map((item) => {
            const active =
              item.href === "/app"
                ? pathname === "/app" || pathname === "/app/write"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-ink-accent/15 text-ink-accent"
                    : "text-ink-muted hover:text-ink-fg"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main
        className={`flex-1 mx-auto w-full min-w-0 ${mainWidth} px-4 sm:px-5 py-8`}
      >
        {children}
      </main>
    </div>
  );
}
