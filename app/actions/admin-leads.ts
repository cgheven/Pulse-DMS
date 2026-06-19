"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { unstable_cache, revalidateTag } from "next/cache";

// ── Cache tag ─────────────────────────────────────────────────────────────────

const LEADS_CACHE_TAG = "admin-dms-leads";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DmsLead = {
  id: string;
  business_name: string;
  area: string | null;
  city: string | null;
  contact_name: string;
  whatsapp_number: string;
  email: string | null;
  source: string; // 'cold_visit'|'referral'|'whatsapp'|'social_media'|'other'
  status: string; // 'new'|'contacted'|'demo_done'|'negotiating'|'won'|'lost'
  temperature: string; // 'hot'|'warm'|'cold'
  next_followup_date: string | null;
  estimated_value: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DmsLeadActivity = {
  id: string;
  lead_id: string;
  activity_type: string;
  note: string | null;
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

// ── Cached data fetch (auth-independent, 60-second TTL) ───────────────────────

const fetchLeadsData = unstable_cache(
  async (): Promise<DmsLead[]> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("dms_leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as DmsLead[];
  },
  ["admin-dms-leads"],
  { revalidate: 60, tags: [LEADS_CACHE_TAG] }
);

// ── List leads ────────────────────────────────────────────────────────────────

export async function listDmsLeads(): Promise<{
  leads?: DmsLead[];
  error?: string;
}> {
  try {
    await requireAdmin(); // security check — NOT cached
    const leads = await fetchLeadsData();
    return { leads };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list leads" };
  }
}

// ── List lead activities ──────────────────────────────────────────────────────

export async function listLeadActivities(leadId: string): Promise<{
  activities?: DmsLeadActivity[];
  error?: string;
}> {
  try {
    await requireAdmin();

    if (!leadId) throw new Error("leadId is required");

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("dms_lead_activities")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { activities: (data ?? []) as DmsLeadActivity[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list activities" };
  }
}

// ── Create lead ───────────────────────────────────────────────────────────────

export async function createDmsLead(
  data: Omit<DmsLead, "id" | "created_at" | "updated_at">
): Promise<{ leadId?: string; error?: string }> {
  try {
    const caller = await requireAdmin();

    if (!data.business_name?.trim()) {
      throw new Error("Business name is required");
    }
    if (!data.contact_name?.trim()) {
      throw new Error("Contact name is required");
    }
    if (!data.whatsapp_number?.trim()) {
      throw new Error("WhatsApp number is required");
    }

    const admin = createAdminClient();

    const { data: lead, error: leadError } = await admin
      .from("dms_leads")
      .insert({
        business_name: data.business_name.trim(),
        area: data.area ?? null,
        city: data.city ?? null,
        contact_name: data.contact_name.trim(),
        whatsapp_number: data.whatsapp_number.trim(),
        email: data.email ?? null,
        source: data.source,
        status: data.status,
        temperature: data.temperature,
        next_followup_date: data.next_followup_date ?? null,
        estimated_value: data.estimated_value ?? null,
        notes: data.notes ?? null,
        owner_id: caller.id,
      })
      .select("id")
      .single();

    if (leadError) throw leadError;

    const leadId = lead.id;

    // Insert initial activity
    const { error: activityError } = await admin
      .from("dms_lead_activities")
      .insert({
        lead_id: leadId,
        activity_type: "note",
        note: "Lead created",
        actor_id: caller.id,
      });
    if (activityError) throw activityError;

    // Invalidate leads cache so the new lead appears immediately
    revalidateTag(LEADS_CACHE_TAG);

    return { leadId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create lead" };
  }
}

// ── Update lead ───────────────────────────────────────────────────────────────

export async function updateDmsLead(
  id: string,
  data: Partial<DmsLead>
): Promise<{ error?: string }> {
  try {
    const caller = await requireAdmin();

    if (!id) throw new Error("Lead id is required");

    const admin = createAdminClient();

    // Fetch current status to detect changes
    let previousStatus: string | null = null;
    if (data.status !== undefined) {
      const { data: existing } = await admin
        .from("dms_leads")
        .select("status")
        .eq("id", id)
        .single();
      previousStatus = existing?.status ?? null;
    }

    // Build update payload — strip read-only fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, created_at: _ca, updated_at: _ua, ...updates } = data as Record<string, unknown>;

    if (Object.keys(updates).length === 0) return {};

    const { error: updateError } = await admin
      .from("dms_leads")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) throw updateError;

    // Log status change activity if status actually changed
    if (data.status !== undefined && data.status !== previousStatus) {
      const { error: activityError } = await admin
        .from("dms_lead_activities")
        .insert({
          lead_id: id,
          activity_type: "status_change",
          note: "Status changed to " + data.status,
          actor_id: caller.id,
        });
      if (activityError) throw activityError;
    }

    // Invalidate leads cache so updates are reflected immediately
    revalidateTag(LEADS_CACHE_TAG);

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update lead" };
  }
}

// ── Delete lead ───────────────────────────────────────────────────────────────

export async function deleteDmsLead(id: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();

    if (!id) throw new Error("Lead id is required");

    const admin = createAdminClient();
    const { error } = await admin.from("dms_leads").delete().eq("id", id);
    if (error) throw error;

    // Invalidate leads cache so the deleted lead disappears immediately
    revalidateTag(LEADS_CACHE_TAG);

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete lead" };
  }
}

// ── Add activity ──────────────────────────────────────────────────────────────

export async function addLeadActivity(
  leadId: string,
  data: { activity_type: string; note?: string }
): Promise<{ error?: string }> {
  try {
    const caller = await requireAdmin();

    if (!leadId) throw new Error("leadId is required");
    if (!data.activity_type?.trim()) {
      throw new Error("activity_type is required");
    }

    const admin = createAdminClient();
    const { error } = await admin.from("dms_lead_activities").insert({
      lead_id: leadId,
      activity_type: data.activity_type,
      note: data.note ?? null,
      actor_id: caller.id,
    });
    if (error) throw error;

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add activity" };
  }
}
