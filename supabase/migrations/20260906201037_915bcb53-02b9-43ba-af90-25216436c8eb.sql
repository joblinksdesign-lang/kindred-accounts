DROP POLICY IF EXISTS payments_insert ON public.payments;
CREATE POLICY payments_insert ON public.payments FOR INSERT TO authenticated
WITH CHECK (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role,'manager'::tenant_role,'accountant'::tenant_role,'sales_agent'::tenant_role]));

DROP POLICY IF EXISTS payments_update ON public.payments;
CREATE POLICY payments_update ON public.payments FOR UPDATE TO authenticated
USING (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role,'manager'::tenant_role,'accountant'::tenant_role,'sales_agent'::tenant_role]))
WITH CHECK (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role,'manager'::tenant_role,'accountant'::tenant_role,'sales_agent'::tenant_role]));

DROP POLICY IF EXISTS receipts_insert ON public.receipts;
CREATE POLICY receipts_insert ON public.receipts FOR INSERT TO authenticated
WITH CHECK (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role,'manager'::tenant_role,'accountant'::tenant_role,'sales_agent'::tenant_role]));