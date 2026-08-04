
drop policy if exists company_assets_read on storage.objects;
drop policy if exists company_assets_insert on storage.objects;
drop policy if exists company_assets_update on storage.objects;
drop policy if exists company_assets_delete on storage.objects;

create policy company_assets_read on storage.objects for select to authenticated
using (bucket_id = 'company-assets' and app_private.is_tenant_member(auth.uid(), (split_part(name,'/',1))::uuid));

create policy company_assets_insert on storage.objects for insert to authenticated
with check (bucket_id = 'company-assets' and app_private.has_tenant_role(auth.uid(), (split_part(name,'/',1))::uuid, array['owner'::tenant_role,'manager'::tenant_role]));

create policy company_assets_update on storage.objects for update to authenticated
using (bucket_id = 'company-assets' and app_private.has_tenant_role(auth.uid(), (split_part(name,'/',1))::uuid, array['owner'::tenant_role,'manager'::tenant_role]))
with check (bucket_id = 'company-assets' and app_private.has_tenant_role(auth.uid(), (split_part(name,'/',1))::uuid, array['owner'::tenant_role,'manager'::tenant_role]));

create policy company_assets_delete on storage.objects for delete to authenticated
using (bucket_id = 'company-assets' and app_private.has_tenant_role(auth.uid(), (split_part(name,'/',1))::uuid, array['owner'::tenant_role,'manager'::tenant_role]));
