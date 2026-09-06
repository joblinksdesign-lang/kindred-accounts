import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const settingsSchema = z.object({
  id: z.string().uuid(),
  app_name: z.string().min(1).max(120),
  short_name: z.string().min(1).max(24),
  description: z.string().max(500),
  theme_color: z.string().max(32),
  background_color: z.string().max(32),
  display_mode: z.string().max(32),
  start_url: z.string().max(200),
  icon_url: z.string().nullable(),
  splash_url: z.string().nullable(),
  icon_sizes: z.array(z.number()).min(1),
  splash_width: z.number(),
  splash_height: z.number(),
  install_enabled: z.boolean(),
});

/** Saves the platform install/branding settings. Super admins only. */
export const savePwaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Only a platform admin can change install settings.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...rest } = data;
    const { data: saved, error } = await supabaseAdmin
      .from("pwa_settings")
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!saved || saved.length === 0) throw new Error("Settings row not found.");
    return { ok: true as const };
  });
