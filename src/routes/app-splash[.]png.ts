import { createFileRoute } from "@tanstack/react-router";
import { loadPwaSettings, decodeDataUrl } from "@/lib/pwa.server";

export const Route = createFileRoute("/app-splash.png")({
  server: {
    handlers: {
      GET: async () => {
        const s = await loadPwaSettings();
        const decoded = s?.splash_url ? decodeDataUrl(s.splash_url) : null;
        if (!decoded) return new Response("No splash image set", { status: 404 });
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
