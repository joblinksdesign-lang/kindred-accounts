import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const refreshTenantAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ tenantId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: membership, error: membershipError } = await supabase
      .from("tenant_users")
      .select("id")
      .eq("tenant_id", data.tenantId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) throw new Error("Unauthorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("refresh_tenant_alerts", { _tenant: data.tenantId });
    if (error) throw error;
    return { ok: true };
  });