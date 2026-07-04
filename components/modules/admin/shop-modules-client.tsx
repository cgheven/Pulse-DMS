"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, ToggleLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { setShopModule, type ShopModulesRow } from "@/app/actions/admin-modules";
import { ALL_MODULE_KEYS, MODULE_KEYS, type ModuleKey } from "@/lib/modules";

// ── Inline toggle switch — no Switch primitive exists in components/ui, so
// this is built here exactly as done elsewhere in the admin panel. ──────────
function ToggleSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-emerald-500" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

export default function ShopModulesClient({ shops }: { shops: ShopModulesRow[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<ShopModulesRow[]>(shops);
  const [query, setQuery] = useState("");
  const [pendingCell, setPendingCell] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.shop_name.toLowerCase().includes(q) ||
        (r.owner_email ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  function handleToggle(shopId: string, moduleKey: ModuleKey, next: boolean) {
    const cellKey = `${shopId}:${moduleKey}`;
    const prevRows = rows;

    // Optimistic update
    setRows((cur) =>
      cur.map((r) =>
        r.id === shopId ? { ...r, modules: { ...r.modules, [moduleKey]: next } } : r
      )
    );
    setPendingCell(cellKey);

    startTransition(async () => {
      const { error } = await setShopModule(shopId, moduleKey, next);
      setPendingCell(null);
      if (error) {
        setRows(prevRows); // rollback
        toast({ title: "Failed to update module", description: error, variant: "destructive" });
      } else {
        toast({
          title: next ? "Module enabled" : "Module disabled",
          description: `${MODULE_KEYS[moduleKey].label} ${next ? "enabled" : "disabled"} for this shop.`,
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
          <ToggleLeft className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground leading-none">Modules</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enable or disable optional modules per shop.
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shops or owner email…"
          className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        />
      </div>

      <div className="rounded-xl border border-sidebar-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sidebar-border bg-sidebar">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Shop
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Owner Email
              </th>
              {ALL_MODULE_KEYS.map((key) => (
                <th
                  key={key}
                  className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                  title={MODULE_KEYS[key].description}
                >
                  {MODULE_KEYS[key].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sidebar-border">
            {filtered.map((row) => (
              <tr key={row.id} className="bg-card hover:bg-sidebar/50 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                  {row.shop_name}
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {row.owner_email ?? "—"}
                </td>
                {ALL_MODULE_KEYS.map((key) => {
                  const cellKey = `${row.id}:${key}`;
                  return (
                    <td key={key} className="px-4 py-3">
                      <ToggleSwitch
                        checked={row.modules[key]}
                        disabled={isPending && pendingCell === cellKey}
                        label={`${MODULE_KEYS[key].label} for ${row.shop_name}`}
                        onChange={(next) => handleToggle(row.id, key, next)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="px-4 py-12 text-center text-muted-foreground">No shops found.</div>
        )}
      </div>
    </div>
  );
}
