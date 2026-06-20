
-- =========================================================================
-- 1. WIPE existing business data
-- =========================================================================
TRUNCATE TABLE
  public.payments, public.receipts, public.invoice_items, public.invoices,
  public.quotation_items, public.quotations, public.stock_movements,
  public.products, public.customers, public.notifications, public.company_settings
RESTART IDENTITY CASCADE;

DROP SEQUENCE IF EXISTS public.invoice_seq CASCADE;
DROP SEQUENCE IF EXISTS public.receipt_seq CASCADE;
DROP SEQUENCE IF EXISTS public.quote_seq CASCADE;

-- =========================================================================
-- 2. New enums
-- =========================================================================
DO $$ BEGIN
  CREATE TYPE public.tenant_status AS ENUM ('pending','active','suspended','expired','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','canceled','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_cycle AS ENUM ('monthly','annual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tenant_role AS ENUM ('owner','manager','accountant','sales_agent','store_manager');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- 3. Plans
-- =========================================================================
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_annual NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  trial_days INT NOT NULL DEFAULT 0,
  max_invoices_per_month INT,
  max_customers INT,
  max_users INT,
  max_products INT,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_public_read" ON public.plans FOR SELECT
  TO anon, authenticated USING (is_active AND is_public);
CREATE POLICY "plans_super_admin_read_all" ON public.plans FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "plans_super_admin_write" ON public.plans FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 4. Tenants
-- =========================================================================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  legal_name TEXT,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  phone TEXT,
  country TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  currency_symbol TEXT NOT NULL DEFAULT '$',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status public.tenant_status NOT NULL DEFAULT 'pending',
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  invoice_counter BIGINT NOT NULL DEFAULT 0,
  receipt_counter BIGINT NOT NULL DEFAULT 0,
  quote_counter BIGINT NOT NULL DEFAULT 0,
  approved_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 5. Tenant membership
-- =========================================================================
CREATE TABLE public.tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.tenant_role NOT NULL DEFAULT 'owner',
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX idx_tenant_users_user ON public.tenant_users(user_id);
CREATE INDEX idx_tenant_users_tenant ON public.tenant_users(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_users TO authenticated;
GRANT ALL ON public.tenant_users TO service_role;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tenant_users_updated BEFORE UPDATE ON public.tenant_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 6. Subscriptions
-- =========================================================================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'active',
  billing_cycle public.billing_cycle NOT NULL DEFAULT 'monthly',
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_tenant ON public.subscriptions(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 7. Helper functions (authenticated-only)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_super_admin(_uid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role='super_admin')
$$;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_uid UUID, _tenant UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_users
                 WHERE user_id=_uid AND tenant_id=_tenant AND is_active=true)
$$;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(UUID,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_tenant_role(_uid UUID, _tenant UUID, _roles public.tenant_role[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_users
                 WHERE user_id=_uid AND tenant_id=_tenant AND is_active=true AND role=ANY(_roles))
$$;
REVOKE EXECUTE ON FUNCTION public.has_tenant_role(UUID,UUID,public.tenant_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_tenant_role(UUID,UUID,public.tenant_role[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_tenant_ids()
RETURNS SETOF UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.tenant_users
  WHERE user_id = auth.uid() AND is_active = true
$$;
REVOKE EXECUTE ON FUNCTION public.current_tenant_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_ids() TO authenticated;

-- =========================================================================
-- 8. Policies on tenants / tenant_users / subscriptions
-- =========================================================================
CREATE POLICY "tenants_member_read" ON public.tenants FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tenants_owner_update" ON public.tenants FOR UPDATE TO authenticated
  USING (public.has_tenant_role(auth.uid(), id, ARRAY['owner']::public.tenant_role[])
         OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_tenant_role(auth.uid(), id, ARRAY['owner']::public.tenant_role[])
              OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tenants_super_admin_write" ON public.tenants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "tenant_users_read" ON public.tenant_users FOR SELECT TO authenticated
  USING (user_id = auth.uid()
      OR public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager']::public.tenant_role[])
      OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tenant_users_owner_write" ON public.tenant_users FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner']::public.tenant_role[])
         OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner']::public.tenant_role[])
              OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "subs_member_read" ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "subs_super_admin_write" ON public.subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- =========================================================================
-- 9. Add tenant_id and rewrite RLS on existing tables
-- =========================================================================
ALTER TABLE public.customers        ADD COLUMN tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.products         ADD COLUMN tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.invoices         ADD COLUMN tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.invoice_items    ADD COLUMN tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.payments         ADD COLUMN tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.receipts         ADD COLUMN tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.quotations       ADD COLUMN tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.quotation_items  ADD COLUMN tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.stock_movements  ADD COLUMN tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.notifications    ADD COLUMN tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.company_settings ADD COLUMN tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_tenant_uniq UNIQUE (tenant_id);

ALTER TABLE public.invoices  DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
ALTER TABLE public.invoices  ADD CONSTRAINT invoices_tenant_invnum_uniq UNIQUE (tenant_id, invoice_number);
ALTER TABLE public.receipts  DROP CONSTRAINT IF EXISTS receipts_receipt_number_key;
ALTER TABLE public.receipts  ADD CONSTRAINT receipts_tenant_recnum_uniq UNIQUE (tenant_id, receipt_number);
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_quote_number_key;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_tenant_quonum_uniq UNIQUE (tenant_id, quote_number);

CREATE INDEX idx_customers_tenant       ON public.customers(tenant_id);
CREATE INDEX idx_products_tenant        ON public.products(tenant_id);
CREATE INDEX idx_invoices_tenant        ON public.invoices(tenant_id);
CREATE INDEX idx_invoice_items_tenant   ON public.invoice_items(tenant_id);
CREATE INDEX idx_payments_tenant        ON public.payments(tenant_id);
CREATE INDEX idx_receipts_tenant        ON public.receipts(tenant_id);
CREATE INDEX idx_quotations_tenant      ON public.quotations(tenant_id);
CREATE INDEX idx_quotation_items_tenant ON public.quotation_items(tenant_id);
CREATE INDEX idx_stock_movements_tenant ON public.stock_movements(tenant_id);
CREATE INDEX idx_notifications_tenant   ON public.notifications(tenant_id);

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname='public'
             AND tablename IN ('customers','products','invoices','invoice_items','payments',
                               'receipts','quotations','quotation_items','stock_movements',
                               'notifications','company_settings')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- customers
CREATE POLICY "customers_read" ON public.customers FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "customers_insert" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant','sales_agent']::public.tenant_role[]));
CREATE POLICY "customers_update" ON public.customers FOR UPDATE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant','sales_agent']::public.tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant','sales_agent']::public.tenant_role[]));
CREATE POLICY "customers_delete" ON public.customers FOR DELETE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager']::public.tenant_role[]));

-- products
CREATE POLICY "products_read" ON public.products FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "products_insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','store_manager']::public.tenant_role[]));
CREATE POLICY "products_update" ON public.products FOR UPDATE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','store_manager']::public.tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','store_manager']::public.tenant_role[]));
CREATE POLICY "products_delete" ON public.products FOR DELETE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager']::public.tenant_role[]));

-- invoices
CREATE POLICY "invoices_read" ON public.invoices FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant','sales_agent']::public.tenant_role[]));
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant','sales_agent']::public.tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant','sales_agent']::public.tenant_role[]));
CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager']::public.tenant_role[]));

