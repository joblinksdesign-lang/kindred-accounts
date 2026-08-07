ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS brand_color text NOT NULL DEFAULT '#8CC63F',
  ADD COLUMN IF NOT EXISTS tagline text;