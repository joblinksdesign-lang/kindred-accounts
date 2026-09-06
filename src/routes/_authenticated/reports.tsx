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
import { Download, FileSpreadsheet, AlertTriangle, TrendingDown, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

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
      const [inv, pay, cust, prod, exp, itm, stk, prf] = await Promise.all([
        supabase.from("invoices").select("id, invoice_number, invoice_date, total, balance, amount_paid, status, customer_id, created_at, created_by"),
        supabase.from("payments").select("amount, payment_date, method, reference, created_at, created_by, invoice_id"),
        supabase.from("customers").select("id, name, company_name, email, phone, city, store_code"),
        supabase.from("products").select("name, quantity, reorder_level, unit_price, cost_price"),
        supabase.from("expenses").select("expense_date, amount, category, description, vendor, created_at, created_by"),
        supabase.from("invoice_items").select("quantity, description, invoices(invoice_date, status), products(name, cost_price)"),
        supabase.from("stock_movements").select("change_qty, reason, reference, created_at, created_by, products(name)").order("created_at", { ascending: false }).limit(1000),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      const invoices = inv.data ?? [];
      const payments = pay.data ?? [];
      const customers = cust.data ?? [];
      const products = prod.data ?? [];
      const expenses = (exp.data ?? []) as {
        expense_date: string; amount: number; category: string | null; description: string;
        vendor: string | null; created_at: string; created_by: string | null;
      }[];
      const items = (itm.data ?? []) as unknown as {
        quantity: number; description: string;
        invoices: { invoice_date: string | null; status: string } | null;
        products: { name: string; cost_price: number } | null;
      }[];
      const movements = (stk.data ?? []) as unknown as {
        change_qty: number; reason: string; reference: string | null; created_at: string;
        created_by: string | null; products: { name: string } | null;
      }[];
      const profiles = (prf.data ?? []) as { id: string; full_name: string | null; email: string | null }[];


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

      return { monthly, customerBalances, methods, valuation, retailValue, products, invoices, payments, expenses, customers, items, movements, profiles };
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

  // ---- Per-customer report ----
  type CustomerRow = {
    name: string; contact: string; email: string; phone: string; city: string; code: string;
    invoices: number; sales: number; paid: number; balance: number; last: string; overdue: number;
  };
  const customerRows: CustomerRow[] = useMemo(() => {
    const customers = (data?.customers ?? []) as {
      id: string; name: string; company_name: string | null; email: string | null;
      phone: string | null; city: string | null; store_code: string | null;
    }[];
    const invoices = data?.invoices ?? [];
    const inRange = (d?: string | null) => !!d && d >= from && d <= to;
    const scoped = invoices.filter((i) => inRange(i.invoice_date));

    return customers
      .map((c) => {
        const mine = scoped.filter((i) => i.customer_id === c.id);
        const sales = mine.reduce((s, i) => s + Number(i.total), 0);
        const paid = mine.reduce((s, i) => s + Number(i.amount_paid), 0);
        const balance = mine.reduce((s, i) => s + Number(i.balance), 0);
        const overdue = mine.filter((i) => i.status === "overdue").reduce((s, i) => s + Number(i.balance), 0);
        const last = mine.map((i) => i.invoice_date!).sort().slice(-1)[0] ?? "";
        return {
          name: c.company_name || c.name,
          contact: c.company_name ? c.name : "",
          email: c.email || "",
          phone: c.phone || "",
          city: c.city || "",
          code: c.store_code || "",
          invoices: mine.length,
          sales, paid, balance, overdue,
          last,
        };
      })
      .filter((r) => r.invoices > 0 || r.balance !== 0)
      .sort((a, b) => b.sales - a.sales);
  }, [data, from, to]);

  const customerTotals = customerRows.reduce(
    (a, r) => ({ invoices: a.invoices + r.invoices, sales: a.sales + r.sales, paid: a.paid + r.paid, balance: a.balance + r.balance, overdue: a.overdue + r.overdue }),
    { invoices: 0, sales: 0, paid: 0, balance: 0, overdue: 0 },
  );

  const customerColumns: ReportColumn[] = [
    { header: "#", align: "right", width: 7 },
    { header: "Customer", align: "left", width: 42 },
    { header: "Contact person", align: "left", width: 28 },
    { header: "Code", align: "left", width: 15 },
    { header: "City", align: "left", width: 20 },
    { header: "Invoices", align: "right", width: 15 },
    { header: "Sales", align: "right", width: 24 },
    { header: "Paid", align: "right", width: 24 },
    { header: "Balance", align: "right", width: 24 },
    { header: "Overdue", align: "right", width: 24 },
    { header: "Last invoice", align: "left", width: 22 },
  ];

  const customerReportRows = customerRows.map((r, i) => [
    i + 1, r.name, r.contact || "—", r.code || "—", r.city || "—",
    r.invoices,
    formatMoney(r.sales, sym),
    formatMoney(r.paid, sym),
    formatMoney(r.balance, sym),
    formatMoney(r.overdue, sym),
    r.last ? new Date(r.last + "T00:00:00").toLocaleDateString() : "—",
  ]);
  const customerTotalsRow = [
    "", "Total", "", "", "",
    customerTotals.invoices,
    formatMoney(customerTotals.sales, sym),
    formatMoney(customerTotals.paid, sym),
    formatMoney(customerTotals.balance, sym),
    formatMoney(customerTotals.overdue, sym),
    "",
  ];
  const customerRangeText = `${new Date(from + "T00:00:00").toLocaleDateString()} – ${new Date(to + "T00:00:00").toLocaleDateString()} · ${customerRows.length} customers`;

  const exportCustomerPdf = async () => {
    if (!company) return;
    try {
      await downloadReportPdf(
        {
          title: "Customer report",
          subtitle: customerRangeText,
          columns: customerColumns,
          rows: customerReportRows,
          totalsRow: customerTotalsRow,
          orientation: "landscape",
        },
        company,
        `customer-report-${from}-to-${to}.pdf`,
      );
    } catch (err) {
      toast.error("Could not create PDF", { description: (err as Error).message });
    }
  };


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

  // ---- Profit & loss ----
  const pl = useMemo(() => {
    const inRange = (d?: string | null) => !!d && d >= from && d <= to;
    const counted = (status?: string) => status !== "cancelled" && status !== "draft";
    const invoices = (data?.invoices ?? []).filter((i) => inRange(i.invoice_date) && counted(i.status));
    const items = (data?.items ?? []).filter((it) => it.invoices && inRange(it.invoices.invoice_date) && counted(it.invoices.status));
    const expenses = (data?.expenses ?? []).filter((e) => inRange(e.expense_date));

    const revenue = invoices.reduce((s, i) => s + Number(i.total), 0);
    const cogs = items.reduce((s, it) => s + Number(it.quantity) * Number(it.products?.cost_price ?? 0), 0);
    const grossProfit = revenue - cogs;
    const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const netProfit = grossProfit - expenseTotal;
    const collected = (data?.payments ?? []).filter((p) => inRange(p.payment_date)).reduce((s, p) => s + Number(p.amount), 0);

    const dayMs = 86400000;
    const rangeDays = Math.max(1, Math.round((new Date(to + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime()) / dayMs) + 1);
    const prevFrom = new Date(new Date(from + "T00:00:00").getTime() - rangeDays * dayMs).toISOString().slice(0, 10);
    const prevTo = new Date(new Date(from + "T00:00:00").getTime() - dayMs).toISOString().slice(0, 10);
    const allInvoices = data?.invoices ?? [];
    const prevRevenue = allInvoices
      .filter((i) => i.invoice_date && i.invoice_date >= prevFrom && i.invoice_date <= prevTo && counted(i.status))
      .reduce((s, i) => s + Number(i.total), 0);

    const byCategory = new Map<string, number>();
    expenses.forEach((e) => {
      const key = e.category?.trim() || "Uncategorised";
      byCategory.set(key, (byCategory.get(key) || 0) + Number(e.amount));
    });
    const expenseCategories = Array.from(byCategory.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    return {
      revenue, cogs, grossProfit, expenseTotal, netProfit, collected, expenseCategories, prevRevenue,
      grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      netMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    };
  }, [data, from, to]);

  const plMessage = useMemo(() => {
    const net = pl.netProfit;
    const current = pl.revenue;
    const previous = pl.prevRevenue ?? 0;
    const changePct = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    const salesDown = previous > 0 && current < previous && changePct <= -10;
    if (net < 0) {
      const topExpense = pl.expenseCategories[0];
      let cause = "Review your costs, prices, and sales to turn things around.";
      if (pl.grossProfit < 0) {
        cause = `The goods you sold cost ${formatMoney(pl.cogs, sym)} to buy, but you sold them for only ${formatMoney(pl.revenue, sym)}. Your selling prices are too low — raise prices or find cheaper suppliers.`;
      } else if (pl.expenseTotal > pl.grossProfit) {
        cause = `Your expenses (${formatMoney(pl.expenseTotal, sym)}) ate all the ${formatMoney(pl.grossProfit, sym)} left after buying stock.${topExpense ? ` Biggest expense: ${topExpense.category} at ${formatMoney(topExpense.amount, sym)}.` : ""} Cut expenses or sell more.`;
      }
      return {
        tone: "danger" as const,
        title: "You are running at a loss",
        body: `Your business lost ${formatMoney(Math.abs(net), sym)} in this period. ${cause}`,
        Icon: AlertTriangle,
      };
    }
    if (salesDown) {
      return {
        tone: "warning" as const,
        title: "Sales are declining",
        body: `Sales dropped by ${Math.abs(changePct).toFixed(1)}% compared to the previous period. Your business may be facing a crisis — investigate low sales, stock levels, and customer outreach.`,
        Icon: TrendingDown,
      };
    }
    return {
      tone: "success" as const,
      title: "Congratulations, keep pushing!",
      body: `You have made a profit of ${formatMoney(net, sym)} this period. Great work — keep the momentum going.`,
      Icon: Trophy,
    };
  }, [pl.netProfit, pl.revenue, pl.prevRevenue, sym]);

  const plColumns: ReportColumn[] = [
    { header: "Line", align: "left" },
    { header: "Amount", align: "right", width: 40 },
  ];
  const plReportRows: (string | number)[][] = [
    ["1. Total sales (what customers bought)", formatMoney(pl.revenue, sym)],
    ["2. Cost of the goods you sold (buying/restocking)", `- ${formatMoney(pl.cogs, sym)}`],
    ["3. Gross profit (sales minus goods cost)", formatMoney(pl.grossProfit, sym)],
    [`   Gross margin (profit per 100 of sales)`, `${pl.grossMargin.toFixed(1)}%`],
    ...pl.expenseCategories.map((c, i) => [`4.${i + 1} Expense — ${c.category}`, `- ${formatMoney(c.amount, sym)}`]),
    ["4. Total expenses (rent, transport, salaries…)", `- ${formatMoney(pl.expenseTotal, sym)}`],
    ["Cash collected in period", formatMoney(pl.collected, sym)],
    ["Net margin (profit per 100 of sales)", `${pl.netMargin.toFixed(1)}%`],
  ];
  const plTotalsRow = ["5. Net profit / (loss) — what truly remains", formatMoney(pl.netProfit, sym)];

  const exportPlPdf = async () => {
    if (!company) return;
    try {
      await downloadReportPdf(
        { title: "Profit & loss statement", subtitle: `${new Date(from + "T00:00:00").toLocaleDateString()} – ${new Date(to + "T00:00:00").toLocaleDateString()}`, columns: plColumns, rows: plReportRows, totalsRow: plTotalsRow },
        company,
        `profit-and-loss-${from}-to-${to}.pdf`,
      );
    } catch (err) {
      toast.error("Could not create PDF", { description: (err as Error).message });
    }
  };

  // ---- Audit trail ----
  type AuditEntry = { at: string; type: string; detail: string; reference: string; amount: string; user: string };
  const auditRows: AuditEntry[] = useMemo(() => {
    const nameOf = (id?: string | null) => {
      if (!id) return "System";
      const p = (data?.profiles ?? []).find((x) => x.id === id);
      return p?.full_name || p?.email || "Unknown user";
    };
    const inRange = (ts?: string | null) => !!ts && ts.slice(0, 10) >= from && ts.slice(0, 10) <= to;
    const entries: AuditEntry[] = [];

    (data?.invoices ?? []).forEach((i) => {
      if (!inRange(i.created_at)) return;
      entries.push({
        at: i.created_at!, type: "Invoice created",
        detail: `Invoice ${i.invoice_number} · ${i.status}`,
        reference: i.invoice_number ?? "", amount: formatMoney(Number(i.total), sym), user: nameOf(i.created_by),
      });
    });
    (data?.payments ?? []).forEach((p) => {
      if (!inRange(p.created_at)) return;
      entries.push({
        at: p.created_at, type: "Payment received",
        detail: String(p.method).replace("_", " "),
        reference: p.reference || "", amount: formatMoney(Number(p.amount), sym), user: nameOf(p.created_by),
      });
    });
    (data?.expenses ?? []).forEach((e) => {
      if (!inRange(e.created_at)) return;
      entries.push({
        at: e.created_at, type: "Expense recorded",
        detail: `${e.description}${e.vendor ? ` · ${e.vendor}` : ""}`,
        reference: e.category || "", amount: `- ${formatMoney(Number(e.amount), sym)}`, user: nameOf(e.created_by),
      });
    });
    (data?.movements ?? []).forEach((m) => {
      if (!inRange(m.created_at)) return;
      entries.push({
        at: m.created_at, type: "Stock movement",
        detail: `${m.products?.name ?? "Product"} · ${String(m.reason).replace("_", " ")}`,
        reference: m.reference || "",
        amount: `${Number(m.change_qty) > 0 ? "+" : ""}${Number(m.change_qty)}`,
        user: nameOf(m.created_by),
      });
    });

    return entries.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [data, from, to, sym]);

  const [auditType, setAuditType] = useState<string>("all");
  const filteredAudit = auditType === "all" ? auditRows : auditRows.filter((a) => a.type === auditType);
  const auditColumns: ReportColumn[] = [
    { header: "#", align: "right", width: 8 },
    { header: "Date & time", align: "left", width: 38 },
    { header: "Activity", align: "left", width: 34 },
    { header: "Details", align: "left", width: 78 },
    { header: "Reference", align: "left", width: 38 },
    { header: "Amount / qty", align: "right", width: 30 },
    { header: "User", align: "left", width: 42 },
  ];
  const auditReportRows = filteredAudit.map((a, i) => [
    i + 1, new Date(a.at).toLocaleString(), a.type, a.detail || "—", a.reference || "—", a.amount, a.user,
  ]);

  const exportAuditPdf = async () => {
    if (!company) return;
    try {
      await downloadReportPdf(
        {
          title: "Audit trail",
          subtitle: `${new Date(from + "T00:00:00").toLocaleDateString()} – ${new Date(to + "T00:00:00").toLocaleDateString()} · ${filteredAudit.length} records`,
          columns: auditColumns, rows: auditReportRows, orientation: "landscape",
        },
        company,
        `audit-trail-${from}-to-${to}.pdf`,
      );
    } catch (err) {
      toast.error("Could not create PDF", { description: (err as Error).message });
    }
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
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="profit">Profit &amp; loss</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
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

        <TabsContent value="customers" className="space-y-4">
          <Card className="p-5 shadow-soft border-0 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <h3 className="font-semibold">Report per customer</h3>
                <p className="text-xs text-muted-foreground">Full record of every customer's invoices, payments and balances.</p>
              </div>
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[9.5rem]" />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-[9.5rem]" />
              </div>
              <div className="flex gap-1">
                {[["30 days", 30], ["90 days", 90], ["365 days", 365]].map(([label, d]) => (
                  <Button key={String(label)} size="sm" variant="outline" className="h-9" onClick={() => quick(Number(d))}>{label}</Button>
                ))}
              </div>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" className="h-9" disabled={!customerReportRows.length}
                  onClick={() => downloadCsv(`customer-report-${from}-to-${to}.csv`, toCsv(customerColumns, customerReportRows))}>
                  <FileSpreadsheet className="h-4 w-4 mr-1.5" />CSV
                </Button>
                <Button size="sm" className="h-9 gradient-emerald text-white" disabled={!customerReportRows.length || !company} onClick={exportCustomerPdf}>
                  <Download className="h-4 w-4 mr-1.5" />PDF (A4 landscape)
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Customers", value: String(customerRows.length) },
                { label: "Sales", value: formatMoney(customerTotals.sales, sym) },
                { label: "Paid", value: formatMoney(customerTotals.paid, sym) },
                { label: "Outstanding", value: formatMoney(customerTotals.balance, sym) },
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
                    <TableHead className="whitespace-nowrap">Customer</TableHead>
                    <TableHead className="whitespace-nowrap">Code</TableHead>
                    <TableHead className="whitespace-nowrap">City</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Invoices</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Sales</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Paid</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Balance</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Overdue</TableHead>
                    <TableHead className="whitespace-nowrap">Last invoice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerRows.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No customer activity in this period.</TableCell></TableRow>
                  ) : customerRows.map((r, i) => (
                    <TableRow key={`${r.name}-${i}`}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {r.name}
                        {r.contact && <span className="ml-1 text-xs text-muted-foreground">({r.contact})</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.code || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.city || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.invoices}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(r.sales, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(r.paid, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold">{formatMoney(r.balance, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap text-destructive">{formatMoney(r.overdue, sym)}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.last ? new Date(r.last + "T00:00:00").toLocaleDateString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {customerRows.length > 0 && (
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right tabular-nums">{customerTotals.invoices}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(customerTotals.sales, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(customerTotals.paid, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(customerTotals.balance, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(customerTotals.overdue, sym)}</TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

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

        <TabsContent value="profit" className="space-y-4">
          <Card className="p-5 shadow-soft border-0 space-y-4">
            <div className={cn("rounded-xl border p-4 border-l-4 shadow-soft",
              plMessage.tone === "success" ? "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20"
              : plMessage.tone === "warning" ? "border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20"
              : "border-l-destructive bg-destructive/5"
            )}>
              <div className="flex items-start gap-3">
                <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full",
                  plMessage.tone === "success" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                  : plMessage.tone === "warning" ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                  : "bg-destructive/10 text-destructive"
                )}>
                  <plMessage.Icon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className={cn("font-semibold",
                    plMessage.tone === "success" ? "text-emerald-800 dark:text-emerald-200"
                    : plMessage.tone === "warning" ? "text-amber-800 dark:text-amber-200"
                    : "text-destructive"
                  )}>{plMessage.title}</h4>
                  <p className="text-sm mt-0.5 text-muted-foreground leading-relaxed">{plMessage.body}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <h3 className="font-semibold">Profit &amp; loss</h3>
                <p className="text-xs text-muted-foreground">Sales less cost of goods sold and expenses.</p>
              </div>
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[9.5rem]" />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-[9.5rem]" />
              </div>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" className="h-9"
                  onClick={() => downloadCsv(`profit-and-loss-${from}-to-${to}.csv`, toCsv(plColumns, [...plReportRows, plTotalsRow]))}>
                  <FileSpreadsheet className="h-4 w-4 mr-1.5" />CSV
                </Button>
                <Button size="sm" className="h-9 gradient-emerald text-white" disabled={!company} onClick={exportPlPdf}>
                  <Download className="h-4 w-4 mr-1.5" />PDF
                </Button>
              </div>
            </div>

            {/* Where the money went — plain language */}
            {(() => {
              const pct = (v: number) => (pl.revenue > 0 ? Math.max(0, Math.min(100, (v / pl.revenue) * 100)) : 0);
              const cogsPct = pct(pl.cogs);
              const expPct = Math.max(0, Math.min(100 - cogsPct, pct(pl.expenseTotal)));
              const profitPct = pl.netProfit > 0 ? pct(pl.netProfit) : 0;
              return (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Where your money went — in plain language
                  </div>
                  <ol className="space-y-1.5 text-sm leading-relaxed list-decimal list-inside">
                    <li>You sold goods worth <b>{formatMoney(pl.revenue, sym)}</b>.</li>
                    <li>Buying (or restocking) those goods cost you <b className="text-destructive">{formatMoney(pl.cogs, sym)}</b> — leaving <b>{formatMoney(pl.grossProfit, sym)}</b>.</li>
                    <li>Other business costs like rent, transport and salaries took <b className="text-destructive">{formatMoney(pl.expenseTotal, sym)}</b>
                      {pl.expenseCategories[0] ? <> — biggest: <b>{pl.expenseCategories[0].category}</b> at {formatMoney(pl.expenseCategories[0].amount, sym)}</> : null}.
                    </li>
                    <li>{pl.netProfit >= 0 ? "What remains in your pocket (profit):" : "You lost (money gone):"}{" "}
                      <b className={pl.netProfit < 0 ? "text-destructive" : "text-primary"}>{formatMoney(pl.netProfit, sym)}</b>.
                    </li>
                  </ol>
                  {pl.revenue > 0 && (
                    <div className="mt-3">
                      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                        <div className="bg-amber-500" style={{ width: `${cogsPct}%` }} />
                        <div className="bg-destructive" style={{ width: `${expPct}%` }} />
                        <div className="bg-primary" style={{ width: `${profitPct}%` }} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Cost of goods {pct(pl.cogs).toFixed(0)}%</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" />Expenses {pct(pl.expenseTotal).toFixed(0)}%</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Profit {pl.netProfit > 0 ? profitPct.toFixed(0) : 0}%</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Revenue (total sales)", value: formatMoney(pl.revenue, sym), hint: "Money customers bought from you" },
                { label: "Cost of goods", value: formatMoney(pl.cogs, sym), hint: "What you paid to buy/make what you sold" },
                { label: "Gross profit", value: formatMoney(pl.grossProfit, sym), hint: "Sales minus cost of goods" },
                { label: "Net profit", value: formatMoney(pl.netProfit, sym), hint: "What truly remains for you" },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border bg-card p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
                  <div className="mt-1 text-base sm:text-lg xl:text-xl font-bold tabular-nums break-words [overflow-wrap:anywhere]">{k.value}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{k.hint}</div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Line</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow><TableCell>1. Total sales (what customers bought)</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(pl.revenue, sym)}</TableCell></TableRow>
                  <TableRow><TableCell>2. Cost of the goods you sold (buying/restocking)</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap text-destructive">- {formatMoney(pl.cogs, sym)}</TableCell></TableRow>
                  <TableRow className="bg-muted/40 font-semibold"><TableCell>3. Gross profit — sales minus goods cost ({pl.grossMargin.toFixed(1)}%)</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(pl.grossProfit, sym)}</TableCell></TableRow>
                  {pl.expenseCategories.map((c) => (
                    <TableRow key={c.category}>
                      <TableCell className="pl-6 capitalize">4. Expense — {c.category}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap text-destructive">- {formatMoney(c.amount, sym)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow><TableCell>4. Total expenses (rent, transport, salaries…)</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap text-destructive">- {formatMoney(pl.expenseTotal, sym)}</TableCell></TableRow>
                  <TableRow className="bg-primary/5 font-bold">
                    <TableCell>5. Net profit / (loss) — what truly remains ({pl.netMargin.toFixed(1)}% of sales)</TableCell>
                    <TableCell className={`text-right tabular-nums whitespace-nowrap ${pl.netProfit < 0 ? "text-destructive" : "text-primary"}`}>{formatMoney(pl.netProfit, sym)}</TableCell>
                  </TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Cash collected in period</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(pl.collected, sym)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card className="p-5 shadow-soft border-0 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <h3 className="font-semibold">Audit trail</h3>
                <p className="text-xs text-muted-foreground">Every invoice, payment, expense and stock change with the user who made it.</p>
              </div>
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[9.5rem]" />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-[9.5rem]" />
              </div>
              <div className="flex gap-1 flex-wrap">
                {["all", "Invoice created", "Payment received", "Expense recorded", "Stock movement"].map((t) => (
                  <Button key={t} size="sm" variant={auditType === t ? "default" : "outline"} className={`h-9 ${auditType === t ? "gradient-emerald text-white" : ""}`} onClick={() => setAuditType(t)}>
                    {t === "all" ? "All" : t.split(" ")[0]}
                  </Button>
                ))}
              </div>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" className="h-9" disabled={!auditReportRows.length}
                  onClick={() => downloadCsv(`audit-trail-${from}-to-${to}.csv`, toCsv(auditColumns, auditReportRows))}>
                  <FileSpreadsheet className="h-4 w-4 mr-1.5" />CSV
                </Button>
                <Button size="sm" className="h-9 gradient-emerald text-white" disabled={!auditReportRows.length || !company} onClick={exportAuditPdf}>
                  <Download className="h-4 w-4 mr-1.5" />PDF (A4 landscape)
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Date &amp; time</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount / qty</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAudit.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No recorded activity in this period.</TableCell></TableRow>
                  ) : filteredAudit.slice(0, 300).map((a, i) => (
                    <TableRow key={`${a.at}-${i}`}>
                      <TableCell className="whitespace-nowrap text-xs">{new Date(a.at).toLocaleString()}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{a.type}</TableCell>
                      <TableCell className="capitalize">{a.detail || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{a.reference || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{a.amount}</TableCell>
                      <TableCell className="whitespace-nowrap">{a.user}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredAudit.length > 300 && (
                <p className="text-xs text-muted-foreground mt-2">Showing the latest 300 of {filteredAudit.length} records — download the PDF or CSV for the full list.</p>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}
