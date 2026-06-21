import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-helpers";
import { Building2, Users, Clock, TrendingUp, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Super Admin — SmartInvoice Pro" }] }),
  component: AdminOverview,
});

function AdminOverview() {
  const { data: stats } = useQuery({
    queryKey: ["admin_stats"],
    queryFn: async () => {
      const [tenants, subs, invoices, users] = await Promise.all([
        supabase.from("tenants").select("id, status, created_at"),
        supabase.from("subscriptions").select("id, status, plan_id, plans(name, price_monthly)"),
        supabase.from("invoices").select("id, total"),
        supabase.from("tenant_users").select("user_id"),
      ]);
      const tenantsData = tenants.data ?? [];
      const subsData = (subs.data ?? []) as Array<{ status: string; plans: { name: string; price_monthly: number } | null }>;
      const invoicesData = (invoices.data ?? []) as Array<{ total: number }>;
      const mrr = subsData
        .filter((s) => s.status === "active" || s.status === "trialing")
        .reduce((a, b) => a + (b.plans?.price_monthly ?? 0), 0);
      return {
        totalTenants: tenantsData.length,
        active: tenantsData.filter((t) => t.status === "active").length,
        pending: tenantsData.filter((t) => t.status === "pending").length,
        suspended: tenantsData.filter((t) => t.status === "suspended").length,
        mrr,
        totalInvoices: invoicesData.length,
        totalRevenue: invoicesData.reduce((a, b) => a + Number(b.total || 0), 0),
        totalUsers: new Set((users.data ?? []).map((u) => u.user_id)).size,
        planMix: subsData.reduce<Record<string, number>>((acc, s) => {
          const n = s.plans?.name || "Unknown"; acc[n] = (acc[n] ?? 0) + 1; return acc;
        }, {}),
      };
    },
  });

  const cards = [
    { label: "Total businesses", value: stats?.totalTenants ?? 0, icon: Building2, tone: "bg-primary/10 text-primary" },
    { label: "Active", value: stats?.active ?? 0, icon: TrendingUp, tone: "bg-emerald-500/10 text-emerald-600" },
    { label: "Pending approval", value: stats?.pending ?? 0, icon: Clock, tone: "bg-amber-500/10 text-amber-600" },
    { label: "Suspended", value: stats?.suspended ?? 0, icon: Building2, tone: "bg-red-500/10 text-red-600" },
    { label: "MRR", value: `$${(stats?.mrr ?? 0).toLocaleString()}`, icon: TrendingUp, tone: "bg-primary/10 text-primary" },
    { label: "Active users", value: stats?.totalUsers ?? 0, icon: Users, tone: "bg-sky-500/10 text-sky-600" },
    { label: "Invoices created", value: stats?.totalInvoices ?? 0, icon: Receipt, tone: "bg-violet-500/10 text-violet-600" },
    { label: "Platform GMV", value: `$${(stats?.totalRevenue ?? 0).toLocaleString()}`, icon: TrendingUp, tone: "bg-emerald-500/10 text-emerald-600" },
  ];

  return (
    <div>
      <PageHeader title="Platform overview" subtitle="Monitor businesses, subscriptions and revenue across the SaaS platform." />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5 shadow-soft border-0">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</div>
                <div className="text-2xl font-extrabold mt-1">{c.value}</div>
              </div>
              <div className={`grid h-9 w-9 place-items-center rounded-lg ${c.tone}`}><c.icon className="h-4 w-4" /></div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-6 shadow-soft border-0">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Plan distribution</h2>
        {Object.keys(stats?.planMix ?? {}).length === 0 ? (
          <p className="text-sm text-muted-foreground">No active subscriptions yet.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(stats!.planMix).map(([name, count]) => {
              const total = Object.values(stats!.planMix).reduce((a, b) => a + b, 0);
              const pct = total ? Math.round((count / total) * 100) : 0;
              return (
                <div key={name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full gradient-emerald" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
