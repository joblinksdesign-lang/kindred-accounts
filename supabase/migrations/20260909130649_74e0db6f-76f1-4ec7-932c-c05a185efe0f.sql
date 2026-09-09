GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_payment_methods TO authenticated;
GRANT ALL ON public.platform_payment_methods TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon, public;