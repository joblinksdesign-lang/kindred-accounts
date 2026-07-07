DROP POLICY IF EXISTS company_assets_read ON storage.objects;
DROP POLICY IF EXISTS company_assets_insert ON storage.objects;
DROP POLICY IF EXISTS company_assets_update ON storage.objects;
DROP POLICY IF EXISTS company_assets_delete ON storage.objects;

CREATE POLICY company_assets_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'company-assets'
  AND public.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid)
);

CREATE POLICY company_assets_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-assets'
  AND public.has_tenant_role(auth.uid(), split_part(name, '/', 1)::uuid, ARRAY['owner','manager']::public.tenant_role[])
);

CREATE POLICY company_assets_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-assets'
  AND public.has_tenant_role(auth.uid(), split_part(name, '/', 1)::uuid, ARRAY['owner','manager']::public.tenant_role[])
)
WITH CHECK (
  bucket_id = 'company-assets'
  AND public.has_tenant_role(auth.uid(), split_part(name, '/', 1)::uuid, ARRAY['owner','manager']::public.tenant_role[])
);

CREATE POLICY company_assets_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-assets'
  AND public.has_tenant_role(auth.uid(), split_part(name, '/', 1)::uuid, ARRAY['owner','manager']::public.tenant_role[])
);

CREATE OR REPLACE FUNCTION public.notify_super_admins(_tenant uuid, _type text, _title text, _message text, _link text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT user_id FROM public.user_roles WHERE role = 'super_admin'
  LOOP
    INSERT INTO public.notifications(tenant_id, user_id, type, title, message, link)
    VALUES (_tenant, u, _type, _title, _message, _link);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.notify_tenant_admins(_tenant uuid, _type text, _title text, _message text, _link text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT user_id FROM public.tenant_users
             WHERE tenant_id = _tenant AND is_active = true AND role IN ('owner','manager')
  LOOP
    INSERT INTO public.notifications(tenant_id, user_id, type, title, message, link)
    VALUES (_tenant, u, _type, _title, _message, _link);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.on_tenant_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_super_admins(
    NEW.id, 'business_registered:' || NEW.id,
    'New business registered',
    NEW.business_name || ' just signed up and needs approval.',
    '/admin/tenants?tenant=' || NEW.id::text
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.on_subscription_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan_name text; v_biz text;
BEGIN
  SELECT business_name INTO v_biz FROM public.tenants WHERE id = NEW.tenant_id;
  IF NEW.pending_plan_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.pending_plan_id IS DISTINCT FROM NEW.pending_plan_id) THEN
    SELECT name INTO v_plan_name FROM public.plans WHERE id = NEW.pending_plan_id;
    PERFORM public.notify_super_admins(
      NEW.tenant_id, 'plan_request:' || NEW.id,
      'Plan change request',
      COALESCE(v_biz,'A business') || ' requested to switch to ' || COALESCE(v_plan_name,'a new plan') || '.',
      '/admin/tenants?subscription=' || NEW.id::text
    );
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.plan_id IS DISTINCT FROM NEW.plan_id THEN
    SELECT name INTO v_plan_name FROM public.plans WHERE id = NEW.plan_id;
    PERFORM public.notify_tenant_admins(
      NEW.tenant_id, 'plan_activated:' || NEW.id,
      'Plan activated',
      'Your plan has been switched to ' || COALESCE(v_plan_name,'the new plan') || '.',
      '/billing?subscription=' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_tenant_alerts(_tenant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_key text;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant) THEN RETURN; END IF;

  FOR r IN
    SELECT s.id, s.current_period_end, s.status, p.name AS plan_name
    FROM public.subscriptions s LEFT JOIN public.plans p ON p.id = s.plan_id
    WHERE s.tenant_id = _tenant
  LOOP
    IF r.current_period_end IS NOT NULL
       AND r.current_period_end < now() + interval '7 days'
       AND r.current_period_end > now() THEN
      v_key := 'subscription_expiring:' || r.id || ':' || to_char(r.current_period_end, 'YYYY-MM-DD');
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE tenant_id=_tenant AND type=v_key) THEN
        PERFORM public.notify_tenant_admins(_tenant, v_key, 'Subscription expiring soon',
          COALESCE(r.plan_name,'Your plan') || ' expires on ' || to_char(r.current_period_end,'Mon DD, YYYY') || '.',
          '/billing?subscription=' || r.id::text);
        PERFORM public.notify_super_admins(_tenant, v_key, 'Business subscription expiring',
          'A business subscription expires on ' || to_char(r.current_period_end,'Mon DD, YYYY') || '.',
          '/admin/tenants?subscription=' || r.id::text);
      END IF;
    END IF;
    IF r.current_period_end IS NOT NULL AND r.current_period_end <= now() THEN
      v_key := 'subscription_expired:' || r.id || ':' || to_char(r.current_period_end,'YYYY-MM-DD');
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE tenant_id=_tenant AND type=v_key) THEN
        PERFORM public.notify_tenant_admins(_tenant, v_key, 'Subscription expired',
          'Your subscription has expired. Renew to keep access.', '/billing?subscription=' || r.id::text);
        PERFORM public.notify_super_admins(_tenant, v_key, 'Business subscription expired',
          'A business subscription expired on ' || to_char(r.current_period_end,'Mon DD, YYYY') || '.',
          '/admin/tenants?subscription=' || r.id::text);
      END IF;
    END IF;
  END LOOP;

  FOR r IN
    SELECT id, name, quantity, reorder_level FROM public.products
    WHERE tenant_id=_tenant AND is_active=true AND reorder_level > 0 AND quantity <= reorder_level
  LOOP
    v_key := 'low_stock:' || r.id || ':' || to_char(now(),'YYYY-MM-DD');
    IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE tenant_id=_tenant AND type=v_key) THEN
      PERFORM public.notify_tenant_admins(_tenant, v_key, 'Low stock alert',
        r.name || ' is low ('|| r.quantity ||' left, reorder at '|| r.reorder_level ||').', '/products?product=' || r.id::text);
    END IF;
  END LOOP;

  FOR r IN
    SELECT id, invoice_number, due_date, balance FROM public.invoices
    WHERE tenant_id=_tenant AND status <> 'paid' AND due_date IS NOT NULL AND due_date < CURRENT_DATE AND balance > 0
  LOOP
    v_key := 'overdue:' || r.id || ':' || to_char(now(),'YYYY-MM-DD');
    IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE tenant_id=_tenant AND type=v_key) THEN
      PERFORM public.notify_tenant_admins(_tenant, v_key, 'Invoice overdue',
        'Invoice ' || r.invoice_number || ' was due ' || to_char(r.due_date,'Mon DD, YYYY') || '.', '/invoices/' || r.id::text);
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.refresh_tenant_alerts(uuid) TO authenticated;