"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/data";
import { normalizePhone } from "@/lib/phone";
import { isUUID, daysSince } from "@/lib/utils";
import { requireModuleOrThrow } from "@/lib/modules";
import type {
  Rider, RiderCashCollection, RiderCashTotalByRiderDay, RiderChequeCollection, RiderClient,
  RiderOrder, RiderOrderItem, RiderDailySalesRow, RiderChequeTotalByRider, RiderPerformanceRow,
  RiderPendingOrder, ManagementReports,
} from "@/types";

const CHARSET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generatePassword(len = 10): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let p = "";
  for (let i = 0; i < len; i++) p += CHARSET[buf[i] % CHARSET.length];
  return p;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Built on the same React cache()-deduped getAuthContext() the (dashboard)
// layout already resolved this request — avoids a redundant auth.getUser()
// network round-trip + duplicate profile query per action call (previously
// every riders.ts action re-did its own uncached auth.getUser(), which was
// the main cause of the /riders section feeling slow).
async function requireShopOwner() {
  const ctx = await getAuthContext();
  if (!ctx?.user) throw new Error("Not authenticated");
  const profile = ctx.profile;
  if (!profile || profile.role !== "owner") throw new Error("Not authorized");
  if (!profile.shop_id) throw new Error("No shop found");
  // Defense-in-depth: role='owner' alone must never be sufficient. If a data
  // integrity slip (or a future bug) ever leaves a rider/sales-rep profile
  // with role='owner', is_rider/is_sales_rep still blocks owner-equivalent
  // authority here.
  if (profile.is_rider || profile.is_sales_rep) throw new Error("Not authorized");
  // Every rider-management action is gated behind the module toggle — even
  // for the shop owner. Throws (not redirects) so callers get { error }.
  await requireModuleOrThrow(profile.shop_id, "rider_management");
  return { userId: ctx.user.id, shopId: profile.shop_id as string };
}

// Verify branchId belongs to the calling owner's own shop (never trust the
// caller's shopId claim beyond what requireShopOwner already resolved).
async function verifyBranchOwnership(branchId: string, shopId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("dms_branches")
    .select("id")
    .eq("id", branchId)
    .eq("shop_id", shopId)
    .maybeSingle();
  return !!data;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as any).message);
  return String(e);
}

export async function listRiders(): Promise<{ riders: Rider[]; error?: string }> {
  try {
    const { shopId } = await requireShopOwner();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("dms_riders")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { riders: (data ?? []) as Rider[] };
  } catch (e) {
    return { riders: [], error: errMsg(e) };
  }
}

