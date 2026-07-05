import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths that shop staff (role="staff") must not access.
// Staff are only permitted to record sales at /sales.
const STAFF_BLOCKED = /^\/(dashboard|expenses|pl-report|insights|supplier-ledger|products|stock|staff|settings|riders)(\/|$)/;

// The actual gated areas of the app. Only these require a session — anything
// else (marketing pages, unknown paths, public API-style routes like
// /r/[token]'s receipt links) falls through untouched instead of being
// swept into "protected" just for not being explicitly allowlisted. This is
// additive to isPublic below, never a replacement: it only narrows when the
// login redirect fires, so it can't newly expose a real protected route.
const PROTECTED_PREFIXES = /^\/(dashboard|expenses|pl-report|products|riders|rider|sales|settings|staff|stock|supplier-ledger|insights|admin)(\/|$)/;

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");
  const isPublic =
    pathname === "/" ||
    isAuthRoute ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/verify-email") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/onboarding");

  if (!user && !isPublic && PROTECTED_PREFIXES.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Role-based path guard: shop staff may only access /sales.
  // Check runs only on paths they must not see — one DB call, no cookie needed.
  if (user && STAFF_BLOCKED.test(pathname)) {
    const { data: profile } = await supabase
      .from("dms_profiles")
      .select("role, is_rider, is_sales_rep")
      .eq("id", user.id)
      .maybeSingle();

    // Riders and platform sales-reps are never shop "staff" — they have their
    // own portals (/rider, /sales) with their own layout redirects. Skip the
    // staff bounce-to-/sales for them so it never fights with those redirects.
    if (profile?.role === "staff" && !profile.is_rider && !profile.is_sales_rep) {
      const url = request.nextUrl.clone();
      url.pathname = "/sales";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
