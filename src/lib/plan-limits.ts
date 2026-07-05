import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenantId } from "@/lib/tenant";

export type PlanLimits = {
  planName: string | null;
  maxInvoicesPerMonth: number | null;
  maxCustomers: number | null;
  maxProducts: number | null;
  maxUsers: number | null;
  invoicesThisMonth: number;
  customers: number;
  products: number;
  users: number;
  overInvoices: boolean;
  overCustomers: boolean;
  overProducts: boolean;
  overUsers: boolean;
  nearInvoices: boolean;
  nearCustomers: boolean;
  nearProducts: boolean;
  nearUsers: boolean;
  hasAnyLimit: boolean;
  anyOver: boolean;
  anyNear: boolean;
};

const near = (used: number, limit: number | null) =>
  limit != null && limit > 0 && used >= Math.floor(limit * 0.8) && used < limit;
const over = (used: number, limit: number | null) =>
  limit != null && limit > 0 && used >= limit;

export function usePlanLimits() {
  const tenantId = useActiveTenantId();
  return useQuery<PlanLimits | null>({
    queryKey: ["plan_limits", tenantId],
    enabled: !!tenantId,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!tenantId) return null;

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan_id, plans:plan_id(name, max_invoices_per_month, max_customers, max_products, max_users)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const plan = (sub?.plans as unknown) as {
        name: string;
        max_invoices_per_month: number | null;
        max_customers: number | null;
        max_products: number | null;
        max_users: number | null;
      } | null;

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [invRes, custRes, prodRes, userRes] = await Promise.all([
        supabase.from("invoices").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).gte("created_at", monthStart.toISOString()),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("tenant_users").select("user_id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).eq("is_active", true),
      ]);

      const invoicesThisMonth = invRes.count ?? 0;
      const customers = custRes.count ?? 0;
      const products = prodRes.count ?? 0;
      const users = userRes.count ?? 0;

      const maxInvoicesPerMonth = plan?.max_invoices_per_month ?? null;
      const maxCustomers = plan?.max_customers ?? null;
      const maxProducts = plan?.max_products ?? null;
      const maxUsers = plan?.max_users ?? null;

      const overInvoices = over(invoicesThisMonth, maxInvoicesPerMonth);
      const overCustomers = over(customers, maxCustomers);
      const overProducts = over(products, maxProducts);
      const overUsers = over(users, maxUsers);

      const nearInvoices = near(invoicesThisMonth, maxInvoicesPerMonth);
      const nearCustomers = near(customers, maxCustomers);
      const nearProducts = near(products, maxProducts);
      const nearUsers = near(users, maxUsers);

      return {
        planName: plan?.name ?? null,
        maxInvoicesPerMonth, maxCustomers, maxProducts, maxUsers,
        invoicesThisMonth, customers, products, users,
        overInvoices, overCustomers, overProducts, overUsers,
        nearInvoices, nearCustomers, nearProducts, nearUsers,
        hasAnyLimit: [maxInvoicesPerMonth, maxCustomers, maxProducts, maxUsers].some((v) => v != null && v > 0),
        anyOver: overInvoices || overCustomers || overProducts || overUsers,
        anyNear: nearInvoices || nearCustomers || nearProducts || nearUsers,
      };
    },
  });
}
