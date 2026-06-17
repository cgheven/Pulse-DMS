"use client";
import React, { createContext, useContext, useMemo } from "react";
import type { Profile, Shop } from "@/types";

interface ShopContextValue {
  profile: Profile | null;
  shop: Shop | null;
  shopId: string | null;
}

const ShopContext = createContext<ShopContextValue>({
  profile: null,
  shop: null,
  shopId: null,
});

export function ShopProvider({
  children,
  profile,
  shop,
}: {
  children: React.ReactNode;
  profile: Profile | null;
  shop: Shop | null;
}) {
  const value = useMemo(
    () => ({ profile, shop, shopId: shop?.id ?? null }),
    [profile, shop]
  );
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShopContext() {
  return useContext(ShopContext);
}
