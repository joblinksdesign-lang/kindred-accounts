CREATE POLICY "subs_owner_update" ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner']::public.tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner']::public.tenant_role[]));