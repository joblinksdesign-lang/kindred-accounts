import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PaymentMethod = {
  id: string;
  label: string;
  account_name: string | null;
  account_number: string | null;
  instructions: string | null;
  sort_order: number;
  is_active: boolean;
};

export type PlatformSettings = {
  id: string;
  admin_whatsapp: string | null;
  payment_note: string | null;
};

export function usePaymentMethods(includeInactive = false) {
  return useQuery({
    queryKey: ["platform_payment_methods", includeInactive],
    queryFn: async () => {
      let q = supabase
        .from("platform_payment_methods")
        .select("id, label, account_name, account_number, instructions, sort_order, is_active")
        .order("sort_order");
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PaymentMethod[];
    },
  });
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: ["platform_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("id, admin_whatsapp, payment_note")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PlatformSettings | null;
    },
  });
}

/** Turns any written phone number into a wa.me link, or null when unusable. */
export function whatsappLink(number: string | null | undefined, message: string) {
  const digits = (number ?? "").replace(/[^\d]/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