export async function addRider(input: {
  full_name: string;
  phone: string;
  branchId: string;
  vehicle_number?: string;
  notes?: string;
}): Promise<{ error?: string }> {
  try {
    const { shopId } = await requireShopOwner();
    const full_name = input.full_name.trim().slice(0, 100);
    const phone = input.phone.trim().slice(0, 20);
    const vehicle_number = (input.vehicle_number ?? "").trim().slice(0, 30) || null;
    const notes = (input.notes ?? "").trim().slice(0, 500) || null;
    if (!full_name) return { error: "Name is required" };
    if (!phone) return { error: "Phone is required" };
    if (!input.branchId || !isUUID(input.branchId)) return { error: "Branch is required" };
    if (!(await verifyBranchOwnership(input.branchId, shopId))) return { error: "Invalid branch" };

    const admin = createAdminClient();
    const { error } = await admin.from("dms_riders").insert({
      shop_id: shopId,
      branch_id: input.branchId,
      full_name,
      phone,
      vehicle_number,
      notes,
    });
    if (error) throw error;
    revalidatePath("/riders");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function updateRider(
  riderId: string,
  input: {
    full_name?: string;
    phone?: string;
    branchId?: string;
    vehicle_number?: string;
    notes?: string;
    is_active?: boolean;
  }
): Promise<{ error?: string }> {
  try {
    if (!isUUID(riderId)) return { error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    const updates: Record<string, unknown> = {};
    if (input.full_name !== undefined) updates.full_name = input.full_name.trim().slice(0, 100);
    if (input.phone !== undefined) updates.phone = input.phone.trim().slice(0, 20);
    if (input.vehicle_number !== undefined) updates.vehicle_number = input.vehicle_number.trim().slice(0, 30) || null;
    if (input.notes !== undefined) updates.notes = input.notes.trim().slice(0, 500) || null;
    if (input.is_active !== undefined) updates.is_active = input.is_active;
    if (input.branchId !== undefined) {
      if (!isUUID(input.branchId)) return { error: "Invalid branch" };
      if (!(await verifyBranchOwnership(input.branchId, shopId))) return { error: "Invalid branch" };
      updates.branch_id = input.branchId;
    }
    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("dms_riders")
      .update(updates)
      .eq("id", riderId)
      .eq("shop_id", shopId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!updated) return { error: "Rider not found" };
    revalidatePath("/riders");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function setRiderActive(riderId: string, is_active: boolean): Promise<{ error?: string }> {
  return updateRider(riderId, { is_active });
}

export async function deleteRider(riderId: string): Promise<{ error?: string }> {
  try {
    if (!isUUID(riderId)) return { error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    const admin = createAdminClient();

    const { data: r } = await admin.from("dms_riders").select("profile_id").eq("id", riderId).eq("shop_id", shopId).single();

    // Delete the dms_riders row FIRST, before touching the auth user. A
    // rider with recorded activity (dms_rider_orders/dms_rider_cash_collections/
    // dms_rider_cheque_collections all use ON DELETE RESTRICT on rider_id)
    // will fail here with a raw Postgres FK-violation error — caught below
    // and surfaced as a friendly message. Deleting the auth user first (the
    // old order) would silently sever the rider's login even when the DB
    // then refuses to delete the rider row, leaving it in an orphaned,
    // login-less state — deactivate instead of delete for riders with
    // recorded activity.
    const { error } = await admin.from("dms_riders").delete().eq("id", riderId).eq("shop_id", shopId);
    if (error) {
      if (error.code === "23503") {
        return { error: "This rider has recorded orders, cash, or cheque collections — deactivate instead of deleting." };
      }
      throw error;
    }
    if (r?.profile_id) {
      await admin.auth.admin.deleteUser(r.profile_id);
    }
    revalidatePath("/riders");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function createRiderLogin(
  riderId: string,
  email: string,
  customPassword?: string
): Promise<{ password?: string; email?: string; fullName?: string; error?: string }> {
  try {
    if (!isUUID(riderId)) return { error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    const admin = createAdminClient();
    const { data: r, error: fe } = await admin
      .from("dms_riders").select("*").eq("id", riderId).eq("shop_id", shopId).single();
    if (fe || !r) return { error: "Rider not found" };
    if (r.profile_id) return { error: "Login already exists for this rider" };

    const cleanEmail = email.trim().toLowerCase().slice(0, 254);
    if (!EMAIL_RE.test(cleanEmail)) return { error: "Invalid email address" };

    if (customPassword !== undefined) {
      if (customPassword.length < 8) return { error: "Password must be at least 8 characters" };
      if (customPassword.length > 72) return { error: "Password must be 72 characters or fewer" };
    }
    const password = customPassword ?? generatePassword(10);

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: r.full_name },
    });
    if (authErr) {
      if (authErr.message.includes("already been registered")) return { error: "A login for this email already exists" };
      throw authErr;
    }
    const newUserId = authData.user.id;
    // dms_profiles.role is CHECK-locked to 'owner' | 'staff' and has a column
    // DEFAULT of 'owner'. This is an UPSERT against a brand-new row (unlike
    // staff/sales-rep flows that UPDATE an existing profile), so omitting
    // `role` here would let it fall back to the 'owner' default — combined
    // with the real shop_id set below, that would satisfy every owner-only
    // guard in the app (requireShopOwner() in this file and in staff.ts,
    // the role check in insights.ts, etc.) via Server Actions, which are
    // independently invocable and not protected by the dashboard layout's
    // page-navigation redirect. Explicitly set role: "staff" — mirrors
    // app/actions/staff.ts's own createStaffLogin — and rely on
    // is_rider/getRiderAuthContext for the rider portal's own access control.
    await admin.from("dms_profiles").upsert({
      id: newUserId,
      shop_id: shopId,
      role: "staff",
      is_rider: true,
      full_name: r.full_name,
      phone: normalizePhone(r.phone) ?? undefined,
    });
    const { error: le } = await admin.from("dms_riders").update({ profile_id: newUserId }).eq("id", riderId).eq("shop_id", shopId);
    if (le) throw le;
    revalidatePath("/riders");
    return { password, email: cleanEmail, fullName: r.full_name };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function revokeRiderLogin(riderId: string): Promise<{ error?: string }> {
  try {
    if (!isUUID(riderId)) return { error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    const admin = createAdminClient();
    const { data: r } = await admin.from("dms_riders").select("profile_id").eq("id", riderId).eq("shop_id", shopId).single();
    if (!r?.profile_id) return {};
    await admin.auth.admin.deleteUser(r.profile_id);
    await admin.from("dms_riders").update({ profile_id: null }).eq("id", riderId).eq("shop_id", shopId);
    revalidatePath("/riders");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function resetRiderPassword(riderId: string): Promise<{
  password?: string;
  email?: string;
  fullName?: string;
  error?: string;
}> {
  try {
    if (!isUUID(riderId)) return { error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    const admin = createAdminClient();
    const { data: r } = await admin.from("dms_riders").select("profile_id, full_name").eq("id", riderId).eq("shop_id", shopId).single();
    if (!r?.profile_id) return { error: "No login exists for this rider" };
    const newPassword = generatePassword(10);
    const { error } = await admin.auth.admin.updateUserById(r.profile_id, { password: newPassword });
    if (error) throw error;
    const { data: authUser } = await admin.auth.admin.getUserById(r.profile_id);
    return { password: newPassword, email: authUser?.user?.email ?? "", fullName: r.full_name };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ─── Client directory (owner-side management) ────────────────────────────────

export async function listClients(branchId: string): Promise<{ clients: RiderClient[]; error?: string }> {
  try {
    if (!isUUID(branchId)) return { clients: [], error: "Invalid branch" };
    const { shopId } = await requireShopOwner();
    if (!(await verifyBranchOwnership(branchId, shopId))) return { clients: [], error: "Invalid branch" };
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("dms_clients")
      .select("*")
      .eq("branch_id", branchId)
      .order("name", { ascending: true });
    if (error) throw error;
    return { clients: (data ?? []) as RiderClient[] };
  } catch (e) {
    return { clients: [], error: errMsg(e) };
  }
}

export async function updateClient(
  clientId: string,
  input: {
    name?: string;
    businessName?: string;
    phone?: string;
    address?: string;
    latitude?: number | null;
    longitude?: number | null;
    notes?: string;
  }
): Promise<{ error?: string }> {
  try {
    if (!isUUID(clientId)) return { error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name.trim().slice(0, 150);
      if (!name) return { error: "Name is required" };
      updates.name = name;
    }
    if (input.businessName !== undefined) updates.business_name = input.businessName.trim().slice(0, 150) || null;
    if (input.phone !== undefined) updates.phone = input.phone.trim().slice(0, 20) || null;
    if (input.address !== undefined) updates.address = input.address.trim().slice(0, 500) || null;
    if (input.latitude !== undefined) {
      updates.latitude = typeof input.latitude === "number" && Number.isFinite(input.latitude) && input.latitude >= -90 && input.latitude <= 90
        ? input.latitude : null;
    }
    if (input.longitude !== undefined) {
      updates.longitude = typeof input.longitude === "number" && Number.isFinite(input.longitude) && input.longitude >= -180 && input.longitude <= 180
        ? input.longitude : null;
    }
    if (input.notes !== undefined) updates.notes = input.notes.trim().slice(0, 1000) || null;

    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("dms_clients")
      .update(updates)
      .eq("id", clientId)
      .eq("shop_id", shopId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!updated) return { error: "Client not found" };
    revalidatePath("/riders/clients");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function setClientActive(clientId: string, is_active: boolean): Promise<{ error?: string }> {
  try {
    if (!isUUID(clientId)) return { error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("dms_clients")
      .update({ is_active })
      .eq("id", clientId)
      .eq("shop_id", shopId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!updated) return { error: "Client not found" };
    revalidatePath("/riders/clients");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ─── Orders — owner "all riders" view ────────────────────────────────────────
// This IS the "map view of order locations" per the product decision: a plain
// list/table, each row exposing a mapsUrl the client renders as
// <a target="_blank">, opening https://www.google.com/maps?q={lat},{lng}.
// No map SDK, no API key.

export async function listAllOrders(
  branchId: string,
  filters?: { riderId?: string; status?: RiderOrder["status"]; from?: string; to?: string }
): Promise<{ orders: RiderOrder[]; error?: string }> {
  try {
    if (!isUUID(branchId)) return { orders: [], error: "Invalid branch" };
    const { shopId } = await requireShopOwner();
    if (!(await verifyBranchOwnership(branchId, shopId))) return { orders: [], error: "Invalid branch" };
    const admin = createAdminClient();
    let builder = admin
      .from("dms_rider_orders")
      .select("*, rider:dms_riders(id, full_name), client:dms_clients(id, name, phone)")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (filters?.riderId && isUUID(filters.riderId)) builder = builder.eq("rider_id", filters.riderId);
    if (filters?.status) builder = builder.eq("status", filters.status);
    if (filters?.from) builder = builder.gte("order_date", filters.from);
    if (filters?.to) builder = builder.lte("order_date", filters.to);
    const { data, error } = await builder;
    if (error) throw error;
    const orders = (data ?? []).map((o: any) => ({
      ...o,
      mapsUrl: o.latitude != null && o.longitude != null ? `https://www.google.com/maps?q=${o.latitude},${o.longitude}` : null,
    }));
    return { orders: orders as RiderOrder[] };
  } catch (e) {
    return { orders: [], error: errMsg(e) };
  }
}

// ─── Cash collection — owner "all riders" view ───────────────────────────────
// "Totals per rider/day" is computed on read (GROUP BY rider_id,
// collection_date), exactly how getSupplierBalances() derives balance on the
// fly rather than maintaining a stored running total — mirrors
// dms_supplier_payments, not a running-balance table.

export async function listCashCollections(
  branchId: string,
  filters?: { riderId?: string; from?: string; to?: string }
): Promise<{
  collections: RiderCashCollection[];
  totalsByRiderDay: RiderCashTotalByRiderDay[];
  grandTotal: number;
  error?: string;
}> {
  try {
    if (!isUUID(branchId)) return { collections: [], totalsByRiderDay: [], grandTotal: 0, error: "Invalid branch" };
    const { shopId } = await requireShopOwner();
    if (!(await verifyBranchOwnership(branchId, shopId))) {
      return { collections: [], totalsByRiderDay: [], grandTotal: 0, error: "Invalid branch" };
    }
    const admin = createAdminClient();
    let builder = admin
      .from("dms_rider_cash_collections")
      .select("*, rider:dms_riders(id, full_name), client:dms_clients(id, name, phone), order:dms_rider_orders(id, total_amount)")
      .eq("branch_id", branchId)
      .order("collection_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);
    if (filters?.riderId && isUUID(filters.riderId)) builder = builder.eq("rider_id", filters.riderId);
    if (filters?.from) builder = builder.gte("collection_date", filters.from);
    if (filters?.to) builder = builder.lte("collection_date", filters.to);
    const { data, error } = await builder;
    if (error) throw error;
    const collections = (data ?? []) as RiderCashCollection[];

    const totalsMap = new Map<string, RiderCashTotalByRiderDay>();
    let grandTotal = 0;
    for (const c of collections) {
      grandTotal += c.amount;
      const key = `${c.rider_id}:${c.collection_date}`;
      const existing = totalsMap.get(key);
      if (existing) {
        existing.total = Math.round((existing.total + c.amount) * 100) / 100;
      } else {
        totalsMap.set(key, {
          riderId: c.rider_id,
          riderName: c.rider?.full_name ?? "Rider",
          date: c.collection_date,
          total: c.amount,
        });
      }
    }
    const totalsByRiderDay = Array.from(totalsMap.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.riderName.localeCompare(b.riderName);
    });

    return { collections, totalsByRiderDay, grandTotal: Math.round(grandTotal * 100) / 100 };
  } catch (e) {
    return { collections: [], totalsByRiderDay: [], grandTotal: 0, error: errMsg(e) };
  }
}

// ─── Cheque collection — owner "all riders" view ─────────────────────────────
// Pending aging ("days outstanding") is computed on read via daysSince() —
// never stored — exactly like cash collection's totals-by-rider-day and
// getSupplierBalances()'s running balance.

export async function listChequeCollections(
  branchId: string,
  filters?: { riderId?: string; status?: RiderChequeCollection["status"] }
): Promise<{ cheques: RiderChequeCollection[]; error?: string }> {
  try {
    if (!isUUID(branchId)) return { cheques: [], error: "Invalid branch" };
    const { shopId } = await requireShopOwner();
    if (!(await verifyBranchOwnership(branchId, shopId))) return { cheques: [], error: "Invalid branch" };
    const admin = createAdminClient();
    let builder = admin
      .from("dms_rider_cheque_collections")
      .select("*, rider:dms_riders(id, full_name), client:dms_clients(id, name, phone), order:dms_rider_orders(id, total_amount)")
      .eq("branch_id", branchId)
      .order("collection_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);
    if (filters?.riderId && isUUID(filters.riderId)) builder = builder.eq("rider_id", filters.riderId);
    if (filters?.status) builder = builder.eq("status", filters.status);
    const { data, error } = await builder;
    if (error) throw error;
    const cheques = (data ?? []).map((c: any) => ({
      ...c,
      daysPending: c.status === "pending" ? daysSince(c.collection_date) : null,
    }));
    return { cheques: cheques as RiderChequeCollection[] };
  } catch (e) {
    return { cheques: [], error: errMsg(e) };
  }
}

// Owner-only: mark a cheque cleared or bounced. A rider can only ever record
// a cheque as 'pending' (see recordChequeCollection in app/actions/rider.ts)
// — this is the sole path that can transition its status.
export async function updateChequeStatus(
  chequeId: string,
  status: "cleared" | "bounced"
): Promise<{ error?: string }> {
  try {
    if (!isUUID(chequeId)) return { error: "Invalid ID" };
    if (!["cleared", "bounced"].includes(status)) return { error: "Invalid status" };
    const { shopId } = await requireShopOwner();
    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("dms_rider_cheque_collections")
      .update({ status, status_updated_at: new Date().toISOString() })
      .eq("id", chequeId)
      .eq("shop_id", shopId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!updated) return { error: "Cheque not found" };
    revalidatePath("/riders/cheque");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function getOrderDetailForOwner(orderId: string, branchId: string): Promise<{ order: RiderOrder | null; items: RiderOrderItem[]; error?: string }> {
  try {
    if (!isUUID(orderId) || !isUUID(branchId)) return { order: null, items: [], error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    if (!(await verifyBranchOwnership(branchId, shopId))) return { order: null, items: [], error: "Invalid branch" };
    const admin = createAdminClient();
    const { data: order, error } = await admin
      .from("dms_rider_orders")
      .select("*, rider:dms_riders(id, full_name), client:dms_clients(id, name, phone, address)")
      .eq("id", orderId)
      .eq("branch_id", branchId)
      .single();
    if (error || !order) return { order: null, items: [], error: "Order not found" };
    const { data: items } = await admin.from("dms_rider_order_items").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
    const mapsUrl = order.latitude != null && order.longitude != null ? `https://www.google.com/maps?q=${order.latitude},${order.longitude}` : null;
    return { order: { ...order, mapsUrl } as RiderOrder, items: (items ?? []) as RiderOrderItem[] };
  } catch (e) {
    return { order: null, items: [], error: errMsg(e) };
  }
}

// ─── Management Reports ───────────────────────────────────────────────────────
// Everything here is computed on read from dms_rider_orders/dms_rider_cash_
// collections/dms_rider_cheque_collections — nothing is stored, exactly like
// the totals-by-rider-day (cash) and daysPending (cheque) precedents above.
// All four report sections are branch-scoped and (like every other action in
// this file) re-verify branch ownership against the caller's own shopId
// resolved server-side by requireShopOwner() — never trusted from the client.

const EMPTY_REPORTS: ManagementReports = {
  dailySalesByRider: [],
  cashByRiderDay: [],
  cashGrandTotal: 0,
  chequeByRider: [],
  chequePendingTotal: 0,
  chequeClearedTotal: 0,
  chequeBouncedTotal: 0,
  riderPerformance: [],
  pendingOrders: [],
};

export async function getManagementReports(
  branchId: string,
  from: string,
  to: string,
  filters?: { riderId?: string }
): Promise<ManagementReports & { error?: string }> {
  try {
    if (!isUUID(branchId)) return { ...EMPTY_REPORTS, error: "Invalid branch" };
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return { ...EMPTY_REPORTS, error: "Invalid date range" };
    const { shopId } = await requireShopOwner();
    if (!(await verifyBranchOwnership(branchId, shopId))) return { ...EMPTY_REPORTS, error: "Invalid branch" };
    const riderFilter = filters?.riderId && isUUID(filters.riderId) ? filters.riderId : undefined;

    const admin = createAdminClient();

    // Riders in this branch — the base population for the performance summary
    // (so a rider with zero activity in-range still shows a 0 row, not a gap).
    let riderBuilder = admin
      .from("dms_riders")
      .select("id, full_name")
      .eq("shop_id", shopId)
      .eq("branch_id", branchId)
      .order("full_name", { ascending: true });
    if (riderFilter) riderBuilder = riderBuilder.eq("id", riderFilter);
    const { data: riderRows, error: riderErr } = await riderBuilder;
    if (riderErr) throw riderErr;
    const riders = (riderRows ?? []) as Pick<Rider, "id" | "full_name">[];

    // Orders in [from, to] — backbone of "daily sales by rider" and the order
    // side of "rider performance summary".
    let orderBuilder = admin
      .from("dms_rider_orders")
      .select("*, rider:dms_riders(id, full_name), client:dms_clients(id, name, phone)")
      .eq("branch_id", branchId)
      .gte("order_date", from)
      .lte("order_date", to)
      .order("order_date", { ascending: false })
      .limit(5000);
    if (riderFilter) orderBuilder = orderBuilder.eq("rider_id", riderFilter);
    const { data: orderRows, error: orderErr } = await orderBuilder;
    if (orderErr) throw orderErr;
    const orders = (orderRows ?? []) as RiderOrder[];

    // Cash collections in [from, to] (by collection_date).
    let cashBuilder = admin
      .from("dms_rider_cash_collections")
      .select("rider_id, amount, collection_date, rider:dms_riders(id, full_name)")
      .eq("branch_id", branchId)
      .gte("collection_date", from)
      .lte("collection_date", to)
      .limit(10000);
    if (riderFilter) cashBuilder = cashBuilder.eq("rider_id", riderFilter);
    const { data: cashRows, error: cashErr } = await cashBuilder;
    if (cashErr) throw cashErr;
    const cash = (cashRows ?? []).map((r: any) => ({
      rider_id: r.rider_id as string,
      amount: Number(r.amount),
      collection_date: r.collection_date as string,
      rider: (Array.isArray(r.rider) ? r.rider[0] : r.rider) as { id: string; full_name: string } | null,
    }));

    // Cheque collections in [from, to] (by collection_date — the date the
    // rider physically received it, matching the cash-collection convention).
    let chequeBuilder = admin
      .from("dms_rider_cheque_collections")
      .select("rider_id, amount, status, collection_date, rider:dms_riders(id, full_name)")
      .eq("branch_id", branchId)
      .gte("collection_date", from)
      .lte("collection_date", to)
      .limit(10000);
    if (riderFilter) chequeBuilder = chequeBuilder.eq("rider_id", riderFilter);
    const { data: chequeRows, error: chequeErr } = await chequeBuilder;
    if (chequeErr) throw chequeErr;
    const cheques = (chequeRows ?? []).map((r: any) => ({
      rider_id: r.rider_id as string,
      amount: Number(r.amount),
      status: r.status as "pending" | "cleared" | "bounced",
      collection_date: r.collection_date as string,
      rider: (Array.isArray(r.rider) ? r.rider[0] : r.rider) as { id: string; full_name: string } | null,
    }));

    // Pending orders — status='pending', ANY age (not bounded by from/to),
    // since the point of this report is "how long has this been sitting?".
    let pendingBuilder = admin
      .from("dms_rider_orders")
      .select("*, rider:dms_riders(id, full_name), client:dms_clients(id, name, phone)")
      .eq("branch_id", branchId)
      .eq("status", "pending")
      .order("order_date", { ascending: true })
      .limit(1000);
    if (riderFilter) pendingBuilder = pendingBuilder.eq("rider_id", riderFilter);
    const { data: pendingRows, error: pendingErr } = await pendingBuilder;
    if (pendingErr) throw pendingErr;
    const pendingOrders: RiderPendingOrder[] = (pendingRows ?? []).map((o: any) => ({
      ...o,
      mapsUrl: o.latitude != null && o.longitude != null ? `https://www.google.com/maps?q=${o.latitude},${o.longitude}` : null,
      daysPending: daysSince(o.order_date),
    }));

    // ── Daily sales by rider — group non-cancelled orders by (rider, date) ──
    const dailyMap = new Map<string, RiderDailySalesRow>();
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      const key = `${o.rider_id}:${o.order_date}`;
      const existing = dailyMap.get(key);
      if (existing) {
        existing.orderCount += 1;
        existing.totalAmount = round2(existing.totalAmount + o.total_amount);
      } else {
        dailyMap.set(key, {
          date: o.order_date,
          riderId: o.rider_id,
          riderName: o.rider?.full_name ?? "Rider",
          orderCount: 1,
          totalAmount: o.total_amount,
        });
      }
    }
    const dailySalesByRider = Array.from(dailyMap.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.riderName.localeCompare(b.riderName);
    });

    // ── Cash totals by rider/day (mirrors listCashCollections) ──
    const cashDayMap = new Map<string, RiderCashTotalByRiderDay>();
    let cashGrandTotal = 0;
    for (const c of cash) {
      cashGrandTotal += c.amount;
      const key = `${c.rider_id}:${c.collection_date}`;
      const existing = cashDayMap.get(key);
      if (existing) existing.total = round2(existing.total + c.amount);
      else cashDayMap.set(key, { riderId: c.rider_id, riderName: c.rider?.full_name ?? "Rider", date: c.collection_date, total: c.amount });
    }
    const cashByRiderDay = Array.from(cashDayMap.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.riderName.localeCompare(b.riderName);
    });

    // ── Cheque totals by rider + overall status totals ──
    const chequeRiderMap = new Map<string, RiderChequeTotalByRider>();
    let chequePendingTotal = 0, chequeClearedTotal = 0, chequeBouncedTotal = 0;
    for (const c of cheques) {
      if (c.status === "pending") chequePendingTotal += c.amount;
      else if (c.status === "cleared") chequeClearedTotal += c.amount;
      else chequeBouncedTotal += c.amount;
      const existing = chequeRiderMap.get(c.rider_id) ?? {
        riderId: c.rider_id,
        riderName: c.rider?.full_name ?? "Rider",
        pendingTotal: 0,
        clearedTotal: 0,
        bouncedTotal: 0,
      };
      if (c.status === "pending") existing.pendingTotal = round2(existing.pendingTotal + c.amount);
      else if (c.status === "cleared") existing.clearedTotal = round2(existing.clearedTotal + c.amount);
      else existing.bouncedTotal = round2(existing.bouncedTotal + c.amount);
      chequeRiderMap.set(c.rider_id, existing);
    }
    const chequeByRider = Array.from(chequeRiderMap.values()).sort((a, b) => a.riderName.localeCompare(b.riderName));

    // ── Rider performance summary — one row per rider in this branch ──
    const cashByRider = new Map<string, number>();
    for (const c of cash) cashByRider.set(c.rider_id, round2((cashByRider.get(c.rider_id) ?? 0) + c.amount));
    const chequeCollectedByRider = new Map<string, number>();
    for (const c of cheques) chequeCollectedByRider.set(c.rider_id, round2((chequeCollectedByRider.get(c.rider_id) ?? 0) + c.amount));

    const riderPerformance: RiderPerformanceRow[] = riders.map((r) => {
      const riderOrders = orders.filter((o) => o.rider_id === r.id);
      const ordersTaken = riderOrders.length;
      const delivered = riderOrders.filter((o) => o.status === "delivered").length;
      const cancelled = riderOrders.filter((o) => o.status === "cancelled").length;
      const pending = riderOrders.filter((o) => o.status === "pending").length;
      const nonCancelled = riderOrders.filter((o) => o.status !== "cancelled");
      const nonCancelledTotal = nonCancelled.reduce((s, o) => s + o.total_amount, 0);
      return {
        riderId: r.id,
        riderName: r.full_name,
        ordersTaken,
        delivered,
        cancelled,
        pending,
        deliveryRatePct: ordersTaken > 0 ? round2((delivered / ordersTaken) * 100) : 0,
        cashCollected: cashByRider.get(r.id) ?? 0,
        chequeCollected: chequeCollectedByRider.get(r.id) ?? 0,
        avgOrderValue: nonCancelled.length > 0 ? round2(nonCancelledTotal / nonCancelled.length) : 0,
      };
    }).sort((a, b) => b.ordersTaken - a.ordersTaken || a.riderName.localeCompare(b.riderName));

    return {
      dailySalesByRider,
      cashByRiderDay,
      cashGrandTotal: round2(cashGrandTotal),
      chequeByRider,
      chequePendingTotal: round2(chequePendingTotal),
      chequeClearedTotal: round2(chequeClearedTotal),
      chequeBouncedTotal: round2(chequeBouncedTotal),
      riderPerformance,
      pendingOrders,
    };
  } catch (e) {
    return { ...EMPTY_REPORTS, error: errMsg(e) };
  }
}
