REVOKE ALL ON FUNCTION public.refresh_tenant_alerts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_tenant_alerts(uuid) TO service_role;