-- 1. Modules on plans + per-tenant override
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS modules text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS modules_override text[];

-- 2. Storefront settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS store_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS store_headline text,
  ADD COLUMN IF NOT EXISTS store_about text;

-- 3. Public (anonymous) storefront reads — column-scoped grants only
GRANT SELECT (id, slug, business_name, status, currency, currency_symbol) ON public.tenants TO anon;
GRANT SELECT (
  tenant_id, company_name, logo_path, logo_url, brand_color, tagline,
  email, phone, website, address, city, country,
  currency, currency_symbol, default_tax_rate,
  store_enabled, whatsapp_number, store_headline, store_about
) ON public.company_settings TO anon;
GRANT SELECT (
  id, tenant_id, name, sku, category, description, unit_price, image_url, is_active, quantity
) ON public.products TO anon;

DROP POLICY IF EXISTS "Public storefront settings are viewable" ON public.company_settings;
CREATE POLICY "Public storefront settings are viewable"
  ON public.company_settings FOR SELECT TO anon
  USING (store_enabled = true);

DROP POLICY IF EXISTS "Public storefront tenants are viewable" ON public.tenants;
CREATE POLICY "Public storefront tenants are viewable"
  ON public.tenants FOR SELECT TO anon
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.company_settings cs
      WHERE cs.tenant_id = tenants.id AND cs.store_enabled = true
    )
  );

DROP POLICY IF EXISTS "Public storefront products are viewable" ON public.products;
CREATE POLICY "Public storefront products are viewable"
  ON public.products FOR SELECT TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.company_settings cs
      WHERE cs.tenant_id = products.tenant_id AND cs.store_enabled = true
    )
  );

-- 4. Server-side order intake needs these helpers
GRANT EXECUTE ON FUNCTION public.notify_tenant_admins(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_tenant_doc_number(uuid, text) TO service_role;
