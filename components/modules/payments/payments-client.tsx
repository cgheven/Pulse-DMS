"use client";
import { useState, useMemo, useTransition } from "react";
import {
  CreditCard, AlertTriangle, Plus, XCircle, Search, MessageCircle, FileText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { revalidatePayments, createPayment, updatePayment } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, formatDateInput, memberPlanLabel } from "@/lib/utils";
import { useGymContext } from "@/contexts/gym-context";
import { buildReminderMessage, whatsappUrl } from "@/lib/whatsapp-reminder";
import { validateMoney } from "@/lib/validation";
import type { Payment, PaymentMethod, PaymentStatus, Member, MembershipPlan, Gym } from "@/types";
import { InvoiceDialog, type InvoiceData } from "@/components/modules/payments/invoice-dialog"

type MemberRow = Pick<Member,
  "id" | "full_name" | "member_number" | "phone" | "monthly_fee" | "plan_id" |
  "assigned_trainer_id" | "status" | "plan_expiry_date" | "outstanding_balance" |
  "pending_signup_discount"
> & { plan?: { name: string } | null; plans?: { plan?: { id: string; name: string; color: string } | null }[] | null; trainer?: { full_name: string } | null };

type PlanRow = Pick<MembershipPlan, "id" | "name" | "price" | "duration_type">;

interface Props {
  gymId: string | null;
  payments: Payment[];
  members: MemberRow[];
  plans: PlanRow[];
}

const methodLabels: Record<PaymentMethod, string> = {
  cash: "Cash", bank_transfer: "Bank Transfer", jazzcash: "JazzCash",
  easypaisa: "Easypaisa", card: "Card", other: "Other",
};

const statusStyles: Record<PaymentStatus, string> = {
  paid:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  pending:  "bg-primary/10 text-primary border-primary/20",
  overdue:  "bg-rose-500/10 text-rose-400 border-rose-500/20",
  refunded: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  waived:   "bg-white/5 text-muted-foreground border-white/10",
};

const statusLabels: Record<PaymentStatus, string> = {
  paid: "Paid", pending: "Pending", overdue: "Overdue", refunded: "Refunded", waived: "Waived",
};

function StatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

function genReceipt(memberName: string, period: string) {
  const initials = memberName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return `PLS-${(period ?? "").replace("-", "")}-${initials}-${Math.floor(Math.random() * 900 + 100)}`;
}

const CURRENT_MONTH = (() => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
})();

const MONTH_LABEL = new Date().toLocaleString("default", { month: "long", year: "numeric" });

