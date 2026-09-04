import { createFileRoute } from "@tanstack/react-router";
import { loadPwaSettings, decodeDataUrl } from "@/lib/pwa.server";

export const Route = createFileRoute("/app-icon.png")({
  server: {
    handlers: {
      GET: async () => {
        const s = await loadPwaSettings();
        const decoded = s?.icon_url ? decodeDataUrl(s.icon_url) : null;
        if (!decoded) return new Response("No app icon set", { status: 404 });
        return new Response(decoded.bytes.buffer as ArrayBuffer, {
          headers: {
            "Content-Type": decoded.contentType,
            "Cache-Control": "public, max-age=300, must-revalidate",
          },
        });
      },
    },
  },
});
