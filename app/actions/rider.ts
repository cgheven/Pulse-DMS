"use server";

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModuleOrThrow } from "@/lib/modules";
import { isUUID, daysSince } from "@/lib/utils";
import type { RiderCashCollection, RiderChequeCollection, RiderClient, RiderOrder, RiderOrderItem, RiderOrderPaymentMethod } from "@/types";

// Deduped with React cache() so every getXxx() call and the (rider) layout's
// own check collapse into a single getUser()+profile+rider round-trip per
// request — mirrors getSalesAuthContext() in app/actions/sales-rep.ts.
export const getRiderAuthContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const [{ data: profile }, { data: rider }] = await Promise.all([
    admin
      .from("dms_profiles")
      .select("is_rider, is_admin, full_name, shop_id")
      .eq("id", user.id)
      .single(),
    admin
      .from("dms_riders")
      .select("id, shop_id, branch_id, full_name, phone, vehicle_number, is_active")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  return { user, profile, rider };
});

// Every rider-facing server action must call this first and derive
// rider_id/shop_id/branch_id ONLY from its return value — never from
// client-supplied input. This is the single choke point that guarantees a
// rider can only ever see/act on their own data.
export async function requireRider() {
  const ctx = await getRiderAuthContext();
  if (!ctx?.user) throw new Error("Unauthorized");
  if (!ctx.profile?.is_rider || !ctx.rider || !ctx.rider.is_active) {
    throw new Error("Forbidden: rider access required");
  }
  await requireModuleOrThrow(ctx.rider.shop_id, "rider_management");
  return { user: ctx.user, rider: ctx.rider };
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as any).message);
  return String(e);
}

export type RiderDashboardInfo = {
  fullName: string;
  phone: string;
  vehicleNumber: string | null;
  branchName: string | null;
  shopName: string | null;
  isActive: boolean;
};

// Read-only "who am I / where do I work" summary for the rider dashboard.
// Scoped exclusively to the caller's own dms_riders row via requireRider() —
// no rider ID is ever accepted from the client.
export async function getMyRiderInfo(): Promise<{ info: RiderDashboardInfo | null; error?: string }> {
  try {
    const { rider } = await requireRider();
    const admin = createAdminClient();

    const [{ data: branch }, { data: shop }] = await Promise.all([
      admin.from("dms_branches").select("name").eq("id", rider.branch_id).maybeSingle(),
      admin.from("dms_shops").select("shop_name").eq("id", rider.shop_id).maybeSingle(),
    ]);

    return {
      info: {
        fullName: rider.full_name,
        phone: rider.phone,
        vehicleNumber: rider.vehicle_number,
        branchName: branch?.name ?? null,
        shopName: shop?.shop_name ?? null,
        isActive: rider.is_active,
      },
    };
  } catch (e) {
    return { info: null, error: errMsg(e) };
  }
}

// ─── Client directory (dms_clients) ───────────────────────────────────────────
// Type-ahead search + inline "add new" for the order-taking form. Both scoped
// exclusively to the caller's own rider.branch_id via requireRider() — a
// rider never sees or creates clients outside their assigned branch.

