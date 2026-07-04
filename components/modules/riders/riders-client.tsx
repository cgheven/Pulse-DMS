"use client";

import { useState, useTransition } from "react";
import {
  MoreHorizontal, Plus, Check, Copy, MessageSquare,
  UserX, Key, Pencil, Trash2, UserCheck, RefreshCw, Eye, EyeOff, Bike,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useBranchContext } from "@/contexts/branch-context";
import {
  addRider, updateRider, deleteRider,
  createRiderLogin, revokeRiderLogin, resetRiderPassword,
} from "@/app/actions/riders";
import { shareRiderCredentialsViaWhatsApp } from "@/lib/whatsapp-templates";
import type { Rider } from "@/types";

// ─── Credentials Card ─────────────────────────────────────────────────────────
function CredentialsCard({ fullName, phone, email, password }: {
  fullName: string; phone: string; email: string; password: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-3">
      <p className="text-sm font-semibold text-green-400">Login credentials ready</p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Name</span>
          <span className="font-medium text-foreground">{fullName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Email (Login ID)</span>
          <span className="font-medium text-foreground">{email}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Password</span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-medium text-foreground">{password}</span>
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
      <Button
        size="sm"
        className="w-full bg-green-600 hover:bg-green-700 text-white border-0"
        onClick={() => shareRiderCredentialsViaWhatsApp({ fullName, phone, email, password })}
      >
        <MessageSquare className="w-3.5 h-3.5 mr-2" />
        Send Credentials via WhatsApp
      </Button>
    </div>
  );
}

const LOGIN_CHARSET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
function generateClientPassword(len = 10): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let p = "";
  for (let i = 0; i < len; i++) p += LOGIN_CHARSET[buf[i] % LOGIN_CHARSET.length];
  return p;
}

