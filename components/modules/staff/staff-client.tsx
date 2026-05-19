"use client";
import { useState, useMemo, useEffect } from "react";
import {
  Plus, Search, Edit2, Trash2, UserCog, Wallet,
  CheckCircle2, Clock, Users, TrendingDown, Star,
  KeyRound, UserX, ArrowRightLeft,
} from "lucide-react";
import { createTrainerLogin, removeTrainerLogin, transferTrainerClients, deleteStaffMember } from "@/app/actions/trainer";
import { resetStaffPassword } from "@/app/actions/account";
import { revalidateSmartEarn, revalidateDashboard } from "@/app/actions/revalidate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useGymContext } from "@/contexts/gym-context";
import { formatCurrency, formatDate, formatDateInput } from "@/lib/utils";
import { validateFullName, validateCNIC, validatePakPhone, validateMoney, runValidators } from "@/lib/validation";
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  permissionsForRole,
  type PermissionKey,
} from "@/lib/permissions";
import type { Staff, StaffRole, StaffStatus, SalaryPayment, PaymentMethod, TrainerShift } from "@/types";

const ROLES: { value: StaffRole; label: string; icon: string }[] = [
  { value: "trainer",   label: "Trainer",    icon: "💪" },
  { value: "manager",   label: "Manager",    icon: "👔" },
  { value: "frontdesk", label: "Front Desk", icon: "🖥️" },
  { value: "cleaner",   label: "Cleaner",    icon: "🧹" },
  { value: "guard",     label: "Guard",      icon: "🛡️" },
  { value: "cook",      label: "Cook",       icon: "👨‍🍳" },
  { value: "other",     label: "Other",      icon: "👤" },
];

const QUICK_STAFF: { label: string; role: StaffRole }[] = [
  { label: "Personal Trainer",   role: "trainer"   },
  { label: "Head Trainer",       role: "trainer"   },
  { label: "Fitness Coach",      role: "trainer"   },
  { label: "Yoga Instructor",    role: "trainer"   },
  { label: "Gym Manager",        role: "manager"   },
  { label: "Branch Manager",     role: "manager"   },
  { label: "Receptionist",       role: "frontdesk" },
  { label: "Front Desk Staff",   role: "frontdesk" },
  { label: "Cleaner",            role: "cleaner"   },
  { label: "Housekeeping",       role: "cleaner"   },
  { label: "Security Guard",     role: "guard"     },
  { label: "Night Guard",        role: "guard"     },
  { label: "Cafeteria Cook",     role: "cook"      },
  { label: "Nutritionist",       role: "other"     },
  { label: "Physiotherapist",    role: "other"     },
];

const ROLE_CHIP: Record<StaffRole, string> = {
  trainer:   "bg-primary/10   border-primary/25   text-primary   hover:bg-primary/20",
  manager:   "bg-purple-500/10 border-purple-500/25 text-purple-400 hover:bg-purple-500/20",
  frontdesk: "bg-cyan-500/10  border-cyan-500/25  text-cyan-400  hover:bg-cyan-500/20",
  cleaner:   "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20",
  guard:     "bg-blue-500/10  border-blue-500/25  text-blue-400  hover:bg-blue-500/20",
  cook:      "bg-orange-500/10 border-orange-500/25 text-orange-400 hover:bg-orange-500/20",
  other:     "bg-white/5       border-white/10      text-muted-foreground hover:bg-white/10",
};

const roleConfig: Record<StaffRole, { label: string; icon: string; color: string }> = {
  trainer:   { label: "Trainer",    icon: "💪", color: "text-primary" },
  manager:   { label: "Manager",    icon: "👔", color: "text-purple-400" },
  frontdesk: { label: "Front Desk", icon: "🖥️", color: "text-cyan-400" },
  cleaner:   { label: "Cleaner",    icon: "🧹", color: "text-emerald-400" },
  guard:     { label: "Guard",      icon: "🛡️", color: "text-blue-400" },
  cook:      { label: "Cook",       icon: "👨‍🍳", color: "text-orange-400" },
  other:     { label: "Other",      icon: "👤", color: "text-muted-foreground" },
};

const methodLabels: Record<PaymentMethod, string> = {
  cash: "Cash", bank_transfer: "Bank Transfer",
  jazzcash: "JazzCash", easypaisa: "Easypaisa",
  card: "Card", other: "Other",
};

