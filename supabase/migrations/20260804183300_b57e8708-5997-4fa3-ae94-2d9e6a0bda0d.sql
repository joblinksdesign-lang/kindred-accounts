DROP POLICY IF EXISTS subs_owner_insert ON public.subscriptions;
CREATE POLICY subs_owner_insert ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role]));

DROP POLICY IF EXISTS subs_owner_update ON public.subscriptions;
CREATE POLICY subs_owner_update ON public.subscriptions FOR UPDATE TO authenticated
  USING (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role]))
  WITH CHECK (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role]));

DROP POLICY IF EXISTS notif_read ON public.notifications;
CREATE POLICY notif_read ON public.notifications FOR SELECT TO authenticated
  USING (
    app_private.is_tenant_member(auth.uid(), tenant_id)
    AND (
      user_id IS NULL
      OR user_id = auth.uid()
      OR app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role, 'manager'::tenant_role])
    )
  );

CREATE OR REPLACE FUNCTION app_private.purge_tenant_data(_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.receipts WHERE tenant_id = _tenant;
  DELETE FROM public.payments WHERE tenant_id = _tenant;
  DELETE FROM public.invoice_items WHERE tenant_id = _tenant;
  DELETE FROM public.invoices WHERE tenant_id = _tenant;
  DELETE FROM public.quotation_items WHERE tenant_id = _tenant;
  DELETE FROM public.quotations WHERE tenant_id = _tenant;
  DELETE FROM public.stock_movements WHERE tenant_id = _tenant;
  DELETE FROM public.products WHERE tenant_id = _tenant;
  DELETE FROM public.product_attributes WHERE tenant_id = _tenant;
  DELETE FROM public.customers WHERE tenant_id = _tenant;
  DELETE FROM public.notifications WHERE tenant_id = _tenant;
  UPDATE public.tenants SET invoice_counter = 0, receipt_counter = 0, quote_counter = 0 WHERE id = _tenant;
END;
$$;

REVOKE ALL ON FUNCTION app_private.purge_tenant_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.purge_tenant_data(uuid) TO service_role;