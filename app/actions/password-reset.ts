"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPasswordResetEmail } from "@/lib/email";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function getClientIp(): Promise<string> {
  const headersList = await headers();
  // Finding 3 fix: X-Forwarded-For is client-controlled. An attacker can set an
  // arbitrary leftmost value, which .split(",")[0] would read, bypassing IP rate
  // limits entirely. The rightmost value is appended by OUR infrastructure (Vercel /
  // Cloudflare) and cannot be spoofed by the client. Use that instead.
  // x-real-ip is set by the proxy to the true socket IP and is equally safe when
  // the proxy strips any client-supplied copy of the header.
  const xff = headersList.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    const trustedIp = parts[parts.length - 1].trim();
    if (trustedIp) return trustedIp;
  }
  return headersList.get("x-real-ip") ?? "unknown";
}

export async function sendPasswordReset(
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const rawEmail = (formData.get("email") as string | null) ?? "";
    const email = rawEmail.trim().toLowerCase();

    if (!isValidEmail(email)) {
      return { error: "Please enter a valid email address." };
    }

    // Silently succeed for staff synthetic emails — never reveal they exist
    if (email.includes("@dms.staff.local")) {
      return {};
    }

    const ipAddress = await getClientIp();
    const admin = createAdminClient();

    // Finding 5 fix: replace the previous non-atomic SELECT-count → check → INSERT
    // sequence with a single SERIALIZABLE transaction executed inside a Postgres
    // function. The old approach had a TOCTOU race: concurrent requests all read
    // count=0 before any INSERT committed, so all passed the gate and all generated
    // valid reset tokens. The DB function inserts the row first, then counts within
    // the same transaction, so the limit is enforced atomically. If the limit is
    // exceeded the function raises 'email_rate_limit' or 'ip_rate_limit' and rolls
    // back the insert, leaving no phantom row in the log.
    const { error: rateLimitError } = await admin.rpc(
      "check_and_log_password_reset",
      { p_email: email, p_ip: ipAddress }
    );

    if (rateLimitError) {
      // The Postgres function raises named exceptions; the message is the exception
      // name (e.g. "email_rate_limit"). Surface a user-friendly message; never leak
      // the raw DB error string to the client.
      const msg = rateLimitError.message ?? "";
      if (msg.includes("email_rate_limit")) {
        return { error: "Too many reset attempts. Please wait before trying again." };
      }
      if (msg.includes("ip_rate_limit")) {
        return { error: "Too many attempts from your location. Please try again later." };
      }
      // Any other DB error (connection failure, etc.) — fail safely.
      console.error("[sendPasswordReset] Rate limit DB error:", rateLimitError);
      return { error: "Something went wrong. Please try again." };
    }

    // Finding 12 fix: a missing NEXT_PUBLIC_SITE_URL would silently fall back to
    // http://localhost:3000, embedding a localhost URL in the recovery token. Users
    // clicking the link would be redirected to localhost (a DoS for all prod resets).
    // Throw loudly at runtime so the misconfiguration is caught immediately.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {
      console.error("[sendPasswordReset] NEXT_PUBLIC_SITE_URL is not configured");
      return { error: "Server configuration error. Please contact support." };
    }
    const redirectTo = `${siteUrl}/auth/callback?next=/reset-password`;

    // Finding 6 fix: enforce a constant minimum response time so that a timing
    // oracle cannot distinguish existing users (generateLink succeeds + email sent,
    // ~200-400 ms extra) from non-existing users (generateLink fails immediately).
    // Both code paths wait at least MIN_RESPONSE_MS before returning.
    const MIN_RESPONSE_MS = 600;
    const responseStart = Date.now();

    // generateLink returns an error if the user doesn't exist —
    // we swallow it and return success to avoid email enumeration.
    const { data, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (!linkError && data?.properties?.action_link) {
      // Send via Resend — don't reveal email-send failures to caller
      sendPasswordResetEmail(email, data.properties.action_link).catch((err) => {
        console.error("[sendPasswordReset] Email error:", err);
      });
    }
    // User not found or Supabase error — fall through to constant-time return.

    // Pad to the minimum response time so both branches take the same wall-clock time.
    const elapsed = Date.now() - responseStart;
    if (elapsed < MIN_RESPONSE_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
    }

    return {};
  } catch (err) {
    console.error("[sendPasswordReset] Unexpected error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}
