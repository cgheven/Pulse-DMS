"use server";

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSalesRep } from "./sales-rep";
import { generatePassword } from "./admin-sales-teams";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrialCredentials = {
  email: string;
  password: string;
  shop_name: string;
  trial_ends_at: string;   // ISO string, 7 days from now
  login_url: string;       // NEXT_PUBLIC_APP_URL + '/login'
};

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function leadsTag(userId: string) {
  return `leads:${userId}`;
}

/** Verify the caller owns (is assigned to) the given lead. Uniform error to prevent existence oracle. */
async function verifyLeadOwnership(leadId: string, userId: string): Promise<void> {
  if (!UUID_RE.test(leadId)) throw new Error("Lead not found");
  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("dms_leads")
    .select("assigned_to")
    .eq("id", leadId)
    .single();
  if (!lead || lead.assigned_to !== userId) throw new Error("Lead not found");
}

/**
 * Build a deterministic trial email from the shop name and the last 7 digits
 * of the whatsapp number (or "trial" if not provided).
 *
 * Format: <clean_shop_name_prefix>.<last7digits>@trial.pulsedms.com
 * - prefix: lowercase alphanumeric only, max 20 chars
 */
function buildTrialEmail(shopName: string, whatsappNumber?: string): string {
  const prefix = shopName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);

  const digits = whatsappNumber
    ? whatsappNumber.replace(/\D/g, "").slice(-7)
    : "trial";

  const suffix = digits.length > 0 ? digits : "trial";

  return `${prefix || "shop"}.${suffix}@trial.pulsedms.com`;
}

// ---------------------------------------------------------------------------
// Main action
// ---------------------------------------------------------------------------

export async function createLeadTrialAccount(
  leadId: string,
  data: {
    shop_name: string;
    contact_name: string;
    email?: string;
    whatsapp_number?: string;
  }
): Promise<{ credentials?: TrialCredentials; error?: string }> {
  let createdUserId: string | null = null;
  let createdShopId: string | null = null;

  try {
    // 1. Auth gate — must be a sales rep (or admin)
    const user = await requireSalesRep();

    // 2. Validate leadId and assert ownership
    if (!UUID_RE.test(leadId)) return { error: "Lead not found" };
    await verifyLeadOwnership(leadId, user.id);

    // 2b. Per-lead uniqueness — prevent double-provisioning
    const admin0 = createAdminClient();
    const { data: existing } = await admin0
      .from("dms_lead_activities")
      .select("id")
      .eq("lead_id", leadId)
      .eq("activity_type", "trial_account_created")
      .maybeSingle();
    if (existing) {
      return { error: "A trial account has already been created for this lead." };
    }

    // 3. Input validation -------------------------------------------------------
    const shopName    = data.shop_name.trim().slice(0, 100);
    const contactName = data.contact_name.trim().slice(0, 100);
    const rawEmail    = data.email?.trim();
    const whatsapp    = data.whatsapp_number?.trim();

    if (shopName.length < 2)    return { error: "Shop name must be at least 2 characters." };
    if (shopName.length > 100)  return { error: "Shop name must be at most 100 characters." };
    if (contactName.length < 2) return { error: "Contact name must be at least 2 characters." };
    if (contactName.length > 100) return { error: "Contact name must be at most 100 characters." };

    let email: string;
    if (rawEmail) {
      if (rawEmail.length > 254) return { error: "Email address is too long." };
      if (!RFC_EMAIL_RE.test(rawEmail)) return { error: "Please provide a valid email address." };
      email = rawEmail.toLowerCase();
    } else {
      email = buildTrialEmail(shopName, whatsapp);
    }

    // 4. Generate password (crypto.getRandomValues-based via import)
    const password = generatePassword();

    // 5. Create Supabase auth user
    const admin = createAdminClient();
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      // Uniform message — no existence oracle
      return { error: "An account with this email already exists." };
    }

    createdUserId = authData.user.id;
    const userId = createdUserId;

    // 6. Compute trial window
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // 7. Create shop
    const { data: shopData, error: shopError } = await admin
      .from("dms_shops")
      .insert({
        owner_id:      userId,
        shop_name:     shopName,
        trial_plan:    "7_day",
        trial_ends_at: trialEndsAt,
        branch_limit:  1,
        is_active:     true,
        is_sales_trial: true,
      })
      .select("id")
      .single();

    if (shopError || !shopData) {
      await admin.auth.admin.deleteUser(userId);
      return { error: "Failed to create trial shop. Please try again." };
    }

    createdShopId = shopData.id;
    const shopId = createdShopId;

    // 8. Create default branch
    const { error: branchError } = await admin.from("dms_branches").insert({
      shop_id:    shopId,
      name:       shopName,
      is_default: true,
      is_active:  true,
    });

    if (branchError) {
      await admin.auth.admin.deleteUser(userId);
      await admin.from("dms_shops").delete().eq("id", shopId);
      return { error: "Failed to initialise trial account. Please try again." };
    }

    // 9. Update profile (created by Supabase trigger on auth.users insert)
    const { error: profileError } = await admin
      .from("dms_profiles")
      .update({ full_name: contactName, role: "owner", shop_id: shopId })
      .eq("id", userId);

    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      await admin.from("dms_shops").delete().eq("id", shopId);
      return { error: "Failed to set up trial profile. Please try again." };
    }

    // 10. Log activity on the lead (custom type used as uniqueness sentinel)
    await admin.from("dms_lead_activities").insert({
      lead_id:       leadId,
      activity_type: "trial_account_created",
      note:          `Trial account created: ${email}`,
      actor_id:      user.id,
    });

    // 11. Invalidate cached leads for this sales rep
    revalidateTag(leadsTag(user.id));

    // 12. Return credentials (password included here and nowhere else)
    const loginUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "") + "/login";

    return {
      credentials: {
        email,
        password,
        shop_name:     shopName,
        trial_ends_at: trialEndsAt,
        login_url:     loginUrl,
      },
    };
  } catch (err) {
    // Best-effort rollback if something threw after user/shop creation
    if (createdUserId) {
      try {
        const admin = createAdminClient();
        await admin.auth.admin.deleteUser(createdUserId);
        if (createdShopId) {
          await admin.from("dms_shops").delete().eq("id", createdShopId);
        }
      } catch {
        // Swallow rollback errors — primary error takes precedence
      }
    }

    return {
      error: err instanceof Error ? err.message : "Failed to create trial account.",
    };
  }
}
