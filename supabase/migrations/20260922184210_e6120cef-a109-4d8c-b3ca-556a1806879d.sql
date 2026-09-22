-- 1. Branches -------------------------------------------------------------
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  phone text,
  address text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branches_read" ON public.branches FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "branches_insert" ON public.branches FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager']::tenant_role[]));
CREATE POLICY "branches_update" ON public.branches FOR UPDATE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager']::tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager']::tenant_role[]));
CREATE POLICY "branches_delete" ON public.branches FOR DELETE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager']::tenant_role[]));

CREATE INDEX idx_branches_tenant ON public.branches(tenant_id, is_active);
CREATE UNIQUE INDEX idx_branches_one_default ON public.branches(tenant_id) WHERE is_default;

CREATE TRIGGER trg_branches_updated BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Per-branch stock ------------------------------------------------------
CREATE TABLE public.branch_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_stock TO authenticated;
GRANT ALL ON public.branch_stock TO service_role;
ALTER TABLE public.branch_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_stock_read" ON public.branch_stock FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "branch_stock_write" ON public.branch_stock FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager','store_manager']::tenant_role[]))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager','store_manager']::tenant_role[]));

CREATE INDEX idx_branch_stock_tenant_branch ON public.branch_stock(tenant_id, branch_id);
CREATE INDEX idx_branch_stock_product ON public.branch_stock(product_id);

CREATE TRIGGER trg_branch_stock_updated BEFORE UPDATE ON public.branch_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Branch tagging on existing tables ------------------------------------
ALTER TABLE public.tenant_users ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.stock_movements ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.quotations ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.receipts ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX idx_invoices_branch ON public.invoices(tenant_id, branch_id);
CREATE INDEX idx_receipts_branch ON public.receipts(tenant_id, branch_id);
CREATE INDEX idx_payments_branch ON public.payments(tenant_id, branch_id);
CREATE INDEX idx_expenses_branch ON public.expenses(tenant_id, branch_id);
CREATE INDEX idx_stock_movements_branch ON public.stock_movements(tenant_id, branch_id);

-- 4. Stock transfers -------------------------------------------------------
CREATE TABLE public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transfer_number text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  from_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  to_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  quantity numeric(14,2) NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stock_transfers TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_transfers_read" ON public.stock_transfers FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "stock_transfers_insert" ON public.stock_transfers FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','manager','store_manager']::tenant_role[]));

CREATE INDEX idx_stock_transfers_tenant ON public.stock_transfers(tenant_id, created_at DESC);

-- 5. Stock movement trigger now maintains per-branch stock -----------------
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.products SET quantity = quantity + NEW.change_qty WHERE id = NEW.product_id;

  IF NEW.branch_id IS NOT NULL THEN
    INSERT INTO public.branch_stock (tenant_id, branch_id, product_id, quantity)
    VALUES (NEW.tenant_id, NEW.branch_id, NEW.product_id, NEW.change_qty)
    ON CONFLICT (branch_id, product_id)
    DO UPDATE SET quantity = public.branch_stock.quantity + EXCLUDED.quantity, updated_at = now();
  END IF;

  RETURN NEW;
END; $function$;

-- 6. Instant transfer between branches ------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_stock(
  _tenant uuid,
  _from uuid,
  _to uuid,
  _items jsonb,
  _notes text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref text;
  it jsonb;
  v_prod uuid;
  v_qty numeric;
  v_avail numeric;
BEGIN
  IF NOT public.has_tenant_role(auth.uid(), _tenant, ARRAY['owner','manager','store_manager']::tenant_role[]) THEN
    RAISE EXCEPTION 'You do not have permission to transfer stock';
  END IF;
  IF _from = _to THEN
    RAISE EXCEPTION 'Pick two different branches';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = _from AND tenant_id = _tenant)
     OR NOT EXISTS (SELECT 1 FROM public.branches WHERE id = _to AND tenant_id = _tenant) THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one product to transfer';
  END IF;

  v_ref := 'TRF-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));

  FOR it IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_prod := (it->>'product_id')::uuid;
    v_qty := (it->>'quantity')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;

    SELECT quantity INTO v_avail FROM public.branch_stock
      WHERE branch_id = _from AND product_id = v_prod;
    IF COALESCE(v_avail, 0) < v_qty THEN
      RAISE EXCEPTION 'Not enough stock at the sending branch';
    END IF;

    INSERT INTO public.stock_transfers
      (tenant_id, transfer_number, product_id, from_branch_id, to_branch_id, quantity, notes, created_by)
    VALUES (_tenant, v_ref, v_prod, _from, _to, v_qty, _notes, auth.uid());

    INSERT INTO public.stock_movements
      (tenant_id, product_id, branch_id, change_qty, reason, reference, notes, created_by)
    VALUES (_tenant, v_prod, _from, -v_qty, 'stock_out', v_ref, COALESCE(_notes, 'Transfer out'), auth.uid());

    INSERT INTO public.stock_movements
      (tenant_id, product_id, branch_id, change_qty, reason, reference, notes, created_by)
    VALUES (_tenant, v_prod, _to, v_qty, 'stock_in', v_ref, COALESCE(_notes, 'Transfer in'), auth.uid());
  END LOOP;

  RETURN v_ref;
END; $function$;

REVOKE ALL ON FUNCTION public.transfer_stock(uuid, uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_stock(uuid, uuid, uuid, jsonb, text) TO authenticated;

-- 7. Backfill: a Main branch per business, with all existing data attached --
INSERT INTO public.branches (tenant_id, name, code, is_default, is_active)
SELECT t.id, 'Main branch', 'MAIN', true, true FROM public.tenants t;

UPDATE public.tenant_users tu
SET branch_id = b.id
FROM public.branches b
WHERE b.tenant_id = tu.tenant_id AND b.is_default
  AND tu.role NOT IN ('owner','manager');

UPDATE public.stock_movements s SET branch_id = b.id
FROM public.branches b WHERE b.tenant_id = s.tenant_id AND b.is_default AND s.branch_id IS NULL;
UPDATE public.invoices i SET branch_id = b.id
FROM public.branches b WHERE b.tenant_id = i.tenant_id AND b.is_default AND i.branch_id IS NULL;
UPDATE public.quotations q SET branch_id = b.id
FROM public.branches b WHERE b.tenant_id = q.tenant_id AND b.is_default AND q.branch_id IS NULL;
UPDATE public.receipts r SET branch_id = b.id
FROM public.branches b WHERE b.tenant_id = r.tenant_id AND b.is_default AND r.branch_id IS NULL;
UPDATE public.payments p SET branch_id = b.id
FROM public.branches b WHERE b.tenant_id = p.tenant_id AND b.is_default AND p.branch_id IS NULL;
UPDATE public.expenses e SET branch_id = b.id
FROM public.branches b WHERE b.tenant_id = e.tenant_id AND b.is_default AND e.branch_id IS NULL;

INSERT INTO public.branch_stock (tenant_id, branch_id, product_id, quantity)
SELECT p.tenant_id, b.id, p.id, p.quantity
FROM public.products p
JOIN public.branches b ON b.tenant_id = p.tenant_id AND b.is_default
ON CONFLICT (branch_id, product_id) DO NOTHING;