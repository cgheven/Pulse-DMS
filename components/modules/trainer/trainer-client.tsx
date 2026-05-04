"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, Clock, Wallet, Users,
  ChevronLeft, ChevronRight, Search, TrendingUp, UserPlus, Pencil, LogIn, Target,
  MessageCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createMemberAsTrainer, updateMemberAsTrainer, checkInMemberAsTrainer, checkMemberByPhone } from "@/app/actions/trainer";
import { MemberDetailDialog } from "./member-detail-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, formatDateInput } from "@/lib/utils";
import { buildReminderMessage, whatsappUrl } from "@/lib/whatsapp-reminder";
import type { Payment, PaymentMethod, PaymentStatus, Member, MembershipPlan, Staff, MemberGoal, BodyMetric, MetricSkip, TrainerShift, PaymentMethodAccount } from "@/types";

type MemberRow = Pick<Member,
  "id" | "full_name" | "member_number" | "phone" | "email" | "cnic" |
  "gender" | "date_of_birth" | "emergency_contact" | "address" |
  "monthly_fee" | "admission_fee" | "plan_id" | "assigned_trainer_id" | "assigned_shift_id" |
  "status" | "plan_expiry_date" | "outstanding_balance" | "join_date" | "notes"
> & { plan?: { name: string } | null };

type TrainerOption = Pick<Staff, "id" | "full_name">;

type PlanRow = Pick<MembershipPlan, "id" | "name" | "price" | "duration_type"> & {
  admission_fee?: number;
};

const DURATION_MONTHS: Record<string, number> = {
  daily: 0, monthly: 1, quarterly: 3, biannual: 6, annual: 12, dropin: 0,
};

function computeExpiry(joinDate: string, durationType: string | undefined): string | null {
  const months = DURATION_MONTHS[durationType ?? ""] ?? 1;
  if (months === 0) return joinDate;
  const d = new Date(joinDate);
  d.setMonth(d.getMonth() + months);
  return formatDateInput(d);
}

interface Props {
  staff: Staff & { gym?: { name: string } | null };
  gymId: string;
  gymName: string;
  reminderTemplate: string | null;
  paymentMethods: PaymentMethodAccount[];
  members: MemberRow[];
  selfMembers: MemberRow[];
  payments: Payment[];
  plans: PlanRow[];
  trainers: TrainerOption[];
  checkedInToday: string[];
  goals: MemberGoal[];
  bodyMetrics: BodyMetric[];
  metricSkips: MetricSkip[];
}

const methodLabels: Record<PaymentMethod, string> = {
  cash: "Cash", bank_transfer: "Bank Transfer",
  jazzcash: "JazzCash", easypaisa: "Easypaisa",
  card: "Card", other: "Other",
};

