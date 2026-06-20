"use client";

import { useState } from "react";
import { Building2, ChevronUp, ChevronDown, Check, Plus, Zap } from "lucide-react";
import { useBranchContext } from "@/contexts/branch-context";
import { useShopContext } from "@/contexts/shop-context";
import { AddBranchDialog } from "@/components/branches/add-branch-dialog";
import { cn } from "@/lib/utils";

export function BranchSelector() {
  const { branch, branches, setActiveBranch } = useBranchContext();
  const { shop } = useShopContext();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const branchLimit = shop?.branch_limit ?? 1;
  const canAddBranch = branches.length < branchLimit;
  const isMultiBranch = branchLimit > 1 || branches.length > 1;
  const displayName = branch?.name ?? shop?.shop_name ?? "My Shop";

  // Single branch — static label, no dropdown
  if (!isMultiBranch) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 border border-primary/20 shrink-0">
          <Zap className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="font-semibold text-sm truncate text-foreground">
          {displayName}
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 min-w-0 group"
        >
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 border border-primary/20 shrink-0 group-hover:bg-primary/20 transition-colors">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="font-semibold text-sm truncate text-foreground group-hover:text-primary transition-colors">
            {displayName}
          </span>
          {open
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          }
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-2 w-60 z-20 rounded-xl border border-sidebar-border bg-sidebar shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-sidebar-border">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Branches
                </span>
                <span className="text-[10px] font-bold text-muted-foreground">
                  {branches.length} / {branchLimit}
                </span>
              </div>

              {/* Branch list */}
              <div className="py-1">
                {branches.map((b) => {
                  const isActive = b.id === branch?.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => { setActiveBranch(b.id); setOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isActive ? "bg-primary/10" : "hover:bg-white/5"
                      )}
                    >
                      <Building2 className={cn(
                        "w-4 h-4 shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-medium truncate",
                          isActive ? "text-primary" : "text-foreground"
                        )}>
                          {b.name}
                        </p>
                        {b.city && (
                          <p className="text-xs text-muted-foreground truncate">{b.city}</p>
                        )}
                      </div>
                      {isActive && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Add branch */}
              {canAddBranch && (
                <div className="border-t border-sidebar-border py-1">
                  <button
                    onClick={() => { setOpen(false); setAddOpen(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    Add Branch
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <AddBranchDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
