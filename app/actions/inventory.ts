"use server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import type { InventoryCategory, PaymentMethod } from "@/types";

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function requireOwner() {
  const ctx = await getAuthContext();
  if (!ctx?.user || !ctx.gymId || ctx.isDemo) return null;
  return ctx as typeof ctx & { gymId: string };
}

/**
 * Owner OR active staff member of this gym. Staff can record sales.
 * Returns staff record if user is staff (not owner), null if owner.
 */
async function requireOwnerOrStaff() {
  const ctx = await getAuthContext();
  if (!ctx?.user || !ctx.gymId || ctx.isDemo) return null;
  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("pulse_staff")
    .select("id, role, full_name")
    .eq("user_id", ctx.user.id)
    .eq("gym_id", ctx.gymId)
    .eq("status", "active")
    .maybeSingle();
  return {
    ...(ctx as typeof ctx & { gymId: string }),
    staff: staff as { id: string; role: string; full_name: string } | null,
  };
}

function revalidate(gymId: string) {
  revalidateTag(`inventory-${gymId}`);
  revalidateTag(`dashboard-${gymId}`);
}

// ── Items ─────────────────────────────────────────────────────────────────────

interface AddItemPayload {
  name: string;
  category: InventoryCategory;
  sale_price: number;
  low_stock_threshold: number;
  expiry_tracked: boolean;
}

export async function addItem(payload: AddItemPayload) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  if (!payload.name?.trim()) return { error: "Item name is required" };
  if (payload.sale_price < 0) return { error: "Sale price cannot be negative" };
  if (payload.low_stock_threshold < 0) return { error: "Threshold cannot be negative" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pulse_inventory_items")
    .insert({
      gym_id: ctx.gymId,
      name: payload.name.trim(),
      category: payload.category,
      sale_price: payload.sale_price,
      low_stock_threshold: payload.low_stock_threshold,
      expiry_tracked: payload.expiry_tracked,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id,
    actor_email: ctx.user.email ?? "",
    action: "inventory.item_added",
    entity: "inventory_item",
    entity_id: data.id,
    meta: { name: payload.name, category: payload.category, sale_price: payload.sale_price },
  });
  revalidate(ctx.gymId);
  return { success: true, itemId: data.id };
}

interface UpdateItemPayload {
  name?: string;
  category?: InventoryCategory;
  sale_price?: number;
  low_stock_threshold?: number;
  expiry_tracked?: boolean;
}

export async function updateItem(itemId: string, payload: UpdateItemPayload) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined) update.name = payload.name.trim();
  if (payload.category !== undefined) update.category = payload.category;
  if (payload.sale_price !== undefined) {
    if (payload.sale_price < 0) return { error: "Sale price cannot be negative" };
    update.sale_price = payload.sale_price;
  }
  if (payload.low_stock_threshold !== undefined) {
    if (payload.low_stock_threshold < 0) return { error: "Threshold cannot be negative" };
    update.low_stock_threshold = payload.low_stock_threshold;
  }
  if (payload.expiry_tracked !== undefined) update.expiry_tracked = payload.expiry_tracked;

  const { error } = await admin
    .from("pulse_inventory_items")
    .update(update)
    .eq("id", itemId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id,
    actor_email: ctx.user.email ?? "",
    action: "inventory.item_updated",
    entity: "inventory_item",
    entity_id: itemId,
    meta: payload as Record<string, unknown>,
  });
  revalidate(ctx.gymId);
  return { success: true };
}

export async function archiveItem(itemId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  const { data: item } = await admin
    .from("pulse_inventory_items")
    .select("name")
    .eq("id", itemId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!item) return { error: "Item not found" };

  const { error } = await admin
    .from("pulse_inventory_items")
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id,
    actor_email: ctx.user.email ?? "",
    action: "inventory.item_archived",
    entity: "inventory_item",
    entity_id: itemId,
    meta: { name: item.name },
  });
  revalidate(ctx.gymId);
  return { success: true };
}

// ── Stock In (purchase batch) ─────────────────────────────────────────────────

interface AddBatchPayload {
  item_id: string;
  quantity_purchased: number;
  purchase_cost_per_unit: number;
  expiry_date?: string | null;
  purchase_date?: string;
  supplier_name?: string;
  notes?: string;
}

export async function addStockBatch(payload: AddBatchPayload) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  if (payload.quantity_purchased <= 0) return { error: "Quantity must be greater than 0" };
  if (payload.purchase_cost_per_unit < 0) return { error: "Cost cannot be negative" };

  const admin = createAdminClient();

  // Validate item belongs to this gym + check expiry tracking
  const { data: item } = await admin
    .from("pulse_inventory_items")
    .select("id, name, expiry_tracked, archived")
    .eq("id", payload.item_id)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!item) return { error: "Item not found" };
  if (item.archived) return { error: "Cannot add stock to archived item" };
  if (item.expiry_tracked && !payload.expiry_date) {
    return { error: "This item tracks expiry — expiry date is required" };
  }

  const { data, error } = await admin
    .from("pulse_inventory_batches")
    .insert({
      gym_id: ctx.gymId,
      item_id: payload.item_id,
      quantity_purchased: payload.quantity_purchased,
      quantity_remaining: payload.quantity_purchased,
      purchase_cost_per_unit: payload.purchase_cost_per_unit,
      expiry_date: payload.expiry_date ?? null,
      purchase_date: payload.purchase_date ?? new Date().toISOString().slice(0, 10),
      supplier_name: payload.supplier_name?.trim() || null,
      notes: payload.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id,
    actor_email: ctx.user.email ?? "",
    action: "inventory.stock_in",
    entity: "inventory_batch",
    entity_id: data.id,
    meta: {
      item_id: payload.item_id,
      item_name: item.name,
      quantity: payload.quantity_purchased,
      cost_per_unit: payload.purchase_cost_per_unit,
      total_cost: payload.quantity_purchased * payload.purchase_cost_per_unit,
      expiry_date: payload.expiry_date,
      supplier: payload.supplier_name,
    },
  });
  revalidate(ctx.gymId);
  return { success: true, batchId: data.id };
}

