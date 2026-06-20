import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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
      .select("tenant_id")
      .eq("user_id", data.user.id)
      .eq("is_active", true)
      .limit(1);
    if (!memberships || memberships.length === 0) throw redirect({ to: "/onboarding" });
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
