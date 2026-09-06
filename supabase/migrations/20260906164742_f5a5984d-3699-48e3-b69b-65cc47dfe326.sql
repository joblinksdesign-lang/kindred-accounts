DROP POLICY IF EXISTS "Public storefront products are viewable" ON public.products;
DROP POLICY IF EXISTS "Public storefront tenants are viewable" ON public.tenants;

REVOKE ALL ON public.products FROM anon;
REVOKE ALL ON public.tenants FROM anon;