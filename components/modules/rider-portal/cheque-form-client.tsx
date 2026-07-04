"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, X, User, Loader2, Landmark, MapPin, MapPinOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { searchMyClients, createMyClient, recordChequeCollection } from "@/app/actions/rider";
import type { RiderClient } from "@/types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// Trimmed copy of cash-form-client.tsx's ClientPicker — kept local for the
// same reason: this form's needs are simple enough that a shared extraction
// isn't worth the indirection yet.
type MinimalClient = { id: string; name: string; phone: string | null; business_name?: string | null };
type ClientGps = { status: "idle" | "capturing" | "captured" | "denied"; lat: number | null; lng: number | null };

function ClientPicker({ selected, onSelect, onClear }: {
  selected: MinimalClient | null;
  onSelect: (c: MinimalClient) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  const [results, setResults] = useState<RiderClient[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBusinessName, setNewBusinessName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [gps, setGps] = useState<ClientGps>({ status: "idle", lat: null, lng: null });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (selected) return;
    let cancelled = false;
    setSearching(true);
    searchMyClients(debouncedQuery).then((res) => {
      if (!cancelled) {
        setResults(res.clients);
        setSearching(false);
      }
    });
    return () => { cancelled = true; };
  }, [debouncedQuery, selected]);

  function captureLocation() {
    if (!("geolocation" in navigator)) {
      setGps({ status: "denied", lat: null, lng: null });
      return;
    }
    setGps((g) => ({ ...g, status: "capturing" }));
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ status: "captured", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGps({ status: "denied", lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) {
      toast({ title: "Error", description: "Client name is required", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const res = await createMyClient({
        name,
        businessName: newBusinessName.trim() || undefined,
        phone: newPhone.trim() || undefined,
        address: newAddress.trim() || undefined,
        latitude: gps.lat,
        longitude: gps.lng,
      });
      if (res.error || !res.clientId) {
        toast({ title: "Error", description: res.error ?? "Failed to add client", variant: "destructive" });
        return;
      }
      onSelect({ id: res.clientId, name, phone: newPhone.trim() || null, business_name: newBusinessName.trim() || null });
      setShowAdd(false);
      setNewName("");
      setNewBusinessName("");
      setNewPhone("");
      setNewAddress("");
      setGps({ status: "idle", lat: null, lng: null });
      toast({ title: "Client added", description: name });
    });
  }

  if (selected) {
    const subtitle = [selected.business_name, selected.phone].filter(Boolean).join(" · ");
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{selected.name}</p>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
        <button
          onClick={onClear}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 shrink-0"
          aria-label="Change client"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search client by name or phone..."
          className="pl-9 h-12 text-base focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
        />
      </div>

      {searching && <p className="text-xs text-muted-foreground px-1">Searching...</p>}

      {!searching && results.length > 0 && (
        <div className="rounded-xl border border-sidebar-border divide-y divide-sidebar-border overflow-hidden max-h-56 overflow-y-auto">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <span className="font-medium text-foreground truncate block">{c.name}</span>
                {c.business_name && <span className="text-xs text-muted-foreground truncate block">{c.business_name}</span>}
              </div>
              {c.phone && <span className="text-xs text-muted-foreground shrink-0">{c.phone}</span>}
            </button>
          ))}
        </div>
      )}

      {!searching && debouncedQuery && results.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground px-1">No matching clients.</p>
      )}

      {!showAdd ? (
        <button
          onClick={() => { setShowAdd(true); setNewName(query); }}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-sidebar-border py-3 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add New Client
        </button>
      ) : (
        <div className="rounded-xl border border-sidebar-border bg-card p-3 space-y-2.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Client name *"
            className="h-11 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
            autoFocus
          />
          <Input
            value={newBusinessName}
            onChange={(e) => setNewBusinessName(e.target.value)}
            placeholder="Shop / business name (optional)"
            className="h-11 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
          />
          <Input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="h-11 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
            inputMode="tel"
          />
          <Input
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="Address / landmark (optional)"
            className="h-11 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
          />
          <button
            type="button"
            onClick={captureLocation}
            disabled={gps.status === "capturing"}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors",
              gps.status === "captured"
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-dashed border-sidebar-border text-primary hover:bg-primary/5"
            )}
          >
            {gps.status === "capturing" && <><Loader2 className="w-4 h-4 animate-spin" /> Getting location...</>}
            {gps.status === "captured" && <><MapPin className="w-4 h-4" /> Location captured</>}
            {gps.status === "denied" && <><MapPinOff className="w-4 h-4" /> Location unavailable — tap to retry</>}
            {gps.status === "idle" && <><MapPin className="w-4 h-4" /> Use current location (optional)</>}
          </button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-10"
              onClick={() => { setShowAdd(false); setNewAddress(""); setGps({ status: "idle", lat: null, lng: null }); }}
            >
              Cancel
            </Button>
            <Button type="button" className="flex-1 h-10 glow-amber" disabled={isPending} onClick={handleCreate}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Client"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChequeFormClient() {
  const router = useRouter();
  const [selectedClient, setSelectedClient] = useState<MinimalClient | null>(null);
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [chequeDate, setChequeDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setSelectedClient(null);
    setChequeNumber("");
    setBankName("");
    setChequeDate(todayISO());
    setAmount("");
    setNote("");
  }

  function handleSubmit() {
    if (!selectedClient) {
      toast({ title: "Error", description: "Please select or add a client", variant: "destructive" });
      return;
    }
    if (!chequeNumber.trim()) {
      toast({ title: "Error", description: "Enter the cheque number", variant: "destructive" });
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Error", description: "Enter a valid amount", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const res = await recordChequeCollection({
        clientId: selectedClient.id,
        chequeNumber: chequeNumber.trim(),
        bankName: bankName.trim() || undefined,
        chequeDate,
        amount: amt,
        note: note.trim() || undefined,
      });
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Cheque recorded", description: `Rs ${amt.toLocaleString()} from ${selectedClient.name}` });
      resetForm();
      router.refresh();
    });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5 pb-4 lg:max-w-xl lg:mx-auto lg:w-full">
        <div>
          <h1 className="text-lg font-bold text-foreground">Record Cheque Collection</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use this for a cheque collected from a client that isn&apos;t tied to today&apos;s order. For a fresh
            cheque-payment delivery, record it from the order&apos;s detail screen instead.
          </p>
        </div>

        <section className="space-y-2">
          <Label>Client</Label>
          <ClientPicker selected={selectedClient} onSelect={setSelectedClient} onClear={() => setSelectedClient(null)} />
        </section>

        <section className="space-y-2">
          <Label>Cheque Number</Label>
          <Input
            value={chequeNumber}
            onChange={(e) => setChequeNumber(e.target.value)}
            placeholder="e.g. 001234"
            className="h-12 text-base focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
          />
        </section>

        <section className="space-y-2">
          <Label>Bank (optional)</Label>
          <Input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. HBL"
            className="h-12 text-base focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
          />
        </section>

        <div className="grid grid-cols-2 gap-3">
          <section className="space-y-2">
            <Label>Cheque Date</Label>
            <Input
              type="date"
              value={chequeDate}
              onChange={(e) => setChequeDate(e.target.value)}
              className="h-12 text-base focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
            />
          </section>
          <section className="space-y-2">
            <Label>Amount</Label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rs</span>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="pl-9 h-12 text-base focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
              />
            </div>
          </section>
        </div>

        <section className="space-y-2">
          <Label>Note (optional)</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note..."
            className="min-h-[70px]"
          />
        </section>
      </div>

      <div className="shrink-0 border-t border-sidebar-border bg-background/95 backdrop-blur-md px-4 py-3 lg:px-6 lg:py-4 lg:max-w-xl lg:mx-auto lg:w-full">
        <Button onClick={handleSubmit} disabled={isPending} className="w-full h-12 text-base font-semibold glow-amber">
          {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Landmark className="w-5 h-5 mr-1.5" /> Record Cheque</>}
        </Button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}
