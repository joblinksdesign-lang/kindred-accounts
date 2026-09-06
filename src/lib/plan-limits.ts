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
  status: string | null;
  periodEnd: string | null;
  trialEndsAt: string | null;
  expired: boolean;
  daysLeft: number | null;
  expiringSoon: boolean;
};

export type LimitKind = "invoices" | "customers" | "products" | "users";

const KIND_LABEL: Record<LimitKind, string> = {
  invoices: "invoices for this month",
  customers: "customers",
  products: "products",
  users: "team members",
};

/**
 * Returns an error message when the action is not allowed on the current plan,
 * or null when it may proceed.
 */
export function planBlockReason(
  limits: PlanLimits | null | undefined,
  kind: LimitKind,
): string | null {
  if (!limits) return null;
  if (limits.expired) {
    return `Your ${limits.planName ?? "plan"} has expired. Renew or upgrade your plan to continue.`;
  }
  const used =
    kind === "invoices" ? limits.invoicesThisMonth
      : kind === "customers" ? limits.customers
      : kind === "products" ? limits.products
      : limits.users;
  const max =
    kind === "invoices" ? limits.maxInvoicesPerMonth
      : kind === "customers" ? limits.maxCustomers
      : kind === "products" ? limits.maxProducts
      : limits.maxUsers;
  if (max != null && max > 0 && used >= max) {
    return `Your ${limits.planName ?? "plan"} allows ${max} ${KIND_LABEL[kind]} and you have used ${used}. Upgrade your plan to add more.`;
  }
  return null;
}

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
        .select("plan_id, status, current_period_end, trial_ends_at, plans:plan_id(name, max_invoices_per_month, max_customers, max_products, max_users)")
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

      const status = (sub as { status?: string } | null)?.status ?? null;
      const periodEnd = (sub as { current_period_end?: string | null } | null)?.current_period_end ?? null;
      const trialEndsAt = (sub as { trial_ends_at?: string | null } | null)?.trial_ends_at ?? null;
      const endsAt = status === "trialing" ? (trialEndsAt ?? periodEnd) : periodEnd;
      const endMs = endsAt ? new Date(endsAt).getTime() : null;
      const daysLeft = endMs != null ? Math.ceil((endMs - Date.now()) / 86_400_000) : null;
      const expired =
        status === "expired" || status === "canceled" ||
        (endMs != null && endMs < Date.now());
      const expiringSoon = !expired && daysLeft != null && daysLeft <= 5;

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
        status, periodEnd, trialEndsAt, expired, daysLeft, expiringSoon,
      };
    },
  });
}