// ─── Create Login Dialog ───────────────────────────────────────────────────────
function CreateLoginDialog({ rider, open, onOpenChange }: {
  rider: Rider; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => generateClientPassword(10));
  const [showPassword, setShowPassword] = useState(false);
  const [credentials, setCredentials] = useState<{ password: string; email: string; fullName: string } | null>(null);

  function handleGenerate() {
    setPassword(generateClientPassword(10));
  }

  function handleCreate() {
    if (!email.trim() || !email.includes("@")) {
      toast({ title: "Error", description: "A valid email is required", variant: "destructive" });
      return;
    }
    if (!password.trim() || password.trim().length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const res = await createRiderLogin(rider.id, email.trim(), password.trim());
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      setCredentials({ password: password.trim(), email: res.email!, fullName: res.fullName! });
    });
  }

  function handleClose(v: boolean) {
    if (!v) {
      setCredentials(null);
      setEmail("");
      setPassword(generateClientPassword(10));
      setShowPassword(false);
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border border-sidebar-border max-w-md">
        <DialogHeader>
          <DialogTitle>Create Rider Login</DialogTitle>
        </DialogHeader>

        {credentials ? (
          <CredentialsCard
            fullName={credentials.fullName}
            phone={rider.phone}
            email={credentials.email}
            password={credentials.password}
          />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rider-login-email">Email</Label>
              <Input
                id="rider-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rider@example.com"
                className="bg-muted/30 border-sidebar-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-muted/30 border-sidebar-border pr-10 font-mono"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleGenerate}
                  className="border-sidebar-border shrink-0"
                  title="Generate strong password"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Click <RefreshCw className="w-3 h-3 inline mx-0.5" /> to generate a strong password.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {!credentials && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} className="border-sidebar-border">
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={pending}>
                {pending ? "Creating…" : "Create Login"}
              </Button>
            </>
          )}
          {credentials && (
            <Button variant="outline" onClick={() => handleClose(false)} className="border-sidebar-border w-full">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reset Password Dialog ─────────────────────────────────────────────────────
function ResetPasswordDialog({ rider, open, onOpenChange }: {
  rider: Rider; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [credentials, setCredentials] = useState<{ password: string; email: string; fullName: string } | null>(null);

  function handleReset() {
    startTransition(async () => {
      const res = await resetRiderPassword(rider.id);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      setCredentials({ password: res.password!, email: res.email!, fullName: res.fullName! });
    });
  }

  function handleClose(v: boolean) {
    if (!v) setCredentials(null);
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border border-sidebar-border max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Rider Password</DialogTitle>
        </DialogHeader>

        {credentials ? (
          <CredentialsCard
            fullName={credentials.fullName}
            phone={rider.phone}
            email={credentials.email}
            password={credentials.password}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            This will generate a new password for <span className="font-semibold text-foreground">{rider.full_name}</span>. The old password will stop working immediately.
          </p>
        )}

        <DialogFooter>
          {!credentials && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} className="border-sidebar-border">
                Cancel
              </Button>
              <Button onClick={handleReset} disabled={pending} variant="destructive">
                {pending ? "Resetting…" : "Reset Password"}
              </Button>
            </>
          )}
          {credentials && (
            <Button variant="outline" onClick={() => handleClose(false)} className="border-sidebar-border w-full">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add / Edit Form ───────────────────────────────────────────────────────────
interface RiderFormState {
  full_name: string;
  phone: string;
  vehicle_number: string;
  notes: string;
}

const emptyForm = (): RiderFormState => ({ full_name: "", phone: "", vehicle_number: "", notes: "" });

// ─── Rider Row Actions ─────────────────────────────────────────────────────────
function RowActions({ rider, onEdit, onCreateLogin }: {
  rider: Rider; onEdit: (r: Rider) => void; onCreateLogin: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function handleToggleActive() {
    startTransition(async () => {
      const res = await updateRider(rider.id, { is_active: !rider.is_active });
      if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      const res = await revokeRiderLogin(rider.id);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        setRevokeOpen(false);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteRider(rider.id);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        setDeleteOpen(false);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-card border-sidebar-border w-48">
          <DropdownMenuItem onClick={() => onEdit(rider)} className="cursor-pointer gap-2">
            <Pencil className="w-4 h-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleToggleActive} disabled={pending} className="cursor-pointer gap-2">
            {rider.is_active ? (
              <><UserX className="w-4 h-4" />Mark Inactive</>
            ) : (
              <><UserCheck className="w-4 h-4" />Mark Active</>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-sidebar-border" />
          {!rider.profile_id && (
            <DropdownMenuItem onClick={onCreateLogin} className="cursor-pointer gap-2">
              <Key className="w-4 h-4" />
              Create Login
            </DropdownMenuItem>
          )}
          {rider.profile_id && (
            <>
              <DropdownMenuItem onClick={() => setResetPwOpen(true)} className="cursor-pointer gap-2">
                <Key className="w-4 h-4" />
                Reset Password
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRevokeOpen(true)} className="cursor-pointer gap-2 text-orange-400 focus:text-orange-400">
                <UserX className="w-4 h-4" />
                Revoke Login
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator className="bg-sidebar-border" />
          <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
            <Trash2 className="w-4 h-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResetPasswordDialog rider={rider} open={resetPwOpen} onOpenChange={setResetPwOpen} />

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent className="bg-card border border-sidebar-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke Login Access</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove login access for <span className="font-semibold text-foreground">{rider.full_name}</span>. They will no longer be able to sign in.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeOpen(false)} className="border-sidebar-border">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={pending}>
              {pending ? "Revoking…" : "Revoke Login"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-card border border-sidebar-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Rider</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-semibold text-foreground">{rider.full_name}</span>? This action cannot be undone. Any login access will also be revoked.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="border-sidebar-border">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function RidersClient({ riders }: { riders: Rider[] }) {
  const { branchId, branch } = useBranchContext();
  const [addOpen, setAddOpen] = useState(false);
  const [editRider, setEditRider] = useState<Rider | null>(null);
  const [createLoginTarget, setCreateLoginTarget] = useState<Rider | null>(null);
  const [form, setForm] = useState<RiderFormState>(emptyForm());
  const [pending, startTransition] = useTransition();

  function openAdd() {
    setForm(emptyForm());
    setAddOpen(true);
  }

  function openEdit(r: Rider) {
    setForm({ full_name: r.full_name, phone: r.phone, vehicle_number: r.vehicle_number ?? "", notes: r.notes ?? "" });
    setEditRider(r);
  }

  function handleAddSubmit() {
    if (!form.full_name.trim()) { toast({ title: "Error", description: "Full name is required", variant: "destructive" }); return; }
    if (!form.phone.trim()) { toast({ title: "Error", description: "Phone is required", variant: "destructive" }); return; }
    if (!branchId) { toast({ title: "Error", description: "No active branch selected", variant: "destructive" }); return; }
    startTransition(async () => {
      const res = await addRider({
        full_name: form.full_name,
        phone: form.phone,
        vehicle_number: form.vehicle_number,
        notes: form.notes,
        branchId,
      });
      if (res.error) { toast({ title: "Error", description: res.error, variant: "destructive" }); return; }
      setAddOpen(false);
      setForm(emptyForm());
    });
  }

  function handleEditSubmit() {
    if (!editRider) return;
    if (!form.full_name.trim()) { toast({ title: "Error", description: "Full name is required", variant: "destructive" }); return; }
    if (!form.phone.trim()) { toast({ title: "Error", description: "Phone is required", variant: "destructive" }); return; }
    startTransition(async () => {
      const res = await updateRider(editRider.id, {
        full_name: form.full_name,
        phone: form.phone,
        vehicle_number: form.vehicle_number,
        notes: form.notes,
      });
      if (res.error) { toast({ title: "Error", description: res.error, variant: "destructive" }); return; }
      setEditRider(null);
      setForm(emptyForm());
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Riders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage delivery riders and their portal access{branch ? ` for ${branch.name}` : ""}
          </p>
        </div>
        <Button onClick={openAdd} size="sm" className="shrink-0" disabled={!branchId}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add Rider
        </Button>
      </div>

      {/* Table / Empty State */}
      {riders.length === 0 ? (
        <div className="rounded-xl border border-sidebar-border bg-card p-12 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted mx-auto mb-4">
            <Bike className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No riders yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your first delivery rider to get started.
          </p>
          <Button onClick={openAdd} size="sm" className="mt-4" disabled={!branchId}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Rider
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border bg-muted/30">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Name</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Phone</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Vehicle</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Login</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border">
                {riders.map((r) => (
                  <tr key={r.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{r.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.phone}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.vehicle_number || "—"}</td>
                    <td className="px-4 py-3">
                      {r.is_active ? (
                        <Badge className="bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/10">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground border border-sidebar-border">
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.profile_id ? (
                        <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/10">
                          Has Login
                        </Badge>
                      ) : (
                        <button
                          onClick={() => setCreateLoginTarget(r)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-dashed border-sidebar-border text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
                        >
                          <Key className="w-3 h-3" />
                          Create Login
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowActions
                        rider={r}
                        onEdit={openEdit}
                        onCreateLogin={() => setCreateLoginTarget(r)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Login Dialog */}
      {createLoginTarget && (
        <CreateLoginDialog
          rider={createLoginTarget}
          open={!!createLoginTarget}
          onOpenChange={(v) => { if (!v) setCreateLoginTarget(null); }}
        />
      )}

      {/* Add Rider Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border border-sidebar-border max-w-md">
          <DialogHeader>
            <DialogTitle>Add Rider</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-name">Full Name <span className="text-destructive">*</span></Label>
              <Input
                id="add-name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Enter full name"
                className="bg-muted/30 border-sidebar-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-phone">Phone <span className="text-destructive">*</span></Label>
              <Input
                id="add-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="0300-1234567"
                className="bg-muted/30 border-sidebar-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-vehicle">Vehicle Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="add-vehicle"
                value={form.vehicle_number}
                onChange={(e) => setForm((f) => ({ ...f, vehicle_number: e.target.value }))}
                placeholder="e.g. LEA-1234"
                className="bg-muted/30 border-sidebar-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-notes">Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="add-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this rider"
                className="bg-muted/30 border-sidebar-border resize-none"
                rows={3}
              />
            </div>
            {branch && (
              <p className="text-xs text-muted-foreground">
                Will be assigned to branch <span className="font-medium text-foreground">{branch.name}</span>.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} className="border-sidebar-border">
              Cancel
            </Button>
            <Button onClick={handleAddSubmit} disabled={pending}>
              {pending ? "Adding…" : "Add Rider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Rider Dialog */}
      <Dialog open={!!editRider} onOpenChange={(v) => { if (!v) { setEditRider(null); setForm(emptyForm()); } }}>
        <DialogContent className="bg-card border border-sidebar-border max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Rider</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full Name <span className="text-destructive">*</span></Label>
              <Input
                id="edit-name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Enter full name"
                className="bg-muted/30 border-sidebar-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone <span className="text-destructive">*</span></Label>
              <Input
                id="edit-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="0300-1234567"
                className="bg-muted/30 border-sidebar-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-vehicle">Vehicle Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="edit-vehicle"
                value={form.vehicle_number}
                onChange={(e) => setForm((f) => ({ ...f, vehicle_number: e.target.value }))}
                placeholder="e.g. LEA-1234"
                className="bg-muted/30 border-sidebar-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="edit-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this rider"
                className="bg-muted/30 border-sidebar-border resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditRider(null); setForm(emptyForm()); }} className="border-sidebar-border">
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={pending}>
              {pending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