CREATE POLICY "invoice_items_read" ON public.invoice_items FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "invoice_items_write" ON public.invoice_items FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant','sales_agent']::public.tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant','sales_agent']::public.tenant_role[]));

CREATE POLICY "payments_read" ON public.payments FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "payments_insert" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant']::public.tenant_role[]));
CREATE POLICY "payments_update" ON public.payments FOR UPDATE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant']::public.tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant']::public.tenant_role[]));
CREATE POLICY "payments_delete" ON public.payments FOR DELETE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager']::public.tenant_role[]));

CREATE POLICY "receipts_read" ON public.receipts FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "receipts_write" ON public.receipts FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant']::public.tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant']::public.tenant_role[]));

CREATE POLICY "quotations_read" ON public.quotations FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "quotations_write" ON public.quotations FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant','sales_agent']::public.tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant','sales_agent']::public.tenant_role[]));

CREATE POLICY "quotation_items_read" ON public.quotation_items FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "quotation_items_write" ON public.quotation_items FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant','sales_agent']::public.tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','accountant','sales_agent']::public.tenant_role[]));

CREATE POLICY "stock_read" ON public.stock_movements FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "stock_insert" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id,
    ARRAY['owner','manager','store_manager','accountant','sales_agent']::public.tenant_role[]));