const NOW = new Date();
const CURRENT_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, "0")}`;

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function offsetMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function paymentBadge(payment: Payment | null, selectedMonth: string) {
  if (payment?.status === "paid")    return { label: "Paid",    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  if (payment?.status === "overdue" || selectedMonth < CURRENT_MONTH)
                                     return { label: "Overdue", cls: "bg-rose-500/10 text-rose-400 border-rose-500/20" };
  if (payment?.status === "pending") return { label: "Pending", cls: "bg-primary/10 text-primary border-primary/20" };
  return { label: "Unpaid", cls: "bg-primary/10 text-primary border-primary/20" };
}

function genReceipt(name: string, period: string) {
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return `PLS-${period.replace("-", "")}-${initials}-${Math.floor(Math.random() * 900 + 100)}`;
}

export function TrainerClient({ staff, gymId, gymName, reminderTemplate, paymentMethods, members, selfMembers, payments: initialPayments, plans, trainers, checkedInToday: initialCheckedIn, goals, bodyMetrics, metricSkips }: Props) {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [shiftMap, setShiftMap] = useState<Record<string, TrainerShift>>({});

  useEffect(() => {
    createClient().from("pulse_trainer_shifts").select("*").eq("staff_id", staff.id)
      .then(({ data }) => {
        if (!data) return;
        setShiftMap(Object.fromEntries(data.map((s: TrainerShift) => [s.id, s])));
      });
  }, [staff.id]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"my" | "self">("my");
  const [checkedInToday, setCheckedInToday] = useState<Set<string>>(new Set(initialCheckedIn));
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  // Member detail (goals) dialog
  const [detailMember, setDetailMember] = useState<MemberRow | null>(null);
  const activeGoalsByMember = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of goals) {
      if (g.status === "active") map[g.member_id] = (map[g.member_id] ?? 0) + 1;
    }
    return map;
  }, [goals]);

  async function handleCheckIn(memberId: string) {
    setCheckingIn(memberId);
    setCheckedInToday((prev) => new Set(prev).add(memberId)); // optimistic
    const res = await checkInMemberAsTrainer(memberId);
    setCheckingIn(null);
    if (res.error) {
      setCheckedInToday((prev) => { const n = new Set(prev); n.delete(memberId); return n; });
      toast({ title: "Error", description: res.error, variant: "destructive" });
      return;
    }
    toast({ title: "Checked in" });
  }

  // Add/Edit Member (permission-gated)
  const NO_TRAINER = "__none__";
  const emptyMemberForm = {
    full_name: "", phone: "", email: "", cnic: "",
    plan_id: "", monthly_fee: "", admission_fee: "0", admission_fee_paid: true,
    join_date: formatDateInput(new Date()),
    notes: "",
    assigned_trainer_id: staff.id,
  };
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberForm, setMemberForm] = useState(emptyMemberForm);
  const [savingMember, setSavingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null);
  const [duplicateMember, setDuplicateMember] = useState<{ id: string; full_name: string; status: string; assigned_trainer_id: string | null } | null>(null);

  async function handlePhoneBlur() {
    if (editingMember || !memberForm.phone || memberForm.phone.length < 8) return;
    const { member } = await checkMemberByPhone(memberForm.phone);
    if (!member) { setDuplicateMember(null); return; }
    setDuplicateMember({ id: member.id, full_name: member.full_name, status: member.status, assigned_trainer_id: member.assigned_trainer_id });
    setMemberForm((f) => ({
      ...f,
      full_name: member.full_name,
      email: member.email ?? "",
      cnic: member.cnic ?? "",
      plan_id: member.plan_id ?? "",
      monthly_fee: String(member.monthly_fee ?? ""),
      admission_fee: String(member.admission_fee ?? "0"),
      join_date: member.join_date ?? f.join_date,
      notes: member.notes ?? "",
    }));
  }

  function openEditMember(m: MemberRow) {
    setEditingMember(m);
    setMemberForm({
      full_name: m.full_name,
      phone: m.phone ?? "",
      email: m.email ?? "",
      cnic: m.cnic ?? "",
      plan_id: m.plan_id ?? "",
      monthly_fee: String(m.monthly_fee ?? ""),
      admission_fee: String(m.admission_fee ?? "0"),
      admission_fee_paid: true,
      join_date: m.join_date ?? formatDateInput(new Date()),
      notes: m.notes ?? "",
      assigned_trainer_id: m.assigned_trainer_id ?? NO_TRAINER,
    });
    setAddMemberOpen(true);
  }

  function openAddMember() {
    setEditingMember(null);
    setMemberForm(emptyMemberForm);
    setAddMemberOpen(true);
  }

  function onPlanPick(planId: string) {
    const plan = plans.find((p) => p.id === planId);
    setMemberForm((f) => ({
      ...f,
      plan_id: planId,
      monthly_fee: plan ? String(plan.price) : f.monthly_fee,
      admission_fee: plan?.admission_fee && plan.admission_fee > 0 ? String(plan.admission_fee) : f.admission_fee,
    }));
  }

  async function handleAddMember() {
    if (!memberForm.full_name || !memberForm.phone || !memberForm.plan_id) {
      toast({ title: "Name, phone and plan are required", variant: "destructive" });
      return;
    }
    setSavingMember(true);
    const plan = plans.find((p) => p.id === memberForm.plan_id);
    const expiry = computeExpiry(memberForm.join_date, plan?.duration_type);
    const basePayload = {
      full_name: memberForm.full_name,
      phone: memberForm.phone,
      email: memberForm.email || null,
      cnic: memberForm.cnic || null,
      plan_id: memberForm.plan_id,
      monthly_fee: parseFloat(memberForm.monthly_fee) || 0,
      admission_fee: parseFloat(memberForm.admission_fee) || 0,
      join_date: memberForm.join_date,
      plan_expiry_date: expiry,
      notes: memberForm.notes || null,
      assigned_trainer_id: memberForm.assigned_trainer_id === NO_TRAINER ? null : memberForm.assigned_trainer_id,
    };
    const res = editingMember
      ? await updateMemberAsTrainer(editingMember.id, basePayload)
      : await createMemberAsTrainer({ ...basePayload, admission_fee_paid: memberForm.admission_fee_paid });
    setSavingMember(false);
    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
      return;
    }
    toast({ title: editingMember ? "Member updated" : "Member added" });
    setAddMemberOpen(false);
    setMemberForm(emptyMemberForm);
    setEditingMember(null);
    setDuplicateMember(null);
    router.refresh();
  }

  const [payDialog, setPayDialog] = useState<{ member: MemberRow; payment: Payment | null } | null>(null);
  const [payForm, setPayForm] = useState({
    amount: "",
    discount: "0",
    late_fee: "0",
    method: "cash" as PaymentMethod,
    date: formatDateInput(new Date()),
    receipt_number: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const monthPayments = useMemo(
    () => payments.filter((p) => p.for_period === selectedMonth),
    [payments, selectedMonth]
  );

  const paidMemberIds = useMemo(
    () => new Set(monthPayments.filter((p) => p.status === "paid").map((p) => p.member_id)),
    [monthPayments]
  );

  const stats = useMemo(() => {
    const paid = members.filter((m) => paidMemberIds.has(m.id)).length;
    const collected = monthPayments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
    return { total: members.length, paid, unpaid: members.length - paid, collected };
  }, [members, paidMemberIds, monthPayments]);

  // Commission = max(0, amount − floor) × %  (floor=0 ⇒ gross % of fee)
  // Snapshot rule: earnings come from payments locked to THIS trainer at insert
  // time (payment.trainer_id), not from the member's CURRENT assignment. So if
  // a member transferred away mid-month, the prior month's payment still pays
  // commission to the original trainer. Pending commission still uses currently
  // assigned members' monthly_fee, since that's the only forecast we have.
  const earnings = useMemo(() => {
    const floor = staff.commission_floor ?? 0;
    const defaultPct = staff.commission_percentage / 100;

    const cutForMember = (m: MemberRow) => {
      const fee = Number(m.monthly_fee);
      const netFee = Math.max(0, fee - floor);
      const shift = m.assigned_shift_id ? shiftMap[m.assigned_shift_id] : null;
      if (shift) return shift.commission_type === "flat" ? shift.commission_value : netFee * (shift.commission_value / 100);
      return netFee * defaultPct;
    };

    const earnedCommission = monthPayments
      .filter((p) => p.status === "paid" && p.trainer_id === staff.id)
      .reduce((s, p) => {
        const m = members.find((mb) => mb.id === p.member_id);
        return s + (m ? cutForMember(m) : Math.max(0, Number(p.total_amount) - floor) * defaultPct);
      }, 0);
    const pendingCommission = members
      .filter((m) => !paidMemberIds.has(m.id))
      .reduce((s, m) => s + cutForMember(m), 0);
    const totalPotential = earnedCommission + pendingCommission;
    const totalEarned = staff.monthly_salary + earnedCommission;
    return { earnedCommission, pendingCommission, totalPotential, totalEarned, pct: staff.commission_percentage, floor, cutForMember };
  }, [members, paidMemberIds, monthPayments, staff, shiftMap]);

  const memberRows = useMemo(() => {
    const q = search.toLowerCase();
    return members
      .filter((m) => !q || m.full_name.toLowerCase().includes(q))
      .map((m) => ({ member: m, payment: monthPayments.find((p) => p.member_id === m.id) ?? null }))
      .sort((a, b) => {
        const rank = (r: typeof a) => (r.payment?.status === "paid" ? 2 : r.payment?.status === "overdue" ? 0 : 1);
        return rank(a) - rank(b);
      });
  }, [members, monthPayments, search]);

  const selfRows = useMemo(() => {
    const q = search.toLowerCase();
    return selfMembers
      .filter((m) => !q || m.full_name.toLowerCase().includes(q))
      .map((m) => ({ member: m, payment: monthPayments.find((p) => p.member_id === m.id) ?? null }))
      .sort((a, b) => {
        const rank = (r: typeof a) => (r.payment?.status === "paid" ? 2 : r.payment?.status === "overdue" ? 0 : 1);
        return rank(a) - rank(b);
      });
  }, [selfMembers, monthPayments, search]);

  function sendReminder(member: MemberRow) {
    const msg = buildReminderMessage({
      template: reminderTemplate,
      memberName: member.full_name,
      amount: member.monthly_fee,
      month: monthLabel(selectedMonth),
      gymName,
      accounts: paymentMethods,
    });
    const url = whatsappUrl(member.phone, msg);
    if (url) window.open(url, "_blank");
  }

  function openPay(member: MemberRow, payment: Payment | null) {
    setPayDialog({ member, payment });
    setPayForm({
      amount: String(payment ? Number(payment.total_amount) : member.monthly_fee),
      discount: payment ? String(payment.discount ?? 0) : "0",
      late_fee: payment ? String(payment.late_fee ?? 0) : "0",
      method: payment?.payment_method ?? "cash",
      date: formatDateInput(new Date()),
      receipt_number: payment?.receipt_number || genReceipt(member.full_name, selectedMonth),
      notes: payment?.notes ?? "",
    });
  }

  async function handlePay() {
    if (!payDialog) return;
    setSaving(true);
    const { member, payment } = payDialog;
    const amount = parseFloat(payForm.amount) || member.monthly_fee;
    const discount = parseFloat(payForm.discount) || 0;
    const lateFee = parseFloat(payForm.late_fee) || 0;
    const total = Math.max(0, amount - discount + lateFee);
    const supabase = createClient();

    if (payment) {
      const update = {
        status: "paid" as PaymentStatus,
        payment_method: payForm.method,
        payment_date: payForm.date,
        late_fee: lateFee,
        discount,
        total_amount: total,
        receipt_number: payForm.receipt_number,
        notes: payForm.notes || null,
      };
      setPayDialog(null);
      setPayments((prev) => prev.map((p) => p.id === payment.id ? { ...p, ...update } : p));
      const { error } = await supabase.from("pulse_payments").update(update).eq("id", payment.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setPayments((prev) => prev.map((p) => p.id === payment.id ? payment : p));
      } else {
        toast({ title: "Payment recorded" });
      }
    } else {
      setPayDialog(null);
      const { data: newRow, error } = await supabase
        .from("pulse_payments")
        .insert({
          gym_id: gymId,
          member_id: member.id,
          plan_id: member.plan_id ?? null,
          amount,
          discount,
          late_fee: lateFee,
          total_amount: total,
          payment_method: payForm.method,
          payment_date: payForm.date,
          for_period: selectedMonth,
          status: "paid",
          receipt_number: payForm.receipt_number,
          notes: payForm.notes || null,
        })
        .select("*, member:pulse_members(full_name,plan_id)")
        .single();
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Payment recorded" });
        setPayments((prev) => [newRow as Payment, ...prev]);
      }
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {members.length} member{members.length !== 1 ? "s" : ""} assigned to you
          </p>
        </div>
        {staff.can_add_members && (
          <Button onClick={openAddMember} className="gap-2 self-start sm:self-auto">
            <UserPlus className="w-4 h-4" /> Add Member
          </Button>
        )}
      </div>

      {/* Month navigator */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSelectedMonth((m) => offsetMonth(m, -1))}
          className="p-1.5 rounded-lg border border-sidebar-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground min-w-[140px] text-center">
          {monthLabel(selectedMonth)}
        </span>
        <button
          onClick={() => setSelectedMonth((m) => offsetMonth(m, 1))}
          disabled={selectedMonth >= CURRENT_MONTH}
          className="p-1.5 rounded-lg border border-sidebar-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: "My Members",  value: stats.total,                    icon: Users,        color: "text-foreground",  bg: "bg-white/5 border border-white/10" },
          { label: "In Today",    value: checkedInToday.size,            icon: LogIn,        color: "text-sky-400",     bg: "bg-sky-500/10 border border-sky-500/20" },
          { label: "Paid",        value: stats.paid,                     icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20" },
          { label: "Unpaid",      value: stats.unpaid,                   icon: Clock,        color: "text-primary",     bg: "bg-primary/10 border border-primary/20" },
          { label: "Gym Collected", value: formatCurrency(stats.collected), icon: Wallet,     color: "text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-2xl border border-sidebar-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-8 h-8 rounded-xl ${bg} shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold text-foreground leading-none mt-0.5">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* My Earnings */}
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/10">
          <TrendingUp className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-primary">My Earnings — {monthLabel(selectedMonth)}</p>
          <span className="ml-auto text-xs text-muted-foreground">
            {earnings.pct}% commission{earnings.floor > 0 ? ` after ${formatCurrency(earnings.floor)} gym cost` : ""}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-primary/10">
          {[
            { label: "Base Salary",      value: formatCurrency(staff.monthly_salary),    sub: "fixed",                    dim: false },
            { label: "Earned Commission", value: formatCurrency(earnings.earnedCommission), sub: `${stats.paid} paid members`, dim: false },
            { label: "Still Pending",    value: formatCurrency(earnings.pendingCommission), sub: `${stats.unpaid} unpaid`,  dim: true  },
            { label: "Total This Month", value: formatCurrency(earnings.totalEarned),    sub: `of ${formatCurrency(staff.monthly_salary + earnings.totalPotential)} potential`, dim: false },
          ].map(({ label, value, sub, dim }) => (
            <div key={label} className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className={`text-xl font-bold mt-0.5 ${dim ? "text-muted-foreground" : "text-foreground"}`}>{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
        {earnings.totalPotential > 0 && (
          <div className="px-4 pb-3">
            <div className="w-full bg-white/5 rounded-full h-1.5">
              <div className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${(earnings.earnedCommission / earnings.totalPotential) * 100}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {Math.round((earnings.earnedCommission / earnings.totalPotential) * 100)}% of commission collected
            </p>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search member..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs (only when SELF section available) */}
      {staff.can_add_members && (
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-sidebar-border w-fit">
          <button type="button" onClick={() => setActiveTab("my")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "my"
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            My Members <span className="ml-1 text-xs opacity-70">{members.length}</span>
          </button>
          <button type="button" onClick={() => setActiveTab("self")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "self"
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            Self-Service <span className="ml-1 text-xs opacity-70">{selfMembers.length}</span>
          </button>
        </div>
      )}

      {/* My Members table */}
      {(!staff.can_add_members || activeTab === "my") && (
      <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
            <Users className="w-10 h-10 opacity-20" />
            <p className="text-sm font-medium">No members assigned to you yet</p>
            <p className="text-xs">Ask the owner to assign members to your name</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Plan</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fee</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-primary/70 uppercase tracking-wider">My Cut</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Paid On</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Check In</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border/50">
                {memberRows.map(({ member, payment }) => {
                  const isPaid = payment?.status === "paid";
                  return (
                    <tr key={member.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setDetailMember(member)}
                          className="flex items-center gap-3 text-left hover:text-primary transition-colors group">
                          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {member.full_name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-foreground group-hover:text-primary transition-colors">{member.full_name}</p>
                              {(activeGoalsByMember[member.id] ?? 0) > 0 && (
                                <span title="Active goals" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                                  <Target className="w-2.5 h-2.5" /> {activeGoalsByMember[member.id]}
                                </span>
                              )}
                            </div>
                            {member.member_number && (
                              <p className="text-xs text-muted-foreground">#{member.member_number}</p>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">{member.plan?.name ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium text-foreground">{formatCurrency(member.monthly_fee)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`text-sm font-semibold ${isPaid ? "text-primary" : "text-muted-foreground"}`}>
                            {formatCurrency(earnings.cutForMember(member))}
                          </span>
                          {(() => {
                            const shift = member.assigned_shift_id ? shiftMap[member.assigned_shift_id] : null;
                            const label = shift
                              ? `${shift.name} · ${shift.commission_type === "flat" ? `PKR ${shift.commission_value}` : `${shift.commission_value}%`}`
                              : earnings.pct > 0 ? `${earnings.pct}%` : null;
                            return label ? <span className="text-[10px] text-muted-foreground">{label}</span> : null;
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(() => { const { label, cls } = paymentBadge(payment, selectedMonth); return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>{label}</span>
                        ); })()}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {payment?.payment_date ? formatDate(payment.payment_date) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {checkedInToday.has(member.id) ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3" /> In
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={checkingIn === member.id}
                            onClick={() => handleCheckIn(member.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground bg-white/[0.03] border border-white/10 hover:border-white/20 hover:bg-white/5 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            <LogIn className="w-3 h-3" /> Check In
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {staff.can_add_members && (
                            <button
                              type="button"
                              title="Edit member"
                              onClick={() => openEditMember(member)}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Paid
                            </span>
                          ) : (
                            <>
                              {member.phone && (
                                <button
                                  type="button"
                                  title="Send WhatsApp reminder"
                                  onClick={() => sendReminder(member)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
                                >
                                  <MessageCircle className="w-3 h-3" /> Remind
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openPay(member, payment)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors whitespace-nowrap"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Pay
                              </button>
                            </>
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
      )}

      {/* SELF clients tab content */}
      {staff.can_add_members && activeTab === "self" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Gym-only members (no PT). No commission earned — payments only.</p>
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            {selfMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Users className="w-8 h-8 opacity-20" />
                <p className="text-sm">No self-service clients yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sidebar-border">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Plan</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fee</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Paid On</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sidebar-border/50">
                    {selfRows.map(({ member, payment }) => {
                      const isPaid = payment?.status === "paid";
                      return (
                        <tr key={member.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                                {member.full_name[0]?.toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{member.full_name}</p>
                                {member.member_number && <p className="text-xs text-muted-foreground">#{member.member_number}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">{member.plan?.name ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-medium text-foreground">{formatCurrency(member.monthly_fee)}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {(() => { const { label, cls } = paymentBadge(payment, selectedMonth); return (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>{label}</span>
                            ); })()}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {payment?.payment_date ? formatDate(payment.payment_date) : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                title="Edit member"
                                onClick={() => openEditMember(member)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {isPaid ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                                  <CheckCircle2 className="w-3 h-3" /> Paid
                                </span>
                              ) : (
                                <>
                                  {member.phone && (
                                    <button
                                      type="button"
                                      title="Send WhatsApp reminder"
                                      onClick={() => sendReminder(member)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
                                    >
                                      <MessageCircle className="w-3 h-3" /> Remind
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openPay(member, payment)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors whitespace-nowrap"
                                  >
                                    <CheckCircle2 className="w-3 h-3" /> Pay
                                  </button>
                                </>
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

      {/* Member detail (goals + metrics) dialog */}
      <MemberDetailDialog
        open={!!detailMember}
        onClose={() => setDetailMember(null)}
        member={detailMember}
        goals={goals}
        bodyMetrics={bodyMetrics}
        metricSkips={metricSkips}
      />

      {/* Pay dialog */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {payDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-white/5 px-3 py-2.5 space-y-0.5">
                <p className="text-sm font-semibold text-foreground">{payDialog.member.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {payDialog.member.plan?.name ?? "No plan"} · {monthLabel(selectedMonth)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount (PKR)</Label>
                  <Input type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Discount (PKR)</Label>
                  <Input type="number" placeholder="0" value={payForm.discount} onChange={(e) => setPayForm({ ...payForm, discount: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Late Fee (PKR)</Label>
                  <Input type="number" placeholder="0" value={payForm.late_fee} onChange={(e) => setPayForm({ ...payForm, late_fee: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v as PaymentMethod })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(methodLabels) as [PaymentMethod, string][]).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Receipt No.</Label>
                <Input value={payForm.receipt_number} onChange={(e) => setPayForm({ ...payForm, receipt_number: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancel</Button>
            <Button onClick={handlePay} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? "Saving…" : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Member dialog (permission-gated) */}
      <Dialog open={addMemberOpen} onOpenChange={(o) => { if (!o) { setAddMemberOpen(false); setEditingMember(null); setDuplicateMember(null); } }}>
        <DialogContent className="sm:max-w-xl p-7">
          <DialogHeader className="pb-1">
            <DialogTitle>{editingMember ? "Edit Member" : "Onboard New Member"}</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {editingMember ? "Update details for your assigned member." : "Member auto-assigned to you."}
            </p>
          </DialogHeader>
          <div className="space-y-4 py-1 max-h-[65vh] overflow-y-auto px-1">
            {duplicateMember && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-xs text-yellow-400 space-y-0.5">
                <p className="font-semibold">Member already exists with this number</p>
                <p className="text-yellow-400/80">
                  <span className="font-medium text-yellow-300">{duplicateMember.full_name}</span>
                  {" · "}
                  {duplicateMember.assigned_trainer_id ? "Assigned to another trainer" : "No trainer assigned"}
                  {" · "}
                  <span className="capitalize">{duplicateMember.status}</span>
                </p>
                <p className="text-yellow-400/60">Form pre-filled with their existing data.</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input value={memberForm.full_name} onChange={(e) => setMemberForm({ ...memberForm, full_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone *</Label>
                <Input
                  placeholder="+92 300 0000000"
                  value={memberForm.phone}
                  onChange={(e) => { setDuplicateMember(null); setMemberForm({ ...memberForm, phone: e.target.value }); }}
                  onBlur={handlePhoneBlur}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>CNIC</Label>
                <Input placeholder="00000-0000000-0" value={memberForm.cnic} onChange={(e) => setMemberForm({ ...memberForm, cnic: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Plan *</Label>
                <Select value={memberForm.plan_id} onValueChange={onPlanPick}>
                  <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {formatCurrency(p.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Assign Trainer</Label>
                <Select value={memberForm.assigned_trainer_id}
                  onValueChange={(v) => setMemberForm({ ...memberForm, assigned_trainer_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={staff.id}>Me ({staff.full_name})</SelectItem>
                    {trainers.filter((t) => t.id !== staff.id).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                    ))}
                    <SelectItem value={NO_TRAINER}>SELF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Monthly Fee (PKR)</Label>
                <Input type="number" value={memberForm.monthly_fee} onChange={(e) => setMemberForm({ ...memberForm, monthly_fee: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Join Date</Label>
                <Input type="date" value={memberForm.join_date} onChange={(e) => setMemberForm({ ...memberForm, join_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Admission Fee (PKR)</Label>
              <Input type="number" value={memberForm.admission_fee} onChange={(e) => setMemberForm({ ...memberForm, admission_fee: e.target.value })} />
            </div>
            {!editingMember && parseFloat(memberForm.admission_fee) > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-white/[0.02] p-2.5">
                <button type="button"
                  onClick={() => setMemberForm({ ...memberForm, admission_fee_paid: true })}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    memberForm.admission_fee_paid
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-white/5 text-muted-foreground border border-transparent hover:text-foreground"
                  }`}>Paid Now</button>
                <button type="button"
                  onClick={() => setMemberForm({ ...memberForm, admission_fee_paid: false })}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    !memberForm.admission_fee_paid
                      ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                      : "bg-white/5 text-muted-foreground border border-transparent hover:text-foreground"
                  }`}>Pending</button>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional" value={memberForm.notes} onChange={(e) => setMemberForm({ ...memberForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddMemberOpen(false); setEditingMember(null); setDuplicateMember(null); }}>Cancel</Button>
            <Button onClick={handleAddMember} disabled={savingMember || !memberForm.full_name || !memberForm.phone || !memberForm.plan_id}>
              {savingMember ? "Saving…" : editingMember ? "Update" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