export async function searchMyClients(query: string): Promise<{ clients: RiderClient[]; error?: string }> {
  try {
    const { rider } = await requireRider();
    const admin = createAdminClient();
    // Strip PostgREST filter-syntax metacharacters (',', '(', ')') before
    // interpolating into .or() — otherwise a rider could inject additional
    // filter clauses via a crafted search string. branch_id/is_active are
    // separate .eq() calls (always ANDed) so impact would be bounded to
    // this rider's own branch regardless, but the value should never be
    // trusted as raw filter syntax.
    const q = query.trim().slice(0, 100).replace(/[,()]/g, "");
    let builder = admin
      .from("dms_clients")
      .select("*")
      .eq("branch_id", rider.branch_id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(20);
    if (q) builder = builder.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    const { data, error } = await builder;
    if (error) throw error;
    return { clients: (data ?? []) as RiderClient[] };
  } catch (e) {
    return { clients: [], error: errMsg(e) };
  }
}

export async function createMyClient(input: {
  name: string;
  businessName?: string;
  phone?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string;
}): Promise<{ clientId?: string; error?: string }> {
  try {
    const { user, rider } = await requireRider();
    const name = input.name.trim().slice(0, 150);
    const businessName = (input.businessName ?? "").trim().slice(0, 150) || null;
    const phone = (input.phone ?? "").trim().slice(0, 20) || null;
    const address = (input.address ?? "").trim().slice(0, 500) || null;
    const notes = (input.notes ?? "").trim().slice(0, 1000) || null;
    if (!name) return { error: "Client name is required" };
    if (phone && phone.length < 7) return { error: "Phone number is too short" };

    // GPS is optional and best-effort — never blocks saving the client.
    const latitude = typeof input.latitude === "number" && Number.isFinite(input.latitude) && input.latitude >= -90 && input.latitude <= 90
      ? input.latitude : null;
    const longitude = typeof input.longitude === "number" && Number.isFinite(input.longitude) && input.longitude >= -180 && input.longitude <= 180
      ? input.longitude : null;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("dms_clients")
      .insert({
        shop_id: rider.shop_id,
        branch_id: rider.branch_id,
        name,
        business_name: businessName,
        phone,
        address,
        latitude,
        longitude,
        notes,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    revalidatePath("/rider/orders/new");
    return { clientId: data.id as string };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ─── Product lookup (dms_products) — READ-ONLY, never mutated here ───────────

export type RiderOrderProductOption = {
  id: string;
  name: string;
  size: string | null;
  unit: string;
  sale_price: number;
};

export async function searchProductsForOrder(query: string): Promise<{ products: RiderOrderProductOption[]; error?: string }> {
  try {
    const { rider } = await requireRider();
    const admin = createAdminClient();
    const q = query.trim().slice(0, 100);
    let builder = admin
      .from("dms_products")
      .select("id, name, size, unit, sale_price")
      .eq("branch_id", rider.branch_id)
      .order("name", { ascending: true })
      .limit(20);
    if (q) builder = builder.ilike("name", `%${q}%`);
    const { data, error } = await builder;
    if (error) throw error;
    return { products: (data ?? []) as RiderOrderProductOption[] };
  } catch (e) {
    return { products: [], error: errMsg(e) };
  }
}

// ─── Order creation ───────────────────────────────────────────────────────────
// Standalone: never touches dms_sales/dms_stock_movements/dms_stock_levels.
// GPS lat/lng are optional (denial/unavailability never blocks submission).
// Server recomputes every line_total/total_amount from quantity*unit_price —
// client-submitted math is never trusted.

export type CreateOrderItemInput = {
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

export async function createOrder(input: {
  clientId: string;
  items: CreateOrderItemInput[];
  paymentMethod: RiderOrderPaymentMethod;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string;
}): Promise<{ orderId?: string; error?: string }> {
  try {
    const { rider } = await requireRider();
    const admin = createAdminClient();

    if (!input.clientId || !isUUID(input.clientId)) return { error: "Please select a client" };
    const { data: client } = await admin
      .from("dms_clients")
      .select("id")
      .eq("id", input.clientId)
      .eq("branch_id", rider.branch_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!client) return { error: "Client not found" };

    if (!Array.isArray(input.items) || input.items.length === 0) return { error: "Add at least one item" };
    if (!["cash", "cheque", "credit"].includes(input.paymentMethod)) return { error: "Invalid payment method" };

    const cleanItems: { product_id: string | null; product_name: string; quantity: number; unit_price: number; line_total: number }[] = [];
    let totalAmount = 0;
    for (const raw of input.items) {
      const productName = (raw.productName ?? "").trim().slice(0, 200);
      const quantity = Number(raw.quantity);
      const unitPrice = Number(raw.unitPrice);
      if (!productName) return { error: "Every item needs a product name" };
      if (!Number.isFinite(quantity) || quantity <= 0) return { error: `Invalid quantity for ${productName}` };
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return { error: `Invalid price for ${productName}` };
      const productId = raw.productId && isUUID(raw.productId) ? raw.productId : null;
      const lineTotal = Math.round(quantity * unitPrice * 100) / 100;
      totalAmount += lineTotal;
      cleanItems.push({ product_id: productId, product_name: productName, quantity, unit_price: unitPrice, line_total: lineTotal });
    }
    totalAmount = Math.round(totalAmount * 100) / 100;

    // A client-claimed productId only proves well-formed UUID syntax, not that
    // it's a real product this rider's branch can see — without this check a
    // rider could invent a plausible-looking UUID to make a custom item
    // masquerade as a catalog pick and dodge the has_custom_item flag. Verify
    // against the actual catalog, scoped to this rider's own branch (never
    // trust the claim), and silently fall back to treating the item as custom
    // rather than rejecting the order — a stale/deleted product ID should
    // never block a rider from completing a sale.
    const candidateIds = [...new Set(cleanItems.map((it) => it.product_id).filter((id): id is string => id !== null))];
    if (candidateIds.length > 0) {
      const { data: realProducts } = await admin
        .from("dms_products")
        .select("id")
        .in("id", candidateIds)
        .eq("branch_id", rider.branch_id);
      const verifiedIds = new Set((realProducts ?? []).map((p) => p.id as string));
      for (const item of cleanItems) {
        if (item.product_id !== null && !verifiedIds.has(item.product_id)) {
          item.product_id = null;
        }
      }
    }
    const hasCustomItem = cleanItems.some((it) => it.product_id === null);

    const latitude = typeof input.latitude === "number" && Number.isFinite(input.latitude) ? input.latitude : null;
    const longitude = typeof input.longitude === "number" && Number.isFinite(input.longitude) ? input.longitude : null;
    const notes = (input.notes ?? "").trim().slice(0, 1000) || null;

    const { data: order, error: orderErr } = await admin
      .from("dms_rider_orders")
      .insert({
        shop_id: rider.shop_id,
        branch_id: rider.branch_id,
        rider_id: rider.id,
        client_id: input.clientId,
        status: "pending",
        payment_method: input.paymentMethod,
        total_amount: totalAmount,
        has_custom_item: hasCustomItem,
        latitude,
        longitude,
        notes,
      })
      .select("id")
      .single();
    if (orderErr || !order) throw orderErr ?? new Error("Failed to create order");

    const { error: itemsErr } = await admin.from("dms_rider_order_items").insert(
      cleanItems.map((it) => ({ ...it, order_id: order.id }))
    );
    if (itemsErr) {
      // No partial orders — roll back the just-created header.
      await admin.from("dms_rider_orders").delete().eq("id", order.id);
      throw itemsErr;
    }

    revalidatePath("/rider/orders");
    return { orderId: order.id as string };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ─── My orders (rider-side) ───────────────────────────────────────────────────

export async function getMyOrders(filters?: {
  status?: RiderOrder["status"];
  from?: string;
  to?: string;
}): Promise<{ orders: RiderOrder[]; error?: string }> {
  try {
    const { rider } = await requireRider();
    const admin = createAdminClient();
    let builder = admin
      .from("dms_rider_orders")
      .select("*, client:dms_clients(id, name, phone)")
      .eq("rider_id", rider.id)
      .order("created_at", { ascending: false })
      .limit(200);
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

export async function getOrderDetail(orderId: string): Promise<{ order: RiderOrder | null; items: RiderOrderItem[]; error?: string }> {
  try {
    if (!isUUID(orderId)) return { order: null, items: [], error: "Invalid ID" };
    const { rider } = await requireRider();
    const admin = createAdminClient();
    const { data: order, error } = await admin
      .from("dms_rider_orders")
      .select("*, client:dms_clients(id, name, phone, address)")
      .eq("id", orderId)
      .eq("rider_id", rider.id)
      .single();
    if (error || !order) return { order: null, items: [], error: "Order not found" };
    const { data: items } = await admin
      .from("dms_rider_order_items")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    const mapsUrl = order.latitude != null && order.longitude != null ? `https://www.google.com/maps?q=${order.latitude},${order.longitude}` : null;
    return { order: { ...order, mapsUrl } as RiderOrder, items: (items ?? []) as RiderOrderItem[] };
  } catch (e) {
    return { order: null, items: [], error: errMsg(e) };
  }
}

export async function updateOrderStatus(
  orderId: string,
  status: "delivered" | "cancelled",
  extra?: { cancelledReason?: string }
): Promise<{ error?: string }> {
  try {
    if (!isUUID(orderId)) return { error: "Invalid ID" };
    if (!["delivered", "cancelled"].includes(status)) return { error: "Invalid status" };
    const { rider } = await requireRider();
    const admin = createAdminClient();

    // Ownership-verified: only the rider who took the order can transition it,
    // and only out of 'pending' (no re-opening a delivered/cancelled order).
    const { data: existing } = await admin
      .from("dms_rider_orders")
      .select("id, status")
      .eq("id", orderId)
      .eq("rider_id", rider.id)
      .maybeSingle();
    if (!existing) return { error: "Order not found" };
    if (existing.status !== "pending") return { error: `Order is already ${existing.status}` };

    const updates: Record<string, unknown> = { status };
    if (status === "delivered") {
      updates.delivered_at = new Date().toISOString();
    } else {
      updates.cancelled_at = new Date().toISOString();
      updates.cancelled_reason = (extra?.cancelledReason ?? "").trim().slice(0, 500) || null;
    }
    const { error } = await admin.from("dms_rider_orders").update(updates).eq("id", orderId).eq("rider_id", rider.id);
    if (error) throw error;
    revalidatePath("/rider/orders");
    revalidatePath(`/rider/orders/${orderId}`);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ─── Cash collection (dms_rider_cash_collections) ────────────────────────────
// Individual collection-event rows — standalone from dms_sales. rider_id/
// shop_id/branch_id are derived exclusively from requireRider(); orderId/
// clientId are both re-verified server-side against the caller's own rider
// before being trusted (never inserted from raw client input).

export async function recordCashCollection(input: {
  orderId?: string;
  clientId?: string;
  amount: number;
  note?: string;
}): Promise<{ id?: string; error?: string }> {
  try {
    const { rider } = await requireRider();
    const admin = createAdminClient();

    const amount = Math.round(Number(input.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount" };

    let orderId: string | null = null;
    let clientId: string | null = null;

    if (input.orderId) {
      if (!isUUID(input.orderId)) return { error: "Invalid order" };
      const { data: order } = await admin
        .from("dms_rider_orders")
        .select("id, client_id")
        .eq("id", input.orderId)
        .eq("rider_id", rider.id)
        .maybeSingle();
      if (!order) return { error: "Order not found" };
      orderId = order.id as string;
      clientId = order.client_id as string; // default anchor from the order unless overridden below
    }

    if (input.clientId) {
      if (!isUUID(input.clientId)) return { error: "Invalid client" };
      const { data: client } = await admin
        .from("dms_clients")
        .select("id")
        .eq("id", input.clientId)
        .eq("branch_id", rider.branch_id)
        .maybeSingle();
      if (!client) return { error: "Client not found" };
      clientId = client.id as string;
    }

    if (!orderId && !clientId) return { error: "Select a client or an order" };

    // Idempotency guard: the order-detail "mark delivered" flow calls this
    // then updateOrderStatus() in sequence. If the first call succeeds but
    // the second fails (e.g. a dropped connection) and the rider retries,
    // this prevents a second row (and double-counted totals) for the same
    // order — return the existing collection instead of inserting again.
    if (orderId) {
      const { data: existing } = await admin
        .from("dms_rider_cash_collections")
        .select("id")
        .eq("order_id", orderId)
        .eq("rider_id", rider.id)
        .maybeSingle();
      if (existing) return { id: existing.id as string };
    }

    const note = (input.note ?? "").trim().slice(0, 500) || null;

    const { data, error } = await admin
      .from("dms_rider_cash_collections")
      .insert({
        shop_id: rider.shop_id,
        branch_id: rider.branch_id,
        rider_id: rider.id,
        order_id: orderId,
        client_id: clientId,
        amount,
        note,
      })
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/rider/cash");
    revalidatePath("/rider/dashboard");
    if (orderId) revalidatePath(`/rider/orders/${orderId}`);
    return { id: data.id as string };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function getMyCashCollections(filters?: {
  from?: string;
  to?: string;
}): Promise<{ collections: RiderCashCollection[]; error?: string }> {
  try {
    const { rider } = await requireRider();
    const admin = createAdminClient();
    let builder = admin
      .from("dms_rider_cash_collections")
      .select("*, client:dms_clients(id, name, phone), order:dms_rider_orders(id, total_amount)")
      .eq("rider_id", rider.id)
      .order("collection_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (filters?.from) builder = builder.gte("collection_date", filters.from);
    if (filters?.to) builder = builder.lte("collection_date", filters.to);
    const { data, error } = await builder;
    if (error) throw error;
    return { collections: (data ?? []) as RiderCashCollection[] };
  } catch (e) {
    return { collections: [], error: errMsg(e) };
  }
}

// ─── Cheque collection (dms_rider_cheque_collections) ────────────────────────
// Individual collection-event rows — standalone from dms_sales. rider_id/
// shop_id/branch_id are derived exclusively from requireRider(); orderId/
// clientId are both re-verified server-side against the caller's own rider
// before being trusted (never inserted from raw client input). Unlike cash
// collection, clientId is REQUIRED here — a cheque must always be traceable
// to the client who issued it. Owner-only marks status cleared/bounced (see
// updateChequeStatus in app/actions/riders.ts) — a rider can only ever
// record a cheque as 'pending', never change its status.

export async function recordChequeCollection(input: {
  orderId?: string;
  clientId: string;
  chequeNumber: string;
  bankName?: string;
  chequeDate: string;
  amount: number;
  note?: string;
}): Promise<{ id?: string; error?: string }> {
  try {
    const { rider } = await requireRider();
    const admin = createAdminClient();

    if (!input.clientId || !isUUID(input.clientId)) return { error: "Select a client" };
    const { data: client } = await admin
      .from("dms_clients")
      .select("id")
      .eq("id", input.clientId)
      .eq("branch_id", rider.branch_id)
      .maybeSingle();
    if (!client) return { error: "Client not found" };

    let orderId: string | null = null;
    if (input.orderId) {
      if (!isUUID(input.orderId)) return { error: "Invalid order" };
      const { data: order } = await admin
        .from("dms_rider_orders")
        .select("id")
        .eq("id", input.orderId)
        .eq("rider_id", rider.id)
        .maybeSingle();
      if (!order) return { error: "Order not found" };
      orderId = order.id as string;
    }

    const chequeNumber = (input.chequeNumber ?? "").trim().slice(0, 50);
    if (!chequeNumber) return { error: "Cheque number is required" };
    const bankName = (input.bankName ?? "").trim().slice(0, 100) || null;
    const chequeDate = (input.chequeDate ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chequeDate)) return { error: "Enter a valid cheque date" };
    const amount = Math.round(Number(input.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount" };
    const note = (input.note ?? "").trim().slice(0, 500) || null;

    // Idempotency guard: same reasoning as recordCashCollection — the
    // order-detail "mark delivered" flow calls this then updateOrderStatus()
    // in sequence, and a retry after a dropped connection must not create a
    // second cheque row (and double-count) for the same order.
    if (orderId) {
      const { data: existing } = await admin
        .from("dms_rider_cheque_collections")
        .select("id")
        .eq("order_id", orderId)
        .eq("rider_id", rider.id)
        .maybeSingle();
      if (existing) return { id: existing.id as string };
    }

    const { data, error } = await admin
      .from("dms_rider_cheque_collections")
      .insert({
        shop_id: rider.shop_id,
        branch_id: rider.branch_id,
        rider_id: rider.id,
        order_id: orderId,
        client_id: input.clientId,
        cheque_number: chequeNumber,
        bank_name: bankName,
        cheque_date: chequeDate,
        amount,
        note,
      })
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/rider/cheque");
    revalidatePath("/rider/dashboard");
    if (orderId) revalidatePath(`/rider/orders/${orderId}`);
    return { id: data.id as string };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function getMyChequeCollections(filters?: {
  status?: RiderChequeCollection["status"];
}): Promise<{ cheques: RiderChequeCollection[]; error?: string }> {
  try {
    const { rider } = await requireRider();
    const admin = createAdminClient();
    let builder = admin
      .from("dms_rider_cheque_collections")
      .select("*, client:dms_clients(id, name, phone), order:dms_rider_orders(id, total_amount)")
      .eq("rider_id", rider.id)
      .order("collection_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
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
