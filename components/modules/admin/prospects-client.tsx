"use client";

import { useEffect, useState, useTransition, useMemo, useRef } from "react";
import {
  Building2, Plus, MapPin, RefreshCw,
  Edit2, Trash2, Search,
  CheckCircle2, Clock, Eye, Map, ChevronDown, X, XCircle,
  FileText, Inbox, Phone, Mail, Gift, Rocket, Calendar, Users, Hash,
  MessageCircle, History,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import type { Prospect, ProspectActivityOutcome, ProspectStatus } from "@/types";
import PriorityClient from "./priority-client";
import FollowupDialog from "./followup-dialog";
import ActivityDialog from "./activity-dialog";

type DialogMode = "add" | "edit" | "delete" | "details" | "followup" | "activity" | null;

const OUTCOME_BADGE: Record<ProspectActivityOutcome, { label: string; bg: string; text: string; border: string }> = {
  answered:        { label: "Answered",        bg: "bg-blue-500/15",    text: "text-blue-300",    border: "border-blue-500/40" },
  interested:      { label: "Interested",      bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/40" },
  scheduled_visit: { label: "Visit scheduled", bg: "bg-cyan-500/15",    text: "text-cyan-300",    border: "border-cyan-500/40" },
  onboarded:       { label: "Onboarded",       bg: "bg-emerald-500/20", text: "text-emerald-300", border: "border-emerald-500/50" },
  no_response:     { label: "No response",     bg: "bg-amber-500/15",   text: "text-amber-300",   border: "border-amber-500/40" },
  not_interested:  { label: "Not interested",  bg: "bg-rose-500/15",    text: "text-rose-300",    border: "border-rose-500/40" },
  rejected:        { label: "Rejected",        bg: "bg-red-500/15",     text: "text-red-300",     border: "border-red-500/40" },
  other:           { label: "Other",           bg: "bg-muted",          text: "text-muted-foreground", border: "border-border" },
};

const TRIAL_LABEL: Record<string, string> = {
  "1_month": "1 month free",
  "2_months": "2 months free",
  "skip": "Skip trial",
};
const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

const STATUS_CONFIG: Record<ProspectStatus, { label: string; color: string; bg: string; border: string; icon: typeof Clock }> = {
  pending:   { label: "Pending",   color: "text-amber-400",   bg: "bg-amber-500/15",   border: "border-amber-500/40",   icon: Clock },
  visited:   { label: "Visited",   color: "text-blue-400",    bg: "bg-blue-500/15",    border: "border-blue-500/40",    icon: Eye },
  onboarded: { label: "Onboarded", color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/40", icon: CheckCircle2 },
  rejected:  { label: "Rejected",  color: "text-rose-400",    bg: "bg-rose-500/15",    border: "border-rose-500/40",    icon: XCircle },
};


const LOCATIONS = ["Clifton", "DHA", "Defence View", "Saddar", "Tariq Road", "Gulistan-e-Johar", "Gulshan-e-Iqbal"];

const emptyForm = {
  name: "",
  owner_name: "",
  phone: "",
  area: "",
  address: "",
  maps_url: "",
  city: "",
  status: "pending" as ProspectStatus,
  notes: "",
};

export default function ProspectsClient() {
  const [prospects, setProspects]   = useState<Prospect[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter]     = useState<"all" | ProspectStatus>("all");
  const [areaFilter, setAreaFilter]         = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("Karachi");
  const [openDropdown, setOpenDropdown]     = useState<"area" | "status" | "city" | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selected, setSelected]     = useState<Prospect | null>(null);
  const [form, setForm]             = useState(emptyForm);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab]   = useState<"pipeline" | "priority">("pipeline");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("pulse_prospects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load prospects", description: error.message, variant: "destructive" });
    } else {
      setProspects((data ?? []) as Prospect[]);
    }
    setLoading(false);
  }

  function openAdd() {
    setForm(emptyForm);
    setDialogMode("add");
  }

  function openEdit(p: Prospect) {
    setSelected(p);
    setForm({
      name:       p.name,
      owner_name: p.owner_name ?? "",
      phone:      p.phone ?? "",
      area:       p.area ?? "",
      address:    p.address ?? "",
      maps_url:   p.maps_url ?? "",
      city:       p.city ?? "",
      status:     p.status,
      notes:      p.notes ?? "",
    });
    setDialogMode("edit");
  }

  function openDelete(p: Prospect) {
    setSelected(p);
    setDialogMode("delete");
  }

  function openFollowup(p: Prospect) {
    setSelected(p);
    setDialogMode("followup");
  }

  function openActivity(p: Prospect) {
    setSelected(p);
    setDialogMode("activity");
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Gym name required", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const payload = {
        name:       form.name.trim(),
        owner_name: form.owner_name.trim() || null,
        phone:      form.phone.trim() || null,
        area:       form.area.trim() || null,
        address:    form.address.trim() || null,
        maps_url:   form.maps_url.trim() || null,
        city:       form.city.trim() || null,
        status:     form.status,
        notes:      form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (dialogMode === "add") {
        const { error } = await supabase.from("pulse_prospects").insert(payload);
        if (error) {
          toast({ title: "Failed to add", description: error.message, variant: "destructive" });
          return;
        }
        toast({ title: "Gym added to pipeline" });
      } else if (dialogMode === "edit" && selected) {
        const { error } = await supabase.from("pulse_prospects").update(payload).eq("id", selected.id);
        if (error) {
          toast({ title: "Failed to update", description: error.message, variant: "destructive" });
          return;
        }
        toast({ title: "Updated successfully" });
      }

      setDialogMode(null);
      load();
    });
  }

  function handleDelete() {
    if (!selected) return;
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("pulse_prospects").delete().eq("id", selected.id);
      if (error) {
        toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Removed from pipeline" });
      setDialogMode(null);
      load();
    });
  }

  const uniqueAreas = useMemo(() =>
    Array.from(new Set(prospects.map((p) => p.area?.trim()).filter(Boolean) as string[])).sort(),
  [prospects]);

  const cityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of prospects) {
      const c = p.city?.trim();
      if (c) counts[c] = (counts[c] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [prospects]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return prospects.filter((p) => {
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.owner_name ?? "").toLowerCase().includes(q) ||
        (p.area ?? "").toLowerCase().includes(q) ||
        (p.city ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").includes(q);
      const matchStatus   = statusFilter   === "all" || p.status === statusFilter;
      const matchArea     = areaFilter     === "all" || (p.area?.trim() ?? "") === areaFilter;
      const matchLocation = locationFilter === "all" || (p.city?.trim() ?? "") === locationFilter;
      return matchSearch && matchStatus && matchArea && matchLocation;
    });
  }, [prospects, search, statusFilter, areaFilter, locationFilter]);

  const stats = useMemo(() => ({
    total:     prospects.length,
    pending:   prospects.filter((p) => p.status === "pending").length,
    visited:   prospects.filter((p) => p.status === "visited").length,
    onboarded: prospects.filter((p) => p.status === "onboarded").length,
  }), [prospects]);

  function cycleStatus(p: Prospect) {
    const next: Record<ProspectStatus, ProspectStatus> = {
      pending: "visited",
      visited: "onboarded",
      onboarded: "pending",
      rejected: "pending",
    };
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("pulse_prospects")
        .update({ status: next[p.status], updated_at: new Date().toISOString() })
        .eq("id", p.id);
      if (error) {
        toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
      } else {
        load();
      }
    });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <div className="border-b border-sidebar-border px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber/10 border border-amber/20">
              <Building2 className="w-4 h-4 text-amber" />
            </div>
            <div>
              <h1 className="text-base font-bold">Gym Pipeline</h1>
              <p className="text-xs text-muted-foreground">Sales prospects and outreach priority</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-2" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" className="gap-2" onClick={openAdd}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Gym</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b bg-background">
        <div className="container mx-auto px-4 sm:px-6 flex gap-1 pt-1">
          {([
            { key: "pipeline" as const, label: "Pipeline" },
            { key: "priority" as const, label: "Outreach Priority" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "priority" && (
        <PriorityClient prospects={prospects} loading={loading} onRefresh={load} />
      )}

      {activeTab === "pipeline" && <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Gyms",    value: stats.total,     icon: Building2,    iconBg: "bg-blue-500/20",    iconColor: "text-blue-400",    border: "border-l-blue-500" },
            { label: "Pending",       value: stats.pending,   icon: Clock,        iconBg: "bg-amber-500/20",   iconColor: "text-amber-400",   border: "border-l-amber-500" },
            { label: "Visited",       value: stats.visited,   icon: Eye,          iconBg: "bg-indigo-500/20",  iconColor: "text-indigo-400",  border: "border-l-indigo-500" },
            { label: "Onboarded",     value: stats.onboarded, icon: CheckCircle2, iconBg: "bg-emerald-500/20", iconColor: "text-emerald-400", border: "border-l-emerald-500" },
          ].map(({ label, value, icon: Icon, iconBg, iconColor, border }) => (
            <Card key={label} className={`border-l-4 ${border}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`p-2.5 rounded-xl ${iconBg} shrink-0`}>
                  <Icon className={`w-5 h-5 ${iconColor}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-3xl font-bold tracking-tight">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* City filter chips */}
        {cityCounts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setLocationFilter("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
                locationFilter === "all"
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
              }`}>
              All cities <span className="text-[10px] opacity-70">{prospects.length}</span>
            </button>
            {cityCounts.map(([city, count]) => (
              <button key={city} type="button"
                onClick={() => setLocationFilter(locationFilter === city ? "all" : city)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
                  locationFilter === city
                    ? "bg-primary/15 border-primary/30 text-primary"
                    : "bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                }`}>
                {city} <span className="text-[10px] opacity-70">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name, owner, area, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          {(statusFilter !== "all" || areaFilter !== "all" || locationFilter !== "all") && (
            <button
              onClick={() => { setStatusFilter("all"); setAreaFilter("all"); setLocationFilter("all"); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 transition-colors"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
          <p className="text-xs text-muted-foreground shrink-0 tabular-nums ml-auto">
            {filtered.length} / {prospects.length}
          </p>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Building2 className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium">No gyms found</p>
              <p className="text-sm mt-1">
                {search || statusFilter !== "all" || areaFilter !== "all" || locationFilter !== "all" ? "Try adjusting your filters" : "Add a gym to start tracking"}
              </p>
              {!search && statusFilter === "all" && areaFilter === "all" && locationFilter === "all" && (
                <Button size="sm" className="mt-4 gap-2" onClick={openAdd}>
                  <Plus className="w-4 h-4" /> Add First Gym
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" ref={dropdownRef as React.RefObject<HTMLTableElement>}>
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-10">#</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gym</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Owner</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</th>
                    {/* Area filter column */}
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <div className="relative">
                        <button
                          onClick={() => setOpenDropdown(openDropdown === "area" ? null : "area")}
                          className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-muted ${areaFilter !== "all" ? "text-violet-400" : ""}`}
                        >
                          Area
                          <ChevronDown className={`w-3 h-3 transition-transform ${openDropdown === "area" ? "rotate-180" : ""}`} />
                          {areaFilter !== "all" && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 ml-0.5" />}
                        </button>
                        {openDropdown === "area" && (
                          <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                            <button
                              onClick={() => { setAreaFilter("all"); setOpenDropdown(null); }}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${areaFilter === "all" ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                            >
                              All Areas
                            </button>
                            <div className="border-t border-border/50" />
                            {uniqueAreas.map((area) => (
                              <button
                                key={area}
                                onClick={() => { setAreaFilter(area); setOpenDropdown(null); }}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2 ${areaFilter === area ? "text-violet-400 font-semibold" : "text-muted-foreground"}`}
                              >
                                {area}
                                {areaFilter === area && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </th>
                    {/* Location filter column */}
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <div className="relative">
                        <button
                          onClick={() => setOpenDropdown(openDropdown === "city" ? null : "city")}
                          className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-muted ${locationFilter !== "all" ? "text-emerald-400" : ""}`}
                        >
                          Location
                          <ChevronDown className={`w-3 h-3 transition-transform ${openDropdown === "city" ? "rotate-180" : ""}`} />
                          {locationFilter !== "all" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />}
                        </button>
                        {openDropdown === "city" && (
                          <div className="absolute top-full left-0 mt-1 z-50 min-w-[170px] rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                            <button
                              onClick={() => { setLocationFilter("all"); setOpenDropdown(null); }}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${locationFilter === "all" ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                            >
                              All Locations
                            </button>
                            <div className="border-t border-border/50" />
                            {LOCATIONS.map((loc) => (
                              <button
                                key={loc}
                                onClick={() => { setLocationFilter(loc); setOpenDropdown(null); }}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2 ${locationFilter === loc ? "text-emerald-400 font-semibold" : "text-muted-foreground"}`}
                              >
                                {loc}
                                {locationFilter === loc && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Address</th>
                    <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-14">Map</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Application</th>
                    {/* Status filter column */}
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <div className="relative">
                        <button
                          onClick={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
                          className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-muted ${statusFilter !== "all" ? STATUS_CONFIG[statusFilter].color : ""}`}
                        >
                          Status
                          <ChevronDown className={`w-3 h-3 transition-transform ${openDropdown === "status" ? "rotate-180" : ""}`} />
                          {statusFilter !== "all" && <span className={`w-1.5 h-1.5 rounded-full ml-0.5 ${statusFilter === "pending" ? "bg-amber-400" : statusFilter === "visited" ? "bg-blue-400" : "bg-emerald-400"}`} />}
                        </button>
                        {openDropdown === "status" && (
                          <div className="absolute top-full left-0 mt-1 z-50 min-w-[150px] rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                            <button
                              onClick={() => { setStatusFilter("all"); setOpenDropdown(null); }}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${statusFilter === "all" ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                            >
                              All Statuses
                            </button>
                            <div className="border-t border-border/50" />
                            {(["pending", "visited", "onboarded"] as ProspectStatus[]).map((s) => {
                              const cfg = STATUS_CONFIG[s];
                              const Icon = cfg.icon;
                              return (
                                <button
                                  key={s}
                                  onClick={() => { setStatusFilter(s); setOpenDropdown(null); }}
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2 ${statusFilter === s ? `${cfg.color} font-semibold` : "text-muted-foreground"}`}
                                >
                                  <Icon className="w-3 h-3" />
                                  {cfg.label}
                                  {statusFilter === s && <span className={`w-1.5 h-1.5 rounded-full ml-auto shrink-0 ${s === "pending" ? "bg-amber-400" : s === "visited" ? "bg-blue-400" : "bg-emerald-400"}`} />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </th>
                    <th className="w-1 px-1"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((p, idx) => {
                    const cfg = STATUS_CONFIG[p.status];
                    const Icon = cfg.icon;
                    const initial = p.name.charAt(0).toUpperCase();
                    const avatarColors = [
                      "bg-violet-500/20 text-violet-400",
                      "bg-cyan-500/20 text-cyan-400",
                      "bg-rose-500/20 text-rose-400",
                      "bg-orange-500/20 text-orange-400",
                      "bg-teal-500/20 text-teal-400",
                    ];
                    const avatarColor = avatarColors[idx % avatarColors.length];
                    return (
                      <tr key={p.id} className="hover:bg-muted/25 transition-colors group">
                        <td className="px-3 py-2.5 text-muted-foreground/50 text-xs tabular-nums">{idx + 1}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor}`}>
                              {initial}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <p className="font-semibold text-foreground leading-tight truncate max-w-[220px]">{p.name}</p>
                                {p.followup_count > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => openActivity(p)}
                                    className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70 hover:text-primary shrink-0 transition-colors"
                                    title={`Last contacted ${p.last_followup_at ? new Date(p.last_followup_at).toLocaleString() : "—"} — click for timeline`}
                                  >
                                    <MessageCircle className="w-2.5 h-2.5" />
                                    {p.followup_count} follow-up{p.followup_count === 1 ? "" : "s"}
                                  </button>
                                )}
                                {p.last_outcome && OUTCOME_BADGE[p.last_outcome] && (
                                  <button
                                    type="button"
                                    onClick={() => openActivity(p)}
                                    title="Last response — click to update"
                                    className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium border shrink-0 transition-opacity hover:opacity-80 ${OUTCOME_BADGE[p.last_outcome].bg} ${OUTCOME_BADGE[p.last_outcome].text} ${OUTCOME_BADGE[p.last_outcome].border}`}
                                  >
                                    {OUTCOME_BADGE[p.last_outcome].label}
                                  </button>
                                )}
                              </div>
                              {p.notes && (
                                <p className="text-[11px] text-muted-foreground truncate max-w-[220px] mt-0.5">{p.notes}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-muted-foreground">
                          {p.owner_name || <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">
                          {p.phone || <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {p.area ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 whitespace-nowrap">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {p.area}
                            </span>
                          ) : <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {p.city ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                              {p.city}
                            </span>
                          ) : <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[260px] truncate">
                          {p.address || <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {p.maps_url ? (
                            <a
                              href={p.maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors"
                              title="View on Google Maps"
                            >
                              <Map className="w-3.5 h-3.5" />
                            </a>
                          ) : <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {p.submission_source === "public-form" ? (
                            <button
                              type="button"
                              onClick={() => { setSelected(p); setDialogMode("details"); }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15 transition-colors whitespace-nowrap"
                              title="View full application"
                            >
                              <Inbox className="w-3 h-3 shrink-0" />
                              {p.plan_choice ? PLAN_LABEL[p.plan_choice] ?? "Inbound" : "Inbound"}
                              {p.trial_choice && p.trial_choice !== "skip" && (
                                <span className="text-[10px] opacity-80">· {p.trial_choice === "1_month" ? "1mo" : "2mo"}</span>
                              )}
                              {p.branch_type === "multi" && p.branch_count && p.branch_count > 1 && (
                                <span className="text-[10px] opacity-80">· {p.branch_count}br</span>
                              )}
                            </button>
                          ) : (
                            <span className="text-muted-foreground/30 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => cycleStatus(p)}
                            disabled={isPending}
                            title="Click to advance status"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all hover:scale-105 active:scale-95 ${cfg.bg} ${cfg.color} ${cfg.border}`}
                          >
                            <Icon className="w-3 h-3" />
                            {cfg.label}
                          </button>
                        </td>
                        <td className="px-1 py-2.5 w-1">
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                              onClick={() => openFollowup(p)}
                              title="WhatsApp follow-up"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary/80 hover:text-primary hover:bg-primary/10"
                              onClick={() => openActivity(p)}
                              title="Activity log"
                            >
                              <History className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                              onClick={() => openEdit(p)}
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => openDelete(p)}
                              title="Delete"
                            >
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
          </Card>
        )}
      </div>}

      {/* ── Add / Edit Dialog ──────────────────────────────────────────────── */}
      <Dialog open={dialogMode === "add" || dialogMode === "edit"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogMode === "add" ? <><Plus className="w-4 h-4" /> Add Gym</> : <><Edit2 className="w-4 h-4" /> Edit Gym</>}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "add" ? "Add a new gym to the pipeline." : "Update gym details or status."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Gym Name *</Label>
                <Input
                  placeholder="Al-Noor Fitness"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Owner Name</Label>
                <Input
                  placeholder="Muhammad Ali"
                  value={form.owner_name}
                  onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  placeholder="0300-1234567"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <select
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select location...</option>
                  {LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Area</Label>
              <Input
                placeholder="Clifton Block 5, DHA Phase 2..."
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                placeholder="Street / Block / Sector"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Google Maps URL</Label>
              <Input
                placeholder="https://maps.google.com/..."
                value={form.maps_url}
                onChange={(e) => setForm({ ...form, maps_url: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex gap-2">
                {(["pending", "visited", "onboarded"] as ProspectStatus[]).map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={s}
                      onClick={() => setForm({ ...form, status: s })}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                        form.status === s
                          ? cfg.bg
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                placeholder="Any details about this gym..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending || !form.name.trim()}>
              {isPending ? "Saving..." : dialogMode === "add" ? "Add to Pipeline" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={dialogMode === "delete"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" /> Remove from Pipeline
            </DialogTitle>
            <DialogDescription>
              Remove <strong>{selected?.name}</strong> from the pipeline? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Removing..." : "Yes, Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Inbound Application Details Dialog ─────────────────────────────── */}
      <Dialog open={dialogMode === "details"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Inbound Application
            </DialogTitle>
            <DialogDescription>
              Submitted via public onboarding form
              {selected?.submitted_at && ` · ${new Date(selected.submitted_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}`}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <DetailRow icon={<Building2 className="w-3.5 h-3.5" />} label="Gym">
                {selected.gym_name || selected.name}
                {selected.city && <span className="text-muted-foreground"> · {selected.city}</span>}
                {selected.area && <span className="text-muted-foreground"> ({selected.area})</span>}
              </DetailRow>
              <DetailRow icon={<Phone className="w-3.5 h-3.5" />} label="Phone">
                {selected.phone ? (
                  <a href={`https://wa.me/${selected.phone.replace(/[^\d]/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {selected.phone}
                  </a>
                ) : "—"}
              </DetailRow>
              {selected.email && (
                <DetailRow icon={<Mail className="w-3.5 h-3.5" />} label="Email">
                  <a href={`mailto:${selected.email}`} className="text-primary hover:underline break-all">{selected.email}</a>
                </DetailRow>
              )}
              {selected.owner_name && (
                <DetailRow icon={<Users className="w-3.5 h-3.5" />} label="Owner">{selected.owner_name}</DetailRow>
              )}
              {selected.gym_type && (
                <DetailRow icon={<Building2 className="w-3.5 h-3.5" />} label="Gym type">{selected.gym_type.replace(/_/g, " ")}</DetailRow>
              )}
              {selected.active_members_count != null && (
                <DetailRow icon={<Users className="w-3.5 h-3.5" />} label="Active members">~{selected.active_members_count}</DetailRow>
              )}
              {selected.trial_choice && (
                <DetailRow icon={selected.trial_choice === "skip" ? <Rocket className="w-3.5 h-3.5" /> : <Gift className="w-3.5 h-3.5" />} label="Trial">
                  {TRIAL_LABEL[selected.trial_choice] ?? selected.trial_choice}
                </DetailRow>
              )}
              {selected.preferred_start_date && (
                <DetailRow icon={<Calendar className="w-3.5 h-3.5" />} label="Preferred start">{selected.preferred_start_date}</DetailRow>
              )}
              {selected.plan_choice && (
                <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label="Plan">
                  {PLAN_LABEL[selected.plan_choice] ?? selected.plan_choice}
                  {selected.billing_cycle && <span className="text-muted-foreground"> · {selected.billing_cycle}</span>}
                </DetailRow>
              )}
              {selected.branch_type && (
                <DetailRow icon={<Building2 className="w-3.5 h-3.5" />} label="Branches">
                  {selected.branch_type === "single" ? "Single branch" : `${selected.branch_count ?? 2} branches`}
                </DetailRow>
              )}
              {selected.heard_from && (
                <DetailRow icon={<Inbox className="w-3.5 h-3.5" />} label="Heard from">{selected.heard_from}</DetailRow>
              )}
              {selected.ip_address && (
                <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label="IP">
                  <span className="text-muted-foreground tabular-nums text-xs">{selected.ip_address}</span>
                </DetailRow>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── WhatsApp Follow-up Dialog ──────────────────────────────────────── */}
      <FollowupDialog
        prospect={dialogMode === "followup" ? selected : null}
        open={dialogMode === "followup"}
        onOpenChange={(o) => { if (!o) setDialogMode(null); }}
        onSent={() => {
          // Chain into the activity dialog so the operator can record an outcome
          // when they hear back. Reload prospects so counts refresh.
          load();
          setDialogMode("activity");
        }}
      />

      {/* ── Activity Log Dialog (timeline + outcome chips + log form) ──────── */}
      <ActivityDialog
        prospect={dialogMode === "activity" ? selected : null}
        open={dialogMode === "activity"}
        onOpenChange={(o) => { if (!o) setDialogMode(null); }}
        onChanged={load}
        showQuickOutcome
      />
    </div>
  );
}

function DetailRow({
  icon, label, children,
}: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-sidebar-border bg-card/50 px-3 py-2.5">
      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className="text-sm text-foreground leading-snug mt-0.5 break-words">{children}</p>
      </div>
    </div>
  );
}
