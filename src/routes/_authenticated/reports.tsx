import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-helpers";
import { formatMoney, useCompanyLogoUrl, useCompanySettings } from "@/lib/company";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data: company } = useCompanySettings();
  const { data: logoUrl } = useCompanyLogoUrl(company);
  const sym = company?.currency_symbol || "USh ";

  const { data } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const [inv, pay, cust, prod] = await Promise.all([
        supabase.from("invoices").select("invoice_date, total, balance, status, customer_id"),
        supabase.from("payments").select("amount, payment_date, method"),
        supabase.from("customers").select("id, name, company_name"),
        supabase.from("products").select("name, quantity, reorder_level, unit_price, cost_price"),
      ]);
      const invoices = inv.data ?? [];
      const payments = pay.data ?? [];
      const customers = cust.data ?? [];
      const products = prod.data ?? [];

      // Monthly sales (12 months)
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

      // Outstanding by customer
      const balByCustomer = new Map<string, number>();
      invoices.forEach((i) => balByCustomer.set(i.customer_id, (balByCustomer.get(i.customer_id) || 0) + Number(i.balance)));
      const customerBalances = customers
        .map((c) => ({ name: c.company_name || c.name, balance: balByCustomer.get(c.id) || 0 }))
        .filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 10);

      // Payment methods breakdown
      const methodTotals = new Map<string, number>();
      payments.forEach((p) => methodTotals.set(p.method, (methodTotals.get(p.method) || 0) + Number(p.amount)));
      const methods = Array.from(methodTotals.entries()).map(([method, amount]) => ({ method, amount }));

      // Inventory valuation
      const valuation = products.reduce((s, p) => s + Number(p.quantity) * Number(p.cost_price), 0);
      const retailValue = products.reduce((s, p) => s + Number(p.quantity) * Number(p.unit_price), 0);

      return { monthly, customerBalances, methods, valuation, retailValue, products };
    },
  });

  return (
    <div>
      {company && (
        <div className="flex items-center gap-3 mb-4">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`${company.company_name} logo`}
              className="h-10 w-10 rounded object-contain bg-white border"
            />
          )}
          <div>
            <div className="font-semibold">{company.company_name}</div>
            {company.address && <div className="text-xs text-muted-foreground">{company.address}</div>}
          </div>
        </div>
      )}
      <PageHeader title="Reports" subtitle="Sales, payments, inventory and customer reports." />
      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <Card className="p-5 shadow-soft border-0">
            <h3 className="font-semibold mb-3">Sales & collections — 12 months</h3>
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
              <div className="text-3xl font-bold mt-2 tabular-nums">{formatMoney(data?.valuation, sym)}</div>
            </Card>
            <Card className="p-5 shadow-soft border-0">
              <div className="text-xs uppercase text-muted-foreground">Retail value</div>
              <div className="text-3xl font-bold mt-2 tabular-nums text-primary">{formatMoney(data?.retailValue, sym)}</div>
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
