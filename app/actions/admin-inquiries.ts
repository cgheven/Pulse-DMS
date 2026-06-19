"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { isUUID } from "@/lib/utils";

const INQUIRIES_CACHE_TAG = "admin-dms-inquiries";
const LEADS_CACHE_TAG = "admin-dms-leads";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DmsInquiry = {
  id: string;
  contact_name: string;
  shop_name: string;
  city: string | null;
  phone: string;
  whatsapp: string | null;
  plan_interest: string | null;
  num_branches: number | null;
  message: string | null;
  status: string; // 'new' | 'converted' | 'dismissed'
  converted_lead_id: string | null;
  converted_at: string | null;
  created_at: string;
};

// ── Admin guard (never cached) ────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("dms_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) throw new Error("Forbidden: admin access required");
  return user;
}

// ── Cached fetch ──────────────────────────────────────────────────────────────

const fetchInquiriesData = unstable_cache(
  async (): Promise<DmsInquiry[]> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("dms_inquiries")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as DmsInquiry[];
  },
  ["admin-dms-inquiries"],
  { revalidate: 60, tags: [INQUIRIES_CACHE_TAG] }
);

// ── List inquiries ────────────────────────────────────────────────────────────

export async function listDmsInquiries(): Promise<{
  inquiries?: DmsInquiry[];
  error?: string;
}> {
  try {
    await requireAdmin();
    const inquiries = await fetchInquiriesData();
    return { inquiries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load inquiries" };
  }
}

// ── Convert inquiry → lead ────────────────────────────────────────────────────

export async function convertInquiryToLead(
  inquiryId: string
): Promise<{ leadId?: string; error?: string }> {
  try {
    if (!isUUID(inquiryId)) throw new Error("Invalid inquiry ID");

    const caller = await requireAdmin();

    const admin = createAdminClient();

    const { data: inquiry, error: fetchErr } = await admin
      .from("dms_inquiries")
      .select("*")
      .eq("id", inquiryId)
      .single();

    if (fetchErr || !inquiry) throw new Error("Inquiry not found");
    if (inquiry.status === "converted") throw new Error("Already converted");

    // Map inquiry → lead fields
    const whatsapp = inquiry.whatsapp?.trim() || inquiry.phone?.trim() || "";
    const notes = [
      inquiry.plan_interest ? `Plan interest: ${inquiry.plan_interest}` : null,
      inquiry.num_branches ? `Branches: ${inquiry.num_branches}` : null,
      inquiry.message?.trim() || null,
    ]
      .filter(Boolean)
      .join("\n");

    const { data: lead, error: leadErr } = await admin
      .from("dms_leads")
      .insert({
        business_name: inquiry.shop_name,
        contact_name: inquiry.contact_name,
        whatsapp_number: whatsapp,
        city: inquiry.city ?? null,
        source: "website",
        status: "new",
        temperature: "warm",
        notes: notes || null,
        owner_id: caller.id,
      })
      .select("id")
      .single();

    if (leadErr) throw leadErr;

    // Log initial activity
    await admin.from("dms_lead_activities").insert({
      lead_id: lead.id,
      activity_type: "note",
      note: "Lead created from website inquiry",
      actor_id: caller.id,
    });

    // Mark inquiry as converted
    await admin
      .from("dms_inquiries")
      .update({
        status: "converted",
        converted_lead_id: lead.id,
        converted_at: new Date().toISOString(),
      })
      .eq("id", inquiryId);

    revalidateTag(INQUIRIES_CACHE_TAG);
    revalidateTag(LEADS_CACHE_TAG);

    return { leadId: lead.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to convert inquiry" };
  }
}

// ── Dismiss inquiry ───────────────────────────────────────────────────────────

export async function dismissInquiry(
  inquiryId: string
): Promise<{ error?: string }> {
  try {
    if (!isUUID(inquiryId)) throw new Error("Invalid inquiry ID");

    await requireAdmin();

    const admin = createAdminClient();
    const { error } = await admin
      .from("dms_inquiries")
      .update({ status: "dismissed" })
      .eq("id", inquiryId);

    if (error) throw error;

    revalidateTag(INQUIRIES_CACHE_TAG);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to dismiss inquiry" };
  }
}