CREATE POLICY "notif_read" ON public.notifications FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "notif_write" ON public.notifications FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "settings_read" ON public.company_settings FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "settings_write" ON public.company_settings FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager']::public.tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager']::public.tenant_role[]));

-- =========================================================================
-- 10. Per-tenant document numbering
-- =========================================================================
CREATE OR REPLACE FUNCTION public.next_tenant_doc_number(_tenant UUID, _kind TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n BIGINT; v_prefix TEXT;
BEGIN
  IF _kind = 'invoice' THEN
    UPDATE public.tenants SET invoice_counter = invoice_counter + 1
      WHERE id = _tenant RETURNING invoice_counter INTO v_n;
    SELECT COALESCE(invoice_prefix,'INV') INTO v_prefix
      FROM public.company_settings WHERE tenant_id = _tenant;
    v_prefix := COALESCE(v_prefix,'INV');
  ELSIF _kind = 'receipt' THEN
    UPDATE public.tenants SET receipt_counter = receipt_counter + 1
      WHERE id = _tenant RETURNING receipt_counter INTO v_n;
    SELECT COALESCE(receipt_prefix,'REC') INTO v_prefix
      FROM public.company_settings WHERE tenant_id = _tenant;
    v_prefix := COALESCE(v_prefix,'REC');
  ELSE
    UPDATE public.tenants SET quote_counter = quote_counter + 1
      WHERE id = _tenant RETURNING quote_counter INTO v_n;
    SELECT COALESCE(quote_prefix,'QUO') INTO v_prefix
      FROM public.company_settings WHERE tenant_id = _tenant;
    v_prefix := COALESCE(v_prefix,'QUO');
  END IF;
  RETURN v_prefix || '-' || to_char(now(),'YYYY') || '-' || lpad(v_n::text, 5, '0');
END $$;
REVOKE EXECUTE ON FUNCTION public.next_tenant_doc_number(UUID,TEXT) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.set_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := public.next_tenant_doc_number(NEW.tenant_id, 'invoice');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_quote_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    NEW.quote_number := public.next_tenant_doc_number(NEW.tenant_id, 'quote');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.handle_payment_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv RECORD; v_total_paid NUMERIC(14,2); v_status invoice_status;
  v_receipt_no TEXT; v_item RECORD;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  SELECT COALESCE(SUM(amount),0) INTO v_total_paid FROM public.payments WHERE invoice_id = NEW.invoice_id;
  IF v_total_paid >= v_inv.total THEN v_status := 'paid';
  ELSIF v_total_paid > 0 THEN v_status := 'partial';
  ELSE v_status := v_inv.status; END IF;

  UPDATE public.invoices
    SET amount_paid = v_total_paid,
        balance = GREATEST(v_inv.total - v_total_paid, 0),
        status = v_status
    WHERE id = NEW.invoice_id;

  IF v_status = 'paid' THEN
    v_receipt_no := public.next_tenant_doc_number(v_inv.tenant_id, 'receipt');
    INSERT INTO public.receipts (tenant_id, receipt_number, invoice_id, customer_id, amount, method, payment_date)
    VALUES (v_inv.tenant_id, v_receipt_no, v_inv.id, v_inv.customer_id, v_inv.total, NEW.method, NEW.payment_date);
    IF NOT v_inv.stock_deducted THEN
      FOR v_item IN
        SELECT product_id, quantity FROM public.invoice_items
        WHERE invoice_id = v_inv.id AND product_id IS NOT NULL
      LOOP
        INSERT INTO public.stock_movements (tenant_id, product_id, change_qty, reason, reference, notes, created_by)
        VALUES (v_inv.tenant_id, v_item.product_id, -v_item.quantity, 'sale', v_inv.invoice_number,
                'Auto-deducted on payment', NEW.created_by);
      END LOOP;
      UPDATE public.invoices SET stock_deducted = true WHERE id = v_inv.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- =========================================================================
-- 11. New-user handler: first user becomes super_admin
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));

  SELECT COUNT(*) INTO v_count FROM public.user_roles WHERE role = 'super_admin';
  IF v_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  END IF;
  RETURN NEW;
