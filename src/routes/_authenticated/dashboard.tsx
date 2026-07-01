import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatMoney, useCompanySettings, formatDate } from "@/lib/company";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  DollarSign, Users, Package, FileText, AlertTriangle, TrendingUp, Plus, ArrowUpRight, Calendar as CalendarIcon,
} from "lucide-react";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

type Period = "day" | "week" | "month" | "custom";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SmartInvoice Pro" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: company } = useCompanySettings();
  const sym = company?.currency_symbol || "$";
  const [period, setPeriod] = useState<Period>("month");

  const { data: stats } = useQuery({
    queryKey: ["dashboard_stats", period],
    queryFn: async () => {
      const [invoices, customers, products, payments] = await Promise.all([
        supabase.from("invoices").select("id,total,balance,status,invoice_date,invoice_number,customer_id,created_at").order("created_at", { ascending: false }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id,name,quantity,reorder_level"),
        supabase.from("payments").select("amount,payment_date,created_at").order("created_at", { ascending: false }).limit(500),
      ]);
      const invs = invoices.data ?? [];
      const pays = payments.data ?? [];
      const totalRevenue = invs.reduce((s, i) => s + Number(i.total) - Number(i.balance), 0);
      const outstanding = invs.reduce((s, i) => s + Number(i.balance), 0);
      const lowStock = (products.data ?? []).filter((p) => Number(p.quantity) <= Number(p.reorder_level));

      // Period window
      const now = new Date();
      const start = new Date(now);
      if (period === "day") start.setHours(0, 0, 0, 0);
      else if (period === "week") { start.setDate(start.getDate() - 6); start.setHours(0,0,0,0); }
      else { start.setDate(1); start.setHours(0,0,0,0); }
      const startISO = start.toISOString().slice(0, 10);
      const inPeriod = (d?: string | null) => !!d && d >= startISO;

      const periodSales = pays.filter((p) => inPeriod(p.payment_date)).reduce((s, p) => s + Number(p.amount), 0);
      const periodInvoiced = invs.filter((i) => inPeriod(i.invoice_date)).reduce((s, i) => s + Number(i.total), 0);
      const periodInvoiceCount = invs.filter((i) => inPeriod(i.invoice_date)).length;

      // Trend series based on period
      const series: { label: string; revenue: number }[] = [];
      if (period === "day") {
        // 24 hours of today (use payment created_at)
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
        periodSales, periodInvoiced, periodInvoiceCount,
        series, statusBreakdown,
        recentInvoices: invs.slice(0, 6),
      };
    },
  });

  const periodLabel = period === "day" ? "Today" : period === "week" ? "This week" : "This month";
  const trendLabel = period === "day" ? "Last 24 hours" : period === "week" ? "Last 7 days" : "Last 6 months";

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
          </ToggleGroup>
          <Button asChild variant="outline"><Link to="/quotations">New quote</Link></Button>
          <Button asChild className="gradient-emerald text-white shadow-soft">
            <Link to="/invoices/new"><Plus className="h-4 w-4 mr-1.5" />New invoice</Link>
          </Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="p-4 shadow-soft border-0 h-full">
              <div className="flex items-start justify-between">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{c.label}</div>
                <div className={`grid h-8 w-8 place-items-center rounded-lg ${
                  c.tone === "emerald" ? "bg-primary/10 text-primary"
                  : c.tone === "gold" ? "bg-[var(--gold)]/15 text-[var(--gold-foreground)]"
                  : c.tone === "info" ? "bg-blue-500/10 text-blue-600"
                  : c.tone === "destructive" ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
                }`}><c.icon className="h-4 w-4" /></div>
              </div>
              <div className="mt-3 text-2xl font-bold tracking-tight">{c.value}</div>
            </Card>
          </motion.div>
        ))}
      </div>

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
