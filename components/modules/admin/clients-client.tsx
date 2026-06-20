"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Clock,
  Eye,
  EyeOff,
  Users,
  Activity,
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  Copy,
  Check,
  RefreshCw,
  Building2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  type DmsClient,
  createDmsClient,
  deleteDmsClient,
  updateDmsClientTrial,
} from "@/app/actions/admin-users";
import { ManageBranchesDialog } from "@/components/admin/manage-branches-dialog";

// ── Trial status badge ────────────────────────────────────────────────────────

function daysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function TrialBadge({ client }: { client: DmsClient }) {
  if (client.trial_status === "full") {
    return <span className="text-xs text-muted-foreground">Full Access</span>;
  }
  if (client.trial_status === "active") {
    const days = daysLeft(client.trial_ends_at);
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
        Active &middot; {days}d left
      </span>
    );
  }
  if (client.trial_status === "expiring") {
    const days = daysLeft(client.trial_ends_at);
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
        Expiring &middot; {days}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
      Expired
    </span>
  );
}

// ── Create Client Dialog ──────────────────────────────────────────────────────

type CreateForm = {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  shop_name: string;
  trial_plan: string;
};

type CreatedCredentials = {
  full_name: string;
  email: string;
  password: string;
  phone: string;
};

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pwd = "";
  for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

const FIELD_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50";

function buildWelcomeMessage(creds: CreatedCredentials, loginUrl: string) {
  return `Assalam-o-Alaikum ${creds.full_name}!\n\n*Your DMS login credentials:*\n\n*Email:* ${creds.email}\n*Password:* ${creds.password}\n\nLogin at: ${loginUrl}`;
}

function CreateClientDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState<CreatedCredentials | null>(null);
  const [form, setForm] = useState<CreateForm>({
    full_name: "",
    email: "",
    password: generatePassword(),
    phone: "",
    shop_name: "",
    trial_plan: "14_day",
  });

  function reset() {
    setForm({ full_name: "", email: "", password: generatePassword(), phone: "", shop_name: "", trial_plan: "14_day" });
    setShowPassword(false);
    setCreated(null);
    setCopied(false);
  }

  function handleClose() {
    if (created) router.refresh();
    reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const result = await createDmsClient({
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        shop_name: form.shop_name || undefined,
        trial_plan: form.trial_plan,
      });
      if (result.error) {
        toast({ title: "Failed to create client", description: result.error, variant: "destructive" });
      } else {
        setCreated({ full_name: form.full_name, email: form.email, password: form.password, phone: form.phone });
      }
    });
  }

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "https://dms.yourpulse.io/login";

  function handleCopy() {
    if (!created) return;
    navigator.clipboard.writeText(buildWelcomeMessage(created, loginUrl)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleWhatsApp() {
    if (!created) return;
    const msg = buildWelcomeMessage(created, loginUrl);
    let digits = created.phone.replace(/\D/g, "");
    // Normalize Pakistani local format: 03XXXXXXXXX → 923XXXXXXXXX
    if (digits.startsWith("0")) digits = "92" + digits.slice(1);
    const url = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Client</DialogTitle>
        </DialogHeader>

        {created ? (
          /* ── Success / share state ── */
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>
                Account created for <span className="font-semibold">{created.full_name}</span>
              </span>
            </div>

            <div className="rounded-lg border border-sidebar-border bg-sidebar divide-y divide-sidebar-border text-sm">
              <div className="flex items-center justify-between gap-4 px-3 py-2.5">
                <span className="text-muted-foreground shrink-0">Email</span>
                <span className="font-medium text-foreground truncate text-right">{created.email}</span>
              </div>
              <div className="flex items-center justify-between gap-4 px-3 py-2.5">
                <span className="text-muted-foreground shrink-0">Password</span>
                <span className="font-mono font-medium text-foreground">{created.password}</span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Button
                type="button"
                onClick={handleWhatsApp}
                className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5a] text-white"
              >
                <MessageCircle size={15} />
                Send via WhatsApp
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopy}
                  className="flex-1 gap-1.5"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied!" : "Copy Message"}
                </Button>
                <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                  Done
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* ── Create form ── */
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Full Name</label>
              <input
                type="text"
                required
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Ali Raza"
                className={FIELD_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="ali@example.com"
                className={FIELD_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 8 characters"
                    className={`${FIELD_CLASS} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => { setForm((f) => ({ ...f, password: generatePassword() })); setShowPassword(true); }}
                  title="Generate random password"
                >
                  <RefreshCw size={15} />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                WhatsApp Number{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="03001234567"
                className={FIELD_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Shop Name{" "}
                <span className="font-normal text-muted-foreground">(optional — client sets on first login)</span>
              </label>
              <input
                type="text"
                value={form.shop_name}
                onChange={(e) => setForm((f) => ({ ...f, shop_name: e.target.value }))}
                placeholder="Al-Raza Electronics"
                className={FIELD_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Trial</label>
              <Select
                value={form.trial_plan}
                onValueChange={(v) => setForm((f) => ({ ...f, trial_plan: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Access (No Trial)</SelectItem>
                  <SelectItem value="7_day">7-Day Trial</SelectItem>
                  <SelectItem value="14_day">14-Day Trial</SelectItem>
                  <SelectItem value="30_day">30-Day Trial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isPending ? "Creating…" : "Create Client"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Extend Trial Dialog ───────────────────────────────────────────────────────

function ExtendTrialDialog({
  client,
  onClose,
}: {
  client: DmsClient | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [plan, setPlan] = useState("14_day");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client?.shop_id) return;
    startTransition(async () => {
      const result = await updateDmsClientTrial(client.shop_id!, plan);
      if (result.error) {
        toast({ title: "Failed to update trial", description: result.error, variant: "destructive" });
      } else {
        toast({ title: "Trial updated successfully" });
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={!!client} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Extend Trial</DialogTitle>
        </DialogHeader>
        {client && (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Updating trial for <span className="font-medium text-foreground">{client.full_name ?? client.email}</span>
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">New Trial Plan</label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Access (No Trial)</SelectItem>
                  <SelectItem value="7_day">7-Day Trial</SelectItem>
                  <SelectItem value="14_day">14-Day Trial</SelectItem>
                  <SelectItem value="30_day">30-Day Trial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type ManagingBranchesTarget = {
  shopId: string;
  shopName: string;
  branchLimit: number;
};

export default function ClientsClient({ clients }: { clients: DmsClient[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [extendTarget, setExtendTarget] = useState<DmsClient | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [managingBranchesFor, setManagingBranchesFor] = useState<ManagingBranchesTarget | null>(null);

  // Stats
  const totalClients = clients.filter((c) => !c.is_admin).length;
  const activeTrials = clients.filter(
    (c) => !c.is_admin && (c.trial_status === "active" || c.trial_status === "expiring")
  ).length;
  const expiredOrExpiring = clients.filter(
    (c) => !c.is_admin && (c.trial_status === "expired" || c.trial_status === "expiring")
  ).length;

  const displayClients = clients.filter((c) => !c.is_admin);

  async function handleDelete(client: DmsClient) {
    const name = client.full_name ?? client.email ?? client.user_id;
    if (!window.confirm(`Delete client ${name}? This cannot be undone.`)) return;
    setDeletingId(client.user_id);
    const result = await deleteDmsClient(client.user_id);
    setDeletingId(null);
    if (result.error) {
      toast({ title: "Failed to delete client", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "Client deleted" });
      router.refresh();
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Clients</h1>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
        >
          <Plus size={16} />
          Create Client
        </Button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm">
          <Users size={14} className="text-muted-foreground" />
          <span className="font-semibold text-foreground">{totalClients}</span>
          <span className="text-muted-foreground">Total</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm">
          <Activity size={14} className="text-emerald-400" />
          <span className="font-semibold text-foreground">{activeTrials}</span>
          <span className="text-muted-foreground">Active Trials</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm">
          <AlertTriangle size={14} className="text-amber-400" />
          <span className="font-semibold text-foreground">{expiredOrExpiring}</span>
          <span className="text-muted-foreground">Expiring / Expired</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-sidebar-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sidebar-border bg-sidebar">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Client
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Shop
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Trial Status
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Branches
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Joined
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sidebar-border">
            {displayClients.map((client) => (
              <tr key={client.user_id} className="bg-card hover:bg-sidebar/50 transition-colors">
                {/* Client */}
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">
                    {client.full_name ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">{client.email}</div>
                </td>

                {/* Shop */}
                <td className="px-4 py-3 text-muted-foreground">
                  {client.shop_name ?? <span className="italic text-xs">No shop</span>}
                </td>

                {/* Trial Status */}
                <td className="px-4 py-3">
                  <TrialBadge client={client} />
                </td>

                {/* Branches */}
                <td className="px-4 py-3">
                  {client.shop_id ? (
                    <button
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() =>
                        setManagingBranchesFor({
                          shopId: client.shop_id!,
                          shopName: client.shop_name ?? client.full_name ?? client.email ?? "Shop",
                          branchLimit: client.branch_limit,
                        })
                      }
                      title="Manage branches"
                    >
                      <Building2 size={13} />
                      <span>
                        {client.branch_count} / {client.branch_limit}
                      </span>
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground/50 italic">—</span>
                  )}
                </td>

                {/* Joined */}
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {client.created_at
                    ? new Date(client.created_at).toLocaleDateString("en-PK")
                    : "—"}
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 gap-1 text-xs"
                      onClick={() =>
                        client.shop_id &&
                        setManagingBranchesFor({
                          shopId: client.shop_id,
                          shopName: client.shop_name ?? client.full_name ?? client.email ?? "Shop",
                          branchLimit: client.branch_limit,
                        })
                      }
                      disabled={!client.shop_id}
                      title={!client.shop_id ? "No shop linked" : "Manage branches"}
                    >
                      <Building2 size={13} />
                      Branches
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 gap-1 text-xs"
                      onClick={() => setExtendTarget(client)}
                      disabled={!client.shop_id}
                      title={!client.shop_id ? "No shop linked" : "Extend trial"}
                    >
                      <Clock size={13} />
                      Extend
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                      onClick={() => handleDelete(client)}
                      disabled={deletingId === client.user_id}
                      title="Delete client"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {displayClients.length === 0 && (
          <div className="px-4 py-16 text-center">
            <Users size={32} className="mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">No clients yet.</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Click &ldquo;Create Client&rdquo; to add your first client.
            </p>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateClientDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ExtendTrialDialog client={extendTarget} onClose={() => setExtendTarget(null)} />
      {managingBranchesFor && (
        <ManageBranchesDialog
          open={!!managingBranchesFor}
          onOpenChange={(v) => { if (!v) setManagingBranchesFor(null); }}
          shopId={managingBranchesFor.shopId}
          shopName={managingBranchesFor.shopName}
          currentBranchLimit={managingBranchesFor.branchLimit}
        />
      )}
    </>
  );
}
