"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function leadsTag(userId: string) { return `leads:${userId}`; }

export type LeadStatus =
  | "new"
  | "contacted"
  | "demo_given"
  | "follow_up"
  | "negotiating"
  | "payment_pending"
  | "payment_received"
  | "onboarding"
  | "active"
  | "lost";

// Mirrors actual dms_leads columns
export type Lead = {
  id: string;
  business_name: string;        // actual column name
  contact_name: string;
  whatsapp_number: string;      // actual column name (was contact_phone)
  email: string | null;         // actual column name (was contact_email)
  area: string | null;
  city: string | null;
  status: LeadStatus;
  source: string | null;
  notes: string | null;
  next_followup_date: string | null;  // actual column name (was follow_up_date)
  lost_reason: string | null;
  payment_amount: number | null;
  payment_method: string | null;
  assigned_to: string | null;
  team_id: string | null;
  created_at: string;
  updated_at: string;
};

// Mirrors actual dms_lead_activities columns
export type LeadActivity = {
  id: string;
  lead_id: string;
  activity_type: string;
  note: string | null;          // actual column name (was notes)
  scheduled_at: string | null;
  created_at: string;
  actor_id: string | null;      // actual column name (was created_by)
};

export type SalesRepStats = {
  calls_today: number;
  calls_week: number;
  whatsapp_today: number;
  whatsapp_week: number;
  followups_today: number;
  total_leads: number;
  active_leads: number;
  won_this_month: number;
  lost_this_month: number;
  pipeline_by_stage: Record<string, number>;
};

async function requireSalesRep() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("dms_profiles")
    .select("is_sales_rep, is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_sales_rep && !profile?.is_admin) {
    throw new Error("Forbidden: sales rep access required");
  }

  return user;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Matches dms_lead_source enum values in DB
const VALID_SOURCES = ["cold_visit", "whatsapp", "referral", "social_media", "other", ""];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// Field length limits
const MAX_BUSINESS_NAME = 200;
const MAX_CONTACT_NAME  = 200;
const MAX_PHONE         = 30;
const MAX_EMAIL         = 254;
const MAX_CITY          = 100;
const MAX_NOTES         = 5000;
const MAX_ACTIVITY_NOTE = 2000;
const MAX_LOST_REASON   = 1000;

async function verifyLeadOwnership(leadId: string, userId: string): Promise<void> {
  if (!UUID_RE.test(leadId)) throw new Error("Lead not found");
  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("dms_leads")
    .select("assigned_to")
    .eq("id", leadId)
    .single();

  // Uniform error for both missing and unowned leads — prevents existence oracle
  if (!lead || lead.assigned_to !== userId) throw new Error("Lead not found");
}

export async function getMyStats(): Promise<{ stats: SalesRepStats | null; error?: string }> {
  try {
    const user = await requireSalesRep();
    const admin = createAdminClient();

    const fetch = unstable_cache(
      async () => {
        const { data, error } = await admin.rpc("get_sales_rep_stats", { p_user_id: user.id });
        if (error) throw error;
        return data as SalesRepStats;
      },
      [`stats-${user.id}`],
      { tags: [leadsTag(user.id)], revalidate: 60 }
    );

    return { stats: await fetch() };
  } catch (err) {
    return { stats: null, error: err instanceof Error ? err.message : "Failed to load stats" };
  }
}

export async function getMyLeads(filters?: {
  status?: LeadStatus;
  search?: string;
}): Promise<{ leads: Lead[]; error?: string }> {
  try {
    const user = await requireSalesRep();
    const admin = createAdminClient();

    // Cache the base (unfiltered) list — search/status filters applied client-side
    const fetchAll = unstable_cache(
      async () => {
        const { data, error } = await admin
          .from("dms_leads")
          .select("*")
          .eq("assigned_to", user.id)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as Lead[];
      },
      [`leads-all-${user.id}`],
      { tags: [leadsTag(user.id)], revalidate: 30 }
    );

    let leads = await fetchAll();

    // Apply any server-side filters on top of the cached set
    if (filters?.status) leads = leads.filter(l => l.status === filters.status);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      leads = leads.filter(l =>
        l.business_name.toLowerCase().includes(q) ||
        l.contact_name.toLowerCase().includes(q) ||
        l.whatsapp_number.includes(q)
      );
    }

    return { leads };
  } catch (err) {
    return { leads: [], error: err instanceof Error ? err.message : "Failed to load leads" };
  }
}

