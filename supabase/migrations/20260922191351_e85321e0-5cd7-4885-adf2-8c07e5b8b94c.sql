GRANT EXECUTE ON FUNCTION public.has_tenant_role(uuid, uuid, public.tenant_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_ids() TO authenticated;