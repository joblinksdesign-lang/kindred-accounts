WITH repaired AS (
  UPDATE public.subscriptions
  SET current_period_start = now(),
      current_period_end = now() + CASE billing_cycle
        WHEN 'annual'::public.billing_cycle THEN interval '1 year'
        ELSE interval '1 month'
      END,
      trial_ends_at = NULL,
      cancel_at_period_end = false
  WHERE status = 'active'::public.subscription_status
    AND current_period_end < now()
    AND pending_plan_id IS NULL
  RETURNING tenant_id
)
UPDATE public.tenants t
SET status = 'active'::public.tenant_status,
    suspended_at = NULL
WHERE t.id IN (SELECT tenant_id FROM repaired);