// ─── Inline member picker (Add Entry dialog) ──────────────────────────────────
function MemberPicker({ members, value, onChange }: {
  members: MemberRow[];
  value: string;
  onChange: (id: string, member: MemberRow | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [trainerFilter, setTrainerFilter] = useState<string>("all");

  const trainers = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const m of members) {
      if (m.assigned_trainer_id && m.trainer?.full_name && !seen.has(m.assigned_trainer_id)) {
        seen.add(m.assigned_trainer_id);
        list.push({ id: m.assigned_trainer_id, name: m.trainer.full_name });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [members]);

  const filtered = useMemo(() => {
    let list = members;
    if (trainerFilter !== "all") {
      list = trainerFilter === "none"
        ? list.filter((m) => !m.assigned_trainer_id)
        : list.filter((m) => m.assigned_trainer_id === trainerFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((m) => m.full_name.toLowerCase().includes(q));
    }
    return list;
  }, [members, query, trainerFilter]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          className="w-full h-9 pl-8 pr-3 rounded-lg border border-sidebar-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50"
          placeholder="Search members…" value={query}
          onChange={(e) => setQuery(e.target.value)} autoComplete="off"
        />
      </div>
      {trainers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setTrainerFilter("all")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              trainerFilter === "all"
                ? "bg-primary/15 border-primary/30 text-primary"
                : "bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
            }`}>All</button>
          {trainers.map((t) => (
            <button key={t.id} type="button" onClick={() => setTrainerFilter(trainerFilter === t.id ? "all" : t.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                trainerFilter === t.id
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
              }`}>{t.name}</button>
          ))}
          <button type="button" onClick={() => setTrainerFilter(trainerFilter === "none" ? "all" : "none")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              trainerFilter === "none"
                ? "bg-primary/15 border-primary/30 text-primary"
                : "bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
            }`}>Gym Only</button>
        </div>
      )}
      <div className="max-h-52 overflow-y-auto rounded-lg border border-sidebar-border divide-y divide-sidebar-border/50">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground text-center">No members found</p>
        ) : filtered.map((m) => {
          const selected = value === m.id;
          return (
            <button key={m.id} type="button"
              onClick={() => onChange(selected ? "" : m.id, selected ? null : m)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left ${
                selected ? "bg-primary/10" : "hover:bg-white/5"
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                selected ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"
              }`}>
                {m.full_name[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${selected ? "text-primary" : "text-foreground"}`}>
                  {m.full_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(Number(m.monthly_fee))} · {memberPlanLabel(m, "No plan")}
                  {m.trainer?.full_name && <span className="ml-1 text-muted-foreground/60">· {m.trainer.full_name}</span>}
                </p>
              </div>
              {selected && <span className="text-[10px] font-semibold text-primary uppercase tracking-wide shrink-0">Selected</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PaymentsClient({ gymId, payments: initialPayments, members }: Props) {
  const { gym, isDemo } = useGymContext();
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [view, setView] = useState<"members" | "history">("members");

  // Members view state
  const [memberSearch, setMemberSearch] = useState("");
  const [memberTrainerFilter, setMemberTrainerFilter] = useState("all");

  // History view state
  const [histSearch, setHistSearch] = useState("");
  const [histStatus, setHistStatus] = useState<PaymentStatus | "all">("all");

  const [addDialog, setAddDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const emptyForm = {
    member_id: "", total_amount: "", discount: "0", late_fee: "0",
    method: "cash" as PaymentMethod, date: formatDateInput(new Date()),
    for_period: CURRENT_MONTH, receipt_number: "", notes: "",
  };
  const [addForm, setAddForm] = useState(emptyForm);

  // Map member_id → their latest payment for current month
  const currentMonthPayments = useMemo(() => {
    const map = new Map<string, Payment>();
    for (const p of payments) {
      if (p.for_period === CURRENT_MONTH && p.status !== "refunded") {
        const existing = map.get(p.member_id ?? "");
        if (!existing || p.status === "paid") map.set(p.member_id ?? "", p);
      }
    }
    return map;
  }, [payments]);

  // Unique trainers derived from members
  const trainers = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const m of members) {
      if (m.assigned_trainer_id && m.trainer?.full_name && !seen.has(m.assigned_trainer_id)) {
        seen.add(m.assigned_trainer_id);
        list.push({ id: m.assigned_trainer_id, name: m.trainer.full_name });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [members]);

  // Filtered + sorted members for members view (unpaid first)
  const memberRows = useMemo(() => {
    let list = members;
    if (memberTrainerFilter !== "all") {
      list = memberTrainerFilter === "none"
        ? list.filter((m) => !m.assigned_trainer_id)
        : list.filter((m) => m.assigned_trainer_id === memberTrainerFilter);
    }
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase();
      list = list.filter((m) => m.full_name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const aPaid = currentMonthPayments.get(a.id)?.status === "paid" ? 1 : 0;
      const bPaid = currentMonthPayments.get(b.id)?.status === "paid" ? 1 : 0;
      return aPaid - bPaid;
    });
  }, [members, memberSearch, memberTrainerFilter, currentMonthPayments]);

  const historyRows = useMemo(() => {
    let list = payments;
    if (histStatus !== "all") list = list.filter((p) => p.status === histStatus);
    if (histSearch.trim()) {
      const q = histSearch.toLowerCase();
      list = list.filter((p) =>
        (p.member?.full_name ?? "").toLowerCase().includes(q) ||
        (p.receipt_number ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [payments, histStatus, histSearch]);

  function hardRefresh() {
    startRefresh(async () => { await revalidatePayments(); router.refresh(); });
  }

  function recordPayment(m: MemberRow) {
    // Pre-fill the promised signup discount (admission unpaid pledge) when
    // present. The owner can still edit before submit. The discount only
    // clears the member's pending column when for_period === "admission" and
    // status === "paid" server-side, so callers can safely tweak.
    const promised = Number(m.pending_signup_discount ?? 0);
    const next = {
      ...emptyForm,
      member_id: m.id,
      total_amount: String(Number(m.monthly_fee)),
      discount: promised > 0 ? String(promised) : "0",
    };
    setAddForm(next);
    setAddDialog(true);
  }

  function openInvoice(payment: Payment, member?: MemberRow | null) {
    setInvoiceData({
      payment,
      memberName: payment.member?.full_name ?? member?.full_name ?? "Member",
      memberPhone: member?.phone ?? null,
      planName: member ? (memberPlanLabel(member, "") || null) : null,
    })
  }

  function sendReminder(m: MemberRow) {
    if (!m.phone) {
      toast({ title: "No phone number on file for this member", variant: "destructive" });
      return;
    }
    const due = m.outstanding_balance && m.outstanding_balance > 0 ? Number(m.outstanding_balance) : Number(m.monthly_fee);
    const message = buildReminderMessage({
      template: gym?.reminder_template,
      memberName: m.full_name,
      amount: due,
      month: MONTH_LABEL,
      gymName: gym?.name ?? "Your Gym",
      accounts: gym?.payment_methods ?? [],
    });
    const url = whatsappUrl(m.phone, message);
    if (!url) {
      toast({ title: "Phone format invalid", variant: "destructive" });
      return;
    }
    window.open(url, "_blank");
  }

  async function updateStatus(p: Payment, status: PaymentStatus) {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    setPayments((prev) => prev.map((pay) => pay.id === p.id ? { ...pay, status } : pay));
    // Route through server action — RLS would block non-owner staff direct writes.
    const res = await updatePayment(p.id, { status });
    if ("error" in res) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
      setPayments((prev) => prev.map((pay) => pay.id === p.id ? p : pay));
    }
  }

  async function handleAddPayment() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!gymId || !addForm.member_id) {
      toast({ title: "Select a member", variant: "destructive" });
      return;
    }
    const amountCheck = validateMoney(addForm.total_amount, "Amount");
    if (!amountCheck.ok) {
      toast({ title: "Check the form", description: amountCheck.message, variant: "destructive" });
      return;
    }
    const discountCheck = validateMoney(addForm.discount || "0", "Discount");
    if (!discountCheck.ok) {
      toast({ title: "Check the form", description: discountCheck.message, variant: "destructive" });
      return;
    }
    const lateCheck = validateMoney(addForm.late_fee || "0", "Late fee");
    if (!lateCheck.ok) {
      toast({ title: "Check the form", description: lateCheck.message, variant: "destructive" });
      return;
    }
    setSaving(true);
    const member = members.find((m) => m.id === addForm.member_id);
    const receipt = genReceipt(member?.full_name ?? "M", addForm.for_period);
    const totalAmount = parseFloat(addForm.total_amount) || 0;
    const discount = parseFloat(addForm.discount) || 0;
    const lateFee = parseFloat(addForm.late_fee) || 0;
    try {
      // Route through server action so RLS doesn't block non-owner staff
      // (manager/frontdesk with payments.create permission). Server action
      // uses admin client + verifies permission server-side.
      const res = await createPayment({
        member_id: addForm.member_id,
        plan_id: member?.plan_id ?? null,
        amount: totalAmount,
        discount,
        late_fee: lateFee,
        total_amount: Math.max(0, totalAmount - discount + lateFee),
        payment_method: addForm.method,
        payment_date: addForm.date || formatDateInput(new Date()),
        for_period: addForm.for_period || "",
        status: addForm.date ? "paid" : "pending",
        receipt_number: addForm.receipt_number || receipt,
        notes: addForm.notes || null,
      });
      if ("error" in res) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Payment recorded" });
        setAddDialog(false);
        if (res.payment) {
          setPayments((prev) => [res.payment as Payment, ...prev]);
          const m = members.find((x) => x.id === addForm.member_id);
          openInvoice(res.payment as Payment, m);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  const paidCount = useMemo(() =>
    members.filter((m) => currentMonthPayments.get(m.id)?.status === "paid").length,
    [members, currentMonthPayments]);

  // Per-trainer + gym-only collection stats
  const collectionStats = useMemo(() => {
    const groups = new Map<string, { label: string; total: number; paid: number; collected: number; remaining: number; due: number }>();

    for (const m of members) {
      const key = m.assigned_trainer_id ?? "none";
      const label = m.trainer?.full_name ?? "Gym Only";
      if (!groups.has(key)) groups.set(key, { label, total: 0, paid: 0, collected: 0, remaining: 0, due: 0 });
      const g = groups.get(key)!;
      g.total += 1;
      const p = currentMonthPayments.get(m.id);
      const fee = Number(m.monthly_fee);
      const paidAmt = p?.status === "paid" ? Number(p.total_amount) : 0;
      if (p?.status === "paid") {
        g.paid += 1;
        g.collected += paidAmt;
      } else {
        g.remaining += 1;
      }
      g.due += Math.max(0, fee - paidAmt);
    }

    const list = Array.from(groups.entries())
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => {
        if (a.id === "none") return 1;
        if (b.id === "none") return -1;
        return a.label.localeCompare(b.label);
      });

    const totalCollected = list.reduce((s, g) => s + g.collected, 0);
    const totalPaid = list.reduce((s, g) => s + g.paid, 0);
    const totalRemaining = list.reduce((s, g) => s + g.remaining, 0);
    const totalDue = list.reduce((s, g) => s + g.due, 0);

    return { groups: list, totalCollected, totalPaid, totalRemaining, totalDue };
  }, [members, currentMonthPayments]);

  const todayDayOfMonth = new Date().getDate();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight">Payments</h1>
          <p className="text-muted-foreground text-sm mt-1">Collect fees and review payment history</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={hardRefresh} disabled={refreshing} variant="outline" size="sm">
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button onClick={() => { setAddForm(emptyForm); setAddDialog(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Add Entry
          </Button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-sidebar-border w-fit">
        {(["members", "history"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
              view === v
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}>{v === "members" ? `Members` : "History"}</button>
        ))}
      </div>

      {/* ── Members view ─────────────────────────────────────────────────────── */}
      {view === "members" && (
        <div className="space-y-4">
          {/* Collection stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {/* Total card */}
            <button type="button" onClick={() => setMemberTrainerFilter("all")}
              className={`flex flex-col gap-1.5 p-4 rounded-2xl border text-left transition-all ${
                memberTrainerFilter === "all"
                  ? "border-primary/30 bg-primary/10"
                  : "border-sidebar-border bg-card hover:border-primary/20 hover:bg-primary/5"
              }`}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total</p>
              <p className={`text-xl font-bold ${collectionStats.totalDue > 0 ? "text-rose-400" : "text-foreground"}`}>
                {formatCurrency(collectionStats.totalDue)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                <span className="text-rose-400/80">due</span>
                {" · "}
                <span className="text-emerald-400/80">{formatCurrency(collectionStats.totalCollected)} collected</span>
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-emerald-400">{collectionStats.totalPaid} paid</span>
                {collectionStats.totalRemaining > 0 && <span className="text-rose-400">{collectionStats.totalRemaining} left</span>}
              </div>
              <div className="w-full bg-white/5 rounded-full h-1 mt-0.5">
                <div className="bg-emerald-500 h-1 rounded-full transition-all"
                  style={{ width: members.length ? `${(collectionStats.totalPaid / members.length) * 100}%` : "0%" }} />
              </div>
            </button>

            {/* Per-trainer + gym only cards */}
            {collectionStats.groups.map((g) => (
              <button key={g.id} type="button"
                onClick={() => setMemberTrainerFilter(memberTrainerFilter === g.id ? "all" : g.id)}
                className={`flex flex-col gap-1.5 p-4 rounded-2xl border text-left transition-all ${
                  memberTrainerFilter === g.id
                    ? "border-primary/30 bg-primary/10"
                    : "border-sidebar-border bg-card hover:border-primary/20 hover:bg-primary/5"
                }`}>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                  {g.id === "none" ? "Gym Only" : g.label}
                </p>
                <p className={`text-xl font-bold ${g.due > 0 ? "text-rose-400" : "text-foreground"}`}>
                  {formatCurrency(g.due)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  <span className="text-rose-400/80">due</span>
                  {" · "}
                  <span className="text-emerald-400/80">{formatCurrency(g.collected)}</span>
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-emerald-400">{g.paid}/{g.total} paid</span>
                  {g.remaining > 0 && <span className="text-rose-400">{g.remaining} left</span>}
                </div>
                <div className="w-full bg-white/5 rounded-full h-1 mt-0.5">
                  <div className="bg-emerald-500 h-1 rounded-full transition-all"
                    style={{ width: g.total ? `${(g.paid / g.total) * 100}%` : "0%" }} />
                </div>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search members…" value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)} className="pl-9" />
          </div>

          {/* Members table */}
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            {memberRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <CreditCard className="w-10 h-10 opacity-20" />
                <p className="text-sm">No members found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sidebar-border">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Trainer</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Plan</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fee</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{MONTH_LABEL}</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sidebar-border/50">
                    {memberRows.map((m) => {
                      const payment = currentMonthPayments.get(m.id);
                      const paid = payment?.status === "paid";
                      return (
                        <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                {m.full_name[0]?.toUpperCase() ?? "?"}
                              </div>
                              <p className="font-medium text-foreground">{m.full_name}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {m.trainer?.full_name ?? <span className="text-muted-foreground/40">—</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-sm text-muted-foreground">{memberPlanLabel(m)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-medium text-foreground">{formatCurrency(Number(m.monthly_fee))}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {payment ? (
                              <StatusBadge status={payment.status} />
                            ) : (() => {
                              const overdue = todayDayOfMonth >= 3;
                              return (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                  overdue
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                    : "bg-white/5 text-muted-foreground border-white/10"
                                }`}>
                                  {overdue ? `${todayDayOfMonth}d overdue` : "Not paid"}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {paid ? (
                              payment && (
                                <button type="button" onClick={() => openInvoice(payment, m)}
                                  title="View Receipt"
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10 hover:text-foreground transition-colors">
                                  <FileText className="w-3 h-3" /> Receipt
                                </button>
                              )
                            ) : (
                              <div className="inline-flex items-center gap-1.5">
                                {m.phone && (
                                  <button type="button" onClick={() => sendReminder(m)}
                                    title="Send WhatsApp reminder"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
                                    <MessageCircle className="w-3 h-3" /> Remind
                                  </button>
                                )}
                                <button type="button" onClick={() => recordPayment(m)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors">
                                  Record
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── History view ─────────────────────────────────────────────────────── */}
      {view === "history" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name or receipt…" value={histSearch}
                onChange={(e) => setHistSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {([["all", "All"], ["paid", "Paid"], ["pending", "Pending"], ["overdue", "Overdue"], ["refunded", "Refunded"], ["waived", "Waived"]] as const).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setHistStatus(val as PaymentStatus | "all")}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    histStatus === val
                      ? val === "paid"     ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : val === "overdue"  ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                      : val === "pending"  ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-primary/15 border-primary/40 text-primary"
                      : "bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                  }`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            {historyRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <CreditCard className="w-10 h-10 opacity-20" />
                <p className="text-sm">No transactions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sidebar-border">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Period</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Method</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Receipt</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sidebar-border/50">
                    {historyRows.map((p) => {
                      const name = p.member?.full_name ?? "—";
                      return (
                        <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                {name[0]?.toUpperCase() ?? "?"}
                              </div>
                              <p className="font-medium text-foreground">{name}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">{p.for_period ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {p.payment_method ? methodLabels[p.payment_method] : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {p.payment_date ? formatDate(p.payment_date) : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <span className="text-xs text-muted-foreground font-mono">{p.receipt_number ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-semibold text-foreground">{formatCurrency(Number(p.total_amount))}</p>
                            {Number(p.discount) > 0 && <p className="text-xs text-emerald-400">-{formatCurrency(p.discount)} disc</p>}
                            {Number(p.late_fee) > 0 && <p className="text-xs text-rose-400">+{formatCurrency(p.late_fee)} late</p>}
                          </td>
                          <td className="px-4 py-3 text-center"><StatusBadge status={p.status} /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button title="View Receipt" onClick={() => openInvoice(p, members.find(m => m.id === p.member_id))}
                                className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                              {p.status !== "paid" && p.status !== "waived" && p.status !== "refunded" && (
                                <>
                                  {p.status !== "overdue" && (
                                    <button title="Mark Overdue" onClick={() => updateStatus(p, "overdue")}
                                      className="p-1.5 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button title="Waive" onClick={() => updateStatus(p, "waived")}
                                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              {p.status === "paid" && (
                                <button title="Mark Refunded" onClick={() => updateStatus(p, "refunded")}
                                  className="p-1.5 rounded text-muted-foreground hover:text-sky-400 hover:bg-sky-500/10 transition-colors">
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Entry Dialog */}
      <Dialog open={addDialog} onOpenChange={(o) => !o && setAddDialog(false)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <div className="space-y-1.5">
              <Label>Member *</Label>
              <MemberPicker members={members} value={addForm.member_id}
                onChange={(id, m) => setAddForm({ ...addForm, member_id: id, total_amount: m ? String(Number(m.monthly_fee)) : "" })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount (PKR) *</Label>
                <Input type="number" placeholder="0" value={addForm.total_amount} onChange={(e) => setAddForm({ ...addForm, total_amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>For Period</Label>
                <Input type="month" value={addForm.for_period} onChange={(e) => setAddForm({ ...addForm, for_period: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Discount (PKR)</Label>
                <Input type="number" placeholder="0" value={addForm.discount} onChange={(e) => setAddForm({ ...addForm, discount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Late Fee (PKR)</Label>
                <Input type="number" placeholder="0" value={addForm.late_fee} onChange={(e) => setAddForm({ ...addForm, late_fee: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={addForm.method} onValueChange={(v) => setAddForm({ ...addForm, method: v as PaymentMethod })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(methodLabels) as [PaymentMethod, string][]).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payment Date</Label>
                <Input type="date" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Receipt No.</Label>
                <Input placeholder="Auto-generate" value={addForm.receipt_number} onChange={(e) => setAddForm({ ...addForm, receipt_number: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional" value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddPayment} disabled={saving}>
              {saving ? "Saving…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InvoiceDialog
        data={invoiceData}
        gym={gym}
        onClose={() => setInvoiceData(null)}
      />
    </div>
  );
}
