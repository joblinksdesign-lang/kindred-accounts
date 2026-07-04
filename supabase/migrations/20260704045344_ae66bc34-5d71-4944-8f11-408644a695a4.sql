
-- 1. Add pending plan fields
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pending_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pending_billing_cycle billing_cycle,
  ADD COLUMN IF NOT EXISTS pending_requested_at timestamptz;

-- Allow super admins to read notifications across tenants
DROP POLICY IF EXISTS "notif_super_admin_read" ON public.notifications;
CREATE POLICY "notif_super_admin_read" ON public.notifications
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'super_admin'::app_role));

-- Helper: insert notification for every super admin
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

-- Helper: notify tenant owner + managers
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

-- Trigger: new business registration → notify super admins
CREATE OR REPLACE FUNCTION public.on_tenant_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_super_admins(
    NEW.id, 'business_registered',
    'New business registered',
    NEW.business_name || ' just signed up and needs approval.',
    '/admin/tenants'
  );
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_tenant_created_notify ON public.tenants;
CREATE TRIGGER trg_tenant_created_notify
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.on_tenant_created();

-- Trigger: subscription plan change request
CREATE OR REPLACE FUNCTION public.on_subscription_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan_name text; v_biz text;
BEGIN
  SELECT business_name INTO v_biz FROM public.tenants WHERE id = NEW.tenant_id;
  -- New pending request
  IF NEW.pending_plan_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.pending_plan_id IS DISTINCT FROM NEW.pending_plan_id) THEN
    SELECT name INTO v_plan_name FROM public.plans WHERE id = NEW.pending_plan_id;
    PERFORM public.notify_super_admins(
      NEW.tenant_id, 'plan_request',
      'Plan change request',
      COALESCE(v_biz,'A business') || ' requested to switch to ' || COALESCE(v_plan_name,'a new plan') || '.',
      '/admin/tenants'
    );
  END IF;
  -- Approved (plan_id changed by super admin)
  IF TG_OP = 'UPDATE' AND OLD.plan_id IS DISTINCT FROM NEW.plan_id THEN
    SELECT name INTO v_plan_name FROM public.plans WHERE id = NEW.plan_id;
    PERFORM public.notify_tenant_admins(
      NEW.tenant_id, 'plan_activated',
      'Plan activated',
      'Your plan has been switched to ' || COALESCE(v_plan_name,'the new plan') || '.',
      '/billing'
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_subscription_change_notify ON public.subscriptions;
CREATE TRIGGER trg_subscription_change_notify
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.on_subscription_change();

-- Function usable by app to scan and create expiring/expired/low-stock/overdue notifications for a tenant.
-- Called on-demand from the client (idempotent per day via type key).
CREATE OR REPLACE FUNCTION public.refresh_tenant_alerts(_tenant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_key text;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant) THEN RETURN; END IF;

  -- Subscription expiring in ≤7 days or expired
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
          '/billing');
        PERFORM public.notify_super_admins(_tenant, v_key, 'Business subscription expiring',
          'A business subscription expires on ' || to_char(r.current_period_end,'Mon DD, YYYY') || '.', '/admin/tenants');
      END IF;
    END IF;
    IF r.current_period_end IS NOT NULL AND r.current_period_end <= now() THEN
      v_key := 'subscription_expired:' || r.id || ':' || to_char(r.current_period_end,'YYYY-MM-DD');
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE tenant_id=_tenant AND type=v_key) THEN
        PERFORM public.notify_tenant_admins(_tenant, v_key, 'Subscription expired',
          'Your subscription has expired. Renew to keep access.', '/billing');
        PERFORM public.notify_super_admins(_tenant, v_key, 'Business subscription expired',
          'A business subscription expired on ' || to_char(r.current_period_end,'Mon DD, YYYY') || '.', '/admin/tenants');
      END IF;
    END IF;
  END LOOP;

  -- Low stock
  FOR r IN
    SELECT id, name, quantity, reorder_level FROM public.products
    WHERE tenant_id=_tenant AND is_active=true AND reorder_level > 0 AND quantity <= reorder_level
  LOOP
    v_key := 'low_stock:' || r.id || ':' || to_char(now(),'YYYY-MM-DD');
    IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE tenant_id=_tenant AND type=v_key) THEN
      PERFORM public.notify_tenant_admins(_tenant, v_key, 'Low stock alert',
        r.name || ' is low ('|| r.quantity ||' left, reorder at '|| r.reorder_level ||').', '/products');
    END IF;
  END LOOP;

  -- Overdue invoices
  FOR r IN
    SELECT id, invoice_number, due_date, balance FROM public.invoices
    WHERE tenant_id=_tenant AND status <> 'paid' AND due_date IS NOT NULL AND due_date < CURRENT_DATE AND balance > 0
  LOOP
    v_key := 'overdue:' || r.id || ':' || to_char(now(),'YYYY-MM-DD');
    IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE tenant_id=_tenant AND type=v_key) THEN
      PERFORM public.notify_tenant_admins(_tenant, v_key, 'Invoice overdue',
        'Invoice ' || r.invoice_number || ' was due ' || to_char(r.due_date,'Mon DD, YYYY') || '.', '/invoices');
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.refresh_tenant_alerts(uuid) TO authenticated;
