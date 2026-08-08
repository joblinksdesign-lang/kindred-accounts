import { createFileRoute } from "@tanstack/react-router";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, ListToolbar, EmptyState } from "@/components/page-helpers";
import { Plus, ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatDate, useCompanySettings } from "@/lib/company";
import { useActiveTenantId } from "@/lib/tenant";

export const Route = createFileRoute("/_authenticated/quotations")({
  head: () => ({ meta: [{ title: "Quotations" }] }),
  component: QuotationsPage,
});

type Line = { id: string; product_id: string | null; description: string; quantity: number; unit_price: number };

function QuotationsPage() {
  const qc = useQueryClient();
  const tenantId = useActiveTenantId();
  const { data: company } = useCompanySettings();
  const sym = company?.currency_symbol || "USh ";
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [taxRate, setTaxRate] = useState<number>(Number(company?.default_tax_rate || 0));
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ id: crypto.randomUUID(), product_id: null, description: "", quantity: 1, unit_price: 0 }]);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers_simple"],
    queryFn: async () => (await supabase.from("customers").select("id, name, company_name").order("name")).data ?? [],
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products_simple"],
    queryFn: async () => (await supabase.from("products").select("id, name, unit_price").order("name")).data ?? [],
  });

  const { data: quotations = [] } = useQuery({
    queryKey: ["quotations"],
    queryFn: async () => {
      const { data } = await supabase.from("quotations").select("*, customers(name, company_name)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.unit_price, 0), [lines]);
  const taxAmount = ((subtotal - discount) * taxRate) / 100;
  const total = Math.max(subtotal - discount + taxAmount, 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Select a customer");
      const { data: u } = await supabase.auth.getUser();
      const { data: quote, error } = await supabase.from("quotations").insert({
        tenant_id: tenantId,
        customer_id: customerId, valid_until: validUntil || null, status: "draft" as const,
        subtotal, tax_rate: taxRate, tax_amount: taxAmount, discount, total, notes,
        created_by: u.user?.id, quote_number: "",
      } as never).select().single();
      if (error) throw error;
      const inserted = quote as { id: string };
      const items = lines.map((l) => ({
        tenant_id: tenantId,
        quotation_id: inserted.id, product_id: l.product_id, description: l.description,
        quantity: l.quantity, unit_price: l.unit_price, line_total: l.quantity * l.unit_price,
      }));
      const { error: ie } = await supabase.from("quotation_items").insert(items as never);
      if (ie) throw ie;
    },
    onSuccess: () => {
      toast.success("Quotation created");
      qc.invalidateQueries({ queryKey: ["quotations"] });
      setOpen(false); setLines([{ id: crypto.randomUUID(), product_id: null, description: "", quantity: 1, unit_price: 0 }]);
      setCustomerId(""); setNotes(""); setDiscount(0);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: async (quoteId: string) => {
      const { data: quote } = await supabase.from("quotations").select("*, quotation_items(*)").eq("id", quoteId).single();
      if (!quote) throw new Error("Not found");
      const { data: u } = await supabase.auth.getUser();
      const { data: inv, error } = await supabase.from("invoices").insert({
        tenant_id: tenantId,
        customer_id: quote.customer_id, status: "draft" as const,
        subtotal: quote.subtotal, tax_rate: quote.tax_rate, tax_amount: quote.tax_amount,
        discount: quote.discount, total: quote.total, balance: quote.total,
        notes: quote.notes, created_by: u.user?.id, invoice_number: "",
      } as never).select().single();
      if (error) throw error;
      const insertedInv = inv as { id: string };
      const qi = (quote.quotation_items as Array<{ product_id: string | null; description: string; quantity: number; unit_price: number; line_total: number }>) ?? [];
      const items = qi.map((it) => ({
        tenant_id: tenantId,
        invoice_id: insertedInv.id, product_id: it.product_id, description: it.description,
        quantity: it.quantity, unit_price: it.unit_price, line_total: it.line_total,
      }));
      if (items.length) await supabase.from("invoice_items").insert(items as never);
      await supabase.from("quotations").update({ status: "converted" as const, converted_invoice_id: insertedInv.id } as never).eq("id", quoteId);
    },
    onSuccess: () => { toast.success("Converted to invoice"); qc.invalidateQueries({ queryKey: ["quotations"] }); qc.invalidateQueries({ queryKey: ["invoices"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateLine = (id: string, patch: Partial<Line>) => setLines((p) => p.map((l) => l.id === id ? { ...l, ...patch } : l));
  const filtered = quotations.filter((qt) => !q || qt.quote_number.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title="Quotations" subtitle="Send quotes and convert them into invoices when accepted."
        action={<Button className="gradient-emerald text-white" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New quote</Button>}
      />
      <Card className="p-4 shadow-soft border-0">
        <ListToolbar query={q} onQuery={setQ} placeholder="Search quote # or customer…" />
        {filtered.length === 0 ? (
          <EmptyState title="No quotations" message="Create a quotation to send to a prospective customer." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Valid until</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((qt) => {
                  const c = qt.customers as { name?: string; company_name?: string } | null;
                  return (
                    <TableRow key={qt.id}>
                      <TableCell className="font-medium">{qt.quote_number}</TableCell>
                      <TableCell>{c?.company_name || c?.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(qt.quote_date)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(qt.valid_until)}</TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{qt.status}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatMoney(qt.total, sym)}</TableCell>
                      <TableCell className="text-right">
                        {qt.status !== "converted" && (
                          <Button size="sm" variant="outline" onClick={() => convert.mutate(qt.id)}>
                            Convert <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>New quotation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Customer *</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name || c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Valid until</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-[11px] font-semibold uppercase text-muted-foreground">
                <div className="col-span-6">Description</div><div className="col-span-2 text-right">Qty</div><div className="col-span-2 text-right">Price</div><div className="col-span-2 text-right">Total</div>
              </div>
              {lines.map((l) => (
                <div key={l.id} className="grid grid-cols-12 gap-2 px-3 py-2 border-t items-center">
                  <div className="col-span-6 space-y-1">
                    <Select value={l.product_id ?? ""} onValueChange={(v) => { const p = products.find((x) => x.id === v); if (p) updateLine(l.id, { product_id: p.id, description: p.name, unit_price: Number(p.unit_price) }); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick product" /></SelectTrigger>
                      <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={l.description} onChange={(e) => updateLine(l.id, { description: e.target.value })} placeholder="Description" className="h-8" />
                  </div>
                  <div className="col-span-2"><Input type="number" step="0.01" className="h-8 text-right" value={l.quantity} onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value) })} /></div>
                  <div className="col-span-2"><Input type="number" step="0.01" className="h-8 text-right" value={l.unit_price} onChange={(e) => updateLine(l.id, { unit_price: Number(e.target.value) })} /></div>
                  <div className="col-span-2 text-right tabular-nums text-sm font-medium">{formatMoney(l.quantity * l.unit_price, sym)}</div>
                </div>
              ))}
              <div className="p-2 border-t">
                <Button size="sm" variant="ghost" onClick={() => setLines((p) => [...p, { id: crypto.randomUUID(), product_id: null, description: "", quantity: 1, unit_price: 0 }])}><Plus className="h-3 w-3 mr-1" />Add line</Button>
                {lines.length > 1 && <Button size="sm" variant="ghost" onClick={() => setLines((p) => p.slice(0, -1))}><Trash2 className="h-3 w-3 mr-1" />Remove last</Button>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="space-y-2 bg-muted/40 rounded-lg p-3 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatMoney(subtotal, sym)}</span></div>
                <div className="flex justify-between items-center"><span>Discount</span><Input className="h-7 w-24 text-right" type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
                <div className="flex justify-between items-center"><span>Tax %</span><Input className="h-7 w-24 text-right" type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} /></div>
                <div className="flex justify-between font-bold pt-2 border-t"><span>Total</span><span className="tabular-nums text-primary">{formatMoney(total, sym)}</span></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} className="gradient-emerald text-white">Save quote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
