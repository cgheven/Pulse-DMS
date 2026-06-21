"use server";

import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { headers, cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOTPEmail, sendWelcomeEmail } from "@/lib/email";

// ---------------------------------------------------------------------------
// Startup validation — fail loudly if key material is wrong (Finding 11)
// ---------------------------------------------------------------------------

function validateEncryptionKey(): void {
  const key = process.env.REGISTRATION_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(
      "REGISTRATION_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        "Generate one with: openssl rand -hex 32"
    );
  }
  const hmacKey = process.env.OTP_HMAC_KEY;
  if (!hmacKey || hmacKey.length < 32) {
    throw new Error(
      "OTP_HMAC_KEY must be at least 32 characters. " +
        "Generate one with: openssl rand -hex 32"
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const key = process.env.REGISTRATION_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error("REGISTRATION_ENCRYPTION_KEY is invalid or missing.");
  }
  return Buffer.from(key, "hex");
}

function getHmacKey(): string {
  const key = process.env.OTP_HMAC_KEY;
  if (!key || key.length < 32) {
    throw new Error("OTP_HMAC_KEY is invalid or missing.");
  }
  return key;
}

// Finding 12 fix: rejection-sampling OTP generation (eliminates modulo bias)
function generateOTP(): string {
  const limit = 1_000_000;
  const maxValid = Math.floor(0x100000000 / limit) * limit;
  let val: number;
  do {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    val = arr[0];
  } while (val >= maxValid);
  return (val % limit).toString().padStart(6, "0");
}

// Finding 3 fix: HMAC-SHA256 with a random per-record nonce instead of
// SHA-256 with a static salt derived from the encryption key.
function hashOTP(otp: string, nonce: string): string {
  return createHmac("sha256", getHmacKey()).update(otp + nonce).digest("hex");
}

function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

