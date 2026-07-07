CREATE OR REPLACE FUNCTION public.refresh_tenant_alerts(_tenant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_key text;
BEGIN
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

REVOKE ALL ON FUNCTION public.refresh_tenant_alerts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_tenant_alerts(uuid) TO service_role;