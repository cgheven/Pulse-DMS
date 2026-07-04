"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, Minus, X, MapPin, MapPinOff, ChevronDown, ChevronUp,
  User, Package, Loader2, Check,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  searchMyClients, createMyClient, searchProductsForOrder, createOrder,
  type RiderOrderProductOption, type CreateOrderItemInput,
} from "@/app/actions/rider";
import type { RiderClient, RiderOrderPaymentMethod } from "@/types";

type CartItem = {
  key: string;
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

type GpsStatus = "pending" | "captured" | "denied" | "unavailable";

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// ─── Client picker ─────────────────────────────────────────────────────────
type MinimalClient = { id: string; name: string; phone: string | null; business_name?: string | null };
type ClientGps = { status: "idle" | "capturing" | "captured" | "denied"; lat: number | null; lng: number | null };

function ClientPicker({ selected, onSelect, onClear }: {
  selected: RiderClient | MinimalClient | null;
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

  // Explicit tap, not automatic — the rider should be standing at the
  // client's location when tagging it (unlike order-level GPS, which is
  // captured silently since it just tags wherever the order was placed).
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

      {searching && (
        <p className="text-xs text-muted-foreground px-1">Searching...</p>
      )}

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

// ─── Product picker bottom sheet ───────────────────────────────────────────
// "Add Custom Item" is a deliberate SECONDARY escape hatch (see
// CustomItemInput) below the catalog results — catalog search stays the
// default/primary path so it doesn't erode catalog discipline.
export type CustomItemInput = { productName: string; quantity: number; unitPrice: number };

function ProductSheet({ onAdd, onAddCustom, onClose }: {
  onAdd: (p: RiderOrderProductOption) => void;
  onAddCustom: (input: CustomItemInput) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  const [results, setResults] = useState<RiderOrderProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customQuantity, setCustomQuantity] = useState("1");
  const [customUnitPrice, setCustomUnitPrice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchProductsForOrder(debouncedQuery).then((res) => {
      if (!cancelled) {
        setResults(res.products);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  function handleAddCustom() {
    const productName = customName.trim();
    const quantity = Number(customQuantity);
    const unitPrice = Number(customUnitPrice);
    if (!productName) {
      toast({ title: "Error", description: "Product name is required", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({ title: "Error", description: "Enter a valid quantity", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast({ title: "Error", description: "Enter a valid unit price", variant: "destructive" });
      return;
    }
    onAddCustom({ productName, quantity, unitPrice });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border-t border-sidebar-border rounded-t-2xl max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border shrink-0">
          <h3 className="font-semibold text-foreground">Add Item</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              className="pl-9 h-12 text-base focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-6">Loading...</p>
          ) : results.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">No products found.</p>
          ) : (
            <div className="rounded-xl border border-sidebar-border divide-y divide-sidebar-border overflow-hidden">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onAdd(p); onClose(); }}
                  className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-primary/5 active:bg-primary/10 transition-colors text-left group"
                >
                  <div className="min-w-0 flex items-baseline gap-1.5">
                    <p className="font-medium text-foreground truncate text-sm">{p.name}{p.size ? ` (${p.size})` : ""}</p>
                    <span className="text-xs text-muted-foreground shrink-0">· {p.unit}</span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-sm font-semibold text-foreground">Rs {p.sale_price.toLocaleString()}</span>
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!showAddCustom ? (
            <button
              onClick={() => setShowAddCustom(true)}
              className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-sidebar-border py-3 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Custom Item
            </button>
          ) : (
            <div className="mt-3 rounded-xl border border-sidebar-border bg-card p-3 space-y-2.5">
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Product name *"
                className="h-11 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2.5">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={customQuantity}
                  onChange={(e) => setCustomQuantity(e.target.value)}
                  placeholder="Quantity *"
                  className="h-11 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
                />
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rs</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={customUnitPrice}
                    onChange={(e) => setCustomUnitPrice(e.target.value)}
                    placeholder="0"
                    className="pl-9 h-11 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-10"
                  onClick={() => { setShowAddCustom(false); setCustomName(""); setCustomQuantity("1"); setCustomUnitPrice(""); }}
                >
                  Cancel
                </Button>
                <Button type="button" className="flex-1 h-10 glow-amber" onClick={handleAddCustom}>
                  Add Item
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Item row with inline steppers ─────────────────────────────────────────
function ItemRow({ item, onChange, onRemove }: {
  item: CartItem;
  onChange: (patch: Partial<CartItem>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-sidebar-border bg-card p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="font-medium text-foreground text-sm leading-snug truncate">{item.productName}</p>
          {!item.productId && (
            <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-muted/40 text-muted-foreground border-sidebar-border">
              Custom
            </span>
          )}
        </div>
        <button onClick={onRemove} className="p-1 rounded text-muted-foreground hover:text-red-400 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-sidebar-border">
          <button
            onClick={() => onChange({ quantity: Math.max(1, item.quantity - 1) })}
            className="p-2.5 text-muted-foreground hover:text-foreground active:scale-95 transition"
            aria-label="Decrease quantity"
          >
            <Minus className="w-4 h-4" />
          </button>
          <input
            type="number"
            inputMode="decimal"
            value={item.quantity}
            onChange={(e) => onChange({ quantity: Math.max(0.01, Number(e.target.value) || 0) })}
            className="w-12 text-center bg-transparent text-sm font-semibold text-foreground focus:outline-none"
          />
          <button
            onClick={() => onChange({ quantity: item.quantity + 1 })}
            className="p-2.5 text-muted-foreground hover:text-foreground active:scale-95 transition"
            aria-label="Increase quantity"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Rs</span>
          <input
            type="number"
            inputMode="decimal"
            value={item.unitPrice}
            onChange={(e) => onChange({ unitPrice: Math.max(0, Number(e.target.value) || 0) })}
            className="w-20 rounded-lg border border-sidebar-border bg-background px-2 py-1.5 text-sm font-medium text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50"
          />
        </div>
        <span className="text-sm font-bold text-foreground shrink-0">
          Rs {(item.quantity * item.unitPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}

const PAYMENT_OPTIONS: { value: RiderOrderPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "credit", label: "Credit" },
];

export function OrderFormClient() {
  const router = useRouter();
  const [selectedClient, setSelectedClient] = useState<MinimalClient | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [showProductSheet, setShowProductSheet] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<RiderOrderPaymentMethod>("cash");
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [gps, setGps] = useState<{ status: GpsStatus; lat: number | null; lng: number | null }>({ status: "pending", lat: null, lng: null });
  const [isPending, startTransition] = useTransition();
  const keyCounter = useRef(0);

  // Capture GPS silently on mount — never blocks the form. Denial/timeout
  // just shows a status line; submission proceeds either way.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGps({ status: "unavailable", lat: null, lng: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ status: "captured", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGps({ status: "denied", lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  const total = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);

  function addProduct(p: RiderOrderProductOption) {
    keyCounter.current += 1;
    setItems((prev) => [
      ...prev,
      { key: `p-${keyCounter.current}`, productId: p.id, productName: p.name + (p.size ? ` (${p.size})` : ""), quantity: 1, unitPrice: p.sale_price },
    ]);
  }

  // Secondary escape hatch for one-off/negotiated items not in the catalog —
  // productId is deliberately left undefined so the server (createOrder)
  // stores product_id NULL and flags the order via has_custom_item.
  function addCustomItem(input: CustomItemInput) {
    keyCounter.current += 1;
    setItems((prev) => [
      ...prev,
      { key: `c-${keyCounter.current}`, productId: undefined, productName: input.productName, quantity: input.quantity, unitPrice: input.unitPrice },
    ]);
  }

  function updateItem(key: string, patch: Partial<CartItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  function resetForm() {
    setSelectedClient(null);
    setItems([]);
    setPaymentMethod("cash");
    setNotes("");
    setShowNotes(false);
  }

  function handleSubmit() {
    if (!selectedClient) {
      toast({ title: "Error", description: "Please select or add a client", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Error", description: "Add at least one item", variant: "destructive" });
      return;
    }
    const cleanItems: CreateOrderItemInput[] = items.map((it) => ({
      productId: it.productId,
      productName: it.productName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    }));
    startTransition(async () => {
      const res = await createOrder({
        clientId: selectedClient.id,
        items: cleanItems,
        paymentMethod,
        latitude: gps.lat,
        longitude: gps.lng,
        notes: notes.trim() || undefined,
      });
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Order placed", description: `Rs ${total.toLocaleString()} for ${selectedClient.name}` });
      resetForm();
      router.refresh();
    });
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header — full width on desktop, above both columns */}
      <div className="shrink-0 p-4 pb-0 lg:px-6 lg:pt-6 lg:pb-0 lg:max-w-6xl lg:mx-auto lg:w-full">
        <h1 className="text-lg font-bold text-foreground">New Order</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Select a client, add items, and place the order.</p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row lg:gap-6 lg:px-6 lg:pb-6 lg:max-w-6xl lg:mx-auto lg:w-full overflow-hidden">
        {/* Working column — scrolls independently, capped width on desktop */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 lg:px-0 lg:pt-4 space-y-5 pb-4">
            <section className="space-y-2">
              <Label>Client</Label>
              <ClientPicker
                selected={selectedClient}
                onSelect={setSelectedClient}
                onClear={() => setSelectedClient(null)}
              />
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                {items.length > 0 && (
                  <span className="text-xs text-muted-foreground">{items.length} item{items.length > 1 ? "s" : ""}</span>
                )}
              </div>

              {items.length > 0 && (
                <div className="space-y-2">
                  {items.map((it) => (
                    <ItemRow key={it.key} item={it} onChange={(patch) => updateItem(it.key, patch)} onRemove={() => removeItem(it.key)} />
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowProductSheet(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-sidebar-border py-3.5 text-sm font-medium text-primary hover:bg-primary/5 transition-colors active:scale-[0.99]"
              >
                <Package className="w-4 h-4" /> Add Item
              </button>
            </section>

            <section className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/30 p-1 lg:max-w-md">
                {PAYMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPaymentMethod(opt.value)}
                    className={cn(
                      "rounded-lg py-2.5 text-sm font-semibold transition-colors border",
                      paymentMethod === opt.value
                        ? "bg-primary/15 text-primary border-primary/40"
                        : "text-muted-foreground border-transparent hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>

            {!showNotes ? (
              <button
                onClick={() => setShowNotes(true)}
                className="text-sm font-medium text-primary flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add note
              </button>
            ) : (
              <section className="space-y-2 lg:max-w-md">
                <div className="flex items-center justify-between">
                  <Label>Note</Label>
                  <button onClick={() => { setShowNotes(false); setNotes(""); }} className="text-xs text-muted-foreground hover:text-foreground">
                    Remove
                  </button>
                </div>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional note for this order..."
                  className="min-h-[70px]"
                />
              </section>
            )}

            <div className="flex items-center gap-1.5 text-xs">
              {gps.status === "pending" && (
                <><Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Capturing location...</span></>
              )}
              {gps.status === "captured" && (
                <><MapPin className="w-3.5 h-3.5 text-green-500" /><span className="text-green-500">Location captured</span></>
              )}
              {gps.status === "denied" && (
                <><MapPinOff className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">Location unavailable (permission denied) — order will still be placed</span></>
              )}
              {gps.status === "unavailable" && (
                <><MapPinOff className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">Location not supported on this device</span></>
              )}
            </div>
          </div>

          {/* Sticky footer — mobile/tablet only; desktop uses the summary sidebar instead */}
          <div className="lg:hidden shrink-0 border-t border-sidebar-border bg-background/95 backdrop-blur-md px-4 py-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="text-lg font-bold text-foreground">Rs {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={isPending}
              className="w-full h-12 text-base font-semibold glow-amber"
            >
              {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5 mr-1" /> Place Order</>}
            </Button>
          </div>
        </div>

        {/* Order summary — desktop only, always visible, no scrolling needed to submit */}
        <div className="hidden lg:flex lg:flex-col lg:w-[340px] lg:shrink-0 lg:pt-4">
          <div className="rounded-2xl border border-sidebar-border bg-card flex flex-col overflow-hidden max-h-full">
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Order Summary</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-5 space-y-3 min-h-0">
              {selectedClient ? (
                <div className="flex items-center gap-2.5 pb-3 border-b border-sidebar-border">
                  <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{selectedClient.name}</p>
                    {selectedClient.business_name && (
                      <p className="text-xs text-muted-foreground truncate">{selectedClient.business_name}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No client selected yet</p>
              )}

              {items.length > 0 ? (
                <div className="space-y-2.5 pb-2">
                  {items.map((it) => (
                    <div key={it.key} className="flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <span className="text-foreground truncate block">{it.productName}</span>
                        <span className="text-muted-foreground">{it.quantity} × Rs {it.unitPrice.toLocaleString()}</span>
                      </div>
                      <span className="font-medium text-foreground shrink-0">
                        Rs {(it.quantity * it.unitPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No items added yet</p>
              )}
            </div>
            <div className="p-5 pt-3 border-t border-sidebar-border space-y-3 shrink-0">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="text-lg font-bold text-foreground">Rs {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={isPending}
                className="w-full h-12 text-base font-semibold glow-amber"
              >
                {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5 mr-1" /> Place Order</>}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showProductSheet && (
        <ProductSheet onAdd={addProduct} onAddCustom={addCustomItem} onClose={() => setShowProductSheet(false)} />
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}
