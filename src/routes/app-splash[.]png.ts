import { createFileRoute } from "@tanstack/react-router";
import { loadPwaSettings, decodeDataUrl } from "@/lib/pwa.server";

export const Route = createFileRoute("/app-splash.png")({
  server: {
    handlers: {
      GET: async () => {
        const s = await loadPwaSettings();
        const decoded = s?.splash_url ? decodeDataUrl(s.splash_url) : null;
        // Fall back to the built-in default splash when nothing is uploaded.
        if (!decoded) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/default-app-splash.png", "Cache-Control": "no-store" },
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
