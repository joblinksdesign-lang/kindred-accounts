CREATE OR REPLACE FUNCTION public.approve_plan_request(_subscription_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
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