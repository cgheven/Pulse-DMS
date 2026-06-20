"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Building2 } from "lucide-react";
import {
  adminCreateBranch,
  adminDeleteBranch,
  adminListBranchesForShop,
  adminUpdateShopBranchLimit,
  type DmsBranch,
} from "@/app/actions/admin-branches";
import { useToast } from "@/hooks/use-toast";

// ── Field class (mirrors clients-client.tsx) ──────────────────────────────────

const FIELD_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shopId: string;
  shopName: string;
  currentBranchLimit: number;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ManageBranchesDialog({
  open,
  onOpenChange,
  shopId,
  shopName,
  currentBranchLimit,
}: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [branches, setBranches] = useState<DmsBranch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New branch form
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Branch limit
  const [branchLimit, setBranchLimit] = useState(currentBranchLimit);

  // Keep branchLimit in sync when prop changes (e.g. dialog reopened for diff client)
  useEffect(() => {
    setBranchLimit(currentBranchLimit);
  }, [currentBranchLimit, open]);

  useEffect(() => {
    if (open) {
      loadBranches();
    }
  }, [open, shopId]);

  async function loadBranches() {
    setLoadingBranches(true);
    const result = await adminListBranchesForShop(shopId);
    setLoadingBranches(false);
    if (result.error) {
      toast({ title: "Failed to load branches", description: result.error, variant: "destructive" });
      return;
    }
    setBranches(result.branches);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    startTransition(async () => {
      const result = await adminCreateBranch({
        shopId,
        name: newName.trim(),
        city: newCity.trim() || undefined,
        phone: newPhone.trim() || undefined,
      });
      if (result.error) {
        toast({ title: "Failed to create branch", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Branch created" });
      setNewName("");
      setNewCity("");
      setNewPhone("");
      await loadBranches();
    });
  }

  async function handleDelete(branchId: string, branchName: string) {
    if (!window.confirm(`Delete branch "${branchName}"? This cannot be undone.`)) return;
    setDeletingId(branchId);
    const result = await adminDeleteBranch(branchId);
    setDeletingId(null);
    if (result.error) {
      toast({ title: "Failed to delete branch", description: result.error, variant: "destructive" });
      return;
    }
    toast({ title: "Branch deleted" });
    await loadBranches();
  }

  function handleSaveBranchLimit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await adminUpdateShopBranchLimit(shopId, branchLimit);
      if (result.error) {
        toast({ title: "Failed to update branch limit", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Branch limit updated" });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 size={16} className="text-muted-foreground" />
            Manage Branches &mdash; {shopName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* ── Branch limit ── */}
          <form onSubmit={handleSaveBranchLimit}>
            <div className="rounded-lg border border-sidebar-border bg-sidebar p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Branch Limit</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={branchLimit}
                  onChange={(e) => setBranchLimit(Math.max(1, Number(e.target.value)))}
                  className={`${FIELD_CLASS} w-24`}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isPending ? "Saving…" : "Save"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Max branches allowed for this shop
                </span>
              </div>
            </div>
          </form>

          {/* ── Existing branches ── */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Branches ({branches.length})
            </p>
            {loadingBranches ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
            ) : branches.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center italic">No branches found</p>
            ) : (
              <div className="rounded-lg border border-sidebar-border overflow-hidden divide-y divide-sidebar-border">
                {branches.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between px-3 py-2.5 bg-card hover:bg-sidebar/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{b.name}</span>
                        {b.is_default && (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400 shrink-0">
                            Default
                          </span>
                        )}
                        {!b.is_active && (
                          <span className="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400 shrink-0">
                            Inactive
                          </span>
                        )}
                      </div>
                      {b.city && (
                        <p className="text-xs text-muted-foreground mt-0.5">{b.city}</p>
                      )}
                    </div>
                    {!b.is_default && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-400 hover:bg-red-500/10 hover:text-red-300 shrink-0 ml-2"
                        onClick={() => handleDelete(b.id, b.name)}
                        disabled={deletingId === b.id}
                        title="Delete branch"
                      >
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Add new branch ── */}
          <form onSubmit={handleCreate} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add New Branch</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Branch name *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className={`${FIELD_CLASS} flex-1`}
              />
              <input
                type="text"
                placeholder="City"
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                className={`${FIELD_CLASS} w-28`}
              />
              <input
                type="tel"
                placeholder="Phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className={`${FIELD_CLASS} w-32`}
              />
              <Button
                type="submit"
                size="sm"
                disabled={isPending || !newName.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 gap-1"
              >
                <Plus size={14} />
                Add
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
