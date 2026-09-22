import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageLoader } from "@/components/route-progress";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/pricing" });

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
    if (isSuper) throw redirect({ to: "/admin" });

    const { data: memberships } = await supabase
      .from("tenant_users")
      .select("tenant_id, role")
      .eq("user_id", data.user.id)
      .eq("is_active", true)
      .limit(1);
    if (!memberships || memberships.length === 0) throw redirect({ to: "/onboarding" });

    const tenantIds = memberships.map((m) => m.tenant_id);
    const { data: activeTenants } = await supabase
      .from("tenants")
      .select("id")
      .in("id", tenantIds)
      .eq("status", "active")
      .limit(1);
    if (!activeTenants || activeTenants.length === 0) throw redirect({ to: "/onboarding" });

    // Counter staff go straight to the till instead of bouncing via the dashboard.
    if (memberships[0]?.role === "sales_agent") throw redirect({ to: "/pos" });
    throw redirect({ to: "/dashboard" });
  },
  // Shown while the checks above run, so sign-in never lands on a blank screen.
  component: () => <PageLoader label="Signing you in…" />,
  pendingComponent: () => <PageLoader label="Signing you in…" />,
  errorComponent: () => <PageLoader label="Signing you in…" />,
});
