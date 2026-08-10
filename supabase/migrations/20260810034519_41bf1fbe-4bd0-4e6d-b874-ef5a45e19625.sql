ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_paths text[] NOT NULL DEFAULT '{}'::text[];

CREATE POLICY product_images_read ON storage.objects FOR SELECT
USING (bucket_id = 'product-images' AND app_private.is_tenant_member(auth.uid(), (split_part(name, '/', 1))::uuid));

CREATE POLICY product_images_insert ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images' AND app_private.has_tenant_role(auth.uid(), (split_part(name, '/', 1))::uuid, ARRAY['owner'::tenant_role, 'manager'::tenant_role]));

CREATE POLICY product_images_update ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images' AND app_private.has_tenant_role(auth.uid(), (split_part(name, '/', 1))::uuid, ARRAY['owner'::tenant_role, 'manager'::tenant_role]))
WITH CHECK (bucket_id = 'product-images' AND app_private.has_tenant_role(auth.uid(), (split_part(name, '/', 1))::uuid, ARRAY['owner'::tenant_role, 'manager'::tenant_role]));

CREATE POLICY product_images_delete ON storage.objects FOR DELETE
USING (bucket_id = 'product-images' AND app_private.has_tenant_role(auth.uid(), (split_part(name, '/', 1))::uuid, ARRAY['owner'::tenant_role, 'manager'::tenant_role]));