const emptyForm = {
  full_name: "", role: "other" as StaffRole, specialization: "", phone: "", cnic: "",
  join_date: formatDateInput(new Date()), monthly_salary: "",
  commission_percentage: "0", commission_floor: "0",
  member_capacity: "20",
  status: "active" as StaffStatus, notes: "",
  can_add_members: false,
  permissions: [] as PermissionKey[],
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function genReceipt(name: string, month: string) {
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return `SAL-${month.replace("-", "")}-${initials}-${Math.floor(Math.random() * 900 + 100)}`;
}

interface Props {
  gymId: string | null;
  gymName?: string | null;
  staff: Staff[];
  salaryPayments: SalaryPayment[];
  mode?: "trainers" | "staff" | "all";
}

function buildUsername(fullName: string, gymName: string | null | undefined, existingEmails: string[]): string {
  const first = fullName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  const initials = gymName
    ? gymName.trim().split(/\s+/).map((w) => w[0]).join("").toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
  const base = initials ? `${first}.${initials}` : first;
  const taken = new Set(existingEmails.map((e) => e.replace("@musabkhan.me", "")));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${first}${n}.${initials || first}`)) n++;
  return `${first}${n}.${initials || ""}`.replace(/\.$/, "");
}

export function StaffClient({ gymId, gymName, staff: initialStaff, salaryPayments: initialPayments, mode = "all" }: Props) {
  const { isDemo } = useGymContext();
  const isTrainersMode = mode === "trainers";
  const isStaffMode = mode === "staff";
  const pageTitle = isTrainersMode ? "Trainers" : isStaffMode ? "Staff" : "Staff & Trainers";
  const pageSubtitle = isTrainersMode
    ? "Manage trainers, commissions, and logins"
    : isStaffMode
    ? "Manage non-trainer staff and salary payments"
    : "Manage gym staff and salary payments";
  const totalLabel = isTrainersMode ? "Total Trainers" : "Total Staff";
  const addButtonLabel = isTrainersMode ? "Add Trainer" : "Add Staff";
  // ── Staff state ───────────────────────────────────────────
  const [staff, setStaff] = useState(initialStaff);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ── Trainer shifts state ──────────────────────────────────
  // shifts keyed by staff_id
  const [shifts, setShifts] = useState<Record<string, TrainerShift[]>>({});
  const [shiftForm, setShiftForm] = useState({ name: "", start_time: "", end_time: "", commission_type: "percentage" as "percentage" | "flat", commission_value: "" });
  const [shiftSaving, setShiftSaving] = useState(false);

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

  function reloadShifts() {
    if (!gymId) return;
    createClient().from("pulse_trainer_shifts").select("*").eq("gym_id", gymId)
      .then(({ data }) => {
        if (!data) return;
        const grouped: Record<string, TrainerShift[]> = {};
        data.forEach((s: TrainerShift) => { (grouped[s.staff_id] ??= []).push(s); });
        setShifts(grouped);
      });
  }

  async function handleAddShift() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!editing || !gymId || !shiftForm.name || !shiftForm.start_time || !shiftForm.end_time) return;
    setShiftSaving(true);
    const { error } = await createClient().from("pulse_trainer_shifts").insert({
      staff_id: editing.id,
      gym_id: gymId,
      name: shiftForm.name,
      start_time: shiftForm.start_time,
      end_time: shiftForm.end_time,
      commission_type: shiftForm.commission_type,
      commission_value: parseFloat(shiftForm.commission_value) || 0,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else {
      setShiftForm({ name: "", start_time: "", end_time: "", commission_type: "percentage", commission_value: "" });
      reloadShifts();
    }
    setShiftSaving(false);
  }

  async function handleDeleteShift(shiftId: string) {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    await createClient().from("pulse_trainer_shifts").delete().eq("id", shiftId);
    reloadShifts();
  }

  // ── Trainer login state ───────────────────────────────────
  const [loginDialog, setLoginDialog] = useState<Staff | null>(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "", phone: "" });
  const [loginSaving, setLoginSaving] = useState(false);
  const [loginCreated, setLoginCreated] = useState<{ email: string; password: string; phone: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Staff | null>(null);
  const [transferTarget, setTransferTarget] = useState<Staff | null>(null);

  // ── Reset staff password ──────────────────────────────────
  const [resetTarget, setResetTarget] = useState<Staff | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetPwSaving, setResetPwSaving] = useState(false);
  const [resetPwDone, setResetPwDone] = useState<{ email: string; password: string; phone: string } | null>(null);

  async function handleResetPassword() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!resetTarget?.user_id || !resetPw) return;
    setResetPwSaving(true);
    const res = await resetStaffPassword(resetTarget.user_id, resetPw);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else setResetPwDone({ email: resetTarget.email ?? "", password: resetPw, phone: resetTarget.phone ?? "" });
    setResetPwSaving(false);
  }

  function closeResetDialog() {
    setResetTarget(null);
    setResetPw("");
    setResetPwDone(null);
  }

  async function handleCreateLogin() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!loginDialog || !loginForm.username || !loginForm.password) return;
    setLoginSaving(true);
    const email = `${loginForm.username.trim().toLowerCase()}@musabkhan.me`;
    const result = await createTrainerLogin(loginDialog.id, email, loginForm.password);
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      setLoginCreated({ email, password: loginForm.password, phone: loginForm.phone });
      reloadStaff();
    }
    setLoginSaving(false);
  }

  function closeLoginDialog() {
    setLoginDialog(null);
    setLoginCreated(null);
    setLoginForm({ username: "", password: "", phone: "" });
  }

  async function handleRemoveLogin(s: Staff) {
    const result = await removeTrainerLogin(s.id);
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "Login removed" });
      setRemoveTarget(null);
      reloadStaff();
    }
  }

  // ── Salary state ──────────────────────────────────────────
  const [salaryPayments, setSalaryPayments] = useState(initialPayments);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("staff");
  const [payDialog, setPayDialog] = useState<SalaryPayment | null>(null);
  const [payForm, setPayForm] = useState({ method: "cash" as PaymentMethod, date: formatDateInput(new Date()), notes: "", receipt: "" });
  const [paying, setPaying] = useState(false);

  // ── Data helpers ──────────────────────────────────────────
  async function reloadStaff() {
    if (!gymId) return;
    const supabase = createClient();
    const { data } = await supabase.from("pulse_staff").select("*").eq("gym_id", gymId).order("full_name");
    setStaff((data as Staff[]) ?? []);
    // Smart-earn (Profit Insights) reads trainer commission/capacity — invalidate its cache.
    revalidateSmartEarn().catch(() => {});
  }

  async function reloadSalaries(month: string) {
    if (!gymId) return;
    const supabase = createClient();
    const { data } = await supabase.from("pulse_salary_payments")
      .select("*, staff:pulse_staff(full_name, role)")
      .eq("gym_id", gymId).eq("for_month", month)
      .order("created_at", { ascending: false });
    setSalaryPayments((prev) => {
      const others = prev.filter((p) => p.for_month !== month);
      return [...others, ...((data as SalaryPayment[]) ?? [])];
    });
  }

  // ── Staff CRUD ────────────────────────────────────────────
  const defaultRole: StaffRole = isTrainersMode ? "trainer" : isStaffMode ? "manager" : "other";
  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, role: defaultRole, permissions: permissionsForRole(defaultRole) });
    setDialogOpen(true);
  }
  function quickStaff(item: { label: string; role: StaffRole }) {
    setEditing(null);
    setForm({ ...emptyForm, full_name: item.label, role: item.role, permissions: permissionsForRole(item.role) });
    setDialogOpen(true);
  }
  function openEdit(s: Staff) {
    setEditing(s);
    setForm({
      full_name: s.full_name,
      role: s.role,
      specialization: s.specialization ?? "",
      phone: s.phone ?? "",
      cnic: s.cnic ?? "",
      join_date: s.join_date,
      monthly_salary: s.monthly_salary.toString(),
      commission_percentage: s.commission_percentage.toString(),
      commission_floor: (s.commission_floor ?? 0).toString(),
      member_capacity: (s.member_capacity ?? 20).toString(),
      status: s.status,
      notes: s.notes ?? "",
      can_add_members: s.can_add_members ?? false,
      permissions: ((s.permissions ?? []) as PermissionKey[]),
    });
    setDialogOpen(true);
  }

  // When the role changes in the dialog, auto-replace the permission set
  // with that role's defaults. Trainers don't use the permissions array
  // (they use can_add_members), so we always reset to [] for trainers.
  function handleRoleChange(nextRole: StaffRole) {
    setForm((prev) => ({
      ...prev,
      role: nextRole,
      permissions: nextRole === "trainer" ? [] : permissionsForRole(nextRole),
    }));
  }

  function togglePermission(key: PermissionKey) {
    setForm((prev) => {
      const has = prev.permissions.includes(key);
      return {
        ...prev,
        permissions: has
          ? prev.permissions.filter((k) => k !== key)
          : [...prev.permissions, key],
      };
    });
  }

  function setGroupPermissions(keys: PermissionKey[], enabled: boolean) {
    setForm((prev) => {
      const remaining = prev.permissions.filter((k) => !keys.includes(k as PermissionKey));
      return {
        ...prev,
        permissions: enabled ? [...remaining, ...keys] : remaining,
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
      validateMoney(form.monthly_salary, "Base salary"),
    );
    if (!check.ok) {
      toast({ title: "Check the form", description: check.message, variant: "destructive" });
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      gym_id: gymId,
      full_name: form.full_name,
      role: form.role,
      specialization: form.specialization || null,
      phone: form.phone || null,
      cnic: form.cnic || null,
      join_date: form.join_date,
      monthly_salary: parseFloat(form.monthly_salary) || 0,
      commission_percentage: parseFloat(form.commission_percentage) || 0,
      commission_floor: parseFloat(form.commission_floor) || 0,
      member_capacity: Math.max(1, parseInt(form.member_capacity) || 20),
      status: form.status,
      notes: form.notes || null,
      can_add_members: form.can_add_members,
      // Trainers don't use the permissions array — they keep can_add_members.
      // For all other roles, persist the granular RBAC selection.
      permissions: form.role === "trainer" ? [] : (form.permissions ?? []),
    };
    const { error } = editing
      ? await supabase.from("pulse_staff").update(payload).eq("id", editing.id)
      : await supabase.from("pulse_staff").insert(payload);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: editing ? "Updated" : "Staff added" });
      setDialogOpen(false);
      reloadStaff();
      revalidateDashboard().catch(() => {});
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    const result = await deleteStaffMember(id);
    if (result.blocked === "has_members") {
      toast({
        title: "Cannot delete — trainer has active members",
        description: `${result.activeCount} active member(s) still assigned. Use "Transfer" to reassign them first.`,
        variant: "destructive",
      });
    } else if (result.blocked === "has_salary_history") {
      toast({
        title: "Cannot delete — salary history exists",
        description: "This staff member has salary records. Set them to Inactive instead to preserve financial history.",
        variant: "destructive",
      });
    } else if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "Deleted" });
      reloadStaff();
    }
  }

  // ── Salary actions ────────────────────────────────────────
  // Runs silently — no button, no toast. Called automatically when the
  // Salaries tab opens or the selected month changes.
  async function ensureSalariesExist(month: string) {
    const active = staff.filter((s) => s.status === "active");
    if (!active.length || !gymId) return;
    setGenerating(true);
    const supabase = createClient();

    const [{ data: existing }, { data: activeMembers }, { data: allShifts }] = await Promise.all([
      supabase.from("pulse_salary_payments").select("staff_id").eq("gym_id", gymId).eq("for_month", month),
      supabase.from("pulse_members").select("assigned_trainer_id,monthly_fee,monthly_discount,assigned_shift_id").eq("gym_id", gymId).eq("status", "active"),
      supabase.from("pulse_trainer_shifts").select("*").eq("gym_id", gymId),
    ]);

    const existingIds = new Set((existing ?? []).map((r) => r.staff_id));
    const members = activeMembers ?? [];
    const shiftMap = Object.fromEntries((allShifts ?? []).map((sh: TrainerShift) => [sh.id, sh]));

    const rows = active
      .filter((s) => !existingIds.has(s.id))
      .map((s) => {
        let commissionAmount = 0;
        if (s.role === "trainer") {
          const myMembers = members.filter((m) => m.assigned_trainer_id === s.id);
          commissionAmount = myMembers.reduce((sum, m) => {
            const fee = Number(m.monthly_fee);
            const discount = Number((m as { monthly_discount?: number }).monthly_discount ?? 0);
            // Discount split equally between gym floor and trainer base.
            const netFee = Math.max(0, fee - s.commission_floor - discount / 2);
            const shift = m.assigned_shift_id ? shiftMap[m.assigned_shift_id] : null;
            if (shift) {
              return sum + (shift.commission_type === "flat" ? shift.commission_value : Math.round(netFee * shift.commission_value / 100));
            }
            return sum + (s.commission_percentage > 0 ? Math.round(netFee * s.commission_percentage / 100) : 0);
          }, 0);
        }
        return {
          gym_id: gymId,
          staff_id: s.id,
          for_month: month,
          base_salary: s.monthly_salary,
          commission_amount: commissionAmount,
          pt_earnings: 0,
          total_amount: s.monthly_salary + commissionAmount,
          status: "pending",
        };
      });

    if (rows.length > 0) {
      const { error } = await supabase.from("pulse_salary_payments").insert(rows);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else await reloadSalaries(month);
    }
    setGenerating(false);
  }

  async function handleTabChange(tab: string) {
    if (tab === "salaries") {
      // Set generating=true BEFORE switching tabs so the salaries tab renders in
      // its "loading" state from the very first paint — no empty→list reflow.
      setGenerating(true);
      setActiveTab(tab);
      await reloadSalaries(selectedMonth);
      await ensureSalariesExist(selectedMonth);
      setGenerating(false); // safety: clears spinner if ensureSalariesExist early-returned (zero active staff)
    } else {
      setActiveTab(tab);
    }
  }

  async function handleMonthChange(month: string) {
    setSelectedMonth(month);
    await reloadSalaries(month);
    if (activeTab === "salaries") await ensureSalariesExist(month);
  }

  function openPay(p: SalaryPayment) {
    setPayDialog(p);
    setPayForm({ method: "cash", date: formatDateInput(new Date()), notes: "", receipt: genReceipt(p.staff?.full_name ?? "", p.for_month) });
  }

  async function handlePay() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!payDialog) return;
    setPaying(true);
    const supabase = createClient();
    const { error } = await supabase.from("pulse_salary_payments").update({
      status: "paid",
      payment_method: payForm.method,
      payment_date: payForm.date,
      notes: payForm.notes || null,
      receipt_number: payForm.receipt,
    }).eq("id", payDialog.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Salary paid" });
      setPayDialog(null);
      await reloadSalaries(selectedMonth);
      revalidateDashboard().catch(() => {});
    }
    setPaying(false);
  }

  // ── Derived ───────────────────────────────────────────────
  // Restrict the visible list to the page's mode (trainers-only / staff-only / all)
  const visibleStaff = useMemo(() => {
    if (isTrainersMode) return staff.filter((s) => s.role === "trainer");
    if (isStaffMode)    return staff.filter((s) => s.role !== "trainer");
    return staff;
  }, [staff, isTrainersMode, isStaffMode]);

  const filteredStaff = useMemo(() => {
    const q = search.toLowerCase();
    return visibleStaff.filter((s) => s.full_name.toLowerCase().includes(q) || s.role.includes(q));
  }, [search, visibleStaff]);

  const visibleStaffIds = useMemo(() => new Set(visibleStaff.map((s) => s.id)), [visibleStaff]);
  const monthPayments = useMemo(
    () => salaryPayments.filter((p) => p.for_month === selectedMonth && (mode === "all" || (p.staff_id && visibleStaffIds.has(p.staff_id)))),
    [salaryPayments, selectedMonth, mode, visibleStaffIds]
  );

  const visibleQuickStaff = useMemo(() => {
    if (isTrainersMode) return QUICK_STAFF.filter((q) => q.role === "trainer");
    if (isStaffMode)    return QUICK_STAFF.filter((q) => q.role !== "trainer");
    return QUICK_STAFF;
  }, [isTrainersMode, isStaffMode]);

  const visibleRoles = useMemo(() => {
    if (isTrainersMode) return ROLES.filter((r) => r.value === "trainer");
    if (isStaffMode)    return ROLES.filter((r) => r.value !== "trainer");
    return ROLES;
  }, [isTrainersMode, isStaffMode]);

  const stats = useMemo(() => {
    const active = visibleStaff.filter((s) => s.status === "active");
    const payroll = active.reduce((s, e) => s + Number(e.monthly_salary), 0);
    const paid = monthPayments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
    const pending = monthPayments.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.total_amount), 0);
    return { total: visibleStaff.length, active: active.length, payroll, paid, pending };
  }, [visibleStaff, monthPayments]);

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight">{pageTitle}</h1>
          <p className="text-muted-foreground text-sm mt-1">{pageSubtitle}</p>
        </div>
        <Button onClick={openAdd} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" /> {addButtonLabel}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: totalLabel,        value: stats.total,                  icon: Users,        color: "text-blue-400",   bg: "bg-blue-500/10 border border-blue-500/20" },
          { label: "Monthly Payroll", value: formatCurrency(stats.payroll), icon: TrendingDown, color: "text-primary",    bg: "bg-primary/10 border border-primary/20" },
          { label: "Paid This Month", value: formatCurrency(stats.paid),    icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20" },
          { label: "Pending",         value: formatCurrency(stats.pending), icon: Clock,        color: "text-rose-400",   bg: "bg-rose-500/10 border border-rose-500/20" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${bg}`}><Icon className={`w-4 h-4 ${color}`} /></div>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList>
          <TabsTrigger value="staff"><Users className="w-3.5 h-3.5 mr-1.5" />Staff</TabsTrigger>
          <TabsTrigger value="salaries"><Wallet className="w-3.5 h-3.5 mr-1.5" />Salaries</TabsTrigger>
        </TabsList>

        {/* ── Staff tab ──────────────────────────────── */}
        <TabsContent value="staff" className="space-y-4">
          {/* Quick Add */}
          <div className="rounded-2xl border border-sidebar-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Add</p>
              <span className="text-xs text-muted-foreground/50">— tap to pre-fill the form</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {visibleQuickStaff.map((item) => (
                <button
                  key={item.label}
                  onClick={() => quickStaff(item)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${ROLE_CHIP[item.role]}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          {filteredStaff.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <UserCog className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium">{search ? "No staff match" : "No staff yet"}</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y divide-sidebar-border">
                {filteredStaff.map((member) => {
                  const rc = roleConfig[member.role];
                  const isTrainer = member.role === "trainer";
                  // Roles that get a login account (trainer/manager/frontdesk).
                  // Cleaner/guard/cook/other don't need app access by default.
                  const canHaveLogin = (["trainer", "manager", "frontdesk"] as const).includes(member.role as "trainer" | "manager" | "frontdesk");
                  return (
                    <div key={member.id} className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                      {/* Avatar */}
                      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/5 border border-sidebar-border text-sm font-semibold shrink-0">
                        {rc.icon}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{member.full_name}</p>
                          {isTrainer ? (
                            <Badge className="text-xs bg-primary/10 border border-primary/25 text-primary hover:bg-primary/20 gap-1">
                              <Star className="w-2.5 h-2.5" /> Trainer
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className={`text-xs capitalize ${rc.color}`}>{rc.label}</Badge>
                          )}
                          {member.status === "inactive" && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {member.specialization && <span className="text-xs text-primary/80">{member.specialization}</span>}
                          {member.phone && <span className="text-xs text-muted-foreground">{member.phone}</span>}
                          {member.cnic && <span className="text-xs text-muted-foreground">{member.cnic}</span>}
                          <span className="text-xs text-muted-foreground">Joined: {formatDate(member.join_date)}</span>
                        </div>
                      </div>
                      {/* Salary */}
                      <div className="text-right shrink-0 hidden sm:block">
                        <p className="text-sm font-semibold">{formatCurrency(member.monthly_salary)}</p>
                        <p className="text-xs text-muted-foreground">/month</p>
                        {isTrainer && member.commission_percentage > 0 && (
                          <p className="text-xs text-primary/70">{member.commission_percentage}% commission</p>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="flex gap-1 shrink-0">
                        {isTrainer && visibleStaff.some((t) => t.id !== member.id && t.role === "trainer" && t.status === "active") && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-8 text-xs gap-1 text-amber-400 hover:text-amber-400 hover:bg-amber-500/10"
                            onClick={() => setTransferTarget(member)}
                            title="Transfer all clients to another trainer"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Transfer</span>
                          </Button>
                        )}
                        {canHaveLogin && (
                          <>
                            {/* Single adaptive button: "Add Login" when no account, "Reset PW" when one exists.
                                Keeps column width identical across rows. */}
                            <Button
                              variant="ghost" size="sm"
                              className="h-8 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                              onClick={() => {
                                if (member.user_id) {
                                  setResetTarget(member); setResetPw(""); setResetPwDone(null);
                                } else {
                                  const existingEmails = staff.map((s) => s.email ?? "").filter(Boolean);
                                  const username = member.email
                                    ? member.email.replace("@musabkhan.me", "")
                                    : buildUsername(member.full_name, gymName, existingEmails);
                                  setLoginDialog(member);
                                  setLoginForm({ username, password: "", phone: member.phone ?? "" });
                                }
                              }}
                              title={member.user_id ? "Reset password" : "Create login"}
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{member.user_id ? "Reset PW" : "Add Login"}</span>
                            </Button>
                            {/* Revoke: invisible (not hidden) when no login so it still occupies space → salary column stays aligned */}
                            <Button
                              variant="ghost" size="sm"
                              className={`h-8 text-xs gap-1 text-rose-400 hover:text-rose-400 hover:bg-rose-500/10 ${!member.user_id ? "invisible pointer-events-none" : ""}`}
                              onClick={() => setRemoveTarget(member)}
                              title="Revoke login access"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Revoke</span>
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(member)}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(member.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Salaries tab ───────────────────────────────── */}
        <TabsContent value="salaries" className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Input type="month" value={selectedMonth} onChange={(e) => handleMonthChange(e.target.value)} className="w-auto" />
            {generating && (
              <span className="text-xs text-muted-foreground animate-pulse">Calculating salaries…</span>
            )}
            {!generating && monthPayments.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                {monthPayments.filter((p) => p.status === "paid").length}/{monthPayments.length} paid
              </span>
            )}
          </div>

          {monthPayments.length === 0 && generating ? (
            /* Skeleton rows — same height as real rows — so there is no layout
               shift when the actual salary list arrives after the async calls. */
            <Card>
              <CardContent className="p-0 divide-y divide-sidebar-border">
                {Array.from(
                  { length: Math.max(visibleStaff.filter((s) => s.status === "active").length, 3) },
                  (_, i) => i
                ).map((i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3">
                    <div className="w-7 h-7 rounded-full bg-white/5 animate-pulse shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="h-3.5 w-32 rounded bg-white/5 animate-pulse" />
                      <div className="h-3 w-20 rounded bg-white/5 animate-pulse" />
                    </div>
                    <div className="text-right shrink-0 space-y-1.5">
                      <div className="h-3.5 w-16 rounded bg-white/5 animate-pulse ml-auto" />
                      <div className="h-3 w-10 rounded bg-white/5 animate-pulse ml-auto" />
                    </div>
                    <div className="h-8 w-14 rounded bg-white/5 animate-pulse shrink-0" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : monthPayments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Wallet className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium">No active staff this month</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y divide-sidebar-border">
                {monthPayments.map((p) => {
                  const role = (p.staff?.role ?? "other") as StaffRole;
                  const rc = roleConfig[role];
                  const isPaid = p.status === "paid";
                  return (
                    <div key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                      <span className="text-lg shrink-0">{rc.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{p.staff?.full_name ?? "—"}</p>
                          <Badge variant="secondary" className={`text-xs ${rc.color}`}>{rc.label}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                          {Number(p.commission_amount) > 0 && <span>Commission: {formatCurrency(p.commission_amount)}</span>}
                          {Number(p.pt_earnings) > 0 && <span>PT: {formatCurrency(p.pt_earnings)}</span>}
                        </div>
                        {isPaid && p.payment_date && (
                          <p className="text-xs text-muted-foreground mt-0.5">Paid {formatDate(p.payment_date)} · {p.receipt_number}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{formatCurrency(p.total_amount)}</p>
                        <p className={`text-xs font-medium ${isPaid ? "text-emerald-400" : "text-primary"}`}>
                          {isPaid ? "Paid" : "Pending"}
                        </p>
                      </div>
                      {!isPaid && (
                        <Button
                          size="sm"
                          className="h-8 text-xs gap-1 shrink-0 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                          variant="ghost"
                          onClick={() => openPay(p)}
                        >
                          <CheckCircle2 className="w-3 h-3" /> Pay
                        </Button>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete staff member?"
        description="Login access will be revoked. Blocked if active members are assigned or salary history exists."
        onConfirm={() => { const id = deleteId; if (id) { handleDelete(id); setDeleteId(null); } }}
        onCancel={() => setDeleteId(null)}
      />

      {/* ── Add / Edit Staff Dialog ───────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg flex flex-col gap-0 max-h-[90dvh] p-0">
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-sidebar-border">
            <DialogTitle>
              {editing ? `Edit ${isTrainersMode ? "Trainer" : "Staff"}` : addButtonLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 px-6 overflow-y-auto flex-1 min-h-0">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Full Name *</Label>
                <Input placeholder="Ahmed Khan" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => handleRoleChange(v as StaffRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {visibleRoles.map((r) => <SelectItem key={r.value} value={r.value}>{r.icon} {r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as StaffStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.role === "trainer" && (
              <div className="space-y-1.5">
                <Label>Specialization</Label>
                <Input placeholder="e.g. Strength & Conditioning, Yoga, Cardio…" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Phone</Label><Input placeholder="+92 300 0000000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>CNIC</Label><Input placeholder="00000-0000000-0" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Base Salary (PKR) *</Label><Input type="number" placeholder="0" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Join Date</Label><Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Commission %</Label>
                <Input type="number" placeholder="0" value={form.commission_percentage} onChange={(e) => setForm({ ...form, commission_percentage: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Gym Fee (PKR)</Label>
                <Input type="number" placeholder="0" value={form.commission_floor} onChange={(e) => setForm({ ...form, commission_floor: e.target.value })} />
                <p className="text-[11px] text-muted-foreground leading-snug">Gym&apos;s share kept off the top. Commission % applies to whatever remains of the member fee.</p>
              </div>
            </div>
            {form.role === "trainer" && (
              <div className="space-y-1.5">
                <Label>Max Members Capacity</Label>
                <Input type="number" placeholder="20" min="1" value={form.member_capacity} onChange={(e) => setForm({ ...form, member_capacity: e.target.value })} />
                <p className="text-[11px] text-muted-foreground leading-snug">Used in Profit Insights to calculate realistic opportunity gain.</p>
              </div>
            )}
            <div className="space-y-1.5"><Label>Notes</Label><Textarea placeholder="Optional…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>

            {/* ── Shifts (trainers only, when editing) ─── */}
            {form.role === "trainer" && editing && (
              <div className="rounded-lg border border-sidebar-border bg-white/[0.02] p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shifts</p>
                <p className="text-[11px] text-muted-foreground leading-snug">Each shift can have its own commission rate. Members assigned to a shift use that rate instead of the default above.</p>

                {/* Existing shifts */}
                {(shifts[editing.id] ?? []).map((sh) => (
                  <div key={sh.id} className="flex items-center justify-between gap-2 rounded-md border border-sidebar-border bg-card px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{sh.name}</p>
                      <p className="text-xs text-muted-foreground">{sh.start_time.slice(0, 5)} – {sh.end_time.slice(0, 5)} · {sh.commission_type === "flat" ? `PKR ${sh.commission_value}` : `${sh.commission_value}%`}</p>
                    </div>
                    <button type="button" onClick={() => handleDeleteShift(sh.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {/* Add shift inline form */}
                <div className="space-y-2 pt-1 border-t border-sidebar-border">
                  <p className="text-xs text-muted-foreground font-medium">Add Shift</p>
                  <Input placeholder="Shift name (e.g. Morning)" value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><p className="text-[11px] text-muted-foreground">Start</p><Input type="time" value={shiftForm.start_time} onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })} /></div>
                    <div className="space-y-1"><p className="text-[11px] text-muted-foreground">End</p><Input type="time" value={shiftForm.end_time} onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={shiftForm.commission_type} onValueChange={(v) => setShiftForm({ ...shiftForm, commission_type: v as "percentage" | "flat" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage %</SelectItem>
                        <SelectItem value="flat">Flat (PKR)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" placeholder={shiftForm.commission_type === "flat" ? "PKR amount" : "e.g. 30"} value={shiftForm.commission_value} onChange={(e) => setShiftForm({ ...shiftForm, commission_value: e.target.value })} />
                  </div>
                  <Button size="sm" variant="outline" className="w-full" onClick={handleAddShift} disabled={shiftSaving || !shiftForm.name || !shiftForm.start_time || !shiftForm.end_time}>
                    {shiftSaving ? "Saving…" : "+ Add Shift"}
                  </Button>
                </div>
              </div>
            )}

            {/* Permissions */}
            {form.role === "trainer" ? (
              <div className="rounded-lg border border-sidebar-border bg-white/[0.02] p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permissions</p>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" checked={form.can_add_members}
                    onChange={(e) => setForm({ ...form, can_add_members: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded border-sidebar-border bg-card accent-primary cursor-pointer" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Onboard new members</p>
                    <p className="text-xs text-muted-foreground">Allow this trainer to add new clients from their portal when you&apos;re absent.</p>
                  </div>
                </label>
                <p className="text-[11px] text-muted-foreground leading-snug pt-1 border-t border-sidebar-border">
                  Trainers use the dedicated trainer portal. Granular role permissions only apply to non-trainer staff.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-sidebar-border bg-white/[0.02] p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permissions</p>
                  <span className="text-[10px] text-muted-foreground/70">{form.permissions.length} enabled</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Auto-set based on role. Uncheck to restrict access. Changes apply on save.
                </p>
                {PERMISSION_GROUPS.map((group) => {
                  const enabledInGroup = group.keys.filter((k) => form.permissions.includes(k)).length;
                  const allOn = enabledInGroup === group.keys.length;
                  const noneOn = enabledInGroup === 0;
                  return (
                    <div key={group.label} className="space-y-1.5 pt-2 border-t border-sidebar-border first:border-t-0 first:pt-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">{group.label}</p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setGroupPermissions(group.keys, true)}
                            disabled={allOn}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-sidebar-border text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setGroupPermissions(group.keys, false)}
                            disabled={noneOn}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-sidebar-border text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            None
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {group.keys.map((key) => (
                          <label key={key} className="flex items-start gap-2.5 cursor-pointer group py-0.5">
                            <input
                              type="checkbox"
                              checked={form.permissions.includes(key)}
                              onChange={() => togglePermission(key)}
                              className="mt-0.5 w-3.5 h-3.5 rounded border-sidebar-border bg-card accent-primary cursor-pointer shrink-0"
                            />
                            <span className="text-xs text-foreground/90 leading-snug group-hover:text-foreground">
                              {PERMISSIONS[key]}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-4 shrink-0 border-t border-sidebar-border">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.full_name || !form.monthly_salary}>
              {saving ? "Saving…" : editing ? "Update" : "Add Staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Staff Login Dialog (trainers + manager + frontdesk) ── */}
      <Dialog open={!!loginDialog} onOpenChange={(o) => !o && closeLoginDialog()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{loginCreated ? "Login Created" : `Create Login — ${loginDialog?.full_name}`}</DialogTitle>
          </DialogHeader>

          {loginCreated ? (
            /* ── Step 2: Success + Share ── */
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2.5 text-xs text-green-400">
                Login created successfully for <span className="font-medium">{loginDialog?.full_name}</span>. Share credentials via WhatsApp.
              </div>
              <div className="rounded-lg border border-input bg-muted/30 px-3 py-2.5 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-mono font-medium">{loginCreated.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Password</span>
                  <span className="font-mono font-medium">{loginCreated.password}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const digits = loginCreated.phone.replace(/\D/g, "");
                  const intl = digits.startsWith("0") ? "92" + digits.slice(1) : digits;
                  const msg = `Hi ${loginDialog?.full_name}! 👋\n\nYour login credentials for *Pulse GMS*:\n\n🔗 Login: ${window.location.origin}/login\n📧 Email: ${loginCreated.email}\n🔑 Password: ${loginCreated.password}\n\nPlease save these credentials safely.`;
                  const url = intl
                    ? `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`
                    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                  window.open(url, "_blank");
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] text-sm font-medium hover:bg-[#25D366]/20 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Send via WhatsApp
              </button>
              <DialogFooter>
                <Button className="w-full" onClick={closeLoginDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            /* ── Step 1: Form ── */
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5 text-xs text-muted-foreground">
                {loginDialog?.role === "trainer"
                  ? "This trainer will be able to log in and mark payments for their assigned members only."
                  : loginDialog?.role === "manager"
                  ? "This manager will be able to log in. Access is controlled by the permissions you set on their profile."
                  : loginDialog?.role === "frontdesk"
                  ? "This receptionist will be able to log in. They can add members, leads, and receive payments based on the permissions you set."
                  : "This staff member will be able to log in. Access is controlled by their role and permissions."}
              </div>
              <div className="space-y-1.5">
                <Label>Username *</Label>
                <div className="flex items-center rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                  <Input
                    type="text"
                    placeholder="ahmed.trainer"
                    value={loginForm.username}
                    onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value.replace(/\s/g, "").toLowerCase() })}
                    className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <span className="px-3 text-sm font-medium text-primary bg-primary/10 border-l border-primary/20 whitespace-nowrap">@musabkhan.me</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Password *</Label>
                  <button
                    type="button"
                    onClick={() => {
                      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$!";
                      const pwd = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
                      setLoginForm((f) => ({ ...f, password: pwd }));
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Auto-generate
                  </button>
                </div>
                <Input
                  type="text"
                  placeholder="Min 6 characters"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp Number</Label>
                <Input
                  type="tel"
                  placeholder="03001234567"
                  value={loginForm.phone}
                  onChange={(e) => setLoginForm({ ...loginForm, phone: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeLoginDialog}>Cancel</Button>
                <Button
                  onClick={handleCreateLogin}
                  disabled={loginSaving || !loginForm.username || !loginForm.password}
                  className="gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {loginSaving ? "Creating…" : "Create Login"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Remove Login Confirm ──────────────────────────── */}
      <ConfirmDialog
        open={!!removeTarget}
        title={`Remove login for ${removeTarget?.full_name}?`}
        description="They will no longer be able to log in. Their staff record and salary data are kept."
        onConfirm={() => { const t = removeTarget; if (t) handleRemoveLogin(t); }}
        onCancel={() => setRemoveTarget(null)}
      />

      {/* ── Transfer Clients Dialog ──────────────────────── */}
      <TransferClientsDialog
        source={transferTarget}
        candidates={visibleStaff.filter((t) => t.role === "trainer" && t.status === "active" && t.id !== transferTarget?.id)}
        gymId={gymId}
        onClose={() => setTransferTarget(null)}
        onTransferred={() => { setTransferTarget(null); reloadStaff(); }}
      />

      {/* ── Mark Paid Dialog ─────────────────────────────── */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Pay Salary — {payDialog?.staff?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Salary breakdown */}
            <div className="rounded-lg bg-muted/30 border border-sidebar-border px-4 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Base Salary</span>
                <span>{formatCurrency(payDialog?.base_salary ?? 0)}</span>
              </div>
              {Number(payDialog?.commission_amount) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Commission</span>
                  <span>{formatCurrency(payDialog?.commission_amount ?? 0)}</span>
                </div>
              )}
              {Number(payDialog?.pt_earnings) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>PT Earnings</span>
                  <span>{formatCurrency(payDialog?.pt_earnings ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-foreground border-t border-sidebar-border pt-1.5">
                <span>Total</span>
                <span className="text-emerald-400">{formatCurrency(payDialog?.total_amount ?? 0)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v as PaymentMethod })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(methodLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Payment Date</Label><Input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Receipt No.</Label><Input value={payForm.receipt} onChange={(e) => setPayForm({ ...payForm, receipt: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Input placeholder="Optional…" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancel</Button>
            <Button onClick={handlePay} disabled={paying} className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20">
              {paying ? "Saving…" : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset Staff Password Dialog ───────────────────── */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && closeResetDialog()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{resetPwDone ? "Password Reset" : `Reset Password — ${resetTarget?.full_name}`}</DialogTitle>
          </DialogHeader>
          {resetPwDone ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-xs text-emerald-400">
                Password reset successfully. Share new credentials with {resetTarget?.full_name}.
              </div>
              <div className="rounded-lg border border-input bg-muted/30 px-3 py-2.5 space-y-1 text-sm">
                {resetPwDone.email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-mono font-medium">{resetPwDone.email}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">New Password</span><span className="font-mono font-medium">{resetPwDone.password}</span></div>
              </div>
              {resetPwDone.phone && (
                <button
                  type="button"
                  onClick={() => {
                    const digits = resetPwDone.phone.replace(/\D/g, "");
                    const intl = digits.startsWith("0") ? "92" + digits.slice(1) : digits;
                    const msg = `Hi ${resetTarget?.full_name}! 👋\n\nYour *Pulse GMS* password has been reset:\n\n🔗 Login: ${window.location.origin}/login\n📧 Email: ${resetPwDone.email}\n🔑 New Password: ${resetPwDone.password}\n\nPlease save this safely.`;
                    window.open(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`, "_blank");
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] text-sm font-medium hover:bg-[#25D366]/20 transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Send via WhatsApp
                </button>
              )}
              <DialogFooter><Button className="w-full" onClick={closeResetDialog}>Done</Button></DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>New Password *</Label>
                  <button
                    type="button"
                    onClick={() => {
                      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$!";
                      setResetPw(Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join(""));
                    }}
                    className="text-xs text-primary hover:underline"
                  >Auto-generate</button>
                </div>
                <Input
                  type="text"
                  placeholder="Min 8 characters"
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  className="font-mono"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeResetDialog}>Cancel</Button>
                <Button onClick={handleResetPassword} disabled={resetPwSaving || resetPw.length < 8}>
                  {resetPwSaving ? "Resetting…" : "Reset Password"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Transfer Clients Dialog ───────────────────────────────────────────────
// Bulk-reassign all of a trainer's active clients (and optionally their active
// goals) to another active trainer. Use case: a trainer resigns and the owner
// needs the replacement to inherit the full roster with all history intact.

interface TransferClientsDialogProps {
  source: Staff | null;
  candidates: Staff[];
  gymId: string | null;
  onClose: () => void;
  onTransferred: () => void;
}

function TransferClientsDialog({ source, candidates, gymId, onClose, onTransferred }: TransferClientsDialogProps) {
  const { isDemo } = useGymContext();
  const [destinationId, setDestinationId] = useState<string>("");
  const [transferGoals, setTransferGoals] = useState(true);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [activeGoals, setActiveGoals] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load fresh active client + goal counts whenever the dialog opens for a new trainer.
  useEffect(() => {
    if (!source || !gymId) return;
    setDestinationId("");
    setTransferGoals(true);
    setActiveCount(null);
    setActiveGoals(null);

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const [{ count: memberCount }, { count: goalCount }] = await Promise.all([
        supabase.from("pulse_members")
          .select("id", { count: "exact", head: true })
          .eq("gym_id", gymId)
          .eq("assigned_trainer_id", source.id)
          .eq("status", "active"),
        supabase.from("pulse_member_goals")
          .select("id", { count: "exact", head: true })
          .eq("gym_id", gymId)
          .eq("trainer_id", source.id)
          .eq("status", "active"),
      ]);
      if (cancelled) return;
      setActiveCount(memberCount ?? 0);
      setActiveGoals(goalCount ?? 0);
    })();

    return () => { cancelled = true; };
  }, [source, gymId]);

  async function handleTransfer() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!source || !destinationId) return;
    setSubmitting(true);
    const result = await transferTrainerClients(source.id, destinationId, transferGoals);
    setSubmitting(false);

    if (result.error) {
      toast({ title: "Transfer failed", description: result.error, variant: "destructive" });
      return;
    }

    const destName = candidates.find((c) => c.id === destinationId)?.full_name ?? "destination trainer";
    const moved = result.transferredCount ?? 0;
    const goalsMoved = result.goalsTransferred ?? 0;
    toast({
      title: moved === 0 ? "No clients to transfer" : `${moved} client${moved === 1 ? "" : "s"} moved to ${destName}`,
      description: transferGoals && goalsMoved > 0 ? `${goalsMoved} active goal${goalsMoved === 1 ? "" : "s"} also transferred.` : undefined,
    });
    onTransferred();
  }

  const open = !!source;
  const ready = activeCount !== null && activeGoals !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer {source?.full_name}&apos;s clients</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 flex items-center gap-3">
            <ArrowRightLeft className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-sm">
              {!ready ? (
                <span className="text-muted-foreground">Loading roster…</span>
              ) : activeCount === 0 ? (
                <span className="text-muted-foreground">
                  {source?.full_name} has no active clients to transfer.
                </span>
              ) : (
                <span>
                  <span className="font-semibold text-amber-200">{activeCount}</span> active client{activeCount === 1 ? "" : "s"} will move to the trainer you pick. All history (goals, body metrics, payments) stays with each client.
                </span>
              )}
            </div>
          </div>

          {candidates.length === 0 ? (
            <p className="text-sm text-rose-400 px-1">
              No other active trainer available. Add or activate another trainer first.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label>Move clients to *</Label>
              <Select value={destinationId} onValueChange={setDestinationId} disabled={submitting || activeCount === 0}>
                <SelectTrigger><SelectValue placeholder="Select destination trainer" /></SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {ready && activeGoals !== null && activeGoals > 0 && (
            <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-sidebar-border bg-card cursor-pointer hover:bg-white/5 transition-colors">
              <input
                type="checkbox"
                checked={transferGoals}
                onChange={(e) => setTransferGoals(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 w-4 h-4 rounded accent-primary"
              />
              <div className="text-sm leading-tight">
                <span className="font-medium text-foreground">Also transfer {activeGoals} active goal{activeGoals === 1 ? "" : "s"}</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Recommended. New trainer gets credit for goals achieved going forward. Past wins stay with {source?.full_name}.
                </p>
              </div>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            onClick={handleTransfer}
            disabled={submitting || !destinationId || activeCount === 0 || !ready || candidates.length === 0}
          >
            {submitting ? "Transferring…" : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
