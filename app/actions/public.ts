"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicGym } from "@/types";

export async function getPublicGyms(): Promise<{ gyms?: PublicGym[]; error?: string }> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("pulse_gyms")
      .select("id,owner_id,name,address,phone,email,total_capacity,city,area,maps_url,instagram_url,tiktok_url,facebook_url,show_member_count,description,gym_type,gym_types,amenities")
      .eq("listing_enabled", true)
      .order("name");
    if (error) throw error;

    const gyms = (data ?? []) as (Omit<PublicGym, "active_members" | "owner_name">)[];
    if (gyms.length === 0) return { gyms: [] };

    const ids      = gyms.map((g) => g.id);
    const ownerIds = [...new Set(gyms.map((g) => g.owner_id))];

    const [{ data: members }, { data: profiles }] = await Promise.all([
      admin
        .from("pulse_members")
        .select("gym_id")
        .in("gym_id", ids)
        .eq("status", "active"),
      admin
        .from("pulse_profiles")
        .select("id, full_name")
        .in("id", ownerIds),
    ]);

    const activeMap: Record<string, number> = {};
    for (const m of members ?? []) {
      activeMap[m.gym_id] = (activeMap[m.gym_id] ?? 0) + 1;
    }

    const ownerMap: Record<string, string | null> = {};
    for (const p of profiles ?? []) {
      ownerMap[p.id] = p.full_name;
    }

    return {
      gyms: gyms.map((g) => ({
        ...g,
        owner_name: ownerMap[g.owner_id] ?? null,
        active_members: activeMap[g.id] ?? 0,
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load gyms" };
  }
}

// Pakistani phone number: optional +92 / 92 / 0 prefix, then 3 + 9 digits.
const PK_PHONE_RE = /^(\+92|92|0)?3\d{9}$/;
const GENERIC_WAITLIST_ERROR = "Could not join waitlist. Please try again.";

export async function joinWaitlist(
  gymId: string,
  name: string,
  phone: string,
): Promise<{ error?: string }> {
  try {
    if (typeof gymId !== "string" || !gymId) {
      return { error: GENERIC_WAITLIST_ERROR };
    }

    const trimmedName = (name ?? "").trim();
    const trimmedPhone = (phone ?? "").trim();

    // Length caps + presence checks (return user-facing messages where useful;
    // never echo a raw DB error to the client — log server-side instead).
    if (!trimmedName) return { error: "Name is required" };
    if (!trimmedPhone) return { error: "Phone is required" };
    if (trimmedName.length > 100) return { error: "Name is too long" };
    if (trimmedPhone.length > 20) return { error: "Phone is too long" };

    const phoneCompact = trimmedPhone.replace(/[\s-]/g, "");
    if (!PK_PHONE_RE.test(phoneCompact)) {
      return { error: "Enter a valid Pakistani phone number" };
    }

    const admin = createAdminClient();

    // Verify gym exists and is publicly listing — prevents spam against gyms
    // that aren't on the public directory.
    const { data: gym, error: gymErr } = await admin
      .from("pulse_gyms")
      .select("id, listing_enabled")
      .eq("id", gymId)
      .maybeSingle();
    if (gymErr) {
      console.error("[joinWaitlist] gym lookup failed", gymErr);
      return { error: GENERIC_WAITLIST_ERROR };
    }
    if (!gym || !gym.listing_enabled) {
      return { error: GENERIC_WAITLIST_ERROR };
    }

    const { error } = await admin
      .from("pulse_waitlist")
      .insert({
        gym_id: gymId,
        name: trimmedName,
        phone: phoneCompact,
      });
    if (error) {
      // Never leak Supabase error.message — generic message for client only.
      console.error("[joinWaitlist] insert failed", error);
      return { error: GENERIC_WAITLIST_ERROR };
    }
    return {};
  } catch (err) {
    console.error("[joinWaitlist] unexpected error", err);
    return { error: GENERIC_WAITLIST_ERROR };
  }
}
