import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-helpers";
import { formatMoney, useCompanyLogoUrl, useCompanySettings } from "@/lib/company";
import { downloadCsv, downloadReportPdf, toCsv, type ReportColumn } from "@/lib/report-pdf";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { Download, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — sales, expenses and inventory insights" },
      { name: "description", content: "Download professional daily, weekly, monthly or custom-range sales reports as PDF or CSV." },
      { property: "og:title", content: "Reports — sales, expenses and inventory insights" },
      { property: "og:description", content: "Group sales by day, week or month and export polished PDF and CSV reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

type Grouping = "day" | "week" | "month";
const iso = (d: Date) => d.toISOString().slice(0, 10);

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday start
  x.setDate(x.getDate() - day);
  return x;
}

function bucketOf(dateStr: string, grouping: Grouping) {
  const d = new Date(dateStr + "T00:00:00");
  if (grouping === "day") return { key: iso(d), label: d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) };
  if (grouping === "week") {
    const s = startOfWeek(d);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return {
      key: iso(s),
      label: `${s.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} – ${e.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`,
    };
  }
  return { key: dateStr.slice(0, 7), label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
}

function ReportsPage() {
  const { data: company } = useCompanySettings();
  const { data: logoUrl } = useCompanyLogoUrl(company);
  const sym = company?.currency_symbol || "USh ";

  const defaultFrom = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return iso(d); })();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(iso(new Date()));
  const [grouping, setGrouping] = useState<Grouping>("day");

  const { data } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const [inv, pay, cust, prod, exp] = await Promise.all([
        supabase.from("invoices").select("invoice_date, total, balance, amount_paid, status, customer_id"),
        supabase.from("payments").select("amount, payment_date, method"),
        supabase.from("customers").select("id, name, company_name"),
        supabase.from("products").select("name, quantity, reorder_level, unit_price, cost_price"),
        supabase.from("expenses").select("expense_date, amount, category"),
      ]);
      const invoices = inv.data ?? [];
      const payments = pay.data ?? [];
      const customers = cust.data ?? [];
      const products = prod.data ?? [];
      const expenses = (exp.data ?? []) as { expense_date: string; amount: number; category: string | null }[];

      const monthly: { label: string; sales: number; collected: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const key = d.toISOString().slice(0, 7);
        monthly.push({
          label: d.toLocaleDateString(undefined, { month: "short" }),
          sales: invoices.filter((x) => x.invoice_date?.startsWith(key)).reduce((s, x) => s + Number(x.total), 0),
          collected: payments.filter((p) => p.payment_date?.startsWith(key)).reduce((s, p) => s + Number(p.amount), 0),
        });
      }

      const balByCustomer = new Map<string, number>();
      invoices.forEach((i) => balByCustomer.set(i.customer_id, (balByCustomer.get(i.customer_id) || 0) + Number(i.balance)));
      const customerBalances = customers
        .map((c) => ({ name: c.company_name || c.name, balance: balByCustomer.get(c.id) || 0 }))
        .filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 10);

      const methodTotals = new Map<string, number>();
      payments.forEach((p) => methodTotals.set(p.method, (methodTotals.get(p.method) || 0) + Number(p.amount)));
      const methods = Array.from(methodTotals.entries()).map(([method, amount]) => ({ method, amount }));

      const valuation = products.reduce((s, p) => s + Number(p.quantity) * Number(p.cost_price), 0);
      const retailValue = products.reduce((s, p) => s + Number(p.quantity) * Number(p.unit_price), 0);

      return { monthly, customerBalances, methods, valuation, retailValue, products, invoices, payments, expenses };
    },
  });

  const rowsData = useMemo(() => {
    const invoices = data?.invoices ?? [];
    const payments = data?.payments ?? [];
    const expenses = data?.expenses ?? [];
    const inRange = (d?: string | null) => !!d && d >= from && d <= to;

    const map = new Map<string, { label: string; invoices: number; sales: number; collected: number; expenses: number }>();
    const ensure = (dateStr: string) => {
      const { key, label } = bucketOf(dateStr, grouping);
      if (!map.has(key)) map.set(key, { label, invoices: 0, sales: 0, collected: 0, expenses: 0 });
      return map.get(key)!;
    };

    invoices.filter((i) => inRange(i.invoice_date)).forEach((i) => {
      const b = ensure(i.invoice_date!);
      b.invoices += 1;
      b.sales += Number(i.total);
    });
    payments.filter((p) => inRange(p.payment_date)).forEach((p) => {
      ensure(p.payment_date!).collected += Number(p.amount);
    });
    expenses.filter((e) => inRange(e.expense_date)).forEach((e) => {
      ensure(e.expense_date).expenses += Number(e.amount);
    });

    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([, v]) => v);
  }, [data, from, to, grouping]);

  const totals = rowsData.reduce(
    (a, r) => ({ invoices: a.invoices + r.invoices, sales: a.sales + r.sales, collected: a.collected + r.collected, expenses: a.expenses + r.expenses }),
    { invoices: 0, sales: 0, collected: 0, expenses: 0 },
  );

  const periodLabel = grouping === "day" ? "Day" : grouping === "week" ? "Week" : "Month";
  const reportColumns: ReportColumn[] = [
    { header: periodLabel, align: "left" },
    { header: "Invoices", align: "right", width: 22 },
    { header: "Sales", align: "right", width: 32 },
    { header: "Collected", align: "right", width: 32 },
    { header: "Expenses", align: "right", width: 32 },
    { header: "Net", align: "right", width: 32 },
  ];
  const reportRows = rowsData.map((r) => [
    r.label,
    r.invoices,
    formatMoney(r.sales, sym),
    formatMoney(r.collected, sym),
    formatMoney(r.expenses, sym),
    formatMoney(r.collected - r.expenses, sym),
  ]);
  const totalsRow = [
    "Total",
    totals.invoices,
    formatMoney(totals.sales, sym),
    formatMoney(totals.collected, sym),
    formatMoney(totals.expenses, sym),
    formatMoney(totals.collected - totals.expenses, sym),
  ];

  const rangeText = `${new Date(from + "T00:00:00").toLocaleDateString()} – ${new Date(to + "T00:00:00").toLocaleDateString()} · grouped by ${grouping}`;

  const exportPdf = async () => {
    if (!company) return;
    try {
      await downloadReportPdf(
        { title: `Sales report (${periodLabel.toLowerCase()}ly)`, subtitle: rangeText, columns: reportColumns, rows: reportRows, totalsRow },
        company,
        `sales-report-${grouping}-${from}-to-${to}.pdf`,
      );
    } catch (err) {
      toast.error("Could not create PDF", { description: (err as Error).message });
    }
  };

  const quick = (days: number) => {
    const d = new Date(); d.setDate(d.getDate() - (days - 1));
    setFrom(iso(d)); setTo(iso(new Date()));
  };

  return (
    <div>
      {company && (
        <div className="flex items-center gap-3 mb-4">
          {logoUrl && <img src={logoUrl} alt={`${company.company_name} logo`} className="h-10 w-10 rounded object-contain bg-white border" />}
          <div>
            <div className="font-semibold">{company.company_name}</div>
            {company.address && <div className="text-xs text-muted-foreground">{company.address}</div>}
          </div>
        </div>
      )}
      <PageHeader title="Reports" subtitle="Sales, payments, expenses, inventory and customer reports." />
      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <Card className="p-5 shadow-soft border-0 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[9.5rem]" />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-[9.5rem]" />
              </div>
              <div className="flex gap-1">
                {[["Today", 1], ["7 days", 7], ["30 days", 30], ["90 days", 90]].map(([label, d]) => (
                  <Button key={String(label)} size="sm" variant="outline" className="h-9" onClick={() => quick(Number(d))}>{label}</Button>
                ))}
              </div>
              <div className="flex gap-1">
                {(["day", "week", "month"] as Grouping[]).map((g) => (
                  <Button key={g} size="sm" variant={grouping === g ? "default" : "outline"} className={`h-9 capitalize ${grouping === g ? "gradient-emerald text-white" : ""}`} onClick={() => setGrouping(g)}>
                    {g}ly
                  </Button>
                ))}
              </div>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" className="h-9" disabled={!reportRows.length}
                  onClick={() => downloadCsv(`sales-report-${grouping}.csv`, toCsv(reportColumns, reportRows))}>
                  <FileSpreadsheet className="h-4 w-4 mr-1.5" />CSV
                </Button>
                <Button size="sm" className="h-9 gradient-emerald text-white" disabled={!reportRows.length || !company} onClick={exportPdf}>
                  <Download className="h-4 w-4 mr-1.5" />PDF
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Sales", value: formatMoney(totals.sales, sym) },
                { label: "Collected", value: formatMoney(totals.collected, sym) },
                { label: "Expenses", value: formatMoney(totals.expenses, sym) },
                { label: "Net cash", value: formatMoney(totals.collected - totals.expenses, sym) },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border bg-card p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
                  <div className="mt-1 text-base sm:text-lg xl:text-xl font-bold tabular-nums break-words [overflow-wrap:anywhere]">{k.value}</div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{periodLabel}</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsData.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No activity in this period.</TableCell></TableRow>
                  ) : rowsData.map((r) => (
                    <TableRow key={r.label}>
                      <TableCell className="font-medium whitespace-nowrap">{r.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.invoices}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(r.sales, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(r.collected, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap text-destructive">{formatMoney(r.expenses, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold">{formatMoney(r.collected - r.expenses, sym)}</TableCell>
                    </TableRow>
                  ))}
                  {rowsData.length > 0 && (
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right tabular-nums">{totals.invoices}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(totals.sales, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(totals.collected, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(totals.expenses, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(totals.collected - totals.expenses, sym)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-5 shadow-soft border-0">
            <h3 className="font-semibold mb-3">Sales &amp; collections — 12 months</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.monthly ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="label" fontSize={12} stroke="#94a3b8" />
                  <YAxis fontSize={12} stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="sales" fill="#0B6E4F" radius={[4,4,0,0]} />
                  <Bar dataKey="collected" fill="#F59E0B" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="customers">
          <Card className="p-5 shadow-soft border-0">
            <h3 className="font-semibold mb-3">Top outstanding balances</h3>
            {(data?.customerBalances ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No outstanding balances.</div>
            ) : (
              <div className="space-y-2">
                {data?.customerBalances.map((c) => (
                  <div key={c.name} className="flex justify-between border-b last:border-0 py-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="tabular-nums font-semibold text-primary">{formatMoney(c.balance, sym)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5 shadow-soft border-0">
              <div className="text-xs uppercase text-muted-foreground">Cost valuation</div>
              <div className="text-2xl xl:text-3xl font-bold mt-2 tabular-nums break-words [overflow-wrap:anywhere]">{formatMoney(data?.valuation, sym)}</div>
            </Card>
            <Card className="p-5 shadow-soft border-0">
              <div className="text-xs uppercase text-muted-foreground">Retail value</div>
              <div className="text-2xl xl:text-3xl font-bold mt-2 tabular-nums text-primary break-words [overflow-wrap:anywhere]">{formatMoney(data?.retailValue, sym)}</div>
            </Card>
          </div>
          <Card className="p-5 shadow-soft border-0">
            <h3 className="font-semibold mb-3">Low stock</h3>
            {(data?.products ?? []).filter((p) => Number(p.quantity) <= Number(p.reorder_level)).length === 0 ? (
              <div className="text-sm text-muted-foreground">All products above reorder level.</div>
            ) : (data?.products ?? []).filter((p) => Number(p.quantity) <= Number(p.reorder_level)).map((p) => (
              <div key={p.name} className="flex justify-between border-b last:border-0 py-2">
                <span>{p.name}</span>
                <span className="tabular-nums text-destructive">{Number(p.quantity)} / {Number(p.reorder_level)}</span>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="financial">
          <Card className="p-5 shadow-soft border-0">
            <h3 className="font-semibold mb-3">Payments by method</h3>
            {(data?.methods ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No payments yet.</div>
            ) : data?.methods.map((m) => (
              <div key={m.method} className="flex justify-between border-b last:border-0 py-2">
                <span className="capitalize">{m.method.replace("_"," ")}</span>
                <span className="tabular-nums font-semibold">{formatMoney(m.amount, sym)}</span>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
