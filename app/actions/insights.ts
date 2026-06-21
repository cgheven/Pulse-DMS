"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/data";

export interface ProductInsight {
  productId: string;
  productName: string;
  revenue: number;
  unitsSold: number;
}

export interface StaffInsight {
  name: string;
  transactions: number;
  revenue: number;
  avgPerTransaction: number;
}

export interface PaymentModeInsight {
  mode: "cash" | "credit";
  count: number;
  revenue: number;
}

export interface InsightsData {
  totalRevenue: number;
  totalTransactions: number;
  avgTransactionValue: number;
  uniqueProductsSold: number;
  topProducts: ProductInsight[];
  bottomProducts: ProductInsight[];
  staffPerformance: StaffInsight[];
  paymentModes: PaymentModeInsight[];
}

export async function getInsightsData(
  from: string,
  to: string
): Promise<{ data: InsightsData | null; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (ctx.profile?.role !== "owner") redirect("/dashboard");

  const branchId = ctx.branchId;
  if (!branchId) return { data: null, error: "No active branch found." };

  const supabase = await createClient();

  // Fetch sales joined with product names for the branch and date range
  const { data: salesRows, error } = await supabase
    .from("dms_sales")
    .select(
      "id, product_id, quantity, unit_price, total, payment_mode, sale_date, added_by_name, unit_cost, dms_products(id, name)"
    )
    .eq("branch_id", branchId)
    .gte("sale_date", from)
    .lte("sale_date", to);

  if (error) return { data: null, error: error.message };
  if (!salesRows || salesRows.length === 0) {
    return {
      data: {
        totalRevenue: 0,
        totalTransactions: 0,
        avgTransactionValue: 0,
        uniqueProductsSold: 0,
        topProducts: [],
        bottomProducts: [],
        staffPerformance: [],
        paymentModes: [],
      },
    };
  }

  // ── Aggregate totals ──────────────────────────────────────────────────────
  const totalRevenue = salesRows.reduce((sum, s) => sum + (s.total ?? 0), 0);
  const totalTransactions = salesRows.length;
  const avgTransactionValue =
    totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // ── Product aggregation ───────────────────────────────────────────────────
  const productMap = new Map<
    string,
    { name: string; revenue: number; units: number }
  >();

  for (const sale of salesRows) {
    const pid = sale.product_id as string;
    // dms_products is a joined object (may be array or object depending on Supabase)
    const productName =
      (Array.isArray(sale.dms_products)
        ? sale.dms_products[0]?.name
        : (sale.dms_products as { name?: string } | null)?.name) ?? "Unknown";

    const existing = productMap.get(pid);
    if (existing) {
      existing.revenue += sale.total ?? 0;
      existing.units += sale.quantity ?? 0;
    } else {
      productMap.set(pid, {
        name: productName,
        revenue: sale.total ?? 0,
        units: sale.quantity ?? 0,
      });
    }
  }

  const uniqueProductsSold = productMap.size;

  const allProductsSorted: ProductInsight[] = Array.from(
    productMap.entries()
  )
    .map(([pid, v]) => ({
      productId: pid,
      productName: v.name,
      revenue: v.revenue,
      unitsSold: v.units,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const topProducts = allProductsSorted.slice(0, 10);
  // Bottom 3: least revenue among products that HAVE sales
  const bottomProducts =
    allProductsSorted.length > 3
      ? allProductsSorted.slice(-3).reverse()
      : [];

  // ── Staff aggregation ─────────────────────────────────────────────────────
  const staffMap = new Map<
    string,
    { transactions: number; revenue: number }
  >();

  for (const sale of salesRows) {
    const name = sale.added_by_name as string | null;
    if (!name) continue;
    const existing = staffMap.get(name);
    if (existing) {
      existing.transactions += 1;
      existing.revenue += sale.total ?? 0;
    } else {
      staffMap.set(name, { transactions: 1, revenue: sale.total ?? 0 });
    }
  }

  const staffPerformance: StaffInsight[] = Array.from(staffMap.entries())
    .map(([name, v]) => ({
      name,
      transactions: v.transactions,
      revenue: v.revenue,
      avgPerTransaction:
        v.transactions > 0 ? v.revenue / v.transactions : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Payment mode aggregation ──────────────────────────────────────────────
  const cashStats = { count: 0, revenue: 0 };
  const creditStats = { count: 0, revenue: 0 };

  for (const sale of salesRows) {
    if (sale.payment_mode === "cash") {
      cashStats.count += 1;
      cashStats.revenue += sale.total ?? 0;
    } else {
      creditStats.count += 1;
      creditStats.revenue += sale.total ?? 0;
    }
  }

  const paymentModes: PaymentModeInsight[] = [
    { mode: "cash", count: cashStats.count, revenue: cashStats.revenue },
    { mode: "credit", count: creditStats.count, revenue: creditStats.revenue },
  ];

  return {
    data: {
      totalRevenue,
      totalTransactions,
      avgTransactionValue,
      uniqueProductsSold,
      topProducts,
      bottomProducts,
      staffPerformance,
      paymentModes,
    },
  };
}
