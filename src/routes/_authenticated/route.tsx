import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }

    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", data.user.id);
    const isSuper = (roles ?? []).some((r) => r.role === "super_admin");

    // Super admins live in /admin/* — bounce them there if they hit a tenant page directly.
    if (isSuper && !location.pathname.startsWith("/admin")) {
      throw redirect({ to: "/admin" });
    }

    if (!isSuper) {
      const { data: memberships } = await supabase
        .from("tenant_users").select("tenant_id")
        .eq("user_id", data.user.id).eq("is_active", true).limit(1);
      if (!memberships || memberships.length === 0) {
        throw redirect({ to: "/onboarding" });
      }

      const tenantIds = memberships.map((m) => m.tenant_id);
      const { data: activeTenants } = await supabase
        .from("tenants")
        .select("id")
        .in("id", tenantIds)
        .eq("status", "active")
        .limit(1);
      if (!activeTenants || activeTenants.length === 0) {
        throw redirect({ to: "/onboarding" });
      }
    }

    return { user: data.user, isSuper };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
