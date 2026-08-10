import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, ListToolbar, EmptyState } from "@/components/page-helpers";
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight, Sliders, ImagePlus, X, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, useCompanySettings } from "@/lib/company";
import { useActiveTenantId } from "@/lib/tenant";
import { MAX_PRODUCT_IMAGES, uploadProductImages, useProductImageUrls } from "@/lib/product-images";


export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Products & Inventory" }] }),
  component: ProductsPage,
});

type Product = {
  id: string; name: string; sku: string | null; barcode: string | null; category: string | null;
  unit_price: number; cost_price: number; quantity: number; reorder_level: number;
  supplier: string | null; image_url: string | null; image_paths: string[] | null;
};


function ProductsPage() {
  const qc = useQueryClient();
  const productParam = useRouterState({ select: (s) => (s.location.search as Record<string, string | undefined>).product });
  const tenantId = useActiveTenantId();
  const { data: company } = useCompanySettings();
  const sym = company?.currency_symbol || "USh ";
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [movement, setMovement] = useState<Product | null>(null);
  const [listsOpen, setListsOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);


  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: attributes = [] } = useQuery({
    queryKey: ["product_attributes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_attributes")
        .select("id, kind, name")
        .order("name");
      if (error) throw error;
      return data as { id: string; kind: string; name: string }[];
    },
  });

  const categories = attributes.filter((a) => a.kind === "category");
  const suppliers = attributes.filter((a) => a.kind === "supplier");
  const categoryOptions: string[] = Array.from(
    new Set([...categories.map((c) => c.name), ...(editing?.category ? [editing.category] : [])]),
  );
  const supplierOptions: string[] = Array.from(
    new Set([...suppliers.map((s) => s.name), ...(editing?.supplier ? [editing.supplier] : [])]),
  );

  const addAttribute = useMutation({
    mutationFn: async ({ kind, name }: { kind: "category" | "supplier"; name: string }) => {
      const clean = name.trim();
      if (!clean) throw new Error("Enter a name");
      const { error } = await supabase.from("product_attributes").insert({ tenant_id: tenantId, kind, name: clean } as never);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.kind === "category" ? "Category added" : "Supplier added");
      if (v.kind === "category") setNewCategory(""); else setNewSupplier("");
      qc.invalidateQueries({ queryKey: ["product_attributes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAttribute = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_attributes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["product_attributes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = products.filter((p) =>
    [p.name, p.sku, p.category, p.supplier].some((v) => v?.toLowerCase().includes(q.toLowerCase()))
  );


  const upsert = useMutation({
    mutationFn: async (form: Record<string, unknown>) => {
      const payload = {
        ...form,
        unit_price: Number(form.unit_price || 0),
        cost_price: Number(form.cost_price || 0),
        quantity: Number(form.quantity || 0),
        reorder_level: Number(form.reorder_level || 0),
      };
      if (editing) {
        const { error } = await supabase.from("products").update(payload as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("products").insert({ ...payload, created_by: u.user?.id, tenant_id: tenantId } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Product updated" : "Product created");
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false); setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const stockMove = useMutation({
    mutationFn: async (form: { product_id: string; change_qty: number; reason: string; notes: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("stock_movements").insert({
        product_id: form.product_id, change_qty: form.change_qty,
        reason: form.reason as "stock_in" | "stock_out" | "adjustment" | "sale" | "return",
        notes: form.notes, created_by: u.user?.id, tenant_id: tenantId,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock updated");
      qc.invalidateQueries({ queryKey: ["products"] });
      setMovement(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    upsert.mutate(Object.fromEntries(fd.entries()));
  };

  const onMove = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!movement) return;
    const fd = new FormData(e.currentTarget);
    const raw = Number(fd.get("quantity"));
    const reason = String(fd.get("reason"));
    const change = reason === "stock_in" || reason === "return" ? Math.abs(raw) : reason === "stock_out" || reason === "sale" ? -Math.abs(raw) : raw;
    stockMove.mutate({
      product_id: movement.id, change_qty: change, reason,
      notes: String(fd.get("notes") || ""),
    });
  };

  return (
    <div>
      <PageHeader title="Products & Inventory" subtitle="Track stock levels, prices and reorder thresholds in real time." />

      {/* Categories & suppliers */}
      <Card className="p-4 shadow-soft border-0 mb-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-3 sm:flex sm:justify-between">
          <div className="min-w-0">
            <div className="font-semibold truncate">Categories & suppliers</div>
            <div className="text-xs text-muted-foreground">Manage the lists shown when adding a product.</div>
          </div>
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setListsOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Manage
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Categories</div>
            <div className="flex flex-wrap gap-1.5">
              {categories.length === 0 ? <span className="text-xs text-muted-foreground">None yet</span>
                : categories.map((c) => <Badge key={c.id} variant="secondary">{c.name}</Badge>)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Suppliers</div>
            <div className="flex flex-wrap gap-1.5">
              {suppliers.length === 0 ? <span className="text-xs text-muted-foreground">None yet</span>
                : suppliers.map((s) => <Badge key={s.id} variant="outline">{s.name}</Badge>)}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 shadow-soft border-0">
        <ListToolbar
          query={q} onQuery={setQ} placeholder="Search by name, SKU, category…"
          onAdd={() => { setEditing(null); setOpen(true); }} addLabel="New product"
        />
        {filtered.length === 0 ? (
          <EmptyState title="No products yet" message="Add your first product or service to start invoicing." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const low = Number(p.quantity) <= Number(p.reorder_level);
                  const out = Number(p.quantity) <= 0;
                  return (
                    <TableRow key={p.id} className={productParam === p.id ? "bg-primary/10 ring-1 ring-primary/30" : ""}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.category}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.sku || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(p.unit_price, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{Number(p.quantity)}</TableCell>
                      <TableCell>
                        {out ? <Badge variant="destructive">Out of stock</Badge>
                          : low ? <Badge className="bg-[var(--gold)] text-[var(--gold-foreground)]">Low stock</Badge>
                          : <Badge variant="secondary">In stock</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" title="Stock movement" onClick={() => setMovement(p)}><Sliders className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => confirm("Delete product?") && del.mutate(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Create/edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name *</Label><Input name="name" defaultValue={editing?.name} required /></div>
            <div><Label>SKU</Label><Input name="sku" defaultValue={editing?.sku ?? ""} /></div>
            <div><Label>Barcode</Label><Input name="barcode" defaultValue={editing?.barcode ?? ""} /></div>
            <div>
              <Label>Category</Label>
              <Select name="category" defaultValue={editing?.category ?? ""}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No categories yet — add some in “Categories & suppliers”.</div>}
                  {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Supplier</Label>
              <Select name="supplier" defaultValue={editing?.supplier ?? ""}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {supplierOptions.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No suppliers yet — add some in “Categories & suppliers”.</div>}
                  {supplierOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Unit price ({sym})</Label><Input name="unit_price" type="number" step="0.01" defaultValue={editing?.unit_price ?? 0} required /></div>
            <div><Label>Cost price ({sym})</Label><Input name="cost_price" type="number" step="0.01" defaultValue={editing?.cost_price ?? 0} /></div>
            <div><Label>Quantity</Label><Input name="quantity" type="number" step="1" defaultValue={editing?.quantity ?? 0} /></div>
            <div><Label>Reorder level</Label><Input name="reorder_level" type="number" step="1" defaultValue={editing?.reorder_level ?? 0} /></div>
            <div className="col-span-2"><Label>Image URL</Label><Input name="image_url" defaultValue={editing?.image_url ?? ""} /></div>
            <DialogFooter className="col-span-2 mt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" className="gradient-emerald text-white">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock movement dialog */}
      <Dialog open={!!movement} onOpenChange={(v) => !v && setMovement(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock — {movement?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onMove} className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select name="reason" defaultValue="stock_in">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock_in"><ArrowUpRight className="inline h-3 w-3 mr-1.5 text-success" />Stock in</SelectItem>
                  <SelectItem value="stock_out"><ArrowDownRight className="inline h-3 w-3 mr-1.5 text-destructive" />Stock out</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="return">Return</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Quantity</Label><Input name="quantity" type="number" step="1" required /></div>
            <div><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setMovement(null)}>Cancel</Button>
              <Button type="submit" className="gradient-emerald text-white">Save movement</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage categories & suppliers */}
      <Dialog open={listsOpen} onOpenChange={setListsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Categories & suppliers</DialogTitle></DialogHeader>
          <div className="grid gap-6 sm:grid-cols-2">
            {([
              { kind: "category" as const, label: "Categories", items: categories, value: newCategory, set: setNewCategory },
              { kind: "supplier" as const, label: "Suppliers", items: suppliers, value: newSupplier, set: setNewSupplier },
            ]).map((group) => (
              <div key={group.kind} className="space-y-2">
                <Label>{group.label}</Label>
                <div className="flex gap-2">
                  <Input
                    value={group.value}
                    onChange={(e) => group.set(e.target.value)}
                    placeholder={`Add ${group.kind}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addAttribute.mutate({ kind: group.kind, name: group.value }); }
                    }}
                  />
                  <Button type="button" onClick={() => addAttribute.mutate({ kind: group.kind, name: group.value })} disabled={addAttribute.isPending}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
                  {group.items.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted-foreground">Nothing added yet.</div>
                  ) : group.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                      <span className="text-sm truncate">{it.name}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => removeAttribute.mutate(it.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setListsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
