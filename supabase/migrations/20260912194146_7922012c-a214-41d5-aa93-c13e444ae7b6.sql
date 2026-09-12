CREATE OR REPLACE FUNCTION public.approve_plan_request(_subscription_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_period_end timestamptz;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a super admin can activate a plan';
  END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE id = _subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  IF v_subscription.pending_plan_id IS NULL OR v_subscription.pending_billing_cycle IS NULL THEN
    RAISE EXCEPTION 'This plan request is no longer pending';
  END IF;

  v_period_end := GREATEST(COALESCE(v_subscription.current_period_end, now()), now())
    + CASE v_subscription.pending_billing_cycle
        WHEN 'annual'::public.billing_cycle THEN interval '1 year'
        ELSE interval '1 month'
      END;

  UPDATE public.subscriptions
  SET plan_id = v_subscription.pending_plan_id,
      billing_cycle = v_subscription.pending_billing_cycle,
      status = 'active'::public.subscription_status,
      current_period_start = now(),
      current_period_end = v_period_end,
      trial_ends_at = NULL,
      cancel_at_period_end = false,
      pending_plan_id = NULL,
      pending_billing_cycle = NULL,
      pending_requested_at = NULL
  WHERE id = _subscription_id;

  UPDATE public.tenants
  SET plan_id = v_subscription.pending_plan_id,
      status = 'active'::public.tenant_status,
      suspended_at = NULL
  WHERE id = v_subscription.tenant_id;

  RETURN v_period_end;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_plan_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_plan_request(uuid) TO authenticated;

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
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'active'::public.subscription_status
     AND NEW.pending_plan_id IS NULL
     AND (OLD.pending_plan_id IS NOT NULL OR OLD.plan_id IS DISTINCT FROM NEW.plan_id) THEN
    SELECT name INTO v_plan_name FROM public.plans WHERE id = NEW.plan_id;
    PERFORM public.notify_tenant_admins(
      NEW.tenant_id, 'plan_activated:' || NEW.id || ':' || to_char(NEW.current_period_end, 'YYYY-MM-DD'),
      'Plan renewed and activated',
      'Your ' || COALESCE(v_plan_name,'plan') || ' plan is active until ' || to_char(NEW.current_period_end, 'Mon DD, YYYY') || '. You can continue selling now.',
      '/billing?subscription=' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END $$;