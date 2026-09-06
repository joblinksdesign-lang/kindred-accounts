CREATE TABLE public.pwa_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  app_name text NOT NULL DEFAULT 'SoftfrackPos',
  short_name text NOT NULL DEFAULT 'SoftfrackPos',
  description text NOT NULL DEFAULT 'Invoicing, receipts, inventory and POS for growing businesses.',
  theme_color text NOT NULL DEFAULT '#0B6E4F',
  background_color text NOT NULL DEFAULT '#F5F3EE',
  display_mode text NOT NULL DEFAULT 'standalone',
  start_url text NOT NULL DEFAULT '/',
  icon_url text,
  splash_url text,
  icon_sizes integer[] NOT NULL DEFAULT ARRAY[192,512],
  splash_width integer NOT NULL DEFAULT 1242,
  splash_height integer NOT NULL DEFAULT 2688,
  install_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pwa_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.pwa_settings TO authenticated;
GRANT ALL ON public.pwa_settings TO service_role;

ALTER TABLE public.pwa_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pwa_settings readable by everyone" ON public.pwa_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "pwa_settings insert by super admin" ON public.pwa_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "pwa_settings update by super admin" ON public.pwa_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_pwa_settings_updated_at BEFORE UPDATE ON public.pwa_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pwa_settings (singleton) VALUES (true);