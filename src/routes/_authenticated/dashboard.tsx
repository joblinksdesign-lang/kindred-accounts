import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatMoney, useCompanySettings, formatDate } from "@/lib/company";
import { PlanLimitBanner } from "@/components/plan-limit-banner";
import { useActiveTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  DollarSign, Users, Package, FileText, AlertTriangle, TrendingUp, TrendingDown, Trophy, Plus, ArrowUpRight, Calendar as CalendarIcon,
} from "lucide-react";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

type Period = "day" | "week" | "month" | "custom";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Softtrack Pos" }] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const { role, isLoading: rolesLoading } = useActiveTenant();
  useEffect(() => {
    // POS-only staff have no dashboard — send them to the counter.
    if (!rolesLoading && role === "sales_agent") navigate({ to: "/pos", replace: true });
  }, [role, rolesLoading, navigate]);
  const { data: company } = useCompanySettings();
  const sym = company?.currency_symbol || "USh ";

  const [period, setPeriod] = useState<Period>("month");
  const [range, setRange] = useState<DateRange | undefined>();

  const customFrom = period === "custom" && range?.from ? range.from : undefined;
  const customTo = period === "custom" && range?.to ? range.to : undefined;
  const rangeKey = `${customFrom?.toISOString() ?? ""}_${customTo?.toISOString() ?? ""}`;

  const { data: stats } = useQuery({
    queryKey: ["dashboard_stats", period, rangeKey],
    queryFn: async () => {
      const [invoices, customers, products, payments, expensesRes, itemsRes] = await Promise.all([
        supabase.from("invoices").select("id,total,balance,status,invoice_date,invoice_number,customer_id,created_at").order("created_at", { ascending: false }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id,name,quantity,reorder_level"),
        supabase.from("payments").select("amount,payment_date,created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("expenses").select("amount,expense_date"),
        supabase.from("invoice_items").select("quantity,invoices(invoice_date,status),products(cost_price)"),
      ]);
      const invs = invoices.data ?? [];
      const pays = payments.data ?? [];
      const expenseRows = (expensesRes.data ?? []) as { amount: number; expense_date: string }[];
      const itemRows = (itemsRes.data ?? []) as unknown as {
        quantity: number;
        invoices: { invoice_date: string | null; status: string } | null;
        products: { cost_price: number } | null;
      }[];

      const totalRevenue = invs.reduce((s, i) => s + Number(i.total) - Number(i.balance), 0);
      const outstanding = invs.reduce((s, i) => s + Number(i.balance), 0);
      const lowStock = (products.data ?? []).filter((p) => Number(p.quantity) <= Number(p.reorder_level));

      // Period window
      const now = new Date();
      const start = new Date(now);
      let endISO: string | null = null;
      if (period === "day") start.setHours(0, 0, 0, 0);
      else if (period === "week") { start.setDate(start.getDate() - 6); start.setHours(0,0,0,0); }
      else if (period === "month") { start.setDate(1); start.setHours(0,0,0,0); }
      else if (period === "custom" && customFrom && customTo) {
        start.setTime(customFrom.getTime()); start.setHours(0,0,0,0);
        endISO = customTo.toISOString().slice(0, 10);
      } else {
        // Custom selected but incomplete — fall back to month
        start.setDate(1); start.setHours(0,0,0,0);
      }
      const startISO = start.toISOString().slice(0, 10);
      const inPeriod = (d?: string | null) => !!d && d >= startISO && (endISO ? d <= endISO : true);

      const periodSales = pays.filter((p) => inPeriod(p.payment_date)).reduce((s, p) => s + Number(p.amount), 0);
      const periodInvoiced = invs.filter((i) => inPeriod(i.invoice_date)).reduce((s, i) => s + Number(i.total), 0);
      const periodInvoiceCount = invs.filter((i) => inPeriod(i.invoice_date)).length;

      // Previous period sales for trend comparison
      const prevStart = new Date(start);
      if (period === "day") prevStart.setDate(prevStart.getDate() - 1);
      else if (period === "week") prevStart.setDate(prevStart.getDate() - 7);
      else if (period === "month") prevStart.setMonth(prevStart.getMonth() - 1);
      else if (period === "custom" && customFrom && customTo) {
        const msDay = 86400000;
        const spanDays = Math.max(1, Math.round((customTo.getTime() - customFrom.getTime()) / msDay) + 1);
        prevStart.setTime(customFrom.getTime() - spanDays * msDay);
      } else {
        prevStart.setMonth(prevStart.getMonth() - 1);
      }
      const prevEnd = new Date(start.getTime() - 1);
      const prevStartISO = prevStart.toISOString().slice(0, 10);
      const prevEndISO = prevEnd.toISOString().slice(0, 10);
      const inPrevPeriod = (d?: string | null) => !!d && d >= prevStartISO && d <= prevEndISO;
      const prevPeriodInvoiced = invs.filter((i) => inPrevPeriod(i.invoice_date)).reduce((s, i) => s + Number(i.total), 0);

      // Profit & loss for the selected period
      const soldInvoices = invs.filter((i) => inPeriod(i.invoice_date) && i.status !== "cancelled" && i.status !== "draft");
      const plRevenue = soldInvoices.reduce((s, i) => s + Number(i.total), 0);
      const plCogs = itemRows
        .filter((it) => it.invoices && inPeriod(it.invoices.invoice_date) && it.invoices.status !== "cancelled" && it.invoices.status !== "draft")
        .reduce((s, it) => s + Number(it.quantity) * Number(it.products?.cost_price ?? 0), 0);
      const plExpenses = expenseRows.filter((e) => inPeriod(e.expense_date)).reduce((s, e) => s + Number(e.amount), 0);
      const grossProfit = plRevenue - plCogs;
      const netProfit = grossProfit - plExpenses;
      const margin = plRevenue > 0 ? (netProfit / plRevenue) * 100 : 0;


      // Trend series based on period
      const series: { label: string; revenue: number }[] = [];
      if (period === "day") {
        for (let h = 0; h < 24; h++) {
          const revenue = pays.filter((p) => {
            const t = new Date(p.created_at);
            return t.toDateString() === now.toDateString() && t.getHours() === h;
          }).reduce((s, p) => s + Number(p.amount), 0);
          series.push({ label: `${h}h`, revenue });
        }
      } else if (period === "week") {
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now); d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          const label = d.toLocaleDateString(undefined, { weekday: "short" });
          const revenue = invs.filter((x) => x.invoice_date === key).reduce((s, x) => s + Number(x.total), 0);
          series.push({ label, revenue });
        }
      } else if (period === "custom" && customFrom && customTo) {
        const msDay = 86400000;
        const spanDays = Math.max(1, Math.round((customTo.getTime() - customFrom.getTime()) / msDay) + 1);
        if (spanDays <= 31) {
          for (let i = 0; i < spanDays; i++) {
            const d = new Date(customFrom); d.setDate(d.getDate() + i);
            const key = d.toISOString().slice(0, 10);
            const label = format(d, "MMM d");
            const revenue = invs.filter((x) => x.invoice_date === key).reduce((s, x) => s + Number(x.total), 0);
            series.push({ label, revenue });
          }
        } else {
          // bucket by month
          const startM = new Date(customFrom.getFullYear(), customFrom.getMonth(), 1);
          const endM = new Date(customTo.getFullYear(), customTo.getMonth(), 1);
          const cur = new Date(startM);
          while (cur <= endM) {
            const key = cur.toISOString().slice(0, 7);
            const label = format(cur, "MMM yyyy");
            const revenue = invs.filter((x) => x.invoice_date?.startsWith(key)).reduce((s, x) => s + Number(x.total), 0);
            series.push({ label, revenue });
            cur.setMonth(cur.getMonth() + 1);
          }
        }
      } else {
        for (let i = 5; i >= 0; i--) {
          const d = new Date(); d.setMonth(d.getMonth() - i);
          const key = d.toISOString().slice(0, 7);
          const label = d.toLocaleDateString(undefined, { month: "short" });
          const revenue = invs.filter((x) => x.invoice_date?.startsWith(key)).reduce((s, x) => s + Number(x.total), 0);
          series.push({ label, revenue });
        }
      }

      const statusBreakdown = ["draft", "sent", "pending", "partial", "paid", "overdue"].map((s) => ({
        name: s,
        value: invs.filter((i) => i.status === s).length,
      })).filter((x) => x.value > 0);

      return {
        totalRevenue, outstanding, lowStock,
        totalCustomers: customers.count ?? 0,
        totalProducts: (products.data ?? []).length,
        periodSales, periodInvoiced, periodInvoiceCount, prevPeriodInvoiced,
        series, statusBreakdown,
        pl: { revenue: plRevenue, cogs: plCogs, grossProfit, expenses: plExpenses, netProfit, margin },
        recentInvoices: invs.slice(0, 6),

      };
    },
  });

  const periodLabel =
    period === "day" ? "Today"
    : period === "week" ? "This week"
    : period === "month" ? "This month"
    : "Custom range";
  const trendLabel =
    period === "day" ? "Last 24 hours"
    : period === "week" ? "Last 7 days"
    : period === "month" ? "Last 6 months"
    : (customFrom && customTo)
      ? `${format(customFrom, "MMM d, yyyy")} – ${format(customTo, "MMM d, yyyy")}`
      : "Pick a date range";

  const cards = [
    { label: "Total Revenue", value: formatMoney(stats?.totalRevenue, sym), icon: DollarSign, tone: "emerald" },
    { label: "Outstanding", value: formatMoney(stats?.outstanding, sym), icon: AlertTriangle, tone: "gold" },
    { label: `${periodLabel} Sales`, value: formatMoney(stats?.periodSales, sym), icon: TrendingUp, tone: "info" },
    { label: `${periodLabel} Invoiced`, value: formatMoney(stats?.periodInvoiced, sym), icon: ArrowUpRight, tone: "emerald" },
    { label: "Customers", value: stats?.totalCustomers ?? 0, icon: Users, tone: "muted" },
    { label: "Products", value: stats?.totalProducts ?? 0, icon: Package, tone: "muted" },
    { label: "Low Stock", value: stats?.lowStock.length ?? 0, icon: AlertTriangle, tone: "destructive" },
    { label: `${periodLabel} Invoices`, value: stats?.periodInvoiceCount ?? 0, icon: FileText, tone: "muted" },
  ];

  const COLORS = ["#0B6E4F", "#F59E0B", "#3B82F6", "#8B5CF6", "#10B981", "#EF4444"];

  const plMessage = (() => {
    const net = stats?.pl.netProfit ?? 0;
    const current = stats?.pl.revenue ?? 0;
    const previous = stats?.prevPeriodInvoiced ?? 0;
    const changePct = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    const salesDown = previous > 0 && current < previous && changePct <= -10;
    if (net < 0) {
      const cogs = stats?.pl.cogs ?? 0;
      const gross = stats?.pl.grossProfit ?? 0;
      const expenses = stats?.pl.expenses ?? 0;
      let cause = "Review your costs, prices, and sales to turn things around.";
      if (gross < 0) {
        cause = `The goods you sold cost ${formatMoney(cogs, sym)} to buy, but you sold them for only ${formatMoney(current, sym)}. Your selling prices are too low — raise prices or find cheaper suppliers.`;
      } else if (expenses > gross) {
        cause = `Your other expenses (rent, transport, salaries…) of ${formatMoney(expenses, sym)} were bigger than the ${formatMoney(gross, sym)} left after paying for stock. Cut unnecessary expenses or sell more.`;
      }
      return {
        tone: "danger" as const,
        title: "You are running at a loss",
        body: `Your business lost ${formatMoney(Math.abs(net), sym)} this period. ${cause}`,
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
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Good day, {company?.company_name || "team"} 👋</h1>
          <p className="text-sm text-muted-foreground">Here's what's happening across your business today.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as Period)} className="bg-muted/40 rounded-lg p-0.5">
            <ToggleGroupItem value="day" size="sm" className="data-[state=on]:bg-background data-[state=on]:shadow-sm">Day</ToggleGroupItem>
            <ToggleGroupItem value="week" size="sm" className="data-[state=on]:bg-background data-[state=on]:shadow-sm">Week</ToggleGroupItem>
            <ToggleGroupItem value="month" size="sm" className="data-[state=on]:bg-background data-[state=on]:shadow-sm">Month</ToggleGroupItem>
            <ToggleGroupItem value="custom" size="sm" className="data-[state=on]:bg-background data-[state=on]:shadow-sm">Custom</ToggleGroupItem>
          </ToggleGroup>
          {period === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("justify-start text-left font-normal", !range?.from && "text-muted-foreground")}
                >
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {range?.from ? (
                    range.to ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}` : format(range.from, "MMM d, yyyy")
                  ) : "Pick range"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={setRange}
                  numberOfMonths={2}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          )}
          <Button asChild variant="outline"><Link to="/quotations">New quote</Link></Button>
          <Button asChild className="gradient-emerald text-white shadow-soft">
            <Link to="/invoices/new"><Plus className="h-4 w-4 mr-1.5" />New invoice</Link>
          </Button>
        </div>
      </div>

      <PlanLimitBanner />
      <RenewalStatusCard />

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="p-4 shadow-soft border-0 h-full overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="min-w-0 text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-tight break-words">{c.label}</div>
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                  c.tone === "emerald" ? "bg-primary/10 text-primary"
                  : c.tone === "gold" ? "bg-[var(--gold)]/15 text-[var(--gold-foreground)]"
                  : c.tone === "info" ? "bg-blue-500/10 text-blue-600"
                  : c.tone === "destructive" ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
                }`}><c.icon className="h-4 w-4" /></div>
              </div>
              <div
                title={String(c.value)}
                className="mt-3 min-w-0 text-lg sm:text-xl xl:text-2xl font-bold tracking-tight tabular-nums leading-tight break-words [overflow-wrap:anywhere]"
              >
                {c.value}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Profit & loss */}
      <Card className="p-5 shadow-soft border-0">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <h3 className="font-semibold">Profit &amp; loss</h3>
            <p className="text-xs text-muted-foreground">{periodLabel} — sales less cost of goods and expenses</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/reports">Full report</Link></Button>
        </div>
        <div className={cn("rounded-xl border p-4 border-l-4 shadow-soft mb-4",
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
        {/* Where the money went — plain language */}
        {(() => {
          const rev = stats?.pl.revenue ?? 0;
          const cogs = stats?.pl.cogs ?? 0;
          const gross = stats?.pl.grossProfit ?? 0;
          const exp = stats?.pl.expenses ?? 0;
          const net = stats?.pl.netProfit ?? 0;
          const pct = (v: number) => (rev > 0 ? Math.max(0, Math.min(100, (v / rev) * 100)) : 0);
          const profitPct = net > 0 ? pct(net) : 0;
          const cogsPct = pct(cogs);
          const expPct = Math.max(0, Math.min(100 - cogsPct, pct(exp)));
          return (
            <div className="mb-4 rounded-lg border bg-muted/30 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Where your money went — {periodLabel}
              </div>
              <ol className="space-y-1.5 text-sm leading-relaxed list-decimal list-inside">
                <li>You sold goods worth <b>{formatMoney(rev, sym)}</b>.</li>
                <li>Buying (or restocking) those goods cost you <b className="text-destructive">{formatMoney(cogs, sym)}</b> — leaving <b>{formatMoney(gross, sym)}</b>.</li>
                <li>Other business costs like rent, transport and salaries took <b className="text-destructive">{formatMoney(exp, sym)}</b>.</li>
                <li>{net >= 0 ? "What remains in your pocket (profit):" : "You lost (money gone):"}{" "}
                  <b className={net < 0 ? "text-destructive" : "text-primary"}>{formatMoney(net, sym)}</b>.
                </li>
              </ol>
              {rev > 0 && (
                <div className="mt-3">
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div className="bg-amber-500" style={{ width: `${cogsPct}%` }} title={`Cost of goods ${pct(cogs).toFixed(0)}%`} />
                    <div className="bg-destructive" style={{ width: `${expPct}%` }} title={`Expenses ${pct(exp).toFixed(0)}%`} />
                    <div className="bg-primary" style={{ width: `${profitPct}%` }} title={`Profit ${profitPct.toFixed(0)}%`} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Cost of goods {pct(cogs).toFixed(0)}%</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" />Expenses {pct(exp).toFixed(0)}%</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Profit {net > 0 ? profitPct.toFixed(0) : 0}%</span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "Revenue (total sales)", value: stats?.pl.revenue ?? 0, tone: "plain", hint: "Money customers bought from you" },
            { label: "Cost of goods", value: -(stats?.pl.cogs ?? 0), tone: "cost", hint: "What you paid to buy/make what you sold" },
            { label: "Gross profit", value: stats?.pl.grossProfit ?? 0, tone: "plain", hint: "Sales minus cost of goods" },
            { label: "Expenses", value: -(stats?.pl.expenses ?? 0), tone: "cost", hint: "Rent, transport, salaries, other costs" },
            { label: "Net profit", value: stats?.pl.netProfit ?? 0, tone: "net", hint: "What truly remains for you" },
          ].map((k) => (
            <div key={k.label} className={`rounded-lg border p-3 ${k.tone === "net" ? "bg-primary/5 border-primary/20" : "bg-card"}`}>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground leading-tight">{k.label}</div>
              <div className={`mt-1.5 text-base sm:text-lg xl:text-xl font-bold tabular-nums break-words [overflow-wrap:anywhere] ${
                k.tone === "cost" ? "text-destructive" : k.tone === "net" ? (k.value < 0 ? "text-destructive" : "text-primary") : ""
              }`}>
                {formatMoney(k.value, sym)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                {k.label === "Net profit" ? `Margin ${(stats?.pl.margin ?? 0).toFixed(1)}% — ${k.hint}` : k.hint}
              </div>
            </div>
          ))}
        </div>
      </Card>


      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 shadow-soft border-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Revenue trend</h3>
              <p className="text-xs text-muted-foreground">{trendLabel} — invoiced amounts</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.series ?? []}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0B6E4F" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#0B6E4F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Area type="monotone" dataKey="revenue" stroke="#0B6E4F" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5 shadow-soft border-0">
          <h3 className="font-semibold mb-2">Invoice status</h3>
          <p className="text-xs text-muted-foreground mb-3">Breakdown</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats?.statusBreakdown ?? []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {(stats?.statusBreakdown ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Recent invoices + alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-0 shadow-soft border-0 overflow-hidden">
          <div className="flex items-center justify-between p-5">
            <h3 className="font-semibold">Recent invoices</h3>
            <Button asChild variant="ghost" size="sm"><Link to="/invoices">View all</Link></Button>
          </div>
          <div className="border-t">
            {(stats?.recentInvoices ?? []).length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No invoices yet.</div>
            ) : (stats?.recentInvoices ?? []).map((inv) => (
              <Link
                key={inv.id}
                to="/invoices/$id"
                params={{ id: inv.id }}
                className="flex items-center justify-between px-5 py-3 border-b last:border-0 hover:bg-muted/40 transition-colors"
              >
                <div>
                  <div className="font-medium text-sm">{inv.invoice_number}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(inv.invoice_date)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="capitalize">{inv.status}</Badge>
                  <div className="font-semibold text-sm tabular-nums">{formatMoney(inv.total, sym)}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="p-5 shadow-soft border-0">
          <h3 className="font-semibold mb-3">Low stock alerts</h3>
          {(stats?.lowStock ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">All products are above their reorder level. ✅</div>
          ) : (stats?.lowStock ?? []).slice(0, 6).map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="text-sm font-medium">{p.name}</div>
              <Badge variant="destructive">{Number(p.quantity)} left</Badge>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
