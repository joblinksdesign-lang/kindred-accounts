import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, EmptyState } from "@/components/page-helpers";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, useCompanySettings } from "@/lib/company";
import { useActiveTenantId } from "@/lib/tenant";

export const Route = createFileRoute("/_authenticated/invoices/edit/$id")({
  head: () => ({
    meta: [
      { title: "Edit draft invoice — SmartInvoice Pro" },
      { name: "description", content: "Change line items, totals and details on a draft invoice before you send it." },
      { property: "og:title", content: "Edit draft invoice — SmartInvoice Pro" },
      { property: "og:description", content: "Update a draft invoice's customer, items and totals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditInvoicePage,
});

type Line = { id: string; product_id: string | null; description: string; quantity: number; unit_price: number };

function EditInvoicePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const tenantId = useActiveTenantId();
  const { data: company } = useCompanySettings();
  const sym = company?.currency_symbol || "USh ";

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice_edit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_items(id, product_id, description, quantity, unit_price)")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers_simple"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name, company_name").order("name");
      return data ?? [];
    },
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products_simple"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, unit_price").order("name");
      return data ?? [];
    },
  });

  const [customerId, setCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("draft");
  const [taxRate, setTaxRate] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    if (!invoice) return;
    setCustomerId(invoice.customer_id);
    setInvoiceDate(invoice.invoice_date);
    setDueDate(invoice.due_date ?? "");
    setStatus(invoice.status);
    setTaxRate(Number(invoice.tax_rate));
    setDiscount(Number(invoice.discount));
    setNotes(invoice.notes ?? "");
    const items = (invoice.invoice_items ?? []) as {
      id: string; product_id: string | null; description: string; quantity: number; unit_price: number;
    }[];
    setLines(
      items.length > 0
        ? items.map((it) => ({
            id: it.id, product_id: it.product_id, description: it.description,
            quantity: Number(it.quantity), unit_price: Number(it.unit_price),
          }))
        : [{ id: crypto.randomUUID(), product_id: null, description: "", quantity: 1, unit_price: 0 }],
    );
  }, [invoice]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.unit_price, 0), [lines]);
  const taxAmount = useMemo(() => ((subtotal - discount) * taxRate) / 100, [subtotal, discount, taxRate]);
  const total = useMemo(() => Math.max(subtotal - discount + taxAmount, 0), [subtotal, discount, taxAmount]);

  const updateLine = (lineId: string, patch: Partial<Line>) =>
    setLines((p) => p.map((l) => (l.id === lineId ? { ...l, ...patch } : l)));
  const removeLine = (lineId: string) => setLines((p) => p.filter((l) => l.id !== lineId));
  const addLine = () => setLines((p) => [...p, { id: crypto.randomUUID(), product_id: null, description: "", quantity: 1, unit_price: 0 }]);
  const onPickProduct = (lineId: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    updateLine(lineId, { product_id: p.id, description: p.name, unit_price: Number(p.unit_price) });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Select a customer");
      if (lines.length === 0 || lines.some((l) => !l.description)) throw new Error("Add at least one line item with a description");
      const { error } = await supabase.from("invoices").update({
        customer_id: customerId,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        status: status as "draft" | "sent" | "pending",
        subtotal, tax_rate: taxRate, tax_amount: taxAmount, discount, total,
        balance: total, notes,
      } as never).eq("id", id);
      if (error) throw error;

      const { error: delErr } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
      if (delErr) throw delErr;
      const items = lines.map((l) => ({
        tenant_id: tenantId, invoice_id: id, product_id: l.product_id, description: l.description,
        quantity: l.quantity, unit_price: l.unit_price, line_total: l.quantity * l.unit_price,
      }));
      const { error: insErr } = await supabase.from("invoice_items").insert(items as never);
      if (insErr) throw insErr;
    },
    onSuccess: () => { toast.success("Invoice updated"); navigate({ to: "/invoices/$id", params: { id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading invoice…</p>;
  if (invoice && invoice.status !== "draft") {
    return (
      <div className="max-w-xl mx-auto">
        <EmptyState
          title="Only draft invoices can be edited"
          message={`Invoice ${invoice.invoice_number} is marked "${invoice.status}". Cancel it and raise a new one instead.`}
          action={<Button onClick={() => navigate({ to: "/invoices/$id", params: { id } })}>Open invoice</Button>}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title={`Edit ${invoice?.invoice_number ?? "invoice"}`} subtitle="Draft invoices stay fully editable until you send them." />
      <Card className="p-6 shadow-soft border-0 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label>Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name || c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Invoice date</Label><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
          <div><Label>Due date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-base">Line items</Label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="h-4 w-4 mr-1.5" />Add line</Button>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <div className="col-span-5">Description</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-2 text-right">Unit price</div>
                <div className="col-span-2 text-right">Total</div>
                <div className="col-span-1"></div>
              </div>
              {lines.map((l) => (
                <div key={l.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2 border-t">
                  <div className="col-span-5 space-y-1">
                    <Select value={l.product_id ?? ""} onValueChange={(v) => onPickProduct(l.id, v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick product (optional)" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={l.description} onChange={(e) => updateLine(l.id, { description: e.target.value })} placeholder="Description" className="h-8" />
                  </div>
                  <div className="col-span-2"><Input type="number" step="0.01" className="h-8 text-right" value={l.quantity} onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value) })} /></div>
                  <div className="col-span-2"><Input type="number" step="0.01" className="h-8 text-right" value={l.unit_price} onChange={(e) => updateLine(l.id, { unit_price: Number(e.target.value) })} /></div>
                  <div className="col-span-2 text-right tabular-nums font-medium">{formatMoney(l.quantity * l.unit_price, sym)}</div>
                  <div className="col-span-1 text-right">
                    <Button size="icon" variant="ghost" onClick={() => removeLine(l.id)} disabled={lines.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground sm:hidden">Swipe sideways to see all columns.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div><Label>Notes</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <div><Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["draft","sent","pending"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2 bg-muted/40 rounded-lg p-4">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatMoney(subtotal, sym)}</span></div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Discount</span>
              <Input className="h-7 w-28 text-right" type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Tax rate %</span>
              <Input className="h-7 w-28 text-right" type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} />
            </div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax amount</span><span className="tabular-nums">{formatMoney(taxAmount, sym)}</span></div>
            <div className="flex justify-between pt-3 border-t mt-2 text-lg font-bold"><span>Total</span><span className="tabular-nums text-primary">{formatMoney(total, sym)}</span></div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => navigate({ to: "/invoices/$id", params: { id } })}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gradient-emerald text-white">{save.isPending ? "Saving…" : "Save changes"}</Button>
        </div>
      </Card>
    </div>
  );
}
