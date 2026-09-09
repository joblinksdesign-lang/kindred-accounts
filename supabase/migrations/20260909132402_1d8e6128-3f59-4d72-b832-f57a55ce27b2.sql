ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_discount_type_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_discount_type_check CHECK (discount_type IN ('none','percent','amount'));

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_discount_value_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_discount_value_check CHECK (discount_value >= 0);