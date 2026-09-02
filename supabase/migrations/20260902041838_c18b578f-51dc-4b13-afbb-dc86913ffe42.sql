ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS store_code text;

CREATE OR REPLACE FUNCTION public.generate_store_code(_tenant uuid, _name text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _base text;
  _code text;
  _i int := 0;
BEGIN
  _base := regexp_replace(coalesce(_name, 'CU'), '[^A-Za-z]', '', 'g');
  IF length(_base) < 2 THEN _base := _base || 'CU'; END IF;
  _base := upper(substr(_base, 1, 1)) || lower(substr(_base, 2, 1));
  LOOP
    _code := _base || lpad(floor(random() * 1000)::int::text, 3, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.customers c WHERE c.tenant_id = _tenant AND c.store_code = _code
    );
    _i := _i + 1;
    IF _i > 200 THEN
      _code := _base || lpad((floor(random() * 1000)::int)::text, 3, '0') || _i::text;
      EXIT;
    END IF;
  END LOOP;
  RETURN _code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_store_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_store_code(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_customer_store_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.store_code IS NULL OR btrim(NEW.store_code) = '' THEN
    NEW.store_code := public.generate_store_code(NEW.tenant_id, NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_store_code ON public.customers;
CREATE TRIGGER trg_customers_store_code
BEFORE INSERT ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.set_customer_store_code();

UPDATE public.customers
SET store_code = public.generate_store_code(tenant_id, name)
WHERE store_code IS NULL OR btrim(store_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_store_code_key
  ON public.customers (tenant_id, store_code);