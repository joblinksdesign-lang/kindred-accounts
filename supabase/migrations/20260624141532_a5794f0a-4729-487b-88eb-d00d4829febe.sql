DROP POLICY IF EXISTS notif_read ON public.notifications;
CREATE POLICY notif_read ON public.notifications
FOR SELECT
TO authenticated
USING (
  public.is_tenant_member(auth.uid(), tenant_id)
  AND (
    user_id IS NULL
    OR user_id = auth.uid()
    OR public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager']::tenant_role[])
  )
);