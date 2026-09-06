-- Composite indexes for the hottest tenant-scoped queries at scale
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_created ON public.notifications (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_date ON public.invoices (tenant_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_date ON public.payments (tenant_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_products_tenant_active ON public.products (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_created ON public.customers (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants (status);
CREATE INDEX IF NOT EXISTS idx_tenants_created ON public.tenants (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_created ON public.stock_movements (tenant_id, created_at DESC);
ANALYZE;