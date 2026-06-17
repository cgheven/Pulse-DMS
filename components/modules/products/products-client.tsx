"use client";

import { useState, useTransition, useMemo } from "react";
import { Pencil, Trash2, Plus, Package, Users } from "lucide-react";
import type { Product, Supplier } from "@/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  addProduct,
  editProduct,
  deleteProduct,
  addSupplier,
  editSupplier,
  deleteSupplier,
} from "@/app/actions/products";

// ─── helpers ───────────────────────────────────────────────────────────────

function formatPKR(amount: number) {
  return `PKR ${amount.toLocaleString("en-PK")}`;
}

function margin(cost: number, sale: number) {
  if (sale <= 0) return "—";
  return `${((sale - cost) / sale * 100).toFixed(1)}%`;
}

const PRESET_UNITS = ["piece", "box", "kg", "litre", "dozen"];

// ─── types ─────────────────────────────────────────────────────────────────

interface Props {
  products: Product[];
  suppliers: Supplier[];
  shopId: string;
}

interface ProductForm {
  name: string;
  supplierId: string;
  unit: string;
  customUnit: string;
  costPrice: string;
  salePrice: string;
  lowStockThreshold: string;
}

interface SupplierForm {
  name: string;
  brand: string;
  contact: string;
}

const emptyProductForm = (): ProductForm => ({
  name: "",
  supplierId: "",
  unit: "piece",
  customUnit: "",
  costPrice: "",
  salePrice: "",
  lowStockThreshold: "5",
});

const emptySupplierForm = (): SupplierForm => ({
  name: "",
  brand: "",
  contact: "",
});

// ─── main component ────────────────────────────────────────────────────────

