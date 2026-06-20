"use server";
import { getSales } from "@/lib/data";
import type { Sale } from "@/types";

export async function fetchSales(
  branchId: string,
  from: string,
  to: string
): Promise<Sale[]> {
  return getSales(branchId, { from, to });
}