// ── Sale (FIFO/FEFO via RPC) ──────────────────────────────────────────────────

interface RecordSalePayload {
  item_id: string;
  quantity: number;
  sale_price_per_unit: number;
  payment_method: PaymentMethod;
  member_id?: string | null;
  notes?: string;
}

export async function recordSale(payload: RecordSalePayload) {
  const ctx = await requireOwnerOrStaff();
  if (!ctx) return { error: "Unauthorized" };
  if (payload.quantity <= 0) return { error: "Quantity must be greater than 0" };
  if (payload.sale_price_per_unit < 0) return { error: "Sale price cannot be negative" };

  const admin = createAdminClient();

  // Defense-in-depth: verify item belongs to this gym before RPC.
  // RPC also validates this, but pre-check gives clearer errors and prevents
  // any cross-tenant item_id from reaching the RPC.
  const { data: item } = await admin
    .from("pulse_inventory_items")
    .select("id, archived")
    .eq("id", payload.item_id)
    .eq("gym_id", ctx.gymId)
    .maybeSingle();
  if (!item) return { error: "Item not found" };
  if (item.archived) return { error: "Item is archived" };

  // If member_id provided, verify they belong to this gym
  if (payload.member_id) {
    const { data: m } = await admin
      .from("pulse_members")
      .select("id")
      .eq("id", payload.member_id)
      .eq("gym_id", ctx.gymId)
      .maybeSingle();
    if (!m) return { error: "Member not found" };
  }

  const { data: saleId, error } = await admin.rpc("record_inventory_sale", {
    p_gym_id: ctx.gymId,
    p_item_id: payload.item_id,
    p_quantity: payload.quantity,
    p_sale_price: payload.sale_price_per_unit,
    p_payment_method: payload.payment_method,
    p_member_id: payload.member_id ?? null,
    p_sold_by_staff_id: ctx.staff?.id ?? null,
    p_sold_by_user_id: ctx.user.id,
    p_notes: payload.notes?.trim() || null,
  });

  if (error) {
    // Map Postgres exceptions to user-friendly messages
    const msg = error.message || "";
    if (msg.includes("Insufficient stock")) {
      const match = msg.match(/available (\d+), requested (\d+)/);
      return { error: match ? `Only ${match[1]} units in stock (you tried to sell ${match[2]})` : msg };
    }
    if (msg.includes("Item not found or archived")) return { error: "Item not found or archived" };
    if (msg.includes("Invalid")) return { error: msg };
    return { error: msg };
  }

  await writeAuditLog({
    actor_id: ctx.user.id,
    actor_email: ctx.user.email ?? "",
    action: "inventory.sale_recorded",
    entity: "inventory_sale",
    entity_id: saleId as string,
    meta: {
      item_id: payload.item_id,
      quantity: payload.quantity,
      sale_price: payload.sale_price_per_unit,
      total: payload.quantity * payload.sale_price_per_unit,
      member_id: payload.member_id,
      sold_by_role: ctx.staff ? "staff" : "owner",
    },
  });
  revalidate(ctx.gymId);
  return { success: true, saleId: saleId as string };
}

// ── Adjust stock (manual count fix) ───────────────────────────────────────────

export async function adjustStock(batchId: string, newQuantity: number, reason: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  if (newQuantity < 0) return { error: "Quantity cannot be negative" };
  if (!reason?.trim()) return { error: "Reason is required" };

  const admin = createAdminClient();
  const { data: batch } = await admin
    .from("pulse_inventory_batches")
    .select("id, quantity_remaining, quantity_purchased, item_id, item:pulse_inventory_items(name)")
    .eq("id", batchId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!batch) return { error: "Batch not found" };
  if (newQuantity > batch.quantity_purchased) {
    return { error: `Cannot exceed original purchase quantity (${batch.quantity_purchased})` };
  }

  const oldQty = batch.quantity_remaining;
  const { error } = await admin
    .from("pulse_inventory_batches")
    .update({ quantity_remaining: newQuantity })
    .eq("id", batchId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id,
    actor_email: ctx.user.email ?? "",
    action: "inventory.stock_adjusted",
    entity: "inventory_batch",
    entity_id: batchId,
    meta: {
      item_id: batch.item_id,
      old_quantity: oldQty,
      new_quantity: newQuantity,
      delta: newQuantity - oldQty,
      reason: reason.trim(),
    },
  });
  revalidate(ctx.gymId);
  return { success: true };
}
