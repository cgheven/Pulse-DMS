"use client";

import { useEffect, useState, useTransition } from "react";
import { Pencil, UserX, UserCheck, Contact, Loader2, MapPin } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useBranchContext } from "@/contexts/branch-context";
import { listClients, updateClient, setClientActive } from "@/app/actions/riders";
import type { RiderClient } from "@/types";

export function RiderClientsClient() {
  const { branchId } = useBranchContext();
  const [clients, setClients] = useState<RiderClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RiderClient | null>(null);
  const [form, setForm] = useState({ name: "", businessName: "", phone: "", address: "", notes: "" });
  const [isPending, startTransition] = useTransition();

  function load() {
    if (!branchId) return;
    setLoading(true);
    listClients(branchId).then((res) => {
      setClients(res.clients);
      setLoading(false);
      if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    });
  }

  useEffect(() => { load(); }, [branchId]);

  function openEdit(c: RiderClient) {
    setEditing(c);
    setForm({ name: c.name, businessName: c.business_name ?? "", phone: c.phone ?? "", address: c.address ?? "", notes: c.notes ?? "" });
  }

  function saveEdit() {
    if (!editing) return;
    if (!form.name.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const res = await updateClient(editing.id, form);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Client updated" });
      setEditing(null);
      load();
    });
  }

  function toggleActive(c: RiderClient) {
    startTransition(async () => {
      const res = await setClientActive(c.id, !c.is_active);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: c.is_active ? "Client deactivated" : "Client activated" });
      load();
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Clients</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Persistent client directory used by riders when taking orders. Riders add new clients in the field.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-sidebar-border bg-card animate-pulse" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-sidebar-border">
          <Contact className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No clients yet</p>
          <p className="text-xs text-muted-foreground mt-1">Clients added by riders while taking orders will show up here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {clients.map((c) => (
            <div key={c.id} className="rounded-xl border border-sidebar-border bg-card p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground truncate">{c.name}</p>
                  {c.is_active ? (
                    <Badge className="bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/10">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground border border-sidebar-border">Inactive</Badge>
                  )}
                </div>
                {c.business_name && <p className="text-xs text-muted-foreground/80 truncate">{c.business_name}</p>}
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {c.phone ?? "No phone"}{c.address ? ` • ${c.address}` : ""}
                </p>
                {c.latitude != null && c.longitude != null && (
                  <a
                    href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                  >
                    <MapPin className="w-3 h-3" /> View on map
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => toggleActive(c)} disabled={isPending}>
                  {c.is_active ? <UserX className="w-4 h-4 text-red-400" /> : <UserCheck className="w-4 h-4 text-green-400" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Shop / Business Name</Label>
              <Input value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Address</Label>
              <Textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={isPending}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
