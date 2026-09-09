CREATE TABLE public.platform_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  account_name text,
  account_number text,
  instructions text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_payment_methods TO authenticated;
GRANT ALL ON public.platform_payment_methods TO service_role;

ALTER TABLE public.platform_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view active payment methods"
  ON public.platform_payment_methods FOR SELECT TO authenticated
  USING (is_active OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins manage payment methods"
  ON public.platform_payment_methods FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_platform_payment_methods_updated_at
  BEFORE UPDATE ON public.platform_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  admin_whatsapp text,
  payment_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view platform settings"
  ON public.platform_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Super admins update platform settings"
  ON public.platform_settings FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins insert platform settings"
  ON public.platform_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_settings (singleton, payment_note)
VALUES (true, 'Pay using any of the methods below, then notify the admin with your business name and the payment reference.');