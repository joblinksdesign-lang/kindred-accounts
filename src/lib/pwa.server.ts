import { createClient } from "@supabase/supabase-js";

export type PwaRow = {
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
};

export async function loadPwaSettings(): Promise<PwaRow | null> {
  const supabase = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data } = await supabase.from("pwa_settings").select("*").limit(1).maybeSingle();
  return (data as PwaRow | null) ?? null;
}

/** Turns a stored data URL into raw bytes plus its content type. */
export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType: match[1] };
}
