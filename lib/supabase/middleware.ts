import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          );
        },
      },
    }
  );

  // getUser() validates the token with Supabase's auth server and refreshes it if needed.
  // This correctly handles deleted users — if the auth account was removed the token is
  // rejected, Supabase SSR clears the stale cookies, and routing treats them as logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");
  // Finding 7 fix: /register and /verify-email must be public so unauthenticated
  // users can access the registration flow without being redirected to /login.
  // Finding 4 fix: /forgot-password, /reset-password, and /auth/callback must be
  // public. Without these entries an unauthenticated user clicking a password-reset
  // link hits /auth/callback → middleware redirects to /login before the code
  // exchange can happen, breaking the entire reset flow.
  const isPublic =
    isAuthRoute ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/verify-email") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/find") ||
    pathname.startsWith("/research") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/onboarding");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
