CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.schedule_plan_expiry_reminders(_url text, _key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _cmd text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  _cmd := format(
    $q$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization', %L), body := '{}'::jsonb) $q$,
    _url, 'Bearer ' || _key
  );

  PERFORM cron.unschedule('plan-expiry-reminders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'plan-expiry-reminders');

  PERFORM cron.schedule('plan-expiry-reminders', '0 6 * * *', _cmd);
  RETURN 'scheduled';
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_plan_expiry_reminders(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.schedule_plan_expiry_reminders(text, text) TO authenticated;