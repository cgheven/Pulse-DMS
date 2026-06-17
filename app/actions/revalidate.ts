"use server";
import { revalidateTag, revalidatePath } from "next/cache";

export async function revalidateDashboard() { revalidatePath("/dashboard"); }
export async function revalidateSales()     { revalidatePath("/sales"); }
export async function revalidateStock()     { revalidatePath("/stock"); }
export async function revalidateExpenses()  { revalidatePath("/expenses"); }

export async function revalidateProfile(userId: string) {
  if (userId) revalidateTag(`profile-${userId}`);
}
