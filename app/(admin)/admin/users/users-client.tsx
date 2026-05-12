"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Users, Plus, Shield, ShieldOff, Trash2,
  Edit2, KeyRound, Search, Building2, Clock,
  CheckCircle2, RefreshCw, Send, Eye, EyeOff, MessageCircle, Copy,
  ChevronDown, ChevronRight, Crown, AlertTriangle, UserPlus, ExternalLink,
  Handshake, AlertCircle,
} from "lucide-react";
import { whatsappUrl, normalizeWhatsAppPhone } from "@/lib/whatsapp-reminder";
import {
  listAdminUsers,
  createUserWithPassword,
  inviteUser,
  updateAdminUser,
  deleteAdminUser,
  resetUserPassword,
  type AdminGymGroup,
  type AdminUserRow,
  type AdminUsersGrouped,
} from "@/app/actions/admin-users";
import { createPartnerProspectsUser } from "@/app/actions/admin-prospects";
import { createGym, deleteGym } from "@/app/actions/admin-gyms";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import type { AdminUser } from "@/types";

type DialogMode = "create" | "invite" | "edit" | "reset" | "delete" | "partner" | null;

const emptyCreate = { email: "", full_name: "", phone: "", password: "", confirmPassword: "", branch_limit: 1, initial_branch_name: "", initial_branch_address: "", initial_branch_phone: "" };
const emptyEdit = { email: "", full_name: "", is_admin: false, branch_limit: 1 };
const emptyReset = { password: "", confirmPassword: "" };
const defaultPartner = { email: "partner@musabkhan.me", full_name: "Partner" };

const SS_KEY = "pulse_admin_users_state";
const ORPHAN_KEY = "__orphans__";

function loadCollapsedState(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { collapsed?: string[] };
    return new Set(parsed.collapsed ?? []);
  } catch {
    return new Set();
  }
}

function persistCollapsedState(collapsed: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify({ collapsed: [...collapsed] }));
  } catch {
    // ignore quota errors
  }
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  frontdesk: "Frontdesk",
  trainer: "Trainer",
  cleaner: "Cleaner",
  guard: "Guard",
  cook: "Cook",
  other: "Other",
  compliance: "Compliance",
  unassigned: "User",
};

const ROLE_STYLE: Record<string, string> = {
  owner: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  manager: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  frontdesk: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  trainer: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  cleaner: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  guard: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
  cook: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  compliance: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  other: "bg-muted text-muted-foreground border-border",
  unassigned: "bg-muted text-muted-foreground border-border",
};

