import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const MAX_PRODUCT_IMAGES = 3;
const BUCKET = "product-images";

/** Upload device files for a product. Returns the storage paths. */
export async function uploadProductImages(tenantId: string, files: File[]): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
    if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} is larger than 5MB`);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

export async function removeProductImage(path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function signProductImages(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  const map: Record<string, string> = {};
  (data ?? []).forEach((d) => {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  });
  return map;
}

/** Signed URLs for a set of product image paths, keyed by path. */
export function useProductImageUrls(paths: string[]) {
  const key = [...paths].sort().join("|");
  return useQuery({
    queryKey: ["product_image_urls", key],
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: () => signProductImages(paths),
  });
}
