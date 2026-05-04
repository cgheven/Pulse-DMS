"use client";
import { useState, useMemo } from "react";
import { Plus, FileText, Search, Edit2, Trash2, CheckCircle2, Clock, AlertTriangle, Zap } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useGymContext } from "@/contexts/gym-context";
import { formatCurrency, formatDate, formatDateInput, capitalize } from "@/lib/utils";
import type { Bill, BillCategory, BillCondition, BillStatus } from "@/types";

const categories: BillCategory[] = ["electricity", "water", "internet", "gas", "maintenance", "rent", "equipment", "other"];

const categoryIcons: Record<BillCategory, string> = {
  electricity: "⚡",
  water:       "💧",
  internet:    "🌐",
  gas:         "🔥",
  maintenance: "🔧",
  rent:        "🏠",
  equipment:   "🏋️",
  other:       "📋",
};

const statusConfig: Record<BillStatus, { label: string; icon: typeof CheckCircle2; badge: "success" | "warning" | "destructive" }> = {
  paid:    { label: "Paid",    icon: CheckCircle2, badge: "success" },
  unpaid:  { label: "Unpaid",  icon: Clock,        badge: "warning" },
  overdue: { label: "Overdue", icon: AlertTriangle, badge: "destructive" },
};

const PRESETS: { icon: string; label: string; category: BillCategory }[] = [
  { icon: "⚡", label: "Electricity",   category: "electricity" },
  { icon: "💧", label: "Water",         category: "water" },
  { icon: "🔥", label: "Gas",           category: "gas" },
  { icon: "🌐", label: "Internet",      category: "internet" },
  { icon: "🏠", label: "Monthly Rent",  category: "rent" },
  { icon: "🔧", label: "Maintenance",   category: "maintenance" },
  { icon: "🏋️", label: "Equipment",     category: "equipment" },
  { icon: "📋", label: "Other Bill",    category: "other" },
];

const emptyForm = {
  title: "", category: "electricity" as BillCategory,
  amount: "", late_fee: "0", due_date: formatDateInput(new Date()),
  paid_date: "", status: "unpaid" as BillStatus, notes: "",
  condition: "" as BillCondition | "",
  reminder_days: "5",
};

interface Props {
  gymId: string | null;
  bills: Bill[];
}

