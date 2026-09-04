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

/** Reads a device file into a data URL, rejecting oversized or non-image files. */
export function fileToDataUrl(file: File, maxBytes = 512 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error(`${file.name} is not an image`));
    if (file.size > maxBytes)
      return reject(new Error(`${file.name} is ${(file.size / 1024).toFixed(0)}KB — keep it under ${Math.round(maxBytes / 1024)}KB`));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => resolve(String(reader.result));
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
