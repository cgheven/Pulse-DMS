"use client";
import { useState, useMemo, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import {
  Plus, Users, Search, Edit2, Trash2,
  UserCheck, Clock, CalendarX,
  Snowflake, AlertCircle, CheckCircle,
  ChevronLeft, ChevronRight, CheckCircle2, Wallet, CreditCard,
  PauseCircle, PlayCircle, Ban,
  Target, Phone, X, Activity, ChevronDown, Check, MessageCircle, Download,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { revalidateMembers, revalidateDashboard } from "@/app/actions/revalidate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useGymContext } from "@/contexts/gym-context";
import { formatCurrency, formatDate, formatDateInput, cn, memberPlanLabel } from "@/lib/utils";
import { buildReminderMessage, whatsappUrl } from "@/lib/whatsapp-reminder";
import { validateFullName, validateCNIC, validatePakPhone, validateDOB, validateMoney, runValidators, type ValidationResult } from "@/lib/validation";
import type { Member, MembershipPlan, MemberStatus, MemberGender, MemberShift, Staff, Payment, PaymentMethod, PaymentStatus, Referrer, SocialManager, SocialLead, TrainerShift } from "@/types";
import { matchSocialLead } from "@/app/actions/social";
import { freezeMember, unfreezeMember, putMemberOnHold, resumeMember, markAsDefaulter, clearDefaulter, checkAndClearDefaulter, updateMember, deleteMember as deleteMemberAction, createMember, bulkUpdateMembers, createReferralForMember, consumeUnlinkedPunch, reloadMembersData } from "@/app/actions/members";
import { createPayment, updatePayment, listPaymentsForGym, listMemberTimeline } from "@/app/actions/payments";
import { SmartAssignPanel } from "@/components/modules/profit-insights/smart-assign-panel";
import { PhotoPicker } from "@/components/modules/members/photo-picker";
import { ExportMembersDialog } from "@/components/modules/members/export-members-dialog";
import type { ListKey } from "@/lib/members-export";
import { InvoiceDialog, type InvoiceData } from "@/components/modules/payments/invoice-dialog";

// ── Payment helpers ────────────────────────────────────────────────────────────
const methodLabels: Record<PaymentMethod, string> = {
  cash: "Cash", bank_transfer: "Bank Transfer", jazzcash: "JazzCash",
  easypaisa: "Easypaisa", card: "Card", other: "Other",
};

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function offsetMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function genReceipt(memberName: string, period: string) {
  const initials = memberName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return `PLS-${(period ?? "").replace("-", "")}-${initials}-${Math.floor(Math.random() * 900 + 100)}`;
}

const CURRENT_MONTH = (() => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
})();

type UnmatchedLead = Pick<SocialLead, "id" | "lead_name" | "lead_phone" | "lead_social_handle" | "platform" | "evidence_url" | "notes" | "expires_at" | "created_at"> & { manager: Pick<SocialManager, "full_name" | "commission_type" | "commission_value"> | null };

interface Props {
  gymId: string | null;
  active: Member[];
  frozen: Member[];
  on_hold: Member[];
  defaulters: Member[];
  expired: Member[];
  defaulterThreshold: number;
  plans: MembershipPlan[];
  staff: Pick<Staff, "id" | "full_name" | "role" | "commission_percentage" | "commission_floor" | "default_shift_name">[];
  referrers: Pick<Referrer, "id" | "full_name" | "commission_type" | "commission_value">[];
}

function makeEmptyForm(deviceUserId = "") {
  const today = formatDateInput(new Date());
  return {
    full_name: "",
    phone: "",
    email: "",
    cnic: "",
    gender: "male" as MemberGender,
    date_of_birth: "",
    address: "",
    shift: "" as "" | MemberShift,
    member_number: "",
    photo_url: "" as string,
    plan_id: "",
    plan_ids: [] as string[],
    assigned_trainer_id: "",
    assigned_shift_id: "",
    referrer_id: "",
    social_lead_id: "",
    join_date: today,
    plan_start_date: today,
    plan_expiry_date: "",
    admission_fee: "",
    admission_fee_paid: false,
    discount: "0",
    monthly_fee: "",
    outstanding_balance: "0",
    emergency_contact: "",
    emergency_phone: "",
    medical_notes: "",
    notes: "",
    device_user_id: deviceUserId,
    status: "active" as MemberStatus,
  };
}

const STATUS_CONFIG: Record<MemberStatus, { label: string; className: string; icon: React.ElementType }> = {
  active:    { label: "Active",     className: "status-active",    icon: UserCheck },
  frozen:    { label: "Frozen",     className: "status-frozen",    icon: Snowflake },
  on_hold:   { label: "On Hold",    className: "status-on-hold",   icon: PauseCircle },
  defaulter: { label: "Defaulter",  className: "status-defaulter", icon: Ban },
  expired:   { label: "Expired",    className: "status-expired",   icon: CalendarX },
  cancelled: { label: "Cancelled",  className: "status-expired",   icon: AlertCircle },
};

const SHIFT_LABELS: Record<MemberShift, string> = {
  morning: "Morning",
  evening: "Evening",
  night:   "Night",
};

const DURATION_LABELS: Record<string, string> = {
  daily:     "Daily",
  monthly:   "Monthly",
  quarterly: "Quarterly (3 mo)",
  biannual:  "Bi-annual (6 mo)",
  annual:    "Annual",
  dropin:    "Drop-in",
};

// ── Module-level components (stable identity — never re-mounted on parent re-render) ──

function StatusBadge({ status }: { status: MemberStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      <cfg.icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

interface MemberTableProps {
  list: Member[];
  showExpired: boolean;
  planMap: Record<string, MembershipPlan>;
  onEdit?: (m: Member) => void;
  onDelete: (m: Member) => void;
  onView?: (m: Member) => void;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  extraActions?: (m: Member) => React.ReactNode;
}

const MemberTable = memo(function MemberTable({ list, showExpired, planMap, onEdit, onDelete, onView, selectedIds, onToggle, onSelectAll, extraActions }: MemberTableProps) {
  if (list.length === 0) return null;
  const allSelected = list.length > 0 && list.every((m) => selectedIds.has(m.id));
  const someSelected = !allSelected && list.some((m) => selectedIds.has(m.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-sidebar-border">
            <th className="px-3 sm:px-4 py-3 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={onSelectAll}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
            </th>
            <th className="text-left px-3 sm:px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
            <th className="text-left px-3 sm:px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Plan</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Trainer</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Phone</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">{showExpired ? "Expired" : "Joined"}</th>
            <th className="text-right px-3 sm:px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fee</th>
            <th className="text-center px-3 sm:px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Status</th>
            <th className="text-right px-3 sm:px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sidebar-border/50">
          {list.map((m) => {
            const plan = m.plan_id ? planMap[m.plan_id] : null;
            const planData = (m as Member & { plan?: { name: string; color: string } | null }).plan;
            const planName = planData?.name ?? plan?.name;
            const planColor = planData?.color ?? plan?.color ?? "#6B7A99";
            const allPlans = ((m as Member & { plans?: { plan?: { id: string; name: string; color: string } | null }[] }).plans ?? [])
              .map((pp) => pp.plan)
              .filter((p): p is { id: string; name: string; color: string } => !!p)
              .sort((a, b) => (a.id === m.plan_id ? -1 : b.id === m.plan_id ? 1 : 0));
            const trainerData = (m as Member & { trainer?: { full_name: string } | null }).trainer;
            const isSelected = selectedIds.has(m.id);
            return (
              <tr
                key={m.id}
                onClick={() => onView?.(m)}
                className={`hover:bg-white/[0.02] transition-colors group ${onView ? "cursor-pointer" : ""} ${isSelected ? "bg-primary/[0.04]" : ""}`}
              >
                <td className="px-3 sm:px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(m.id)}
                    className="w-4 h-4 rounded accent-primary cursor-pointer"
                  />
                </td>
                <td className="px-3 sm:px-4 py-3">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden"
                      style={{ backgroundColor: `${planColor}22`, color: planColor }}
                    >
                      {m.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.photo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        m.full_name[0]?.toUpperCase() ?? "?"
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{m.full_name}</p>
                      {m.member_number && <p className="text-xs text-muted-foreground font-mono">{m.member_number}</p>}
                      {allPlans.length > 0 ? (
                        <p className="sm:hidden text-[11px] mt-0.5" style={{ color: allPlans[0].color }}>
                          ● {allPlans[0].name}{allPlans.length > 1 ? ` +${allPlans.length - 1}` : ""}
                        </p>
                      ) : planName && <p className="sm:hidden text-[11px] mt-0.5" style={{ color: planColor }}>● {planName}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {allPlans.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {allPlans.map((p) => (
                        <span key={p.id} className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md"
                          style={{ backgroundColor: `${p.color}20`, color: p.color }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                          {p.name}
                        </span>
                      ))}
                    </div>
                  ) : planName ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md"
                      style={{ backgroundColor: `${planColor}20`, color: planColor }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: planColor }} />
                      {planName}
                    </span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-sm text-muted-foreground">{trainerData?.full_name ?? "—"}</span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-sm text-muted-foreground">{m.phone ?? "—"}</span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-sm text-muted-foreground">
                    {showExpired ? (m.plan_expiry_date ? formatDate(m.plan_expiry_date) : "—") : (m.join_date ? formatDate(m.join_date) : "—")}
                  </span>
                </td>
                <td className="px-3 sm:px-4 py-3 text-right">
                  <p className="font-semibold text-foreground whitespace-nowrap">{formatCurrency(Number(m.monthly_fee))}<span className="text-muted-foreground">/mo</span></p>
                  {m.admission_fee > 0 && <p className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">+{formatCurrency(m.admission_fee)} <span className="hidden sm:inline">admission</span><span className="sm:hidden">adm</span></p>}
                  {m.outstanding_balance > 0 && <p className="text-[10px] sm:text-xs text-rose-400 whitespace-nowrap">Due: {formatCurrency(m.outstanding_balance)}</p>}
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <StatusBadge status={m.status} />
                </td>
                <td className="px-3 sm:px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                    {extraActions?.(m)}
                    {onEdit && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(m)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(m)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export function MembersClient({
  gymId,
  active: initialActive,
  frozen: initialFrozen,
  on_hold: initialOnHold,
  defaulters: initialDefaulters,
  expired: initialExpired,
  defaulterThreshold: initialThreshold,
  plans: initialPlans,
  staff: initialStaff,
  referrers: initialReferrers,
}: Props) {
  const { isDemo, gym } = useGymContext();
  const [active, setActive] = useState(initialActive);
  const [frozen, setFrozen] = useState(initialFrozen);
  const [onHold, setOnHold] = useState(initialOnHold);
  const [defaulters, setDefaulters] = useState(initialDefaulters);
  const [expired, setExpired] = useState(initialExpired);
  const [defaulterThreshold] = useState(initialThreshold);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [timelineMember, setTimelineMember] = useState<Member | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [plans] = useState(initialPlans);
  const [staff] = useState(initialStaff);
  const [referrers] = useState(initialReferrers);
  const [shifts, setShifts] = useState<Record<string, TrainerShift[]>>({});

  useEffect(() => {
    if (!gymId) return;
    createClient().from("pulse_trainer_shifts").select("*").eq("gym_id", gymId)
      .then(({ data }) => {
        if (!data) return;
        const grouped: Record<string, TrainerShift[]> = {};
        data.forEach((s: TrainerShift) => { (grouped[s.staff_id] ??= []).push(s); });
        setShifts(grouped);
      });
  }, [gymId]);
  const searchParams = useSearchParams();
  const [pendingDeviceUserId, setPendingDeviceUserId] = useState<string | null>(null);
  const [pendingUnlinkedId, setPendingUnlinkedId] = useState<string | null>(null);

  // Auto-open add dialog when navigated from unlinked punch banner
  useEffect(() => {
    const deviceUserId = searchParams.get("register_device_user");
    const unlinkedId = searchParams.get("unlinked_id");
    if (deviceUserId) {
      setPendingDeviceUserId(deviceUserId);
      setPendingUnlinkedId(unlinkedId);
      setEditing(null);
      setDialogOpen(true);
      // Clean up URL params without full navigation
      const url = new URL(window.location.href);
      url.searchParams.delete("register_device_user");
      url.searchParams.delete("unlinked_id");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active");
  const [trainerFilter, setTrainerFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<"all" | MemberShift>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [deleteMember, setDeleteMember] = useState<Member | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditDialog, setBulkEditDialog] = useState(false);
  const [bulkPlanId, setBulkPlanId] = useState("");
  const [bulkTrainerId, setBulkTrainerId] = useState("");
  const [bulkFee, setBulkFee] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  // ── Collect tab state (lazy-loaded) ─────────────────────────────────────────
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [collectSearch, setCollectSearch] = useState("");
  const [payDialog, setPayDialog] = useState<{ member: Member; payment: Payment | null } | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", discount: "0", late_fee: "0", method: "cash" as PaymentMethod, date: formatDateInput(new Date()), receipt_number: "", notes: "" });
  const [paySaving, setPaySaving] = useState(false);

  async function loadPayments() {
    if (paymentsLoaded || !gymId) return;
    // Use a server action — direct client queries to pulse_payments are
    // blocked by RLS for non-owner staff (managers/frontdesk).
    const result = await listPaymentsForGym();
    if ("error" in result) {
      setPayments([]);
      setPaymentsLoaded(true);
      return;
    }
    setPayments(result.payments);
    setPaymentsLoaded(true);
  }

  const monthPayments = useMemo(() => payments.filter((p) => p.for_period === selectedMonth), [payments, selectedMonth]);
  const paidMemberIds = useMemo(() => new Set(monthPayments.filter((p) => p.status === "paid").map((p) => p.member_id)), [monthPayments]);

  const collectStats = useMemo(() => {
    const billable = [...active, ...onHold, ...defaulters];
    const paid = billable.filter((m) => paidMemberIds.has(m.id)).length;
    const collected = monthPayments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
    return { paid, unpaid: billable.length - paid, collected, total: billable.length };
  }, [active, onHold, defaulters, paidMemberIds, monthPayments]);

  const memberRows = useMemo(() => {
    const paymentByMember = new Map(monthPayments.map((p) => [p.member_id, p]));
    const q = collectSearch.toLowerCase();
    return [...active, ...onHold, ...defaulters]
      .filter((m) => !q || m.full_name.toLowerCase().includes(q))
      .map((m) => ({ member: m, payment: paymentByMember.get(m.id) ?? null }))
      .sort((a, b) => {
        // defaulters always sort to top, then unpaid, then paid
        if (a.member.status === "defaulter" && b.member.status !== "defaulter") return -1;
        if (b.member.status === "defaulter" && a.member.status !== "defaulter") return 1;
        const rank = (r: typeof a) => (!r.payment || r.payment.status === "overdue" ? 0 : r.payment.status === "pending" ? 1 : 2);
        return rank(a) - rank(b);
      });
  }, [active, onHold, defaulters, monthPayments, collectSearch]);

  function openPay(member: Member, payment: Payment | null) {
    setPayDialog({ member, payment });
    // When opening a fresh payment for a member who has a promised signup
    // discount (admission unpaid + discount > 0 at create), pre-fill the
    // discount field. Skipped when editing an existing payment row — that
    // row already carries its own discount value.
    const promised = Number(member.pending_signup_discount ?? 0);
    const prefillDiscount = !payment && promised > 0 ? String(promised) : null;
    setPayForm({
      amount: String(payment ? Number(payment.total_amount) : Number(member.monthly_fee)),
      discount: payment ? String(payment.discount ?? 0) : (prefillDiscount ?? "0"),
      late_fee: payment ? String(payment.late_fee ?? 0) : "0",
      method: payment?.payment_method ?? "cash",
      date: formatDateInput(new Date()),
      receipt_number: payment?.receipt_number || genReceipt(member.full_name, selectedMonth),
      notes: payment?.notes ?? "",
    });
  }

  async function handlePay() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!payDialog || !gymId) return;
    setPaySaving(true);
    const { member, payment } = payDialog;
    const amount = parseFloat(payForm.amount) || Number(member.monthly_fee);
    const discount = parseFloat(payForm.discount) || 0;
    const lateFee = parseFloat(payForm.late_fee) || 0;
    const total = Math.max(0, amount - discount + lateFee);

    if (payment) {
      const updatePatch = { status: "paid" as PaymentStatus, payment_method: payForm.method, payment_date: payForm.date, late_fee: lateFee, discount, total_amount: total, receipt_number: payForm.receipt_number, notes: payForm.notes || null };
      setPayDialog(null);
      setPayments((prev) => prev.map((p) => p.id === payment.id ? { ...p, ...updatePatch } : p));
      const result = await updatePayment(payment.id, updatePatch);
      if ("error" in result) { toast({ title: "Error", description: result.error, variant: "destructive" }); setPayments((prev) => prev.map((p) => p.id === payment.id ? payment : p)); }
      else {
        toast({ title: "Payment recorded" });
        if (member.status === "defaulter") {
          const { cleared } = await checkAndClearDefaulter(member.id);
          if (cleared) { toast({ title: `${member.full_name} cleared — dues settled, back to active` }); await reload(); }
        }
      }
    } else {
      setPayDialog(null);
      const result = await createPayment({
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
      });
      if ("error" in result) toast({ title: "Error", description: result.error, variant: "destructive" });
      else {
        toast({ title: "Payment recorded" });
        if (result.payment) setPayments((prev) => [result.payment as Payment, ...prev]);
        if (member.status === "defaulter") {
          const { cleared } = await checkAndClearDefaulter(member.id);
          if (cleared) { toast({ title: `${member.full_name} cleared — dues settled, back to active` }); await reload(); }
        }
      }
    }
    setPaySaving(false);
  }

  async function reload() {
    if (!gymId) return;
    // Use a server action (admin client) instead of querying pulse_members
    // directly. Direct client queries are blocked by RLS for non-owner
    // staff (managers/frontdesk), which would wipe the list to [] after
    // any mutation. The server action returns the same shape as the
    // initial server render.
    const result = await reloadMembersData();
    if ("error" in result) {
      toast({ title: "Failed to refresh members", description: result.error, variant: "destructive" });
      return;
    }
    setActive(result.data.active);
    setFrozen(result.data.frozen);
    setOnHold(result.data.on_hold);
    setDefaulters(result.data.defaulters);
    setExpired(result.data.expired);
    void revalidateMembers();
    void revalidateDashboard();
  }

  function setProcessing(id: string, on: boolean) {
    setProcessingIds((prev) => {
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });
  }

  async function handleFreeze(m: Member) {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    setProcessing(m.id, true);
    const result = await freezeMember(m.id);
    setProcessing(m.id, false);
    if ("error" in result) { toast({ title: "Error", description: result.error, variant: "destructive" }); return; }
    toast({ title: `${m.full_name} frozen` });
    await reload();
  }

  async function handleUnfreeze(m: Member) {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    setProcessing(m.id, true);
    const result = await unfreezeMember(m.id);
    setProcessing(m.id, false);
    if ("error" in result) { toast({ title: "Error", description: result.error, variant: "destructive" }); return; }
    const days = "daysFrozen" in result ? result.daysFrozen : 0;
    toast({ title: `${m.full_name} unfrozen`, description: `Plan extended by ${days} day${days !== 1 ? "s" : ""}` });
    await reload();
  }

  async function handleHold(m: Member) {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    setProcessing(m.id, true);
    const result = await putMemberOnHold(m.id);
    setProcessing(m.id, false);
    if ("error" in result) { toast({ title: "Error", description: result.error, variant: "destructive" }); return; }
    toast({ title: `${m.full_name} put on hold` });
    await reload();
  }

  async function handleResume(m: Member) {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    setProcessing(m.id, true);
    const result = await resumeMember(m.id);
    setProcessing(m.id, false);
    if ("error" in result) { toast({ title: "Error", description: result.error, variant: "destructive" }); return; }
    toast({ title: `${m.full_name} resumed` });
    await reload();
  }

  async function handleMarkDefaulter(m: Member) {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    setProcessing(m.id, true);
    const result = await markAsDefaulter(m.id);
    setProcessing(m.id, false);
    if ("error" in result) { toast({ title: "Error", description: result.error, variant: "destructive" }); return; }
    toast({ title: `${m.full_name} marked as defaulter` });
    await reload();
  }

  async function handleClearDefaulter(m: Member) {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    setProcessing(m.id, true);
    const result = await clearDefaulter(m.id);
    setProcessing(m.id, false);
    if ("error" in result) { toast({ title: "Error", description: result.error, variant: "destructive" }); return; }
    toast({ title: `${m.full_name} cleared — back to active` });
    await reload();
  }

  // Open WhatsApp with a pre-filled payment reminder for a defaulter. Uses the
  // gym's saved reminder template + payment methods (Settings → Payment Recovery).
  function sendReminder(m: Member) {
    if (!m.phone) {
      toast({ title: "No phone number on file for this member", variant: "destructive" });
      return;
    }
    const due = m.outstanding_balance && m.outstanding_balance > 0 ? Number(m.outstanding_balance) : Number(m.monthly_fee);
    const message = buildReminderMessage({
      template: gym?.reminder_template,
      memberName: m.full_name,
      amount: due,
      month: new Date().toLocaleString("default", { month: "long", year: "numeric" }),
      gymName: gym?.name ?? "Your Gym",
      accounts: gym?.payment_methods ?? [],
    });
    const url = whatsappUrl(m.phone, message);
    if (!url) {
      toast({ title: "Phone format invalid", description: "Couldn't build a WhatsApp link for this number.", variant: "destructive" });
      return;
    }
    window.open(url, "_blank");
  }

  function openAdd() {
    setEditing(null);
    setPendingDeviceUserId(null);
    setPendingUnlinkedId(null);
    setDialogOpen(true);
  }

  function openEdit(m: Member) {
    setEditing(m);
    setDialogOpen(true);
  }

  async function handleDelete(m: Member) {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    const result = await deleteMemberAction(m.id);
    if ("error" in result) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
      return;
    }
    toast({ title: "Member deleted" });
    await reload();
  }

  function closeBulkEdit() {
    setBulkEditDialog(false);
    setBulkPlanId("");
    setBulkTrainerId("");
    setBulkFee("");
  }

  async function handleBulkEdit() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!gymId || selectedIds.size === 0) return;
    const selectedPlan = bulkPlanId ? plans.find((p) => p.id === bulkPlanId) : undefined;
    const customFee = bulkFee !== "" ? parseFloat(bulkFee) : NaN;
    if (!selectedPlan && isNaN(customFee) && !bulkTrainerId) return;
    setBulkSaving(true);
    const allMembers = [...active, ...frozen, ...onHold, ...defaulters, ...expired];
    const memberById = Object.fromEntries(allMembers.map((m) => [m.id, m]));

    // When no new plan is selected, only assign trainer to members whose current plan includes PT
    let targetIds = Array.from(selectedIds);
    let skipped = 0;
    if (!selectedPlan && bulkTrainerId) {
      const eligible = targetIds.filter((id) => {
        const m = memberById[id];
        const plan = m?.plan_id ? planMap[m.plan_id] : null;
        return !plan || plan.includes_pt;
      });
      skipped = targetIds.length - eligible.length;
      targetIds = eligible;
      if (targetIds.length === 0) {
        toast({ title: "No eligible members", description: "None of the selected members are on a plan that includes a trainer.", variant: "destructive" });
        setBulkSaving(false);
        return;
      }
    }

    const payload: Record<string, unknown> = {};
    if (selectedPlan) {
      payload.plan_id = selectedPlan.id;
      payload.monthly_fee = selectedPlan.price;
      if (!selectedPlan.includes_pt) payload.assigned_trainer_id = null;
      else if (bulkTrainerId) payload.assigned_trainer_id = bulkTrainerId;
    } else if (bulkTrainerId) {
      payload.assigned_trainer_id = bulkTrainerId;
    }
    if (!isNaN(customFee)) payload.monthly_fee = customFee;
    const result = await bulkUpdateMembers(targetIds, payload);
    if (result.error) { toast({ title: "Error", description: result.error, variant: "destructive" }); }
    else {
      const msg = skipped > 0 ? ` (${skipped} skipped — no trainer in their plan)` : "";
      toast({ title: `${targetIds.length} member${targetIds.length !== 1 ? "s" : ""} updated${msg}` });
      closeBulkEdit();
      setSelectedIds(new Set());
      await reload();
    }
    setBulkSaving(false);
  }

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll(list: Member[]) {
    const allSelected = list.every((m) => selectedIds.has(m.id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        list.forEach((m) => next.delete(m.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        list.forEach((m) => next.add(m.id));
        return next;
      });
    }
  }

  function filterList(list: Member[]) {
    let filtered = list;
    if (trainerFilter === "self") {
      filtered = filtered.filter((m) => !m.assigned_trainer_id);
    } else if (trainerFilter !== "all") {
      filtered = filtered.filter((m) => m.assigned_trainer_id === trainerFilter);
    }
    if (shiftFilter !== "all") {
      filtered = filtered.filter((m) => m.shift === shiftFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.full_name.toLowerCase().includes(q) ||
          (m.phone ?? "").includes(q) ||
          (m.cnic ?? "").toLowerCase().includes(q) ||
          (m.member_number ?? "").toLowerCase().includes(q)
      );
    }
    return filtered;
  }

  const planMap = useMemo(() => Object.fromEntries(plans.map((p) => [p.id, p])), [plans]);

  // Counts per trainer chip (across all member pools).
  const trainerCounts = useMemo(() => {
    const all = [...active, ...frozen, ...onHold, ...defaulters, ...expired];
    const counts: Record<string, number> = { all: all.length, self: 0 };
    for (const t of staff) counts[t.id] = 0;
    for (const m of all) {
      if (!m.assigned_trainer_id) counts.self += 1;
      else if (counts[m.assigned_trainer_id] !== undefined) counts[m.assigned_trainer_id] += 1;
    }
    return counts;
  }, [active, frozen, onHold, expired, staff]);

  const stats = {
    active:    active.length,
    frozen:    frozen.length,
    on_hold:   onHold.length,
    defaulters: defaulters.length,
    expired:   expired.length,
  };

  // Shift chip counts (across all member pools).
  const shiftCounts = useMemo(() => {
    const counts: Record<string, number> = { morning: 0, evening: 0, night: 0 };
    for (const m of [...active, ...frozen, ...onHold, ...defaulters, ...expired]) {
      if (m.shift) counts[m.shift] = (counts[m.shift] ?? 0) + 1;
    }
    return counts;
  }, [active, frozen, onHold, defaulters, expired]);
  const hasShiftData = shiftCounts.morning + shiftCounts.evening + shiftCounts.night > 0;

  const filteredActive    = useMemo(() => filterList(active),    [active,    trainerFilter, shiftFilter, search]);
  const filteredFrozen    = useMemo(() => filterList(frozen),    [frozen,    trainerFilter, shiftFilter, search]);
  const filteredOnHold    = useMemo(() => filterList(onHold),    [onHold,    trainerFilter, shiftFilter, search]);
  const filteredDefaulters = useMemo(() => filterList(defaulters), [defaulters, trainerFilter, shiftFilter, search]);
  const filteredExpired   = useMemo(() => filterList(expired),   [expired,   trainerFilter, shiftFilter, search]);

  useEffect(() => { setSelectedIds(new Set()); }, [trainerFilter, shiftFilter, tab, search]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight">Members</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage gym members and memberships</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={() => setExportOpen(true)}
            className="gap-2 flex-1 sm:flex-none"
          >
            <Download className="w-4 h-4" /> Export
          </Button>
          <Button
            onClick={openAdd}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold flex-1 sm:flex-none"
          >
            <Plus className="w-4 h-4" /> Add Member
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-4">
        {[
          { label: "Active",    sub: "Members",     value: stats.active,     icon: UserCheck,   color: "text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20" },
          { label: "Frozen",    sub: "Paused",      value: stats.frozen,     icon: Snowflake,   color: "text-cyan-400",    bg: "bg-cyan-500/10 border border-cyan-500/20" },
          { label: "On Hold",   sub: "Resume List", value: stats.on_hold,    icon: PauseCircle, color: "text-amber-400",   bg: "bg-amber-500/10 border border-amber-500/20" },
          { label: "Defaulters", sub: "Unpaid",     value: stats.defaulters, icon: Ban,         color: "text-rose-400",    bg: "bg-rose-500/10 border border-rose-500/20" },
          { label: "Expired",   sub: "Cancelled",   value: stats.expired,    icon: CalendarX,   color: "text-muted-foreground", bg: "bg-white/5 border border-white/10" },
        ].map(({ label, sub, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-2xl border border-sidebar-border bg-card p-3 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl ${bg} shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">
                  {label} <span className="hidden sm:inline">{sub}</span>
                  <span className="sm:hidden block opacity-70">{sub}</span>
                </p>
                <p className="text-xl sm:text-2xl font-bold text-foreground leading-none mt-1 sm:mt-0.5">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative max-w-sm w-full sm:w-auto sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, CNIC, member ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Trainer dropdown */}
        <Select value={trainerFilter} onValueChange={setTrainerFilter}>
          <SelectTrigger className="w-full sm:w-44 h-9 text-sm">
            <SelectValue placeholder="All Trainers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trainers <span className="text-muted-foreground text-xs ml-1">({trainerCounts.all})</span></SelectItem>
            {staff.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.full_name} <span className="text-muted-foreground text-xs ml-1">({trainerCounts[t.id] ?? 0})</span>
              </SelectItem>
            ))}
            <SelectItem value="self">No Trainer <span className="text-muted-foreground text-xs ml-1">({trainerCounts.self})</span></SelectItem>
          </SelectContent>
        </Select>

        {/* Shift dropdown */}
        {hasShiftData && (
          <Select value={shiftFilter} onValueChange={(v) => setShiftFilter(v as "all" | MemberShift)}>
            <SelectTrigger className="w-full sm:w-36 h-9 text-sm">
              <SelectValue placeholder="All Shifts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shifts</SelectItem>
              {(["morning", "evening", "night"] as MemberShift[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {SHIFT_LABELS[s]} <span className="text-muted-foreground text-xs ml-1">({shiftCounts[s]})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v); if (v === "collect") loadPayments(); }}>
        <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide">
          <TabsList className="w-max">
            <TabsTrigger value="active" className="whitespace-nowrap">
              <UserCheck className="w-3.5 h-3.5" /> Active ({filteredActive.length})
            </TabsTrigger>
            <TabsTrigger value="frozen" className="whitespace-nowrap">
              <Snowflake className="w-3.5 h-3.5" /> Frozen ({filteredFrozen.length})
            </TabsTrigger>
            <TabsTrigger value="on_hold" className="whitespace-nowrap">
              <PauseCircle className="w-3.5 h-3.5" /> On Hold ({filteredOnHold.length})
            </TabsTrigger>
            <TabsTrigger value="defaulters" className="whitespace-nowrap">
              <Ban className="w-3.5 h-3.5" /> Defaulters ({filteredDefaulters.length})
            </TabsTrigger>
            <TabsTrigger value="expired" className="whitespace-nowrap">
              <CalendarX className="w-3.5 h-3.5" /> Expired ({filteredExpired.length})
            </TabsTrigger>
            <TabsTrigger value="collect" className="whitespace-nowrap">
              <CreditCard className="w-3.5 h-3.5" /> Collect Fees
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Active tab */}
        <TabsContent value="active">
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            {filteredActive.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <Users className="w-10 h-10 opacity-20" />
                <p className="text-sm">{search ? "No members match your search" : "No active members yet"}</p>
              </div>
            ) : (
              <MemberTable
                list={filteredActive} showExpired={false} planMap={planMap}
                onEdit={openEdit} onDelete={setDeleteMember} onView={setTimelineMember}
                selectedIds={selectedIds} onToggle={toggleMember} onSelectAll={() => selectAll(filteredActive)}
                extraActions={(m) => (
                  <>
                    <Button variant="ghost" size="icon" title="History" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setTimelineMember(m)}>
                      <Clock className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Freeze" className="h-7 w-7 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                      disabled={processingIds.has(m.id)} onClick={() => handleFreeze(m)}>
                      <Snowflake className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Put on hold" className="h-7 w-7 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                      disabled={processingIds.has(m.id)} onClick={() => handleHold(m)}>
                      <PauseCircle className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Mark as defaulter" className="h-7 w-7 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      disabled={processingIds.has(m.id)} onClick={() => handleMarkDefaulter(m)}>
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              />
            )}
          </div>
        </TabsContent>

        {/* Frozen tab */}
        <TabsContent value="frozen">
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            {filteredFrozen.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <Snowflake className="w-10 h-10 opacity-20" />
                <p className="text-sm">{search ? "No members match your search" : "No frozen members"}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sidebar-border">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Plan</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Frozen Since</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Days Frozen</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Expiry (extended)</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sidebar-border/50">
                    {filteredFrozen.map((m) => {
                      const planData = (m as Member & { plan?: { name: string; color: string } | null }).plan;
                      const planColor = planData?.color ?? "#6B7A99";
                      const daysFrozen = m.freeze_start_date
                        ? Math.max(0, Math.floor((Date.now() - new Date(m.freeze_start_date).getTime()) / 86400000))
                        : null;
                      return (
                        <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                style={{ backgroundColor: `${planColor}22`, color: planColor }}>
                                {m.full_name[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{m.full_name}</p>
                                {m.member_number && <p className="text-xs text-muted-foreground font-mono">{m.member_number}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-sm text-muted-foreground">{planData?.name ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">{m.freeze_start_date ? formatDate(m.freeze_start_date) : "—"}</span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              <Snowflake className="w-3 h-3" />
                              {daysFrozen !== null ? `${daysFrozen}d` : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-sm text-muted-foreground">{m.plan_expiry_date ? formatDate(m.plan_expiry_date) : "—"}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" title="History" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => setTimelineMember(m)}>
                                <Clock className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost"
                                className="h-7 text-xs gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                                disabled={processingIds.has(m.id)}
                                onClick={() => handleUnfreeze(m)}>
                                <PlayCircle className="w-3 h-3" /> Unfreeze
                              </Button>
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
        </TabsContent>

        {/* On Hold tab */}
        <TabsContent value="on_hold">
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            {filteredOnHold.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <PauseCircle className="w-10 h-10 opacity-20" />
                <p className="text-sm">{search ? "No members match your search" : "No members on hold — resume list is empty"}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sidebar-border">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Plan</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Phone</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">On Hold Since</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fee / Month</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sidebar-border/50">
                    {filteredOnHold.map((m) => {
                      const planData = (m as Member & { plan?: { name: string; color: string } | null }).plan;
                      const planColor = planData?.color ?? "#6B7A99";
                      return (
                        <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                style={{ backgroundColor: `${planColor}22`, color: planColor }}>
                                {m.full_name[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{m.full_name}</p>
                                {m.member_number && <p className="text-xs text-muted-foreground font-mono">{m.member_number}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-sm text-muted-foreground">{planData?.name ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">{m.phone ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">{m.hold_since ? formatDate(m.hold_since) : "—"}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-semibold text-foreground whitespace-nowrap">{formatCurrency(Number(m.monthly_fee))}<span className="text-muted-foreground">/mo</span></p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" title="History" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => setTimelineMember(m)}>
                                <Clock className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost"
                                className="h-7 text-xs gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                                disabled={processingIds.has(m.id)}
                                onClick={() => handleResume(m)}>
                                <PlayCircle className="w-3 h-3" /> Resume
                              </Button>
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
        </TabsContent>

        {/* Defaulters tab */}
        <TabsContent value="defaulters">
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            {/* threshold info banner */}
            <div className="px-4 py-2.5 border-b border-sidebar-border bg-rose-500/5 flex items-center gap-2 text-xs text-muted-foreground">
              <Ban className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              Auto-flagged after <span className="font-semibold text-foreground mx-1">{defaulterThreshold}</span> consecutive unpaid months.
              Change threshold in <span className="text-primary ml-1">Settings → Member Defaults</span>.
            </div>
            {filteredDefaulters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <Ban className="w-10 h-10 opacity-20" />
                <p className="text-sm">{search ? "No members match your search" : "No defaulters — all members are paying on time"}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sidebar-border">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Plan</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Phone</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Defaulter Since</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fee / Month</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sidebar-border/50">
                    {filteredDefaulters.map((m) => {
                      const planData = (m as Member & { plan?: { name: string; color: string } | null }).plan;
                      const planColor = planData?.color ?? "#6B7A99";
                      const daysSince = m.defaulter_since
                        ? Math.max(0, Math.floor((Date.now() - new Date(m.defaulter_since).getTime()) / 86400000))
                        : null;
                      return (
                        <tr key={m.id} className="hover:bg-white/[0.02] transition-colors bg-rose-500/[0.02]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                style={{ backgroundColor: `${planColor}22`, color: planColor }}>
                                {m.full_name[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{m.full_name}</p>
                                {m.member_number && <p className="text-xs text-muted-foreground font-mono">{m.member_number}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-sm text-muted-foreground">{planData?.name ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">{m.phone ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div>
                              <span className="text-sm text-muted-foreground">{m.defaulter_since ? formatDate(m.defaulter_since) : "—"}</span>
                              {daysSince !== null && <p className="text-[10px] text-rose-400 mt-0.5">{daysSince}d overdue</p>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-semibold text-foreground whitespace-nowrap">{formatCurrency(Number(m.monthly_fee))}<span className="text-muted-foreground">/mo</span></p>
                            {m.outstanding_balance > 0 && <p className="text-[10px] text-rose-400">Due: {formatCurrency(m.outstanding_balance)}</p>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" title="History" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => setTimelineMember(m)}>
                                <Clock className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost"
                                title={m.phone ? "Send WhatsApp payment reminder" : "No phone number on file"}
                                className="h-7 text-xs gap-1 bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 hover:bg-[#25D366]/20 disabled:opacity-40"
                                disabled={!m.phone}
                                onClick={() => sendReminder(m)}>
                                <MessageCircle className="w-3 h-3" /> Remind
                              </Button>
                              <Button size="sm" variant="ghost"
                                className="h-7 text-xs gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                                disabled={processingIds.has(m.id)}
                                onClick={() => handleClearDefaulter(m)}>
                                <UserCheck className="w-3 h-3" /> Clear
                              </Button>
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
        </TabsContent>

        {/* Expired tab */}
        <TabsContent value="expired">
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            {filteredExpired.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <CalendarX className="w-10 h-10 opacity-20" />
                <p className="text-sm">{search ? "No members match your search" : "No expired or cancelled members"}</p>
              </div>
            ) : (
              <MemberTable list={filteredExpired} showExpired={true} planMap={planMap} onDelete={setDeleteMember} onView={setTimelineMember}
                selectedIds={selectedIds} onToggle={toggleMember} onSelectAll={() => selectAll(filteredExpired)}
                extraActions={(m) => (
                  <>
                    <Button variant="ghost" size="sm" title="Reactivate member"
                      className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1"
                      onClick={() => openEdit(m)}>
                      <PlayCircle className="w-3.5 h-3.5" /> Reactivate
                    </Button>
                    <Button variant="ghost" size="icon" title="History" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setTimelineMember(m)}>
                      <Clock className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )} />
            )}
          </div>
        </TabsContent>

        {/* ── Collect Fees Tab ──────────────────────────────────────────────── */}
        <TabsContent value="collect" className="space-y-4 mt-4">
          {/* Month navigator */}
          <div className="inline-flex items-center rounded-lg border border-sidebar-border bg-card overflow-hidden">
            <button onClick={() => setSelectedMonth((m) => offsetMonth(m, -1))}
              className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors border-r border-sidebar-border">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-foreground w-[148px] text-center px-4 py-2">
              {monthLabel(selectedMonth)}
            </span>
            <button onClick={() => setSelectedMonth((m) => offsetMonth(m, 1))}
              disabled={selectedMonth >= CURRENT_MONTH}
              className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors border-l border-sidebar-border disabled:opacity-30 disabled:pointer-events-none">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Members", value: collectStats.total,                    icon: Users,        color: "text-foreground",  bg: "bg-white/5 border border-white/10" },
              { label: "Paid",          value: collectStats.paid,                     icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20" },
              { label: "Unpaid",        value: collectStats.unpaid,                   icon: Clock,        color: "text-primary",     bg: "bg-primary/10 border border-primary/20" },
              { label: "Collected",     value: formatCurrency(collectStats.collected), icon: Wallet,      color: "text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-2xl border border-sidebar-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${bg} shrink-0`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-bold text-foreground leading-none mt-0.5">{value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Input placeholder="Search member…" value={collectSearch}
            onChange={(e) => setCollectSearch(e.target.value)} className="sm:max-w-xs" />

          {/* Member payment table */}
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            {active.length === 0 && onHold.length === 0 && defaulters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <Users className="w-10 h-10 opacity-20" />
                <p className="text-sm">No active members</p>
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
                    {memberRows.map(({ member, payment }) => {
                      const isPaid = payment?.status === "paid";
                      return (
                        <tr key={member.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                {member.full_name[0]?.toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{member.full_name}</p>
                                {member.member_number && <p className="text-xs text-muted-foreground">#{member.member_number}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {memberPlanLabel(member as Member & { plans?: { plan?: { name?: string | null } | null }[] | null })}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-medium text-foreground">{formatCurrency(Number(member.monthly_fee))}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {payment ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                payment.status === "paid" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : payment.status === "overdue" ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : "bg-primary/10 text-primary border-primary/20"
                              }`}>{payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-white/5 text-muted-foreground border-white/10">Unpaid</span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {payment?.payment_date ? formatDate(payment.payment_date) : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isPaid ? (
                              <span className="flex items-center justify-end gap-1 text-xs text-emerald-400 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                              </span>
                            ) : (
                              <Button size="sm" variant="ghost"
                                className="h-7 text-xs gap-1 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                                onClick={() => openPay(member, payment)}>
                                <CheckCircle2 className="w-3 h-3" /> Pay
                              </Button>
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
        </TabsContent>
      </Tabs>

      {/* ── Pay Dialog ──────────────────────────────────────────────────────────── */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          {payDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-white/5 px-3 py-2.5 space-y-0.5">
                <p className="text-sm font-semibold text-foreground">{payDialog.member.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {memberPlanLabel(payDialog.member as Member & { plans?: { plan?: { name?: string | null } | null }[] | null }, "No plan")} · {monthLabel(selectedMonth)}
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
                    {(Object.entries(methodLabels) as [PaymentMethod, string][]).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Receipt No.</Label>
                <Input value={payForm.receipt_number} onChange={(e) => setPayForm({ ...payForm, receipt_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input placeholder="Optional" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancel</Button>
            <Button onClick={handlePay} disabled={paySaving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {paySaving ? "Saving…" : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteMember}
        title={`Delete ${deleteMember?.full_name ?? "member"}?`}
        description="This member and all associated records will be permanently deleted."
        onConfirm={() => { handleDelete(deleteMember!); setDeleteMember(null); }}
        onCancel={() => setDeleteMember(null)}
      />

      {/* ── Bulk Action Bar ─────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border border-primary/30 bg-card/95 backdrop-blur shadow-xl animate-in slide-in-from-bottom-2 duration-200">
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {selectedIds.size} selected
          </span>
          <div className="w-px h-4 bg-sidebar-border" />
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setBulkPlanId(""); setBulkTrainerId(""); setBulkFee(""); setBulkEditDialog(true); }}>
            Bulk Edit
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* ── Bulk Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={bulkEditDialog} onOpenChange={(o) => { if (!o) closeBulkEdit(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Bulk Edit Members</DialogTitle></DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-muted-foreground">
              Applying to <span className="font-semibold text-foreground">{selectedIds.size} member{selectedIds.size !== 1 ? "s" : ""}</span>. Fill only the fields you want to change.
            </p>
            <div className="space-y-1.5">
              <Label>Plan <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Select value={bulkPlanId || "no-change"} onValueChange={(v) => { setBulkPlanId(v === "no-change" ? "" : v); setBulkTrainerId(""); }}>
                <SelectTrigger><SelectValue placeholder="No change" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-change">No change</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        {p.name} · {formatCurrency(p.price)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(!bulkPlanId || planMap[bulkPlanId]?.includes_pt) && (
              <div className="space-y-1.5">
                <Label>Trainer <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                <Select value={bulkTrainerId || "no-change"} onValueChange={(v) => setBulkTrainerId(v === "no-change" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="No change (keep existing)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-change">No change (keep existing)</SelectItem>
                    {staff.map((s) => (<SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>))}
                  </SelectContent>
                </Select>
                {!bulkPlanId && bulkTrainerId && (
                  <p className="text-xs text-amber-400">Only applies to members on plans that include a trainer.</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Monthly Fee (Rs.) <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Input
                type="number"
                min="0"
                placeholder="No change"
                value={bulkFee}
                onChange={(e) => setBulkFee(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBulkEdit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeBulkEdit}>Cancel</Button>
            <Button
              onClick={handleBulkEdit}
              disabled={bulkSaving || (!bulkPlanId && bulkFee === "" && !bulkTrainerId)}
            >
              {bulkSaving ? "Updating…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Dialog — isolated component so typing doesn't re-render the table */}
      <MemberFormDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) { setPendingDeviceUserId(null); setPendingUnlinkedId(null); } }}
        editing={editing}
        existingMembers={[...active, ...frozen, ...onHold, ...defaulters, ...expired]}
        plans={plans}
        staff={staff}
        shifts={shifts}
        referrers={referrers}
        gymId={gymId}
        initialDeviceUserId={pendingDeviceUserId}
        unlinkedPunchId={pendingUnlinkedId}
        onSaved={reload}
        onOpenExisting={(m) => { setEditing(m); /* keeps dialog open, switches to edit */ }}
      />

      <MemberTimelineDialog
        member={timelineMember}
        gymId={gymId}
        onClose={() => setTimelineMember(null)}
      />

      <ExportMembersDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        lists={{ active, frozen, on_hold: onHold, defaulters, expired }}
        defaultList={(["frozen", "on_hold", "defaulters", "expired"].includes(tab) ? tab : "active") as ListKey}
        gymName={gym?.name ?? "Gym"}
        applyFilters={filterList}
        filtersActive={search !== "" || trainerFilter !== "all" || shiftFilter !== "all"}
      />
    </div>
  );
}

// ─── Validated input ────────────────────────────────────────────────────────
// Drop-in <Input> with field-level validation feedback.
// - Stays silent until the user blurs (touched) — no yelling while mid-typing.
// - After blur: live re-validates on each keystroke so errors clear as the user fixes them.
// - Shows red border + inline error message + checkmark when valid (after touch).

interface ValidatedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onChange: (v: string) => void;
  validator?: (v: string) => ValidationResult;
  required?: boolean;
}

function ValidatedInput({ value, onChange, validator, required, className, ...rest }: ValidatedInputProps) {
  const [touched, setTouched] = useState(false);
  const result = validator ? validator(value) : null;
  const isInvalid = touched && result !== null && !result.ok;
  const errorMessage = isInvalid && result && !result.ok ? result.message : null;
  const isValid = touched && result?.ok && value.trim().length > 0;

  return (
    <>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={isInvalid}
          required={required}
          className={cn(
            isInvalid && "border-rose-500/60 focus-visible:ring-rose-500/30 pr-9",
            isValid && "border-emerald-500/40 pr-9",
            className,
          )}
          {...rest}
        />
        {isInvalid && (
          <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400 pointer-events-none" />
        )}
        {isValid && (
          <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 pointer-events-none" />
        )}
      </div>
      {errorMessage && (
        <p className="text-xs text-rose-400 flex items-center gap-1 mt-1 animate-in fade-in slide-in-from-top-1 duration-150">
          <AlertCircle className="w-3 h-3 shrink-0" /> {errorMessage}
        </p>
      )}
    </>
  );
}

function calcPlanExpiry(plan: MembershipPlan, startDateStr: string): string {
  const [y, m, d] = (startDateStr || formatDateInput(new Date())).split("-").map(Number);
  // m is 1-indexed from the date string. JS Date months are 0-indexed, so passing m
  // directly as the month arg means "next month" — this is intentional.
  //
  // Clamp: when the start day exceeds the days in the target month, cap at the last
  // valid day instead of overflowing (e.g. Jan 31 + monthly → Feb 28, not Mar 2).
  // d=1 start uses day-0 trick (last day of previous month) which is intentional.
  const clampDay = (offset: number) => {
    if (d <= 1) return 0;
    const last = new Date(y, m + offset + 1, 0).getDate();
    return Math.min(d - 1, last);
  };
  switch (plan.duration_type) {
    case "monthly":   return formatDateInput(new Date(y, m,     clampDay(0)));
    case "quarterly": return formatDateInput(new Date(y, m + 2, clampDay(2)));
    case "biannual":  return formatDateInput(new Date(y, m + 5, clampDay(5)));
    case "annual":    return formatDateInput(new Date(y + 1, m - 1, d - 1));
  }
  if (plan.duration_days && plan.duration_days > 0) {
    return formatDateInput(new Date(y, m - 1, d + plan.duration_days - 1));
  }
  return formatDateInput(new Date(y, m - 1, d));
}

// ─── Isolated form dialog ────────────────────────────────────────────────────
// Owns its own state so typing doesn't re-render the parent's tables.

interface MemberFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Member | null;
  existingMembers: Member[];
  plans: MembershipPlan[];
  staff: Pick<Staff, "id" | "full_name" | "role" | "commission_percentage" | "commission_floor" | "default_shift_name">[];
  shifts: Record<string, TrainerShift[]>;
  referrers: Pick<Referrer, "id" | "full_name" | "commission_type" | "commission_value">[];
  gymId: string | null;
  initialDeviceUserId?: string | null;
  unlinkedPunchId?: string | null;
  onSaved: () => void | Promise<void>;
  onOpenExisting: (m: Member) => void;
}

// Strip non-digits and keep the last 10 digits.
// Handles: "03001234567" / "+923001234567" / "923001234567" / "0300-1234567" → "3001234567"
function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function MemberFormDialog({
  open, onOpenChange, editing, existingMembers, plans, staff, shifts, referrers, gymId, initialDeviceUserId, unlinkedPunchId, onSaved, onOpenExisting,
}: MemberFormDialogProps) {
  const { isDemo } = useGymContext();
  const [form, setForm] = useState(() => makeEmptyForm());
  const [saving, setSaving] = useState(false);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<UnmatchedLead | null>(null);
  const [planPortalEl, setPlanPortalEl] = useState<HTMLElement | null>(null);
  const [unmatchedLeads, setUnmatchedLeads] = useState<UnmatchedLead[]>([]);

  // Detect a member with the same phone (ignoring the one being edited).
  // Only triggers once 10+ digits have been entered to avoid early false positives.
  const phoneMatch = useMemo(() => {
    const norm = normalizePhone(form.phone);
    if (norm.length < 10) return null;
    return existingMembers.find(
      (m) => m.id !== editing?.id && normalizePhone(m.phone) === norm,
    ) ?? null;
  }, [form.phone, existingMembers, editing?.id]);

  // Auto-detect social lead by phone number match (Tier 1)
  const autoSocialMatch = useMemo(() => {
    if (editing || !form.phone) return null;
    const norm = normalizePhone(form.phone);
    if (norm.length < 10) return null;
    return unmatchedLeads.find((l) => l.lead_phone && normalizePhone(l.lead_phone) === norm) ?? null;
  }, [form.phone, unmatchedLeads, editing]);

  // If auto-match found and no manual lead selected, use auto-match
  const activeLead = selectedLead ?? (autoSocialMatch ?? null);

  // Lazy-fetch unmatched social leads only when Add dialog opens (not on page load).
  // NOTE: pulse_social_leads has no staff SELECT RLS policy — this query returns []
  // for non-owner staff (manager/frontdesk). Result: staff don't see social-lead
  // auto-match suggestions when adding members. They CAN still add members; the
  // social-match feature is owner-only by current RLS. Move to server action if
  // staff need this — see "deferred" items in Phase H3 review.
  useEffect(() => {
    if (!open || editing || !gymId) return;
    const supabase = createClient();
    supabase
      .from("pulse_social_leads")
      .select("id,lead_name,lead_phone,lead_social_handle,platform,evidence_url,notes,expires_at,created_at,manager:pulse_social_managers(full_name,commission_type,commission_value)")
      .eq("gym_id", gymId)
      .eq("status", "unmatched")
      .order("created_at", { ascending: false })
      .then(({ data }) => setUnmatchedLeads((data ?? []) as unknown as UnmatchedLead[]));
  }, [open, editing, gymId]);

  // Reset override and lead selection whenever dialog opens/closes
  useEffect(() => { setAllowDuplicate(false); }, [form.phone, open]);
  useEffect(() => { if (!open) { setSelectedLead(null); setLeadPickerOpen(false); setUnmatchedLeads([]); } }, [open]);

  const planMap = useMemo(() => Object.fromEntries(plans.map((p) => [p.id, p])), [plans]);

  // Reset form whenever the dialog opens (or editing target changes).
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        full_name: editing.full_name,
        phone: editing.phone ?? "",
        email: editing.email ?? "",
        cnic: editing.cnic ?? "",
        gender: editing.gender ?? "male",
        date_of_birth: editing.date_of_birth ?? "",
        address: editing.address ?? "",
        shift: (editing.shift ?? "") as "" | MemberShift,
        member_number: editing.member_number ?? "",
        photo_url: editing.photo_url ?? "",
        plan_id: editing.plan_id ?? "",
        plan_ids: (() => {
          const fromJunction = ((editing as Member & { plans?: { plan?: { id: string } | null }[] }).plans ?? [])
            .map((pp) => pp.plan?.id)
            .filter((id): id is string => !!id);
          if (fromJunction.length) {
            // Keep the primary (member.plan_id) first so it drives the cycle.
            return editing.plan_id
              ? [editing.plan_id, ...fromJunction.filter((id) => id !== editing.plan_id)]
              : fromJunction;
          }
          return editing.plan_id ? [editing.plan_id] : [];
        })(),
        assigned_trainer_id: editing.assigned_trainer_id ?? "",
        assigned_shift_id: editing.assigned_shift_id ?? "",
        referrer_id: (editing as Member & { referrer_id?: string | null }).referrer_id ?? "",
        social_lead_id: "",
        join_date: editing.join_date,
        plan_start_date: (() => {
          if (editing.status === "expired" || editing.status === "cancelled") return formatDateInput(new Date());
          return editing.plan_start_date ?? "";
        })(),
        plan_expiry_date: (() => {
          if (editing.status === "expired" || editing.status === "cancelled") {
            const today = formatDateInput(new Date());
            const primaryPlan = editing.plan_id ? planMap[editing.plan_id] : null;
            return primaryPlan ? calcPlanExpiry(primaryPlan, today) : "";
          }
          return editing.plan_expiry_date ?? "";
        })(),
        admission_fee: editing.admission_fee > 0 ? editing.admission_fee.toString() : "",
        admission_fee_paid: false,
        discount: "0",
        monthly_fee: editing.monthly_fee.toString(),
        outstanding_balance: editing.outstanding_balance.toString(),
        emergency_contact: editing.emergency_contact ?? "",
        emergency_phone: editing.emergency_phone ?? "",
        medical_notes: editing.medical_notes ?? "",
        notes: editing.notes ?? "",
        device_user_id: editing.device_user_id ?? "",
        status: editing.status,
      });
    } else {
      setForm(makeEmptyForm(initialDeviceUserId ?? ""));
    }
  }, [open, editing, initialDeviceUserId, plans]);

  // Toggle a plan in the member's multi-plan set. The first selected plan is
  // the primary (member.plan_id) — it drives the billing cycle/expiry. The
  // monthly fee auto-sums all selected plan prices (still editable below).
  function togglePlan(planId: string) {
    setForm((f) => {
      const has = f.plan_ids.includes(planId);
      const nextIds = has ? f.plan_ids.filter((id) => id !== planId) : [...f.plan_ids, planId];
      const primaryId = nextIds[0] ?? "";
      const primary = primaryId ? planMap[primaryId] : null;
      const sumFee = nextIds.reduce((s, id) => s + Number(planMap[id]?.price ?? 0), 0);
      return {
        ...f,
        plan_ids: nextIds,
        plan_id: primaryId,
        monthly_fee: nextIds.length ? String(sumFee) : f.monthly_fee,
        admission_fee: primary && primary.admission_fee > 0 ? String(primary.admission_fee) : f.admission_fee,
        plan_expiry_date: primary ? calcPlanExpiry(primary, f.plan_start_date || f.join_date) : f.plan_expiry_date,
      };
    });
  }

  async function handleSave() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!gymId) return;

    const check = runValidators(
      validateFullName(form.full_name),
      validateCNIC(form.cnic),
      validatePakPhone(form.phone),
      validatePakPhone(form.emergency_phone),
      validateDOB(form.date_of_birth),
      validateMoney(form.monthly_fee, "Monthly fee"),
    );
    if (!check.ok) {
      toast({ title: "Check the form", description: check.message, variant: "destructive" });
      return;
    }

    if (phoneMatch && !allowDuplicate) {
      toast({
        title: "Possible duplicate member",
        description: `This phone is already registered to ${phoneMatch.full_name}. Open existing or tick "Add anyway" to override.`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    const admissionFee = parseFloat(form.admission_fee) || 0;
    const admissionPaid = !editing && admissionFee > 0 && form.admission_fee_paid;
    const admissionUnpaid = !editing && admissionFee > 0 && !form.admission_fee_paid;
    const rawDiscount = parseFloat(form.discount) || 0;
    // Discount honored regardless of paid/unpaid status.
    // Paid: applied to admission payment row.
    // Unpaid: subtracted from outstanding_balance (owner pays the net later).
    const admissionDiscount = !editing && admissionFee > 0
      ? Math.min(Math.max(0, rawDiscount), admissionFee)
      : 0;
    const admissionDueAfterDiscount = Math.max(0, admissionFee - admissionDiscount);

    // When admission is unpaid + owner promised a discount, persist that
    // intent on the member row so the Discounts report can show it as
    // "Promised". Cleared automatically on admission payment.
    const pendingSignupDiscount = admissionUnpaid && admissionDiscount > 0
      ? admissionDiscount
      : 0;

    const payload = {
      gym_id: gymId,
      full_name: form.full_name,
      phone: form.phone || null,
      email: form.email || null,
      cnic: form.cnic || null,
      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,
      address: form.address || null,
      shift: form.shift || null,
      photo_url: form.photo_url || null,
      ...(editing ? { member_number: form.member_number || null } : {}),
      plan_id: form.plan_ids[0] || form.plan_id || null,
      // Full multi-plan set; server syncs the pulse_member_plans junction.
      plan_ids: form.plan_ids,
      assigned_trainer_id: form.assigned_trainer_id || null,
      assigned_shift_id: form.assigned_shift_id || null,
      referrer_id: form.referrer_id || null,
      join_date: form.join_date || formatDateInput(new Date()),
      plan_start_date: form.plan_start_date || null,
      plan_expiry_date: form.plan_expiry_date || null,
      admission_fee: admissionFee,
      monthly_fee: parseFloat(form.monthly_fee) || 0,
      outstanding_balance: (parseFloat(form.outstanding_balance) || 0) + (admissionUnpaid ? admissionDueAfterDiscount : 0),
      // Only meaningful on create; createMember reads it, updateMember
      // ignores it (NOT in MEMBER_UPDATE_ALLOWED whitelist).
      ...(editing ? {} : { pending_signup_discount: pendingSignupDiscount }),
      emergency_contact: form.emergency_contact || null,
      emergency_phone: form.emergency_phone || null,
      medical_notes: form.medical_notes || null,
      notes: form.notes || null,
      device_user_id: form.device_user_id || null,
      status: form.status,
    };

    if (editing) {
      const result = await updateMember(editing.id, payload);
      if (result.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
        setSaving(false);
        return;
      }
    } else {
      const createResult = await createMember(payload);
      if (createResult.error || !createResult.memberId) {
        toast({ title: "Error", description: createResult.error ?? "Unknown error", variant: "destructive" });
        setSaving(false);
        return;
      }
      const newMemberId = createResult.memberId;
      if (admissionPaid) {
        await createPayment({
          member_id: newMemberId,
          plan_id: form.plan_id || null,
          amount: admissionFee,
          discount: admissionDiscount,
          late_fee: 0,
          total_amount: Math.max(0, admissionFee - admissionDiscount),
          payment_method: "cash",
          payment_date: form.join_date || formatDateInput(new Date()),
          for_period: "admission",
          status: "paid",
          notes: admissionDiscount > 0 ? `Admission fee (discount: ${admissionDiscount})` : "Admission fee",
        });
      }
      if (form.referrer_id) {
        const referrer = referrers.find((r) => r.id === form.referrer_id);
        if (referrer) {
          const monthly = parseFloat(form.monthly_fee) || 0;
          const commission =
            referrer.commission_type === "flat"
              ? referrer.commission_value
              : Math.round((monthly * referrer.commission_value) / 100);
          await createReferralForMember({
            member_id: newMemberId,
            referrer_id: referrer.id,
            commission_amount: commission,
          });
        }
      }
      // Social lead matching
      if (activeLead && gymId) {
        const monthly = parseFloat(form.monthly_fee) || 0;
        const mgr = activeLead.manager;
        const commission = mgr
          ? (mgr.commission_type === "flat"
              ? Number(mgr.commission_value)
              : Math.round((monthly * Number(mgr.commission_value)) / 100))
          : 0;
        const matchType = autoSocialMatch?.id === activeLead.id ? "auto" : "manual";
        await matchSocialLead(activeLead.id, newMemberId, commission, matchType);
        setUnmatchedLeads((prev) => prev.filter((l) => l.id !== activeLead.id));
      }
    }

    // If this registration came from an unlinked punch, remove it from the queue
    if (!editing && unlinkedPunchId) {
      await consumeUnlinkedPunch(unlinkedPunchId);
      toast({ title: "Member registered", description: "Device linked — future scans will check in automatically." });
    } else {
      toast({ title: editing ? "Member updated" : "Member added" });
    }
    setSaving(false);
    onOpenChange(false);
    await onSaved();
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Portal target for plan picker — keeps Popover inside Dialog DOM so react-remove-scroll allows wheel events */}
        <div ref={(el) => setPlanPortalEl(el)} />
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Member" : "Add Member"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Personal Info</p>
            <div className="flex justify-center mb-5">
              <PhotoPicker
                value={form.photo_url || null}
                onChange={(url) => setForm((f) => ({ ...f, photo_url: url ?? "" }))}
                fallbackText={form.full_name}
                disabled={isDemo}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Full Name *</Label>
                <ValidatedInput
                  placeholder="Ahmed Khan"
                  value={form.full_name}
                  onChange={(v) => setForm((f) => ({ ...f, full_name: v }))}
                  validator={validateFullName}
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Phone <span className="text-muted-foreground text-xs">(03xx-xxxxxxx)</span></Label>
                <ValidatedInput
                  placeholder="03001234567"
                  value={form.phone}
                  onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                  validator={validatePakPhone}
                  inputMode="tel"
                />
                {phoneMatch && (
                  <div className="mt-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-200">
                          {phoneMatch.full_name} already exists with this phone
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {phoneMatch.plan_id ? "Active member · " : ""}
                          {phoneMatch.status === "expired" ? "Expired · " : ""}
                          Joined {formatDate(phoneMatch.join_date)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 pl-6">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 gap-1.5"
                        onClick={() => onOpenExisting(phoneMatch)}
                      >
                        <Edit2 className="w-3 h-3" /> Open existing
                      </Button>
                      <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-sidebar-border bg-card hover:bg-white/5 cursor-pointer transition-colors text-xs">
                        <input
                          type="checkbox"
                          checked={allowDuplicate}
                          onChange={(e) => setAllowDuplicate(e.target.checked)}
                          className="w-3.5 h-3.5 rounded accent-rose-500"
                        />
                        <span className={allowDuplicate ? "text-rose-300 font-medium" : "text-muted-foreground"}>
                          Add anyway
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" placeholder="member@email.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>CNIC <span className="text-muted-foreground text-xs">(XXXXX-XXXXXXX-X)</span></Label>
                <ValidatedInput
                  placeholder="00000-0000000-0"
                  value={form.cnic}
                  onChange={(v) => setForm((f) => ({ ...f, cnic: v }))}
                  validator={validateCNIC}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v as MemberGender }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Gym Shift</Label>
                <Select value={form.shift || "none"} onValueChange={(v) => setForm((f) => ({ ...f, shift: v === "none" ? "" : (v as MemberShift) }))}>
                  <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="evening">Evening</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <ValidatedInput
                  type="date"
                  value={form.date_of_birth}
                  onChange={(v) => setForm((f) => ({ ...f, date_of_birth: v }))}
                  validator={validateDOB}
                />
              </div>
              {editing && form.member_number && (
                <div className="space-y-1.5">
                  <Label>Member ID</Label>
                  <div className="h-10 px-3 flex items-center rounded-lg border border-sidebar-border bg-muted/30 font-mono text-sm text-muted-foreground">
                    {form.member_number}
                  </div>
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Address</Label>
                <Input placeholder="Street, area, city" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Membership</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Membership Plans</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-sidebar-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50"
                    >
                      <span className="flex-1 min-w-0 truncate text-left">
                        {form.plan_ids.length === 0 ? (
                          <span className="text-muted-foreground">Select plans</span>
                        ) : (
                          form.plan_ids
                            .map((id) => planMap[id]?.name)
                            .filter(Boolean)
                            .join(", ")
                        )}
                      </span>
                      {form.plan_ids.length > 1 && (
                        <span className="shrink-0 text-[10px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                          {form.plan_ids.length}
                        </span>
                      )}
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" container={planPortalEl} className="p-0 max-h-64 overflow-y-auto w-[var(--radix-popover-trigger-width)] min-w-[260px]">
                    <div className="divide-y divide-sidebar-border/50">
                      {plans.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-muted-foreground text-center">No plans available</p>
                      ) : [...plans].sort((a, b) => {
                        const aSelected = form.plan_ids.includes(a.id);
                        const bSelected = form.plan_ids.includes(b.id);
                        if (aSelected && !bSelected) return -1;
                        if (!aSelected && bSelected) return 1;
                        return 0;
                      }).map((p) => {
                        const idx = form.plan_ids.indexOf(p.id);
                        const selected = idx !== -1;
                        const isPrimary = idx === 0;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePlan(p.id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                              selected ? "bg-primary/10" : "hover:bg-white/5"
                            }`}
                          >
                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              selected ? "bg-primary border-primary" : "border-sidebar-border"
                            }`}>
                              {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                            </span>
                            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                            <span className="flex-1 min-w-0 truncate text-sm">
                              <span className="font-medium text-foreground">{p.name}</span>
                              <span className="text-muted-foreground"> · {DURATION_LABELS[p.duration_type] ?? p.duration_type} · {formatCurrency(p.price)}</span>
                            </span>
                            {isPrimary && (
                              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-primary">Primary</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                {form.plan_ids.length > 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    The <span className="text-foreground">primary</span> plan (first selected) sets the billing cycle &amp; expiry. All plans share one combined monthly fee.
                  </p>
                )}
              </div>
                <SmartAssignPanel
                  trainers={staff}
                  shifts={shifts}
                  selectedTrainerId={form.assigned_trainer_id}
                  selectedShiftId={form.assigned_shift_id}
                  memberFee={Number(form.monthly_fee) || 0}
                  onSelectTrainer={(v) => setForm((f) => ({ ...f, assigned_trainer_id: v, assigned_shift_id: "" }))}
                  onSelectShift={(v) => setForm((f) => ({ ...f, assigned_shift_id: v }))}
                />
                {!editing && referrers.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Referred by <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Select value={form.referrer_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, referrer_id: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="No referrer" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No referrer</SelectItem>
                        {referrers.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.full_name} · {r.commission_type === "flat" ? `PKR ${r.commission_value}` : `${r.commission_value}%`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Social media lead matching */}
                {!editing && (
                  <div className="space-y-1.5 sm:col-span-2">
                    {autoSocialMatch && !selectedLead && (
                      <div className="rounded-lg border border-green-500/30 bg-green-500/8 px-3 py-2 flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-green-400">Social Media Lead Matched</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {autoSocialMatch.lead_name} · via {autoSocialMatch.platform} · by {autoSocialMatch.manager?.full_name ?? "—"}
                          </p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Phone matched — commission auto-approved on save</p>
                        </div>
                        <button onClick={() => setSelectedLead({ ...autoSocialMatch, _dismissed: true } as UnmatchedLead & { _dismissed?: boolean })} className="text-[10px] text-muted-foreground hover:text-red-400 shrink-0">Dismiss</button>
                      </div>
                    )}
                    {!autoSocialMatch && unmatchedLeads.length > 0 && !selectedLead && (
                      <button
                        type="button"
                        onClick={() => setLeadPickerOpen(true)}
                        className="text-xs text-primary hover:underline"
                      >
                        Social media lead? Browse {unmatchedLeads.length} unmatched lead{unmatchedLeads.length > 1 ? "s" : ""}
                      </button>
                    )}
                    {selectedLead && !(selectedLead as UnmatchedLead & { _dismissed?: boolean })._dismissed && (
                      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/8 px-3 py-2 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-yellow-400">Social Lead — Needs Owner Review</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {selectedLead.lead_name} · via {selectedLead.platform} · by {selectedLead.manager?.full_name ?? "—"}
                          </p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Manual match — owner approval required before commission is paid</p>
                        </div>
                        <button onClick={() => setSelectedLead(null)} className="text-[10px] text-muted-foreground hover:text-red-400 shrink-0">Remove</button>
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Join Date *</Label>
                  <Input type="date" value={form.join_date} onChange={(e) => setForm((f) => ({ ...f, join_date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Plan Start Date</Label>
                  <Input type="date" value={form.plan_start_date} onChange={(e) => {
                    const newStart = e.target.value;
                    setForm((f) => {
                      const plan = f.plan_id ? planMap[f.plan_id] : null;
                      return {
                        ...f,
                        plan_start_date: newStart,
                        plan_expiry_date: plan && newStart ? calcPlanExpiry(plan, newStart) : f.plan_expiry_date,
                      };
                    });
                  }} />
                </div>
                <div className="space-y-1.5">
                  <Label>Plan Expiry Date</Label>
                  <Input type="date" value={form.plan_expiry_date} onChange={(e) => setForm((f) => ({ ...f, plan_expiry_date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as MemberStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="frozen">Frozen</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Monthly Fee (PKR) *</Label>
                  <ValidatedInput
                    type="number"
                    placeholder="0"
                    value={form.monthly_fee}
                    onChange={(v) => setForm((f) => ({ ...f, monthly_fee: v }))}
                    validator={(v) => validateMoney(v, "Monthly fee")}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Admission Fee (PKR)</Label>
                  <Input type="number" placeholder="0" value={form.admission_fee} onChange={(e) => setForm((f) => ({ ...f, admission_fee: e.target.value }))} />
                </div>
                {!editing && parseFloat(form.admission_fee) > 0 && (
                  <div className="space-y-1.5">
                    <Label>Discount (PKR)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={parseFloat(form.admission_fee) || 0}
                      placeholder="0"
                      value={form.discount}
                      onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                    />
                    {(() => {
                      const d = parseFloat(form.discount) || 0;
                      const fee = parseFloat(form.admission_fee) || 0;
                      if (d > fee) {
                        return <p className="text-xs text-rose-400">Discount cannot exceed admission fee. It will be clamped to {formatCurrency(fee)}.</p>;
                      }
                      if (d < 0) {
                        return <p className="text-xs text-rose-400">Discount cannot be negative. It will be clamped to 0.</p>;
                      }
                      return <p className="text-xs text-muted-foreground">One-time discount on admission fee. {form.admission_fee_paid ? "Applied to the admission payment." : "Reduces the outstanding balance."}</p>;
                    })()}
                  </div>
                )}
                {!editing && parseFloat(form.admission_fee) > 0 && (
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label>Admission Fee Status</Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, admission_fee_paid: true }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          form.admission_fee_paid
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "border-sidebar-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Paid Now
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, admission_fee_paid: false }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          !form.admission_fee_paid
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                            : "border-sidebar-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Pending
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {form.admission_fee_paid
                        ? "A paid payment record will be created automatically."
                        : "Amount will be added to outstanding balance."}
                    </p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Outstanding Balance (PKR)</Label>
                  <Input type="number" placeholder="0" value={form.outstanding_balance} onChange={(e) => setForm((f) => ({ ...f, outstanding_balance: e.target.value }))} />
                </div>
              </div>
            </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Emergency &amp; Health</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Emergency Contact</Label>
                <Input placeholder="Contact name" value={form.emergency_contact} onChange={(e) => setForm((f) => ({ ...f, emergency_contact: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Emergency Phone</Label>
                <ValidatedInput
                  placeholder="03001234567"
                  value={form.emergency_phone}
                  onChange={(v) => setForm((f) => ({ ...f, emergency_phone: v }))}
                  validator={validatePakPhone}
                  inputMode="tel"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Medical Notes</Label>
                <Input placeholder="Any medical conditions, allergies, injuries…" value={form.medical_notes} onChange={(e) => setForm((f) => ({ ...f, medical_notes: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Input placeholder="Additional notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Device ID <span className="text-muted-foreground font-normal">(ZKTeco)</span></Label>
                <Input
                  placeholder="e.g. 1"
                  value={form.device_user_id}
                  onChange={(e) => setForm((f) => ({ ...f, device_user_id: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">User ID shown on device after fingerprint enrolment.</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.full_name}>
            {saving ? "Saving…" : editing ? "Update Member" : "Add Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Social lead picker dialog (Tier 2 — manual match) */}
    <Dialog open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Match Social Media Lead</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Select the pre-registered lead that matches this new member. The owner will review and approve the commission.</p>
        <div className="space-y-2 mt-2">
          {unmatchedLeads.map((lead) => (
            <button
              key={lead.id}
              onClick={() => { setSelectedLead(lead); setLeadPickerOpen(false); }}
              className="w-full text-left rounded-lg border border-sidebar-border bg-card px-3 py-2.5 hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{lead.lead_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {lead.lead_phone ?? lead.lead_social_handle ?? "No contact"} · {lead.platform} · by {lead.manager?.full_name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground/60">Added {formatDate(lead.created_at)}</p>
                </div>
                {lead.evidence_url && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" aria-label="Has evidence" />}
              </div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setLeadPickerOpen(false)} className="border-sidebar-border">Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── Member Timeline Dialog ──────────────────────────────────────────────────

type AuditRow = { id: string; action: string; created_at: string; meta: Record<string, unknown> | null };
type TimelinePayment = Payment & { plan?: { name: string } | null; trainer?: { full_name: string } | null };

type TimelineEvent = {
  id: string;
  date: string;
  type: "joined" | "payment" | "freeze" | "unfreeze" | "hold" | "resume" | "defaulter" | "defaulter_cleared" | "reactivated" | "status";
  title: string;
  description: string;
  // Payment events render as stacked rows (amount, plan, trainer) instead of
  // one long line that wraps badly in the narrow dialog. lines[0] is shown
  // emphasized; the rest are muted.
  lines?: string[];
};

const TIMELINE_ICONS: Record<TimelineEvent["type"], { icon: React.ElementType; color: string; bg: string }> = {
  joined:            { icon: UserCheck,   color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  payment:           { icon: CreditCard,  color: "text-primary",     bg: "bg-primary/10 border-primary/30" },
  freeze:            { icon: Snowflake,   color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/30" },
  unfreeze:          { icon: PlayCircle,  color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  hold:              { icon: PauseCircle, color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30" },
  resume:            { icon: PlayCircle,  color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  defaulter:         { icon: Ban,         color: "text-rose-400",    bg: "bg-rose-500/10 border-rose-500/30" },
  defaulter_cleared: { icon: UserCheck,   color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  reactivated:       { icon: PlayCircle,  color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  status:            { icon: AlertCircle, color: "text-muted-foreground", bg: "bg-white/5 border-white/10" },
};

function buildTimeline(member: Member, audits: AuditRow[], payments: TimelinePayment[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    id: "joined",
    date: member.join_date,
    type: "joined",
    title: "Joined",
    description: `Member registered${member.member_number ? ` · #${member.member_number}` : ""}`,
  });

  for (const a of audits) {
    const meta = a.meta ?? {};
    if (a.action === "member.freeze") {
      events.push({ id: a.id, date: a.created_at, type: "freeze", title: "Plan Frozen", description: `Freeze started${meta.freeze_start_date ? ` · ${formatDate(meta.freeze_start_date as string)}` : ""}` });
    } else if (a.action === "member.unfreeze") {
      const days = meta.days_frozen as number | undefined;
      const expiry = meta.new_expiry as string | undefined;
      events.push({ id: a.id, date: a.created_at, type: "unfreeze", title: "Unfrozen", description: `${days != null ? `+${days} day${days !== 1 ? "s" : ""} added to plan` : "Plan resumed"}${expiry ? ` · New expiry ${formatDate(expiry)}` : ""}` });
    } else if (a.action === "member.hold") {
      events.push({ id: a.id, date: a.created_at, type: "hold", title: "Put on Hold", description: `Moved to resume list${meta.hold_since ? ` · ${formatDate(meta.hold_since as string)}` : ""}` });
    } else if (a.action === "member.resume") {
      events.push({ id: a.id, date: a.created_at, type: "resume", title: "Resumed", description: `Returned to active${meta.was_on_hold_since ? ` · was on hold since ${formatDate(meta.was_on_hold_since as string)}` : ""}` });
    } else if (a.action === "member.defaulter") {
      events.push({ id: a.id, date: a.created_at, type: "defaulter", title: "Marked as Defaulter", description: `Flagged for non-payment${meta.defaulter_since ? ` · ${formatDate(meta.defaulter_since as string)}` : ""}` });
    } else if (a.action === "member.defaulter_cleared" || a.action === "member.defaulter_auto_cleared") {
      events.push({ id: a.id, date: a.created_at, type: "defaulter_cleared", title: "Defaulter Cleared", description: a.action === "member.defaulter_auto_cleared" ? "Auto-cleared — dues settled" : "Manually cleared by owner" });
    } else if (a.action === "member.reactivate") {
      const expiry = meta.new_expiry as string | undefined;
      events.push({ id: a.id, date: a.created_at, type: "reactivated", title: "Reactivated", description: `Returned to active${expiry ? ` · new expiry ${formatDate(expiry)}` : ""}` });
    }
  }

  for (const p of payments) {
    const period = p.for_period ?? "";
    const label = period === "admission" ? "Admission Fee" : (() => {
      const [y, m] = period.split("-");
      if (!y || !m) return period || "Payment";
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    })();
    const method = (p.payment_method ?? "").replace("_", " ");
    // Prefer the plan breakdown snapshotted on the payment (all plans that
    // month) over the single primary-plan join.
    const breakdown = (p as Payment & { plan_breakdown?: { name: string }[] | null }).plan_breakdown;
    const planName = Array.isArray(breakdown) && breakdown.length
      ? breakdown.map((b) => b.name).join(" + ")
      : p.plan?.name;
    const trainerName = p.trainer?.full_name;
    const lines = [
      `${formatCurrency(p.total_amount)}${method ? ` (${method})` : ""}`,
      planName ? `Plan:  ${planName}` : null,
      trainerName ? `Trainer:  ${trainerName}` : null,
    ].filter(Boolean) as string[];
    events.push({
      id: p.id,
      date: p.payment_date ?? p.created_at,
      type: "payment",
      title: `Payment · ${label}`,
      description: lines.join(" · "),
      lines,
    });
  }

  // Newest first so the current month's payment is at the top. On a date
  // tie, "Joined" sorts last (it happened before any same-day payment).
  return events.sort((a, b) => {
    const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (diff !== 0) return diff;
    if (a.type === "joined") return 1;
    if (b.type === "joined") return -1;
    return 0;
  });
}

type MetricRow = { measurement_date: string; weight_kg: number | null; body_fat_percentage: number | null };
type GoalRow = { id: string; title: string; category: string | null; unit: string | null; current_value: number | null; target_value: number | null; direction: string | null; status: string; target_date: string | null };

// Simple full-screen image viewer for the member photo.
function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  // Portal to <body> with pointer-events-auto + high z-index so it escapes the
  // parent dialog's stacking context (Radix DialogContent is portaled at z-50 and
  // sets body pointer-events:none). Without this the lightbox renders BEHIND the
  // open profile dialog and is unclickable.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-6 pointer-events-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-sidebar-border bg-white/[0.02] p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5" />
        <p className="text-[10px] font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-sm font-bold ${accent ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

function MemberTimelineDialog({ member, gymId, onClose }: { member: Member | null; gymId: string | null; onClose: () => void }) {
  const { gym } = useGymContext();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [payments, setPayments] = useState<TimelinePayment[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [metric, setMetric] = useState<MetricRow | null>(null);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [lightbox, setLightbox] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // Reset the photo lightbox on every open/close — the dialog component stays
    // mounted, so a leftover lightbox=true would otherwise reopen the image
    // instead of the profile next time.
    setLightbox(false);
    if (!member || !gymId) return;
    const m = member;
    setEvents([]); setPayments([]); setTotalPaid(0); setMetric(null); setGoals([]); setShowAll(false);
    setLoading(true);
    listMemberTimeline(m.id).then((res) => {
      if ("error" in res) {
        setEvents([]);
      } else {
        const pays = res.payments as TimelinePayment[];
        setPayments(pays);
        setEvents(buildTimeline(m, res.audit as AuditRow[], pays));
        setTotalPaid(pays.reduce((s, p) => s + Number(p.total_amount), 0));
        setMetric((res as { latestMetric?: MetricRow | null }).latestMetric ?? null);
        setGoals(((res as { goals?: GoalRow[] }).goals ?? []));
      }
      setLoading(false);
    });
  }, [member, gymId]);

  if (!member) return null;

  const currentPlan = (member as Member & { plan?: { name: string } | null }).plan;
  function openReceipt(paymentId: string) {
    const p = payments.find((x) => x.id === paymentId);
    if (!p) return;
    setInvoice({
      payment: p,
      memberName: member!.full_name,
      memberPhone: member!.phone,
      // Use the plan snapshotted on THIS payment, not the member's current
      // plan — so a past receipt reflects what they were on that month.
      planName: p.plan?.name ?? currentPlan?.name ?? null,
    });
  }

  const plan = (member as Member & { plan?: { name: string; color: string } | null }).plan;
  const planColor = plan?.color ?? "#6B7A99";
  const memberPlans = ((member as Member & { plans?: { plan?: { id: string; name: string } | null }[] }).plans ?? [])
    .map((pp) => pp.plan)
    .filter((p): p is { id: string; name: string } => !!p)
    .sort((a, b) => (a.id === member.plan_id ? -1 : b.id === member.plan_id ? 1 : 0));
  const planLabel = memberPlans.length ? memberPlans.map((p) => p.name).join(" + ") : (plan?.name ?? "—");
  const statusCfg = STATUS_CONFIG[member.status];
  const outstanding = Number(member.outstanding_balance) || 0;

  return (
    <>
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">{member.full_name} — Profile</DialogTitle>
        </DialogHeader>

        {/* ── Header: photo + identity ── */}
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => member.photo_url && setLightbox(true)}
            className={`w-20 h-20 rounded-2xl overflow-hidden border-2 border-sidebar-border flex items-center justify-center shrink-0 ${member.photo_url ? "cursor-zoom-in hover:border-primary/40 transition-colors" : ""}`}
            style={{ backgroundColor: `${planColor}22` }}
          >
            {member.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.photo_url} alt={member.full_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold" style={{ color: planColor }}>{member.full_name[0]?.toUpperCase() ?? "?"}</span>
            )}
          </button>
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="text-lg font-bold text-foreground leading-tight truncate">{member.full_name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${statusCfg.className}`}>
                <statusCfg.icon className="w-3 h-3" /> {statusCfg.label}
              </span>
              {member.member_number && <span className="text-xs text-muted-foreground font-mono">#{member.member_number}</span>}
            </div>
            {member.phone && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                <Phone className="w-3 h-3" /> {member.phone}
              </p>
            )}
          </div>
        </div>

        {/* ── Summary stats ── */}
        <div className="grid grid-cols-2 gap-2.5 mt-2">
          <StatCard icon={Clock} label="Member Since" value={member.join_date ? formatDate(member.join_date) : "—"} />
          <StatCard icon={Wallet} label="Outstanding" value={formatCurrency(outstanding)} accent={outstanding > 0 ? "text-rose-400" : "text-emerald-400"} />
          <StatCard icon={CreditCard} label={memberPlans.length > 1 ? "Plans" : "Plan"} value={planLabel} />
          <StatCard icon={CalendarX} label="Expires" value={member.plan_expiry_date ? formatDate(member.plan_expiry_date) : "—"} />
          <StatCard icon={CheckCircle2} label="Total Paid" value={formatCurrency(totalPaid)} accent="text-emerald-400" />
          {member.shift && (
            <StatCard icon={Clock} label="Gym Shift" value={SHIFT_LABELS[member.shift]} />
          )}
          {metric?.weight_kg != null && (
            <StatCard icon={Activity} label="Latest Weight" value={`${metric.weight_kg} kg${metric.body_fat_percentage != null ? ` · ${metric.body_fat_percentage}% BF` : ""}`} />
          )}
        </div>

        {/* ── Active goals ── */}
        {goals.length > 0 && (
          <div className="mt-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> Active Goals
            </p>
            <div className="space-y-2">
              {goals.map((g) => {
                const cur = g.current_value, tgt = g.target_value;
                return (
                  <div key={g.id} className="flex items-center justify-between rounded-lg border border-sidebar-border bg-white/[0.02] px-3 py-2">
                    <span className="text-sm text-foreground truncate">{g.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {cur != null ? cur : "—"}{tgt != null ? ` → ${tgt}` : ""}{g.unit ? ` ${g.unit}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Timeline ── */}
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> History
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">Loading…</div>
          ) : events.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">No history found</div>
          ) : (() => {
            const TIMELINE_LIMIT = 12;
            const visible = showAll ? events : events.slice(0, TIMELINE_LIMIT);
            const hidden = events.length - visible.length;
            return (
            <div className="relative pb-2">
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-sidebar-border" />
              <div className="space-y-0">
                {visible.map((ev, i) => {
                  const cfg = TIMELINE_ICONS[ev.type];
                  const isReceipt = ev.type === "payment";
                  return (
                    <div key={ev.id} className={`relative flex gap-4 ${i < visible.length - 1 ? "pb-5" : ""}`}>
                      <div className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border shrink-0 ${cfg.bg}`}>
                        <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0 pt-1.5">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{ev.title}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(ev.date)}</p>
                        </div>
                        {ev.lines ? (
                          <div className="mt-1 space-y-0.5">
                            {ev.lines.map((line, idx) => (
                              <p key={idx} className={`text-xs ${idx === 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                                {line}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>
                        )}
                        {isReceipt && (
                          <button
                            type="button"
                            onClick={() => openReceipt(ev.id)}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                          >
                            <CreditCard className="w-3 h-3" /> View receipt
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="ml-14 mt-1 text-xs font-medium text-primary hover:underline"
                >
                  Show older history ({hidden} more)
                </button>
              )}
              {showAll && events.length > TIMELINE_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAll(false)}
                  className="ml-14 mt-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  Show less
                </button>
              )}
            </div>
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>

    {lightbox && member.photo_url && (
      <ImageLightbox src={member.photo_url} alt={member.full_name} onClose={() => setLightbox(false)} />
    )}

    <InvoiceDialog
      data={invoice}
      gym={gym}
      onClose={() => setInvoice(null)}
    />
    </>
  );
}
