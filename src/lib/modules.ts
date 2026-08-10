import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenantId } from "@/lib/tenant";

/** Optional add-on modules that a plan (or an admin override) can unlock. */
export const MODULES = [
  {
    key: "storefront",
    name: "Online store",
    description: "Public product catalogue with cart and WhatsApp order checkout.",
  },
  {
    key: "pos",
    name: "Point of sale",
    description: "Fast counter selling: tap products, take payment, print a thermal receipt.",
  },
] as const;


export type ModuleKey = (typeof MODULES)[number]["key"];

export type TenantModules = {
  modules: string[];
  planModules: string[];
  overridden: boolean;
  has: (key: ModuleKey) => boolean;
};

export function useTenantModules() {
  const tenantId = useActiveTenantId();
  return useQuery<TenantModules | null>({
    queryKey: ["tenant_modules", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      if (!tenantId) return null;

      const [{ data: tenant }, { data: sub }] = await Promise.all([
        supabase.from("tenants").select("modules_override").eq("id", tenantId).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("plans:plan_id(modules)")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const planModules =
        ((sub?.plans as unknown as { modules: string[] | null } | null)?.modules ?? []) as string[];
      const override = (tenant as unknown as { modules_override: string[] | null } | null)
        ?.modules_override;
      const modules = override ?? planModules;

      return {
        modules,
        planModules,
        overridden: override != null,
        has: (key: ModuleKey) => modules.includes(key),
      };
    },
  });
}