export function ProductsClient({ products: initialProducts, suppliers: initialSuppliers, shopId }: Props) {
  // We use local state optimistically; actions trigger revalidation for fresh data
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-foreground">Products &amp; Suppliers</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your product catalog and supplier list</p>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">
            <Package className="w-3.5 h-3.5" />
            Products
          </TabsTrigger>
          <TabsTrigger value="suppliers">
            <Users className="w-3.5 h-3.5" />
            Suppliers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <ProductsTab
            products={products}
            suppliers={suppliers}
            shopId={shopId}
            onProductsChange={setProducts}
          />
        </TabsContent>

        <TabsContent value="suppliers">
          <SuppliersTab
            suppliers={suppliers}
            products={products}
            shopId={shopId}
            onSuppliersChange={setSuppliers}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── products tab ──────────────────────────────────────────────────────────

function ProductsTab({
  products,
  suppliers,
  shopId,
  onProductsChange,
}: {
  products: Product[];
  suppliers: Supplier[];
  shopId: string;
  onProductsChange: (p: Product[]) => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyProductForm());

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const supplierMap = useMemo(() => {
    const m: Record<string, Supplier> = {};
    for (const s of suppliers) m[s.id] = s;
    return m;
  }, [suppliers]);

  function openAdd() {
    setEditingProduct(null);
    setForm(emptyProductForm());
    setDialogOpen(true);
  }

  function openEdit(p: Product) {
    setEditingProduct(p);
    const isPreset = PRESET_UNITS.includes(p.unit);
    setForm({
      name: p.name,
      supplierId: p.supplier_id ?? "",
      unit: isPreset ? p.unit : "__custom__",
      customUnit: isPreset ? "" : p.unit,
      costPrice: String(p.cost_price),
      salePrice: String(p.sale_price),
      lowStockThreshold: String(p.low_stock_threshold),
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const unit = form.unit === "__custom__" ? form.customUnit.trim() : form.unit;
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (!unit) { toast({ title: "Unit is required", variant: "destructive" }); return; }

    const payload = {
      shopId,
      name: form.name.trim(),
      supplierId: form.supplierId || undefined,
      unit,
      costPrice: parseFloat(form.costPrice) || 0,
      salePrice: parseFloat(form.salePrice) || 0,
      lowStockThreshold: parseInt(form.lowStockThreshold) || 5,
    };

    startTransition(async () => {
      const res = editingProduct
        ? await editProduct(editingProduct.id, shopId, payload)
        : await addProduct(payload);

      if (res?.error) {
        toast({ title: res.error, variant: "destructive" });
        return;
      }

      toast({ title: editingProduct ? "Product updated" : "Product added" });
      setDialogOpen(false);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteProduct(id, shopId);
      if (res?.error) {
        toast({ title: res.error, variant: "destructive" });
        return;
      }
      onProductsChange(products.filter((p) => p.id !== id));
      toast({ title: "Product deleted" });
    });
    setDeleteId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{products.length} product{products.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add Product
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-sidebar-border bg-card p-12 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Package className="w-6 h-6 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">No products yet. Add your first product.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cost Price</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sale Price</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Margin%</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Threshold</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.supplier_id
                        ? (supplierMap[p.supplier_id]?.name ?? <span className="italic text-xs">Unknown</span>)
                        : <span className="text-xs italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{p.unit}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatPKR(p.cost_price)}</td>
                    <td className="px-4 py-3 text-right text-foreground font-medium">{formatPKR(p.sale_price)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        p.sale_price > p.cost_price
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-rose-500/10 text-rose-400"
                      }`}>
                        {margin(p.cost_price, p.sale_price)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{p.low_stock_threshold}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(p.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Product Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!isPending) setDialogOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Name</Label>
              <Input
                id="p-name"
                placeholder="e.g. Sofa Set"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Supplier */}
            <div className="space-y-1.5">
              <Label>Supplier <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select value={form.supplierId} onValueChange={(v) => setForm((f) => ({ ...f, supplierId: v === "__none__" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No supplier</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{s.brand ? ` — ${s.brand}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Unit */}
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_UNITS.map((u) => (
                    <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">Custom...</SelectItem>
                </SelectContent>
              </Select>
              {form.unit === "__custom__" && (
                <Input
                  placeholder="e.g. roll, set, pack"
                  value={form.customUnit}
                  onChange={(e) => setForm((f) => ({ ...f, customUnit: e.target.value }))}
                />
              )}
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-cost">Cost Price (PKR)</Label>
                <Input
                  id="p-cost"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.costPrice}
                  onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-sale">Sale Price (PKR)</Label>
                <Input
                  id="p-sale"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.salePrice}
                  onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))}
                />
              </div>
            </div>

            {/* Margin preview */}
            {(form.costPrice || form.salePrice) && (
              <p className="text-xs text-muted-foreground">
                Margin:{" "}
                <span className={`font-semibold ${parseFloat(form.salePrice) > parseFloat(form.costPrice) ? "text-emerald-400" : "text-rose-400"}`}>
                  {margin(parseFloat(form.costPrice) || 0, parseFloat(form.salePrice) || 0)}
                </span>
              </p>
            )}

            {/* Low Stock Threshold */}
            <div className="space-y-1.5">
              <Label htmlFor="p-threshold">Low Stock Threshold</Label>
              <Input
                id="p-threshold"
                type="number"
                min="0"
                placeholder="5"
                value={form.lowStockThreshold}
                onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Saving..." : editingProduct ? "Save Changes" : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete product?"
        description="This will permanently delete the product. Stock records linked to it will remain."
        confirmLabel="Delete"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

// ─── suppliers tab ─────────────────────────────────────────────────────────

function SuppliersTab({
  suppliers,
  products,
  shopId,
  onSuppliersChange,
}: {
  suppliers: Supplier[];
  products: Product[];
  shopId: string;
  onSuppliersChange: (s: Supplier[]) => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptySupplierForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Count products per supplier
  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      if (p.supplier_id) {
        counts[p.supplier_id] = (counts[p.supplier_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [products]);

  function openAdd() {
    setEditingSupplier(null);
    setForm(emptySupplierForm());
    setDialogOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditingSupplier(s);
    setForm({ name: s.name, brand: s.brand ?? "", contact: s.contact ?? "" });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast({ title: "Supplier name is required", variant: "destructive" }); return; }

    const payload = {
      shopId,
      name: form.name.trim(),
      brand: form.brand.trim() || undefined,
      contact: form.contact.trim() || undefined,
    };

    startTransition(async () => {
      const res = editingSupplier
        ? await editSupplier(editingSupplier.id, shopId, payload)
        : await addSupplier(payload);

      if (res?.error) {
        toast({ title: res.error, variant: "destructive" });
        return;
      }

      toast({ title: editingSupplier ? "Supplier updated" : "Supplier added" });
      setDialogOpen(false);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteSupplier(id, shopId);
      if (res?.error) {
        toast({ title: res.error, variant: "destructive" });
        return;
      }
      onSuppliersChange(suppliers.filter((s) => s.id !== id));
      toast({ title: "Supplier deleted" });
    });
    setDeleteId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add Supplier
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <div className="rounded-xl border border-sidebar-border bg-card p-12 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">No suppliers yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brand</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Products</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.brand ?? <span className="text-xs italic">—</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.contact ?? <span className="text-xs italic">—</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {productCounts[s.id] ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(s.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Supplier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!isPending) setDialogOpen(o); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-name">Name <span className="text-rose-400 text-xs">*</span></Label>
              <Input
                id="s-name"
                placeholder="e.g. Al-Fatah Traders"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-brand">Brand <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="s-brand"
                placeholder="e.g. Molty Foam, Dawlance"
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-contact">Contact <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="s-contact"
                placeholder="e.g. 0300-1234567"
                value={form.contact}
                onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Saving..." : editingSupplier ? "Save Changes" : "Add Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete supplier?"
        description="This will permanently delete the supplier. Products linked to them will remain but lose the supplier link."
        confirmLabel="Delete"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
