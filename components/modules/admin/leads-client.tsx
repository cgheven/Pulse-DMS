"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Pencil, Trash2, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import {
  createDmsLead,
  updateDmsLead,
  deleteDmsLead,
  addLeadActivity,
  type DmsLead,
} from "@/app/actions/admin-leads";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "demo_done", label: "Demo Done" },
  { value: "negotiating", label: "Negotiating" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
] as const;

const SOURCE_OPTIONS = [
  { value: "cold_visit", label: "Cold Visit" },
  { value: "referral", label: "Referral" },
  { value: "whatsapp", label: "WhatsApp Inbound" },
  { value: "social_media", label: "Social Media" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "demo_done", label: "Demo Done" },
  { value: "negotiating", label: "Negotiating" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const TEMPERATURE_OPTIONS = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

const ACTIVITY_TYPE_OPTIONS = [
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "visit", label: "Visit" },
  { value: "demo", label: "Demo" },
  { value: "follow_up", label: "Follow-up" },
  { value: "note", label: "Note" },
];

// ── Badge helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    new: { label: "New", className: "bg-muted/60 text-muted-foreground" },
    contacted: { label: "Contacted", className: "bg-blue-500/15 text-blue-400" },
    demo_done: { label: "Demo Done", className: "bg-purple-500/15 text-purple-400" },
    negotiating: { label: "Negotiating", className: "bg-amber-500/15 text-amber-400" },
    won: { label: "Won", className: "bg-emerald-500/15 text-emerald-400" },
    lost: { label: "Lost", className: "bg-red-500/10 text-red-400/70" },
  };
  const s = map[status] ?? { label: status, className: "bg-muted/60 text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

function TempBadge({ temp }: { temp: string }) {
  const map: Record<string, { label: string; dotClass: string }> = {
    hot: { label: "Hot", dotClass: "bg-red-500" },
    warm: { label: "Warm", dotClass: "bg-amber-400" },
    cold: { label: "Cold", dotClass: "bg-blue-400" },
  };
  const t = map[temp] ?? { label: temp, dotClass: "bg-muted-foreground" };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.dotClass}`} />
      {t.label}
    </span>
  );
}

// ── Blank form ────────────────────────────────────────────────────────────────

function blankForm() {
  return {
    business_name: "",
    contact_name: "",
    whatsapp_number: "",
    email: "",
    city: "Karachi",
    area: "",
    source: "cold_visit",
    status: "new",
    temperature: "warm",
    next_followup_date: "",
    estimated_value: "",
    notes: "",
  };
}

type FormState = ReturnType<typeof blankForm>;

function formFromLead(lead: DmsLead): FormState {
  return {
    business_name: lead.business_name,
    contact_name: lead.contact_name,
    whatsapp_number: lead.whatsapp_number,
    email: lead.email ?? "",
    city: lead.city ?? "Karachi",
    area: lead.area ?? "",
    source: lead.source,
    status: lead.status,
    temperature: lead.temperature,
    next_followup_date: lead.next_followup_date ?? "",
    estimated_value: lead.estimated_value != null ? String(lead.estimated_value) : "",
    notes: lead.notes ?? "",
  };
}

// ── Lead form dialog ──────────────────────────────────────────────────────────

interface LeadFormDialogProps {
  open: boolean;
  title: string;
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
}

function LeadFormDialog({
  open, title, form, onChange, onSubmit, onCancel, isPending,
}: LeadFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-2">
          {/* Business Name */}
          <div className="space-y-1.5">
            <Label>Business Name <span className="text-red-400">*</span></Label>
            <Input
              value={form.business_name}
              onChange={(e) => onChange({ business_name: e.target.value })}
              placeholder="DMS Pharmacy"
              disabled={isPending}
            />
          </div>

          {/* Contact Name */}
          <div className="space-y-1.5">
            <Label>Contact Name <span className="text-red-400">*</span></Label>
            <Input
              value={form.contact_name}
              onChange={(e) => onChange({ contact_name: e.target.value })}
              placeholder="Ahmed Khan"
              disabled={isPending}
            />
          </div>

          {/* WhatsApp */}
          <div className="space-y-1.5">
            <Label>WhatsApp Number <span className="text-red-400">*</span></Label>
            <Input
              value={form.whatsapp_number}
              onChange={(e) => onChange({ whatsapp_number: e.target.value })}
              placeholder="03XXXXXXXXX"
              disabled={isPending}
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label>Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => onChange({ email: e.target.value })}
              placeholder="ahmed@example.com"
              disabled={isPending}
            />
          </div>

          {/* City + Area */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input
                value={form.city}
                onChange={(e) => onChange({ city: e.target.value })}
                placeholder="Karachi"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Area <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                value={form.area}
                onChange={(e) => onChange({ area: e.target.value })}
                placeholder="Gulshan"
                disabled={isPending}
              />
            </div>
          </div>

          {/* Source */}
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select
              value={form.source}
              onValueChange={(v) => onChange({ source: v })}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status + Temperature */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => onChange({ status: v })}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Temperature</Label>
              <Select
                value={form.temperature}
                onValueChange={(v) => onChange({ temperature: v })}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPERATURE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Follow-up date */}
          <div className="space-y-1.5">
            <Label>Next Follow-up <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              type="date"
              value={form.next_followup_date}
              onChange={(e) => onChange({ next_followup_date: e.target.value })}
              disabled={isPending}
            />
          </div>

          {/* Estimated Value */}
          <div className="space-y-1.5">
            <Label>Estimated Value PKR <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              type="number"
              value={form.estimated_value}
              onChange={(e) => onChange({ estimated_value: e.target.value })}
              placeholder="50000"
              min={0}
              disabled={isPending}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              value={form.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="Any additional details..."
              rows={3}
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Log Activity dialog ───────────────────────────────────────────────────────

interface LogActivityDialogProps {
  open: boolean;
  leadName: string;
  activityType: string;
  note: string;
  onChangeType: (v: string) => void;
  onChangeNote: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
}

function LogActivityDialog({
  open, leadName, activityType, note,
  onChangeType, onChangeNote, onSubmit, onCancel, isPending,
}: LogActivityDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
          <p className="text-sm text-muted-foreground">{leadName}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Activity Type</Label>
            <Select value={activityType} onValueChange={onChangeType} disabled={isPending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              value={note}
              onChange={(e) => onChangeNote(e.target.value)}
              placeholder="What happened?"
              rows={3}
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? "Logging…" : "Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

interface Props {
  leads: DmsLead[];
}

export function LeadsClient({ leads }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(blankForm);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editLead, setEditLead] = useState<DmsLead | null>(null);
  const [editForm, setEditForm] = useState<FormState>(blankForm);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLead, setDeleteLead] = useState<DmsLead | null>(null);

  // Log activity dialog
  const [logOpen, setLogOpen] = useState(false);
  const [logLead, setLogLead] = useState<DmsLead | null>(null);
  const [logActivityType, setLogActivityType] = useState("note");
  const [logNote, setLogNote] = useState("");

  // Filtered leads
  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? leads
        : leads.filter((l) => l.status === statusFilter),
    [leads, statusFilter]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  function patchAdd(patch: Partial<FormState>) {
    setAddForm((f) => ({ ...f, ...patch }));
  }

  function patchEdit(patch: Partial<FormState>) {
    setEditForm((f) => ({ ...f, ...patch }));
  }

  function openEdit(lead: DmsLead) {
    setEditLead(lead);
    setEditForm(formFromLead(lead));
    setEditOpen(true);
  }

  function openDelete(lead: DmsLead) {
    setDeleteLead(lead);
    setDeleteOpen(true);
  }

  function openLog(lead: DmsLead) {
    setLogLead(lead);
    setLogActivityType("note");
    setLogNote("");
    setLogOpen(true);
  }

  function buildPayload(form: FormState): Omit<DmsLead, "id" | "created_at" | "updated_at"> {
    return {
      business_name: form.business_name.trim(),
      contact_name: form.contact_name.trim(),
      whatsapp_number: form.whatsapp_number.trim(),
      email: form.email.trim() || null,
      city: form.city.trim() || null,
      area: form.area.trim() || null,
      source: form.source,
      status: form.status,
      temperature: form.temperature,
      next_followup_date: form.next_followup_date || null,
      estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
      notes: form.notes.trim() || null,
    };
  }

  function handleAdd() {
    if (!addForm.business_name.trim()) {
      toast({ title: "Business name is required", variant: "destructive" });
      return;
    }
    if (!addForm.contact_name.trim()) {
      toast({ title: "Contact name is required", variant: "destructive" });
      return;
    }
    if (!addForm.whatsapp_number.trim()) {
      toast({ title: "WhatsApp number is required", variant: "destructive" });
      return;
    }

    startTransition(async () => {
      const { error } = await createDmsLead(buildPayload(addForm));
      if (error) {
        toast({ title: "Failed to add lead", description: error, variant: "destructive" });
        return;
      }
      toast({ title: "Lead added" });
      setAddOpen(false);
      setAddForm(blankForm());
      router.refresh();
    });
  }

  function handleEdit() {
    if (!editLead) return;
    if (!editForm.business_name.trim()) {
      toast({ title: "Business name is required", variant: "destructive" });
      return;
    }
    if (!editForm.contact_name.trim()) {
      toast({ title: "Contact name is required", variant: "destructive" });
      return;
    }
    if (!editForm.whatsapp_number.trim()) {
      toast({ title: "WhatsApp number is required", variant: "destructive" });
      return;
    }

    startTransition(async () => {
      const { error } = await updateDmsLead(editLead.id, buildPayload(editForm));
      if (error) {
        toast({ title: "Failed to update lead", description: error, variant: "destructive" });
        return;
      }
      toast({ title: "Lead updated" });
      setEditOpen(false);
      setEditLead(null);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!deleteLead) return;
    startTransition(async () => {
      const { error } = await deleteDmsLead(deleteLead.id);
      if (error) {
        toast({ title: "Failed to delete lead", description: error, variant: "destructive" });
        return;
      }
      toast({ title: "Lead deleted" });
      setDeleteOpen(false);
      setDeleteLead(null);
      router.refresh();
    });
  }

  function handleLogActivity() {
    if (!logLead) return;
    startTransition(async () => {
      const { error } = await addLeadActivity(logLead.id, {
        activity_type: logActivityType,
        note: logNote.trim() || undefined,
      });
      if (error) {
        toast({ title: "Failed to log activity", description: error, variant: "destructive" });
        return;
      }
      toast({ title: "Activity logged" });
      setLogOpen(false);
      setLogLead(null);
      router.refresh();
    });
  }

  // ── Format helpers ─────────────────────────────────────────────────────────

  function formatFollowup(dateStr: string | null) {
    if (!dateStr) return <span className="text-muted-foreground/50">—</span>;
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isOverdue = d < today;
    return (
      <span className={isOverdue ? "text-red-400 font-medium" : "text-foreground"}>
        {d.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
      </span>
    );
  }

  function formatSource(src: string) {
    const map: Record<string, string> = {
      cold_visit: "Cold Visit",
      referral: "Referral",
      whatsapp: "WhatsApp",
      social_media: "Social Media",
      other: "Other",
    };
    return map[src] ?? src;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {leads.length} {leads.length === 1 ? "lead" : "leads"} total
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setAddForm(blankForm());
            setAddOpen(true);
          }}
          disabled={isPending}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Add Lead
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.value === "all"
              ? leads.length
              : leads.filter((l) => l.status === tab.value).length;
          const active = statusFilter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors
                ${active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
            >
              {tab.label}
              <span className={`text-[10px] ${active ? "opacity-80" : "opacity-60"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sidebar-border bg-sidebar">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Business
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Contact
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Source
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Temp
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Follow-up
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sidebar-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    {statusFilter === "all"
                      ? "No leads yet. Click \"Add Lead\" to get started."
                      : `No leads with status "${STATUS_TABS.find((t) => t.value === statusFilter)?.label}".`}
                  </td>
                </tr>
              ) : (
                filtered.map((lead) => (
                  <tr key={lead.id} className="bg-card hover:bg-sidebar/50 transition-colors">
                    {/* Business */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{lead.business_name}</div>
                      {(lead.city || lead.area) && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {[lead.area, lead.city].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-3">
                      <div className="text-foreground">{lead.contact_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                        {lead.whatsapp_number}
                      </div>
                    </td>

                    {/* Source */}
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatSource(lead.source)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.status} />
                    </td>

                    {/* Temperature */}
                    <td className="px-4 py-3">
                      <TempBadge temp={lead.temperature} />
                    </td>

                    {/* Follow-up */}
                    <td className="px-4 py-3 text-xs">
                      {formatFollowup(lead.next_followup_date)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Log activity"
                          onClick={() => openLog(lead)}
                          disabled={isPending}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Edit lead"
                          onClick={() => openEdit(lead)}
                          disabled={isPending}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Delete lead"
                          onClick={() => openDelete(lead)}
                          disabled={isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Lead dialog */}
      <LeadFormDialog
        open={addOpen}
        title="Add Lead"
        form={addForm}
        onChange={patchAdd}
        onSubmit={handleAdd}
        onCancel={() => setAddOpen(false)}
        isPending={isPending}
      />

      {/* Edit Lead dialog */}
      <LeadFormDialog
        open={editOpen}
        title="Edit Lead"
        form={editForm}
        onChange={patchEdit}
        onSubmit={handleEdit}
        onCancel={() => {
          setEditOpen(false);
          setEditLead(null);
        }}
        isPending={isPending}
      />

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete Lead"
        description={`Delete lead for "${deleteLead?.business_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteLead(null);
        }}
      />

      {/* Log Activity dialog */}
      <LogActivityDialog
        open={logOpen}
        leadName={logLead?.business_name ?? ""}
        activityType={logActivityType}
        note={logNote}
        onChangeType={setLogActivityType}
        onChangeNote={setLogNote}
        onSubmit={handleLogActivity}
        onCancel={() => {
          setLogOpen(false);
          setLogLead(null);
        }}
        isPending={isPending}
      />
    </div>
  );
}