function encryptPassword(password: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptPassword(stored: string): string {
  const [ivHex, authTagHex, encryptedHex] = stored.split(":");
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// Finding 1 fix: extract real client IP server-side — never accept it from the caller.
async function getClientIp(): Promise<string> {
  const headersList = await headers();
  return (
    headersList.get("x-forwarded-for")?.split(",")[0].trim() ??
    headersList.get("x-real-ip") ??
    "unknown"
  );
}

// ---------------------------------------------------------------------------
// 1. initiateRegistration
// ---------------------------------------------------------------------------

// Finding 1 fix: ipAddress parameter removed — extracted server-side.
// Finding 4 fix: sessionToken is no longer returned to the client; it is
//   stored in an HttpOnly cookie so it never appears in the URL.
export async function initiateRegistration(
  formData: FormData
): Promise<{ success?: boolean; error?: string }> {
  try {
    // Finding 11: validate key material at action runtime
    validateEncryptionKey();

    // Extract and sanitise
    const rawEmail = (formData.get("email") as string | null) ?? "";
    // Email normalisation: always lowercase + trim before any lookup
    const email = rawEmail.trim().toLowerCase();
    const fullName = ((formData.get("fullName") as string | null) ?? "").trim();
    const shopName = ((formData.get("shopName") as string | null) ?? "").trim();
    const password = (formData.get("password") as string | null) ?? "";

    // Validation
    if (!isValidEmail(email)) {
      return { error: "Please enter a valid email address." };
    }
    if (email.includes("@dms.staff.local")) {
      return { error: "This email domain is not allowed for self-registration." };
    }
    if (fullName.length < 2 || fullName.length > 100) {
      return { error: "Full name must be between 2 and 100 characters." };
    }
    if (shopName.length < 2 || shopName.length > 100) {
      return { error: "Shop name must be between 2 and 100 characters." };
    }
    if (password.length < 8 || password.length > 72) {
      return { error: "Password must be between 8 and 72 characters." };
    }

    // Finding 1 fix: extract IP server-side
    const ipAddress = await getClientIp();

    const admin = createAdminClient();

    // Generate OTP, nonce, hash, and session token
    const otp = generateOTP();
    const nonce = generateNonce();
    const otp_hash = hashOTP(otp, nonce);
    const session_token = randomBytes(32).toString("hex");
    const encrypted_password = encryptPassword(password);
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Race condition fix (Finding 10): rate check + delete + insert are performed
    // atomically inside a Postgres function that holds pg_advisory_xact_lock(hashtext(email)).
    // Concurrent requests for the same email serialize at the DB level — no TOCTOU window.
    const { data: rpcResult, error: rpcError } = await admin.rpc(
      "initiate_registration_otp",
      {
        p_session_token: session_token,
        p_email: email,
        p_full_name: fullName,
        p_shop_name: shopName,
        p_encrypted_password: encrypted_password,
        p_otp_hash: otp_hash,
        p_otp_nonce: nonce,
        p_expires_at: expires_at,
        p_ip_address: ipAddress,
      }
    );

    if (rpcError) {
      console.error("[initiateRegistration] RPC error:", rpcError);
      return { error: "Something went wrong. Please try again." };
    }

    const result = rpcResult as { success?: boolean; error?: string } | null;
    if (result?.error) {
      return { error: result.error };
    }
    if (!result?.success) {
      return { error: "Something went wrong. Please try again." };
    }

    // Send OTP email
    try {
      await sendOTPEmail(email, otp, fullName);
    } catch (emailErr) {
      console.error("[initiateRegistration] Email send error:", emailErr);
      // Clean up the record so the user can try again
      await admin.from("dms_registration_otps").delete().eq("session_token", session_token);
      return { error: "Failed to send verification email. Please try again." };
    }

    // Finding 4 fix: store session token in HttpOnly cookie — never in URL
    const cookieStore = await cookies();
    cookieStore.set("reg_session", session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 10 * 60, // 10 minutes, matches OTP expiry
      path: "/",
    });

    return { success: true };
  } catch (err) {
    console.error("[initiateRegistration] Unexpected error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// 2. verifyRegistrationOTP
// ---------------------------------------------------------------------------

// Finding 4 fix: sessionToken is read from the HttpOnly cookie server-side,
//   not accepted as a parameter from the client.
export async function verifyRegistrationOTP(
  otp: string
): Promise<{ success?: boolean; email?: string; error?: string }> {
  try {
    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      return { error: "Invalid verification code." };
    }

    // Finding 4 fix: read session token from HttpOnly cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("reg_session")?.value ?? "";

    if (!/^[0-9a-f]{64}$/.test(sessionToken)) {
      return { error: "Invalid or expired session. Please register again." };
    }

    const admin = createAdminClient();

    // Fetch OTP record
    const { data: record, error: fetchError } = await admin
      .from("dms_registration_otps")
      .select("*")
      .eq("session_token", sessionToken)
      .single();

    if (fetchError || !record) {
      return { error: "Invalid or expired code." };
    }

    // Check expiry
    if (new Date(record.expires_at) < new Date()) {
      await admin.from("dms_registration_otps").delete().eq("session_token", sessionToken);
      cookieStore.delete("reg_session");
      return { error: "Code has expired. Please register again." };
    }

    // Check attempts
    if ((record.attempts ?? 0) >= 5) {
      await admin.from("dms_registration_otps").delete().eq("session_token", sessionToken);
      cookieStore.delete("reg_session");
      return { error: "Too many failed attempts. Please register again." };
    }

    // Finding 3 fix: verify OTP using HMAC with per-record nonce + timing-safe comparison
    const nonce = record.otp_nonce as string;
    const submittedHash = hashOTP(otp, nonce);
    const storedHash = record.otp_hash as string;

    // Both hashes are 64-char hex strings so lengths are always equal
    const hashesMatch = timingSafeEqual(
      Buffer.from(submittedHash, "hex"),
      Buffer.from(storedHash, "hex")
    );

    if (!hashesMatch) {
      const newAttempts = (record.attempts ?? 0) + 1;
      await admin
        .from("dms_registration_otps")
        .update({ attempts: newAttempts })
        .eq("session_token", sessionToken);
      const remaining = 5 - newAttempts;
      return { error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` };
    }

    // OTP matched — decrypt password
    const password = decryptPassword(record.encrypted_password as string);
    const email = record.email as string;
    const fullName = record.full_name as string;
    const shopName = record.shop_name as string;

    // Create Supabase auth user
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      const msg = authError.message?.toLowerCase() ?? "";
      if (msg.includes("already registered") || msg.includes("already been registered")) {
        return { error: "An account with this email already exists. Please sign in." };
      }
      console.error("[verifyRegistrationOTP] createUser error:", authError);
      return { error: "Failed to create account. Please try again." };
    }

    const userId = authData.user.id;
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Create shop
    const { data: shopData, error: shopError } = await admin
      .from("dms_shops")
      .insert({
        owner_id: userId,
        shop_name: shopName,
        trial_plan: "14_day",
        trial_ends_at: trialEndsAt,
        branch_limit: 1,
        is_active: true,
      })
      .select("id")
      .single();

    if (shopError || !shopData) {
      console.error("[verifyRegistrationOTP] shop insert error:", shopError);
      // Rollback: delete auth user to keep things consistent
      await admin.auth.admin.deleteUser(userId);
      return { error: "Failed to create shop. Please try again." };
    }

    const shopId = shopData.id;

    // Finding 9 fix: treat branch insert failure as fatal — roll back everything
    const { error: branchError } = await admin.from("dms_branches").insert({
      shop_id: shopId,
      name: shopName,
      is_default: true,
      is_active: true,
    });

    if (branchError) {
      console.error("[verifyRegistrationOTP] branch insert error:", branchError);
      // Rollback both auth user and shop
      await admin.auth.admin.deleteUser(userId);
      await admin.from("dms_shops").delete().eq("id", shopId);
      return { error: "Failed to initialize account. Please try again." };
    }

    // Update profile (created automatically by Supabase trigger on auth.users)
    const { error: profileError } = await admin
      .from("dms_profiles")
      .update({ full_name: fullName, role: "owner", shop_id: shopId })
      .eq("id", userId);

    if (profileError) {
      console.error("[verifyRegistrationOTP] profile update error:", profileError);
      // Rollback — profile without role/shop_id would leave the account in a broken state
      await admin.auth.admin.deleteUser(userId);
      await admin.from("dms_shops").delete().eq("id", shopId);
      return { error: "Failed to set up account profile. Please try again." };
    }

    // Delete OTP record and clear the session cookie
    await admin.from("dms_registration_otps").delete().eq("session_token", sessionToken);
    cookieStore.delete("reg_session");

    // Send welcome email (non-blocking)
    try {
      sendWelcomeEmail(email, fullName, shopName, new Date(trialEndsAt)).catch((err) => {
        console.error("[verifyRegistrationOTP] Welcome email error:", err);
      });
    } catch {
      // Swallow synchronous errors too
    }

    return { success: true, email };
  } catch (err) {
    console.error("[verifyRegistrationOTP] Unexpected error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// 3. resendRegistrationOTP
// ---------------------------------------------------------------------------

// Finding 1 fix: ipAddress parameter removed — extracted server-side.
// Finding 2 fix: attempts are NOT reset on resend; resend_count hard-capped at 3;
//   server-side 60-second cooldown via last_resend_at.
// Finding 5 fix: all rate limiting is now enforced server-side.
export async function resendRegistrationOTP(): Promise<{ error?: string }> {
  try {
    // Finding 4 fix: read session token from HttpOnly cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("reg_session")?.value ?? "";

    if (!/^[0-9a-f]{64}$/.test(sessionToken)) {
      return { error: "Session expired. Please register again." };
    }

    const admin = createAdminClient();

    // Fetch existing OTP record
    const { data: record, error: fetchError } = await admin
      .from("dms_registration_otps")
      .select("*")
      .eq("session_token", sessionToken)
      .single();

    if (fetchError || !record) {
      return { error: "Session expired. Please register again." };
    }

    // Check expiry
    if (new Date(record.expires_at) < new Date()) {
      cookieStore.delete("reg_session");
      return { error: "Session expired. Please register again." };
    }

    // Finding 5 + 2 fix: server-side 60-second cooldown between resends
    if (record.last_resend_at) {
      const secondsSinceLastResend =
        (Date.now() - new Date(record.last_resend_at as string).getTime()) / 1000;
      if (secondsSinceLastResend < 60) {
        const waitSeconds = Math.ceil(60 - secondsSinceLastResend);
        return { error: `Please wait ${waitSeconds} second${waitSeconds === 1 ? "" : "s"} before requesting another code.` };
      }
    }

    // Finding 2 + 5 fix: hard cap on total resends per session
    if ((record.resend_count ?? 0) >= 3) {
      return { error: "Maximum resend limit reached. Please start registration again." };
    }

    const email = record.email as string;
    const fullName = record.full_name as string;

    // Generate new OTP and nonce; do NOT reset attempts (Finding 2 fix)
    const otp = generateOTP();
    const nonce = generateNonce();
    const otp_hash = hashOTP(otp, nonce);
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const last_resend_at = new Date().toISOString();
    const resend_count = (record.resend_count ?? 0) + 1;

    const { error: updateError } = await admin
      .from("dms_registration_otps")
      .update({
        otp_hash,
        otp_nonce: nonce,
        expires_at,
        last_resend_at,
        resend_count,
        // attempts is intentionally NOT reset here (Finding 2 fix)
      })
      .eq("session_token", sessionToken);

    if (updateError) {
      console.error("[resendRegistrationOTP] DB update error:", updateError);
      return { error: "Something went wrong. Please try again." };
    }

    // Resend email
    try {
      await sendOTPEmail(email, otp, fullName);
    } catch (emailErr) {
      console.error("[resendRegistrationOTP] Email send error:", emailErr);
      return { error: "Failed to send verification email. Please try again." };
    }

    return {};
  } catch (err) {
    console.error("[resendRegistrationOTP] Unexpected error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}
