import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Wipes all business records for a tenant (invoices, receipts, payments, products,
 * customers, quotations, stock history, notifications) while keeping the business
 * and its users. Super-admin only, and requires the admin to re-enter their password.
 */
export const purgeTenantData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ tenantId: z.string().uuid(), password: z.string().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw rolesError;
    if (!(roles ?? []).some((r) => r.role === "super_admin")) throw new Error("Forbidden");

    const email = (claims as { email?: string } | null)?.email;
    if (!email) throw new Error("Could not verify your account email");

    // Re-authenticate the admin with their password before a destructive action.
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const authClient = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { error: signInError } = await authClient.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (signInError) throw new Error("Incorrect admin password");
    await authClient.auth.signOut();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tables = [
      "receipts",
      "payments",
      "invoice_items",
      "invoices",
      "quotation_items",
      "quotations",
      "stock_movements",
      "products",
      "product_attributes",
      "customers",
      "notifications",
    ] as const;

    for (const table of tables) {
      const { error } = await supabaseAdmin.from(table).delete().eq("tenant_id", data.tenantId);
      if (error) throw new Error(`Failed clearing ${table}: ${error.message}`);
    }

    const { error: resetError } = await supabaseAdmin
      .from("tenants")
      .update({ invoice_counter: 0, receipt_counter: 0, quote_counter: 0 })
      .eq("id", data.tenantId);
    if (resetError) throw resetError;

    return { ok: true };
  });