END $$;

-- Promote existing admins to super_admin
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'super_admin'::app_role FROM public.user_roles WHERE role = 'admin'
ON CONFLICT (user_id, role) DO NOTHING;

-- =========================================================================
-- 12. register_business RPC
-- =========================================================================
CREATE OR REPLACE FUNCTION public.register_business(
  _business_name TEXT, _email TEXT, _phone TEXT,
  _country TEXT, _currency TEXT, _currency_symbol TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant_id UUID;
  v_slug TEXT;
  v_plan_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_slug := lower(regexp_replace(_business_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(gen_random_uuid()::text, 1, 6);
  SELECT id INTO v_plan_id FROM public.plans
    WHERE is_active AND is_default ORDER BY sort_order LIMIT 1;

  INSERT INTO public.tenants (slug, business_name, owner_user_id, email, phone, country,
                              currency, currency_symbol, status, plan_id)
  VALUES (v_slug, _business_name, v_uid, _email, _phone, _country,
          COALESCE(_currency,'USD'), COALESCE(_currency_symbol,'$'), 'pending', v_plan_id)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_users (tenant_id, user_id, role, accepted_at)
  VALUES (v_tenant_id, v_uid, 'owner', now());

  INSERT INTO public.company_settings (tenant_id, company_name, email, phone, country,
                                       currency, currency_symbol)
  VALUES (v_tenant_id, _business_name, _email, _phone, _country,
          COALESCE(_currency,'USD'), COALESCE(_currency_symbol,'$'));

  IF v_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (tenant_id, plan_id, status, billing_cycle,
                                      current_period_start, current_period_end)
    VALUES (v_tenant_id, v_plan_id, 'active', 'monthly', now(), now() + interval '30 days');
  END IF;

  INSERT INTO public.notifications (tenant_id, user_id, kind, title, body)
  SELECT v_tenant_id, ur.user_id, 'new_business',
         'New business registration', _business_name || ' is awaiting approval'
  FROM public.user_roles ur WHERE ur.role = 'super_admin';

  RETURN v_tenant_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.register_business(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_business(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

-- =========================================================================
-- 13. Seed default plans
-- =========================================================================
INSERT INTO public.plans (slug,name,tagline,description,price_monthly,price_annual,trial_days,
  max_invoices_per_month,max_customers,max_users,max_products,features,is_default,sort_order)
VALUES
('free','Free','Get started','For solopreneurs trying the platform.',
 0,0,0,100,50,1,100,
 '["100 invoices/month","50 customers","1 user","Basic reports","Email support"]'::jsonb, true, 1),
('starter','Starter','Small teams','Growing businesses ready for more.',
 19,190,14,500,300,5,1000,
 '["500 invoices/month","300 customers","5 users","Inventory tracking","PDF templates","Email support"]'::jsonb, false, 2),
('professional','Professional','Most popular','Full toolkit for established businesses.',
 49,490,14,NULL,NULL,15,NULL,
 '["Unlimited invoices","Unlimited customers","15 users","Advanced reports","Inventory management","Quotations","Priority support"]'::jsonb, false, 3),
('enterprise','Enterprise','Scale','For wholesalers and multi-branch operations.',
 149,1490,30,NULL,NULL,NULL,NULL,
 '["Unlimited everything","Multi-branch support","API access","Dedicated success manager","SLA & priority support"]'::jsonb, false, 4);
