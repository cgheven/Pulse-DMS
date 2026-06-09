"use server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, getStaffSession } from "@/lib/data";
import { hasPermission, type PermissionKey } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { buildInvoiceDoc, formatPeriod, type InvoiceGym } from "@/lib/invoice-pdf";
import type { Payment } from "@/types";

const LINK_TTL_DAYS = 7;
const BUCKET = "invoices";

// Either the owner or a staff member with the given permission may share a receipt.
async function requireOwnerOrPermission(perm: PermissionKey) {
  const owner = await getAuthContext();
  if (owner?.user && owner.gymId && !owner.isDemo) {
    return { gymId: owner.gymId as string, user: owner.user, isOwner: true as const };
  }
  const staff = await getStaffSession();
  if (staff && hasPermission(staff.permissions, perm)) {
    return { gymId: staff.gymId, user: staff.user, isOwner: false as const };
  }
  return null;
}

// Build the app-origin (own domain) from the incoming request so the share
// link is never a raw Supabase URL. Dev (localhost) is http, everything else https.
async function appOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

interface MemberJoin {
  full_name: string;
  member_number?: string | null;
  phone?: string | null;
  plan?: { name: string } | null;
  plans?: { plan?: { name: string } | null }[] | null;
}

function derivePlanName(payment: Payment, member: MemberJoin | null): string | null {
  const breakdown = (payment as Payment & { plan_breakdown?: { name: string }[] | null }).plan_breakdown;
  if (Array.isArray(breakdown) && breakdown.length > 0) {
    return breakdown.map((p) => p.name).filter(Boolean).join(" + ") || null;
  }
  const fromJunction = (member?.plans ?? [])
    .map((r) => r.plan?.name)
    .filter((n): n is string => !!n);
  if (fromJunction.length > 0) return fromJunction.join(" + ");
  return member?.plan?.name ?? null;
}

/**
 * Generate (or refresh) a secure, time-limited share link for a payment's
 * receipt PDF. The PDF is built server-side, stored privately, and served from
 * our own domain at /r/<token>. Returns { url } valid for LINK_TTL_DAYS.
 */
export async function createInvoiceLink(
  paymentId: string,
): Promise<{ url: string } | { error: string }> {
  const ctx =
    (await requireOwnerOrPermission("payments.view")) ??
    (await requireOwnerOrPermission("payments.create"));
  if (!ctx) return { error: "Unauthorized" };

  if (typeof paymentId !== "string" || !/^[0-9a-f-]{36}$/i.test(paymentId)) {
    return { error: "Invalid payment" };
  }

  const admin = createAdminClient();

  // Tenant-scoped fetch — the payment must belong to the caller's gym.
  const { data: payment, error: payErr } = await admin
    .from("pulse_payments")
    .select(
      "*, member:pulse_members(full_name, member_number, phone, plan:pulse_membership_plans(name), plans:pulse_member_plans(plan:pulse_membership_plans(name)))",
    )
    .eq("id", paymentId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (payErr || !payment) return { error: "Receipt not found" };

  const member = (payment as unknown as { member: MemberJoin | null }).member;
  const memberName = member?.full_name ?? "Member";
  const memberNumber = member?.member_number ?? null;
  const memberPhone = member?.phone ?? null;
  const planName = derivePlanName(payment as Payment, member);

  const { data: gym } = await admin
    .from("pulse_gyms")
    .select("name,address,city,phone,email,ntn,report_settings")
    .eq("id", ctx.gymId)
    .single();

  // Generate the PDF server-side (byte-identical to the on-screen preview).
  let bytes: Buffer;
  try {
    const doc = await buildInvoiceDoc(
      { payment: payment as Payment, memberName, memberPhone, memberNumber, planName },
      (gym as InvoiceGym | null) ?? null,
      formatPeriod((payment as Payment).for_period),
    );
    bytes = Buffer.from(doc.output("arraybuffer"));
  } catch (e) {
    console.error("[createInvoiceLink] PDF generation failed:", (e as Error).message);
    return { error: "Could not generate the receipt. Please try again." };
  }

  // Deterministic path → at most one file per payment (re-sends overwrite it).
  const storagePath = `${ctx.gymId}/${paymentId}.pdf`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
  if (upErr) {
    console.error("[createInvoiceLink] storage upload failed:", upErr.message);
    return { error: "Could not store the receipt. Please try again." };
  }

  const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 86400_000).toISOString();

  // One link row per payment (unique payment_id). A single upsert keeps the same
  // token across re-sends — id/created_at are untouched on conflict, only the
  // path + expiry refresh — and avoids a select-then-write race.
  const { data: link, error: linkErr } = await admin
    .from("pulse_invoice_links")
    .upsert(
      { gym_id: ctx.gymId, payment_id: paymentId, storage_path: storagePath, expires_at: expiresAt },
      { onConflict: "payment_id" },
    )
    .select("id")
    .single();
  if (linkErr || !link) {
    console.error("[createInvoiceLink] link upsert failed:", linkErr?.message);
    return { error: "Could not create the receipt link. Please try again." };
  }
  const token = link.id as string;

  await writeAuditLog({
    actor_id: ctx.user.id,
    actor_email: ctx.user.email ?? "",
    action: "invoice.share_link",
    entity: "payment",
    entity_id: paymentId,
    meta: { member_name: memberName, expires_at: expiresAt, by_role: ctx.isOwner ? "owner" : "staff" },
  });

  // Best-effort cleanup of this gym's expired links + their files. Bounded and
  // non-blocking (its own try/catch) — keeps storage/table tidy without a cron job.
  void purgeExpired(admin, ctx.gymId);

  const origin = await appOrigin();
  if (!origin) return { error: "Could not resolve app URL" };
  return { url: `${origin}/r/${token}` };
}

async function purgeExpired(admin: ReturnType<typeof createAdminClient>, gymId: string) {
  try {
    const { data: stale } = await admin
      .from("pulse_invoice_links")
      .select("id, storage_path")
      .eq("gym_id", gymId)
      .lt("expires_at", new Date().toISOString())
      .limit(50);
    if (!stale?.length) return;
    await admin.storage.from(BUCKET).remove(stale.map((s) => s.storage_path as string));
    await admin.from("pulse_invoice_links").delete().in("id", stale.map((s) => s.id));
  } catch {
    /* best-effort */
  }
}
