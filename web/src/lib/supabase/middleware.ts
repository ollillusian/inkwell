import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "./env";

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/dev") || path.startsWith("/api/dev")) {
    return NextResponse.next({ request });
  }

  if (!isSupabaseConfigured()) {
    if (path.startsWith("/app") || path.startsWith("/login")) {
      const url = request.nextUrl.clone();
      url.pathname = "/dev";
      url.searchParams.set("need", "supabase");
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuth = path.startsWith("/login") || path.startsWith("/auth");
  const isPublic = path === "/" || isAuth;

  if (!user && path.startsWith("/app")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/app")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_complete")
      .eq("id", user.id)
      .single();

    if (!profile?.onboarding_complete && path !== "/app/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/app/onboarding";
      return NextResponse.redirect(url);
    }

    if (profile?.onboarding_complete && path === "/app/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      return NextResponse.redirect(url);
    }
  }

  if (!isPublic && !user && !path.startsWith("/app")) {
    /* allow landing */
  }

  return supabaseResponse;
}
