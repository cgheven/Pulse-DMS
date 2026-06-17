"use client";
import { useShopContext } from "@/contexts/shop-context";

export function useShopData() {
  return useShopContext();
}
