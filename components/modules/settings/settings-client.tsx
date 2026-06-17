"use client";

import { useState, useTransition } from "react";
import { Settings, Save, Mail, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { updateShopName } from "@/app/actions/shop";
import { useShopContext } from "@/contexts/shop-context";

export function SettingsClient() {
  const { shop, profile } = useShopContext();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [shopName, setShopName] = useState(shop?.shop_name ?? "");

  if (!shop) return null;

  function handleSave() {
    if (!shopName.trim()) {
      toast({ title: "Shop name cannot be empty", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const res = await updateShopName(shop!.id, shopName.trim());
      if (res?.error) {
        toast({ title: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Shop name updated" });
    });
  }

  const createdDate = new Date(shop.created_at).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your shop configuration</p>
      </div>

      {/* Shop Settings card */}
      <div className="rounded-xl border border-sidebar-border bg-card p-5 space-y-6 max-w-lg">
        {/* Card header */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Settings className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Shop Settings</h2>
        </div>

        <div className="space-y-4">
          {/* Shop Name — editable */}
          <div className="space-y-1.5">
            <Label htmlFor="shop-name">Shop Name</Label>
            <div className="flex gap-2">
              <Input
                id="shop-name"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Enter shop name"
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
              <Button
                onClick={handleSave}
                disabled={isPending || shopName.trim() === shop.shop_name}
                size="default"
                className="gap-1.5 shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-sidebar-border" />

          {/* Owner email — read only */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Owner Email</Label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-sidebar-border">
              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">
                {profile?.email ?? "—"}
              </span>
            </div>
          </div>

          {/* Created date — read only */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Shop Created On</Label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-sidebar-border">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">{createdDate}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
