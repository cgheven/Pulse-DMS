"use client";

import { useEffect, useState, useTransition, useMemo } from "react";
import {
  Building2, Plus, Trash2, Edit2, Search, RefreshCw,
  Users, Dumbbell, Wifi, WifiOff, MonitorOff,
} from "lucide-react";
import {
  listAllGyms,
  createGym,
  updateGym,
  deleteGym,
  listOwners,
  type GymWithOwner,
  type GetAdminGymsResult,
} from "@/app/actions/admin-gyms";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

type DialogMode = "create" | "edit" | "delete" | null;

function DeviceStatusBadge({ serial, lastSeen }: { serial: string | null; lastSeen: string | null }) {
  if (!serial) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <MonitorOff className="w-3 h-3" /> No Device
      </span>
    );
  }

  if (!lastSeen) {
    return (
      <div className="space-y-0.5">
        <p className="text-xs font-mono text-muted-foreground">{serial}</p>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <WifiOff className="w-3 h-3" /> Never connected
        </span>
      </div>
    );
  }

  const diffMs = Date.now() - new Date(lastSeen).getTime();
  const diffMins = diffMs / 60_000;
  const diffHours = diffMs / 3_600_000;
  const diffDays = diffMs / 86_400_000;

  let label: string;
  let colorClass: string;
  let Icon: typeof Wifi;

  if (diffMins < 10) {
    label = "Online";
    colorClass = "text-emerald-600";
    Icon = Wifi;
  } else if (diffHours < 24) {
    const h = Math.floor(diffHours);
    label = `${h}h ago`;
    colorClass = "text-amber-500";
    Icon = WifiOff;
  } else {
    const d = Math.floor(diffDays);
    label = `${d}d ago`;
    colorClass = "text-rose-500";
    Icon = WifiOff;
  }

  return (
    <div className="space-y-0.5">
      <p className="text-xs font-mono text-muted-foreground">{serial}</p>
      <span className={`inline-flex items-center gap-1 text-xs ${colorClass}`}>
        <Icon className="w-3 h-3" /> {label}
      </span>
    </div>
  );
}

const emptyCreate = { owner_id: "", name: "", address: "", phone: "", total_capacity: "" };
const emptyEdit = { name: "", address: "", phone: "", email: "", total_capacity: "" };

interface Props {
  data: GetAdminGymsResult;
}

