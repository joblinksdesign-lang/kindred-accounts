import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PwaSettings = {
  id: string;
  app_name: string;
  short_name: string;
  description: string;
  theme_color: string;
  background_color: string;
  display_mode: string;
  start_url: string;
  icon_url: string | null;
  splash_url: string | null;
  icon_sizes: number[];
  splash_width: number;
  splash_height: number;
  install_enabled: boolean;
};

export const ICON_SIZE_OPTIONS = [72, 96, 128, 144, 152, 192, 384, 512];
export const DISPLAY_MODES = ["standalone", "fullscreen", "minimal-ui", "browser"];

/** Platform-wide install/branding settings (single row). */
export function usePwaSettings() {
  return useQuery({
    queryKey: ["pwa_settings"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pwa_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PwaSettings | null;
    },
  });
}

/** Reads an image file and shrinks it so it always fits comfortably in the database. */
export function fileToDataUrl(file: File, maxDimension = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error(`${file.name} is not an image`));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const original = String(reader.result);
      const img = new Image();
      img.onerror = () => reject(new Error("That image could not be opened"));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(original);
        ctx.drawImage(img, 0, 0, w, h);
        let out = canvas.toDataURL("image/png");
        // Fall back to JPEG when the PNG is still heavy (photos, gradients).
        if (out.length > 400_000) out = canvas.toDataURL("image/jpeg", 0.82);
        if (out.length > 900_000) out = canvas.toDataURL("image/jpeg", 0.6);
        resolve(out);
      };
      img.src = original;
    };
    reader.readAsDataURL(file);
  });
}


type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Captures the browser install prompt so we can offer an in-app Install button. */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return {
    canInstall: !!deferred && !installed,
    installed,
    promptInstall: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      return choice.outcome === "accepted";
    },
  };
}

/** Forces the browser to re-fetch the manifest, icon and splash after new branding is saved. */
export function refreshInstallAssets() {
  if (typeof document === "undefined") return;
  const v = Date.now();
  const swap = (selector: string, base: string) => {
    document.querySelectorAll<HTMLLinkElement>(selector).forEach((link) => {
      link.href = `${base}?v=${v}`;
    });
  };
  swap('link[rel="manifest"]', "/manifest.webmanifest");
  swap('link[rel="apple-touch-icon"]', "/app-icon.png");
  void fetch(`/app-icon.png?v=${v}`, { cache: "reload" }).catch(() => {});
  void fetch(`/app-splash.png?v=${v}`, { cache: "reload" }).catch(() => {});
}
