import { createFileRoute } from "@tanstack/react-router";
import { loadPwaSettings } from "@/lib/pwa.server";

/** Per-store manifest so a shopper's home-screen icon opens that shop directly. */
export const Route = createFileRoute("/store/$slug/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = params.slug;
        const settings = await loadPwaSettings();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tenant } = await supabaseAdmin
          .from("tenants")
          .select("id, name, slug, status, store_enabled")
          .eq("slug", slug)
          .maybeSingle();

        const name = (tenant as { name?: string } | null)?.name || "Online store";
        const version = settings?.updated_at ? Date.parse(settings.updated_at) : Date.now();
        const iconSrc = settings?.icon_url ? `/app-icon.png?v=${version}` : "/default-app-icon.png";
        const start = `/store/${slug}`;

        const manifest = {
          name: `${name} — Online store`,
          short_name: name.slice(0, 12),
          description: `Shop from ${name} and send your order straight to us.`,
          start_url: start,
          scope: start,
          id: start,
          display: settings?.display_mode || "standalone",
          theme_color: settings?.theme_color || "#0B6E4F",
          background_color: settings?.background_color || "#0B6E4F",
          icons: [192, 512].flatMap((size) => [
            { src: iconSrc, sizes: `${size}x${size}`, type: "image/png", purpose: "any" as const },
            { src: iconSrc, sizes: `${size}x${size}`, type: "image/png", purpose: "maskable" as const },
          ]),
        };

        return new Response(JSON.stringify(manifest, null, 2), {
          headers: {
            "Content-Type": "application/manifest+json",
            "Cache-Control": "no-store, max-age=0, must-revalidate",
          },
        });
      },
    },
  },
});
