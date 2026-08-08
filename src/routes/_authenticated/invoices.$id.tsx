import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-helpers";
import { ArrowLeft, Download, Plus, Send, Trash2 } from "lucide-react";
import { formatMoney, formatDate, useCompanySettings } from "@/lib/company";
import { useActiveTenantId } from "@/lib/tenant";
import { generateInvoicePdf, loadCompanyLogo, savePdf } from "@/lib/pdf";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/invoices/$id")({
  head: () => ({ meta: [{ title: "Invoice" }] }),
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tenantId = useActiveTenantId();
  const { data: company } = useCompanySettings();
  const sym = company?.currency_symbol || "USh ";
  const [payOpen, setPayOpen] = useState(false);

  const { data: invoice } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customers(*), invoice_items(*), payments(*)")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("invoices").update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["invoice", id] }); },
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Invoice deleted"); navigate({ to: "/invoices" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordPayment = useMutation({
    mutationFn: async (form: FormData) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("payments").insert({
        tenant_id: tenantId,
        invoice_id: id,
        amount: Number(form.get("amount")),
        method: form.get("method") as "cash" | "bank_transfer" | "mobile_money" | "credit_card" | "cheque",
        payment_date: String(form.get("payment_date")),
        reference: String(form.get("reference") || ""),
        notes: String(form.get("notes") || ""),
        created_by: u.user?.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      setPayOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!invoice || !company) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const cust = invoice.customers as { name: string; company_name: string | null; email: string | null; phone: string | null; address: string | null; tax_id: string | null };
  const items = (invoice.invoice_items as Array<{ description: string; quantity: number; unit_price: number; line_total: number }>) ?? [];
  const payments = (invoice.payments as Array<{ id: string; amount: number; method: string; payment_date: string; reference: string | null }>) ?? [];

  const downloadPdf = async () => {
    let stage: "render" | "storage" | "response" = "render";
    try {
      const logo = await loadCompanyLogo(company);
      const pdf = generateInvoicePdf({
        number: invoice.invoice_number, date: formatDate(invoice.invoice_date),
        dueDate: invoice.due_date ? formatDate(invoice.due_date) : null,
        status: invoice.status, customer: cust,
        items: items.map((it) => ({ description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price), line_total: Number(it.line_total) })),
        subtotal: Number(invoice.subtotal), taxRate: Number(invoice.tax_rate),
        taxAmount: Number(invoice.tax_amount), discount: Number(invoice.discount),
        total: Number(invoice.total), amountPaid: Number(invoice.amount_paid), balance: Number(invoice.balance),
        notes: invoice.notes,
      }, company, logo);
      stage = "storage";
      stage = "response";
      savePdf(pdf, `${invoice.invoice_number}.pdf`);
      toast.success("PDF downloaded");
    } catch (e) {
      console.error(`PDF ${stage} failed`, e);
      const label = stage === "render" ? "render the PDF" : stage === "storage" ? "prepare the PDF file" : "deliver the download";
      toast.error(`Failed to ${label} (${stage})`, { description: (e as Error).message });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button asChild size="icon" variant="ghost"><Link to="/invoices"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <div className="text-xs text-muted-foreground">Invoice</div>
            <div className="text-xl font-bold">{invoice.invoice_number}</div>
          </div>
          <Badge variant="secondary" className="capitalize ml-3">{invoice.status}</Badge>
        </div>
        <div className="flex gap-2">
          <Select value={invoice.status} onValueChange={(v) => updateStatus.mutate(v)}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{["draft","sent","pending","partial","paid","overdue","cancelled"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={downloadPdf}><Download className="h-4 w-4 mr-1.5" />PDF</Button>
          {Number(invoice.balance) > 0 && (
            <Button onClick={() => setPayOpen(true)} className="gradient-emerald text-white"><Send className="h-4 w-4 mr-1.5" />Record payment</Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => confirm("Delete invoice? This cannot be undone.") && del.mutate()}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>

      <Card className="p-6 shadow-soft border-0">
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Bill to</div>
            <div className="font-bold">{cust.company_name || cust.name}</div>
            {cust.company_name && <div className="text-sm">{cust.name}</div>}
            <div className="text-xs text-muted-foreground mt-1">
              {cust.address}<br />{cust.email} {cust.phone && `• ${cust.phone}`}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Invoice date</div>
            <div className="font-semibold">{formatDate(invoice.invoice_date)}</div>
            <div className="text-xs text-muted-foreground mt-3 uppercase tracking-wider">Due date</div>
            <div className="font-semibold">{formatDate(invoice.due_date)}</div>
          </div>
          <div className="md:text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Balance due</div>
            <div className="text-3xl font-extrabold text-primary tabular-nums">{formatMoney(invoice.balance, sym)}</div>
            <div className="text-xs text-muted-foreground mt-1">of {formatMoney(invoice.total, sym)}</div>
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</div>
            <div className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "item" : "items"}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-10 px-4 py-2.5 text-left font-semibold">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Description</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Unit price</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b last:border-0 odd:bg-muted/10 hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-3 py-3 font-medium">{it.description}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{Number(it.quantity)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{formatMoney(it.unit_price, sym)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatMoney(it.line_total, sym)}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No items on this invoice</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>


        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Notes</div>
            <div className="text-sm whitespace-pre-wrap">{invoice.notes || "—"}</div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatMoney(invoice.subtotal, sym)}</span></div>
            {Number(invoice.discount) > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">-{formatMoney(invoice.discount, sym)}</span></div>}
            {Number(invoice.tax_amount) > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax ({Number(invoice.tax_rate)}%)</span><span className="tabular-nums">{formatMoney(invoice.tax_amount, sym)}</span></div>}
            <div className="flex justify-between pt-3 border-t font-bold"><span>Total</span><span className="tabular-nums">{formatMoney(invoice.total, sym)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Paid</span><span className="tabular-nums text-success">{formatMoney(invoice.amount_paid, sym)}</span></div>
            <div className="flex justify-between text-sm font-semibold"><span>Balance</span><span className="tabular-nums text-primary">{formatMoney(invoice.balance, sym)}</span></div>
          </div>
        </div>
      </Card>

      {payments.length > 0 && (
        <Card className="p-6 shadow-soft border-0">
          <div className="font-semibold mb-3">Payments received</div>
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b last:border-0 pb-2">
                <div>
                  <div className="font-medium tabular-nums">{formatMoney(p.amount, sym)}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(p.payment_date)} • {p.method.replace("_"," ")}{p.reference ? ` • ${p.reference}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); recordPayment.mutate(new FormData(e.currentTarget)); }} className="space-y-3">
            <div><Label>Amount ({sym})</Label><Input name="amount" type="number" step="0.01" defaultValue={Number(invoice.balance)} required /></div>
            <div>
              <Label>Method</Label>
              <Select name="method" defaultValue="cash">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="mobile_money">Mobile money</SelectItem>
                  <SelectItem value="credit_card">Credit card</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Payment date</Label><Input name="payment_date" type="date" defaultValue={new Date().toISOString().slice(0,10)} required /></div>
            <div><Label>Reference</Label><Input name="reference" placeholder="Transaction ID, cheque #…" /></div>
            <div><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button type="submit" className="gradient-emerald text-white"><Plus className="h-4 w-4 mr-1.5" />Record</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
