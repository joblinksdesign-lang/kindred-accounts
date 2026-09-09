import { createFileRoute } from "@tanstack/react-router";
import { loadPwaSettings, decodeDataUrl } from "@/lib/pwa.server";

export const Route = createFileRoute("/app-icon.png")({
  server: {
    handlers: {
      GET: async () => {
        const s = await loadPwaSettings();
        const decoded = s?.icon_url ? decodeDataUrl(s.icon_url) : null;
        // Fall back to the built-in default artwork when nothing is uploaded.
        if (!decoded) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/default-app-icon.png", "Cache-Control": "no-store" },
          });
        }
        return new Response(decoded.bytes.buffer as ArrayBuffer, {
          headers: {
            "Content-Type": decoded.contentType,
            "Cache-Control": "no-store, max-age=0, must-revalidate",
          },
        });
      },
    },
  },
});
