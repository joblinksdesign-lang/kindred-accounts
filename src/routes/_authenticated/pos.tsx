import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-helpers";
import { formatMoney, formatDate, useCompanySettings } from "@/lib/company";
import { useActiveTenantId } from "@/lib/tenant";
import { useTenantModules } from "@/lib/modules";
import { useProductImageUrls } from "@/lib/product-images";
import { generateReceiptPdf, generateThermalReceiptPdf, loadCompanyLogo, savePdf, printPdf } from "@/lib/pdf";
import { toast } from "sonner";
import {
  ShoppingCart, Minus, Plus, Trash2, PackageSearch, Search, ScanLine, CheckCircle2, Printer, Download, Receipt as ReceiptIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "Point of Sale — SmartInvoice Pro" },
      { name: "description", content: "Fast counter selling: tap products, take payment and print a thermal receipt instantly." },
      { property: "og:title", content: "Point of Sale — SmartInvoice Pro" },
      { property: "og:description", content: "Fast counter selling with instant receipts and live stock deduction." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosPage,
});

type PosProduct = {
  id: string; name: string; sku: string | null; barcode: string | null; category: string | null;
  unit_price: number; quantity: number; image_url: string | null; image_paths: string[] | null;
};

type Line = { product_id: string; name: string; unit_price: number; quantity: number };

type SaleResult = {
  invoiceId: string;
  invoiceNumber: string;
  receiptNumber: string;
  date: string;
  customer: { name: string; company_name: string | null; email: string | null };
  items: { description: string; quantity: number; unit_price: number; line_total: number }[];
  subtotal: number; discount: number; taxAmount: number; total: number; method: string;
};