export function GymsClient({ data: initialData }: Props) {
  const [gyms, setGyms] = useState<GymWithOwner[]>(initialData.gyms ?? []);
  const [owners, setOwners] = useState<{ id: string; name: string; email: string }[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selected, setSelected] = useState<GymWithOwner | null>(null);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [isPending, startTransition] = useTransition();

  useEffect(() => { loadOwners(); }, []);

  async function loadOwners() {
    const ownersRes = await listOwners();
    if (ownersRes.owners) setOwners(ownersRes.owners);
  }

  async function loadData() {
    setLoading(true);
    const [gymsRes, ownersRes] = await Promise.all([listAllGyms(), listOwners()]);
    if (gymsRes.error) {
      toast({ title: "Error loading gyms", description: gymsRes.error, variant: "destructive" });
    } else {
      setGyms(gymsRes.gyms ?? []);
    }
    if (ownersRes.owners) setOwners(ownersRes.owners);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return gyms;
    return gyms.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.owner_name ?? "").toLowerCase().includes(q) ||
        g.owner_email.toLowerCase().includes(q) ||
        (g.address ?? "").toLowerCase().includes(q)
    );
  }, [search, gyms]);

  const stats = useMemo(() => {
    const uniqueOwners = new Set(gyms.map((g) => g.owner_id)).size;
    return {
      total: gyms.length,
      owners: uniqueOwners,
      avg: uniqueOwners > 0 ? (gyms.length / uniqueOwners).toFixed(1) : "0",
    };
  }, [gyms]);

  function openCreate() {
    setCreateForm(emptyCreate);
    setDialogMode("create");
  }

  function openEdit(g: GymWithOwner) {
    setSelected(g);
    setEditForm({
      name: g.name,
      address: g.address ?? "",
      phone: g.phone ?? "",
      email: g.email ?? "",
      total_capacity: String(g.total_capacity),
    });
    setDialogMode("edit");
  }

  function openDelete(g: GymWithOwner) {
    setSelected(g);
    setDialogMode("delete");
  }

  function handleCreate() {
    startTransition(async () => {
      const res = await createGym({
        owner_id: createForm.owner_id,
        name: createForm.name,
        address: createForm.address,
        phone: createForm.phone,
        total_capacity: createForm.total_capacity ? parseInt(createForm.total_capacity) : 0,
      });
      if (res.error) {
        toast({ title: "Failed to create gym", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Gym created successfully" });
        setDialogMode(null);
        loadData();
      }
    });
  }

  function handleEdit() {
    if (!selected) return;
    startTransition(async () => {
      const res = await updateGym({
        gymId: selected.id,
        name: editForm.name,
        address: editForm.address,
        phone: editForm.phone,
        email: editForm.email,
        total_capacity: editForm.total_capacity ? parseInt(editForm.total_capacity) : 0,
      });
      if (res.error) {
        toast({ title: "Failed to update gym", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Gym updated" });
        setDialogMode(null);
        loadData();
      }
    });
  }

  function handleDelete() {
    if (!selected) return;
    startTransition(async () => {
      const res = await deleteGym(selected.id);
      if (res.error) {
        toast({ title: "Failed to delete gym", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Gym deleted" });
        setDialogMode(null);
        loadData();
      }
    });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <div className="border-b border-sidebar-border px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Dumbbell className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold">Gym Management</h1>
              <p className="text-xs text-muted-foreground">Create and assign gyms to owners</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-2" onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" className="gap-2" onClick={openCreate}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Gym</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-7xl space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Gyms", value: stats.total, icon: Dumbbell, color: "text-primary", bg: "bg-primary/10" },
            { label: "Unique Owners", value: stats.owners, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Avg per Owner", value: stats.avg, icon: Building2, color: "text-emerald-600", bg: "bg-emerald-50" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${bg} shrink-0`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{label}</p>
                  <p className="text-2xl font-bold">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by gym or owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">All Gyms ({filtered.length})</CardTitle>
            <CardDescription>
              Create and manage gyms per owner. Owners with multiple gyms get a property switcher in their dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Dumbbell className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium">No gyms found</p>
                <p className="text-sm mt-1">Create a gym to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Gym</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Owner</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Address</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden lg:table-cell">Device</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden lg:table-cell">Created</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((g) => (
                      <tr key={g.id} className="hover:bg-muted/20 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                              <Dumbbell className="w-4 h-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{g.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {g.total_capacity > 0 ? `${g.total_capacity} capacity` : "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <div className="min-w-0">
                            <p className="text-sm truncate">{g.owner_name || "—"}</p>
                            <p className="text-xs text-muted-foreground truncate">{g.owner_email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {g.address || "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <DeviceStatusBadge serial={g.device_serial ?? null} lastSeen={g.device_last_seen ?? null} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                          {formatDate(g.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Edit gym"
                              onClick={() => openEdit(g)}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                              title="Delete gym"
                              onClick={() => openDelete(g)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Create Gym Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogMode === "create"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Gym
            </DialogTitle>
            <DialogDescription>
              Create a gym and assign it to an owner. They will see a property switcher if they have more than one.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Owner *</Label>
              <select
                value={createForm.owner_id}
                onChange={(e) => setCreateForm({ ...createForm, owner_id: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select owner...</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name ? `${o.name} (${o.email})` : o.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Gym Name *</Label>
              <Input
                placeholder="e.g. FitZone Gym"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  placeholder="+92 300..."
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Total Capacity</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={createForm.total_capacity}
                  onChange={(e) => setCreateForm({ ...createForm, total_capacity: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                placeholder="Street, area, city"
                value={createForm.address}
                onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isPending || !createForm.owner_id || !createForm.name}
            >
              {isPending ? "Creating..." : "Create Gym"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Gym Dialog ───────────────────────────────────────────────── */}
      <Dialog open={dialogMode === "edit"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-4 h-4" /> Edit Gym
            </DialogTitle>
            <DialogDescription>
              Owner: {selected?.owner_name || selected?.owner_email}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Gym Name *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  placeholder="+92 300..."
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Total Capacity</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={editForm.total_capacity}
                  onChange={(e) => setEditForm({ ...editForm, total_capacity: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="gym@example.com"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                placeholder="Street, area, city"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={isPending || !editForm.name}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ────────────────────────────────────────────── */}
      <Dialog open={dialogMode === "delete"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" /> Delete Gym
            </DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{selected?.name}</strong> and all its data — members, payments. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Deleting..." : "Yes, Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
