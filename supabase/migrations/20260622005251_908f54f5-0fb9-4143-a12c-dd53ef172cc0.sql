CREATE SCHEMA IF NOT EXISTS app_private;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION app_private.is_super_admin(_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _uid
      AND role = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION app_private.has_tenant_role(_uid UUID, _tenant UUID, _roles public.tenant_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users
    WHERE user_id = _uid
      AND tenant_id = _tenant
      AND is_active = true
      AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION app_private.is_tenant_member(_uid UUID, _tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users
    WHERE user_id = _uid
      AND tenant_id = _tenant
      AND is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION app_private.current_tenant_ids()
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

GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_tenant_role(uuid, uuid, public.tenant_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_tenant_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_tenant_ids() TO authenticated;

DO $$
DECLARE
  r RECORD;
  v_cmd TEXT;
  v_roles TEXT;
  v_qual TEXT;
  v_check TEXT;
  v_sql TEXT;
BEGIN
  FOR r IN
    SELECT
      p.polname,
      p.polcmd,
      p.polpermissive,
      p.polroles,
      p.polrelid,
      n.nspname,
      c.relname,
      pg_get_expr(p.polqual, p.polrelid) AS qual,
      pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
  LOOP
    v_qual := r.qual;
    v_check := r.with_check;

    IF v_qual IS NOT NULL THEN
      v_qual := replace(v_qual, 'current_tenant_ids(', 'app_private.current_tenant_ids(');
      v_qual := replace(v_qual, 'is_tenant_member(', 'app_private.is_tenant_member(');
      v_qual := replace(v_qual, 'has_tenant_role(', 'app_private.has_tenant_role(');
      v_qual := replace(v_qual, 'is_super_admin(', 'app_private.is_super_admin(');
      v_qual := replace(v_qual, 'has_role(', 'app_private.has_role(');
    END IF;

    IF v_check IS NOT NULL THEN
      v_check := replace(v_check, 'current_tenant_ids(', 'app_private.current_tenant_ids(');
      v_check := replace(v_check, 'is_tenant_member(', 'app_private.is_tenant_member(');
      v_check := replace(v_check, 'has_tenant_role(', 'app_private.has_tenant_role(');
      v_check := replace(v_check, 'is_super_admin(', 'app_private.is_super_admin(');
      v_check := replace(v_check, 'has_role(', 'app_private.has_role(');
    END IF;

    v_cmd := CASE r.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      ELSE 'ALL'
    END;

    IF r.polroles = ARRAY[0]::oid[] THEN
      v_roles := 'PUBLIC';
    ELSE
      SELECT string_agg(quote_ident(rolname), ', ' ORDER BY rolname)
      INTO v_roles
      FROM pg_roles
      WHERE oid = ANY(r.polroles);
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.polname, r.nspname, r.relname);

    v_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      r.polname,
      r.nspname,
      r.relname,
      CASE WHEN r.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      v_cmd,
      v_roles
    );

    IF v_qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_qual);
    END IF;

    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;

    EXECUTE v_sql;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_tenant_role(uuid, uuid, public.tenant_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_tenant_ids() FROM PUBLIC, anon, authenticated;