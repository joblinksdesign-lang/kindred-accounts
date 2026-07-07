REVOKE ALL ON FUNCTION public.notify_super_admins(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_tenant_admins(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_tenant_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_subscription_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_tenant_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_tenant_alerts(uuid) TO authenticated;