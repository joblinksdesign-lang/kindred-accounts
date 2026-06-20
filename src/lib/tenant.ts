import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";

export type TenantRole = "owner" | "manager" | "accountant" | "sales_agent" | "store_manager";
export type TenantStatus = "pending" | "active" | "suspended" | "expired" | "cancelled";

export type TenantMembership = {
  tenant_id: string;
  role: TenantRole;
  is_active: boolean;
  tenants: {
    id: string;
    business_name: string;
    slug: string;
    status: TenantStatus;
    currency: string;
    currency_symbol: string;
    plan_id: string | null;
  } | null;
};

const ACTIVE_KEY = "smartinvoice.active_tenant";

export function useTenantMemberships() {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: ["tenant_memberships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select("tenant_id, role, is_active, tenants(id, business_name, slug, status, currency, currency_symbol, plan_id)")
        .eq("user_id", user!.id)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as unknown as TenantMembership[];
    },
  });
}

export function useActiveTenant() {
  const { data: memberships = [], isLoading } = useTenantMemberships();
  const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
  const active =
    memberships.find((m) => m.tenant_id === stored) ?? memberships[0] ?? null;
  return {
    membership: active,
    tenantId: active?.tenant_id ?? null,
    tenant: active?.tenants ?? null,
    role: active?.role ?? null,
    memberships,
    isLoading,
    setActive: (id: string) => {
      localStorage.setItem(ACTIVE_KEY, id);
      window.location.reload();
    },
  };
}

export function useActiveTenantId(): string | null {
  return useActiveTenant().tenantId;
}
