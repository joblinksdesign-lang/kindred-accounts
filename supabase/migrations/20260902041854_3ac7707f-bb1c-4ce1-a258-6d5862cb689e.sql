REVOKE ALL ON FUNCTION public.set_customer_store_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_store_code() TO service_role;
REVOKE ALL ON FUNCTION public.generate_store_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_store_code(uuid, text) TO service_role;