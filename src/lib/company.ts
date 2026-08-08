import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenantId } from "@/lib/tenant";

export type CompanySettings = {
  id: string;
  tenant_id: string;
  company_name: string;
  legal_name: string | null;
  logo_url: string | null;
  logo_path: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  tax_id: string | null;
  currency: string;
  currency_symbol: string;
  default_tax_rate: number;
  invoice_prefix: string;
  receipt_prefix: string;
  quote_prefix: string;
  invoice_template: string;
  receipt_template: string;
  invoice_footer: string | null;
  payment_instructions: string | null;
  brand_color?: string | null;
  tagline?: string | null;
};

export function useCompanySettings() {
  const tenantId = useActiveTenantId();
  return useQuery<CompanySettings | null>({
    queryKey: ["company_settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CompanySettings | null;
    },
  });
}

export function useCompanyLogoUrl(company: Pick<CompanySettings, "logo_path" | "logo_url"> | null | undefined) {
  return useQuery<string | null>({
    queryKey: ["company_logo_url", company?.logo_path, company?.logo_url],
    enabled: !!company?.logo_path || !!company?.logo_url,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      if (company?.logo_path) {
        const { data, error } = await supabase.storage
          .from("company-assets")
          .createSignedUrl(company.logo_path, 60 * 60);
        if (!error && data?.signedUrl) return data.signedUrl;
      }
      return company?.logo_url ?? null;
    },
  });
}

export function formatMoney(amount: number | string | null | undefined, symbol?: string | null) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  const raw = (symbol && symbol.trim()) || "USh";
  const prefix = /[A-Za-z0-9]$/.test(raw) ? `${raw} ` : raw;
  return `${prefix}${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
