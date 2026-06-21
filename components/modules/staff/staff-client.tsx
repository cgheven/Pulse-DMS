"use client";

import { useState, useTransition } from "react";
import {
  MoreHorizontal, Plus, Check, Copy, MessageSquare,
  UserX, Key, Pencil, Trash2, UserCheck, RefreshCw, Eye, EyeOff,
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  addStaff, updateStaff, deleteStaff,
  createStaffLogin, revokeStaffLogin, resetStaffPassword,
} from "@/app/actions/staff";
import { shareStaffCredentialsViaWhatsApp } from "@/lib/whatsapp-templates";
import type { Staff, DmsStaffRole } from "@/types";

const ROLE_OPTIONS: { value: DmsStaffRole; label: string; color: string }[] = [
  { value: "manager",    label: "Manager",         color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { value: "sales",      label: "Sales Staff",     color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { value: "cashier",    label: "Cashier",         color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "stock",      label: "Stock / Inventory", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  { value: "accountant", label: "Accountant",      color: "bg-green-500/10 text-green-400 border-green-500/20" },
  { value: "driver",     label: "Delivery Driver", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { value: "other",      label: "Other",           color: "bg-muted text-muted-foreground border-sidebar-border" },
];

function RoleBadge({ role }: { role: DmsStaffRole }) {
  const opt = ROLE_OPTIONS.find((r) => r.value === role) ?? ROLE_OPTIONS[ROLE_OPTIONS.length - 1];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${opt.color}`}>
      {opt.label}
    </span>
  );
}

// ─── Credentials Card ─────────────────────────────────────────────────────────
interface CredentialsCardProps {
  fullName: string;
  phone: string;
  password: string;
  shopName: string;
}

function CredentialsCard({ fullName, phone, password, shopName }: CredentialsCardProps) {
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
          <span className="text-muted-foreground">Phone (Login ID)</span>
          <span className="font-medium text-foreground">{phone}</span>
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
        onClick={() => shareStaffCredentialsViaWhatsApp({ fullName, phone, password, shopName })}
      >
        <MessageSquare className="w-3.5 h-3.5 mr-2" />
        Send Credentials via WhatsApp
      </Button>
    </div>
  );
}

const LOGIN_CHARSET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
function generateClientPassword(len = 8): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let p = "";
  for (let i = 0; i < len; i++) p += LOGIN_CHARSET[buf[i] % LOGIN_CHARSET.length];
  return p;
}

// ─── Create Login Dialog ───────────────────────────────────────────────────────
interface CreateLoginDialogProps {
  staff: Staff;
  shopName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function CreateLoginDialog({ staff, shopName, open, onOpenChange }: CreateLoginDialogProps) {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState(() => generateClientPassword(8));
  const [showPassword, setShowPassword] = useState(false);
  const [credentials, setCredentials] = useState<{ password: string; phone: string; fullName: string } | null>(null);

  function handleGenerate() {
    setPassword(generateClientPassword(8));
  }

  function handleCreate() {
    if (!password.trim() || password.trim().length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const res = await createStaffLogin(staff.id, password.trim());
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      setCredentials({ password: password.trim(), phone: res.phone!, fullName: res.fullName! });
    });
  }

  function handleClose(v: boolean) {
    if (!v) {
      setCredentials(null);
      setPassword(generateClientPassword(8));
      setShowPassword(false);
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border border-sidebar-border max-w-md">
        <DialogHeader>
          <DialogTitle>Create Staff Login</DialogTitle>
        </DialogHeader>

        {credentials ? (
          <CredentialsCard
            fullName={credentials.fullName}
            phone={credentials.phone}
            password={credentials.password}
            shopName={shopName}
          />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input
                value={staff.phone}
                readOnly
                className="bg-muted/20 border-sidebar-border text-muted-foreground cursor-default"
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
                Click <RefreshCw className="w-3 h-3 inline mx-0.5" /> to generate an 8-character strong password.
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
interface ResetPasswordDialogProps {
  staff: Staff;
  shopName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function ResetPasswordDialog({ staff, shopName, open, onOpenChange }: ResetPasswordDialogProps) {
  const [pending, startTransition] = useTransition();
  const [credentials, setCredentials] = useState<{ password: string; phone: string; fullName: string } | null>(null);

  function handleReset() {
    startTransition(async () => {
      const res = await resetStaffPassword(staff.id);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      setCredentials({ password: res.password!, phone: res.phone!, fullName: res.fullName! });
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
          <DialogTitle>Reset Staff Password</DialogTitle>
        </DialogHeader>

        {credentials ? (
          <CredentialsCard
            fullName={credentials.fullName}
            phone={credentials.phone}
            password={credentials.password}
            shopName={shopName}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            This will generate a new password for <span className="font-semibold text-foreground">{staff.full_name}</span>. The old password will stop working immediately.
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
interface StaffFormState {
  full_name: string;
  phone: string;
  role: DmsStaffRole;
  notes: string;
}

const emptyForm = (): StaffFormState => ({ full_name: "", phone: "", role: "sales", notes: "" });

// ─── Staff Row Actions ─────────────────────────────────────────────────────────
interface RowActionsProps {
  staff: Staff;
  shopName: string;
  onEdit: (s: Staff) => void;
  onDeleted: () => void;
  onCreateLogin: () => void;
}

function RowActions({ staff, shopName, onEdit, onDeleted, onCreateLogin }: RowActionsProps) {
  const [pending, startTransition] = useTransition();
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function handleToggleActive() {
    startTransition(async () => {
      const res = await updateStaff(staff.id, { is_active: !staff.is_active });
      if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      const res = await revokeStaffLogin(staff.id);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        setRevokeOpen(false);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteStaff(staff.id);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        setDeleteOpen(false);
        onDeleted();
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
          <DropdownMenuItem
            onClick={() => onEdit(staff)}
            className="cursor-pointer gap-2"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleToggleActive}
            disabled={pending}
            className="cursor-pointer gap-2"
          >
            {staff.is_active ? (
              <><UserX className="w-4 h-4" />Mark Inactive</>
            ) : (
              <><UserCheck className="w-4 h-4" />Mark Active</>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-sidebar-border" />
          {!staff.profile_id && (
            <DropdownMenuItem
              onClick={onCreateLogin}
              className="cursor-pointer gap-2"
            >
              <Key className="w-4 h-4" />
              Create Login
            </DropdownMenuItem>
          )}
          {staff.profile_id && (
            <>
              <DropdownMenuItem
                onClick={() => setResetPwOpen(true)}
                className="cursor-pointer gap-2"
              >
                <Key className="w-4 h-4" />
                Reset Password
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRevokeOpen(true)}
                className="cursor-pointer gap-2 text-orange-400 focus:text-orange-400"
              >
                <UserX className="w-4 h-4" />
                Revoke Login
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator className="bg-sidebar-border" />
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="cursor-pointer gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reset Password */}
      <ResetPasswordDialog
        staff={staff}
        shopName={shopName}
        open={resetPwOpen}
        onOpenChange={setResetPwOpen}
      />

      {/* Revoke Login Confirm */}
      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent className="bg-card border border-sidebar-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke Login Access</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove login access for <span className="font-semibold text-foreground">{staff.full_name}</span>. They will no longer be able to sign in.
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

      {/* Delete Confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-card border border-sidebar-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Staff Member</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-semibold text-foreground">{staff.full_name}</span>? This action cannot be undone. Any login access will also be revoked.
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
interface StaffClientProps {
  staff: Staff[];
  shopName: string;
}

export function StaffClient({ staff, shopName }: StaffClientProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<Staff | null>(null);
  const [createLoginTarget, setCreateLoginTarget] = useState<Staff | null>(null);
  const [form, setForm] = useState<StaffFormState>(emptyForm());
  const [pending, startTransition] = useTransition();

  function openAdd() {
    setForm(emptyForm());
    setAddOpen(true);
  }

  function openEdit(s: Staff) {
    setForm({ full_name: s.full_name, phone: s.phone, role: s.role ?? "sales", notes: s.notes ?? "" });
    setEditStaff(s);
  }

  function handleAddSubmit() {
    if (!form.full_name.trim()) { toast({ title: "Error", description: "Full name is required", variant: "destructive" }); return; }
    if (!form.phone.trim()) { toast({ title: "Error", description: "Phone is required", variant: "destructive" }); return; }
    startTransition(async () => {
      const res = await addStaff({ full_name: form.full_name, phone: form.phone, role: form.role, notes: form.notes });
      if (res.error) { toast({ title: "Error", description: res.error, variant: "destructive" }); return; }
      setAddOpen(false);
      setForm(emptyForm());
    });
  }

  function handleEditSubmit() {
    if (!editStaff) return;
    if (!form.full_name.trim()) { toast({ title: "Error", description: "Full name is required", variant: "destructive" }); return; }
    if (!form.phone.trim()) { toast({ title: "Error", description: "Phone is required", variant: "destructive" }); return; }
    startTransition(async () => {
      const res = await updateStaff(editStaff.id, {
        full_name: form.full_name,
        phone: form.phone,
        role: form.role,
        notes: form.notes,
      });
      if (res.error) { toast({ title: "Error", description: res.error, variant: "destructive" }); return; }
      setEditStaff(null);
      setForm(emptyForm());
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Staff</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your team members and their access
          </p>
        </div>
        <Button onClick={openAdd} size="sm" className="shrink-0">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Staff
        </Button>
      </div>

      {/* Table / Empty State */}
      {staff.length === 0 ? (
        <div className="rounded-xl border border-sidebar-border bg-card p-12 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted mx-auto mb-4">
            <UserCheck className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No staff members yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your first team member to get started.
          </p>
          <Button onClick={openAdd} size="sm" className="mt-4">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Staff
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border bg-muted/30">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Name</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Role</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Phone</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Login</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border">
                {staff.map((s) => (
                  <tr key={s.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{s.full_name}</td>
                    <td className="px-4 py-3"><RoleBadge role={s.role ?? "other"} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{s.phone}</td>
                    <td className="px-4 py-3">
                      {s.is_active ? (
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
                      {s.profile_id ? (
                        <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/10">
                          Has Login
                        </Badge>
                      ) : (
                        <button
                          onClick={() => setCreateLoginTarget(s)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-dashed border-sidebar-border text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
                        >
                          <Key className="w-3 h-3" />
                          Create Login
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowActions
                        staff={s}
                        shopName={shopName}
                        onEdit={openEdit}
                        onDeleted={() => {}}
                        onCreateLogin={() => setCreateLoginTarget(s)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Login Dialog (shared, triggered from Login column or dropdown) */}
      {createLoginTarget && (
        <CreateLoginDialog
          staff={createLoginTarget}
          shopName={shopName}
          open={!!createLoginTarget}
          onOpenChange={(v) => { if (!v) setCreateLoginTarget(null); }}
        />
      )}

      {/* Add Staff Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border border-sidebar-border max-w-md">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
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
              <Label>Role <span className="text-destructive">*</span></Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as DmsStaffRole }))}>
                <SelectTrigger className="bg-muted/30 border-sidebar-border">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-notes">Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="add-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this staff member"
                className="bg-muted/30 border-sidebar-border resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} className="border-sidebar-border">
              Cancel
            </Button>
            <Button onClick={handleAddSubmit} disabled={pending}>
              {pending ? "Adding…" : "Add Staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Staff Dialog */}
      <Dialog open={!!editStaff} onOpenChange={(v) => { if (!v) { setEditStaff(null); setForm(emptyForm()); } }}>
        <DialogContent className="bg-card border border-sidebar-border max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
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
              <Label>Role <span className="text-destructive">*</span></Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as DmsStaffRole }))}>
                <SelectTrigger className="bg-muted/30 border-sidebar-border">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="edit-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this staff member"
                className="bg-muted/30 border-sidebar-border resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditStaff(null); setForm(emptyForm()); }} className="border-sidebar-border">
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
