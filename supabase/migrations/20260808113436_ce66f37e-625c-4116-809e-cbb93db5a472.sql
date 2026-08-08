CREATE TYPE public.expense_recurrence AS ENUM ('none','daily','weekly','monthly');

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text,
  vendor text,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  method public.payment_method NOT NULL DEFAULT 'cash',
  reference text,
  notes text,
  recurrence public.expense_recurrence NOT NULL DEFAULT 'none',
  recurrence_end date,
  next_run_date date,
  parent_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_tenant_date ON public.expenses (tenant_id, expense_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_read" ON public.expenses FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role,'manager'::tenant_role,'accountant'::tenant_role]));
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE TO authenticated
  USING (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role,'manager'::tenant_role,'accountant'::tenant_role]))
  WITH CHECK (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role,'manager'::tenant_role,'accountant'::tenant_role]));
CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE TO authenticated
  USING (app_private.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'::tenant_role,'manager'::tenant_role]));

CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();