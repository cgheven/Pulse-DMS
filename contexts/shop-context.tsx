"use client";
import React, { createContext, useContext, useMemo } from "react";
import type { Profile, Shop } from "@/types";

interface ShopContextValue {
  profile: Profile | null;
  shop: Shop | null;
  shopId: string | null;
  /** Module keys enabled for this shop (e.g. "rider_management"). Drives
   *  conditional nav rendering — the real gate is always server-side. */
  enabledModules: string[];
}

const ShopContext = createContext<ShopContextValue>({
  profile: null,
  shop: null,
  shopId: null,
  enabledModules: [],
});

export function ShopProvider({
  children,
  profile,
  shop,
  enabledModules = [],
}: {
  children: React.ReactNode;
  profile: Profile | null;
  shop: Shop | null;
  enabledModules?: string[];
}) {
  const value = useMemo(
    () => ({ profile, shop, shopId: shop?.id ?? null, enabledModules }),
    [profile, shop, enabledModules]
  );
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShopContext() {
  return useContext(ShopContext);
}
