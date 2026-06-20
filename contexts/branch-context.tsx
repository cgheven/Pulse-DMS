"use client";

import React, { createContext, useContext, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { DmsBranch } from "@/types";

type BranchContextValue = {
  branch: DmsBranch | null;
  branches: DmsBranch[];
  branchId: string | null;
  setActiveBranch: (branchId: string) => void;
};

const BranchContext = createContext<BranchContextValue>({
  branch: null,
  branches: [],
  branchId: null,
  setActiveBranch: () => {},
});

export function BranchProvider({
  children,
  branch,
  branches,
}: {
  children: React.ReactNode;
  branch: DmsBranch | null;
  branches: DmsBranch[];
}) {
  const router = useRouter();

  const setActiveBranch = useCallback(
    (branchId: string) => {
      document.cookie = `dms_active_branch=${branchId}; path=/; max-age=31536000; SameSite=Lax`;
      router.refresh();
    },
    [router]
  );

  return (
    <BranchContext.Provider
      value={{
        branch,
        branches,
        branchId: branch?.id ?? null,
        setActiveBranch,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranchContext() {
  return useContext(BranchContext);
}