function PosPage() {
  const qc = useQueryClient();
  const tenantId = useActiveTenantId();
  const { data: company } = useCompanySettings();
  const { data: modules } = useTenantModules();
  const sym = company?.currency_symbol || "USh ";

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState("walkin");
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState("cash");
  const [tendered, setTendered] = useState<string>("");
  const [sale, setSale] = useState<SaleResult | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["pos_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, barcode, category, unit_price, quantity, image_url, image_paths")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as PosProduct[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["pos_customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name, company_name").order("name");
      return data ?? [];
    },
  });

  const allPaths = useMemo(() => products.flatMap((p) => p.image_paths ?? []).slice(0, 60), [products]);
  const { data: urls = {} } = useProductImageUrls(allPaths);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[],
    [products],
  );

  const visible = products.filter((p) => {
    const term = q.trim().toLowerCase();
    const matchQ = !term || p.name.toLowerCase().includes(term)
      || (p.sku ?? "").toLowerCase().includes(term) || (p.barcode ?? "").toLowerCase().includes(term);
    return matchQ && (category === "all" || p.category === category);
  });

  const taxRate = Number(company?.default_tax_rate ?? 0);
  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const taxable = Math.max(subtotal - discount, 0);
  const taxAmount = (taxable * taxRate) / 100;
  const total = Math.max(taxable + taxAmount, 0);
  const change = Math.max(Number(tendered || 0) - total, 0);
  const count = cart.reduce((s, l) => s + l.quantity, 0);

  const add = (p: PosProduct) =>
    setCart((c) => {
      const found = c.find((l) => l.product_id === p.id);
      if (found) return c.map((l) => (l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { product_id: p.id, name: p.name, unit_price: Number(p.unit_price), quantity: 1 }];
    });

  const setQty = (id: string, qty: number) =>
    setCart((c) => (qty <= 0 ? c.filter((l) => l.product_id !== id) : c.map((l) => (l.product_id === id ? { ...l, quantity: qty } : l))));

  const reset = () => { setCart([]); setDiscount(0); setTendered(""); setCustomerId("walkin"); setMethod("cash"); };

  const onScanEnter = () => {
    const term = q.trim().toLowerCase();
    if (!term) return;
    const hit = products.find((p) => (p.barcode ?? "").toLowerCase() === term || (p.sku ?? "").toLowerCase() === term);
    if (hit) { add(hit); setQ(""); }
  };

  const checkout = useMutation({
    mutationFn: async (): Promise<SaleResult> => {
      if (cart.length === 0) throw new Error("Cart is empty");
      const { data: u } = await supabase.auth.getUser();

      // Resolve the customer (walk-in gets a reusable record).
      let cid = customerId;
      let cust = customers.find((c) => c.id === customerId) as
        | { id: string; name: string; company_name: string | null }
        | undefined;
      if (customerId === "walkin") {
        const { data: existing } = await supabase
          .from("customers").select("id, name, company_name").eq("name", "Walk-in Customer").limit(1);
        if (existing && existing.length > 0) { cid = existing[0].id; cust = existing[0]; }
        else {
          const { data: created, error } = await supabase
            .from("customers")
            .insert({ tenant_id: tenantId, name: "Walk-in Customer", notes: "Auto-created for POS sales", created_by: u.user?.id } as never)
            .select("id, name, company_name").single();
          if (error) throw error;
          cid = created.id; cust = created;
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          tenant_id: tenantId, customer_id: cid, invoice_number: "",
          invoice_date: today, due_date: today, status: "sent",
          subtotal, tax_rate: taxRate, tax_amount: taxAmount, discount, total,
          balance: total, notes: "POS sale", created_by: u.user?.id,
        } as never)
        .select("id, invoice_number").single();
      if (invErr) throw invErr;

      const items = cart.map((l) => ({
        tenant_id: tenantId, invoice_id: inv.id, product_id: l.product_id,
        description: l.name, quantity: l.quantity, unit_price: l.unit_price,
        line_total: l.unit_price * l.quantity,
      }));
      const { error: itemsErr } = await supabase.from("invoice_items").insert(items as never);
      if (itemsErr) throw itemsErr;

      const { error: payErr } = await supabase.from("payments").insert({
        tenant_id: tenantId, invoice_id: inv.id, amount: total,
        method: method as "cash" | "bank_transfer" | "mobile_money" | "credit_card" | "cheque",
        payment_date: today, reference: "POS", notes: "Point of sale", created_by: u.user?.id,
      } as never);
      if (payErr) throw payErr;

      const { data: receipt } = await supabase
        .from("receipts").select("receipt_number, payment_date").eq("invoice_id", inv.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        receiptNumber: receipt?.receipt_number || inv.invoice_number,
        date: formatDate(receipt?.payment_date || today),
        customer: { name: cust?.name || "Walk-in Customer", company_name: cust?.company_name ?? null, email: null },
        items: cart.map((l) => ({ description: l.name, quantity: l.quantity, unit_price: l.unit_price, line_total: l.unit_price * l.quantity })),
        subtotal, discount, taxAmount, total, method,
      };
    },
    onSuccess: (res) => {
      setSale(res);
      reset();
      toast.success(`Sale complete — receipt ${res.receiptNumber}`);
      qc.invalidateQueries({ queryKey: ["pos_products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not complete the sale"),
  });

  const receiptPayload = (res: SaleResult) => ({
    number: res.receiptNumber,
    date: res.date,
    invoiceNumber: res.invoiceNumber,
    customer: res.customer,
    amount: res.total,
    method: res.method,
    items: res.items,
    subtotal: res.subtotal,
    taxAmount: res.taxAmount,
    discount: res.discount,
  });

  const output = async (res: SaleResult, kind: "a4" | 58 | 80, action: "print" | "save") => {
    if (!company) { toast.error("Company settings not loaded"); return; }
    try {
      const logo = await loadCompanyLogo(company);
      const pdf = kind === "a4"
        ? generateReceiptPdf(receiptPayload(res), company, logo)
        : generateThermalReceiptPdf(receiptPayload(res), company, logo, kind);
      const name = `${res.receiptNumber}${kind === "a4" ? "" : `-${kind}mm`}.pdf`;
      if (action === "print") printPdf(pdf, name); else savePdf(pdf, name);
    } catch (e) {
      toast.error("Receipt failed", { description: (e as Error).message });
    }
  };

  if (modules && !modules.has("pos")) {
    return (
      <div className="max-w-xl mx-auto">
        <EmptyState
          title="Point of Sale is not on your plan"
          message="Ask the platform admin to enable the POS module for your business, or upgrade your plan."
        />
      </div>
    );
  }

  return (
    <div className="-mx-4 -my-6 md:-mx-8 md:-my-8">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] min-h-[calc(100vh-3.5rem)]">
        {/* Catalogue */}
        <div className="flex flex-col border-r">
          <div className="sticky top-14 z-10 border-b bg-card/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg gradient-emerald text-white shadow-soft">
                <ShoppingCart className="h-4 w-4" />
              </div>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onScanEnter(); } }}
                  placeholder="Scan barcode or search products…"
                  className="h-9 pl-8"
                />
              </div>
              <Badge variant="outline" className="hidden gap-1 sm:inline-flex"><ScanLine className="h-3 w-3" />Scanner ready</Badge>
            </div>
            {categories.length > 0 && (
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                <Chip active={category === "all"} onClick={() => setCategory("all")}>All</Chip>
                {categories.map((c) => <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Chip>)}
              </div>
            )}
          </div>

          <div className="flex-1 p-4">
            {visible.length === 0 ? (
              <EmptyState title="No products" message="Add products in Products & Inventory to start selling." />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {visible.map((p) => {
                  const img = (p.image_paths ?? [])[0] ? urls[(p.image_paths ?? [])[0]] : p.image_url;
                  const out = Number(p.quantity) <= 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => add(p)}
                      className="group overflow-hidden rounded-xl border bg-card text-left shadow-soft transition hover:border-primary hover:shadow-md active:scale-[.98]"
                    >
                      <div className="aspect-square w-full bg-muted">
                        {img ? (
                          <img src={img} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center text-muted-foreground"><PackageSearch className="h-7 w-7" /></div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <div className="line-clamp-2 text-xs font-semibold leading-snug">{p.name}</div>
                        <div className="mt-1 text-sm font-bold tabular-nums text-primary [overflow-wrap:anywhere]">{formatMoney(p.unit_price, sym)}</div>
                        <div className={`text-[10px] ${out ? "text-destructive" : "text-muted-foreground"}`}>
                          {out ? "Out of stock" : `${Number(p.quantity)} in stock`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Ticket */}
        <aside className="flex flex-col bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="font-bold">Current sale</div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{count} item{count === 1 ? "" : "s"}</Badge>
              {cart.length > 0 && <Button size="sm" variant="ghost" onClick={reset}>Clear</Button>}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {cart.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Tap a product to start a sale.</p>
            ) : cart.map((l) => (
              <div key={l.product_id} className="rounded-lg border p-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{formatMoney(l.unit_price, sym)}</div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">{formatMoney(l.unit_price * l.quantity, sym)}</div>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.product_id, l.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                  <Input
                    className="h-7 w-14 text-center"
                    value={l.quantity}
                    onChange={(e) => setQty(l.product_id, Number(e.target.value) || 0)}
                  />
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.product_id, l.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={() => setQty(l.product_id, 0)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walkin">Walk-in customer</SelectItem>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name || c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Payment</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mobile_money">Mobile money</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="credit_card">Credit card</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />
            <Row label="Subtotal" value={formatMoney(subtotal, sym)} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <Input className="h-7 w-28 text-right" type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
            </div>
            {taxRate > 0 && <Row label={`Tax (${taxRate}%)`} value={formatMoney(taxAmount, sym)} />}
            <div className="flex items-baseline justify-between border-t pt-2">
              <span className="font-bold">Total</span>
              <span className="text-xl font-extrabold tabular-nums text-primary [overflow-wrap:anywhere]">{formatMoney(total, sym)}</span>
            </div>
            {method === "cash" && (
              <div className="grid grid-cols-2 items-center gap-2">
                <div>
                  <Label className="text-[11px]">Cash received</Label>
                  <Input className="h-9 text-right" type="number" step="0.01" value={tendered} onChange={(e) => setTendered(e.target.value)} />
                </div>
                <div className="pt-4 text-right">
                  <div className="text-[11px] text-muted-foreground">Change</div>
                  <div className="font-bold tabular-nums">{formatMoney(change, sym)}</div>
                </div>
              </div>
            )}
            <Button
              className="h-12 w-full gradient-emerald text-base text-white"
              disabled={cart.length === 0 || checkout.isPending}
              onClick={() => checkout.mutate()}
            >
              {checkout.isPending ? "Processing…" : `Charge ${formatMoney(total, sym)}`}
            </Button>
          </div>
        </aside>
      </div>

      <Dialog open={!!sale} onOpenChange={(v) => !v && setSale(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" />Sale complete</DialogTitle></DialogHeader>
          {sale && (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Receipt</div>
                <div className="text-lg font-bold">{sale.receiptNumber}</div>
                <div className="mt-1 text-2xl font-extrabold tabular-nums text-primary">{formatMoney(sale.total, sym)}</div>
                <div className="text-xs text-muted-foreground">Invoice {sale.invoiceNumber} • {sale.method.replace("_", " ")}</div>
              </Card>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => output(sale, 80, "print")} className="gradient-emerald text-white"><Printer className="mr-1.5 h-4 w-4" />Print 80mm</Button>
                <Button variant="outline" onClick={() => output(sale, 58, "print")}><Printer className="mr-1.5 h-4 w-4" />Print 58mm</Button>
                <Button variant="outline" onClick={() => output(sale, 80, "save")}><ReceiptIcon className="mr-1.5 h-4 w-4" />Save 80mm</Button>
                <Button variant="outline" onClick={() => output(sale, "a4", "save")}><Download className="mr-1.5 h-4 w-4" />Save A4</Button>
              </div>
              <Button variant="ghost" className="w-full" onClick={() => setSale(null)}>New sale</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="tabular-nums">{value}</span></div>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${active ? "bg-foreground text-background" : "bg-background hover:bg-muted"}`}>
      {children}
    </button>
  );
}
