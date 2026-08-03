CREATE TABLE public.product_attributes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('category','supplier')),
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, kind, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_attributes TO authenticated;
GRANT ALL ON public.product_attributes TO service_role;

ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_attributes_read ON public.product_attributes
  FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY product_attributes_insert ON public.product_attributes
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role,'manager'::tenant_role,'store_manager'::tenant_role]));

CREATE POLICY product_attributes_update ON public.product_attributes
  FOR UPDATE TO authenticated
  USING (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role,'manager'::tenant_role,'store_manager'::tenant_role]))
  WITH CHECK (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role,'manager'::tenant_role,'store_manager'::tenant_role]));

CREATE POLICY product_attributes_delete ON public.product_attributes
  FOR DELETE TO authenticated
  USING (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role,'manager'::tenant_role]));

INSERT INTO public.product_attributes (tenant_id, kind, name)
SELECT DISTINCT tenant_id, 'category', category FROM public.products WHERE category IS NOT NULL AND btrim(category) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.product_attributes (tenant_id, kind, name)
SELECT DISTINCT tenant_id, 'supplier', supplier FROM public.products WHERE supplier IS NOT NULL AND btrim(supplier) <> ''
ON CONFLICT DO NOTHING;