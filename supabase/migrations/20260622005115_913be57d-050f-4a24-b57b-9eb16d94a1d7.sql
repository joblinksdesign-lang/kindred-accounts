CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_roles caller_roles
        WHERE caller_roles.user_id = auth.uid()
          AND caller_roles.role = 'super_admin'
      )
    THEN EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _uid = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_roles caller_roles
        WHERE caller_roles.user_id = auth.uid()
          AND caller_roles.role = 'super_admin'
      )
    THEN EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _uid
        AND role = 'super_admin'
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(_uid UUID, _tenant UUID, _roles public.tenant_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _uid = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_roles caller_roles
        WHERE caller_roles.user_id = auth.uid()
          AND caller_roles.role = 'super_admin'
      )
      OR EXISTS (
        SELECT 1
        FROM public.tenant_users caller_membership
        WHERE caller_membership.user_id = auth.uid()
          AND caller_membership.tenant_id = _tenant
          AND caller_membership.is_active = true
          AND caller_membership.role IN ('owner','manager')
      )
    THEN EXISTS (
      SELECT 1
      FROM public.tenant_users
      WHERE user_id = _uid
        AND tenant_id = _tenant
        AND is_active = true
        AND role = ANY(_roles)
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_uid UUID, _tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _uid = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_roles caller_roles
        WHERE caller_roles.user_id = auth.uid()
          AND caller_roles.role = 'super_admin'
      )
      OR EXISTS (
        SELECT 1
        FROM public.tenant_users caller_membership
        WHERE caller_membership.user_id = auth.uid()
          AND caller_membership.tenant_id = _tenant
          AND caller_membership.is_active = true
          AND caller_membership.role IN ('owner','manager')
      )
    THEN EXISTS (
      SELECT 1
      FROM public.tenant_users
      WHERE user_id = _uid
        AND tenant_id = _tenant
        AND is_active = true
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.tenant_users
  WHERE user_id = auth.uid()
    AND is_active = true
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_tenant_role(uuid, uuid, public.tenant_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_tenant_ids() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tenant_role(uuid, uuid, public.tenant_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_ids() TO authenticated;