import { createFileRoute } from "@tanstack/react-router";
import { loadPwaSettings } from "@/lib/pwa.server";

export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async () => {
        const s = await loadPwaSettings();
        const sizes = (s?.icon_sizes?.length ? s.icon_sizes : [192, 512]).slice().sort((a, b) => a - b);
        const version = s?.updated_at ? Date.parse(s.updated_at) : Date.now();
        const iconSrc = s?.icon_url ? `/app-icon.png?v=${version}` : "/favicon.ico";
        const manifest = {
          name: s?.app_name || "SoftfrackPos",
          short_name: s?.short_name || "SoftfrackPos",
          description: s?.description || "Invoicing, receipts, inventory and POS.",
          start_url: s?.start_url || "/",
          scope: "/",
          display: s?.display_mode || "standalone",
          theme_color: s?.theme_color || "#0B6E4F",
          background_color: s?.background_color || "#F5F3EE",
          icons: sizes.map((size) => ({
            src: iconSrc,
            sizes: `${size}x${size}`,
            type: s?.icon_url ? "image/png" : "image/x-icon",
            purpose: "any maskable",
          })),
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
