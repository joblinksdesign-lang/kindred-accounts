import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Building2, Pencil, Plus, Star, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, EmptyState } from "@/components/page-helpers";
import { formatDate } from "@/lib/company";
import { useActiveTenant } from "@/lib/tenant";
import { useBranches, type Branch } from "@/lib/branches";
import { useTenantModules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/branches")({
  head: () => ({
    meta: [
      { title: "Branches & stock transfers — Softtrack Pos" },
      { name: "description", content: "Run several shops from one account: per-branch stock, staff and instant stock transfers between branches." },
      { property: "og:title", content: "Branches & stock transfers — Softtrack Pos" },
      { property: "og:description", content: "Manage every shop location and move stock between them instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BranchesPage,
});

type BranchForm = { id?: string; name: string; code: string; phone: string; address: string; is_active: boolean };

const emptyForm: BranchForm = { name: "", code: "", phone: "", address: "", is_active: true };

function BranchesPage() {
  const qc = useQueryClient();
  const { tenantId, role } = useActiveTenant();
  const { data: modules } = useTenantModules();
  const { data: branches = [] } = useBranches();
  const canManage = role === "owner" || role === "manager";
  const canTransfer = canManage || role === "store_manager";

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BranchForm>(emptyForm);

  const { data: products = [] } = useQuery({
    queryKey: ["branch_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products").select("id, name, sku").eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; sku: string | null }[];
    },
  });

  const { data: stock = [] } = useQuery({
    queryKey: ["branch_stock_rows", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_stock").select("branch_id, product_id, quantity").eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as { branch_id: string; product_id: string; quantity: number }[];
    },
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ["stock_transfers", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select("id, transfer_number, quantity, created_at, notes, product_id, from_branch_id, to_branch_id")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as {
        id: string; transfer_number: string; quantity: number; created_at: string; notes: string | null;
        product_id: string; from_branch_id: string; to_branch_id: string;
      }[];
    },
  });

  const stockAt = (branchId: string, productId: string) =>
    Number(stock.find((s) => s.branch_id === branchId && s.product_id === productId)?.quantity ?? 0);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? "—";
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "Product";

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error("Give the branch a name");
      const payload = {
        tenant_id: tenantId,
        name,
        code: form.code.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        is_active: form.is_active,
      };
      if (form.id) {
        const { error } = await supabase.from("branches").update(payload as never).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("branches").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Branch updated" : "Branch added");
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const makeDefault = useMutation({
    mutationFn: async (branch: Branch) => {
      const { error: clear } = await supabase
        .from("branches").update({ is_default: false } as never)
        .eq("tenant_id", tenantId!).eq("is_default", true);
      if (clear) throw clear;
      const { error } = await supabase.from("branches").update({ is_default: true } as never).eq("id", branch.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Main branch updated"); qc.invalidateQueries({ queryKey: ["branches"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (branch: Branch) => {
      if (branch.is_default) throw new Error("Pick another main branch first");
      const { error } = await supabase.from("branches").delete().eq("id", branch.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Branch removed"); qc.invalidateQueries({ queryKey: ["branches"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- transfer -----------------------------------------------------------
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ product_id: string; quantity: number }[]>([{ product_id: "", quantity: 1 }]);

  const transfer = useMutation({
    mutationFn: async () => {
      const clean = items.filter((i) => i.product_id && i.quantity > 0);
      if (!from || !to) throw new Error("Choose the sending and receiving branch");
      if (from === to) throw new Error("Pick two different branches");
      if (clean.length === 0) throw new Error("Add at least one product");
      const { data, error } = await supabase.rpc("transfer_stock", {
        _tenant: tenantId!,
        _from: from,
        _to: to,
        _items: clean as never,
        _notes: notes.trim() || undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (ref) => {
      toast.success(`Stock transferred — ${ref}`, { description: "Both branches were updated immediately." });
      setItems([{ product_id: "", quantity: 1 }]);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["branch_stock_rows"] });
      qc.invalidateQueries({ queryKey: ["branch_stock"] });
      qc.invalidateQueries({ queryKey: ["stock_transfers"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["pos_products"] });
    },
    onError: (e: Error) => toast.error("Transfer failed", { description: e.message }),
  });

  const stockRows = useMemo(
    () => products.filter((p) => branches.some((b) => stockAt(b.id, p.id) !== 0)),
    [products, branches, stock],
  );

  if (modules && !modules.has("branches")) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState
          title="Multiple branches is not on your plan"
          message="Ask the platform admin to switch on the Multiple branches module for your business, or upgrade your plan."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Branches"
        subtitle="Every shop keeps its own stock, sales and staff. Move goods between them in one step."
        action={
          canManage ? (
            <Button className="gradient-emerald text-white" onClick={() => { setForm(emptyForm); setOpen(true); }}>
              <Plus className="mr-1.5 h-4 w-4" />Add branch
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Branches</TabsTrigger>
          <TabsTrigger value="transfer">Stock transfer</TabsTrigger>
          <TabsTrigger value="stock">Stock by branch</TabsTrigger>
          <TabsTrigger value="history">Transfer history</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card className="border-0 p-4 shadow-soft">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No branches yet.</TableCell></TableRow>
                  )}
                  {branches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          <Building2 className="h-4 w-4 text-muted-foreground" />{b.name}
                          {b.is_default && <Badge variant="secondary" className="text-[10px]">Main</Badge>}
                        </div>
                        {b.address && <div className="text-xs text-muted-foreground">{b.address}</div>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.code || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={b.is_active ? "outline" : "destructive"}>{b.is_active ? "Open" : "Closed"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <div className="flex justify-end gap-1">
                            {!b.is_default && (
                              <Button variant="ghost" size="icon" title="Make main branch" onClick={() => makeDefault.mutate(b)}>
                                <Star className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost" size="icon" title="Edit"
                              onClick={() => {
                                setForm({
                                  id: b.id, name: b.name, code: b.code ?? "", phone: b.phone ?? "",
                                  address: b.address ?? "", is_active: b.is_active,
                                });
                                setOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {!b.is_default && (
                              <Button variant="ghost" size="icon" title="Remove" onClick={() => remove.mutate(b)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="transfer">
          <Card className="space-y-4 border-0 p-3 shadow-soft sm:p-4">
            {!canTransfer ? (
              <p className="text-sm text-muted-foreground">Only owners, managers and store managers can move stock.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <Label>Send from</Label>
                    <Select value={from} onValueChange={setFrom}>
                      <SelectTrigger><SelectValue placeholder="Sending branch" /></SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Send to</Label>
                    <Select value={to} onValueChange={setTo}>
                      <SelectTrigger><SelectValue placeholder="Receiving branch" /></SelectTrigger>
                      <SelectContent>
                        {branches.filter((b) => b.id !== from).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Products</Label>
                  {items.map((it, idx) => {
                    const available = from && it.product_id ? stockAt(from, it.product_id) : null;
                    return (
                      <div key={idx} className="grid grid-cols-[minmax(0,1fr)_72px_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_100px_auto]">
                        <div>
                          <Select
                            value={it.product_id}
                            onValueChange={(v) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, product_id: v } : x)))}
                          >
                            <SelectTrigger><SelectValue placeholder="Pick a product" /></SelectTrigger>
                            <SelectContent>
                              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {available != null && (
                            <p className="mt-1 text-xs text-muted-foreground">{available} available at the sending branch</p>
                          )}
                        </div>
                        <Input
                          type="number" min="0" step="1" className="text-right"
                          value={it.quantity}
                          onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) || 0 } : x)))}
                        />
                        <Button
                          variant="ghost" size="icon" disabled={items.length === 1}
                          onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => setItems((p) => [...p, { product_id: "", quantity: 1 }])}>
                    <Plus className="mr-1.5 h-4 w-4" />Add product
                  </Button>
                </div>

                <div>
                  <Label>Note (optional)</Label>
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for the transfer, driver name…" />
                </div>

                <Button
                  className="gradient-emerald text-white"
                  disabled={transfer.isPending}
                  onClick={() => transfer.mutate()}
                >
                  <ArrowLeftRight className="mr-1.5 h-4 w-4" />
                  {transfer.isPending ? "Moving stock…" : "Transfer stock"}
                </Button>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="stock">
          <Card className="border-0 p-3 shadow-soft sm:p-4">
            {/* mobile cards */}
            <div className="space-y-2 md:hidden">
              {stockRows.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No stock recorded yet.</p>
              )}
              {stockRows.map((p) => {
                const total = branches.reduce((s, b) => s + stockAt(b.id, p.id), 0);
                return (
                  <div key={p.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 truncate font-medium">{p.name}</div>
                      <Badge variant="secondary" className="shrink-0 tabular-nums">Total {total}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {branches.map((b) => (
                        <div key={b.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs">
                          <span className="min-w-0 truncate text-muted-foreground">{b.name}</span>
                          <span className="shrink-0 font-semibold tabular-nums">{stockAt(b.id, p.id)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Product</TableHead>
                    {branches.map((b) => <TableHead key={b.id} className="whitespace-nowrap text-right">{b.name}</TableHead>)}
                    <TableHead className="whitespace-nowrap text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockRows.length === 0 && (
                    <TableRow><TableCell colSpan={branches.length + 2} className="text-center text-sm text-muted-foreground">No stock recorded yet.</TableCell></TableRow>
                  )}
                  {stockRows.map((p) => {
                    const total = branches.reduce((s, b) => s + stockAt(b.id, p.id), 0);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap font-medium">{p.name}</TableCell>
                        {branches.map((b) => (
                          <TableCell key={b.id} className="text-right tabular-nums">{stockAt(b.id, p.id)}</TableCell>
                        ))}
                        <TableCell className="text-right font-semibold tabular-nums">{total}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="border-0 p-3 shadow-soft sm:p-4">
            {/* mobile cards */}
            <div className="space-y-2 md:hidden">
              {transfers.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No transfers yet.</p>
              )}
              {transfers.map((t) => (
                <div key={t.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{productName(t.product_id)}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{t.transfer_number}</div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 tabular-nums">{Number(t.quantity)}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span className="truncate">{branchName(t.from_branch_id)}</span>
                    <ArrowLeftRight className="h-3 w-3 shrink-0" />
                    <span className="truncate">{branchName(t.to_branch_id)}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{formatDate(t.created_at)}</div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No transfers yet.</TableCell></TableRow>
                  )}
                  {transfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(t.created_at)}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{t.transfer_number}</TableCell>
                      <TableCell className="whitespace-nowrap">{productName(t.product_id)}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(t.quantity)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{branchName(t.from_branch_id)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{branchName(t.to_branch_id)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Edit branch" : "Add a branch"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Branch name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kampala Road shop" /></div>
            <div><Label>Short code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="KLA" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Open for business</div>
                <p className="text-xs text-muted-foreground">Closed branches stay in reports but cannot be used for new sales.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save branch"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