export default function AdminUsersClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [grouped, setGrouped] = useState<AdminUsersGrouped | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [inviteEmail, setInviteEmail] = useState({ email: "", full_name: "", branch_limit: 1 });
  const [editForm, setEditForm] = useState(emptyEdit);
  const [resetForm, setResetForm] = useState(emptyReset);
  const [partnerForm, setPartnerForm] = useState(defaultPartner);
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Credentials handoff dialog after user creation
  const [credentialsHandoff, setCredentialsHandoff] = useState<{
    email: string; password: string; full_name: string; phone: string;
  } | null>(null);

  // One-time password reveal dialog for partner creation
  const [partnerHandoff, setPartnerHandoff] = useState<{
    email: string; password: string; full_name: string;
  } | null>(null);

  useEffect(() => {
    loadUsers();
    setCollapsed(loadCollapsedState());
  }, []);

  function toggleSection(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistCollapsedState(next);
      return next;
    });
  }

  async function loadUsers() {
    setLoading(true);
    const result = await listAdminUsers();
    if (result.error) {
      toast({ title: "Error loading users", description: result.error, variant: "destructive" });
    } else {
      setUsers(result.users ?? []);
      setGrouped(result.grouped ?? null);
    }
    setLoading(false);
  }

  function findUserById(userId: string | null | undefined): AdminUser | null {
    if (!userId) return null;
    return users.find((u) => u.id === userId) ?? null;
  }

  // Search filter: match name/email/phone (lowercased substring)
  const q = search.trim().toLowerCase();
  const filteredGroups = useMemo<AdminGymGroup[]>(() => {
    if (!grouped) return [];
    if (!q) return grouped.groups;
    const matchRow = (r: AdminUserRow | null) => {
      if (!r) return false;
      return (
        (r.full_name ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q)
      );
    };
    return grouped.groups
      .map((g) => {
        const gymMatch = g.gym_name.toLowerCase().includes(q);
        if (gymMatch) return g;
        const ownerMatch = matchRow(g.owner);
        const staffMatches = g.staff.filter(matchRow);
        if (ownerMatch || staffMatches.length > 0) {
          return { ...g, staff: ownerMatch ? g.staff : staffMatches };
        }
        return null;
      })
      .filter((g): g is AdminGymGroup => g !== null);
  }, [grouped, q]);

  const filteredOrphans = useMemo<AdminUserRow[]>(() => {
    if (!grouped) return [];
    if (!q) return grouped.orphans;
    return grouped.orphans.filter(
      (r) =>
        (r.full_name ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q),
    );
  }, [grouped, q]);

  // When searching, force-expand any section that has matches
  const effectiveCollapsed = q ? new Set<string>() : collapsed;

  function openCreate() { setCreateForm(emptyCreate); setShowPw(false); setDialogMode("create"); }
  function openInvite() { setInviteEmail({ email: "", full_name: "", branch_limit: 1 }); setDialogMode("invite"); }
  function openPartner() { setPartnerForm(defaultPartner); setDialogMode("partner"); }
  function openEdit(u: AdminUser) {
    setSelectedUser(u);
    setEditForm({ email: u.email, full_name: u.full_name ?? "", is_admin: u.is_admin, branch_limit: u.branch_limit ?? 1 });
    setDialogMode("edit");
  }
  function openReset(u: AdminUser) {
    setSelectedUser(u);
    setResetForm(emptyReset);
    setShowPw(false);
    setDialogMode("reset");
  }
  function openDelete(u: AdminUser) { setSelectedUser(u); setDialogMode("delete"); }

  // Row-based wrappers (resolve user_id → AdminUser before opening the existing dialogs)
  function openEditRow(row: AdminUserRow) {
    const u = findUserById(row.user_id);
    if (!u) {
      toast({
        title: "No login attached",
        description: "This staff record has no auth user. Edit them from the Staff page.",
        variant: "destructive",
      });
      return;
    }
    openEdit(u);
  }
  function openResetRow(row: AdminUserRow) {
    const u = findUserById(row.user_id);
    if (!u) {
      toast({ title: "No login attached", description: "Cannot reset password — no auth user.", variant: "destructive" });
      return;
    }
    openReset(u);
  }
  function openDeleteRow(row: AdminUserRow) {
    const u = findUserById(row.user_id);
    if (!u) {
      toast({ title: "No login attached", description: "Cannot delete — no auth user.", variant: "destructive" });
      return;
    }
    openDelete(u);
  }

  function handleCreate() {
    if (createForm.password !== createForm.confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const res = await createUserWithPassword({
        email: createForm.email,
        password: createForm.password,
        full_name: createForm.full_name,
        phone: createForm.phone || undefined,
        branch_limit: createForm.branch_limit,
      });
      if (res.error) {
        toast({ title: "Failed to create user", description: res.error, variant: "destructive" });
        return;
      }

      // Optional initial branch
      if (res.userId && createForm.initial_branch_name.trim()) {
        const branchRes = await createGym({
          owner_id: res.userId,
          name: createForm.initial_branch_name.trim(),
          address: createForm.initial_branch_address.trim() || undefined,
          phone: createForm.initial_branch_phone.trim() || undefined,
        });
        if (branchRes.error) {
          toast({ title: "User created, but branch failed", description: branchRes.error, variant: "destructive" });
        } else {
          toast({ title: "User & branch created" });
        }
      } else {
        toast({ title: "User created successfully" });
      }

      // Capture credentials before form resets so we can hand them off
      const handoff = {
        email: createForm.email,
        password: createForm.password,
        full_name: createForm.full_name,
        phone: createForm.phone,
      };
      setDialogMode(null);
      setCredentialsHandoff(handoff);
      loadUsers();
    });
  }

  function handleInvite() {
    startTransition(async () => {
      const res = await inviteUser(inviteEmail);
      if (res.error) {
        toast({ title: "Failed to send invite", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Invite sent", description: `Email sent to ${inviteEmail.email}` });
        setDialogMode(null);
      }
    });
  }

  function handleCreatePartner() {
    startTransition(async () => {
      const res = await createPartnerProspectsUser({
        email: partnerForm.email,
        full_name: partnerForm.full_name,
      });
      if (res.error || !res.password) {
        toast({ title: "Failed to create partner", description: res.error ?? "No password returned", variant: "destructive" });
        return;
      }
      toast({ title: "Partner created" });
      setDialogMode(null);
      setPartnerHandoff({
        email: partnerForm.email,
        password: res.password,
        full_name: partnerForm.full_name,
      });
      loadUsers();
    });
  }

  function handleEdit() {
    if (!selectedUser) return;
    startTransition(async () => {
      const res = await updateAdminUser({
        userId: selectedUser.id,
        email: editForm.email !== selectedUser.email ? editForm.email : undefined,
        full_name: editForm.full_name,
        is_admin: editForm.is_admin,
        branch_limit: editForm.branch_limit,
      });
      if (res.error) {
        toast({ title: "Failed to update user", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "User updated" });
        setDialogMode(null);
        loadUsers();
      }
    });
  }

  function handleReset() {
    if (!selectedUser) return;
    if (resetForm.password !== resetForm.confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const res = await resetUserPassword({ userId: selectedUser.id, newPassword: resetForm.password });
      if (res.error) {
        toast({ title: "Failed to reset password", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Password reset successfully" });
        setDialogMode(null);
      }
    });
  }

  function handleDelete() {
    if (!selectedUser) return;
    startTransition(async () => {
      const res = await deleteAdminUser(selectedUser.id);
      if (res.error) {
        toast({ title: "Failed to delete user", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "User deleted" });
        setDialogMode(null);
        loadUsers();
      }
    });
  }

  const totalPeople =
    (grouped?.groups.reduce((s, g) => s + g.totals.total, 0) ?? users.length) +
    (grouped?.orphans.length ?? 0);
  const stats = {
    gyms: grouped?.groups.length ?? 0,
    total: totalPeople,
    admins: users.filter((u) => u.is_admin).length,
    active: users.filter((u) => u.last_sign_in_at).length,
  };
  const hasOrphans = (grouped?.orphans.length ?? 0) > 0;
  const filteredHasOrphans = filteredOrphans.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <div className="border-b border-sidebar-border px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold">User Management</h1>
              <p className="text-xs text-muted-foreground">Manage gym owner accounts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-2" onClick={loadUsers} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={openPartner}>
              <Handshake className="w-4 h-4" />
              <span className="hidden sm:inline">Create Partner</span>
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={openInvite}>
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Invite</span>
            </Button>
            <Button size="sm" className="gap-2" onClick={openCreate}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create User</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-7xl space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Gyms", value: stats.gyms, icon: Building2, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Total Users", value: stats.total, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Admins", value: stats.admins, icon: Shield, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "Active (logged in)", value: stats.active, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label}>
              <CardContent className="p-3 sm:p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${bg} shrink-0`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{label}</p>
                  <p className="text-xl sm:text-2xl font-bold">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search across all users (name, email, phone, gym)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>

        {/* Grouped users */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 bg-muted/40 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : !grouped || (filteredGroups.length === 0 && !filteredHasOrphans) ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium">No users found</p>
              <p className="text-sm mt-1">
                {q ? "Try a different search term" : "Create or invite a gym owner to get started"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map((group) => (
              <GymSection
                key={group.gym_id}
                group={group}
                isCollapsed={effectiveCollapsed.has(group.gym_id)}
                onToggle={() => toggleSection(group.gym_id)}
                onEdit={openEditRow}
                onReset={openResetRow}
                onDelete={openDeleteRow}
              />
            ))}

            {filteredHasOrphans && (
              <OrphanSection
                orphans={filteredOrphans}
                isCollapsed={effectiveCollapsed.has(ORPHAN_KEY)}
                onToggle={() => toggleSection(ORPHAN_KEY)}
                onEdit={openEditRow}
                onReset={openResetRow}
                onDelete={openDeleteRow}
              />
            )}

            {!hasOrphans && q === "" && filteredGroups.length > 0 && (
              <p className="text-center text-xs text-muted-foreground/60 pt-2">
                All {totalPeople} users assigned to gyms — no orphans.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Create User Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogMode === "create"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create User
            </DialogTitle>
            <DialogDescription>
              Create a new gym owner account with email and password.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input
                  placeholder="John Doe"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone (WhatsApp)</Label>
                <Input
                  placeholder="0300 1234567"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="owner@example.com"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Password * (min 8 chars)</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Confirm Password *</Label>
              <div className="relative">
                <Input
                  type={showPwConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  value={createForm.confirmPassword}
                  onChange={(e) => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwConfirm(!showPwConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPwConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {createForm.confirmPassword && createForm.password !== createForm.confirmPassword && (
                <p className="text-xs text-destructive">Passwords don't match</p>
              )}
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="create-branch-limit">Branch Limit</Label>
              <Input
                id="create-branch-limit"
                type="number"
                min={1}
                max={50}
                value={createForm.branch_limit}
                onChange={(e) => setCreateForm({ ...createForm, branch_limit: Math.max(1, parseInt(e.target.value) || 1) })}
              />
              <p className="text-[11px] text-muted-foreground">How many gym branches this owner can create. Default: 1.</p>
            </div>

            <div className="rounded-lg border border-sidebar-border bg-card/50 p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Initial Branch (optional)</p>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">Skip if owner will create their own. Owner can add up to {createForm.branch_limit} branch{createForm.branch_limit !== 1 ? "es" : ""} later.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-branch-name">Branch Name</Label>
                <Input
                  id="create-branch-name"
                  placeholder="e.g. Main Branch"
                  value={createForm.initial_branch_name}
                  onChange={(e) => setCreateForm({ ...createForm, initial_branch_name: e.target.value })}
                />
              </div>
              {createForm.initial_branch_name && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Address</Label>
                    <Input
                      placeholder="Street, city"
                      value={createForm.initial_branch_address}
                      onChange={(e) => setCreateForm({ ...createForm, initial_branch_address: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Phone</Label>
                    <Input
                      placeholder="+92 ..."
                      value={createForm.initial_branch_phone}
                      onChange={(e) => setCreateForm({ ...createForm, initial_branch_phone: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={
                isPending ||
                !createForm.email ||
                !createForm.password ||
                createForm.password !== createForm.confirmPassword ||
                createForm.password.length < 8
              }
            >
              {isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invite Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={dialogMode === "invite"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4" /> Invite User
            </DialogTitle>
            <DialogDescription>
              Send a magic link invite. User sets their own password on first login.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                placeholder="John Doe"
                value={inviteEmail.full_name}
                onChange={(e) => setInviteEmail({ ...inviteEmail, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="owner@example.com"
                value={inviteEmail.email}
                onChange={(e) => setInviteEmail({ ...inviteEmail, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-branch-limit">Branch Limit</Label>
              <Input
                id="invite-branch-limit"
                type="number"
                min={1}
                max={50}
                value={inviteEmail.branch_limit}
                onChange={(e) => setInviteEmail({ ...inviteEmail, branch_limit: Math.max(1, parseInt(e.target.value) || 1) })}
              />
              <p className="text-[11px] text-muted-foreground">How many gym branches this owner can create.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={isPending || !inviteEmail.email}>
              {isPending ? "Sending..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Partner Dialog ──────────────────────────────────────────── */}
      <Dialog open={dialogMode === "partner"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="w-4 h-4" /> Create Partner User
            </DialogTitle>
            <DialogDescription>
              Creates a <span className="font-medium">prospects-only admin</span>. They can only see and manage the Gym Pipeline — no member, payment, or gym data access. Password is generated and shown once.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                placeholder="Partner"
                value={partnerForm.full_name}
                onChange={(e) => setPartnerForm({ ...partnerForm, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="partner@example.com"
                value={partnerForm.email}
                onChange={(e) => setPartnerForm({ ...partnerForm, email: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
            <Button onClick={handleCreatePartner} disabled={isPending || !partnerForm.email}>
              {isPending ? "Creating..." : "Create Partner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog ───────────────────────────────────────────────── */}
      <Dialog open={dialogMode === "edit"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-4 h-4" /> Edit User
            </DialogTitle>
            <DialogDescription>{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                placeholder="John Doe"
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Admin Access</p>
                <p className="text-xs text-muted-foreground">Can manage all users</p>
              </div>
              <button
                onClick={() => setEditForm({ ...editForm, is_admin: !editForm.is_admin })}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  editForm.is_admin
                    ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                    : "bg-muted text-muted-foreground border-border hover:bg-accent"
                }`}
              >
                {editForm.is_admin ? (
                  <><Shield className="w-3.5 h-3.5" /> Admin</>
                ) : (
                  <><ShieldOff className="w-3.5 h-3.5" /> User</>
                )}
              </button>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="edit-branch-limit">Branch Limit</Label>
              <Input
                id="edit-branch-limit"
                type="number"
                min={1}
                max={50}
                value={editForm.branch_limit}
                onChange={(e) => setEditForm({ ...editForm, branch_limit: Math.max(1, parseInt(e.target.value) || 1) })}
              />
              <p className="text-[11px] text-muted-foreground">
                Max gyms this owner can create.
                {selectedUser && <> Currently using <span className="text-foreground font-medium">{selectedUser.gyms.length} / {editForm.branch_limit}</span>.</>}
              </p>
            </div>

            {selectedUser && (
              <BranchManager
                user={selectedUser}
                limit={editForm.branch_limit}
                onChanged={() => loadUsers()}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ──────────────────────────────────────────── */}
      <Dialog open={dialogMode === "reset"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> Reset Password
            </DialogTitle>
            <DialogDescription>{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>New Password * (min 8 chars)</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={resetForm.password}
                  onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })}
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Confirm New Password *</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={resetForm.confirmPassword}
                onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
              />
              {resetForm.confirmPassword && resetForm.password !== resetForm.confirmPassword && (
                <p className="text-xs text-destructive">Passwords don't match</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
            <Button
              onClick={handleReset}
              disabled={
                isPending ||
                !resetForm.password ||
                resetForm.password !== resetForm.confirmPassword ||
                resetForm.password.length < 8
              }
            >
              {isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ──────────────────────────────────────────── */}
      <Dialog open={dialogMode === "delete"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" /> Delete User
            </DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{selectedUser?.email}</strong> and all their gym data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Deleting..." : "Yes, Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Credentials Handoff Dialog (after user creation) ───────────────── */}
      <Dialog open={!!credentialsHandoff} onOpenChange={(o) => !o && setCredentialsHandoff(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> User created
            </DialogTitle>
            <DialogDescription>
              Send these credentials to <span className="font-medium">{credentialsHandoff?.full_name || "the new user"}</span>.
            </DialogDescription>
          </DialogHeader>
          {credentialsHandoff && (() => {
            const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
            const message = `Welcome to Pulse GMS!

Your login credentials:
Email: ${credentialsHandoff.email}
Password: ${credentialsHandoff.password}

Login: ${loginUrl}

Please change your password after first login.`;
            const url = whatsappUrl(credentialsHandoff.phone, message);
            const phoneOk = !!normalizeWhatsAppPhone(credentialsHandoff.phone);

            return (
              <div className="space-y-3 py-2">
                {/* Credentials block */}
                <div className="rounded-lg border border-sidebar-border bg-card/50 p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Email</p>
                      <p className="font-mono text-foreground truncate">{credentialsHandoff.email}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                      onClick={() => { navigator.clipboard.writeText(credentialsHandoff.email); toast({ title: "Email copied" }); }}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-sidebar-border/60 pt-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Password</p>
                      <p className="font-mono text-foreground truncate">{credentialsHandoff.password}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                      onClick={() => { navigator.clipboard.writeText(credentialsHandoff.password); toast({ title: "Password copied" }); }}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* WhatsApp action */}
                {url && phoneOk ? (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-emerald-500 text-white font-medium hover:bg-emerald-600 transition-colors">
                    <MessageCircle className="w-4 h-4" /> Send via WhatsApp
                  </a>
                ) : (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs text-amber-400 space-y-2">
                    <p>{credentialsHandoff.phone ? "Phone number invalid" : "No phone number provided"} — copy the credentials above and send manually.</p>
                    <Button size="sm" variant="outline" className="gap-1.5"
                      onClick={() => { navigator.clipboard.writeText(message); toast({ title: "Full message copied" }); }}>
                      <Copy className="w-3.5 h-3.5" /> Copy full message
                    </Button>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground/70 text-center">
                  ⚠ Sharing credentials over messaging has security implications. Tell the user to change their password after first login.
                </p>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredentialsHandoff(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Partner Handoff Dialog (one-time password reveal) ──────────────── */}
      <Dialog open={!!partnerHandoff} onOpenChange={(o) => !o && setPartnerHandoff(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Partner created
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium">{partnerHandoff?.full_name || "Partner"}</span> can sign in at <span className="font-mono">/login</span> with the credentials below. They will only see the Gym Pipeline.
            </DialogDescription>
          </DialogHeader>
          {partnerHandoff && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3 flex items-start gap-2 text-xs text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  <span className="font-semibold">Save this password now.</span> It cannot be shown again. If lost, reset it from this page.
                </p>
              </div>

              <div className="rounded-lg border border-sidebar-border bg-card/50 p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Email</p>
                    <p className="font-mono text-foreground truncate">{partnerHandoff.email}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                    onClick={() => { navigator.clipboard.writeText(partnerHandoff.email); toast({ title: "Email copied" }); }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-sidebar-border/60 pt-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Password</p>
                    <p className="font-mono text-foreground truncate">{partnerHandoff.password}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                    onClick={() => { navigator.clipboard.writeText(partnerHandoff.password); toast({ title: "Password copied" }); }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => {
                  navigator.clipboard.writeText(`Email: ${partnerHandoff.email}\nPassword: ${partnerHandoff.password}`);
                  toast({ title: "Credentials copied" });
                }}
              >
                <Copy className="w-3.5 h-3.5" /> Copy both
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setPartnerHandoff(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Branch manager subcomponent ──────────────────────────────────────────────

function BranchManager({ user, limit, onChanged }: { user: AdminUser; limit: number; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [working, setWorking] = useState(false);
  const canAdd = user.gyms.length < limit;

  async function handleAdd() {
    if (!form.name.trim()) {
      toast({ title: "Branch name required", variant: "destructive" });
      return;
    }
    setWorking(true);
    const res = await createGym({
      owner_id: user.id,
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      phone: form.phone.trim() || undefined,
    });
    setWorking(false);
    if (res.error) {
      toast({ title: "Failed", description: res.error, variant: "destructive" });
      return;
    }
    toast({ title: "Branch added" });
    setForm({ name: "", address: "", phone: "" });
    setAdding(false);
    onChanged();
  }

  async function handleDelete(gymId: string, gymName: string) {
    if (!confirm(`Delete branch "${gymName}"? This removes all data scoped to it.`)) return;
    const res = await deleteGym(gymId);
    if (res.error) {
      toast({ title: "Failed", description: res.error, variant: "destructive" });
    } else {
      toast({ title: "Branch deleted" });
      onChanged();
    }
  }

  return (
    <div className="rounded-lg border border-sidebar-border bg-card/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Branches</p>
        <span className="text-[10px] text-muted-foreground">{user.gyms.length} / {limit}</span>
      </div>

      {user.gyms.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/80">No branches yet.</p>
      ) : (
        <div className="space-y-1">
          {user.gyms.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground truncate">{g.name}</span>
                {g.total_capacity > 0 && <span className="text-[10px] text-muted-foreground">· {g.total_capacity} cap</span>}
              </div>
              <button
                onClick={() => handleDelete(g.id, g.name)}
                className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                title="Delete branch"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="space-y-2 pt-1">
          <Input
            placeholder="Branch name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
            className="h-8 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="h-8 text-sm"
            />
            <Input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={working || !form.name.trim()} className="h-7 text-xs">
              {working ? "Adding…" : "Add"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setForm({ name: "", address: "", phone: "" }); }} className="h-7 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        canAdd ? (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-primary hover:bg-primary/10 transition-colors border border-dashed border-primary/30"
          >
            <Plus className="w-3 h-3" /> Add Branch
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground/80">Increase branch limit above to add more.</p>
        )
      )}
    </div>
  );
}

// ── Gym Section (accordion) ──────────────────────────────────────────────────

function GymSection({
  group,
  isCollapsed,
  onToggle,
  onEdit,
  onReset,
  onDelete,
}: {
  group: AdminGymGroup;
  isCollapsed: boolean;
  onToggle: () => void;
  onEdit: (row: AdminUserRow) => void;
  onReset: (row: AdminUserRow) => void;
  onDelete: (row: AdminUserRow) => void;
}) {
  const ownerCount = group.totals.owners;
  const staffCount = group.totals.staff;
  const ownerLabel = ownerCount === 1 ? "1 owner" : `${ownerCount} owners`;
  const staffLabel = staffCount === 1 ? "1 staff" : `${staffCount} staff`;

  return (
    <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
      {/* Header — clickable accordion toggle */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        className="w-full flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4 hover:bg-muted/30 transition-colors text-left min-h-[56px]"
      >
        <div className="shrink-0 p-2 rounded-lg bg-primary/10 border border-primary/20">
          <Building2 className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm sm:text-base font-semibold truncate">{group.gym_name}</h3>
            {group.is_demo_gym && (
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-amber-500/15 text-amber-400 border-amber-500/30">
                DEMO
              </Badge>
            )}
            {!group.owner && (
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-rose-500/15 text-rose-400 border-rose-500/30 gap-1">
                <AlertTriangle className="w-2.5 h-2.5" /> No owner
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ownerLabel} · {staffLabel} · {group.totals.total} total
          </p>
        </div>
        <Link
          href={`/admin/gyms`}
          onClick={(e) => e.stopPropagation()}
          className="hidden sm:inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0 px-2 py-1"
          title="View gym in Gyms admin"
        >
          View gym <ExternalLink className="w-3 h-3" />
        </Link>
        <div className="shrink-0 text-muted-foreground p-1">
          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* Body */}
      {!isCollapsed && (
        <div className="border-t border-sidebar-border/60">
          {/* Owner row */}
          {group.owner ? (
            <UserRow
              row={group.owner}
              onEdit={onEdit}
              onReset={onReset}
              onDelete={onDelete}
              accent="owner"
            />
          ) : (
            <div className="px-4 py-4 sm:px-5 text-xs text-rose-400 bg-rose-500/[0.04]">
              No owner assigned — assign one from the Gyms admin page.
            </div>
          )}

          {/* Separator between owner & staff */}
          {group.owner && group.staff.length > 0 && (
            <div className="border-t border-dashed border-sidebar-border/60" />
          )}

          {/* Staff rows */}
          {group.staff.length === 0 && group.owner ? (
            <div className="px-4 py-4 sm:px-5 flex items-center justify-between gap-3 bg-muted/10">
              <p className="text-xs text-muted-foreground">No staff added yet.</p>
              <Link
                href="/staff"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline shrink-0"
              >
                <UserPlus className="w-3 h-3" /> Add staff
              </Link>
            </div>
          ) : (
            group.staff.map((row) => (
              <UserRow
                key={`${group.gym_id}:${row.staff_id ?? row.user_id ?? row.email ?? row.full_name}`}
                row={row}
                onEdit={onEdit}
                onReset={onReset}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Orphan Section ───────────────────────────────────────────────────────────

function OrphanSection({
  orphans,
  isCollapsed,
  onToggle,
  onEdit,
  onReset,
  onDelete,
}: {
  orphans: AdminUserRow[];
  isCollapsed: boolean;
  onToggle: () => void;
  onEdit: (row: AdminUserRow) => void;
  onReset: (row: AdminUserRow) => void;
  onDelete: (row: AdminUserRow) => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.03] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        className="w-full flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4 hover:bg-amber-500/[0.06] transition-colors text-left min-h-[56px]"
      >
        <div className="shrink-0 p-2 rounded-lg bg-amber-500/15 border border-amber-500/30">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm sm:text-base font-semibold">No gym assigned</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {orphans.length} user{orphans.length !== 1 ? "s" : ""} (review)
          </p>
        </div>
        <div className="shrink-0 text-muted-foreground p-1">
          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {!isCollapsed && (
        <div className="border-t border-amber-500/20">
          {orphans.map((row) => (
            <UserRow
              key={`orphan:${row.user_id ?? row.email ?? row.full_name}`}
              row={row}
              onEdit={onEdit}
              onReset={onReset}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── User Row ─────────────────────────────────────────────────────────────────

function UserRow({
  row,
  onEdit,
  onReset,
  onDelete,
  accent,
}: {
  row: AdminUserRow;
  onEdit: (row: AdminUserRow) => void;
  onReset: (row: AdminUserRow) => void;
  onDelete: (row: AdminUserRow) => void;
  accent?: "owner";
}) {
  const isOwner = row.role === "owner";
  const initial = (row.full_name ?? row.email ?? "?").charAt(0).toUpperCase();
  const roleLabel = ROLE_LABEL[row.role] ?? row.role;
  const roleStyle = ROLE_STYLE[row.role] ?? ROLE_STYLE.other;
  const noLogin = !row.user_id;
  const scope = row.admin_scope ?? "full";
  const isProspectsAdmin = row.is_admin && scope === "prospects";

  return (
    <div
      className={`flex items-start sm:items-center gap-3 px-4 py-3 sm:px-5 sm:py-3 border-b border-sidebar-border/40 last:border-0 hover:bg-muted/20 transition-colors ${
        accent === "owner" ? "bg-amber-500/[0.03]" : ""
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          isOwner ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "bg-sidebar text-white"
        }`}
      >
        {isOwner ? <Crown className="w-4 h-4" /> : initial}
      </div>

      {/* Role pill (desktop visible alongside; mobile under name) */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm truncate">{row.full_name ?? "—"}</p>
          <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${roleStyle}`}>
            {roleLabel}
          </span>
          {row.is_admin && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-purple-500/10 text-purple-400 border-purple-500/30">
              <Shield className="w-2.5 h-2.5" /> ADMIN
            </span>
          )}
          {isProspectsAdmin && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-sky-500/10 text-sky-400 border-sky-500/30">
              <Handshake className="w-2.5 h-2.5" /> Prospects only
            </span>
          )}
          {row.is_demo && (
            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30">
              DEMO
            </span>
          )}
          {noLogin && (
            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border">
              no login
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {row.email ?? <span className="italic">no email</span>}
        </p>
        {/* Multi-gym hints (owner rows) */}
        {(row.also_owns_count || row.also_staff_at?.length) && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
            {row.also_owns_count ? `also owns ${row.also_owns_count} other` : ""}
            {row.also_owns_count && row.also_staff_at?.length ? " · " : ""}
            {row.also_staff_at?.length ? `staff at ${row.also_staff_at.join(", ")}` : ""}
          </p>
        )}
      </div>

      {/* Last login (hidden on mobile) */}
      <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 w-28">
        <Clock className="w-3 h-3 shrink-0" />
        {row.last_sign_in_at ? formatDate(row.last_sign_in_at) : <span className="italic opacity-60">never</span>}
      </div>

      {/* Action cluster */}
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 sm:h-9 sm:w-9"
          title="Edit user"
          onClick={() => onEdit(row)}
          disabled={noLogin}
        >
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 sm:h-9 sm:w-9"
          title="Reset password"
          onClick={() => onReset(row)}
          disabled={noLogin}
        >
          <KeyRound className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 sm:h-9 sm:w-9 text-destructive hover:text-destructive"
          title="Delete user"
          onClick={() => onDelete(row)}
          disabled={noLogin}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