export async function getLeadDetail(
  leadId: string
): Promise<{ lead: Lead | null; activities: LeadActivity[]; error?: string }> {
  try {
    const user = await requireSalesRep();
    await verifyLeadOwnership(leadId, user.id);

    const admin = createAdminClient();
    const [{ data: lead, error: leadErr }, { data: activities, error: actErr }] = await Promise.all([
      admin.from("dms_leads").select("*").eq("id", leadId).single(),
      admin
        .from("dms_lead_activities")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false }),
    ]);

    if (leadErr) throw leadErr;
    if (actErr) throw actErr;

    return { lead: lead as Lead, activities: (activities ?? []) as LeadActivity[] };
  } catch (err) {
    return { lead: null, activities: [], error: err instanceof Error ? err.message : "Failed to load lead" };
  }
}

export async function createLead(data: {
  business_name: string;
  contact_name?: string;
  whatsapp_number?: string;
  email?: string;
  city?: string;
  source?: string;
  notes?: string;
  next_followup_date?: string;
}): Promise<{ leadId?: string; error?: string }> {
  try {
    const user = await requireSalesRep();
    if (!data.business_name.trim()) throw new Error("Business name is required");
    if (data.business_name.length > MAX_BUSINESS_NAME) throw new Error("Business name too long");
    if (data.contact_name && data.contact_name.length > MAX_CONTACT_NAME) throw new Error("Contact name too long");
    if (data.whatsapp_number && data.whatsapp_number.length > MAX_PHONE) throw new Error("Phone number too long");
    if (data.email && data.email.length > MAX_EMAIL) throw new Error("Email too long");
    if (data.city && data.city.length > MAX_CITY) throw new Error("City name too long");
    if (data.notes && data.notes.length > MAX_NOTES) throw new Error("Notes too long");

    const source = data.source?.trim() || "other";
    if (!VALID_SOURCES.includes(source)) throw new Error("Invalid source value");

    const next_followup_date = data.next_followup_date?.trim() || null;
    if (next_followup_date && (!DATE_RE.test(next_followup_date) || isNaN(Date.parse(next_followup_date)))) {
      throw new Error("Invalid follow-up date format");
    }

    const admin = createAdminClient();

    const { data: teamMember } = await admin
      .from("dms_sales_team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    const { data: lead, error } = await admin
      .from("dms_leads")
      .insert({
        business_name: data.business_name.trim(),
        contact_name: data.contact_name?.trim() || "",
        whatsapp_number: data.whatsapp_number?.trim() || "",
        email: data.email?.trim() || null,
        city: data.city?.trim() || null,
        source,
        notes: data.notes?.trim() || null,
        next_followup_date,
        assigned_to: user.id,
        team_id: teamMember?.team_id || null,
        status: "new",
      })
      .select("id")
      .single();

    if (error) throw error;

    await admin.from("dms_lead_activities").insert({
      lead_id: lead.id,
      activity_type: "note",
      note: "Lead created",
      actor_id: user.id,
    });

    revalidateTag(leadsTag(user.id));
    return { leadId: lead.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create lead" };
  }
}

export async function addActivity(data: {
  lead_id: string;
  activity_type: string;
  note?: string;
  scheduled_at?: string;
}): Promise<{ error?: string }> {
  try {
    const user = await requireSalesRep();
    await verifyLeadOwnership(data.lead_id, user.id);

    const validTypes = [
      "call", "whatsapp", "email", "meeting", "demo",
      "follow_up", "payment_received", "note",
    ];
    if (!validTypes.includes(data.activity_type)) throw new Error("Invalid activity type");
    if (data.note && data.note.length > MAX_ACTIVITY_NOTE) throw new Error("Note too long");
    if (data.scheduled_at && (!DATETIME_RE.test(data.scheduled_at) || isNaN(Date.parse(data.scheduled_at)))) {
      throw new Error("Invalid scheduled_at format");
    }

    const admin = createAdminClient();
    const { error } = await admin.from("dms_lead_activities").insert({
      lead_id: data.lead_id,
      activity_type: data.activity_type,
      note: data.note?.trim() || null,
      scheduled_at: data.scheduled_at || null,
      actor_id: user.id,
    });
    if (error) throw error;

    revalidateTag(leadsTag(user.id));
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add activity" };
  }
}

export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus,
  extra?: { lost_reason?: string; payment_amount?: number; payment_method?: string }
): Promise<{ error?: string }> {
  try {
    const user = await requireSalesRep();
    await verifyLeadOwnership(leadId, user.id);

    const validStatuses: LeadStatus[] = [
      "new", "contacted", "demo_given", "follow_up", "negotiating",
      "payment_pending", "payment_received", "onboarding", "active", "lost",
    ];
    if (!validStatuses.includes(status)) throw new Error("Invalid status");

    if (extra?.lost_reason && extra.lost_reason.length > MAX_LOST_REASON) throw new Error("Lost reason too long");
    if (extra?.payment_amount !== undefined && (isNaN(extra.payment_amount) || extra.payment_amount < 0)) {
      throw new Error("Invalid payment amount");
    }

    const VALID_PAYMENT_METHODS = ["cash", "bank_transfer", "easypaisa", "jazzcash", "cheque", ""];
    if (extra?.payment_method !== undefined && !VALID_PAYMENT_METHODS.includes(extra.payment_method ?? "")) {
      throw new Error("Invalid payment method");
    }

    const admin = createAdminClient();
    const updateData: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (extra?.lost_reason !== undefined) updateData.lost_reason = extra.lost_reason;
    if (extra?.payment_amount !== undefined) updateData.payment_amount = extra.payment_amount;
    if (extra?.payment_method !== undefined) updateData.payment_method = extra.payment_method;

    const { error } = await admin.from("dms_leads").update(updateData).eq("id", leadId);
    if (error) throw error;

    await admin.from("dms_lead_activities").insert({
      lead_id: leadId,
      activity_type: "note",
      note: `Status changed to: ${status}${extra?.lost_reason ? ` — ${extra.lost_reason}` : ""}`,
      actor_id: user.id,
    });

    revalidateTag(leadsTag(user.id));
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update status" };
  }
}

export async function updateFollowUpDate(
  leadId: string,
  next_followup_date: string | null
): Promise<{ error?: string }> {
  try {
    const user = await requireSalesRep();
    await verifyLeadOwnership(leadId, user.id);

    if (next_followup_date && (!DATE_RE.test(next_followup_date) || isNaN(Date.parse(next_followup_date)))) {
      throw new Error("Invalid follow-up date format");
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("dms_leads")
      .update({ next_followup_date, updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (error) throw error;

    revalidateTag(leadsTag(user.id));
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update follow-up date" };
  }
}

export async function updateLeadNotes(
  leadId: string,
  notes: string
): Promise<{ error?: string }> {
  try {
    const user = await requireSalesRep();
    await verifyLeadOwnership(leadId, user.id);

    if (notes.length > MAX_NOTES) throw new Error("Notes too long");

    const admin = createAdminClient();
    const { error } = await admin
      .from("dms_leads")
      .update({ notes: notes.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (error) throw error;

    revalidateTag(leadsTag(user.id));
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update notes" };
  }
}

export async function getTodaysFollowUps(): Promise<{ leads: Lead[]; error?: string }> {
  try {
    const user = await requireSalesRep();

    // Derive from the cached all-leads list — zero extra DB round-trip
    const { leads: all } = await getMyLeads();
    const today = new Date().toISOString().slice(0, 10);
    const leads = all
      .filter(l => l.next_followup_date === today && l.status !== "active" && l.status !== "lost")
      .sort((a, b) => a.business_name.localeCompare(b.business_name));

    return { leads };
  } catch (err) {
    return { leads: [], error: err instanceof Error ? err.message : "Failed to load follow-ups" };
  }
}
