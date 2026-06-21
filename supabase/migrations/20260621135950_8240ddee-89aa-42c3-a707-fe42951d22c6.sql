
-- 1. user_roles: lock down INSERT/UPDATE/DELETE to super_admins
DROP POLICY IF EXISTS user_roles_insert_super ON public.user_roles;
DROP POLICY IF EXISTS user_roles_update_super ON public.user_roles;
DROP POLICY IF EXISTS user_roles_delete_super ON public.user_roles;
CREATE POLICY user_roles_insert_super ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY user_roles_update_super ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY user_roles_delete_super ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 2. notifications: replace permissive ALL with scoped policies
DROP POLICY IF EXISTS notif_write ON public.notifications;
DROP POLICY IF EXISTS notif_insert_self_or_admin ON public.notifications;
DROP POLICY IF EXISTS notif_update_own ON public.notifications;
DROP POLICY IF EXISTS notif_delete_own ON public.notifications;

CREATE POLICY notif_insert_self_or_admin ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (user_id = auth.uid() AND public.is_tenant_member(auth.uid(), tenant_id))
    OR (
      public.is_tenant_member(auth.uid(), tenant_id)
      AND public.has_tenant_role(auth.uid(), tenant_id,
            ARRAY['owner','manager']::public.tenant_role[])
      AND (user_id IS NULL OR public.is_tenant_member(user_id, tenant_id))
    )
  );

CREATE POLICY notif_update_own ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (user_id = auth.uid() AND public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY notif_delete_own ON public.notifications FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND public.is_tenant_member(auth.uid(), tenant_id))
    OR public.has_tenant_role(auth.uid(), tenant_id,
          ARRAY['owner','manager']::public.tenant_role[])
  );

-- 3. receipts: split ALL into explicit UPDATE/DELETE for clarity
DROP POLICY IF EXISTS receipts_write ON public.receipts;
DROP POLICY IF EXISTS receipts_insert ON public.receipts;
DROP POLICY IF EXISTS receipts_update ON public.receipts;
DROP POLICY IF EXISTS receipts_delete ON public.receipts;

CREATE POLICY receipts_insert ON public.receipts FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant']::public.tenant_role[]));
CREATE POLICY receipts_update ON public.receipts FOR UPDATE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant']::public.tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant']::public.tenant_role[]));
CREATE POLICY receipts_delete ON public.receipts FOR DELETE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager']::public.tenant_role[]));

-- 4. Lock down SECURITY DEFINER functions: revoke direct API EXECUTE.
-- Trigger functions don't need client EXECUTE. Helper predicates are inlined
-- inside RLS policies via SECURITY DEFINER and don't require client EXECUTE either.
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_payment_after_insert()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_invoice_number()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_quote_number()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_doc_number(text, regclass)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_tenant_doc_number(uuid, text)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_tenant_role(uuid, uuid, public.tenant_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_tenant_ids()                FROM PUBLIC, anon, authenticated;

-- register_business is an RPC the onboarding flow calls; keep it callable for signed-in users.
REVOKE EXECUTE ON FUNCTION public.register_business(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.register_business(text, text, text, text, text, text) TO authenticated;
