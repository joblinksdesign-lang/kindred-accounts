import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TENANT_ROLES = [
  { value: "sales_agent", label: "POS only (default)", description: "Can sell at the point of sale and see their receipts." },
  { value: "store_manager", label: "Store manager", description: "POS plus products, stock and the online store." },
  { value: "accountant", label: "Accountant", description: "Invoices, payments, expenses and reports." },
  { value: "manager", label: "Manager", description: "Full business access except billing." },
] as const;

export type TeamRole = (typeof TENANT_ROLES)[number]["value"];

const roleSchema = z.enum(["sales_agent", "store_manager", "accountant", "manager"]);

export type TeamMember = {
  id: string;
  user_id: string;
  role: "owner" | TeamRole;
  is_active: boolean;
  created_at: string;
  email: string | null;
  full_name: string | null;
};

/** Confirms the caller is the owner (or a manager) of the tenant. Returns nothing on success. */
async function assertTenantAdmin(
  supabase: { from: (t: string) => any },
  userId: string,
  tenantId: string,
  ownerOnly = false,
) {
  const { data, error } = await supabase
    .from("tenant_users")
    .select("role, is_active")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const role = data?.role as string | undefined;
  if (!data?.is_active || !role) throw new Error("You are not a member of this business");
  if (ownerOnly ? role !== "owner" : !["owner", "manager"].includes(role)) {
    throw new Error("Only the business owner can manage users");
  }
}

export const listTeamMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ tenantId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<TeamMember[]> => {
    await assertTenantAdmin(context.supabase as never, context.userId, data.tenantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("tenant_users")
      .select("id, user_id, role, is_active, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const ids = (rows ?? []).map((r) => r.user_id);
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", ids)
      : { data: [] as { id: string; email: string | null; full_name: string | null }[] };

    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (rows ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      role: r.role as TeamMember["role"],
      is_active: r.is_active,
      created_at: r.created_at,
      email: byId.get(r.user_id)?.email ?? null,
      full_name: byId.get(r.user_id)?.full_name ?? null,
    }));
  });

export const addTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        tenantId: z.string().uuid(),
        email: z.string().email(),
        fullName: z.string().max(120).optional(),
        password: z.string().min(6).max(72),
        role: roleSchema.default("sales_agent"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase as never, context.userId, data.tenantId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = data.email.trim().toLowerCase();

    // Find an existing account with this email, otherwise create one.
    let userId: string | null = null;
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingProfile) userId = existingProfile.id;

    if (!userId) {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.fullName || email.split("@")[0] },
      });
      if (createError) throw new Error(createError.message);
      userId = created.user?.id ?? null;
    }
    if (!userId) throw new Error("Could not create the user account");

    // A user can only belong to one business.
    const { data: otherMembership } = await supabaseAdmin
      .from("tenant_users")
      .select("id, tenant_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (otherMembership && otherMembership.tenant_id !== data.tenantId) {
      throw new Error("This user already belongs to another business");
    }
    if (otherMembership) throw new Error("This user is already on your team");

    const { error: insertError } = await supabaseAdmin.from("tenant_users").insert({
      tenant_id: data.tenantId,
      user_id: userId,
      role: data.role,
      is_active: true,
      accepted_at: new Date().toISOString(),
    });
    if (insertError) throw new Error(insertError.message);

    return { ok: true, userId };
  });

export const updateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        tenantId: z.string().uuid(),
        memberId: z.string().uuid(),
        role: roleSchema.optional(),
        isActive: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase as never, context.userId, data.tenantId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: member } = await supabaseAdmin
      .from("tenant_users")
      .select("id, role, tenant_id")
      .eq("id", data.memberId)
      .maybeSingle();
    if (!member || member.tenant_id !== data.tenantId) throw new Error("Member not found");
    if (member.role === "owner") throw new Error("The owner's access cannot be changed");

    const patch: { role?: TeamRole; is_active?: boolean } = {};
    if (data.role) patch["role"] = data.role;
    if (typeof data.isActive === "boolean") patch["is_active"] = data.isActive;
    if (!Object.keys(patch).length) return { ok: true };

    const { error } = await supabaseAdmin.from("tenant_users").update(patch).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ tenantId: z.string().uuid(), memberId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase as never, context.userId, data.tenantId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: member } = await supabaseAdmin
      .from("tenant_users")
      .select("id, role, tenant_id")
      .eq("id", data.memberId)
      .maybeSingle();
    if (!member || member.tenant_id !== data.tenantId) throw new Error("Member not found");
    if (member.role === "owner") throw new Error("The owner cannot be removed");

    const { error } = await supabaseAdmin.from("tenant_users").delete().eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
