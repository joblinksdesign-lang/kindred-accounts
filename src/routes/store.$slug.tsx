import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getStorefront, submitStoreOrder, type StoreOrderResult } from "@/lib/storefront.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { ShoppingCart, Plus, Minus, Trash2, Send, Download, PackageSearch } from "lucide-react";
import { formatMoney } from "@/lib/company";

export const Route = createFileRoute("/store/$slug")({
  loader: async ({ params }) => {
    const data = await getStorefront({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Store unavailable" }, { name: "robots", content: "noindex" }] };
    }
    const title = `${loaderData.company.company_name} — Online Store`;
    const description =
      loaderData.company.store_headline ||
      `Browse products from ${loaderData.company.company_name} and send your order straight to us on WhatsApp.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => <CenterMessage title="Store unavailable" text="We couldn't load this store right now." />,
  notFoundComponent: () => <CenterMessage title="Store not found" text="This shop link doesn't exist or the store is switched off." />,
  component: Storefront,
});

function CenterMessage({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div>
        <PackageSearch className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

type CartLine = { product_id: string; name: string; unit_price: number; quantity: number };

function Storefront() {
  const store = Route.useLoaderData();
  const { company, products, tenant } = store;
  const symbol = company.currency_symbol || tenant.currency_symbol;
  const accent = company.brand_color || "#0b6e4f";

  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<StoreOrderResult | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[],
    [products],
  );

  const visible = products.filter((p) => {
    const q = query.trim().toLowerCase();
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
    const matchC = category === "all" || p.category === category;
    return matchQ && matchC;
  });

  const add = (id: string, name: string, price: number) => {
    setCart((c) => {
      const found = c.find((l) => l.product_id === id);
      if (found) return c.map((l) => (l.product_id === id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { product_id: id, name, unit_price: price, quantity: 1 }];
    });
    toast.success(`${name} added to cart`);
  };
  const setQty = (id: string, qty: number) =>
    setCart((c) =>
      qty <= 0 ? c.filter((l) => l.product_id !== id) : c.map((l) => (l.product_id === id ? { ...l, quantity: qty } : l)),
    );

  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const taxAmount = (subtotal * (company.default_tax_rate || 0)) / 100;
  const total = subtotal + taxAmount;
  const count = cart.reduce((s, l) => s + l.quantity, 0);

  const submit = useMutation({
    mutationFn: async (form: {
      name: string; phone: string; email: string; address: string; notes: string;
    }) =>
      submitStoreOrder({
        data: {
          slug: tenant.slug,
          customer: form,
          items: cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        },
      }),
    onSuccess: (res) => {
      setResult(res);
      setCart([]);
      toast.success(`Order ${res.quoteNumber} created`);
    },
    onError: (e: Error) => toast.error(e.message || "Could not submit your order"),
  });

  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", notes: "" });

  const buildPdf = async (res: StoreOrderResult) => {
    const { generateInvoicePdf, loadLogoDataUrl } = await import("@/lib/pdf");
    const logo = await loadLogoDataUrl(company.logo_url);
    const companySettings = {
      company_name: company.company_name,
      tagline: company.tagline,
      brand_color: company.brand_color,
      email: company.email,
      phone: company.phone,
      website: company.website,
      address: company.address,
      city: company.city,
      country: company.country,
      currency_symbol: symbol,
      invoice_template: "bold",
    } as never;
    return generateInvoicePdf(
      {
        number: res.quoteNumber,
        date: res.date,
        status: "sent",
        docTitle: "Quotation",
        customer: { name: customer.name, phone: customer.phone, email: customer.email, address: customer.address },
        items: res.items,
        subtotal: res.subtotal,
        taxRate: res.taxRate,
        taxAmount: res.taxAmount,
        discount: 0,
        total: res.total,
        amountPaid: 0,
        balance: res.total,
        notes: customer.notes || null,
        template: "bold",
      },
      companySettings,
      logo,
    );
  };

  const downloadPdf = async (res: StoreOrderResult) => {
    try {
      const { savePdf } = await import("@/lib/pdf");
      await savePdf(await buildPdf(res), `${res.quoteNumber}.pdf`);
    } catch (e) {
      toast.error(`Could not create the PDF: ${(e as Error).message}`);
    }
  };

  const sendWhatsApp = async (res: StoreOrderResult) => {
    await downloadPdf(res);
    const digits = (res.whatsappNumber || "").replace(/\D/g, "");
    if (!digits) {
      toast.error("This shop hasn't added a WhatsApp number yet.");
      return;
    }
    const lines = [
      `*New order — ${company.company_name}*`,
      `Quotation: ${res.quoteNumber}`,
      `Name: ${customer.name}`,
      `Phone: ${customer.phone}`,
      customer.address ? `Address: ${customer.address}` : null,
      "",
      ...res.items.map((i) => `• ${i.description} x${i.quantity} — ${formatMoney(i.line_total, symbol)}`),
      "",
      `Subtotal: ${formatMoney(res.subtotal, symbol)}`,
      res.taxAmount ? `Tax: ${formatMoney(res.taxAmount, symbol)}` : null,
      `*Total: ${formatMoney(res.total, symbol)}*`,
      "",
      "The quotation PDF has been downloaded to my device — attaching it here.",
    ].filter(Boolean);
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background" style={{ ["--brand" as string]: accent }}>
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          {company.logo_url ? (
            <img src={company.logo_url} alt={`${company.company_name} logo`} className="h-10 w-10 rounded-lg object-contain" />
          ) : (
            <div className="grid h-10 w-10 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: accent }}>
              {company.company_name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight">{company.company_name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{company.tagline || company.city || "Online store"}</div>
          </div>
          <div className="ml-auto">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button className="gap-2 text-white" style={{ background: accent }}>
                  <ShoppingCart className="h-4 w-4" />
                  <span className="hidden sm:inline">Cart</span>
                  {count > 0 && <Badge variant="secondary" className="ml-1">{count}</Badge>}
                </Button>
              </SheetTrigger>
              <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
                <SheetHeader><SheetTitle>{result ? "Order placed" : "Your cart"}</SheetTitle></SheetHeader>
                {result ? (
                  <div className="space-y-4 py-4">
                    <Card className="p-4">
                      <div className="text-sm">Quotation <span className="font-semibold">{result.quoteNumber}</span> was created for {company.company_name}.</div>
                      <div className="mt-1 text-lg font-bold">{formatMoney(result.total, symbol)}</div>
                    </Card>
                    <Button className="w-full gap-2 text-white" style={{ background: "#25D366" }} onClick={() => sendWhatsApp(result)}>
                      <Send className="h-4 w-4" />Send order to shop owner
                    </Button>
                    <Button variant="outline" className="w-full gap-2" onClick={() => downloadPdf(result)}>
                      <Download className="h-4 w-4" />Download quotation PDF
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => { setResult(null); setOpen(false); }}>
                      Continue shopping
                    </Button>
                  </div>
                ) : cart.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Your cart is empty.</p>
                ) : (
                  <div className="flex flex-1 flex-col py-4">
                    <div className="space-y-3">
                      {cart.map((l) => (
                        <div key={l.product_id} className="flex items-center gap-2 rounded-lg border p-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{l.name}</div>
                            <div className="text-xs text-muted-foreground">{formatMoney(l.unit_price, symbol)}</div>
                          </div>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.product_id, l.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                          <span className="w-6 text-center text-sm tabular-nums">{l.quantity}</span>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.product_id, l.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQty(l.product_id, 0)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                      ))}
                    </div>
                    <Separator className="my-4" />
                    <div className="space-y-1 text-sm">
                      <Row label="Subtotal" value={formatMoney(subtotal, symbol)} />
                      {company.default_tax_rate > 0 && <Row label={`Tax (${company.default_tax_rate}%)`} value={formatMoney(taxAmount, symbol)} />}
                      <div className="flex justify-between pt-1 text-base font-bold"><span>Total</span><span>{formatMoney(total, symbol)}</span></div>
                    </div>
                    <Separator className="my-4" />
                    <form
                      className="space-y-3"
                      onSubmit={(e) => { e.preventDefault(); submit.mutate(customer); }}
                    >
                      <div className="text-sm font-semibold">Your details</div>
                      <div><Label>Full name *</Label><Input required maxLength={120} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></div>
                      <div><Label>Phone *</Label><Input required maxLength={40} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></div>
                      <div><Label>Email</Label><Input type="email" maxLength={160} value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></div>
                      <div><Label>Delivery address</Label><Input maxLength={300} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></div>
                      <div><Label>Notes</Label><Textarea rows={2} maxLength={600} value={customer.notes} onChange={(e) => setCustomer({ ...customer, notes: e.target.value })} /></div>
                      <Button type="submit" disabled={submit.isPending} className="w-full text-white" style={{ background: accent }}>
                        {submit.isPending ? "Submitting…" : "Checkout"}
                      </Button>
                    </form>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <section className="border-b" style={{ background: `linear-gradient(135deg, ${accent}14, transparent)` }}>
        <div className="mx-auto max-w-6xl px-4 py-8">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {company.store_headline || `Shop with ${company.company_name}`}
          </h1>
          {company.store_about && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{company.store_about}</p>}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input placeholder="Search products…" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:max-w-xs bg-background" />
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <Chip active={category === "all"} onClick={() => setCategory("all")}>All</Chip>
                {categories.map((c) => (
                  <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Chip>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {visible.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No products match your search.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((p) => (
              <Card key={p.id} className="flex flex-col overflow-hidden border-0 shadow-soft">
                <div className="aspect-square w-full bg-muted">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-muted-foreground"><PackageSearch className="h-8 w-8" /></div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  {p.category && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.category}</span>}
                  <div className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</div>
                  <div className="mt-auto pt-2 text-base font-bold tabular-nums [overflow-wrap:anywhere]">
                    {formatMoney(p.unit_price, symbol)}
                  </div>
                  <Button size="sm" className="mt-2 w-full text-white" style={{ background: accent }} onClick={() => add(p.id, p.name, p.unit_price)}>
                    Add to cart
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        <div>{company.company_name}{company.phone ? ` • ${company.phone}` : ""}{company.email ? ` • ${company.email}` : ""}</div>
        <div className="mt-1">Powered by SmartInvoice Pro</div>
      </footer>
      <Toaster richColors position="top-right" />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className="tabular-nums text-foreground">{value}</span></div>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs ${active ? "bg-foreground text-background" : "bg-background hover:bg-muted"}`}>
      {children}
    </button>
  );
}
