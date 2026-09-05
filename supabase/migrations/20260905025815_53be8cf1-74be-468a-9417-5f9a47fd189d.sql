GRANT SELECT ON public.pwa_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.pwa_settings TO authenticated;
GRANT ALL ON public.pwa_settings TO service_role;