export function BillsClient({ gymId, bills: initialBills }: Props) {
  const { isDemo } = useGymContext();
  const [bills, setBills] = useState<Bill[]>(initialBills);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = bills;
    if (search) list = list.filter((b) => b.title.toLowerCase().includes(search.toLowerCase()) || b.category.includes(search.toLowerCase()));
    if (statusFilter !== "all") list = list.filter((b) => b.status === statusFilter);
    return list;
  }, [search, statusFilter, bills]);

  async function reload() {
    if (!gymId) return;
    const supabase = createClient();
    const { data } = await supabase.from("pulse_bills").select("*").eq("gym_id", gymId).order("due_date", { ascending: false });
    setBills((data as Bill[]) ?? []);
  }

  function openAdd(preset?: { label: string; category: BillCategory }) {
    setEditing(null);
    setForm({ ...emptyForm, title: preset?.label ?? "", category: preset?.category ?? "electricity" });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!gymId || !form.title || !form.amount) return;
    setSaving(true);
    const supabase = createClient();
    const payload = {
      gym_id: gymId,
      title: form.title,
      category: form.category,
      amount: parseFloat(form.amount),
      due_date: form.due_date,
      paid_date: form.paid_date || null,
      status: form.status,
      notes: form.notes || null,
      // Condition only meaningful for equipment purchases — clear for all other categories.
      condition: form.category === "equipment" ? (form.condition || null) : null,
      late_fee: parseInt(form.late_fee) || 0,
      reminder_days: parseInt(form.reminder_days) || 0,
    };
    const { error } = editing
      ? await supabase.from("pulse_bills").update(payload).eq("id", editing.id)
      : await supabase.from("pulse_bills").insert(payload);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: editing ? "Bill updated" : "Bill added" }); setDialogOpen(false); reload(); }
    setSaving(false);
  }

  async function markPaid(bill: Bill) {
    const supabase = createClient();
    const { error } = await supabase.from("pulse_bills").update({ status: "paid", paid_date: formatDateInput(new Date()) }).eq("id", bill.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Marked as paid" }); reload(); }
  }

  async function handleDelete(id: string) {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    const supabase = createClient();
    const { error } = await supabase.from("pulse_bills").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Deleted" }); reload(); }
  }

  const totals = useMemo(() => ({
    unpaid:  bills.filter((b) => b.status !== "paid").reduce((s, b) => s + Number(b.amount) + Number(b.late_fee), 0),
    paid:    bills.filter((b) => b.status === "paid").reduce((s, b) => s + Number(b.amount) + Number(b.late_fee), 0),
    overdue: bills.filter((b) => b.status === "overdue").length,
  }), [bills]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight">Bills</h1>
          <p className="text-muted-foreground text-sm mt-1">Track gym utility and recurring bills</p>
        </div>
        <Button onClick={() => openAdd()} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" /> Add Bill
        </Button>
      </div>

      {/* Quick-add presets */}
      <div className="rounded-2xl border border-sidebar-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Add</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => openAdd(p)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sidebar-border bg-white/[0.03] hover:bg-white/[0.07] hover:border-primary/30 text-sm transition-colors"
            >
              <span>{p.icon}</span>
              <span className="text-foreground/80">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Pending Amount",   value: formatCurrency(totals.unpaid), icon: Clock,        color: "text-primary",    bg: "bg-primary/10 border border-primary/20" },
          { label: "Paid This Period", value: formatCurrency(totals.paid),   icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20" },
          { label: "Overdue Bills",    value: totals.overdue,                icon: AlertTriangle, color: "text-rose-400",  bg: "bg-rose-500/10 border border-rose-500/20" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${bg}`}><Icon className={`w-4 h-4 ${color}`} /></div>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + status chips */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search bills..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          {[
            { value: "all",     label: "All" },
            { value: "unpaid",  label: "Unpaid" },
            { value: "overdue", label: "Overdue" },
            { value: "paid",    label: "Paid" },
          ].map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === s.value
                  ? s.value === "overdue" ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                  : s.value === "paid"    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : s.value === "unpaid"  ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                  : "bg-primary/15 border-primary/40 text-primary"
                  : "bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bills table */}
      <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="w-10 h-10 mb-3 opacity-30" />
            <p className="font-medium">No bills found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bill</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Due Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Paid Date</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border/50">
                {filtered.map((bill) => {
                  const cfg = statusConfig[bill.status];
                  const StatusIcon = cfg.icon;
                  return (
                    <tr key={bill.id} className="hover:bg-white/[0.02] transition-colors group">
                      {/* Bill title */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/8 flex items-center justify-center text-base shrink-0">
                            {categoryIcons[bill.category]}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-foreground">{bill.title}</p>
                            {bill.condition && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase tracking-wide ${
                                bill.condition === "new"
                                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                                  : "bg-amber-500/10 border-amber-500/25 text-amber-400"
                              }`}>
                                {bill.condition}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          bill.status === "paid"    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                          bill.status === "overdue" ? "bg-rose-500/10 border-rose-500/20 text-rose-400" :
                                                      "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                        }`}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                      {/* Due date */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex flex-col gap-1">
                          <span className={`text-sm ${bill.status === "overdue" ? "text-rose-400 font-medium" : "text-muted-foreground"}`}>
                            {formatDate(bill.due_date)}
                          </span>
                          {bill.reminder_days > 0 && bill.status !== "paid" && (
                            <span className="text-[10px] text-amber-400/70">
                              🔔 {bill.reminder_days}d reminder
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Paid date */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {bill.paid_date ? formatDate(bill.paid_date) : "—"}
                        </span>
                      </td>
                      {/* Amount */}
                      <td className="px-4 py-3 text-right">
                        {bill.late_fee > 0 ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-semibold text-foreground">{formatCurrency(bill.amount + bill.late_fee)}</span>
                            <span className="text-[10px] text-rose-400/80">{formatCurrency(bill.amount)} + {formatCurrency(bill.late_fee)} late fee</span>
                          </div>
                        ) : (
                          <span className="font-semibold text-foreground">{formatCurrency(bill.amount)}</span>
                        )}
                      </td>
                      {/* Actions — always visible (hover-only is broken on touch) */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {bill.status !== "paid" && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10" onClick={() => markPaid(bill)}>
                              <CheckCircle2 className="w-3 h-3" /> Pay
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            setEditing(bill);
                            setForm({
                              title: bill.title,
                              category: bill.category,
                              amount: bill.amount.toString(),
                              late_fee: String(bill.late_fee ?? 0),
                              due_date: bill.due_date,
                              paid_date: bill.paid_date ?? "",
                              status: bill.status,
                              notes: bill.notes ?? "",
                              condition: bill.condition ?? "",
                              reminder_days: String(bill.reminder_days ?? 5),
                            });
                            setDialogOpen(true);
                          }}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(bill.id)}>
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
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete bill?"
        description="This bill record will be permanently deleted."
        onConfirm={() => { handleDelete(deleteId!); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Bill" : "Add Bill"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input placeholder="e.g. Electricity Bill" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as BillCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{categoryIcons[c]} {capitalize(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Amount (PKR) *</Label>
                <Input type="number" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Late Fee / Penalty (PKR)</Label>
              <div className="flex items-center gap-3">
                <Input type="number" min="0" placeholder="0" value={form.late_fee} onChange={(e) => setForm({ ...form, late_fee: e.target.value })} className="w-36" />
                {parseInt(form.late_fee) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Total payable: <span className="font-semibold text-foreground">{formatCurrency((parseFloat(form.amount) || 0) + (parseInt(form.late_fee) || 0))}</span>
                    <span className="text-rose-400/80 ml-1">(+{formatCurrency(parseInt(form.late_fee))} penalty)</span>
                  </p>
                )}
              </div>
            </div>
            {form.category === "equipment" && (
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <Select value={form.condition || "new"} onValueChange={(v) => setForm({ ...form, condition: v as BillCondition })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="used">Used</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as BillStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reminder (days before due)</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number" min="0" max="30"
                  value={form.reminder_days}
                  onChange={(e) => setForm({ ...form, reminder_days: e.target.value })}
                  className="w-24"
                />
                <p className="text-xs text-muted-foreground">
                  {parseInt(form.reminder_days) > 0
                    ? `Alert on dashboard ${form.reminder_days} day${parseInt(form.reminder_days) !== 1 ? "s" : ""} before due date`
                    : "No reminder — bill won't appear until overdue"}
                </p>
              </div>
            </div>
            {form.status === "paid" && (
              <div className="space-y-1.5">
                <Label>Paid Date</Label>
                <Input type="date" value={form.paid_date} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Optional..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title || !form.amount}>
              {saving ? "Saving..." : editing ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
