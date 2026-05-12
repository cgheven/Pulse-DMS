"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import type {
  AdminScope,
  ProspectActivity,
  ProspectActivityOutcome,
  ProspectActivityType,
} from "@/types";

const ACTIVITY_TYPES: readonly ProspectActivityType[] = [
  "whatsapp",
  "call",
  "visit",
  "note",
  "status_change",
];

const ACTIVITY_OUTCOMES: readonly ProspectActivityOutcome[] = [
  "no_response",
  "answered",
  "interested",
  "not_interested",
  "scheduled_visit",
  "onboarded",
  "rejected",
  "other",
];

// Outcomes that should also bump the prospect's coarse status forward.
const OUTCOME_TO_STATUS: Partial<Record<ProspectActivityOutcome, "visited" | "onboarded" | "rejected">> = {
  scheduled_visit: "visited",
  onboarded: "onboarded",
  rejected: "rejected",
};

// ── Guard ────────────────────────────────────────────────────────────────────
// Both 'full' and 'prospects' scoped admins can call prospect actions.
// User-creation actions further narrow to scope === 'full'.

async function requireProspectsAdmin(): Promise<{
  id: string;
  email: string;
  scope: AdminScope;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("pulse_profiles")
    .select("is_admin, admin_scope")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) throw new Error("Not authorized");

  const scope = ((profile.admin_scope as AdminScope | null) ?? "full") as AdminScope;
  return { id: user.id, email: user.email ?? "", scope };
}

// ── Record Follow-up (WhatsApp send) ─────────────────────────────────────────
// Increments followup_count, stamps last_followup_at + last_followup_template,
// AND writes a 'whatsapp' activity row so the timeline reflects the send.
// templateKey is whitelisted to <=64 chars to prevent storage abuse.

export async function recordProspectFollowup(
  prospectId: string,
  templateKey: string,
  messagePreview?: string,
): Promise<{ error?: string }> {
  try {
    const caller = await requireProspectsAdmin();
    const admin = createAdminClient();

    const key = (templateKey ?? "").toString().slice(0, 64);
    // 500-char cap on stored preview so the activity row stays small.
    const preview = (messagePreview ?? "").toString().slice(0, 500) || null;

    const { data: row, error: selErr } = await admin
      .from("pulse_prospects")
      .select("followup_count")
      .eq("id", prospectId)
      .single();
    if (selErr || !row) return { error: "Prospect not found" };

    const current = (row as { followup_count: number | null }).followup_count ?? 0;

    const nowIso = new Date().toISOString();

    const { error } = await admin
      .from("pulse_prospects")
      .update({
        followup_count: current + 1,
        last_followup_at: nowIso,
        last_followup_template: key || null,
        updated_at: nowIso,
      })
      .eq("id", prospectId);
    if (error) return { error: error.message };

    await admin.from("pulse_prospect_activities").insert({
      prospect_id: prospectId,
      type: "whatsapp",
      content: preview,
      template_key: key || null,
      created_by: caller.id,
      created_by_email: caller.email,
    });

    await writeAuditLog({
      actor_id: caller.id,
      actor_email: caller.email,
      action: "prospect.followup",
      entity: "prospect",
      entity_id: prospectId,
      meta: { template: key, scope: caller.scope },
    });

    revalidatePath("/admin/prospects");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to record follow-up" };
  }
}

// ── List Activities ─────────────────────────────────────────────────────────

export async function listProspectActivities(
  prospectId: string,
): Promise<{ activities?: ProspectActivity[]; error?: string }> {
  try {
    await requireProspectsAdmin();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("pulse_prospect_activities")
      .select("*")
      .eq("prospect_id", prospectId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return { error: error.message };
    return { activities: (data ?? []) as ProspectActivity[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list activities" };
  }
}

// ── Log Activity (manual: call, visit, note) ────────────────────────────────
// Operator records a contact they made outside the WhatsApp button — phone
// call, in-person visit, or a free-form note. Optionally captures outcome.

export async function logProspectActivity(args: {
  prospectId: string;
  type: ProspectActivityType;
  outcome?: ProspectActivityOutcome | null;
  content?: string | null;
}): Promise<{ error?: string }> {
  try {
    const caller = await requireProspectsAdmin();
    const admin = createAdminClient();

    if (!ACTIVITY_TYPES.includes(args.type)) {
      return { error: "Invalid activity type" };
    }
    if (args.outcome && !ACTIVITY_OUTCOMES.includes(args.outcome)) {
      return { error: "Invalid outcome" };
    }

    // 2000-char cap on freeform content.
    const content = (args.content ?? "").toString().slice(0, 2000).trim() || null;

    const { error: insErr } = await admin.from("pulse_prospect_activities").insert({
      prospect_id: args.prospectId,
      type: args.type,
      outcome: args.outcome ?? null,
      content,
      created_by: caller.id,
      created_by_email: caller.email,
    });
    if (insErr) return { error: insErr.message };

    // Update denormalized last_outcome + (if outcome maps to a status) bump the
    // coarse pipeline status. We touch updated_at so the row sorts to the top
    // of any "recent activity" view.
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (args.outcome) {
      updates.last_outcome = args.outcome;
      const nextStatus = OUTCOME_TO_STATUS[args.outcome];
      if (nextStatus) updates.status = nextStatus;
    }
    const { error: updErr } = await admin
      .from("pulse_prospects")
      .update(updates)
      .eq("id", args.prospectId);
    if (updErr) return { error: updErr.message };

    revalidatePath("/admin/prospects");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to log activity" };
  }
}

// ── Record Outcome (two-step flow after a WhatsApp send) ────────────────────
// Quick chip-style action: pick "Interested" / "No response" / etc. after
// hearing back from the prospect. Writes a 'note' activity tagged with the
// outcome AND updates the prospect's denormalized last_outcome.

export async function recordProspectOutcome(
  prospectId: string,
  outcome: ProspectActivityOutcome,
  note?: string,
): Promise<{ error?: string }> {
  return logProspectActivity({
    prospectId,
    type: "note",
    outcome,
    content: note,
  });
}

// ── Create Partner (prospects-scoped) User ───────────────────────────────────
// FULL admins create a scope='prospects' admin with an auto-generated
// password. Returns the plaintext password ONCE — caller shows + discards.

export async function createPartnerProspectsUser(data: {
  email: string;
  full_name: string;
}): Promise<{ userId?: string; password?: string; error?: string }> {
  try {
    const caller = await requireProspectsAdmin();
    if (caller.scope !== "full") {
      return { error: "Only full admins can create users" };
    }

    const email = data.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "Invalid email" };
    }

    const password = generateStrongPassword();

    const admin = createAdminClient();
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) return { error: error.message };

    await admin.from("pulse_profiles").upsert(
      {
        id: created.user.id,
        full_name: data.full_name || null,
        is_admin: true,
        admin_scope: "prospects",
        branch_limit: 1,
      },
      { onConflict: "id" },
    );

    await writeAuditLog({
      actor_id: caller.id,
      actor_email: caller.email,
      action: "user.create_partner",
      entity: "user",
      entity_id: created.user.id,
      meta: { email, scope: "prospects" },
    });

    return { userId: created.user.id, password };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create partner" };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateStrongPassword(): string {
  // 16 chars, alphanumeric + symbols, crypto-random. Excludes ambiguous
  // glyphs (0/O, 1/l/I) so the one-time-shown password is easier to copy.
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%&*";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += charset[b % charset.length];
  return out;
}
