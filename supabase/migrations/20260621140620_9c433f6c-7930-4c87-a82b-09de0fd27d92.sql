
CREATE OR REPLACE FUNCTION public.register_business(
  _business_name text, _email text, _phone text, _country text,
  _currency text, _currency_symbol text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant_id UUID;
  v_slug TEXT;
  v_plan_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_slug := lower(regexp_replace(_business_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(gen_random_uuid()::text, 1, 6);
  SELECT id INTO v_plan_id FROM public.plans
    WHERE is_active AND is_default ORDER BY sort_order LIMIT 1;

  INSERT INTO public.tenants (slug, business_name, owner_user_id, email, phone, country,
                              currency, currency_symbol, status, plan_id)
  VALUES (v_slug, _business_name, v_uid, _email, _phone, _country,
          COALESCE(_currency,'USD'), COALESCE(_currency_symbol,'$'), 'pending', v_plan_id)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_users (tenant_id, user_id, role, accepted_at)
  VALUES (v_tenant_id, v_uid, 'owner', now());

  INSERT INTO public.company_settings (tenant_id, company_name, email, phone, country,
                                       currency, currency_symbol)
  VALUES (v_tenant_id, _business_name, _email, _phone, _country,
          COALESCE(_currency,'USD'), COALESCE(_currency_symbol,'$'));

  IF v_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (tenant_id, plan_id, status, billing_cycle,
                                      current_period_start, current_period_end)
    VALUES (v_tenant_id, v_plan_id, 'active', 'monthly', now(), now() + interval '30 days');
  END IF;

  INSERT INTO public.notifications (tenant_id, user_id, type, title, message)
  SELECT v_tenant_id, ur.user_id, 'new_business',
         'New business registration', _business_name || ' is awaiting approval'
  FROM public.user_roles ur WHERE ur.role = 'super_admin';

  RETURN v_tenant_id;
END $function$;
